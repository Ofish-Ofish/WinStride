import type { WinEvent } from '../modules/security/shared/types';

const API_BASE = '/api';

export interface PagedResponse {
  events: WinEvent[];
  totalCount: number | null;
}

function buildQuery(params?: Record<string, string>): string {
  if (!params) return '';
  // Manual encoding — only encode spaces. URLSearchParams over-encodes
  // OData chars ($, quotes, parens) which breaks the Vite dev proxy.
  return '?' + Object.entries(params)
    .map(([k, v]) => `${k}=${v.replace(/ /g, '%20').replace(/\+/g, '%2B')}`)
    .join('&');
}

export async function fetchEventsPaged(params?: Record<string, string>): Promise<PagedResponse> {
  const res = await fetch(`${API_BASE}/Event${buildQuery(params)}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return {
    events: json.value ?? json,
    totalCount: json['@odata.count'] ?? null,
  };
}

export async function fetchHealthCheck() {
  const res = await fetch(`${API_BASE}/Event/health`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
