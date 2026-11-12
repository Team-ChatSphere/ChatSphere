// HTTP + Socket.IO server (SAD 2.1: REST API and WebSocket Gateway share one port).
const http = require('http');
const { Server } = require('socket.io');
const { createApp } = require('./app');

/**
 * Builds the server without listening, so tests can start it on a random port.
 * @param {object} options
 * @param {string[]} options.clientOrigins
 * @param {(app) => void} [options.registerRoutes]  REST routes (each service)
 * @param {(io) => void} [options.registerSockets]  io.use(...) auth + io.on('connection', ...) (CS-07)
 */
function createServer({ clientOrigins, registerRoutes, registerSockets } = {}) {
  const app = createApp({ clientOrigins, registerRoutes });
  const httpServer = http.createServer(app);
  // WebSocket transport is required; polling is only the Socket.IO fallback (SRS 2.4).
  const io = new Server(httpServer, { cors: { origin: clientOrigins } });
  if (registerSockets) registerSockets(io);
  return { app, httpServer, io };
}

module.exports = { createServer };
