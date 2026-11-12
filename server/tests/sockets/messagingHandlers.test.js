const { registerMessagingHandlers, handleDirectMessageSend } = require('../../src/sockets/messagingHandlers');
const { AppError } = require('../../src/utils/errors');

const ALICE = 'a'.repeat(24);
const BOB = 'b'.repeat(24);
const MESSAGE_ID = 'c'.repeat(24);

const savedMessage = (overrides = {}) => ({
  _id: MESSAGE_ID,
  room_id: 'd'.repeat(24),
  sender_id: ALICE,
  content: 'hi',
  timestamp: new Date('2026-10-19T10:00:00Z'),
  status: 'sent',
  idempotencyKey: 'k-1',
  ...overrides,
});

function mockIo() {
  const emit = jest.fn();
  const to = jest.fn();
  to.mockReturnValue({ to, emit });
  return { io: { to }, to, emit };
}

const mockSocket = () => ({ user: { id: ALICE, username: 'alice' }, emit: jest.fn(), on: jest.fn() });

const serviceResolving = (result) => ({ sendDirectMessage: jest.fn().mockResolvedValue(result) });

describe('message:send for DMs (FR-007, FR-008)', () => {
  test('delivers message:new to both participants and acks sent after persisting', async () => {
    const { io, to, emit } = mockIo();
    const socket = mockSocket();
    const service = serviceResolving({ message: savedMessage(), duplicate: false });
    const ack = jest.fn();

    await handleDirectMessageSend({ io, socket, service }, { toUserId: BOB, content: 'hi', idempotencyKey: 'k-1' }, ack);

    expect(service.sendDirectMessage).toHaveBeenCalledWith({
      fromUserId: ALICE,
      toUserId: BOB,
      content: 'hi',
      idempotencyKey: 'k-1',
    });
    expect(to).toHaveBeenCalledWith(`user:${BOB}`);
    expect(to).toHaveBeenCalledWith(`user:${ALICE}`);
    expect(emit).toHaveBeenCalledWith(
      'message:new',
      expect.objectContaining({ id: MESSAGE_ID, senderId: ALICE, content: 'hi', kind: 'direct', senderUsername: 'alice' })
    );
    expect(socket.emit).toHaveBeenCalledWith('message:status', {
      messageId: MESSAGE_ID,
      idempotencyKey: 'k-1',
      status: 'sent',
    });
    expect(ack).toHaveBeenCalledWith({ ok: true, message: expect.objectContaining({ id: MESSAGE_ID }) });
    // Persist before ack (SRS 6.2).
    expect(service.sendDirectMessage.mock.invocationCallOrder[0]).toBeLessThan(
      socket.emit.mock.invocationCallOrder[0]
    );
  });

  test('a duplicate send is acked again but not re-delivered', async () => {
    const { io, emit } = mockIo();
    const socket = mockSocket();
    const service = serviceResolving({ message: savedMessage(), duplicate: true });

    await handleDirectMessageSend({ io, socket, service }, { toUserId: BOB, content: 'hi', idempotencyKey: 'k-1' });

    expect(emit).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('message:status', expect.objectContaining({ status: 'sent' }));
  });

  test('a service error is sent on the error event and nothing is delivered', async () => {
    const { io, emit } = mockIo();
    const socket = mockSocket();
    const err = new AppError('VALIDATION_FAILED', 'You cannot send a direct message to yourself');
    const service = { sendDirectMessage: jest.fn().mockRejectedValue(err) };
    const ack = jest.fn();

    await handleDirectMessageSend({ io, socket, service }, { toUserId: ALICE, content: 'hi' }, ack);

    const body = { code: 'VALIDATION_FAILED', message: 'You cannot send a direct message to yourself' };
    expect(socket.emit).toHaveBeenCalledWith('error', body);
    expect(ack).toHaveBeenCalledWith({ ok: false, error: body });
    expect(emit).not.toHaveBeenCalled();
  });

  test('an unexpected error is reported as INTERNAL_ERROR without detail', async () => {
    const { io } = mockIo();
    const socket = mockSocket();
    const service = { sendDirectMessage: jest.fn().mockRejectedValue(new Error('connection string leaked')) };
    const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await handleDirectMessageSend({ io, socket, service }, { toUserId: BOB, content: 'hi' });

    expect(socket.emit).toHaveBeenCalledWith('error', { code: 'INTERNAL_ERROR', message: 'Something went wrong' });
    logSpy.mockRestore();
  });
});

describe('registerMessagingHandlers', () => {
  const listener = (socket) => socket.on.mock.calls.find(([event]) => event === 'message:send')[1];

  test('routes { roomId } payloads to the Room service handler', () => {
    const socket = mockSocket();
    const onRoomMessage = jest.fn();
    const service = { sendDirectMessage: jest.fn() };
    registerMessagingHandlers(mockIo().io, socket, { service, onRoomMessage });

    const payload = { roomId: 'd'.repeat(24), content: 'hi all' };
    const ack = jest.fn();
    listener(socket)(payload, ack);

    expect(onRoomMessage).toHaveBeenCalledWith(socket, payload, ack);
    expect(service.sendDirectMessage).not.toHaveBeenCalled();
  });

  test('routes { toUserId } payloads to the DM handler', async () => {
    const socket = mockSocket();
    const service = serviceResolving({ message: savedMessage(), duplicate: false });
    registerMessagingHandlers(mockIo().io, socket, { service, onRoomMessage: jest.fn() });

    await listener(socket)({ toUserId: BOB, content: 'hi' });

    expect(service.sendDirectMessage).toHaveBeenCalled();
  });
});
