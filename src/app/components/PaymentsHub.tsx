import { useState, useMemo } from 'react';
import { Search, CreditCard, Wallet, TrendingUp, AlertCircle, CheckCircle2, Clock, Download, Filter, Sparkles, ChevronDown, Send, Zap } from 'lucide-react';
import { useDataStore, Deal } from '../utils/dataStore';
import { Finance } from './Finance';
import { AI_MODELS } from './AIAssistant';

interface PaymentsHubProps { language: 'kz' | 'ru' | 'eng'; }

type Section = 'deals' | 'finance';
type StatusFilter = 'all' | 'paid' | 'partial' | 'pending';

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸';
const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + ' млн';
  if (Math.abs(n) >= 1_000) return Math.round(n / 1_000) + 'К';
  return String(n);
};

export function PaymentsHub({ language }: PaymentsHubProps) {
  const store = useDataStore();
  const [section, setSection] = useState<Section>('deals');
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/30">
      <div className="px-4 md:px-8 pt-6 max-w-[1400px]">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
          <div>
            <p className="text-xs text-gray-400 mb-1">{l('Оплаты', 'Төлемдер', 'Payments')}</p>
            <h1 className="text-gray-900">{l('Платежи и финансы', 'Төлемдер және қаржы', 'Payments & finance')}</h1>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-1 flex">
            <button onClick={() => setSection('deals')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${section === 'deals' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}>
              <CreditCard className="w-3.5 h-3.5" />
              {l('Платежи по сделкам', 'Мәмілелер бойынша', 'Deal payments')}
            </button>
            <button onClick={() => setSection('finance')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${section === 'finance' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}>
              <TrendingUp className="w-3.5 h-3.5" />
              {l('Финансы компании', 'Компания қаржысы', 'Company finance')}
            </button>
          </div>
        </div>
      </div>

      {section === 'deals' && (
        <div className="px-4 md:px-8 pb-8 max-w-[1400px] space-y-5">
          <AIFinancePanel language={language} />
          <DealPayments deals={store.deals} language={language} />
        </div>
      )}

      {section === 'finance' && (
        <>
          <div className="px-4 md:px-8 max-w-[1400px]">
            <AIFinancePanel language={language} variant="finance" />
          </div>
          <div className="-mt-2">
            <Finance language={language} />
          </div>
        </>
      )}
    </div>
  );
}

function AIFinancePanel({ language, variant = 'deals' }: { language: 'kz' | 'ru' | 'eng'; variant?: 'deals' | 'finance' }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [model, setModel] = useState(AI_MODELS[0]);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [prompt, setPrompt] = useState('');

  const insights = variant === 'deals' ? [
    { icon: AlertCircle, tone: 'bg-rose-50 text-rose-700 border-rose-100', title: l('3 платежа просрочены', '3 төлем мерзімі өтті', '3 payments overdue'), desc: l('Рекомендую отправить напоминания клиентам сегодня', 'Бүгін клиенттерге еске салу ұсынамын', 'Send reminders today') },
    { icon: TrendingUp, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100', title: l('+18% поступлений за неделю', 'Аптадағы +18% түсім', '+18% inflow this week'), desc: l('Лучшая неделя месяца — сохраняйте темп', 'Айдың үздік аптасы', 'Best week of the month') },
    { icon: Zap, tone: 'bg-amber-50 text-amber-700 border-amber-100', title: l('5 сделок без аванса', '5 мәміле аванссыз', '5 deals without prepayment'), desc: l('Запросить 30% предоплату для запуска производства', '30% алдын ала төлем сұрау', 'Request 30% prepayment') },
  ] : [
    { icon: TrendingUp, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100', title: l('Маржа выросла до 23.2%', 'Маржа 23.2%-ке өсті', 'Margin grew to 23.2%'), desc: l('+1.4 п.п. к прошлому месяцу', '+1.4 п.п. өткен айға', '+1.4 pp vs last month') },
    { icon: AlertCircle, tone: 'bg-amber-50 text-amber-700 border-amber-100', title: l('Срок УСН через 16 дней', 'УСН мерзімі 16 күнде', 'UST due in 16 days'), desc: l('К оплате 348 000 ₸ до 25 мая', '25 мамырға дейін 348 000 ₸', '348 000 ₸ by May 25') },
    { icon: Zap, tone: 'bg-sky-50 text-sky-700 border-sky-100', title: l('Cash flow positive', 'Cash flow оң', 'Cash flow positive'), desc: l('Резерв на 2.4 месяца расходов', '2.4 ай шығынға резерв', '2.4 months runway') },
  ];

  const quickActions = variant === 'deals' ? [
    l('Отправить напоминания должникам', 'Қарыздыларға еске салу', 'Send reminders to debtors'),
    l('Сгенерировать счёт по сделке', 'Мәмілеге шот шығару', 'Generate invoice'),
    l('Прогноз поступлений на неделю', 'Аптаға түсім болжамы', 'Weekly inflow forecast'),
    l('Кто платит дольше всех?', 'Ең ұзақ кім төлейді?', 'Who pays slowest?'),
  ] : [
    l('Анализ доходов и расходов', 'Кіріс-шығын талдауы', 'Income & expense analysis'),
    l('Рассчитать налоги за месяц', 'Айдың салығын есепте', 'Calculate monthly taxes'),
    l('Где можно сократить расходы?', 'Шығынды қайдан қысқартуға болады?', 'Where to cut expenses?'),
    l('Прогноз прибыли до конца квартала', 'Тоқсан соңына дейінгі пайда', 'Quarter profit forecast'),
  ];

  return (
    <div className="bg-gradient-to-br from-violet-50 via-white to-sky-50 rounded-2xl border border-violet-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-violet-100/60 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm text-gray-900 flex items-center gap-1.5">
              {l('AI Финансист', 'AI Қаржыгер', 'AI CFO')}
              <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">BETA</span>
            </div>
            <div className="text-[10px] text-gray-500">{l('Анализирует ваши платежи в реальном времени', 'Төлемдеріңізді нақты уақытта талдайды', 'Real-time payment analysis')}</div>
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setShowModelMenu(!showModelMenu)} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-100 rounded-lg text-[10px] text-gray-700 hover:border-violet-200">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            {model.short}
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>
          {showModelMenu && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-100 rounded-xl shadow-lg z-20 p-1">
              {AI_MODELS.map(m => (
                <button key={m.id} onClick={() => { setModel(m); setShowModelMenu(false); }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg hover:bg-gray-50 ${model.id === m.id ? 'bg-violet-50' : ''}`}>
                  <div className="text-xs text-gray-900">{m.name}</div>
                  <div className="text-[10px] text-gray-400">{m.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {insights.map((ins, i) => {
          const Icon = ins.icon;
          return (
            <div key={i} className={`rounded-xl border p-3 ${ins.tone}`}>
              <Icon className="w-3.5 h-3.5 mb-1.5" />
              <div className="text-xs mb-0.5">{ins.title}</div>
              <div className="text-[10px] opacity-80">{ins.desc}</div>
            </div>
          );
        })}
      </div>

      <div className="px-5 pb-3 flex items-center gap-1.5 flex-wrap">
        {quickActions.map((q, i) => (
          <button key={i} onClick={() => setPrompt(q)}
            className="text-[10px] px-2.5 py-1 bg-white border border-gray-100 rounded-full text-gray-600 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700 transition-colors">
            {q}
          </button>
        ))}
      </div>

      <div className="px-3 pb-3">
        <div className="bg-white border border-gray-100 rounded-xl flex items-center gap-2 px-3 py-2 focus-within:border-violet-200 focus-within:ring-1 focus-within:ring-violet-100">
          <Sparkles className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
          <input value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder={l('Спросите AI о финансах…', 'AI-ден қаржы туралы сұраңыз…', 'Ask AI about finance…')}
            className="flex-1 bg-transparent text-xs focus:outline-none placeholder:text-gray-300" />
          <button disabled={!prompt} className="w-7 h-7 bg-gray-900 disabled:bg-gray-200 text-white rounded-lg flex items-center justify-center transition-colors">
            <Send className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DealPayments({ deals, language }: { deals: Deal[]; language: 'kz' | 'ru' | 'eng' }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  const active = deals.filter(d => d.status !== 'rejected');

  const enriched = active.map(d => {
    const amount = d.amount || 0;
    const pct = d.progress || 0;
    const paid = Math.round(amount * pct / 100);
    const due = amount - paid;
    const status: StatusFilter = pct >= 100 ? 'paid' : pct > 0 ? 'partial' : 'pending';
    return { ...d, _amount: amount, _paid: paid, _due: due, _pct: pct, _status: status };
  });

  const totals = useMemo(() => {
    const billed = enriched.reduce((s, d) => s + d._amount, 0);
    const paid = enriched.reduce((s, d) => s + d._paid, 0);
    const due = billed - paid;
    const overdue = enriched.filter(d => d._status !== 'paid' && d.date && new Date(d.date) < new Date('2026-05-09')).reduce((s, d) => s + d._due, 0);
    return { billed, paid, due, overdue };
  }, [enriched]);

  const filtered = enriched
    .filter(d => filter === 'all' || d._status === filter)
    .filter(d => !query || d.customerName.toLowerCase().includes(query.toLowerCase()) || (d.product || '').toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b._due - a._due);

  const counts = {
    all: enriched.length,
    paid: enriched.filter(d => d._status === 'paid').length,
    partial: enriched.filter(d => d._status === 'partial').length,
    pending: enriched.filter(d => d._status === 'pending').length,
  };

  const kpis = [
    { label: l('Всего к оплате', 'Барлығы төлеуге', 'Total billed'), value: fmtShort(totals.billed) + ' ₸', sub: `${enriched.length} ${l('сделок', 'мәміле', 'deals')}`, icon: Wallet, tone: 'bg-gray-50 text-gray-700' },
    { label: l('Получено', 'Алынды', 'Received'), value: fmtShort(totals.paid) + ' ₸', sub: totals.billed ? `${Math.round(totals.paid / totals.billed * 100)}% ${l('от плана', 'жоспардан', 'of plan')}` : '—', icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
    { label: l('Остаток', 'Қалдық', 'Outstanding'), value: fmtShort(totals.due) + ' ₸', sub: l('к получению', 'алуға', 'pending'), icon: Clock, tone: 'bg-amber-50 text-amber-700' },
    { label: l('Просрочено', 'Мерзімі өтті', 'Overdue'), value: fmtShort(totals.overdue) + ' ₸', sub: l('требует внимания', 'назар аудару', 'needs attention'), icon: AlertCircle, tone: 'bg-rose-50 text-rose-700' },
  ];

  const FILTERS: { id: StatusFilter; ru: string; kz: string; eng: string; cls: string }[] = [
    { id: 'all', ru: 'Все', kz: 'Барлығы', eng: 'All', cls: '' },
    { id: 'paid', ru: 'Оплачены', kz: 'Төленді', eng: 'Paid', cls: 'text-emerald-700' },
    { id: 'partial', ru: 'Частичные', kz: 'Жартылай', eng: 'Partial', cls: 'text-amber-700' },
    { id: 'pending', ru: 'Ожидают', kz: 'Күтуде', eng: 'Pending', cls: 'text-gray-700' },
  ];

  const STATUS_BADGE: Record<StatusFilter, { label: string; cls: string; dot: string }> = {
    all: { label: '', cls: '', dot: '' },
    paid: { label: l('Оплачен', 'Төленді', 'Paid'), cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
    partial: { label: l('Частично', 'Жартылай', 'Partial'), cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
    pending: { label: l('Ожидает', 'Күтуде', 'Pending'), cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-sm transition-all">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">{k.label}</div>
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${k.tone}`}><Icon className="w-3 h-3" /></div>
              </div>
              <div className="text-base text-gray-900 tabular-nums mb-1">{k.value}</div>
              <div className="text-[10px] text-gray-400">{k.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm text-gray-900">{l('Платежи по сделкам', 'Мәмілелер бойынша төлемдер', 'Payments by deal')}</div>
            <span className="text-[10px] text-gray-400">{filtered.length} {l('записей', 'жазба', 'records')}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-300 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={l('Поиск по клиенту...', 'Клиент іздеу...', 'Search client...')}
                className="pl-7 pr-3 py-1.5 bg-gray-50 border-0 rounded-lg text-xs w-44 focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
            <button className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-[10px] text-gray-600">
              <Download className="w-3 h-3" /> {l('Экспорт', 'Экспорт', 'Export')}
            </button>
          </div>
        </div>

        <div className="px-4 py-2 border-b border-gray-50 flex items-center gap-1 overflow-x-auto">
          <Filter className="w-3 h-3 text-gray-300 mr-1 flex-shrink-0" />
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] whitespace-nowrap transition-colors flex items-center gap-1.5 ${filter === f.id ? 'bg-gray-900 text-white' : `${f.cls} hover:bg-gray-50`}`}>
              {f[language]}
              <span className={`px-1.5 py-0.5 rounded ${filter === f.id ? 'bg-white/20' : 'bg-gray-100'} text-[9px]`}>{counts[f.id]}</span>
            </button>
          ))}
        </div>

        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 border-b border-gray-50 bg-gray-50/40 text-[9px] text-gray-400 uppercase tracking-wide">
          <div className="col-span-3">{l('Клиент', 'Клиент', 'Client')}</div>
          <div className="col-span-3">{l('Продукт', 'Өнім', 'Product')}</div>
          <div className="col-span-3">{l('Прогресс', 'Прогресс', 'Progress')}</div>
          <div className="col-span-1 text-right">{l('Сумма', 'Сома', 'Amount')}</div>
          <div className="col-span-2 text-right">{l('Статус', 'Статус', 'Status')}</div>
        </div>

        <div className="divide-y divide-gray-50">
          {filtered.map(d => {
            const badge = STATUS_BADGE[d._status];
            return (
              <div key={d.id} className="px-4 py-3 hover:bg-gray-50/50 transition-colors grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-3 flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center text-[10px] text-gray-500 flex-shrink-0">
                    {d.customerName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-gray-900 truncate">{d.customerName}</div>
                    <div className="text-[10px] text-gray-400 truncate">{d.id} · {d.date || '—'}</div>
                  </div>
                </div>
                <div className="md:col-span-3 min-w-0">
                  <div className="text-xs text-gray-700 truncate">{d.product || '—'}</div>
                  <div className="text-[10px] text-gray-400">{d.furnitureType || ''}</div>
                </div>
                <div className="md:col-span-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${d._pct >= 100 ? 'bg-emerald-500' : d._pct > 0 ? 'bg-gray-900' : 'bg-amber-300'}`} style={{ width: `${Math.min(d._pct, 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-500 tabular-nums w-9 text-right">{d._pct}%</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {fmtShort(d._paid)} / {fmtShort(d._amount)} ₸
                  </div>
                </div>
                <div className="md:col-span-1 text-right">
                  <div className="text-xs text-gray-900 tabular-nums">{fmtShort(d._amount)} ₸</div>
                  {d._due > 0 && <div className="text-[10px] text-rose-500 tabular-nums">−{fmtShort(d._due)}</div>}
                </div>
                <div className="md:col-span-2 flex md:justify-end">
                  <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg ${badge.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                    {badge.label}
                  </span>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-4 py-16 text-center">
              <CreditCard className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <div className="text-xs text-gray-400">{l('Нет платежей по фильтру', 'Сүзгі бойынша төлемдер жоқ', 'No payments match the filter')}</div>
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <div className="px-4 py-2.5 bg-gray-50/40 border-t border-gray-50 flex items-center justify-between text-[10px] text-gray-500">
            <span>{l('Показано', 'Көрсетілді', 'Showing')} {filtered.length} {l('из', 'ішінен', 'of')} {enriched.length}</span>
            <div className="flex items-center gap-3 tabular-nums">
              <span>Σ {fmt(filtered.reduce((s, d) => s + d._amount, 0))}</span>
              <span className="text-emerald-600">✓ {fmt(filtered.reduce((s, d) => s + d._paid, 0))}</span>
              <span className="text-amber-600">• {fmt(filtered.reduce((s, d) => s + d._due, 0))}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
