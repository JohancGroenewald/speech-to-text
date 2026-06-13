const crypto = require('node:crypto');

const { getReadiness } = require('../config');
const { ApiError, invalidRequest, unauthorized } = require('../errors');
const { renderAdminHtml } = require('./page');
const { ADMIN_CLIENT_SCRIPT } = require('./clientScript');
const { ADMIN_CSS } = require('./styles');

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
    return ADMIN_CLIENT_SCRIPT;
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

module.exports = {
  registerAdminRoutes
};
