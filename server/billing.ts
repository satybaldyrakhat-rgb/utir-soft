// ─── Каталог тарифов: цену считает СЕРВЕР ─────────────────────────────
// Фронт НЕ присылает сумму — только plan + period, а сумма считается здесь.
// Это защита: цену на клиенте можно подделать, серверу — нельзя.
// Держите цены синхронно с лендингом (src/app/landing/components/Pricing.tsx).

export type PlanId = 'basic' | 'pro' | 'enterprise';
export type Period = 'monthly' | 'semiannual' | 'annual';

// ₸, базовая цена за месяц (как на лендинге).
const MONTHLY: Record<PlanId, number> = {
  basic: 12900,
  pro: 34900,
  enterprise: 89900,
};

// Период: сколько месяцев + коэффициент скидки (годовой ~20% дешевле).
const PERIOD_MONTHS: Record<Period, number> = { monthly: 1, semiannual: 6, annual: 12 };
const PERIOD_DISCOUNT: Record<Period, number> = { monthly: 1, semiannual: 0.9, annual: 0.8 };

export function isPlanId(v: unknown): v is PlanId {
  return v === 'basic' || v === 'pro' || v === 'enterprise';
}
export function isPeriod(v: unknown): v is Period {
  return v === 'monthly' || v === 'semiannual' || v === 'annual';
}

// Возвращает полную сумму (₸ за период) по plan + period.
export function planAmount(plan: PlanId, period: Period): number {
  const base = MONTHLY[plan];
  if (!base) throw new Error('unknown plan');
  const months = PERIOD_MONTHS[period];
  return Math.round(base * months * PERIOD_DISCOUNT[period]);
}

// Сколько месяцев длится период (чтобы продлить подписку).
export function planMonths(period: Period): number {
  return PERIOD_MONTHS[period];
}

// Список тарифов со всеми ценами (отдаётся на фронт для страницы оплаты).
export function planCatalog() {
  const plans: PlanId[] = ['basic', 'pro', 'enterprise'];
  const periods: Period[] = ['monthly', 'semiannual', 'annual'];
  return plans.map(plan => ({
    plan,
    monthly: MONTHLY[plan],
    prices: Object.fromEntries(periods.map(p => [p, planAmount(plan, p)])) as Record<Period, number>,
  }));
}
