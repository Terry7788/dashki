'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { X, ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react';
import {
  LayoutDashboard,
  BookOpen,
  Apple,
  UtensilsCrossed,
  CalendarDays,
  Scale,
  Footprints,
  Settings,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { label: 'Home', href: '/', icon: LayoutDashboard },
  { label: 'Journal', href: '/journal', icon: BookOpen },
  { label: 'Foods', href: '/foods', icon: Apple },
  { label: 'Meals', href: '/meals', icon: UtensilsCrossed },
  { label: 'Calendar', href: '/calendar', icon: CalendarDays },
  { label: 'Weight', href: '/weight', icon: Scale },
  { label: 'Steps', href: '/steps', icon: Footprints },
  { label: 'Settings', href: '/settings', icon: Settings },
];

const STORAGE_KEY = 'dashki-sidebar-collapsed';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}

// ─── Desktop collapsible sidebar content ─────────────────────────────────────

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

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <div className="flex flex-col h-full bg-[#d4eaf7]/95 dark:bg-[#1a2a1e]/95 backdrop-blur-xl border-r border-[#b6ccd8]/60 dark:border-[#2E8B57]/40">
      {/* Logo */}
      <div className={clsx('py-7 flex items-center', collapsed ? 'justify-center px-0' : 'px-6 justify-between')}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#00668c] to-[#004d6e] dark:from-[#2E8B57] dark:to-[#345e37] flex items-center justify-center shadow-lg shadow-[#00668c]/30 dark:shadow-[#2E8B57]/30 flex-shrink-0 overflow-hidden">
            <Image
              src="/web/icon-192.png"
              alt="Dashki"
              width={36}
              height={36}
              className="w-full h-full object-cover"
              unoptimized
            />
          </div>
          {!collapsed && (
            <span className="text-xl font-bold text-[#00668c] dark:text-[#61bc84] tracking-tight whitespace-nowrap">Dashki</span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-[#cccbc8]/50 dark:bg-white/[0.08]" />

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={clsx(
                'flex items-center rounded-2xl transition-all duration-200 group',
                collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3',
                active
                  ? collapsed
                    ? 'bg-[#00668c]/15 dark:bg-[#2E8B57]/20 text-[#00668c] dark:text-[#61bc84] shadow-sm'
                    : 'bg-[#00668c]/15 dark:bg-[#2E8B57]/20 border-l-2 border-[#00668c] dark:border-[#2E8B57] text-[#00668c] dark:text-[#61bc84] shadow-sm pl-[14px]'
                  : 'text-[#313d44] dark:text-white/60 hover:text-[#1d1c1c] dark:hover:text-white hover:bg-[#d4eaf7]/60 dark:hover:bg-white/[0.06] border border-transparent'
              )}
            >
              <Icon
                className={clsx(
                  'w-5 h-5 flex-shrink-0 transition-colors duration-200',
                  active ? 'text-[#00668c] dark:text-[#61bc84]' : 'text-[#313d44]/60 dark:text-white/50 group-hover:text-[#1d1c1c] dark:group-hover:text-white/80'
                )}
              />
              {!collapsed && (
                <>
                  <span className="text-sm font-medium text-[#313d44] dark:text-white">{item.label}</span>
                  {active && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#00668c] dark:bg-[#61bc84]" />
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer / Toggle */}
      <div className="px-3 pb-6 flex flex-col items-center gap-2">
        {!collapsed && (
          <div className="text-xs text-[#313d44]/50 dark:text-white/25 text-center w-full px-3">
            Dashki v0.1.0
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className={clsx(
            'flex items-center justify-center rounded-2xl p-2 transition-all duration-200',
            'text-[#313d44]/70 dark:text-white/40 hover:text-[#1d1c1c] dark:hover:text-yellow-300 hover:bg-[#d4eaf7]/60 dark:hover:bg-white/[0.08]',
            collapsed ? 'w-10 h-10' : 'w-full h-10'
          )}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={clsx(
            'flex items-center justify-center rounded-2xl p-2 transition-all duration-200',
            'text-[#313d44]/70 dark:text-white/40 hover:text-[#1d1c1c] dark:hover:text-white hover:bg-[#d4eaf7]/60 dark:hover:bg-white/[0.08]',
            collapsed ? 'w-10 h-10' : 'w-full h-10'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}

// ─── Mobile drawer content (always expanded) ──────────────────────────────────

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

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <div className="flex flex-col h-full bg-[#d4eaf7]/95 dark:bg-[#1a2a1e]/95 backdrop-blur-xl border-r border-[#b6ccd8]/60 dark:border-[#2E8B57]/40">
      {/* Logo */}
      <div className="px-6 py-7 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#00668c] to-[#004d6e] dark:from-[#2E8B57] dark:to-[#345e37] flex items-center justify-center shadow-lg shadow-[#00668c]/30 dark:shadow-[#2E8B57]/30 overflow-hidden">
            <Image
              src="/web/icon-192.png"
              alt="Dashki"
              width={36}
              height={36}
              className="w-full h-full object-cover"
              unoptimized
            />
          </div>
          <span className="text-xl font-bold text-[#00668c] dark:text-[#61bc84] tracking-tight">Dashki</span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-[#313d44]/60 hover:text-[#1d1c1c] hover:bg-[#d4eaf7]/60 dark:text-white/50 dark:hover:text-white dark:hover:bg-white/10 transition-all duration-200"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-[#cccbc8]/50 dark:bg-white/[0.08]" />

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={clsx(
                'flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 group',
                active
                  ? 'bg-[#00668c]/15 dark:bg-[#2E8B57]/20 border-l-2 border-[#00668c] dark:border-[#2E8B57] text-[#00668c] dark:text-[#61bc84] shadow-sm pl-[14px]'
                  : 'text-[#313d44] dark:text-white/60 hover:text-[#1d1c1c] dark:hover:text-white hover:bg-[#d4eaf7]/60 dark:hover:bg-white/[0.06] border border-transparent'
              )}
            >
              <Icon
                className={clsx(
                  'w-5 h-5 flex-shrink-0 transition-colors duration-200',
                  active ? 'text-[#00668c] dark:text-[#61bc84]' : 'text-[#313d44]/60 dark:text-white/50 group-hover:text-[#1d1c1c] dark:group-hover:text-white/80'
                )}
              />
              <span className="text-sm font-medium text-[#313d44] dark:text-white">{item.label}</span>
              {active && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#00668c] dark:bg-[#61bc84]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 pb-6 flex items-center justify-between">
        <div className="text-xs text-[#313d44]/50 dark:text-white/25">
          Dashki v0.1.0
        </div>
        <button
          onClick={onToggleTheme}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-2 rounded-xl text-[#313d44]/70 dark:text-white/40 hover:text-[#1d1c1c] dark:hover:text-yellow-300 hover:bg-[#d4eaf7]/60 dark:hover:bg-white/10 transition-all duration-200"
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}

// ─── Main Sidebar export ──────────────────────────────────────────────────────

export default function Sidebar({ isOpen, onClose, darkMode, onToggleTheme }: SidebarProps) {
  // Start collapsed=true so the sidebar-offset CSS is applied correctly before hydration
  const [collapsed, setCollapsed] = useState(true);

  // Read from localStorage on mount, sync to document
  // Default: collapsed=true (sidebar starts collapsed on fresh load)
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
      {/* ── Desktop sidebar — collapsible ── */}
      <aside
        className={clsx(
          'hidden md:flex flex-col fixed left-0 top-0 h-full z-40',
          'transition-all duration-300',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <DesktopSidebarContent
          collapsed={collapsed}
          onToggle={handleToggle}
          darkMode={darkMode}
          onToggleTheme={onToggleTheme}
        />
      </aside>

      {/* ── Mobile drawer — always expanded ── */}
      <div className="md:hidden">
        {/* Backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
            aria-hidden="true"
          />
        )}

        {/* Drawer panel */}
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
