// Socket.IO handlers for the Messaging Service. The gateway (CS-07) authenticates
// the socket, sets socket.user = { id, username } and joins it to `user:<id>`.
const { toMessageDto } = require('../services/messaging/messagingService');
const { toErrorBody } = require('../utils/errors');

const userRoom = (userId) => `user:${userId}`;

function replyError(socket, ack, err) {
  const body = toErrorBody(err);
  if (body.code === 'INTERNAL_ERROR') console.error('message:send failed', err);
  socket.emit('error', body);
  if (typeof ack === 'function') ack({ ok: false, error: body });
}

// FR-007/FR-008: persist, push message:new to both participants, then ack 'sent'.
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
  } catch (err) {
    replyError(socket, ack, err);
  }
}

// `message:send` carries either { toUserId } (DM, this service) or { roomId }
// (group message, handled by the Room service's onRoomMessage, CS-20).
function registerMessagingHandlers(io, socket, { service, onRoomMessage }) {
  socket.on('message:send', (payload, ack) => {
    if (payload && payload.roomId && onRoomMessage) return onRoomMessage(socket, payload, ack);
    return handleDirectMessageSend({ io, socket, service }, payload, ack);
  });
}

module.exports = { registerMessagingHandlers, handleDirectMessageSend, userRoom };
