import type { NetworkConnection } from '../shared/types';
import { relativeTime } from '../../../shared/listUtils';
import { Row, SectionLabel, RawDataToggle } from '../../../components/list/DetailPrimitives';

const STATE_ACCENT: Record<string, string> = {
  'Established': 'bg-[#3fb950]',
  'Listen':      'bg-[#58a6ff]',
  'TimeWait':    'bg-[#f0883e]',
  'CloseWait':   'bg-[#8b5cf6]',
  'SynSent':     'bg-[#f0883e]',
  'Closed':      'bg-[#8b949e]',
};

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

export default function NetworkDetailRow({ item }: { item: NetworkConnection }) {
  const accent = (item.state && STATE_ACCENT[item.state]) ?? 'bg-[#1f6feb]';

  return (
    <div className="mx-4 my-2 bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
      <div className={`h-0.5 ${accent}`} />
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0">
        <div>
          <SectionLabel>Connection</SectionLabel>
          <Row label="Local" value={`${item.localAddress ?? '*'}:${item.localPort ?? '*'}`} mono />
          <Row label="Remote" value={`${item.remoteAddress ?? '*'}:${item.remotePort ?? '*'}`} mono />
          <Row label="Protocol" value={item.protocol} />
          <Row label="State" value={item.state} />
        </div>

        <div>
          <SectionLabel>Process</SectionLabel>
          <Row label="Name" value={item.processName} />
          <Row label="PID" value={item.processId != null ? String(item.processId) : null} mono />
          <Row label="Module" value={item.moduleName} />

          <SectionLabel>Traffic</SectionLabel>
          <Row label="Sent" value={`${formatBytes(item.sentBytes)} (${item.sentPackets.toLocaleString()} packets)`} />
          <Row label="Received" value={`${formatBytes(item.recvBytes)} (${item.recvPackets.toLocaleString()} packets)`} />

          <SectionLabel>Meta</SectionLabel>
          <Row label="Machine" value={item.machineName} />
          <Row label="Batch ID" value={item.batchId} mono />
          <Row label="Last Updated" value={relativeTime(item.timeCreated)} />
        </div>
      </div>

      <RawDataToggle raw={item} />
    </div>
  );
}
