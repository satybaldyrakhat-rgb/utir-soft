// ─── FreedomPay: инициация платежа + подпись pg_sig ────────────────────
// Схема (docs.freedompay.kz → Merchant API → Purchase → Create payment):
// сервер зовёт POST https://api.freedompay.kz/init_payment, получает
// pg_redirect_url, фронт перенаправляет туда. После оплаты FreedomPay шлёт
// result-callback на наш webhook (проверяем pg_sig той же схемой).
import crypto from 'node:crypto';

const API_BASE = (process.env.FREEDOMPAY_API_BASE || 'https://api.freedompay.kz').replace(/\/$/, '');
// Путь метода. В документации — /init_payment (без .php, как было в старом
// PayBox). Имя скрипта участвует ещё и в подписи, поэтому держим их вместе.
const INIT_PATH = (process.env.FREEDOMPAY_INIT_PATH || '/init_payment').replace(/^\/?/, '/');
const INIT_SCRIPT = INIT_PATH.replace(/^\//, '');

function md5(s: string): string { return crypto.createHash('md5').update(s, 'utf8').digest('hex'); }

// Подпись: md5( имя_скрипта ; значения_параметров_по_алфавиту_ключей ; secret ).
// Имя скрипта для init берём из INIT_SCRIPT ('init_payment'); для
// result-callback это последний сегмент нашего result_url ('freedompay').
// ВНИМАНИЕ: алгоритм взят из классической спецификации PayBox и НЕ сверен
// со страницей про подпись в docs.freedompay.kz — при первом живом тесте
// проверить в первую очередь именно его.
export function fpSign(scriptName: string, params: Record<string, string>, secret: string): string {
  const keys = Object.keys(params).filter(k => k !== 'pg_sig').sort();
  const parts = [scriptName, ...keys.map(k => params[k]), secret];
  return md5(parts.join(';'));
}

export function fpVerify(scriptName: string, params: Record<string, string>, secret: string): boolean {
  const sig = params['pg_sig'] || '';
  if (!secret || !sig) return false;
  try {
    const expected = fpSign(scriptName, params, secret);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

function decodeXmlEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'");
}

export interface FpInitOpts {
  merchantId: string; secret: string; amount: number; orderId: string;
  description: string; resultUrl: string; successUrl: string; failureUrl: string; testing: boolean;
  language?: 'ru' | 'en' | 'kk';   // язык страницы оплаты (ISO 639-1)
  // Автопродление: создаёт рекуррентный профиль на первом платеже.
  // Работает только если провайдер включил рекурренты по договору —
  // pg_recurring_profile_id придёт в result-callback.
  recurring?: boolean;
  recurringMonths?: number;        // 1..12
}

// Инициировать платёж. Возвращает URL, на который надо перенаправить клиента.
export async function fpInitPayment(o: FpInitOpts): Promise<{ ok: boolean; redirectUrl?: string; error?: string }> {
  const params: Record<string, string> = {
    pg_merchant_id: o.merchantId,
    pg_amount: String(o.amount),
    pg_currency: 'KZT',
    // В документации ограничение 1024 символа — обрезаем, чтобы запрос
    // не отвалился на длинном названии тарифа.
    pg_description: o.description.slice(0, 1024),
    pg_order_id: o.orderId,
    pg_salt: crypto.randomBytes(8).toString('hex'),
    pg_result_url: o.resultUrl,
    pg_success_url: o.successUrl,
    pg_failure_url: o.failureUrl,
    // Как FreedomPay вызывает наши скрипты (result/check URL). Наш вебхук
    // разбирает form-urlencoded, поэтому POST.
    pg_request_method: 'POST',
    // А вот пользователя обратно возвращаем ТОЛЬКО через GET: фронтенд —
    // статика на Vercel, POST на неё просто не отработает.
    pg_success_url_method: 'GET',
    pg_failure_url_method: 'GET',
    // Защита от двойного списания: при повторе запроса (обрыв связи,
    // ретрай) FreedomPay вернёт тот же платёж, а не создаст новый.
    pg_idempotency_key: o.orderId,
    // kk — казахский в их списке языков страницы оплаты.
    pg_language: o.language || 'ru',
  };
  if (o.testing) params.pg_testing_mode = '1';
  if (o.recurring) {
    params.pg_recurring_start = '1';
    params.pg_recurring_lifetime = String(Math.min(12, Math.max(1, o.recurringMonths || 12)));
  }
  params.pg_sig = fpSign(INIT_SCRIPT, params, o.secret);

  try {
    const res = await fetch(`${API_BASE}${INIT_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const xml = await res.text();
    const status = (xml.match(/<pg_status>([^<]+)<\/pg_status>/)?.[1] || '').trim();
    const redirect = xml.match(/<pg_redirect_url>([^<]+)<\/pg_redirect_url>/)?.[1];
    if (status === 'ok' && redirect) return { ok: true, redirectUrl: decodeXmlEntities(redirect) };
    const err = xml.match(/<pg_error_description>([^<]+)<\/pg_error_description>/)?.[1];
    return { ok: false, error: err || 'freedompay init failed' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'freedompay network error' };
  }
}
