import { useEffect, useState } from 'react';
import { GlassModal } from '@/components/ui';

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

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [autoLaunch, setAutoLaunch] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    window.electronAPI.getAutoLaunch().then((value) => {
      if (!cancelled) setAutoLaunch(value);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleToggle = async (enabled: boolean) => {
    setAutoLaunch(enabled);
    await window.electronAPI.setAutoLaunch(enabled);
  };

  return (
    <GlassModal open={open} onClose={onClose} title="Settings" size="sm">
      <div className="space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoLaunch ?? false}
            disabled={autoLaunch === null}
            onChange={(e) => handleToggle(e.target.checked)}
            className="mt-1 w-4 h-4 rounded accent-white"
          />
          <div>
            <div className="font-medium text-white">Auto-start on Windows boot</div>
            <div className="text-sm text-white/60">
              Dashki will launch silently in the system tray when you sign in.
            </div>
          </div>
        </label>
      </div>
    </GlassModal>
  );
}
