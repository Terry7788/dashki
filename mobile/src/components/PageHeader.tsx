// Shared page header — title + optional back button + right-side action.
// Sits below the status bar (AppShell pads the page and covers the bar).

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function PageHeader({
  title,
  subtitle,
  back,
  trailing,
}: {
  title: string;
  subtitle?: string;
  /** When provided, shows a back arrow that links to this path. */
  back?: string;
  /** Right-side trailing slot (e.g. a settings cog or filter button). */
  trailing?: ReactNode;
}) {
  return (
    <header
      className="flex items-center gap-3"
      style={{
        paddingTop: '0.5rem',
        paddingBottom: '0.75rem',
        paddingLeft: '1rem',
        paddingRight: '1rem',
        background: 'var(--color-background)',
        position: 'sticky',
        top: 'var(--dk-sa-t)',
        zIndex: 10,
      }}
    >
      {back && (
        <Link
          to={back}
          aria-label="Back"
          style={{
            width: 36,
            height: 36,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-soft)',
            borderRadius: 4,
            color: 'var(--color-foreground)',
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={18} />
        </Link>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '-0.3px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-muted-foreground)',
              marginTop: 1,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {trailing && <div style={{ flexShrink: 0 }}>{trailing}</div>}
    </header>
  );
}
