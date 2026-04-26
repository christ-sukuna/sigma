const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./config');

const botRoutes = require('./routes/bot.routes');
const githubRoutes = require('./routes/github.routes');
const deployRoutes = require('./routes/deploy.routes');
const sessionRoutes = require('./routes/session.routes');
const adminRoutes = require('./routes/admin.routes');
const vpsRoutes = require('./routes/vps.routes');
const authRoutes = require('./routes/auth.routes');
const { rateLimiter, sessionRateLimiter } = require('./middleware/rateLimit');

const app = express();

app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 3600000 * 2,
  },
}));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api/bot', rateLimiter, botRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/session', sessionRateLimiter, sessionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vps', vpsRoutes);
app.use('/api/auth', authRoutes);

// Serve known HTML pages directly
const HTML_PAGES = ['builder', 'session', 'shared', 'deploy', 'admin', 'status', 'vps', 'login', 'vps-admin', 'profile'];
HTML_PAGES.forEach(name => {
  app.get(`/${name}.html`, (req, res) => {
    res.sendFile(path.join(__dirname, `../public/${name}.html`));
  });
});

// Home
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 404 for unknown routes
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`\n  ╔══════════════════════════════════╗`);
  console.log(`  ║      SIGMA MDX - Bot Builder     ║`);
  console.log(`  ║       by Muzan Sigma             ║`);
  console.log(`  ╚══════════════════════════════════╝`);
  console.log(`\n  Server running on http://localhost:${config.port}\n`);
});
