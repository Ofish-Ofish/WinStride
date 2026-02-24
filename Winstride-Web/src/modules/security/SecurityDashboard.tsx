import { useOutletContext } from 'react-router-dom';
import LogonGraph from './graph/LogonGraph';
import EventList from './list/EventList';
import SecurityMetrics from './dashboard/SecurityMetrics';
import TimelineView from './timeline/TimelineView';
import type { ViewMode } from '../../components/layout/Layout';

export default function SecurityDashboard() {
  const { viewMode } = useOutletContext<{ viewMode: ViewMode }>();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <h2 className="text-xl font-semibold mb-4">Security Events</h2>
      {viewMode === 'dashboard' && (
        <div className="flex-1 flex flex-col min-h-0">
          <SecurityMetrics />
        </div>
      )}
      {viewMode === 'list' && (
        <div className="flex-1 flex flex-col min-h-0">
          <EventList />
        </div>
      )}
      {viewMode === 'graph' && (
        <div className="flex-1 flex flex-col min-h-0">
          <LogonGraph />
        </div>
      )}
      {viewMode === 'timeline' && (
        <div className="flex-1 flex flex-col min-h-0">
          <TimelineView />
        </div>
      )}
    </div>
  );
}
