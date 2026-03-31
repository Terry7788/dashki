'use client';

import { useEffect } from 'react';
import { getSocket } from './socket';

/**
 * Subscribes to a socket.io event and calls handler when it fires.
 * Memoize handler with useCallback to avoid re-subscribing on every render.
 */
export function useSocketEvent(event: string, handler: () => void) {
  useEffect(() => {
    const socket = getSocket();
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [event, handler]);
}
