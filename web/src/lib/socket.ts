import { io, Socket } from 'socket.io-client';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:4000';

let _socket: Socket | null = null;

/**
 * Returns the singleton socket.io client, creating it on first call.
 * Must only be called from browser context (inside useEffect).
 */
export function getSocket(): Socket {
  if (!_socket) {
    _socket = io(BASE_URL, {
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
  }
  return _socket;
}
