import type { Severity } from '../../shared/detection/rules';
import { SEVERITY_COLORS, SEVERITY_LABELS } from '../../shared/detection/engine';
import CollapsibleSection from './CollapsibleSection';

export type SeverityFilterValue = Set<Severity | 'undetected'>;

const LEVELS: (Severity | 'undetected')[] = ['undetected', 'info', 'low', 'medium', 'high', 'critical'];

const DISPLAY: Record<string, string> = { ...SEVERITY_LABELS, undetected: 'None' };

interface Props {
  value: SeverityFilterValue;
  onChange: (value: SeverityFilterValue) => void;
}

export default function SeverityFilter({ value, onChange }: Props) {
  const toggle = (level: Severity | 'undetected') => {
    const next = new Set(value);
    if (next.has(level)) next.delete(level); else next.add(level);
    onChange(next);
  };

  const activeCount = value.size;

  return (
    <CollapsibleSection
      title="Risk Level"
      right={
        activeCount === LEVELS.length
          ? <span className="text-[11px] text-gray-500">All</span>
          : activeCount === 0
            ? <span className="text-[11px] text-gray-500">None</span>
            : <span className="text-[11px] text-gray-200">{activeCount} selected</span>
      }
    >
      <div className="flex gap-1">
        {LEVELS.map((level) => {
          const active = value.has(level);
          if (level === 'undetected') {
            return (
              <button
                key={level}
                onClick={() => toggle(level)}
                className={`flex-1 py-1 text-[10px] font-semibold rounded transition-all ${
                  active
                    ? 'bg-[#21262d] text-gray-200 ring-1 ring-gray-500/30'
                    : 'text-gray-500 hover:text-gray-300 bg-[#161b22] hover:bg-[#1c2128] line-through'
                }`}
              >
                {DISPLAY[level]}
              </button>
            );
          }
          const colors = SEVERITY_COLORS[level];
          return (
            <button
              key={level}
              onClick={() => toggle(level)}
              className={`flex-1 py-1 text-[10px] font-semibold rounded transition-all ${
                active
                  ? `${colors.bg} ${colors.text} ring-1 ${colors.border.replace('border-', 'ring-')}`
                  : 'text-gray-500 hover:text-gray-300 bg-[#161b22] hover:bg-[#1c2128] line-through'
              }`}
            >
              {DISPLAY[level]}
            </button>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
