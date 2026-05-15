const TOKEN_KEY = 'utir_auth_token';

// On Vercel set VITE_API_BASE_URL to the Railway URL (e.g. https://utir-soft-production.up.railway.app).
// In local dev leave empty — Vite proxies /api to localhost:4010.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

async function request<T>(method: string, url: string, body?: any): Promise<T> {
  const token = getToken();
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const res = await fetch(fullUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(u: string) => request<T>('GET', u),
  post: <T>(u: string, b?: any) => request<T>('POST', u, b),
  put: <T>(u: string, b?: any) => request<T>('PUT', u, b),
  patch: <T>(u: string, b?: any) => request<T>('PATCH', u, b),
  delete: <T>(u: string) => request<T>('DELETE', u),
};
