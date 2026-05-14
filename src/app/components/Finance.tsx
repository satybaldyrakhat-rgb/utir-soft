import { useState, useRef, useEffect } from 'react';
import { OrderManagement } from './finance/OrderManagement';
import { PaymentCalendar } from './finance/PaymentCalendar';
import { Taxes } from './finance/Taxes';
import { CashFlow } from './finance/CashFlow';
import { ProfitLoss } from './finance/ProfitLoss';
import { Balance } from './finance/Balance';
import {
  ShoppingBag, Calendar, Receipt, ArrowDownUp, TrendingUp, Wallet,
  ArrowUpRight, ArrowDownRight, Download, Clock, AlertCircle, FileText, Sparkles, ChevronDown,
} from 'lucide-react';
import { useDataStore } from '../utils/dataStore';

interface FinanceProps { language: 'kz' | 'ru' | 'eng'; }

const TAB_GROUPS = [
  {
    titleRu: 'Операции', titleKz: 'Операциялар', titleEng: 'Operations',
    tabs: [
      { id: 'orders' as const, icon: ShoppingBag, ru: 'Заказы', kz: 'Тапсырыстар', eng: 'Orders' },
      { id: 'calendar' as const, icon: Calendar, ru: 'Календарь', kz: 'Күнтізбе', eng: 'Calendar' },
      { id: 'cashflow' as const, icon: ArrowDownUp, ru: 'Поток', kz: 'Ағын', eng: 'Cash flow' },
    ],
  },
  {
    titleRu: 'Отчётность', titleKz: 'Есеп', titleEng: 'Reports',
    tabs: [
      { id: 'profitloss' as const, icon: TrendingUp, ru: 'Прибыль', kz: 'Пайда', eng: 'P&L' },
      { id: 'balance' as const, icon: Wallet, ru: 'Баланс', kz: 'Баланс', eng: 'Balance' },
      { id: 'taxes' as const, icon: Receipt, ru: 'Налоги', kz: 'Салық', eng: 'Taxes' },
    ],
  },
];

type TabId = 'orders' | 'calendar' | 'cashflow' | 'profitloss' | 'balance' | 'taxes';

const MONTH_NAMES_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

export function Finance({ language }: FinanceProps) {
  const store = useDataStore();
  const [activeTab, setActiveTab] = useState<TabId>('orders');
  const [chartRange, setChartRange] = useState<'7d' | '30d' | '6m' | '12m'>('6m');
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadRef = useRef<HTMLDivElement>(null);
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  // Build 6-month revenue/expense/profit series from real transactions.
  const CHART_DATA = (() => {
    const now = new Date();
    const result: { m: string; revenue: number; expenses: number; profit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const yearShort = String(d.getFullYear()).slice(2);
      const monthRevenue = store.transactions
        .filter(t => t.type === 'income' && t.status === 'completed' && t.date.startsWith(key))
        .reduce((s, t) => s + t.amount, 0) / 1_000_000;
      const monthExpenses = store.transactions
        .filter(t => t.type === 'expense' && t.status === 'completed' && t.date.startsWith(key))
        .reduce((s, t) => s + t.amount, 0) / 1_000_000;
      result.push({
        m: `${MONTH_NAMES_RU[d.getMonth()]} ${yearShort}`,
        revenue: +monthRevenue.toFixed(2),
        expenses: +monthExpenses.toFixed(2),
        profit: +(monthRevenue - monthExpenses).toFixed(2),
      });
    }
    return result;
  })();

  // Live finance figures
  const todayMonth = new Date().toISOString().slice(0, 7);
  const monthRevenue = store.transactions
    .filter(t => t.type === 'income' && t.status === 'completed' && t.date.startsWith(todayMonth))
    .reduce((s, t) => s + t.amount, 0);
  const monthExpenses = store.transactions
    .filter(t => t.type === 'expense' && t.status === 'completed' && t.date.startsWith(todayMonth))
    .reduce((s, t) => s + t.amount, 0);
  const monthProfit = monthRevenue - monthExpenses;
  const margin = monthRevenue ? Math.round((monthProfit / monthRevenue) * 100) : 0;
  const inProductionDeals = store.deals.filter(d => ['production', 'assembly', 'contract'].includes(d.status));
  const inProductionSum = inProductionDeals.reduce((s, d) => s + d.amount, 0);
  const receivablesSum = store.transactions
    .filter(t => t.type === 'income' && (t.status === 'pending' || t.status === 'overdue'))
    .reduce((s, t) => s + t.amount, 0);
  const overdueCount = store.transactions.filter(t => t.type === 'income' && t.status === 'overdue').length;
  const fmtM = (n: number) => (n / 1_000_000).toFixed(1);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (downloadRef.current && !downloadRef.current.contains(e.target as Node)) setDownloadOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const askAI = (prompt: string) => {
    window.dispatchEvent(new CustomEvent('ai-assistant:open', { detail: { prompt } }));
  };

  const kpis = [
    {
      icon: ArrowUpRight, iconWrap: 'bg-emerald-50 text-emerald-600',
      value: `${fmtM(monthRevenue)} ${l('млн', 'млн', 'mln')} ₸`,
      label: l('Выручка месяца', 'Айдың түсімі', 'Monthly revenue'),
      hint: l('Доход за текущий месяц', 'Ағымдағы айдың табысы', 'Income this month'),
      hintCls: 'text-gray-500',
    },
    {
      icon: ArrowDownRight, iconWrap: 'bg-rose-50 text-rose-600',
      value: `${fmtM(monthExpenses)} ${l('млн', 'млн', 'mln')} ₸`,
      label: l('Расходы месяца', 'Айдың шығыны', 'Monthly expenses'),
      hint: l('Расходы за текущий месяц', 'Ағымдағы айдың шығыны', 'Expenses this month'),
      hintCls: 'text-gray-500',
    },
    {
      icon: TrendingUp, iconWrap: 'bg-sky-50 text-sky-600',
      value: `${fmtM(monthProfit)} ${l('млн', 'млн', 'mln')} ₸`,
      label: l('Чистая прибыль', 'Таза пайда', 'Net profit'),
      hint: l(`Маржа ${margin}%`, `Маржа ${margin}%`, `Margin ${margin}%`),
      hintCls: 'text-gray-500',
    },
    {
      icon: Clock, iconWrap: 'bg-amber-50 text-amber-600',
      value: `${fmtM(inProductionSum)} ${l('млн', 'млн', 'mln')} ₸`,
      label: l(`В производстве (${inProductionDeals.length})`, `Өндірісте (${inProductionDeals.length})`, `In production (${inProductionDeals.length})`),
      hint: l('Активные заказы', 'Белсенді тапсырыстар', 'Active orders'),
      hintCls: 'text-gray-500',
    },
    {
      icon: AlertCircle, iconWrap: 'bg-orange-50 text-orange-600',
      value: `${fmtM(receivablesSum)} ${l('млн', 'млн', 'mln')} ₸`,
      label: l('Дебиторка', 'Дебиторлық', 'Receivables'),
      hint: overdueCount
        ? l(`${overdueCount} просрочены`, `${overdueCount} мерзімі өткен`, `${overdueCount} overdue`)
        : l('Нет просрочек', 'Мерзімі өткені жоқ', 'No overdue'),
      hintCls: overdueCount ? 'text-rose-600' : 'text-gray-500',
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-[1400px] space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 mb-1">{l('Финансы', 'Қаржы', 'Finance')}</p>
          <h1 className="text-gray-900">{l('Финансы компании', 'Компания қаржысы', 'Company finance')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div ref={downloadRef} className="relative">
            <button
              onClick={() => setDownloadOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-100 rounded-xl text-xs text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {l('Скачать отчёт', 'Есепті жүктеу', 'Download report')}
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
            {downloadOpen && (
              <div className="absolute right-0 mt-1.5 w-36 bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden z-10">
                {['PDF', 'Excel', 'CSV'].map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setDownloadOpen(false)}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {l('Скачать как', 'Жүктеу', 'Download as')} {fmt}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 transition-colors">
            <FileText className="w-3.5 h-3.5" />
            {l('Создать счёт', 'Шот жасау', 'Create invoice')}
          </button>
          <button
            onClick={() => askAI(l(
              'Проанализируй мои финансы за месяц',
              'Айдағы қаржыны талда',
              'Analyze my finances for this month',
            ))}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-500 text-white rounded-xl text-xs hover:bg-purple-600 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {l('AI-анализ', 'AI талдау', 'AI analysis')}
          </button>
        </div>
      </div>

      <div>
        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">
          {l('Финансовая сводка', 'Қаржы жиынтығы', 'Financial summary')}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map((k, i) => {
            const Icon = k.icon;
            return (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${k.iconWrap} mb-3`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-lg text-gray-900 tabular-nums mb-1">{k.value}</div>
                <div className="text-[11px] text-gray-400 mb-2 leading-tight">{k.label}</div>
                <div className={`text-[10px] ${k.hintCls}`}>{k.hint}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-sm transition-shadow">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <div className="text-sm text-gray-900">{l('Динамика выручки', 'Түсім динамикасы', 'Revenue dynamics')}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{l('Выручка · Расходы · Прибыль', 'Түсім · Шығын · Пайда', 'Revenue · Expenses · Profit')}</div>
          </div>
          <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
            {(['7d', '30d', '6m', '12m'] as const).map(r => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                className={`px-2.5 py-1 rounded-md text-[10px] transition-colors ${
                  chartRange === r ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                {r === '7d' ? l('7 дней', '7 күн', '7 days')
                  : r === '30d' ? l('30 дней', '30 күн', '30 days')
                  : r === '6m' ? l('6 месяцев', '6 ай', '6 months')
                  : l('12 месяцев', '12 ай', '12 months')}
              </button>
            ))}
          </div>
        </div>
        <MiniAreaChart data={CHART_DATA} unit={l('млн ₸', 'млн ₸', 'mln ₸')} />
        <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {l('Выручка', 'Түсім', 'Revenue')}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> {l('Расходы', 'Шығыс', 'Expenses')}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-500" /> {l('Прибыль', 'Пайда', 'Profit')}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-3 overflow-x-auto">
        <div className="flex items-start gap-6 min-w-max">
          {TAB_GROUPS.map((group, gi) => (
            <div key={gi} className="flex flex-col gap-1.5">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider pl-2">
                {l(group.titleRu, group.titleKz, group.titleEng)}
              </span>
              <div className="flex items-center gap-1">
                {group.tabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap transition-colors ${
                        isActive
                          ? 'bg-gray-900 text-white shadow-sm'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <Icon className={`${isActive ? 'w-4 h-4' : 'w-3.5 h-3.5'} transition-all`} />
                      {tab[language]}
                      {isActive && <span className="absolute left-2 right-2 -bottom-1.5 h-[2px] bg-gray-900 rounded-full" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        {activeTab === 'orders' && <OrderManagement />}
        {activeTab === 'calendar' && <PaymentCalendar />}
        {activeTab === 'taxes' && <Taxes />}
        {activeTab === 'cashflow' && <CashFlow />}
        {activeTab === 'profitloss' && <ProfitLoss />}
        {activeTab === 'balance' && <Balance />}
      </div>
    </div>
  );
}

type ChartPoint = { m: string; revenue: number; expenses: number; profit: number };

function MiniAreaChart({ data, unit }: { data: ChartPoint[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 800;
  const h = 220;
  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const maxV = Math.max(...data.flatMap(d => [d.revenue, d.expenses, d.profit])) * 1.15;
  const stepX = innerW / (data.length - 1);
  const x = (i: number) => padL + i * stepX;
  const y = (v: number) => padT + innerH - (v / maxV) * innerH;

  const toPath = (key: 'revenue' | 'expenses' | 'profit') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d[key])}`).join(' ');
  const toArea = (key: 'revenue' | 'expenses' | 'profit') =>
    `${toPath(key)} L ${x(data.length - 1)} ${padT + innerH} L ${padL} ${padT + innerH} Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(p => +((maxV * p).toFixed(1)));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[220px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="finGRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="finGExp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="finGProf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((tv, i) => {
          const yy = y(tv);
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={w - padR} y2={yy} stroke="#f3f4f6" strokeDasharray="3 3" />
              <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="#9ca3af">{tv}</text>
            </g>
          );
        })}

        <path d={toArea('revenue')} fill="url(#finGRev)" />
        <path d={toArea('expenses')} fill="url(#finGExp)" />
        <path d={toArea('profit')} fill="url(#finGProf)" />
        <path d={toPath('revenue')} fill="none" stroke="#10b981" strokeWidth="2" />
        <path d={toPath('expenses')} fill="none" stroke="#f43f5e" strokeWidth="2" />
        <path d={toPath('profit')} fill="none" stroke="#0ea5e9" strokeWidth="2" />

        {data.map((d, i) => (
          <g key={i}>
            <text x={x(i)} y={h - 10} textAnchor="middle" fontSize="10" fill="#9ca3af">{d.m}</text>
            <rect
              x={x(i) - stepX / 2}
              y={padT}
              width={stepX}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
            {hover === i && (
              <>
                <line x1={x(i)} y1={padT} x2={x(i)} y2={padT + innerH} stroke="#e5e7eb" strokeDasharray="3 3" />
                <circle cx={x(i)} cy={y(d.revenue)} r="3.5" fill="#10b981" />
                <circle cx={x(i)} cy={y(d.expenses)} r="3.5" fill="#f43f5e" />
                <circle cx={x(i)} cy={y(d.profit)} r="3.5" fill="#0ea5e9" />
              </>
            )}
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div
          className="absolute bg-white border border-gray-100 rounded-xl shadow-sm px-3 py-2 text-[11px] pointer-events-none"
          style={{
            left: `calc(${(x(hover) / w) * 100}% + 8px)`,
            top: 8,
            transform: x(hover) > w * 0.7 ? 'translateX(calc(-100% - 24px))' : undefined,
          }}
        >
          <div className="text-gray-900 mb-1">{data[hover].m}</div>
          <div className="flex items-center gap-1.5 text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{data[hover].revenue} {unit}</div>
          <div className="flex items-center gap-1.5 text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" />{data[hover].expenses} {unit}</div>
          <div className="flex items-center gap-1.5 text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-sky-500" />{data[hover].profit} {unit}</div>
        </div>
      )}
    </div>
  );
}
