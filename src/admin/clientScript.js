const ADMIN_CLIENT_SCRIPT = `
const state = {
  adminToken: sessionStorage.getItem('speechToTextAdminToken') || ''
};

const statusEl = document.getElementById('overallStatus');
const statusFacts = document.getElementById('statusFacts');
const keysTable = document.getElementById('keysTable');
const logsTable = document.getElementById('logsTable');
const createdToken = document.getElementById('createdToken');
const createdTokenCode = createdToken.querySelector('code');
const toast = document.getElementById('toast');
const adminTokenInput = document.getElementById('adminToken');
const talkToMeEndpointInput = document.getElementById('talkToMeEndpoint');
const talkToMeCaFileInput = document.getElementById('talkToMeCaFile');
const talkToMeSettingsCode = document.getElementById('talkToMeSettings');
const themeToggle = document.getElementById('themeToggle');
const logSinceInput = document.getElementById('logSince');
const logLimitInput = document.getElementById('logLimit');

adminTokenInput.value = state.adminToken;
talkToMeEndpointInput.value = new URL('/v1/transcriptions', window.location.origin).href;
applyTheme(localStorage.getItem('speechToTextTheme') || preferredTheme());
renderTalkToMeSettings();

document.getElementById('adminTokenForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  state.adminToken = adminTokenInput.value.trim();
  sessionStorage.setItem('speechToTextAdminToken', state.adminToken);
  await refreshAll();
});

document.getElementById('refreshStatus').addEventListener('click', loadStatus);
document.getElementById('refreshKeys').addEventListener('click', loadKeys);
document.getElementById('refreshLogs').addEventListener('click', loadLogs);

themeToggle.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('speechToTextTheme', nextTheme);
  applyTheme(nextTheme);
});

document.getElementById('createKeyForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const result = await requestJson('/admin/api/client-keys', {
    method: 'POST',
    body: JSON.stringify({
      label: form.get('label'),
      notes: form.get('notes')
    })
  });
  createdToken.hidden = false;
  createdTokenCode.textContent = result.token;
  event.currentTarget.reset();
  showToast('Client token created. Copy it now; it will not be shown again.');
  await loadKeys();
});

document.getElementById('copyToken').addEventListener('click', async () => {
  await navigator.clipboard.writeText(createdTokenCode.textContent);
  showToast('Token copied.');
});

document.getElementById('copyTalkToMeSettings').addEventListener('click', async () => {
  await navigator.clipboard.writeText(talkToMeSettingsCode.textContent);
  showToast('TalkToMe settings copied.');
});

talkToMeEndpointInput.addEventListener('input', renderTalkToMeSettings);
talkToMeCaFileInput.addEventListener('input', renderTalkToMeSettings);

async function refreshAll() {
  await loadStatus();
  await loadKeys();
  await loadLogs();
}

async function loadStatus() {
  try {
    const status = await requestJson('/admin/api/status');
    statusEl.textContent = status.ok ? 'Ready' : 'Needs setup';
    statusEl.className = status.ok ? 'status-pill ok' : 'status-pill warn';
    statusFacts.innerHTML = [
      fact('State', status.ok ? 'Ready' : status.missing.map((item) => item.code).join(', ')),
      fact('Model', status.model),
      fact('Provider', status.provider),
      fact('Node', status.node),
      fact('Max Upload', formatBytes(status.max_audio_bytes)),
      fact('Timeout', Math.round(status.request_timeout_ms / 1000) + 's')
    ].join('');
  } catch (error) {
    statusEl.textContent = 'Locked';
    statusEl.className = 'status-pill';
    statusFacts.innerHTML = fact('State', error.message);
  }
}

async function loadKeys() {
  try {
    const result = await requestJson('/admin/api/client-keys');
    if (!result.keys.length) {
      keysTable.innerHTML = '<tr><td colspan="6">No client tokens yet.</td></tr>';
      return;
    }
    keysTable.innerHTML = result.keys.map((key) => {
      const status = key.revoked_at ? 'Revoked' : 'Active';
      const canRevoke = key.source === 'file' && !key.revoked_at;
      return '<tr>' +
        cell(escapeHtml(key.label)) +
        cell(escapeHtml(key.source)) +
        cell(formatDate(key.created_at)) +
        cell(formatDate(key.last_used_at)) +
        cell(status) +
        '<td>' + (canRevoke ? '<button class="danger" data-revoke="' + key.id + '">Revoke</button>' : '') + '</td>' +
      '</tr>';
    }).join('');
    keysTable.querySelectorAll('[data-revoke]').forEach((button) => {
      button.addEventListener('click', async () => {
        await requestJson('/admin/api/client-keys/' + encodeURIComponent(button.dataset.revoke), {
          method: 'DELETE'
        });
        showToast('Client token revoked.');
        await loadKeys();
      });
    });
  } catch (error) {
    keysTable.innerHTML = '<tr><td colspan="6">' + escapeHtml(error.message) + '</td></tr>';
  }
}

async function loadLogs() {
  const params = new URLSearchParams({
    since: logSinceInput.value.trim() || '10 minutes ago',
    limit: logLimitInput.value || '80'
  });
  try {
    const result = await requestJson('/admin/api/logs?' + params.toString());
    if (!result.logs.length) {
      logsTable.innerHTML = '<tr><td colspan="5">No client log events found.</td></tr>';
      return;
    }
    logsTable.innerHTML = result.logs.map((log) => (
      '<tr>' +
        cell(formatDate(log.timestamp)) +
        cell('<span class="log-event">' + escapeHtml(log.event) + '</span>') +
        cell(escapeHtml(log.client_label || log.client_id || 'unknown')) +
        cell(escapeHtml(logFlow(log))) +
        cell(escapeHtml(logDetails(log))) +
      '</tr>'
    )).join('');
  } catch (error) {
    logsTable.innerHTML = '<tr><td colspan="5">' + escapeHtml(error.message) + '</td></tr>';
  }
}

async function requestJson(url, options = {}) {
  const headers = {
    authorization: 'Bearer ' + state.adminToken,
    ...(options.headers || {})
  };
  if (options.body) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(url, {
    ...options,
    headers
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || 'Request failed.');
  }
  return body;
}

function fact(name, value) {
  return '<div><dt>' + escapeHtml(name) + '</dt><dd>' + escapeHtml(String(value || '')) + '</dd></div>';
}

function cell(value) {
  return '<td>' + value + '</td>';
}

function formatDate(value) {
  if (!value) {
    return 'Never';
  }
  return new Date(value).toLocaleString();
}

function formatBytes(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) {
    return '';
  }
  if (bytes < 1024) {
    return bytes + ' B';
  }
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  }
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function logFlow(log) {
  if (log.event === 'client request received' || log.event === 'client audio received') {
    return 'In';
  }
  if (log.event === 'client response sent') {
    return 'Out';
  }
  if (log.event === 'request failed') {
    return 'Error';
  }
  return 'Provider';
}

function logDetails(log) {
  if (log.event === 'client request received') {
    return joinParts([log.method, log.route, formatBytes(log.content_length), log.content_type]);
  }
  if (log.event === 'client audio received') {
    return joinParts([formatBytes(log.audio_bytes), log.mime_type, log.language ? 'language=' + log.language : '']);
  }
  if (log.event === 'transcription complete') {
    return joinParts([
      log.provider && log.model ? log.provider + '/' + log.model : '',
      formatDuration(log.duration_ms),
      formatBytes(log.audio_bytes),
      'transcript_logged=' + String(Boolean(log.transcript_logged))
    ]);
  }
  if (log.event === 'client response sent') {
    return joinParts([
      'HTTP ' + log.status_code,
      formatDuration(log.duration_ms),
      log.error_code ? 'error=' + log.error_code : '',
      log.response_text_chars !== undefined ? log.response_text_chars + ' chars' : '',
      log.provider && log.model ? log.provider + '/' + log.model : ''
    ]);
  }
  if (log.event === 'request failed') {
    return joinParts(['HTTP ' + log.status_code, log.error_code]);
  }
  return '';
}

function formatDuration(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  return Math.round(Number(value)) + 'ms';
}

function joinParts(parts) {
  return parts.filter((part) => part !== undefined && part !== null && String(part).trim()).join(' · ');
}

function renderTalkToMeSettings() {
  const settings = {
    'talkToMe.transcriptionProvider': 'localApi',
    'talkToMe.transcriptionEndpoint': talkToMeEndpointInput.value.trim()
  };
  const caFile = talkToMeCaFileInput.value.trim();
  if (caFile) {
    settings['talkToMe.transcriptionCaFile'] = caFile;
  }
  talkToMeSettingsCode.textContent = JSON.stringify(settings, null, 2);
}

function preferredTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = normalized;
  themeToggle.textContent = normalized === 'dark' ? 'Light' : 'Dark';
  themeToggle.setAttribute('aria-pressed', String(normalized === 'dark'));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}

if (state.adminToken) {
  refreshAll();
}
`;

module.exports = {
  ADMIN_CLIENT_SCRIPT
};
