const API_BASE = '/api';

export async function fetchEvents(params?: Record<string, string>) {
  let query = '';
  if (params) {
    // Manual encoding — only encode spaces. URLSearchParams over-encodes
    // OData chars ($, quotes, parens) which breaks the Vite dev proxy.
    query = '?' + Object.entries(params)
      .map(([k, v]) => `${k}=${v.replace(/ /g, '%20').replace(/\+/g, '%2B')}`)
      .join('&');
  }
  const res = await fetch(`${API_BASE}/Event${query}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return json.value ?? json;
}

export async function fetchHealthCheck() {
  const res = await fetch(`${API_BASE}/Event/health`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
