import { useOutletContext } from 'react-router-dom';
import NetworkList from './list/NetworkList';
import type { ViewMode } from '../../components/layout/Layout';

export default function NetworkDashboard() {
  const { viewMode } = useOutletContext<{ viewMode: ViewMode }>();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <h2 className="text-xl font-semibold mb-4">Network Connections</h2>
      <NetworkList visible={viewMode === 'list'} />
    </div>
  );
}
