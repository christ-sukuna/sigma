require('dotenv').config();
const path = require('path');

module.exports = {
  port: process.env.PORT || 3000,
  // Path to the real SIGMA-MDX bot source used as template
  botSourceDir: process.env.BOT_SOURCE_DIR || path.join(__dirname, '../../SIGMA-MDX-repo'),
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'sigma-mdx-secret-change-me',
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/github/callback',
  },
  maxSharedSessions: parseInt(process.env.MAX_SHARED_SESSIONS || '150', 10),
  sessionTtlHours: parseInt(process.env.SESSION_TTL_HOURS || '24', 10),
  botSessionTtlMinutes: 15,
};
