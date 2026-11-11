// End-to-end: offline delivery, delivered/read ticks, typing and stored XSS
// (Test Plan TC-06, TC-09; FR-009, FR-010, FR-011, SEC-003).
const db = require('../helpers/db');
const { startStack, next, emitAck } = require('../helpers/stack');

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

// Collects message:status events for a socket.
function statuses(socket) {
  const seen = [];
  socket.on('message:status', (s) => seen.push(s.status));
  return seen;
}
const until = async (check, ms = 2000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('condition not met');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('offline delivery (FR-009, TC-06)', () => {
  test('a DM sent while Bob is offline arrives when he connects, and Alice sees it delivered', async () => {
    const a = await stack.socketFor(alice.token);
    const aliceStatuses = statuses(a);
    const ack = await emitAck(a, 'message:send', { toUserId: bob.id, content: 'are you there?' });
    expect(ack.message.status).toBe('sent');

    // Bob connects later: the pending DM is pushed before session:ready.
    const { io: connect } = require('socket.io-client');
    const b = connect(stack.base, { transports: ['websocket'], reconnection: false, auth: { token: bob.token } });
    const received = await next(b, 'message:new');
    b.close();

    expect(received).toMatchObject({ content: 'are you there?', senderUsername: 'alice', kind: 'direct', status: 'delivered' });
    await until(() => aliceStatuses.includes('delivered'));
  });
});

describe('ticks: sent → delivered → read (FR-011)', () => {
  test('Bob online: Alice gets sent then delivered, then read when Bob reads it', async () => {
    const a = await stack.socketFor(alice.token);
    const b = await stack.socketFor(bob.token);
    const aliceStatuses = statuses(a);
    const incoming = next(b, 'message:new');

    await emitAck(a, 'message:send', { toUserId: bob.id, content: 'hello' });
    const msg = await incoming;
    await until(() => aliceStatuses.includes('delivered'));

    expect(await emitAck(b, 'message:read', { messageId: msg.id })).toEqual({ ok: true, status: 'read' });
    await until(() => aliceStatuses.includes('read'));
    expect(aliceStatuses).toEqual(['sent', 'delivered', 'read']);
  });

  test('Alice cannot mark her own message read', async () => {
    const a = await stack.socketFor(alice.token);
    const { message } = await emitAck(a, 'message:send', { toUserId: bob.id, content: 'mine' });

    expect(await emitAck(a, 'message:read', { messageId: message.id })).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });
});

describe('typing indicator (FR-010)', () => {
  test('Bob sees Alice start and stop typing in their DM; Carol sees nothing', async () => {
    const a = await stack.socketFor(alice.token);
    const b = await stack.socketFor(bob.token);
    const carol = await stack.user('carol');
    const c = await stack.socketFor(carol.token);
    const carolSaw = [];
    c.on('typing:update', (u) => carolSaw.push(u));
    const { message } = await emitAck(a, 'message:send', { toUserId: bob.id, content: 'hi' });
    const conversationId = message.roomId;

    const started = next(b, 'typing:update');
    a.emit('typing:start', { conversationId });
    expect(await started).toEqual({ conversationId, userId: alice.id, username: 'alice', typing: true });

    const stopped = next(b, 'typing:update');
    a.emit('typing:stop', { conversationId });
    expect((await stopped).typing).toBe(false);

    c.emit('typing:start', { conversationId }); // not a participant: ignored
    await new Promise((r) => setTimeout(r, 150));
    expect(carolSaw).toEqual([]);
  });

  test('typing in a room reaches the other members', async () => {
    const a = await stack.socketFor(alice.token);
    const b = await stack.socketFor(bob.token);
    const { room } = await emitAck(a, 'room:create', { name: 'team' });
    await emitAck(b, 'room:join', { roomId: room.roomId });

    const update = next(b, 'typing:update');
    a.emit('typing:start', { roomId: room.roomId });

    expect(await update).toMatchObject({ roomId: room.roomId, userId: alice.id, typing: true });
  });
});

describe('stored XSS (SEC-003, TC-09)', () => {
  test('a script payload is stored and returned escaped, in DMs and rooms', async () => {
    const a = await stack.socketFor(alice.token);
    const payload = '<img src=x onerror="alert(1)">';

    const dm = await emitAck(a, 'message:send', { toUserId: bob.id, content: payload });
    const { room } = await emitAck(a, 'room:create', { name: 'team' });
    const roomMsg = await emitAck(a, 'message:send', { roomId: room.roomId, content: payload });
    const history = await stack.api('GET', `/api/messages/${dm.message.roomId}`, { token: bob.token });

    const escaped = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;';
    expect(dm.message.content).toBe(escaped);
    expect(roomMsg.message.content).toBe(escaped);
    expect(history.body.messages[0].content).toBe(escaped);
  });
});
