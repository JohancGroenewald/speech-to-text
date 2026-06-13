const { execFile } = require('node:child_process');

const LOG_EVENTS = new Set([
  'client request received',
  'client audio received',
  'transcription complete',
  'client response sent',
  'request failed'
]);

function createJournalLogReader({
  unit = 'speech-to-text',
  journalctl = 'journalctl',
  timeoutMs = 5000
} = {}) {
  return {
    readLogs({ since = '10 minutes ago', limit = 80 } = {}) {
      const safeLimit = clampLimit(limit);
      const journalLimit = Math.min(Math.max(safeLimit * 12, 400), 1200);
      return new Promise((resolve, reject) => {
        execFile(
          journalctl,
          [
            '-u',
            unit,
            '--since',
            String(since || '10 minutes ago'),
            '--output',
            'json',
            '--no-pager',
            '-n',
            String(journalLimit)
          ],
          {
            encoding: 'utf8',
            timeout: timeoutMs,
            maxBuffer: 1024 * 1024
          },
          (error, stdout, stderr) => {
            if (error) {
              error.message = stderr.trim() || error.message;
              reject(error);
              return;
            }
            resolve(parseJournalLogLines(stdout).slice(-safeLimit));
          }
        );
      });
    }
  };
}

function parseJournalLogLines(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map(parseJournalLine)
    .filter(Boolean);
}

function parseJournalLine(line) {
  if (!line.trim()) {
    return undefined;
  }

  let journalEntry;
  try {
    journalEntry = JSON.parse(line);
  } catch {
    return undefined;
  }

  let payload;
  try {
    payload = JSON.parse(journalEntry.MESSAGE || '');
  } catch {
    return undefined;
  }

  if (!LOG_EVENTS.has(payload.msg)) {
    return undefined;
  }

  return sanitizeLogPayload(payload, journalEntry);
}

function sanitizeLogPayload(payload, journalEntry = {}) {
  return {
    timestamp: getTimestamp(payload, journalEntry),
    event: payload.msg,
    level: payload.level,
    request_id: payload.request_id || payload.reqId || '',
    client_id: payload.client_id || '',
    client_label: payload.client_label || '',
    client_source: payload.client_source || '',
    method: payload.method,
    route: payload.route,
    remote_address: payload.remote_address,
    user_agent: payload.user_agent,
    content_type: payload.content_type,
    content_length: payload.content_length,
    audio_bytes: payload.audio_bytes,
    mime_type: payload.mime_type,
    language: payload.language,
    language_present: payload.language_present,
    status_code: payload.status_code || payload.statusCode,
    error_code: payload.error_code || payload.code,
    duration_ms: payload.duration_ms,
    provider: payload.provider,
    model: payload.model,
    response_text_chars: payload.response_text_chars,
    transcript_logged: payload.transcript_logged
  };
}

function getTimestamp(payload, journalEntry) {
  if (journalEntry.__REALTIME_TIMESTAMP) {
    return new Date(Number(journalEntry.__REALTIME_TIMESTAMP) / 1000).toISOString();
  }
  if (payload.time) {
    return new Date(Number(payload.time)).toISOString();
  }
  return new Date().toISOString();
}

function clampLimit(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    return 80;
  }
  return Math.min(Math.max(parsed, 1), 200);
}

module.exports = {
  createJournalLogReader,
  parseJournalLogLines
};
