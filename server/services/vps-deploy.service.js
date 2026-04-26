/**
 * VPS Deploy Service
 * Deploys personalized bot instances to the VPS via SSH/SFTP.
 * Each bot runs as an independent PM2 process.
 */
const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { connect, isConnected } = require('../db/mongoose');
const VpsSession = require('../db/VpsSession.model');

const BACKUPS_DIR = path.join(__dirname, '../../server/backups');

const VPS_HOST = process.env.VPS_HOST;
const VPS_USER = process.env.VPS_USER || 'root';
const VPS_PASS = process.env.VPS_PASS;
const PLATFORM_URL = process.env.PLATFORM_URL || 'https://sigma-mdx.replit.app';
const BOTS_BASE_DIR = '/opt/sigma-bots';

// Port range for deployed bots (10000–10149)
const PORT_START = 10000;
const PORT_MAX = 150;

// In-memory state
const sessions = new Map(); // deployId -> { status, pairCode, subs }

// ─── PM2 Cache (10s TTL) ─────────────────────────────────────────────────────

let _pm2Cache = null;
let _pm2CacheTime = 0;
const PM2_CACHE_TTL = 10000;

async function getPm2Data() {
  if (!VPS_HOST || !VPS_PASS) return [];
  if (_pm2Cache && Date.now() - _pm2CacheTime < PM2_CACHE_TTL) return _pm2Cache;
  const conn = await createSSH();
  try {
    const r = await sshExecSafe(conn, 'pm2 jlist 2>/dev/null || echo []');
    let list = [];
    try { list = JSON.parse(r.out || '[]'); } catch (_) {}
    _pm2Cache = list;
    _pm2CacheTime = Date.now();
    return list;
  } finally {
    conn.end();
  }
}

function invalidatePm2Cache() {
  _pm2Cache = null;
  _pm2CacheTime = 0;
}

// ─── SSE subscribers ─────────────────────────────────────────────────────────

function getSubs(deployId) {
  if (!sessions.has(deployId)) sessions.set(deployId, { status: 'deploying', pairCode: null, subs: new Set() });
  return sessions.get(deployId).subs;
}

function emitToSubs(deployId, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  const entry = sessions.get(deployId);
  if (!entry) return;
  for (const sub of entry.subs) {
    try { sub.write(payload); } catch (_) { entry.subs.delete(sub); }
  }
}

function subscribeProgress(deployId, req, res) {
  getSubs(deployId).add(res);
  req.on('close', () => getSubs(deployId).delete(res));
}

// ─── SSH helpers ──────────────────────────────────────────────────────────────

function createSSH() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => resolve(conn));
    conn.on('error', reject);
    conn.connect({
      host: VPS_HOST,
      port: 22,
      username: VPS_USER,
      password: VPS_PASS,
      readyTimeout: 20000,
    });
  });
}

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    conn.exec(cmd, (e, stream) => {
      if (e) return reject(e);
      stream.on('data', d => { out += d; });
      stream.stderr.on('data', d => { err += d; });
      stream.on('close', (code) => {
        if (code !== 0) return reject(new Error(err.trim() || `Exit code ${code}`));
        resolve(out.trim());
      });
    });
  });
}

function sshExecSafe(conn, cmd) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    conn.exec(cmd, (e, stream) => {
      if (e) return resolve({ out: '', err: e.message, code: -1 });
      stream.on('data', d => { out += d; });
      stream.stderr.on('data', d => { err += d; });
      stream.on('close', (code) => resolve({ out: out.trim(), err: err.trim(), code }));
    });
  });
}

// Recursively create a remote directory path via SFTP (mkdir -p equivalent)
function sftpMkdirp(sftp, remotePath) {
  const parts = remotePath.split('/').filter(Boolean);
  return parts.reduce((chain, part, idx) => {
    return chain.then(() => {
      const currentPath = '/' + parts.slice(0, idx + 1).join('/');
      return new Promise((res) => sftp.mkdir(currentPath, () => res())); // ignore errors (already exists)
    });
  }, Promise.resolve());
}

// Upload a fileMap ({relPath: {content, encoding}}) to remote dir via SFTP
function uploadFiles(conn, remoteDir, fileMap) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);

      const entries = Object.entries(fileMap);
      const createdDirs = new Set();

      async function processAll() {
        for (const [relPath, file] of entries) {
          const remotePath = `${remoteDir}/${relPath}`;
          const remoteFileDir = remotePath.substring(0, remotePath.lastIndexOf('/'));

          if (!createdDirs.has(remoteFileDir)) {
            await sftpMkdirp(sftp, remoteFileDir);
            createdDirs.add(remoteFileDir);
          }

          const content = file.encoding === 'base64'
            ? Buffer.from(file.content, 'base64')
            : Buffer.from(file.content, 'utf8');

          await new Promise((res, rej) => {
            const ws = sftp.createWriteStream(remotePath);
            ws.on('error', rej);
            ws.on('close', res);
            ws.end(content);
          });
        }
        sftp.end();
        resolve();
      }

      processAll().catch(reject);
    });
  });
}

// ─── Port allocation ──────────────────────────────────────────────────────────

async function allocatePort() {
  const used = new Set();
  const docs = await VpsSession.find({}, 'port');
  for (const d of docs) if (d.port) used.add(d.port);

  for (let i = 0; i < PORT_MAX; i++) {
    const port = PORT_START + i;
    if (!used.has(port)) return port;
  }
  throw new Error('No available ports. Maximum VPS bot limit reached.');
}

// ─── Core deploy function ─────────────────────────────────────────────────────

async function deployBot(deployId, fileMap, cfg, emit, userId, platformUrl) {
  const log = emit || (() => {});
  const entry = { status: 'deploying', pairCode: null, subs: new Set() };
  sessions.set(deployId, entry);

  if (!VPS_HOST || !VPS_PASS) {
    entry.status = 'error';
    throw new Error('VPS credentials not configured. Please contact the administrator.');
  }

  const phoneNumber = cfg.ownerNumber.replace(/\D/g, '');
  const botDir = `${BOTS_BASE_DIR}/${deployId}`;
  const baseUrl = platformUrl || PLATFORM_URL;
  const callbackUrl = `${baseUrl}/api/vps/callback/${deployId}`;

  let port;
  try {
    port = await allocatePort();
  } catch (err) {
    entry.status = 'error';
    throw err;
  }

  // Save to DB immediately
  await VpsSession.findOneAndUpdate(
    { deployId },
    {
      deployId,
      userId: userId || null,
      botName: cfg.botName,
      displayName: cfg.botName,
      phoneNumber,
      status: 'deploying',
      port,
      config: cfg,
      deployedAt: new Date(),
      lastActivity: new Date(),
    },
    { upsert: true, new: true }
  ).catch(() => {});

  let conn;
  try {
    log('info', '🔌 Connexion au serveur VPS...');
    conn = await createSSH();
    log('ok', '✅ Connecté au VPS.');

    // Ensure PM2 + Node are available
    log('info', '🔎 Vérification de l\'environnement (Node, PM2)...');
    const nodeCheck = await sshExecSafe(conn, 'node --version');
    if (nodeCheck.code !== 0) throw new Error('Node.js non disponible sur le VPS.');
    log('info', `   Node.js ${nodeCheck.out} détecté.`);

    const pm2Check = await sshExecSafe(conn, 'pm2 --version');
    if (pm2Check.code !== 0) {
      log('info', '   Installation de PM2...');
      await sshExec(conn, 'npm install -g pm2 --silent');
    } else {
      log('info', `   PM2 ${pm2Check.out} détecté.`);
    }

    // Create bot directory
    log('info', `📁 Création du dossier /opt/sigma-bots/${deployId}...`);
    await sshExec(conn, `mkdir -p ${botDir}/logs`);

    // Create .env with extra VPS-specific vars
    const extraEnv = [
      `PAIRING_NUMBER=${phoneNumber}`,
      `SIGMA_CALLBACK_URL=${callbackUrl}`,
      `PORT=${port}`,
      `NODE_ENV=production`,
    ].join('\n');

    const envContent = fileMap['.env']?.content || '';
    fileMap['.env'] = {
      content: envContent + '\n' + extraEnv + '\n',
      encoding: 'utf8',
    };

    // Upload files
    log('info', `📤 Upload de ${Object.keys(fileMap).length} fichiers...`);
    await uploadFiles(conn, botDir, fileMap);
    log('ok', '✅ Fichiers uploadés avec succès.');

    // npm install — use shared cache if available for instant deploy
    log('info', '📦 Installation des dépendances...');
    const cacheDir = `${BOTS_BASE_DIR}/_base/node_modules`;
    const cacheCheck = await sshExecSafe(conn, `test -d ${cacheDir} && echo YES || echo NO`);
    if (cacheCheck.out.trim() === 'YES') {
      log('info', '   Cache partagé détecté — copie rapide en cours (~5s)...');
      await sshExec(conn, `cp -al ${cacheDir} ${botDir}/node_modules`);
      await sshExecSafe(conn, `cd ${botDir} && npm install --production --silent --no-audit --no-fund 2>&1 | tail -3`);
    } else {
      log('info', '   Première installation (1–3 min)...');
      await sshExec(conn,
        `cd ${botDir} && npm install --production --silent --no-audit --no-fund 2>&1 | tail -5`
      );
    }
    log('ok', '✅ Dépendances installées.');

    // Stop existing PM2 process if any
    await sshExecSafe(conn, `pm2 delete sigma-${deployId} 2>/dev/null || true`);

    // Start with PM2
    log('info', '🚀 Démarrage du bot avec PM2...');
    await sshExec(conn,
      `cd ${botDir} && pm2 start index.js --name sigma-${deployId} ` +
      `--error ${botDir}/logs/err.log --output ${botDir}/logs/out.log ` +
      `--time --no-autorestart 2>&1`
    );
    await sshExecSafe(conn, 'pm2 save');
    invalidatePm2Cache();
    log('ok', `✅ Bot démarré — PM2 process: sigma-${deployId}`);

    entry.status = 'waiting_pair';
    await VpsSession.updateOne({ deployId }, { status: 'waiting_pair', port, lastActivity: new Date() }).catch(() => {});

    log('pair', '📱 En attente du code de jumelage WhatsApp...');

  } catch (err) {
    entry.status = 'error';
    await VpsSession.updateOne({ deployId }, { status: 'error', errorMsg: err.message }).catch(() => {});
    throw err;
  } finally {
    if (conn) conn.end();
  }

  return { deployId, port };
}

// ─── Callback from deployed bot ───────────────────────────────────────────────

async function handleBotCallback(deployId, data) {
  const entry = sessions.get(deployId) || {};

  if (data.type === 'paircode') {
    entry.pairCode = data.code;
    entry.status = 'waiting_pair';
    emitToSubs(deployId, { type: 'paircode', code: data.code });
    await VpsSession.updateOne({ deployId }, { pairCode: data.code, status: 'waiting_pair', lastActivity: new Date() }).catch(() => {});
  }

  if (data.type === 'connected') {
    entry.status = 'connected';
    emitToSubs(deployId, { type: 'connected' });
    await VpsSession.updateOne({ deployId }, { status: 'connected', connectedAt: new Date(), lastActivity: new Date(), pairCode: null }).catch(() => {});
    // Backup session after a brief delay to ensure creds.json is written
    setTimeout(() => backupSession(deployId).catch(() => {}), 8000);
  }

  if (data.type === 'disconnected') {
    entry.status = 'disconnected';
    emitToSubs(deployId, { type: 'disconnected' });
    await VpsSession.updateOne({ deployId }, { status: 'disconnected', lastActivity: new Date() }).catch(() => {});
  }

  if (data.type === 'message') {
    const now = new Date();
    await VpsSession.updateOne({ deployId }, { $inc: { msgCount: 1 }, lastActivity: now, lastMsgAt: now }).catch(() => {});
  }
}

// ─── Bot management ───────────────────────────────────────────────────────────

async function pm2Command(deployId, command) {
  if (!VPS_HOST || !VPS_PASS) throw new Error('VPS not configured.');
  const conn = await createSSH();
  try {
    const result = await sshExecSafe(conn, `pm2 ${command} sigma-${deployId} 2>&1`);
    invalidatePm2Cache();
    return result;
  } finally {
    conn.end();
  }
}

async function restartBot(deployId) {
  await pm2Command(deployId, 'restart');
  await VpsSession.updateOne({ deployId }, { status: 'waiting_pair', lastActivity: new Date() }).catch(() => {});
  const entry = sessions.get(deployId);
  if (entry) { entry.status = 'waiting_pair'; entry.pairCode = null; }
}

async function stopBot(deployId) {
  await pm2Command(deployId, 'stop');
  await VpsSession.updateOne({ deployId }, { status: 'stopped', lastActivity: new Date() }).catch(() => {});
  const entry = sessions.get(deployId);
  if (entry) entry.status = 'stopped';
}

async function deleteBot(deployId) {
  if (!VPS_HOST || !VPS_PASS) return;
  const conn = await createSSH();
  try {
    await sshExecSafe(conn, `pm2 delete sigma-${deployId} 2>/dev/null; rm -rf ${BOTS_BASE_DIR}/${deployId}`);
    invalidatePm2Cache();
  } finally {
    conn.end();
  }
  sessions.delete(deployId);
  await VpsSession.deleteOne({ deployId }).catch(() => {});
}

async function renameBot(deployId, displayName) {
  await VpsSession.updateOne({ deployId }, { displayName: displayName.trim().substring(0, 50) }).catch(() => {});
}

async function getBotLogs(deployId, lines = 50) {
  if (!VPS_HOST || !VPS_PASS) return '';
  const conn = await createSSH();
  try {
    const r = await sshExecSafe(conn, `tail -${lines} ${BOTS_BASE_DIR}/${deployId}/logs/out.log 2>/dev/null`);
    return r.out;
  } finally {
    conn.end();
  }
}

// ─── Session Backup ───────────────────────────────────────────────────────────

async function backupSession(deployId) {
  if (!VPS_HOST || !VPS_PASS) return false;
  try {
    const doc = await VpsSession.findOne({ deployId }).lean().catch(() => null);
    if (!doc) return false;
    const botName = doc.botName;
    const remoteCreds = `${BOTS_BASE_DIR}/${deployId}/${botName}/session/creds.json`;

    const conn = await createSSH();
    try {
      const { out } = await sshExecSafe(conn, `cat "${remoteCreds}" 2>/dev/null`);
      if (!out || out.length < 10) return false;

      if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      fs.writeFileSync(path.join(BACKUPS_DIR, `${deployId}.json`), out, 'utf8');
      await VpsSession.updateOne({ deployId }, { sessionBackupAt: new Date() }).catch(() => {});
      console.log(`[Backup] Session backed up for ${deployId}`);
      return true;
    } finally {
      conn.end();
    }
  } catch (err) {
    console.error('[Backup] Error:', err.message);
    return false;
  }
}

async function restoreSession(deployId) {
  if (!VPS_HOST || !VPS_PASS) throw new Error('VPS non configuré.');
  const backupFile = path.join(BACKUPS_DIR, `${deployId}.json`);
  if (!fs.existsSync(backupFile)) throw new Error('Aucune sauvegarde de session disponible.');

  const credsData = fs.readFileSync(backupFile, 'utf8');
  const doc = await VpsSession.findOne({ deployId }).lean().catch(() => null);
  if (!doc) throw new Error('Session introuvable.');

  const botName = doc.botName;
  const remoteDir = `${BOTS_BASE_DIR}/${deployId}/${botName}/session`;
  const remoteCreds = `${remoteDir}/creds.json`;

  const conn = await createSSH();
  try {
    await sshExecSafe(conn, `mkdir -p "${remoteDir}"`);
    await new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        const ws = sftp.createWriteStream(remoteCreds);
        ws.on('close', resolve);
        ws.on('error', reject);
        ws.end(Buffer.from(credsData, 'utf8'));
      });
    });
    await sshExecSafe(conn, `pm2 restart sigma-${deployId} 2>/dev/null || true`);
    invalidatePm2Cache();
    await VpsSession.updateOne({ deployId }, { status: 'waiting_pair', lastActivity: new Date() }).catch(() => {});
    const entry = sessions.get(deployId);
    if (entry) { entry.status = 'waiting_pair'; entry.pairCode = null; }
    console.log(`[Backup] Session restored for ${deployId}`);
    return true;
  } finally {
    conn.end();
  }
}

async function redeployBot(deployId, emit, userId, platformUrl) {
  const log = emit || (() => {});
  const doc = await VpsSession.findOne({ deployId }).lean().catch(() => null);
  if (!doc) throw new Error('Session introuvable.');

  const cfg = doc.config;
  if (!cfg || !cfg.botName) throw new Error('Configuration du bot introuvable.');

  const { generateBot } = require('../services/generator.service');

  log('info', '⚙️  Régénération des fichiers du bot...');
  const fileMap = await generateBot(cfg, log);

  const botDir = `${BOTS_BASE_DIR}/${deployId}`;
  const baseUrl = platformUrl || PLATFORM_URL;
  const callbackUrl = `${baseUrl}/api/vps/callback/${deployId}`;
  const phoneNumber = (cfg.ownerNumber || doc.phoneNumber).replace(/\D/g, '');

  const extraEnv = [
    `PAIRING_NUMBER=${phoneNumber}`,
    `SIGMA_CALLBACK_URL=${callbackUrl}`,
    `PORT=${doc.port}`,
    `NODE_ENV=production`,
  ].join('\n');

  const envContent = fileMap['.env']?.content || '';
  fileMap['.env'] = { content: envContent + '\n' + extraEnv + '\n', encoding: 'utf8' };

  if (!VPS_HOST || !VPS_PASS) throw new Error('VPS non configuré.');
  const conn = await createSSH();
  try {
    log('ok', '✅ Connecté au VPS.');
    log('info', `📤 Upload de ${Object.keys(fileMap).length} fichiers...`);
    await uploadFiles(conn, botDir, fileMap);
    log('ok', '✅ Fichiers mis à jour.');

    log('info', '🔄 Redémarrage du processus PM2...');
    await sshExecSafe(conn, `pm2 restart sigma-${deployId} 2>/dev/null || pm2 start ${botDir}/index.js --name sigma-${deployId} --error ${botDir}/logs/err.log --output ${botDir}/logs/out.log --time --no-autorestart`);
    await sshExecSafe(conn, 'pm2 save');
    invalidatePm2Cache();
    log('ok', `✅ Bot redéployé — PM2: sigma-${deployId}`);
  } finally {
    conn.end();
  }

  const entry = sessions.get(deployId);
  if (entry) { entry.status = 'waiting_pair'; entry.pairCode = null; }
  await VpsSession.updateOne({ deployId }, { status: 'waiting_pair', lastActivity: new Date() }).catch(() => {});
  log('pair', '📱 En attente du nouveau code de jumelage...');
}

// ─── Session getters ──────────────────────────────────────────────────────────

function buildSessionFromDoc(d, pm2Map) {
  const proc = pm2Map ? pm2Map.get(`sigma-${d.deployId}`) : null;
  return {
    deployId: d.deployId,
    botName: d.botName,
    displayName: d.displayName || d.botName,
    phoneNumber: d.phoneNumber,
    status: sessions.get(d.deployId)?.status || d.status,
    pairCode: sessions.get(d.deployId)?.pairCode || d.pairCode,
    port: d.port,
    config: d.config || {},
    deployedAt: d.deployedAt,
    lastActivity: d.lastActivity,
    connectedAt: d.connectedAt,
    lastMsgAt: d.lastMsgAt || null,
    msgCount: d.msgCount || 0,
    pm2Status: proc?.pm2_env?.status || null,
    pm2Uptime: proc?.pm2_env?.pm_uptime || null,
    pm2Memory: proc?.monit?.memory || null,
    pm2Restarts: proc?.pm2_env?.restart_time ?? null,
    healthAlert: d.healthAlert?.type ? d.healthAlert : null,
    sessionBackupAt: d.sessionBackupAt || null,
  };
}

async function getAllSessions() {
  const docs = await VpsSession.find({}).sort({ deployedAt: -1 }).lean().catch(() => []);
  let pm2Map = new Map();
  try {
    const list = await getPm2Data();
    pm2Map = new Map(list.map(p => [p.name, p]));
  } catch (_) {}
  return docs.map(d => buildSessionFromDoc(d, pm2Map));
}

async function getSessionsByUser(userId) {
  const docs = await VpsSession.find({ userId }).sort({ deployedAt: -1 }).lean().catch(() => []);
  let pm2Map = new Map();
  try {
    const list = await getPm2Data();
    pm2Map = new Map(list.map(p => [p.name, p]));
  } catch (_) {}
  return docs.map(d => buildSessionFromDoc(d, pm2Map));
}

async function getSession(deployId) {
  const mem = sessions.get(deployId);
  const doc = await VpsSession.findOne({ deployId }).lean().catch(() => null);
  if (!doc) return null;
  return {
    ...doc,
    status: mem?.status || doc.status,
    pairCode: mem?.pairCode || doc.pairCode,
  };
}

// ─── Health Check Cron (every 5 min) ─────────────────────────────────────────

const RAM_ALERT_THRESHOLD = 300 * 1024 * 1024; // 300 MB in bytes
const RESTART_ALERT_THRESHOLD = 3;

async function runHealthCheck() {
  if (!VPS_HOST || !VPS_PASS) return;
  try {
    invalidatePm2Cache();
    const pm2List = await getPm2Data();
    const pm2Map = new Map(pm2List.map(p => [p.name, p]));

    const activeSessions = await VpsSession.find({ status: { $in: ['connected', 'waiting_pair'] } }).lean().catch(() => []);
    const Notification = require('../db/Notification.model');
    const User = require('../db/User.model');
    const { sendBotCrashedEmail, sendHealthAlertEmail } = require('./email.service');

    for (const session of activeSessions) {
      const proc = pm2Map.get(`sigma-${session.deployId}`);
      const displayName = session.displayName || session.botName;

      // ── Bot offline ──────────────────────────────────────────────────────────
      if (!proc || proc.pm2_env?.status !== 'online') {
        await VpsSession.updateOne({ deployId: session.deployId }, { status: 'error', lastActivity: new Date() }).catch(() => {});
        const memEntry = sessions.get(session.deployId);
        if (memEntry) memEntry.status = 'error';

        if (session.userId) {
          await Notification.create({
            userId: session.userId,
            type: 'error',
            title: '🔴 Bot hors ligne',
            message: `Le bot "${displayName}" s'est arrêté de façon inattendue. Vérifiez et redémarrez-le.`,
            deployId: session.deployId,
            botName: displayName,
          }).catch(() => {});

          // Email alert
          const user = await User.findById(session.userId).lean().catch(() => null);
          if (user?.email) {
            sendBotCrashedEmail(user.email, displayName, session.deployId).catch(() => {});
          }
        }
        console.log(`[HealthCheck] Bot ${session.deployId} marked as error (was ${session.status})`);
        continue;
      }

      // ── Health checks on running bots ────────────────────────────────────────
      const memory = proc.monit?.memory || 0;
      const restarts = proc.pm2_env?.restart_time || 0;
      const alerts = [];

      if (memory > RAM_ALERT_THRESHOLD) {
        alerts.push(`RAM élevée : ${Math.round(memory / 1024 / 1024)} Mo (seuil : 300 Mo)`);
      }
      if (restarts > RESTART_ALERT_THRESHOLD) {
        alerts.push(`${restarts} redémarrage(s) détecté(s)`);
      }

      if (alerts.length > 0) {
        const alertMsg = alerts.join(' · ');
        // Only re-alert if no alert was set or last alert was >30 min ago
        const lastAlertAt = session.healthAlert?.at;
        const alertAge = lastAlertAt ? Date.now() - new Date(lastAlertAt).getTime() : Infinity;

        if (alertAge > 30 * 60 * 1000) {
          await VpsSession.updateOne(
            { deployId: session.deployId },
            { healthAlert: { type: 'warning', msg: alertMsg, at: new Date() } }
          ).catch(() => {});

          if (session.userId) {
            await Notification.create({
              userId: session.userId,
              type: 'error',
              title: `⚠️ Alerte santé — ${displayName}`,
              message: alertMsg,
              deployId: session.deployId,
              botName: displayName,
            }).catch(() => {});

            const user = await User.findById(session.userId).lean().catch(() => null);
            if (user?.email) {
              sendHealthAlertEmail(user.email, displayName, alertMsg).catch(() => {});
            }
          }
          console.log(`[HealthCheck] Health alert for ${session.deployId}: ${alertMsg}`);
        }
      } else if (session.healthAlert?.type) {
        // Clear the health alert if bot is now healthy
        await VpsSession.updateOne(
          { deployId: session.deployId },
          { 'healthAlert.type': null, 'healthAlert.msg': null }
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[HealthCheck] Error:', err.message);
  }
}

// Start health check only once (guard against hot-reload)
if (!global._sigmaHealthCheckStarted) {
  global._sigmaHealthCheckStarted = true;
  setTimeout(() => {
    runHealthCheck();
    setInterval(runHealthCheck, 5 * 60 * 1000);
  }, 30000); // first run after 30s
}

module.exports = {
  deployBot,
  redeployBot,
  handleBotCallback,
  restartBot,
  stopBot,
  deleteBot,
  renameBot,
  getBotLogs,
  backupSession,
  restoreSession,
  getAllSessions,
  getSessionsByUser,
  getSession,
  getSubs,
  emitToSubs,
  getPm2Data,
};
