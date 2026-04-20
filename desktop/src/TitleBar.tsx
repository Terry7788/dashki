import { Minus, X, Settings } from 'lucide-react';

declare global {
  interface Window {
    electronAPI: {
      windowMinimize: () => void;
      windowClose: () => void;
      getAutoLaunch: () => Promise<boolean>;
      setAutoLaunch: (enabled: boolean) => Promise<void>;
    };
  }
}

interface TitleBarProps {
  onOpenSettings: () => void;
}

export default function TitleBar({ onOpenSettings }: TitleBarProps) {
  return (
    <div
      className="flex items-center justify-between h-10 bg-black/80 border-b border-white/5 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="px-4 text-xs uppercase tracking-wider text-white/40">
        Dashki
      </div>
      <div
        className="flex"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={onOpenSettings}
          className="w-12 h-10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>
        <button
          onClick={() => window.electronAPI.windowMinimize()}
          className="w-12 h-10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Minimize"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => window.electronAPI.windowClose()}
          className="w-12 h-10 flex items-center justify-center text-white/60 hover:bg-red-500 hover:text-white"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
