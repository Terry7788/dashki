'use client';

import { Menu } from 'lucide-react';

interface MobileHeaderProps {
  onMenuToggle: () => void;
}

export default function MobileHeader({ onMenuToggle }: MobileHeaderProps) {
  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center px-4 bg-white/90 dark:bg-[#111111]/95 backdrop-blur-md border-b border-black/[0.06] dark:border-white/[0.08]">
      {/* Hamburger */}
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/10 transition-all duration-200"
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Logo / Title */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2">
          <img 
            src="/web/icon-192.png" 
            alt="Dashki" 
            className="w-7 h-7 rounded-lg"
          />
          <span className="text-lg font-bold text-[#61bc84] tracking-tight">Dashki</span>
        </div>
      </div>

      {/* Spacer to balance the hamburger on the left */}
      <div className="w-9" aria-hidden="true" />
    </header>
  );
}
