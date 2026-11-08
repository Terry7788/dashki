// Shared pieces of the Fold 8 design (see src/fold.css).
import type { ReactNode } from 'react';

export const PAGE_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function FoldHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="fd-head">
      <div>
        <h1>{title}</h1>
        {sub && <small>{sub}</small>}
      </div>
      {right && <div className="fd-head-r">{right}</div>}
    </div>
  );
}

export function FoldBar({ pct, color, height }: { pct: number; color?: string; height?: number }) {
  return (
    <div className="fd-bar" style={height ? { height } : undefined}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function FoldRing({ value, goal, size }: { value: number; goal: number; size: number }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <svg role="img" aria-label={`${value.toLocaleString()} of ${goal.toLocaleString()} calories`} width={size} height={size} viewBox="0 0 36 36" style={{ flex: 'none' }}>
      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#34312E" strokeWidth="3" />
      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#2F7FE6" strokeWidth="3" strokeDasharray={`${pct.toFixed(0)} 100`} strokeLinecap="round" transform="rotate(-90 18 18)" />
      <text x="18" y="18" textAnchor="middle" fill="#F2F0EC" fontSize="6.5" fontWeight="600" fontFamily="JetBrains Mono, monospace">{value.toLocaleString()}</text>
      <text x="18" y="23" textAnchor="middle" fill="#A8A39B" fontSize="2.6">of {goal.toLocaleString()} kcal</text>
    </svg>
  );
}

export function FoldPager({ page, pages, total, from, to, onPage }: { page: number; pages: number; total: number; from: number; to: number; onPage: (p: number) => void }) {
  if (total === 0) return null;
  return (
    <div className="fd-pager fd-wide fd-flex">
      <button type="button" aria-label="Previous page" disabled={page <= 0} onClick={() => onPage(page - 1)}>‹</button>
      <span>{from}–{to} of {total}</span>
      <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>›</button>
    </div>
  );
}

/** Keeps long lists from scrolling when unfolded; folded shows them whole. */
export function paged<T>(items: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(page, pages - 1);
  return { pages, page: p, slice: items.slice(p * size, (p + 1) * size), from: items.length ? p * size + 1 : 0, to: Math.min(items.length, (p + 1) * size) };
}
