import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import App from './App.jsx';

let token;
vi.mock('./state/AuthContext.jsx', () => ({ useAuth: () => ({ token }) }));
vi.mock('./views/AuthPage.jsx', () => ({ default: ({ mode }) => <p>auth page: {mode}</p> }));
vi.mock('./views/Dashboard.jsx', () => ({ default: () => <p>dashboard</p> }));

const at = (path) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
afterEach(cleanup);

describe('routing (CS-16)', () => {
  test.each([
    ['/', null, 'auth page: login'],
    ['/dashboard', null, 'auth page: login'],
    ['/register', null, 'auth page: register'],
    ['/', 'jwt', 'dashboard'],
    ['/dashboard', 'jwt', 'dashboard'],
    ['/no-such-page', 'jwt', 'dashboard'],
  ])('%s with token=%s shows %s', (path, t, expected) => {
    token = t;
    at(path);

    expect(screen.getByText(expected)).toBeTruthy();
  });
});
