const mongoose = require('mongoose');
const db = require('../helpers/db');
const Message = require('../../src/models/Message');
const { createMessagingService } = require('../../src/services/messaging/messagingService');

const newId = () => new mongoose.Types.ObjectId().toString();

let roomId;
let service;
const alice = newId();
const bob = newId();

beforeAll(db.connect);
afterAll(db.disconnect);

beforeEach(async () => {
  await db.clear();
  roomId = new mongoose.Types.ObjectId();
  service = createMessagingService({
    resolveDirectRoom: jest.fn().mockResolvedValue({ _id: roomId }),
    userExists: jest.fn().mockResolvedValue(true),
  });
});

const expectCode = (promise, code) => expect(promise).rejects.toMatchObject({ code });

describe('sendDirectMessage (FR-007, FR-017)', () => {
  test('persists the message in the direct room with status sent', async () => {
    const { message, duplicate } = await service.sendDirectMessage({
      fromUserId: alice,
      toUserId: bob,
      content: '  hi bob  ',
    });

    expect(duplicate).toBe(false);
    const saved = await Message.findById(message._id);
    expect(saved).not.toBeNull();
    expect(String(saved.room_id)).toBe(String(roomId));
    expect(String(saved.sender_id)).toBe(alice);
    expect(saved.content).toBe('hi bob');
    expect(saved.status).toBe('sent');
  });

  test('looks up the direct room for the two participants', async () => {
    const resolveDirectRoom = jest.fn().mockResolvedValue({ _id: roomId });
    service = createMessagingService({ resolveDirectRoom, userExists: async () => true });

    await service.sendDirectMessage({ fromUserId: alice, toUserId: bob, content: 'hi' });

    expect(resolveDirectRoom).toHaveBeenCalledWith(alice, bob);
  });

  test('rejects a DM to yourself (TC-05)', async () => {
    await expectCode(
      service.sendDirectMessage({ fromUserId: alice, toUserId: alice, content: 'hi' }),
      'VALIDATION_FAILED'
    );
    expect(await Message.countDocuments()).toBe(0);
  });

  test.each([
    ['missing toUserId', { content: 'hi' }],
    ['malformed toUserId', { toUserId: 'bob', content: 'hi' }],
    ['empty content', { toUserId: bob, content: '   ' }],
    ['non-string content', { toUserId: bob, content: 42 }],
    ['content over 2000 chars', { toUserId: bob, content: 'a'.repeat(2001) }],
    ['empty idempotency key', { toUserId: bob, content: 'hi', idempotencyKey: '' }],
  ])('rejects %s with VALIDATION_FAILED', async (_name, payload) => {
    await expectCode(service.sendDirectMessage({ fromUserId: alice, ...payload }), 'VALIDATION_FAILED');
    expect(await Message.countDocuments()).toBe(0);
  });

  test('rejects an unknown recipient with NOT_FOUND', async () => {
    service = createMessagingService({
      resolveDirectRoom: jest.fn(),
      userExists: jest.fn().mockResolvedValue(false),
    });

    await expectCode(service.sendDirectMessage({ fromUserId: alice, toUserId: bob, content: 'hi' }), 'NOT_FOUND');
  });
});

describe('idempotency (CS-11, SAD 3.4.2)', () => {
  const send = (extra = {}) =>
    service.sendDirectMessage({ fromUserId: alice, toUserId: bob, content: 'hi', idempotencyKey: 'k-1', ...extra });

  test('the same key sent twice stores one message and returns the original', async () => {
    const first = await send();
    const retry = await send();

    expect(retry.duplicate).toBe(true);
    expect(String(retry.message._id)).toBe(String(first.message._id));
    expect(await Message.countDocuments()).toBe(1);
  });

  test('concurrent retries with the same key still store one message', async () => {
    const results = await Promise.all([send(), send(), send()]);

    expect(await Message.countDocuments()).toBe(1);
    expect(new Set(results.map((r) => String(r.message._id))).size).toBe(1);
  });

  test('different senders may use the same key', async () => {
    await send();
    await service.sendDirectMessage({ fromUserId: bob, toUserId: alice, content: 'hey', idempotencyKey: 'k-1' });

    expect(await Message.countDocuments()).toBe(2);
  });

  test('messages without a key are never deduplicated', async () => {
    await send({ idempotencyKey: undefined });
    await send({ idempotencyKey: undefined });

    expect(await Message.countDocuments()).toBe(2);
  });
});
