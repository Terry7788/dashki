'use client';

// The "+" menu: the four things you log. On phones it is a sheet above the tab
// bar; from 768 px it is a small panel beside the sidebar ('side'). Each option opens the
// page with `?<name>=1`, which the page turns into its own dialog.

import { useEffect, useState } from 'react';
import { Camera, ChevronRight, Footprints, Scale, Utensils } from 'lucide-react';
import { getLatestWeight, getTodaySteps, getGoals } from '@/lib/api';

interface AddMenuProps {
  open: boolean;
  onClose: () => void;
  variant: 'sheet' | 'side';
}

interface Option {
  href: string;
  label: string;
  sub: string;
  icon: React.ElementType;
}

function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function AddMenu({ open, onClose, variant }: AddMenuProps) {
  const [weightSub, setWeightSub] = useState('Log today’s weight');
  const [stepsSub, setStepsSub] = useState('Type steps or use the walk calculator');
  const [today, setToday] = useState('');

  useEffect(() => {
    if (!open) return;
    setToday(new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }));
    let live = true;
    getLatestWeight()
      .then((w) => { if (live && w) setWeightSub(`Last ${w.weight_kg} kg on ${shortDate(w.date)}`); })
      .catch(() => {});
    Promise.all([getTodaySteps(), getGoals()])
      .then(([s, g]) => {
        if (!live) return;
        const goal = g.steps ? ` of ${g.steps.toLocaleString()}` : '';
        setStepsSub(`${(s.steps ?? 0).toLocaleString()}${goal} today`);
      })
      .catch(() => {});
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { live = false; document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;

  const options: Option[] = [
    { href: '/journal?addFood=1', label: 'Log food', sub: 'Search foods and saved meals, or quick add', icon: Utensils },
    { href: '/weight?log=1', label: 'Weigh in', sub: weightSub, icon: Scale },
    { href: '/steps?add=1', label: 'Add steps', sub: stepsSub, icon: Footprints },
    { href: '/foods?new=1', label: 'New food', sub: 'Scan a label, let AI guess, or type it in', icon: Camera },
  ];

  return (
    <div className={`am-wrap am-${variant}`} role="dialog" aria-modal="true" aria-labelledby="am-title">
      <div className="am-back" onClick={onClose} aria-hidden="true" />
      <div className="am-panel">
        {variant === 'sheet' && <div className="fs-grab" />}
        <div className="am-head">
          <h2 id="am-title" className="fs-title">Add</h2>
          <div className="fs-sub">Today · {today}</div>
        </div>
        <div className="am-list">
          {options.map((o, i) => {
            const Icon = o.icon;
            return (
              // A full page load, like Home's "Log food": the page opens its dialog from the param.
              <a key={o.href} href={o.href} className={`am-opt${i === 0 ? ' first' : ''}`}>
                <span className="am-ico"><Icon style={{ width: 18, height: 18 }} /></span>
                <span className="am-text">
                  <span className="am-label">{o.label}</span>
                  <span className="am-sub">{o.sub}</span>
                </span>
                <ChevronRight style={{ width: 14, height: 14, flex: 'none', color: 'var(--color-muted-foreground)' }} />
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
