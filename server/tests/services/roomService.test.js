const mongoose = require('mongoose');
const db = require('../helpers/db');
const Room = require('../../src/models/Room');
const RoomMembership = require('../../src/models/RoomMembership');
const Message = require('../../src/models/Message');
const { createRoomService } = require('../../src/services/rooms/roomService');

const newId = () => new mongoose.Types.ObjectId().toString();
const expectCode = (promise, code) => expect(promise).rejects.toMatchObject({ code });

let service;
const creatorId = newId();

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  service = createRoomService();
});

describe('room lifecycle (CS-18, CS-19)', () => {
  test('creates a group and makes its creator the first admin', async () => {
    const { room, membership } = await service.createRoom({ userId: creatorId, name: '  project team  ' });

    expect(room).toMatchObject({ name: 'project team', type: 'group' });
    expect(String(room.created_by)).toBe(creatorId);
    expect(String(membership.room_id)).toBe(String(room._id));
    expect(String(membership.user_id)).toBe(creatorId);
    expect(membership.role).toBe('admin');
  });

  test.each([
    ['empty name', '  '],
    ['name over 50 characters', 'x'.repeat(51)],
    ['direct-room name', `${'a'.repeat(24)}:${'b'.repeat(24)}`],
  ])('rejects %s', async (_label, name) => {
    await expectCode(service.createRoom({ userId: creatorId, name }), 'VALIDATION_FAILED');
    expect(await Room.countDocuments()).toBe(0);
  });

  test('rejects a duplicate group name with VALIDATION_FAILED', async () => {
    await service.createRoom({ userId: creatorId, name: 'team' });

    await expectCode(service.createRoom({ userId: newId(), name: 'team' }), 'VALIDATION_FAILED');
  });

  test('a user joins a group once and receives member role', async () => {
    const { room } = await service.createRoom({ userId: creatorId, name: 'team' });
    const userId = newId();

    const joined = await service.joinRoom({ userId, roomId: String(room._id) });
    const again = await service.joinRoom({ userId, roomId: String(room._id) });

    expect(joined.joined).toBe(true);
    expect(joined.membership.role).toBe('member');
    expect(again.joined).toBe(false);
    expect(await RoomMembership.countDocuments({ room_id: room._id, user_id: userId })).toBe(1);
  });

  test('direct rooms cannot be joined or left', async () => {
    const room = await Room.create({ name: `${'a'.repeat(24)}:${'b'.repeat(24)}`, type: 'direct', created_by: creatorId });

    await expectCode(service.joinRoom({ userId: newId(), roomId: String(room._id) }), 'VALIDATION_FAILED');
    await expectCode(service.leaveRoom({ userId: creatorId, roomId: String(room._id) }), 'VALIDATION_FAILED');
  });

  test('a group member can leave and membership is removed', async () => {
    const { room } = await service.createRoom({ userId: creatorId, name: 'team' });

    const result = await service.leaveRoom({ userId: creatorId, roomId: String(room._id) });

    expect(result.left).toBe(true);
    expect(await RoomMembership.exists({ room_id: room._id, user_id: creatorId })).toBeNull();
  });
});

describe('group messages (CS-20, CS-21)', () => {
  test('rejects a non-member before persisting a message', async () => {
    const { room } = await service.createRoom({ userId: creatorId, name: 'private team' });

    await expectCode(service.sendRoomMessage({ userId: newId(), roomId: String(room._id), content: 'hello' }), 'AUTH_FORBIDDEN');
    expect(await Message.countDocuments()).toBe(0);
  });

  test('persists a member message with the shared Message shape', async () => {
    const { room } = await service.createRoom({ userId: creatorId, name: 'private team' });

    const { message, duplicate } = await service.sendRoomMessage({
      userId: creatorId,
      roomId: String(room._id),
      content: '  hello group  ',
      idempotencyKey: 'group-key-1',
    });

    expect(duplicate).toBe(false);
    expect(String(message.room_id)).toBe(String(room._id));
    expect(String(message.sender_id)).toBe(creatorId);
    expect(message.content).toBe('hello group');
    expect(message.status).toBe('sent');
  });

  test('a retry with the same idempotency key returns one saved message', async () => {
    const { room } = await service.createRoom({ userId: creatorId, name: 'private team' });
    const payload = { userId: creatorId, roomId: String(room._id), content: 'hello', idempotencyKey: 'group-key-2' };

    const first = await service.sendRoomMessage(payload);
    const retry = await service.sendRoomMessage(payload);

    expect(retry.duplicate).toBe(true);
    expect(String(retry.message._id)).toBe(String(first.message._id));
    expect(await Message.countDocuments()).toBe(1);
  });

  test('validates message content and room ids', async () => {
    await expectCode(service.sendRoomMessage({ userId: creatorId, roomId: 'bad', content: 'hello' }), 'VALIDATION_FAILED');
    await expectCode(service.sendRoomMessage({ userId: creatorId, roomId: newId(), content: '  ' }), 'VALIDATION_FAILED');
    expect(await Message.countDocuments()).toBe(0);
  });
});
