import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createFakeSocket } from '../test/fakeSocket.js';
import Dashboard from './Dashboard.jsx';

const ME = { id: 'a'.repeat(24), username: 'alice' };
const BOB_ID = 'b'.repeat(24);

let socket;

vi.mock('../api/client.js', () => ({ apiRequest: vi.fn().mockResolvedValue({ messages: [], nextPage: null }) }));
vi.mock('../state/AuthContext.jsx', () => ({ useAuth: () => ({ token: 'jwt', user: ME, signOut: vi.fn() }) }));
vi.mock('../state/SocketContext.jsx', () => ({ useSocket: () => ({ socket, connectionState: 'connected' }) }));

beforeEach(() => {
  socket = createFakeSocket();
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
});
