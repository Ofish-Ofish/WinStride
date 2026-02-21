import type { Core } from 'cytoscape';

export interface SelectedElement {
  type: 'node' | 'edge';
  data: Record<string, unknown>;
}

export interface UseCytoscapeOptions {
  styles: unknown[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layout: { name: string; padding?: number; [k: string]: any };
  minZoom?: number;
  maxZoom?: number;
  wheelSensitivity?: number;
  /** Re-run layout on every data update (sysmon) vs only first load (security) */
  relayoutOnDataChange?: boolean;
  /** Called before layout.run() during resetLayout — e.g. pre-seed positions */
  preLayout?: (cy: Core) => void;
  /** Called after layout stops, before fit */
  postLayout?: (cy: Core) => void;
}
