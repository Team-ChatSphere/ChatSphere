const express = require('express');
const { AppError, toErrorBody } = require('../utils/errors');

function createUsersRouter({ UserModel }) {
  if (!UserModel) throw new Error('UserModel is required');
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const search = String(req.query.search || '').trim();
      if (search.length > 50) throw new AppError('VALIDATION_FAILED', 'Search must be at most 50 characters');
      if (search.length < 2) return res.json({ users: [] });
      const escaped = search.split('').map((char) => ('\\^$.*+?()[]{}|'.includes(char) ? `\\${char}` : char)).join('');
      const users = await UserModel.find({
        _id: { $ne: req.user.id },
        username: { $regex: escaped, $options: 'i' },
      }).select('_id username status').sort({ username: 1 }).limit(10).lean();
      return res.json({ users: users.map((user) => ({ userId: String(user._id), username: user.username, status: user.status })) });
    } catch (err) {
      if (!(err instanceof AppError)) console.error('GET /api/users search failed', err);
      return res.status(err instanceof AppError ? err.status : 500).json({ error: toErrorBody(err) });
    }
  });

  return router;
}

module.exports = { createUsersRouter };
