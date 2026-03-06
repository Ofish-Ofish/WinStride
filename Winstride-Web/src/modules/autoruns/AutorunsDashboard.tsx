import { useOutletContext } from 'react-router-dom';
import AutorunsList from './list/AutorunsList';
import type { ViewMode } from '../../components/layout/Layout';

export default function AutorunsDashboard() {
  const { viewMode } = useOutletContext<{ viewMode: ViewMode }>();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <h2 className="text-xl font-semibold mb-4">Autoruns</h2>
      <AutorunsList visible={viewMode === 'list'} />
    </div>
  );
}
