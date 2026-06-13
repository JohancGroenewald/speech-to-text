const crypto = require('node:crypto');

const { getReadiness } = require('../config');
const { ApiError, invalidRequest, unauthorized } = require('../errors');

function registerAdminRoutes(app, { config, keyManager }) {
  app.get('/admin', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return renderAdminHtml();
  });

  app.get('/admin/assets/admin.css', async (_request, reply) => {
    reply.type('text/css; charset=utf-8');
    return ADMIN_CSS;
  });

  app.get('/admin/assets/admin.js', async (_request, reply) => {
    reply.type('application/javascript; charset=utf-8');
    return ADMIN_JS;
  });

  app.get('/admin/api/status', { preHandler: authenticateAdmin(config) }, async () => {
    const readiness = getReadiness(config);
    return {
      ok: readiness.ok,
      missing: readiness.missing,
      service: 'speech-to-text',
      model: config.transcriptionModel,
      provider: 'openai',
      max_audio_bytes: config.maxAudioBytes,
      request_timeout_ms: config.requestTimeoutMs,
      log_transcripts: config.logTranscripts,
      node: process.version
    };
  });

  app.get('/admin/api/client-keys', { preHandler: authenticateAdmin(config) }, async () => ({
    keys: keyManager.listKeys()
  }));

  app.post('/admin/api/client-keys', { preHandler: authenticateAdmin(config) }, async (request, reply) => {
    const body = request.body || {};
    if (!String(body.label || '').trim()) {
      throw invalidRequest('Client key label is required.');
    }
    const result = keyManager.createKey({
      label: body.label,
      notes: body.notes
    });
    reply.status(201);
    return result;
  });

  app.delete('/admin/api/client-keys/:id', { preHandler: authenticateAdmin(config) }, async (request) => {
    const revoked = keyManager.revokeKey(request.params.id);
    if (!revoked) {
      throw new ApiError(404, 'not_found', 'Client key was not found.');
    }
    return {
      ok: true
    };
  });
}

function authenticateAdmin(config) {
  return async function adminAuth(request) {
    if (!config.adminApiToken) {
      throw new ApiError(503, 'admin_not_configured', 'ADMIN_API_TOKEN is not configured.');
    }
    const authorization = String(request.headers.authorization || '');
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match || !safeEqual(match[1], config.adminApiToken)) {
      throw unauthorized('Missing or invalid admin token.');
    }
  };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function renderAdminHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Speech-to-Text Admin</title>
  <link rel="stylesheet" href="/admin/assets/admin.css">
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div>
        <h1>Speech-to-Text Admin</h1>
        <p>Local API status and client token management.</p>
      </div>
      <div class="status-pill" id="overallStatus">Locked</div>
    </header>

    <section class="panel auth-panel">
      <div>
        <h2>Admin Access</h2>
        <p>Enter the admin token configured on the server.</p>
      </div>
      <form id="adminTokenForm" class="inline-form">
        <input id="adminToken" name="adminToken" type="password" autocomplete="current-password" placeholder="ADMIN_API_TOKEN" required>
        <button type="submit">Unlock</button>
      </form>
    </section>

    <section class="grid">
      <section class="panel">
        <div class="panel-head">
          <h2>Service</h2>
          <button id="refreshStatus" type="button">Refresh</button>
        </div>
        <dl class="facts" id="statusFacts">
          <div><dt>State</dt><dd>Waiting for admin token</dd></div>
        </dl>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Create Client Token</h2>
        </div>
        <form id="createKeyForm" class="stack">
          <label>
            Label
            <input name="label" placeholder="talktome-johan-laptop" required maxlength="80">
          </label>
          <label>
            Notes
            <textarea name="notes" placeholder="Optional context" rows="3" maxlength="240"></textarea>
          </label>
          <button type="submit">Create Token</button>
        </form>
        <div id="createdToken" class="created-token" hidden>
          <span>Created token</span>
          <code></code>
          <button id="copyToken" type="button">Copy</button>
        </div>
      </section>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Client Tokens</h2>
        <button id="refreshKeys" type="button">Refresh</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Source</th>
              <th>Created</th>
              <th>Last Used</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="keysTable">
            <tr><td colspan="6">Unlock to load client tokens.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <div id="toast" class="toast" hidden></div>
  </main>
  <script src="/admin/assets/admin.js"></script>
</body>
</html>`;
}

const ADMIN_CSS = `
:root {
  color-scheme: light;
  --bg: #f5f7fb;
  --panel: #ffffff;
  --panel-muted: #f1f5f9;
  --text: #16202f;
  --muted: #64748b;
  --border: #d8e0ea;
  --accent: #116466;
  --accent-strong: #0b4b4d;
  --danger: #b42318;
  --ok: #177245;
  --warn: #a15c07;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
}

.shell {
  width: min(1180px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 28px 0 48px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: 28px;
  font-weight: 700;
}

h2 {
  font-size: 16px;
  font-weight: 700;
}

p {
  color: var(--muted);
  margin-top: 4px;
}

.status-pill {
  min-width: 108px;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 8px 12px;
  background: var(--panel);
  color: var(--muted);
  font-size: 14px;
}

.status-pill.ok {
  color: var(--ok);
  border-color: rgba(23, 114, 69, 0.25);
  background: #ecfdf3;
}

.status-pill.warn {
  color: var(--warn);
  border-color: rgba(161, 92, 7, 0.25);
  background: #fff7ed;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 18px;
}

.panel + .panel {
  margin-top: 16px;
}

.auth-panel,
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
  gap: 16px;
  margin: 16px 0;
}

.inline-form {
  display: flex;
  gap: 8px;
  min-width: min(480px, 100%);
}

.stack {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}

input,
textarea,
button {
  font: inherit;
}

input,
textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 9px 10px;
  color: var(--text);
  background: #fff;
}

button {
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 9px 12px;
  color: #fff;
  background: var(--accent);
  cursor: pointer;
  white-space: nowrap;
}

button:hover {
  background: var(--accent-strong);
}

button.secondary {
  border-color: var(--border);
  background: var(--panel-muted);
  color: var(--text);
}

button.danger {
  border-color: var(--danger);
  background: var(--danger);
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 14px 0 0;
}

.facts div {
  min-height: 70px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  background: var(--panel-muted);
}

dt {
  color: var(--muted);
  font-size: 12px;
}

dd {
  margin: 4px 0 0;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.created-token {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid rgba(17, 100, 102, 0.25);
  border-radius: 6px;
  background: #edfafa;
}

.created-token span {
  grid-column: 1 / -1;
  color: var(--muted);
  font-size: 12px;
}

.created-token code {
  display: block;
  overflow: auto;
  padding: 9px;
  border-radius: 6px;
  background: #fff;
  white-space: nowrap;
}

.table-wrap {
  overflow-x: auto;
  margin-top: 12px;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 780px;
}

th,
td {
  border-bottom: 1px solid var(--border);
  padding: 10px 8px;
  text-align: left;
  vertical-align: middle;
}

th {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

td {
  font-size: 14px;
}

.toast {
  position: fixed;
  right: 18px;
  bottom: 18px;
  max-width: min(420px, calc(100vw - 36px));
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  background: var(--text);
  color: #fff;
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.18);
}

@media (max-width: 860px) {
  .topbar,
  .auth-panel,
  .panel-head,
  .inline-form {
    align-items: stretch;
    flex-direction: column;
  }

  .grid,
  .facts {
    grid-template-columns: 1fr;
  }
}
`;

const ADMIN_JS = `
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
  registerAdminRoutes
};
