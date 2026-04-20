import { useEffect, useState } from 'react';
import JournalPage from '@/app/journal/page';
import FoodsPage from '@/app/foods/page';
import TopTabs, { type TabId } from './TopTabs';
import TitleBar from './TitleBar';
import SettingsModal from './SettingsModal';

const STORAGE_KEY = 'dashki-desktop:active-tab';

function readInitialTab(): TabId {
  if (typeof window === 'undefined') return 'journal';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'foods' ? 'foods' : 'journal';
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
        {activeTab === 'journal' ? <JournalPage /> : <FoodsPage />}
      </main>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
