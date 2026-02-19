import { useState, useEffect, useRef, useCallback } from 'react';
import type { GraphFilters } from './GraphFilterPanel';
import { serializeFilters, validateFilterExport, deserializeFilters, type FilterExport } from './filterSerializer';
import {
  BUILTIN_PRESETS,
  loadCustomPresets,
  saveCustomPreset,
  deleteCustomPreset,
  applyPreset as resolvePreset,
  type FilterPreset,
} from './filterPresets';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function filtersMatch(a: GraphFilters, b: GraphFilters): boolean {
  const sa = serializeFilters(a);
  const sb = serializeFilters(b);
  return JSON.stringify(sa) === JSON.stringify(sb);
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
  const [customPresets, setCustomPresets] = useState<FilterPreset[]>(() => loadCustomPresets());
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);

  // Auto-clear feedback
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [feedback]);

  // Focus name input when save mode activates
  useEffect(() => {
    if (saving) saveInputRef.current?.focus();
  }, [saving]);

  const refreshCustom = useCallback(() => setCustomPresets(loadCustomPresets()), []);

  /* ---- Active preset detection ---- */
  const allPresets = [...BUILTIN_PRESETS, ...customPresets];
  const activeId = allPresets.find((p) => filtersMatch(p.filters, filters))?.id ?? null;

  /* ---- Preset actions ---- */
  const applyPresetFn = (p: FilterPreset) => {
    onFiltersChange(resolvePreset(p));
  };

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    saveCustomPreset(name, filters);
    refreshCustom();
    setSaving(false);
    setSaveName('');
    setFeedback({ type: 'ok', msg: 'Saved!' });
  };

  const handleDelete = (id: string) => {
    deleteCustomPreset(id);
    refreshCustom();
  };

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

  /* ---- Render ---- */
  const btnClass =
    'px-2 py-0.5 text-[11px] rounded border border-[#30363d] text-gray-400 hover:text-gray-200 hover:border-[#3d444d] hover:bg-[#1c2128] transition-all';
  const activeBtnClass =
    'px-2 py-0.5 text-[11px] rounded border border-[#58a6ff]/50 text-[#58a6ff] bg-[#58a6ff]/10';

  return (
    <div className="space-y-2">
      {/* Built-in */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Built-in</div>
        <div className="flex flex-wrap gap-1">
          {BUILTIN_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPresetFn(p)}
              className={activeId === p.id ? activeBtnClass : btnClass}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Custom */}
      {customPresets.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Custom</div>
          <div className="flex flex-wrap gap-1">
            {customPresets.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-0.5">
                <button
                  onClick={() => applyPresetFn(p)}
                  className={activeId === p.id ? activeBtnClass : btnClass}
                >
                  {p.name}
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="text-[10px] text-gray-600 hover:text-red-400 transition-colors px-0.5"
                  title="Delete preset"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Save current */}
      {saving ? (
        <div className="flex items-center gap-1.5">
          <input
            ref={saveInputRef}
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setSaving(false); }}
            placeholder="Preset name"
            className="flex-1 min-w-0 px-2 py-0.5 text-[12px] bg-[#0d1117] border border-[#30363d] rounded text-gray-300 placeholder-gray-600 outline-none focus:border-[#58a6ff]/60 transition-colors"
          />
          <button onClick={handleSave} className={btnClass}>Save</button>
          <button onClick={() => { setSaving(false); setSaveName(''); }} className={btnClass}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setSaving(true)} className={btnClass}>
          Save Current...
        </button>
      )}

      {/* Import / Export */}
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
