const { v4: uuidv4 } = require('uuid');

// In-memory store for bot generation sessions and GitHub tokens
// In production, replace with Redis or a persistent store

const botSessions = new Map();   // sessionId -> { fileMap, config, expiresAt }
const githubTokens = new Map();  // stateToken -> { token, botSessionId, expiresAt }

const BOT_SESSION_TTL_MS = 15 * 60 * 1000;    // 15 minutes
const GITHUB_TOKEN_TTL_MS = 30 * 60 * 1000;   // 30 minutes

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of botSessions) {
    if (entry.expiresAt < now) botSessions.delete(id);
  }
  for (const [state, entry] of githubTokens) {
    if (entry.expiresAt < now) githubTokens.delete(state);
  }
}, 5 * 60 * 1000);

// Bot sessions
function saveBotSession(fileMap, config) {
  const id = uuidv4();
  botSessions.set(id, { fileMap, config, expiresAt: Date.now() + BOT_SESSION_TTL_MS });
  return id;
}

function getBotSession(id) {
  const entry = botSessions.get(id);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry;
}

function deleteBotSession(id) {
  botSessions.delete(id);
}

// GitHub OAuth state tokens
function createOAuthState(botSessionId) {
  const state = uuidv4();
  githubTokens.set(state, { token: null, botSessionId, expiresAt: Date.now() + GITHUB_TOKEN_TTL_MS });
  return state;
}

function saveGithubToken(state, token) {
  const entry = githubTokens.get(state);
  if (!entry) return false;
  entry.token = token;
  return true;
}

function getGithubToken(state) {
  const entry = githubTokens.get(state);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry;
}

function deleteOAuthState(state) {
  githubTokens.delete(state);
}

module.exports = {
  saveBotSession, getBotSession, deleteBotSession,
  createOAuthState, saveGithubToken, getGithubToken, deleteOAuthState,
};
