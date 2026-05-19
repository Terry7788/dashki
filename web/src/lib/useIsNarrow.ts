'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true when the viewport is narrower than `breakpoint` (default 640px).
 * Subscribes to window.resize and updates on the fly.
 *
 * Use this for layout switches that need a truthy/falsy mobile flag —
 * Tailwind-style media queries can't gate React JSX, so we read the width
 * in JS instead.
 */
export function useIsNarrow(breakpoint = 640): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return narrow;
}
