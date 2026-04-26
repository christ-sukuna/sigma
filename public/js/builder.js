let currentStep = 1;
let botSessionId = null;
let selectedDelivery = 'zip';
let selectedPlatform = 'railway';
let githubConnected = false;
let pendingDownloadFn = null;

const TOTAL_STEPS = 4;

function updateProgress() {
  const pct = (currentStep / TOTAL_STEPS) * 100;
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = pct + '%';
}

function goStep(n) {
  if (n > currentStep && !validateStep(currentStep)) return;

  document.getElementById(`step-${currentStep}`).classList.remove('active');

  document.querySelectorAll('.step-item').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.remove('active', 'done');
    if (s < n) el.classList.add('done');
  });

  currentStep = n;
  document.getElementById(`step-${currentStep}`).classList.add('active');
  document.querySelector(`.step-item[data-step="${currentStep}"]`).classList.add('active');
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setError(fieldId, show) {
  const fg = document.getElementById(`fg-${fieldId}`);
  if (fg) fg.classList.toggle('has-error', show);
}

function validateStep(step) {
  if (step !== 1) return true;

  const botName = document.getElementById('botName').value.trim();
  const prefix = document.getElementById('prefix').value.trim();
  const ownerName = document.getElementById('ownerName').value.trim();
  const ownerNumber = document.getElementById('ownerNumber').value.trim();

  setError('botName', botName.length < 2 || botName.length > 40);
  setError('prefix', prefix.length < 1 || prefix.length > 5);
  setError('ownerName', !ownerName);
  setError('ownerNumber', !/^\+?[0-9]{7,15}$/.test(ownerNumber));

  return (
    botName.length >= 2 && botName.length <= 40 &&
    prefix.length >= 1 && prefix.length <= 5 &&
    !!ownerName &&
    /^\+?[0-9]{7,15}$/.test(ownerNumber)
  );
}

document.querySelectorAll('.feature-check').forEach(el => {
  el.addEventListener('click', () => {
    el.classList.toggle('checked');
  });
});

function isChecked(key) {
  const el = document.querySelector(`.feature-check[data-key="${key}"]`);
  return el ? el.classList.contains('checked') : false;
}

document.querySelectorAll('.delivery-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.delivery-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    selectedDelivery = opt.dataset.delivery;
    const radio = opt.querySelector('input[type=radio]');
    if (radio) radio.checked = true;
  });
});

document.querySelectorAll('.platform-card').forEach(card => {
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.platform-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedPlatform = card.dataset.platform;
    const radio = card.querySelector('input[type=radio]');
    if (radio) radio.checked = true;
  });
});

document.getElementById('githubConnectBtn').addEventListener('click', () => {
  if (!botSessionId) {
    showAlert('Click "Generate Bot" once first to create your session, then connect GitHub.', 'info');
    return;
  }
  window.location.href = `/api/github/auth?botSessionId=${botSessionId}`;
});

const params = new URLSearchParams(window.location.search);
if (params.get('githubConnected') === '1') {
  botSessionId = params.get('botSessionId') || botSessionId;
  githubConnected = true;
  document.getElementById('github-connect-area').style.display = 'none';
  document.getElementById('github-connected-area').style.display = 'block';
  document.querySelector('[data-delivery="github"]').click();
  window.history.replaceState({}, '', '/builder.html');
}
if (params.get('delivery') === 'vps') {
  const vpsOpt = document.querySelector('[data-delivery="vps"]');
  if (vpsOpt) vpsOpt.click();
  window.history.replaceState({}, '', '/builder.html');
}

function showAlert(message, type = 'error') {
  const el = document.getElementById('alert');
  el.className = `alert alert-${type} show`;
  el.textContent = message;
  if (type !== 'info') setTimeout(() => el.classList.remove('show'), 8000);
}

function buildConfig() {
  return {
    botName:        document.getElementById('botName').value.trim(),
    prefix:         document.getElementById('prefix').value.trim(),
    ownerName:      document.getElementById('ownerName').value.trim(),
    ownerNumber:    document.getElementById('ownerNumber').value.trim(),
    description:    document.getElementById('description').value.trim(),
    stickerName:    document.getElementById('stickerName').value.trim(),
    sessionId:      document.getElementById('sessionId').value.trim(),
    mode:           document.getElementById('mode').value,
    antiDelPath:    document.getElementById('antiDelPath').value,
    aliveImg:       document.getElementById('aliveImg').value.trim(),
    menuImg:        document.getElementById('menuImg').value.trim(),
    autoStatusSeen:  isChecked('autoStatusSeen'),
    autoStatusReact: isChecked('autoStatusReact'),
    autoStatusReply: isChecked('autoStatusReply'),
    autoStatusMsg:   document.getElementById('autoStatusMsg').value.trim(),
    autoReact:       isChecked('autoReact'),
    autoSticker:     isChecked('autoSticker'),
    autoReply:       isChecked('autoReply'),
    autoVoice:       isChecked('autoVoice'),
    autoTyping:      isChecked('autoTyping'),
    autoRecording:   isChecked('autoRecording'),
    readMessage:     isChecked('readMessage'),
    readCmd:         isChecked('readCmd'),
    welcomeEnabled:  isChecked('welcomeEnabled'),
    alwaysOnline:    isChecked('alwaysOnline'),
    antiLink:           isChecked('antiLink'),
    antiBad:            isChecked('antiBad'),
    antiVV:             isChecked('antiVV'),
    deleteLinks:        isChecked('deleteLinks'),
    customReact:        isChecked('customReact'),
    customReactEmojis:  document.getElementById('customReactEmojis').value.trim(),
  };
}

/* ── SESSION HELPERS ── */
function openSessionPage() {
  window.open('/session.html', '_blank');
}

function fillSessionFromStorage() {
  const sid = localStorage.getItem('sigma_last_session') || sessionStorage.getItem('sigmaSessionId');
  const field = document.getElementById('sessionId');
  if (sid) {
    field.value = sid;
    field.style.borderColor = 'rgba(0,230,118,.5)';
    field.style.boxShadow = '0 0 0 3px rgba(0,230,118,.12)';
    setTimeout(() => { field.style.borderColor = ''; field.style.boxShadow = ''; }, 2500);
    showAlert('Session ID auto-filled!', 'success');
  } else {
    showAlert('No saved session found. Get your session first using the "Get Session" button.', 'info');
  }
}

/* ── PREVIEW MODAL ── */
function openPreviewModal(config) {
  const maskSession = (s) => s ? (s.length > 28 ? s.substring(0, 24) + '...' : s) : '(not set)';

  const featMap = [
    ['autoStatusSeen','👁️ Auto Status Seen'], ['autoStatusReact','❤️ Auto Status React'],
    ['autoStatusReply','💬 Auto Status Reply'], ['autoReact','🎉 Auto React'],
    ['autoSticker','🎭 Auto Sticker'], ['autoReply','🤖 Auto Reply'],
    ['autoVoice','🔊 Auto Voice'], ['autoTyping','✍️ Auto Typing'],
    ['readMessage','✅ Read Messages'], ['welcomeEnabled','👋 Welcome'],
    ['alwaysOnline','🟢 Always Online'], ['antiLink','🔗 Anti Link'],
    ['antiBad','🤬 Anti Bad Words'], ['antiVV','👁️ Anti View Once'],
  ];

  const rows = [
    ['BOT_NAME', config.botName],
    ['PREFIX', config.prefix],
    ['OWNER_NAME', config.ownerName],
    ['OWNER_NUMBER', config.ownerNumber],
    ['MODE', config.mode.toUpperCase()],
    ['SESSION_ID', maskSession(config.sessionId)],
    ['DESCRIPTION', config.description || '(none)'],
  ];

  document.getElementById('envPreview').innerHTML = rows.map(([k, v]) => `
    <div class="env-row">
      <span class="env-key">${k}</span>
      <span class="env-val${!v || v === '(none)' || v === '(not set)' ? ' muted' : ''}">${v}</span>
    </div>`).join('');

  const activeFeats = featMap.filter(([k]) => config[k]);
  const inactiveFeats = featMap.filter(([k]) => !config[k]);
  document.getElementById('previewFeatures').innerHTML =
    activeFeats.map(([, label]) => `<span class="preview-feat-tag">${label}</span>`).join('') +
    inactiveFeats.map(([, label]) => `<span class="preview-feat-tag off">${label}</span>`).join('');

  document.getElementById('previewModal').classList.add('open');
}

function closePreviewModal(e) {
  if (e && e.target !== document.getElementById('previewModal')) return;
  document.getElementById('previewModal').classList.remove('open');
  pendingDownloadFn = null;
  resetBtn(document.getElementById('generateBtn'));
}

async function confirmDownload() {
  document.getElementById('previewModal').classList.remove('open');
  if (pendingDownloadFn) {
    await pendingDownloadFn();
    pendingDownloadFn = null;
  }
}

/* ── GENERATE / DOWNLOAD ── */
async function handleGenerate() {
  const btn = document.getElementById('generateBtn');

  if (selectedDelivery === 'shared') {
    const phone = document.getElementById('sharedPhone').value.trim();
    window.location.href = phone
      ? `/shared.html?phone=${encodeURIComponent(phone)}`
      : '/shared.html';
    return;
  }

  if (selectedDelivery === 'vps') {
    const phone = document.getElementById('vpsPhone')?.value.trim();
    if (!phone || !/^\+?[0-9]{7,15}$/.test(phone)) {
      showAlert('Entrez un numéro WhatsApp valide avec indicatif pays (ex: +32466304227).');
      return;
    }
    if (!validateStep(1)) { goStep(1); return; }
    const config = buildConfig();
    config.ownerNumber = phone;
    await executeVpsDeploy(config, btn);
    return;
  }

  if (!validateStep(1)) { goStep(1); return; }

  const config = buildConfig();

  if (selectedDelivery === 'zip' || selectedDelivery === 'platform') {
    btn.disabled = true;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Preparing...`;

    pendingDownloadFn = () => executeGenerate(config, btn);
    openPreviewModal(config);
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Generating...`;

  try {
    const res = await fetch('/api/bot/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    const data = await res.json();
    if (!res.ok) {
      showAlert(data.error || 'Generation failed.');
      resetBtn(btn);
      return;
    }

    botSessionId = data.sessionId;

    if (!githubConnected) {
      window.location.href = `/api/github/auth?botSessionId=${botSessionId}`;
      return;
    }
    await pushToGitHub();
    resetBtn(btn);
  } catch {
    showAlert('Network error. Please try again.');
    resetBtn(btn);
  }
}

/* ── VPS DEPLOY ── */
async function executeVpsDeploy(config, btn) {
  btn.disabled = true;
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Déploiement...`;

  // Open console modal
  openConsoleModal();
  document.getElementById('consoleTitle').textContent = '🚀 Déploiement sur VPS...';

  try {
    const vpsToken = localStorage.getItem('sigma_token');
    if (!vpsToken) {
      closeConsoleModal();
      resetBtn(btn);
      window.location.href = '/login.html?redirect=' + encodeURIComponent('/builder.html?delivery=vps');
      return;
    }
    const res = await fetch('/api/vps/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vpsToken}` },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (!res.ok) {
      closeConsoleModal();
      showAlert(data.error || 'Déploiement échoué.');
      resetBtn(btn);
      return;
    }

    const { deployId } = data;
    resetBtn(btn);

    // Listen to SSE progress
    const es = new EventSource(`/api/vps/progress/${deployId}`);

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.text) consolePrint(msg.type, msg.text);

      if (msg.type === 'awaiting_pair') {
        // Redirect to VPS dashboard to handle pair code
        es.close();
        setTimeout(() => { window.location.href = `/vps.html?job=${msg.deployId || deployId}`; }, 800);
        return;
      }
      if (msg.type === 'error') {
        es.close();
        document.getElementById('consoleTitle').textContent = '❌ Erreur de déploiement';
        document.getElementById('consoleSpinner').style.display = 'none';
        document.getElementById('consoleFooter').style.display = 'flex';
      }
    };
    es.onerror = () => consolePrint('error', '⚠️ Connexion perdue.');
  } catch {
    closeConsoleModal();
    showAlert('Erreur réseau. Réessayez.');
    resetBtn(btn);
  }
}

/* ── CONSOLE MODAL ── */

let _consoleDlSessionId = null;
let _consoleDlConfig = null;

function openConsoleModal() {
  document.getElementById('consoleOutput').innerHTML = '';
  document.getElementById('consoleTitle').textContent = 'Construction du bot...';
  document.getElementById('consoleSpinner').style.display = 'flex';
  document.getElementById('consoleFooter').style.display = 'none';
  document.getElementById('consoleModal').classList.add('open');
}

function closeConsoleModal() {
  document.getElementById('consoleModal').classList.remove('open');
  _consoleDlSessionId = null;
  _consoleDlConfig = null;
}

function consolePrint(type, text) {
  const out = document.getElementById('consoleOutput');
  const line = document.createElement('div');
  const colorMap = {
    ok:    'var(--neon)',
    error: '#ff4757',
    done:  '#a78bfa',
    info:  '#a0b0c0',
  };
  line.style.color = colorMap[type] || '#a0b0c0';
  line.textContent = text;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

function triggerConsoleDownload() {
  if (!_consoleDlSessionId) return;
  window.location.href = `/api/bot/download/${_consoleDlSessionId}`;
  if (_consoleDlConfig && selectedDelivery === 'platform') {
    setTimeout(() => {
      window.open(`/deploy.html?platform=${selectedPlatform}&botName=${encodeURIComponent(_consoleDlConfig.botName)}`, '_blank');
    }, 1200);
  }
  setTimeout(() => closeConsoleModal(), 3500);
}

async function executeGenerate(config, btn) {
  btn.disabled = true;
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Génération...`;

  openConsoleModal();

  try {
    const res = await fetch('/api/bot/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    const data = await res.json();
    if (!res.ok) {
      closeConsoleModal();
      showAlert(data.error || 'Generation failed.');
      resetBtn(btn);
      return;
    }

    const { jobId } = data;

    await new Promise((resolve, reject) => {
      const es = new EventSource(`/api/bot/progress/${jobId}`);

      es.onmessage = (e) => {
        const msg = JSON.parse(e.data);

        if (msg.type === 'complete') {
          es.close();
          _consoleDlSessionId = msg.sessionId;
          _consoleDlConfig = config;
          botSessionId = msg.sessionId;
          document.getElementById('consoleTitle').textContent = `✅ ${msg.botName || 'Bot'} prêt !`;
          document.getElementById('consoleSpinner').style.display = 'none';
          document.getElementById('consoleFooter').style.display = 'flex';
          resetBtn(btn);

          // Auto-download after short delay
          setTimeout(() => {
            window.location.href = `/api/bot/download/${msg.sessionId}`;
            if (selectedDelivery === 'platform') {
              setTimeout(() => {
                window.open(`/deploy.html?platform=${selectedPlatform}&botName=${encodeURIComponent(config.botName)}`, '_blank');
              }, 1200);
            }
          }, 600);

          resolve();
          return;
        }

        if (msg.type === 'error') {
          es.close();
          consolePrint('error', msg.message || 'Erreur de génération.');
          document.getElementById('consoleTitle').textContent = '❌ Erreur';
          document.getElementById('consoleSpinner').style.display = 'none';
          document.getElementById('consoleFooter').style.display = 'flex';
          document.getElementById('consoleDlBtn').style.display = 'none';
          resetBtn(btn);
          reject(new Error(msg.message));
          return;
        }

        // Progress log line
        if (msg.text) consolePrint(msg.type || 'info', msg.text);
      };

      es.onerror = () => {
        es.close();
        consolePrint('error', '❌ Connexion perdue. Réessayez.');
        document.getElementById('consoleSpinner').style.display = 'none';
        resetBtn(btn);
        reject(new Error('SSE error'));
      };
    });
  } catch {
    resetBtn(btn);
  }
}

function resetBtn(btn) {
  btn.disabled = false;
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> Generate Bot`;
}

async function pushToGitHub() {
  const repoName = document.getElementById('repoName').value.trim();
  const createNew = document.getElementById('createNew').checked;

  if (!repoName) { showAlert('Please enter a repository name.'); return; }

  const btn = document.getElementById('generateBtn');
  btn.innerHTML = '🐙 Pushing to GitHub...';

  try {
    const res = await fetch('/api/github/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botSessionId, repoName, createNew }),
    });
    const data = await res.json();
    if (!res.ok) { showAlert(data.error || 'Push failed.'); return; }

    showAlert(`✅ Pushed to GitHub: ${data.repoUrl}`, 'success');
    setTimeout(() => window.open(data.repoUrl, '_blank'), 1500);
  } catch {
    showAlert('Failed to push to GitHub. Try again.');
  }
}

updateProgress();

window.addEventListener('DOMContentLoaded', () => {
  const sessionField = document.getElementById('sessionId');
  if (sessionField && !sessionField.value) {
    const saved = sessionStorage.getItem('sigmaSessionId') || localStorage.getItem('sigma_last_session');
    if (saved) sessionField.value = saved;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('previewModal').classList.remove('open');
    pendingDownloadFn = null;
  }
});
