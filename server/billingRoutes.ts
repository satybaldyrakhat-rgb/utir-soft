// ─── Биллинг-роутер (авторизованный) ──────────────────────────────────
// Монтируется как: app.use('/api/billing', authMiddleware, requireRole('admin'), createBillingRouter(db))
// req.teamId проставляет authMiddleware.
import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { planAmount, planCatalog, planMonths, isPlanId, isPeriod, type Period } from './billing.js';
import { getSubscription, setSubscription } from './ownerAdmin.js';
import { fpInitPayment } from './freedompay.js';
import { cpCancelSubscription } from './cloudpayments.js';

interface AuthedRequest extends Request { teamId?: string; userId?: string }

const periodLabel = (p: Period) => p === 'annual' ? 'год' : p === 'semiannual' ? 'полгода' : 'месяц';

export function createBillingRouter(db: Database.Database) {
  const r = Router();

  // Каталог тарифов с ценами (для страницы оплаты).
  r.get('/plans', (_req, res) => {
    res.json({
      plans: planCatalog(),
      providers: {
        cloudpayments: !!process.env.CLOUDPAYMENTS_PUBLIC_ID,
        freedompay: !!(process.env.FREEDOMPAY_MERCHANT_ID && process.env.FREEDOMPAY_SECRET_KEY),
        kaspi: false, // в разработке
      },
    });
  });

  // Создать намерение оплаты. Сумму считает СЕРВЕР (фронт её не присылает).
  r.post('/checkout', async (req: AuthedRequest, res) => {
    const teamId = req.teamId!;
    const plan = req.body?.plan;
    const period = req.body?.period ?? 'monthly';
    const provider = req.body?.provider ?? 'cloudpayments';

    if (!isPlanId(plan)) return res.status(400).json({ error: 'unknown_plan' });
    if (!isPeriod(period)) return res.status(400).json({ error: 'unknown_period' });

    if (provider === 'kaspi') {
      return res.status(501).json({ error: 'kaspi_soon', message: 'Оплата через Kaspi в разработке' });
    }
    if (provider !== 'cloudpayments' && provider !== 'freedompay') {
      return res.status(400).json({ error: 'unknown_provider' });
    }

    const amount = planAmount(plan, period);
    const invoiceId = crypto.randomUUID();
    db.prepare(`INSERT INTO billing_invoices (id, team_id, plan, period, amount, provider)
                VALUES (?, ?, ?, ?, ?, ?)`).run(invoiceId, teamId, plan, period, amount, provider);

    // ── CloudPayments: отдаём данные для виджета (publicId безопасен) ──
    if (provider === 'cloudpayments') {
      const publicId = process.env.CLOUDPAYMENTS_PUBLIC_ID || '';
      if (!publicId) return res.status(503).json({ error: 'cloudpayments_not_configured', message: 'CloudPayments не настроен' });
      return res.json({
        provider, invoiceId, amount, currency: 'KZT', publicId,
        description: `Utir Soft — тариф ${plan} (${periodLabel(period)})`,
        accountId: teamId,
        months: planMonths(period),
        testMode: !!process.env.CLOUDPAYMENTS_TEST_MODE,
      });
    }

    // ── FreedomPay: инициируем платёж, отдаём URL для редиректа ──
    const merchantId = process.env.FREEDOMPAY_MERCHANT_ID || '';
    const secret = process.env.FREEDOMPAY_SECRET_KEY || '';
    if (!merchantId || !secret) return res.status(503).json({ error: 'freedompay_not_configured', message: 'FreedomPay не настроен' });
    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
    const init = await fpInitPayment({
      merchantId, secret, amount, orderId: invoiceId,
      description: `Utir Soft подписка ${plan}`,
      resultUrl: `${appUrl}/api/billing/webhook/freedompay`,
      successUrl: `${appUrl}/#/billing/success`,
      failureUrl: `${appUrl}/#/billing/fail`,
      testing: !!process.env.FREEDOMPAY_TEST_MODE,
    });
    if (!init.ok) return res.status(502).json({ error: 'freedompay_init_failed', message: init.error });
    return res.json({ provider, invoiceId, amount, redirectUrl: init.redirectUrl });
  });

  // История платежей команды.
  r.get('/payments', (req: AuthedRequest, res) => {
    const rows = db.prepare(
      `SELECT id, amount, currency, status, kind, provider, created_at
         FROM billing_payments WHERE team_id = ? ORDER BY created_at DESC LIMIT 50`
    ).all(req.teamId!);
    res.json(rows);
  });

  // Переключить автопродление (off → отменяем рекуррент в CloudPayments).
  r.post('/auto-renew', async (req: AuthedRequest, res) => {
    const enabled = !!req.body?.enabled;
    const cur = getSubscription(db, req.teamId!);
    if (!enabled && cur.cpSubscriptionId) {
      try { await cpCancelSubscription(cur.cpSubscriptionId); } catch { /* best-effort */ }
    }
    setSubscription(db, req.teamId!, { autoRenew: enabled });
    res.json({ ok: true, autoRenew: enabled });
  });

  return r;
}
