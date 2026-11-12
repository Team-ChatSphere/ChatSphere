// POST /api/auth/register and /api/auth/login (SAD 3.2.1). No JWT needed for these two.
const express = require('express');

function createAuthRouter({ authService }) {
  const router = express.Router();

  router.post('/register', async (req, res, next) => {
    try {
      const { username, email, password } = req.body || {};
      res.status(201).json(await authService.register({ username, email, password }));
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const { usernameOrEmail, password } = req.body || {};
      const { token } = await authService.login({ usernameOrEmail, password });
      res.json({ token });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAuthRouter };
