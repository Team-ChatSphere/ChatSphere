// Socket.IO handlers for the Messaging Service. The gateway (CS-07) authenticates
// the socket, sets socket.user = { id, username } and joins it to `user:<id>`.
const { toMessageDto } = require('../services/messaging/messagingService');
const { toErrorBody } = require('../utils/errors');

const userRoom = (userId) => `user:${userId}`;

function replyError(socket, ack, err, event = 'message:send') {
  const body = toErrorBody(err);
  if (body.code === 'INTERNAL_ERROR') console.error(`${event} failed`, err);
  socket.emit('error', body);
  if (typeof ack === 'function') ack({ ok: false, error: body });
}

async function isOnline(io, userId) {
  if (typeof io.in !== 'function') return false;
  return (await io.in(userRoom(userId)).fetchSockets()).length > 0;
}

// FR-011: every status change goes to all of the sender's tabs.
function notifyStatus(io, messages) {
  for (const m of messages) {
    io.to(userRoom(String(m.sender_id))).emit('message:status', {
      messageId: String(m._id),
      idempotencyKey: m.idempotencyKey,
      status: m.status,
    });
  }
}

// FR-007/FR-008: persist, push message:new to both participants, then ack 'sent'.
// If the recipient is connected the message is delivered at once (FR-011).
async function handleDirectMessageSend({ io, socket, service }, payload, ack) {
  const { toUserId, content, idempotencyKey } = payload || {};
  try {
    const { message, duplicate } = await service.sendDirectMessage({
      fromUserId: socket.user.id,
      toUserId,
      content,
      idempotencyKey,
    });
    const dto = toMessageDto(message);
    // A retried send is acked again but not delivered twice. `kind` and
    // `senderUsername` let the client list a DM from someone new without a lookup.
    if (!duplicate) {
      io.to(userRoom(toUserId))
        .to(userRoom(socket.user.id))
        .emit('message:new', { ...dto, kind: 'direct', senderUsername: socket.user.username });
    }
    socket.emit('message:status', { messageId: dto.id, idempotencyKey: dto.idempotencyKey, status: dto.status });
    if (typeof ack === 'function') ack({ ok: true, message: dto });

    if (!duplicate && service.markDelivered && (await isOnline(io, toUserId))) {
      notifyStatus(io, await service.markDelivered([message._id]));
    }
  } catch (err) {
    replyError(socket, ack, err);
  }
}

// FR-011: the recipient's client reports a message as read.
async function handleMessageRead({ io, socket, service }, payload, ack) {
  try {
    const { message, changed } = await service.markRead({ userId: socket.user.id, messageId: payload?.messageId });
    if (changed) notifyStatus(io, [message]);
    if (typeof ack === 'function') ack({ ok: true, status: 'read' });
  } catch (err) {
    replyError(socket, ack, err, 'message:read');
  }
}

// FR-010: typing:start / typing:stop { conversationId | roomId } → typing:update to the
// other participants. Clients clear a stale indicator themselves after a few seconds.
async function handleTyping({ io, socket, service }, payload, typing) {
  const roomId = payload?.roomId;
  const conversationId = roomId || payload?.conversationId;
  try {
    const targets = await service.typingTargets({ userId: socket.user.id, conversationId });
    const update = {
      ...(roomId ? { roomId } : { conversationId }),
      userId: socket.user.id,
      username: socket.user.username,
      typing,
    };
    targets.forEach((id) => io.to(userRoom(id)).emit('typing:update', update));
  } catch {
    // Typing is best-effort; a bad or unauthorised request is simply ignored.
  }
}

// FR-009: on (re)connect, push DMs that arrived while this user was offline, then tell
// each sender they were delivered.
async function deliverPending(io, socket, { service, usernamesFor }) {
  const pending = await service.pendingFor(socket.user.id);
  if (!pending.length) return 0;
  const names = await usernamesFor([...new Set(pending.map((m) => String(m.sender_id)))]);
  for (const m of pending) {
    socket.emit('message:new', {
      ...toMessageDto({ ...m, status: 'delivered' }),
      kind: 'direct',
      senderUsername: names[String(m.sender_id)],
    });
  }
  notifyStatus(io, await service.markDelivered(pending.map((m) => m._id)));
  return pending.length;
}

// `message:send` carries either { toUserId } (DM, this service) or { roomId }
// (group message, handled by the Room service's onRoomMessage, CS-20).
function registerMessagingHandlers(io, socket, { service, onRoomMessage }) {
  socket.on('message:send', (payload, ack) => {
    if (payload && payload.roomId && onRoomMessage) return onRoomMessage(socket, payload, ack);
    return handleDirectMessageSend({ io, socket, service }, payload, ack);
  });
  socket.on('message:read', (payload, ack) => handleMessageRead({ io, socket, service }, payload, ack));
  socket.on('typing:start', (payload) => handleTyping({ io, socket, service }, payload, true));
  socket.on('typing:stop', (payload) => handleTyping({ io, socket, service }, payload, false));
}

module.exports = {
  registerMessagingHandlers,
  handleDirectMessageSend,
  handleMessageRead,
  handleTyping,
  deliverPending,
  userRoom,
};
