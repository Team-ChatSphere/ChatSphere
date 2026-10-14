const { toMessageDto } = require('../services/messaging/messagingService');
const { toErrorBody } = require('../utils/errors');

const socketRoom = (roomId) => `room:${roomId}`;
const userRoom = (userId) => `user:${userId}`;

function replyError(socket, ack, err, event) {
  const body = toErrorBody(err);
  if (body.code === 'INTERNAL_ERROR') console.error(`${event} failed`, err);
  socket.emit('error', body);
  if (typeof ack === 'function') ack({ ok: false, error: body });
}

function roomDto(room) {
  return { roomId: String(room._id), name: room.name, type: room.type, createdBy: String(room.created_by) };
}

function registerRoomHandlers(io, socket, { service }) {
  socket.on('room:create', async (payload, ack) => {
    try {
      const { room } = await service.createRoom({ userId: socket.user.id, name: payload?.name });
      const result = roomDto(room);
      socket.join(socketRoom(result.roomId));
      socket.emit('room:created', result);
      if (typeof ack === 'function') ack({ ok: true, room: result });
    } catch (err) {
      replyError(socket, ack, err, 'room:create');
    }
  });

  socket.on('room:join', async (payload, ack) => {
    try {
      const { room, joined } = await service.joinRoom({ userId: socket.user.id, roomId: payload?.roomId });
      const id = String(room._id);
      socket.join(socketRoom(id));
      if (joined) io.to(socketRoom(id)).emit('room:memberJoined', { roomId: id, userId: socket.user.id });
      const result = { roomId: id, joined };
      socket.emit('room:joined', result);
      if (typeof ack === 'function') ack({ ok: true, ...result });
    } catch (err) {
      replyError(socket, ack, err, 'room:join');
    }
  });

  socket.on('room:restore', async (payload, ack) => {
    try {
      const { room, joined } = await service.restoreRoom({ userId: socket.user.id, roomId: payload?.roomId });
      const id = payload?.roomId;
      if (joined) socket.join(socketRoom(String(room._id)));
      else socket.leave(socketRoom(id));
      if (typeof ack === 'function') ack({ ok: true, roomId: id, joined });
    } catch (err) {
      replyError(socket, ack, err, 'room:restore');
    }
  });

  socket.on('room:leave', async (payload, ack) => {
    try {
      const { room, left } = await service.leaveRoom({ userId: socket.user.id, roomId: payload?.roomId });
      const id = String(room._id);
      if (left && typeof io.in === 'function') {
        // A user may be connected from more than one tab/device. Evict all of
        // their sockets so a former member cannot keep receiving broadcasts.
        const memberSockets = await io.in(userRoom(socket.user.id)).fetchSockets();
        await Promise.all(memberSockets.map((memberSocket) => memberSocket.leave(socketRoom(id))));
      } else {
        socket.leave(socketRoom(id));
      }
      if (left) io.to(socketRoom(id)).emit('room:memberLeft', { roomId: id, userId: socket.user.id });
      const result = { roomId: id, left };
      socket.emit('room:left', result);
      if (typeof ack === 'function') ack({ ok: true, ...result });
    } catch (err) {
      replyError(socket, ack, err, 'room:leave');
    }
  });
}

function createRoomMessageHandler(io, { service }) {
  return async function onRoomMessage(socket, payload, ack) {
    try {
      const { message, duplicate } = await service.sendRoomMessage({
        userId: socket.user.id,
        roomId: payload?.roomId,
        content: payload?.content,
        idempotencyKey: payload?.idempotencyKey,
      });
      const dto = toMessageDto(message);
      if (!duplicate) io.to(socketRoom(dto.roomId)).emit('message:new', { ...dto, kind: 'room' });
      socket.emit('message:status', {
        messageId: dto.id,
        idempotencyKey: dto.idempotencyKey,
        status: dto.status,
      });
      if (typeof ack === 'function') ack({ ok: true, message: dto });
    } catch (err) {
      replyError(socket, ack, err, 'room message:send');
    }
  };
}

module.exports = { registerRoomHandlers, createRoomMessageHandler, socketRoom, userRoom, roomDto };
