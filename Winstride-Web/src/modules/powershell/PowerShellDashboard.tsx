import { useOutletContext } from 'react-router-dom';
import PSEventList from './list/PSEventList';
import type { ViewMode } from '../../components/layout/Layout';

export default function PowerShellDashboard() {
  const { viewMode } = useOutletContext<{ viewMode: ViewMode }>();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <h2 className="text-xl font-semibold mb-4">PowerShell Events</h2>
      <PSEventList visible={viewMode === 'list' || viewMode === 'dashboard'} />
    </div>
  );
}
