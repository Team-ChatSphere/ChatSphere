import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AuthPage from './AuthPage.jsx';

const auth = vi.hoisted(() => ({ registerAccount: vi.fn(), signIn: vi.fn() }));
vi.mock('../state/AuthContext.jsx', () => ({ useAuth: () => ({ token: null, ...auth }) }));

function renderRegister() {
  return render(<MemoryRouter><AuthPage mode="register" /></MemoryRouter>);
}

function fillRegistration({ username = 'alice', email = 'alice@example.com', password = 'password123' } = {}) {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

beforeEach(() => {
  auth.registerAccount.mockReset().mockResolvedValue({ userId: 'a'.repeat(24) });
  auth.signIn.mockReset();
});
afterEach(cleanup);

describe('registration form validation (CS-06)', () => {
  test('shows the username rule without sending an API request', () => {
    renderRegister();
    fillRegistration({ username: 'a!', email: 'alice@example.com' });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('alert').textContent).toContain('Username must be 3–30 characters');
    expect(auth.registerAccount).not.toHaveBeenCalled();
  });

  test('shows an email format message', () => {
    renderRegister();
    fillRegistration({ email: 'not-an-email' });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('alert').textContent).toContain('Enter a valid email address');
    expect(auth.registerAccount).not.toHaveBeenCalled();
  });

  test('requires an eight-character password', () => {
    renderRegister();
    fillRegistration({ password: 'short' });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('alert').textContent).toContain('Password must be at least 8 characters');
    expect(auth.registerAccount).not.toHaveBeenCalled();
  });

  test('submits normalized username and email after validation', () => {
    renderRegister();
    fillRegistration({ username: ' alice ', email: ' Alice@Example.com ' });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(auth.registerAccount).toHaveBeenCalledWith({ username: 'alice', email: 'Alice@Example.com', password: 'password123' });
  });
});
