import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents } from '../../api/client';
import LogonGraph from './graph/LogonGraph';
import type { ViewMode } from '../../components/layout/Layout';

function EventTable() {
  const { data: events, isLoading, error } = useQuery({
    queryKey: ['events', 'security'],
    queryFn: () => fetchEvents({ $filter: "logName eq 'Security'" }),
    refetchInterval: 5000,
  });

  if (isLoading) return <div className="text-gray-400">Loading events...</div>;
  if (error) return <div className="text-red-400">Error loading events</div>;

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-800 text-gray-300">
          <tr>
            <th className="text-left px-4 py-3">Event ID</th>
            <th className="text-left px-4 py-3">Level</th>
            <th className="text-left px-4 py-3">Machine</th>
            <th className="text-left px-4 py-3">Time</th>
          </tr>
        </thead>
        <tbody>
          {events?.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                No events yet. Make sure the Agent is running.
              </td>
            </tr>
          )}
          {events?.map((event: any) => (
            <tr key={event.id} className="border-t border-gray-800 hover:bg-gray-800/50">
              <td className="px-4 py-2">{event.eventId}</td>
              <td className="px-4 py-2">{event.level}</td>
              <td className="px-4 py-2">{event.machineName}</td>
              <td className="px-4 py-2">
                {new Date(event.timeCreated).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SecurityDashboard() {
  const { viewMode } = useOutletContext<{ viewMode: ViewMode }>();

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-xl font-semibold mb-4">Security Events</h2>
      <div className={viewMode === 'list' ? '' : 'hidden'}>
        <EventTable />
      </div>
      <div className={viewMode === 'graph' ? 'flex-1 flex flex-col' : 'hidden'}>
        <LogonGraph visible={viewMode === 'graph'} />
      </div>
    </div>
  );
}
