// Messaging Service (SAD 2.2): direct messages, their status lifecycle and history.
// Room and User lookups are injected so this service does not depend on the
// Room/Auth services' internals and can be unit-tested (SAD 3.4.3).
const Message = require('../../models/Message');
const { AppError } = require('../../utils/errors');
const { sanitizeContent } = require('../../utils/sanitize');

const { MAX_CONTENT_LENGTH } = Message;
const MAX_IDEMPOTENCY_KEY_LENGTH = 100;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

function toMessageDto(msg) {
  return {
    id: String(msg._id),
    roomId: String(msg.room_id),
    senderId: String(msg.sender_id),
    content: msg.content,
    timestamp: msg.timestamp,
    status: msg.status,
    idempotencyKey: msg.idempotencyKey,
  };
}

// SEC-003: content is sanitised before it is stored; the stored form must fit the
// 2000-character field (SRS Appendix B).
function cleanContent(content) {
  if (typeof content !== 'string' || content.trim() === '') {
    throw new AppError('VALIDATION_FAILED', 'Message content is required');
  }
  const clean = sanitizeContent(content);
  if (clean === '') throw new AppError('VALIDATION_FAILED', 'Message content is required');
  if (clean.length > MAX_CONTENT_LENGTH) {
    throw new AppError('VALIDATION_FAILED', `Message content must be at most ${MAX_CONTENT_LENGTH} characters`);
  }
  return clean;
}

function validateDirectMessage({ fromUserId, toUserId, idempotencyKey }) {
  if (typeof toUserId !== 'string' || !OBJECT_ID.test(toUserId)) {
    throw new AppError('VALIDATION_FAILED', 'toUserId must be a valid user id');
  }
  if (toUserId === String(fromUserId)) {
    throw new AppError('VALIDATION_FAILED', 'You cannot send a direct message to yourself');
  }
  if (
    idempotencyKey !== undefined &&
    (typeof idempotencyKey !== 'string' || idempotencyKey === '' || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH)
  ) {
    throw new AppError('VALIDATION_FAILED', 'idempotencyKey must be a non-empty string of at most 100 characters');
  }
}

function validateId(value, name) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw new AppError('VALIDATION_FAILED', `${name} must be a valid id`);
  }
}

// Query params arrive as strings; missing means the default.
function parsePositiveInt(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new AppError('VALIDATION_FAILED', `${name} must be a positive integer`);
  return n;
}

/**
 * @param {object} deps
 * @param {(userA: string, userB: string) => Promise<{_id: any}>} deps.resolveDirectRoom  getOrCreateDirectRoom
 * @param {(userId: string) => Promise<boolean>} deps.userExists
 * @param {(userId: string, roomId: string) => Promise<boolean>} deps.isMember  RoomMembership check
 * @param {(userId: string) => Promise<string[]>} [deps.directRoomIdsFor]  the user's direct rooms (CS-29)
 * @param {(roomId: string) => Promise<string[]>} [deps.membersOf]  user ids in a room (CS-30)
 */
function createMessagingService({ resolveDirectRoom, userExists, isMember, directRoomIdsFor, membersOf }) {
  const findDuplicate = (fromUserId, idempotencyKey) =>
    Message.findOne({ sender_id: fromUserId, idempotencyKey });

  // FR-007/FR-017: the message is persisted before the caller acks 'sent' (SRS 6.2).
  // A retried send with the same idempotency key returns the original (SAD 3.4.2).
  async function sendDirectMessage({ fromUserId, toUserId, content, idempotencyKey }) {
    validateDirectMessage({ fromUserId, toUserId, idempotencyKey });
    const clean = cleanContent(content);
    if (!(await userExists(toUserId))) throw new AppError('NOT_FOUND', 'Recipient not found');

    if (idempotencyKey) {
      const existing = await findDuplicate(fromUserId, idempotencyKey);
      if (existing) return { message: existing, duplicate: true };
    }

    const room = await resolveDirectRoom(String(fromUserId), toUserId);
    try {
      const message = await Message.create({
        room_id: room._id,
        sender_id: fromUserId,
        content: clean,
        idempotencyKey,
      });
      return { message, duplicate: false };
    } catch (err) {
      // Two concurrent retries: the unique index lets only one through.
      if (err.code === 11000 && idempotencyKey) {
        return { message: await findDuplicate(fromUserId, idempotencyKey), duplicate: true };
      }
      throw err;
    }
  }

  // FR-009 / FR-011: status only moves forward, sent → delivered. Returns the messages
  // that actually changed, so callers notify each sender once.
  async function markDelivered(messageIds) {
    if (!messageIds.length) return [];
    const changed = await Message.find({ _id: { $in: messageIds }, status: 'sent' }).lean();
    if (!changed.length) return [];
    await Message.updateMany({ _id: { $in: changed.map((m) => m._id) }, status: 'sent' }, { status: 'delivered' });
    return changed.map((m) => ({ ...m, status: 'delivered' }));
  }

  // FR-009: DMs sent to this user that never reached a connected client, oldest first.
  async function pendingFor(userId) {
    const roomIds = await directRoomIdsFor(String(userId));
    if (!roomIds.length) return [];
    return Message.find({ room_id: { $in: roomIds }, sender_id: { $ne: userId }, status: 'sent' })
      .sort({ timestamp: 1, _id: 1 })
      .lean();
  }

  // FR-011: only the recipient can mark a DM read; an already-read message is a no-op.
  async function markRead({ userId, messageId }) {
    validateId(messageId, 'messageId');
    const message = await Message.findById(messageId).lean();
    if (!message || !(await isMember(String(userId), String(message.room_id)))) {
      throw new AppError('AUTH_FORBIDDEN', 'You cannot mark this message as read');
    }
    if (String(message.sender_id) === String(userId)) {
      throw new AppError('VALIDATION_FAILED', 'You cannot mark your own message as read');
    }
    if (message.status === 'read') return { message, changed: false };
    await Message.updateOne({ _id: message._id }, { status: 'read' });
    return { message: { ...message, status: 'read' }, changed: true };
  }

  // FR-010: who should see this user's typing state in a conversation or room.
  async function typingTargets({ userId, conversationId }) {
    validateId(conversationId, 'conversationId');
    if (!(await isMember(String(userId), conversationId))) {
      throw new AppError('AUTH_FORBIDDEN', 'You are not a participant in this conversation');
    }
    return (await membersOf(conversationId)).filter((id) => id !== String(userId));
  }

  // FR-018: newest first, paginated. Non-participants get AUTH_FORBIDDEN whether or
  // not the conversation exists, so its existence is not leaked (SAD 3.3).
  async function getHistory({ userId, conversationId, page, pageSize }) {
    if (typeof conversationId !== 'string' || !OBJECT_ID.test(conversationId)) {
      throw new AppError('VALIDATION_FAILED', 'conversationId must be a valid id');
    }
    const pageNum = parsePositiveInt(page, 1, 'page');
    const size = Math.min(parsePositiveInt(pageSize, DEFAULT_PAGE_SIZE, 'pageSize'), MAX_PAGE_SIZE);

    if (!(await isMember(String(userId), conversationId))) {
      throw new AppError('AUTH_FORBIDDEN', 'You are not a participant in this conversation');
    }

    // Fetch one extra row to know whether another page exists.
    const rows = await Message.find({ room_id: conversationId })
      .sort({ timestamp: -1, _id: -1 })
      .skip((pageNum - 1) * size)
      .limit(size + 1)
      .lean();

    return {
      messages: rows.slice(0, size).map(toMessageDto),
      nextPage: rows.length > size ? pageNum + 1 : null,
    };
  }

  return { sendDirectMessage, markDelivered, pendingFor, markRead, typingTargets, getHistory };
}

module.exports = { createMessagingService, toMessageDto, cleanContent };
