const express = require('express');
const router = express.Router();
const os = require('os');
const { isConnected } = require('../db/mongoose');
const sharedBot = require('../services/shared-bot.service');

const ADMIN_KEY = process.env.ADMIN_KEY || 'sigma-admin-2026';
const START_TIME = Date.now();

function authMiddleware(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// GET /api/admin/status — public server health (no auth)
router.get('/status', (req, res) => {
  const uptimeMs = Date.now() - START_TIME;
  const sessions = sharedBot.getAllSessions();
  const connected = sessions.filter(s => s.status === 'connected').length;
  const pending = sessions.filter(s => s.status === 'pending').length;
  const disconnected = sessions.filter(s => s.status === 'disconnected').length;

  res.json({
    status: 'online',
    uptime: uptimeMs,
    mongodb: isConnected() ? 'connected' : 'disconnected',
    sessions: {
      total: sessions.length,
      connected,
      pending,
      disconnected,
      max: parseInt(process.env.MAX_SHARED_SESSIONS || '150', 10),
    },
    system: {
      platform: os.platform(),
      nodeVersion: process.version,
      memUsedMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      loadAvg: os.loadavg()[0].toFixed(2),
    },
  });
});

// GET /api/admin/verify — check admin key
router.get('/verify', authMiddleware, (req, res) => {
  res.json({ ok: true });
});

// GET /api/admin/sessions — list all sessions
router.get('/sessions', authMiddleware, (req, res) => {
  res.json({ sessions: sharedBot.getAllSessions() });
});

// DELETE /api/admin/sessions/:id — disconnect a session
router.delete('/sessions/:id', authMiddleware, (req, res) => {
  sharedBot.deleteSession(req.params.id);
  res.json({ success: true });
});

// GET /api/admin/events — SSE for real-time admin events
router.get('/events', authMiddleware, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial state
  res.write(`data: ${JSON.stringify({ type: 'init', sessions: sharedBot.getAllSessions() })}\n\n`);

  // Keep-alive ping every 20s
  const ping = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 20000);

  const unsub = sharedBot.subscribeAdmin(res);

  req.on('close', () => {
    clearInterval(ping);
    unsub();
  });
});

module.exports = router;
