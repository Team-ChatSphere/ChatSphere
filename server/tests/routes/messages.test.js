const express = require('express');
const request = require('supertest');
const { createMessagesRouter } = require('../../src/routes/messages');
const { AppError } = require('../../src/utils/errors');

const ALICE = 'a'.repeat(24);
const ROOM = 'd'.repeat(24);

// Stands in for the JWT Auth Middleware (CS-07): 401 without a token, else sets req.user.
function fakeAuth(req, res, next) {
  if (req.headers.authorization !== 'Bearer valid') {
    return res.status(401).json({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Invalid or missing token' } });
  }
  req.user = { id: ALICE, username: 'alice' };
  return next();
}

function appWith(service) {
  const app = express();
  app.use('/api/messages', fakeAuth, createMessagesRouter({ service }));
  return app;
}

describe('GET /api/messages/:conversationId (FR-018)', () => {
  test('200 with { messages, nextPage } and passes the query through', async () => {
    const body = { messages: [{ id: '1', content: 'hi' }], nextPage: 2 };
    const service = { getHistory: jest.fn().mockResolvedValue(body) };

    const res = await request(appWith(service))
      .get(`/api/messages/${ROOM}?page=1&pageSize=1`)
      .set('Authorization', 'Bearer valid');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);
    expect(service.getHistory).toHaveBeenCalledWith({ userId: ALICE, conversationId: ROOM, page: '1', pageSize: '1' });
  });

  test('401 without a token never reaches the service', async () => {
    const service = { getHistory: jest.fn() };

    const res = await request(appWith(service)).get(`/api/messages/${ROOM}`);

    expect(res.status).toBe(401);
    expect(service.getHistory).not.toHaveBeenCalled();
  });

  test.each([
    ['AUTH_FORBIDDEN', 403],
    ['VALIDATION_FAILED', 400],
  ])('%s maps to HTTP %i with the error body', async (code, status) => {
    const service = { getHistory: jest.fn().mockRejectedValue(new AppError(code, 'nope')) };

    const res = await request(appWith(service)).get(`/api/messages/${ROOM}`).set('Authorization', 'Bearer valid');

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error: { code, message: 'nope' } });
  });

  test('an unexpected error is a 500 INTERNAL_ERROR without detail', async () => {
    const service = { getHistory: jest.fn().mockRejectedValue(new Error('mongo down')) };
    const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(appWith(service)).get(`/api/messages/${ROOM}`).set('Authorization', 'Bearer valid');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
    logSpy.mockRestore();
  });
});
