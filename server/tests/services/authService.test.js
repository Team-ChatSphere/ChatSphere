const jwt = require('jsonwebtoken');
const db = require('../helpers/db');
const User = require('../../src/models/User');
const { createAuthService } = require('../../src/services/auth/authService');

const SECRET = 'test-secret';
const auth = createAuthService({ jwtSecret: SECRET, bcryptRounds: 4 });
const alice = { username: 'alice', email: 'alice@example.com', password: 'Passw0rd!' };
const expectCode = (promise, code) => expect(promise).rejects.toMatchObject({ code });

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(db.clear);

describe('register (FR-001, FR-002, SEC-001, TC-01, TC-02)', () => {
  test('creates the user and returns its id', async () => {
    const { userId } = await auth.register(alice);

    const saved = await User.findById(userId);
    expect(saved.username).toBe('alice');
    expect(saved.email).toBe('alice@example.com');
  });

  test('stores only a bcrypt hash, never the plaintext password (SEC-001)', async () => {
    const { userId } = await auth.register(alice);

    const raw = await User.collection.findOne({ _id: new User.base.Types.ObjectId(userId) });
    expect(raw.password_hash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    expect(JSON.stringify(raw)).not.toContain(alice.password);
  });

  test.each([
    ['duplicate username (any case)', { username: 'ALICE', email: 'other@example.com' }],
    ['duplicate email (any case)', { username: 'alice2', email: 'ALICE@example.com' }],
  ])('rejects a %s (TC-02)', async (_label, override) => {
    await auth.register(alice);

    await expectCode(auth.register({ ...alice, ...override }), 'VALIDATION_FAILED');
    expect(await User.countDocuments()).toBe(1);
  });

  test('two concurrent registrations differing only in case create exactly one account', async () => {
    const results = await Promise.allSettled([
      auth.register({ ...alice, username: 'Alice', email: 'a1@example.com' }),
      auth.register({ ...alice, username: 'alice', email: 'a2@example.com' }),
      auth.register({ ...alice, username: 'ALICE', email: 'a3@example.com' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((x) => x.status === 'rejected')) {
      expect(r.reason).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    expect(await User.countDocuments()).toBe(1);
  });

  test.each([
    ['short password', { password: 'short' }],
    ['password over 72 chars', { password: 'x'.repeat(73) }],
    ['bad email', { email: 'not-an-email' }],
    ['short username', { username: 'ab' }],
    ['username with spaces', { username: 'al ice' }],
    ['missing fields', { username: undefined }],
  ])('rejects %s with VALIDATION_FAILED', async (_label, override) => {
    await expectCode(auth.register({ ...alice, ...override }), 'VALIDATION_FAILED');
    expect(await User.countDocuments()).toBe(0);
  });
});

describe('login (FR-003, TC-03)', () => {
  beforeEach(() => auth.register(alice));

  test.each([['username', 'alice'], ['username in another case', 'Alice'], ['email', 'ALICE@example.com']])(
    'logs in with %s and returns a signed JWT with sub + username',
    async (_label, usernameOrEmail) => {
      const { token, user } = await auth.login({ usernameOrEmail, password: alice.password });

      const claims = jwt.verify(token, SECRET);
      expect(claims.sub).toBe(user.id);
      expect(claims.username).toBe('alice');
      expect(claims.exp).toBeGreaterThan(claims.iat);
    }
  );

  test.each([
    ['wrong password', { usernameOrEmail: 'alice', password: 'wrong-password' }],
    ['unknown user', { usernameOrEmail: 'nobody', password: alice.password }],
  ])('rejects %s with the same 401 message and logs it (SEC-006)', async (_label, creds) => {
    const log = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const err = await auth.login(creds).catch((e) => e);

    expect(err).toMatchObject({ code: 'AUTH_INVALID_TOKEN', status: 401, message: 'Invalid username/email or password' });
    const entry = JSON.parse(log.mock.calls[0][0]);
    expect(entry).toMatchObject({ level: 'security', event: 'login_failed', usernameOrEmail: creds.usernameOrEmail });
    expect(log.mock.calls[0][0]).not.toContain(creds.password);
    log.mockRestore();
  });

  test('rejects missing credentials with VALIDATION_FAILED', async () => {
    await expectCode(auth.login({ usernameOrEmail: '', password: '' }), 'VALIDATION_FAILED');
  });
});

describe('verifyToken (FR-004, SEC-004, TC-04)', () => {
  test('accepts a valid token', async () => {
    const { userId } = await auth.register(alice);
    const { token } = await auth.login({ usernameOrEmail: 'alice', password: alice.password });

    expect(auth.verifyToken(token)).toEqual({ id: userId, username: 'alice' });
  });

  test.each([
    ['missing', undefined],
    ['malformed', 'not.a.jwt'],
    ['signed with another secret', jwt.sign({ sub: 'x', username: 'x' }, 'other-secret')],
    ['expired', jwt.sign({ sub: 'x', username: 'x', exp: Math.floor(Date.now() / 1000) - 10 }, SECRET)],
    ['missing claims', jwt.sign({ foo: 1 }, SECRET)],
    ['alg none', `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"x","username":"x"}').toString('base64url')}.`],
  ])('rejects a %s token with AUTH_INVALID_TOKEN', (_label, token) => {
    expect(() => auth.verifyToken(token)).toThrow(expect.objectContaining({ code: 'AUTH_INVALID_TOKEN' }));
  });

  test('a tampered payload is rejected', async () => {
    await auth.register(alice);
    const { token } = await auth.login({ usernameOrEmail: 'alice', password: alice.password });
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'someone-else', username: 'admin' })).toString('base64url');

    expect(() => auth.verifyToken(`${h}.${forged}.${s}`)).toThrow(expect.objectContaining({ code: 'AUTH_INVALID_TOKEN' }));
  });
});
