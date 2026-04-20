import { useEffect, useState } from 'react';
import HomePage from '@/app/page';
import JournalPage from '@/app/journal/page';
import FoodsPage from '@/app/foods/page';
import StepsPage from '@/app/steps/page';
import TopTabs, { type TabId } from './TopTabs';
import TitleBar from './TitleBar';
import SettingsModal from './SettingsModal';

const STORAGE_KEY = 'dashki-desktop:active-tab';
const VALID_TABS: TabId[] = ['home', 'journal', 'foods', 'steps'];

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
    case 'steps':
      return <StepsPage />;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(readInitialTab);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, activeTab);
  }, [activeTab]);

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />
      <TopTabs active={activeTab} onChange={setActiveTab} />
      <main className="flex-1 overflow-auto">
        {renderActivePage(activeTab)}
      </main>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
