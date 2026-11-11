// End-to-end rate limit on a real connection (SEC-005, CS-25).
const db = require('../helpers/db');
const Message = require('../../src/models/Message');
const { startStack, emitAck } = require('../helpers/stack');

let stack;

beforeAll(async () => {
  await db.connect();
  // Tiny bucket and practically no refill, so the test is deterministic.
  stack = await startStack({ rateLimit: { capacity: 3, refillPerSec: 0.001 } });
});
afterAll(async () => {
  await stack.stop();
  await db.disconnect();
});
beforeEach(db.clear);

test('a flood of message:send is cut off with RATE_LIMITED and the excess is never stored', async () => {
  const alice = await stack.user('alice');
  const bob = await stack.user('bob');
  const a = await stack.socketFor(alice.token);
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  const acks = [];
  for (let i = 0; i < 6; i += 1) acks.push(await emitAck(a, 'message:send', { toUserId: bob.id, content: `m${i}` }));

  expect(acks.map((x) => x.ok)).toEqual([true, true, true, false, false, false]);
  expect(acks[5].error.code).toBe('RATE_LIMITED');
  expect(await Message.countDocuments()).toBe(3);
  // The limit is per connection and only for message:send.
  expect(await emitAck(a, 'room:create', { name: 'still-works' })).toMatchObject({ ok: true });
  console.warn.mockRestore();
});

test('the limit is per connection: a fresh connection gets its own bucket', async () => {
  const alice = await stack.user('alice');
  const bob = await stack.user('bob');
  const a1 = await stack.socketFor(alice.token);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  for (let i = 0; i < 4; i += 1) await emitAck(a1, 'message:send', { toUserId: bob.id, content: `x${i}` });

  const a2 = await stack.socketFor(alice.token);

  expect(await emitAck(a2, 'message:send', { toUserId: bob.id, content: 'fresh' })).toMatchObject({ ok: true });
  console.warn.mockRestore();
});
