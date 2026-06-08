import { useMemo, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, ArrowUpRight, ChevronRight, ShoppingBag, DollarSign, Users, Target, BarChart3, Percent, ArrowRight, Star, X, Sparkles, Eye, Download } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { MarketingDashboard } from './MarketingDashboard';
import { t } from '../utils/translations';
import { useDataStore } from '../utils/dataStore';
import { getNiche } from '../utils/niches';
import { NicheIcon } from './NicheIcon';

type PeriodKey = 'month' | 'quarter' | 'year' | 'all';

const TYPE_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#22C55E', '#0EA5E9', '#6366F1', '#EAB308'];
const SOURCE_COLORS: Record<string, string> = {
  Instagram: '#EC4899', WhatsApp: '#22C55E', Telegram: '#3B82F6', TikTok: '#000000',
  Email: '#F59E0B', Phone: '#6366F1', Реклама: '#0EA5E9', Рекомендация: '#22C55E',
};

interface AnalyticsProps {
  language: 'kz' | 'ru' | 'eng';
}

export function Analytics({ language }: AnalyticsProps) {
  const store = useDataStore();
  const niche = getNiche(store.niche);
  // Aналитика — read-only по природе. Если матрица говорит 'none' для
  // модуля analytics — раздел в сайдбаре скрыт, но если кто-то попадёт
  // сюда по deeplink, отдадим понятный no-access экран вместо данных.
  const analyticsLevel = store.getModuleLevel('analytics');
  const [activeTab, setActiveTab] = useState<'overview' | 'ads' | 'team'>('overview');
  const [selectedMaster, setSelectedMaster] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('all');
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  // Period range — null = no filter (all time).
  const periodRange = useMemo<[Date, Date] | null>(() => {
    if (period === 'all') return null;
    const now = new Date();
    const start = new Date(now);
    if (period === 'month')   start.setMonth(now.getMonth() - 1);
    if (period === 'quarter') start.setMonth(now.getMonth() - 3);
    if (period === 'year')    start.setFullYear(now.getFullYear() - 1);
    start.setHours(0, 0, 0, 0);
    return [start, now];
  }, [period]);

  const inPeriod = (iso: string | undefined): boolean => {
    if (!periodRange || !iso) return !periodRange;
    const t = new Date(iso).getTime();
    return t >= periodRange[0].getTime() && t <= periodRange[1].getTime();
  };

  // Scoped data — only deals/transactions inside the picked period.
  const scopedDeals = useMemo(
    () => period === 'all' ? store.deals : store.deals.filter(d => inPeriod(d.createdAt) || inPeriod(d.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.deals, periodRange],
  );

  // Sales by month from completed income transactions + deal counts.
  // Localized month names (was Cyrillic-only before).
  const monthlySales = useMemo(() => {
    const monthsByLang = {
      ru:  ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
      kz:  ['Қаң', 'Ақп', 'Нау', 'Сәу', 'Мам', 'Мау', 'Шіл', 'Там', 'Қыр', 'Қаз', 'Қар', 'Жел'],
      eng: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    };
    const monthNames = monthsByLang[language];
    const out: { month: string; revenue: number; orders: number }[] = [];
    const now = new Date();
    // Window: 12 months for quarter+/year+/all, 6 for month.
    const windowMonths = period === 'month' ? 6 : 12;
    for (let i = windowMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const revenue = store.transactions
        .filter(t => t.type === 'income' && t.status === 'completed' && t.date.startsWith(monthKey))
        .reduce((s, t) => s + t.amount, 0);
      const orders = store.deals.filter(dl => (dl.createdAt || '').slice(0, 7) === monthKey).length;
      out.push({ month: monthNames[d.getMonth()], revenue, orders });
    }
    return out;
  }, [store.transactions, store.deals, language, period]);

  // Product types breakdown — niche-aware. Falls back to a generic
  // "Прочее" bucket when a deal predates the niche feature and has no
  // product type. Was hardcoded "Furniture Types" before.
  const productTypeData = useMemo(() => {
    const map = new Map<string, number>();
    scopedDeals.forEach(d => {
      const key = (d.furnitureType || d.product || 'Прочее').trim() || 'Прочее';
      map.set(key, (map.get(key) || 0) + 1);
    });
    const total = scopedDeals.length || 1;
    let i = 0;
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({
        name,
        value: Math.round((count / total) * 100),
        color: TYPE_COLORS[i++ % TYPE_COLORS.length],
      }));
  }, [scopedDeals]);

  // Team performance from employees + linked deals.
  // Role label "Сборщик" was furniture-only — for ceiling/flooring/etc
  // businesses we use the niche-specific installer label, plus generic
  // CRM roles for non-production employees.
  const mastersData = useMemo(() => {
    const nicheInstaller = niche.roleLabels.installer;
    const specMap: Record<string, { ru: string; kz: string; eng: string }> = {
      admin: { ru: 'Админ', kz: 'Әкімші', eng: 'Admin' },
      manager: { ru: 'Менеджер', kz: 'Менеджер', eng: 'Manager' },
      designer: niche.roleLabels.designer,
      production: nicheInstaller,  // ← Сборщик / Монтажник / Укладчик / Установщик / Бригада
      installer: nicheInstaller,
      measurer: niche.roleLabels.measurer,
      sales: { ru: 'Продажник', kz: 'Сатушы', eng: 'Sales' },
      accountant: { ru: 'Бухгалтер', kz: 'Бухгалтер', eng: 'Accountant' },
    };
    // Helper for MoM trend — compares this month's revenue to last month
    // by income transactions linked via deal.ownerId. Was hardcoded to 0
    // which made every employee look like they were failing (-0% red).
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
    return store.employees.map(e => {
      const linked = scopedDeals.filter(d =>
        d.measurer === e.name || d.designer === e.name || (d.ownerId && d.ownerId === e.id),
      );
      const revenue = linked.reduce((s, d) => s + (d.amount || 0), 0);
      const orders = linked.length;
      const avgCheck = orders ? Math.round(revenue / orders) : 0;
      const thisMonthRev = linked.filter(d => (d.createdAt || '').startsWith(thisMonthKey)).reduce((s, d) => s + (d.amount || 0), 0);
      const lastMonthRev = linked.filter(d => (d.createdAt || '').startsWith(lastMonthKey)).reduce((s, d) => s + (d.amount || 0), 0);
      const trend = lastMonthRev > 0
        ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100)
        : (thisMonthRev > 0 ? 100 : 0);
      const trendAmount = thisMonthRev - lastMonthRev;
      // Real monthly target set by the РОП (replaces the old salary×25
      // hack). 0 / unset → no plan shown; РОП fills it inline.
      const plan = e.monthlyTarget || 0;
      const hasPlan = plan > 0;
      const planProgress = plan ? Math.min(100, Math.round((revenue / plan) * 100)) : 0;
      return {
        id: e.id,
        name: e.name,
        avatar: e.avatar || e.name.slice(0, 1),
        specialization: specMap[e.role] || { ru: e.role, kz: e.role, eng: e.role },
        orders, revenue, avgCheck,
        trend, trendAmount,
        plan, planProgress, hasPlan,
        rating: e.performance.rating, reviewsCount: e.performance.ordersCompleted,
      };
    });
  }, [store.employees, scopedDeals, niche]);

  // ─── Forecast (прогноз воронки) + dept plan ──────────────────────
  // Weighted pipeline = Σ(сумма × вероятность стадии). Plus факт (закрытая
  // выручка) и план отдела (Σ месячных целей менеджеров). Даёт РОПу ответ
  // «вытянем ли план» заранее.
  const STAGE_PROB: Record<string, number> = { new: 0.1, measured: 0.3, 'project-agreed': 0.6, production: 0.85, installation: 0.95 };
  const forecast = useMemo(() => {
    let weighted = 0;
    for (const d of scopedDeals) {
      if (d.status === 'completed' || d.status === 'rejected') continue;
      weighted += (d.amount || 0) * (STAGE_PROB[d.status] ?? 0.2);
    }
    const wonRevenue = scopedDeals.filter(d => d.status === 'completed').reduce((s, d) => s + (d.amount || 0), 0);
    const deptPlan = store.employees.reduce((s, e) => s + (e.monthlyTarget || 0), 0);
    const expectedTotal = Math.round(weighted) + wonRevenue;
    return { weighted: Math.round(weighted), wonRevenue, deptPlan, expectedTotal,
      planPct: deptPlan > 0 ? Math.round((expectedTotal / deptPlan) * 100) : 0 };
  }, [scopedDeals, store.employees]);

  // Client sources from deals
  const sources = useMemo(() => {
    const map = new Map<string, number>();
    store.deals.forEach(d => {
      const k = d.source || 'Прочее';
      map.set(k, (map.get(k) || 0) + 1);
    });
    const total = store.deals.length || 1;
    return Array.from(map.entries()).map(([name, count]) => ({
      name,
      value: Math.round((count / total) * 100),
      color: SOURCE_COLORS[name] || '#9CA3AF',
    }));
  }, [store.deals]);

  // Popular materials: top products by spend
  const materials = useMemo(() => {
    const ranked = [...store.products].sort((a, b) => (b.cost * b.quantity) - (a.cost * a.quantity)).slice(0, 5);
    const maxVal = Math.max(1, ...ranked.map(p => p.cost * p.quantity));
    return ranked.map(p => ({ name: p.name, pct: Math.round(((p.cost * p.quantity) / maxVal) * 100) }));
  }, [store.products]);

  // Niche breakdown — for multi-niche teams only. Aggregates orders +
  // revenue per direction (deal.niche || team primary). Renders as a
  // dedicated section that's hidden for single-niche teams to avoid
  // clutter. Revenue here comes from deal.amount (not paid transactions)
  // because we want to compare pipeline sizes across directions, not
  // cash collection.
  const nicheBreakdown = useMemo(() => {
    if (store.secondaryNiches.length === 0) return [] as Array<{ id: string; name: string; icon: string; orders: number; revenue: number; pct: number }>;
    const totals = new Map<string, { orders: number; revenue: number }>();
    for (const id of store.allNiches) totals.set(id, { orders: 0, revenue: 0 });
    for (const d of scopedDeals) {
      const id = d.niche || store.niche;
      const slot = totals.get(id) || totals.get(store.niche) || { orders: 0, revenue: 0 };
      slot.orders += 1;
      slot.revenue += d.amount || 0;
      totals.set(id, slot);
    }
    const totalRev = Math.max(1, Array.from(totals.values()).reduce((s, v) => s + v.revenue, 0));
    return store.allNiches.map(id => {
      const n = getNiche(id);
      const t = totals.get(id) || { orders: 0, revenue: 0 };
      return {
        id,
        name: n.name[language],
        icon: n.icon,
        orders: t.orders,
        revenue: t.revenue,
        pct: Math.round((t.revenue / totalRev) * 100),
      };
    });
  }, [scopedDeals, store.niche, store.secondaryNiches, store.allNiches, language]);

  // KPIs scoped to the period filter (was always all-time).
  const totalOrders = scopedDeals.length;
  const totalRevenue = useMemo(() =>
    store.transactions.filter(t => t.type === 'income' && t.status === 'completed' && inPeriod(t.date))
      .reduce((s, t) => s + t.amount, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.transactions, periodRange]);
  const avgCheck = useMemo(() => {
    const withAmount = scopedDeals.filter(d => d.amount > 0);
    return withAmount.length ? Math.round(withAmount.reduce((s, d) => s + d.amount, 0) / withAmount.length) : 0;
  }, [scopedDeals]);
  const conversion = scopedDeals.length
    ? Math.round((scopedDeals.filter(d => d.status === 'completed').length / scopedDeals.length) * 100)
    : 0;

  const tabs = {
    overview: { kz: 'Шолу',     ru: 'Обзор',   eng: 'Overview' },
    team:     { kz: 'Команда',  ru: 'Команда', eng: 'Team' },
    ads:      { kz: 'Жарнама',  ru: 'Реклама', eng: 'Ads' },
  };

  // Defensive view-gate. If a role has analytics='none', deeplinks to
  // this route get a clear no-access screen instead of zeroed charts.
  if (analyticsLevel === 'none') {
    return (
      <div className="min-h-full relative flex items-center justify-center p-8">
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-3xl p-10 max-w-md text-center">
          <Eye className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg text-slate-900 mb-1 tracking-tight">
            {l('Нет доступа', 'Қол жетімсіз', 'No access')}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {l(
              'У вашей роли нет прав на просмотр аналитики. Попросите администратора открыть модуль.',
              'Сіздің рөліңізде аналитиканы қарау құқығы жоқ.',
              'Your role does not have access to analytics. Ask an admin to enable it.',
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-full relative"
    >
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
        <div>
          <p className="text-[11px] text-slate-400 mb-1 tracking-widest uppercase">
            {t('analytics', language)}
            {' · '}
            <span className="inline-flex items-center gap-1 normal-case tracking-normal text-slate-500"><NicheIcon niche={niche} className="w-3 h-3" /> {niche.name[language]}</span>
          </p>
          <h1 className="text-slate-900 text-2xl md:text-3xl font-medium tracking-tight mb-0">
            {language === 'kz' ? 'Сатылымдар мен тиімділік' : language === 'eng' ? 'Sales & Performance' : 'Продажи и эффективность'}
          </h1>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.keys(tabs) as Array<keyof typeof tabs>).map(tab => {
            // Hide the Реклама tab when matrix says 'none' for the marketing module.
            if (tab === 'ads' && store.getModuleLevel('marketing') === 'none') return null;
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-2 rounded-2xl text-xs ring-1 transition-all ${
                  active
                    ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]'
                    : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
                }`}
              >
                {tabs[tab][language]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Period filter — affects all KPIs / charts / funnel on Overview.
          Also hosts the CSV export of the current period summary. */}
      {activeTab === 'overview' && store.deals.length > 0 && (
        <div className="flex items-center gap-1 mb-6 flex-wrap">
          {(['month', 'quarter', 'year', 'all'] as PeriodKey[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-2xl text-[11px] transition-all ${
                period === p
                  ? 'bg-emerald-600 text-white shadow-[0_4px_12px_-2px_var(--accent-shadow)] ring-1 ring-white/10'
                  : 'bg-white/50 text-slate-600 ring-1 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
              }`}
            >
              {p === 'month'   ? l('Месяц',    'Ай',     'Month')
               : p === 'quarter' ? l('Квартал',  'Тоқсан', 'Quarter')
               : p === 'year'    ? l('Год',     'Жыл',    'Year')
               :                    l('Всё время','Барлық', 'All time')}
            </button>
          ))}
          <button
            onClick={() => {
              // Build a CSV snapshot of the current period — KPIs, monthly
              // sales, product type breakdown, sources, team performance.
              // Localized headers + UTF-8 BOM so Excel/Numbers in KZ/RU/EN
              // open it cleanly.
              const rows: string[] = [];
              const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
              const periodLabel =
                period === 'month'   ? l('Месяц', 'Ай', 'Month')
                : period === 'quarter' ? l('Квартал', 'Тоқсан', 'Quarter')
                : period === 'year'    ? l('Год', 'Жыл', 'Year')
                :                        l('Всё время', 'Барлық', 'All time');
              rows.push(`# ${l('Аналитика', 'Аналитика', 'Analytics')} · ${niche.name[language]} · ${periodLabel}`);
              rows.push('');
              rows.push(`# ${l('Ключевые метрики', 'Негізгі метрикалар', 'Key metrics')}`);
              rows.push([l('Метрика', 'Метрика', 'Metric'), l('Значение', 'Мән', 'Value')].map(esc).join(','));
              rows.push([l('Всего заказов', 'Тапсырыстар', 'Total orders'), totalOrders].map(esc).join(','));
              rows.push([l('Выручка ₸', 'Түсім ₸', 'Revenue KZT'), totalRevenue].map(esc).join(','));
              rows.push([l('Средний чек ₸', 'Орташа чек ₸', 'Avg check KZT'), avgCheck].map(esc).join(','));
              rows.push([l('Конверсия %', 'Конверсия %', 'Conversion %'), conversion].map(esc).join(','));
              rows.push('');
              rows.push(`# ${l('Продажи по месяцам', 'Ай бойынша сатылым', 'Sales by month')}`);
              rows.push([l('Месяц', 'Ай', 'Month'), l('Выручка ₸', 'Түсім ₸', 'Revenue KZT'), l('Заказы', 'Тапсырыстар', 'Orders')].map(esc).join(','));
              monthlySales.forEach(m => rows.push([m.month, m.revenue, m.orders].map(esc).join(',')));
              rows.push('');
              rows.push(`# ${niche.productTypeLabel[language]}`);
              rows.push([l('Тип', 'Түрі', 'Type'), l('Доля %', 'Үлес %', 'Share %')].map(esc).join(','));
              productTypeData.forEach(t => rows.push([t.name, t.value].map(esc).join(',')));
              rows.push('');
              rows.push(`# ${l('Источники клиентов', 'Клиент көздері', 'Client sources')}`);
              rows.push([l('Источник', 'Көз', 'Source'), l('Доля %', 'Үлес %', 'Share %')].map(esc).join(','));
              sources.forEach(s => rows.push([s.name, s.value].map(esc).join(',')));
              rows.push('');
              // Niche breakdown — only emitted for multi-niche teams
              if (nicheBreakdown.length > 1) {
                rows.push(`# ${l('Выручка по направлениям', 'Бағыттар бойынша түсім', 'Revenue by direction')}`);
                rows.push([l('Направление', 'Бағыт', 'Direction'), l('Сделок', 'Мәміле', 'Deals'), l('Выручка ₸', 'Түсім ₸', 'Revenue KZT'), l('Доля %', 'Үлес %', 'Share %')].map(esc).join(','));
                nicheBreakdown.forEach(n => rows.push([`${n.icon} ${n.name}`, n.orders, n.revenue, n.pct].map(esc).join(',')));
                rows.push('');
              }
              rows.push(`# ${l('Эффективность команды', 'Команда тиімділігі', 'Team performance')}`);
              rows.push([
                l('Сотрудник', 'Қызметкер', 'Employee'),
                l('Заказы', 'Тапсырыстар', 'Orders'),
                l('Выручка ₸', 'Түсім ₸', 'Revenue KZT'),
                l('Средний чек ₸', 'Орташа чек ₸', 'Avg check KZT'),
                l('Тренд %', 'Үрдіс %', 'Trend %'),
                l('План ₸', 'Жоспар ₸', 'Plan KZT'),
                l('% от плана', 'Жоспардан %', '% of plan'),
              ].map(esc).join(','));
              mastersData.forEach(m => rows.push([
                m.name, m.orders, m.revenue, m.avgCheck, m.trend,
                m.hasPlan ? m.plan : '—',
                m.hasPlan ? m.planProgress : '—',
              ].map(esc).join(',')));
              const csv = '﻿' + rows.join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              const today = new Date().toISOString().slice(0, 10);
              a.href = url;
              a.download = `analytics-${period}-${today}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[11px] bg-white/50 text-slate-600 ring-1 ring-white/60 hover:bg-white/80 backdrop-blur-xl transition-all"
            title={l('Экспорт сводки в CSV', 'CSV-қа экспорт', 'Export summary to CSV')}
          >
            <Download className="w-3.5 h-3.5" />
            {l('Экспорт CSV', 'CSV экспорт', 'Export CSV')}
          </button>
        </div>
      )}

      {activeTab === 'ads' && store.getModuleLevel('marketing') !== 'none' ? (
        <MarketingDashboard language={language} />
      ) : activeTab === 'team' ? (
        <TeamMetrics language={language} />
      ) : store.deals.length === 0 ? (
        // Empty-state hero — fresh user with no data sees a single CTA
        // card instead of a wall of zeroed KPIs + broken donut + zero-
        // width funnel that looks like a load error.
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-white/60 ring-1 ring-white/60 shadow-[0_8px_24px_-10px_rgba(15,23,42,0.18)] flex items-center justify-center text-slate-500"><NicheIcon niche={niche} className="w-7 h-7" /></div>
          <h2 className="text-xl text-slate-900 mb-2 tracking-tight">
            {l('Графики и метрики появятся автоматически', 'Графиктер мен метрикалар автоматты түрде шығады', 'Charts appear automatically')}
          </h2>
          <p className="text-sm text-slate-500 mb-5 max-w-md mx-auto leading-relaxed">
            {l(
              `Аналитика считается из сделок, оплат и задач команды. Создайте первую сделку — выручка, конверсия, воронка и эффективность сотрудников оживут сразу.`,
              'Аналитика мәмілелерден есептеледі. Бірінші мәмілені жасаңыз — деректер бірден пайда болады.',
              'Analytics is computed from deals, payments and team tasks. Create the first deal — KPIs come alive.',
            )}
          </p>
          <div className="flex items-center gap-2 justify-center flex-wrap">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page: 'sales' } }))}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
            >
              <ShoppingBag className="w-3.5 h-3.5" /> {l('Открыть Заказы', 'Тапсырыстар', 'Open Orders')}
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('ai-assistant:open', { detail: {
                prompt: l(
                  `Сделай аналитику для ниши «${niche.name.ru}» — что важно отслеживать первый месяц?`,
                  `«${niche.name.kz}» салаға қандай метрикалар маңызды?`,
                  `What metrics matter most in the first month for "${niche.name.eng}"?`,
                ),
              }}))}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600/90 hover:bg-violet-700 text-white rounded-2xl text-xs ring-1 ring-white/10 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" /> {l('Спросить AI', 'AI-ден сұрау', 'Ask AI')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Metric Cards — each card deeplinks to the source module so the
              user can drill from a KPI down to the underlying records. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: language === 'kz' ? 'Тапсырыстар' : language === 'eng' ? 'Total Orders' : 'Всего заказов', value: totalOrders.toString(), icon: ShoppingBag, page: 'sales' },
              { label: language === 'kz' ? 'Түсім' : language === 'eng' ? 'Revenue' : 'Выручка', value: totalRevenue ? `${(totalRevenue / 1000000).toFixed(1)}М ₸` : '0 ₸', icon: DollarSign, page: 'payments' },
              { label: language === 'kz' ? 'Орташа чек' : language === 'eng' ? 'Avg Check' : 'Средний чек', value: avgCheck ? `${(avgCheck / 1000).toFixed(0)}K ₸` : '0 ₸', icon: Target, page: 'sales' },
              { label: language === 'kz' ? 'Конверсия' : language === 'eng' ? 'Conversion' : 'Конверсия', value: `${conversion}%`, icon: Percent, page: 'sales' },
            ].map((card, i) => {
              const Icon = card.icon;
              return (
                <button
                  key={i}
                  onClick={() => window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page: card.page } }))}
                  className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5 text-left hover:bg-white/70 hover:shadow-lg transition-all"
                  title={l('Перейти к деталям', 'Толығырақ көру', 'View details')}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-gray-400">{card.label}</span>
                    <div className="w-9 h-9 bg-white/60 ring-1 ring-white/60 rounded-2xl flex items-center justify-center">
                      <Icon className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                  <div className="text-xl text-gray-900 mb-1">{card.value}</div>
                  <div className="text-[11px] text-gray-400 flex items-center gap-1">
                    {language === 'kz' ? 'нақты деректер' : language === 'eng' ? 'live data' : 'актуальные данные'}
                    <ArrowUpRight className="w-3 h-3 opacity-50" />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Niche breakdown — only for multi-niche teams */}
          {nicheBreakdown.length > 1 && (
            <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5 mb-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-sm text-gray-900 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald-600" />
                    {l('Выручка по направлениям', 'Бағыттар бойынша түсім', 'Revenue by direction')}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {l('Сумма по сделкам в выбранном периоде', 'Таңдалған кезеңдегі мәмілелер сомасы', 'Pipeline by period')}
                  </div>
                </div>
              </div>
              {/* Stacked horizontal bar — single row segmented by niche.
                  Lets the user see proportions at a glance, with a legend
                  below for exact numbers. */}
              <div className="w-full h-3 rounded-full overflow-hidden flex bg-gray-100">
                {nicheBreakdown.filter(n => n.revenue > 0).map((n, i) => {
                  const palette = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#22C55E', '#0EA5E9', '#6366F1', '#EAB308'];
                  return (
                    <div
                      key={n.id}
                      style={{ width: `${n.pct}%`, backgroundColor: palette[i % palette.length] }}
                      title={`${n.icon} ${n.name}: ${n.pct}% · ${n.orders} ${l('сделок', 'мәміле', 'deals')}`}
                    />
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {nicheBreakdown.map((n, i) => {
                  const palette = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#22C55E', '#0EA5E9', '#6366F1', '#EAB308'];
                  return (
                    <button
                      key={n.id}
                      onClick={() => window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page: 'sales' } }))}
                      className="text-left bg-white/50 ring-1 ring-white/60 rounded-2xl p-3 hover:bg-white/70 transition-all"
                      title={l('Перейти в Заказы', 'Тапсырыстарға', 'Open Orders')}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: palette[i % palette.length] }} />
                        <span className="inline-flex items-center gap-1 text-xs text-gray-700 truncate"><NicheIcon id={n.id} className="w-3 h-3 flex-shrink-0" /> {n.name}</span>
                      </div>
                      <div className="text-sm text-gray-900 tabular-nums">
                        {n.revenue ? `${(n.revenue / 1000000).toFixed(1)}М ₸` : '0 ₸'}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {n.orders} {l('сделок', 'мәміле', 'deals')} · {n.pct}%
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Revenue Area Chart */}
            <div className="lg:col-span-2 bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="text-sm text-gray-900">
                    {language === 'kz' ? 'Ай бойынша сатылым' : language === 'eng' ? 'Sales by Month' : 'Продажи по месяцам'}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {language === 'kz' ? 'Соңғы 6 ай' : language === 'eng' ? 'Last 6 months' : 'Последние 6 месяцев'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-900">{totalRevenue ? `${(totalRevenue / 1000000).toFixed(1)}М ₸` : '0 ₸'}</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={monthlySales}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value: any) => [`${(value / 1000000).toFixed(1)} млн ₸`]}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} fill="url(#colorSales)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Product Types — Donut. Title is niche-aware so a windows
                business doesn't see "Типы мебели" anywhere. */}
            <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5">
              <div className="text-sm text-gray-900 mb-4">
                {niche.productTypeLabel[language]}
              </div>
              <div className="flex items-center justify-center mb-4">
                <div className="relative">
                  <PieChart width={160} height={160}>
                    <Pie
                      data={productTypeData}
                      cx={80} cy={80}
                      innerRadius={50} outerRadius={72}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {productTypeData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-lg text-gray-900">{totalOrders}</div>
                      <div className="text-[10px] text-gray-400">
                        {language === 'kz' ? 'заказ' : language === 'eng' ? 'orders' : 'заказов'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {productTypeData.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-gray-600">{item.name}</span>
                    </div>
                    <span className="text-xs text-gray-900">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Masters + Sources */}
          {/* План отдела / факт / прогноз воронки (для РОПа) */}
          {(forecast.deptPlan > 0 || forecast.expectedTotal > 0) && (() => {
            const M = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';
            const cards = [
              { label: l('План отдела', 'Бөлім жоспары', 'Dept plan'), value: forecast.deptPlan > 0 ? M(forecast.deptPlan) : '—', cls: 'bg-slate-100 text-slate-600' },
              { label: l('Факт (закрыто)', 'Факт (жабылған)', 'Won (closed)'), value: M(forecast.wonRevenue), cls: 'bg-emerald-50 text-emerald-600' },
              { label: l('Прогноз воронки', 'Воронка болжамы', 'Pipeline forecast'), value: M(forecast.weighted), cls: 'bg-sky-50 text-sky-600' },
              { label: l('Ожидаемо всего', 'Күтілетін барлығы', 'Expected total'), value: M(forecast.expectedTotal), cls: 'bg-violet-50 text-violet-600' },
            ];
            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {cards.map((c, i) => (
                  <div key={i} className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-4">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{c.label}</div>
                    <div className="text-sm text-gray-900 tabular-nums">{c.value}</div>
                    {i === 3 && forecast.deptPlan > 0 && (
                      <div className={`text-[10px] mt-1 ${forecast.planPct >= 100 ? 'text-emerald-600' : forecast.planPct >= 70 ? 'text-amber-600' : 'text-rose-500'}`}>
                        {forecast.planPct}% {l('от плана', 'жоспардан', 'of plan')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Team performance — niche-neutral header (was "Эффективность мастеров"
                which only made sense for furniture). */}
            <div className="lg:col-span-2 bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="text-sm text-gray-900">
                  {l('Эффективность команды', 'Команда тиімділігі', 'Team Performance')}
                </div>
                {mastersData.length > 0 && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page: 'settings', tab: 'team' } }))}
                    className="text-[11px] text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    {l('Настройки команды →', 'Команда баптаулары →', 'Team settings →')}
                  </button>
                )}
              </div>
              {mastersData.length === 0 ? (
                <div className="text-center py-10">
                  <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <div className="text-sm text-gray-700 mb-1">
                    {l('В команде ещё никого', 'Командада әзірге ешкім жоқ', 'No teammates yet')}
                  </div>
                  <div className="text-xs text-gray-400 mb-4 max-w-xs mx-auto leading-relaxed">
                    {l(
                      'Добавьте сотрудников в Настройках — выручка, заказы и план каждого появятся здесь.',
                      'Баптаулар бөлімінен қызметкерлерді қосыңыз — деректер автоматты түрде шығады.',
                      'Add teammates in Settings — revenue and plan progress will appear here.',
                    )}
                  </div>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page: 'settings', tab: 'team' } }))}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs hover:bg-emerald-700 ring-1 ring-white/10 transition-all"
                  >
                    {l('Открыть Настройки', 'Баптаулар', 'Open Settings')}
                  </button>
                </div>
              ) : (
              <div className="space-y-3">
                {mastersData.map((master, i) => {
                  const spec = master.specialization[language === 'kz' ? 'kz' : language === 'eng' ? 'eng' : 'ru'];
                  const planPct = master.planProgress;
                  const planColor = planPct >= 80 ? 'bg-emerald-500' : planPct >= 40 ? 'bg-amber-400' : 'bg-red-400';

                  return (
                    <div key={i} className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-4">
                      {/* Верхняя часть */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-sm text-gray-600 flex-shrink-0">
                            {master.avatar}
                          </div>
                          <div>
                            <div className="text-sm text-gray-900 font-medium">{master.name}</div>
                            <div className="text-[11px] text-gray-400">{spec}</div>
                          </div>
                        </div>
                        <Dialog.Root>
                          <Dialog.Trigger asChild>
                            <button className="flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900 transition-colors">
                              {l('Подробнее', 'Толығырақ', 'Details')}
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </Dialog.Trigger>
                          <Dialog.Portal>
                            <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
                            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-6 w-[90vw] max-w-md z-50">
                              <div className="flex items-start justify-between mb-4">
                                <Dialog.Title className="text-base text-gray-900">
                                  {l('Профиль сотрудника', 'Қызметкер профилі', 'Employee profile')}: {master.name}
                                </Dialog.Title>
                                <Dialog.Close asChild>
                                  <button className="text-gray-400 hover:text-gray-600 transition-colors">
                                    <X className="w-5 h-5" />
                                  </button>
                                </Dialog.Close>
                              </div>
                              <p className="text-sm text-gray-600 mb-6">
                                {l(
                                  'Здесь будет история заказов, портфолио работ, отзывы клиентов и статистика по дням.',
                                  'Мұнда тапсырыстар тарихы, жұмыс портфолиосы, клиент пікірлері және күндер бойынша статистика болады.',
                                  'Here will be order history, work portfolio, customer reviews and daily statistics.'
                                )}
                              </p>
                              <Dialog.Close asChild>
                                <button className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm text-gray-900 transition-colors">
                                  {l('Закрыть', 'Жабу', 'Close')}
                                </button>
                              </Dialog.Close>
                            </Dialog.Content>
                          </Dialog.Portal>
                        </Dialog.Root>
                      </div>

                      {/* Три колонки */}
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        {/* Колонка 1: Заказы */}
                        <div>
                          <div className="text-[11px] text-gray-400 mb-1">
                            {l('Заказы', 'Тапсырыстар', 'Orders')}
                          </div>
                          <div className="text-sm text-gray-900 mb-0.5">
                            {master.orders} · {(master.revenue / 1000000).toFixed(1)} млн ₸
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {l('Средний чек', 'Орташа чек', 'Avg check')} {(master.avgCheck / 1000).toFixed(0)}К ₸
                          </div>
                        </div>

                        {/* Колонка 2: Тренд */}
                        <div>
                          <div className="text-[11px] text-gray-400 mb-1">
                            {l('Тренд', 'Үрдіс', 'Trend')}
                          </div>
                          <div className={`text-sm flex items-center gap-1 mb-0.5 ${master.trend > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {master.trend > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                            {master.trend > 0 ? '+' : ''}{master.trend}% {l('по выручке', 'түсім бойынша', 'by revenue')}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {l('к прошлому месяцу', 'өткен айға', 'vs last month')} ({master.trendAmount > 0 ? '+' : ''}{(master.trendAmount / 1000).toFixed(0)}К ₸)
                          </div>
                        </div>

                        {/* Колонка 3: Рейтинг */}
                        <div>
                          <div className="text-[11px] text-gray-400 mb-1">
                            {l('Рейтинг', 'Рейтинг', 'Rating')}
                          </div>
                          <div className="text-sm text-gray-900 flex items-center gap-1 mb-0.5">
                            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                            {master.rating}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {master.reviewsCount} {l('отзывов', 'пікір', 'reviews')}
                          </div>
                        </div>
                      </div>

                      {/* Месячный план продаж — РОП (админ) задаёт цель по
                          выручке прямо здесь. Прогресс — факт / план. */}
                      <div className="pt-3 border-t border-white/60">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-[11px] text-gray-400">{l('План на месяц', 'Айлық жоспар', 'Monthly plan')}</div>
                          {store.currentUserRole === 'admin' ? (
                            <input
                              type="number" defaultValue={master.plan || ''} placeholder="0"
                              onClick={e => e.stopPropagation()}
                              onBlur={e => { const v = Number(e.target.value) || 0; if (v !== (master.plan || 0)) store.updateEmployee(master.id, { monthlyTarget: v }); }}
                              className="w-28 px-2 py-0.5 text-[11px] text-right bg-white/60 ring-1 ring-white/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
                            />
                          ) : (
                            <div className="text-[11px] text-gray-900 tabular-nums">{master.hasPlan ? `${(master.plan / 1e6).toFixed(1)}М ₸` : '—'}</div>
                          )}
                        </div>
                        {master.hasPlan ? (
                          <>
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                              <div className={`h-full rounded-full ${planColor}`} style={{ width: `${planPct}%` }} />
                            </div>
                            <div className="text-[10px] text-gray-400 text-right tabular-nums">
                              {(master.revenue / 1e6).toFixed(1)}М ₸ · {planPct}% {l('от плана', 'жоспардан', 'of plan')}
                            </div>
                          </>
                        ) : (
                          <div className="text-[10px] text-gray-400">
                            {store.currentUserRole === 'admin'
                              ? l('Поставьте цель по выручке на месяц', 'Айлық табыс мақсатын қойыңыз', 'Set a monthly revenue target')
                              : l('План не задан', 'Жоспар жоқ', 'No plan set')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>

            {/* Sources — empty state when no deals carry a source tag */}
            <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5">
              <div className="text-sm text-gray-900 mb-5">
                {language === 'kz' ? 'Клиент көздері' : language === 'eng' ? 'Client Sources' : 'Источники клиентов'}
              </div>
              {sources.length === 0 ? (
                <div className="text-center py-6">
                  <div className="text-xs text-gray-500 mb-1">
                    {l('Нет данных по источникам', 'Көздер бойынша деректер жоқ', 'No source data')}
                  </div>
                  <div className="text-[11px] text-gray-400 leading-relaxed">
                    {l(
                      'Укажите «Откуда клиент» при создании сделки — здесь появятся Instagram, WhatsApp, Telegram и др.',
                      'Мәміле жасағанда «Клиент көзі» өрісін толтырыңыз.',
                      'Set "Source" on new deals — channels will appear here.',
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {sources.map((src, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: src.color }} />
                          <span className="text-xs text-gray-600">{src.name}</span>
                        </div>
                        <span className="text-xs text-gray-900">{src.value}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${src.value}%`, backgroundColor: src.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sales Funnel with conversions — period-scoped + NaN-guarded */}
          {(() => {
            const newLeads = scopedDeals.filter(d => d.status === 'new').length;
            const qualified = scopedDeals.filter(d => ['measured', 'project-agreed', 'contract'].includes(d.status)).length;
            // Production stage list is niche-aware: assembly only counts for
            // niches that have it. For ceilings / blinds / doors the
            // production bucket includes their respective in-progress
            // statuses without claiming furniture-specific assembly.
            const inProd = scopedDeals.filter(d => ['production', 'assembly', 'installation', 'manufacturing'].includes(d.status)).length;
            const sold = scopedDeals.filter(d => d.status === 'completed').length;
            const maxStage = Math.max(1, newLeads, qualified, inProd, sold);
            const stages = [
              { label: l('Новые лиды',  'Жаңа лидтер',     'New leads'),     value: newLeads,  color: 'bg-blue-500' },
              { label: l('Квал. лиды',  'Білікті лидтер',  'Qualified'),     value: qualified, color: 'bg-blue-400' },
              { label: l('В работе',    'Жұмыста',         'In progress'),   value: inProd,    color: 'bg-purple-500' },
              { label: l('Продажи',     'Сатылым',         'Sales'),         value: sold,      color: 'bg-emerald-500' },
            ].map(s => ({ ...s, w: Math.round((s.value / maxStage) * 100) }));
            // Auto-generated insights — find the weakest stage transition
            // and surface it as a hint. Lights up when conversion < 30%.
            const insights: string[] = [];
            for (let i = 0; i < stages.length - 1; i++) {
              const s = stages[i], next = stages[i + 1];
              if (s.value > 0 && next.value / s.value < 0.3) {
                insights.push(l(
                  `Потери на этапе «${s.label} → ${next.label}»: ${(100 - (next.value / s.value) * 100).toFixed(0)}%. Стоит разобрать почему лиды не доходят.`,
                  `«${s.label} → ${next.label}» кезеңінде жоғалту көп.`,
                  `High drop at "${s.label} → ${next.label}": ${(100 - (next.value / s.value) * 100).toFixed(0)}%.`,
                ));
              }
            }
            return (
              <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5 mb-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="text-sm text-gray-900">{l('Воронка: от показа до продажи', 'Воронка: көрсетуден сатылымға дейін', 'Funnel: from impression to sale')}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{l('Конверсии и потери', 'Конверсиялар мен жоғалулар', 'Conversions and losses')}</div>
                  </div>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('ai-assistant:open', { detail: {
                      prompt: l(
                        `Проанализируй мою воронку продаж для ниши «${niche.name.ru}». Конкретные шаги: ${stages.map(s => `${s.label} — ${s.value}`).join(', ')}. Что улучшить?`,
                        `Менің сату воронкамды талда. Не жақсартуға болады?`,
                        `Analyze my sales funnel. What to improve?`,
                      ),
                    }}))}
                    className="text-xs text-violet-700 px-3 py-1.5 bg-violet-50 ring-1 ring-violet-200/60 rounded-xl hover:bg-violet-100 flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3 h-3" />
                    {l('Что улучшить?', 'Не жақсартуға болады?', 'What to improve?')}
                  </button>
                </div>

                <div className="space-y-2">
                  {stages.map((s, i) => {
                    const next = stages[i + 1];
                    // NaN guard — was producing "0/0 = NaN%" when stage was empty.
                    const conv = next && s.value > 0 ? (next.value / s.value) * 100 : null;
                    const lost = next && s.value > 0 ? s.value - next.value : 0;
                    return (
                      <div key={i}>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-gray-700">{s.label}</span>
                              <span className="text-xs text-gray-900">{s.value.toLocaleString('ru-RU')}</span>
                            </div>
                            <div className="h-7 bg-white/60 ring-1 ring-white/60 rounded-xl overflow-hidden">
                              <div className={`h-full ${s.color} rounded-lg`} style={{ width: `${Math.max(2, s.w)}%` }} />
                            </div>
                          </div>
                        </div>
                        {next && conv !== null && (
                          <div className="flex items-center gap-2 py-2 pl-3 text-[11px]">
                            <span className="text-gray-400">→</span>
                            <span className="text-gray-700">{conv.toFixed(1)}%</span>
                            {lost > 0 && (
                              <span className="text-red-500">
                                {l(`теряем ${lost.toLocaleString('ru-RU')}`, `жоғалту: ${lost.toLocaleString('ru-RU')}`, `lost: ${lost.toLocaleString('ru-RU')}`)}
                                {' '}({(100 - conv).toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 space-y-2">
                  {insights.map((txt, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl">
                      <span className="text-amber-600 text-xs flex-shrink-0">💡</span>
                      <span className="text-xs text-amber-800 leading-relaxed">{txt}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Materials + Orders chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Orders mini chart */}
            <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="text-sm text-gray-900">
                  {language === 'kz' ? 'Ай бойынша тапсырыстар' : language === 'eng' ? 'Orders by Month' : 'Заказы по месяцам'}
                </div>
              </div>
              <div className="flex items-end gap-3">
                {monthlySales.map((d, i) => {
                  const max = Math.max(...monthlySales.map(m => m.orders));
                  const height = Math.max(20, (d.orders / max) * 80);
                  const isLast = i === monthlySales.length - 1;
                  return (
                    <div key={d.month} className="flex-1 flex flex-col items-center gap-1.5">
                      <span className="text-[10px] text-gray-500">{d.orders}</span>
                      <div
                        className={`w-full rounded-lg transition-colors ${isLast ? 'bg-blue-500' : 'bg-gray-100'}`}
                        style={{ height: `${height}px` }}
                      />
                      <span className={`text-[10px] ${isLast ? 'text-blue-600' : 'text-gray-400'}`}>{d.month}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Popular Materials — empty state with Warehouse deeplink */}
            <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="text-sm text-gray-900">
                  {language === 'kz' ? 'Танымал материалдар' : language === 'eng' ? 'Popular Materials' : 'Популярные материалы'}
                </div>
                {materials.length > 0 && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page: 'warehouse' } }))}
                    className="text-[11px] text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    {l('Склад →', 'Қойма →', 'Warehouse →')}
                  </button>
                )}
              </div>
              {materials.length === 0 ? (
                <div className="text-center py-6">
                  <div className="text-xs text-gray-500 mb-1">
                    {l('Склад пуст', 'Қойма бос', 'Warehouse is empty')}
                  </div>
                  <div className="text-[11px] text-gray-400 mb-3 leading-relaxed">
                    {l(
                      'Загрузите материалы — рейтинг по обороту появится автоматически.',
                      'Материалдарды қосыңыз — рейтинг автоматты түрде шығады.',
                      'Add materials — rotation ranking will appear automatically.',
                    )}
                  </div>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page: 'warehouse' } }))}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-[11px] hover:bg-emerald-700 ring-1 ring-white/10 transition-all"
                  >
                    {l('Открыть Склад', 'Қойманы ашу', 'Open Warehouse')}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {materials.map((mat, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-[10px] text-gray-400 w-4 text-right">{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-700">{mat.name}</span>
                          <span className="text-xs text-gray-900">{mat.pct}%</span>
                        </div>
                        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gray-900 rounded-full" style={{ width: `${mat.pct}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
    </div>
  );
}

// ─── Team metrics (per-employee performance) ─────────────────────
// Renders one card per teammate with:
//   - Tasks: total / done with progress bar
//   - Deals: total / completed
//   - Revenue: sum of paidAmount on deals attributed to them
//   - Conversion: completed / non-rejected deals × 100%
// Attribution: tasks via assigneeId; deals via measurer/designer/foreman/
// architect text match (current schema doesn't store ownerId on deals).
function TeamMetrics({ language }: { language: 'kz' | 'ru' | 'eng' }) {
  const store = useDataStore();
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  // Skip removed teammates from the board.
  const team = store.employees.filter((e: any) => !e.removed_at);

  if (team.length === 0) {
    return (
      <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-10 text-center">
        <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <div className="text-sm text-gray-700 mb-1">
          {l('В команде пока никого', 'Командада әзірге ешкім жоқ', 'Team is empty')}
        </div>
        <div className="text-xs text-gray-400">
          {l('Пригласите сотрудников в Настройках → Команда — метрики появятся автоматически.',
             'Қызметкерлерді Баптаулар → Команда арқылы шақырыңыз — метрикалар автоматты түрде шығады.',
             'Invite teammates from Settings → Team — metrics will appear automatically.')}
        </div>
      </div>
    );
  }

  const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';

  // Pre-compute per-employee stats.
  type Row = ReturnType<typeof statsFor>;
  function statsFor(emp: typeof team[number]) {
    const empTasks = store.tasks.filter(t => t.assigneeId === emp.id);
    const tasksDone = empTasks.filter(t => t.status === 'done').length;
    const tasksInProgress = empTasks.filter(t => t.status === 'in_progress' || t.status === 'review').length;
    const tasksNew = empTasks.filter(t => t.status === 'new').length;

    // Deal attribution: prefer the explicit ownerId on the deal; fall back to
    // free-text role fields for legacy rows without an ownerId set.
    const empNameLow = (emp.name || '').toLowerCase().trim();
    const firstNameLow = empNameLow.split(/\s+/)[0] || '';
    const matchesEmp = (val: string | undefined): boolean => {
      if (!val || !empNameLow) return false;
      const v = val.toLowerCase();
      return v.includes(empNameLow) || (firstNameLow.length > 2 && v.includes(firstNameLow));
    };
    const empDeals = store.deals.filter(d => {
      if (d.ownerId) return d.ownerId === emp.id;
      return matchesEmp(d.measurer) || matchesEmp(d.designer) || matchesEmp((d as any).foreman) || matchesEmp((d as any).architect);
    });
    const dealsClosed = empDeals.filter(d => d.status === 'completed').length;
    const dealsRejected = empDeals.filter(d => d.status === 'rejected').length;
    const dealsActive = empDeals.length - dealsRejected;
    const revenue = empDeals
      .filter(d => d.status === 'completed')
      .reduce((sum, d) => sum + (d.paidAmount || 0), 0);
    const conversion = dealsActive > 0 ? Math.round((dealsClosed / dealsActive) * 100) : 0;

    return {
      emp,
      tasksTotal: empTasks.length, tasksDone, tasksInProgress, tasksNew,
      dealsTotal: empDeals.length, dealsClosed, revenue, conversion,
    };
  }

  const rows: Row[] = team.map(statsFor).sort((a, b) => b.revenue - a.revenue);

  // Team-wide totals for the summary row at the top.
  const totals = rows.reduce(
    (acc, r) => ({
      tasksDone:   acc.tasksDone   + r.tasksDone,
      tasksTotal:  acc.tasksTotal  + r.tasksTotal,
      dealsClosed: acc.dealsClosed + r.dealsClosed,
      dealsTotal:  acc.dealsTotal  + r.dealsTotal,
      revenue:     acc.revenue     + r.revenue,
    }),
    { tasksDone: 0, tasksTotal: 0, dealsClosed: 0, dealsTotal: 0, revenue: 0 },
  );
  const teamConversion = (totals.dealsTotal > 0)
    ? Math.round((totals.dealsClosed / totals.dealsTotal) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Team summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: l('Задачи выполнено', 'Тапсырмалар орындалды', 'Tasks done'),
            value: `${totals.tasksDone} / ${totals.tasksTotal}`, icon: Target },
          { label: l('Сделок закрыто', 'Мәмілелер жабылды',       'Deals closed'),
            value: `${totals.dealsClosed} / ${totals.dealsTotal}`, icon: ShoppingBag },
          { label: l('Выручка команды',  'Команда табысы',         'Team revenue'),
            value: fmt(totals.revenue), icon: DollarSign },
          { label: l('Средняя конверсия','Орташа конверсия',       'Avg. conversion'),
            value: `${teamConversion}%`, icon: Percent },
        ].map((m, i) => (
          <div key={i} className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-gray-400">{m.label}</span>
              <m.icon className="w-4 h-4 text-gray-300" />
            </div>
            <div className="text-xl text-gray-900">{m.value}</div>
          </div>
        ))}
      </div>

      {/* Per-employee cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map(r => {
          const tasksPercent = r.tasksTotal > 0 ? (r.tasksDone / r.tasksTotal) * 100 : 0;
          return (
            <div key={r.emp.id} className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-sm text-gray-600">
                  {r.emp.name?.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900 truncate">{r.emp.name}</div>
                  <div className="text-[11px] text-gray-400 truncate">{r.emp.role} · {r.emp.email}</div>
                  {/* Niche-assignment chips — only when (a) team is
                      multi-niche AND (b) this teammate has explicit
                      direction(s) set. Missing = "works on everything",
                      which matches the default and renders nothing. */}
                  {store.secondaryNiches.length > 0 && Array.isArray((r.emp as any).nicheAssignments) && (r.emp as any).nicheAssignments.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {((r.emp as any).nicheAssignments as string[]).map(nid => {
                        const n = getNiche(nid);
                        return (
                          <span key={nid} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] ring-1 ring-emerald-100/60">
                            <NicheIcon niche={n} className="w-3 h-3" />
                            <span>{n.name[language]}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="text-center">
                  <div className="text-[10px] text-gray-400">{l('Задачи', 'Тапсырма', 'Tasks')}</div>
                  <div className="text-sm text-gray-900 mt-0.5">{r.tasksDone}<span className="text-gray-300">/{r.tasksTotal}</span></div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-400">{l('Сделки', 'Мәміле', 'Deals')}</div>
                  <div className="text-sm text-gray-900 mt-0.5">{r.dealsClosed}<span className="text-gray-300">/{r.dealsTotal}</span></div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-400">{l('Выручка', 'Табыс', 'Revenue')}</div>
                  <div className="text-sm text-gray-900 mt-0.5 whitespace-nowrap">{r.revenue > 0 ? fmt(r.revenue) : '—'}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-400">{l('Конверсия', 'Конверсия', 'Conv.')}</div>
                  <div className="text-sm text-gray-900 mt-0.5">{r.conversion}%</div>
                </div>
              </div>

              {/* Tasks progress bar */}
              <div>
                <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                  <span>{l('Выполнено задач', 'Орындалған', 'Tasks completion')}</span>
                  <span>{Math.round(tasksPercent)}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${tasksPercent}%` }}
                  />
                </div>
                {r.tasksInProgress > 0 || r.tasksNew > 0 ? (
                  <div className="flex gap-3 text-[10px] text-gray-400 mt-1.5">
                    {r.tasksInProgress > 0 && <span>{l('В работе', 'Жұмыста', 'In progress')}: {r.tasksInProgress}</span>}
                    {r.tasksNew > 0        && <span>{l('Новых', 'Жаңа',       'New')}: {r.tasksNew}</span>}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Attribution note. */}
      <div className="bg-white/40 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl px-4 py-3 text-[11px] text-slate-600 leading-relaxed">
        {l(
          'Задачи привязываются к сотруднику по полю «Исполнитель». Сделки — по полю «Ответственный»; если оно пустое, используется имя в полях «Замерщик / Дизайнер / Прораб / Архитектор». Чтобы метрика была точнее, открывайте сделку и ставьте «Ответственный».',
          'Тапсырмалар «Орындаушы» өрісі бойынша байланысады. Мәмілелер «Жауапты» өрісі арқылы; ол бос болса, «Өлшеуші / Дизайнер / Прораб / Сәулетші» өрістерінде көрсетілген аты қолданылады. Дәлірек болуы үшін мәмілеге «Жауапты» қойыңыз.',
          'Tasks are linked by Assignee. Deals are linked by Owner; if empty, the name in Measurer / Designer / Foreman / Architect is used. Set Owner on each deal for precise metrics.',
        )}
      </div>
    </div>
  );
}