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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${API_BASE}/Event${buildQuery(params)}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const json = await res.json();
    return {
      events: json.value ?? json,
      totalCount: json['@odata.count'] ?? null,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out — is the backend running?');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchHealthCheck() {
  const res = await fetch(`${API_BASE}/Event/health`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
