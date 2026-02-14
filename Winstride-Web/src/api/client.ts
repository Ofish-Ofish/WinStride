const API_BASE = '/api';

export async function fetchEvents(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(`${API_BASE}/Event${query}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchHealthCheck() {
  const res = await fetch(`${API_BASE}/Event/health`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
