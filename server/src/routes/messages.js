// GET /api/messages/:conversationId (FR-018, SAD 3.2.1). Mounted behind the JWT
// Auth Middleware (CS-07), which rejects missing/invalid tokens with 401 and sets
// req.user = { id, username }.
const express = require('express');
const { AppError, toErrorBody } = require('../utils/errors');

function createMessagesRouter({ service }) {
  const router = express.Router();

  router.get('/:conversationId', async (req, res) => {
    try {
      const result = await service.getHistory({
        userId: req.user.id,
        conversationId: req.params.conversationId,
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      res.json(result);
    } catch (err) {
      if (!(err instanceof AppError)) console.error('GET /api/messages failed', err);
      res.status(err instanceof AppError ? err.status : 500).json({ error: toErrorBody(err) });
    }
  });

  return router;
}

module.exports = { createMessagesRouter };
