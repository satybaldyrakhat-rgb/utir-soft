import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  TrendingUp, TrendingDown, Plus, ArrowUpRight, ArrowRight,
  Clock, CheckCircle2, Circle, ShoppingBag, Users, DollarSign,
  Package, Palette, ChevronRight, X, Sparkles,
} from 'lucide-react';
import { t } from '../utils/translations';
import { useDataStore } from '../utils/dataStore';

// Liquid-glass status palette — soft pastels with translucent fills so
// badges stay readable on top of the glassy cards.
const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  new:               { label: 'Новый',   color: 'text-sky-700     bg-sky-100/70',     icon: Circle },
  'in-progress':     { label: 'В работе',color: 'text-amber-700   bg-amber-100/70',   icon: Clock },
  measured:          { label: 'Замер',   color: 'text-violet-700  bg-violet-100/70',  icon: Package },
  'project-agreed':  { label: 'Проект',  color: 'text-violet-700  bg-violet-100/70',  icon: Palette },
  contract:          { label: 'Договор', color: 'text-sky-700     bg-sky-100/70',     icon: DollarSign },
  production:        { label: 'Произв.', color: 'text-amber-700   bg-amber-100/70',   icon: Package },
  assembly:          { label: 'Сборка',  color: 'text-yellow-700  bg-yellow-100/70',  icon: Package },
  completed:         { label: 'Готов',   color: 'text-emerald-700 bg-emerald-100/70', icon: CheckCircle2 },
  rejected:          { label: 'Отказ',   color: 'text-rose-700    bg-rose-100/70',    icon: X },
};

interface DashboardProps {
  language: 'kz' | 'ru' | 'eng';
  onNavigate?: (page: string) => void;
}

// Shared glass-card class. Centralised so every surface in the dashboard
// shares the same translucency / blur / border / shadow.
const GLASS = 'bg-white/55 backdrop-blur-2xl backdrop-saturate-150 border border-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl';
const GLASS_HOVER = 'transition-all hover:bg-white/70 hover:shadow-[0_16px_48px_-12px_rgba(15,23,42,0.18)] hover:-translate-y-0.5';

export function Dashboard({ language, onNavigate }: DashboardProps) {
  const store = useDataStore();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  // ─── Real data ─────────────────────────────────────────────────────
  const totalRevenue  = store.getTotalRevenue();
  const totalExpenses = store.getTotalExpenses();
  const activeDeals   = store.getActiveDealsCount();
  const totalClients  = store.getTotalClients();
  const averageCheck  = store.getAverageCheck();

  // Month-over-month deltas (real, no hardcoded percentages).
  const trends = (() => {
    const now = new Date();
    const thisMonthKey = now.toISOString().slice(0, 7);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = lastMonthDate.toISOString().slice(0, 7);
    const pct = (a: number, b: number) => {
      if (b === 0) return a === 0 ? '0%' : '+∞';
      const d = Math.round((a - b) / b * 100);
      return `${d >= 0 ? '+' : ''}${d}%`;
    };
    const sumIn = (key: string) => store.transactions
      .filter(t => t.type === 'income' && t.status === 'completed' && (t.date || '').startsWith(key))
      .reduce((s, t) => s + t.amount, 0);
    const dealsInMonth = (key: string) => store.deals.filter(d => (d.date || '').startsWith(key));
    const newClientsInMonth = (key: string) => {
      const names = new Set<string>();
      for (const d of dealsInMonth(key)) names.add(d.customerName);
      return names.size;
    };
    const avgCheckInMonth = (key: string) => {
      const ds = dealsInMonth(key).filter(d => d.amount > 0);
      if (ds.length === 0) return 0;
      return ds.reduce((s, d) => s + d.amount, 0) / ds.length;
    };
    const revT = sumIn(thisMonthKey);
    const revL = sumIn(lastMonthKey);
    return {
      revenue:     { txt: pct(revT, revL), up: revT >= revL },
      activeDeals: { txt: pct(dealsInMonth(thisMonthKey).length, dealsInMonth(lastMonthKey).length), up: dealsInMonth(thisMonthKey).length >= dealsInMonth(lastMonthKey).length },
      clients:     { txt: pct(newClientsInMonth(thisMonthKey), newClientsInMonth(lastMonthKey)), up: newClientsInMonth(thisMonthKey) >= newClientsInMonth(lastMonthKey) },
      avgCheck:    { txt: pct(avgCheckInMonth(thisMonthKey), avgCheckInMonth(lastMonthKey)), up: avgCheckInMonth(thisMonthKey) >= avgCheckInMonth(lastMonthKey) },
    };
  })();

  const recentOrders = [...store.deals]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTasks = store.tasks.filter(t => t.dueDate === todayStr || t.status !== 'done').slice(0, 6);
  const completedTasks = todayTasks.filter(t => t.status === 'done').length;
  const totalTasks = todayTasks.length || 1;

  const activities = store.activityLogs.slice(0, 5);
  const activityIcons: Record<string, { icon: any; bg: string; fg: string }> = {
    create: { icon: Plus,         bg: 'bg-sky-100/70',     fg: 'text-sky-700' },
    update: { icon: CheckCircle2, bg: 'bg-emerald-100/70', fg: 'text-emerald-700' },
    delete: { icon: X,            bg: 'bg-rose-100/70',    fg: 'text-rose-700' },
    login:  { icon: Users,        bg: 'bg-violet-100/70',  fg: 'text-violet-700' },
    logout: { icon: Users,        bg: 'bg-slate-100/70',   fg: 'text-slate-600' },
  };

  const incomeByDay: Record<string, number> = {};
  store.transactions.filter(t => t.type === 'income' && t.status === 'completed').forEach(tx => {
    const day = tx.date.slice(8, 10).replace(/^0/, '');
    incomeByDay[day] = (incomeByDay[day] || 0) + tx.amount;
  });
  const revenueData = Object.entries(incomeByDay).sort((a, b) => +a[0] - +b[0]).map(([day, value]) => ({ day, value }));
  if (revenueData.length === 0) revenueData.push({ day: '1', value: 0 });

  const weekdayLabels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  store.deals.forEach(d => {
    const ts = new Date(d.createdAt);
    if (!isNaN(ts.getTime())) weekdayCounts[ts.getDay()]++;
  });
  const weeklyData = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => ({
    day,
    orders: weekdayCounts[weekdayLabels.indexOf(day)],
  }));

  const getGreeting = () => {
    const hour = new Date().getHours();
    const greetings: Record<string, Record<string, string>> = {
      morning:   { kz: 'Қайырлы таң', ru: 'Доброе утро',  eng: 'Good morning' },
      afternoon: { kz: 'Қайырлы күн', ru: 'Добрый день',  eng: 'Good afternoon' },
      evening:   { kz: 'Қайырлы кеш', ru: 'Добрый вечер', eng: 'Good evening' },
    };
    const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    return greetings[period][language];
  };

  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  const today = new Date().toLocaleDateString(language === 'kz' ? 'kk-KZ' : language === 'eng' ? 'en-US' : 'ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const fmt = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)} млн ₸`;
    if (n >= 1000) return `${Math.round(n / 1000)}K ₸`;
    return `${n.toLocaleString()} ₸`;
  };

  // ─── Render ────────────────────────────────────────────────────────
  return (
    // Liquid-glass page background: a soft pastel gradient + 4 blurred
    // colour orbs painted with radial-gradients. The orbs sit on the page
    // background itself so the entire scroll height stays ambient.
    <div
      className="min-h-full relative"
      style={{
        background: `
          radial-gradient(900px circle at 0% 0%,   rgba(196,181,253,0.35), transparent 45%),
          radial-gradient(800px circle at 100% 5%, rgba(252,165,165,0.28), transparent 45%),
          radial-gradient(900px circle at 100% 70%, rgba(125,211,252,0.32), transparent 50%),
          radial-gradient(900px circle at 0% 100%, rgba(167,243,208,0.30), transparent 50%),
          linear-gradient(180deg, #fbfafd 0%, #f3f4f9 100%)
        `,
      }}
    >
      <div className="relative p-4 md:p-8 max-w-[1400px] mx-auto">

        {/* ─── Greeting ────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-[11px] text-slate-400 mb-2 capitalize tracking-widest uppercase">{today}</p>
              <h1 className="text-slate-900 mb-1 text-3xl md:text-4xl font-medium tracking-tight">{getGreeting()}</h1>
              <p className="text-sm text-slate-500">
                {l(
                  'Ваш бизнес в одном спокойном представлении',
                  'Бизнесіңіздің тыныш көрінісі',
                  'A calm overview of your business',
                )}
              </p>
            </div>
            <button
              onClick={() => onNavigate?.('sales')}
              className="group flex items-center gap-2 px-5 py-3 bg-slate-900/95 backdrop-blur-xl text-white rounded-2xl text-sm shadow-[0_8px_24px_-8px_rgba(15,23,42,0.4)] hover:shadow-[0_12px_32px_-8px_rgba(15,23,42,0.5)] hover:bg-slate-900 transition-all w-fit ring-1 ring-white/10"
            >
              <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
              {t('newOrder', language)}
            </button>
          </div>
        </div>

        {/* ─── Metric Cards ──────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: l('Выручка (мес)', 'Табыс (ай)', 'Revenue (month)'),  value: fmt(totalRevenue),  change: trends.revenue.txt,     up: trends.revenue.up,     icon: TrendingUp,  page: 'finance',   tint: 'from-violet-200/80 to-violet-100/40', iconCls: 'text-violet-700  bg-violet-100/80' },
            { label: l('Активные заказы', 'Белсенді тапсырыстар', 'Active orders'), value: String(activeDeals), change: trends.activeDeals.txt, up: trends.activeDeals.up, icon: ShoppingBag, page: 'sales',     tint: 'from-sky-200/80 to-sky-100/40',       iconCls: 'text-sky-700     bg-sky-100/80' },
            { label: l('Всего клиентов', 'Барлық клиенттер', 'Total clients'),     value: String(totalClients), change: trends.clients.txt,     up: trends.clients.up,     icon: Users,       page: 'chats',     tint: 'from-rose-200/80 to-rose-100/40',     iconCls: 'text-rose-700    bg-rose-100/80' },
            { label: l('Средний чек', 'Орташа чек', 'Avg. check'),                value: fmt(averageCheck),   change: trends.avgCheck.txt,    up: trends.avgCheck.up,    icon: DollarSign,  page: 'analytics', tint: 'from-emerald-200/80 to-emerald-100/40', iconCls: 'text-emerald-700 bg-emerald-100/80' },
          ].map((card, i) => {
            const Icon = card.icon;
            return (
              <button
                key={i}
                onClick={() => onNavigate?.(card.page)}
                className={`${GLASS} ${GLASS_HOVER} p-5 text-left relative overflow-hidden group`}
              >
                {/* Tint orb in corner — pure decoration that catches the glass */}
                <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${card.tint} blur-2xl opacity-70 group-hover:opacity-100 transition-opacity`} />
                <div className="relative">
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-[11px] text-slate-500 tracking-wide">{card.label}</span>
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${card.iconCls} ring-1 ring-white/60 backdrop-blur-xl`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl text-slate-900 tracking-tight mb-2 tabular-nums">{card.value}</div>
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

        {/* ─── Main grid: revenue + tasks ───────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Revenue chart */}
          <div
            className={`lg:col-span-2 ${GLASS} ${GLASS_HOVER} p-6 cursor-pointer`}
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
                <div className="text-[11px] text-slate-500 mt-1.5 ml-9">{l('По транзакциям этого месяца', 'Осы айдағы транзакциялар', 'Transactions this month')}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-base text-slate-900 tabular-nums tracking-tight">{fmt(totalRevenue)}</div>
                  <div className="text-[11px] text-emerald-700 flex items-center gap-1 justify-end mt-0.5">
                    <TrendingUp className="w-3 h-3" /> {l('Прибыль', 'Пайда', 'Profit')}: {fmt(totalRevenue - totalExpenses)}
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
              </div>
            </div>
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
                  formatter={(value: any) => [`${(value / 1000000).toFixed(2)} млн ₸`, l('Доход', 'Табыс', 'Revenue')]}
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
          </div>

          {/* Tasks widget */}
          {(() => {
            const overdueCount = todayTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < todayStr).length;
            const urgent = [...todayTasks]
              .filter(t => t.status !== 'done')
              .sort((a, b) => {
                const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
                return (order[a.priority || 'low'] ?? 3) - (order[b.priority || 'low'] ?? 3);
              })
              .slice(0, 3);
            const dotColor = (p?: string) =>
              p === 'urgent' || p === 'high' ? 'bg-rose-500'
              : p === 'medium'              ? 'bg-amber-400'
              :                                'bg-slate-300';
            return (
              <div className={`${GLASS} p-6 flex flex-col`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-slate-900">{l('Что нужно сделать', 'Қазір не істеу', 'What to do now')}</div>
                </div>
                <div className="text-[11px] text-slate-500 mb-4">
                  {l(`У вас ${todayTasks.length} задач на сегодня`, `Бүгін ${todayTasks.length} тапсырма`, `${todayTasks.length} tasks today`)}
                  {overdueCount > 0 && (
                    <span className="text-rose-600"> · {overdueCount} {l('просрочены', 'мерзімі өткен', 'overdue')}</span>
                  )}
                </div>

                <div className="space-y-2 flex-1">
                  {urgent.length === 0 && (
                    <div className="text-[11px] text-slate-400 py-6 text-center">{l('Нет срочных задач 🌿', 'Шұғыл тапсырма жоқ 🌿', 'No urgent tasks 🌿')}</div>
                  )}
                  {urgent.map(task => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-white/40 hover:bg-white/70 ring-1 ring-white/50 transition-all"
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor(task.priority)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-900 truncate">{task.title}</div>
                        {task.dueDate && <div className="text-[10px] text-slate-400 mt-0.5">{task.dueDate}</div>}
                      </div>
                      <button
                        onClick={() => onNavigate?.('tasks')}
                        className="text-[10px] px-2.5 py-1 bg-slate-900/90 text-white rounded-xl hover:bg-slate-900 flex-shrink-0 backdrop-blur-xl"
                      >
                        {l('Открыть', 'Ашу', 'Open')}
                      </button>
                    </div>
                  ))}
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
                    <span className="tabular-nums">{completedTasks} / {todayTasks.length}</span>
                  </div>
                  <div className="h-1.5 bg-white/60 rounded-full overflow-hidden ring-1 ring-white/40">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all"
                      style={{ width: `${(completedTasks / totalTasks) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ─── Orders + Activity ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recent orders */}
          <div className={`lg:col-span-2 ${GLASS} p-6`}>
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
                <div className="text-[11px] text-slate-400 py-8 text-center">
                  {l('Пока нет заказов — создайте первый ↑', 'Әзірге тапсырыс жоқ', 'No orders yet — create your first ↑')}
                </div>
              )}
              {recentOrders.map(deal => {
                const st = statusConfig[deal.status] || statusConfig['new'];
                const StIcon = st.icon;
                return (
                  <div
                    key={deal.id}
                    className="flex items-center gap-4 p-3 rounded-2xl bg-white/30 hover:bg-white/70 ring-1 ring-white/40 transition-all cursor-pointer group"
                    onClick={() => setSelectedOrder(deal)}
                  >
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-white/70 flex items-center justify-center text-sm text-slate-600 flex-shrink-0">
                      {deal.customerName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm text-slate-900 truncate">{deal.product}</span>
                        <span className="text-[10px] text-slate-400 font-mono">#{(deal.id || '').slice(-6)}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">{deal.customerName} · {deal.date}</div>
                    </div>
                    <div className={`hidden sm:flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full ${st.color} ring-1 ring-white/40`}>
                      <StIcon className="w-3 h-3" />
                      {st.label}
                    </div>
                    <div className="text-sm text-slate-900 text-right flex-shrink-0 tabular-nums">
                      {deal.amount > 0 ? fmt(deal.amount) : '—'}
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

          {/* Activity feed */}
          <div className={`${GLASS} p-6`}>
            <div className="flex items-center justify-between mb-5">
              <div className="text-sm text-slate-900">{l('Активность', 'Белсенділік', 'Activity')}</div>
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-full ring-1 ring-white/40">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                live
              </span>
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
                      <p className="text-[10px] text-slate-400 mt-0.5">{act.timestamp}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── Weekly orders ─────────────────────────────────── */}
        <div
          className={`mt-4 ${GLASS} ${GLASS_HOVER} p-6 cursor-pointer`}
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

        {/* ─── Order Modal (glass) ───────────────────────────── */}
        {selectedOrder && (
          <div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedOrder(null)}
          >
            <div
              className="bg-white/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl max-w-md w-full shadow-[0_24px_64px_-12px_rgba(15,23,42,0.3)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/60 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 mb-0.5 font-mono">#{(selectedOrder.id || '').slice(-6)}</div>
                  <h2 className="text-slate-900 text-lg tracking-tight">{selectedOrder.product}</h2>
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
                  <div className="w-11 h-11 bg-gradient-to-br from-violet-100 to-sky-100 ring-1 ring-white/70 rounded-2xl flex items-center justify-center text-sm text-slate-700">
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
                    <div className="text-[11px] text-slate-500">{(statusConfig[selectedOrder.status] || statusConfig.new).label}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/50 ring-1 ring-white/60 rounded-2xl p-3">
                    <div className="text-[10px] text-slate-500 mb-1">{l('Сумма', 'Сомасы', 'Amount')}</div>
                    <div className="text-sm text-slate-900 tabular-nums">{selectedOrder.amount?.toLocaleString('ru-RU')} ₸</div>
                  </div>
                  <div className="bg-emerald-100/50 ring-1 ring-white/60 rounded-2xl p-3">
                    <div className="text-[10px] text-emerald-700 mb-1">{l('Оплачено', 'Төленді', 'Paid')}</div>
                    <div className="text-sm text-emerald-700 tabular-nums">{selectedOrder.paidAmount?.toLocaleString('ru-RU')} ₸</div>
                  </div>
                </div>

                <button
                  onClick={() => { setSelectedOrder(null); onNavigate?.('sales'); }}
                  className="w-full py-3 bg-slate-900/95 text-white rounded-2xl text-sm hover:bg-slate-900 transition-colors flex items-center justify-center gap-2 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.4)]"
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
