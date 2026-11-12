const { io: connect } = require('socket.io-client');
const { createServer } = require('../src/server');

// Starts the real HTTP + Socket.IO server on a random port.
function start(options) {
  const server = createServer({ clientOrigins: ['http://localhost:5173'], ...options });
  return new Promise((resolve) => {
    server.httpServer.listen(0, () => resolve({ ...server, port: server.httpServer.address().port }));
  });
}

async function stop({ io, httpServer }) {
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
}

describe('HTTP + Socket.IO server (CS-01)', () => {
  test('a client connects over WebSocket and reaches the registered socket handlers', async () => {
    const server = await start({
      registerSockets(io) {
        io.on('connection', (socket) => socket.on('ping', (ack) => ack('pong')));
      },
    });
    const client = connect(`http://localhost:${server.port}`, { transports: ['websocket'] });

    const reply = await new Promise((resolve, reject) => {
      client.on('connect_error', reject);
      client.on('connect', () => client.emit('ping', resolve));
    });

    expect(reply).toBe('pong');
    expect(client.io.engine.transport.name).toBe('websocket');
    client.close();
    await stop(server);
  });

  test('registerSockets can reject a handshake (where the CS-07 JWT check plugs in)', async () => {
    const server = await start({
      registerSockets(io) {
        io.use((socket, next) => next(new Error('AUTH_INVALID_TOKEN')));
      },
    });
    const client = connect(`http://localhost:${server.port}`, { transports: ['websocket'], reconnection: false });

    const err = await new Promise((resolve) => client.on('connect_error', resolve));

    expect(err.message).toBe('AUTH_INVALID_TOKEN');
    client.close();
    await stop(server);
  });

  test('REST and Socket.IO share one port', async () => {
    const server = await start();

    const res = await fetch(`http://localhost:${server.port}/api/health`);

    expect(await res.json()).toEqual({ status: 'ok' });
    await stop(server);
  });
});
