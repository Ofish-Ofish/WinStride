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

/** Code block wrapper with a GitHub-style copy button in the top-right corner. */
export function CodeBlock({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className="relative group/cb">
      <div className="absolute right-5 top-2 z-10 opacity-0 group-hover/cb:opacity-100 transition-opacity">
        <CopyIconButton text={text} title="Copy" />
      </div>
      <pre className={`p-3 bg-[#161b22] border border-[#21262d] rounded text-[11px] text-gray-200 font-mono overflow-x-auto ${className}`}>
        {text}
      </pre>
    </div>
  );
}

/** Collapsible raw eventData toggle at the bottom of detail panels. */
export function RawDataToggle({ raw }: { raw: unknown }) {
  const [showRaw, setShowRaw] = useState(false);
  const formatted = showRaw && raw != null
    ? (typeof raw === 'string' ? JSON.stringify(JSON.parse(raw), null, 2) : JSON.stringify(raw, null, 2))
    : '';
  return (
    <div className="border-t border-[#21262d] px-4 py-2">
      <button
        onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }}
        className="text-[11px] text-gray-200 hover:text-white transition-colors"
      >
        {showRaw ? 'Hide' : 'Show'} raw eventData
      </button>
      {showRaw && raw != null && (
        <CodeBlock text={formatted} className="mt-2 max-h-60 overflow-y-auto" />
      )}
    </div>
  );
}

/** Small icon button for copying text to clipboard — GitHub-style. */
export function CopyIconButton({ text, title }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={`p-1 rounded border border-[#30363d] bg-[#161b22] transition-colors ${copied ? 'text-[#56d364]' : 'text-gray-500 hover:text-gray-200'}`}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
          <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
        </svg>
      )}
    </button>
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
