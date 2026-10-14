const { loadConfig } = require('../src/config');

const ENV_KEYS = ['PORT', 'MONGO_URI', 'REDIS_URL', 'JWT_SECRET', 'CLIENT_ORIGIN'];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
});
afterEach(() => {
  ENV_KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
});

describe('config from environment (SRS 6.4)', () => {
  test('reads values and applies defaults', () => {
    process.env.MONGO_URI = 'mongodb://db/chat';
    process.env.JWT_SECRET = 's3cret';
    process.env.CLIENT_ORIGIN = 'http://a.test, http://b.test';

    expect(loadConfig()).toEqual({
      port: 4000,
      mongoUri: 'mongodb://db/chat',
      redisUrl: 'redis://localhost:6379',
      jwtSecret: 's3cret',
      clientOrigins: ['http://a.test', 'http://b.test'],
    });
  });

  test.each(['MONGO_URI', 'JWT_SECRET'])('fails fast when %s is missing', (missing) => {
    process.env.MONGO_URI = 'mongodb://db/chat';
    process.env.JWT_SECRET = 's3cret';
    delete process.env[missing];

    expect(() => loadConfig()).toThrow(missing);
  });
});
