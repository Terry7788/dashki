'use client';

import { useEffect, useRef } from 'react';

/**
 * Opens something when the page is loaded with `?<name>=1` (the "+" menu and the
 * phone widgets link this way), then strips the param so a reload or Back
 * doesn't open it again. Same pattern as Journal's `?addFood=1`.
 */
export function useOpenParam(name: string, onOpen: () => void): void {
  const cb = useRef(onOpen);
  cb.current = onOpen;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get(name) !== '1') return;
    cb.current();
    params.delete(name);
    const search = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (search ? `?${search}` : '') + window.location.hash);
  }, [name]);
}
