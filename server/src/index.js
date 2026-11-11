// Entry point: `npm start` / `npm run dev`. Reads config, connects MongoDB, starts the server.
const mongoose = require('mongoose');
const { loadConfig } = require('./config');
const { createServer } = require('./server');
const { createGateway } = require('./gateway');

async function main() {
  const config = loadConfig();
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  const gateway = createGateway({ jwtSecret: config.jwtSecret, jwtExpiresIn: config.jwtExpiresIn });
  const { httpServer, io } = createServer({
    clientOrigins: config.clientOrigins,
    registerRoutes: gateway.registerRoutes,
    registerSockets: gateway.registerSockets,
  });

  httpServer.listen(config.port, () => console.log(`ChatSphere server on http://localhost:${config.port}`));

  const shutdown = async () => {
    io.close();
    httpServer.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
