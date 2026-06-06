import { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Calendar, Receipt, FileCheck, ExternalLink, Star, ChevronLeft, ChevronRight, RotateCcw, Loader2, FileText } from 'lucide-react';
import { useDataStore } from '../../utils/dataStore';
import { api } from '../../utils/api';

// ─── KZ tax rates — FALLBACK only ────────────────────────────────
// Real rates now live in team settings (Настройки → Реквизиты → Налоги)
// because the KZ Tax Code changed for 2026 and an accountant must be
// able to tune them without a code release. These are just the defaults
// used until the team saves their own.
const DEFAULT_RATES = {
  simplified: 0.03, retail: 0.04,
  ipn: 0.10, opv: 0.10, vosms: 0.02, oosms: 0.03, so: 0.035, sn: 0.095,
  opvr: 0.025, vat: 0.12, kpn: 0.20, property: 0.015,
};
type TaxRegime = 'simplified' | 'retail' | 'general';

interface TaxPaymentRecord { id: string; periodKey: string; amount: number; paidAt: string; paidBy?: string }

interface Requisites {
  vatPayer?: boolean; entityType?: 'too' | 'ip'; legalName?: string;
  taxRegime?: TaxRegime; rates?: Partial<typeof DEFAULT_RATES>;
  mrp?: number; mzp?: number; taxYear?: number;
}

type PeriodKind = 'month' | 'quarter';

interface TaxRow {
  code: string;          // 'IPN', 'SN', ...
  label: string;         // 'Индивидуальный подоходный налог'
  shortLabel: string;    // 'ИПН' (Cyrillic display)
  rate: string;          // '10%' (display string)
  base: number;          // налогооблагаемая база (₸)
  amount: number;        // сумма к уплате (₸)
  due: string;           // ISO date
  icon: string;          // tw classes for the colored badge
  highlight?: boolean;
  note?: string;         // small explainer
  applicable: boolean;   // false → grey & shown as «не применим»
}

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';

const STATUS_LABEL: Record<'paid' | 'pending' | 'overdue', { ru: string; cls: string }> = {
  paid:    { ru: 'Оплачен',   cls: 'bg-emerald-50 text-emerald-700' },
  pending: { ru: 'К оплате',  cls: 'bg-amber-50 text-amber-700' },
  overdue: { ru: 'Просрочен', cls: 'bg-rose-50 text-rose-700' },
};

// Build the period key the backend uses — keeps front & back in sync.
function periodKey(kind: PeriodKind, ref: Date, code: string): string {
  const y = ref.getFullYear();
  if (kind === 'month') {
    const m = String(ref.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-${code}`;
  }
  const q = Math.floor(ref.getMonth() / 3) + 1;
  return `${y}-Q${q}-${code}`;
}

// Render «Май 2026» / «Q2 2026»
function periodLabel(kind: PeriodKind, ref: Date): string {
  const m = ref.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  if (kind === 'month') return m.charAt(0).toUpperCase() + m.slice(1);
  return `Q${Math.floor(ref.getMonth() / 3) + 1} ${ref.getFullYear()}`;
}

export function Taxes() {
  const store = useDataStore();
  const [kind, setKind] = useState<PeriodKind>('month');
  // The «reference date» drives which period we calculate. Default = today;
  // chevron arrows step ±1 month or ±1 quarter.
  const [ref, setRef] = useState<Date>(new Date());
  const [requisites, setRequisites] = useState<Requisites>({});
  const [reqLoaded, setReqLoaded] = useState(false);
  const [payments, setPayments] = useState<TaxPaymentRecord[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<'tax' | 'vat' | null>(null);

  useEffect(() => {
    api.get<Requisites>('/api/team/requisites')
      .then(r => { setRequisites(r || {}); setReqLoaded(true); })
      .catch(() => setReqLoaded(true));
    refreshPayments();
  }, []);

  function refreshPayments() {
    api.get<TaxPaymentRecord[]>('/api/taxes/payments')
      .then(r => setPayments(r || []))
      .catch(() => {});
  }

  // ─── Period window calculations ────────────────────────────────
  const periodWindow = useMemo(() => {
    const y = ref.getFullYear();
    if (kind === 'month') {
      const m = ref.getMonth();
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0, 23, 59, 59) };
    }
    const q = Math.floor(ref.getMonth() / 3);
    return { from: new Date(y, q * 3, 1), to: new Date(y, q * 3 + 3, 0, 23, 59, 59) };
  }, [ref, kind]);

  const inWindow = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr).getTime();
    return d >= periodWindow.from.getTime() && d <= periodWindow.to.getTime();
  };

  const monthsInWindow = kind === 'month' ? 1 : 3;

  // Bases:
  //  - payroll = sum of active employees' salary × months in window
  //  - revenue = income transactions completed in window
  //  - expense = expense transactions completed in window
  //  - taxableProfit = revenue − expense (for КПН)
  //  - propertyBase = total products book value (proxy for fixed assets)
  const activeEmployees = store.employees.filter(e => e.status === 'active');
  const payrollMonthly = activeEmployees.reduce((s, e) => s + (e.salary || 0), 0);
  const payrollBase = payrollMonthly * monthsInWindow;
  const revenueBase = store.transactions
    .filter(t => t.type === 'income' && t.status === 'completed' && inWindow(t.date))
    .reduce((s, t) => s + t.amount, 0);
  const expenseBase = store.transactions
    .filter(t => t.type === 'expense' && t.status === 'completed' && inWindow(t.date))
    .reduce((s, t) => s + t.amount, 0);
  // VAT-bearing expenses for input-VAT credit (zachёt): purchases of
  // goods/materials/services. Salaries and taxes carry no VAT.
  const NON_VAT_CATS = new Set(['Зарплата', 'Налоги', 'Дивиденды', 'Штрафы']);
  const vatableExpenseBase = store.transactions
    .filter(t => t.type === 'expense' && t.status === 'completed' && inWindow(t.date) && !NON_VAT_CATS.has(t.category))
    .reduce((s, t) => s + t.amount, 0);
  const taxableProfit = Math.max(0, revenueBase - expenseBase);
  const propertyBase = store.products.reduce((s, p) => s + (p.cost || 0) * (p.quantity || 0), 0);

  const isIP = requisites.entityType === 'ip';
  const vatPayer = !!requisites.vatPayer;
  // Live rates + regime from team settings (with safe fallback).
  const rates = { ...DEFAULT_RATES, ...(requisites.rates || {}) };
  const regime: TaxRegime = requisites.taxRegime || 'simplified';
  const pct = (r: number) => `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`;

  // Due date — 25 числа следующего месяца (most KZ taxes work this way).
  const dueNextMonth = (offsetDays = 25) => {
    const d = new Date(periodWindow.to);
    d.setMonth(d.getMonth() + 1);
    d.setDate(offsetDays);
    return d.toISOString().slice(0, 10);
  };
  const due25 = dueNextMonth(25);

  // ── Payroll-derived taxes (apply in every regime when there are
  //    salaried employees). ОПВ/ИПН/ВОСМС — удержания у работника;
  //    ООСМС/СО — взносы работодателя; СН — только на ОУР, за вычетом СО. ──
  const payrollRows: TaxRow[] = [];
  if (payrollBase > 0) {
    const so = payrollBase * rates.so;
    payrollRows.push(
      { code: 'OPV',  shortLabel: 'ОПВ',  label: 'Обязательные пенсионные взносы (удержание)', rate: pct(rates.opv),  base: payrollBase, amount: payrollBase * rates.opv,  due: due25, icon: 'bg-emerald-50 text-emerald-700', applicable: true, note: 'Удерживается из зарплаты в ЕНПФ' },
      { code: 'IPN',  shortLabel: 'ИПН',  label: 'ИПН с зарплаты (удержание)',                  rate: pct(rates.ipn),  base: payrollBase, amount: payrollBase * rates.ipn,  due: due25, icon: 'bg-violet-50 text-violet-700', applicable: true, note: 'Удерживается из зарплаты сотрудников' },
      { code: 'VOSMS',shortLabel: 'ВОСМС',label: 'Взносы ОСМС (удержание у работника)',         rate: pct(rates.vosms),base: payrollBase, amount: payrollBase * rates.vosms,due: due25, icon: 'bg-sky-50 text-sky-700', applicable: true },
      { code: 'OOSMS',shortLabel: 'ООСМС',label: 'Отчисления ОСМС (за счёт работодателя)',      rate: pct(rates.oosms),base: payrollBase, amount: payrollBase * rates.oosms,due: due25, icon: 'bg-cyan-50 text-cyan-700', applicable: true },
      { code: 'SO',   shortLabel: 'СО',   label: 'Социальные отчисления (работодатель)',        rate: pct(rates.so),   base: payrollBase, amount: so, due: due25, icon: 'bg-teal-50 text-teal-700', applicable: true },
    );
    // СН только на общеустановленном режиме (на упрощёнке соцналог входит
    // в 3% и отдельно не платится).
    if (regime === 'general') {
      payrollRows.push({ code: 'SN', shortLabel: 'СН', label: 'Социальный налог (за вычетом СО)', rate: `${pct(rates.sn)} − СО`, base: payrollBase, amount: Math.max(0, payrollBase * rates.sn - so), due: due25, icon: 'bg-rose-50 text-rose-700', applicable: true });
    }
  }

  const rows: TaxRow[] = [];

  // ── Main income tax — depends on the regime ──
  if (regime === 'simplified') {
    rows.push({
      code: 'SIMPLIFIED', shortLabel: 'СНР 910', label: 'Налог по упрощёнке (форма 910.00)',
      rate: pct(rates.simplified), base: revenueBase, amount: revenueBase * rates.simplified,
      due: due25, icon: 'bg-indigo-50 text-indigo-700', highlight: true, applicable: revenueBase > 0,
      note: '3% от оборота (½ ИПН/КПН + ½ СН). Декларация раз в полугодие, уплата до 25-го.',
    });
  } else if (regime === 'retail') {
    rows.push({
      code: 'RETAIL', shortLabel: 'СНР 913', label: 'Розничный налог (форма 913.00)',
      rate: pct(rates.retail), base: revenueBase, amount: revenueBase * rates.retail,
      due: due25, icon: 'bg-indigo-50 text-indigo-700', highlight: true, applicable: revenueBase > 0,
      note: 'Налог с оборота для розницы. Уплата ежеквартально.',
    });
  } else {
    // ОУР
    if (!isIP) {
      rows.push({
        code: 'KPN', shortLabel: 'КПН', label: 'Корпоративный подоходный налог',
        rate: pct(rates.kpn), base: taxableProfit, amount: taxableProfit * rates.kpn,
        due: kind === 'month' ? dueNextMonth(20) : due25,
        icon: 'bg-indigo-50 text-indigo-700', highlight: kind === 'quarter',
        applicable: taxableProfit > 0, note: 'База = доходы − расходы за период',
      });
    } else {
      rows.push({
        code: 'IPN_IP', shortLabel: 'ИПН ИП', label: 'ИПН ИП (с дохода)',
        rate: pct(rates.ipn), base: revenueBase, amount: revenueBase * rates.ipn,
        due: due25, icon: 'bg-indigo-50 text-indigo-700', applicable: revenueBase > 0,
        note: 'ИП на общеустановленном режиме',
      });
    }
  }

  // Payroll taxes after the main one.
  rows.push(...payrollRows);
  if (payrollBase === 0) {
    rows.push({ code: 'PAYROLL0', shortLabel: 'ФОТ', label: 'Налоги с зарплаты', rate: '—', base: 0, amount: 0, due: due25, icon: 'bg-gray-50 text-gray-400', applicable: false, note: 'Нет активных сотрудников с окладом' });
  }

  // НДС — независимо от режима, если компания плательщик НДС.
  // Цены в РК обычно «в т.ч. НДС», поэтому НДС извлекается из суммы:
  // НДС = сумма × ставка/(1+ставка). К уплате = исходящий − входящий (зачёт).
  const vr = rates.vat;
  const outVat = vatPayer ? revenueBase * vr / (1 + vr) : 0;        // с продаж (вкл. авансы)
  const inVat = vatPayer ? vatableExpenseBase * vr / (1 + vr) : 0;  // входящий по ЭСФ-расходам
  const vatNet = Math.max(0, outVat - inVat);
  rows.push({
    code: 'NDS', shortLabel: 'НДС', label: 'НДС к уплате (исходящий − входящий)',
    rate: pct(rates.vat), base: revenueBase, amount: vatPayer ? vatNet : 0,
    due: dueNextMonth(25), icon: 'bg-amber-50 text-amber-700', applicable: vatPayer,
    note: vatPayer
      ? `Исходящий ${Math.round(outVat).toLocaleString('ru-RU')} − входящий ${Math.round(inVat).toLocaleString('ru-RU')} ₸. Авансы учтены в обороте. Декларация 300.00 ежеквартально.`
      : 'Включите статус плательщика НДС в Настройки → Реквизиты',
  });

  // Налог на имущество — только ТОО на ОУР.
  if (propertyBase > 0 && !isIP && regime === 'general') {
    rows.push({
      code: 'NI', shortLabel: 'НИ', label: 'Налог на имущество (ТОО)',
      rate: pct(rates.property), base: propertyBase, amount: propertyBase * rates.property,
      due: dueNextMonth(25), icon: 'bg-purple-50 text-purple-700', applicable: true,
      note: 'Рассчитан по остаточной стоимости ТМЦ',
    });
  }

  // Status per row — paid if backend has a tax_payment for this period+code.
  const paidIndex = useMemo(() => {
    const m = new Map<string, TaxPaymentRecord>();
    for (const p of payments) m.set(p.periodKey, p);
    return m;
  }, [payments]);
  const today = new Date();
  const statusOf = (r: TaxRow): 'paid' | 'pending' | 'overdue' => {
    if (!r.applicable) return 'pending';
    const key = periodKey(kind, ref, r.code);
    if (paidIndex.has(key)) return 'paid';
    return new Date(r.due) < today ? 'overdue' : 'pending';
  };

  const totalDue   = rows.filter(r => r.applicable && statusOf(r) !== 'paid').reduce((s, r) => s + r.amount, 0);
  const totalPaid  = rows.filter(r => r.applicable && statusOf(r) === 'paid').reduce((s, r) => s + r.amount, 0);
  const totalAll   = rows.filter(r => r.applicable).reduce((s, r) => s + r.amount, 0);
  const nearestDue = rows
    .filter(r => r.applicable && statusOf(r) !== 'paid')
    .sort((a, b) => a.due.localeCompare(b.due))[0];

  // ─── Actions ────────────────────────────────────────────────────
  async function markPaid(r: TaxRow) {
    if (!r.applicable) return;
    const key = periodKey(kind, ref, r.code);
    setBusyKey(key);
    try {
      await api.post('/api/taxes/payments', { periodKey: key, amount: r.amount });
      refreshPayments();
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally { setBusyKey(null); }
  }
  async function undoPaid(r: TaxRow) {
    const key = periodKey(kind, ref, r.code);
    setBusyKey(key);
    try {
      await api.delete(`/api/taxes/payments/${encodeURIComponent(key)}`);
      refreshPayments();
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally { setBusyKey(null); }
  }

  function shiftRef(step: number) {
    const d = new Date(ref);
    if (kind === 'month') d.setMonth(d.getMonth() + step);
    else d.setMonth(d.getMonth() + step * 3);
    setRef(d);
  }
  function jumpToToday() { setRef(new Date()); }

  async function downloadTaxPDF() {
    setPdfBusy('tax');
    try {
      const pdf = await import('../../utils/pdfReports');
      let company = '';
      try { company = JSON.parse(localStorage.getItem('utir_user_profile') || '{}')?.company || requisites.legalName || ''; } catch {}
      await pdf.generateTaxReportPDF({
        periodLabel: periodLabel(kind, ref),
        rows: rows.filter(r => r.applicable).map(r => ({
          code: r.shortLabel, label: r.label, rate: r.rate, base: r.base,
          amount: r.amount, due: r.due, paid: statusOf(r) === 'paid',
        })),
        company,
      });
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally { setPdfBusy(null); }
  }

  async function downloadVATPDF() {
    setPdfBusy('vat');
    try {
      const pdf = await import('../../utils/pdfReports');
      let company = '';
      try { company = JSON.parse(localStorage.getItem('utir_user_profile') || '{}')?.company || requisites.legalName || ''; } catch {}
      // Build outgoing (sales) and incoming (purchases) lists from
      // transactions in the period.
      const vr = (requisites.rates?.vat ?? DEFAULT_RATES.vat);
      const outgoing = store.transactions
        .filter(t => t.type === 'income' && t.status === 'completed' && inWindow(t.date))
        .map(t => ({ date: t.date, counterparty: t.description || t.category, amount: t.amount, vat: t.amount * vr / (1 + vr) }));
      const incoming = store.transactions
        .filter(t => t.type === 'expense' && t.status === 'completed' && inWindow(t.date))
        .map(t => ({ date: t.date, counterparty: t.description || t.category, amount: t.amount, vat: t.amount * vr / (1 + vr) }));
      await pdf.generateVATReportPDF({
        period: { from: periodWindow.from, to: periodWindow.to },
        periodLabel: periodLabel(kind, ref),
        outgoing, incoming, company,
      });
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally { setPdfBusy(null); }
  }

  if (!reqLoaded) return <div className="p-8 text-center text-xs text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Загрузка…</div>;

  return (
    <div className="space-y-4">
      {/* ─── Period bar (Month/Quarter + chevrons + PDF) ───────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
            <button onClick={() => setKind('month')}   className={`px-3 py-1 rounded-md text-[11px] transition ${kind === 'month'   ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Месяц</button>
            <button onClick={() => setKind('quarter')} className={`px-3 py-1 rounded-md text-[11px] transition ${kind === 'quarter' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Квартал</button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => shiftRef(-1)} className="w-7 h-7 hover:bg-gray-50 rounded-lg flex items-center justify-center"><ChevronLeft className="w-3.5 h-3.5 text-gray-500" /></button>
            <div className="text-sm text-gray-900 px-1 capitalize">{periodLabel(kind, ref)}</div>
            <button onClick={() => shiftRef(1)} className="w-7 h-7 hover:bg-gray-50 rounded-lg flex items-center justify-center"><ChevronRight className="w-3.5 h-3.5 text-gray-500" /></button>
          </div>
          <button onClick={jumpToToday} className="text-[10px] text-emerald-600 hover:text-violet-800 inline-flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Сегодня
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadTaxPDF}
            disabled={pdfBusy !== null}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-100 hover:border-gray-200 rounded-lg text-[11px] text-gray-700 disabled:opacity-50"
          >
            {pdfBusy === 'tax' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
            Налоговый отчёт PDF
          </button>
          {vatPayer && (
            <button
              onClick={downloadVATPDF}
              disabled={pdfBusy !== null}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-100 hover:border-amber-200 rounded-lg text-[11px] text-amber-700 disabled:opacity-50"
              title="ЭСФ-готовый отчёт по НДС (входящие/исходящие за период)"
            >
              {pdfBusy === 'vat' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
              ЭСФ / НДС
            </button>
          )}
        </div>
      </div>

      {/* ─── KPI strip ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">К оплате</div>
          <div className="text-base text-gray-900 tabular-nums">{fmt(totalDue)}</div>
          <div className="text-[10px] text-amber-600 mt-1">{rows.filter(r => r.applicable && statusOf(r) !== 'paid').length} налогов</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Оплачено</div>
          <div className="text-base text-gray-900 tabular-nums">{fmt(totalPaid)}</div>
          <div className="text-[10px] text-emerald-600 mt-1">{rows.filter(r => r.applicable && statusOf(r) === 'paid').length} налогов</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Итого за период</div>
          <div className="text-base text-gray-900 tabular-nums">{fmt(totalAll)}</div>
          <div className="text-[10px] text-gray-500 mt-1">{revenueBase ? Math.round((totalAll / revenueBase) * 100) : 0}% от выручки</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Ближайший срок</div>
          <div className="text-base text-gray-900">{nearestDue ? nearestDue.due.slice(8, 10) + '.' + nearestDue.due.slice(5, 7) : '—'}</div>
          <div className="text-[10px] text-rose-600 mt-1">{nearestDue ? `${nearestDue.shortLabel} · ${fmt(nearestDue.amount)}` : 'Всё оплачено'}</div>
        </div>
      </div>

      {/* ─── Warning if requisites not configured for VAT/IP ──────── */}
      {!reqLoaded ? null : !requisites.legalName ? (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm text-amber-900 mb-0.5">Заполните реквизиты компании</div>
            <div className="text-xs text-amber-700">
              Настройки → Общие → Реквизиты. Укажите ТОО / ИП и статус плательщика НДС — налоги будут считаться правильно для вашей формы.
            </div>
          </div>
        </div>
      ) : null}

      {/* ─── Tax cards ─────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-3">
        {rows.map((r) => {
          const status = statusOf(r);
          const key = periodKey(kind, ref, r.code);
          const isBusy = busyKey === key;
          return (
            <div
              key={r.code}
              className={`bg-white rounded-2xl border p-4 transition-shadow ${
                !r.applicable ? 'opacity-60' :
                r.highlight ? 'border-violet-200 ring-1 ring-violet-100 hover:shadow-sm' :
                'border-gray-100 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[11px] flex-shrink-0 ${r.icon}`}>
                  {r.shortLabel}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="text-sm text-gray-900 truncate">{r.label}</div>
                    {r.highlight && <Star className="w-3 h-3 text-violet-500 fill-violet-500 flex-shrink-0" />}
                  </div>
                  <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5 flex-wrap">
                    <span>Ставка {r.rate}</span>
                    <span>·</span>
                    <span>База {fmt(r.base)}</span>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded flex-shrink-0 ${
                  !r.applicable ? 'bg-gray-50 text-gray-400' : STATUS_LABEL[status].cls
                }`}>
                  {!r.applicable ? 'Не применим' : STATUS_LABEL[status].ru}
                </span>
              </div>

              <div className="flex items-end justify-between mb-3">
                <div>
                  <div className="text-[10px] text-gray-400 mb-0.5">Сумма к оплате</div>
                  <div className="text-lg text-gray-900 tabular-nums">{fmt(r.amount)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-gray-400 mb-0.5">Срок</div>
                  <div className="text-xs text-gray-700 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-gray-400" /> {r.due}
                  </div>
                </div>
              </div>

              {r.note && (
                <div className="text-[10px] text-gray-500 bg-gray-50 rounded-lg px-2 py-1 mb-3">
                  {r.note}
                </div>
              )}

              <div className="flex items-center gap-2">
                {!r.applicable ? (
                  <div className="flex-1 text-[11px] text-gray-400 italic text-center py-1.5">Не применяется</div>
                ) : status === 'paid' ? (
                  <>
                    <div className="flex-1 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5">
                      <FileCheck className="w-3.5 h-3.5" /> Оплачено
                    </div>
                    <button
                      onClick={() => undoPaid(r)}
                      disabled={isBusy}
                      className="px-3 py-1.5 border border-gray-100 rounded-lg text-[11px] text-gray-500 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"
                      title="Отменить отметку об уплате"
                    >
                      {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => markPaid(r)}
                      disabled={isBusy}
                      className="flex-1 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs hover:bg-gray-800 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                    >
                      {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileCheck className="w-3 h-3" />}
                      Отметить уплату
                    </button>
                  </>
                )}
                <a
                  href="https://cabinet.salyk.kz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-100 rounded-lg text-[11px] text-gray-600 hover:bg-gray-50 transition-colors"
                  title="Перейти в кабинет налогоплательщика"
                >
                  Salyk <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Reporting calendar (static reference) ─────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Receipt className="w-3.5 h-3.5 text-gray-400" />
          <div className="text-sm text-gray-900">Календарь сдачи отчётности РК</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {[
            { name: 'Декларация по ИПН/СН (ФНО 200.00)', date: '15 числа второго месяца следующего квартала', period: 'Ежеквартально' },
            { name: 'Декларация по НДС (ФНО 300.00)',     date: '15 числа второго месяца следующего квартала', period: 'Ежеквартально' },
            { name: 'Декларация по КПН (ФНО 100.00)',     date: '31 марта следующего года',                    period: 'Год' },
            { name: 'Декларация по ОПВ/ОСМС',             date: '15 числа следующего месяца',                  period: 'Ежемесячно' },
            { name: 'Расчёт по имуществу (ФНО 700.00)',   date: '31 марта',                                    period: 'Год' },
            { name: 'СНТ / ЭСФ',                          date: 'В день отгрузки',                             period: 'По операции' },
          ].map((r, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-900 mb-0.5">{r.name}</div>
              <div className="text-[10px] text-gray-400">{r.period} · {r.date}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
