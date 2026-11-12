import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createFakeSocket } from '../test/fakeSocket.js';
import { apiRequest } from '../api/client.js';
import Dashboard from './Dashboard.jsx';

const ME = { id: 'a'.repeat(24), username: 'alice' };
const BOB_ID = 'b'.repeat(24);

let socket;

vi.mock('../api/client.js', () => ({ apiRequest: vi.fn() }));
vi.mock('../state/AuthContext.jsx', () => ({ useAuth: () => ({ token: 'jwt', user: ME, signOut: vi.fn() }) }));
vi.mock('../state/SocketContext.jsx', () => ({ useSocket: () => ({ socket, connectionState: 'connected' }) }));

beforeEach(() => {
  socket = createFakeSocket();
  socket.connected = true;
  apiRequest.mockReset().mockImplementation(async (path) => {
    if (path.startsWith('/api/users?')) return { users: [{ userId: BOB_ID, username: 'bob', status: 'online' }] };
    if (path.startsWith('/api/rooms?')) return { rooms: [{ roomId: 'e'.repeat(24), name: 'design team' }] };
    if (path.endsWith('/members')) return { members: [] };
    return { messages: [], nextPage: null };
  });
  window.localStorage.clear();
});
afterEach(cleanup);

describe('Dashboard DM list (CS-13)', () => {
  test('a DM from someone new appears in the list with their username and is remembered', () => {
    render(<Dashboard />);

    socket.serverEmit('message:new', {
      id: 'c'.repeat(24), roomId: 'd'.repeat(24), senderId: BOB_ID, senderUsername: 'bob',
      content: 'hey', timestamp: new Date().toISOString(), status: 'sent', kind: 'direct',
    });

    expect(screen.getByRole('button', { name: /bob/ })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(`chatsphere.dms.${ME.id}`))).toEqual([
      { peer: { id: BOB_ID, username: 'bob' }, conversationId: 'd'.repeat(24) },
    ]);
  });

  test('the new-message form rejects a malformed id and your own id, then opens the chat', () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'New message' }));
    const idInput = screen.getByLabelText('Recipient user ID');
    const start = screen.getByRole('button', { name: 'Start chat' });

    fireEvent.change(idInput, { target: { value: 'bob' } });
    fireEvent.click(start);
    expect(screen.getByRole('alert').textContent).toContain('valid user ID');

    fireEvent.change(idInput, { target: { value: ME.id } });
    fireEvent.click(start);
    expect(screen.getByRole('alert').textContent).toContain("can't message yourself");

    fireEvent.change(idInput, { target: { value: BOB_ID } });
    fireEvent.change(screen.getByLabelText('Display name (optional)'), { target: { value: 'Bob' } });
    fireEvent.click(start);

    expect(screen.getByLabelText('Conversation with Bob')).toBeTruthy();
    expect(screen.getByLabelText('Message Bob')).toBeTruthy();
  });

  test('searching and selecting a user opens a DM', async () => {
    render(<Dashboard />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search people and rooms' }), { target: { value: 'bo' } });

    const result = await screen.findByRole('option', { name: /bob/ });
    fireEvent.click(result);

    expect(await screen.findByLabelText('Conversation with bob')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('/api/users?search=bo', { token: 'jwt' });
    expect(apiRequest).toHaveBeenCalledWith('/api/rooms?search=bo', { token: 'jwt' });
  });

  test('searching and selecting a room joins it and opens the Rooms tab', async () => {
    socket.emit.mockImplementation((event, payload, ack) => {
      socket.emitted.push({ event, payload, ack });
      if (typeof ack === 'function') ack(null, { ok: true, roomId: 'e'.repeat(24), joined: true });
    });
    render(<Dashboard />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search people and rooms' }), { target: { value: 'design' } });
    fireEvent.click(await screen.findByRole('option', { name: /design team/ }));

    expect(await screen.findByText('Room · share ID eeeeeeeeeeeeeeeeeeeeeeee')).toBeTruthy();
    expect(socket.emitted.some((item) => item.event === 'room:join' && item.payload.roomId === 'e'.repeat(24))).toBe(true);
  });

  test('has no inert header menu, and the sidebar + on the Rooms tab opens the create-room form', () => {
    render(<Dashboard />);
    expect(screen.queryByLabelText('More options')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rooms' }));
    expect(screen.queryByLabelText('Create a room')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Create room' })[0]);
    expect(screen.getByLabelText('Create a room')).toBeTruthy();
  });
});
