const VALID_MODES = ['public', 'private', 'inbox', 'group'];

function validateBotConfig(req, res, next) {
  const { botName, prefix, ownerNumber, ownerName, mode } = req.body;

  if (!botName || typeof botName !== 'string' || botName.trim().length < 2 || botName.trim().length > 40) {
    return res.status(400).json({ error: 'botName must be between 2 and 40 characters.' });
  }
  if (!prefix || typeof prefix !== 'string' || prefix.trim().length < 1 || prefix.trim().length > 5) {
    return res.status(400).json({ error: 'prefix must be between 1 and 5 characters.' });
  }
  if (!ownerNumber || !/^\+?[0-9]{7,15}$/.test(ownerNumber.trim())) {
    return res.status(400).json({ error: 'ownerNumber must be a valid phone number.' });
  }
  if (!ownerName || typeof ownerName !== 'string' || ownerName.trim().length < 1) {
    return res.status(400).json({ error: 'ownerName is required.' });
  }
  if (mode && !VALID_MODES.includes(mode)) {
    return res.status(400).json({ error: `mode must be one of: ${VALID_MODES.join(', ')}.` });
  }

  next();
}

module.exports = { validateBotConfig };
