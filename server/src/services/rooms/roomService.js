const Room = require('../../models/Room');
const RoomMembership = require('../../models/RoomMembership');
const Message = require('../../models/Message');
const { AppError } = require('../../utils/errors');

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const DIRECT_ROOM_NAME = /^[0-9a-f]{24}:[0-9a-f]{24}$/i;
const MAX_CONTENT_LENGTH = Message.MAX_CONTENT_LENGTH;

function validateId(value, field) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw new AppError('VALIDATION_FAILED', `${field} must be a valid id`);
  }
}

// Shared membership check for room messaging and the DM history service.
async function isMember(userId, roomId, RoomMembershipModel = RoomMembership) {
  return Boolean(await RoomMembershipModel.exists({ room_id: roomId, user_id: userId }));
}

function validateRoomName(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError('VALIDATION_FAILED', 'Room name is required');
  }
  const name = value.trim();
  if (name.length > 50) throw new AppError('VALIDATION_FAILED', 'Room name must be at most 50 characters');
  if (DIRECT_ROOM_NAME.test(name)) throw new AppError('VALIDATION_FAILED', 'Room name is reserved for direct conversations');
  return name;
}

function mapDuplicateRoomName(err) {
  if (err?.code === 11000 && err?.keyPattern?.name) {
    throw new AppError('VALIDATION_FAILED', 'A room with this name already exists');
  }
  throw err;
}

function createRoomService({
  RoomModel = Room,
  RoomMembershipModel = RoomMembership,
  MessageModel = Message,
} = {}) {
  async function createRoom({ userId, name }) {
    validateId(userId, 'userId');
    const normalizedName = validateRoomName(name);
    let room;
    try {
      room = await RoomModel.create({ name: normalizedName, type: 'group', created_by: userId });
    } catch (err) {
      mapDuplicateRoomName(err);
    }

    try {
      const membership = await RoomMembershipModel.create({ room_id: room._id, user_id: userId, role: 'admin' });
      return { room, membership };
    } catch (err) {
      await RoomModel.deleteOne({ _id: room._id });
      throw err;
    }
  }

  async function joinRoom({ userId, roomId }) {
    validateId(userId, 'userId');
    validateId(roomId, 'roomId');
    const room = await RoomModel.findById(roomId);
    if (!room) throw new AppError('NOT_FOUND', 'Room not found');
    if (room.type !== 'group') throw new AppError('VALIDATION_FAILED', 'Direct rooms cannot be joined');

    const existing = await RoomMembershipModel.findOne({ room_id: roomId, user_id: userId });
    if (existing) return { room, membership: existing, joined: false };

    try {
      const membership = await RoomMembershipModel.create({ room_id: roomId, user_id: userId, role: 'member' });
      return { room, membership, joined: true };
    } catch (err) {
      // Concurrent room:join events may race the unique (room_id, user_id) index.
      if (err?.code === 11000) {
        const membership = await RoomMembershipModel.findOne({ room_id: roomId, user_id: userId });
        if (membership) return { room, membership, joined: false };
      }
      throw err;
    }
  }

  // Restore only the socket's channel membership. This must never recreate a
  // database membership: the user's membership may have been removed elsewhere.
  async function restoreRoom({ userId, roomId }) {
    validateId(userId, 'userId');
    validateId(roomId, 'roomId');
    if (!(await isMember(userId, roomId, RoomMembershipModel))) return { joined: false };

    const room = await RoomModel.findById(roomId);
    if (!room || room.type !== 'group') return { joined: false };
    return { room, joined: true };
  }

  async function leaveRoom({ userId, roomId }) {
    validateId(userId, 'userId');
    validateId(roomId, 'roomId');
    const room = await RoomModel.findById(roomId);
    if (!room) throw new AppError('NOT_FOUND', 'Room not found');
    if (room.type !== 'group') throw new AppError('VALIDATION_FAILED', 'Direct rooms cannot be left');
    const result = await RoomMembershipModel.deleteOne({ room_id: roomId, user_id: userId });
    return { room, left: result.deletedCount > 0 };
  }

  async function sendRoomMessage({ userId, roomId, content, idempotencyKey }) {
    validateId(userId, 'userId');
    validateId(roomId, 'roomId');
    if (typeof content !== 'string' || content.trim() === '') {
      throw new AppError('VALIDATION_FAILED', 'Message content is required');
    }
    const normalizedContent = content.trim();
    if (normalizedContent.length > MAX_CONTENT_LENGTH) {
      throw new AppError('VALIDATION_FAILED', `Message content must be at most ${MAX_CONTENT_LENGTH} characters`);
    }
    if (idempotencyKey !== undefined &&
        (typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > 100)) {
      throw new AppError('VALIDATION_FAILED', 'idempotencyKey must be a non-empty string of at most 100 characters');
    }

    if (!(await isMember(userId, roomId, RoomMembershipModel))) {
      throw new AppError('AUTH_FORBIDDEN', 'You are not a member of this room');
    }
    const room = await RoomModel.findById(roomId);
    if (!room) throw new AppError('NOT_FOUND', 'Room not found');
    if (room.type !== 'group') throw new AppError('VALIDATION_FAILED', 'Room messages can only be sent to group rooms');

    if (idempotencyKey) {
      const existing = await MessageModel.findOne({ sender_id: userId, idempotencyKey });
      if (existing) {
        if (String(existing.room_id) !== String(roomId)) {
          throw new AppError('VALIDATION_FAILED', 'idempotencyKey has already been used for another conversation');
        }
        return { message: existing, duplicate: true };
      }
    }

    try {
      const message = await MessageModel.create({
        room_id: roomId,
        sender_id: userId,
        content: normalizedContent,
        idempotencyKey,
      });
      return { message, duplicate: false };
    } catch (err) {
      if (err?.code === 11000 && idempotencyKey) {
        const existing = await MessageModel.findOne({ sender_id: userId, idempotencyKey });
        if (existing && String(existing.room_id) === String(roomId)) return { message: existing, duplicate: true };
      }
      throw err;
    }
  }

  return { createRoom, joinRoom, restoreRoom, leaveRoom, sendRoomMessage };
}

module.exports = { createRoomService, validateRoomName, DIRECT_ROOM_NAME, isMember };
