'use client';

import { ReactNode, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Optional second line under the title (e.g. "Tuesday, 19 May 2026") */
  subtitle?: string;
  /** Optional content rendered to the right of the title (e.g. a meal-type segmented control) */
  headerTrailing?: ReactNode;
  children: ReactNode;
  size?: ModalSize;
  minHeight?: string;
  /** Right-aligned footer content (Cancel + primary action) */
  footer?: ReactNode;
  /** Left-aligned footer content (e.g. a destructive Delete button) */
  leadingFooter?: ReactNode;
  /** When false, hides the X close button in the header (defaults to true) */
  showCloseButton?: boolean;
  mobileFullscreen?: boolean;
  /**
   * Lock the modal panel to a fixed height on tablet+ viewports so the
   * panel doesn't visibly resize while inner content loads. Use for
   * modals that contain tables or async-loaded lists.
   */
  lockTabletHeight?: boolean;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'w-[90%] sm:max-w-3xl lg:max-w-5xl',
};

const sizeClassesMobileFullscreen: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:w-[90%] sm:max-w-3xl lg:max-w-5xl',
};

export default function GlassModal({
  isOpen,
  onClose,
  title,
  subtitle,
  headerTrailing,
  children,
  size = 'md',
  minHeight,
  footer,
  leadingFooter,
  showCloseButton = true,
  mobileFullscreen = false,
  lockTabletHeight = false,
}: GlassModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  const savedScrollYRef = useRef(0);

  // iOS-friendly body scroll lock (pin via position:fixed + restore on cleanup).
  // useLayoutEffect so the cleanup's scrollTo lands in the same frame as the
  // body unlock — otherwise you get a visible "jump to top, then animate
  // back" on close.
  useLayoutEffect(() => {
    if (!isOpen) return;

    savedScrollYRef.current = window.scrollY;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${savedScrollYRef.current}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    body.style.width = '100%';

    return () => {
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.overflow = '';
      body.style.width = '';
      window.scrollTo({
        top: savedScrollYRef.current,
        left: 0,
        behavior: 'instant' as ScrollBehavior,
      });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const wrapperPadding = clsx(
    'items-center justify-center',
    'pl-4 pr-4',
    'pt-[max(1rem,env(safe-area-inset-top))]',
    'pb-[max(1rem,env(safe-area-inset-bottom))]'
  );

  // Mobile fullscreen panels always fill the viewport (modulo safe-area).
  // On tablet+ we either auto-size with max-h:90vh (default) or lock to
  // 80vh when `lockTabletHeight` is set — locked is what async-loading
  // tables want so the panel doesn't pop in size as data arrives.
  const mobileHeightClass =
    'h-[calc(100svh-max(1rem,env(safe-area-inset-top))-max(1rem,env(safe-area-inset-bottom)))]';
  const tabletHeightClass = lockTabletHeight
    ? 'sm:h-[80vh] sm:max-h-[80vh]'
    : 'sm:h-auto sm:max-h-[90vh]';
  const panelShape = mobileFullscreen
    ? `${mobileHeightClass} ${tabletHeightClass} rounded-md sm:rounded-xl`
    : lockTabletHeight
    ? 'h-[80vh] max-h-[80vh] rounded-xl'
    : 'max-h-[90vh] rounded-xl';

  return (
    <div
      className={clsx('fixed inset-0 z-50 flex', wrapperPadding)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={clsx(
          'relative w-full flex flex-col',
          panelShape,
          minHeight,
          mobileFullscreen
            ? sizeClassesMobileFullscreen[size]
            : sizeClasses[size]
        )}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-foreground)',
          boxShadow: 'var(--shadow-deep)',
        }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center"
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--color-border)',
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              id="modal-title"
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '-0.25px',
                color: 'var(--color-foreground)',
              }}
            >
              {title}
            </h2>
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
          {headerTrailing}
          {showCloseButton && (
            <button
              onClick={onClose}
              className="cursor-pointer flex items-center justify-center"
              style={{
                width: 28,
                height: 28,
                background: 'transparent',
                border: 0,
                color: 'var(--color-muted-foreground)',
                borderRadius: 4,
              }}
              aria-label="Close modal"
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '18px 20px' }}>
          {children}
        </div>

        {/* Optional footer (supports a leading slot for destructive actions) */}
        {(footer || leadingFooter) && (
          <div
            className="flex-shrink-0"
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface-warm)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {leadingFooter}
            <div style={{ flex: 1 }} />
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
