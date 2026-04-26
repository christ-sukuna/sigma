/**
 * Sigma MDX — Shared Bot Worker (Atassa-compatible)
 * Implements the same commands as the atassa-md bot.
 * Uses GiftedTechApi for all external features.
 */
require('events').EventEmitter.defaultMaxListeners = 500;

const path = require('path');
const fs   = require('fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} = require('gifted-baileys');
const qrcode = require('qrcode');
const axios  = require('axios');

const SESSION_DIR    = process.env.SESSION_DIR    || path.join(__dirname, '../../sessions/default');
const BOT_NAME       = process.env.BOT_NAME       || 'Sigma MDX';
const BOT_PREFIX     = process.env.BOT_PREFIX     || '.';
const OWNER_NUMBER   = (process.env.OWNER_NUMBER  || '').replace(/\D/g, '');
const TIME_ZONE      = process.env.TIME_ZONE      || 'Africa/Nairobi';
const PAIRING_NUMBER = (process.env.PAIRING_NUMBER || '').replace(/\D/g, '');

// Gifted Tech API (same as atassa)
const GAPI     = 'https://api.giftedtech.co.ke';
const GKEY     = '_0u5aff45,_0l1876s8qc';
const BOT_PIC  = 'https://files.catbox.moe/iw9ar0.jpg';
const BOT_FOOTER = `© ${BOT_NAME} 2026`;
const BOT_VER  = '5.0.0';

const BOT_START = Date.now();

fs.mkdirSync(SESSION_DIR, { recursive: true });

let selfJid = null;

// Strip device suffix and domain: "12345:6@s.whatsapp.net" → "12345"
function normalizeJid(j) {
  if (!j) return '';
  return j.replace(/@.+$/, '').replace(/:\d+$/, '');
}

// Silent logger compatible with Baileys downloadMediaMessage
const SILENT_LOGGER = {
  level: 'silent',
  trace() {}, debug() {}, info() {}, warn() {},
  error() {}, fatal() {}, child() { return this; },
};

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function reply(sock, msg, text) {
  return sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
}

async function reactTo(sock, msg, emoji) {
  try {
    await sock.sendMessage(msg.key.remoteJid, { react: { key: msg.key, text: emoji } });
  } catch (_) {}
}

// Send a group status via gifted-baileys giftedStatus.sendGroupStatus
// Uses groupStatusMessageV2 (field 103) sent directly to the group JID
// This is identical to atassa's gcstatus approach.
async function sendGroupStatus(sock, groupJid, payload) {
  return sock.giftedStatus.sendGroupStatus(groupJid, payload);
}

// Collect all unique user JIDs from all groups the bot is in
// (mirrors atassa's getStatusJidList — required for status visibility)
async function getStatusJidList(sock) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const jids = new Set();
    for (const group of Object.values(groups)) {
      if (!group.participants) continue;
      for (const p of group.participants) {
        // p.jid is always @s.whatsapp.net; p.id may be @lid in newer groups
        const jid = p.jid || (p.id?.endsWith('@s.whatsapp.net') ? p.id : null);
        if (jid) jids.add(jid);
      }
    }
    return [...jids];
  } catch (_) { return []; }
}

function formatUptime(ms) {
  const s  = Math.floor(ms / 1000);
  const d  = Math.floor(s / 86400);
  const h  = Math.floor((s % 86400) / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  return `${d}d ${h}h ${m}m ${sc}s`;
}

function formatDateTime(tz) {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now);
  return { date, time };
}

function mono(t) { return `\`${t}\``; }

async function gapi(endpoint, params = {}) {
  const r = await axios.get(`${GAPI}${endpoint}`, {
    params: { apikey: GKEY, ...params },
    timeout: 30000,
  });
  return r.data;
}

async function gapiBuffer(endpoint, params = {}) {
  const r = await axios.get(`${GAPI}${endpoint}`, {
    params: { apikey: GKEY, ...params },
    responseType: 'arraybuffer',
    timeout: 60000,
  });
  return Buffer.from(r.data);
}

// ───────────────────────────────────────────────────────────────────────────
// Command registry (same structure as atassa gmd)
// ───────────────────────────────────────────────────────────────────────────

const CMDS = {};

function reg(patterns, category, fn) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  for (const p of list) CMDS[p.toLowerCase()] = { category, fn };
}

// ═══════════════════════════════════════
// GENERAL
// ═══════════════════════════════════════

reg(['menu', 'help', 'allmenu', 'men'], 'general', async (sock, msg, args, q) => {
  const { date, time } = formatDateTime(TIME_ZONE);
  const uptime = formatUptime(Date.now() - BOT_START);
  const totalCmds = Object.keys(CMDS).length;

  // Build categorized menu
  const cats = {};
  for (const [cmd, meta] of Object.entries(CMDS)) {
    if (!cats[meta.category]) cats[meta.category] = [];
    cats[meta.category].push(cmd);
  }

  const readmore = '\u200e'.repeat(4001);

  let header = `╭══〘〘 *${BOT_NAME}* 〙〙═⊷\n`;
  header += `┃❍ *Mᴏᴅᴇ:*  ${mono('public')}\n`;
  header += `┃❍ *Pʀᴇғɪx:*  [ ${mono(BOT_PREFIX)} ]\n`;
  header += `┃❍ *Pʟᴜɢɪɴs:*  ${mono(String(totalCmds))}\n`;
  header += `┃❍ *Vᴇʀsɪᴏɴ:*  ${mono(BOT_VER)}\n`;
  header += `┃❍ *Uᴘᴛɪᴍᴇ:*  ${mono(uptime)}\n`;
  header += `┃❍ *Tɪᴍᴇ:*  ${mono(time)}\n`;
  header += `┃❍ *Dᴀᴛᴇ:*  ${mono(date)}\n`;
  header += `┃❍ *Tɪᴍᴇ Zᴏɴᴇ:*  ${mono(TIME_ZONE)}\n`;
  header += `╰═════════════════⊷\n${readmore}\n`;

  let menu = header;
  for (const [cat, cmds] of Object.entries(cats).sort()) {
    cmds.sort();
    menu += `╭━━━━❮ *${cat.toUpperCase()}* ❯━⊷\n`;
    for (const c of cmds) menu += `┃◇ ${mono(BOT_PREFIX + c)}\n`;
    menu += `╰━━━━━━━━━━━━━━━━━⊷\n\n`;
  }

  const menuText = `${menu.trim()}\n\n> *${BOT_FOOTER}*`;
  try {
    const imgBuf = await axios.get(BOT_PIC, { responseType: 'arraybuffer', timeout: 8000 })
      .then(r => Buffer.from(r.data)).catch(() => null);
    if (imgBuf) {
      await sock.sendMessage(msg.key.remoteJid, { image: imgBuf, caption: menuText }, { quoted: msg });
    } else {
      await reply(sock, msg, menuText);
    }
  } catch (_) {
    await reply(sock, msg, menuText);
  }
  await reactTo(sock, msg, '🪀');
});

reg(['list', 'listmenu', 'listmen'], 'general', async (sock, msg, args, q) => {
  const { date, time } = formatDateTime(TIME_ZONE);
  const uptime = formatUptime(Date.now() - BOT_START);
  const readmore = '\u200e'.repeat(4001);
  const allCmds = Object.keys(CMDS).sort();

  let text = `╭━━〔 *${BOT_NAME}* 〕━━╮\n`;
  text += `│ ✦ *Mᴏᴅᴇ*     : ${mono('public')}\n`;
  text += `│ ✦ *Pʀᴇғɪx*   : [ ${mono(BOT_PREFIX)} ]\n`;
  text += `│ ✦ *Pʟᴜɢɪɴs*  : ${mono(String(allCmds.length))}\n`;
  text += `│ ✦ *Vᴇʀsɪᴏɴ*  : ${mono(BOT_VER)}\n`;
  text += `│ ✦ *Uᴘᴛɪᴍᴇ*   : ${mono(uptime)}\n`;
  text += `│ ✦ *Tɪᴍᴇ*     : ${mono(time)}\n`;
  text += `│ ✦ *Dᴀᴛᴇ*     : ${mono(date)}\n`;
  text += `╰─────────────╯${readmore}\n`;
  allCmds.forEach((c, i) => { text += `*${i + 1}. ${mono(BOT_PREFIX + c)}*\n`; });

  const listText = text.trim();
  try {
    const imgBuf = await axios.get(BOT_PIC, { responseType: 'arraybuffer', timeout: 8000 })
      .then(r => Buffer.from(r.data)).catch(() => null);
    if (imgBuf) {
      await sock.sendMessage(msg.key.remoteJid, { image: imgBuf, caption: listText }, { quoted: msg });
    } else {
      await reply(sock, msg, listText);
    }
  } catch (_) {
    await reply(sock, msg, listText);
  }
  await reactTo(sock, msg, '📜');
});

reg(['ping', 'pi', 'p'], 'general', async (sock, msg, args, q) => {
  const start = Date.now();
  await reply(sock, msg, '🏓 Pinging...');
  const ms = Date.now() - start;
  await reply(sock, msg, `⚡ *Pong:* ${ms}ms\n> *${BOT_FOOTER}*`);
  await reactTo(sock, msg, '✅');
});

reg(['uptime', 'up'], 'general', async (sock, msg, args, q) => {
  const uptime = formatUptime(Date.now() - BOT_START);
  await reply(sock, msg, `⏱️ *Uptime:* ${uptime}\n> *${BOT_FOOTER}*`);
  await reactTo(sock, msg, '✅');
});

reg(['repo', 'sc', 'rep', 'script'], 'general', async (sock, msg, args, q) => {
  try {
    const r = await axios.get(`https://api.github.com/repos/muzansigma/sigma-mdx`, { timeout: 10000 });
    const { name, forks_count, stargazers_count, created_at, updated_at } = r.data;
    await reply(sock, msg,
      `*${BOT_NAME} Repository*\n\n` +
      `❲❒❳ *Name:* ${name}\n❲❒❳ *Stars:* ${stargazers_count}\n❲❒❳ *Forks:* ${forks_count}\n` +
      `❲❒❳ *Created:* ${new Date(created_at).toLocaleDateString()}\n` +
      `❲❒❳ *Updated:* ${new Date(updated_at).toLocaleDateString()}\n\n` +
      `🔗 https://github.com/muzansigma/sigma-mdx\n> *${BOT_FOOTER}*`
    );
    await reactTo(sock, msg, '✅');
  } catch (e) {
    await reply(sock, msg, `❌ Failed to fetch repo: ${e.message}`);
  }
});

reg(['alive', 'online'], 'general', async (sock, msg, args, q) => {
  const uptime = formatUptime(Date.now() - BOT_START);
  await reply(sock, msg, `✅ *${BOT_NAME} is alive!*\n📡 Status: Online\n⏰ Uptime: ${uptime}\n> *${BOT_FOOTER}*`);
  await reactTo(sock, msg, '✅');
});


// ═══════════════════════════════════════
// OWNER
// ═══════════════════════════════════════

reg(['owner'], 'owner', async (sock, msg, args, q) => {
  const num = OWNER_NUMBER || sock.user?.id?.split(':')[0] || '';
  if (num) {
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${BOT_NAME} Owner\nORG:${BOT_NAME};\nTEL;type=CELL;type=VOICE;waid=${num}:+${num}\nEND:VCARD`;
    await sock.sendMessage(msg.key.remoteJid, {
      contacts: { displayName: `${BOT_NAME} Owner`, contacts: [{ vcard }] },
    }, { quoted: msg });
  } else {
    await reply(sock, msg, `👑 *Owner:* No owner number configured.\n> *${BOT_FOOTER}*`);
  }
  await reactTo(sock, msg, '✅');
});

reg(['getpp', 'stealpp', 'snatchpp'], 'owner', async (sock, msg, args, q) => {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant
    || msg.message?.extendedTextMessage?.contextInfo?.remoteJid;
  const target = quoted || (q ? `${q.replace(/\D/g, '')}@s.whatsapp.net` : null);
  if (!target) return reply(sock, msg, `❌ Reply to a user or provide a number.\nUsage: ${BOT_PREFIX}getpp 2547XXXXXXXX`);
  try {
    const ppUrl = await sock.profilePictureUrl(target, 'image');
    await sock.sendMessage(msg.key.remoteJid, {
      image: { url: ppUrl }, caption: `🖼️ Profile Picture\n\n> *${BOT_FOOTER}*`,
    }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (_) {
    await reply(sock, msg, `❌ Could not fetch profile picture. It may be private.`);
  }
});

reg(['getgcpp', 'stealgcpp'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  try {
    const ppUrl = await sock.profilePictureUrl(from, 'image');
    await sock.sendMessage(from, {
      image: { url: ppUrl }, caption: `🖼️ *Group Profile Picture*\n\n> *${BOT_FOOTER}*`,
    }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (_) {
    await reply(sock, msg, `❌ This group has no profile picture.`);
  }
});

// Helper: check if bot is group admin
// Use p.jid (always @s.whatsapp.net) — p.id can be @lid in newer WhatsApp
async function isBotAdmin(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const botNum = normalizeJid(selfJid || sock.user?.id || '');
    return meta.participants.some(p => {
      const num = normalizeJid(p.jid || p.id || '');
      return num === botNum && (p.admin === 'admin' || p.admin === 'superadmin');
    });
  } catch (_) { return false; }
}

// Helper: get mentioned / replied-to JID
function getMentionedJid(msg, q) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const mentioned = ctx?.mentionedJid?.[0];
  const participant = ctx?.participant;
  const fromNumber = q?.replace(/\D/g, '');
  if (mentioned) return mentioned;
  if (participant) return participant;
  if (fromNumber) return `${fromNumber}@s.whatsapp.net`;
  return null;
}

reg(['ginfo', 'groupinfo', 'gcinfo', 'gdetails'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  try {
    const meta = await sock.groupMetadata(from);
    const admins = meta.participants.filter(p => p.admin).map(p => `@${normalizeJid(p.id)}`);
    const created = new Date(meta.creation * 1000).toLocaleDateString();
    let text = `📋 *Group Info*\n\n`;
    text += `👥 *Name:* ${meta.subject}\n`;
    text += `📝 *Desc:* ${meta.desc || 'None'}\n`;
    text += `👑 *Owner:* @${normalizeJid(meta.owner || '')}\n`;
    text += `📅 *Created:* ${created}\n`;
    text += `👤 *Members:* ${meta.participants.length}\n`;
    text += `🛡️ *Admins:* ${admins.join(', ') || 'None'}\n`;
    text += `\n> *${BOT_FOOTER}*`;
    await sock.sendMessage(from, { text, mentions: meta.participants.map(p => p.id) }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['tagall', 'all', 'everyone', 'mentionall'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  try {
    const meta = await sock.groupMetadata(from);
    const members = meta.participants;
    const text = (q ? `📢 *${q}*\n\n` : `📢 *Tag All*\n\n`) +
      members.map(p => `@${normalizeJid(p.id)}`).join(' ') +
      `\n\n> *${BOT_FOOTER}*`;
    await sock.sendMessage(from, { text, mentions: members.map(p => p.id) }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['hidetag', 'stag', 'silent'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  try {
    const meta = await sock.groupMetadata(from);
    const members = meta.participants;
    // Send with mentions but empty/hidden text
    const text = q || '‎';
    await sock.sendMessage(from, { text, mentions: members.map(p => p.id) }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['kick', 'remove', 'ban', 'removemember'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to kick members.');
  const target = getMentionedJid(msg, q);
  if (!target) return reply(sock, msg, `❌ Reply to a user or mention them.\nUsage: ${BOT_PREFIX}kick @user`);
  try {
    await sock.groupParticipantsUpdate(from, [target], 'remove');
    await reply(sock, msg, `✅ @${normalizeJid(target)} has been removed from the group.`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['add', 'addmember', 'adduser'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to add members.');
  const num = q?.replace(/\D/g, '');
  if (!num) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}add <number>`);
  const target = `${num}@s.whatsapp.net`;
  try {
    const res = await sock.groupParticipantsUpdate(from, [target], 'add');
    const status = res?.[0]?.status;
    if (status === '408') return reply(sock, msg, '❌ User must send a message to the bot first (408).');
    if (status === '403') return reply(sock, msg, '❌ User has privacy settings preventing being added.');
    await reply(sock, msg, `✅ +${num} has been added to the group.`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['promote', 'admin', 'makeadmin'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to promote members.');
  const target = getMentionedJid(msg, q);
  if (!target) return reply(sock, msg, `❌ Reply to a user or mention them.\nUsage: ${BOT_PREFIX}promote @user`);
  try {
    await sock.groupParticipantsUpdate(from, [target], 'promote');
    await reply(sock, msg, `✅ @${normalizeJid(target)} has been promoted to admin.`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['demote', 'unadmin', 'removeadmin'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to demote members.');
  const target = getMentionedJid(msg, q);
  if (!target) return reply(sock, msg, `❌ Reply to a user or mention them.\nUsage: ${BOT_PREFIX}demote @user`);
  try {
    await sock.groupParticipantsUpdate(from, [target], 'demote');
    await reply(sock, msg, `✅ @${normalizeJid(target)} has been demoted from admin.`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['mute', 'close', 'closegroup', 'mutegroup'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to mute the group.');
  try {
    await sock.groupSettingUpdate(from, 'announcement');
    await reply(sock, msg, `🔇 Group muted. Only admins can send messages now.\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['unmute', 'open', 'opengroup', 'unmutegroup'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to unmute the group.');
  try {
    await sock.groupSettingUpdate(from, 'not_announcement');
    await reply(sock, msg, `🔊 Group opened. All members can send messages now.\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['lock', 'lockgroup', 'glock', 'lockgc'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to lock group settings.');
  try {
    await sock.groupSettingUpdate(from, 'locked');
    await reply(sock, msg, `🔒 *Group Locked!*\nOnly admins can now change the group name, photo and description.\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['unlock', 'unlockgroup', 'gunlock', 'unlockgc'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to unlock group settings.');
  try {
    await sock.groupSettingUpdate(from, 'unlocked');
    await reply(sock, msg, `🔓 *Group Unlocked!*\nAll members can now change the group name, photo and description.\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['ephemeral', 'disappear', 'disappearing', 'setephemeral'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to change ephemeral settings.');
  // Parse duration: off | 24h (86400) | 7d (604800) | 90d (7776000)
  const durations = { 'off': 0, '0': 0, '24h': 86400, '1d': 86400, '7d': 604800, '1w': 604800, '90d': 7776000, '3m': 7776000 };
  const key = (q || 'off').trim().toLowerCase();
  const secs = durations[key];
  if (secs === undefined) {
    return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}ephemeral <off | 24h | 7d | 90d>\n\n*off* — disable\n*24h* — 24 hours\n*7d* — 7 days\n*90d* — 90 days`);
  }
  try {
    await sock.groupToggleEphemeral(from, secs);
    const label = secs === 0 ? 'disabled' : `set to ${key}`;
    await reply(sock, msg, `⏳ *Disappearing messages ${label}!*\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['link', 'invite', 'gclink', 'grouplink', 'invitelink'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to get the invite link.');
  try {
    const code = await sock.groupInviteCode(from);
    await reply(sock, msg, `🔗 *Group Invite Link*\n\nhttps://chat.whatsapp.com/${code}\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['revoke', 'resetlink', 'revokelink'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to revoke the link.');
  try {
    const code = await sock.groupRevokeInvite(from);
    await reply(sock, msg, `✅ Invite link revoked!\n\n🔗 New link:\nhttps://chat.whatsapp.com/${code}\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['subject', 'gname', 'setgname', 'groupname'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}subject <new name>`);
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to change the group name.');
  try {
    await sock.groupUpdateSubject(from, q.trim());
    await reply(sock, msg, `✅ Group name changed to *${q.trim()}*\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['desc', 'gdesc', 'setdesc', 'groupdesc'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}desc <new description>`);
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to change the description.');
  try {
    await sock.groupUpdateDescription(from, q.trim());
    await reply(sock, msg, `✅ Group description updated.\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['setgpp', 'setgpic', 'setgrouppic'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to set group picture.');
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const quotedImg = ctx?.quotedMessage?.imageMessage;
  const directImg = msg.message?.imageMessage;
  if (!directImg && !quotedImg) return reply(sock, msg, `❌ Send or reply to an image.\nUsage: ${BOT_PREFIX}setgpp`);
  try {
    const targetMsg = directImg ? msg : {
      key: { id: ctx.stanzaId || msg.key.id, remoteJid: msg.key.remoteJid, fromMe: false, participant: ctx.participant || undefined },
      message: { imageMessage: quotedImg },
    };
    const buf = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: SILENT_LOGGER });
    await sock.updateProfilePicture(from, buf);
    await reply(sock, msg, `✅ Group profile picture updated!\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['leave', 'leavegroup', 'bye'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  // Only owner can make bot leave
  const senderNum = normalizeJid(msg.key.participant || msg.key.remoteJid);
  const ownerNum  = normalizeJid(OWNER_NUMBER);
  if (ownerNum && senderNum !== ownerNum) return reply(sock, msg, '❌ Only the bot owner can use this command.');
  try {
    await reply(sock, msg, `👋 Leaving the group... Goodbye!\n\n> *${BOT_FOOTER}*`);
    await sock.groupLeave(from);
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['members', 'listmembers', 'gcmembers'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  try {
    const meta = await sock.groupMetadata(from);
    const members = meta.participants;
    const admins  = members.filter(p => p.admin).map(p => p.id);
    let text = `👥 *Members of ${meta.subject}*\n(${members.length} total)\n\n`;
    members.forEach((p, i) => {
      const isAdmin = admins.includes(p.id);
      text += `${i + 1}. @${normalizeJid(p.id)}${isAdmin ? ' 👑' : ''}\n`;
    });
    text += `\n> *${BOT_FOOTER}*`;
    await sock.sendMessage(from, { text, mentions: members.map(p => p.id) }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['adminlist', 'admins', 'gcadmins'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  try {
    const meta = await sock.groupMetadata(from);
    const admins = meta.participants.filter(p => p.admin);
    let text = `👑 *Admins of ${meta.subject}*\n(${admins.length} admins)\n\n`;
    admins.forEach((p, i) => {
      text += `${i + 1}. @${normalizeJid(p.id)} ${p.admin === 'superadmin' ? '⭐' : ''}\n`;
    });
    text += `\n> *${BOT_FOOTER}*`;
    await sock.sendMessage(from, { text, mentions: admins.map(p => p.id) }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['tagadmins', 'pingadmins', 'calladmins'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  try {
    const meta = await sock.groupMetadata(from);
    const admins = meta.participants.filter(p => p.admin);
    const text = (q ? `📢 *${q}*\n\n` : `📢 *Pinging admins...*\n\n`) +
      admins.map(p => `@${normalizeJid(p.id)}`).join(' ') + `\n\n> *${BOT_FOOTER}*`;
    await sock.sendMessage(from, { text, mentions: admins.map(p => p.id) }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['newgroup', 'creategroup', 'creategc'], 'group', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}newgroup <group name>`);
  try {
    const created = await sock.groupCreate(q.trim(), [selfJid || sock.user?.id].filter(Boolean));
    await reply(sock, msg, `✅ Group *${q.trim()}* created!\n🔗 JID: ${created.id}\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['killgc', 'destroygc', 'destroygroup'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  const senderNum = normalizeJid(msg.key.participant || msg.key.remoteJid);
  const ownerNum  = normalizeJid(OWNER_NUMBER);
  if (ownerNum && senderNum !== ownerNum) return reply(sock, msg, '❌ Only the bot owner can destroy groups.');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to destroy the group.');
  try {
    await reply(sock, msg, `💀 Destroying group... kicking everyone!\n\n> *${BOT_FOOTER}*`);
    const meta = await sock.groupMetadata(from);
    const botNum = normalizeJid(selfJid || '');
    const others = meta.participants
      .filter(p => normalizeJid(p.id) !== botNum)
      .map(p => p.id);
    if (others.length > 0) await sock.groupParticipantsUpdate(from, others, 'remove');
    await sock.groupLeave(from);
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['join', 'joingc', 'joingroup'], 'owner', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}join <invite link>`);
  try {
    const code = q.trim().replace('https://chat.whatsapp.com/', '').trim();
    await sock.groupAcceptInvite(code);
    await reply(sock, msg, `✅ Successfully joined the group!\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ Failed to join: ${e.message}`); }
});

reg(['listrequests', 'joinrequests', 'gcrequests'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin to view join requests.');
  try {
    const requests = await sock.groupRequestParticipantsList(from);
    if (!requests?.length) return reply(sock, msg, `📋 No pending join requests.\n\n> *${BOT_FOOTER}*`);
    let text = `📋 *Join Requests* (${requests.length})\n\n`;
    requests.forEach((r, i) => { text += `${i + 1}. +${normalizeJid(r.jid)}\n`; });
    text += `\nUse ${BOT_PREFIX}acceptall or ${BOT_PREFIX}rejectall to process.\n\n> *${BOT_FOOTER}*`;
    await reply(sock, msg, text);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['acceptall', 'acceptrequests'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin.');
  try {
    const requests = await sock.groupRequestParticipantsList(from);
    if (!requests?.length) return reply(sock, msg, `📋 No pending join requests.\n\n> *${BOT_FOOTER}*`);
    await sock.groupRequestParticipantsUpdate(from, requests.map(r => r.jid), 'approve');
    await reply(sock, msg, `✅ Accepted ${requests.length} join request(s).\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['rejectall', 'rejectrequests'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin.');
  try {
    const requests = await sock.groupRequestParticipantsList(from);
    if (!requests?.length) return reply(sock, msg, `📋 No pending join requests.\n\n> *${BOT_FOOTER}*`);
    await sock.groupRequestParticipantsUpdate(from, requests.map(r => r.jid), 'reject');
    await reply(sock, msg, `✅ Rejected ${requests.length} join request(s).\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['togroupstatus', 'groupstatus', 'statusgroup', 'togcstatus', 'gcstatus'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');

  const ctx    = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  const text   = q?.trim();

  if (!text && !quoted) {
    return reply(sock, msg,
      `📢 *Usage:*\n` +
      `• ${BOT_PREFIX}togroupstatus <text>\n` +
      `• Reply to image/video with ${BOT_PREFIX}togroupstatus <caption optional>\n\n` +
      `Posts the status visible only to members of this group.\n\n> *${BOT_FOOTER}*`
    );
  }

  await reactTo(sock, msg, '⏳');
  try {
    let payload = {};

    if (quoted?.imageMessage) {
      const targetMsg = {
        key: { id: ctx?.stanzaId || msg.key.id, remoteJid: from, fromMe: false, participant: ctx?.participant },
        message: { imageMessage: quoted.imageMessage },
      };
      const buf = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: SILENT_LOGGER });
      payload = { image: buf, caption: text || quoted.imageMessage.caption || '' };
    } else if (quoted?.videoMessage) {
      const targetMsg = {
        key: { id: ctx?.stanzaId || msg.key.id, remoteJid: from, fromMe: false, participant: ctx?.participant },
        message: { videoMessage: quoted.videoMessage },
      };
      const buf = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: SILENT_LOGGER });
      payload = { video: buf, caption: text || quoted.videoMessage.caption || '' };
    } else if (quoted?.audioMessage) {
      const targetMsg = {
        key: { id: ctx?.stanzaId || msg.key.id, remoteJid: from, fromMe: false, participant: ctx?.participant },
        message: { audioMessage: quoted.audioMessage },
      };
      const buf = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: SILENT_LOGGER });
      payload = { audio: buf, mimetype: 'audio/mp4', ptt: false };
    } else {
      payload = { text: text, backgroundColor: '#075e54', font: 1 };
    }

    // Use gifted-baileys giftedStatus.sendGroupStatus — wraps in groupStatusMessageV2 (field 103)
    // and relays directly to the group JID, identical to atassa gcstatus
    await sendGroupStatus(sock, from, payload);

    await reply(sock, msg, `✅ Group status posted!\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ Failed: ${e.message}`); }
});

reg(['del', 'delete', 'delmsg'], 'owner', async (sock, msg, args, q) => {
  const ctx    = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (!quoted) return reply(sock, msg, `❌ Reply to a message to delete it.`);
  try {
    const targetKey = {
      id: ctx.stanzaId || msg.key.id,
      remoteJid: msg.key.remoteJid,
      fromMe: ctx.participant ? false : msg.key.fromMe,
      participant: ctx.participant || undefined,
    };
    await sock.sendMessage(msg.key.remoteJid, { delete: targetKey });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['block', 'blockuser'], 'owner', async (sock, msg, args, q) => {
  const target = getMentionedJid(msg, q);
  if (!target) return reply(sock, msg, `❌ Reply to a user or provide a number.\nUsage: ${BOT_PREFIX}block 2547XXXXXXXX`);
  try {
    await sock.updateBlockStatus(target, 'block');
    await reply(sock, msg, `🚫 +${normalizeJid(target)} has been blocked.\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['unblock', 'unblockuser'], 'owner', async (sock, msg, args, q) => {
  const target = getMentionedJid(msg, q);
  if (!target) return reply(sock, msg, `❌ Reply to a user or provide a number.\nUsage: ${BOT_PREFIX}unblock 2547XXXXXXXX`);
  try {
    await sock.updateBlockStatus(target, 'unblock');
    await reply(sock, msg, `✅ +${normalizeJid(target)} has been unblocked.\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['blocklist', 'listblocked'], 'owner', async (sock, msg, args, q) => {
  try {
    const list = await sock.fetchBlocklist();
    if (!list?.length) return reply(sock, msg, `📋 No blocked users.\n\n> *${BOT_FOOTER}*`);
    let text = `🚫 *Blocked Users* (${list.length})\n\n`;
    list.forEach((jid, i) => { text += `${i + 1}. +${normalizeJid(jid)}\n`; });
    text += `\n> *${BOT_FOOTER}*`;
    await reply(sock, msg, text);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['jid', 'getjid', 'id'], 'owner', async (sock, msg, args, q) => {
  const ctx    = msg.message?.extendedTextMessage?.contextInfo;
  const target = ctx?.participant || msg.key.remoteJid;
  const from   = msg.key.remoteJid;
  let text = `🆔 *JID Info*\n\n`;
  text += `📍 *Chat JID:* ${from}\n`;
  if (target && target !== from) text += `👤 *User JID:* ${target}\n`;
  if (selfJid) text += `🤖 *Bot JID:* ${selfJid}\n`;
  text += `\n> *${BOT_FOOTER}*`;
  await reply(sock, msg, text);
  await reactTo(sock, msg, '✅');
});

reg(['mygroups', 'listgroups', 'botgroups'], 'owner', async (sock, msg, args, q) => {
  try {
    const groups = await sock.groupFetchAllParticipating();
    const list = Object.values(groups);
    if (!list.length) return reply(sock, msg, `📋 Bot is not in any groups.\n\n> *${BOT_FOOTER}*`);
    let text = `📋 *Bot Groups* (${list.length})\n\n`;
    list.slice(0, 30).forEach((g, i) => {
      text += `${i + 1}. *${g.subject}* — ${g.participants.length} members\n`;
    });
    if (list.length > 30) text += `\n...and ${list.length - 30} more`;
    text += `\n\n> *${BOT_FOOTER}*`;
    await reply(sock, msg, text);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['antipromote'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin.');
  await reply(sock, msg, `ℹ️ *Anti-Promote*\n\nThis feature monitors unauthorized promotions. The bot will demote anyone promoted without authorization.\n\n> *${BOT_FOOTER}*`);
});

reg(['antidemote'], 'group', async (sock, msg, args, q) => {
  const from = msg.key.remoteJid;
  if (!from.endsWith('@g.us')) return reply(sock, msg, '❌ Group only command!');
  if (!await isBotAdmin(sock, from)) return reply(sock, msg, '❌ Bot needs to be admin.');
  await reply(sock, msg, `ℹ️ *Anti-Demote*\n\nThis feature monitors unauthorized demotions. The bot will re-promote admins that get demoted without authorization.\n\n> *${BOT_FOOTER}*`);
});

reg(['vv', 'reveal'], 'owner', async (sock, msg, args, q) => {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (!quoted) return reply(sock, msg, `❌ Reply to a view-once message.`);

  // Find the media type key inside the quoted message
  const type = Object.keys(quoted).find(k =>
    k.endsWith('Message') && ['image', 'video', 'audio'].some(t => k.includes(t))
  );
  if (!type) return reply(sock, msg, '❌ Unsupported view-once type.');

  await reactTo(sock, msg, '⏳');
  try {
    // Strip viewOnce flag and reconstruct a proper WAMessage
    const mediaContent = { ...quoted[type], viewOnce: false };
    const targetMsg = {
      key: {
        id: ctx?.stanzaId || msg.key.id,
        remoteJid: msg.key.remoteJid,
        fromMe: false,
        participant: ctx?.participant || undefined,
      },
      message: { [type]: mediaContent },
    };
    const mediaType = type.replace('Message', '');
    const buffer = await downloadMediaMessage(
      targetMsg, 'buffer', {}, { logger: SILENT_LOGGER }
    );
    const sendPayload = { [mediaType]: buffer };
    if (mediaType === 'audio') sendPayload.mimetype = 'audio/mpeg';
    await sock.sendMessage(msg.key.remoteJid, sendPayload, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) {
    await reply(sock, msg, `❌ Failed: ${e.message}`);
  }
});

// ═══════════════════════════════════════
// TOOLS
// ═══════════════════════════════════════

reg(['fetch', 'get', 'testapi', 'curl'], 'tools', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}fetch <url>`);
  let url = q.trim();
  if (!url.startsWith('http')) url = 'https://' + url;
  await reactTo(sock, msg, '⏳');
  try {
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000, validateStatus: () => true });
    const ct = r.headers['content-type'] || '';
    const buf = Buffer.from(r.data);
    if (ct.includes('image/')) {
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: url }, { quoted: msg });
    } else if (ct.includes('video/')) {
      await sock.sendMessage(msg.key.remoteJid, { video: buf, caption: url }, { quoted: msg });
    } else if (ct.includes('audio/')) {
      await sock.sendMessage(msg.key.remoteJid, { audio: buf, mimetype: 'audio/mpeg' }, { quoted: msg });
    } else {
      const text = buf.toString('utf-8').slice(0, 4000);
      await reply(sock, msg, ct.includes('json') ? '```json\n' + JSON.stringify(JSON.parse(text), null, 2) + '\n```' : text);
    }
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ Failed: ${e.message}`); }
});

reg(['ssweb', 'ss', 'screenshot', 'fullssweb'], 'tools', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}ssweb <url>`);
  await reactTo(sock, msg, '⏳');
  try {
    const buf = await gapiBuffer('/api/tools/ssweb', { url: q.trim() });
    await sock.sendMessage(msg.key.remoteJid, {
      image: buf, caption: `📸 *Screenshot*\n🌐 ${q}\n\n> *${BOT_FOOTER}*`,
    }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ Failed: ${e.message}`); }
});

reg(['ebinary', 'tobinary', 'textbinary'], 'tools', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}ebinary <text>`);
  const binary = q.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
  await reply(sock, msg, `🔢 *Binary Encoder*\n\n📝 Input: ${q}\n\n🔢 Binary:\n${binary}\n\n> *${BOT_FOOTER}*`);
  await reactTo(sock, msg, '✅');
});

reg(['debinary', 'dbinary', 'frombinary'], 'tools', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}debinary <binary>`);
  try {
    const text = q.trim().split(' ').map(b => String.fromCharCode(parseInt(b, 2))).join('');
    await reply(sock, msg, `🔢 *Binary Decoder*\n\n🔢 Binary: ${q.slice(0, 100)}\n\n📝 Text:\n${text}\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (_) { await reply(sock, msg, '❌ Invalid binary format.'); }
});

reg(['ebase', 'tobase64', 'base64encode'], 'tools', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}ebase <text>`);
  const b64 = Buffer.from(q).toString('base64');
  await reply(sock, msg, `🔐 *Base64 Encoder*\n\n📝 Input: ${q}\n\n🔐 Base64:\n${b64}\n\n> *${BOT_FOOTER}*`);
  await reactTo(sock, msg, '✅');
});

reg(['dbase', 'debase', 'debase64', 'frombase64'], 'tools', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}dbase <base64>`);
  try {
    const text = Buffer.from(q.trim(), 'base64').toString('utf8');
    await reply(sock, msg, `🔐 *Base64 Decoder*\n\n🔐 Base64: ${q.slice(0, 50)}...\n\n📝 Text:\n${text}\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (_) { await reply(sock, msg, '❌ Invalid Base64 format.'); }
});

reg(['remini', 'enhance', 'restorephoto'], 'tools', async (sock, msg, args, q) => {
  const ctxQ = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const imgFromQ = q?.trim()?.startsWith('http') ? q.trim() : null;
  let imageUrl = imgFromQ;

  // If quoting an image, download it then upload to get a public URL
  if (!imageUrl && ctxQ?.imageMessage) {
    await reactTo(sock, msg, '⏳');
    try {
      const buf = await downloadMediaMessage(
        { message: { imageMessage: ctxQ.imageMessage }, key: msg.key },
        'buffer', {}, { logger: SILENT_LOGGER }
      );
      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', buf, { filename: 'image.jpg' });
      const upRes = await axios.post(`${GAPI}/api/tools/uploadimg`, form, {
        headers: { ...form.getHeaders(), 'x-apikey': GKEY },
        timeout: 30000,
      }).catch(() => null);
      imageUrl = upRes?.data?.result || null;
    } catch (_) {}
  }

  if (!imageUrl) return reply(sock, msg, `❌ Provide an image URL or reply to an image.\nUsage: ${BOT_PREFIX}remini <url>`);
  await reactTo(sock, msg, '⏳');
  try {
    const d = await gapi('/api/tools/remini', { url: imageUrl });
    const resultUrl = d?.result || d?.enhanced || d?.url;
    if (!d?.success || !resultUrl) return reply(sock, msg, '❌ Failed to enhance photo.');
    await sock.sendMessage(msg.key.remoteJid, {
      image: { url: resultUrl }, caption: `✨ *Enhanced Photo*\n\n> *${BOT_FOOTER}*`,
    }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['domaincheck', 'domain', 'domainstatus'], 'tools', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}domain <domain.com>`);
  await reactTo(sock, msg, '⏳');
  try {
    const d = await gapi('/api/tools/whois', { domain: q.trim() });
    if (!d?.success || !d?.result) return reply(sock, msg, '❌ Domain not found.');
    const r = d.result;
    let txt = `*🌐 Domain Check*\n\n🌐 *Domain:* ${r.domainName || q}\n`;
    if (r.registrar) txt += `🏢 *Registrar:* ${r.registrar}\n`;
    if (r.creationDate) txt += `📅 *Created:* ${new Date(r.creationDate * 1000).toLocaleDateString()}\n`;
    if (r.expirationDate) txt += `📅 *Expires:* ${new Date(r.expirationDate * 1000).toLocaleDateString()}\n`;
    if (r.dnssec) txt += `🔒 *DNSSEC:* ${r.dnssec}\n`;
    txt += `\n> *${BOT_FOOTER}*`;
    await reply(sock, msg, txt);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

// ═══════════════════════════════════════
// DOWNLOADER
// ═══════════════════════════════════════

reg(['ytmp3', 'mp3', 'ymp3', 'ytaudio'], 'downloader', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}ytmp3 <YouTube URL or title>`);
  await reactTo(sock, msg, '⏳');
  try {
    const d = await gapi('/api/download/ytmp3', { url: q.trim() });
    if (!d?.success || !d?.result?.download_url) return reply(sock, msg, '❌ Could not download audio.');
    const r = d.result;
    await sock.sendMessage(msg.key.remoteJid, {
      audio: { url: r.download_url },
      mimetype: 'audio/mpeg',
      fileName: `${r.title || 'audio'}.mp3`,
    }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['ytmp4', 'mp4', 'ytvideo'], 'downloader', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}ytmp4 <YouTube URL or title>`);
  await reactTo(sock, msg, '⏳');
  try {
    const d = await gapi('/api/download/ytmp4', { url: q.trim() });
    if (!d?.success || !d?.result?.download_url) return reply(sock, msg, '❌ Could not download video.');
    const r = d.result;
    await sock.sendMessage(msg.key.remoteJid, {
      video: { url: r.download_url },
      caption: `🎬 ${r.title || ''}\n\n> *${BOT_FOOTER}*`,
    }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['tiktok', 'tt', 'tiktokvideo'], 'downloader', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}tiktok <TikTok URL>`);
  await reactTo(sock, msg, '⏳');
  try {
    const d = await gapi('/api/download/tiktok', { url: q.trim() });
    const videoUrl = d?.result?.video || d?.result?.download_url || d?.result?.play_url;
    if (!d?.success || !videoUrl) return reply(sock, msg, '❌ Could not download TikTok.');
    const r = d.result;
    await sock.sendMessage(msg.key.remoteJid, {
      video: { url: videoUrl },
      caption: `🎵 ${r.title || 'TikTok'}\n\n> *${BOT_FOOTER}*`,
    }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['facebook', 'fb', 'fbdl'], 'downloader', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}facebook <Facebook URL>`);
  await reactTo(sock, msg, '⏳');
  try {
    const d = await gapi('/api/download/facebook', { url: q.trim() });
    const videoUrl = d?.result?.download_url || d?.result?.hd || d?.result?.sd || d?.result?.video;
    if (!d?.success || !videoUrl) return reply(sock, msg, '❌ Could not download Facebook video. Make sure the video is public.');
    await sock.sendMessage(msg.key.remoteJid, {
      video: { url: videoUrl }, caption: `> *${BOT_FOOTER}*`,
    }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['instagram', 'ig', 'igdl'], 'downloader', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}instagram <Instagram URL>`);
  await reactTo(sock, msg, '⏳');
  try {
    const d = await gapi('/api/download/instagram', { url: q.trim() });
    const mediaUrl = d?.result?.download_url || d?.result?.video || d?.result?.image;
    if (!d?.success || !mediaUrl) return reply(sock, msg, '❌ Could not download Instagram media. Make sure the post is public.');
    const r = d.result;
    const isVideo = r.type === 'video' || mediaUrl.includes('.mp4');
    await sock.sendMessage(msg.key.remoteJid, {
      [isVideo ? 'video' : 'image']: { url: mediaUrl }, caption: `> *${BOT_FOOTER}*`,
    }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

// ═══════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════

reg(['google', 'search', 'ggl'], 'search', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}google <query>`);
  await reactTo(sock, msg, '⏳');
  try {
    const d = await gapi('/api/search/google', { query: q });
    const arr = d?.results || d?.result;
    if (!d?.success || !arr) return reply(sock, msg, '❌ No results found.');
    const results = (Array.isArray(arr) ? arr : [arr]).slice(0, 5);
    let text = `🔍 *Google: ${q}*\n\n`;
    results.forEach((r, i) => {
      text += `*${i + 1}. ${r.title || ''}*\n${r.description || r.snippet || ''}\n🔗 ${r.url || r.link || ''}\n\n`;
    });
    await reply(sock, msg, text + `> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['ytsearch', 'yt', 'youtube'], 'search', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}yt <query>\nTip: Use ${BOT_PREFIX}ytmp3 or ${BOT_PREFIX}ytmp4 to download.`);
  await reactTo(sock, msg, '⏳');
  try {
    const d = await gapi('/api/search/youtube', { query: q });
    const arr = d?.results || d?.result;
    if (!d?.success || !arr) return reply(sock, msg, '❌ No YouTube results found.');
    const results = (Array.isArray(arr) ? arr : [arr]).slice(0, 5);
    let text = `🎬 *YouTube: ${q}*\n\n`;
    results.forEach((r, i) => {
      text += `*${i + 1}. ${r.title || ''}*\n⏱ ${r.duration || 'N/A'} | 👁 ${r.views || 'N/A'}\n🔗 ${r.url || r.link || ''}\n\n`;
    });
    await reply(sock, msg, text + `> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['weather', 'climate'], 'search', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}weather <city>`);
  await reactTo(sock, msg, '⏳');
  try {
    const d = await gapi('/api/search/weather', { location: q });
    if (!d?.success || !d?.result) return reply(sock, msg, '❌ Could not fetch weather. Check the city name.');
    const r = d.result;
    const temp = r.main?.temp != null ? `${Math.round(r.main.temp)}°C` : 'N/A';
    const feelsLike = r.main?.feels_like != null ? `${Math.round(r.main.feels_like)}°C` : 'N/A';
    const humidity = r.main?.humidity != null ? `${r.main.humidity}%` : 'N/A';
    const wind = r.wind?.speed != null ? `${r.wind.speed} m/s` : 'N/A';
    const condition = r.weather?.main || 'N/A';
    const desc = r.weather?.description || '';
    const country = r.sys?.country ? ` (${r.sys.country})` : '';
    let text = `🌤️ *Weather: ${r.location || q}${country}*\n\n`;
    text += `🌡️ *Temp:* ${temp} — feels like ${feelsLike}\n`;
    text += `☁️ *Condition:* ${condition} — ${desc}\n`;
    text += `💧 *Humidity:* ${humidity}\n`;
    text += `💨 *Wind:* ${wind}\n`;
    text += `\n> *${BOT_FOOTER}*`;
    await reply(sock, msg, text);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['news', 'latestnews'], 'search', async (sock, msg, args, q) => {
  const topic = q || 'world';
  await reactTo(sock, msg, '⏳');
  try {
    const d = await gapi('/api/search/news', { query: topic });
    const arr = d?.results || d?.result;
    if (!d?.success || !arr) return reply(sock, msg, '❌ Could not fetch news.');
    const results = (Array.isArray(arr) ? arr : [arr]).slice(0, 5);
    let text = `📰 *News: ${topic}*\n\n`;
    results.forEach((r, i) => {
      text += `*${i + 1}. ${r.title || ''}*\n`;
      if (r.source) text += `📡 ${r.source}\n`;
      if (r.url || r.link) text += `🔗 ${r.url || r.link}\n`;
      text += '\n';
    });
    await reply(sock, msg, text + `> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

// ═══════════════════════════════════════
// AI
// ═══════════════════════════════════════

reg(['ai', 'chatgpt', 'gpt', 'ask'], 'ai', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}ai <question>`);
  await reactTo(sock, msg, '⏳');
  try {
    const d = await gapi('/api/ai/ai', { q });
    const answer = d?.result || d?.answer || d?.response || '❌ No response.';
    await reply(sock, msg, `🤖 *AI Response*\n\n${answer}\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['imagine', 'dalle', 'texttoimage', 'tti'], 'ai', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}imagine <prompt>`);
  await reactTo(sock, msg, '⏳');
  try {
    // Try multiple possible endpoint names
    let d = await gapi('/api/ai/texttoimage', { query: q }).catch(() => null);
    if (!d?.success) d = await gapi('/api/ai/texttoimage', { prompt: q }).catch(() => null);
    if (!d?.success) d = await gapi('/api/ai/imagine', { prompt: q }).catch(() => null);
    const imgUrl = d?.result || d?.image || d?.url;
    if (!imgUrl) return reply(sock, msg, '❌ Image generation is temporarily unavailable.');
    await sock.sendMessage(msg.key.remoteJid, {
      image: { url: imgUrl }, caption: `🎨 *AI Image*\n✨ Prompt: ${q}\n\n> *${BOT_FOOTER}*`,
    }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ Image generation is temporarily unavailable.`); }
});

reg(['translate', 'tr', 'trans'], 'tools', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}translate <lang> <text>\nExample: ${BOT_PREFIX}translate fr Hello World`);
  const parts = q.trim().split(' ');
  const lang  = parts[0];
  const text  = parts.slice(1).join(' ');
  if (!text) return reply(sock, msg, `❌ Provide text to translate.`);
  await reactTo(sock, msg, '⏳');
  try {
    // Try multiple endpoint variants
    let d = await gapi('/api/tools/translate', { text, lang }).catch(() => null);
    if (!d?.success) d = await gapi('/api/tools/translate', { text, target_lang: lang }).catch(() => null);
    const result = d?.result || d?.translated || d?.translation;
    if (!result) return reply(sock, msg, '❌ Translation is temporarily unavailable.');
    await reply(sock, msg, `🌍 *Translation*\n\n📝 Original: ${text}\n🌐 Language: ${lang}\n✅ Result: ${result}\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ Translation is temporarily unavailable.`); }
});

reg(['qrcode', 'qr', 'genqr'], 'tools', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}qrcode <text or URL>`);
  await reactTo(sock, msg, '⏳');
  try {
    const buf = await gapiBuffer('/api/tools/qrcode', { text: q.trim() });
    await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `📱 *QR Code*\n\n> *${BOT_FOOTER}*` }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ Failed to generate QR code: ${e.message}`); }
});

reg(['tts', 'texttospeech', 'speak'], 'tools', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}tts <text>\nExample: ${BOT_PREFIX}tts Hello World`);
  await reactTo(sock, msg, '⏳');
  try {
    const d = await gapi('/api/tools/tts', { text: q.trim(), lang: 'en' });
    const url = d?.result?.audio || d?.audio_url || d?.result;
    if (!url || typeof url !== 'string') return reply(sock, msg, '❌ TTS is temporarily unavailable.');
    await sock.sendMessage(msg.key.remoteJid, { audio: { url }, mimetype: 'audio/mp4', ptt: true }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ TTS unavailable: ${e.message}`); }
});

reg(['lyrics', 'lyric', 'songlyrics'], 'search', async (sock, msg, args, q) => {
  if (!q) return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}lyrics <song name>`);
  await reactTo(sock, msg, '⏳');
  try {
    const d = await gapi('/api/search/lyrics', { title: q.trim() });
    const r = d?.result;
    if (!r) return reply(sock, msg, '❌ Lyrics not found.');
    const title   = r.title || q;
    const artist  = r.artist ? `\n🎤 *Artist:* ${r.artist}` : '';
    const content = r.lyrics || r.content || r.text || 'No lyrics found.';
    const preview = content.length > 3000 ? content.slice(0, 3000) + '\n...' : content;
    await reply(sock, msg, `🎵 *${title}*${artist}\n\n${preview}\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ Lyrics search failed: ${e.message}`); }
});

reg(['removebg', 'rmbg', 'nobg'], 'tools', async (sock, msg, args, q) => {
  const ctx    = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  const directImg  = msg.message?.imageMessage;
  const quotedImg  = quoted?.imageMessage;
  if (!directImg && !quotedImg) return reply(sock, msg, `❌ Send or reply to an image with ${BOT_PREFIX}removebg`);
  await reactTo(sock, msg, '⏳');
  try {
    const targetMsg = directImg ? msg : { key: { id: ctx?.stanzaId || msg.key.id, remoteJid: msg.key.remoteJid, fromMe: false, participant: ctx?.participant }, message: quoted };
    const imgBuf = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: SILENT_LOGGER });
    const b64 = imgBuf.toString('base64');
    const d = await gapi('/api/tools/removebg', { image: b64 });
    const url = d?.result?.url || d?.result;
    if (!url || typeof url !== 'string') return reply(sock, msg, '❌ Background removal failed.');
    await sock.sendMessage(msg.key.remoteJid, { image: { url }, caption: `✂️ *Background Removed*\n\n> *${BOT_FOOTER}*` }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['setstatus', 'status', 'poststatus', 'wstatus'], 'owner', async (sock, msg, args, q) => {
  const ctx    = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;

  const directImg = msg.message?.imageMessage;
  const directVid = msg.message?.videoMessage;
  const quotedImg = quoted?.imageMessage;
  const quotedVid = quoted?.videoMessage;
  const text = q?.trim();

  await reactTo(sock, msg, '⏳');
  try {
    // Build the JID list of all contacts so the status is visible to everyone
    const statusJidList = await getStatusJidList(sock);

    if (directImg || quotedImg) {
      const targetMsg = directImg ? msg : {
        key: { id: ctx?.stanzaId || msg.key.id, remoteJid: msg.key.remoteJid, fromMe: false, participant: ctx?.participant },
        message: { imageMessage: quotedImg },
      };
      const buf = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: SILENT_LOGGER });
      await sock.sendMessage('status@broadcast', { image: buf, caption: text || '' }, { statusJidList });
    } else if (directVid || quotedVid) {
      const targetMsg = directVid ? msg : {
        key: { id: ctx?.stanzaId || msg.key.id, remoteJid: msg.key.remoteJid, fromMe: false, participant: ctx?.participant },
        message: { videoMessage: quotedVid },
      };
      const buf = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: SILENT_LOGGER });
      await sock.sendMessage('status@broadcast', { video: buf, caption: text || '' }, { statusJidList });
    } else if (text) {
      await sock.sendMessage('status@broadcast', {
        text: text,
        backgroundColor: '#075e54',
        font: 1,
      }, { statusJidList });
    } else {
      return reply(sock, msg, `❌ Usage: ${BOT_PREFIX}setstatus <text> — or send/reply to an image/video with caption ${BOT_PREFIX}setstatus`);
    }
    const visibleTo = statusJidList.length;
    await reply(sock, msg, `✅ Status posted! Visible to ${visibleTo} contact${visibleTo !== 1 ? 's' : ''}.\n\n> *${BOT_FOOTER}*`);
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ Failed to post status: ${e.message}`); }
});

// ═══════════════════════════════════════
// CONVERTER
// ═══════════════════════════════════════

reg(['sticker', 's', 'stik', 'stiker'], 'converter', async (sock, msg, args, q) => {
  const ctx       = msg.message?.extendedTextMessage?.contextInfo;
  const quoted    = ctx?.quotedMessage;

  const directImg = msg.message?.imageMessage;
  const directVid = msg.message?.videoMessage;
  const quotedImg = quoted?.imageMessage;
  const quotedVid = quoted?.videoMessage;

  const hasMedia = directImg || directVid || quotedImg || quotedVid;
  if (!hasMedia) return reply(sock, msg, `❌ Send an image/video with caption *${BOT_PREFIX}sticker* or reply to one.`);

  await reactTo(sock, msg, '⏳');
  try {
    let buffer, mediaType;

    // Helper: download without reuploadRequest (updateMediaMessage doesn't exist in this Baileys build)
    const safeDownload = (target) =>
      downloadMediaMessage(target, 'buffer', {}, { logger: SILENT_LOGGER });

    if (directImg || directVid) {
      mediaType = directImg ? 'image' : 'video';
      buffer = await safeDownload(msg);
    } else {
      mediaType = quotedImg ? 'image' : 'video';
      const targetMsg = {
        key: {
          id: ctx?.stanzaId || msg.key.id,
          remoteJid: msg.key.remoteJid,
          fromMe: ctx?.participant ? false : msg.key.fromMe,
          participant: ctx?.participant || undefined,
        },
        message: quotedImg ? { imageMessage: quotedImg } : { videoMessage: quotedVid },
      };
      buffer = await safeDownload(targetMsg, mediaType);
    }

    if (!buffer || buffer.length === 0) return reply(sock, msg, '❌ Could not download media. Try again.');

    // Try API conversion to proper WebP sticker; fallback to raw buffer
    let stickerBuf = null;
    try {
      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', buffer, { filename: `media.${mediaType === 'image' ? 'jpg' : 'mp4'}` });
      const uploadRes = await axios.post(`${GAPI}/api/tools/uploadimg`, form, {
        headers: { ...form.getHeaders(), 'x-apikey': GKEY },
        timeout: 30000,
      }).catch(() => null);
      if (uploadRes?.data?.result) {
        stickerBuf = await gapiBuffer('/api/converter/webp', { url: uploadRes.data.result }).catch(() => null);
      }
    } catch (_) {}

    await sock.sendMessage(msg.key.remoteJid, { sticker: stickerBuf || buffer }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

reg(['toimg', 'sttoimg', 'stickertoimg'], 'converter', async (sock, msg, args, q) => {
  const ctx    = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  const directSticker = msg.message?.stickerMessage;
  const quotedSticker = quoted?.stickerMessage;
  if (!directSticker && !quotedSticker) return reply(sock, msg, `❌ Reply to a sticker.`);
  await reactTo(sock, msg, '⏳');
  try {
    // Build the proper WAMessage object for downloadMediaMessage
    const targetMsg = directSticker ? msg : {
      key: {
        id: ctx?.stanzaId || msg.key.id,
        remoteJid: msg.key.remoteJid,
        fromMe: false,
        participant: ctx?.participant || undefined,
      },
      message: quoted,
    };
    const buffer = await downloadMediaMessage(
      targetMsg, 'buffer', {}, { logger: SILENT_LOGGER }
    );
    await sock.sendMessage(msg.key.remoteJid, { image: buffer, caption: `> *${BOT_FOOTER}*` }, { quoted: msg });
    await reactTo(sock, msg, '✅');
  } catch (e) { await reply(sock, msg, `❌ ${e.message}`); }
});

// ═══════════════════════════════════════
// CONNECTION + MAIN
// ═══════════════════════════════════════

const processedMsgIds = new Set();

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  // fetchLatestBaileysVersion can fail on restricted networks — use fallback
  let version;
  try {
    const result = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('version fetch timeout')), 8000)),
    ]);
    version = result.version;
  } catch (_) {
    version = [2, 3000, 1023444];
  }

  // Notify parent that we are connecting (so frontend can show progress)
  process.send({ type: 'status', data: 'connecting' });

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: SILENT_LOGGER,
    // Stability settings
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    retryRequestDelayMs: 500,
    maxMsgRetryCount: 2,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: false,
    emitOwnEvents: false,
    getMessage: async (key) => {
      // Return stub — prevents crash when message not in store
      return { conversation: '' };
    },
  });

  sock.ev.on('creds.update', saveCreds);

  // Pairing code mode — request code instead of QR
  if (PAIRING_NUMBER && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(PAIRING_NUMBER);
        const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
        process.send({ type: 'paircode', data: formatted });
      } catch (err) {
        console.error('[Worker] Pairing code error:', err.message);
      }
    }, 3000);
  }

  let hasNotifiedConnected = false;

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr && !PAIRING_NUMBER) {
      try {
        const qrDataUrl = await qrcode.toDataURL(qr);
        process.send({ type: 'qr', data: qrDataUrl });
      } catch (_) {}
    }

    if (connection === 'open') {
      hasNotifiedConnected = true;
      selfJid = sock.user?.id || null;
      process.send({ type: 'connected' });
      try { await sock.presenceSubscribe('status@broadcast'); } catch (_) {}
    }

    if (connection === 'close') {
      const errCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = errCode === DisconnectReason.loggedOut;
      // Let the service handle reconnection — just report and exit cleanly
      process.send({ type: 'disconnected', data: { code: errCode, shouldReconnect: !loggedOut } });
      try { sock.end(undefined); } catch (_) {}
      process.exit(0);
    }
  });

  // ─── Welcome message on new member join ────────────────────────────────────
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    if (action !== 'add') return;
    try {
      const meta = await sock.groupMetadata(id);
      const groupName = meta.subject || 'ce groupe';
      const memberCount = meta.participants.length;
      const totalCmds = Object.keys(CMDS).length;
      const { date, time } = formatDateTime(TIME_ZONE);

      for (const jid of participants) {
        const num = normalizeJid(jid);
        const welcomeText =
          `╔══════════════════════╗\n` +
          `║   🌟 *BIENVENUE !* 🌟   ║\n` +
          `╚══════════════════════╝\n\n` +
          `👤 Bienvenue @${num} dans *${groupName}* !\n\n` +
          `╭─────────────────────\n` +
          `│ 🤖 *Bot:* ${BOT_NAME}\n` +
          `│ ⚙️ *Préfixe:* [ ${BOT_PREFIX} ]\n` +
          `│ 📦 *Commandes:* ${totalCmds}\n` +
          `│ 👥 *Membres:* ${memberCount}\n` +
          `│ 🕐 *Heure:* ${time}\n` +
          `│ 📅 *Date:* ${date}\n` +
          `╰─────────────────────\n\n` +
          `💡 Tape *${BOT_PREFIX}menu* pour voir toutes les commandes.\n\n` +
          `> *${BOT_FOOTER}*`;

        try {
          const imgBuf = await axios.get(BOT_PIC, { responseType: 'arraybuffer', timeout: 8000 })
            .then(r => Buffer.from(r.data)).catch(() => null);

          if (imgBuf) {
            await sock.sendMessage(id, {
              image: imgBuf,
              caption: welcomeText,
              mentions: [jid],
            });
          } else {
            await sock.sendMessage(id, {
              text: welcomeText,
              mentions: [jid],
            });
          }
        } catch (_) {
          await sock.sendMessage(id, {
            text: welcomeText,
            mentions: [jid],
          });
        }
      }
    } catch (err) {
      console.error('[Worker] Welcome message error:', err.message);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;

      const msgId = msg.key.id;
      if (processedMsgIds.has(msgId)) continue;
      processedMsgIds.add(msgId);
      setTimeout(() => processedMsgIds.delete(msgId), 60000);

      const remoteJid = msg.key.remoteJid || '';

      // Extract command body — works for text, quoted text, and image/video captions
      const body =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        '';

      if (!body.startsWith(BOT_PREFIX)) continue;

      const parts  = body.slice(BOT_PREFIX.length).trim().split(/\s+/);
      const cmdRaw = parts[0]?.toLowerCase() || '';
      const args   = parts.slice(1);
      const q      = args.join(' ');

      const cmd = CMDS[cmdRaw];
      if (!cmd) continue;

      try {
        try { await sock.readMessages([msg.key]); } catch (_) {}
        await cmd.fn(sock, msg, args, q);
      } catch (err) {
        const isRateLimit = err.message?.includes('rate-overlimit') || err.message?.includes('rate_overlimit');
        const isConnClosed = err.message?.includes('Connection Closed') || err.message?.includes('connection');
        if (!isRateLimit && !isConnClosed) {
          console.error(`[Worker] Command error [${cmdRaw}]:`, err.message);
          try { await reply(sock, msg, `🚨 Erreur commande: ${err.message}`); } catch (_) {}
        }
      }
    }
  });
}

startBot().catch(err => {
  console.error('[Worker] Fatal error:', err.message);
  process.send({ type: 'disconnected', data: { error: err.message } });
  process.exit(1);
});
