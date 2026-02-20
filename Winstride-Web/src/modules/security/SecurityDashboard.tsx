import { useOutletContext } from 'react-router-dom';
import LogonGraph from './graph/LogonGraph';
import EventList from './list/EventList';
import type { ViewMode } from '../../components/layout/Layout';

export default function SecurityDashboard() {
  const { viewMode } = useOutletContext<{ viewMode: ViewMode }>();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <h2 className="text-xl font-semibold mb-4">Security Events</h2>
      <div className={viewMode === 'list' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
        <EventList visible={viewMode === 'list'} />
      </div>
      <div className={viewMode === 'graph' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
        <LogonGraph visible={viewMode === 'graph'} />
      </div>
    </div>
  );
}
