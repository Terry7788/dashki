'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  Home,
  NotebookPen,
  Utensils,
  Salad,
  Scale,
  Footprints,
  Calendar,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  X,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const NAV_FOOD: NavItem[] = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Journal', href: '/journal', icon: NotebookPen },
  { label: 'Foods', href: '/foods', icon: Utensils },
  { label: 'Meals', href: '/meals', icon: Salad },
];

const NAV_TRACK: NavItem[] = [
  { label: 'Weight', href: '/weight', icon: Scale },
  { label: 'Steps', href: '/steps', icon: Footprints },
  { label: 'Calendar', href: '/calendar', icon: Calendar },
];

const NAV_SECONDARY: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: SettingsIcon },
];

const STORAGE_KEY = 'dashki-sidebar-collapsed';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}

// ─── Dashki hub-and-spoke glyph ─────────────────────────────────────────────
// Four pillars: food, weight, movement, calendar.
function DashkiGlyph({ size = 28, radius = 6 }: { size?: number; radius?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background:
          'linear-gradient(135deg, var(--color-primary) 0%, var(--color-teal) 100%)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.2)',
      }}
    >
      <svg
        viewBox="0 0 32 32"
        width={size * 0.78}
        height={size * 0.78}
        aria-hidden
      >
        <g
          stroke="#ffffff"
          strokeOpacity="0.55"
          strokeWidth="1.25"
          strokeLinecap="round"
          fill="none"
        >
          <line x1="16" y1="16" x2="16" y2="7" />
          <line x1="16" y1="16" x2="25" y2="16" />
          <line x1="16" y1="16" x2="16" y2="25" />
          <line x1="16" y1="16" x2="7" y2="16" />
        </g>
        <g fill="#ffffff">
          <circle cx="16" cy="16" r="2.8" />
          <circle cx="16" cy="6" r="1.9" />
          <circle cx="26" cy="16" r="1.9" />
          <circle cx="16" cy="26" r="1.9" />
          <circle cx="6" cy="16" r="1.9" />
        </g>
      </svg>
    </div>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      onClick={onClick}
      className={clsx(
        'flex items-center transition-colors duration-150',
        collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-2',
        active ? 'font-semibold' : 'font-medium'
      )}
      style={{
        borderRadius: 4,
        fontSize: 14,
        background: active ? 'var(--color-surface-warm)' : 'transparent',
        color: active
          ? 'var(--color-foreground)'
          : 'var(--color-muted-foreground)',
      }}
    >
      <Icon
        className="flex-shrink-0"
        style={{ width: 16, height: 16, strokeWidth: active ? 2.25 : 1.75 }}
      />
      {!collapsed && (
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">
          {item.label}
        </span>
      )}
    </Link>
  );
}

function NavSection({
  label,
  collapsed,
  items,
  active,
  onClickItem,
}: {
  label?: string;
  collapsed: boolean;
  items: NavItem[];
  active: string;
  onClickItem?: () => void;
}) {
  return (
    <>
      {label && !collapsed && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-placeholder)',
            padding: '4px 10px 6px',
          }}
        >
          {label}
        </div>
      )}
      <ul className="list-none p-0 m-0 flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.href}>
            <SidebarLink
              item={item}
              active={isActiveHref(active, item.href)}
              collapsed={collapsed}
              onClick={onClickItem}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function isActiveHref(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href);
}

// ─── Desktop sidebar ────────────────────────────────────────────────────────

function DesktopSidebarContent({
  collapsed,
  onToggle,
  darkMode,
  onToggleTheme,
}: {
  collapsed: boolean;
  onToggle: () => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}) {
  const pathname = usePathname();

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Logo */}
      <Link
        href="/"
        className={clsx(
          'flex items-center no-underline',
          collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'
        )}
        style={{ padding: collapsed ? '18px 8px' : '18px 16px' }}
      >
        <DashkiGlyph size={28} radius={6} />
        {!collapsed && (
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '-0.3px',
              color: 'var(--color-foreground)',
            }}
          >
            Dashki
          </span>
        )}
      </Link>

      {/* Nav */}
      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ padding: collapsed ? '0 8px 16px' : '0 12px 16px' }}
      >
        <NavSection
          label="Food"
          collapsed={collapsed}
          items={NAV_FOOD}
          active={pathname}
        />
        {collapsed && <div style={{ height: 12 }} />}
        <div style={{ height: 16 }} />
        <NavSection
          label="Track"
          collapsed={collapsed}
          items={NAV_TRACK}
          active={pathname}
        />

        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            margin: '16px 0',
          }}
        />

        <NavSection
          collapsed={collapsed}
          items={NAV_SECONDARY}
          active={pathname}
        />
      </nav>

      {/* Footer */}
      <div
        className="flex items-center"
        style={{
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '10px 8px' : '12px 16px',
          borderTop: '1px solid var(--color-border)',
          gap: 8,
        }}
      >
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-foreground)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Terry
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-muted-foreground)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              dashki.app
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleTheme}
          title={darkMode ? 'Switch to light' : 'Switch to dark'}
          className="flex items-center justify-center cursor-pointer"
          style={{
            width: collapsed ? '100%' : 28,
            height: 28,
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            color: 'var(--color-muted-foreground)',
          }}
        >
          {darkMode ? (
            <Sun style={{ width: 14, height: 14, strokeWidth: 1.75 }} />
          ) : (
            <Moon style={{ width: 14, height: 14, strokeWidth: 1.75 }} />
          )}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="flex items-center justify-center cursor-pointer"
        style={{
          padding: '10px 0',
          borderTop: '1px solid var(--color-border)',
          background: 'transparent',
          border: 0,
          borderTopColor: 'var(--color-border)',
          borderTopStyle: 'solid',
          borderTopWidth: 1,
          color: 'var(--color-muted-foreground)',
        }}
      >
        {collapsed ? (
          <ChevronRight style={{ width: 16, height: 16 }} />
        ) : (
          <ChevronLeft style={{ width: 16, height: 16 }} />
        )}
      </button>
    </div>
  );
}

// ─── Mobile drawer ──────────────────────────────────────────────────────────

function MobileSidebarContent({
  onClose,
  darkMode,
  onToggleTheme,
}: {
  onClose: () => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}) {
  const pathname = usePathname();

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ padding: '18px 16px' }}
      >
        <Link
          href="/"
          onClick={onClose}
          className="flex items-center gap-2.5 no-underline"
        >
          <DashkiGlyph size={28} radius={6} />
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '-0.3px',
              color: 'var(--color-foreground)',
            }}
          >
            Dashki
          </span>
        </Link>
        <button
          onClick={onClose}
          className="cursor-pointer flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            background: 'transparent',
            border: 0,
            color: 'var(--color-muted-foreground)',
            borderRadius: 4,
          }}
          aria-label="Close menu"
        >
          <X style={{ width: 18, height: 18 }} />
        </button>
      </div>

      <nav
        className="flex-1 overflow-y-auto"
        style={{ padding: '0 12px 16px' }}
      >
        <NavSection
          label="Food"
          collapsed={false}
          items={NAV_FOOD}
          active={pathname}
          onClickItem={onClose}
        />
        <div style={{ height: 16 }} />
        <NavSection
          label="Track"
          collapsed={false}
          items={NAV_TRACK}
          active={pathname}
          onClickItem={onClose}
        />
        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            margin: '16px 0',
          }}
        />
        <NavSection
          collapsed={false}
          items={NAV_SECONDARY}
          active={pathname}
          onClickItem={onClose}
        />
      </nav>

      <div
        className="flex items-center justify-between"
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
          }}
        >
          Dashki v0.1.0
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          className="flex items-center justify-center cursor-pointer"
          style={{
            width: 28,
            height: 28,
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            color: 'var(--color-muted-foreground)',
          }}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? (
            <Sun style={{ width: 14, height: 14 }} />
          ) : (
            <Moon style={{ width: 14, height: 14 }} />
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main Sidebar export ────────────────────────────────────────────────────

export default function Sidebar({
  isOpen,
  onClose,
  darkMode,
  onToggleTheme,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const isCollapsed = stored !== null ? stored === 'true' : true;
    setCollapsed(isCollapsed);
    if (isCollapsed) {
      document.documentElement.setAttribute('data-sidebar', 'collapsed');
    } else {
      document.documentElement.removeAttribute('data-sidebar');
    }
  }, []);

  function handleToggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
    if (next) {
      document.documentElement.setAttribute('data-sidebar', 'collapsed');
    } else {
      document.documentElement.removeAttribute('data-sidebar');
    }
  }

  return (
    <>
      {/* Desktop */}
      <aside
        className={clsx(
          'hidden md:flex flex-col fixed left-0 top-0 h-full z-40'
        )}
        style={{
          width: collapsed ? 56 : 220,
          transition: 'width 150ms ease-out',
        }}
      >
        <DesktopSidebarContent
          collapsed={collapsed}
          onToggle={handleToggle}
          darkMode={darkMode}
          onToggleTheme={onToggleTheme}
        />
      </aside>

      {/* Mobile drawer */}
      <div className="md:hidden">
        {isOpen && (
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={onClose}
            aria-hidden="true"
          />
        )}
        <aside
          className={clsx(
            'fixed left-0 top-0 h-full w-72 z-50 flex flex-col',
            'transition-transform duration-300 ease-out',
            isOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <MobileSidebarContent
            onClose={onClose}
            darkMode={darkMode}
            onToggleTheme={onToggleTheme}
          />
        </aside>
      </div>
    </>
  );
}
