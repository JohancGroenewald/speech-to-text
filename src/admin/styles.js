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
  --input-bg: #ffffff;
  --code-bg: #0f172a;
  --code-text: #e2e8f0;
  --token-bg: #edfafa;
  --ok-bg: #ecfdf3;
  --warn-bg: #fff7ed;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #111315;
  --panel: #1a1d20;
  --panel-muted: #23282d;
  --text: #edf1f5;
  --muted: #a7b0ba;
  --border: #343b43;
  --accent: #58b8a7;
  --accent-strong: #76cfc0;
  --danger: #ee6b63;
  --ok: #6fd39a;
  --warn: #f4b15e;
  --input-bg: #121518;
  --code-bg: #111315;
  --code-text: #dce6ec;
  --token-bg: #122524;
  --ok-bg: #14251d;
  --warn-bg: #2a2114;
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

.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
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
  background: var(--ok-bg);
}

.status-pill.warn {
  color: var(--warn);
  border-color: rgba(161, 92, 7, 0.25);
  background: var(--warn-bg);
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
  background: var(--input-bg);
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
  background: var(--token-bg);
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
  background: var(--input-bg);
  white-space: nowrap;
}

.settings-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.settings-code {
  margin: 12px 0 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  background: var(--code-bg);
  color: var(--code-text);
  overflow: auto;
}

.settings-code code {
  font-size: 13px;
  white-space: pre;
}

.log-controls {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 86px auto;
  gap: 8px;
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

.logs-table {
  min-width: 960px;
}

.logs-table td:last-child {
  color: var(--muted);
}

.log-event {
  display: inline-block;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 8px;
  background: var(--panel-muted);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
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
  .inline-form,
  .log-controls {
    align-items: stretch;
    flex-direction: column;
  }

  .log-controls {
    display: flex;
  }

  .grid,
  .facts {
    grid-template-columns: 1fr;
  }
}
`;

module.exports = {
  ADMIN_CSS
};
