import { useMemo, useState } from 'react';
import { Banknote, Landmark, Smartphone, Package, Users, CreditCard, BookOpen } from 'lucide-react';
import { useDataStore } from '../../utils/dataStore';

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';

// Honest "money & debts" view — replaces the old pseudo balance sheet
// (Активы=Пассивы+Капитал), which is fiction for an ИП on the simplified
// regime. A real accountant wants: how much money sits in each account,
// who owes us (дебиторка), whom we owe (кредиторка), and a cash-book.
const ACCOUNTS: { id: 'cash' | 'bank' | 'kaspi'; label: string; icon: any; cls: string }[] = [
  { id: 'cash',  label: 'Касса (наличные)', icon: Banknote,   cls: 'bg-emerald-50 text-emerald-600' },
  { id: 'bank',  label: 'Расчётный счёт',   icon: Landmark,   cls: 'bg-sky-50 text-sky-600' },
  { id: 'kaspi', label: 'Kaspi',            icon: Smartphone, cls: 'bg-rose-50 text-rose-600' },
];

export function Balance() {
  const store = useDataStore();
  const [showLedger, setShowLedger] = useState(false);

  // Per-account balance from completed transactions (missing account → bank).
  const completed = store.transactions.filter(t => t.status === 'completed');
  const accountBalance = (acc: 'cash' | 'bank' | 'kaspi') => completed
    .filter(t => (t.account || 'bank') === acc)
    .reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
  const balances = ACCOUNTS.map(a => ({ ...a, value: accountBalance(a.id) }));
  const totalMoney = balances.reduce((s, a) => s + a.value, 0);

  // Real receivables — what clients still owe on active (non-rejected)
  // deals. Far more accurate than "pending income tx".
  const receivableDeals = store.deals.filter(d => !['rejected'].includes(d.status) && (d.amount || 0) > (d.paidAmount || 0));
  const receivables = receivableDeals.reduce((s, d) => s + ((d.amount || 0) - (d.paidAmount || 0)), 0);
  // Payables — planned/overdue expenses not yet paid.
  const payableTx = store.transactions.filter(t => t.type === 'expense' && t.status !== 'completed');
  const payables = payableTx.reduce((s, t) => s + t.amount, 0);
  // Inventory (информационно) — book value of warehouse stock.
  const inventory = store.products.reduce((s, p) => s + (p.cost || 0) * (p.quantity || 0), 0);

  // Cash-book (кассовая книга) — cash-account movements with running balance.
  const cashLedger = useMemo(() => {
    const cash = completed.filter(t => (t.account || 'bank') === 'cash')
      .slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let run = 0;
    const withRun = cash.map(t => { run += t.type === 'income' ? t.amount : -t.amount; return { t, run }; });
    return withRun.reverse();
  }, [completed]);

  return (
    <div className="space-y-4">
      {/* Money accounts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {balances.map(a => {
          const Icon = a.icon;
          return (
            <div key={a.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">{a.label}</div>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${a.cls}`}><Icon className="w-3.5 h-3.5" /></div>
              </div>
              <div className={`text-base tabular-nums ${a.value < 0 ? 'text-rose-600' : 'text-gray-900'}`}>{fmt(a.value)}</div>
            </div>
          );
        })}
      </div>

      {/* Total + debts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-gray-900 text-white rounded-2xl p-4">
          <div className="text-[10px] text-white/60 uppercase tracking-wide mb-1">Всего денег</div>
          <div className="text-lg tabular-nums">{fmt(totalMoney)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Дебиторка (нам должны)</div>
            <Users className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-base text-gray-900 tabular-nums">{fmt(receivables)}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{receivableDeals.length} незакрытых заказов</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Кредиторка (мы должны)</div>
            <CreditCard className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className="text-base text-gray-900 tabular-nums">{fmt(payables)}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{payableTx.length} запланированных расходов</div>
        </div>
      </div>

      {/* Inventory (informational) */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center"><Package className="w-3.5 h-3.5" /></div>
          <div>
            <div className="text-xs text-gray-900">Запасы на складе</div>
            <div className="text-[10px] text-gray-400">Балансовая стоимость материалов (информационно)</div>
          </div>
        </div>
        <div className="text-sm text-gray-900 tabular-nums">{fmt(inventory)}</div>
      </div>

      {/* Cash-book */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <button onClick={() => setShowLedger(v => !v)} className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50">
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-sm text-gray-900">Кассовая книга (наличные)</span>
          </div>
          <span className="text-[10px] text-gray-400">{cashLedger.length} операций · остаток {fmt(accountBalance('cash'))}</span>
        </button>
        {showLedger && (
          cashLedger.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-gray-400">Нет наличных операций. При создании платежа выберите счёт «💵 Касса».</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {cashLedger.map(({ t, run }) => (
                <div key={t.id} className="px-5 py-2.5 flex items-center justify-between text-xs">
                  <div className="min-w-0">
                    <div className="text-gray-700 truncate">{t.category}{t.description ? ` · ${t.description}` : ''}</div>
                    <div className="text-[10px] text-gray-400">{t.date}</div>
                  </div>
                  <div className="flex items-center gap-4 tabular-nums flex-shrink-0">
                    <span className={t.type === 'income' ? 'text-emerald-600' : 'text-rose-500'}>{t.type === 'income' ? '+' : '−'}{fmt(t.amount)}</span>
                    <span className="text-gray-500 w-24 text-right">{fmt(run)}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
