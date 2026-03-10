import { useState, useEffect, useRef, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Preset<T> {
  id: string;
  name: string;
  builtin: boolean;
  filters: T;
}

interface StoredPreset {
  id: string;
  name: string;
  builtin: false;
  filters: unknown;
}

export interface PresetBarProps<T> {
  filters: T;
  onFiltersChange: (f: T) => void;
  builtinPresets: Preset<T>[];
  /** Serialize filters to a JSON-safe object for comparison & storage */
  serialize: (f: T) => unknown;
  /** Deserialize stored filters back to runtime form */
  deserialize: (s: unknown) => T;
  /** Deep-clone filters (needed because Maps aren't spread-cloned) */
  cloneFilters: (f: T) => T;
  /** localStorage key for custom presets */
  storageKey: string;
}

/* ------------------------------------------------------------------ */
/*  Custom preset CRUD                                                 */
/* ------------------------------------------------------------------ */

function loadRaw(key: string): StoredPreset[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveRaw(key: string, presets: StoredPreset[]): void {
  try { localStorage.setItem(key, JSON.stringify(presets)); } catch { /* quota */ }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PresetBar<T>({
  filters,
  onFiltersChange,
  builtinPresets,
  serialize,
  deserialize,
  cloneFilters,
  storageKey,
}: PresetBarProps<T>) {
  const [customPresets, setCustomPresets] = useState<Preset<T>[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const saveInputRef = useRef<HTMLInputElement>(null);

  // Load custom presets on mount
  const refresh = useCallback(() => {
    const raw = loadRaw(storageKey);
    setCustomPresets(raw.map((p) => ({
      id: p.id,
      name: p.name,
      builtin: false as const,
      filters: deserialize(p.filters),
    })));
  }, [storageKey, deserialize]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (saving) saveInputRef.current?.focus(); }, [saving]);

  /* ---- Active preset detection ---- */
  const currentJson = JSON.stringify(serialize(filters));
  const allPresets = [...builtinPresets, ...customPresets];
  const activeId = allPresets.find((p) => JSON.stringify(serialize(p.filters)) === currentJson)?.id ?? null;

  /* ---- Actions ---- */
  const apply = (p: Preset<T>) => onFiltersChange(cloneFilters(p.filters));

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    const raw = loadRaw(storageKey);
    raw.push({ id: `custom:${Date.now()}`, name, builtin: false, filters: serialize(filters) });
    saveRaw(storageKey, raw);
    refresh();
    setSaving(false);
    setSaveName('');
  };

  const handleDelete = (id: string) => {
    saveRaw(storageKey, loadRaw(storageKey).filter((p) => p.id !== id));
    refresh();
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
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Presets</div>
        <div className="flex flex-wrap gap-1">
          {builtinPresets.map((p) => (
            <button key={p.id} onClick={() => apply(p)} className={activeId === p.id ? activeBtnClass : btnClass}>
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
                <button onClick={() => apply(p)} className={activeId === p.id ? activeBtnClass : btnClass}>
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
    </div>
  );
}
