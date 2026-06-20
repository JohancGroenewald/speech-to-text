const { LLMS_FULL_TXT, LLMS_TXT } = require('./llms');
const { OPENAPI_DOCUMENT } = require('./openapi');

function registerDiscoveryRoutes(app) {
  app.get('/llms.txt', async (_request, reply) => {
    reply.type('text/plain; charset=utf-8');
    return LLMS_TXT;
  });

  app.get('/llms-full.txt', async (_request, reply) => {
    reply.type('text/plain; charset=utf-8');
    return LLMS_FULL_TXT;
  });

  app.get('/openapi.json', async (_request, reply) => {
    reply.type('application/json; charset=utf-8');
    return OPENAPI_DOCUMENT;
  });
}

module.exports = {
  registerDiscoveryRoutes
};
