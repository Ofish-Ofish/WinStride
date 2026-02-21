import type { WinEvent } from '../../modules/security/shared/types';
import type { ColumnDef } from '../listUtils';
import type { SeverityIntegration } from './engine';
import { SEVERITY_COLORS, SEVERITY_LABELS } from './engine';

/**
 * Renders the severity badge for the 'severity' column.
 * Returns null for non-severity columns so the caller can fall through to their own renderer.
 */
export function renderSeverityCell(
  col: ColumnDef,
  event: WinEvent,
  sev: SeverityIntegration,
): React.ReactNode | null {
  if (col.key !== 'severity') return null;
  const info = sev.getEventSeverity(event);
  if (!info) return <span className="text-gray-600">-</span>;
  const colors = SEVERITY_COLORS[info.severity];
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${colors.text} ${colors.bg}`}>
      {SEVERITY_LABELS[info.severity]}
    </span>
  );
}
