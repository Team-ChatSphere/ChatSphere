import { act } from '@testing-library/react';
import { vi } from 'vitest';

// Minimal stand-in for a Socket.IO client: records emits and lets tests push server events.
export function createFakeSocket() {
  const handlers = {};
  const socket = {
    emitted: [],
    on: vi.fn((event, fn) => {
      (handlers[event] ||= new Set()).add(fn);
    }),
    off: vi.fn((event, fn) => handlers[event]?.delete(fn)),
    timeout: vi.fn(() => socket),
    emit: vi.fn((event, payload, ack) => {
      socket.emitted.push({ event, payload, ack });
    }),
    // Deliver a server → client event.
    serverEmit(event, payload) {
      act(() => handlers[event]?.forEach((fn) => fn(payload)));
    },
    lastSend() {
      return socket.emitted.filter((e) => e.event === 'message:send').at(-1);
    },
  };
  return socket;
}
