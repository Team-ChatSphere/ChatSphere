const mongoose = require('mongoose');
const db = require('../helpers/db');
const Room = require('../../src/models/Room');
const RoomMembership = require('../../src/models/RoomMembership');
const { getOrCreateDirectRoom, directRoomName } = require('../../src/services/messaging/directRoom');
const { createRoomService } = require('../../src/services/rooms/roomService');

const newId = () => new mongoose.Types.ObjectId().toString();
const expectCode = (promise, code) => expect(promise).rejects.toMatchObject({ code });

const alice = newId();
const bob = newId();

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(db.clear);

const membersOf = async (roomId) =>
  (await RoomMembership.find({ room_id: roomId }).lean()).map((m) => [String(m.user_id), m.role]).sort();

describe('getOrCreateDirectRoom (CS-10, FR-017)', () => {
  test('creates a direct room named by the sorted ids, with both users as members', async () => {
    const room = await getOrCreateDirectRoom(alice, bob);

    expect(room.type).toBe('direct');
    expect(room.name).toBe(directRoomName(alice, bob));
    expect(room.name).toHaveLength(49);
    expect(await membersOf(room._id)).toEqual([[alice, 'member'], [bob, 'member']].sort());
  });

  test('returns the same room whichever user starts it, without duplicating memberships', async () => {
    const first = await getOrCreateDirectRoom(alice, bob);
    const second = await getOrCreateDirectRoom(bob, alice);

    expect(String(second._id)).toBe(String(first._id));
    expect(await Room.countDocuments()).toBe(1);
    expect(await RoomMembership.countDocuments()).toBe(2);
  });

  test('concurrent first messages still produce one room', async () => {
    const rooms = await Promise.all([
      getOrCreateDirectRoom(alice, bob),
      getOrCreateDirectRoom(bob, alice),
      getOrCreateDirectRoom(alice, bob),
    ]);

    expect(new Set(rooms.map((r) => String(r._id))).size).toBe(1);
    expect(await Room.countDocuments()).toBe(1);
    expect(await RoomMembership.countDocuments()).toBe(2);
  });

  test('different pairs get different rooms', async () => {
    const carol = newId();

    const ab = await getOrCreateDirectRoom(alice, bob);
    const ac = await getOrCreateDirectRoom(alice, carol);

    expect(String(ab._id)).not.toBe(String(ac._id));
  });

  test('rejects a DM with yourself and malformed ids', async () => {
    await expectCode(getOrCreateDirectRoom(alice, alice), 'VALIDATION_FAILED');
    await expectCode(getOrCreateDirectRoom(alice, 'bob'), 'VALIDATION_FAILED');
    expect(await Room.countDocuments()).toBe(0);
  });

  test('a direct room cannot be joined as a group (Room service rule)', async () => {
    const room = await getOrCreateDirectRoom(alice, bob);

    await expectCode(createRoomService().joinRoom({ userId: newId(), roomId: String(room._id) }), 'VALIDATION_FAILED');
  });
});
