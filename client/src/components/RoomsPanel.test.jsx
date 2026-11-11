import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { apiRequest } from '../api/client.js';
import { createFakeSocket } from '../test/fakeSocket.js';
import RoomsPanel from './RoomsPanel.jsx';

const ME = { id: 'a'.repeat(24), username: 'alice' };
const BOB = 'b'.repeat(24);
const ROOM = 'c'.repeat(24);
let socket;

vi.mock('../api/client.js', () => ({ apiRequest: vi.fn() }));
vi.mock('../state/AuthContext.jsx', () => ({ useAuth: () => ({ token: 'jwt', user: ME }) }));
vi.mock('../state/SocketContext.jsx', () => ({ useSocket: () => ({ socket }) }));

beforeEach(() => {
  socket = createFakeSocket();
  socket.connected = true;
  socket.emit.mockImplementation((event, payload, ack) => {
    socket.emitted.push({ event, payload, ack });
    if (typeof ack === 'function') {
      ack(null, event === 'room:restore'
        ? { ok: true, roomId: ROOM, joined: true }
        : { ok: true, roomId: ROOM, userId: BOB, role: 'admin' });
    }
  });
  window.localStorage.clear();
  window.localStorage.setItem(`chatsphere.rooms.${ME.id}`, JSON.stringify([{ roomId: ROOM, name: 'engineering' }]));
  apiRequest.mockImplementation((path) => Promise.resolve(path.endsWith('/members')
    ? { members: [
      { userId: ME.id, username: ME.username, role: 'admin', status: 'online' },
      { userId: BOB, username: 'bob', role: 'member', status: 'offline' },
    ] }
    : { messages: [], nextPage: null }));
});
afterEach(cleanup);

describe('RoomsPanel member and unread controls (CS-41)', () => {
  test('counts unseen incoming room messages and clears the count when opened', async () => {
    render(<RoomsPanel />);

    act(() => socket.serverEmit('message:new', {
      id: 'm'.repeat(24), roomId: ROOM, senderId: BOB, content: 'hello', kind: 'room', timestamp: new Date().toISOString(),
    }));

    expect(screen.getByLabelText('1 unread messages')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /engineering/ }));
    await waitFor(() => expect(screen.getByLabelText('Room members')).toBeTruthy());
    expect(screen.queryByLabelText('1 unread messages')).toBeNull();
  });

  test('shows member roles and presence, and exposes admin actions only for admins', async () => {
    render(<RoomsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /engineering/ }));

    expect(await screen.findByText('bob')).toBeTruthy();
    expect(screen.getByLabelText('Online')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Promote' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Promote' }));
    await waitFor(() => expect(socket.emitted.some((item) => item.event === 'room:promote' && item.payload.userId === BOB)).toBe(true));
  });

  test('a selected search result joins and opens the named room', async () => {
    const handled = vi.fn();
    render(<RoomsPanel joinRoomSelection={{ roomId: ROOM, name: 'research' }} onRoomSelectionHandled={handled} />);

    await waitFor(() => expect(socket.emitted.some((item) => item.event === 'room:join' && item.payload.roomId === ROOM)).toBe(true));
    expect(await screen.findByText('research')).toBeTruthy();
    expect(handled).toHaveBeenCalled();
  });
});
