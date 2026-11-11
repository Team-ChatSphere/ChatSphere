// Starts the full ChatSphere stack (REST + Socket.IO + services) on a random port against the
// in-memory MongoDB, plus helpers to register/login users and connect real socket clients.
const { io: connect } = require('socket.io-client');
const { createServer } = require('../../src/server');
const { createGateway } = require('../../src/gateway');

const JWT_SECRET = 'e2e-secret';

async function startStack(options = {}) {
  const gateway = createGateway({ jwtSecret: JWT_SECRET, bcryptRounds: 4, ...options });
  const server = createServer({
    clientOrigins: ['http://localhost:5173'],
    registerRoutes: gateway.registerRoutes,
    registerSockets: gateway.registerSockets,
  });
  await new Promise((resolve) => server.httpServer.listen(0, resolve));
  const base = `http://localhost:${server.httpServer.address().port}`;
  const clients = [];

  async function api(method, path, { body, token } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, { method, headers, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  // Registers and logs in; returns { id, username, token }.
  async function user(username) {
    const password = 'Passw0rd!';
    const reg = await api('POST', '/api/auth/register', { body: { username, email: `${username}@example.com`, password } });
    const login = await api('POST', '/api/auth/login', { body: { usernameOrEmail: username, password } });
    return { id: reg.body.userId, username, token: login.body.token };
  }

  // Connects over WebSocket and resolves once the gateway has finished setting up the session.
  function socketFor(token, opts = {}) {
    const socket = connect(base, { transports: ['websocket'], reconnection: false, auth: { token }, ...opts });
    clients.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('session:ready', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  async function stop() {
    clients.forEach((c) => c.close());
    server.io.close();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }

  return { base, gateway, api, user, socketFor, stop };
}

// Resolves with the next payload of `event` on `socket` (rejects after `ms`).
function next(socket, event, ms = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

// Emits with an ack and resolves with the ack payload.
function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

module.exports = { startStack, next, emitAck, JWT_SECRET };
