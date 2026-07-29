// ─── FreedomPay (PayBox): инициация платежа + подпись pg_sig ───────────
// FreedomPay работает через редирект: сервер зовёт init_payment.php, получает
// pg_redirect_url, фронт перенаправляет туда. После оплаты FreedomPay шлёт
// result-callback на наш webhook (проверяем pg_sig той же схемой).
import crypto from 'node:crypto';

const API_BASE = (process.env.FREEDOMPAY_API_BASE || 'https://api.freedompay.kz').replace(/\/$/, '');

function md5(s: string): string { return crypto.createHash('md5').update(s, 'utf8').digest('hex'); }

// Подпись PayBox: md5( scriptName ; значения_параметров_по_алфавиту_ключей ; secret ).
// scriptName для init = 'init_payment.php'; для result-callback = последний
// сегмент нашего result_url ('freedompay').
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
}

// Инициировать платёж. Возвращает URL, на который надо перенаправить клиента.
export async function fpInitPayment(o: FpInitOpts): Promise<{ ok: boolean; redirectUrl?: string; error?: string }> {
  const params: Record<string, string> = {
    pg_merchant_id: o.merchantId,
    pg_amount: String(o.amount),
    pg_currency: 'KZT',
    pg_description: o.description,
    pg_order_id: o.orderId,
    pg_salt: crypto.randomBytes(8).toString('hex'),
    pg_result_url: o.resultUrl,
    pg_success_url: o.successUrl,
    pg_failure_url: o.failureUrl,
    pg_request_method: 'POST',
  };
  if (o.testing) params.pg_testing_mode = '1';
  params.pg_sig = fpSign('init_payment.php', params, o.secret);

  try {
    const res = await fetch(`${API_BASE}/init_payment.php`, {
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
