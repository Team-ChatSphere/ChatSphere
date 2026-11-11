// End-to-end: real HTTP + real Socket.IO clients + in-memory MongoDB (Test Plan TC-03, TC-04,
// TC-05, TC-07, TC-10). This is the Sprint-1 demo flow, automated.
const jwt = require('jsonwebtoken');
const db = require('../helpers/db');
const { startStack, next, emitAck, JWT_SECRET } = require('../helpers/stack');

let stack;
let alice;
let bob;

beforeAll(async () => {
  await db.connect();
  stack = await startStack();
});
afterAll(async () => {
  await stack.stop();
  await db.disconnect();
});
beforeEach(async () => {
  await db.clear();
  alice = await stack.user('alice');
  bob = await stack.user('bob');
});

describe('auth on both channels (FR-004, SEC-004, TC-04)', () => {
  test('REST without a token is 401 AUTH_INVALID_TOKEN', async () => {
    const res = await stack.api('GET', `/api/messages/${'a'.repeat(24)}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  test.each([
    ['no token', undefined],
    ['an expired token', () => jwt.sign({ sub: 'x', username: 'x', exp: Math.floor(Date.now() / 1000) - 5 }, JWT_SECRET)],
    ['a token signed with another key', () => jwt.sign({ sub: 'x', username: 'x' }, 'not-the-key')],
  ])('the WebSocket handshake is refused with %s', async (_label, makeToken) => {
    const token = typeof makeToken === 'function' ? makeToken() : makeToken;

    await expect(stack.socketFor(token)).rejects.toMatchObject({ message: 'AUTH_INVALID_TOKEN' });
  });

  test('a valid token connects and identifies the user', async () => {
    const socket = await stack.socketFor(alice.token);

    expect(socket.connected).toBe(true);
  });
});

describe('direct messages, live (FR-007, FR-008, FR-017, TC-05)', () => {
  test('Bob receives Alice’s DM in real time, Alice gets sent + ack', async () => {
    const a = await stack.socketFor(alice.token);
    const b = await stack.socketFor(bob.token);
    const incoming = next(b, 'message:new');
    const status = next(a, 'message:status');

    const ack = await emitAck(a, 'message:send', { toUserId: bob.id, content: 'hi bob', idempotencyKey: 'k1' });
    const received = await incoming;

    expect(ack).toMatchObject({ ok: true, message: { content: 'hi bob', senderId: alice.id } });
    expect(received).toMatchObject({ content: 'hi bob', senderId: alice.id, senderUsername: 'alice', kind: 'direct' });
    expect(await status).toMatchObject({ messageId: ack.message.id, status: 'sent' });
  });

  test('delivery latency is well under the 300 ms target on a quiet server (NFR-001 smoke)', async () => {
    const a = await stack.socketFor(alice.token);
    const b = await stack.socketFor(bob.token);
    const incoming = next(b, 'message:new');

    const start = performance.now();
    a.emit('message:send', { toUserId: bob.id, content: 'ping' });
    await incoming;

    expect(performance.now() - start).toBeLessThan(300);
  });

  test('sending to yourself is rejected (TC-05 negative)', async () => {
    const a = await stack.socketFor(alice.token);

    const ack = await emitAck(a, 'message:send', { toUserId: alice.id, content: 'me' });

    expect(ack).toEqual({ ok: false, error: { code: 'VALIDATION_FAILED', message: expect.any(String) } });
  });
});

describe('DM history over REST (FR-018, TC-10)', () => {
  test('after a "reload", both users get the conversation newest first; others get 403', async () => {
    const a = await stack.socketFor(alice.token);
    const first = await emitAck(a, 'message:send', { toUserId: bob.id, content: 'one' });
    await emitAck(a, 'message:send', { toUserId: bob.id, content: 'two' });
    const conversationId = first.message.roomId;
    const carol = await stack.user('carol');

    const forBob = await stack.api('GET', `/api/messages/${conversationId}?page=1&pageSize=10`, { token: bob.token });
    const forCarol = await stack.api('GET', `/api/messages/${conversationId}`, { token: carol.token });

    expect(forBob.status).toBe(200);
    expect(forBob.body.messages.map((m) => m.content)).toEqual(['two', 'one']);
    expect(forBob.body.nextPage).toBeNull();
    expect(forCarol.status).toBe(403);
  });
});

describe('rooms (FR-012 to FR-015, TC-07)', () => {
  test('Alice creates a room, Bob joins, both see each other’s messages live; outsiders can’t post', async () => {
    const a = await stack.socketFor(alice.token);
    const b = await stack.socketFor(bob.token);
    const carol = await stack.user('carol');
    const c = await stack.socketFor(carol.token);

    const created = await emitAck(a, 'room:create', { name: 'team' });
    const roomId = created.room.roomId;
    const joinedNotice = next(a, 'room:memberJoined');
    expect(await emitAck(b, 'room:join', { roomId })).toMatchObject({ ok: true, joined: true });
    expect(await joinedNotice).toEqual({ roomId, userId: bob.id });

    const bobSees = next(b, 'message:new');
    await emitAck(a, 'message:send', { roomId, content: 'hello team' });
    expect(await bobSees).toMatchObject({ roomId, content: 'hello team', senderId: alice.id, kind: 'room' });

    const aliceSees = next(a, 'message:new');
    await emitAck(b, 'message:send', { roomId, content: 'hi alice' });
    expect(await aliceSees).toMatchObject({ content: 'hi alice', senderId: bob.id });

    expect(await emitAck(c, 'message:send', { roomId, content: 'let me in' })).toMatchObject({
      ok: false,
      error: { code: 'AUTH_FORBIDDEN' },
    });
  });

  test('after reconnecting, a member is back in the room channel automatically', async () => {
    const a = await stack.socketFor(alice.token);
    const { room } = await emitAck(a, 'room:create', { name: 'team' });
    const b1 = await stack.socketFor(bob.token);
    await emitAck(b1, 'room:join', { roomId: room.roomId });
    b1.close();

    const b2 = await stack.socketFor(bob.token);
    const bobSees = next(b2, 'message:new');
    await emitAck(a, 'message:send', { roomId: room.roomId, content: 'still there?' });

    expect(await bobSees).toMatchObject({ content: 'still there?' });
  });
});
