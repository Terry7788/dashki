'use client';

// Phone navigation (under 768 px): Home, Journal, "+", Foods, More.
// The rest of the pages live on the More page.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home, MoreHorizontal, NotebookPen, Plus, Utensils, X } from 'lucide-react';
import AddMenu from '@/components/AddMenu';

const MORE_PATHS = ['/more', '/meals', '/weight', '/steps', '/calendar', '/settings'];

function Tab({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active: boolean }) {
  return (
    <Link href={href} className={`tb-tab${active ? ' on' : ''}`} aria-current={active ? 'page' : undefined}>
      <Icon style={{ width: 20, height: 20, strokeWidth: active ? 2.25 : 1.75 }} />
      <span>{label}</span>
    </Link>
  );
}

export default function BottomTabs() {
  const pathname = usePathname() || '/';
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <>
      <AddMenu open={menuOpen} onClose={() => setMenuOpen(false)} variant="sheet" />
      <nav className="tb md:hidden" aria-label="Main">
        <Tab href="/" label="Home" icon={Home} active={pathname === '/'} />
        <Tab href="/journal" label="Journal" icon={NotebookPen} active={pathname.startsWith('/journal')} />
        <button
          type="button"
          className={`tb-plus${menuOpen ? ' open' : ''}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? 'Close the add menu' : 'Add'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X style={{ width: 22, height: 22 }} /> : <Plus style={{ width: 22, height: 22 }} />}
        </button>
        <Tab href="/foods" label="Foods" icon={Utensils} active={pathname.startsWith('/foods')} />
        <Tab href="/more" label="More" icon={MoreHorizontal} active={MORE_PATHS.some((p) => pathname.startsWith(p))} />
      </nav>
    </>
  );
}
