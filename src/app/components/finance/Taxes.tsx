import { AlertCircle, Calendar, Receipt, FileCheck, ExternalLink, Star } from 'lucide-react';
import { useDataStore } from '../../utils/dataStore';

type Tax = {
  code: string;
  label: string;
  rate: string;
  base: number;
  amount: number;
  due: string;
  status: 'pending' | 'paid' | 'overdue';
  icon: string;
  highlight?: boolean;
  vatPayer?: boolean;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: 'Оплачен', cls: 'bg-emerald-50 text-emerald-700' },
  pending: { label: 'К оплате', cls: 'bg-amber-50 text-amber-700' },
  overdue: { label: 'Просрочен', cls: 'bg-rose-50 text-rose-700' },
};

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸';

export function Taxes() {
  const store = useDataStore();
  const monthKey = new Date().toISOString().slice(0, 7);
  const payrollBase = store.employees.filter(e => e.status === 'active').reduce((s, e) => s + e.salary, 0);
  const revenueBase = store.transactions
    .filter(t => t.type === 'income' && t.status === 'completed' && t.date.startsWith(monthKey))
    .reduce((s, t) => s + t.amount, 0);
  const propertyBase = store.products.reduce((s, p) => s + p.cost * p.quantity, 0);
  const today = new Date();
  const due15 = new Date(today.getFullYear(), today.getMonth(), 15).toISOString().slice(0, 10);
  const due25 = new Date(today.getFullYear(), today.getMonth(), 25).toISOString().slice(0, 10);
  const TAXES: Tax[] = [
    { code: 'ИПН', label: 'Индивидуальный подоходный налог', rate: '10%', base: payrollBase, amount: Math.round(payrollBase * 0.10), due: due25, status: 'pending', icon: 'bg-violet-50 text-violet-700', highlight: true },
    { code: 'СН', label: 'Социальный налог', rate: '9.5%', base: payrollBase, amount: Math.round(payrollBase * 0.095), due: due15, status: 'pending', icon: 'bg-rose-50 text-rose-700' },
    { code: 'НДС', label: 'Налог на добавленную стоимость', rate: '12%', base: revenueBase, amount: Math.round(revenueBase * 0.12), due: due15, status: 'pending', icon: 'bg-amber-50 text-amber-700', vatPayer: true },
    { code: 'ОПВ', label: 'Обязательные пенсионные взносы', rate: '10%', base: payrollBase, amount: Math.round(payrollBase * 0.10), due: due15, status: 'pending', icon: 'bg-emerald-50 text-emerald-700' },
    { code: 'ОСМС', label: 'Обязательное медстрахование', rate: '3%', base: payrollBase, amount: Math.round(payrollBase * 0.03), due: due15, status: 'pending', icon: 'bg-sky-50 text-sky-700' },
    { code: 'НИ', label: 'Налог на имущество ТОО', rate: '1.5%', base: propertyBase, amount: Math.round(propertyBase * 0.015), due: due25, status: 'pending', icon: 'bg-indigo-50 text-indigo-700' },
  ];
  const totalDue = TAXES.filter(t => t.status === 'pending').reduce((s, t) => s + t.amount, 0);
  const totalPaid = TAXES.filter(t => t.status === 'paid').reduce((s, t) => s + t.amount, 0);
  const total = TAXES.reduce((s, t) => s + t.amount, 0);
  const nearestDue = TAXES.filter(t => t.status === 'pending').sort((a, b) => a.due.localeCompare(b.due))[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">К оплате</div>
          <div className="text-base text-gray-900 tabular-nums">{fmt(totalDue)}</div>
          <div className="text-[10px] text-amber-600 mt-1">{TAXES.filter(t => t.status === 'pending').length} налогов</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Оплачено</div>
          <div className="text-base text-gray-900 tabular-nums">{fmt(totalPaid)}</div>
          <div className="text-[10px] text-emerald-600 mt-1">{TAXES.filter(t => t.status === 'paid').length} налогов</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Итого за месяц</div>
          <div className="text-base text-gray-900 tabular-nums">{fmt(total)}</div>
          <div className="text-[10px] text-gray-500 mt-1">{revenueBase ? Math.round((total / revenueBase) * 100) : 0}% от выручки</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Ближайший срок</div>
          <div className="text-base text-gray-900">{nearestDue?.due.slice(8) || '—'} мая</div>
          <div className="text-[10px] text-rose-600 mt-1">{nearestDue?.code} · {fmt(nearestDue?.amount || 0)}</div>
        </div>
      </div>

      {nearestDue && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm text-amber-900 mb-0.5">Подходит срок уплаты</div>
            <div className="text-xs text-amber-700">{nearestDue.label} ({nearestDue.code}) — {fmt(nearestDue.amount)} до {nearestDue.due}</div>
          </div>
          <button className="px-3 py-1.5 bg-amber-900 text-white rounded-lg text-xs hover:bg-amber-950 flex-shrink-0">Оплатить через Kaspi Business</button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {TAXES.map((t, i) => (
          <div
            key={i}
            className={`bg-white rounded-2xl border p-4 hover:shadow-sm transition-shadow ${
              t.highlight ? 'border-violet-200 ring-1 ring-violet-100' : 'border-gray-100'
            }`}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[11px] flex-shrink-0 ${t.icon}`}>
                {t.code}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm text-gray-900 truncate">{t.label}</div>
                  {t.highlight && <Star className="w-3 h-3 text-violet-500 fill-violet-500 flex-shrink-0" />}
                </div>
                <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
                  <span>Ставка {t.rate}</span>
                  <span>·</span>
                  <span>База {fmt(t.base)}</span>
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded flex-shrink-0 ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span>
            </div>

            <div className="flex items-end justify-between mb-3">
              <div>
                <div className="text-[10px] text-gray-400 mb-0.5">Сумма к оплате</div>
                <div className="text-lg text-gray-900 tabular-nums">{fmt(t.amount)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-400 mb-0.5">Срок</div>
                <div className="text-xs text-gray-700 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-gray-400" /> {t.due}
                </div>
              </div>
            </div>

            {t.vatPayer && (
              <div className="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mb-3">
                Применяется только если ТОО — плательщик НДС
              </div>
            )}

            <div className="flex items-center gap-2">
              {t.status === 'paid' ? (
                <div className="flex-1 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5">
                  <FileCheck className="w-3.5 h-3.5" /> Оплачено
                </div>
              ) : (
                <button className="flex-1 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs hover:bg-gray-800 transition-colors">
                  Оплатить через Kaspi Business
                </button>
              )}
              <a
                href="https://cabinet.salyk.kz"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
              >
                e-Salyq <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Receipt className="w-3.5 h-3.5 text-gray-400" />
          <div className="text-sm text-gray-900">Календарь сдачи отчётности РК</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { name: 'Декларация по ИПН (ФНО 200.00)', date: '15 мая', period: 'Полугодие' },
            { name: 'Расчёт по СН/ОПВ/ОСМС', date: '15 числа', period: 'Ежемесячно' },
            { name: 'Декларация по НДС (ФНО 300.00)', date: '15 числа', period: 'Квартал' },
          ].map((r, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-900 mb-0.5">{r.name}</div>
              <div className="text-[10px] text-gray-400">{r.period} · до {r.date}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
