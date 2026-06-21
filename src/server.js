const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const Fastify = require('fastify');
const multipart = require('@fastify/multipart');

const { registerAdminRoutes } = require('./admin/routes');
const { createClientKeyManager } = require('./auth/clientKeys');
const { getReadiness, loadEnvFileIfPresent, parseConfig } = require('./config');
const { registerDiscoveryRoutes } = require('./discovery/routes');
const {
  ApiError,
  audioTooLarge,
  invalidRequest,
  unauthorized,
  unsupportedMedia
} = require('./errors');
const { transcribeWithOpenAI } = require('./transcribers/openai');

const FAVICON_PATH = path.join(__dirname, 'assets', 'favicon.png');

const SUPPORTED_AUDIO_TYPES = new Set([
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mpga'
]);

function buildServer({
  config = parseConfig(),
  keyManager = createClientKeyManager({
    envTokens: config.clientApiKeys,
    keysFile: config.clientKeysFile
  }),
  transcriber = transcribeWithOpenAI,
  adminLogReader,
  logger = {
    level: 'info',
    redact: ['req.headers.authorization']
  }
} = {}) {
  const app = Fastify({
    logger,
    genReqId: () => `req_${crypto.randomUUID().replaceAll('-', '')}`
  });

  app.register(multipart, {
    limits: {
      fileSize: config.maxAudioBytes,
      files: 1,
      fields: 3
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const apiError = normalizeError(error);
    const durationMs = getRequestDurationMs(request);
    logClientResponse(request, {
      statusCode: apiError.statusCode,
      errorCode: apiError.code,
      durationMs,
      transcriptLogged: false
    });
    request.log.warn(
      {
        code: apiError.code,
        statusCode: apiError.statusCode,
        request_id: request.id,
        client_id: request.client?.id,
        client_label: request.client?.label
      },
      'request failed'
    );
    reply.status(apiError.statusCode).send({
      error: {
        code: apiError.code,
        message: apiError.expose ? apiError.message : 'Request failed.',
        request_id: request.id
      }
    });
  });

  registerDiscoveryRoutes(app);

  app.get('/healthz', async () => ({
    ok: true,
    service: 'speech-to-text'
  }));

  app.get('/', async (_request, reply) => {
    reply.redirect('/admin');
  });

  app.get('/favicon.ico', async (_request, reply) => {
    return sendFavicon(reply);
  });

  app.get('/favicon.png', async (_request, reply) => {
    return sendFavicon(reply);
  });

  app.get('/readyz', async (request, reply) => {
    const readiness = getReadiness(config);
    if (!readiness.ok) {
      reply.status(503);
      return {
        ok: false,
        error: readiness.missing[0]
      };
    }
    return {
      ok: true,
      model: config.transcriptionModel,
      provider: 'openai'
    };
  });

  app.post('/v1/transcriptions', { preHandler: authenticateClient(keyManager) }, async (request) => {
    request.transcriptionStartedAt = process.hrtime.bigint();
    const audio = await readMultipartAudio(request, config);
    logClientAudio(request, audio);
    const result = await transcriber({
      apiKey: config.openaiApiKey,
      audioBuffer: audio.buffer,
      mimeType: audio.mimeType,
      language: audio.language,
      model: config.transcriptionModel,
      timeoutMs: config.requestTimeoutMs
    });
    const durationMs = getRequestDurationMs(request);

    request.log.info(
      {
        request_id: request.id,
        client_id: request.client?.id,
        client_label: request.client?.label,
        client_source: request.client?.source,
        audio_bytes: audio.buffer.length,
        mime_type: audio.mimeType,
        duration_ms: durationMs,
        provider: result.provider,
        model: result.model,
        transcript_logged: config.logTranscripts
      },
      'transcription complete'
    );

    const response = {
      text: result.text,
      model: result.model,
      provider: result.provider,
      duration_ms: durationMs,
      request_id: request.id
    };
    logClientResponse(request, {
      statusCode: 200,
      durationMs,
      provider: result.provider,
      model: result.model,
      responseTextChars: result.text.length,
      transcriptLogged: config.logTranscripts
    });
    if (config.logTranscripts) {
      request.log.info(
        {
          request_id: request.id,
          client_id: request.client?.id,
          client_label: request.client?.label,
          text: result.text
        },
        'transcript text'
      );
    }
    return response;
  });

  registerAdminRoutes(app, { config, keyManager, logReader: adminLogReader });

  return app;
}

async function sendFavicon(reply) {
  const favicon = await fs.readFile(FAVICON_PATH);
  reply.type('image/png');
  return favicon;
}

function authenticateClient(keyManager) {
  return async function clientAuth(request) {
    const authorization = String(request.headers.authorization || '');
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      throw unauthorized();
    }
    const client = keyManager.verifyToken(match[1]);
    if (!client) {
      throw unauthorized();
    }
    request.client = client;
    request.transcriptionStartedAt = process.hrtime.bigint();
    logClientRequest(request);
  };
}

function logClientRequest(request) {
  request.log.info(
    {
      request_id: request.id,
      client_id: request.client?.id,
      client_label: request.client?.label,
      client_source: request.client?.source,
      method: request.method,
      route: request.routeOptions?.url || request.url,
      remote_address: request.ip,
      user_agent: request.headers['user-agent'] || '',
      content_type: request.headers['content-type'] || '',
      content_length: request.headers['content-length'] || ''
    },
    'client request received'
  );
}

function logClientAudio(request, audio) {
  request.log.info(
    {
      request_id: request.id,
      client_id: request.client?.id,
      client_label: request.client?.label,
      client_source: request.client?.source,
      audio_bytes: audio.buffer.length,
      mime_type: audio.mimeType,
      language: audio.language || '',
      language_present: Boolean(audio.language)
    },
    'client audio received'
  );
}

function logClientResponse(
  request,
  {
    statusCode,
    durationMs,
    provider = undefined,
    model = undefined,
    responseTextChars = undefined,
    errorCode = undefined,
    transcriptLogged = false
  }
) {
  if (!request.client) {
    return;
  }
  request.log.info(
    {
      request_id: request.id,
      client_id: request.client.id,
      client_label: request.client.label,
      client_source: request.client.source,
      status_code: statusCode,
      error_code: errorCode,
      duration_ms: durationMs,
      provider,
      model,
      response_text_chars: responseTextChars,
      transcript_logged: transcriptLogged
    },
    'client response sent'
  );
}

function getRequestDurationMs(request) {
  if (!request.transcriptionStartedAt) {
    return undefined;
  }
  return Number((process.hrtime.bigint() - request.transcriptionStartedAt) / 1000000n);
}

async function readMultipartAudio(request, config) {
  if (!request.isMultipart()) {
    throw invalidRequest('Request must be multipart/form-data.');
  }

  let fileSeen = false;
  let language = '';
  let mimeType = '';
  let audioBuffer;

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file') {
          throw invalidRequest(`Unsupported file field "${part.fieldname}".`);
        }
        if (fileSeen) {
          throw invalidRequest('Only one audio file may be uploaded.');
        }
        fileSeen = true;
        mimeType = normalizeMimeType(part.mimetype);
        if (!SUPPORTED_AUDIO_TYPES.has(mimeType)) {
          drainFile(part).catch(() => {});
          throw unsupportedMedia(`Unsupported audio MIME type: ${part.mimetype || 'unknown'}.`);
        }
        audioBuffer = await readFileBuffer(part, config.maxAudioBytes);
      } else {
        if (part.fieldname === 'language') {
          language = String(part.value || '').trim();
        } else if (part.fieldname === 'model') {
          throw invalidRequest('The transcription model is controlled by the server.');
        } else {
          throw invalidRequest(`Unsupported field "${part.fieldname}".`);
        }
      }
    }
  } catch (error) {
    if (error.code === 'FST_REQ_FILE_TOO_LARGE' || /File size limit exceeded/i.test(error.message)) {
      throw audioTooLarge(`Audio exceeds the ${config.maxAudioBytes} byte limit.`);
    }
    throw error;
  }

  if (!fileSeen || !audioBuffer) {
    throw invalidRequest('Missing required audio file field "file".');
  }
  if (audioBuffer.length === 0) {
    throw invalidRequest('Audio file is empty.');
  }

  return {
    buffer: audioBuffer,
    mimeType,
    language
  };
}

async function readFileBuffer(part, maxBytes) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of part.file) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw audioTooLarge(`Audio exceeds the ${maxBytes} byte limit.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function drainFile(part) {
  for await (const _chunk of part.file) {
    // discard unsupported uploads so the connection can close cleanly
  }
}

function normalizeMimeType(mimeType) {
  return String(mimeType || '').split(';')[0].trim().toLowerCase();
}

function normalizeError(error) {
  if (error instanceof ApiError) {
    return error;
  }
  if (error.statusCode === 413) {
    return audioTooLarge(error.message || 'Audio exceeds the configured size limit.');
  }
  if (error.statusCode >= 400 && error.statusCode < 500) {
    return invalidRequest(error.message || 'Invalid request.');
  }
  return new ApiError(500, 'internal_error', 'Internal server error.', {
    cause: error,
    expose: false
  });
}

async function start() {
  loadEnvFileIfPresent();
  const config = parseConfig();
  const app = buildServer({ config });
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = {
  SUPPORTED_AUDIO_TYPES,
  buildServer,
  readMultipartAudio
};
