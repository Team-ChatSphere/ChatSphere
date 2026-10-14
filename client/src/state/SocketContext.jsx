import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL;

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [connectionState, setConnectionState] = useState('disconnected');
  const socket = useMemo(() => {
    if (!token) return null;
    return io(SOCKET_URL, { autoConnect: false, auth: { token } });
  }, [token]);

  useEffect(() => {
    if (!socket) {
      setConnectionState('disconnected');
      return undefined;
    }
    const onConnect = () => setConnectionState('connected');
    const onDisconnect = () => setConnectionState('disconnected');
    const onConnectError = () => setConnectionState('error');
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.disconnect();
    };
  }, [socket]);

  const value = useMemo(() => ({ socket, connectionState }), [socket, connectionState]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within SocketProvider');
  return context;
}
