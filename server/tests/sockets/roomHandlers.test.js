const { AppError } = require('../../src/utils/errors');
const { createRoomMessageHandler, registerRoomHandlers } = require('../../src/sockets/roomHandlers');

const ALICE = 'a'.repeat(24);
const ROOM = 'r'.repeat(24);

function mockIo() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  const inRoom = jest.fn();
  return { io: { to, in: inRoom }, to, inRoom, emit };
}

function mockSocket() {
  return { user: { id: ALICE, username: 'alice' }, emit: jest.fn(), join: jest.fn(), leave: jest.fn(), on: jest.fn() };
}

const listener = (socket, event) => socket.on.mock.calls.find(([name]) => name === event)[1];

describe('room socket handlers (CS-18, CS-19)', () => {
  test('room:create creates and joins the creator to the room socket channel', async () => {
    const { io } = mockIo();
    const socket = mockSocket();
    const service = { createRoom: jest.fn().mockResolvedValue({ room: { _id: ROOM, name: 'team', type: 'group', created_by: ALICE } }) };
    registerRoomHandlers(io, socket, { service });
    const ack = jest.fn();

    await listener(socket, 'room:create')({ name: 'team' }, ack);

    expect(service.createRoom).toHaveBeenCalledWith({ userId: ALICE, name: 'team' });
    expect(socket.join).toHaveBeenCalledWith(`room:${ROOM}`);
    expect(socket.emit).toHaveBeenCalledWith('room:created', { roomId: ROOM, name: 'team', type: 'group', createdBy: ALICE });
    expect(ack).toHaveBeenCalledWith({ ok: true, room: { roomId: ROOM, name: 'team', type: 'group', createdBy: ALICE } });
  });

  test('room:join joins and broadcasts the membership event', async () => {
    const { io, to, emit } = mockIo();
    const socket = mockSocket();
    const service = { joinRoom: jest.fn().mockResolvedValue({ room: { _id: ROOM }, joined: true }) };
    registerRoomHandlers(io, socket, { service });
    const ack = jest.fn();

    await listener(socket, 'room:join')({ roomId: ROOM }, ack);

    expect(socket.join).toHaveBeenCalledWith(`room:${ROOM}`);
    expect(to).toHaveBeenCalledWith(`room:${ROOM}`);
    expect(emit).toHaveBeenCalledWith('room:memberJoined', { roomId: ROOM, userId: ALICE });
    expect(ack).toHaveBeenCalledWith({ ok: true, roomId: ROOM, joined: true });
  });

  test('room:restore re-attaches only a confirmed member', async () => {
    const { io } = mockIo();
    const socket = mockSocket();
    const service = { restoreRoom: jest.fn().mockResolvedValue({ room: { _id: ROOM }, joined: true }) };
    registerRoomHandlers(io, socket, { service });
    const ack = jest.fn();

    await listener(socket, 'room:restore')({ roomId: ROOM }, ack);

    expect(service.restoreRoom).toHaveBeenCalledWith({ userId: ALICE, roomId: ROOM });
    expect(socket.join).toHaveBeenCalledWith(`room:${ROOM}`);
    expect(socket.leave).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ ok: true, roomId: ROOM, joined: true });
  });

  test('room:restore leaves the channel and acknowledges a former member', async () => {
    const { io } = mockIo();
    const socket = mockSocket();
    const service = { restoreRoom: jest.fn().mockResolvedValue({ joined: false }) };
    registerRoomHandlers(io, socket, { service });
    const ack = jest.fn();

    await listener(socket, 'room:restore')({ roomId: ROOM }, ack);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.leave).toHaveBeenCalledWith(`room:${ROOM}`);
    expect(ack).toHaveBeenCalledWith({ ok: true, roomId: ROOM, joined: false });
  });

  test('room:leave removes the socket from the channel and broadcasts membership change', async () => {
    const { io, inRoom, emit } = mockIo();
    const socket = mockSocket();
    const otherTab = { leave: jest.fn() };
    inRoom.mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([socket, otherTab]) });
    const service = { leaveRoom: jest.fn().mockResolvedValue({ room: { _id: ROOM }, left: true }) };
    registerRoomHandlers(io, socket, { service });

    await listener(socket, 'room:leave')({ roomId: ROOM });

    expect(inRoom).toHaveBeenCalledWith(`user:${ALICE}`);
    expect(socket.leave).toHaveBeenCalledWith(`room:${ROOM}`);
    expect(otherTab.leave).toHaveBeenCalledWith(`room:${ROOM}`);
    expect(emit).toHaveBeenCalledWith('room:memberLeft', { roomId: ROOM, userId: ALICE });
  });
});

describe('onRoomMessage (CS-20, CS-21)', () => {
  test('persists and broadcasts group messages to the room channel', async () => {
    const { io, to, emit } = mockIo();
    const socket = mockSocket();
    const saved = {
      _id: 'm'.repeat(24), room_id: ROOM, sender_id: ALICE, content: 'hello',
      timestamp: new Date('2026-10-19T10:00:00Z'), status: 'sent', idempotencyKey: 'k-1',
    };
    const service = { sendRoomMessage: jest.fn().mockResolvedValue({ message: saved, duplicate: false }) };
    const onRoomMessage = createRoomMessageHandler(io, { service });
    const ack = jest.fn();

    await onRoomMessage(socket, { roomId: ROOM, content: 'hello', idempotencyKey: 'k-1' }, ack);

    expect(service.sendRoomMessage).toHaveBeenCalledWith({ userId: ALICE, roomId: ROOM, content: 'hello', idempotencyKey: 'k-1' });
    expect(to).toHaveBeenCalledWith(`room:${ROOM}`);
    expect(emit).toHaveBeenCalledWith('message:new', expect.objectContaining({ roomId: ROOM, senderId: ALICE, kind: 'room' }));
    expect(ack).toHaveBeenCalledWith({ ok: true, message: expect.objectContaining({ roomId: ROOM }) });
  });

  test('a forbidden sender receives an error and the room gets no broadcast', async () => {
    const { io, emit } = mockIo();
    const socket = mockSocket();
    const error = new AppError('AUTH_FORBIDDEN', 'You are not a member of this room');
    const service = { sendRoomMessage: jest.fn().mockRejectedValue(error) };
    const onRoomMessage = createRoomMessageHandler(io, { service });
    const ack = jest.fn();

    await onRoomMessage(socket, { roomId: ROOM, content: 'intrude' }, ack);

    expect(socket.emit).toHaveBeenCalledWith('error', { code: 'AUTH_FORBIDDEN', message: error.message });
    expect(ack).toHaveBeenCalledWith({ ok: false, error: { code: 'AUTH_FORBIDDEN', message: error.message } });
    expect(emit).not.toHaveBeenCalled();
  });
});
