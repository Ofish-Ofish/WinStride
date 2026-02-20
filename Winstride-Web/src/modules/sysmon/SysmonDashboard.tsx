import { useOutletContext } from 'react-router-dom';
import SysmonEventList from './list/SysmonEventList';
import ProcessTree from './graph/ProcessTree';
import type { ViewMode } from '../../components/layout/Layout';

export default function SysmonDashboard() {
  const { viewMode } = useOutletContext<{ viewMode: ViewMode }>();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <h2 className="text-xl font-semibold mb-4">Sysmon Events</h2>
      <div className={viewMode === 'list' || viewMode === 'dashboard' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
        <SysmonEventList visible={viewMode === 'list' || viewMode === 'dashboard'} />
      </div>
      <div className={viewMode === 'graph' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
        <ProcessTree visible={viewMode === 'graph'} />
      </div>
    </div>
  );
}
