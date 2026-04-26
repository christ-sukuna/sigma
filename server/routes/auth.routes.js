const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../db/User.model');

const JWT_SECRET = process.env.JWT_SECRET || 'sigma-mdx-jwt-2026';
const JWT_EXPIRES = '30d';

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, phone } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères).' });

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email: email.toLowerCase().trim(), passwordHash, phone: phone || '' });

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, user: { id: user._id, email: user.email, phone: user.phone, plan: user.plan, maxBots: user.maxBots } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });

    const ok = await user.checkPassword(password);
    if (!ok) return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, user: { id: user._id, email: user.email, phone: user.phone, plan: user.plan, maxBots: user.maxBots } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non autorisé.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).lean();
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    res.json({ user: { id: user._id, email: user.email, phone: user.phone, plan: user.plan, maxBots: user.maxBots, isAdmin: user.isAdmin } });
  } catch {
    res.status(401).json({ error: 'Token invalide.' });
  }
});

// PUT /api/auth/me — update profile
router.put('/me', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const tk = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!tk) return res.status(401).json({ error: 'Non autorisé.' });
  try {
    const decoded = jwt.verify(tk, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });

    const { email, phone, currentPassword, newPassword } = req.body;

    if (email && email !== user.email) {
      const existing = await User.findOne({ email: email.toLowerCase().trim() });
      if (existing) return res.status(409).json({ error: 'Cet email est déjà utilisé.' });
      user.email = email.toLowerCase().trim();
    }

    if (phone !== undefined) user.phone = phone.trim();

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Mot de passe actuel requis.' });
      const ok = await user.checkPassword(currentPassword);
      if (!ok) return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
      if (newPassword.length < 6) return res.status(400).json({ error: 'Nouveau mot de passe trop court (min 6 caractères).' });
      user.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    await user.save();
    res.json({ ok: true, user: { id: user._id, email: user.email, phone: user.phone, plan: user.plan, maxBots: user.maxBots } });
  } catch {
    res.status(401).json({ error: 'Token invalide.' });
  }
});

module.exports = router;
