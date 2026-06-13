const ADMIN_CLIENT_SCRIPT = `
const state = {
  adminToken: sessionStorage.getItem('speechToTextAdminToken') || ''
};

const statusEl = document.getElementById('overallStatus');
const statusFacts = document.getElementById('statusFacts');
const keysTable = document.getElementById('keysTable');
const createdToken = document.getElementById('createdToken');
const createdTokenCode = createdToken.querySelector('code');
const toast = document.getElementById('toast');
const adminTokenInput = document.getElementById('adminToken');

adminTokenInput.value = state.adminToken;

document.getElementById('adminTokenForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  state.adminToken = adminTokenInput.value.trim();
  sessionStorage.setItem('speechToTextAdminToken', state.adminToken);
  await refreshAll();
});

document.getElementById('refreshStatus').addEventListener('click', loadStatus);
document.getElementById('refreshKeys').addEventListener('click', loadKeys);

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

async function refreshAll() {
  await loadStatus();
  await loadKeys();
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
  return (value / 1024 / 1024).toFixed(1) + ' MB';
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
