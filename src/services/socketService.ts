import { io, Socket } from 'socket.io-client';
import { auth } from '../lib/firebase';

let socket: Socket | null = null;

export const connectSocket = async (userData: { uid: string, email: string, elo: number, balance: number, username: string }) => {
  if (socket?.connected) return socket;

  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');

  // Using window.location.origin for the socket URL
  socket = io(window.location.origin, {
    auth: { 
      token,
      uid: userData.uid,
      email: userData.email,
      elo: userData.elo,
      balance: userData.balance,
      username: userData.username
    },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => console.log('🔌 Socket connected'));
  socket.on('connect_error', (err) => console.error('Socket error:', err.message));
  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    if (reason === 'io server disconnect') {
      refreshSocketToken();
    }
  });

  return socket;
};

const refreshSocketToken = async () => {
  const newToken = await auth.currentUser?.getIdToken(true);
  if (socket && newToken) {
    (socket.auth as any).token = newToken;
    socket.connect();
  }
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};

export const emit = (event: string, data?: any) => {
  if (!socket?.connected) {
    console.warn(`Cannot emit ${event} — socket not connected`);
    return;
  }
  socket.emit(event, data);
};

export const on = (event: string, callback: (...args: any[]) => void) => {
  socket?.on(event, callback);
};

export const off = (event: string, callback: (...args: any[]) => void) => {
  socket?.off(event, callback);
};

export const getSocket = () => socket;
