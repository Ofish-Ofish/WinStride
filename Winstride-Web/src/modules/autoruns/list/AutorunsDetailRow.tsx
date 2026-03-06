import type { AutorunEntry } from '../shared/types';
import { Row, SectionLabel, CopyButton, RawDataToggle } from '../../../components/list/DetailPrimitives';

const CATEGORY_ACCENT: Record<string, string> = {
  'Logon':           'bg-[#58a6ff]',
  'Services':        'bg-[#8b5cf6]',
  'Drivers':         'bg-[#f0883e]',
  'Scheduled Tasks': 'bg-[#3fb950]',
  'Boot Execute':    'bg-[#f85149]',
  'Known DLLs':      'bg-[#58a6ff]',
};

export default function AutorunsDetailRow({ item }: { item: AutorunEntry }) {
  const accent = CATEGORY_ACCENT[item.category] ?? 'bg-[#1f6feb]';
  const hasHashes = item.sha256 || item.md5;
  const hasRight = item.imagePath || item.launchString || hasHashes;

  return (
    <div className="mx-4 my-2 bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
      <div className={`h-0.5 ${accent}`} />
      <div className={`p-4 grid grid-cols-1 ${hasRight ? 'md:grid-cols-2' : ''} gap-x-8 gap-y-0`}>
        <div>
          <SectionLabel>Entry</SectionLabel>
          <Row label="Name" value={item.entry} />
          <Row label="Location" value={item.entryLocation} mono />
          <Row label="Category" value={item.category} />
          <Row label="Description" value={item.description} />
          <Row label="Company" value={item.company} />
          <Row label="Version" value={item.version} />
          <Row label="Enabled" value={item.enabled} />
          <Row label="Profile" value={item.profile} />
        </div>

        {hasRight && (
          <div>
            <SectionLabel>Execution</SectionLabel>
            <Row label="Image Path" value={item.imagePath} mono />
            <Row label="Launch String" value={item.launchString} mono />

            {hasHashes && (
              <>
                <SectionLabel>Hashes</SectionLabel>
                {item.sha256 && (
                  <div className="flex items-start gap-1 py-1.5 border-b border-[#21262d]/60">
                    <span className="text-[11px] text-gray-200 uppercase tracking-wider shrink-0 mr-4">SHA256</span>
                    <span className="text-[11px] text-white font-mono break-all flex-1">{item.sha256}</span>
                    <CopyButton text={item.sha256} />
                  </div>
                )}
                {item.md5 && (
                  <div className="flex items-start gap-1 py-1.5 border-b border-[#21262d]/60">
                    <span className="text-[11px] text-gray-200 uppercase tracking-wider shrink-0 mr-4">MD5</span>
                    <span className="text-[11px] text-white font-mono break-all flex-1">{item.md5}</span>
                    <CopyButton text={item.md5} />
                  </div>
                )}
              </>
            )}

            <SectionLabel>Meta</SectionLabel>
            <Row label="Machine" value={item.machineName} />
            <Row label="Batch ID" value={item.batchId} mono />
          </div>
        )}
      </div>

      <RawDataToggle raw={item} />
    </div>
  );
}
