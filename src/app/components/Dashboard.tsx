import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  TrendingUp, TrendingDown, Plus, ArrowUpRight, ArrowRight,
  Clock, CheckCircle2, Circle, ShoppingBag, Users, DollarSign,
  Package, Palette, Truck, ChevronRight, MessageCircle, X
} from 'lucide-react';
import { t } from '../utils/translations';
import { useDataStore } from '../utils/dataStore';

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  new: { label: 'Новый', color: 'text-blue-600 bg-blue-50', icon: Circle },
  'in-progress': { label: 'В работе', color: 'text-orange-600 bg-orange-50', icon: Clock },
  measured: { label: 'Замер', color: 'text-purple-600 bg-purple-50', icon: Package },
  'project-agreed': { label: 'Проект', color: 'text-purple-600 bg-purple-50', icon: Palette },
  contract: { label: 'Договор', color: 'text-blue-600 bg-blue-50', icon: DollarSign },
  production: { label: 'Произв.', color: 'text-orange-600 bg-orange-50', icon: Package },
  assembly: { label: 'Сборка', color: 'text-yellow-600 bg-yellow-50', icon: Package },
  completed: { label: 'Готов', color: 'text-green-600 bg-green-50', icon: CheckCircle2 },
  rejected: { label: 'Отказ', color: 'text-red-600 bg-red-50', icon: X },
};

interface DashboardProps {
  language: 'kz' | 'ru' | 'eng';
  onNavigate?: (page: string) => void;
}

export function Dashboard({ language, onNavigate }: DashboardProps) {
  const store = useDataStore();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  // Computed from real data
  const totalRevenue = store.getTotalRevenue();
  const totalExpenses = store.getTotalExpenses();
  const activeDeals = store.getActiveDealsCount();
  const totalClients = store.getTotalClients();
  const averageCheck = store.getAverageCheck();
  const pipeline = store.getTotalPipeline();

  // Month-over-month deltas — real numbers replacing the old hardcoded
  // «+12.5%» / «+15.3%» trends. Compares the current calendar month with
  // the previous one across income transactions, active deals, new clients,
  // and average check. Returns the signed % string ready for display.
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
      revenue:    { txt: pct(revT, revL), up: revT >= revL },
      activeDeals: { txt: pct(dealsInMonth(thisMonthKey).length, dealsInMonth(lastMonthKey).length), up: dealsInMonth(thisMonthKey).length >= dealsInMonth(lastMonthKey).length },
      clients:    { txt: pct(newClientsInMonth(thisMonthKey), newClientsInMonth(lastMonthKey)), up: newClientsInMonth(thisMonthKey) >= newClientsInMonth(lastMonthKey) },
      avgCheck:   { txt: pct(avgCheckInMonth(thisMonthKey), avgCheckInMonth(lastMonthKey)), up: avgCheckInMonth(thisMonthKey) >= avgCheckInMonth(lastMonthKey) },
    };
  })();

  // Recent orders from deals (sorted by date, take 5)
  const recentOrders = [...store.deals]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  // Today's tasks
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTasks = store.tasks.filter(t => t.dueDate === todayStr || t.status !== 'done').slice(0, 6);
  const completedTasks = todayTasks.filter(t => t.status === 'done').length;
  const totalTasks = todayTasks.length || 1;

  // Activity from store
  const activities = store.activityLogs.slice(0, 5);
  const activityIcons: Record<string, { icon: any; color: string }> = {
    create: { icon: Plus, color: 'text-blue-500 bg-blue-50' },
    update: { icon: CheckCircle2, color: 'text-green-500 bg-green-50' },
    delete: { icon: X, color: 'text-red-500 bg-red-50' },
    login: { icon: Users, color: 'text-purple-500 bg-purple-50' },
    logout: { icon: Users, color: 'text-gray-500 bg-gray-50' },
  };

  // Revenue chart data from transactions
  const incomeByDay: Record<string, number> = {};
  store.transactions.filter(t => t.type === 'income' && t.status === 'completed').forEach(tx => {
    const day = tx.date.slice(8, 10).replace(/^0/, '');
    incomeByDay[day] = (incomeByDay[day] || 0) + tx.amount;
  });
  const revenueData = Object.entries(incomeByDay).sort((a, b) => +a[0] - +b[0]).map(([day, value]) => ({ day, value }));
  if (revenueData.length === 0) revenueData.push({ day: '1', value: 0 });

  // Deals per weekday based on createdAt
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
      morning: { kz: 'Қайырлы таң', ru: 'Доброе утро', eng: 'Good morning' },
      afternoon: { kz: 'Қайырлы күн', ru: 'Добрый день', eng: 'Good afternoon' },
      evening: { kz: 'Қайырлы кеш', ru: 'Добрый вечер', eng: 'Good evening' },
    };
    const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    return greetings[period][language];
  };

  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  const today = new Date().toLocaleDateString(language === 'kz' ? 'kk-KZ' : language === 'eng' ? 'en-US' : 'ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const fmt = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)} млн ₸`;
    if (n >= 1000) return `${Math.round(n / 1000)}K ₸`;
    return `${n.toLocaleString()} ₸`;
  };

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      {/* Greeting */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-sm text-gray-400 mb-1 capitalize">{today}</p>
            <h1 className="text-gray-900 mb-0">{getGreeting()}</h1>
          </div>
          <button
            onClick={() => onNavigate?.('sales')}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 transition-colors w-fit"
          >
            <Plus className="w-4 h-4" />
            {t('newOrder', language)}
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: l('Выручка (мес)', 'Табыс (ай)', 'Revenue (month)'), value: fmt(totalRevenue), change: trends.revenue.txt, up: trends.revenue.up, icon: TrendingUp, page: 'finance' },
          { label: l('Активные заказы', 'Белсенді тапсырыстар', 'Active orders'), value: String(activeDeals), change: trends.activeDeals.txt, up: trends.activeDeals.up, icon: ShoppingBag, page: 'sales' },
          { label: l('Всего клиентов', 'Барлық клиенттер', 'Total clients'), value: String(totalClients), change: trends.clients.txt, up: trends.clients.up, icon: Users, page: 'chats' },
          { label: l('Средний чек', 'Орташа чек', 'Avg. check'), value: fmt(averageCheck), change: trends.avgCheck.txt, up: trends.avgCheck.up, icon: DollarSign, page: 'analytics' },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              onClick={() => onNavigate?.(card.page)}
              className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-gray-400">{card.label}</span>
                <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-gray-100 transition-colors">
                  <Icon className="w-4 h-4 text-gray-400" />
                </div>
              </div>
              <div className="text-xl text-gray-900 mb-1">{card.value}</div>
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-1 text-xs ${card.up ? 'text-green-600' : 'text-red-500'}`}>
                  {card.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {card.change}
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Revenue Chart */}
        <div
          className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 cursor-pointer hover:shadow-sm transition-all"
          onClick={() => onNavigate?.('analytics')}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-sm text-gray-900">{l('Доходы', 'Табыстар', 'Revenue')}</div>
              <div className="text-xs text-gray-400 mt-0.5">{l('По транзакциям', 'Транзакциялар бойынша', 'By transactions')}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm text-gray-900">{fmt(totalRevenue)}</div>
                <div className="text-xs text-green-600 flex items-center gap-1 justify-end">
                  <TrendingUp className="w-3 h-3" /> {l('Прибыль', 'Пайда', 'Profit')}: {fmt(totalRevenue - totalExpenses)}
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-gray-300" />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
              <YAxis hide />
              <Tooltip
                formatter={(value: any) => [`${(value / 1000000).toFixed(2)} млн ₸`, l('Доход', 'Табыс', 'Revenue')]}
                contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
              />
              <Area type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2} fill="url(#colorRevenue)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Tasks widget — what to do now */}
        {(() => {
          const overdueCount = todayTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < todayStr).length;
          const urgent = [...todayTasks]
            .filter(t => t.status !== 'done')
            .sort((a, b) => {
              const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
              return (order[a.priority || 'low'] ?? 3) - (order[b.priority || 'low'] ?? 3);
            })
            .slice(0, 3);
          const dotColor = (p?: string) => p === 'urgent' || p === 'high' ? 'bg-red-500' : p === 'medium' ? 'bg-yellow-500' : 'bg-gray-300';
          return (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-gray-900">{l('Что нужно сделать сейчас', 'Қазір не істеу керек', 'What to do now')}</div>
              </div>
              <div className="text-xs text-gray-500 mb-4">
                {l(`У вас ${todayTasks.length} задач на сегодня`, `Бүгін ${todayTasks.length} тапсырма`, `You have ${todayTasks.length} tasks today`)}
                {overdueCount > 0 && (
                  <span className="text-red-500"> · {overdueCount} {l('просрочены', 'мерзімі өткен', 'overdue')}</span>
                )}
              </div>

              <div className="space-y-2 flex-1">
                {urgent.length === 0 && (
                  <div className="text-xs text-gray-400 py-4 text-center">{l('Нет срочных задач', 'Шұғыл тапсырма жоқ', 'No urgent tasks')}</div>
                )}
                {urgent.map(task => (
                  <div key={task.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor(task.priority)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-900 truncate">{task.title}</div>
                      {task.dueDate && <div className="text-[10px] text-gray-400 mt-0.5">{task.dueDate}</div>}
                    </div>
                    <button
                      onClick={() => onNavigate?.('tasks')}
                      className="text-[10px] px-2.5 py-1 bg-gray-900 text-white rounded-lg hover:bg-gray-800 flex-shrink-0"
                    >
                      {l('Открыть', 'Ашу', 'Open')}
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => onNavigate?.('tasks')}
                className="text-xs text-gray-500 hover:text-gray-900 mt-3 flex items-center gap-1 self-start"
              >
                {l('Все задачи', 'Барлық тапсырмалар', 'All tasks')} <ArrowUpRight className="w-3 h-3" />
              </button>

              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1.5">
                  <span>{l('Выполнено сегодня', 'Бүгін орындалды', 'Done today')}</span>
                  <span>{completedTasks} / {todayTasks.length}</span>
                </div>
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(completedTasks / totalTasks) * 100}%` }} />
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Orders + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="text-sm text-gray-900">{l('Последние заказы', 'Соңғы тапсырыстар', 'Recent orders')}</div>
            <button onClick={() => onNavigate?.('sales')} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors">
              {l('Все заказы', 'Барлық тапсырыстар', 'All orders')} <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {recentOrders.map(deal => {
              const st = statusConfig[deal.status] || statusConfig['new'];
              const StIcon = st.icon;
              return (
                <div
                  key={deal.id}
                  className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer group"
                  onClick={() => setSelectedOrder(deal)}
                >
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-sm text-gray-500 flex-shrink-0">
                    {deal.customerName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm text-gray-900 truncate">{deal.product}</span>
                      <span className="text-[10px] text-gray-400">#{deal.id}</span>
                    </div>
                    <div className="text-xs text-gray-400">{deal.customerName} · {deal.date}</div>
                  </div>
                  <div className={`hidden sm:flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg ${st.color}`}>
                    <StIcon className="w-3 h-3" />
                    {st.label}
                  </div>
                  <div className="text-sm text-gray-900 text-right flex-shrink-0">
                    {deal.amount > 0 ? fmt(deal.amount) : '—'}
                  </div>
                  <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden flex-shrink-0 hidden md:block">
                    <div className={`h-full rounded-full ${deal.progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${deal.progress}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="text-sm text-gray-900">{l('Активность', 'Белсенділік', 'Activity')}</div>
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </div>
          <div className="space-y-4">
            {activities.map((act, i) => {
              const ai = activityIcons[act.type] || activityIcons.update;
              const Icon = ai.icon;
              return (
                <div key={act.id} className="flex gap-3 cursor-pointer hover:bg-gray-50 rounded-lg p-1.5 -m-1.5 transition-colors" onClick={() => act.page && onNavigate?.(act.page)}>
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ai.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    {i < activities.length - 1 && <div className="w-px h-full bg-gray-100 mt-1" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-xs text-gray-700">{act.user}: {act.action} — {act.target}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{act.timestamp}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Weekly Overview */}
      <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-5 cursor-pointer hover:shadow-sm transition-all" onClick={() => onNavigate?.('analytics')}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-900">{l('Заказы по статусам', 'Тапсырыстар статустары', 'Orders by status')}</div>
          <div className="text-xs text-gray-400">{store.deals.length} {l('заказов', 'тапсырыс', 'orders')}</div>
        </div>
        <div className="flex items-end gap-2">
          {weeklyData.map((d, i) => {
            const maxOrders = Math.max(...weeklyData.map(w => w.orders));
            const height = Math.max(16, (d.orders / maxOrders) * 64);
            const isMax = d.orders === maxOrders;
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-[10px] text-gray-500">{d.orders}</span>
                <div className={`w-full rounded-lg transition-colors ${isMax ? 'bg-gray-900' : 'bg-gray-100 hover:bg-gray-200'}`} style={{ height: `${height}px` }} />
                <span className={`text-[10px] ${isMax ? 'text-gray-900' : 'text-gray-400'}`}>{d.day}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Order Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedOrder(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-400 mb-0.5">#{selectedOrder.id}</div>
                <h2 className="text-gray-900">{selectedOrder.product}</h2>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-sm text-gray-500">
                  {selectedOrder.customerName?.charAt(0)}
                </div>
                <div>
                  <div className="text-sm text-gray-900">{selectedOrder.customerName}</div>
                  <div className="text-xs text-gray-400">{selectedOrder.phone}</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-400 mb-2">{l('Прогресс', 'Прогресс', 'Progress')}</div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${selectedOrder.progress}%` }} />
                </div>
                <div className="flex justify-between mt-1">
                  <div className="text-xs text-gray-400">{selectedOrder.progress}%</div>
                  <div className="text-xs text-gray-400">{(statusConfig[selectedOrder.status] || statusConfig.new).label}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-[10px] text-gray-400 mb-1">{l('Сумма', 'Сомасы', 'Amount')}</div>
                  <div className="text-sm text-gray-900">{selectedOrder.amount?.toLocaleString('ru-RU')} ₸</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-[10px] text-gray-400 mb-1">{l('Оплачено', 'Төленді', 'Paid')}</div>
                  <div className="text-sm text-green-600">{selectedOrder.paidAmount?.toLocaleString('ru-RU')} ₸</div>
                </div>
              </div>

              <button
                onClick={() => { setSelectedOrder(null); onNavigate?.('sales'); }}
                className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                {l('Открыть заказ', 'Тапсырысты ашу', 'Open order')}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
