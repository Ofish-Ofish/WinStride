interface Failure {
  time: string;
  user: string;
  machine: string;
  ip: string;
  reason: string;
}

interface FailuresTableProps {
  data: Failure[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function FailuresTable({ data }: FailuresTableProps) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <h3 className="text-[#58a6ff] text-sm font-semibold mb-3">Recent Failed Logons</h3>
      {data.length === 0 ? (
        <p className="text-gray-300 text-sm">No failed logons in this time range</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-gray-200 font-medium py-2 pr-4">Time</th>
                <th className="text-left text-gray-200 font-medium py-2 pr-4">User</th>
                <th className="text-left text-gray-200 font-medium py-2 pr-4">Machine</th>
                <th className="text-left text-gray-200 font-medium py-2 pr-4">IP</th>
                <th className="text-left text-gray-200 font-medium py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.map((f, i) => (
                <tr key={i} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                  <td className="text-white py-2 pr-4 whitespace-nowrap font-mono text-xs">{formatTime(f.time)}</td>
                  <td className="text-white py-2 pr-4 font-semibold">{f.user}</td>
                  <td className="text-gray-200 py-2 pr-4">{f.machine}</td>
                  <td className="text-gray-200 py-2 pr-4 font-mono text-xs">{f.ip}</td>
                  <td className="py-2">
                    <span className="text-[#ff7b72] font-semibold text-xs">{f.reason}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
