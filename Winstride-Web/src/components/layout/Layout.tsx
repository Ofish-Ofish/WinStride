import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import TopBar from './TopBar';
import Sidebar from './Sidebar';

export type ViewMode = 'list' | 'graph';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const location = useLocation();
  const currentModule = location.pathname.slice(1) || 'security';

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      <TopBar
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        currentModule={currentModule}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} />
        <main className="flex-1 flex flex-col overflow-hidden p-6">
          <Outlet context={{ viewMode }} />
        </main>
      </div>
    </div>
  );
}
