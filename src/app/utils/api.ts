const TOKEN_KEY = 'utir_auth_token';

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
  const res = await fetch(url, {
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
  patch: <T>(u: string, b?: any) => request<T>('PATCH', u, b),
  delete: <T>(u: string) => request<T>('DELETE', u),
};
