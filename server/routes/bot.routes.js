const express = require('express');
const router = express.Router();
const { validateBotConfig } = require('../middleware/validate');
const { generateBot } = require('../services/generator.service');
const { zipFileMap } = require('../services/zipper.service');
const { saveBotSession, getBotSession } = require('../utils/token-store');
const { v4: uuidv4 } = require('uuid');

// In-memory job store (TTL cleaned separately)
const jobs = new Map(); // jobId -> { status, logs, sessionId, botName, error, subs }

function cleanJob(jobId) {
  setTimeout(() => jobs.delete(jobId), 15 * 60 * 1000);
}

// POST /api/bot/generate — start async generation, return jobId immediately
router.post('/generate', validateBotConfig, (req, res) => {
  const jobId = uuidv4();
  const job = { status: 'running', logs: [], sessionId: null, botName: null, error: null, subs: new Set() };
  jobs.set(jobId, job);

  function emit(type, text) {
    const entry = { type, text, ts: Date.now() };
    job.logs.push(entry);
    const payload = `data: ${JSON.stringify(entry)}\n\n`;
    for (const sub of job.subs) {
      try { sub.write(payload); } catch (_) { job.subs.delete(sub); }
    }
  }

  // Run generation async
  (async () => {
    try {
      const fileMap = await generateBot(req.body, emit);
      const sessionId = saveBotSession(fileMap, req.body);
      job.status = 'done';
      job.sessionId = sessionId;
      job.botName = req.body.botName;
      const finalPayload = `data: ${JSON.stringify({ type: 'complete', sessionId, botName: req.body.botName })}\n\n`;
      for (const sub of job.subs) {
        try { sub.write(finalPayload); sub.end(); } catch (_) {}
      }
      job.subs.clear();
    } catch (err) {
      job.status = 'error';
      job.error = err.message;
      emit('error', `❌ Erreur : ${err.message}`);
      const errPayload = `data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`;
      for (const sub of job.subs) {
        try { sub.write(errPayload); sub.end(); } catch (_) {}
      }
      job.subs.clear();
    }
    cleanJob(jobId);
  })();

  res.json({ jobId });
});

// GET /api/bot/progress/:jobId — SSE stream for real-time generation progress
router.get('/progress/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found or expired.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Replay already-emitted logs
  for (const entry of job.logs) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  if (job.status === 'done') {
    res.write(`data: ${JSON.stringify({ type: 'complete', sessionId: job.sessionId, botName: job.botName })}\n\n`);
    return res.end();
  }
  if (job.status === 'error') {
    res.write(`data: ${JSON.stringify({ type: 'error', message: job.error })}\n\n`);
    return res.end();
  }

  job.subs.add(res);
  req.on('close', () => job.subs.delete(res));
});

// GET /api/bot/download/:sessionId — stream ZIP
router.get('/download/:sessionId', async (req, res, next) => {
  try {
    const session = getBotSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found or expired.' });

    const zipBuffer = await zipFileMap(session.fileMap);
    const botName = (session.config.botName || 'bot').replace(/[^a-z0-9-]/gi, '-').toLowerCase();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${botName}.zip"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.end(zipBuffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
