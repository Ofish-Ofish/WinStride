import { useState, useEffect, useRef } from 'react';
import type { GraphFilters } from './filterTypes';
import { serializeFilters, validateFilterExport, deserializeFilters, type FilterExport } from './filterSerializer';
import { BUILTIN_PRESETS } from './filterPresets';
import { PresetBar as GenericPresetBar } from '../../../components/filter';

/* ------------------------------------------------------------------ */
/*  Serialization helpers for the generic PresetBar                     */
/* ------------------------------------------------------------------ */

function cloneGraphFilters(f: GraphFilters): GraphFilters {
  return {
    ...f,
    eventFilters: new Map(f.eventFilters),
    machineFilters: new Map(f.machineFilters),
    userFilters: new Map(f.userFilters),
    logonTypeFilters: new Map(f.logonTypeFilters),
    ipFilters: new Map(f.ipFilters),
    authPackageFilters: new Map(f.authPackageFilters),
    processFilters: new Map(f.processFilters),
    failureStatusFilters: new Map(f.failureStatusFilters),
    severityFilter: new Set(f.severityFilter),
  };
}

function buildExport(filters: GraphFilters, label?: string): FilterExport {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    label,
    filters: serializeFilters(filters),
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  filters: GraphFilters;
  onFiltersChange: (f: GraphFilters) => void;
}

export default function PresetBar({ filters, onFiltersChange }: Props) {
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [feedback]);

  /* ---- Import / Export ---- */
  const handleExportJSON = () => {
    const data = buildExport(filters);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `winstride-filters-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    try {
      const data = buildExport(filters);
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setFeedback({ type: 'ok', msg: 'Copied!' });
    } catch {
      setFeedback({ type: 'err', msg: 'Copy failed' });
    }
  };

  const importFromJSON = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      if (!validateFilterExport(parsed)) {
        setFeedback({ type: 'err', msg: 'Invalid filter file' });
        return;
      }
      onFiltersChange(deserializeFilters(parsed.filters));
      setFeedback({ type: 'ok', msg: 'Imported!' });
    } catch {
      setFeedback({ type: 'err', msg: 'Invalid JSON' });
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importFromJSON(reader.result as string);
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      importFromJSON(text);
    } catch {
      setFeedback({ type: 'err', msg: 'Paste failed' });
    }
  };

  const btnClass =
    'px-2 py-0.5 text-[11px] rounded border border-[#30363d] text-gray-400 hover:text-gray-200 hover:border-[#3d444d] hover:bg-[#1c2128] transition-all';

  return (
    <div className="space-y-2">
      {/* Generic preset buttons + save/custom */}
      <GenericPresetBar
        filters={filters}
        onFiltersChange={onFiltersChange}
        builtinPresets={BUILTIN_PRESETS}
        serialize={(f) => serializeFilters(f)}
        deserialize={(s) => deserializeFilters(s as ReturnType<typeof serializeFilters>)}
        cloneFilters={cloneGraphFilters}
        storageKey="winstride:graphFilterPresets"
      />

      {/* Import / Export (security-specific) */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#21262d]">
        <button onClick={handleExportJSON} className={btnClass}>Export JSON</button>
        <button onClick={handleCopy} className={btnClass}>Copy</button>
        <button onClick={() => fileInputRef.current?.click()} className={btnClass}>Import JSON</button>
        <button onClick={handlePaste} className={btnClass}>Paste</button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImportFile}
          className="hidden"
        />
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`text-[11px] ${feedback.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
          {feedback.msg}
        </div>
      )}
    </div>
  );
}
