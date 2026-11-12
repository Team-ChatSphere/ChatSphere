// Express app (SAD 2.2 REST API). Routes are added by each service; this file only
// holds what every route shares: JSON parsing, CORS, 404 and the error shape (SAD 3.3).
const express = require('express');
const cors = require('cors');
const { AppError, toErrorBody } = require('./utils/errors');

/**
 * @param {object} options
 * @param {string[]} options.clientOrigins  browser origins allowed by CORS
 * @param {(app: import('express').Express) => void} [options.registerRoutes]  mounts service routes
 */
function createApp({ clientOrigins, registerRoutes } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: clientOrigins }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  if (registerRoutes) registerRoutes(app);

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
  });

  // Malformed JSON bodies are a client error; anything else unexpected is a 500 without detail.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Request body is not valid JSON' } });
    }
    if (!(err instanceof AppError)) console.error(`${req.method} ${req.path} failed`, err);
    return res.status(err instanceof AppError ? err.status : 500).json({ error: toErrorBody(err) });
  });

  return app;
}

module.exports = { createApp };
