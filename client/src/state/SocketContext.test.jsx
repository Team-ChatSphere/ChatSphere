import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { io } from 'socket.io-client';
import { SocketProvider, useSocket } from './SocketContext.jsx';

let token;
vi.mock('./AuthContext.jsx', () => ({ useAuth: () => ({ token }) }));
vi.mock('socket.io-client', () => ({ io: vi.fn() }));

function fakeIoSocket() {
  const handlers = {};
  return {
    on: vi.fn((e, fn) => { handlers[e] = fn; }),
    off: vi.fn((e) => { delete handlers[e]; }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    fire: (e) => act(() => handlers[e]?.()),
  };
}

let ctx;
function Probe() {
  ctx = useSocket();
  return <span>{ctx.connectionState}</span>;
}

beforeEach(() => io.mockReset());
afterEach(cleanup);

describe('SocketContext (CS-16, FR-004)', () => {
  test('signed out: no socket is created', () => {
    token = null;
    render(<SocketProvider><Probe /></SocketProvider>);

    expect(io).not.toHaveBeenCalled();
    expect(ctx.socket).toBeNull();
    expect(screen.getByText('disconnected')).toBeTruthy();
  });

  test('signed in: one socket with the JWT in the handshake, tracking connection state', () => {
    token = 'jwt';
    const s = fakeIoSocket();
    io.mockReturnValue(s);
    const view = render(<SocketProvider><Probe /></SocketProvider>);

    expect(io).toHaveBeenCalledWith('http://localhost:4000', { autoConnect: false, auth: { token: 'jwt' } });
    expect(s.connect).toHaveBeenCalled();

    s.fire('connect');
    expect(screen.getByText('connected')).toBeTruthy();
    s.fire('connect_error');
    expect(screen.getByText('error')).toBeTruthy();
    s.fire('disconnect');
    expect(screen.getByText('disconnected')).toBeTruthy();

    view.unmount();
    expect(s.disconnect).toHaveBeenCalled();
  });

  test('useSocket outside the provider is a programming error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useSocket must be used within SocketProvider');
    spy.mockRestore();
  });
});
