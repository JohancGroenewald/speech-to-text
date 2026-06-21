function renderAdminHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Speech-to-Text Admin</title>
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="stylesheet" href="/admin/assets/admin.css">
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div>
        <h1>Speech-to-Text Admin</h1>
        <p>Local API status and client token management.</p>
      </div>
      <div class="top-actions">
        <button id="themeToggle" class="secondary" type="button" aria-pressed="false">Dark</button>
        <div class="status-pill" id="overallStatus">Locked</div>
      </div>
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
        <h2>TalkToMe Settings</h2>
        <button id="copyTalkToMeSettings" type="button">Copy</button>
      </div>
      <div class="settings-form">
        <label>
          Endpoint
          <input id="talkToMeEndpoint" value="https://speech-to-text.huis/v1/transcriptions">
        </label>
        <label>
          CA file
          <input id="talkToMeCaFile" placeholder="/etc/ssl/certs/huis-root-ca.pem">
        </label>
      </div>
      <pre class="settings-code"><code id="talkToMeSettings"></code></pre>
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

    <section class="panel">
      <div class="panel-head">
        <h2>Client Logs</h2>
        <div class="log-controls">
          <input id="logSince" value="10 minutes ago" aria-label="Log window">
          <input id="logLimit" type="number" min="1" max="200" value="80" aria-label="Log limit">
          <button id="refreshLogs" type="button">Refresh</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="logs-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Client</th>
              <th>Flow</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody id="logsTable">
            <tr><td colspan="5">Unlock to load client logs.</td></tr>
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

module.exports = {
  renderAdminHtml
};
