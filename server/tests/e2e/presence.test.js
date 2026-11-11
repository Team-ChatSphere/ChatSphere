const db = require('../helpers/db');
const User = require('../../src/models/User');
const { createPresenceService } = require('../../src/services/presence/presenceService');
const { startStack, next } = require('../helpers/stack');

function fakeRedis() {
  const sets = new Map();
  return {
    isReady: true,
    sets,
    async eval(script, { keys, arguments: args }) {
      const key = keys[0];
      const sockets = sets.get(key) || new Set();
      if (script.includes('SADD')) {
        sockets.add(args[0]);
        sets.set(key, sockets);
        return sockets.size;
      }
      const removed = sockets.delete(args[0]) ? 1 : 0;
      if (sockets.size === 0) sets.delete(key);
      else sets.set(key, sockets);
      return [removed, sockets.size];
    },
  };
}

async function waitFor(check, message) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${message}`);
}

let stack;
let redis;

beforeAll(async () => {
  await db.connect();
  redis = fakeRedis();
  stack = await startStack({ presence: createPresenceService({ redis }) });
});
afterAll(async () => {
  await stack.stop();
  await db.disconnect();
});
beforeEach(async () => {
  await db.clear();
  redis.sets.clear();
});

test('presence is broadcast to DM contacts and remains online until the last socket disconnects', async () => {
  const alice = await stack.user('alice');
  const bob = await stack.user('bob');
  const aliceSocket = await stack.socketFor(alice.token);
  await new Promise((resolve) => aliceSocket.emit('message:send', { toUserId: bob.id, content: 'hello' }, resolve));

  const online = next(aliceSocket, 'presence:update');
  const bobSocket1 = await stack.socketFor(bob.token);
  expect(await online).toEqual({ userId: bob.id, status: 'online' });
  const bobSocket2 = await stack.socketFor(bob.token);
  expect(redis.sets.get(`presence:user:${bob.id}`).size).toBe(2);
  expect((await User.findById(bob.id)).status).toBe('online');

  const firstDisconnect = new Promise((resolve) => bobSocket1.once('disconnect', resolve));
  bobSocket1.close();
  await firstDisconnect;
  await waitFor(() => redis.sets.get(`presence:user:${bob.id}`)?.size === 1, 'first socket removal');
  expect(redis.sets.get(`presence:user:${bob.id}`).size).toBe(1);
  expect((await User.findById(bob.id)).status).toBe('online');

  const offline = next(aliceSocket, 'presence:update');
  bobSocket2.close();
  expect(await offline).toEqual({ userId: bob.id, status: 'offline' });
  await waitFor(() => !redis.sets.has(`presence:user:${bob.id}`), 'last socket removal');
  await waitFor(async () => (await User.findById(bob.id)).status === 'offline', 'offline status persistence');
  expect(redis.sets.has(`presence:user:${bob.id}`)).toBe(false);
  expect((await User.findById(bob.id)).status).toBe('offline');

  const aliceDisconnect = new Promise((resolve) => aliceSocket.once('disconnect', resolve));
  aliceSocket.close();
  await aliceDisconnect;
  await waitFor(() => !redis.sets.has(`presence:user:${alice.id}`), 'Alice socket removal');
});
