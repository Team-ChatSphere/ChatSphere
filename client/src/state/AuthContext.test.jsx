import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { apiRequest } from '../api/client.js';
import { AuthProvider, useAuth } from './AuthContext.jsx';

vi.mock('../api/client.js', () => ({ apiRequest: vi.fn() }));

// A JWT whose payload is { sub, username } (signature isn't checked client-side).
const jwtFor = (claims) => `h.${btoa(JSON.stringify(claims)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.s`;

let auth;
function Probe() {
  auth = useAuth();
  return <span>{auth.user ? `signed in as ${auth.user.username}` : 'signed out'}</span>;
}
const renderAuth = () => render(<AuthProvider><Probe /></AuthProvider>);

beforeEach(() => {
  window.localStorage.clear();
  apiRequest.mockReset();
});
afterEach(cleanup);

describe('AuthContext (CS-16, FR-003)', () => {
  test('signIn stores the token and the user decoded from it', async () => {
    const token = jwtFor({ sub: 'a'.repeat(24), username: 'alice' });
    apiRequest.mockResolvedValue({ token });
    renderAuth();

    await act(() => auth.signIn({ usernameOrEmail: 'alice', password: 'Passw0rd!' }));

    expect(apiRequest).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByText('signed in as alice')).toBeTruthy();
    expect(auth.token).toBe(token);
    expect(window.localStorage.getItem('chatsphere.token')).toBe(token);
    expect(JSON.parse(window.localStorage.getItem('chatsphere.user'))).toEqual({ id: 'a'.repeat(24), username: 'alice' });
  });

  test('restores the session from storage on reload', () => {
    window.localStorage.setItem('chatsphere.token', 'stored');
    window.localStorage.setItem('chatsphere.user', JSON.stringify({ id: '1', username: 'bob' }));

    renderAuth();

    expect(auth.token).toBe('stored');
    expect(screen.getByText('signed in as bob')).toBeTruthy();
  });

  test('an unexpected login response is rejected and nothing is stored', async () => {
    apiRequest.mockResolvedValue({ token: 'not-a-jwt' });
    renderAuth();

    await expect(act(() => auth.signIn({ usernameOrEmail: 'alice', password: 'x' }))).rejects.toThrow('unexpected sign-in response');
    expect(window.localStorage.getItem('chatsphere.token')).toBeNull();
  });

  test('signOut clears the session', async () => {
    apiRequest.mockResolvedValue({ token: jwtFor({ sub: '1', username: 'alice' }) });
    renderAuth();
    await act(() => auth.signIn({ usernameOrEmail: 'alice', password: 'x' }));

    act(() => auth.signOut());

    expect(screen.getByText('signed out')).toBeTruthy();
    expect(window.localStorage.getItem('chatsphere.token')).toBeNull();
  });

  test('registerAccount posts to /api/auth/register', async () => {
    apiRequest.mockResolvedValue({ userId: '1' });
    renderAuth();

    await act(() => auth.registerAccount({ username: 'alice', email: 'a@x.com', password: 'Passw0rd!' }));

    expect(apiRequest).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({ method: 'POST' }));
  });

  test('useAuth outside the provider is a programming error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useAuth must be used within AuthProvider');
    spy.mockRestore();
  });
});
