<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>
<h1 align="center"> 𝐀𝐓𝐀𝐒𝐒𝐀-𝐌𝐃 𝐕𝐄𝐑𝐒𝐈𝐎𝐍 𝟓.𝟎.𝟎 </h1>

- Bot is Safe for Heroku so don't ask more questions


<details>
<summary>NOTICE!!! (TAP TO READ)</summary>

- For Vps/Panel Deployment You must download the zip from panel sections or from below link else your youtube downloaders wont work on panel.

<a href="https://github.com/mauricegift/atassa/archive/refs/heads/main.zip"><img src="https://img.shields.io/badge/DOWNLOAD%20ZIP-yellow" alt="Panel Zip File" width="150"></a>
  
</details>

<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>

  <p align="center">
<a href="https://github.com/mauricegift"><img title="GITHUB" src="https://img.shields.io/badge/GITHUB-GIFTED TECH-red.svg?style=for-the-badge&logo=github"></a>
<p/>
<p align="center">
<a href="https://github.com/mauricegift?tab=followers"><img title="Followers" src="https://img.shields.io/github/followers/mauricegift?label=Followers&style=social"></a>
<a href="https://github.com/mauricegift/atassa/stargazers/"><img title="STARS" src="https://img.shields.io/github/stars/mauricegift/atassa?&style=social"></a>
<a href="https://github.com/mauricegift/atassa/network/members"><img title="Forks" src="https://img.shields.io/github/forks/mauricegift/atassa?style=social"></a>
<a href="https://github.com/mauricegift/atassa/watchers"><img title="Watching" src="https://img.shields.io/github/watchers/mauricegift/atassa?label=Watching&style=social"></a>

<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>
  
## 𝟏. 𝐒𝐄𝐓 𝐔𝐏:

**👇FORK REPO(A MUST)**
<details>
<summary>𝗖𝗟𝗜𝗖𝗞 𝗛𝗘𝗥𝗘</summary>
  
- This is essential for you to obtain your own safe forked deployable repo especially heroku users.

<a href="https://github.com/mauricegift/atassa/fork"><img src="https://img.shields.io/badge/CLICK%20HERE-purple" alt="FORK GIFTED-MD" width="150"></a>
</details>

<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>

### 𝟐. 𝐋𝐈𝐍𝐊 𝐖𝐈𝐓𝐇 𝐖𝐇𝐀𝐓𝐒𝐀𝐏𝐏

<details>
<summary>GET YOUR SESSION_ID</summary>
- Session ID must start with **SIGMA-MDX~**
- Generate your session ID at your SIGMA-MDX builder platform.
</details>

### 𝟑. 𝐃𝐄𝐏𝐋𝐎𝐘𝐌𝐄𝐍𝐓 𝐒𝐄𝐂𝐓𝐈𝐎𝐍:

**(A) HEROKU DEPLOYMENT**

<details>
<summary>TAP TO OPEN</summary>
<a href="https://signup.heroku.com/login"><img src="https://img.shields.io/badge/HEROKU%20SIGNUP-white" alt="Heroku Signup" width="150"></a>
  
<a href="https://dashboard.heroku.com/new?template=https://github.com/mauricegift/atassa"><img src="https://img.shields.io/badge/DEPLOY%20NOW-red" alt="Deploy on Heroku" width="150"></a>

- PostgreSQL is **auto-provisioned** via the `heroku-postgresql:essential-0` addon — no manual setup needed.
- All environment variables are pre-filled from `app.json`. Just add your `SESSION_ID`.
</details>

<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>


**(C) RENDER DEPLOYMENT**
<details>
<summary>TAP TO OPEN</summary>
<a href="https://dashboard.render.com/signup"><img src="https://img.shields.io/badge/RENDER%20SIGNUP-green" alt="Render Signup" width="150"></a>

<a href="https://render.com/deploy"><img src="https://img.shields.io/badge/DEPLOY%20NOW-blue" alt="Deploy on Render" width="150"></a>

<a href="https://youtu.be/TVu8CQPPliM?feature=shared"><img src="https://img.shields.io/badge/WATCH%20TUTORIAL-red" alt="Render Tutorial" width="150"></a>

**Steps:**
1. Fork this repo, then go to [render.com](https://render.com) and sign in.
2. Click **New → Blueprint** and connect your forked repo.
3. Render reads `render.yaml` and **auto-provisions a free PostgreSQL** database linked to your bot.
4. Fill in `SESSION_ID` when prompted. All other vars have defaults.
5. Click **Apply** — done.

> **Note:** Render's free PostgreSQL lasts 90 days. After that, use a free external DB from [neon.tech](https://neon.tech) and paste the URL as `DATABASE_URL`. If left blank the bot falls back to SQLite automatically.
</details>

<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>

**(D) RAILWAY DEPLOYMENT**
<details>
<summary>TAP TO OPEN</summary>
<a href="https://railway.app/login"><img src="https://img.shields.io/badge/RAILWAY%20SIGNUP-black" alt="Railway Signup" width="150"></a>

<a href="https://railway.app/new/template"><img src="https://img.shields.io/badge/DEPLOY%20NOW-purple" alt="Deploy on Railway" width="150"></a>

**Steps:**
1. Fork this repo and go to [railway.app](https://railway.app).
2. Click **New Project → Deploy from GitHub repo** and select your fork.
3. In your project dashboard, click **+ New → Database → PostgreSQL**.
4. Railway auto-links `DATABASE_URL` to your service — no copy-paste needed.
5. Go to your service **Variables** tab and add:
   - `SESSION_ID` → your `SIGMA-MDX~` session ID
   - `MODE` → `public`
   - `TIME_ZONE` → e.g. `Africa/Nairobi`
6. Railway detects the `Dockerfile` and `railway.toml` automatically and deploys.
</details>

<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>

**(E) KOYEB DEPLOYMENT**
<details>
<summary>TAP TO OPEN</summary>
<a href="https://app.koyeb.com/auth/signup"><img src="https://img.shields.io/badge/KOYEB%20SIGNUP-purple" alt="Koyeb Signup" width="150"></a>

<a href="https://app.koyeb.com/services/deploy/?type=git&repository=github.com%2Fmauricegift%2Fatassa&branch=main&name=atassa-md&builder=dockerfile&env%5BSESSION_ID%5D=your%20sessionid%20here"><img src="https://img.shields.io/badge/DEPLOY%20NOW-black" alt="Deploy on Koyeb" width="150"></a>

**Steps:**
1. Fork this repo and sign in to [koyeb.com](https://koyeb.com).
2. Click **Deploy Now** above (or Create App → GitHub → select your fork).
3. Koyeb has no built-in database — get a **free PostgreSQL** from one of:
   - [neon.tech](https://neon.tech) ← recommended
   - [supabase.com](https://supabase.com)
4. Paste the connection URL as `DATABASE_URL` in your Koyeb service environment variables.
5. Set `SESSION_ID`, `MODE`, `TIME_ZONE` in the same env vars section.
6. Koyeb uses the `Dockerfile` and `koyeb.yaml` config automatically.

> **Tip:** If you skip `DATABASE_URL` the bot will use SQLite on the local disk — data resets on each redeploy. Use a remote DB for persistence.
</details>

<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>

**(F) BOT HOSTING PANEL🔥(DISCORD) DEPLOYMENT**
<details>
<summary>TAP TO OPEN</summary>
<a href="https://github.com/mauricegift/atassa/archive/refs/heads/main.zip"><img src="https://img.shields.io/badge/DOWNLOAD%20FILES-yellow" alt="Bot Hosting Files" width="150"></a>

<a href="https://bot-hosting.net/?aff=1259151615210819614"><img src="https://img.shields.io/badge/SIGNUP-gold" alt="Bot Hosting Signup" width="150"></a>

<a href="https://bot-hosting.net/?aff=1259151615210819614"><img src="https://img.shields.io/badge/DEPLOY%20NOW-orange" alt="Bot Hosting Deploy" width="150"></a>

<a href="https://youtu.be/1BwOqHhnFGs?feature=shared"><img src="https://img.shields.io/badge/WATCH%20TUTORIAL-red" alt="Bot Hosting Tutorial" width="150"></a>
</details>

<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>

**(G) PRINCE TECH HOST**
<details>
<summary>TAP TO OPEN</summary>
<a href="http://host.princetechn.com/deploy-bot"><img src="https://img.shields.io/badge/PRINCE%20HOST%20SIGNUP-blue" alt="Prince Tech Host Signup" width="150"></a>

<a href="http://host.princetechn.com/deploy-bot"><img src="https://img.shields.io/badge/DEPLOY%20NOW-orange" alt="Deploy on Prince Host" width="150"></a>

**Steps:**
1. Download the ZIP below and extract it.

<a href="https://github.com/mauricegift/atassa/archive/refs/heads/main.zip"><img src="https://img.shields.io/badge/DOWNLOAD%20ZIP-yellow" alt="Download ZIP" width="150"></a>

2. Go to [host.princetechn.com/deploy-bot](http://host.princetechn.com/deploy-bot) and sign up / log in.
3. Create a new bot instance and upload the extracted ZIP.
4. In the environment/startup settings, set:
   - `SESSION_ID` → your `SIGMA-MDX~` session ID
   - `MODE` → `public`
   - `TIME_ZONE` → e.g. `Africa/Nairobi`
5. Start the bot. SQLite is used automatically if no `DATABASE_URL` is set.
</details>

<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>

**(H) BWM XMD HOST**
<details>
<summary>TAP TO OPEN</summary>
<a href="http://main.bwmxmd.co.ke/deployment"><img src="https://img.shields.io/badge/BWM%20HOST%20SIGNUP-teal" alt="BWM XMD Host Signup" width="150"></a>

<a href="http://main.bwmxmd.co.ke/deployment"><img src="https://img.shields.io/badge/DEPLOY%20NOW-cyan" alt="Deploy on BWM Host" width="150"></a>

**Steps:**
1. Download the ZIP and extract it.

<a href="https://github.com/mauricegift/atassa/archive/refs/heads/main.zip"><img src="https://img.shields.io/badge/DOWNLOAD%20ZIP-yellow" alt="Download ZIP" width="150"></a>

2. Go to [main.bwmxmd.co.ke/deployment](http://main.bwmxmd.co.ke/deployment) and create an account.
3. Upload the extracted ZIP to a new bot instance.
4. Set these environment variables on the panel:
   - `SESSION_ID` → your `SIGMA-MDX~` session ID
   - `MODE` → `public`
   - `TIME_ZONE` → e.g. `Africa/Nairobi`
5. Hit start — SQLite kicks in automatically if no external DB is configured.
</details>

<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>

**(I) SILVA HOST**
<details>
<summary>TAP TO OPEN</summary>
<a href="http://host.silvatech.co.ke"><img src="https://img.shields.io/badge/SILVA%20HOST%20SIGNUP-darkgreen" alt="Silva Host Signup" width="150"></a>

<a href="http://host.silvatech.co.ke"><img src="https://img.shields.io/badge/DEPLOY%20NOW-green" alt="Deploy on Silva Host" width="150"></a>

**Steps:**
1. Download the ZIP and extract it.

<a href="https://github.com/mauricegift/atassa/archive/refs/heads/main.zip"><img src="https://img.shields.io/badge/DOWNLOAD%20ZIP-yellow" alt="Download ZIP" width="150"></a>

2. Visit [host.silvatech.co.ke](http://host.silvatech.co.ke) and register / log in.
3. Create a new bot and upload the extracted project ZIP.
4. Configure these variables in your panel settings:
   - `SESSION_ID` → your `SIGMA-MDX~` session ID
   - `MODE` → `public`
   - `TIME_ZONE` → e.g. `Africa/Nairobi`
5. Start the instance. The bot auto-falls back to SQLite if `DATABASE_URL` is not set.
</details>

<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>

**(J) VPS / SELF-HOSTED DEPLOYMENT**
<details>
<summary>TAP TO OPEN</summary>

> Requires a Linux VPS (Ubuntu 20.04+ recommended) with Node.js 20+ and Git installed.

**1. Clone the repo**
```bash
git clone https://github.com/mauricegift/atassa.git
cd atassa
```

**2. Install dependencies**
```bash
npm install
```

**3. Set environment variables**

Create a `.env` file in the project root:
```env
SESSION_ID=SIGMA-MDX~your_session_id_here
MODE=public
TIME_ZONE=Africa/Nairobi
AUTO_LIKE_STATUS=true
AUTO_READ_STATUS=true
DATABASE_URL=              # leave blank to use SQLite, or paste a PostgreSQL URL
```

**4. Install FFmpeg** (required for media commands)
```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y ffmpeg

# CentOS / RHEL
sudo yum install -y ffmpeg
```

**5. Start the bot**
```bash
npm start
```

**6. Keep it running with PM2** (recommended)
```bash
npm install -g pm2
pm2 start index.js --name atassa-md
pm2 save
pm2 startup
```

**7. (Optional) Free PostgreSQL**

If you want a persistent database instead of SQLite, get a free connection URL from [neon.tech](https://neon.tech) or [supabase.com](https://supabase.com) and paste it as `DATABASE_URL` in your `.env`.

**8. Update the bot**
```bash
git pull
npm install
pm2 restart atassa-md
```
</details>

<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>


### 𝟒. 𝐔𝐏𝐃𝐀𝐓𝐄𝐒 

<details>
<summary>𝗖𝗟𝗜𝗖𝗞 𝗛𝗘𝗥𝗘</summary>
  
- **[CONTACT SUPPORT](https://api.giftedtech.co.ke/contact) For More Info**
- **Join [WHATSAPP CHANNEL](https://whatsapp.com/channel/0029Vb6lNd511ulWbxu1cT3A) for Daily Updates.**
- **Check out my [Website Profile](https://me.giftedtech.co.ke) for More Projects.**
</details>

<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>

### 𝟓. 𝐑𝐄𝐏𝐎 𝐒𝐓𝐀𝐑 𝐇𝐈𝐒𝐓𝐎𝐑𝐘 

[![Gifted-Md](https://api.star-history.com/svg?repos=mauricegift/atassa&type=Timeline)](#)

<a><img src='https://i.imgur.com/LyHic3i.gif'/></a>
