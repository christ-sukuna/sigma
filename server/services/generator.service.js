const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { sanitizeToken, sanitizeIdentifier } = require('../utils/sanitize');

const BOT_TEMPLATE_DIR = path.join(__dirname, '../../bot-template');

function toSlug(name) {
  return (name || 'my-bot')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'my-bot';
}

function shouldExclude(relPath, slug, plugSlug) {
  const normalized = relPath.replace(/\\/g, '/');
  const patterns = [
    '.git',
    'node_modules',
    `${slug}/temp`,
    `${slug}/session`,
    `${slug}/database/database.db`,
    '*.log',
  ];
  return patterns.some(pat => {
    if (pat.includes('*')) return normalized.endsWith(pat.replace('*', ''));
    return normalized === pat || normalized.startsWith(pat + '/');
  });
}

async function collectFiles(dir, baseDir = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = {};
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(baseDir, abs).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      Object.assign(result, await collectFiles(abs, baseDir));
    } else {
      result[rel] = abs;
    }
  }
  return result;
}

async function readFileContent(absPath) {
  const TEXT_EXTS = [
    '.js', '.json', '.md', '.txt', '.env', '.yml', '.yaml',
    '.html', '.css', '.sh', '.gitignore', '.dockerignore', '.ts',
    '.toml', '.lock', '.xml',
  ];
  const ext = path.extname(absPath).toLowerCase();
  const isText = TEXT_EXTS.includes(ext) || !ext;
  const buf = await fs.readFile(absPath);
  return isText
    ? { content: buf.toString('utf8'), encoding: 'utf8' }
    : { content: buf.toString('base64'), encoding: 'base64' };
}

function applyFolderRename(content, slug, plugSlug, botName) {
  return content
    .replace(/require\((['"])\.\/gift\//g, `require($1./${slug}/`)
    .replace(/require\((['"])\.\/gift\1\)/g, `require($1./${slug}$1)`)
    .replace(/require\((['"])\.\.\/gift\//g, `require($1../${slug}/`)
    .replace(/require\((['"])\.\.\/gift\1\)/g, `require($1../${slug}$1)`)
    .replace(/express\.static\(\s*['"]gift['"]\s*\)/g, `express.static('${slug}')`)
    .replace(/__dirname\s*\+\s*["']\/gift\/gifted\.html["']/g,
      `__dirname + '/${slug}/${slug}.html'`)
    .replace(/path\.join\(\s*__dirname\s*,\s*["']gift["']\s*,\s*["']session["']\s*\)/g,
      `path.join(__dirname, '${slug}', 'session')`)
    .replace(/path\.join\(\s*__dirname\s*,\s*["']gifted["']\s*\)/g,
      `path.join(__dirname, '${plugSlug}')`)
    .replace(/\.\/gift\/database\/database\.db/g, `./${slug}/database/database.db`)
    .replace(/["']gift\/database\/database\.db["']/g, `"${slug}/database/database.db"`)
    .replace(/["']gift\/session\/session\.db["']/g, `"${slug}/session/session.db"`)
    .replace(/gift\/session\//g, `${slug}/session/`)
    .replace(/gift\/database\/\*\.db/g, `${slug}/database/*.db`)
    .replace(/"atassa-md-main\.zip"/g, `"${slug}-main.zip"`)
    .replace(/"atassa-main"/g, `"${slug}-main"`)
    .replace(/atassa-md/g, slug)
    .replace(/atassa-db/g, `${slug}-db`)
    .replace(/\batassa\b/g, slug)
    .replace(/name: atassa/g, `name: ${slug}`)
    .replace(/databaseName: atassa/g, `databaseName: ${slug}`)
    .replace(/user: atassa/g, `user: ${slug}`)
    .replace(/"Powered by Gifted Tech"/g, `"Powered by ${botName}"`)
    .replace(/'Powered by Gifted Tech'/g, `'Powered by ${botName}'`)
    .replace(/➮Fᴏᴜɴᴅᴇʀ - Gifted Tech/g, `➮Fᴏᴜɴᴅᴇʀ - ${botName}`)
    .replace(/Developed by GiftedTech/gi, `Developed by ${botName}`)
    .replace(/pattern:\s*["']giftedai["']/g, `pattern: "botai"`)
    .replace(/pattern:\s*["']giftedcdn["']/g, `pattern: "cdn"`)
    .replace(/'giftedcdn'/g, `'cdn'`)
    .replace(/"giftedcdn"/g, `"cdn"`)
    .replace(/BOT_REPO:\s*["']mauricegift\/atassa["']/g,
      `BOT_REPO: process.env.BOT_REPO || ""`)
    .replace(/["']mauricegift\/[^'"]*["']/g, `""`)
    .replace(/mauricegift\//g, '')
    .replace(/Gifted Tech/g, botName)
    .replace(/GiftedTech(?!Api)/g, botName)
    .replace(/Chat with Gifted AI assistant/gi, `Chat with ${botName} AI assistant`)
    .replace(/description:\s*["']([^"']*)[Gg]ifted([^"']*)["']/g,
      (_, pre, post) => `description: "${pre}${botName}${post}"`)
    .replace(/Gifted Md\b/gi, botName)
    .replace(/"GIFTED-TECH"/g, `"${botName}"`)
    .replace(/'GIFTED-TECH'/g, `'${botName}'`)
    .replace(/"ATASSA MD"/g, `"${botName}"`)
    .replace(/'ATASSA MD'/g, `'${botName}'`)
    .replace(/ATASSA MD/g, botName)
    .replace(/©2025 𝐀𝐓𝐀𝐒𝐒𝐀-𝐌𝐃 𝐕𝟓/g, `©2025 ${botName}`)
    .replace(/𝐀𝐓𝐀𝐒𝐒𝐀-𝐌𝐃 User/g, `${botName} User`)
    .replace(/𝐀𝐓𝐀𝐒𝐒𝐀-𝐌𝐃/g, botName)
    .replace(/Welcome to Gifted Md/gi, `Welcome to ${botName}`)
    .replace(/https:\/\/files\.giftedtech\.co\.ke\/image\/[^\s"')]+/g,
      'https://files.catbox.moe/iw9ar0.jpg')
    .replace(/https:\/\/telegra\.ph\/file\/[^\s"')]+/g,
      'https://files.catbox.moe/iw9ar0.jpg')
    .replace(/"GIFTED MD"/g, `"${botName}"`)
    .replace(/'GIFTED MD'/g, `'${botName}'`)
    .replace(/path\.join\(process\.cwd\(\),\s*['"]gift\/session['"]/g,
      `path.join(process.cwd(), '${slug}/session'`);
}

function generateEnv(cfg) {
  const botName   = sanitizeIdentifier(cfg.botName || 'MY-BOT');
  const prefix    = sanitizeToken(cfg.prefix || '.');
  const ownerNum  = sanitizeToken(cfg.ownerNumber || '');
  const ownerName = sanitizeToken(cfg.ownerName || 'Owner');
  const sessionId = sanitizeToken(cfg.sessionId || '');
  const mode      = ['public', 'private', 'inbox', 'group'].includes(cfg.mode) ? cfg.mode : 'public';
  const tz        = sanitizeToken(cfg.timezone || 'Africa/Nairobi');
  const now       = new Date().toISOString().split('T')[0];

  return [
    `# ${botName} — Environment Variables`,
    `# Generated by SIGMA MDX Builder on ${now}`,
    ``,
    `SESSION_ID=${sessionId}`,
    ``,
    `BOT_NAME=${botName}`,
    `PREFIX=${prefix}`,
    `OWNER_NUMBER=${ownerNum}`,
    `OWNER_NAME=${ownerName}`,
    ``,
    `MODE=${mode}`,
    `TIME_ZONE=${tz}`,
    ``,
    `AUTO_READ_STATUS=true`,
    `AUTO_LIKE_STATUS=true`,
    ``,
    `# Bot profile picture (URL)`,
    `BOT_PIC=https://files.catbox.moe/iw9ar0.jpg`,
    ``,
    `# GitHub repo for bot updates (format: username/reponame)`,
    `BOT_REPO=`,
    ``,
    `# PostgreSQL connection (optional — fallback to local SQLite)`,
    `DATABASE_URL=`,
  ].join('\n') + '\n';
}

function generatePackageJson(cfg, slug) {
  const botName   = sanitizeIdentifier(cfg.botName || 'my-bot');
  const ownerName = sanitizeToken(cfg.ownerName || 'Owner');
  const desc      = sanitizeToken(cfg.description || `${botName} — WhatsApp Bot powered by SIGMA MDX`);

  const pkg = {
    name: slug,
    version: '1.0.0',
    description: desc,
    main: './index.js',
    type: 'commonjs',
    scripts: {
      dev: 'node index.js',
      start: `pm2 start index.js --deep-monitoring --attach --name ${slug}`,
      stop: `pm2 stop ${slug}`,
      restart: `pm2 restart ${slug} && pm2 logs`,
      stash: 'git stash && git stash drop',
    },
    keywords: ['whatsapp-bot', 'sigma-mdx', slug],
    author: ownerName,
    license: 'MIT',
    dependencies: {
      '@ffmpeg-installer/ffmpeg': '*',
      '@hapi/boom': '*',
      '@vitalets/google-translate-api': '^9.2.0',
      acrcloud: '*',
      'adm-zip': '*',
      'audio-decode': '^2.2.3',
      axios: '^1.2.5',
      'better-sqlite3': '^12.6.2',
      'body-parser': 'latest',
      buffer: '*',
      dotenv: '*',
      express: '^4.19.2',
      'ffmpeg-static': '*',
      'file-type': '17.1.6',
      'fluent-ffmpeg': '*',
      'form-data': '^4.0.1',
      fs: '^0.0.1-security',
      'fs-extra': '^11.1.0',
      'gifted-baileys': '2.5.8',
      'gifted-btns': '^1.0.2',
      'gifted-dls': '*',
      'google-tts-api': '*',
      jimp: '*',
      'mime-types': '^2.1.35',
      'moment-timezone': '^0.5.45',
      'node-cache': '^5.1.2',
      'node-fetch': '^3.3.2',
      path: 'latest',
      pg: '*',
      pino: '^7.0.5',
      pm2: 'latest',
      'qrcode-terminal': '^0.12.0',
      sequelize: '*',
      sharp: '0.32.6',
      sqlite3: '5.1.7',
      stream: '*',
      util: '*',
      'wa-sticker-formatter': '*',
    },
  };

  return JSON.stringify(pkg, null, 2) + '\n';
}

async function generateBot(cfg, emit) {
  const log = emit || (() => {});

  if (!fsSync.existsSync(BOT_TEMPLATE_DIR)) {
    throw new Error('Bot template directory not found. Please ensure bot-template/ exists.');
  }

  const slug     = toSlug(cfg.botName || 'my-bot');
  const plugSlug = `${slug}-plugins`;
  const botName  = sanitizeIdentifier(cfg.botName || 'MY-BOT');

  log('info', `✦ Démarrage de la génération pour "${botName}"...`);
  await new Promise(r => setTimeout(r, 120));

  log('info', '📂 Lecture du template bot...');
  const fileIndex = await collectFiles(BOT_TEMPLATE_DIR);
  const totalFiles = Object.keys(fileIndex).length;
  log('info', `   ${totalFiles} fichiers trouvés dans le template.`);
  await new Promise(r => setTimeout(r, 80));

  log('info', `✍️  Application des paramètres (nom: ${botName}, préfixe: ${cfg.prefix || '.'})...`);
  await new Promise(r => setTimeout(r, 100));

  const fileMap = {};
  let processed = 0;

  for (const [rel, abs] of Object.entries(fileIndex)) {
    if (rel === '.env' || rel.startsWith('node_modules/')) continue;

    let newRel = rel;
    if (rel.startsWith('gift/')) {
      newRel = rel.replace(/^gift\//, `${slug}/`);
      if (newRel === `${slug}/gifted.html`) {
        newRel = `${slug}/${slug}.html`;
      }
    } else if (rel.startsWith('gifted/')) {
      newRel = rel.replace(/^gifted\//, `${plugSlug}/`);
    }

    if (shouldExclude(newRel, slug, plugSlug)) continue;

    const file = await readFileContent(abs);

    if (file.encoding === 'utf8') {
      file.content = applyFolderRename(file.content, slug, plugSlug, botName);
    }

    fileMap[newRel] = file;
    processed++;

    if (processed % 20 === 0) {
      log('info', `   Traitement... ${processed}/${totalFiles} fichiers`);
      await new Promise(r => setTimeout(r, 30));
    }
  }

  log('ok', `✅ ${processed} fichiers traités et renommés.`);
  await new Promise(r => setTimeout(r, 80));

  log('info', '📄 Génération du fichier .env avec votre configuration...');
  fileMap['.env'] = { content: generateEnv(cfg), encoding: 'utf8' };
  await new Promise(r => setTimeout(r, 80));

  log('info', '📦 Génération du package.json...');
  fileMap['package.json'] = { content: generatePackageJson(cfg, slug), encoding: 'utf8' };

  fileMap['.gitignore'] = {
    content: `node_modules/\n${slug}/session/\n${slug}/database/*.db\n.env\n*.log\n`,
    encoding: 'utf8',
  };

  try {
    const rawAppJson = JSON.parse(fileMap['app.json']?.content || '{}');
    rawAppJson.name = slug;
    rawAppJson.description = sanitizeToken(cfg.description || `${botName} — WhatsApp Bot`);
    rawAppJson.logo = '';
    rawAppJson.keywords = ['whatsapp-bot', 'sigma-mdx', slug];
    fileMap['app.json'] = { content: JSON.stringify(rawAppJson, null, 2) + '\n', encoding: 'utf8' };
  } catch (_) {}

  const botPicUrl = 'https://files.catbox.moe/iw9ar0.jpg';
  fileMap[`${slug}/${slug}.html`] = {
    encoding: 'utf8',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${botName} | WABOT</title>
    <meta name="description" content="${botName} | WABOT">
    <meta property="og:title" content="${botName} | WABOT">
    <meta property="og:description" content="${botName} is Active and Running">
    <meta property="og:image" content="${botPicUrl}">
    <link rel="icon" href="${botPicUrl}">
    <style>
        body {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background-color: #121212;
            color: white;
            font-family: Arial, sans-serif;
            flex-direction: column;
        }
        .glow {
            font-size: 2em;
            color: #fff;
            text-align: center;
            animation: glowing 10s infinite;
        }
        @keyframes glowing {
            0%   { text-shadow: 0 0 10px #ff0000, 0 0 30px #ff0000; }
            20%  { text-shadow: 0 0 10px #ff9900, 0 0 30px #ff9900; }
            40%  { text-shadow: 0 0 10px #ffff00, 0 0 30px #ffff00; }
            60%  { text-shadow: 0 0 10px #00ff00, 0 0 30px #00ff00; }
            80%  { text-shadow: 0 0 10px #00ffff, 0 0 30px #00ffff; }
            100% { text-shadow: 0 0 10px #ff0000, 0 0 30px #ff0000; }
        }
        .developer { font-size: 1.2em; margin-top: 20px; color: #aaa; }
    </style>
</head>
<body>
    <div class="glow">✅ DEPLOYMENT SUCCESSFUL,<br>${botName} CONNECTED!</div>
    <br>
    <div class="current-info" id="Info">Loading...</div>
    <div class="developer">Powered by ${botName}</div>
</body>
<script>
    function updateInfo() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2,'0');
        const m = String(now.getMinutes()).padStart(2,'0');
        const s = String(now.getSeconds()).padStart(2,'0');
        const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        document.getElementById('Info').textContent =
            \`Time: \${h}:\${m}:\${s} | \${now.toLocaleDateString()} | \${days[now.getDay()]}\`;
    }
    setInterval(updateInfo, 1000);
    updateInfo();
</script>
</html>
`,
  };

  const desc = sanitizeToken(cfg.description || `${botName} — WhatsApp Bot powered by SIGMA MDX`);
  fileMap['README.md'] = {
    content: [
      `# ${botName}`,
      ``,
      `> ${desc}`,
      ``,
      `**Généré par [SIGMA MDX Builder](https://sigma-mdx.replit.app)**`,
      ``,
      `## Démarrage rapide`,
      ``,
      `> ✅ Votre \`.env\` est **déjà configuré** avec votre Session ID, préfixe et numéro propriétaire.`,
      ``,
      `\`\`\`bash`,
      `npm install`,
      `npm run dev`,
      `\`\`\``,
      ``,
      `Pour un déploiement en production (VPS, Railway, Render…) :`,
      ``,
      `\`\`\`bash`,
      `npm install`,
      `npm start`,
      `\`\`\``,
    ].join('\n') + '\n',
    encoding: 'utf8',
  };

  log('info', '🗜️  Préparation du ZIP...');
  await new Promise(r => setTimeout(r, 100));

  const fileCount = Object.keys(fileMap).length;
  log('ok', `✅ Bot prêt — ${fileCount} fichiers packagés.`);
  await new Promise(r => setTimeout(r, 80));

  log('done', `🚀 Téléchargement de "${botName}.zip" en cours...`);

  return fileMap;
}

module.exports = { generateBot };
