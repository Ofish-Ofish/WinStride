import type { SelectedElement } from './useCytoscape';

const TYPE_COLORS: Record<string, string> = {
  user: '#58a6ff',
  privileged: '#f97583',
  machine: '#3fb950',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${mo}/${day} ${h}:${min}\u00A0${ampm}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-[#21262d]">
      <span className="text-[11px] text-gray-500 uppercase tracking-wider shrink-0">{label}</span>
      <span className="text-[12px] text-gray-300 font-mono text-right max-w-[60%] break-all whitespace-nowrap">
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
  const firstSeen = data.firstSeen as string;
  const lastSeen = data.lastSeen as string;
  const logonTypeLabel = data.logonTypeLabel as string;
  const ipAddress = data.ipAddress as string;
  const subjectUserName = data.subjectUserName as string;
  const targetDomainName = data.targetDomainName as string;

  return (
    <div className="absolute top-3 right-3 w-64 bg-[#0d1117]/95 border border-[#21262d] rounded-lg backdrop-blur-md shadow-2xl overflow-hidden">
      <div className="h-0.5 bg-[#e3b341]" />
      <div className="p-3.5">
        <h3 className="text-[13px] font-semibold text-gray-100 mb-3">{logonTypeLabel}</h3>
        <Row label="User" value={(data.source as string).replace(/^user:/, '')} />
        <Row label="Machine" value={(data.target as string).replace(/^machine:/, '')} />
        {targetDomainName && <Row label="Domain" value={targetDomainName} />}
        {subjectUserName && subjectUserName !== '-' && (
          <Row label="Initiated by" value={subjectUserName} />
        )}
        {ipAddress && ipAddress !== '-' && <Row label="IP Address" value={ipAddress} />}
        <Row label="Events" value={data.logonCount as number} />
        {firstSeen && (
          <Row label="First seen" value={formatTime(firstSeen)} />
        )}
        {lastSeen && (
          <Row label="Last seen" value={formatTime(lastSeen)} />
        )}
      </div>
    </div>
  );
}
