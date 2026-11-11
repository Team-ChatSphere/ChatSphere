const request = require('supertest');
const db = require('../helpers/db');
const { createApp } = require('../../src/app');
const { createAuthRouter } = require('../../src/routes/auth');
const { createAuthService } = require('../../src/services/auth/authService');

const authService = createAuthService({ jwtSecret: 'test-secret', bcryptRounds: 4 });
const app = createApp({
  clientOrigins: ['http://localhost:5173'],
  registerRoutes: (a) => a.use('/api/auth', createAuthRouter({ authService })),
});
const alice = { username: 'alice', email: 'alice@example.com', password: 'Passw0rd!' };

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(db.clear);

describe('POST /api/auth/register', () => {
  test('201 { userId }', async () => {
    const res = await request(app).post('/api/auth/register').send(alice);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ userId: expect.stringMatching(/^[0-9a-f]{24}$/) });
  });

  test('400 VALIDATION_FAILED for a duplicate email (TC-02)', async () => {
    await request(app).post('/api/auth/register').send(alice);

    const res = await request(app).post('/api/auth/register').send({ ...alice, username: 'alice2' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => request(app).post('/api/auth/register').send(alice));

  test('200 { token } for valid credentials (TC-03)', async () => {
    const res = await request(app).post('/api/auth/login').send({ usernameOrEmail: 'alice', password: alice.password });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['token']);
    expect(res.body.token.split('.')).toHaveLength(3);
  });

  test('401 for a wrong password', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await request(app).post('/api/auth/login').send({ usernameOrEmail: 'alice', password: 'nope-nope' });

    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid username/email or password' });
    console.warn.mockRestore();
  });
});
