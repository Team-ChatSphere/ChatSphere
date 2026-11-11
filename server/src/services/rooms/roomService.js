const Room = require('../../models/Room');
const RoomMembership = require('../../models/RoomMembership');
const Message = require('../../models/Message');
const { AppError } = require('../../utils/errors');
const { cleanContent } = require('../messaging/messagingService');
const { securityLog } = require('../../utils/securityLog');

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const DIRECT_ROOM_NAME = /^[0-9a-f]{24}:[0-9a-f]{24}$/i;

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
  UserModel = null,
} = {}) {
  let ResolvedUserModel = UserModel;
  if (!ResolvedUserModel) {
    try {
      ResolvedUserModel = require('../../models/User');
    } catch {
      // The room service can still be tested on branches before the auth model lands.
    }
  }
  const roomLocks = new Map();

  async function withRoomLock(roomId, operation) {
    const key = String(roomId);
    const previous = roomLocks.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    roomLocks.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (roomLocks.get(key) === current) roomLocks.delete(key);
    }
  }
  async function requireGroupRoom(roomId) {
    const room = await RoomModel.findById(roomId);
    if (!room) throw new AppError('NOT_FOUND', 'Room not found');
    if (room.type !== 'group') throw new AppError('VALIDATION_FAILED', 'This action only applies to group rooms');
    return room;
  }

  async function requireAdmin(roomId, userId, action) {
    const membership = await RoomMembershipModel.findOne({ room_id: roomId, user_id: userId });
    if (!membership || membership.role !== 'admin') {
      securityLog('room_admin_forbidden', { userId: String(userId), roomId: String(roomId), action });
      throw new AppError('AUTH_FORBIDDEN', 'Only room admins can perform this action');
    }
    return membership;
  }

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
    return withRoomLock(roomId, async () => {
      const membership = await RoomMembershipModel.findOne({ room_id: roomId, user_id: userId });
      if (!membership) return { room, left: false };
      if (membership.role === 'admin') {
        const admins = await RoomMembershipModel.countDocuments({ room_id: roomId, role: 'admin' });
        if (admins <= 1) throw new AppError('VALIDATION_FAILED', 'A room must keep at least one admin');
      }
      const result = await RoomMembershipModel.deleteOne({ room_id: roomId, user_id: userId });
      return { room, left: result.deletedCount > 0 };
    });
  }

  async function promoteMember({ actorUserId, roomId, userId }) {
    validateId(actorUserId, 'actorUserId');
    validateId(roomId, 'roomId');
    validateId(userId, 'userId');
    return withRoomLock(roomId, async () => {
      await requireAdmin(roomId, actorUserId, 'promote');
      const room = await requireGroupRoom(roomId);
      const membership = await RoomMembershipModel.findOne({ room_id: roomId, user_id: userId });
      if (!membership) throw new AppError('NOT_FOUND', 'Room member not found');
      if (membership.role !== 'admin') {
        membership.role = 'admin';
        await membership.save();
      }
      return { room, membership, promoted: true };
    });
  }

  async function removeMember({ actorUserId, roomId, userId }) {
    validateId(actorUserId, 'actorUserId');
    validateId(roomId, 'roomId');
    validateId(userId, 'userId');
    return withRoomLock(roomId, async () => {
      await requireAdmin(roomId, actorUserId, 'remove');
      const room = await requireGroupRoom(roomId);
      const membership = await RoomMembershipModel.findOne({ room_id: roomId, user_id: userId });
      if (!membership) throw new AppError('NOT_FOUND', 'Room member not found');
      if (membership.role === 'admin') {
        const admins = await RoomMembershipModel.countDocuments({ room_id: roomId, role: 'admin' });
        if (admins <= 1) throw new AppError('VALIDATION_FAILED', 'A room must keep at least one admin');
      }
      await RoomMembershipModel.deleteOne({ room_id: roomId, user_id: userId });
      return { room, removedUserId: userId, removed: true };
    });
  }

  async function listMembers({ userId, roomId }) {
    validateId(userId, 'userId');
    validateId(roomId, 'roomId');
    await requireGroupRoom(roomId);
    if (!(await isMember(userId, roomId, RoomMembershipModel))) {
      throw new AppError('AUTH_FORBIDDEN', 'You are not a member of this room');
    }
    const memberships = await RoomMembershipModel.find({ room_id: roomId }).lean();
    const users = ResolvedUserModel
      ? await ResolvedUserModel.find({ _id: { $in: memberships.map((membership) => membership.user_id) } }).select('username status').lean()
      : [];
    const usersById = new Map(users.map((user) => [String(user._id), user]));
    return memberships.map((membership) => {
      const member = usersById.get(String(membership.user_id));
      return {
        userId: String(membership.user_id),
        username: member?.username || 'Unknown member',
        role: membership.role,
        status: member?.status || 'offline',
      };
    });
  }

  async function sendRoomMessage({ userId, roomId, content, idempotencyKey }) {
    validateId(userId, 'userId');
    validateId(roomId, 'roomId');
    // SEC-003: the same sanitiser as DMs, applied before anything is stored.
    const normalizedContent = cleanContent(content);
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

  return { createRoom, joinRoom, restoreRoom, leaveRoom, promoteMember, removeMember, listMembers, sendRoomMessage };
}

module.exports = { createRoomService, validateRoomName, DIRECT_ROOM_NAME, isMember };
