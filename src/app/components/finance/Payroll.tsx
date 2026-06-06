// Payroll sheet (Зарплатная ведомость) — the owner's "close the month"
// view. For a chosen month it computes, per teammate:
//   base salary (oklad)  +  commission (% of revenue from their completed
//   deals)  =  accrued  →  one click marks it paid, writing a finance
//   expense so it flows into Cash flow / P&L automatically.
//
// Attribution mirrors the Аналитика → Команда tab: ownerId first, then a
// name match on measurer/designer/foreman/architect. Niche-aware role
// labels. Sensitive — only finance-write roles see the pay buttons.

import { useMemo, useState } from 'react';
import { Wallet, Check, Loader2, Download, Percent, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { useDataStore } from '../../utils/dataStore';
import { getNiche } from '../../utils/niches';
import { rowsToCsv, downloadCsv, type CsvColumn } from '../../utils/csv';

interface Props { language: 'kz' | 'ru' | 'eng'; }

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';
// Machine tag embedded in the salary expense description so we can tell a
// given employee was already paid for a given month (idempotency).
const payTag = (empId: string, month: string) => `[payroll:${empId}:${month}]`;

export function Payroll({ language }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();
  const niche = getNiche(store.niche);
  const canWrite = store.canWriteModule('finance');

  // Month selector — default current month, step backward/forward.
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
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

  // Per-employee payroll row for the selected month.
  const rows = useMemo(() => {
    return team.map(emp => {
      const nameLow = (emp.name || '').toLowerCase().trim();
      const first = nameLow.split(/\s+/)[0] || '';
      const match = (v?: string) => !!v && (v.toLowerCase().includes(nameLow) || (first.length > 2 && v.toLowerCase().includes(first)));
      // Deals attributed to this employee, completed, with a date in the month.
      const deals = store.deals.filter(d => {
        const mine = d.ownerId ? d.ownerId === emp.id : (match(d.measurer) || match(d.designer) || match((d as any).foreman) || match((d as any).architect));
        if (!mine || d.status !== 'completed') return false;
        const when = (d.installationDate || d.date || d.createdAt || '').slice(0, 7);
        return when === month;
      });
      const revenue = deals.reduce((s, d) => s + (d.paidAmount || 0), 0);
      const base = Number(emp.salary) || 0;
      const pct = Number((emp as any).commissionPct) || 0;
      const commission = Math.round(revenue * pct / 100);
      const accrued = base + commission;
      // Already paid this month? Look for our tagged salary expense.
      const paid = store.transactions.some(t =>
        t.type === 'expense' && (t.description || '').includes(payTag(emp.id, month)),
      );
      return { emp, deals: deals.length, revenue, base, pct, commission, accrued, paid };
    });
  }, [team, store.deals, store.transactions, month]);

  const totals = useMemo(() => ({
    base: rows.reduce((s, r) => s + r.base, 0),
    commission: rows.reduce((s, r) => s + r.commission, 0),
    accrued: rows.reduce((s, r) => s + r.accrued, 0),
    unpaid: rows.filter(r => !r.paid).reduce((s, r) => s + r.accrued, 0),
  }), [rows]);

  const [busyId, setBusyId] = useState<string | null>(null);

  const pay = (r: typeof rows[number]) => {
    if (!canWrite || r.paid || r.accrued <= 0) return;
    setBusyId(r.emp.id);
    store.addTransaction({
      type: 'expense',
      category: l('Зарплата', 'Жалақы', 'Salary'),
      amount: r.accrued,
      date: new Date().toISOString().slice(0, 10),
      description: `${l('Зарплата', 'Жалақы', 'Salary')} · ${r.emp.name} · ${monthLabel} ${payTag(r.emp.id, month)}`,
      status: 'completed',
    });
    setTimeout(() => setBusyId(null), 400);
  };

  const payAll = () => {
    if (!canWrite) return;
    rows.filter(r => !r.paid && r.accrued > 0).forEach(r => pay(r));
  };

  const setPct = (empId: string, pct: number) => {
    store.updateEmployee(empId, { commissionPct: Math.max(0, Math.min(100, pct)) } as any);
  };

  const exportCsv = () => {
    const cols: CsvColumn<typeof rows[number]>[] = [
      { header: l('Сотрудник', 'Қызметкер', 'Employee'), value: r => r.emp.name },
      { header: l('Роль', 'Рөл', 'Role'), value: r => r.emp.role },
      { header: l('Закрыто сделок', 'Жабылған', 'Deals closed'), value: r => r.deals },
      { header: l('Выручка', 'Түсім', 'Revenue'), value: r => r.revenue },
      { header: l('Оклад', 'Айлық', 'Base'), value: r => r.base },
      { header: '%', value: r => r.pct },
      { header: l('Премия', 'Сыйақы', 'Commission'), value: r => r.commission },
      { header: l('К выплате', 'Төленетін', 'Accrued'), value: r => r.accrued },
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {[
            { label: l('Оклады', 'Айлықтар', 'Base'), value: fmt(totals.base) },
            { label: l('Премии', 'Сыйақылар', 'Commission'), value: fmt(totals.commission) },
            { label: l('Всего начислено', 'Барлығы', 'Total accrued'), value: fmt(totals.accrued) },
            { label: l('Осталось выплатить', 'Төленетін', 'To pay'), value: fmt(totals.unpaid), accent: true },
          ].map((c, i) => (
            <div key={i} className={`rounded-2xl p-3 ring-1 ${c.accent ? 'bg-emerald-50/70 ring-emerald-100/60' : 'bg-white/50 ring-white/60'}`}>
              <div className="text-[10px] text-slate-400">{c.label}</div>
              <div className={`text-sm mt-0.5 tabular-nums ${c.accent ? 'text-emerald-700' : 'text-gray-900'}`}>{c.value}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-4">
          {canWrite && totals.unpaid > 0 && (
            <button onClick={payAll} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs hover:bg-emerald-700 transition-colors shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10">
              <Check className="w-3.5 h-3.5" /> {l('Выплатить всем', 'Барлығына төлеу', 'Pay all')}
            </button>
          )}
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs text-slate-600 hover:bg-white transition-colors">
            <Download className="w-3.5 h-3.5" /> {l('Экспорт CSV', 'CSV экспорт', 'Export CSV')}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {team.length === 0 ? (
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-3xl p-10 text-center">
          <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <div className="text-sm text-gray-700 mb-1">{l('В команде пока никого', 'Командада ешкім жоқ', 'No team yet')}</div>
          <div className="text-xs text-slate-400">{l('Добавьте сотрудников — зарплаты посчитаются автоматически из закрытых сделок.', 'Қызметкерлерді қосыңыз.', 'Add teammates — payroll is computed from their closed deals.')}</div>
        </div>
      ) : (
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead>
              <tr className="text-[10px] text-slate-400 uppercase tracking-wide">
                <th className="text-left px-3 py-2 font-normal">{l('Сотрудник', 'Қызметкер', 'Employee')}</th>
                <th className="text-right px-3 py-2 font-normal">{l('Закрыто', 'Жабылған', 'Closed')}</th>
                <th className="text-right px-3 py-2 font-normal">{l('Выручка', 'Түсім', 'Revenue')}</th>
                <th className="text-right px-3 py-2 font-normal">{l('Оклад', 'Айлық', 'Base')}</th>
                <th className="text-right px-3 py-2 font-normal">%</th>
                <th className="text-right px-3 py-2 font-normal">{l('Премия', 'Сыйақы', 'Commission')}</th>
                <th className="text-right px-3 py-2 font-normal">{l('К выплате', 'Төленетін', 'Accrued')}</th>
                <th className="text-right px-3 py-2 font-normal">{l('Действие', 'Әрекет', 'Action')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.emp.id} className="border-t border-white/60 hover:bg-white/30">
                  <td className="px-3 py-2.5">
                    <div className="text-gray-900">{r.emp.name}</div>
                    <div className="text-[10px] text-slate-400">{r.emp.role}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{r.deals}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmt(r.revenue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmt(r.base)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {canWrite ? (
                      <div className="inline-flex items-center gap-0.5">
                        <input
                          type="number" min={0} max={100} value={r.pct}
                          onChange={e => setPct(r.emp.id, Number(e.target.value))}
                          className="w-12 text-right bg-white/60 ring-1 ring-white/60 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:ring-slate-300"
                        />
                        <Percent className="w-3 h-3 text-slate-300" />
                      </div>
                    ) : <span className="text-slate-600 tabular-nums">{r.pct}%</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmt(r.commission)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">{fmt(r.accrued)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {r.paid ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px]"><Check className="w-3 h-3" /> {l('Выплачено', 'Төленді', 'Paid')}</span>
                    ) : canWrite ? (
                      <button
                        onClick={() => pay(r)}
                        disabled={r.accrued <= 0 || busyId === r.emp.id}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] hover:bg-emerald-700 disabled:opacity-40 transition-colors inline-flex items-center gap-1"
                      >
                        {busyId === r.emp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        {l('Выплатить', 'Төлеу', 'Pay')}
                      </button>
                    ) : <span className="text-[11px] text-slate-400">{l('К выплате', 'Төленетін', 'Unpaid')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] text-slate-400 px-3 py-2 leading-relaxed">
            {l(
              `Премия = выручка по закрытым сделкам сотрудника × его %. Выплата записывается в расходы (категория «Зарплата») и попадает в Поток и Прибыль. Ниша: ${niche.name.ru}.`,
              'Сыйақы = жабылған мәмілелер түсімі × пайыз. Төлем шығысқа жазылады.',
              'Commission = revenue from closed deals × their %. Payment is recorded as an expense and flows into Cash flow and P&L.',
            )}
          </div>
        </div>
      )}
    </div>
  );
}
