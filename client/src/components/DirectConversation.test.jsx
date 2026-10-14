import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createFakeSocket } from '../test/fakeSocket.js';
import { apiRequest } from '../api/client.js';
import DirectConversation from './DirectConversation.jsx';

const ME = { id: 'a'.repeat(24), username: 'alice' };
const BOB = { id: 'b'.repeat(24), username: 'bob' };
const ROOM = 'd'.repeat(24);

let socket;

vi.mock('../api/client.js', () => ({ apiRequest: vi.fn() }));
vi.mock('../state/AuthContext.jsx', () => ({ useAuth: () => ({ token: 'jwt', user: ME }) }));
vi.mock('../state/SocketContext.jsx', () => ({ useSocket: () => ({ socket }) }));

const msg = (n, overrides = {}) => ({
  id: `m${n}`.padEnd(24, '0'),
  roomId: ROOM,
  senderId: n % 2 ? BOB.id : ME.id,
  content: `message ${n}`,
  timestamp: new Date(Date.UTC(2026, 9, 19, 10, n)).toISOString(),
  status: 'sent',
  ...overrides,
});

const typeAndSend = (text) => {
  fireEvent.change(screen.getByLabelText('Message bob'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
};

const contents = () => screen.queryAllByRole('listitem').map((li) => li.querySelector('.dm-bubble').textContent);

beforeEach(() => {
  socket = createFakeSocket();
  apiRequest.mockReset();
});
afterEach(cleanup);

describe('DirectConversation (CS-13)', () => {
  test('loads history oldest-first and pages in older messages (FR-018)', async () => {
    apiRequest
      .mockResolvedValueOnce({ messages: [msg(4), msg(3)], nextPage: 2 })
      .mockResolvedValueOnce({ messages: [msg(2), msg(1)], nextPage: null });

    render(<DirectConversation peer={BOB} conversationId={ROOM} />);

    await waitFor(() => expect(contents()).toEqual(['message 3', 'message 4']));
    expect(apiRequest).toHaveBeenCalledWith(`/api/messages/${ROOM}?page=1&pageSize=30`, { token: 'jwt' });

    fireEvent.click(screen.getByRole('button', { name: 'Load older messages' }));

    await waitFor(() => expect(contents()).toEqual(['message 1', 'message 2', 'message 3', 'message 4']));
    expect(screen.queryByRole('button', { name: 'Load older messages' })).toBeNull();
  });

  test('sends with an idempotency key, shows it immediately, then marks it sent (FR-007)', async () => {
    apiRequest.mockResolvedValue({ messages: [], nextPage: null });
    render(<DirectConversation peer={BOB} conversationId={ROOM} />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());

    typeAndSend('  hi bob  ');

    const { payload, ack } = socket.lastSend();
    expect(payload).toEqual({ toUserId: BOB.id, content: 'hi bob', idempotencyKey: expect.any(String) });
    expect(contents()).toEqual(['hi bob']);
    expect(screen.getByLabelText('Sending')).toBeTruthy();
    expect(screen.getByLabelText('Message bob').value).toBe('');

    act(() => ack(null, { ok: true, message: msg(5, { senderId: ME.id, content: 'hi bob', idempotencyKey: payload.idempotencyKey }) }));

    expect(contents()).toEqual(['hi bob']);
    expect(screen.getByLabelText('Sent')).toBeTruthy();
  });

  test('server message:new for the same send replaces the optimistic copy instead of duplicating it', async () => {
    apiRequest.mockResolvedValue({ messages: [], nextPage: null });
    render(<DirectConversation peer={BOB} conversationId={ROOM} />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());

    typeAndSend('hi');
    const { idempotencyKey } = socket.lastSend().payload;
    socket.serverEmit('message:new', { ...msg(5, { senderId: ME.id, content: 'hi', idempotencyKey }), kind: 'direct' });

    expect(contents()).toEqual(['hi']);
  });

  test('shows messages from the peer live and ignores other conversations (FR-008)', async () => {
    apiRequest.mockResolvedValue({ messages: [], nextPage: null });
    render(<DirectConversation peer={BOB} conversationId={ROOM} />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());

    socket.serverEmit('message:new', { ...msg(1), kind: 'direct' });
    socket.serverEmit('message:new', { ...msg(2, { roomId: 'e'.repeat(24), content: 'elsewhere' }), kind: 'direct' });
    socket.serverEmit('message:new', { ...msg(3, { content: 'room message' }), kind: 'room' });

    expect(contents()).toEqual(['message 1']);
  });

  test('a failed send can be retried with the same idempotency key', async () => {
    apiRequest.mockResolvedValue({ messages: [], nextPage: null });
    render(<DirectConversation peer={BOB} conversationId={ROOM} />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());

    typeAndSend('hello?');
    const first = socket.lastSend();
    act(() => first.ack(null, { ok: false, error: { code: 'VALIDATION_FAILED', message: 'Recipient not found' } }));

    expect(screen.getByRole('alert').textContent).toContain('Recipient not found');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    const second = socket.lastSend();
    expect(second.payload.idempotencyKey).toBe(first.payload.idempotencyKey);
    expect(contents()).toEqual(['hello?']);
    expect(screen.getByLabelText('Sending')).toBeTruthy();
  });

  test('a send with no server response is marked as failed', async () => {
    apiRequest.mockResolvedValue({ messages: [], nextPage: null });
    render(<DirectConversation peer={BOB} conversationId={ROOM} />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());

    typeAndSend('anyone?');
    act(() => socket.lastSend().ack(new Error('timeout')));

    expect(screen.getByRole('alert').textContent).toContain('No response from server');
  });

  test('a brand-new DM adopts the room id from the first reply and reports it', async () => {
    const onConversationId = vi.fn();
    render(<DirectConversation peer={BOB} conversationId={null} onConversationId={onConversationId} />);

    expect(apiRequest).not.toHaveBeenCalled();
    expect(screen.getByText('Say hello to start a conversation.')).toBeTruthy();

    socket.serverEmit('message:new', { ...msg(1), kind: 'direct' });

    expect(onConversationId).toHaveBeenCalledWith(ROOM);
    expect(contents()).toEqual(['message 1']);
  });

  test('message content is rendered as text, not HTML (SEC-003)', async () => {
    apiRequest.mockResolvedValue({ messages: [msg(1, { content: '<img src=x onerror=alert(1)>' })], nextPage: null });
    const { container } = render(<DirectConversation peer={BOB} conversationId={ROOM} />);

    await waitFor(() => expect(contents()).toEqual(['<img src=x onerror=alert(1)>']));
    expect(container.querySelector('img')).toBeNull();
  });
});
