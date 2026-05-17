import { useState, useRef, useEffect, useMemo } from 'react';
import { OrderManagement } from './finance/OrderManagement';
import { PaymentCalendar } from './finance/PaymentCalendar';
import { Taxes } from './finance/Taxes';
import { CashFlow } from './finance/CashFlow';
import { ProfitLoss } from './finance/ProfitLoss';
import { Balance } from './finance/Balance';
import {
  ShoppingBag, Calendar, Receipt, ArrowDownUp, TrendingUp, Wallet,
  ArrowUpRight, ArrowDownRight, Download, Clock, AlertCircle, FileText, Sparkles, ChevronDown,
  Loader2,
} from 'lucide-react';
import { useDataStore } from '../utils/dataStore';
import { api } from '../utils/api';

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

  // Chart series — now actually filters by chartRange instead of always
  // returning 6 months. 7d/30d show daily bars; 6m/12m show monthly aggregates.
  const CHART_DATA = useMemo(() => {
    const now = new Date();
    const out: { m: string; revenue: number; expenses: number; profit: number }[] = [];
    const sumInRange = (from: Date, to: Date, type: 'income' | 'expense') => store.transactions
      .filter(t => t.type === type && t.status === 'completed' && t.date)
      .filter(t => {
        const d = new Date(t.date).getTime();
        return d >= from.getTime() && d < to.getTime();
      })
      .reduce((s, t) => s + t.amount, 0) / 1_000_000;
    if (chartRange === '7d' || chartRange === '30d') {
      const days = chartRange === '7d' ? 7 : 30;
      for (let i = days - 1; i >= 0; i--) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const next = new Date(day.getTime() + 24 * 3600 * 1000);
        const rev = sumInRange(day, next, 'income');
        const exp = sumInRange(day, next, 'expense');
        out.push({
          m: days === 7 ? `${day.getDate()}.${String(day.getMonth() + 1).padStart(2, '0')}` : String(day.getDate()),
          revenue: +rev.toFixed(2), expenses: +exp.toFixed(2), profit: +(rev - exp).toFixed(2),
        });
      }
    } else {
      const months = chartRange === '6m' ? 6 : 12;
      for (let i = months - 1; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const rev = sumInRange(start, end, 'income');
        const exp = sumInRange(start, end, 'expense');
        out.push({
          m: `${MONTH_NAMES_RU[start.getMonth()]} ${String(start.getFullYear()).slice(2)}`,
          revenue: +rev.toFixed(2), expenses: +exp.toFixed(2), profit: +(rev - exp).toFixed(2),
        });
      }
    }
    return out;
  }, [store.transactions, chartRange]);

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

  // ─── Report period + download state ─────────────────────────────
  // Default to «this month». Users can pick a different month/quarter/year
  // from the period chip; advanced range picker shown when «диапазон» chosen.
  type ReportType = 'finance' | 'pl' | 'aging';
  const today = new Date();
  const [period, setPeriod] = useState<{ from: string; to: string; preset: string }>(() => {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10), preset: 'month' };
  });
  const [reportBusy, setReportBusy] = useState<ReportType | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);

  function setPreset(preset: string) {
    const now = new Date();
    let from: Date, to: Date = now;
    if (preset === 'month')     { from = new Date(now.getFullYear(), now.getMonth(), 1); }
    else if (preset === 'last') { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 0); }
    else if (preset === 'quarter') { const q = Math.floor(now.getMonth() / 3); from = new Date(now.getFullYear(), q * 3, 1); }
    else if (preset === 'year') { from = new Date(now.getFullYear(), 0, 1); }
    else                        { from = new Date(now.getFullYear(), now.getMonth(), 1); }
    setPeriod({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), preset });
  }

  async function downloadReport(kind: ReportType) {
    setReportBusy(kind); setDownloadOpen(false);
    try {
      const pdf = await import('../utils/pdfReports');
      let company = '';
      try { company = JSON.parse(localStorage.getItem('utir_user_profile') || '{}')?.company || ''; } catch {}
      const periodObj = { from: new Date(period.from), to: new Date(period.to + 'T23:59:59') };

      if (kind === 'finance') {
        await pdf.generateFinancePDF(store.transactions.map(t => ({
          id: t.id, type: t.type, category: t.category,
          amount: t.amount, date: t.date, description: t.description, status: t.status,
        })), { company, period: periodObj });
      } else if (kind === 'pl') {
        await pdf.generatePLPDF(store.transactions.map(t => ({
          id: t.id, type: t.type, category: t.category,
          amount: t.amount, date: t.date, description: t.description, status: t.status,
        })), { company, period: periodObj });
      } else if (kind === 'aging') {
        const active = store.deals.filter(d => d.status !== 'rejected');
        const today = new Date();
        const rows = active.map(d => {
          const amount = d.amount || 0;
          const paid = Math.round(amount * (d.progress || 0) / 100);
          const outstanding = amount - paid;
          const daysOverdue = d.date ? Math.max(0, Math.floor((today.getTime() - new Date(d.date).getTime()) / (24 * 3600 * 1000)) - 14) : 0;
          return { id: d.id, customerName: d.customerName, product: d.product, outstanding, daysOverdue };
        }).filter(r => r.outstanding > 0);
        await pdf.generateAgingPDF(rows, { company });
      }
    } catch (e: any) {
      console.error('[Finance/downloadReport]', e);
      alert('Не удалось сформировать отчёт: ' + String(e?.message || e));
    } finally {
      setReportBusy(null);
    }
  }

  async function downloadCSV() {
    setDownloadOpen(false);
    const pdf = await import('../utils/pdfReports');
    const periodObj = { from: new Date(period.from), to: new Date(period.to + 'T23:59:59') };
    const scoped = store.transactions.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date).getTime();
      return d >= periodObj.from.getTime() && d <= periodObj.to.getTime();
    });
    pdf.downloadCSV(`finansy-${period.from}_${period.to}.csv`, [
      ['Дата', 'Тип', 'Категория', 'Описание', 'Сумма (₸)', 'Статус'],
      ...scoped.map(t => [t.date, t.type === 'income' ? 'Приход' : 'Расход', t.category, t.description, t.amount, t.status]),
    ]);
  }

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
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period chips — drive which window the report templates cover */}
          <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-xl p-1">
            {([
              { id: 'month',   ru: 'Этот месяц' },
              { id: 'last',    ru: 'Прошлый' },
              { id: 'quarter', ru: 'Квартал' },
              { id: 'year',    ru: 'Год' },
            ] as const).map(p => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] transition ${period.preset === p.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}
              >{p.ru}</button>
            ))}
            {/* Custom range — two compact date inputs */}
            <div className={`flex items-center gap-1 pl-1.5 border-l ${period.preset === 'custom' ? 'border-gray-200' : 'border-transparent'}`}>
              <input
                type="date" value={period.from}
                onChange={e => setPeriod({ ...period, from: e.target.value, preset: 'custom' })}
                className="px-1.5 py-0.5 bg-gray-50 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-gray-200"
              />
              <span className="text-gray-300 text-[10px]">→</span>
              <input
                type="date" value={period.to}
                onChange={e => setPeriod({ ...period, to: e.target.value, preset: 'custom' })}
                className="px-1.5 py-0.5 bg-gray-50 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-gray-200"
              />
            </div>
          </div>

          <div ref={downloadRef} className="relative">
            <button
              onClick={() => setDownloadOpen(o => !o)}
              disabled={reportBusy !== null}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-100 rounded-xl text-xs text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {reportBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {l('Скачать отчёт', 'Есепті жүктеу', 'Download report')}
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
            {downloadOpen && (
              <div className="absolute right-0 mt-1.5 w-64 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden z-10">
                <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-50">{l('PDF-шаблоны', 'PDF үлгілері', 'PDF templates')}</div>
                <button onClick={() => downloadReport('finance')} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                  <span>📊 {l('Финансовый отчёт', 'Қаржы есебі', 'Finance report')}</span>
                  <span className="text-[9px] text-gray-400">с журналом</span>
                </button>
                <button onClick={() => downloadReport('pl')} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                  <span>📈 {l('P&L (прибыль/убытки)', 'P&L', 'P&L statement')}</span>
                  <span className="text-[9px] text-gray-400">бухгалтерский</span>
                </button>
                <button onClick={() => downloadReport('aging')} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                  <span>⏰ {l('Дебиторка (aging)', 'Дебитор', 'Aging report')}</span>
                  <span className="text-[9px] text-gray-400">0/30/60/90+</span>
                </button>
                <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-gray-400 border-y border-gray-50">{l('Таблицы', 'Кесте', 'Tables')}</div>
                <button onClick={downloadCSV} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                  <span>📥 CSV (Excel)</span>
                  <span className="text-[9px] text-gray-400">операции</span>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowInvoice(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 transition-colors"
          >
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
      {showInvoice && <InvoiceModal onClose={() => setShowInvoice(false)} language={language} />}
    </div>
  );
}

// ─── InvoiceModal ─────────────────────────────────────────────────
// Picks a deal from the team's deals, loads company requisites from the
// backend, then generates and downloads a single-deal invoice PDF. Admin
// can edit the invoice number before generating (default: «YY-{last 6}»).
function InvoiceModal({ onClose, language }: { onClose: () => void; language: 'kz' | 'ru' | 'eng' }) {
  const store = useDataStore();
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [dealId, setDealId] = useState<string>('');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [requisites, setRequisites] = useState<any>(null);
  const [reqLoaded, setReqLoaded] = useState(false);

  useEffect(() => {
    api.get('/api/team/requisites')
      .then((r: any) => { setRequisites(r); setReqLoaded(true); })
      .catch(() => { setRequisites({}); setReqLoaded(true); });
  }, []);

  const candidates = store.deals
    .filter(d => d.status !== 'rejected' && d.amount > 0)
    .filter(d => !query || d.customerName.toLowerCase().includes(query.toLowerCase()) || (d.product || '').toLowerCase().includes(query.toLowerCase()))
    .slice(0, 20);

  const selected = store.deals.find(d => d.id === dealId);

  async function generate() {
    if (!selected) return;
    setBusy(true);
    try {
      const pdf = await import('../utils/pdfReports');
      const paidAmount = Math.round((selected.amount || 0) * (selected.progress || 0) / 100);
      await pdf.generateInvoicePDF({
        id: selected.id,
        customerName: selected.customerName,
        customerPhone: selected.phone,
        product: selected.product,
        amount: selected.amount || 0,
        paidAmount,
      }, requisites || {}, number ? { invoiceNumber: number } : undefined);
      onClose();
    } catch (e: any) {
      alert('Ошибка: ' + String(e?.message || e));
    } finally { setBusy(false); }
  }

  const missingReqs = reqLoaded && (!requisites?.legalName || !requisites?.iban);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-900">{l('Создать счёт на оплату', 'Шот жасау', 'Create invoice')}</div>
            <div className="text-[11px] text-gray-400">{l('PDF · с реквизитами компании', 'PDF', 'PDF · with company details')}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        {missingReqs && (
          <div className="mx-5 mt-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <div>
              {l('Не заполнены реквизиты компании (название / IBAN). Счёт сформируется, но без банковских данных.', '...', 'Company requisites are empty.')}
              {' '}
              <a href="#" onClick={e => { e.preventDefault(); onClose(); window.dispatchEvent(new CustomEvent('navigate:settings', { detail: { tab: 'general' } })); }} className="underline">{l('Заполнить →', 'Толтыру →', 'Fill in →')}</a>
            </div>
          </div>
        )}

        <div className="p-5 space-y-4">
          <div>
            <div className="text-xs text-gray-900 mb-1">{l('Сделка', 'Мәміле', 'Deal')}</div>
            <input
              type="text" placeholder={l('Поиск по клиенту…', 'Іздеу...', 'Search...')}
              value={query} onChange={e => setQuery(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200 mb-1.5"
            />
            <div className="border border-gray-100 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-50">
              {candidates.length === 0 && <div className="px-3 py-6 text-center text-[11px] text-gray-400">{l('Нет подходящих сделок', '...', 'No matching deals')}</div>}
              {candidates.map(d => (
                <button
                  key={d.id}
                  onClick={() => { setDealId(d.id); setNumber(''); }}
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${dealId === d.id ? 'bg-violet-50' : ''}`}
                >
                  <div className="text-xs text-gray-900">{d.customerName}</div>
                  <div className="text-[10px] text-gray-400 truncate">{d.product || '—'} · {(d.amount || 0).toLocaleString('ru-RU')} ₸</div>
                </button>
              ))}
            </div>
          </div>

          {selected && (
            <>
              <div>
                <div className="text-xs text-gray-900 mb-1">{l('Номер счёта', 'Шот №', 'Invoice number')}</div>
                <input
                  type="text" value={number} onChange={e => setNumber(e.target.value)}
                  placeholder={`${String(new Date().getFullYear()).slice(-2)}-${selected.id.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()}`}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200"
                />
                <div className="text-[10px] text-gray-400 mt-1">{l('Если оставить пустым — сгенерируется автоматически', '...', 'Leave empty for auto-number')}</div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 text-[11px] space-y-1">
                <div className="text-gray-500">{l('В счёте будет:', 'Шотта болады:', 'Will be in invoice:')}</div>
                <div className="text-gray-900">{selected.customerName} · {selected.product || '—'}</div>
                <div className="text-gray-900 tabular-nums">{l('К оплате:', 'Төлеуге:', 'Amount:')} {(selected.amount || 0).toLocaleString('ru-RU')} ₸</div>
                {requisites?.legalName && <div className="text-gray-500">от {requisites.legalName}</div>}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900">{l('Отмена', 'Болдырмау', 'Cancel')}</button>
          <button
            onClick={generate}
            disabled={!selected || busy}
            className="px-4 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            {l('Скачать PDF', 'PDF жүктеу', 'Download PDF')}
          </button>
        </div>
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
