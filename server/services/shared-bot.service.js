const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { connect, isConnected } = require('../db/mongoose');
const SharedSession = require('../db/SharedSession.model');

const SESSIONS_DIR = path.join(__dirname, '../../sessions');
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// Reconnect delays (ms): 10s, 30s, 60s, 2min, 5min
const RETRY_DELAYS = [10000, 30000, 60000, 120000, 300000];
const MAX_RETRIES = RETRY_DELAYS.length;

// In-memory runtime state
const sessions = new Map();
const listeners = new Map(); // id -> { qr, connected, disconnected, paircode }

// Admin SSE subscribers (Set of res objects)
const adminSubscribers = new Set();

// ─── Admin event broadcast ────────────────────────────────────────────────────

function broadcastAdmin(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of adminSubscribers) {
    try { res.write(data); } catch (_) { adminSubscribers.delete(res); }
  }
}

function subscribeAdmin(res) {
  adminSubscribers.add(res);
  return () => adminSubscribers.delete(res);
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function dbSave(deploySessionId, phoneNumber, sessionDir, status) {
  if (!isConnected()) return;
  try {
    await SharedSession.findOneAndUpdate(
      { deploySessionId },
      { deploySessionId, phoneNumber, sessionDir, status, lastActivity: new Date() },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('[MongoDB] dbSave error:', err.message);
  }
}

async function dbRemove(deploySessionId) {
  if (!isConnected()) return;
  try {
    await SharedSession.deleteOne({ deploySessionId });
  } catch (err) {
    console.error('[MongoDB] dbRemove error:', err.message);
  }
}

async function dbUpdateActivity(deploySessionId, status) {
  if (!isConnected()) return;
  try {
    await SharedSession.updateOne(
      { deploySessionId },
      { status, lastActivity: new Date() }
    );
  } catch (err) {}
}

// ─── Disk cleanup ─────────────────────────────────────────────────────────────

function cleanSessionDir(sessionDir) {
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch (_) {}
}

function pruneStaleKeyFiles(sessionDir) {
  try {
    if (!fs.existsSync(sessionDir)) return;
    const files = fs.readdirSync(sessionDir);
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const file of files) {
      if (file === 'creds.json') continue;
      const filePath = path.join(sessionDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) fs.unlinkSync(filePath);
      } catch (_) {}
    }
  } catch (_) {}
}

// ─── Listener helpers ─────────────────────────────────────────────────────────

function getListeners(id) {
  if (!listeners.has(id)) listeners.set(id, { qr: new Set(), connected: new Set(), disconnected: new Set(), paircode: new Set() });
  return listeners.get(id);
}

function emitQR(id, qr) {
  const s = sessions.get(id);
  if (s) { s.qrBuffer = qr; s.lastActivity = new Date(); }
  for (const fn of getListeners(id).qr) fn(qr);
}

function emitConnected(id) {
  const s = sessions.get(id);
  if (s) { s.status = 'connected'; s.lastActivity = new Date(); }
  for (const fn of getListeners(id).connected) fn();
  broadcastAdmin({ type: 'session_update', session: serializeSession(id) });
}

function emitDisconnected(id) {
  const s = sessions.get(id);
  for (const fn of getListeners(id).disconnected) fn(s?.status || 'disconnected');
  broadcastAdmin({ type: 'session_update', session: serializeSession(id) });
}

function emitPairCode(id, code) {
  const s = sessions.get(id);
  if (s) { s.pairCode = code; }
  for (const fn of getListeners(id).paircode) fn(code);
}

function onQR(id, fn) {
  getListeners(id).qr.add(fn);
  return () => getListeners(id).qr.delete(fn);
}

function onConnected(id, fn) {
  getListeners(id).connected.add(fn);
  return () => getListeners(id).connected.delete(fn);
}

function onDisconnected(id, fn) {
  getListeners(id).disconnected.add(fn);
  return () => getListeners(id).disconnected.delete(fn);
}

function onPairCode(id, fn) {
  getListeners(id).paircode.add(fn);
  return () => getListeners(id).paircode.delete(fn);
}

function serializeSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  return {
    id,
    phoneNumber: s.phoneNumber,
    status: s.status,
    createdAt: s.createdAt,
    lastActivity: s.lastActivity,
    retryCount: s.retryCount || 0,
  };
}

function getAllSessions() {
  return [...sessions.keys()].map(serializeSession).filter(Boolean);
}

function getSession(id) {
  return sessions.get(id) || null;
}

function canStartSession() {
  const active = [...sessions.values()].filter(
    s => s.status !== 'disconnected' && s.status !== 'logged_out'
  );
  return active.length < config.maxSharedSessions;
}

// ─── Worker launch (with auto-reconnect + pairing code support) ───────────────

function launchWorker(deploySessionId, sessionDir, phoneNumber, entry) {
  const env = {
    ...process.env,
    SESSION_DIR: sessionDir,
    OWNER_NUMBER: phoneNumber,
    BOT_NAME: 'Sigma MDX',
    BOT_PREFIX: '.',
  };

  // Pairing code mode
  if (entry.usePairCode) {
    env.PAIRING_NUMBER = phoneNumber.replace(/\D/g, '');
  }

  const worker = fork(path.join(__dirname, '../workers/bot-worker.js'), [], {
    env,
    silent: true,
  });

  worker.stdout.on('data', () => {});
  worker.stderr.on('data', (chunk) => {
    const msg = chunk.toString().trim();
    if (msg) console.error(`[Worker ${deploySessionId.slice(0, 8)}]`, msg);
  });

  entry.worker = worker;

  worker.on('message', async (msg) => {
    if (msg.type === 'qr') {
      emitQR(deploySessionId, msg.data);
    }
    if (msg.type === 'paircode') {
      emitPairCode(deploySessionId, msg.data);
    }
    if (msg.type === 'connected') {
      entry.retryCount = 0;
      emitConnected(deploySessionId);
      await dbUpdateActivity(deploySessionId, 'connected');
    }
    if (msg.type === 'disconnected') {
      const { shouldReconnect } = msg.data || {};
      if (shouldReconnect === false) {
        entry.status = 'logged_out';
        emitDisconnected(deploySessionId);
        await dbRemove(deploySessionId);
        cleanSessionDir(sessionDir);
      } else {
        entry.status = 'disconnected';
        emitDisconnected(deploySessionId);
        await dbUpdateActivity(deploySessionId, 'disconnected');
      }
      entry.lastActivity = new Date();
    }
  });

  worker.on('exit', (code) => {
    entry.worker = null;
    if (entry.status === 'logged_out') return;

    // If the worker already notified disconnected, status is set — otherwise set it now
    if (entry.status !== 'disconnected') entry.status = 'disconnected';

    const retry = entry.retryCount || 0;
    if (retry < MAX_RETRIES && sessions.has(deploySessionId)) {
      const delay = RETRY_DELAYS[retry];
      entry.retryCount = retry + 1;
      console.log(`[SharedBot] 🔄 Auto-reconnect ${deploySessionId.slice(0, 8)} in ${Math.round(delay / 1000)}s (attempt ${retry + 1}/${MAX_RETRIES})`);
      setTimeout(() => {
        if (!sessions.has(deploySessionId)) return;
        if (entry.status === 'logged_out') return;
        if (!fs.existsSync(sessionDir)) {
          sessions.delete(deploySessionId);
          dbRemove(deploySessionId);
          return;
        }
        launchWorker(deploySessionId, sessionDir, phoneNumber, entry);
      }, delay);
    } else if (retry >= MAX_RETRIES) {
      console.warn(`[SharedBot] ❌ Max retries reached for ${deploySessionId.slice(0, 8)}`);
      dbUpdateActivity(deploySessionId, 'disconnected');
    }
  });

  worker.on('error', (err) => {
    console.error(`[SharedBot] Worker error for ${deploySessionId}:`, err.message);
    entry.status = 'disconnected';
    entry.worker = null;
  });

  return worker;
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function startSession(phoneNumber, usePairCode = false) {
  if (!canStartSession()) {
    throw new Error('Maximum shared bot sessions reached. Please try again later.');
  }

  const deploySessionId = uuidv4();
  const sessionDir = path.join(SESSIONS_DIR, deploySessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const entry = {
    worker: null,
    status: 'pending',
    qrBuffer: null,
    pairCode: null,
    phoneNumber,
    sessionDir,
    usePairCode,
    retryCount: 0,
    createdAt: new Date(),
    lastActivity: new Date(),
  };
  sessions.set(deploySessionId, entry);

  launchWorker(deploySessionId, sessionDir, phoneNumber, entry);
  await dbSave(deploySessionId, phoneNumber, sessionDir, 'pending');

  broadcastAdmin({ type: 'session_created', session: serializeSession(deploySessionId) });

  return deploySessionId;
}

function stopSession(deploySessionId) {
  const entry = sessions.get(deploySessionId);
  if (!entry) return;
  entry.status = 'logged_out';
  if (entry.worker) {
    entry.worker.kill('SIGTERM');
    entry.worker = null;
  }
  listeners.delete(deploySessionId);
  dbRemove(deploySessionId);
  cleanSessionDir(entry.sessionDir);
  broadcastAdmin({ type: 'session_deleted', id: deploySessionId });
}

function deleteSession(deploySessionId) {
  stopSession(deploySessionId);
  sessions.delete(deploySessionId);
}

// ─── Resume sessions from MongoDB on startup ──────────────────────────────────

async function resumePersistedSessions() {
  await connect();
  if (!isConnected()) {
    console.warn('[SharedBot] MongoDB not available — no sessions resumed');
    return;
  }

  let docs;
  try {
    docs = await SharedSession.find({ status: { $ne: 'logged_out' } });
  } catch (err) {
    console.error('[MongoDB] Failed to query sessions:', err.message);
    return;
  }

  if (!docs.length) return;
  console.log(`[SharedBot] Resuming ${docs.length} session(s) from MongoDB...`);

  for (const doc of docs) {
    const { deploySessionId, phoneNumber, sessionDir } = doc;

    if (!fs.existsSync(sessionDir)) {
      await dbRemove(deploySessionId);
      continue;
    }

    const entry = {
      worker: null,
      status: 'pending',
      qrBuffer: null,
      pairCode: null,
      phoneNumber,
      sessionDir,
      usePairCode: false,
      retryCount: 0,
      createdAt: doc.startedAt || new Date(),
      lastActivity: new Date(),
    };
    sessions.set(deploySessionId, entry);
    launchWorker(deploySessionId, sessionDir, phoneNumber, entry);
    console.log(`[SharedBot] ↩ Resumed ${deploySessionId.slice(0, 8)} (${phoneNumber})`);
  }
}

// ─── Garbage collect every 10 minutes ────────────────────────────────────────

setInterval(async () => {
  const now = Date.now();
  const ttlMs = config.sessionTtlHours * 60 * 60 * 1000;
  for (const [id, entry] of sessions) {
    const age = now - entry.lastActivity.getTime();
    if (entry.status === 'logged_out' || age > ttlMs) {
      deleteSession(id);
    }
  }

  for (const [, entry] of sessions) {
    if (entry.status === 'connected' && entry.sessionDir) {
      pruneStaleKeyFiles(entry.sessionDir);
    }
  }

  try {
    const dirs = fs.readdirSync(SESSIONS_DIR);
    for (const dir of dirs) {
      const fullPath = path.join(SESSIONS_DIR, dir);
      let found = false;
      for (const [, entry] of sessions) {
        if (entry.sessionDir === fullPath) { found = true; break; }
      }
      if (!found) {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > 60 * 60 * 1000) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      }
    }
  } catch (_) {}
}, 10 * 60 * 1000);

resumePersistedSessions().catch(err =>
  console.error('[SharedBot] Resume error:', err.message)
);

module.exports = {
  startSession, stopSession, deleteSession,
  getSession, getAllSessions,
  onQR, onConnected, onDisconnected, onPairCode,
  subscribeAdmin,
};
