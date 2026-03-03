import { useState } from 'react';
import type { MachineAliasMap, DetectedAlias } from '../../modules/security/shared/machineAliases';
import CollapsibleSection from './CollapsibleSection';
import QuickAction from './QuickAction';

export const METHOD_LABELS: Record<string, { label: string; color: string }> = {
  'sid': { label: 'SID', color: '#79c0ff' },
  'machine-account': { label: 'ACCT', color: '#d2a8ff' },
  'local-logon': { label: 'LOGON', color: '#f0a050' },
  'fqdn': { label: 'FQDN', color: '#56d364' },
};

export default function MachineAliasSection({
  userAliases,
  onUserAliasesChange,
  autoDetected,
  availableMachines,
}: {
  userAliases: MachineAliasMap;
  onUserAliasesChange: (a: MachineAliasMap) => void;
  autoDetected: DetectedAlias[];
  availableMachines: string[];
}) {
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualFrom, setManualFrom] = useState('');
  const [manualTo, setManualTo] = useState('');

  const userAliasEntries = Object.entries(userAliases);
  const totalMerges = autoDetected.length + userAliasEntries.length;

  const removeUserAlias = (rawName: string) => {
    const next = { ...userAliases };
    delete next[rawName];
    onUserAliasesChange(next);
  };

  const addManualAlias = () => {
    const from = manualFrom.trim();
    const to = manualTo.trim();
    if (!from || !to || from.toLowerCase() === to.toLowerCase()) return;
    onUserAliasesChange({ ...userAliases, [from.toLowerCase()]: to });
    setManualFrom('');
    setManualTo('');
    setShowManualAdd(false);
  };

  return (
    <>
      <CollapsibleSection
        title="Machine Identity"
        defaultOpen={totalMerges > 0}
        right={
          <div className="flex items-center gap-1.5">
            {totalMerges > 0 && (
              <span className="text-[10px] tabular-nums text-gray-600">
                {totalMerges} merged
              </span>
            )}
            <QuickAction label="+ Add" onClick={() => setShowManualAdd(true)} />
          </div>
        }
      >
        <div className="space-y-2">
          {/* Auto-detected merges (read-only, applied automatically) */}
          {autoDetected.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-[#56d364] uppercase tracking-wide">
                Auto-detected
              </span>
              {autoDetected.map((d) => {
                const m = METHOD_LABELS[d.method] ?? { label: '?', color: '#8b949e' };
                return (
                  <div
                    key={`${d.rawName}|${d.canonicalName}`}
                    className="flex items-center gap-2 py-1 px-2 bg-[#161b22] border border-[#30363d] rounded-md text-[11px]"
                  >
                    <span
                      className="text-[9px] font-bold px-1 py-px rounded uppercase flex-shrink-0"
                      style={{ color: m.color, background: `${m.color}15`, border: `1px solid ${m.color}30` }}
                    >
                      {m.label}
                    </span>
                    <span className="text-gray-500 line-through truncate">{d.rawName}</span>
                    <span className="text-gray-600 flex-shrink-0">&rarr;</span>
                    <span className="text-gray-200 font-medium truncate">{d.canonicalName}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* User-defined overrides */}
          {userAliasEntries.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-[#58a6ff] uppercase tracking-wide">
                Manual overrides
              </span>
              {userAliasEntries.map(([rawName, canonical]) => (
                <div
                  key={rawName}
                  className="flex items-center gap-2 py-1 px-2 bg-[#161b22] border border-[#30363d] rounded-md text-[11px]"
                >
                  <span className="text-gray-500 line-through truncate">{rawName}</span>
                  <span className="text-gray-600 flex-shrink-0">&rarr;</span>
                  <span className="text-gray-200 font-medium truncate">{canonical}</span>
                  <button
                    onClick={() => removeUserAlias(rawName)}
                    className="ml-auto text-gray-600 hover:text-[#f85149] transition-colors flex-shrink-0"
                    title="Remove override"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                      <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {totalMerges === 0 && !showManualAdd && (
            <p className="text-[11px] text-gray-500 py-1">
              No correlations found. Add manual merges for machines with different names.
            </p>
          )}

          {/* Manual add form */}
          {showManualAdd && (
            <div className="bg-[#161b22] border border-[#30363d] rounded-md p-2 space-y-1.5">
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                Manual merge
              </span>
              <input
                type="text"
                placeholder="Raw name (e.g. WIN-P9BH8...)"
                value={manualFrom}
                onChange={(e) => setManualFrom(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#21262d] rounded px-2 py-1 text-[11px] text-gray-200 placeholder-gray-600 focus:border-[#58a6ff]/50 outline-none"
                list="available-machines-from"
              />
              <datalist id="available-machines-from">
                {availableMachines.map((m) => <option key={m} value={m} />)}
              </datalist>
              <input
                type="text"
                placeholder="Display as (e.g. kiosk-1)"
                value={manualTo}
                onChange={(e) => setManualTo(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#21262d] rounded px-2 py-1 text-[11px] text-gray-200 placeholder-gray-600 focus:border-[#58a6ff]/50 outline-none"
                list="available-machines-to"
              />
              <datalist id="available-machines-to">
                {availableMachines.map((m) => <option key={m} value={m} />)}
              </datalist>
              <div className="flex gap-1.5">
                <button
                  onClick={addManualAlias}
                  disabled={!manualFrom.trim() || !manualTo.trim()}
                  className="flex-1 py-1 text-[10px] text-[#58a6ff] border border-[#21262d] hover:border-[#58a6ff]/40 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Merge
                </button>
                <button
                  onClick={() => { setShowManualAdd(false); setManualFrom(''); setManualTo(''); }}
                  className="px-3 py-1 text-[10px] text-gray-500 border border-[#21262d] hover:border-[#3d444d] rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>
      <div className="h-px bg-[#21262d]" />
    </>
  );
}
