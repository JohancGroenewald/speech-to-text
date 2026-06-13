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

module.exports = {
  renderAdminHtml
};
