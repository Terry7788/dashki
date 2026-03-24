import { Server as SocketIOServer } from 'socket.io';

// Shared Socket.io instance — set once from index.ts, imported by routes.
// This avoids circular import issues.
let _io: SocketIOServer | null = null;

export function setIo(io: SocketIOServer): void {
  _io = io;
}

export function getIo(): SocketIOServer {
  if (!_io) {
    throw new Error('[socket] io not initialised yet');
  }
  return _io;
}
