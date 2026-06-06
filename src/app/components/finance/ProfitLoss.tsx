import { useMemo, useState } from 'react';
import { useDataStore } from '../../utils/dataStore';
import { getNiche } from '../../utils/niches';

const fmt = (n: number) => Math.abs(Math.round(n)).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';
const fmtM = (n: number) => `${(n / 1_000_000).toFixed(1)}М ₸`;

type PeriodKey = 'month' | 'quarter' | 'year' | 'all';

// Material expense categories — used as a FALLBACK for COGS when a deal
// has no per-order consumed materials yet. Niche material categories are
// merged in so a windows/doors team isn't judged by furniture words.
const BASE_MATERIAL_CATS = ['Материалы', 'Фурнитура', 'Комплектующие'];

export function ProfitLoss() {
  const store = useDataStore();
  const niche = getNiche(store.niche);
  const [period, setPeriod] = useState<PeriodKey>('month');

  // Period window [from, to). 'all' → no filter.
  const range = useMemo<[number, number] | null>(() => {
    if (period === 'all') return null;
    const now = new Date();
    const start = new Date(now);
    if (period === 'month') start.setMonth(now.getMonth() - 1);
    if (period === 'quarter') start.setMonth(now.getMonth() - 3);
    if (period === 'year') start.setFullYear(now.getFullYear() - 1);
    start.setHours(0, 0, 0, 0);
    return [start.getTime(), now.getTime() + 86400000];
  }, [period]);
  const inRange = (iso?: string) => {
    if (!range) return true;
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return !isNaN(t) && t >= range[0] && t < range[1];
  };

  // Material category set (niche-aware) for the fallback COGS path.
  const materialCats = useMemo(
    () => new Set<string>([...BASE_MATERIAL_CATS, ...niche.materialCategories]),
    [niche],
  );

  const txs = store.transactions.filter(t => t.status === 'completed' && inRange(t.date));
  const revenue = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  // ── COGS: prefer REAL consumed materials from completed deals in the
  //    period; fall back to material-category expenses for legacy data. ──
  const completedDeals = store.deals.filter(d => d.status === 'completed'
    && inRange(d.installationDate || (d as any).date || d.createdAt));
  const consumedCogs = completedDeals.reduce((s, d) => {
    const c = (d as any).consumed as Array<{ qty: number; costPerUnit: number }> | undefined;
    if (!Array.isArray(c)) return s;
    return s + c.reduce((cs, x) => cs + (Number(x.qty) || 0) * (Number(x.costPerUnit) || 0), 0);
  }, 0);
  const materialExpenses = txs.filter(t => t.type === 'expense' && materialCats.has(t.category)).reduce((s, t) => s + t.amount, 0);
  // Real consumed wins when present; otherwise material expenses.
  const cogs = consumedCogs > 0 ? consumedCogs : materialExpenses;

  // Operating expenses (everything that isn't COGS materials).
  const exGroup = (cats: string[]) => txs.filter(t => t.type === 'expense' && cats.includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const salaries = exGroup(['Зарплата']);
  const rent = exGroup(['Аренда']);
  const marketing = exGroup(['Маркетинг']);
  const taxes = exGroup(['Налоги']);
  // "Прочие" = expenses that are neither materials, nor the named opex above.
  const namedOpex = new Set(['Зарплата', 'Аренда', 'Маркетинг', 'Налоги']);
  const exOther = txs.filter(t => t.type === 'expense' && !materialCats.has(t.category) && !namedOpex.has(t.category)).reduce((s, t) => s + t.amount, 0);

  const grossProfit = revenue - cogs;
  const grossMargin = revenue ? (grossProfit / revenue) * 100 : 0;
  const opProfit = grossProfit - salaries - rent - marketing - exOther;
  const opMargin = revenue ? (opProfit / revenue) * 100 : 0;
  const netProfit = opProfit - taxes;
  const netMargin = revenue ? (netProfit / revenue) * 100 : 0;

  const ROWS = [
    { label: 'Выручка', value: revenue, type: 'positive' as const, detail: 'Поступления за период' },
    { label: 'Себестоимость', value: -cogs, type: 'negative' as const, detail: consumedCogs > 0 ? 'Списанные материалы по заказам' : 'Материалы (по категориям расходов)' },
    { label: 'Валовая прибыль', value: grossProfit, type: 'subtotal' as const, detail: `${grossMargin.toFixed(1)}% маржа` },
    { label: 'Зарплата', value: -salaries, type: 'negative' as const, detail: `${store.employees.filter(e => e.status === 'active').length} активных` },
    { label: 'Аренда', value: -rent, type: 'negative' as const, detail: 'Цех, офис' },
    { label: 'Маркетинг', value: -marketing, type: 'negative' as const, detail: 'Реклама, SMM' },
    { label: 'Прочие расходы', value: -exOther, type: 'negative' as const, detail: 'Транспорт, связь, прочее' },
    { label: 'Операционная прибыль', value: opProfit, type: 'subtotal' as const, detail: `${opMargin.toFixed(1)}% маржа` },
    { label: 'Налоги', value: -taxes, type: 'negative' as const, detail: 'Уплачено' },
    { label: 'Чистая прибыль', value: netProfit, type: 'total' as const, detail: `${netMargin.toFixed(1)}% чистая маржа` },
  ];

  // ── P&L по направлениям (deal-based) — только для мульти-нишевых ──
  const byNiche = useMemo(() => {
    if (store.secondaryNiches.length === 0) return [];
    const map = new Map<string, { revenue: number; cogs: number }>();
    for (const id of store.allNiches) map.set(id, { revenue: 0, cogs: 0 });
    for (const d of completedDeals) {
      const id = d.niche || store.niche;
      const slot = map.get(id) || map.get(store.niche)!;
      slot.revenue += d.paidAmount || 0;
      const c = (d as any).consumed as Array<{ qty: number; costPerUnit: number }> | undefined;
      if (Array.isArray(c)) slot.cogs += c.reduce((cs, x) => cs + (Number(x.qty) || 0) * (Number(x.costPerUnit) || 0), 0);
    }
    return store.allNiches.map(id => {
      const n = getNiche(id);
      const v = map.get(id)!;
      const gp = v.revenue - v.cogs;
      return { id, name: n.name.ru, icon: n.icon, revenue: v.revenue, cogs: v.cogs, gp, margin: v.revenue ? (gp / v.revenue) * 100 : 0 };
    }).filter(x => x.revenue > 0 || x.cogs > 0);
  }, [completedDeals, store.allNiches, store.niche, store.secondaryNiches]);

  const cards = [
    { label: 'Выручка', value: fmtM(revenue) },
    { label: 'Вал. прибыль', value: fmtM(grossProfit) },
    { label: 'Чистая прибыль', value: fmtM(netProfit) },
    { label: 'Чистая маржа', value: `${netMargin.toFixed(1)}%` },
  ];

  const PERIODS: [PeriodKey, string][] = [['month', 'Месяц'], ['quarter', 'Квартал'], ['year', 'Год'], ['all', 'Всё время']];

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center gap-1 flex-wrap">
        {PERIODS.map(([p, lbl]) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-2xl text-[11px] transition-all ${period === p ? 'bg-emerald-600 text-white' : 'bg-white/60 ring-1 ring-white/60 text-slate-500 hover:bg-white'}`}>
            {lbl}
          </button>
        ))}
        {consumedCogs > 0 && (
          <span className="text-[10px] text-emerald-600 ml-2">себестоимость из списанных материалов</span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((k, i) => (
          <div key={i} className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-4">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{k.label}</div>
            <div className="text-base text-gray-900 tabular-nums mb-1">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-900">Отчёт о прибылях и убытках</div>
          <span className="text-[10px] text-gray-400">{PERIODS.find(([p]) => p === period)?.[1]}</span>
        </div>
        <div className="divide-y divide-gray-50">
          {ROWS.map((r, i) => {
            const isTotal = r.type === 'total'; const isSub = r.type === 'subtotal'; const isNeg = r.type === 'negative';
            return (
              <div key={i} className={`px-5 py-3 flex items-center justify-between ${isTotal ? 'bg-gray-50' : isSub ? 'bg-gray-50/50' : ''}`}>
                <div>
                  <div className={`text-xs ${isTotal || isSub ? 'text-gray-900' : 'text-gray-700'}`}>{r.label}</div>
                  <div className="text-[10px] text-gray-400">{r.detail}</div>
                </div>
                <div className={`text-sm tabular-nums ${isTotal ? 'text-gray-900' : isSub ? 'text-gray-900' : isNeg ? 'text-rose-500' : 'text-emerald-600'}`}>
                  {isNeg ? '−' : ''}{fmt(r.value)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* P&L by niche (multi-niche only) */}
      {byNiche.length > 1 && (
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50 text-sm text-gray-900">Прибыль по направлениям</div>
          <div className="divide-y divide-gray-50">
            {byNiche.map(n => (
              <div key={n.id} className="px-5 py-3 flex items-center justify-between">
                <div className="text-xs text-gray-700">{n.icon} {n.name}</div>
                <div className="flex items-center gap-4 text-[11px] tabular-nums">
                  <span className="text-slate-500">выручка {fmt(n.revenue)}</span>
                  <span className="text-rose-500">−{fmt(n.cogs)}</span>
                  <span className="text-gray-900">прибыль {fmt(n.gp)}</span>
                  <span className={`${n.margin >= 0 ? 'text-emerald-600' : 'text-rose-500'} w-12 text-right`}>{n.margin.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-gray-400 px-5 py-2">Себестоимость — списанные материалы по закрытым заказам направления.</div>
        </div>
      )}
    </div>
  );
}
