// DM flow with the real Room/RoomMembership models (no room mocks): what the
// gateway wiring in docs/INTEGRATION.md §2 will run once auth (CS-07) is in.
const mongoose = require('mongoose');
const db = require('../helpers/db');
const RoomMembership = require('../../src/models/RoomMembership');
const { createMessagingService } = require('../../src/services/messaging/messagingService');
const { getOrCreateDirectRoom } = require('../../src/services/messaging/directRoom');

const newId = () => new mongoose.Types.ObjectId().toString();

const alice = newId();
const bob = newId();
let service;

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  service = createMessagingService({
    resolveDirectRoom: getOrCreateDirectRoom,
    userExists: async () => true, // User model arrives with CS-04
    isMember: async (userId, roomId) => Boolean(await RoomMembership.exists({ room_id: roomId, user_id: userId })),
  });
});

describe('DM send + history with real rooms (FR-007, FR-017, FR-018)', () => {
  test('both participants see the conversation newest first; a third user is forbidden', async () => {
    const first = await service.sendDirectMessage({ fromUserId: alice, toUserId: bob, content: 'hi bob' });
    await service.sendDirectMessage({ fromUserId: bob, toUserId: alice, content: 'hey alice' });
    const conversationId = String(first.message.room_id);

    const forAlice = await service.getHistory({ userId: alice, conversationId });
    const forBob = await service.getHistory({ userId: bob, conversationId });

    expect(forAlice.messages.map((m) => m.content)).toEqual(['hey alice', 'hi bob']);
    expect(forBob.messages.map((m) => m.content)).toEqual(['hey alice', 'hi bob']);
    await expect(service.getHistory({ userId: newId(), conversationId })).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
    });
  });

  test('replies land in the same conversation in either direction', async () => {
    const a = await service.sendDirectMessage({ fromUserId: alice, toUserId: bob, content: '1' });
    const b = await service.sendDirectMessage({ fromUserId: bob, toUserId: alice, content: '2' });

    expect(String(b.message.room_id)).toBe(String(a.message.room_id));
  });
});
