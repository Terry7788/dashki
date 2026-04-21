'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  BookOpen,
  Apple,
  UtensilsCrossed,
  Dumbbell,
  CheckSquare,
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
  { label: 'Gym', href: '/gym', icon: Dumbbell },
  { label: 'To-Do', href: '/todo', icon: CheckSquare },
  { label: 'Calendar', href: '/calendar', icon: CalendarDays },
  { label: 'Weight', href: '/weight', icon: Scale },
  { label: 'Steps', href: '/steps', icon: Footprints },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-xl bg-black/40 border-t border-white/10">
      <div className="flex items-stretch overflow-x-auto scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 min-w-[56px]',
                'transition-colors duration-200',
                active ? 'text-indigo-400' : 'text-white/40 hover:text-white/70'
              )}
            >
              <Icon
                className={clsx(
                  'w-5 h-5 flex-shrink-0',
                  active && 'drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]'
                )}
              />
              <span
                className={clsx(
                  'text-[10px] font-medium leading-tight',
                  active ? 'text-indigo-400' : 'text-white/40'
                )}
              >
                {item.label}
              </span>
              {active && (
                <div className="absolute bottom-0 w-8 h-0.5 bg-indigo-400 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
