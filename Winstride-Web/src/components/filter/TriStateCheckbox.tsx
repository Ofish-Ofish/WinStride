import type { FilterState } from './filterPrimitives';

export default function TriStateCheckbox({
  state,
  onCycle,
  label,
  sub,
}: {
  state: FilterState | undefined;
  onCycle: () => void;
  label: string;
  sub?: string;
}) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onCycle(); }}
      className="flex items-center gap-2.5 px-2 py-[5px] rounded-md hover:bg-[#1c2128] cursor-pointer group transition-colors select-none"
    >
      <div
        className={`w-[15px] h-[15px] rounded-[3px] border-[1.5px] flex items-center justify-center flex-shrink-0 transition-all ${
          state === 'select'
            ? 'bg-[#58a6ff] border-[#58a6ff]'
            : state === 'exclude'
              ? 'bg-[#f85149] border-[#f85149]'
              : 'border-[#3d444d] group-hover:border-[#58a6ff]/50'
        }`}
      >
        {state === 'select' && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {state === 'exclude' && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <span className={`text-[13px] leading-tight min-w-0 truncate ${
        state === 'exclude' ? 'text-gray-500 line-through' : 'text-gray-300'
      }`} title={sub ? `${label} — ${sub}` : label}>
        {label}
        {sub && <span className={`ml-1.5 ${state === 'exclude' ? 'text-gray-600' : 'text-gray-500'}`}>— {sub}</span>}
      </span>
    </div>
  );
}
