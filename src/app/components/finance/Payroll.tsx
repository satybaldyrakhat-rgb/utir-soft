// Payroll sheet (Зарплатная ведомость) — KZ-correct close-the-month view.
// Per teammate for a chosen month:
//   gross (оклад + премия с закрытых сделок)
//   − удержания у работника: ОПВ + ВОСМС + ИПН (с учётом вычета 14 МРП)
//   = на руки (net)
//   + взносы работодателя: ООСМС, СО, ОПВР, СН (на ОУР)
//   = полная стоимость для бизнеса.
// «Выплатить» записывает НЕТ (на руки) расходом «Зарплата» (идемпотентно);
// налоги/взносы накапливаются отдельно в Финансы → Налоги.
// Каждую строку можно развернуть в расчётный листок.

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Wallet, Check, Loader2, Download, Percent, ChevronLeft, ChevronRight, ChevronDown, Users } from 'lucide-react';
import { useDataStore } from '../../utils/dataStore';
import { getNiche } from '../../utils/niches';
import { api } from '../../utils/api';
import { rowsToCsv, downloadCsv, type CsvColumn } from '../../utils/csv';

interface Props { language: 'kz' | 'ru' | 'eng'; }

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';
const payTag = (empId: string, month: string) => `[payroll:${empId}:${month}]`;

const RATE_FALLBACK = { opv: 0.10, vosms: 0.02, ipn: 0.10, oosms: 0.03, so: 0.035, opvr: 0.025, sn: 0.095 };

interface TaxCfg { rates: typeof RATE_FALLBACK; mrp: number; regime: string }

// Per-employee KZ payroll math on a gross amount.
function calcPayroll(gross: number, cfg: TaxCfg) {
  const r = cfg.rates;
  const opv = gross * r.opv;                       // удержание
  const vosms = gross * r.vosms;                   // удержание
  const deduction = 14 * (cfg.mrp || 0);           // стандартный налоговый вычет 14 МРП
  const ipnBase = Math.max(0, gross - opv - vosms - deduction);
  const ipn = ipnBase * r.ipn;                     // удержание
  const net = gross - opv - vosms - ipn;           // на руки
  // взносы работодателя (сверх gross):
  const oosms = gross * r.oosms;
  const so = Math.max(0, (gross - opv) * r.so);
  const opvr = gross * r.opvr;
  const sn = cfg.regime === 'general' ? Math.max(0, gross * r.sn - so) : 0; // СН только на ОУР
  const employerCost = gross + oosms + so + opvr + sn;
  return { gross, opv, vosms, ipn, net, oosms, so, opvr, sn, employerCost };
}

export function Payroll({ language }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();
  const niche = getNiche(store.niche);
  const canWrite = store.canWriteModule('finance');

  const [cfg, setCfg] = useState<TaxCfg>({ rates: RATE_FALLBACK, mrp: 3932, regime: 'simplified' });
  useEffect(() => {
    api.get<any>('/api/team/requisites')
      .then(d => setCfg({
        rates: { ...RATE_FALLBACK, ...(d?.rates || {}) },
        mrp: Number(d?.mrp) || 3932,
        regime: d?.taxRegime || 'simplified',
      }))
      .catch(() => { /* keep fallback */ });
  }, []);

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [expanded, setExpanded] = useState<string | null>(null);
  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(language === 'eng' ? 'en-US' : 'ru-RU', { month: 'long', year: 'numeric' });
  }, [month, language]);

  const team = store.employees.filter((e: any) => !e.removed_at);

  const rows = useMemo(() => {
    return team.map(emp => {
      const nameLow = (emp.name || '').toLowerCase().trim();
      const first = nameLow.split(/\s+/)[0] || '';
      const match = (v?: string) => !!v && (v.toLowerCase().includes(nameLow) || (first.length > 2 && v.toLowerCase().includes(first)));
      const deals = store.deals.filter(d => {
        const mine = d.ownerId ? d.ownerId === emp.id : (match(d.measurer) || match(d.designer) || match((d as any).foreman) || match((d as any).architect));
        if (!mine || d.status !== 'completed') return false;
        const when = (d.installationDate || d.date || d.createdAt || '').slice(0, 7);
        return when === month;
      });
      const revenue = deals.reduce((s, d) => s + (d.paidAmount || 0), 0);
      const base = Number(emp.salary) || 0;
      const pctRate = Number((emp as any).commissionPct) || 0;
      const commission = Math.round(revenue * pctRate / 100);
      const gross = base + commission;
      const calc = calcPayroll(gross, cfg);
      const paid = store.transactions.some(t => t.type === 'expense' && (t.description || '').includes(payTag(emp.id, month)));
      return { emp, dealsCount: deals.length, revenue, base, pctRate, commission, paid, ...calc };
    });
  }, [team, store.deals, store.transactions, month, cfg]);

  const totals = useMemo(() => ({
    gross: rows.reduce((s, r) => s + r.gross, 0),
    withheld: rows.reduce((s, r) => s + r.opv + r.vosms + r.ipn, 0),
    net: rows.reduce((s, r) => s + r.net, 0),
    employer: rows.reduce((s, r) => s + (r.oosms + r.so + r.opvr + r.sn), 0),
    cost: rows.reduce((s, r) => s + r.employerCost, 0),
    unpaidNet: rows.filter(r => !r.paid).reduce((s, r) => s + r.net, 0),
  }), [rows]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const pay = (r: typeof rows[number]) => {
    if (!canWrite || r.paid || r.net <= 0) return;
    setBusyId(r.emp.id);
    // Записываем НА РУКИ (net). Налоги/взносы — отдельно в Налогах.
    store.addTransaction({
      type: 'expense',
      category: l('Зарплата', 'Жалақы', 'Salary'),
      amount: Math.round(r.net),
      date: new Date().toISOString().slice(0, 10),
      description: `${l('Зарплата (на руки)', 'Жалақы', 'Salary (net)')} · ${r.emp.name} · ${monthLabel} ${payTag(r.emp.id, month)}`,
      status: 'completed',
    });
    setTimeout(() => setBusyId(null), 400);
  };
  const payAll = () => { if (canWrite) rows.filter(r => !r.paid && r.net > 0).forEach(pay); };
  const setPct = (empId: string, pct: number) => store.updateEmployee(empId, { commissionPct: Math.max(0, Math.min(100, pct)) } as any);

  const exportCsv = () => {
    const cols: CsvColumn<typeof rows[number]>[] = [
      { header: l('Сотрудник', 'Қызметкер', 'Employee'), value: r => r.emp.name },
      { header: l('Закрыто', 'Жабылған', 'Closed'), value: r => r.dealsCount },
      { header: l('Выручка', 'Түсім', 'Revenue'), value: r => r.revenue },
      { header: l('Оклад', 'Айлық', 'Base'), value: r => r.base },
      { header: '%', value: r => r.pctRate },
      { header: l('Премия', 'Сыйақы', 'Commission'), value: r => r.commission },
      { header: l('Начислено', 'Есептелген', 'Gross'), value: r => r.gross },
      { header: 'ОПВ', value: r => Math.round(r.opv) },
      { header: 'ВОСМС', value: r => Math.round(r.vosms) },
      { header: 'ИПН', value: r => Math.round(r.ipn) },
      { header: l('На руки', 'Қолға', 'Net'), value: r => Math.round(r.net) },
      { header: 'ООСМС', value: r => Math.round(r.oosms) },
      { header: 'СО', value: r => Math.round(r.so) },
      { header: 'ОПВР', value: r => Math.round(r.opvr) },
      { header: 'СН', value: r => Math.round(r.sn) },
      { header: l('Стоимость для бизнеса', 'Бизнес құны', 'Employer cost'), value: r => Math.round(r.employerCost) },
      { header: l('Статус', 'Күй', 'Status'), value: r => r.paid ? l('Выплачено', 'Төленді', 'Paid') : l('К выплате', 'Төленетін', 'Unpaid') },
    ];
    downloadCsv(`payroll-${month}.csv`, rowsToCsv(rows, cols));
  };

  return (
    <div className="space-y-4">
      {/* Header: month nav + totals */}
      <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-600" />
            <div className="text-sm text-gray-900">{l('Зарплатная ведомость', 'Жалақы ведомосы', 'Payroll')}</div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-xl bg-white/60 ring-1 ring-white/60 flex items-center justify-center hover:bg-white"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
            <span className="text-sm text-gray-900 capitalize px-2 min-w-[120px] text-center">{monthLabel}</span>
            <button onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-xl bg-white/60 ring-1 ring-white/60 flex items-center justify-center hover:bg-white"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          {[
            { label: l('Начислено (gross)', 'Есептелген', 'Gross'), value: fmt(totals.gross) },
            { label: l('Удержания', 'Ұсталымдар', 'Withheld'), value: fmt(totals.withheld) },
            { label: l('На руки', 'Қолға', 'Net'), value: fmt(totals.net), accent: true },
            { label: l('Взносы раб-ля', 'Жарналар', 'Employer'), value: fmt(totals.employer) },
            { label: l('Стоимость бизнесу', 'Бизнес құны', 'Total cost'), value: fmt(totals.cost) },
          ].map((c, i) => (
            <div key={i} className={`rounded-2xl p-3 ring-1 ${c.accent ? 'bg-emerald-50/70 ring-emerald-100/60' : 'bg-white/50 ring-white/60'}`}>
              <div className="text-[10px] text-slate-400">{c.label}</div>
              <div className={`text-sm mt-0.5 tabular-nums ${c.accent ? 'text-emerald-700' : 'text-gray-900'}`}>{c.value}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {canWrite && totals.unpaidNet > 0 && (
            <button onClick={payAll} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs hover:bg-emerald-700 transition-colors shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10">
              <Check className="w-3.5 h-3.5" /> {l('Выплатить всем (на руки)', 'Барлығына төлеу', 'Pay all (net)')}
            </button>
          )}
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs text-slate-600 hover:bg-white transition-colors">
            <Download className="w-3.5 h-3.5" /> {l('Экспорт CSV', 'CSV экспорт', 'Export CSV')}
          </button>
          <span className="text-[10px] text-slate-400">
            {l(`Режим: ${cfg.regime === 'simplified' ? 'упрощёнка' : cfg.regime === 'retail' ? 'розничный' : 'ОУР'} · вычет ИПН 14 МРП`, '', '')}
          </span>
        </div>
      </div>

      {team.length === 0 ? (
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-3xl p-10 text-center">
          <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <div className="text-sm text-gray-700 mb-1">{l('В команде пока никого', 'Командада ешкім жоқ', 'No team yet')}</div>
          <div className="text-xs text-slate-400">{l('Добавьте сотрудников — зарплата посчитается из закрытых сделок.', 'Қызметкерлерді қосыңыз.', 'Add teammates — payroll computes from closed deals.')}</div>
        </div>
      ) : (
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-2 overflow-x-auto">
          <table className="w-full min-w-[820px] text-xs">
            <thead>
              <tr className="text-[10px] text-slate-400 uppercase tracking-wide">
                <th className="text-left px-3 py-2 font-normal">{l('Сотрудник', 'Қызметкер', 'Employee')}</th>
                <th className="text-right px-3 py-2 font-normal">{l('Оклад', 'Айлық', 'Base')}</th>
                <th className="text-right px-3 py-2 font-normal">%</th>
                <th className="text-right px-3 py-2 font-normal">{l('Премия', 'Сыйақы', 'Comm.')}</th>
                <th className="text-right px-3 py-2 font-normal">{l('Начислено', 'Есептелген', 'Gross')}</th>
                <th className="text-right px-3 py-2 font-normal">{l('Удержано', 'Ұсталды', 'Withheld')}</th>
                <th className="text-right px-3 py-2 font-normal">{l('На руки', 'Қолға', 'Net')}</th>
                <th className="text-right px-3 py-2 font-normal">{l('Действие', 'Әрекет', 'Action')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const withheld = r.opv + r.vosms + r.ipn;
                const open = expanded === r.emp.id;
                return (
                  <Fragment key={r.emp.id}>
                    <tr className="border-t border-white/60 hover:bg-white/30">
                      <td className="px-3 py-2.5">
                        <button onClick={() => setExpanded(open ? null : r.emp.id)} className="flex items-center gap-1 text-left">
                          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                          <span>
                            <span className="text-gray-900 block">{r.emp.name}</span>
                            <span className="text-[10px] text-slate-400">{r.emp.role} · {r.dealsCount} {l('сделок', 'мәміле', 'deals')}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmt(r.base)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {canWrite ? (
                          <div className="inline-flex items-center gap-0.5">
                            <input type="number" min={0} max={100} value={r.pctRate} onChange={e => setPct(r.emp.id, Number(e.target.value))}
                              className="w-11 text-right bg-white/60 ring-1 ring-white/60 rounded-lg px-1 py-1 text-xs focus:outline-none focus:ring-slate-300" />
                            <Percent className="w-3 h-3 text-slate-300" />
                          </div>
                        ) : <span className="text-slate-600 tabular-nums">{r.pctRate}%</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmt(r.commission)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">{fmt(r.gross)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-rose-500">−{fmt(withheld)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{fmt(r.net)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {r.paid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px]"><Check className="w-3 h-3" /> {l('Выплачено', 'Төленді', 'Paid')}</span>
                        ) : canWrite ? (
                          <button onClick={() => pay(r)} disabled={r.net <= 0 || busyId === r.emp.id}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1">
                            {busyId === r.emp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}{l('Выплатить', 'Төлеу', 'Pay')}
                          </button>
                        ) : <span className="text-[11px] text-slate-400">{l('К выплате', 'Төленетін', 'Unpaid')}</span>}
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={8} className="px-6 py-3">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">{l('Расчётный листок', 'Есеп парағы', 'Payslip')} · {monthLabel}</div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-[11px]">
                            <Line label={l('Оклад', 'Айлық', 'Base')} v={fmt(r.base)} />
                            <Line label={l('Премия', 'Сыйақы', 'Commission')} v={fmt(r.commission)} />
                            <Line label={l('Начислено (gross)', 'Есептелген', 'Gross')} v={fmt(r.gross)} bold />
                            <span />
                            <Line label="ОПВ 10%" v={'−' + fmt(r.opv)} neg />
                            <Line label="ВОСМС 2%" v={'−' + fmt(r.vosms)} neg />
                            <Line label="ИПН 10%" v={'−' + fmt(r.ipn)} neg />
                            <Line label={l('На руки', 'Қолға', 'Net')} v={fmt(r.net)} bold accent />
                            <Line label="ООСМС 3%" v={fmt(r.oosms)} />
                            <Line label="СО 3.5%" v={fmt(r.so)} />
                            <Line label="ОПВР 2.5%" v={fmt(r.opvr)} />
                            {cfg.regime === 'general' && <Line label="СН" v={fmt(r.sn)} />}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-2">
                            {l(`Стоимость для бизнеса: ${fmt(r.employerCost)} (на руки + взносы работодателя). ИПН с вычетом 14 МРП (${fmt(14 * cfg.mrp)}).`, '', '')}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <div className="text-[10px] text-slate-400 px-3 py-2 leading-relaxed">
            {l(
              `«Выплатить» записывает сумму НА РУКИ в расходы. ОПВ/ИПН/ВОСМС/ООСМС/СО и др. накапливаются в Финансы → Налоги. Премия = выручка по закрытым сделкам × %. Ниша: ${niche.name.ru}.`,
              'Қолға берілетін сома шығысқа жазылады. Салықтар Қаржы → Салықтар бөлімінде.',
              'Pay records the NET payout as an expense. Contributions accrue in Finance → Taxes.',
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Line({ label, v, neg, bold, accent }: { label: string; v: string; neg?: boolean; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className={`tabular-nums ${accent ? 'text-emerald-700' : neg ? 'text-rose-500' : 'text-gray-900'} ${bold ? 'font-medium' : ''}`}>{v}</span>
    </div>
  );
}
