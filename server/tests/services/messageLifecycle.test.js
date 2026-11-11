const mongoose = require('mongoose');
const db = require('../helpers/db');
const Message = require('../../src/models/Message');
const { createMessagingService } = require('../../src/services/messaging/messagingService');

const newId = () => new mongoose.Types.ObjectId().toString();
const alice = newId();
const bob = newId();
const roomId = newId();
const otherRoom = newId();

let service;
const members = { [roomId]: [alice, bob] };

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  service = createMessagingService({
    resolveDirectRoom: async () => ({ _id: roomId }),
    userExists: async () => true,
    isMember: async (userId, id) => (members[id] || []).includes(userId),
    directRoomIdsFor: async () => [roomId],
    membersOf: async (id) => members[id] || [],
  });
});

const send = (content = 'hi', from = alice, to = bob) => service.sendDirectMessage({ fromUserId: from, toUserId: to, content });
const statusOf = async (id) => (await Message.findById(id)).status;

describe('sanitised storage (SEC-003)', () => {
  test('a script payload is stored escaped', async () => {
    const { message } = await send('<script>alert(1)</script>');

    expect((await Message.findById(message._id)).content).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('the stored (escaped) form must still fit 2000 characters', async () => {
    await expect(send('<'.repeat(1000))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('status lifecycle (FR-011)', () => {
  test('sent → delivered only once, and never backwards', async () => {
    const { message } = await send();

    expect(await service.markDelivered([message._id])).toHaveLength(1);
    expect(await service.markDelivered([message._id])).toHaveLength(0);
    expect(await statusOf(message._id)).toBe('delivered');

    await service.markRead({ userId: bob, messageId: String(message._id) });
    expect(await service.markDelivered([message._id])).toHaveLength(0);
    expect(await statusOf(message._id)).toBe('read');
  });

  test('the recipient can mark read; a repeat is a no-op', async () => {
    const { message } = await send();

    expect((await service.markRead({ userId: bob, messageId: String(message._id) })).changed).toBe(true);
    expect((await service.markRead({ userId: bob, messageId: String(message._id) })).changed).toBe(false);
  });

  test('the sender cannot mark their own message read', async () => {
    const { message } = await send();

    await expect(service.markRead({ userId: alice, messageId: String(message._id) })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  test('outsiders and unknown messages get AUTH_FORBIDDEN', async () => {
    const { message } = await send();

    await expect(service.markRead({ userId: newId(), messageId: String(message._id) })).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
    await expect(service.markRead({ userId: bob, messageId: newId() })).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });
});

describe('offline delivery (FR-009)', () => {
  test('pendingFor returns only undelivered DMs from others, oldest first', async () => {
    const one = await send('one');
    const two = await send('two');
    await send('from bob', bob, alice);
    await service.markDelivered([two.message._id]);

    const pending = await service.pendingFor(bob);

    expect(pending.map((m) => m.content)).toEqual(['one']);
    expect(String(pending[0]._id)).toBe(String(one.message._id));
  });
});

describe('typing targets (FR-010)', () => {
  test('everyone in the conversation except the typer', async () => {
    expect(await service.typingTargets({ userId: alice, conversationId: roomId })).toEqual([bob]);
  });

  test('non-members are rejected', async () => {
    await expect(service.typingTargets({ userId: alice, conversationId: otherRoom })).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });
});
