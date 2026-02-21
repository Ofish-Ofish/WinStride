import type { Severity } from '../../shared/detection/rules';
import { SEVERITY_COLORS, SEVERITY_LABELS } from '../../shared/detection/engine';
import CollapsibleSection from './CollapsibleSection';

const LEVELS: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];

interface Props {
  value: Severity | null;
  onChange: (value: Severity | null) => void;
}

export default function SeverityFilter({ value, onChange }: Props) {
  return (
    <CollapsibleSection
      title="Min Risk Level"
      right={
        value
          ? <span className={`text-[11px] font-semibold ${SEVERITY_COLORS[value].text}`}>
              {SEVERITY_LABELS[value]}+
            </span>
          : <span className="text-[11px] text-gray-500">All</span>
      }
    >
      <div className="flex gap-1">
        {LEVELS.map((sev) => {
          const active = value === sev;
          const colors = SEVERITY_COLORS[sev];
          return (
            <button
              key={sev}
              onClick={() => onChange(active ? null : sev)}
              className={`flex-1 py-1 text-[10px] font-semibold rounded transition-all ${
                active
                  ? `${colors.bg} ${colors.text} ring-1 ${colors.border.replace('border-', 'ring-')}`
                  : 'text-gray-400 hover:text-gray-200 bg-[#161b22] hover:bg-[#1c2128]'
              }`}
            >
              {SEVERITY_LABELS[sev]}
            </button>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
