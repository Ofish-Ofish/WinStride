import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import TopBar from './TopBar';
import Sidebar from './Sidebar';

export type ViewMode = 'list' | 'graph' | 'dashboard' | 'timeline';

const MODULE_VIEWS: Record<string, ViewMode[]> = {
  security:   ['dashboard', 'list', 'graph', 'timeline'],
  powershell: ['dashboard', 'list'],
  sysmon:     ['dashboard', 'list', 'graph'],
};

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const location = useLocation();
  const currentModule = location.pathname.slice(1) || 'security';
  const availableViews = MODULE_VIEWS[currentModule] ?? ['dashboard', 'list'];

  // Reset to dashboard if current view isn't available for this module
  const effectiveViewMode = availableViews.includes(viewMode) ? viewMode : 'dashboard';

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      <TopBar
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        currentModule={currentModule}
        viewMode={effectiveViewMode}
        onViewModeChange={setViewMode}
        availableViews={availableViews}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} />
        <main className="flex-1 flex flex-col overflow-hidden p-6">
          <Outlet context={{ viewMode: effectiveViewMode }} />
        </main>
      </div>
    </div>
  );
}
