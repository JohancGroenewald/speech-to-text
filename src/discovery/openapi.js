const OPENAPI_DOCUMENT = {
  openapi: '3.1.0',
  info: {
    title: 'Huis Speech-to-Text API',
    version: '0.1.0',
    description:
      'LAN speech-to-text API for TalkToMe and trusted local clients. The service accepts authenticated multipart audio uploads and returns transcript JSON.'
  },
  servers: [
    {
      url: 'https://speech-to-text.huis',
      description: 'Huis LAN HTTPS endpoint'
    }
  ],
  tags: [
    { name: 'Discovery' },
    { name: 'Health' },
    { name: 'Transcription' },
    { name: 'Admin' }
  ],
  paths: {
    '/llms.txt': {
      get: {
        tags: ['Discovery'],
        summary: 'Short LLM usage guide',
        responses: {
          200: { description: 'Plain-text LLM guidance' }
        }
      }
    },
    '/llms-full.txt': {
      get: {
        tags: ['Discovery'],
        summary: 'Detailed LLM usage guide',
        responses: {
          200: { description: 'Detailed plain-text LLM guidance' }
        }
      }
    },
    '/openapi.json': {
      get: {
        tags: ['Discovery'],
        summary: 'OpenAPI schema',
        responses: {
          200: {
            description: 'OpenAPI 3.1 document',
            content: { 'application/json': { schema: { type: 'object' } } }
          }
        }
      }
    },
    '/healthz': {
      get: {
        tags: ['Health'],
        summary: 'Liveness check',
        responses: {
          200: {
            description: 'Service process is running',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } }
          }
        }
      }
    },
    '/readyz': {
      get: {
        tags: ['Health'],
        summary: 'Readiness check',
        responses: {
          200: {
            description: 'Service is ready',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Ready' } } }
          },
          503: {
            description: 'Missing server configuration',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadyError' } } }
          }
        }
      }
    },
    '/v1/transcriptions': {
      post: {
        tags: ['Transcription'],
        summary: 'Transcribe one audio file',
        security: [{ clientBearer: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                additionalProperties: false,
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Audio file. Maximum deployed size is 25 MB.'
                  },
                  language: {
                    type: 'string',
                    description: 'Optional language hint, such as en or af.'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Transcription result',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Transcription' } }
            }
          },
          400: { $ref: '#/components/responses/Error' },
          401: { $ref: '#/components/responses/Error' },
          413: { $ref: '#/components/responses/Error' },
          415: { $ref: '#/components/responses/Error' },
          422: { $ref: '#/components/responses/Error' },
          502: { $ref: '#/components/responses/Error' },
          504: { $ref: '#/components/responses/Error' }
        }
      }
    },
    '/admin/api/status': {
      get: {
        tags: ['Admin'],
        summary: 'Read operational status',
        security: [{ adminBearer: [] }],
        responses: {
          200: {
            description: 'Admin status',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminStatus' } } }
          },
          401: { $ref: '#/components/responses/Error' },
          503: { $ref: '#/components/responses/Error' }
        }
      }
    },
    '/admin/api/client-keys': {
      get: {
        tags: ['Admin'],
        summary: 'List sanitized client keys',
        security: [{ adminBearer: [] }],
        responses: {
          200: {
            description: 'Client key list',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ClientKeyList' } } }
          },
          401: { $ref: '#/components/responses/Error' }
        }
      },
      post: {
        tags: ['Admin'],
        summary: 'Create a client key',
        security: [{ adminBearer: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateClientKeyRequest' } }
          }
        },
        responses: {
          201: {
            description: 'Created client token. The token is returned once.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatedClientKey' } } }
          },
          400: { $ref: '#/components/responses/Error' },
          401: { $ref: '#/components/responses/Error' }
        }
      }
    },
    '/admin/api/client-keys/{id}': {
      delete: {
        tags: ['Admin'],
        summary: 'Revoke a client key',
        security: [{ adminBearer: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Key revoked',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Ok' } } }
          },
          401: { $ref: '#/components/responses/Error' },
          404: { $ref: '#/components/responses/Error' }
        }
      }
    },
    '/admin/api/logs': {
      get: {
        tags: ['Admin'],
        summary: 'Read sanitized client audit logs',
        security: [{ adminBearer: [] }],
        parameters: [
          { name: 'since', in: 'query', required: false, schema: { type: 'string', default: '10 minutes ago' } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200, default: 80 } }
        ],
        responses: {
          200: {
            description: 'Sanitized client logs',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ClientLogs' } } }
          },
          401: { $ref: '#/components/responses/Error' },
          503: { $ref: '#/components/responses/Error' }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      clientBearer: { type: 'http', scheme: 'bearer', description: 'Speech-to-text client token.' },
      adminBearer: { type: 'http', scheme: 'bearer', description: 'ADMIN_API_TOKEN.' }
    },
    responses: {
      Error: {
        description: 'Stable JSON error response',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } }
      }
    },
    schemas: {
      Health: {
        type: 'object',
        required: ['ok', 'service'],
        properties: { ok: { const: true }, service: { const: 'speech-to-text' } }
      },
      Ready: {
        type: 'object',
        required: ['ok', 'model', 'provider'],
        properties: { ok: { const: true }, model: { type: 'string' }, provider: { const: 'openai' } }
      },
      ReadyError: {
        type: 'object',
        required: ['ok', 'error'],
        properties: { ok: { const: false }, error: { $ref: '#/components/schemas/ErrorDetail' } }
      },
      Transcription: {
        type: 'object',
        required: ['text', 'model', 'provider', 'duration_ms', 'request_id'],
        properties: {
          text: { type: 'string' },
          model: { type: 'string', example: 'gpt-4o-transcribe' },
          provider: { type: 'string', example: 'openai' },
          duration_ms: { type: 'integer', minimum: 0 },
          request_id: { type: 'string', pattern: '^req_' }
        }
      },
      ErrorEnvelope: {
        type: 'object',
        required: ['error'],
        properties: { error: { $ref: '#/components/schemas/ErrorDetail' } }
      },
      ErrorDetail: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          request_id: { type: 'string' }
        }
      },
      AdminStatus: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          missing: { type: 'array', items: { $ref: '#/components/schemas/ErrorDetail' } },
          service: { const: 'speech-to-text' },
          model: { type: 'string' },
          provider: { const: 'openai' },
          max_audio_bytes: { type: 'integer' },
          request_timeout_ms: { type: 'integer' },
          log_transcripts: { type: 'boolean' },
          node: { type: 'string' }
        }
      },
      ClientKey: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          notes: { type: 'string' },
          source: { type: 'string' },
          created_at: { type: ['string', 'null'] },
          last_used_at: { type: ['string', 'null'] },
          revoked_at: { type: ['string', 'null'] }
        }
      },
      ClientKeyList: {
        type: 'object',
        required: ['keys'],
        properties: { keys: { type: 'array', items: { $ref: '#/components/schemas/ClientKey' } } }
      },
      CreateClientKeyRequest: {
        type: 'object',
        required: ['label'],
        properties: { label: { type: 'string' }, notes: { type: 'string' } }
      },
      CreatedClientKey: {
        type: 'object',
        required: ['token', 'key'],
        properties: { token: { type: 'string', pattern: '^stt_' }, key: { $ref: '#/components/schemas/ClientKey' } }
      },
      Ok: {
        type: 'object',
        required: ['ok'],
        properties: { ok: { const: true } }
      },
      ClientLogs: {
        type: 'object',
        properties: { logs: { type: 'array', items: { type: 'object' } } }
      }
    }
  }
};

module.exports = {
  OPENAPI_DOCUMENT
};
