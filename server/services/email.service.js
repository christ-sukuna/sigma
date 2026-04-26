const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  _transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
  return _transporter;
}

async function sendEmail(to, subject, html) {
  const t = getTransporter();
  if (!t) return;
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('[Email] Failed to send:', err.message);
  }
}

async function sendBotDisconnectedEmail(email, botName, deployId, platformUrl) {
  const url = platformUrl || process.env.PLATFORM_URL || 'https://sigma-mdx.replit.app';
  await sendEmail(
    email,
    `⚠️ Bot déconnecté — ${botName}`,
    `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a1628;color:#e0eaf5;padding:2rem;border-radius:12px;">
      <h2 style="color:#ffd200;margin-top:0">⚠️ Votre bot s'est déconnecté</h2>
      <p>Le bot <strong>${botName}</strong> s'est déconnecté de WhatsApp et ne répond plus.</p>
      <p style="color:#8a9ab0;font-size:.9rem">Cela peut arriver si la session WhatsApp a expiré ou si le téléphone a été déconnecté.</p>
      <a href="${url}/vps.html" style="display:inline-block;background:#00e676;color:#000;text-decoration:none;padding:.75rem 1.5rem;border-radius:8px;font-weight:700;margin-top:1rem">
        🔗 Repairer le bot
      </a>
      <p style="color:#4a5a6a;font-size:.78rem;margin-top:2rem">SIGMA MDX · ${url}</p>
    </div>
    `
  );
}

async function sendBotCrashedEmail(email, botName, deployId, platformUrl) {
  const url = platformUrl || process.env.PLATFORM_URL || 'https://sigma-mdx.replit.app';
  await sendEmail(
    email,
    `🔴 Bot hors ligne — ${botName}`,
    `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a1628;color:#e0eaf5;padding:2rem;border-radius:12px;">
      <h2 style="color:#ff4444;margin-top:0">🔴 Votre bot s'est arrêté</h2>
      <p>Le bot <strong>${botName}</strong> s'est arrêté de façon inattendue sur le VPS.</p>
      <p style="color:#8a9ab0;font-size:.9rem">Connectez-vous au tableau de bord pour le redémarrer ou le redéployer.</p>
      <a href="${url}/vps.html" style="display:inline-block;background:#00e676;color:#000;text-decoration:none;padding:.75rem 1.5rem;border-radius:8px;font-weight:700;margin-top:1rem">
        🔄 Gérer mes bots
      </a>
      <p style="color:#4a5a6a;font-size:.78rem;margin-top:2rem">SIGMA MDX · ${url}</p>
    </div>
    `
  );
}

async function sendHealthAlertEmail(email, botName, alertMsg, platformUrl) {
  const url = platformUrl || process.env.PLATFORM_URL || 'https://sigma-mdx.replit.app';
  await sendEmail(
    email,
    `⚠️ Alerte santé — ${botName}`,
    `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0a1628;color:#e0eaf5;padding:2rem;border-radius:12px;">
      <h2 style="color:#f59e0b;margin-top:0">⚠️ Alerte de santé détectée</h2>
      <p>Le bot <strong>${botName}</strong> présente un problème :</p>
      <p style="background:#0f1f2e;padding:.75rem 1rem;border-radius:6px;font-size:.9rem;color:#ffd200">${alertMsg}</p>
      <a href="${url}/vps.html" style="display:inline-block;background:#00e676;color:#000;text-decoration:none;padding:.75rem 1.5rem;border-radius:8px;font-weight:700;margin-top:1rem">
        📊 Voir le tableau de bord
      </a>
      <p style="color:#4a5a6a;font-size:.78rem;margin-top:2rem">SIGMA MDX · ${url}</p>
    </div>
    `
  );
}

module.exports = { sendEmail, sendBotDisconnectedEmail, sendBotCrashedEmail, sendHealthAlertEmail };
