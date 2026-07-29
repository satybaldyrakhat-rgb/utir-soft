// ─── Webhook'и провайдеров (без authMiddleware, с проверкой подписи) ───
// Монтируется ДО express.json(): app.use('/api/billing/webhook', createBillingWebhookRouter(db))
// Нужен сырой body для подписи → внутри роутов свой raw-парсер.
import { Router, raw } from 'express';
import type Database from 'better-sqlite3';
import { cpVerifyHmac } from './cloudpayments.js';
import { fpVerify } from './freedompay.js';
import { activateSubscription, recordPayment, paymentAlreadyProcessed } from './billingCore.js';
import { isPeriod, type Period } from './billing.js';

export function createBillingWebhookRouter(db: Database.Database) {
  const r = Router();
  const cpSecret = process.env.CLOUDPAYMENTS_API_SECRET || '';
  const fpSecret = process.env.FREEDOMPAY_SECRET_KEY || '';

  // ── CloudPayments (Pay / Fail / Recurrent) ──────────────────────────
  // application/x-www-form-urlencoded, подпись в заголовке Content-HMAC.
  r.post(['/cloudpayments', '/cloudpayments-recurrent'], raw({ type: '*/*' }), (req: any, res) => {
    const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const signature = req.get('Content-HMAC') || req.get('X-Content-HMAC') || '';
    if (!cpVerifyHmac(rawBody, signature, cpSecret)) {
      return res.json({ code: 13 }); // 13 = не принято (неверная подпись)
    }

    const params = new URLSearchParams(rawBody.toString('utf8'));
    const invoiceId = params.get('InvoiceId') || '';
    const teamId = params.get('AccountId') || '';   // мы передали teamId в accountId
    const transactionId = params.get('TransactionId') || '';
    const amount = Math.round(Number(params.get('Amount') || 0));
    const token = params.get('Token') || '';
    const subscriptionId = params.get('SubscriptionId') || '';
    const status = params.get('Status') || '';
    const isRecurrent = String(req.path).includes('recurrent');

    if (!teamId) return res.json({ code: 0 });
    if (transactionId && paymentAlreadyProcessed(db, transactionId)) return res.json({ code: 0 });

    const inv = invoiceId ? db.prepare('SELECT * FROM billing_invoices WHERE id = ?').get(invoiceId) as any : null;
    const period: Period = isPeriod(inv?.period) ? inv.period : 'monthly';
    const plan = inv?.plan || 'basic';

    const success = status === 'Completed' || status === 'Authorized';
    if (success) {
      activateSubscription(db, {
        teamId, plan, period, amount, provider: 'cloudpayments',
        transactionId, invoiceId, kind: isRecurrent ? 'recurrent' : 'payment',
        token, subscriptionId, raw: rawBody.toString('utf8'),
      });
    } else {
      recordPayment(db, { transactionId, invoiceId, teamId, provider: 'cloudpayments', amount, status: 'failed', raw: rawBody.toString('utf8') });
      if (invoiceId) db.prepare(`UPDATE billing_invoices SET status='failed' WHERE id=?`).run(invoiceId);
    }
    res.json({ code: 0 });
  });

  // ── FreedomPay result-callback ──────────────────────────────────────
  r.post('/freedompay', raw({ type: '*/*' }), (req: any, res) => {
    const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const p = new URLSearchParams(rawBody.toString('utf8'));
    const params: Record<string, string> = {};
    p.forEach((v, k) => { params[k] = v; });

    // scriptName для проверки = последний сегмент result_url ('freedompay').
    if (!fpVerify('freedompay', params, fpSecret)) {
      return res.status(200).type('application/xml')
        .send('<?xml version="1.0" encoding="utf-8"?><response><pg_status>error</pg_status><pg_description>bad signature</pg_description></response>');
    }

    const invoiceId = params['pg_order_id'] || '';
    const transactionId = params['pg_payment_id'] || invoiceId;
    const resultOk = params['pg_result'] === '1';
    const inv = invoiceId ? db.prepare('SELECT * FROM billing_invoices WHERE id = ?').get(invoiceId) as any : null;
    const teamId = inv?.team_id || '';
    const amount = Math.round(Number(params['pg_amount'] || inv?.amount || 0));
    const period: Period = isPeriod(inv?.period) ? inv.period : 'monthly';
    const plan = inv?.plan || 'basic';

    if (teamId && !(transactionId && paymentAlreadyProcessed(db, transactionId))) {
      if (resultOk) {
        activateSubscription(db, { teamId, plan, period, amount, provider: 'freedompay', transactionId, invoiceId, raw: rawBody.toString('utf8') });
      } else {
        recordPayment(db, { transactionId, invoiceId, teamId, provider: 'freedompay', amount, status: 'failed', raw: rawBody.toString('utf8') });
        if (invoiceId) db.prepare(`UPDATE billing_invoices SET status='failed' WHERE id=?`).run(invoiceId);
      }
    }
    // FreedomPay ждёт XML-ответ со статусом ok.
    res.status(200).type('application/xml')
      .send('<?xml version="1.0" encoding="utf-8"?><response><pg_status>ok</pg_status><pg_description>accepted</pg_description></response>');
  });

  return r;
}
