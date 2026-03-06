import { useOutletContext } from 'react-router-dom';
import HeartbeatsList from './list/HeartbeatsList';
import type { ViewMode } from '../../components/layout/Layout';

export default function HeartbeatsDashboard() {
  const { viewMode } = useOutletContext<{ viewMode: ViewMode }>();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <h2 className="text-xl font-semibold mb-4">Heartbeats</h2>
      <HeartbeatsList visible={viewMode === 'list'} />
    </div>
  );
}
