const request = require('supertest');
const { createApp } = require('../src/app');
const { AppError } = require('../src/utils/errors');

const ORIGIN = 'http://localhost:5173';

function appWith(registerRoutes) {
  return createApp({ clientOrigins: [ORIGIN], registerRoutes });
}

describe('Express app skeleton (CS-01)', () => {
  test('GET /api/health is 200', async () => {
    const res = await request(appWith()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('unknown routes return 404 in the shared error shape (SAD 3.3)', async () => {
    const res = await request(appWith()).get('/api/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'No route for GET /api/nope' } });
  });

  test('malformed JSON is a 400 VALIDATION_FAILED', async () => {
    const app = appWith((a) => a.post('/api/echo', (req, res) => res.json(req.body)));

    const res = await request(app).post('/api/echo').set('Content-Type', 'application/json').send('{"bad"');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('routes registered by services are mounted, and their AppErrors keep their status', async () => {
    const app = appWith((a) =>
      a.get('/api/secret', (req, res, next) => next(new AppError('AUTH_FORBIDDEN', 'Not allowed')))
    );

    const res = await request(app).get('/api/secret');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'AUTH_FORBIDDEN', message: 'Not allowed' } });
  });

  test('unexpected errors are a 500 INTERNAL_ERROR without detail', async () => {
    const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const app = appWith((a) =>
      a.get('/api/boom', () => {
        throw new Error('db password leaked');
      })
    );

    const res = await request(app).get('/api/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
    logSpy.mockRestore();
  });

  test('CORS allows the configured client origin only', async () => {
    const allowed = await request(appWith()).get('/api/health').set('Origin', ORIGIN);
    const other = await request(appWith()).get('/api/health').set('Origin', 'http://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
