export default function ToggleSwitch({
  checked,
  onChange,
  label,
  activeColor = 'bg-[#58a6ff]',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  activeColor?: string;
}) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className="flex items-center gap-2 py-1 cursor-pointer select-none"
    >
      <div
        className={`relative w-7 h-4 rounded-full transition-colors flex-shrink-0 ${
          checked ? activeColor : 'bg-[#30363d]'
        }`}
      >
        <span
          className={`absolute top-[2px] left-[2px] w-3 h-3 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[12px]' : 'translate-x-0'
          }`}
        />
      </div>
      <span className="text-[11px] text-gray-300">{label}</span>
    </div>
  );
}
