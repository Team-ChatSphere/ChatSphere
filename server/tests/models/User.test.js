const db = require('../helpers/db');
const User = require('../../src/models/User');

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(db.clear);

const valid = () => ({ username: 'alice', email: 'Alice@Example.com', password_hash: '$2a$10$hash' });

describe('User model (CS-04)', () => {
  test('stores a lower-cased email and defaults to offline', async () => {
    const user = await User.create(valid());

    expect(user.email).toBe('alice@example.com');
    expect(user.status).toBe('offline');
  });

  test.each([
    ['username', { username: undefined }],
    ['email', { email: undefined }],
    ['password_hash', { password_hash: undefined }],
    ['username over 30 chars', { username: 'a'.repeat(31) }],
    ['email over 100 chars', { email: `${'a'.repeat(95)}@x.com` }],
    ['unknown status', { status: 'away' }],
  ])('rejects a missing/invalid %s', async (_label, override) => {
    await expect(User.create({ ...valid(), ...override })).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('username and email are unique', async () => {
    await User.create(valid());

    await expect(User.create({ ...valid(), email: 'other@example.com' })).rejects.toMatchObject({ code: 11000 });
    await expect(User.create({ ...valid(), username: 'bob' })).rejects.toMatchObject({ code: 11000 });
  });

  test('usernames are unique ignoring case, enforced by the database index itself', async () => {
    await User.create(valid());

    await expect(User.create({ ...valid(), username: 'ALICE', email: 'other@example.com' })).rejects.toMatchObject({ code: 11000 });
    expect(await User.countDocuments()).toBe(1);
  });

  test('the password hash is never serialised', async () => {
    const user = await User.create(valid());

    expect(JSON.parse(JSON.stringify(user))).not.toHaveProperty('password_hash');
  });
});
