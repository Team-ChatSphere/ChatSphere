const mongoose = require('mongoose');
const db = require('../helpers/db');
const Message = require('../../src/models/Message');
const { createMessagingService } = require('../../src/services/messaging/messagingService');

const newId = () => new mongoose.Types.ObjectId().toString();

const alice = newId();
const bob = newId();
const roomId = newId();

let isMember;
let service;

beforeAll(db.connect);
afterAll(db.disconnect);

beforeEach(async () => {
  await db.clear();
  isMember = jest.fn().mockResolvedValue(true);
  service = createMessagingService({ resolveDirectRoom: jest.fn(), userExists: jest.fn(), isMember });
});

// Five messages one minute apart: m0 is oldest, m4 newest.
async function seed(count = 5) {
  const start = new Date('2026-10-19T10:00:00Z').getTime();
  await Message.insertMany(
    Array.from({ length: count }, (_, i) => ({
      room_id: roomId,
      sender_id: i % 2 ? bob : alice,
      content: `m${i}`,
      timestamp: new Date(start + i * 60000),
    }))
  );
}

const contents = (result) => result.messages.map((m) => m.content);
const expectCode = (promise, code) => expect(promise).rejects.toMatchObject({ code });

describe('getHistory (FR-018, TC-10)', () => {
  test('returns messages newest first with the wire shape', async () => {
    await seed();

    const result = await service.getHistory({ userId: alice, conversationId: roomId });

    expect(contents(result)).toEqual(['m4', 'm3', 'm2', 'm1', 'm0']);
    expect(result.nextPage).toBeNull();
    expect(result.messages[0]).toEqual({
      id: expect.any(String),
      roomId,
      senderId: alice,
      content: 'm4',
      timestamp: new Date('2026-10-19T10:04:00Z'),
      status: 'sent',
      idempotencyKey: undefined,
    });
  });

  test('paginates and reports nextPage until the last page', async () => {
    await seed();

    const page1 = await service.getHistory({ userId: alice, conversationId: roomId, page: '1', pageSize: '2' });
    const page2 = await service.getHistory({ userId: alice, conversationId: roomId, page: '2', pageSize: '2' });
    const page3 = await service.getHistory({ userId: alice, conversationId: roomId, page: '3', pageSize: '2' });

    expect([contents(page1), page1.nextPage]).toEqual([['m4', 'm3'], 2]);
    expect([contents(page2), page2.nextPage]).toEqual([['m2', 'm1'], 3]);
    expect([contents(page3), page3.nextPage]).toEqual([['m0'], null]);
  });

  test('a page past the end is empty', async () => {
    await seed();

    const result = await service.getHistory({ userId: alice, conversationId: roomId, page: '9' });

    expect(result).toEqual({ messages: [], nextPage: null });
  });

  test('only returns messages from the requested conversation', async () => {
    await seed(2);
    await Message.create({ room_id: newId(), sender_id: alice, content: 'elsewhere' });

    const result = await service.getHistory({ userId: alice, conversationId: roomId });

    expect(contents(result)).toEqual(['m1', 'm0']);
  });

  test('caps pageSize at 100', async () => {
    await seed(3);
    const spy = jest.spyOn(Message, 'find');
    await service.getHistory({ userId: alice, conversationId: roomId, pageSize: '5000' });

    expect(spy.mock.results[0].value.options.limit).toBe(101);
    spy.mockRestore();
  });

  test('rejects a non-participant with AUTH_FORBIDDEN', async () => {
    await seed();
    isMember.mockResolvedValue(false);

    await expectCode(service.getHistory({ userId: newId(), conversationId: roomId }), 'AUTH_FORBIDDEN');
  });

  test.each([
    ['malformed conversationId', { conversationId: 'abc' }],
    ['page 0', { conversationId: roomId, page: '0' }],
    ['non-numeric pageSize', { conversationId: roomId, pageSize: 'ten' }],
  ])('rejects %s with VALIDATION_FAILED', async (_name, query) => {
    await expectCode(service.getHistory({ userId: alice, ...query }), 'VALIDATION_FAILED');
  });
});
