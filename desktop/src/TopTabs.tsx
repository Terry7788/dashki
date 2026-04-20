import clsx from 'clsx';

export type TabId = 'home' | 'journal' | 'foods' | 'calendar' | 'weight' | 'steps';

interface TopTabsProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'journal', label: 'Journal' },
  { id: 'foods', label: 'Foods' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'weight', label: 'Weight' },
  { id: 'steps', label: 'Steps' },
];

export default function TopTabs({ active, onChange }: TopTabsProps) {
  return (
    <div className="flex items-center gap-2 px-6 py-3 border-b border-white/10 bg-white/[0.02]">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={clsx(
              'px-4 py-2 rounded-2xl text-sm font-medium transition-colors',
              isActive
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
