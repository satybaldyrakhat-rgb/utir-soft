// Dashboard — landing screen after auth + onboarding.
//
// Two main modes:
//   1. Empty (deals=0 AND products=0): shows a 4-step "Start here" check-
//      list instead of a sea of zeros. Drives new users into the funnel.
//   2. Populated: niche-aware KPIs, revenue chart (period-filtered),
//      tasks widget, recent orders, activity feed, weekly orders, plus
//      an AI insight card that opens UTIR AI with a pre-filled question.
//
// Niche-aware: copy and CTAs read from src/app/utils/niches.ts so a
// stretch-ceiling business doesn't see "furniture orders" everywhere.
//
// All derived data is wrapped in useMemo so recharts doesn't re-render
// on every unrelated store mutation.

import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  TrendingUp, TrendingDown, Plus, ArrowUpRight, ArrowRight,
  Clock, CheckCircle2, Circle, ShoppingBag, Users, DollarSign,
  Package, Palette, ChevronRight, X, Sparkles, MessageCircle,
  Rocket, Wallet, AlertTriangle, ShieldCheck, Banknote, HandCoins,
} from 'lucide-react';
import { t, plural } from '../utils/translations';
import { useDataStore } from '../utils/dataStore';
import { getNiche } from '../utils/niches';
import { NicheIcon } from './NicheIcon';

// Universal pipeline statuses — these are shared across niches (the
// sales funnel itself doesn't change, only the production stages do).
// Labels are niche-neutral; "Сборка" was the one furniture-specific
// outlier and is now "Установка" (which applies to all install-based
// niches). For per-niche labels we look up niches[].productionStages
// at render time inside Recent Orders.
const statusConfig: Record<string, { ru: string; kz: string; eng: string; color: string; icon: any }> = {
  new:               { ru: 'Новый',     kz: 'Жаңа',      eng: 'New',         color: 'text-sky-700     bg-sky-100/70',     icon: Circle },
  'in-progress':     { ru: 'В работе',  kz: 'Жұмыста',   eng: 'In progress', color: 'text-amber-700   bg-amber-100/70',   icon: Clock },
  measured:          { ru: 'Замер',     kz: 'Өлшем',     eng: 'Measured',    color: 'text-violet-700  bg-violet-100/70',  icon: Package },
  'project-agreed':  { ru: 'Проект',    kz: 'Жоба',      eng: 'Project',     color: 'text-violet-700  bg-violet-100/70',  icon: Palette },
  contract:          { ru: 'Договор',   kz: 'Шарт',      eng: 'Contract',    color: 'text-sky-700     bg-sky-100/70',     icon: DollarSign },
  production:        { ru: 'Произв.',   kz: 'Өндіріс',   eng: 'Production',  color: 'text-amber-700   bg-amber-100/70',   icon: Package },
  assembly:          { ru: 'Сборка',    kz: 'Жинау',     eng: 'Assembly',    color: 'text-yellow-700  bg-yellow-100/70',  icon: Package },
  installation:      { ru: 'Установка', kz: 'Орнату',    eng: 'Installation',color: 'text-amber-700   bg-amber-100/70',   icon: Package },
  completed:         { ru: 'Готов',     kz: 'Дайын',     eng: 'Done',        color: 'text-emerald-700 bg-emerald-100/70', icon: CheckCircle2 },
  rejected:          { ru: 'Отказ',     kz: 'Бас тарту', eng: 'Rejected',    color: 'text-rose-700    bg-rose-100/70',    icon: X },
};

type PeriodKey = 'week' | 'month' | 'quarter' | 'all';

interface DashboardProps {
  language: 'kz' | 'ru' | 'eng';
  onNavigate?: (page: string) => void;
}

// Shared glass-card class — centralised so every surface shares the same
// translucency / blur / border / shadow. Matches the Auth console's
// liquid-glass treatment: frosted fill + a specular top-edge highlight
// (inset white line) that catches light like real glass, over a deep
// layered drop shadow.
const GLASS = 'bg-white/50 backdrop-blur-2xl backdrop-saturate-150 border border-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl';
const GLASS_HOVER = 'transition-all duration-300 hover:bg-white/65 hover:shadow-[0_22px_56px_-16px_rgba(15,23,42,0.26),inset_0_1px_0_0_rgba(255,255,255,0.75)] hover:-translate-y-1';

// Format KZT amount with smart units. For small businesses < 1k we keep
// the literal value so "850 ₸" isn't shown as "0K ₸".
const fmtKZT = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн ₸`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K ₸`;
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`;
};

export function Dashboard({ language, onNavigate }: DashboardProps) {
  const store = useDataStore();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  // Period filter for the revenue chart and trends. 'month' is the most
  // useful default for SMB.
  const [period, setPeriod] = useState<PeriodKey>('month');

  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const niche = getNiche(store.niche);
  const nicheName = niche.name[language];

  // ─── Empty-state detection ─────────────────────────────────────────
  // A "fresh" team has nothing in any of the data buckets. Show the
  // onboarding checklist instead of zero-filled widgets that look broken.
  const hasAnyData =
    store.deals.length > 0
    || store.products.length > 0
    || store.tasks.length > 0
    || store.transactions.length > 0;

  // ─── Permission-aware module visibility ───────────────────────────
  // KPI cards deeplink to other pages — if the user has no access to
  // that module, the card is misleading. getModuleLevel returns 'none'
  // when the role's matrix entry blocks the module.
  const canSee = (page: string) => store.getModuleLevel(page) !== 'none';

  // ─── Real numbers ─────────────────────────────────────────────────
  // KPI top line — these are still all-time across the team. The
  // period filter only affects the revenue chart + the trend % bubble.
  const totalRevenue  = store.getTotalRevenue();
  const totalExpenses = store.getTotalExpenses();
  const activeDeals   = store.getActiveDealsCount();
  const totalClients  = store.getTotalClients();
  const averageCheck  = store.getAverageCheck();

  // ─── Period helpers ───────────────────────────────────────────────
  // Returns [start, end] dates for the selected period. 'all' returns
  // null so callers know to skip filtering.
  const periodRange = useMemo<[Date, Date] | null>(() => {
    if (period === 'all') return null;
    const now = new Date();
    const start = new Date(now);
    if (period === 'week') start.setDate(now.getDate() - 6);
    else if (period === 'month') start.setMonth(now.getMonth() - 1);
    else if (period === 'quarter') start.setMonth(now.getMonth() - 3);
    start.setHours(0, 0, 0, 0);
    return [start, now];
  }, [period]);

  const periodLabel = period === 'week'    ? l('неделя',   'апта',   'week')
                    : period === 'month'   ? l('месяц',    'ай',     'month')
                    : period === 'quarter' ? l('квартал',  'тоқсан', 'quarter')
                    :                         l('всё время','барлық',  'all time');

  // Revenue for the selected period — completed income transactions within
  // the range (or all-time when period === 'all'). Keeps the KPI value in
  // sync with its "· месяц/неделя" label instead of showing all-time.
  const periodRevenue = useMemo(() => {
    if (!periodRange) return totalRevenue;
    const [s, e] = periodRange;
    return store.transactions
      .filter(tx => tx.type === 'income' && tx.status === 'completed' && tx.date &&
        new Date(tx.date).getTime() >= s.getTime() && new Date(tx.date).getTime() <= e.getTime())
      .reduce((acc, tx) => acc + tx.amount, 0);
  }, [periodRange, store.transactions, totalRevenue]);

  // ─── Trends (period-aware) ────────────────────────────────────────
  // Compares the current period to the previous period of the same
  // length. "+∞" was the worst — replaced with localized "Новое" when
  // the prior period is empty.
  const trends = useMemo(() => {
    const dash = (a: number, b: number): { txt: string; up: boolean } => {
      if (b === 0) return { txt: a === 0 ? '—' : l('Новое', 'Жаңа', 'New'), up: a >= 0 };
      const d = Math.round((a - b) / b * 100);
      return { txt: `${d >= 0 ? '+' : ''}${d}%`, up: a >= b };
    };
    const now = new Date();
    let curStart: Date, curEnd: Date, prevStart: Date, prevEnd: Date;
    if (period === 'all') {
      // For "all time" we compare this-vs-last full month as a sane proxy.
      curEnd = now;
      curStart = new Date(now.getFullYear(), now.getMonth(), 1);
      prevEnd = new Date(curStart.getTime() - 1);
      prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
    } else {
      const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
      curEnd = now;
      curStart = new Date(now.getTime() - days * 86400000);
      prevEnd = new Date(curStart.getTime() - 1);
      prevStart = new Date(prevEnd.getTime() - days * 86400000);
    }
    const inRange = (iso: string | undefined, s: Date, e: Date) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= s.getTime() && t <= e.getTime();
    };
    const sumIncome = (s: Date, e: Date) => store.transactions
      .filter(tx => tx.type === 'income' && tx.status === 'completed' && inRange(tx.date, s, e))
      .reduce((acc, tx) => acc + tx.amount, 0);
    const dealsIn = (s: Date, e: Date) => store.deals.filter(d => inRange(d.date || d.createdAt, s, e));
    const clientsIn = (s: Date, e: Date) => {
      const names = new Set<string>();
      for (const d of dealsIn(s, e)) names.add(d.customerName);
      return names.size;
    };
    const avgCheckIn = (s: Date, e: Date) => {
      const ds = dealsIn(s, e).filter(d => d.amount > 0);
      if (ds.length === 0) return 0;
      return ds.reduce((acc, d) => acc + d.amount, 0) / ds.length;
    };
    return {
      revenue:     dash(sumIncome(curStart, curEnd),  sumIncome(prevStart, prevEnd)),
      activeDeals: dash(dealsIn(curStart, curEnd).length, dealsIn(prevStart, prevEnd).length),
      clients:     dash(clientsIn(curStart, curEnd), clientsIn(prevStart, prevEnd)),
      avgCheck:    dash(avgCheckIn(curStart, curEnd), avgCheckIn(prevStart, prevEnd)),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, store.transactions, store.deals, language]);

  // ─── Revenue chart data (period-aware) ────────────────────────────
  // Bucket transactions by day within the selected period. If empty,
  // we return an empty array and the renderer shows an empty-state
  // CTA instead of a broken single-point area chart.
  const revenueData = useMemo(() => {
    const txs = store.transactions.filter(tx => tx.type === 'income' && tx.status === 'completed');
    const inWindow = periodRange
      ? txs.filter(tx => {
          if (!tx.date) return false;
          const ms = new Date(tx.date).getTime();
          return ms >= periodRange[0].getTime() && ms <= periodRange[1].getTime();
        })
      : txs;
    const byDay: Record<string, number> = {};
    inWindow.forEach(tx => {
      const day = (tx.date || '').slice(0, 10);
      if (day) byDay[day] = (byDay[day] || 0) + tx.amount;
    });
    return Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, value]) => ({ day: day.slice(5), value }));
  }, [periodRange, store.transactions]);

  // ─── Weekly orders ────────────────────────────────────────────────
  const weeklyData = useMemo(() => {
    const labels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    store.deals.forEach(d => {
      const ts = new Date(d.createdAt);
      if (!isNaN(ts.getTime())) counts[ts.getDay()]++;
    });
    return ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => ({
      day,
      orders: counts[labels.indexOf(day)],
    }));
  }, [store.deals]);

  // ─── Recent orders ────────────────────────────────────────────────
  const recentOrders = useMemo(() =>
    [...store.deals]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5),
  [store.deals]);

  // ─── Tasks (open + due today/before) ──────────────────────────────
  // Heading and filter were out of sync before. Now both speak of
  // "tasks due today or overdue" — the actually-actionable subset.
  const todayStr = new Date().toISOString().slice(0, 10);
  const openTasks = useMemo(() =>
    store.tasks.filter(t => t.status !== 'done' && (!t.dueDate || t.dueDate <= todayStr + 'Z')),
  [store.tasks, todayStr]);
  const todayDueCount = openTasks.filter(t => t.dueDate === todayStr).length;
  const overdueCount  = openTasks.filter(t => t.dueDate && t.dueDate < todayStr).length;
  const completedToday = store.tasks.filter(t => t.status === 'done' && t.completedAt?.slice(0, 10) === todayStr).length;
  const totalForBar = Math.max(1, completedToday + openTasks.length);

  // ─── Owner snapshot: деньги + точки внимания (риски) ───────────────
  // Сводка «глазами собственника»: сколько денег на руках, сколько
  // должны, и автоматические красные флаги (зависшие сделки, просрочки
  // производства/монтажа, брак, лиды без ответственного, убыток).
  // Та же логика, что в PDF-отчёте собственника (Finance → owner), но
  // живая и с переходами в нужный модуль одним кликом.
  const owner = useMemo(() => {
    const completedTx = store.transactions.filter(tx => tx.status === 'completed');
    const accBal = (acc: 'cash' | 'bank' | 'kaspi') => completedTx
      .filter(tx => (tx.account || 'bank') === acc)
      .reduce((s, tx) => s + (tx.type === 'income' ? tx.amount : -tx.amount), 0);
    const moneyTotal = accBal('cash') + accBal('bank') + accBal('kaspi');

    const activeD = store.deals.filter(d => d.status !== 'rejected');
    const recvDeals = activeD.filter(d => (d.amount || 0) > (d.paidAmount || 0));
    const receivables = recvDeals.reduce((s, d) => s + ((d.amount || 0) - (d.paidAmount || 0)), 0);

    // Прибыль за текущий месяц — для флага убыточности.
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const monthTx = completedTx.filter(tx => tx.date && new Date(tx.date).getTime() >= monthStart);
    const monthIncome = monthTx.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
    const monthExpense = monthTx.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
    const monthProfit = monthIncome - monthExpense;

    const PROD = ['production', 'assembly', 'manufacturing', 'installation'];
    const liveD = activeD.filter(d => d.status !== 'completed');
    const overdueProd = store.deals.filter(d => PROD.includes(d.status) && d.completionDate && d.completionDate < todayStr).length;
    const overdueInstall = liveD.filter(d => d.installationDate && d.installationDate < todayStr).length;
    const rework = liveD.filter(d => d.defect).length;
    const unassigned = liveD.filter(d => !d.ownerId).length;
    const staleTouch = liveD.filter(d => d.nextActionAt && d.nextActionAt < todayStr).length;

    type Risk = { id: string; sev: 'high' | 'mid'; text: string; page: string };
    const risks: Risk[] = [];
    if (monthProfit < 0) risks.push({ id: 'loss', sev: 'high', page: 'finance',
      text: l(`Месяц убыточный: расходы превышают доход на ${fmtKZT(-monthProfit)}`,
              `Ай шығынды: шығыс кірістен ${fmtKZT(-monthProfit)} артық`,
              `Month in the red: expenses exceed income by ${fmtKZT(-monthProfit)}`) });
    if (overdueInstall > 0) risks.push({ id: 'install', sev: 'high', page: 'sales',
      text: l(`${overdueInstall} ${plural(overdueInstall, 'монтаж', 'монтажа', 'монтажей')} с просроченной датой`,
              `${overdueInstall} монтаж мерзімі өтіп кеткен`,
              `${overdueInstall} installations past their date`) });
    if (overdueProd > 0) risks.push({ id: 'prod', sev: 'high', page: 'warehouse',
      text: l(`${overdueProd} ${plural(overdueProd, 'заказ', 'заказа', 'заказов')} с просроченным дедлайном производства`,
              `${overdueProd} тапсырыс өндіріс мерзімінен өтті`,
              `${overdueProd} orders past production deadline`) });
    if (rework > 0) risks.push({ id: 'rework', sev: 'mid', page: 'warehouse',
      text: l(`${rework} ${plural(rework, 'заказ', 'заказа', 'заказов')} на переделке (брак)`,
              `${rework} тапсырыс қайта жасауда (ақау)`,
              `${rework} orders in rework (defect)`) });
    if (staleTouch > 0) risks.push({ id: 'touch', sev: 'mid', page: 'sales',
      text: l(`${staleTouch} ${plural(staleTouch, 'сделка', 'сделки', 'сделок')} с просроченным следующим шагом`,
              `${staleTouch} мәміленің келесі қадамы өтіп кетті`,
              `${staleTouch} deals with an overdue next step`) });
    if (unassigned > 0) risks.push({ id: 'unassigned', sev: 'mid', page: 'sales',
      text: l(`${unassigned} ${plural(unassigned, 'активная сделка', 'активные сделки', 'активных сделок')} без ответственного`,
              `${unassigned} белсенді мәміле жауаптысыз`,
              `${unassigned} active deals without an owner`) });
    if (receivables > 0) risks.push({ id: 'recv', sev: 'mid', page: 'finance',
      text: l(`Дебиторка ${fmtKZT(receivables)} по ${recvDeals.length} ${plural(recvDeals.length, 'сделке', 'сделкам', 'сделкам')}`,
              `Дебиторлық ${fmtKZT(receivables)}, ${recvDeals.length} мәміле`,
              `Receivables ${fmtKZT(receivables)} across ${recvDeals.length} deals`) });

    return { moneyTotal, receivables, recvCount: recvDeals.length, risks };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.transactions, store.deals, todayStr, language]);

  // ─── Activity feed ────────────────────────────────────────────────
  const activities = store.activityLogs.slice(0, 5);
  const activityIcons: Record<string, { icon: any; bg: string; fg: string }> = {
    create: { icon: Plus,         bg: 'bg-sky-100/70',     fg: 'text-sky-700' },
    update: { icon: CheckCircle2, bg: 'bg-emerald-100/70', fg: 'text-emerald-700' },
    delete: { icon: X,            bg: 'bg-rose-100/70',    fg: 'text-rose-700' },
    login:  { icon: Users,        bg: 'bg-violet-100/70',  fg: 'text-violet-700' },
    logout: { icon: Users,        bg: 'bg-slate-100/70',   fg: 'text-slate-600' },
  };

  // Relative-time formatter — turns "2026-05-19T12:34:00Z" into
  // "5 мин назад" / "2 ч назад" / "вчера" so the activity feed is
  // readable at a glance instead of dumping raw ISO timestamps.
  const relTime = (iso: string | undefined): string => {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms) || ms < 0) return '—';
    const min = Math.round(ms / 60000);
    if (min < 1)    return l('только что', 'қазір ғана', 'just now');
    if (min < 60)   return l(`${min} мин назад`, `${min} мин бұрын`, `${min}m ago`);
    const hr = Math.round(min / 60);
    if (hr < 24)    return l(`${hr} ч назад`,  `${hr} сағ бұрын`,   `${hr}h ago`);
    const dd = Math.round(hr / 24);
    if (dd === 1)   return l('вчера',          'кеше',               'yesterday');
    if (dd < 7)     return l(`${dd} дн назад`, `${dd} күн бұрын`,    `${dd}d ago`);
    return new Date(iso).toLocaleDateString(language === 'eng' ? 'en-GB' : 'ru-RU', { day: '2-digit', month: 'short' });
  };

  // ─── Greeting ─────────────────────────────────────────────────────
  // Picks up the user's first name from store.profile.name so a fresh
  // sign-up sees "Доброе утро, Айым" instead of a generic greeting.
  const getGreeting = (): string => {
    const hour = new Date().getHours();
    const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const greetings: Record<string, Record<string, string>> = {
      morning:   { kz: 'Қайырлы таң', ru: 'Доброе утро',  eng: 'Good morning' },
      afternoon: { kz: 'Қайырлы күн', ru: 'Добрый день',  eng: 'Good afternoon' },
      evening:   { kz: 'Қайырлы кеш', ru: 'Добрый вечер', eng: 'Good evening' },
    };
    return greetings[period][language];
  };
  const firstName = (store.profile.name || '').split(' ')[0];

  const today = new Date().toLocaleDateString(
    language === 'kz' ? 'kk-KZ' : language === 'eng' ? 'en-US' : 'ru-RU',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  );

  // Niche-aware status label — falls back to RU label from statusConfig
  // and otherwise reads from the niche's production-stage labels (so
  // a ceilings business sees "Раскрой / Монтаж" instead of "Сборка").
  const statusLabel = (status: string): string => {
    // Universal pipeline statuses (new, measured, etc.) keep their labels —
    // they describe the SALES funnel, not the production stages.
    const cfg = statusConfig[status];
    if (cfg) return cfg[language];
    // Anything else might be a production-stage id (cutting, glazing, etc.)
    // — look it up in the niche config.
    const stage = niche.productionStages.find(s => s.id === status);
    if (stage) return stage[language];
    return status;
  };

  // ─── Skeleton while store loads ────────────────────────────────────
  // First paint of dashboard used to flash zeros, then real values
  // popped in — looked like a broken trend. Now we show a skeleton
  // grid until `store.loaded` flips.
  if (!store.loaded) {
    return (
      <div className="min-h-full relative">
        <div className="relative px-4 py-5 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
          <div className="mb-8 space-y-3">
            <div className="h-3 w-32 bg-white/60 rounded-full animate-pulse" />
            <div className="h-9 w-64 bg-white/60 rounded-2xl animate-pulse" />
            <div className="h-4 w-80 bg-white/60 rounded-full animate-pulse" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[0, 1, 2, 3].map(i => <div key={i} className={`${GLASS} h-32 animate-pulse`} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className={`lg:col-span-2 ${GLASS} h-72 animate-pulse`} />
            <div className={`${GLASS} h-72 animate-pulse`} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Empty-state checklist ────────────────────────────────────────
  // Brand-new team — drive them into the funnel with 4 concrete next
  // steps. Each step deeplinks to the relevant module so it's clear
  // where to go. Once any of these complete (deals/products/tasks/tx)
  // the full dashboard takes over.
  if (!hasAnyData) {
    const steps = [
      {
        id: 'deal',
        icon: ShoppingBag,
        title: l('Создайте первого клиента', 'Алғашқы клиентті жасаңыз', 'Create your first client'),
        desc: l(`Заведите карточку клиента и сделку — фундамент для всего остального в ${nicheName.toLowerCase()}.`,
                `Бірінші клиент картасын ашыңыз — қалғанының негізі.`,
                `Add the first client + deal — the foundation for everything else.`),
        cta: l('Открыть Заказы', 'Тапсырыстар', 'Open Orders'),
        page: 'sales',
        accent: 'from-emerald-200/80 to-emerald-100/40',
        ringCls: 'text-emerald-700 bg-emerald-100/80',
        enabled: canSee('sales'),
      },
      {
        id: 'product',
        icon: Package,
        title: l('Добавьте материалы на склад', 'Қоймаға материал қосыңыз', 'Add materials to stock'),
        desc: l(`Каталог материалов под нишу «${nicheName}» — ${niche.materialCategories.slice(0, 3).join(', ')} и др.`,
                `«${nicheName}» санатына арналған материалдар каталогы.`,
                `Material catalog for "${nicheName}" — ${niche.materialCategories.slice(0, 3).join(', ')} etc.`),
        cta: l('Открыть Склад', 'Қойма', 'Open Stock'),
        page: 'warehouse',
        accent: 'from-sky-200/80 to-sky-100/40',
        ringCls: 'text-sky-700 bg-sky-100/80',
        enabled: canSee('warehouse'),
      },
      {
        id: 'team',
        icon: Users,
        title: l('Пригласите команду', 'Командаңызды шақырыңыз', 'Invite your team'),
        desc: l(`Замерщик, дизайнер, ${niche.roleLabels.installer[language].toLowerCase()} — каждому своя роль с правами доступа.`,
                'Әр маманға өз рөлі мен қол жетімділік құқықтары.',
                'Each role with their own access rights.'),
        cta: l('Открыть Команда', 'Команда', 'Open Team'),
        page: 'settings',
        accent: 'from-violet-200/80 to-violet-100/40',
        ringCls: 'text-violet-700 bg-violet-100/80',
        enabled: canSee('settings'),
      },
      {
        id: 'integrations',
        icon: MessageCircle,
        title: l('Подключите Telegram / WhatsApp', 'Telegram / WhatsApp қосыңыз', 'Connect Telegram / WhatsApp'),
        desc: l('AI-помощник в Telegram умеет создавать сделки, оплаты и задачи голосом или текстом.',
                'AI-көмекші Telegram-да дауыспен тапсырыс жасайды.',
                'AI assistant in Telegram creates deals, payments, tasks.'),
        cta: l('Открыть Интеграции', 'Интеграциялар', 'Open Integrations'),
        page: 'settings',
        accent: 'from-amber-200/80 to-amber-100/40',
        ringCls: 'text-amber-700 bg-amber-100/80',
        enabled: canSee('settings'),
      },
    ];

    return (
      <div className="min-h-full relative">
        <div className="relative px-4 py-5 sm:p-6 lg:p-8 max-w-[1100px] mx-auto">
          {/* Greeting */}
          <div className="mb-8">
            <p className="text-[11px] text-slate-400 mb-2 capitalize tracking-widest uppercase">{today}</p>
            <h1 className="text-slate-900 mb-1 text-[26px] sm:text-3xl md:text-4xl font-medium tracking-tight">
              {getGreeting()}{firstName ? `, ${firstName}` : ''} 👋
            </h1>
            <p className="text-sm text-slate-500 max-w-2xl">
              {l(`Платформа готова под нишу «${nicheName}». Сделаем 4 шага, чтобы запустить ваш бизнес.`,
                 `Платформа «${nicheName}» салаға дайын. 4 қадамда бизнесті іске қосамыз.`,
                 `Platform is set up for "${nicheName}". Let's get you running in 4 steps.`)}
            </p>
          </div>

          {/* Niche badge */}
          <div className={`${GLASS} p-5 mb-6 flex items-center justify-between flex-wrap gap-3`}>
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-2xl bg-white/60 ring-1 ring-white/60 shadow-[0_6px_16px_-8px_rgba(15,23,42,0.18)] flex items-center justify-center text-slate-600 flex-shrink-0"><NicheIcon niche={niche} className="w-5 h-5" /></span>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">
                  {l('Ваша ниша', 'Сіздің сала', 'Your niche')}
                </div>
                <div className="text-sm text-slate-900">{nicheName}</div>
                <div className="text-[11px] text-slate-500">{niche.description[language]}</div>
              </div>
            </div>
            <button
              onClick={() => onNavigate?.('settings')}
              className="text-[11px] text-slate-500 hover:text-slate-900 flex items-center gap-1"
            >
              {l('Сменить нишу', 'Сала ауыстыру', 'Change niche')} <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* 4-step checklist */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <button
                  key={step.id}
                  onClick={() => step.enabled && onNavigate?.(step.page)}
                  disabled={!step.enabled}
                  className={`${GLASS} ${step.enabled ? GLASS_HOVER : 'opacity-60 cursor-not-allowed'} p-5 text-left relative overflow-hidden group`}
                >
                  <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${step.accent} blur-2xl opacity-70 group-hover:opacity-100 transition-opacity`} />
                  <div className="relative">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${step.ringCls} ring-1 ring-white/60`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] text-slate-400 tracking-widest">
                        {l('Шаг', 'Қадам', 'Step')} {idx + 1} / 4
                      </span>
                    </div>
                    <div className="text-sm text-slate-900 mb-1">{step.title}</div>
                    <div className="text-[11px] text-slate-500 leading-relaxed mb-3">{step.desc}</div>
                    <div className="flex items-center gap-1 text-[11px] text-emerald-700">
                      {step.cta} <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* AI helper card — invites the user to ask UTIR AI to do
              things for them via chat. The popup already has all the
              tools for creating deals / materials / employees etc. */}
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('ai-assistant:open', {
                detail: {
                  prompt: l(
                    `Заведи первую сделку: клиент Иван Петров, телефон +7..., продукт ${niche.productTypeOptions[0]?.toLowerCase() || 'заказ'}, сумма 500 000 ₸`,
                    `Бірінші мәмілені жасаңыз: клиент Иван Петров, телефон +7..., өнім ${niche.productTypeOptions[0]?.toLowerCase() || 'тапсырыс'}, сома 500 000 ₸`,
                    `Create first deal: client Ivan Petrov, phone +7..., product ${niche.productTypeOptions[0]?.toLowerCase() || 'order'}, amount 500000 KZT`,
                  ),
                },
              }));
            }}
            className={`${GLASS} ${GLASS_HOVER} mt-4 p-5 w-full text-left relative overflow-hidden group flex items-center gap-4`}
          >
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-gradient-to-br from-violet-200/80 to-indigo-100/40 blur-2xl opacity-80" />
            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center shadow-sm flex-shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="relative flex-1">
              <div className="text-sm text-slate-900 mb-0.5 flex items-center gap-2">
                {l('Или попросите AI сделать всё за вас', 'Немесе AI-ге барлығын тапсырыңыз', 'Or have AI do it for you')}
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase">live</span>
              </div>
              <div className="text-[11px] text-slate-500">
                {l('UTIR AI создаст сделку, материалы и сотрудников по вашему описанию.',
                   'UTIR AI сипаттама бойынша мәміле, материал, қызметкерлерді жасайды.',
                   'UTIR AI creates deals, materials and employees from a free-text request.')}
              </div>
            </div>
            <ArrowUpRight className="relative w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>
    );
  }

  // ─── Populated dashboard ──────────────────────────────────────────
  // KPI cards — labels are now period-aware (not the misleading "(мес)"
  // that used to display all-time data). Cards filter by visible
  // modules so a finance-blocked user doesn't see a card linking to
  // a 403 page.
  const kpiCards = [
    {
      id: 'revenue', show: canSee('finance'),
      label: l(`Выручка · ${periodLabel}`, `Табыс · ${periodLabel}`, `Revenue · ${periodLabel}`),
      value: fmtKZT(periodRevenue),
      change: trends.revenue.txt, up: trends.revenue.up,
      icon: TrendingUp, page: 'finance',
      tint: 'from-emerald-200/80 to-emerald-100/40', iconCls: 'text-emerald-700 bg-emerald-100/80',
    },
    {
      id: 'deals', show: canSee('orders') || canSee('sales'),
      label: l('Активные заказы', 'Белсенді тапсырыстар', 'Active orders'),
      value: String(activeDeals),
      change: trends.activeDeals.txt, up: trends.activeDeals.up,
      icon: ShoppingBag, page: 'sales',
      tint: 'from-sky-200/80 to-sky-100/40', iconCls: 'text-sky-700 bg-sky-100/80',
    },
    {
      id: 'clients', show: canSee('orders') || canSee('sales'),
      label: l('Всего клиентов', 'Барлық клиенттер', 'Total clients'),
      value: String(totalClients),
      change: trends.clients.txt, up: trends.clients.up,
      icon: Users, page: 'sales',
      tint: 'from-rose-200/80 to-rose-100/40', iconCls: 'text-rose-700 bg-rose-100/80',
    },
    {
      id: 'avg', show: canSee('analytics') || canSee('orders'),
      label: l('Средний чек', 'Орташа чек', 'Avg. check'),
      value: fmtKZT(averageCheck),
      change: trends.avgCheck.txt, up: trends.avgCheck.up,
      icon: DollarSign, page: 'analytics',
      tint: 'from-violet-200/80 to-violet-100/40', iconCls: 'text-violet-700 bg-violet-100/80',
    },
  ].filter(c => c.show);

  return (
    <div className="min-h-full relative">
      <div className="relative px-4 py-5 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">

        {/* ─── Greeting ────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-[11px] text-slate-400 mb-2 capitalize tracking-widest uppercase">
                {today}
                {' · '}
                <span className="inline-flex items-center gap-1 normal-case tracking-normal text-slate-500"><NicheIcon niche={niche} className="w-3 h-3" /> {nicheName}</span>
              </p>
              <h1 className="text-slate-900 mb-1 text-[26px] sm:text-3xl md:text-4xl font-medium tracking-tight">
                {getGreeting()}{firstName ? `, ${firstName}` : ''}
              </h1>
              <p className="text-sm text-slate-500">
                {l(
                  `${activeDeals > 0 ? `${activeDeals} ${plural(activeDeals, 'активный заказ', 'активных заказа', 'активных заказов')} сегодня` : 'Тихий день — самое время поработать с воронкой'}.`,
                  `${activeDeals > 0 ? `Бүгін ${activeDeals} белсенді тапсырыс` : 'Тыныш күн — воронкамен жұмыс істеу уақыты'}.`,
                  `${activeDeals > 0 ? `${activeDeals} active orders today` : 'A quiet day — good time to work the pipeline'}.`,
                )}
              </p>
            </div>
            {store.canWriteModule('sales') && (
              <button
                onClick={() => onNavigate?.('sales')}
                className="group flex items-center gap-2 px-5 py-3 bg-emerald-600 backdrop-blur-xl text-white rounded-2xl text-sm shadow-[0_8px_24px_-8px_var(--accent-shadow)] hover:shadow-[0_12px_32px_-8px_var(--accent-shadow)] hover:bg-emerald-700 transition-all w-fit ring-1 ring-white/10"
              >
                <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
                {t('newOrder', language)}
              </button>
            )}
          </div>
        </div>

        {/* ─── Period filter ─────────────────────────────────── */}
        <div className="flex items-center gap-1 mb-4 flex-wrap">
          {(['week', 'month', 'quarter', 'all'] as PeriodKey[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-2xl text-[11px] transition-all ${
                period === p
                  ? 'bg-emerald-600 text-white shadow-[0_4px_12px_-2px_var(--accent-shadow)] ring-1 ring-white/10'
                  : 'bg-white/50 text-slate-600 ring-1 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
              }`}
            >
              {p === 'week'    ? l('Неделя',   'Апта',   'Week')
               : p === 'month'   ? l('Месяц',    'Ай',     'Month')
               : p === 'quarter' ? l('Квартал',  'Тоқсан', 'Quarter')
               :                    l('Всё время','Барлық', 'All time')}
            </button>
          ))}
        </div>

        {/* ─── Metric Cards ──────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          {kpiCards.map(card => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                onClick={() => onNavigate?.(card.page)}
                className={`${GLASS} ${GLASS_HOVER} p-4 sm:p-5 text-left relative overflow-hidden group`}
              >
                <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${card.tint} blur-2xl opacity-70 group-hover:opacity-100 transition-opacity`} />
                <div className="relative">
                  <div className="flex items-start justify-between gap-2 mb-4 sm:mb-5">
                    <span className="text-[11px] text-slate-500 tracking-wide leading-tight">{card.label}</span>
                    <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-2xl flex items-center justify-center ${card.iconCls} ring-1 ring-white/60 backdrop-blur-xl flex-shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-xl sm:text-2xl text-slate-900 tracking-tight mb-2 tabular-nums">{card.value}</div>
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${card.up ? 'text-emerald-700 bg-emerald-100/60' : 'text-rose-700 bg-rose-100/60'} ring-1 ring-white/40`}>
                      {card.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {card.change}
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ─── Owner panel: деньги + точки внимания ──────────── */}
        {/* Сводка для собственника. Money-блок виден только при доступе
            к финансам; список рисков фильтруется по видимым модулям. */}
        {(() => {
          const visibleRisks = owner.risks.filter(r => canSee(r.page));
          const showMoney = canSee('finance');
          if (!showMoney && visibleRisks.length === 0) return null;
          return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
              {showMoney && (
                <div className={`${GLASS} p-5`}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-xl bg-emerald-100/70 text-emerald-700 ring-1 ring-white/60 flex items-center justify-center">
                      <Wallet className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-sm text-slate-900">{l('Деньги и долги', 'Ақша және қарыз', 'Money & debts')}</span>
                  </div>
                  <button onClick={() => onNavigate?.('finance')} className="w-full text-left group">
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
                      <Banknote className="w-3 h-3 text-emerald-600" /> {l('Деньги на счетах', 'Шоттардағы ақша', 'Money on accounts')}
                    </div>
                    <div className={`text-2xl tabular-nums tracking-tight mb-3 ${owner.moneyTotal < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{fmtKZT(owner.moneyTotal)}</div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
                      <HandCoins className="w-3 h-3 text-amber-600" /> {l('Должны нам (дебиторка)', 'Бізге қарыз (дебиторлық)', 'Owed to us (receivables)')}
                    </div>
                    <div className="text-lg tabular-nums tracking-tight text-slate-800">
                      {fmtKZT(owner.receivables)}
                      {owner.recvCount > 0 && <span className="text-[11px] text-slate-400 ml-1.5">· {owner.recvCount} {l(plural(owner.recvCount, 'сделка', 'сделки', 'сделок'), 'мәміле', 'deals')}</span>}
                    </div>
                  </button>
                </div>
              )}
              <div className={`${GLASS} p-5 ${showMoney ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-7 h-7 rounded-xl ring-1 ring-white/60 flex items-center justify-center ${visibleRisks.length > 0 ? 'bg-rose-100/70 text-rose-600' : 'bg-emerald-100/70 text-emerald-700'}`}>
                    {visibleRisks.length > 0 ? <AlertTriangle className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  </div>
                  <span className="text-sm text-slate-900">{l('Точки внимания', 'Назар аудару', 'Needs attention')}</span>
                  {visibleRisks.length > 0 && (
                    <span className="ml-auto text-[11px] text-rose-600 bg-rose-50 ring-1 ring-rose-100/60 px-2 py-0.5 rounded-full">{visibleRisks.length}</span>
                  )}
                </div>
                {visibleRisks.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 py-3">
                    <CheckCircle2 className="w-4 h-4" /> {l('Всё под контролем — критичных рисков нет', 'Бәрі бақылауда — сыни тәуекел жоқ', 'All under control — no critical risks')}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {visibleRisks.map(r => (
                      <button
                        key={r.id}
                        onClick={() => onNavigate?.(r.page)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-white/40 ring-1 ring-white/60 hover:bg-white/70 transition-all text-left group"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.sev === 'high' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                        <span className="text-[12px] text-slate-700 flex-1">{r.text}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ─── Main grid: revenue + tasks ───────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-4">
          {/* Revenue chart */}
          <div
            className={`lg:col-span-2 ${GLASS} ${GLASS_HOVER} p-5 sm:p-6 cursor-pointer`}
            onClick={() => onNavigate?.('analytics')}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-emerald-100/70 text-emerald-700 ring-1 ring-white/60 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-sm text-slate-900">{l('Доходы', 'Табыстар', 'Revenue')}</div>
                </div>
                <div className="text-[11px] text-slate-500 mt-1.5 ml-9">
                  {l(`Транзакции · ${periodLabel}`, `Транзакциялар · ${periodLabel}`, `Transactions · ${periodLabel}`)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-base text-slate-900 tabular-nums tracking-tight">{fmtKZT(totalRevenue)}</div>
                  <div className="text-[11px] text-emerald-700 flex items-center gap-1 justify-end mt-0.5">
                    <TrendingUp className="w-3 h-3" /> {l('Прибыль', 'Пайда', 'Profit')}: {fmtKZT(totalRevenue - totalExpenses)}
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
              </div>
            </div>
            {revenueData.length === 0 ? (
              // Real empty state — no fake single-point chart.
              <div className="h-[220px] flex flex-col items-center justify-center text-center px-4">
                <div className="w-12 h-12 rounded-2xl bg-white/50 ring-1 ring-white/60 flex items-center justify-center mb-3">
                  <Wallet className="w-5 h-5 text-slate-400" />
                </div>
                <div className="text-sm text-slate-700 mb-1">
                  {l(`Нет транзакций за ${periodLabel}`, `${periodLabel} транзакция жоқ`, `No transactions in ${periodLabel}`)}
                </div>
                <div className="text-[11px] text-slate-500 mb-3 max-w-sm">
                  {l('Доход появится здесь, когда вы запишете первую оплату или закроете сделку.',
                     'Бірінші төлемді жазғанда табыс осы жерде көрсетіледі.',
                     'Revenue will appear once you log the first payment or close a deal.')}
                </div>
                {canSee('finance') && (
                  <button
                    onClick={e => { e.stopPropagation(); onNavigate?.('finance'); }}
                    className="text-[11px] px-3 py-1.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors ring-1 ring-white/10"
                  >
                    {l('Открыть Финансы', 'Қаржы ашу', 'Open Finance')}
                  </button>
                )}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#10B981" stopOpacity={0.30} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94A3B8' }} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value: any) => [fmtKZT(value), l('Доход', 'Табыс', 'Revenue')]}
                    contentStyle={{
                      borderRadius: '16px',
                      border: '1px solid rgba(255,255,255,0.6)',
                      fontSize: '12px',
                      background: 'rgba(255,255,255,0.85)',
                      backdropFilter: 'blur(16px)',
                      boxShadow: '0 12px 32px -12px rgba(15,23,42,0.15)',
                    }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2.5} fill="url(#colorRevenue)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Tasks widget — heading + filter now match (open tasks
              due today or overdue), and overdue count is highlighted. */}
          <div className={`${GLASS} p-5 sm:p-6 flex flex-col`}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm text-slate-900">{l('Что нужно сделать', 'Қазір не істеу', 'What to do now')}</div>
            </div>
            <div className="text-[11px] text-slate-500 mb-4">
              {todayDueCount > 0 || overdueCount > 0
                ? l(
                    `${todayDueCount} на сегодня${overdueCount > 0 ? `, ${overdueCount} просрочено` : ''}`,
                    `Бүгін ${todayDueCount}${overdueCount > 0 ? `, ${overdueCount} мерзімі өткен` : ''}`,
                    `${todayDueCount} due today${overdueCount > 0 ? `, ${overdueCount} overdue` : ''}`,
                  )
                : openTasks.length > 0
                  ? l(`${openTasks.length} открытых задач`, `${openTasks.length} ашық тапсырма`, `${openTasks.length} open tasks`)
                  : l('Сегодня всё под контролем 🌿', 'Бүгін бәрі бақылауда 🌿', 'All caught up 🌿')}
            </div>

            <div className="space-y-2 flex-1">
              {openTasks.length === 0 ? (
                <div className="py-6 text-center">
                  <div className="text-[11px] text-slate-400 mb-2">{l('Нет открытых задач', 'Ашық тапсырма жоқ', 'No open tasks')}</div>
                  {store.canWriteModule('tasks') && (
                    <button
                      onClick={() => onNavigate?.('tasks')}
                      className="text-[10px] px-2.5 py-1 bg-white/70 hover:bg-white ring-1 ring-white/60 rounded-xl text-slate-700 transition-colors"
                    >
                      {l('+ Создать задачу', '+ Тапсырма жасау', '+ Create task')}
                    </button>
                  )}
                </div>
              ) : (
                openTasks
                  .sort((a, b) => {
                    const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
                    return (order[a.priority || 'low'] ?? 3) - (order[b.priority || 'low'] ?? 3);
                  })
                  .slice(0, 3)
                  .map(task => {
                    const isOverdue = task.dueDate && task.dueDate < todayStr;
                    return (
                      <div
                        key={task.id}
                        className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-white/40 hover:bg-white/70 ring-1 ring-white/50 transition-all"
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          task.priority === 'urgent' || task.priority === 'high' ? 'bg-rose-500'
                          : task.priority === 'medium' ? 'bg-amber-400' : 'bg-slate-300'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-slate-900 truncate">{task.title}</div>
                          {task.dueDate && (
                            <div className={`text-[10px] mt-0.5 ${isOverdue ? 'text-rose-600' : 'text-slate-400'}`}>
                              {task.dueDate}{isOverdue && ` · ${l('просрочена', 'мерзімі өтті', 'overdue')}`}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => onNavigate?.('tasks')}
                          className="text-[10px] px-2.5 py-1 bg-emerald-600/90 text-white rounded-xl hover:bg-emerald-700 flex-shrink-0 backdrop-blur-xl"
                        >
                          {l('Открыть', 'Ашу', 'Open')}
                        </button>
                      </div>
                    );
                  })
              )}
            </div>

            <button
              onClick={() => onNavigate?.('tasks')}
              className="text-[11px] text-slate-500 hover:text-slate-900 mt-3 flex items-center gap-1 self-start"
            >
              {l('Все задачи', 'Барлық тапсырмалар', 'All tasks')} <ArrowUpRight className="w-3 h-3" />
            </button>

            <div className="mt-4 pt-4 border-t border-white/60">
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
                <span>{l('Выполнено сегодня', 'Бүгін орындалды', 'Done today')}</span>
                <span className="tabular-nums">{completedToday} / {totalForBar}</span>
              </div>
              <div className="h-1.5 bg-white/60 rounded-full overflow-hidden ring-1 ring-white/40">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all"
                  style={{ width: `${(completedToday / totalForBar) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Orders + Activity ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Recent orders */}
          <div className={`lg:col-span-2 ${GLASS} p-5 sm:p-6`}>
            <div className="flex items-center justify-between mb-5">
              <div className="text-sm text-slate-900">{l('Последние заказы', 'Соңғы тапсырыстар', 'Recent orders')}</div>
              <button
                onClick={() => onNavigate?.('sales')}
                className="text-[11px] text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors"
              >
                {l('Все заказы', 'Барлық тапсырыстар', 'All orders')} <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {recentOrders.length === 0 && (
                <div className="py-8 text-center">
                  <Rocket className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                  <div className="text-[11px] text-slate-500 mb-2">
                    {l('Пока нет заказов', 'Әзірге тапсырыс жоқ', 'No orders yet')}
                  </div>
                  {store.canWriteModule('sales') && (
                    <button
                      onClick={() => onNavigate?.('sales')}
                      className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
                    >
                      <Plus className="w-3 h-3" />{l('Создать первый заказ', 'Бірінші тапсырыс', 'Create first order')}
                    </button>
                  )}
                </div>
              )}
              {recentOrders.map(deal => {
                const st = statusConfig[deal.status] || statusConfig['new'];
                const StIcon = st.icon;
                return (
                  <div
                    key={deal.id}
                    className="flex items-center gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-2xl bg-white/30 hover:bg-white/70 ring-1 ring-white/40 transition-all cursor-pointer group"
                    onClick={() => setSelectedOrder(deal)}
                  >
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-white/70 flex items-center justify-center text-sm text-slate-600 flex-shrink-0">
                      {deal.customerName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm text-slate-900 truncate">{deal.product || statusLabel(deal.status)}</span>
                        <span className="text-[10px] text-slate-400 font-mono">#{(deal.id || '').slice(-6)}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">{deal.customerName} · {deal.date}</div>
                    </div>
                    <div className={`hidden sm:flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full ${st.color} ring-1 ring-white/40`}>
                      <StIcon className="w-3 h-3" />
                      {statusLabel(deal.status)}
                    </div>
                    <div className="text-sm text-slate-900 text-right flex-shrink-0 tabular-nums">
                      {deal.amount > 0 ? fmtKZT(deal.amount) : '—'}
                    </div>
                    <div className="w-16 h-1 bg-white/60 rounded-full overflow-hidden flex-shrink-0 hidden md:block ring-1 ring-white/40">
                      <div
                        className={`h-full rounded-full ${deal.progress === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-sky-400 to-violet-400'}`}
                        style={{ width: `${deal.progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity feed — "live" badge removed (was a lie, no polling).
              Timestamp now relative-formatted for readability. */}
          <div className={`${GLASS} p-5 sm:p-6`}>
            <div className="flex items-center justify-between mb-5">
              <div className="text-sm text-slate-900">{l('Активность', 'Белсенділік', 'Activity')}</div>
              <span className="text-[10px] text-slate-400">{activities.length}</span>
            </div>
            <div className="space-y-4">
              {activities.length === 0 && (
                <div className="text-[11px] text-slate-400 py-6 text-center">
                  {l('Пока тишина...', 'Әзірге тыныш...', 'Quiet so far...')}
                </div>
              )}
              {activities.map((act, i) => {
                const ai = activityIcons[act.type] || activityIcons.update;
                const Icon = ai.icon;
                return (
                  <div
                    key={act.id}
                    className="flex gap-3 cursor-pointer hover:bg-white/50 rounded-2xl p-2 -m-2 transition-colors"
                    onClick={() => act.page && onNavigate?.(act.page)}
                  >
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${ai.bg} ${ai.fg} ring-1 ring-white/60`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      {i < activities.length - 1 && <div className="w-px h-full bg-white/60 mt-1" />}
                    </div>
                    <div className="pb-4 flex-1 min-w-0">
                      <p className="text-xs text-slate-700 truncate">{act.user}: {act.action} — {act.target}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{relTime(act.timestamp)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── Weekly orders — real empty state ─────────────── */}
        {store.deals.length > 0 ? (
          <div
            className={`mt-3 sm:mt-4 ${GLASS} ${GLASS_HOVER} p-5 sm:p-6 cursor-pointer`}
            onClick={() => onNavigate?.('analytics')}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="text-sm text-slate-900">{l('Заказы по дням', 'Тапсырыстар күн бойынша', 'Orders by weekday')}</div>
              <div className="text-[11px] text-slate-500 px-2 py-0.5 rounded-full bg-white/50 ring-1 ring-white/40">
                {store.deals.length} {l('заказов', 'тапсырыс', 'orders')}
              </div>
            </div>
            <div className="flex items-end gap-2 h-24">
              {weeklyData.map(d => {
                const maxOrders = Math.max(...weeklyData.map(w => w.orders), 1);
                const height = Math.max(8, (d.orders / maxOrders) * 64);
                const isMax = d.orders === maxOrders && d.orders > 0;
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-2 justify-end">
                    <span className="text-[10px] text-slate-500 tabular-nums">{d.orders}</span>
                    <div
                      className={`w-full rounded-xl transition-all ${
                        isMax
                          ? 'bg-gradient-to-t from-slate-900 to-slate-700 shadow-[0_4px_12px_rgba(15,23,42,0.2)]'
                          : 'bg-white/60 ring-1 ring-white/50 hover:bg-white/80'
                      }`}
                      style={{ height: `${height}px` }}
                    />
                    <span className={`text-[10px] ${isMax ? 'text-slate-900' : 'text-slate-400'}`}>{d.day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ─── AI insight card — invites the user to ask UTIR AI
             a question about their numbers. The popup already has
             finance context, tools, and conversation memory. */}
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('ai-assistant:open', {
              detail: {
                prompt: l(
                  'Сделай сводку по бизнесу за месяц: выручка, топ клиенты, рискованные сделки.',
                  'Ай бойынша қорытынды: табыс, топ клиенттер, тәуекелді мәмілелер.',
                  'Monthly business summary: revenue, top clients, at-risk deals.',
                ),
              },
            }));
          }}
          className={`mt-4 ${GLASS} ${GLASS_HOVER} p-5 w-full text-left relative overflow-hidden group flex items-center gap-4`}
        >
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-gradient-to-br from-violet-200/80 to-indigo-100/40 blur-2xl opacity-80" />
          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center shadow-sm flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="relative flex-1">
            <div className="text-sm text-slate-900 mb-0.5 flex items-center gap-2">
              {l('Спросить AI о бизнесе', 'AI-ден бизнес туралы сұрау', 'Ask AI about your business')}
            </div>
            <div className="text-[11px] text-slate-500">
              {l('UTIR AI разберёт ваши цифры и предложит что улучшить — и сразу запишет действия.',
                 'UTIR AI цифрларды талдап, әрекеттерді жазады.',
                 'UTIR AI analyzes your numbers and records actions on the spot.')}
            </div>
          </div>
          <ArrowUpRight className="relative w-4 h-4 text-slate-400" />
        </button>

        {/* ─── Order Modal (glass) ───────────────────────────── */}
        {selectedOrder && (
          <div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedOrder(null)}
          >
            <div
              className="bg-white/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl max-w-md w-full shadow-[0_24px_64px_-12px_var(--accent-shadow-sm)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/60 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 mb-0.5 font-mono">#{(selectedOrder.id || '').slice(-6)}</div>
                  <h2 className="text-slate-900 text-lg tracking-tight">{selectedOrder.product || statusLabel(selectedOrder.status)}</h2>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-9 h-9 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-2xl flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-gradient-to-br from-emerald-100 to-teal-100 ring-1 ring-white/70 rounded-2xl flex items-center justify-center text-sm text-slate-700">
                    {selectedOrder.customerName?.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm text-slate-900">{selectedOrder.customerName}</div>
                    <div className="text-[11px] text-slate-500">{selectedOrder.phone}</div>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 mb-2">{l('Прогресс', 'Прогресс', 'Progress')}</div>
                  <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden ring-1 ring-white/40">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all"
                      style={{ width: `${selectedOrder.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <div className="text-[11px] text-slate-500 tabular-nums">{selectedOrder.progress}%</div>
                    <div className="text-[11px] text-slate-500">{statusLabel(selectedOrder.status)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/50 ring-1 ring-white/60 rounded-2xl p-3">
                    <div className="text-[10px] text-slate-500 mb-1">{l('Сумма', 'Сомасы', 'Amount')}</div>
                    <div className="text-sm text-slate-900 tabular-nums">{(selectedOrder.amount || 0).toLocaleString('ru-RU')} ₸</div>
                  </div>
                  <div className="bg-emerald-100/50 ring-1 ring-white/60 rounded-2xl p-3">
                    <div className="text-[10px] text-emerald-700 mb-1">{l('Оплачено', 'Төленді', 'Paid')}</div>
                    <div className="text-sm text-emerald-700 tabular-nums">{(selectedOrder.paidAmount || 0).toLocaleString('ru-RU')} ₸</div>
                  </div>
                </div>

                <button
                  onClick={() => { setSelectedOrder(null); onNavigate?.('sales'); }}
                  className="w-full py-3 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-[0_8px_24px_-8px_var(--accent-shadow)]"
                >
                  {l('Открыть заказ', 'Тапсырысты ашу', 'Open order')}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
