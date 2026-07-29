// ─── CloudPayments: проверка подписи webhook + отмена рекуррента ───────
import crypto from 'node:crypto';

const API_BASE = process.env.CLOUDPAYMENTS_API_BASE || 'https://api.cloudpayments.kz';

// Проверка HMAC-SHA256(base64) сырого тела webhook'а секретом (Content-HMAC).
export function cpVerifyHmac(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

// Отмена рекуррентной подписки (когда клиент выключил автопродление).
export async function cpCancelSubscription(subscriptionId: string): Promise<boolean> {
  const publicId = process.env.CLOUDPAYMENTS_PUBLIC_ID || '';
  const secret = process.env.CLOUDPAYMENTS_API_SECRET || '';
  if (!publicId || !secret || !subscriptionId) return false;
  try {
    const auth = Buffer.from(`${publicId}:${secret}`).toString('base64');
    const res = await fetch(`${API_BASE}/subscriptions/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({ Id: subscriptionId }),
    });
    const j: any = await res.json().catch(() => ({}));
    return !!j?.Success;
  } catch { return false; }
}
