// Fixed bottom tab bar — 5 primary destinations.
// Safe-area aware (sits above the iPhone gesture bar).

import { NavLink } from 'react-router-dom';
import {
  Home as HomeIcon,
  NotebookPen,
  Scale,
  Footprints,
  Menu,
  type LucideIcon,
} from 'lucide-react';

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  matchPrefix?: boolean;
}

const TABS: Tab[] = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/journal', label: 'Journal', icon: NotebookPen, matchPrefix: true },
  { to: '/weight', label: 'Weight', icon: Scale, matchPrefix: true },
  { to: '/steps', label: 'Steps', icon: Footprints, matchPrefix: true },
  { to: '/more', label: 'More', icon: Menu, matchPrefix: true },
];

export default function BottomTabBar() {
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 30,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={!tab.matchPrefix}
            style={({ isActive }) => ({
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              padding: '8px 0 10px 0',
              minHeight: 56,
              color: isActive
                ? 'var(--color-primary)'
                : 'var(--color-muted-foreground)',
              textDecoration: 'none',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.02em',
              background: 'transparent',
            })}
          >
            {({ isActive }) => (
              <>
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.7} />
                <span>{tab.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
