// Entry point: `npm start` / `npm run dev`. Reads config, connects MongoDB, starts the server.
const mongoose = require('mongoose');
const { loadConfig } = require('./config');
const { createServer } = require('./server');

async function main() {
  const config = loadConfig();
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  const { httpServer, io } = createServer({
    clientOrigins: config.clientOrigins,
    registerRoutes() {
      // CS-03 / CS-05 (auth routes) and CS-07 (jwtAuth) plug in here, e.g.
      //   app.use('/api/auth', authRouter);
      //   app.use('/api/messages', jwtAuth, createMessagesRouter({ service: messagingService }));
      // See docs/INTEGRATION.md section 2.
    },
    registerSockets() {
      // CS-07: io.use(socketJwtAuth) and io.on('connection', ...) that joins `user:<id>`
      // and calls registerMessagingHandlers / registerRoomHandlers (docs/INTEGRATION.md section 2).
    },
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
