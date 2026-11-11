// SEC-005: per-connection rate limit on message:send (token bucket). A burst of up to
// `capacity` messages is allowed, refilling at `refillPerSec`. Over the limit the send is
// refused with RATE_LIMITED before any handler runs, so nothing is stored or broadcast.
const { toErrorBody, AppError } = require('../utils/errors');
const { securityLog } = require('../utils/securityLog');

const DEFAULTS = { capacity: 10, refillPerSec: 2, events: ['message:send'] };

function createTokenBucket({ capacity, refillPerSec, now = () => Date.now() }) {
  let tokens = capacity;
  let last = now();
  return function take() {
    const t = now();
    tokens = Math.min(capacity, tokens + ((t - last) / 1000) * refillPerSec);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

// Socket.IO per-socket middleware: socket.use(rateLimitMiddleware(socket, options)).
function rateLimitMiddleware(socket, options = {}) {
  const { capacity, refillPerSec, events, now } = { ...DEFAULTS, ...options };
  const take = createTokenBucket({ capacity, refillPerSec, now });
  let warned = false;

  return function rateLimit(packet, next) {
    const [event, ...args] = packet;
    if (!events.includes(event)) return next();
    if (take()) {
      warned = false;
      return next();
    }
    const body = toErrorBody(new AppError('RATE_LIMITED', 'You are sending messages too fast. Please slow down.'));
    // Log once per burst, not once per dropped message.
    if (!warned) securityLog('rate_limited', { userId: socket.user?.id, socketEvent: event });
    warned = true;
    const ack = args[args.length - 1];
    socket.emit('error', body);
    if (typeof ack === 'function') ack({ ok: false, error: body });
    return undefined; // not calling next(): the event never reaches a handler
  };
}

module.exports = { rateLimitMiddleware, createTokenBucket, DEFAULTS };
