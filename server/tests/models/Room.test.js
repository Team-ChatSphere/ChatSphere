const mongoose = require('mongoose');
const db = require('../helpers/db');
const Room = require('../../src/models/Room');
const RoomMembership = require('../../src/models/RoomMembership');

const userId = () => new mongoose.Types.ObjectId();

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(db.clear);

describe('Room (CS-17)', () => {
  test('stores the contract fields and trims the unique name', async () => {
    const room = await Room.create({ name: '  team  ', type: 'group', created_by: userId() });

    expect(room.name).toBe('team');
    expect(room.type).toBe('group');
    expect(room.created_by).toBeInstanceOf(mongoose.Types.ObjectId);
  });

  test('requires a name, type, and creator, limits the name to 50 characters, and validates type', async () => {
    await expect(Room.create({ type: 'group', created_by: userId() })).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Room.create({ name: 'x'.repeat(51), type: 'group', created_by: userId() })).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Room.create({ name: 'team', type: 'private', created_by: userId() })).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('enforces unique names', async () => {
    await Room.create({ name: 'team', type: 'group', created_by: userId() });

    await expect(Room.create({ name: 'team', type: 'group', created_by: userId() })).rejects.toMatchObject({ code: 11000 });
  });
});

describe('RoomMembership (CS-17)', () => {
  test('defaults to member and allows admin', async () => {
    const room = await Room.create({ name: 'team', type: 'group', created_by: userId() });
    const member = await RoomMembership.create({ room_id: room._id, user_id: userId() });
    const admin = await RoomMembership.create({ room_id: room._id, user_id: userId(), role: 'admin' });

    expect(member.role).toBe('member');
    expect(admin.role).toBe('admin');
  });

  test('enforces valid roles and one membership per room/user', async () => {
    const room = await Room.create({ name: 'team', type: 'group', created_by: userId() });
    const user = userId();
    await RoomMembership.create({ room_id: room._id, user_id: user, role: 'member' });

    await expect(RoomMembership.create({ room_id: room._id, user_id: user, role: 'owner' })).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(RoomMembership.create({ room_id: room._id, user_id: user, role: 'admin' })).rejects.toMatchObject({ code: 11000 });
  });
});
