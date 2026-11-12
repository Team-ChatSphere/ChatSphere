const mongoose = require('mongoose');
const db = require('../helpers/db');
const RoomMembership = require('../../src/models/RoomMembership');
const { createRoomService } = require('../../src/services/rooms/roomService');

const newId = () => new mongoose.Types.ObjectId().toString();

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(db.clear);

describe('restoreRoom (D-07)', () => {
  test('re-attaches a current member', async () => {
    const service = createRoomService();
    const owner = newId();
    const { room } = await service.createRoom({ userId: owner, name: 'team' });

    await expect(service.restoreRoom({ userId: owner, roomId: String(room._id) }))
      .resolves.toMatchObject({ joined: true });
  });

  test('after leaving, restore does not recreate the membership', async () => {
    const service = createRoomService();
    const bob = newId();
    const { room } = await service.createRoom({ userId: newId(), name: 'team' });
    await service.joinRoom({ userId: bob, roomId: String(room._id) });
    await service.leaveRoom({ userId: bob, roomId: String(room._id) });

    await expect(service.restoreRoom({ userId: bob, roomId: String(room._id) }))
      .resolves.toEqual({ joined: false });
    await expect(RoomMembership.exists({ room_id: room._id, user_id: bob })).resolves.toBeNull();
  });

  test('an unknown room is not restored', async () => {
    const service = createRoomService();

    await expect(service.restoreRoom({ userId: newId(), roomId: newId() }))
      .resolves.toEqual({ joined: false });
  });
});
