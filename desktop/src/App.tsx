import { useEffect, useState } from 'react';
import clsx from 'clsx';
import HomePage from '@/app/page';
import JournalPage from '@/app/journal/page';
import FoodsPage from '@/app/foods/page';
import CalendarPage from '@/app/calendar/page';
import WeightPage from '@/app/weight/page';
import StepsPage from '@/app/steps/page';
import WebSettingsPage from '@/app/settings/page';
import TopTabs, { type TabId } from './TopTabs';
import TitleBar from './TitleBar';
import SettingsModal from './SettingsModal';

const STORAGE_KEY = 'dashki-desktop:active-tab';
const VALID_TABS: TabId[] = [
  'home',
  'journal',
  'foods',
  'calendar',
  'weight',
  'steps',
  'settings',
];

function readInitialTab(): TabId {
  if (typeof window === 'undefined') return 'home';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return VALID_TABS.includes(stored as TabId) ? (stored as TabId) : 'home';
}

function renderActivePage(activeTab: TabId) {
  switch (activeTab) {
    case 'home':
      return <HomePage />;
    case 'journal':
      return <JournalPage />;
    case 'foods':
      return <FoodsPage />;
    case 'calendar':
      return <CalendarPage />;
    case 'weight':
      return <WeightPage />;
    case 'steps':
      return <StepsPage />;
    case 'settings':
      return <WebSettingsPage />;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(readInitialTab);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, activeTab);
  }, [activeTab]);

  return (
    // h-screen (not min-h-screen) so the layout is pinned to viewport
    // height — forces scrolling to happen INSIDE <main> rather than at
    // the window level, keeping TitleBar + TopTabs always visible.
    <div className="h-screen flex flex-col bg-black text-white">
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />
      <TopTabs active={activeTab} onChange={setActiveTab} />
      <main
        className={clsx(
          'flex-1 overflow-auto',
          // Steps, Calendar, and Settings pages already supply their own
          // px-4 py-8 wrapper. Other pages don't, so add matching padding
          // here for consistency.
          activeTab !== 'steps' &&
            activeTab !== 'calendar' &&
            activeTab !== 'settings' &&
            'px-4 md:px-6 py-8'
        )}
      >
        {renderActivePage(activeTab)}
      </main>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
