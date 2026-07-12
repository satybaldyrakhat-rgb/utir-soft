// ─── Meta Conversions API (CAPI) sender ──────────────────────────────
// Отправляет серверные события из CRM в Meta (Pixel/Dataset), чтобы Meta
// оптимизировала рекламу на реальные оплаты, а не на заявки. Персональные
// данные (email/телефон/город/имя) хешируются SHA-256 по правилам Meta;
// fbp/fbc/ip/user-agent передаются как есть (Meta так требует).
import { createHash } from 'crypto';

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

export interface CapiConfig {
  pixelId: string;        // он же Dataset ID
  capiToken: string;      // Access token из Events Manager → Settings
  testEventCode?: string; // TESTxxxxx — чтобы видеть события во вкладке Test Events
}

export function metaCapiConfigured(cfg?: Partial<CapiConfig> | null): cfg is CapiConfig {
  return !!(cfg && cfg.pixelId && cfg.capiToken);
}

// SHA-256 hex от нормализованного значения (Meta требует нижний регистр + trim).
function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}
function normEmail(v: string): string { return String(v || '').trim().toLowerCase(); }
function normText(v: string): string { return String(v || '').trim().toLowerCase().replace(/\s+/g, ' '); }
// Телефон — только цифры (с кодом страны). Казахстанские 8XXX → 7XXX.
function normPhone(v: string): string {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  return d;
}

export interface CapiUserInput {
  email?: string; phone?: string; firstName?: string; lastName?: string;
  city?: string; externalId?: string;   // CRM id клиента/сделки
  fbp?: string; fbc?: string;            // из cookie / fbclid лендинга (НЕ хешируются)
  clientIp?: string; userAgent?: string;
}

// Собирает user_data + считает, сколько параметров передано (для оценки EMQ).
export function buildUserData(u: CapiUserInput): { userData: Record<string, any>; paramCount: number } {
  const ud: Record<string, any> = {};
  let n = 0;
  if (u.email) { ud.em = [sha256(normEmail(u.email))]; n++; }
  if (u.phone && normPhone(u.phone)) { ud.ph = [sha256(normPhone(u.phone))]; n++; }
  if (u.firstName) { ud.fn = [sha256(normText(u.firstName))]; n++; }
  if (u.lastName) { ud.ln = [sha256(normText(u.lastName))]; n++; }
  if (u.city) { ud.ct = [sha256(normText(u.city))]; n++; }
  if (u.externalId) { ud.external_id = [sha256(String(u.externalId))]; n++; }
  if (u.fbp) { ud.fbp = u.fbp; n++; }
  if (u.fbc) { ud.fbc = u.fbc; n++; }
  if (u.clientIp) { ud.client_ip_address = u.clientIp; n++; }
  if (u.userAgent) { ud.client_user_agent = u.userAgent; n++; }
  return { userData: ud, paramCount: n };
}

export interface CapiEvent {
  eventName: string;                 // Lead / Purchase / CustomizeProduct / ...
  eventTime?: number;                // unix seconds (по умолчанию — сейчас)
  eventId?: string;                  // для дедупликации с пикселем
  actionSource?: 'website' | 'system_generated' | 'phone_call' | 'chat' | 'other';
  eventSourceUrl?: string;
  user: CapiUserInput;
  value?: number; currency?: string;
  customData?: Record<string, any>;
}

export interface CapiResult {
  ok: boolean;
  paramCount: number;
  eventsReceived?: number;
  fbtraceId?: string;
  error?: string;
}

// Отправляет одно событие в Meta CAPI. Возвращает результат (для лога/дашборда).
export async function sendCapiEvent(cfg: CapiConfig, ev: CapiEvent, nowSeconds: number): Promise<CapiResult> {
  const { userData, paramCount } = buildUserData(ev.user);
  const dataEntry: Record<string, any> = {
    event_name: ev.eventName,
    event_time: ev.eventTime || nowSeconds,
    action_source: ev.actionSource || 'system_generated',
    user_data: userData,
  };
  if (ev.eventId) dataEntry.event_id = ev.eventId;
  if (ev.eventSourceUrl) dataEntry.event_source_url = ev.eventSourceUrl;
  const custom: Record<string, any> = { ...(ev.customData || {}) };
  if (typeof ev.value === 'number') custom.value = ev.value;
  if (ev.currency) custom.currency = ev.currency;
  if (Object.keys(custom).length) dataEntry.custom_data = custom;

  const body: Record<string, any> = { data: [dataEntry] };
  if (cfg.testEventCode) body.test_event_code = cfg.testEventCode;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(cfg.pixelId)}/events?access_token=${encodeURIComponent(cfg.capiToken)}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok || json?.error) {
      return { ok: false, paramCount, error: json?.error?.message || `HTTP ${resp.status}`, fbtraceId: json?.error?.fbtrace_id };
    }
    return { ok: true, paramCount, eventsReceived: json?.events_received, fbtraceId: json?.fbtrace_id };
  } catch (e: any) {
    return { ok: false, paramCount, error: String(e?.message || e) };
  }
}
