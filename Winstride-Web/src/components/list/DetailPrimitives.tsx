import { useState } from 'react';

/** Key-value row used inside detail expansion panels. */
export function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-[#21262d]/60">
      <span className="text-[11px] text-gray-200 uppercase tracking-wider shrink-0 mr-4">{label}</span>
      <span className={`text-[12px] text-white text-right break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

/** Blue accent section heading. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-[#58a6ff] uppercase tracking-widest mt-3 mb-1 font-semibold">{children}</div>
  );
}

/** Inline copy-to-clipboard button. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-2 px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white border border-[#30363d] rounded transition-colors"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/** Collapsible raw eventData toggle at the bottom of detail panels. */
export function RawDataToggle({ raw }: { raw: unknown }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="border-t border-[#21262d] px-4 py-2">
      <button
        onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }}
        className="text-[11px] text-gray-200 hover:text-white transition-colors"
      >
        {showRaw ? 'Hide' : 'Show'} raw eventData
      </button>
      {showRaw && raw != null && (
        <pre className="mt-2 p-3 bg-[#161b22] border border-[#21262d] rounded text-[11px] text-gray-200 font-mono overflow-x-auto max-h-60 overflow-y-auto">
          {typeof raw === 'string' ? JSON.stringify(JSON.parse(raw), null, 2) : JSON.stringify(raw, null, 2)}
        </pre>
      )}
    </div>
  );
}

/** Standard badge component for detail rows. */
export function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{ background: `${color}20`, color }}
    >
      {children}
    </span>
  );
}
