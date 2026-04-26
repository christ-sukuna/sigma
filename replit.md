# SIGMA MDX - WhatsApp Bot Builder Platform

## Overview
A web-based platform for configuring and generating customized WhatsApp bots based on **Atassa-MD** (github.com/mauricegift/atassa). Session generation uses the gifted-session approach (github.com/mauricegift/gifted-session). Uses the Baileys library for WhatsApp connectivity.

## Tech Stack
- **Backend:** Node.js + Express
- **Frontend:** Vanilla HTML/CSS/JavaScript (served as static files)
- **WhatsApp:** @whiskeysockets/baileys
- **Session:** express-session (in-memory)
- **ZIP generation:** archiver
- **Package Manager:** npm

## Project Structure
```
server/
  index.js          - Express app entry point
  config.js         - Configuration (reads from env vars)
  routes/           - API endpoints (bot, github, deploy, session)
  services/         - Core logic (generator, zipper, shared-bot)
  middleware/       - Rate limiting, validation
public/
  index.html        - Landing page
  builder.html      - Bot configuration UI
  session.html      - WhatsApp QR authentication
  shared.html       - Shared bot sessions
  css/              - Stylesheets
  js/               - Frontend scripts
bot-template/       - Atassa-MD source (github.com/mauricegift/atassa) — patched for SIGMA-MDX branding
```

## Running the App
- **Workflow:** "Start application" — runs `node server/index.js`
- **Port:** 5000 (configured via PORT env var)

## Key Environment Variables
- `PORT` - Server port (set to 5000)
- `NODE_ENV` - development/production
- `SESSION_SECRET` - Secret for express-session (stored as Replit secret)
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` - Optional GitHub OAuth
- `BOT_SOURCE_DIR` - Path to bot source template (optional, defaults to ../SIGMA-MDX-repo)
- `MAX_SHARED_SESSIONS` - Max concurrent shared WhatsApp sessions (default: 20)
- `SESSION_TTL_HOURS` - Session expiry (default: 24)

## Shared Bot Worker (server/workers/bot-worker.js)
Full atassa-compatible command implementation using:
- `@whiskeysockets/baileys` for the WhatsApp connection
- `GiftedTechApi` (`https://api.giftedtech.co.ke`) + `GiftedApiKey` for all external features
- 32 command groups with 50+ aliases covering: General, AI, Downloader, Search, Tools, Converter, Owner, Group
- Same prefix `.` and same GiftedTechApi endpoints as the atassa bot

Commands include: `.menu`, `.list`, `.ping`, `.alive`, `.uptime`, `.repo`, `.ai`, `.imagine`, `.ytmp3`, `.ytmp4`, `.tiktok`, `.instagram`, `.facebook`, `.google`, `.yt`, `.weather`, `.news`, `.fetch`, `.ssweb`, `.translate`, `.ebinary`, `.debinary`, `.ebase`, `.dbase`, `.remini`, `.domain`, `.sticker`, `.toimg`, `.owner`, `.getpp`, `.vv`, `.getgcpp`

## Features
- Configure bot settings (name, prefix, owner, auto-responses)
- Authenticate with WhatsApp via QR code
- Generate and download a customized bot ZIP package
- Optional GitHub integration for repository creation/deployment
- Shared bot with full atassa-compatible commands (no hosting required)
- **VPS Deployment:** Deploy personalized bots to VPS (185.214.134.21) via SSH/SFTP, manage via PM2
- **User Authentication:** JWT-based auth (jsonwebtoken + bcryptjs), login/register at `/login.html`
- **Notification System:** In-app bell for bot disconnect/error events, persisted in MongoDB
- **VPS Status Page:** Real-time RAM, disk, PM2 process monitoring at `/status.html`
- **Bot Limit:** Free tier = 1 active bot per user (maxBots field on User model)
- **Shared node_modules cache:** `/opt/sigma-bots/_base/` pre-installs deps; new bots use `cp -al` (instant)

## VPS Deployment System
- **VPS:** 185.214.134.21 (Ubuntu 22.04, Node v22, PM2 v6, 190GB disk, 11GB RAM)
- **Bot directory:** `/opt/sigma-bots/{deployId}/`
- **Ports:** 10000–10149 per bot, tracked in MongoDB VpsSession
- **PM2 process name:** `sigma-{deployId}`
- **Callback webhook:** Bots POST to `GET /api/vps/callback/:deployId` for paircode/connected/disconnected events

## Authentication
- JWT tokens stored in localStorage as `sigma_token`
- Routes protected: `POST /api/vps/deploy`, `GET /api/vps/sessions`, bot management endpoints
- Token expiry: 30 days
- JWT_SECRET env var (default: sigma-mdx-jwt-2026)

## New DB Models
- `User` — email, passwordHash, phone, plan, maxBots
- `VpsSession` — deployId, userId, botName, phoneNumber, status, pairCode, port, config, healthAlert{type,msg,at}, sessionBackupAt
- `Notification` — userId, type, title, message, deployId, botName, read

## Health Monitoring & Alerts
- Health check runs every 5 min (cron in vps-deploy.service.js)
- Checks: PM2 process offline → marks `error`, sends email + in-app notif
- Checks: RAM > 300MB or PM2 restarts > 3 → writes `healthAlert` to DB, sends email + notif (max 1 alert per 30 min)
- Health alert badge shown on bot card when `healthAlert.type` is set
- Alert auto-clears when bot returns to healthy RAM/restart levels

## Session Backup & Restore
- On `connected` callback: bot's `creds.json` is downloaded from VPS (8s delay) and saved to `server/backups/<deployId>.json`
- `POST /api/vps/restore-session/:deployId` — pushes backup to VPS and restarts PM2
- Restore button shown on card when `sessionBackupAt` is set and status is not `connected`

## Disconnection & Repair Flow
- On `disconnected` callback: in-app notification + email (nodemailer via SMTP_* env vars)
- Bot card shows red repair banner + `🔗 Repairer` button when status is `disconnected` or `error`
- `POST /api/vps/repair/:deployId` — runs full redeploy flow (same as redeploy), shows progress console
- Email service: `server/services/email.service.js` — reads SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT, SMTP_FROM env vars; gracefully skips if not configured

## Security & Architecture Notes
- Rate limits: `/api/bot` → 15 req/hr, `/api/session` → 5 req/10min, `/api/deploy` → 3 req/15min
- Sessions are stored in memory only (lost on restart); token-store.js can be swapped for Redis
- BOT_SOURCE_DIR: if set and the repo exists, uses real SIGMA-MDX source; otherwise falls back to the built-in `bot-template/` directory which is always available. Bot generation works out of the box.
- All npm dependencies are up to date (0 known vulnerabilities as of 2026-04-16)
- WhatsApp message builder URL is dynamic (uses REPLIT_DEV_DOMAIN or request host)
- Google Fonts loaded via `<link>` tags (not CSS @import) for faster first paint

## Design
- Theme: dark (#060912), neon green (#00e676) + purple (#a78bfa) gradient
- Typography: Space Grotesk (headings), Inter (body)
- Glass morphism cards with backdrop-filter blur
- Form base styles (.form-input, .form-select, .form-textarea) in main.css (global)
