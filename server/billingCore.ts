// ─── Ядро биллинга: активация подписки после успешной оплаты ──────────
// Общий код для ВСЕХ провайдеров (CloudPayments, FreedomPay, ручная выдача).
// Именно здесь — и только здесь — подписка становится 'active'. Webhook'и
// провайдеров вызывают activateSubscription после проверки подписи.

import type Database from 'better-sqlite3';
import { setSubscription, getSubscription } from './ownerAdmin.js';
import { planMonths, type Period } from './billing.js';

function addMonths(d: Date, n: number): Date { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function genId(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export type Provider = 'cloudpayments' | 'freedompay' | 'manual';

export interface ActivateInput {
  teamId: string;
  plan: string;
  period: Period;
  amount: number;
  provider: Provider;
  transactionId: string;
  invoiceId?: string;
  kind?: 'payment' | 'recurrent' | 'refund';
  token?: string;                // токен карты (CloudPayments рекуррент)
  subscriptionId?: string;       // id рекуррентной подписки провайдера
  raw?: string;                  // сырой callback (для аудита)
}

// Идемпотентность: один и тот же TransactionId обрабатываем только раз.
export function paymentAlreadyProcessed(db: Database.Database, transactionId: string): boolean {
  if (!transactionId) return false;
  return !!db.prepare('SELECT 1 FROM billing_payments WHERE id = ?').get(transactionId);
}

// Записать платёж в историю (paid | failed | refunded). INSERT OR IGNORE —
// повторный webhook с тем же id ничего не сломает.
export function recordPayment(db: Database.Database, p: {
  transactionId: string; invoiceId?: string; teamId: string; provider: Provider;
  amount: number; status: 'paid' | 'failed' | 'refunded'; kind?: string; raw?: string;
}) {
  const id = p.transactionId || genId('pay_');
  db.prepare(
    `INSERT OR IGNORE INTO billing_payments
       (id, invoice_id, team_id, provider, amount, currency, status, kind, raw)
     VALUES (?, ?, ?, ?, ?, 'KZT', ?, ?, ?)`
  ).run(id, p.invoiceId || null, p.teamId, p.provider, p.amount, p.status, p.kind || 'payment', p.raw || null);
}

// Запись в ленту активности команды — чтобы владелец видел факт оплаты.
function logBillingActivity(db: Database.Database, teamId: string, text: string) {
  try {
    const id = genId('a_');
    const data = { id, timestamp: new Date().toISOString(), actor: 'system', type: 'billing', text };
    db.prepare('INSERT INTO activity_logs (id, user_id, team_id, data) VALUES (?, ?, ?, ?)')
      .run(id, teamId, teamId, JSON.stringify(data));
  } catch { /* лог активности не критичен */ }
}

// ГЛАВНАЯ функция: продлить/активировать подписку после успешной оплаты.
// Продлеваем от максимума (сейчас | конец текущей подписки), чтобы досрочная
// оплата не «съедала» остаток. Возвращает новую дату окончания (YYYY-MM-DD).
export function activateSubscription(db: Database.Database, inp: ActivateInput): string {
  const cur = getSubscription(db, inp.teamId);
  const from = new Date(Math.max(Date.now(), new Date(cur.expiresAt).getTime() || 0));
  const newExpires = ymd(addMonths(from, planMonths(inp.period)));

  setSubscription(db, inp.teamId, {
    status: 'active',
    plan: inp.plan || cur.plan,
    amount: inp.amount,
    currency: 'KZT',
    period: inp.period,
    expiresAt: newExpires,
    suspended: false,
    provider: inp.provider,
    autoRenew: inp.provider === 'cloudpayments' ? true : cur.autoRenew,
    cpToken: inp.token || cur.cpToken,
    cpSubscriptionId: inp.subscriptionId || cur.cpSubscriptionId,
    lastPaymentAt: new Date().toISOString(),
    lastInvoiceId: inp.invoiceId || cur.lastInvoiceId,
  });

  recordPayment(db, {
    transactionId: inp.transactionId,
    invoiceId: inp.invoiceId,
    teamId: inp.teamId,
    provider: inp.provider,
    amount: inp.amount,
    status: 'paid',
    kind: inp.kind || 'payment',
    raw: inp.raw,
  });

  if (inp.invoiceId) {
    db.prepare(`UPDATE billing_invoices SET status='paid', paid_at=datetime('now') WHERE id=?`).run(inp.invoiceId);
  }

  logBillingActivity(db, inp.teamId,
    `Оплата подписки принята: тариф «${inp.plan}», ${inp.amount.toLocaleString('ru-RU')} ₸ (${inp.provider}${inp.kind === 'recurrent' ? ', автопродление' : ''}).`);

  return newExpires;
}
