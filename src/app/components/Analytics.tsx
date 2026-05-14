import { useMemo, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, ArrowUpRight, ChevronRight, ShoppingBag, DollarSign, Users, Target, BarChart3, Percent, ArrowRight, Star, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { AdAnalytics } from './AdAnalytics';
import { t } from '../utils/translations';
import { useDataStore } from '../utils/dataStore';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'ads'>('overview');
  const [selectedMaster, setSelectedMaster] = useState<string | null>(null);

  // Sales by month from completed income transactions + deal counts
  const monthlySales = useMemo(() => {
    const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    const out: { month: string; revenue: number; orders: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const revenue = store.transactions
        .filter(t => t.type === 'income' && t.status === 'completed' && t.date.startsWith(monthKey))
        .reduce((s, t) => s + t.amount, 0);
      const orders = store.deals.filter(dl => (dl.createdAt || '').slice(0, 7) === monthKey).length;
      out.push({ month: monthNames[d.getMonth()], revenue, orders });
    }
    return out;
  }, [store.transactions, store.deals]);

  // Furniture types breakdown
  const furnitureData = useMemo(() => {
    const map = new Map<string, number>();
    store.deals.forEach(d => {
      const key = d.furnitureType || 'Прочее';
      map.set(key, (map.get(key) || 0) + 1);
    });
    const total = store.deals.length || 1;
    let i = 0;
    return Array.from(map.entries()).map(([name, count]) => ({
      name,
      value: Math.round((count / total) * 100),
      color: TYPE_COLORS[i++ % TYPE_COLORS.length],
    }));
  }, [store.deals]);

  // Masters performance from employees + linked deals
  const mastersData = useMemo(() => {
    const specMap: Record<string, { ru: string; kz: string; eng: string }> = {
      admin: { ru: 'Админ', kz: 'Әкімші', eng: 'Admin' },
      manager: { ru: 'Менеджер', kz: 'Менеджер', eng: 'Manager' },
      designer: { ru: 'Дизайнер', kz: 'Дизайнер', eng: 'Designer' },
      production: { ru: 'Сборщик', kz: 'Жинаушы', eng: 'Assembler' },
      sales: { ru: 'Продажник', kz: 'Сатушы', eng: 'Sales' },
      accountant: { ru: 'Бухгалтер', kz: 'Бухгалтер', eng: 'Accountant' },
    };
    return store.employees.map(e => {
      const linked = store.deals.filter(d => d.measurer === e.name || d.designer === e.name);
      const revenue = linked.reduce((s, d) => s + d.amount, 0);
      const orders = linked.length;
      const avgCheck = orders ? Math.round(revenue / orders) : 0;
      const plan = e.salary * 25;
      const planProgress = plan ? Math.min(100, Math.round((revenue / plan) * 100)) : 0;
      return {
        name: e.name,
        avatar: e.avatar || e.name.slice(0, 1),
        specialization: specMap[e.role] || { ru: e.role, kz: e.role, eng: e.role },
        orders, revenue, avgCheck,
        trend: 0, trendAmount: 0,
        plan, planProgress,
        rating: e.performance.rating, reviewsCount: e.performance.ordersCompleted,
      };
    });
  }, [store.employees, store.deals]);

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

  const totalOrders = store.deals.length;
  const totalRevenue = store.getTotalRevenue();
  const avgCheck = store.getAverageCheck();
  const conversion = store.deals.length
    ? Math.round((store.deals.filter(d => d.status === 'completed').length / store.deals.length) * 100)
    : 0;

  const l = (ru: string, kz: string, eng: string) =>
    language === 'kz' ? kz : language === 'eng' ? eng : ru;

  const tabs = {
    overview: { kz: 'Шолу', ru: 'Обзор', eng: 'Overview' },
    ads: { kz: 'Жарнама', ru: 'Реклама', eng: 'Ads' },
  };

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
        <div>
          <p className="text-sm text-gray-400 mb-1">{t('analytics', language)}</p>
          <h1 className="text-gray-900 mb-0">
            {language === 'kz' ? 'Сатылымдар мен тиімділік' : language === 'eng' ? 'Sales & Performance' : 'Продажи и эффективность'}
          </h1>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {(Object.keys(tabs) as Array<keyof typeof tabs>).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm transition-all ${
                activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tabs[tab][language]}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'ads' ? (
        <AdAnalytics language={language} />
      ) : (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: language === 'kz' ? 'Тапсырыстар' : language === 'eng' ? 'Total Orders' : 'Всего заказов', value: totalOrders.toString(), icon: ShoppingBag },
              { label: language === 'kz' ? 'Түсім' : language === 'eng' ? 'Revenue' : 'Выручка', value: totalRevenue ? `${(totalRevenue / 1000000).toFixed(1)}М ₸` : '0 ₸', icon: DollarSign },
              { label: language === 'kz' ? 'Орташа чек' : language === 'eng' ? 'Avg Check' : 'Средний чек', value: avgCheck ? `${(avgCheck / 1000).toFixed(0)}K ₸` : '0 ₸', icon: Target },
              { label: language === 'kz' ? 'Конверсия' : language === 'eng' ? 'Conversion' : 'Конверсия', value: `${conversion}%`, icon: Percent },
            ].map((card, i) => {
              const Icon = card.icon;
              return (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-gray-400">{card.label}</span>
                    <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
                      <Icon className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                  <div className="text-xl text-gray-900 mb-1">{card.value}</div>
                  <div className="text-[11px] text-gray-400">
                    {language === 'kz' ? 'нақты деректер' : language === 'eng' ? 'live data' : 'актуальные данные'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Revenue Area Chart */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
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

            {/* Furniture Types - Donut */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-sm text-gray-900 mb-4">
                {language === 'kz' ? 'Жиһаз түрлері' : language === 'eng' ? 'Furniture Types' : 'Типы мебели'}
              </div>
              <div className="flex items-center justify-center mb-4">
                <div className="relative">
                  <PieChart width={160} height={160}>
                    <Pie
                      data={furnitureData}
                      cx={80} cy={80}
                      innerRadius={50} outerRadius={72}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {furnitureData.map((entry) => (
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
                {furnitureData.map((item, i) => (
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Masters */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="text-sm text-gray-900">
                  {language === 'kz' ? 'Шеберлер тиімділігі' : language === 'eng' ? 'Masters Performance' : 'Эффективность мастеров'}
                </div>
              </div>
              <div className="space-y-3">
                {mastersData.map((master, i) => {
                  const spec = master.specialization[language === 'kz' ? 'kz' : language === 'eng' ? 'eng' : 'ru'];
                  const planPct = master.planProgress;
                  const planColor = planPct >= 80 ? 'bg-emerald-500' : planPct >= 40 ? 'bg-amber-400' : 'bg-red-400';

                  return (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4">
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
                            <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl border border-gray-100 p-6 w-[90vw] max-w-md z-50">
                              <div className="flex items-start justify-between mb-4">
                                <Dialog.Title className="text-base text-gray-900">
                                  {l('Профиль мастера', 'Шебер профилі', 'Master profile')}: {master.name}
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

                      {/* Нижняя часть: План */}
                      <div className="pt-3 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-[11px] text-gray-400">
                            {l('План на месяц', 'Айлық жоспар', 'Monthly plan')}
                          </div>
                          <div className="text-[11px] text-gray-900">
                            {(master.revenue / 1000000).toFixed(1)}М / {(master.plan / 1000000).toFixed(0)}М ₸
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                          <div className={`h-full rounded-full ${planColor}`} style={{ width: `${planPct}%` }} />
                        </div>
                        <div className="text-[10px] text-gray-400 text-right">
                          {planPct}% {l('от плана', 'жоспардан', 'of plan')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sources */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-sm text-gray-900 mb-5">
                {language === 'kz' ? 'Клиент көздері' : language === 'eng' ? 'Client Sources' : 'Источники клиентов'}
              </div>
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
            </div>
          </div>

          {/* Sales Funnel with conversions */}
          {(() => {
            const newLeads = store.deals.filter(d => d.status === 'new').length;
            const qualified = store.deals.filter(d => ['measured', 'project-agreed', 'contract'].includes(d.status)).length;
            const inProd = store.deals.filter(d => ['production', 'assembly'].includes(d.status)).length;
            const sold = store.deals.filter(d => d.status === 'completed').length;
            const totalForFunnel = Math.max(1, newLeads + qualified + inProd + sold);
            const stages = [
              { label: language === 'kz' ? 'Жаңа лидтер' : language === 'eng' ? 'New leads' : 'Новые лиды', value: newLeads, color: 'bg-blue-500', w: 100 },
              { label: language === 'kz' ? 'Білікті лидтер' : language === 'eng' ? 'Qualified' : 'Квал. лиды', value: qualified, color: 'bg-blue-400', w: Math.round((qualified / totalForFunnel) * 100) },
              { label: language === 'kz' ? 'Өндірісте' : language === 'eng' ? 'In production' : 'В производстве', value: inProd, color: 'bg-purple-500', w: Math.round((inProd / totalForFunnel) * 100) },
              { label: language === 'kz' ? 'Сатылым' : language === 'eng' ? 'Sales' : 'Продажи', value: sold, color: 'bg-emerald-500', w: Math.round((sold / totalForFunnel) * 100) },
            ];
            const insights: string[] = [];
            return (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="text-sm text-gray-900">{language === 'kz' ? 'Воронка: көрсетуден сатылымға дейін' : language === 'eng' ? 'Funnel: from impression to sale' : 'Воронка: от показа до продажи'}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{language === 'kz' ? 'Конверсиялар мен жоғалулар' : language === 'eng' ? 'Conversions and losses' : 'Конверсии и потери'}</div>
                  </div>
                  <button className="text-xs text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
                    {language === 'kz' ? 'Не жақсартуға болады?' : language === 'eng' ? 'What to improve?' : 'Что улучшить?'}
                  </button>
                </div>

                <div className="space-y-2">
                  {stages.map((s, i) => {
                    const next = stages[i + 1];
                    const conv = next ? (next.value / s.value) * 100 : null;
                    const lost = next ? s.value - next.value : 0;
                    return (
                      <div key={i}>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-gray-700">{s.label}</span>
                              <span className="text-xs text-gray-900">{s.value.toLocaleString('ru-RU')}</span>
                            </div>
                            <div className="h-7 bg-gray-50 rounded-lg overflow-hidden">
                              <div className={`h-full ${s.color} rounded-lg`} style={{ width: `${s.w}%` }} />
                            </div>
                          </div>
                        </div>
                        {next && conv !== null && (
                          <div className="flex items-center gap-2 py-2 pl-3 text-[11px]">
                            <span className="text-gray-400">→</span>
                            <span className="text-gray-700">{conv.toFixed(1)}%</span>
                            <span className="text-red-500">
                              {language === 'kz' ? `жоғалту: ${lost.toLocaleString('ru-RU')}` : language === 'eng' ? `lost: ${lost.toLocaleString('ru-RU')}` : `теряем ${lost.toLocaleString('ru-RU')}`}
                              {' '}({(100 - conv).toFixed(1)}%)
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 space-y-2">
                  {insights.map((txt, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl">
                      <span className="text-red-500 text-xs flex-shrink-0">⚠</span>
                      <span className="text-xs text-red-700 leading-relaxed">{txt}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Materials + Orders chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Orders mini chart */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
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

            {/* Popular Materials */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-sm text-gray-900 mb-5">
                {language === 'kz' ? 'Танымал материалдар' : language === 'eng' ? 'Popular Materials' : 'Популярные материалы'}
              </div>
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}