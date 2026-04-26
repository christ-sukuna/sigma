const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { validateBotConfig } = require('../middleware/validate');
const { generateBot } = require('../services/generator.service');
const { requireAuth } = require('../middleware/auth.middleware');
const vps = require('../services/vps-deploy.service');
const VpsSession = require('../db/VpsSession.model');
const Notification = require('../db/Notification.model');
const User = require('../db/User.model');
const { Client } = require('ssh2');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createNotif(userId, type, title, message, deployId, botName) {
  if (!userId) return;
  try {
    await Notification.create({ userId, type, title, message, deployId: deployId || null, botName: botName || '' });
  } catch (_) {}
}

function sshExecSafe(conn, cmd) {
  return new Promise(resolve => {
    let out = '', err = '';
    conn.exec(cmd, (e, stream) => {
      if (e) return resolve({ out: '', err: e.message, code: -1 });
      stream.on('data', d => { out += d; });
      stream.stderr.on('data', d => { err += d; });
      stream.on('close', code => resolve({ out: out.trim(), err: err.trim(), code }));
    });
  });
}

// ── Deploy ────────────────────────────────────────────────────────────────────

router.post('/deploy', requireAuth, validateBotConfig, async (req, res) => {
  const userId = req.user.id;

  // Bot limit check
  const user = await User.findById(userId).lean().catch(() => null);
  const maxBots = user?.maxBots || 1;
  const currentCount = await VpsSession.countDocuments({ userId, status: { $nin: ['error'] } });
  if (currentCount >= maxBots) {
    return res.status(403).json({
      error: `Limite atteinte : votre compte gratuit permet ${maxBots} bot(s) actif(s). Supprimez un bot existant pour en déployer un nouveau.`
    });
  }

  const deployId = uuidv4();
  const job = { logs: [], status: 'running', subs: new Set(), deployId: null, error: null };
  global._vpsJobs = global._vpsJobs || new Map();
  global._vpsJobs.set(deployId, job);
  setTimeout(() => global._vpsJobs?.delete(deployId), 60 * 60 * 1000);

  function emit(type, text) {
    const entry = { type, text, ts: Date.now() };
    job.logs.push(entry);
    const payload = `data: ${JSON.stringify(entry)}\n\n`;
    for (const sub of job.subs) {
      try { sub.write(payload); } catch (_) { job.subs.delete(sub); }
    }
  }

  res.json({ deployId });

  (async () => {
    try {
      emit('info', '⚙️  Génération des fichiers du bot...');
      const fileMap = await generateBot(req.body, emit);

      emit('info', '🚀 Début du déploiement sur VPS...');
      const platformUrl = req.protocol + '://' + req.get('host');
      await vps.deployBot(deployId, fileMap, req.body, emit, userId, platformUrl);

      job.status = 'waiting_pair';
      job.deployId = deployId;

      const pairPayload = `data: ${JSON.stringify({ type: 'awaiting_pair', deployId })}\n\n`;
      for (const sub of job.subs) {
        try { sub.write(pairPayload); } catch (_) {}
      }
    } catch (err) {
      job.status = 'error';
      job.error = err.message;
      emit('error', `❌ Erreur : ${err.message}`);
      await createNotif(userId, 'error', '❌ Échec du déploiement', err.message, deployId, req.body.botName);
      const errPayload = `data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`;
      for (const sub of job.subs) {
        try { sub.write(errPayload); sub.end(); } catch (_) {}
      }
      job.subs.clear();
    }
  })();
});

// ── SSE progress ──────────────────────────────────────────────────────────────

router.get('/progress/:deployId', (req, res) => {
  const { deployId } = req.params;
  global._vpsJobs = global._vpsJobs || new Map();
  const job = global._vpsJobs.get(deployId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  if (!job) {
    const subs = vps.getSubs(deployId);
    if (!subs) { res.write(`data: ${JSON.stringify({ type: 'error', message: 'Job introuvable.' })}\n\n`); return res.end(); }
    subs.add(res);
    req.on('close', () => subs.delete(res));
    return;
  }

  for (const entry of job.logs) res.write(`data: ${JSON.stringify(entry)}\n\n`);

  if (job.status === 'error') {
    res.write(`data: ${JSON.stringify({ type: 'error', message: job.error })}\n\n`);
    return res.end();
  }

  if (job.status === 'waiting_pair') {
    res.write(`data: ${JSON.stringify({ type: 'awaiting_pair', deployId: job.deployId })}\n\n`);
    vps.getSubs(job.deployId || deployId).add(res);
    req.on('close', () => vps.getSubs(job.deployId || deployId).delete(res));
    return;
  }

  job.subs.add(res);
  req.on('close', () => job.subs.delete(res));
});

// ── Bot callback (from deployed bot) ─────────────────────────────────────────

router.post('/callback/:deployId', async (req, res) => {
  const { deployId } = req.params;
  const data = req.body;
  await vps.handleBotCallback(deployId, data);

  if (data.type === 'disconnected') {
    const session = await VpsSession.findOne({ deployId }).lean().catch(() => null);
    if (session?.userId) {
      const displayName = session.displayName || session.botName;
      await createNotif(
        session.userId, 'disconnect',
        '⚠️ Bot déconnecté',
        `Votre bot "${displayName}" s'est déconnecté de WhatsApp. Cliquez sur Repairer pour le reconnecter.`,
        deployId, displayName
      );
      // Email alert
      const { sendBotDisconnectedEmail } = require('../services/email.service');
      const user = await User.findById(session.userId).lean().catch(() => null);
      if (user?.email) {
        sendBotDisconnectedEmail(user.email, displayName, deployId).catch(() => {});
      }
    }
  }

  if (data.type === 'error') {
    const session = await VpsSession.findOne({ deployId }).lean().catch(() => null);
    if (session?.userId) {
      await createNotif(
        session.userId, 'error',
        '❌ Erreur bot',
        `Le bot "${session.botName}" a rencontré une erreur : ${data.message || ''}`,
        deployId, session.botName
      );
    }
  }

  res.json({ ok: true });
});

// ── Sessions ──────────────────────────────────────────────────────────────────

router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await vps.getSessionsByUser(req.user.id);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/session/:deployId', requireAuth, async (req, res) => {
  try {
    const session = await vps.getSession(req.params.deployId);
    if (!session) return res.status(404).json({ error: 'Session introuvable.' });
    if (session.userId && String(session.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Accès non autorisé.' });
    }
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Bot management ────────────────────────────────────────────────────────────

router.post('/restart/:deployId', requireAuth, async (req, res) => {
  try {
    await vps.restartBot(req.params.deployId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stop/:deployId', requireAuth, async (req, res) => {
  try {
    await vps.stopBot(req.params.deployId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/session/:deployId', requireAuth, async (req, res) => {
  try {
    await vps.deleteBot(req.params.deployId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/logs/:deployId', requireAuth, async (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 50;
    const logs = await vps.getBotLogs(req.params.deployId, lines);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/logs-stream/:deployId', async (req, res) => {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'sigma-mdx-jwt-2026';
  const tokenFromQuery = req.query.t;
  const authHeader = req.headers['authorization'] || '';
  const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tk = tokenFromHeader || tokenFromQuery;
  if (!tk) return res.status(401).json({ error: 'Non autorisé.' });
  try { jwt.verify(tk, JWT_SECRET); } catch { return res.status(401).json({ error: 'Token invalide.' }); }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const { deployId } = req.params;

  async function sendLogs() {
    try {
      const logs = await vps.getBotLogs(deployId, 100);
      res.write(`data: ${JSON.stringify({ logs })}\n\n`);
    } catch (_) {
      res.write(`data: ${JSON.stringify({ logs: '(erreur de lecture)' })}\n\n`);
    }
  }

  await sendLogs();
  const interval = setInterval(sendLogs, 5000);
  req.on('close', () => clearInterval(interval));
});

router.post('/redeploy/:deployId', requireAuth, async (req, res) => {
  const { deployId } = req.params;
  try {
    const session = await vps.getSession(deployId);
    if (!session) return res.status(404).json({ error: 'Session introuvable.' });
    if (session.userId && String(session.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Accès non autorisé.' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const job = { logs: [], status: 'running', subs: new Set() };
  global._vpsJobs = global._vpsJobs || new Map();
  global._vpsJobs.set(deployId + '_redeploy', job);
  setTimeout(() => global._vpsJobs?.delete(deployId + '_redeploy'), 30 * 60 * 1000);

  function emit(type, text) {
    const entry = { type, text, ts: Date.now() };
    job.logs.push(entry);
    const payload = `data: ${JSON.stringify(entry)}\n\n`;
    for (const sub of job.subs) {
      try { sub.write(payload); } catch (_) { job.subs.delete(sub); }
    }
  }

  res.json({ redeployJobId: deployId + '_redeploy', deployId });

  const platformUrl = req.protocol + '://' + req.get('host');
  (async () => {
    try {
      await vps.redeployBot(deployId, emit, req.user.id, platformUrl);
      job.status = 'waiting_pair';
      const pairPayload = `data: ${JSON.stringify({ type: 'awaiting_pair', deployId })}\n\n`;
      for (const sub of job.subs) {
        try { sub.write(pairPayload); } catch (_) {}
      }
    } catch (err) {
      job.status = 'error';
      emit('error', `❌ Erreur : ${err.message}`);
      const errPayload = `data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`;
      for (const sub of job.subs) {
        try { sub.write(errPayload); sub.end(); } catch (_) {}
      }
      job.subs.clear();
    }
  })();
});

router.post('/restore-session/:deployId', requireAuth, async (req, res) => {
  const { deployId } = req.params;
  try {
    const session = await vps.getSession(deployId);
    if (!session) return res.status(404).json({ error: 'Session introuvable.' });
    if (session.userId && String(session.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Accès non autorisé.' });
    }
    await vps.restoreSession(deployId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/repair/:deployId', requireAuth, async (req, res) => {
  const { deployId } = req.params;
  try {
    const session = await vps.getSession(deployId);
    if (!session) return res.status(404).json({ error: 'Session introuvable.' });
    if (session.userId && String(session.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Accès non autorisé.' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const job = { logs: [], status: 'running', subs: new Set() };
  global._vpsJobs = global._vpsJobs || new Map();
  global._vpsJobs.set(deployId + '_repair', job);
  setTimeout(() => global._vpsJobs?.delete(deployId + '_repair'), 30 * 60 * 1000);

  function emit(type, text) {
    const entry = { type, text, ts: Date.now() };
    job.logs.push(entry);
    const payload = `data: ${JSON.stringify(entry)}\n\n`;
    for (const sub of job.subs) {
      try { sub.write(payload); } catch (_) { job.subs.delete(sub); }
    }
  }

  res.json({ repairJobId: deployId + '_repair', deployId });

  const repairPlatformUrl = req.protocol + '://' + req.get('host');
  (async () => {
    try {
      await vps.redeployBot(deployId, emit, req.user.id, repairPlatformUrl);
      job.status = 'waiting_pair';
      const pairPayload = `data: ${JSON.stringify({ type: 'awaiting_pair', deployId })}\n\n`;
      for (const sub of job.subs) {
        try { sub.write(pairPayload); } catch (_) {}
      }
    } catch (err) {
      job.status = 'error';
      emit('error', `❌ Erreur : ${err.message}`);
      const errPayload = `data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`;
      for (const sub of job.subs) {
        try { sub.write(errPayload); sub.end(); } catch (_) {}
      }
      job.subs.clear();
    }
  })();
});

router.put('/session/:deployId/rename', requireAuth, async (req, res) => {
  try {
    const { displayName } = req.body;
    if (!displayName || !displayName.trim()) return res.status(400).json({ error: 'Nom invalide.' });
    const session = await vps.getSession(req.params.deployId);
    if (!session) return res.status(404).json({ error: 'Session introuvable.' });
    if (session.userId && String(session.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Accès non autorisé.' });
    }
    await vps.renameBot(req.params.deployId, displayName);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── VPS Admin endpoints ───────────────────────────────────────────────────────

async function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });
  const user = await User.findById(req.user.id).lean().catch(() => null);
  if (!user?.isAdmin) return res.status(403).json({ error: 'Accès réservé aux admins.' });
  next();
}

router.get('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '-passwordHash').sort({ createdAt: -1 }).lean();
    const VpsSession = require('../db/VpsSession.model');
    const counts = await VpsSession.aggregate([
      { $group: { _id: '$userId', total: { $sum: 1 }, connected: { $sum: { $cond: [{ $eq: ['$status', 'connected'] }, 1, 0] } } } }
    ]);
    const countMap = new Map(counts.map(c => [String(c._id), c]));
    res.json(users.map(u => ({
      ...u,
      botCount: countMap.get(String(u._id))?.total || 0,
      connectedBots: countMap.get(String(u._id))?.connected || 0,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/sessions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const sessions = await vps.getAllSessions();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/user/:id/plan', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { plan, maxBots } = req.body;
    await User.findByIdAndUpdate(req.params.id, { plan, maxBots: parseInt(maxBots) || 1 });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Notifications ─────────────────────────────────────────────────────────────

router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const notifs = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 }).limit(50).lean();
    const unread = await Notification.countDocuments({ userId: req.user.id, read: false });
    res.json({ notifications: notifs, unread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id, read: false }, { read: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    await Notification.updateOne({ _id: req.params.id, userId: req.user.id }, { read: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── VPS server status ─────────────────────────────────────────────────────────

router.get('/server-status', async (req, res) => {
  const VPS_HOST = process.env.VPS_HOST;
  const VPS_USER = process.env.VPS_USER || 'root';
  const VPS_PASS = process.env.VPS_PASS;

  if (!VPS_HOST || !VPS_PASS) return res.json({ online: false, error: 'VPS non configuré.' });

  const conn = new Client();
  let responded = false;
  const timeout = setTimeout(() => {
    if (!responded) { responded = true; conn.destroy(); res.json({ online: false, error: 'Timeout.' }); }
  }, 10000);

  conn.on('ready', async () => {
    clearTimeout(timeout);
    try {
      const [memR, diskR, pm2R, botCount] = await Promise.all([
        sshExecSafe(conn, "free -m | awk 'NR==2{printf \"%s %s\", $3, $2}'"),
        sshExecSafe(conn, "df -m / | awk 'NR==2{printf \"%s %s\", $3, $2}'"),
        sshExecSafe(conn, 'pm2 jlist 2>/dev/null || echo []'),
        VpsSession.countDocuments({ status: 'connected' }),
      ]);

      const [ramUsed, ramTotal] = (memR.out || '0 0').split(' ').map(Number);
      const [diskUsed, diskTotal] = (diskR.out || '0 0').split(' ').map(Number);

      let pm2List = [];
      try { pm2List = JSON.parse(pm2R.out || '[]'); } catch (_) {}

      const running = pm2List.filter(p => p.pm2_env?.status === 'online').length;
      const stopped = pm2List.filter(p => p.pm2_env?.status !== 'online').length;

      conn.end();
      if (!responded) {
        responded = true;
        res.json({
          online: true,
          ram: { used: ramUsed, total: ramTotal, pct: ramTotal ? Math.round(ramUsed / ramTotal * 100) : 0 },
          disk: { used: Math.round(diskUsed / 1024), total: Math.round(diskTotal / 1024), pct: diskTotal ? Math.round(diskUsed / diskTotal * 100) : 0 },
          pm2: { running, stopped, total: pm2List.length },
          connectedBots: botCount,
          processes: pm2List.map(p => ({
            name: p.name,
            status: p.pm2_env?.status,
            uptime: p.pm2_env?.pm_uptime,
            memory: p.monit?.memory,
            cpu: p.monit?.cpu,
            restarts: p.pm2_env?.restart_time,
          })),
          host: VPS_HOST,
        });
      }
    } catch (err) {
      conn.end();
      if (!responded) { responded = true; res.json({ online: false, error: err.message }); }
    }
  });

  conn.on('error', err => {
    clearTimeout(timeout);
    if (!responded) { responded = true; res.json({ online: false, error: err.message }); }
  });

  conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 8000 });
});

module.exports = router;
