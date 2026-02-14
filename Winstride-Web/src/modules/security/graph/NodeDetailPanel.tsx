import type { SelectedElement } from './useCytoscape';

const TYPE_COLORS: Record<string, string> = {
  user: '#58a6ff',
  privileged: '#f97583',
  machine: '#3fb950',
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-[#21262d]">
      <span className="text-[11px] text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-[12px] text-gray-300 font-mono text-right max-w-[60%] break-all">
        {value}
      </span>
    </div>
  );
}

export default function NodeDetailPanel({ selected }: { selected: SelectedElement }) {
  const { type, data } = selected;

  if (type === 'node') {
    const nodeType = data.type as string;
    const privileged = data.privileged as boolean;
    const colorKey = nodeType === 'machine' ? 'machine' : privileged ? 'privileged' : 'user';
    const color = TYPE_COLORS[colorKey];
    const typeLabel = nodeType === 'machine' ? 'Machine' : privileged ? 'Privileged User' : 'User';

    return (
      <div className="absolute top-3 right-3 w-60 bg-[#0d1117]/95 border border-[#21262d] rounded-lg backdrop-blur-md shadow-2xl overflow-hidden">
        {/* Color accent bar */}
        <div className="h-0.5" style={{ background: color }} />
        <div className="p-3.5">
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: color, boxShadow: `0 0 8px ${color}80` }}
            />
            <h3 className="text-[13px] font-semibold text-gray-100 truncate">
              {data.label as string}
            </h3>
          </div>
          <Row label="Type" value={typeLabel} />
          <Row label="Events" value={data.logonCount as number} />
        </div>
      </div>
    );
  }

  // Edge
  const lastSeen = data.lastSeen as string;
  const logonTypeLabel = data.logonTypeLabel as string;

  return (
    <div className="absolute top-3 right-3 w-60 bg-[#0d1117]/95 border border-[#21262d] rounded-lg backdrop-blur-md shadow-2xl overflow-hidden">
      <div className="h-0.5 bg-[#e3b341]" />
      <div className="p-3.5">
        <h3 className="text-[13px] font-semibold text-gray-100 mb-3">Connection</h3>
        <Row label="From" value={(data.source as string).replace(/^user:/, '')} />
        <Row label="To" value={(data.target as string).replace(/^machine:/, '')} />
        <Row label="Type" value={logonTypeLabel} />
        <Row label="Events" value={data.logonCount as number} />
        {lastSeen && (
          <Row label="Last seen" value={new Date(lastSeen).toLocaleString()} />
        )}
      </div>
    </div>
  );
}
