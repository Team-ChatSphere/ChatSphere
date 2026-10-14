// All runtime configuration comes from environment variables (SRS 6.4). Locally
// they're read from server/.env (copy .env.example); CI and Docker set them directly.
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} (see server/.env.example)`);
  return value;
}

function loadConfig() {
  return {
    port: Number(process.env.PORT) || 4000,
    mongoUri: required('MONGO_URI'),
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    jwtSecret: required('JWT_SECRET'),
    // Comma-separated list of browser origins allowed to call the API / open sockets.
    clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()),
  };
}

module.exports = { loadConfig };
