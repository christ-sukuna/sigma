const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  delay,
} = require('gifted-baileys');
const pino = require('pino');

const SESSION_TEMP_DIR = path.join(__dirname, '../sessions-temp');
if (!fs.existsSync(SESSION_TEMP_DIR)) fs.mkdirSync(SESSION_TEMP_DIR, { recursive: true });

const SESSION_PREFIX = 'SIGMA-MDX~';

// Active QR SSE connections: sessionId -> res
const qrConnections = new Map();
// Active sockets: sessionId -> sock
const activeSockets = new Map();

function cleanupSession(id) {
  const dir = path.join(SESSION_TEMP_DIR, id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  activeSockets.delete(id);
}

function buildSessionId(credsBuffer) {
  const compressed = zlib.gzipSync(credsBuffer);
  const b64 = compressed.toString('base64');
  return SESSION_PREFIX + b64;
}

// -----------------------------------------------------------
// POST /api/session/pair?number=+32466304227
// Returns pairing code immediately, sends SESSION_ID to WA on connect
// -----------------------------------------------------------
router.get('/pair', async (req, res) => {
  const rawNumber = (req.query.number || '').replace(/[^0-9]/g, '');
  if (!rawNumber || rawNumber.length < 7) {
    return res.status(400).json({ error: 'Valid phone number required.' });
  }

  const id = uuidv4();
  const sessionDir = path.join(SESSION_TEMP_DIR, id);
  fs.mkdirSync(sessionDir, { recursive: true });

  const silent = pino({ level: 'fatal' }).child({ level: 'fatal' });
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silent),
    },
    printQRInTerminal: false,
    logger: silent,
    browser: Browsers.macOS('Safari'),
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
  });

  activeSockets.set(id, sock);
  sock.ev.on('creds.update', saveCreds);

  // Request pairing code
  let code;
  try {
    if (!sock.authState.creds.registered) {
      await delay(1500);
      code = await sock.requestPairingCode(rawNumber);
    }
  } catch (err) {
    cleanupSession(id);
    return res.status(500).json({ error: 'Failed to generate pairing code. Try again.' });
  }

  // Return code immediately
  res.json({ code, sessionToken: id });

  // Handle connection open → build and send session ID
  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      await delay(5000);
      try {
        const credsPath = path.join(sessionDir, 'creds.json');
        let attempts = 0;
        while (!fs.existsSync(credsPath) && attempts < 10) {
          await delay(2000);
          attempts++;
        }
        const credsData = fs.readFileSync(credsPath);
        const sessionId = buildSessionId(credsData);

        // Send session ID to the user's own WhatsApp
        await sock.sendMessage(sock.user.id, { text: sessionId });
        await delay(1000);
        const builderUrl = process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}/builder.html`
          : `${req.protocol}://${req.get('host')}/builder.html`;
        await sock.sendMessage(sock.user.id, {
          text: `✅ *Session générée avec succès!*\n\nCopie l'ID ci-dessus (SIGMA-MDX~...) et colle-le dans le champ *Session ID* du Builder.\n\n🔗 Builder: ${builderUrl}`,
        });
        await delay(2000);
        sock.ws.close();
      } catch (err) {
        console.error('[Session] Error sending session:', err.message);
      } finally {
        cleanupSession(id);
      }
    } else if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== 401) {
        // reconnect handled by user retrying
      }
      cleanupSession(id);
    }
  });
});

// -----------------------------------------------------------
// GET /api/session/qr — SSE stream: sends QR, then SESSION_ID on connect
// -----------------------------------------------------------
router.get('/qr', async (req, res) => {
  const id = uuidv4();
  const sessionDir = path.join(SESSION_TEMP_DIR, id);
  fs.mkdirSync(sessionDir, { recursive: true });

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function send(data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  const silent = pino({ level: 'fatal' });
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: silent,
    browser: Browsers.macOS('Desktop'),
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
  });

  activeSockets.set(id, sock);
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      const qrImage = await QRCode.toDataURL(qr);
      send({ type: 'qr', qr: qrImage });
    }

    if (connection === 'open') {
      send({ type: 'status', status: 'connected' });
      await delay(8000);
      try {
        const credsPath = path.join(sessionDir, 'creds.json');
        let attempts = 0;
        while (!fs.existsSync(credsPath) && attempts < 10) {
          await delay(2000);
          attempts++;
        }
        const credsData = fs.readFileSync(credsPath);
        const sessionId = buildSessionId(credsData);

        send({ type: 'session', sessionId });

        // Also send to the user's own WhatsApp
        await sock.sendMessage(sock.user.id, { text: sessionId });
        await delay(2000);
        sock.ws.close();
      } catch (err) {
        send({ type: 'error', message: 'Failed to extract session.' });
      } finally {
        cleanupSession(id);
        res.end();
      }
    } else if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== 401) {
        send({ type: 'status', status: 'reconnecting' });
      } else {
        send({ type: 'error', message: 'Logged out.' });
        cleanupSession(id);
        res.end();
      }
    }
  });

  req.on('close', () => {
    cleanupSession(id);
  });
});

// -----------------------------------------------------------
// GET /api/session/status/:token — check if session is still active
// -----------------------------------------------------------
router.get('/status/:token', (req, res) => {
  const active = activeSockets.has(req.params.token);
  res.json({ active });
});

module.exports = router;
