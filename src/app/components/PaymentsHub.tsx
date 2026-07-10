import { useState, useMemo, useEffect } from 'react';
import { Search, CreditCard, Wallet, TrendingUp, AlertCircle, CheckCircle2, Clock, Download, Filter, Sparkles, ChevronDown, Send, Zap, FileText, Loader2, Copy, Check, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { useDataStore, Deal, FinanceTransaction } from '../utils/dataStore';
import { Finance } from './Finance';
import { AI_MODELS } from './AIAssistant';
import { api } from '../utils/api';
import { getNiche, type NicheConfig } from '../utils/niches';
import { plural } from '../utils/translations';
// PDF generator is heavy (jspdf + html2canvas) — load only when needed.
import type { PaymentDealRow } from '../utils/pdfReports';

interface PaymentsHubProps { language: 'kz' | 'ru' | 'eng'; }

type Section = 'deals' | 'finance';
type StatusFilter = 'all' | 'paid' | 'partial' | 'pending';

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';
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
    <div
      className="flex-1 overflow-y-auto relative"
    >
      <div className="px-4 sm:px-6 lg:px-8 pt-6 max-w-[1400px] mx-auto relative">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
          <div>
            <p className="text-[11px] text-slate-400 mb-1 tracking-widest uppercase">{l('Оплаты', 'Төлемдер', 'Payments')}</p>
            <h1 className="text-slate-900 text-2xl md:text-3xl font-medium tracking-tight">{l('Платежи и финансы', 'Төлемдер және қаржы', 'Payments & finance')}</h1>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setSection('deals')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs whitespace-nowrap ring-1 transition-all ${
                section === 'deals'
                  ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]'
                  : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
              }`}>
              <CreditCard className="w-3.5 h-3.5" />
              {l('Платежи по сделкам', 'Мәмілелер бойынша', 'Deal payments')}
            </button>
            <button onClick={() => setSection('finance')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs whitespace-nowrap ring-1 transition-all ${
                section === 'finance'
                  ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]'
                  : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
              }`}>
              <TrendingUp className="w-3.5 h-3.5" />
              {l('Финансы компании', 'Компания қаржысы', 'Company finance')}
            </button>
          </div>
        </div>
      </div>

      {section === 'deals' && (
        <div className="px-4 sm:px-6 lg:px-8 pb-8 max-w-[1400px] space-y-5">
          <AIFinancePanel language={language} variant="deals" deals={store.deals} transactions={store.transactions} />
          <DealPayments deals={store.deals} language={language} />
        </div>
      )}

      {section === 'finance' && (
        <>
          <div className="px-4 sm:px-6 lg:px-8 max-w-[1400px]">
            <AIFinancePanel language={language} variant="finance" deals={store.deals} transactions={store.transactions} />
          </div>
          <div className="-mt-2">
            <Finance language={language} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Computed insights from real data ───────────────────────────────
// We turn store.deals + store.transactions into the same shape of cards
// the old mock used, but every number is a live aggregate. The AI panel
// renders these AND uses them as context when the admin asks the AI.

interface Insight { kind: 'good' | 'warn' | 'bad' | 'info'; title: string; desc: string }

function dealStatus(d: Deal): 'paid' | 'partial' | 'pending' {
  const amt = d.amount || 0;
  const paid = Math.round(amt * (d.progress || 0) / 100);
  return paid >= amt && amt > 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
}

function computeDealInsights(deals: Deal[], language: 'kz' | 'ru' | 'eng'): Insight[] {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const active = deals.filter(d => d.status !== 'rejected');
  const today = new Date();
  // Treat anything > 14 days old without full payment as overdue.
  const overdueCutoff = new Date(today.getTime() - 14 * 24 * 3600 * 1000);
  const enriched = active.map(d => ({
    d,
    amt: d.amount || 0,
    paid: Math.round((d.amount || 0) * (d.progress || 0) / 100),
    due: (d.amount || 0) - Math.round((d.amount || 0) * (d.progress || 0) / 100),
    status: dealStatus(d),
    age: d.date ? today.getTime() - new Date(d.date).getTime() : 0,
  }));
  const overdue = enriched.filter(e => e.status !== 'paid' && e.d.date && new Date(e.d.date) < overdueCutoff);
  const overdueSum = overdue.reduce((s, e) => s + e.due, 0);
  const noPrepay  = enriched.filter(e => e.paid === 0);
  const partialBig = enriched.filter(e => e.status === 'partial').sort((a, b) => b.due - a.due);
  const insights: Insight[] = [];
  if (overdue.length > 0) {
    insights.push({
      kind: 'bad',
      title: l(
        `${overdue.length} ${plural(overdue.length, 'просроченная сделка', 'просроченные сделки', 'просроченных сделок')}`,
        `${overdue.length} мерзімі өткен мәміле`,
        `${overdue.length} overdue deals`,
      ),
      desc: l(
        `Не получено ${fmtShort(overdueSum)} ₸. Отправить напоминания?`,
        `Алынбаған ${fmtShort(overdueSum)} ₸.`,
        `${fmtShort(overdueSum)} ₸ unpaid. Send reminders?`,
      ),
    });
  } else {
    insights.push({ kind: 'good', title: l('Нет просрочек', 'Мерзімі өткен жоқ', 'No overdue'), desc: l('Все клиенты в графике', 'Бәрі кестеде', 'All clients on schedule') });
  }
  if (noPrepay.length > 0) {
    insights.push({
      kind: 'warn',
      title: l(`${noPrepay.length} ${plural(noPrepay.length, 'сделка', 'сделки', 'сделок')} без аванса`, `${noPrepay.length} аванссыз`, `${noPrepay.length} deals without prepayment`),
      desc: l('Запросить 30% предоплату для старта производства', '30% алдын ала төлем сұрау', 'Request 30% prepayment'),
    });
  }
  if (partialBig.length > 0) {
    const top = partialBig[0];
    insights.push({
      kind: 'info',
      title: l('Крупный остаток', 'Үлкен қалдық', 'Largest outstanding'),
      desc: l(
        `${top.d.customerName} — ${fmtShort(top.due)} ₸ к получению`,
        `${top.d.customerName} — ${fmtShort(top.due)} ₸`,
        `${top.d.customerName} owes ${fmtShort(top.due)} ₸`,
      ),
    });
  }
  return insights.slice(0, 3);
}

function computeFinanceInsights(transactions: FinanceTransaction[], language: 'kz' | 'ru' | 'eng'): Insight[] {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const done = transactions.filter(t => t.status === 'completed');
  const income  = done.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = done.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const profit  = income - expense;
  const margin  = income > 0 ? Math.round(profit / income * 1000) / 10 : 0;
  // This month vs last month delta
  const now = new Date();
  const thisMonth = now.getMonth(), thisYear = now.getFullYear();
  const sumMonth = (m: number, y: number, type: 'income' | 'expense') =>
    done.filter(t => {
      if (t.type !== type || !t.date) return false;
      const d = new Date(t.date);
      return d.getMonth() === m && d.getFullYear() === y;
    }).reduce((s, t) => s + t.amount, 0);
  const incThis = sumMonth(thisMonth, thisYear, 'income');
  const incLast = sumMonth(thisMonth === 0 ? 11 : thisMonth - 1, thisMonth === 0 ? thisYear - 1 : thisYear, 'income');
  const incDeltaPct = incLast > 0 ? Math.round((incThis - incLast) / incLast * 100) : 0;
  const insights: Insight[] = [];
  insights.push({
    kind: profit >= 0 ? 'good' : 'bad',
    title: l(`Маржа ${margin.toFixed(1)}%`, `Маржа ${margin.toFixed(1)}%`, `Margin ${margin.toFixed(1)}%`),
    desc: l(`Прибыль: ${fmtShort(profit)} ₸`, `Пайда: ${fmtShort(profit)} ₸`, `Profit: ${fmtShort(profit)} ₸`),
  });
  if (incLast > 0) {
    insights.push({
      kind: incDeltaPct >= 0 ? 'good' : 'warn',
      title: l(
        `Доход ${incDeltaPct >= 0 ? '+' : ''}${incDeltaPct}% к прошлому месяцу`,
        `Кіріс ${incDeltaPct >= 0 ? '+' : ''}${incDeltaPct}%`,
        `Revenue ${incDeltaPct >= 0 ? '+' : ''}${incDeltaPct}% vs last month`,
      ),
      desc: l(`Текущий месяц: ${fmtShort(incThis)} ₸`, `Ағымдағы ай: ${fmtShort(incThis)} ₸`, `This month: ${fmtShort(incThis)} ₸`),
    });
  } else if (incThis > 0) {
    insights.push({
      kind: 'good',
      title: l(`Доход ${fmtShort(incThis)} ₸ за месяц`, `Айдағы кіріс ${fmtShort(incThis)} ₸`, `Income ${fmtShort(incThis)} ₸ this month`),
      desc: l('Первые продажи месяца', 'Айдың алғашқы сатылымдары', 'First sales this month'),
    });
  }
  // Top expense category
  const expByCat = new Map<string, number>();
  done.filter(t => t.type === 'expense').forEach(t => expByCat.set(t.category || '—', (expByCat.get(t.category || '—') || 0) + t.amount));
  const topExp = [...expByCat.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topExp) {
    insights.push({
      kind: 'info',
      title: l(`Топ расход: ${topExp[0]}`, `Топ шығын: ${topExp[0]}`, `Top expense: ${topExp[0]}`),
      desc: l(`${fmtShort(topExp[1])} ₸ · ${expense > 0 ? Math.round(topExp[1] / expense * 100) : 0}% от расходов`, `${fmtShort(topExp[1])} ₸`, `${fmtShort(topExp[1])} ₸`),
    });
  }
  return insights.slice(0, 3);
}

// Build a compact textual summary of the team's finance state to prepend
// to user prompts — lets the AI answer with real numbers instead of
// generic templated replies. Niche is now part of the context so the
// model gives niche-appropriate advice (e.g. doesn't suggest a 50%
// prepay for a niche that typically takes 30%, or talk about production
// for niches that have no production stage).
function buildFinanceContext(deals: Deal[], transactions: FinanceTransaction[], niche: NicheConfig): string {
  const active = deals.filter(d => d.status !== 'rejected');
  const billed = active.reduce((s, d) => s + (d.amount || 0), 0);
  const paid   = active.reduce((s, d) => s + Math.round((d.amount || 0) * (d.progress || 0) / 100), 0);
  const due    = billed - paid;
  const done   = transactions.filter(t => t.status === 'completed');
  const income  = done.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = done.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const profit  = income - expense;
  const overdue = active.filter(d => {
    if (dealStatus(d) === 'paid' || !d.date) return false;
    return Date.now() - new Date(d.date).getTime() > 14 * 24 * 3600 * 1000;
  });
  const lines = [
    `=== Контекст команды ===`,
    `Ниша: «${niche.name.ru}». Типовой цикл: ${niche.productionStages.map(s => s.ru).join(' → ')}.`,
    '',
    '=== Финансовое состояние (живые данные) ===',
    `Сделки: всего ${active.length}, к оплате ${fmt(billed)}, получено ${fmt(paid)}, остаток ${fmt(due)}.`,
    `Просроченных сделок: ${overdue.length}.`,
    overdue.length > 0
      ? `Топ должников: ${overdue.slice(0, 5).map(d => `${d.customerName} (${fmt((d.amount || 0) - Math.round((d.amount || 0) * (d.progress || 0) / 100))})`).join(', ')}.`
      : '',
    `Финансовые операции: доходы ${fmt(income)}, расходы ${fmt(expense)}, прибыль ${fmt(profit)}.`,
    `Маржа: ${income > 0 ? (profit / income * 100).toFixed(1) : 0}%.`,
    '=== Используй эти цифры и учитывай специфику ниши в ответах. ===',
  ].filter(Boolean);
  return lines.join('\n');
}

// ─── AI Финансист panel ────────────────────────────────────────────
// Tool-capable finance agent. Routes through UTIR AI (the same agent that
// powers Telegram + the main popup) so it can not only ANALYZE numbers but
// also CREATE financial entries — «запиши расход на аренду 200к» triggers
// add_finance, «X оплатил 500к» triggers log_payment, etc. Live finance
// numbers are injected as system context on the first turn so the model
// answers with real figures, not made-up ones.
//
// Conversation history is kept in-component so multi-turn dialogues work
// (admin can answer the model's clarifying questions). Tool proposals are
// surfaced inline with Confirm / Cancel buttons, mirroring the main popup.

interface FinChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pendingTool?: { toolName: string; toolInput: any; summary: string };
}
const finMsgId = () => 'fm_' + Math.random().toString(36).slice(2, 9);

function AIFinancePanel({ language, variant = 'deals', deals, transactions }: {
  language: 'kz' | 'ru' | 'eng';
  variant?: 'deals' | 'finance';
  deals: Deal[];
  transactions: FinanceTransaction[];
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();
  const niche = getNiche(store.niche);
  const canWrite = store.canWriteModule('finance');
  // Default to UTIR AI — gives the panel tool access (add_finance,
  // log_payment, find_client). Other providers fall back to pure text.
  const [model, setModel] = useState(AI_MODELS.find(m => m.id === 'utir-ai') || AI_MODELS[0]);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<FinChatMsg[]>([]);
  // True after the very first turn — switches from one-shot context
  // injection to plain follow-ups so the agent has memory.
  const [contextSeeded, setContextSeeded] = useState(false);

  // Sync model with what's actually configured on the server (greys out
  // tiles whose key is missing).
  const [providerOk, setProviderOk] = useState<Record<string, boolean>>({});
  useEffect(() => {
    api.get<Array<{ id: string; enabled: boolean }>>('/api/ai-chat/providers')
      .then(rows => setProviderOk(Object.fromEntries(rows.map(r => [r.id, r.enabled]))))
      .catch(() => { /* stay optimistic */ });
  }, []);

  const insights = useMemo(
    () => variant === 'deals' ? computeDealInsights(deals, language) : computeFinanceInsights(transactions, language),
    [variant, deals, transactions, language],
  );

  // Quick actions adapt to whether the team has data yet. A fresh team
  // with 0 deals/transactions sees "how do I start" prompts instead of
  // "who owes the most" (which would return nothing meaningful).
  const isEmpty = deals.filter(d => d.status !== 'rejected').length === 0 && transactions.length === 0;
  const quickActions = isEmpty
    ? [
        l('Как начать вести финансы в моей нише?', 'Қаржыны қалай бастаймын?', 'How do I start tracking finances?'),
        l(`Какие категории расходов завести для ниши «${niche.name.ru}»?`, 'Қандай шығын санаттары керек?', 'What expense categories should I set up?'),
        l('Запиши расход: аренда 200к за этот месяц', 'Шығын жаз: жалдау 200к', 'Record expense: rent 200k this month'),
        l('Какой аванс брать с клиентов в моей нише?', 'Қандай аванс алу керек?', 'What prepay % is typical for my niche?'),
      ]
    : variant === 'deals' ? [
        l('Кто из клиентов должен больше всех?', 'Ең көп қарызды клиент кім?', 'Who owes the most?'),
        l('Прогноз поступлений на эту неделю',    'Аптадағы түсім болжамы',     'Inflow forecast this week'),
        l('Какие сделки рискуют сорваться?',      'Қандай мәмілелер тәуекелде?', 'Which deals are at risk?'),
        l('Сделай сводку платежей за месяц',      'Айдағы төлемдер сводкасы',   'Summarize payments this month'),
      ] : [
        l('Проанализируй доходы и расходы за месяц', 'Айдың кірісі мен шығынын талда', 'Analyze monthly P&L'),
        l('Запиши расход на аренду 200к',             'Жалдау шығыны 200к жаз',         'Record rent expense 200k'),
        l('Прогноз прибыли до конца квартала',         'Тоқсан соңына дейінгі пайда',  'Forecast profit until quarter end'),
        l('Сколько денег осталось «в обороте»?',       'Айналымда қанша қалды?',       'How much cash is in flight?'),
      ];

  async function ask(q: string) {
    if (!q.trim() || sending) return;
    setSending(true); setError(null);
    // Inject live finance numbers on the FIRST turn so the model
    // answers with real figures. Subsequent turns rely on conversation
    // memory.
    const text = q.trim();
    const userPayload = !contextSeeded
      ? `${buildFinanceContext(deals, transactions, niche)}\n\nВопрос пользователя: ${text}`
      : text;
    const userMsg: FinChatMsg = { id: finMsgId(), role: 'user', content: text };
    const nextMessages: FinChatMsg[] = [...messages, userMsg];
    setMessages(nextMessages);
    setContextSeeded(true);
    try {
      // utir-ai → tool-capable agent; everything else → pure text chat.
      // The provider IDs already match what /api/ai-chat/message expects.
      const provider = model.id;
      // Build wire history. Replace the last user content with the
      // context-augmented payload so the model sees the numbers without
      // showing them in the visible bubble.
      const wireHistory = nextMessages
        .filter(m => !m.pendingTool)
        .map((m, idx) => idx === nextMessages.length - 1
          ? { role: m.role, content: userPayload }
          : { role: m.role, content: m.content });
      const res = await api.post<any>('/api/ai-chat/message', {
        provider,
        messages: wireHistory,
      });
      if (res?.kind === 'tool') {
        // UTIR AI proposed a write action. Render as a pending proposal
        // with Confirm / Cancel buttons (mirrors AIAssistant popup).
        setMessages(prev => [...prev, {
          id: finMsgId(),
          role: 'assistant',
          content: res.summary,
          pendingTool: { toolName: res.toolName, toolInput: res.toolInput, summary: res.summary },
        }]);
      } else if (res?.kind === 'reply') {
        setMessages(prev => [...prev, { id: finMsgId(), role: 'assistant', content: res.text }]);
      } else if (res?.kind === 'error') {
        setError(res.error || 'Ошибка');
      } else {
        setError('Не удалось получить ответ');
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSending(false);
    }
  }

  async function confirmTool(msg: FinChatMsg) {
    if (!msg.pendingTool) return;
    // View-only role can chat with AI but can't execute write tools.
    // Refuse here before the network call so the user gets a clear msg
    // instead of a silent 403.
    if (!canWrite) {
      setError(l('Только просмотр — нет прав на изменение финансов',
                 'Тек қарау — қаржыны өзгерту құқығы жоқ',
                 'View only — no permission to modify finance'));
      return;
    }
    setExecutingId(msg.id);
    try {
      const resp = await api.post<{ ok: boolean; text: string }>('/api/ai-chat/execute', {
        provider: model.id,
        toolName: msg.pendingTool.toolName,
        toolInput: msg.pendingTool.toolInput,
      });
      // Replace the proposal with the executed result (drops buttons).
      setMessages(prev => prev.map(m => m.id === msg.id
        ? { ...m, content: (resp.ok ? '✅ ' : '⚠️ ') + (resp.text || ''), pendingTool: undefined }
        : m,
      ));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setExecutingId(null);
    }
  }

  function cancelTool(msg: FinChatMsg) {
    setMessages(prev => prev.map(m => m.id === msg.id
      ? { ...m, content: '✕ Действие отменено.', pendingTool: undefined }
      : m,
    ));
  }

  function clearChat() {
    setMessages([]);
    setContextSeeded(false);
    setError(null);
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      // Look up the company name from localStorage profile (where it lives
      // per the project rules) so the PDF header is properly branded.
      let company = '';
      try {
        const p = JSON.parse(localStorage.getItem('utir_user_profile') || '{}');
        company = p?.company || '';
      } catch { /* ignore */ }
      const pdf = await import('../utils/pdfReports');
      if (variant === 'deals') {
        const rows: PaymentDealRow[] = deals.filter(d => d.status !== 'rejected').map(d => ({
          id: d.id,
          customerName: d.customerName,
          product: d.product,
          amount: d.amount || 0,
          paid: Math.round((d.amount || 0) * (d.progress || 0) / 100),
          status: dealStatus(d),
          date: d.date,
        }));
        await pdf.generatePaymentsPDF(rows, { company });
      } else {
        await pdf.generateFinancePDF(transactions.map(t => ({
          id: t.id, type: t.type, category: t.category,
          amount: t.amount, date: t.date, description: t.description, status: t.status,
        })), { company });
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setPdfBusy(false);
    }
  }

  const toneClass = (kind: Insight['kind']) =>
    kind === 'good' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
    : kind === 'warn' ? 'bg-amber-50 text-amber-700 border-amber-100'
    : kind === 'bad'  ? 'bg-rose-50 text-rose-700 border-rose-100'
    : 'bg-sky-50 text-sky-700 border-sky-100';
  const toneIcon = (kind: Insight['kind']) =>
    kind === 'good' ? TrendingUp : kind === 'bad' ? AlertCircle : kind === 'warn' ? Zap : Sparkles;

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
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase tracking-wide">live</span>
            </div>
            <div className="text-[10px] text-gray-500">{l('Анализирует ваши платежи и финансы по живым данным', 'Нақты деректер бойынша талдайды', 'Real-time analysis of live data')}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadPdf}
            disabled={pdfBusy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/60 ring-1 ring-white/60 backdrop-blur-xl rounded-lg text-[11px] text-gray-700 hover:border-violet-200 disabled:opacity-50"
            title={l('Скачать PDF-отчёт', 'PDF жүктеу', 'Download PDF report')}
          >
            {pdfBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
            {l('Отчёт PDF', 'PDF есеп', 'PDF report')}
          </button>
          <div className="relative">
            <button onClick={() => setShowModelMenu(!showModelMenu)} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/60 ring-1 ring-white/60 backdrop-blur-xl rounded-lg text-[10px] text-gray-700 hover:border-violet-200">
              <span className={`w-1.5 h-1.5 rounded-full ${providerOk[model.id] !== false ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              {model.short}
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
            {showModelMenu && (
              <div className="absolute right-0 top-full mt-1 w-64 max-w-[calc(100vw-2rem)] bg-white/60 ring-1 ring-white/60 backdrop-blur-xl rounded-xl shadow-lg z-20 p-1">
                {AI_MODELS.map(m => {
                  const ok = providerOk[m.id] !== false;
                  return (
                    <button key={m.id} disabled={!ok} onClick={() => { setModel(m); setShowModelMenu(false); }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg ${!ok ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'} ${model.id === m.id ? 'bg-violet-50' : ''}`}>
                      <div className="text-xs text-gray-900 flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        {m.name}
                      </div>
                      <div className="text-[10px] text-gray-400">{m.desc}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {insights.length === 0 ? (
          <div className="md:col-span-3 text-center text-[11px] text-gray-400 py-2">
            {l('Пока недостаточно данных для инсайтов — добавьте сделки и платежи', 'Талдау үшін деректер жеткіліксіз — мәмілелер мен төлемдер қосыңыз', 'Not enough data yet — add deals and payments')}
          </div>
        ) : insights.map((ins, i) => {
          const Icon = toneIcon(ins.kind);
          return (
            <div key={i} className={`rounded-xl border p-3 ${toneClass(ins.kind)}`}>
              <Icon className="w-3.5 h-3.5 mb-1.5" />
              <div className="text-xs mb-0.5">{ins.title}</div>
              <div className="text-[10px] opacity-80">{ins.desc}</div>
            </div>
          );
        })}
      </div>

      <div className="px-5 pb-3 flex items-center gap-1.5 flex-wrap">
        {quickActions.map((q, i) => (
          <button key={i} onClick={() => ask(q)} disabled={sending}
            className="text-[10px] px-2.5 py-1 bg-white/60 ring-1 ring-white/60 backdrop-blur-xl rounded-full text-gray-600 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700 transition-colors disabled:opacity-50">
            {q}
          </button>
        ))}
        {messages.length > 0 && (
          <button onClick={clearChat} disabled={sending}
            className="text-[10px] px-2.5 py-1 ml-auto bg-white/60 ring-1 ring-white/60 backdrop-blur-xl rounded-full text-gray-500 hover:bg-rose-50 hover:text-rose-700 transition-colors disabled:opacity-50">
            {l('Очистить диалог', 'Диалогты тазалау', 'Clear chat')}
          </button>
        )}
      </div>

      <div className="px-3 pb-3">
        <div className="bg-white/60 ring-1 ring-white/60 backdrop-blur-xl rounded-xl flex items-center gap-2 px-3 py-2 focus-within:border-violet-200 focus-within:ring-1 focus-within:ring-violet-100">
          <Sparkles className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !sending) { e.preventDefault(); ask(prompt); setPrompt(''); } }}
            disabled={sending}
            placeholder={l('Спросите AI о финансах или скажите что записать…', 'AI-ден сұраңыз немесе жазуды айтыңыз…', 'Ask or tell AI to record…')}
            className="flex-1 bg-transparent text-xs focus:outline-none placeholder:text-gray-300 disabled:opacity-50"
          />
          <button
            disabled={!prompt || sending}
            onClick={() => { ask(prompt); setPrompt(''); }}
            className="w-8 h-8 bg-emerald-600 disabled:bg-white/40 disabled:text-slate-400 text-white rounded-xl flex items-center justify-center transition-colors ring-1 ring-white/10 shadow-[0_4px_12px_-4px_var(--accent-shadow)] disabled:shadow-none"
          >
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Conversation transcript — user / assistant alternating bubbles,
          with inline Confirm / Cancel buttons on tool proposals. */}
      {(messages.length > 0 || error) && (
        <div className="px-5 pb-4 space-y-2.5">
          {messages.map(m => {
            if (m.role === 'user') {
              return (
                <div key={m.id} className="text-[11px] text-gray-500 leading-relaxed">
                  <span className="text-gray-400">{l('Вы:', 'Сіз:', 'You:')}</span> {m.content}
                </div>
              );
            }
            // assistant
            const isPending = !!m.pendingTool;
            const isExecuting = executingId === m.id;
            return (
              <div key={m.id} className={`rounded-xl px-4 py-3 text-[13px] text-gray-800 whitespace-pre-line leading-relaxed border ${
                isPending ? 'bg-amber-50/80 border-amber-200' : 'bg-white border-violet-200'
              }`}>
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className={`w-3 h-3 ${isPending ? 'text-amber-600' : 'text-violet-500'}`} />
                    <span className={`text-[10px] uppercase tracking-wide ${isPending ? 'text-amber-700' : 'text-emerald-600'}`}>
                      {isPending ? l('Предлагает действие', 'Әрекет ұсынады', 'Proposes action') : model.short}
                    </span>
                  </div>
                  {!isPending && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(m.content);
                        setCopied(m.id);
                        setTimeout(() => setCopied(c => (c === m.id ? null : c)), 1500);
                      }}
                      className="text-[10px] text-gray-400 hover:text-emerald-600 inline-flex items-center gap-1 opacity-60 hover:opacity-100 transition"
                      title={l('Скопировать ответ', 'Көшіру', 'Copy reply')}
                    >
                      {copied === m.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      {copied === m.id ? l('Скопировано', 'Көшірілді', 'Copied') : l('Копировать', 'Көшіру', 'Copy')}
                    </button>
                  )}
                </div>
                {/* Tool proposal supports basic HTML (bold names, line breaks). */}
                {isPending
                  ? <div dangerouslySetInnerHTML={{ __html: m.content }} />
                  : m.content}
                {isPending && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => confirmTool(m)}
                      disabled={isExecuting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-[11px] hover:bg-emerald-700 ring-1 ring-white/10 transition-all disabled:opacity-50"
                    >
                      {isExecuting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      {isExecuting ? l('Выполняю…', 'Орындалуда…', 'Executing…') : l('Выполнить', 'Орындау', 'Confirm')}
                    </button>
                    <button
                      onClick={() => cancelTool(m)}
                      disabled={isExecuting}
                      className="px-3 py-1.5 bg-white/70 ring-1 ring-white/60 text-slate-700 rounded-xl text-[11px] hover:bg-white transition-all disabled:opacity-50"
                    >
                      {l('Отмена', 'Бас тарту', 'Cancel')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-[12px] text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DealPayments({ deals, language }: { deals: Deal[]; language: 'kz' | 'ru' | 'eng' }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [exportBusy, setExportBusy] = useState<'pdf' | 'csv' | null>(null);
  // Sort — clickable column headers cycle the key + direction. Default
  // 'due desc' keeps the prior behaviour (biggest debtors on top).
  const [sortKey, setSortKey] = useState<'due' | 'amount' | 'date' | 'name'>('due');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  // Pagination — 25 rows per page. Reset to page 0 when filter/query changes
  // so the user always sees the top of the new result set.
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);

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
    // Anything still unpaid 14+ days after the deal date counts as overdue.
    // Was hardcoded to a specific date — would silently break after that day.
    const overdueCutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000);
    const overdue = enriched.filter(d => d._status !== 'paid' && d.date && new Date(d.date) < overdueCutoff).reduce((s, d) => s + d._due, 0);
    return { billed, paid, due, overdue };
  }, [enriched]);

  const filtered = enriched
    .filter(d => filter === 'all' || d._status === filter)
    // Search now covers phone + БИН too — useful for finance staff
    // looking up an unpaid invoice by phone the client gave them.
    .filter(d => {
      if (!query) return true;
      const q = query.toLowerCase();
      const phoneDigits = (d.phone || '').replace(/[^0-9]/g, '');
      const qDigits = q.replace(/[^0-9]/g, '');
      return d.customerName.toLowerCase().includes(q)
          || (d.product || '').toLowerCase().includes(q)
          || (d.phone || '').toLowerCase().includes(q)
          || (qDigits.length >= 3 && phoneDigits.includes(qDigits))
          || ((d as any).customerBIN || '').includes(q);
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'amount') return (a._amount - b._amount) * dir;
      if (sortKey === 'name')   return a.customerName.localeCompare(b.customerName) * dir;
      if (sortKey === 'date') {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return (ta - tb) * dir;
      }
      return (a._due - b._due) * dir; // 'due'
    });

  // Slice to current page; clamp page when filtered count changes.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  // Reset to page 0 whenever the filter / query is changed by the user.
  useEffect(() => { setPage(0); }, [filter, query]);

  const counts = {
    all: enriched.length,
    paid: enriched.filter(d => d._status === 'paid').length,
    partial: enriched.filter(d => d._status === 'partial').length,
    pending: enriched.filter(d => d._status === 'pending').length,
  };

  const kpis = [
    { label: l('Всего к оплате', 'Барлығы төлеуге', 'Total billed'), value: fmtShort(totals.billed) + ' ₸', sub: `${enriched.length} ${l(plural(enriched.length, 'сделка', 'сделки', 'сделок'), 'мәміле', 'deals')}`, icon: Wallet, tone: 'bg-white/60 text-slate-700 ring-1 ring-white/60' },
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

  async function exportPdf() {
    setExportBusy('pdf');
    try {
      let company = '';
      try { company = JSON.parse(localStorage.getItem('utir_user_profile') || '{}')?.company || ''; } catch {}
      const pdf = await import('../utils/pdfReports');
      await pdf.generatePaymentsPDF(filtered.map(d => ({
        id: d.id, customerName: d.customerName, product: d.product,
        amount: d._amount, paid: d._paid, status: d._status as 'paid' | 'partial' | 'pending', date: d.date,
      })), { company });
    } finally { setExportBusy(null); }
  }
  async function exportCsv() {
    setExportBusy('csv');
    try {
      const pdf = await import('../utils/pdfReports');
      // Localized headers — old version produced Russian-only CSV
      // regardless of user language, which surprised KZ/EN users.
      const header: string[] = [
        l('Клиент',   'Клиент',   'Client'),
        l('Продукт',  'Өнім',     'Product'),
        l('Дата',     'Күн',      'Date'),
        l('Сумма (₸)', 'Сома (₸)', 'Amount (₸)'),
        l('Оплачено (₸)', 'Төленді (₸)', 'Paid (₸)'),
        l('Остаток (₸)',  'Қалдық (₸)',  'Outstanding (₸)'),
        l('Статус',   'Күй',      'Status'),
      ];
      const rows: Array<Array<string | number>> = [
        header,
        ...filtered.map(d => [
          d.customerName,
          d.product || '',
          d.date || '',
          d._amount,
          d._paid,
          d._due,
          STATUS_BADGE[d._status].label,
        ]),
      ];
      pdf.downloadCSV(`platezhi-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } finally { setExportBusy(null); }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <div key={i} className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-4 hover:shadow-sm transition-all">
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

      <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/60 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm text-gray-900">{l('Платежи по сделкам', 'Мәмілелер бойынша төлемдер', 'Payments by deal')}</div>
            <span className="text-[10px] text-gray-400">{filtered.length} {l('записей', 'жазба', 'records')}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-300 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={l('Поиск: клиент, продукт, телефон, БИН', 'Іздеу: клиент, өнім, телефон', 'Search: client, product, phone, BIN')}
                className="pl-7 pr-3 py-1.5 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs w-44 focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
            <button
              onClick={exportPdf}
              disabled={exportBusy !== null || filtered.length === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white/60 ring-1 ring-white/60 backdrop-blur-xl hover:border-gray-200 rounded-lg text-[10px] text-gray-700 disabled:opacity-50"
              title={l('Скачать PDF', 'PDF жүктеу', 'Download PDF')}
            >
              {exportBusy === 'pdf' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} PDF
            </button>
            <button
              onClick={exportCsv}
              disabled={exportBusy !== null || filtered.length === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white/50 hover:bg-white/80 ring-1 ring-white/60 backdrop-blur-xl rounded-xl text-[10px] text-slate-600 disabled:opacity-50"
              title={l('Скачать CSV (Excel)', 'CSV жүктеу', 'Download CSV (Excel)')}
            >
              <Download className="w-3 h-3" /> CSV
            </button>
          </div>
        </div>

        <div className="px-4 py-2 border-b border-white/60 flex items-center gap-1 overflow-x-auto">
          <Filter className="w-3 h-3 text-gray-300 mr-1 flex-shrink-0" />
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded-full text-[10px] whitespace-nowrap transition-colors flex items-center gap-1.5 ring-1 ${filter === f.id ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow-sm)]' : `${f.cls} ring-white/40 hover:bg-white/70`}`}>
              {f[language]}
              <span className={`px-1.5 py-0.5 rounded ${filter === f.id ? 'bg-white/20' : 'bg-gray-100'} text-[10px]`}>{counts[f.id]}</span>
            </button>
          ))}
        </div>

        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 border-b border-white/60 bg-white/30 text-[10px] text-gray-400 uppercase tracking-wide">
          <button onClick={() => toggleSort('name')} className="col-span-3 text-left flex items-center gap-1 hover:text-gray-700 transition-colors">
            {l('Клиент', 'Клиент', 'Client')}
            {sortKey === 'name' && <ArrowUpDown className="w-2.5 h-2.5" />}
          </button>
          <div className="col-span-3">{l('Продукт', 'Өнім', 'Product')}</div>
          <div className="col-span-3">{l('Прогресс', 'Прогресс', 'Progress')}</div>
          <button onClick={() => toggleSort('amount')} className="col-span-1 text-right flex items-center justify-end gap-1 hover:text-gray-700 transition-colors">
            {l('Сумма', 'Сома', 'Amount')}
            {sortKey === 'amount' && <ArrowUpDown className="w-2.5 h-2.5" />}
          </button>
          <button onClick={() => toggleSort('due')} className="col-span-2 text-right flex items-center justify-end gap-1 hover:text-gray-700 transition-colors">
            {l('Статус', 'Статус', 'Status')}
            {(sortKey === 'due' || sortKey === 'date') && <ArrowUpDown className="w-2.5 h-2.5" />}
          </button>
        </div>

        <div className="divide-y divide-gray-50">
          {pageRows.map(d => {
            const badge = STATUS_BADGE[d._status];
            return (
              <div key={d.id} className="px-4 py-3 hover:bg-white/30 transition-colors grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-3 flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center text-[10px] text-gray-500 flex-shrink-0">
                    {d.customerName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-gray-900 truncate">{d.customerName}</div>
                    {/* Show only the short 6-char deal ref + creation date —
                        the full opaque id ("Delp5cy51xwqw") was noise. */}
                    <div className="text-[10px] text-gray-400 truncate">#{d.id.slice(-6).toUpperCase()} · {d.date || '—'}</div>
                  </div>
                </div>
                <div className="md:col-span-3 min-w-0">
                  {/* Mobile label — on phones there's no column header so we
                      surface what this row segment IS under each value. */}
                  <div className="md:hidden text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{l('Продукт', 'Өнім', 'Product')}</div>
                  <div className="text-xs text-gray-700 truncate">{d.product || '—'}</div>
                  {d.furnitureType && <div className="text-[10px] text-gray-400">{d.furnitureType}</div>}
                </div>
                <div className="md:col-span-3">
                  <div className="md:hidden text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{l('Прогресс', 'Прогресс', 'Progress')}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${d._pct >= 100 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : d._pct > 0 ? 'bg-gradient-to-r from-sky-400 to-violet-400' : 'bg-amber-300'}`} style={{ width: `${Math.min(d._pct, 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-500 tabular-nums w-9 text-right">{d._pct}%</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {fmtShort(d._paid)} / {fmtShort(d._amount)} ₸
                  </div>
                </div>
                <div className="md:col-span-1 text-right">
                  <div className="md:hidden text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{l('Сумма', 'Сома', 'Amount')}</div>
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
          <div className="px-4 py-2.5 bg-white/30 border-t border-white/60 flex items-center justify-between flex-wrap gap-2 text-[10px] text-gray-500">
            <div className="flex items-center gap-2">
              <span>
                {l('Показано', 'Көрсетілді', 'Showing')}
                {' '}{safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)}
                {' '}{l('из', 'ішінен', 'of')} {filtered.length}
              </span>
              {pageCount > 1 && (
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className="w-6 h-6 hover:bg-gray-100 rounded-lg flex items-center justify-center disabled:opacity-30"
                  ><ChevronLeft className="w-3 h-3" /></button>
                  <span className="text-gray-600 tabular-nums px-1">{safePage + 1} / {pageCount}</span>
                  <button
                    onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                    disabled={safePage >= pageCount - 1}
                    className="w-6 h-6 hover:bg-gray-100 rounded-lg flex items-center justify-center disabled:opacity-30"
                  ><ChevronRight className="w-3 h-3" /></button>
                </div>
              )}
            </div>
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
