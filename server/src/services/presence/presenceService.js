const Room = require('../../models/Room');
const RoomMembership = require('../../models/RoomMembership');
const User = require('../../models/User');

const userRoom = (userId) => `user:${userId}`;
const ADD_SOCKET = `
  redis.call('SADD', KEYS[1], ARGV[1])
  return redis.call('SCARD', KEYS[1])
`;
const REMOVE_SOCKET = `
  local removed = redis.call('SREM', KEYS[1], ARGV[1])
  local count = redis.call('SCARD', KEYS[1])
  if count == 0 then redis.call('DEL', KEYS[1]) end
  return { removed, count }
`;

function createPresenceService({ redis, RoomModel = Room, RoomMembershipModel = RoomMembership, UserModel = User } = {}) {
  if (!redis) throw new Error('redis client is required');

  async function contactIds(userId) {
    const memberships = await RoomMembershipModel.find({ user_id: userId }).select('room_id').lean();
    if (memberships.length === 0) return [];
    const rooms = await RoomModel.find({
      _id: { $in: memberships.map((membership) => membership.room_id) },
      type: 'direct',
    }).select('_id').lean();
    if (rooms.length === 0) return [];
    const contacts = await RoomMembershipModel.find({
      room_id: { $in: rooms.map((room) => room._id) },
      user_id: { $ne: userId },
    }).select('user_id').lean();
    return [...new Set(contacts.map((membership) => String(membership.user_id)))];
  }

  async function broadcast(io, userId, status) {
    const contacts = await contactIds(userId);
    for (const contactId of contacts) {
      io.to(userRoom(contactId)).emit('presence:update', { userId: String(userId), status });
    }
    await UserModel.updateOne({ _id: userId }, { $set: { status } });
  }

  async function onConnect(io, socket) {
    if (!redis.isReady) return;
    const userId = String(socket.user.id);
    const count = Number(await redis.eval(ADD_SOCKET, {
      keys: [`presence:user:${userId}`],
      arguments: [socket.id],
    }));
    if (count === 1) await broadcast(io, userId, 'online');
  }

  async function onDisconnect(io, socket) {
    if (!redis.isReady) return;
    const userId = String(socket.user.id);
    const result = await redis.eval(REMOVE_SOCKET, {
      keys: [`presence:user:${userId}`],
      arguments: [socket.id],
    });
    const [removed, remaining] = result.map(Number);
    if (removed === 1 && remaining === 0) await broadcast(io, userId, 'offline');
  }

  return { onConnect, onDisconnect };
}

module.exports = { createPresenceService };
