// Shared error shape for REST and Socket.IO (SAD 3.3): { code, message }.
const HTTP_STATUS = {
  VALIDATION_FAILED: 400,
  AUTH_INVALID_TOKEN: 401,
  AUTH_FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.status = HTTP_STATUS[code] || 500;
  }
}

// Unexpected errors never leak internal detail to the client.
function toErrorBody(err) {
  if (err instanceof AppError) return { code: err.code, message: err.message };
  return { code: 'INTERNAL_ERROR', message: 'Something went wrong' };
}

module.exports = { AppError, HTTP_STATUS, toErrorBody };
