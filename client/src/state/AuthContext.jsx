import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { apiRequest } from '../api/client.js';

const AuthContext = createContext(null);
const TOKEN_KEY = 'chatsphere.token';
const USER_KEY = 'chatsphere.user';

function userFromToken(token, fallbackUsername) {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(window.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    const id = claims.id || claims.userId || claims.sub;
    const username = claims.username || (fallbackUsername.includes('@') ? null : fallbackUsername);
    return id && username ? { id: String(id), username: String(username) } : null;
  } catch {
    return null;
  }
}

function readStoredUser() {
  try {
    return JSON.parse(window.localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(readStoredUser);

  const signIn = useCallback(async (credentials) => {
    const result = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    const nextToken = result?.token;
    const nextUser = nextToken && userFromToken(nextToken, credentials.usernameOrEmail);
    if (!nextToken || !nextUser) {
      throw new Error('The server returned an unexpected sign-in response.');
    }
    window.localStorage.setItem(TOKEN_KEY, nextToken);
    window.localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const registerAccount = useCallback((details) => apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(details),
  }), []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ token, user, signIn, registerAccount, signOut }), [token, user, signIn, registerAccount, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
