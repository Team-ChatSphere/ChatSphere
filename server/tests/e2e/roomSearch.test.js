const db = require('../helpers/db');
const { startStack, emitAck } = require('../helpers/stack');

let stack;

beforeAll(async () => {
  await db.connect();
  stack = await startStack();
});
afterAll(async () => {
  await stack.stop();
  await db.disconnect();
});
beforeEach(db.clear);

test('room history is mounted behind JWT and search returns users and group rooms only', async () => {
  const alice = await stack.user('alice');
  const bob = await stack.user('bob');
  const outsider = await stack.user('carol');
  const aliceSocket = await stack.socketFor(alice.token);
  const { room } = await emitAck(aliceSocket, 'room:create', { name: 'design team' });
  await emitAck(aliceSocket, 'message:send', { roomId: room.roomId, content: 'history entry' });

  const history = await stack.api('GET', `/api/rooms/${room.roomId}/messages?page=1&pageSize=20`, { token: alice.token });
  const deniedHistory = await stack.api('GET', `/api/rooms/${room.roomId}/messages`, { token: outsider.token });
  const userSearch = await stack.api('GET', '/api/users?search=bo', { token: alice.token });
  const roomSearch = await stack.api('GET', '/api/rooms?search=design', { token: alice.token });
  await emitAck(aliceSocket, 'message:send', { toUserId: bob.id, content: 'direct conversation' });
  const noDirectRooms = await stack.api('GET', `/api/rooms?search=${alice.id.slice(0, 4)}`, { token: alice.token });

  expect(history.status).toBe(200);
  expect(history.body.messages.map((message) => message.content)).toEqual(['history entry']);
  expect(deniedHistory.status).toBe(403);
  expect(userSearch.body.users).toEqual([{ userId: bob.id, username: 'bob', status: 'offline' }]);
  expect(roomSearch.body.rooms).toEqual([{ roomId: room.roomId, name: 'design team' }]);
  expect(noDirectRooms.body.rooms).toEqual([]);
});
