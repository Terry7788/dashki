// "More" tab — sheet of secondary destinations (Meals, Foods, Calendar,
// Settings). On mobile the bottom tab bar can't fit everything, so the
// less-frequent destinations live here.

import { Link } from 'react-router-dom';
import {
  Salad,
  Utensils,
  Calendar as CalendarIcon,
  Settings as SettingsIcon,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { MicroLabel, Pill } from '../components/ui';
import { useAuth } from '../lib/auth-context';
import PageHeader from '../components/PageHeader';

const SECTIONS = [
  {
    label: 'Food',
    items: [
      { to: '/meals', label: 'Saved meals', desc: 'Recipes and meal templates', icon: Salad },
      { to: '/foods', label: 'Foods', desc: 'Your food database', icon: Utensils },
    ],
  },
  {
    label: 'Track',
    items: [
      { to: '/calendar', label: 'Calendar', desc: 'Day-by-day overview', icon: CalendarIcon },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/settings', label: 'Settings', desc: 'Account, goals, theme', icon: SettingsIcon },
    ],
  },
];

export default function MoreScreen() {
  const { status, user } = useAuth();

  return (
    <div
      style={{
        background: 'var(--color-background)',
        minHeight: '100vh',
      }}
    >
      <PageHeader title="More" />
      <div
        style={{
          padding: '0 1rem 1rem 1rem',
          maxWidth: 480,
          margin: '0 auto',
        }}
      >
        {/* User card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 16px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-card)',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'rgba(0,117,222,0.12)',
              color: 'var(--color-primary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--color-foreground)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {status === 'signed-in'
                ? user?.display_name || user?.email
                : 'Guest mode'}
            </div>
            <div className="mt-1">
              {status === 'signed-in' && user && (
                <Pill tone={user.subscription_status === 'lifetime' ? 'success' : 'neutral'} upper>
                  {user.subscription_status}
                </Pill>
              )}
              {status === 'guest' && <Pill tone="neutral" upper>Single-user</Pill>}
            </div>
          </div>
        </div>

        {SECTIONS.map((section) => (
          <div key={section.label} style={{ marginBottom: 18 }}>
            <MicroLabel style={{ paddingLeft: 4 }}>{section.label}</MicroLabel>
            <div
              className="mt-2"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
              }}
            >
              {section.items.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 14px',
                      borderTop:
                        idx === 0 ? 'none' : '1px solid var(--color-border)',
                      color: 'var(--color-foreground)',
                      textDecoration: 'none',
                    }}
                  >
                    <Icon
                      size={18}
                      style={{ color: 'var(--color-muted-foreground)' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {item.label}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--color-muted-foreground)',
                          marginTop: 2,
                        }}
                      >
                        {item.desc}
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      style={{ color: 'var(--color-placeholder)' }}
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
