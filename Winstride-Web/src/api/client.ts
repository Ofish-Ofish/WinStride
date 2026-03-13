import type { WinEvent } from '../modules/security/shared/types';
import type { AutorunEntry } from '../modules/autoruns/shared/types';
import type { Heartbeat } from '../modules/heartbeats/shared/types';
import type { NetworkConnection } from '../modules/network/shared/types';
import type { WinProcess } from '../modules/processes/shared/types';
import { normalizeApiItems } from '../shared/time';

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
    const res = await fetch(`${API_BASE}/Event${buildQuery(params)}`, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const json = await res.json();
    const events = normalizeApiItems<WinEvent>(json.value ?? json);
    return {
      events,
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

/* ------------------------------------------------------------------ */
/*  OData generic fetch (for non-event entities)                       */
/* ------------------------------------------------------------------ */

async function fetchOData<T>(url: string, params?: Record<string, string>): Promise<{ items: T[]; totalCount: number | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${url}${buildQuery(params)}`, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const json = await res.json();
    const items = normalizeApiItems<T>(json.value ?? json);
    return {
      items,
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

export function fetchAutoruns(params?: Record<string, string>) {
  return fetchOData<AutorunEntry>('/odata/WinAutoruns', { $count: 'true', $orderby: 'timeSynced desc', ...params });
}

export function fetchHeartbeats(params?: Record<string, string>) {
  return fetchOData<Heartbeat>('/api/Heartbeat', { $count: 'true', $orderby: 'lastSeen desc', ...params });
}

export function fetchNetworkConnections(params?: Record<string, string>) {
  return fetchOData<NetworkConnection>('/odata/NetworkConnections', { $count: 'true', $orderby: 'timeCreated desc', ...params });
}

export function fetchProcesses(params?: Record<string, string>) {
  return fetchOData<WinProcess>('/odata/WinProcesses', { $count: 'true', $orderby: 'imageName asc', ...params });
}
