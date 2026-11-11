const { createJwtAuth, createSocketJwtAuth } = require('../../src/middleware/jwtAuth');
const { AppError } = require('../../src/utils/errors');

const USER = { id: 'a'.repeat(24), username: 'alice' };
const authService = {
  authenticate: jest.fn(async (token) => {
    if (token === 'good') return USER;
    if (token === 'deleted-user') throw new AppError('AUTH_INVALID_TOKEN', 'User no longer exists');
    throw new AppError('AUTH_INVALID_TOKEN', 'Invalid token');
  }),
};

describe('REST jwtAuth (CS-07)', () => {
  const run = async (authorization) => {
    const req = { headers: authorization ? { authorization } : {} };
    const next = jest.fn();
    await createJwtAuth(authService)(req, {}, next);
    return { req, err: next.mock.calls[0][0] };
  };

  test('a valid bearer token for an existing user sets req.user', async () => {
    const { req, err } = await run('Bearer good');

    expect(err).toBeUndefined();
    expect(req.user).toEqual(USER);
  });

  test.each([
    ['no header', undefined],
    ['wrong scheme', 'Basic good'],
    ['bearer without token', 'Bearer'],
    ['bad token', 'Bearer bad'],
    ['token of a user that no longer exists', 'Bearer deleted-user'],
  ])('%s → AUTH_INVALID_TOKEN (401)', async (_label, header) => {
    const { req, err } = await run(header);

    expect(err).toMatchObject({ code: 'AUTH_INVALID_TOKEN', status: 401 });
    expect(req.user).toBeUndefined();
  });
});

describe('Socket.IO handshake auth (CS-07)', () => {
  const run = async (auth) => {
    const socket = { handshake: { auth } };
    const next = jest.fn();
    await createSocketJwtAuth(authService)(socket, next);
    return { socket, err: next.mock.calls[0][0] };
  };

  test('a valid token sets socket.user', async () => {
    const { socket, err } = await run({ token: 'good' });

    expect(err).toBeUndefined();
    expect(socket.user).toEqual(USER);
  });

  test('a bad, missing or deleted-user token refuses the connection with AUTH_INVALID_TOKEN', async () => {
    for (const auth of [{ token: 'bad' }, {}, undefined, { token: 'deleted-user' }]) {
      const { socket, err } = await run(auth);
      expect(err.message).toBe('AUTH_INVALID_TOKEN');
      expect(err.data.code).toBe('AUTH_INVALID_TOKEN');
      expect(socket.user).toBeUndefined();
    }
  });
});
