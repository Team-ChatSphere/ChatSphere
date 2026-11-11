// Entry point: `npm start` / `npm run dev`. Reads config, connects MongoDB, starts the server.
const mongoose = require('mongoose');
const { createClient } = require('redis');
const { loadConfig } = require('./config');
const { createServer } = require('./server');
const { createGateway } = require('./gateway');
const { createPresenceService } = require('./services/presence/presenceService');

async function main() {
  const config = loadConfig();
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  const redis = createClient({ url: config.redisUrl });
  redis.on('error', (err) => console.error('Redis presence error:', err.message));
  try {
    await redis.connect();
  } catch (err) {
    console.error('Redis unavailable; presence updates are disabled until Redis reconnects:', err.message);
  }

  const gateway = createGateway({
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
    presence: createPresenceService({ redis }),
  });
  const { httpServer, io } = createServer({
    clientOrigins: config.clientOrigins,
    registerRoutes: gateway.registerRoutes,
    registerSockets: gateway.registerSockets,
  });

  httpServer.listen(config.port, () => console.log(`ChatSphere server on http://localhost:${config.port}`));

  const shutdown = async () => {
    await new Promise((resolve) => io.close(resolve));
    await gateway.drainPresence();
    if (redis.isReady) await redis.quit();
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
