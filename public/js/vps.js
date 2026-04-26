// ─── Auth ─────────────────────────────────────────────────────────────────────

const token = localStorage.getItem('sigma_token');
if (!token) window.location.href = '/login.html';

const user = JSON.parse(localStorage.getItem('sigma_user') || '{}');
const emailEl = document.getElementById('user-email-display');
if (emailEl && user.email) { emailEl.textContent = user.email.split('@')[0]; emailEl.style.display = 'inline'; }

async function authFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (res.status === 401) { doLogout(); return res; }
  return res;
}

function doLogout() {
  localStorage.removeItem('sigma_token');
  localStorage.removeItem('sigma_user');
  window.location.href = '/login.html';
}

// ─── Notifications ────────────────────────────────────────────────────────────

let notifPanelOpen = false;

async function loadNotifications() {
  try {
    const r = await authFetch('/api/vps/notifications');
    if (!r.ok) return;
    const d = await r.json();
    const badge = document.getElementById('notif-badge');
    const list = document.getElementById('notif-list');

    if (d.unread > 0) {
      badge.style.display = 'block';
      badge.textContent = d.unread > 9 ? '9+' : d.unread;
    } else {
      badge.style.display = 'none';
    }

    if (!d.notifications.length) {
      list.innerHTML = '<div style="text-align:center;padding:2rem;color:#6b8095;font-size:.85rem">Aucune notification</div>';
    } else {
      list.innerHTML = d.notifications.map(n => `
        <div onclick="markRead('${n._id}')" style="padding:.75rem 1rem;border-bottom:1px solid #0f1f2e;cursor:pointer;background:${n.read?'transparent':'rgba(0,230,118,.03)'};transition:background .2s"
             onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background='${n.read?'transparent':'rgba(0,230,118,.03)'}'">
          <div style="font-size:.85rem;font-weight:${n.read?400:600};color:${n.read?'#8a9ab0':'#e0eaf5'}">${n.title}</div>
          <div style="font-size:.78rem;color:#6b8095;margin-top:.2rem">${n.message}</div>
          <div style="font-size:.72rem;color:#4a5a6a;margin-top:.2rem">${new Date(n.createdAt).toLocaleString('fr-FR')}</div>
        </div>
      `).join('');
    }
  } catch (_) {}
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  notifPanelOpen = !notifPanelOpen;
  panel.style.display = notifPanelOpen ? 'block' : 'none';
  if (notifPanelOpen) loadNotifications();
}

async function markRead(id) {
  await authFetch(`/api/vps/notifications/${id}/read`, { method: 'PUT' });
  loadNotifications();
}

async function markAllRead() {
  await authFetch('/api/vps/notifications/read-all', { method: 'PUT' });
  loadNotifications();
}

document.addEventListener('click', e => {
  if (notifPanelOpen && !document.getElementById('notif-btn').contains(e.target) && !document.getElementById('notif-panel').contains(e.target)) {
    notifPanelOpen = false;
    document.getElementById('notif-panel').style.display = 'none';
  }
});

// ─── Custom Confirm Modal ─────────────────────────────────────────────────────

let _confirmResolve = null;

function showConfirm(title, message, okLabel = 'Confirmer', okClass = 'danger') {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  const btn = document.getElementById('confirmOkBtn');
  btn.textContent = okLabel;
  btn.className = `confirm-ok ${okClass}`;
  document.getElementById('confirmModal').classList.add('open');
  return new Promise(resolve => { _confirmResolve = resolve; });
}

function resolveConfirm(val) {
  document.getElementById('confirmModal').classList.remove('open');
  if (_confirmResolve) { _confirmResolve(val); _confirmResolve = null; }
}

function closeConfirm() { resolveConfirm(false); }

// ─── Onboarding ───────────────────────────────────────────────────────────────

function checkOnboarding() {
  if (!localStorage.getItem('sigma_onboarded')) {
    setTimeout(() => {
      document.getElementById('onboardModal').classList.add('open');
    }, 600);
  }
}

function closeOnboarding() {
  localStorage.setItem('sigma_onboarded', '1');
  document.getElementById('onboardModal').classList.remove('open');
}

// ─── Plan Banner ──────────────────────────────────────────────────────────────

async function loadPlanInfo() {
  try {
    const r = await authFetch('/api/auth/me');
    if (!r.ok) return;
    const d = await r.json();
    const u = d.user || d;
    const plan = u.plan || 'free';
    const maxBots = u.maxBots || 1;
    const badge = document.getElementById('plan-badge-label');
    const info = document.getElementById('plan-info-text');
    const upgradeBtn = document.getElementById('plan-upgrade-btn');

    badge.textContent = plan.toUpperCase();
    if (plan === 'pro' || plan === 'enterprise') {
      badge.classList.add('pro');
      info.textContent = `${maxBots} bots simultanés inclus — Merci pour votre confiance !`;
      upgradeBtn.style.display = 'none';
    } else {
      info.textContent = `Plan gratuit · ${maxBots} bot actif maximum`;
    }
  } catch (_) {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(ms) {
  if (!ms) return null;
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}j ${hrs % 24}h`;
}

function formatBytes(b) {
  if (!b) return null;
  const mb = b / 1024 / 1024;
  return mb >= 1024 ? (mb / 1024).toFixed(1) + ' Go' : Math.round(mb) + ' Mo';
}

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'à l\'instant';
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `il y a ${days}j`;
}

// ─── Session loading ───────────────────────────────────────────────────────────

let activeDeployId = null;
let consoleEs = null;

async function loadSessions() {
  const grid = document.getElementById('sessionsGrid');
  const count = document.getElementById('sessionsCount');
  try {
    const res = await authFetch('/api/vps/sessions');
    if (!res.ok) return;
    const sessions = await res.json();

    count.textContent = sessions.length ? `${sessions.length} bot(s)` : '';

    if (!sessions.length) {
      grid.innerHTML = `<div class="empty-state">
        <div class="ico">🤖</div>
        <p>Aucun bot déployé pour l'instant.<br>Cliquez sur <strong>Déployer un nouveau bot</strong> pour commencer.</p>
      </div>`;
      return;
    }

    grid.innerHTML = sessions.map(s => renderCard(s)).join('');
  } catch {
    grid.innerHTML = `<div class="empty-state"><div class="ico">❌</div><p>Impossible de charger les sessions.</p></div>`;
  }
}

function renderCard(s) {
  const statusClass = {
    connected:    'st-connected',
    waiting_pair: 'st-waiting',
    deploying:    'st-deploying',
    stopped:      'st-stopped',
    error:        'st-error',
    disconnected: 'st-disconnected',
  }[s.status] || 'st-stopped';

  const statusLabel = {
    connected:    'Connecté',
    waiting_pair: 'En attente du code',
    deploying:    'Déploiement...',
    stopped:      'Arrêté',
    error:        'Erreur',
    disconnected: 'Déconnecté',
  }[s.status] || s.status;

  const deployedAt = s.deployedAt
    ? new Date(s.deployedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const pairSection = s.status === 'waiting_pair' && s.pairCode
    ? `<div style="margin-top:.4rem;font-size:.82rem;color:#ffd200;">Code: <strong style="letter-spacing:.12em">${s.pairCode}</strong></div>`
    : '';

  // Health dot
  const dotClass = s.status in { connected:1, error:1, stopped:1, deploying:1, waiting_pair:1 } ? s.status : 'stopped';

  // Stats row
  const uptimeTxt = formatUptime(s.pm2Uptime);
  const memTxt = formatBytes(s.pm2Memory);
  const statsItems = [];
  if (uptimeTxt) statsItems.push(`<span class="stat-tag"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${uptimeTxt}</span>`);
  if (memTxt) statsItems.push(`<span class="stat-tag"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/></svg>${memTxt}</span>`);
  if (s.pm2Restarts > 0) statsItems.push(`<span class="stat-tag" style="color:#f59e0b"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.63"/></svg>${s.pm2Restarts} restart${s.pm2Restarts > 1 ? 's' : ''}</span>`);
  if (s.msgCount > 0) {
    const lastMsgTxt = timeAgo(s.lastMsgAt);
    const tooltip = lastMsgTxt ? ` · ${lastMsgTxt}` : '';
    statsItems.push(`<span class="stat-tag" style="color:#00e676" title="Dernier message : ${lastMsgTxt || '—'}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${s.msgCount.toLocaleString('fr-FR')} msgs${tooltip}</span>`);
  }

  const statsRow = statsItems.length ? `<div class="card-stats">${statsItems.join('')}</div>` : '';

  const displayName = s.displayName || s.botName;

  // Health alert badge
  const healthBadge = s.healthAlert?.type
    ? `<div class="health-alert-badge" title="${s.healthAlert.msg}">
        ⚠️ <span>${s.healthAlert.msg}</span>
        <span style="color:#4a5a6a;font-size:.72rem;margin-left:.4rem">${timeAgo(s.healthAlert.at)}</span>
      </div>`
    : '';

  // Disconnected / error banner
  const needsRepair = s.status === 'disconnected' || s.status === 'error';
  const repairBanner = needsRepair
    ? `<div class="repair-banner">
        ${s.status === 'disconnected' ? '🔌 Bot déconnecté de WhatsApp' : '🔴 Bot arrêté inopinément'}
        — <button class="repair-inline-btn" onclick="repairBot('${s.deployId}')">🔗 Repairer</button>
      </div>`
    : '';

  return `<div class="bot-card${needsRepair ? ' card-needs-repair' : ''}" id="card-${s.deployId}">
    <div class="bot-info">
      <div class="bot-name" style="display:flex;align-items:center;gap:.5rem">
        <span class="health-dot ${dotClass}"></span>
        <span id="display-name-${s.deployId}">${displayName}</span>
        <span class="bot-status ${statusClass}" style="margin-left:.25rem">${statusLabel}</span>
        <button onclick="toggleRename('${s.deployId}','${escAttr(displayName)}')" title="Renommer" style="background:none;border:none;cursor:pointer;color:#4a5a6a;padding:.1rem .2rem;margin-left:.1rem;transition:color .2s" onmouseover="this.style.color='#00e676'" onmouseout="this.style.color='#4a5a6a'">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
      <div class="rename-form" id="rename-form-${s.deployId}">
        <input class="rename-input" id="rename-input-${s.deployId}" type="text" maxlength="50" placeholder="Nouveau nom..." />
        <button class="rename-save-btn" onclick="saveRename('${s.deployId}')">✓ Sauver</button>
        <button onclick="toggleRename('${s.deployId}','')" style="background:none;border:none;cursor:pointer;color:#4a5a6a;font-size:.82rem">Annuler</button>
      </div>
      <div class="bot-meta">${s.phoneNumber} · Port ${s.port} · Déployé le ${deployedAt}</div>
      ${statsRow}
      ${healthBadge}
      ${repairBanner}
      ${pairSection}
    </div>
    <div class="bot-actions">
      ${s.status === 'waiting_pair' ? `<button class="action-btn primary" onclick="showPairCode('${s.deployId}','${s.pairCode || ''}')">📱 Code</button>` : ''}
      ${needsRepair ? `<button class="action-btn primary" onclick="repairBot('${s.deployId}')">🔗 Repairer</button>` : ''}
      ${s.status !== 'deploying' ? `<button class="action-btn" onclick="restartBot('${s.deployId}')">↺ Redémarrer</button>` : ''}
      ${s.status !== 'deploying' ? `<button class="action-btn" onclick="redeployBot('${s.deployId}')" title="Mettre à jour le bot avec la config actuelle">🔄 Redéployer</button>` : ''}
      ${s.sessionBackupAt && s.status !== 'connected' ? `<button class="action-btn" onclick="restoreSession('${s.deployId}')" title="Restaurer la session sauvegardée du ${new Date(s.sessionBackupAt).toLocaleDateString('fr-FR')}">💾 Restaurer</button>` : ''}
      <button class="action-btn" onclick="viewLogs('${s.deployId}')">📋 Logs</button>
      ${s.status !== 'deploying' && s.status !== 'stopped' ? `<button class="action-btn" onclick="stopBot('${s.deployId}')">⏹ Arrêter</button>` : ''}
      <button class="action-btn danger" onclick="deleteBot('${s.deployId}')">🗑 Supprimer</button>
    </div>
  </div>`;
}

function escAttr(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ─── Rename ────────────────────────────────────────────────────────────────────

function toggleRename(deployId, currentName) {
  const form = document.getElementById(`rename-form-${deployId}`);
  const inp = document.getElementById(`rename-input-${deployId}`);
  const isOpen = form.classList.contains('open');
  if (!isOpen) {
    form.classList.add('open');
    inp.value = currentName;
    inp.focus();
    inp.select();
    inp.onkeydown = e => { if (e.key === 'Enter') saveRename(deployId); if (e.key === 'Escape') toggleRename(deployId, ''); };
  } else {
    form.classList.remove('open');
  }
}

async function saveRename(deployId) {
  const inp = document.getElementById(`rename-input-${deployId}`);
  const newName = inp.value.trim();
  if (!newName) return;
  try {
    const r = await authFetch(`/api/vps/session/${deployId}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ displayName: newName }),
    });
    if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
    document.getElementById(`display-name-${deployId}`).textContent = newName;
    document.getElementById(`rename-form-${deployId}`).classList.remove('open');
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

// ─── Deploy wizard ─────────────────────────────────────────────────────────────

function openDeployWizard() {
  window.location.href = '/builder.html?delivery=vps';
}

async function checkUrlJob() {
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get('job');
  if (!jobId) return;
  history.replaceState({}, '', '/vps.html');
  openConsoleModal();
  listenProgress(jobId);
}

// ─── Console Modal ────────────────────────────────────────────────────────────

function openConsoleModal() {
  document.getElementById('consoleOut').innerHTML = '';
  document.getElementById('consoleTitle').textContent = '🚀 Déploiement en cours...';
  document.getElementById('consoleSpinnerEl').style.display = 'flex';
  document.getElementById('pairBox').classList.remove('show');
  document.getElementById('connectedBanner').classList.remove('show');
  document.getElementById('consoleModal').classList.add('open');
}

function closeConsole() {
  if (consoleEs) { consoleEs.close(); consoleEs = null; }
  document.getElementById('consoleModal').classList.remove('open');
  loadSessions();
}

function consolePrint(type, text) {
  const out = document.getElementById('consoleOut');
  const line = document.createElement('div');
  const cls = { ok: 'cl-ok', error: 'cl-err', done: 'cl-done', pair: 'cl-pair' }[type] || '';
  if (cls) line.className = cls;
  line.textContent = text;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

function listenProgress(deployId) {
  activeDeployId = deployId;
  if (consoleEs) consoleEs.close();
  consoleEs = new EventSource(`/api/vps/progress/${deployId}`);

  consoleEs.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.text) consolePrint(msg.type, msg.text);

    if (msg.type === 'awaiting_pair') {
      activeDeployId = msg.deployId || deployId;
      consoleEs.close();
      consoleEs = new EventSource(`/api/vps/progress/${activeDeployId}`);
      consoleEs.onmessage = handlePairEvents;
      return;
    }

    if (msg.type === 'error') {
      consoleEs.close();
      document.getElementById('consoleTitle').textContent = '❌ Échec du déploiement';
      document.getElementById('consoleSpinnerEl').style.display = 'none';
    }
  };

  consoleEs.onerror = () => {
    consolePrint('error', '⚠️ Connexion perdue avec le serveur.');
  };
}

function handlePairEvents(e) {
  const msg = JSON.parse(e.data);
  if (msg.text) consolePrint(msg.type, msg.text);

  if (msg.type === 'paircode') {
    document.getElementById('pairCodeDisplay').textContent = msg.code;
    document.getElementById('pairBox').classList.add('show');
    document.getElementById('consoleTitle').textContent = '📱 Code de jumelage prêt';
    document.getElementById('consoleSpinnerEl').style.display = 'none';
    consolePrint('pair', `📱 Code de jumelage : ${msg.code}`);
  }

  if (msg.type === 'connected') {
    consoleEs.close();
    document.getElementById('pairBox').classList.remove('show');
    document.getElementById('connectedBanner').classList.add('show');
    document.getElementById('consoleTitle').textContent = '✅ Bot connecté !';
    document.getElementById('consoleSpinnerEl').style.display = 'none';
    consolePrint('ok', '✅ Bot connecté et actif 24h/24 !');
    loadSessions();
  }
}

function showPairCode(deployId, code) {
  openConsoleModal();
  document.getElementById('consoleTitle').textContent = '📱 Code de jumelage';
  document.getElementById('consoleSpinnerEl').style.display = 'none';
  if (code) {
    document.getElementById('pairCodeDisplay').textContent = code;
    document.getElementById('pairBox').classList.add('show');
  }
  activeDeployId = deployId;
  if (consoleEs) consoleEs.close();
  consoleEs = new EventSource(`/api/vps/progress/${deployId}`);
  consoleEs.onmessage = handlePairEvents;
}

// ─── Bot actions ───────────────────────────────────────────────────────────────

async function restartBot(deployId) {
  const ok = await showConfirm(
    'Redémarrer ce bot ?',
    'Le bot sera redémarré. Un nouveau code de jumelage pourra être demandé.',
    '↺ Redémarrer', 'warning'
  );
  if (!ok) return;
  try {
    const r = await authFetch(`/api/vps/restart/${deployId}`, { method: 'POST' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    showPairCode(deployId, '');
    consolePrint('ok', '↺ Bot redémarré. En attente du code...');
    await loadSessions();
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

async function stopBot(deployId) {
  const ok = await showConfirm(
    'Arrêter ce bot ?',
    'Le bot sera arrêté sur le serveur. Vous pourrez le redémarrer à tout moment.',
    '⏹ Arrêter', 'warning'
  );
  if (!ok) return;
  try {
    const r = await authFetch(`/api/vps/stop/${deployId}`, { method: 'POST' });
    if (!r.ok) throw new Error((await r.json()).error);
    await loadSessions();
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

async function redeployBot(deployId) {
  const ok = await showConfirm(
    '🔄 Redéployer ce bot ?',
    'Les fichiers du bot seront mis à jour avec la configuration sauvegardée et le processus sera redémarré.',
    '🔄 Redéployer', 'warning'
  );
  if (!ok) return;
  try {
    const r = await authFetch(`/api/vps/redeploy/${deployId}`, { method: 'POST' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    openConsoleModal();
    document.getElementById('consoleTitle').textContent = '🔄 Redéploiement en cours...';
    listenProgress(d.redeployJobId);
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

async function repairBot(deployId) {
  const ok = await showConfirm(
    '🔗 Repairer ce bot ?',
    'Le bot sera redéployé avec sa configuration sauvegardée et un nouveau code de jumelage vous sera présenté.',
    '🔗 Repairer', 'warning'
  );
  if (!ok) return;
  try {
    const r = await authFetch(`/api/vps/repair/${deployId}`, { method: 'POST' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    openConsoleModal();
    document.getElementById('consoleTitle').textContent = '🔗 Réparation en cours...';
    listenProgress(d.repairJobId);
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

async function restoreSession(deployId) {
  const ok = await showConfirm(
    '💾 Restaurer la session ?',
    'La dernière sauvegarde de session WhatsApp sera restaurée sur le VPS et le bot sera redémarré automatiquement.',
    '💾 Restaurer', 'warning'
  );
  if (!ok) return;
  try {
    const r = await authFetch(`/api/vps/restore-session/${deployId}`, { method: 'POST' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    showPairCode(deployId, '');
    consolePrint('ok', '💾 Session restaurée. En attente de reconnexion WhatsApp...');
    await loadSessions();
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

async function deleteBot(deployId) {
  const ok = await showConfirm(
    '🗑 Supprimer définitivement ?',
    'Cette action supprimera le bot et tous ses fichiers sur le VPS. Cette action est irréversible.',
    'Supprimer', 'danger'
  );
  if (!ok) return;
  try {
    const r = await authFetch(`/api/vps/session/${deployId}`, { method: 'DELETE' });
    if (!r.ok) throw new Error((await r.json()).error);
    await loadSessions();
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

// ─── Logs modal (SSE temps réel) ──────────────────────────────────────────────

let _currentLogsDeployId = null;
let _logsEs = null;

function viewLogs(deployId) {
  _currentLogsDeployId = deployId;
  const out = document.getElementById('logsOut');
  out.textContent = 'Connexion au flux de logs...';
  document.getElementById('logsModal').classList.add('open');
  startLogsStream(deployId);
}

function startLogsStream(deployId) {
  if (_logsEs) { _logsEs.close(); _logsEs = null; }
  const token = localStorage.getItem('sigma_token');
  _logsEs = new EventSource(`/api/vps/logs-stream/${deployId}?t=${token}`);
  _logsEs.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      const out = document.getElementById('logsOut');
      out.textContent = d.logs || '(aucun log disponible)';
      out.scrollTop = out.scrollHeight;
    } catch (_) {}
  };
  _logsEs.onerror = () => {
    if (_logsEs) {
      document.getElementById('logsOut').textContent += '\n⚠️ Flux interrompu — cliquez Actualiser.';
    }
  };
}

async function refreshLogs() {
  if (!_currentLogsDeployId) return;
  document.getElementById('logsOut').textContent = 'Actualisation...';
  startLogsStream(_currentLogsDeployId);
}

function closeLogsModal() {
  if (_logsEs) { _logsEs.close(); _logsEs = null; }
  _currentLogsDeployId = null;
  document.getElementById('logsModal').classList.remove('open');
}

// ─── Init ──────────────────────────────────────────────────────────────────────

loadSessions();
checkUrlJob();
loadNotifications();
loadPlanInfo();
checkOnboarding();

setInterval(loadSessions, 30000);
setInterval(loadNotifications, 60000);
