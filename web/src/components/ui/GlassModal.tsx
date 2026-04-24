'use client';

import { ReactNode, useEffect, useCallback, useRef } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: ModalSize;
  minHeight?: string;
  /**
   * Optional sticky footer rendered at the bottom of the modal panel.
   * Stays visible regardless of the body's scroll position. Use for primary
   * actions ("Add to Journal", "Save") that need to remain reachable on
   * long forms.
   */
  footer?: ReactNode;
  /**
   * When true, the modal renders edge-to-edge on screens narrower than `sm`
   * (~640px) — no backdrop padding, no rounded corners on small screens.
   * Larger screens still see the centred floating panel. Use for content-
   * dense modals like the food picker that need every pixel on mobile.
   */
  mobileFullscreen?: boolean;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'w-[90%] sm:max-w-3xl lg:max-w-5xl',
};

// Same widths but only enforced at sm: and above (used when the modal is
// mobile-fullscreen; on phones the panel fills the viewport, on tablet+
// it goes back to the constrained centred dialog).
// IMPORTANT: these MUST be literal strings so Tailwind's JIT picks them up.
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
  children,
  size = 'md',
  minHeight,
  footer,
  mobileFullscreen = false,
}: GlassModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  // Remember the page's scroll position when the modal opens so we can
  // restore it after the body-scroll-lock is lifted.
  const savedScrollYRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);

    // ── Body scroll lock — iOS-friendly version ─────────────────────────
    // `overflow: hidden` alone doesn't stop iOS Safari from scrolling the
    // page behind the modal. The reliable fix is to pin the body in place
    // with position:fixed and offset by the current scroll position so the
    // viewport visually stays put. On unmount we undo all three styles
    // and restore scroll. Works on iOS Safari, desktop, and Android.
    savedScrollYRef.current = window.scrollY;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${savedScrollYRef.current}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    body.style.width = '100%';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.overflow = '';
      body.style.width = '';
      window.scrollTo(0, savedScrollYRef.current);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  // Outer wrapper padding accounts for iOS safe areas (notch + home
  // indicator + URL/toolbar). env(safe-area-inset-*) is 0 on devices
  // without notches, so the max(...) fallback gives at least 16px of
  // breathing room everywhere. Without this, on iPhone 14 Pro the
  // modal header sits underneath the notch / dynamic island.
  const wrapperPadding = clsx(
    'items-center justify-center',
    'pl-4 pr-4',
    'pt-[max(1rem,env(safe-area-inset-top))]',
    'pb-[max(1rem,env(safe-area-inset-bottom))]'
  );

  // Panel max-height:
  //   - mobileFullscreen on phones uses svh (small viewport height) which
  //     ALWAYS gives the visible amount (whereas dvh updates dynamically
  //     and vh locks to the un-collapsed viewport). svh is the safest
  //     bet — it never overflows the visible area.
  //   - The calc subtracts the wrapper's vertical padding so the modal
  //     fits inside the wrapper without the rounded corners getting clipped.
  //   - On sm+ (tablet/desktop) we go back to a comfortable 90vh.
  const panelShape = mobileFullscreen
    ? 'max-h-[calc(100svh-max(1rem,env(safe-area-inset-top))-max(1rem,env(safe-area-inset-bottom)))] sm:max-h-[90vh] rounded-2xl sm:rounded-3xl'
    : 'max-h-[90vh] rounded-3xl';

  return (
    <div
      className={clsx('fixed inset-0 z-50 flex', wrapperPadding)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — flex column with max-height so it never overflows the viewport */}
      <div
        className={clsx(
          'relative w-full animate-scale-in flex flex-col',
          panelShape,
          minHeight,
          // Light
          'bg-[#fffefb] border border-[#cccbc8]/50 text-[#1d1c1c]',
          // Dark
          'dark:bg-[#1a1a1a]/95 dark:border-white/[0.08] dark:text-white',
          'dark:backdrop-blur-xl shadow-sm dark:shadow-2xl',
          // Width clamp: in fullscreen mode the clamp only kicks in at sm+,
          // so phones see the full viewport. Otherwise clamp at all sizes.
          mobileFullscreen ? sizeClassesMobileFullscreen[size] : sizeClasses[size]
        )}
      >
        {/* Header — fixed height, never scrolls */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-5 border-b border-[#cccbc8]/40 dark:border-white/[0.08]">
          <h2
            id="modal-title"
            className="text-lg font-semibold text-[#1d1c1c] dark:text-white"
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#313d44]/50 hover:text-[#1d1c1c] hover:bg-[#d4eaf7]/50 dark:text-white/50 dark:hover:text-white dark:hover:bg-white/10 transition-all duration-200"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer (optional) — sticky at bottom of panel, never scrolls */}
        {footer && (
          <div className="flex-shrink-0 border-t border-[#cccbc8]/40 dark:border-white/[0.08] px-6 py-4 bg-[#fffefb]/50 dark:bg-[#1a1a1a]/80 backdrop-blur-sm">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
