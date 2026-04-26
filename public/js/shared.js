let deploySessionId = null;
let eventSource = null;
let liveSource = null;
let connectMode = 'qr'; // 'qr' | 'pair'

const params = new URLSearchParams(window.location.search);
if (params.get('phone')) {
  document.getElementById('phoneInput').value = params.get('phone');
}

// ─── Mode toggle ──────────────────────────────────────────────────────────────

function setMode(mode) {
  connectMode = mode;
  document.getElementById('mode-qr').classList.toggle('mode-active', mode === 'qr');
  document.getElementById('mode-pair').classList.toggle('mode-active', mode === 'pair');
  document.getElementById('qr-hint-text').style.display = mode === 'qr' ? '' : 'none';
  document.getElementById('pair-hint-text').style.display = mode === 'pair' ? '' : 'none';
}

// ─── Error helpers ────────────────────────────────────────────────────────────

function showError(msg) {
  const el = document.getElementById('form-error');
  el.textContent = msg;
  el.classList.add('show');
}

function hideError() {
  document.getElementById('form-error').classList.remove('show');
}

// ─── Start session ────────────────────────────────────────────────────────────

async function startDeploy() {
  hideError();
  const phoneNumber = document.getElementById('phoneInput').value.trim();

  if (!/^\+?[0-9]{7,15}$/.test(phoneNumber)) {
    showError('Entrez un numéro valide avec l\'indicatif pays (ex: +33612345678).');
    return;
  }

  try {
    const endpoint = connectMode === 'pair' ? '/api/deploy/shared/pair' : '/api/deploy/shared';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    });
    const data = await res.json();
    if (!res.ok) { showError(data.error || 'Échec du démarrage.'); return; }

    deploySessionId = data.deploySessionId;
    document.getElementById('setup-form').style.display = 'none';
    document.getElementById('qr-section').style.display = 'block';

    if (connectMode === 'pair') {
      document.getElementById('qr-box').style.display = 'none';
      document.getElementById('pair-box').style.display = 'block';
      document.getElementById('qr-hint-text').style.display = 'none';
      document.getElementById('pair-hint-text').style.display = '';
      startPairStream(data.pairEndpoint);
    } else {
      document.getElementById('qr-box').style.display = '';
      document.getElementById('pair-box').style.display = 'none';
      startQRStream(data.qrEndpoint);
    }
  } catch {
    showError('Erreur réseau. Veuillez réessayer.');
  }
}

// ─── QR stream ────────────────────────────────────────────────────────────────

function startQRStream(endpoint) {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(endpoint);

  eventSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.qr) {
      document.getElementById('qr-box').innerHTML = `<img src="${data.qr}" alt="QR Code" />`;
      setStatus('pending', '📷 Scannez le QR code avec WhatsApp');
    }
    if (data.status === 'connected') {
      setStatus('connected', '✅ Connecté ! Démarrage du bot...');
      eventSource.close();
      setTimeout(() => showConnected(), 1200);
    }
  };

  eventSource.onerror = () => setStatus('error', 'Connexion perdue. Reconnexion...');
}

// ─── Pairing code stream ──────────────────────────────────────────────────────

function startPairStream(endpoint) {
  if (eventSource) eventSource.close();
  setStatus('pending', '⏳ Génération du code en cours...');
  eventSource = new EventSource(endpoint);

  eventSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'paircode') {
      document.getElementById('pair-code-display').textContent = data.code;
      document.getElementById('pair-code-display').style.display = 'block';
      document.getElementById('pair-waiting').style.display = 'none';
      setStatus('pending', '📱 Entrez le code dans WhatsApp');
    }
    if (data.type === 'connected') {
      setStatus('connected', '✅ Connecté ! Démarrage du bot...');
      eventSource.close();
      setTimeout(() => showConnected(), 1200);
    }
  };

  eventSource.onerror = () => setStatus('error', 'Connexion perdue. Réessayez.');
}

// ─── Live status (disconnect notification) ────────────────────────────────────

function startLiveMonitor(deploySessionId) {
  if (liveSource) liveSource.close();
  liveSource = new EventSource(`/api/deploy/live/${deploySessionId}`);

  liveSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'status' && (data.status === 'disconnected' || data.status === 'logged_out')) {
      showDisconnectedAlert();
    }
  };
}

function showDisconnectedAlert() {
  const alertEl = document.getElementById('disconnect-alert');
  if (alertEl) alertEl.style.display = 'flex';

  // Browser notification
  if (Notification.permission === 'granted') {
    new Notification('⚠️ Bot Sigma MDX déconnecté', {
      body: 'Votre bot WhatsApp a été déconnecté. Cliquez pour le reconnecter.',
      icon: '/favicon.svg',
    });
  }
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function setStatus(type, text) {
  const badge = document.getElementById('status-badge');
  const classMap = { pending: 'badge badge-waiting pulse', connected: 'badge badge-ok', error: 'badge badge-error' };
  badge.className = classMap[type] || 'badge badge-waiting pulse';
  const icons = { pending: '⏳', connected: '✅', error: '❌' };
  badge.innerHTML = `<span>${icons[type] || '⏳'}</span> ${text}`;
}

function showConnected() {
  document.getElementById('qr-section').style.display = 'none';
  document.getElementById('connected-section').style.display = 'block';

  // Request notification permission & start live monitor
  if (Notification.permission === 'default') Notification.requestPermission();
  if (deploySessionId) startLiveMonitor(deploySessionId);
}

// ─── Stop / reset ─────────────────────────────────────────────────────────────

async function stopSession() {
  if (eventSource) { eventSource.close(); eventSource = null; }
  if (liveSource) { liveSource.close(); liveSource = null; }
  if (!deploySessionId) { resetPage(); return; }
  await fetch(`/api/deploy/session/${deploySessionId}`, { method: 'DELETE' }).catch(() => {});
  resetPage();
}

function resetPage() {
  deploySessionId = null;
  document.getElementById('setup-form').style.display = 'block';
  document.getElementById('qr-section').style.display = 'none';
  document.getElementById('connected-section').style.display = 'none';
  document.getElementById('disconnect-alert').style.display = 'none';
  document.getElementById('qr-box').innerHTML = '<div class="qr-placeholder pulse">Génération du QR code...</div>';
  document.getElementById('pair-code-display').textContent = '';
  document.getElementById('pair-code-display').style.display = 'none';
  document.getElementById('pair-waiting').style.display = '';
  hideError();
  setMode('qr');
}
