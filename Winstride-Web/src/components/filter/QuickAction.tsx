export default function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="px-2 py-0.5 text-[11px] rounded border border-[#30363d] text-[#58a6ff]/80 hover:text-[#58a6ff] hover:border-[#58a6ff]/40 hover:bg-[#58a6ff]/5 transition-all"
    >
      {label}
    </button>
  );
}
