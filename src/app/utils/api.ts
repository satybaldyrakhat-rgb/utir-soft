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

// Per-call options. `timeoutMs` aborts a hung request instead of leaving the
// user staring at a spinner; `retries` re-sends ONLY on transient network
// failures (dropped connection / timeout) — never on an HTTP error response,
// so we never double-submit a request the server actually processed.
export interface RequestOpts { timeoutMs?: number; retries?: number }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// A thrown Error with this name means "connection never completed" — the
// caller can show a friendly «связь прервалась» message and it's safe to retry.
export class NetworkError extends Error {
  constructor(msg = 'network') { super(msg); this.name = 'NetworkError'; }
}

async function request<T>(method: string, url: string, body?: any, opts?: RequestOpts): Promise<T> {
  const token = getToken();
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const timeoutMs = opts?.timeoutMs ?? 120_000;   // 2-минутный потолок против зависания
  const retries = Math.max(0, opts?.retries ?? 0);

  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(fullUrl, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        // Сервер ОТВЕТИЛ (пусть и ошибкой) — это не сетевой сбой, не повторяем.
        let msg = `${res.status}`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
        if (res.status === 403 && msg === 'account disabled') {
          try {
            localStorage.removeItem(TOKEN_KEY);
            window.dispatchEvent(new Event('utir:auth-changed'));
          } catch { /* ignore */ }
        }
        throw new Error(msg);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (e: any) {
      clearTimeout(timer);
      // Сетевой сбой = fetch бросил TypeError («Load failed») или сработал abort
      // по таймауту. Только такие ошибки повторяем.
      const isNetwork = e?.name === 'AbortError' || e instanceof TypeError;
      if (isNetwork && attempt < retries) {
        await sleep(400 * (attempt + 1));   // короткий backoff: 400мс, 800мс…
        continue;
      }
      if (isNetwork) throw new NetworkError();
      throw e;
    }
  }
}

export const api = {
  get: <T>(u: string, o?: RequestOpts) => request<T>('GET', u, undefined, o),
  post: <T>(u: string, b?: any, o?: RequestOpts) => request<T>('POST', u, b, o),
  put: <T>(u: string, b?: any, o?: RequestOpts) => request<T>('PUT', u, b, o),
  patch: <T>(u: string, b?: any, o?: RequestOpts) => request<T>('PATCH', u, b, o),
  delete: <T>(u: string, o?: RequestOpts) => request<T>('DELETE', u, undefined, o),
};
