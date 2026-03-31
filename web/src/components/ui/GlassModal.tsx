'use client';

import { ReactNode, useEffect, useCallback } from 'react';
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
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'w-[90%] sm:max-w-3xl lg:max-w-5xl',
};

export default function GlassModal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  minHeight,
}: GlassModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    // Lock scroll
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
          'max-h-[90vh]',
          minHeight,
          // Light
          'bg-[#fffefb] border border-[#cccbc8]/50 text-[#1d1c1c]',
          // Dark
          'dark:bg-[#1a1a1a]/95 dark:border-white/[0.08] dark:text-white',
          'backdrop-blur-xl rounded-3xl shadow-2xl',
          sizeClasses[size]
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
      </div>
    </div>
  );
}
