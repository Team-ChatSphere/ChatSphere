// JWT Auth Middleware (SAD 2.2, 2.4): one place that checks the token for both
// REST and the Socket.IO handshake (FR-004, SEC-004).
const { AppError, toErrorBody } = require('../utils/errors');

// REST: `Authorization: Bearer <token>` → req.user = { id, username }, else 401.
function createJwtAuth(authService) {
  return function jwtAuth(req, res, next) {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    try {
      if (scheme !== 'Bearer' || !token) throw new AppError('AUTH_INVALID_TOKEN', 'Missing bearer token');
      req.user = authService.verifyToken(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Socket.IO: token in `handshake.auth.token` → socket.user, else the connection is refused
// and the client gets `connect_error` with `err.message === 'AUTH_INVALID_TOKEN'`.
function createSocketJwtAuth(authService) {
  return function socketJwtAuth(socket, next) {
    try {
      socket.user = authService.verifyToken(socket.handshake.auth?.token);
      next();
    } catch (err) {
      const refused = new Error('AUTH_INVALID_TOKEN');
      refused.data = toErrorBody(err);
      next(refused);
    }
  };
}

module.exports = { createJwtAuth, createSocketJwtAuth };
