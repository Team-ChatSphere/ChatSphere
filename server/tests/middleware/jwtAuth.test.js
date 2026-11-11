const { createJwtAuth, createSocketJwtAuth } = require('../../src/middleware/jwtAuth');
const { AppError } = require('../../src/utils/errors');

const USER = { id: 'a'.repeat(24), username: 'alice' };
const authService = {
  verifyToken: jest.fn((token) => {
    if (token === 'good') return USER;
    throw new AppError('AUTH_INVALID_TOKEN', 'Invalid token');
  }),
};

describe('REST jwtAuth (CS-07)', () => {
  const run = (authorization) => {
    const req = { headers: authorization ? { authorization } : {} };
    const next = jest.fn();
    createJwtAuth(authService)(req, {}, next);
    return { req, err: next.mock.calls[0][0] };
  };

  test('a valid bearer token sets req.user', () => {
    const { req, err } = run('Bearer good');

    expect(err).toBeUndefined();
    expect(req.user).toEqual(USER);
  });

  test.each([['no header', undefined], ['wrong scheme', 'Basic good'], ['bearer without token', 'Bearer'], ['bad token', 'Bearer bad']])(
    '%s → AUTH_INVALID_TOKEN (401)',
    (_label, header) => {
      const { req, err } = run(header);

      expect(err).toMatchObject({ code: 'AUTH_INVALID_TOKEN', status: 401 });
      expect(req.user).toBeUndefined();
    }
  );
});

describe('Socket.IO handshake auth (CS-07)', () => {
  const run = (auth) => {
    const socket = { handshake: { auth } };
    const next = jest.fn();
    createSocketJwtAuth(authService)(socket, next);
    return { socket, err: next.mock.calls[0][0] };
  };

  test('a valid token sets socket.user', () => {
    const { socket, err } = run({ token: 'good' });

    expect(err).toBeUndefined();
    expect(socket.user).toEqual(USER);
  });

  test('a bad or missing token refuses the connection with AUTH_INVALID_TOKEN', () => {
    for (const auth of [{ token: 'bad' }, {}, undefined]) {
      const { err } = run(auth);
      expect(err.message).toBe('AUTH_INVALID_TOKEN');
      expect(err.data).toEqual({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid token' });
    }
  });
});
