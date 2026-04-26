const express = require('express');
const router = express.Router();
const config = require('../config');
const { exchangeCodeForToken, pushFilesToRepo } = require('../services/github.service');
const { createOAuthState, saveGithubToken, getGithubToken, deleteOAuthState, getBotSession } = require('../utils/token-store');

// GET /api/github/auth?botSessionId=xxx — redirect to GitHub OAuth
router.get('/auth', (req, res) => {
  const { botSessionId } = req.query;
  if (!botSessionId) return res.status(400).json({ error: 'botSessionId is required.' });
  if (!getBotSession(botSessionId)) return res.status(404).json({ error: 'Bot session not found or expired.' });
  if (!config.github.clientId) return res.status(503).json({ error: 'GitHub OAuth is not configured on this server.' });

  const state = createOAuthState(botSessionId);
  // Store state in server-side session for CSRF protection
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    scope: 'repo',
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GET /api/github/callback — GitHub redirects here after user authorizes
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/builder.html?error=${encodeURIComponent('GitHub authorization denied.')}`);
  }

  // CSRF check
  if (!state || state !== req.session.oauthState) {
    return res.redirect('/builder.html?error=Invalid+OAuth+state');
  }

  const stateEntry = getGithubToken(state);
  if (!stateEntry) {
    return res.redirect('/builder.html?error=OAuth+state+expired');
  }

  try {
    const token = await exchangeCodeForToken(code);
    saveGithubToken(state, token);
    // Store token in server session so the push endpoint can retrieve it
    req.session.githubToken = token;
    req.session.oauthState = null;

    res.redirect(`/builder.html?githubConnected=1&botSessionId=${stateEntry.botSessionId}`);
  } catch (err) {
    res.redirect(`/builder.html?error=${encodeURIComponent(err.message)}`);
  }
});

// POST /api/github/push — push generated files to GitHub repo
router.post('/push', async (req, res, next) => {
  try {
    const { botSessionId, repoName, createNew } = req.body;

    if (!botSessionId || !repoName) {
      return res.status(400).json({ error: 'botSessionId and repoName are required.' });
    }

    const token = req.session.githubToken;
    if (!token) return res.status(401).json({ error: 'GitHub not connected. Please authorize first.' });

    const session = getBotSession(botSessionId);
    if (!session) return res.status(404).json({ error: 'Bot session not found or expired.' });

    const repoUrl = await pushFilesToRepo(token, repoName, !!createNew, session.fileMap);
    res.json({ repoUrl });
  } catch (err) {
    next(err);
  }
});

// GET /api/github/status — check if GitHub is connected for this session
router.get('/status', (req, res) => {
  res.json({ connected: !!req.session.githubToken });
});

module.exports = router;
