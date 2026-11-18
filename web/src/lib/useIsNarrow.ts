'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

// useLayoutEffect warns when rendered on the server; there it has nothing to measure anyway.
const useBeforePaint = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Returns true when the viewport is narrower than `breakpoint` (default 640px).
 * Subscribes to window.resize and updates on the fly.
 *
 * Use this for layout switches that need a truthy/falsy mobile flag —
 * Tailwind-style media queries can't gate React JSX, so we read the width
 * in JS instead.
 *
 * The first render always says "not narrow", the same as the server, and the
 * real width is applied before the browser paints. Reading the width during
 * the first render made phones disagree with the server's HTML, which React
 * reports as a hydration error and answers by re-rendering the whole page.
 */
export function useIsNarrow(breakpoint = 640): boolean {
  const [narrow, setNarrow] = useState(false);
  useBeforePaint(() => {
    const onResize = () => setNarrow(window.innerWidth < breakpoint);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return narrow;
}
