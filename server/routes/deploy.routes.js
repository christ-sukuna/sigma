const express = require('express');
const router = express.Router();
const sharedBot = require('../services/shared-bot.service');

// POST /api/deploy/shared — start a shared bot session (QR mode)
router.post('/shared', async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber || !/^\+?[0-9]{7,15}$/.test(phoneNumber.trim())) {
      return res.status(400).json({ error: 'Valid phone number is required.' });
    }
    const deploySessionId = await sharedBot.startSession(phoneNumber.trim(), false);
    res.json({
      deploySessionId,
      qrEndpoint: `/api/deploy/qr/${deploySessionId}`,
      liveEndpoint: `/api/deploy/live/${deploySessionId}`,
    });
  } catch (err) {
    if (err.message.includes('Maximum')) return res.status(503).json({ error: err.message });
    next(err);
  }
});

// POST /api/deploy/shared/pair — start a shared bot session (pairing code mode)
router.post('/shared/pair', async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber || !/^\+?[0-9]{7,15}$/.test(phoneNumber.trim())) {
      return res.status(400).json({ error: 'Valid phone number is required.' });
    }
    const deploySessionId = await sharedBot.startSession(phoneNumber.trim(), true);
    res.json({
      deploySessionId,
      pairEndpoint: `/api/deploy/paircode/${deploySessionId}`,
      liveEndpoint: `/api/deploy/live/${deploySessionId}`,
    });
  } catch (err) {
    if (err.message.includes('Maximum')) return res.status(503).json({ error: err.message });
    next(err);
  }
});

// GET /api/deploy/qr/:deploySessionId — SSE stream for QR code
router.get('/qr/:deploySessionId', (req, res) => {
  const { deploySessionId } = req.params;
  const session = sharedBot.getSession(deploySessionId);
  if (!session) return res.status(404).json({ error: 'Deploy session not found.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function send(data) { res.write(`data: ${JSON.stringify(data)}\n\n`); }

  if (session.qrBuffer) send({ qr: session.qrBuffer });

  const unsubQR = sharedBot.onQR(deploySessionId, (qr) => send({ qr }));
  const unsubConn = sharedBot.onConnected(deploySessionId, () => {
    send({ status: 'connected' });
    cleanup(); res.end();
  });

  function cleanup() { unsubQR(); unsubConn(); }
  req.on('close', cleanup);
});

// GET /api/deploy/paircode/:deploySessionId — SSE stream for pairing code + connected status
router.get('/paircode/:deploySessionId', (req, res) => {
  const { deploySessionId } = req.params;
  const session = sharedBot.getSession(deploySessionId);
  if (!session) return res.status(404).json({ error: 'Deploy session not found.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function send(data) { res.write(`data: ${JSON.stringify(data)}\n\n`); }

  // If pairing code already available, send it immediately
  if (session.pairCode) send({ type: 'paircode', code: session.pairCode });

  const unsubPair = sharedBot.onPairCode(deploySessionId, (code) => {
    send({ type: 'paircode', code });
  });
  const unsubConn = sharedBot.onConnected(deploySessionId, () => {
    send({ type: 'connected' });
    cleanup(); res.end();
  });

  function cleanup() { unsubPair(); unsubConn(); }
  req.on('close', cleanup);
});

// GET /api/deploy/live/:deploySessionId — SSE for live status (disconnect notifications)
router.get('/live/:deploySessionId', (req, res) => {
  const { deploySessionId } = req.params;
  const session = sharedBot.getSession(deploySessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function send(data) { res.write(`data: ${JSON.stringify(data)}\n\n`); }

  // Send current status immediately
  send({ type: 'status', status: session.status });

  const unsubConn = sharedBot.onConnected(deploySessionId, () => {
    send({ type: 'status', status: 'connected' });
  });
  const unsubDisc = sharedBot.onDisconnected(deploySessionId, (status) => {
    send({ type: 'status', status });
  });

  function cleanup() { unsubConn(); unsubDisc(); }
  req.on('close', cleanup);
});

// GET /api/deploy/status/:deploySessionId
router.get('/status/:deploySessionId', (req, res) => {
  const session = sharedBot.getSession(req.params.deploySessionId);
  if (!session) return res.status(404).json({ error: 'Deploy session not found.' });
  res.json({ status: session.status });
});

// DELETE /api/deploy/session/:deploySessionId
router.delete('/session/:deploySessionId', (req, res) => {
  sharedBot.deleteSession(req.params.deploySessionId);
  res.json({ success: true });
});

module.exports = router;
