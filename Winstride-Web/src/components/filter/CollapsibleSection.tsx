import { useState } from 'react';

export default function CollapsibleSection({
  title,
  right,
  children,
  defaultOpen = true,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 group"
        >
          <svg
            className={`w-3 h-3 text-gray-600 group-hover:text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
            viewBox="0 0 12 12"
            fill="none"
          >
            <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[11px] font-semibold text-gray-500 group-hover:text-gray-300 uppercase tracking-widest select-none transition-colors">
            {title}
          </span>
        </button>
        {open && right}
      </div>
      {open && children}
    </div>
  );
}
