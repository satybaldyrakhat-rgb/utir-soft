import { Wallet, Building2, Package, Users, CreditCard, Banknote, FileText } from 'lucide-react';
import { useDataStore } from '../../utils/dataStore';

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸';

export function Balance() {
  const store = useDataStore();

  const cash = store.transactions.filter(t => t.status === 'completed').reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
  const inventory = store.products.reduce((s, p) => s + p.cost * p.quantity, 0);
  const receivables = store.transactions.filter(t => t.type === 'income' && t.status !== 'completed').reduce((s, t) => s + t.amount, 0);
  const payables = store.transactions.filter(t => t.type === 'expense' && t.status !== 'completed').reduce((s, t) => s + t.amount, 0);

  const ASSETS = [
    { icon: Banknote, label: 'Касса и расчётный счёт', value: Math.max(0, cash), items: [`Чистый баланс: ${fmt(Math.max(0, cash))}`] },
    { icon: Package, label: 'Запасы материалов', value: inventory, items: store.products.slice(0, 3).map(p => `${p.name}: ${fmt(p.cost * p.quantity)}`) },
    { icon: Users, label: 'Дебиторская задолж.', value: receivables, items: [`${store.transactions.filter(t => t.type === 'income' && t.status === 'pending').length} ожидают оплату`] },
  ];

  const LIABILITIES = [
    { icon: CreditCard, label: 'Кредиторская задолж.', value: payables, items: [`${store.transactions.filter(t => t.type === 'expense' && t.status !== 'completed').length} расходов запланировано`] },
  ];

  const totalAssets = ASSETS.reduce((s, a) => s + a.value, 0) || 1;
  const totalLiabilities = LIABILITIES.reduce((s, l) => s + l.value, 0);
  const equity = totalAssets - totalLiabilities;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Активы</div>
            <Wallet className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-base text-gray-900 tabular-nums">{fmt(totalAssets)}</div>
          <div className="text-[10px] text-gray-500 mt-1">Актуальные данные</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Обязательства</div>
            <FileText className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className="text-base text-gray-900 tabular-nums">{fmt(totalLiabilities)}</div>
          <div className="text-[10px] text-gray-500 mt-1">{Math.round((totalLiabilities / totalAssets) * 100)}% от активов</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Собственный капитал</div>
            <Building2 className="w-3.5 h-3.5 text-gray-700" />
          </div>
          <div className="text-base text-gray-900 tabular-nums">{fmt(equity)}</div>
          <div className="text-[10px] text-gray-500 mt-1">Активы − обязательства</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
            <div className="text-sm text-gray-900">Активы</div>
            <span className="text-[10px] text-gray-400 tabular-nums">{fmt(totalAssets)}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {ASSETS.map((a, i) => {
              const I = a.icon;
              const pct = Math.round((a.value / totalAssets) * 100);
              return (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center"><I className="w-3.5 h-3.5 text-emerald-600" /></div>
                      <div>
                        <div className="text-xs text-gray-900">{a.label}</div>
                        <div className="text-[10px] text-gray-400">{pct}% от активов</div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-900 tabular-nums">{fmt(a.value)}</div>
                  </div>
                  <div className="w-full h-1 bg-gray-50 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-emerald-300 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  {a.items.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {a.items.map((it, j) => (
                        <span key={j} className="text-[10px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded">{it}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
            <div className="text-sm text-gray-900">Обязательства и капитал</div>
            <span className="text-[10px] text-gray-400 tabular-nums">{fmt(totalAssets)}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {LIABILITIES.map((a, i) => {
              const I = a.icon;
              const pct = Math.round((a.value / totalAssets) * 100);
              return (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-rose-50 rounded-xl flex items-center justify-center"><I className="w-3.5 h-3.5 text-rose-500" /></div>
                      <div>
                        <div className="text-xs text-gray-900">{a.label}</div>
                        <div className="text-[10px] text-gray-400">{pct}% от пассивов</div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-900 tabular-nums">{fmt(a.value)}</div>
                  </div>
                  <div className="w-full h-1 bg-gray-50 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-rose-300 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  {a.items.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {a.items.map((it, j) => (
                        <span key={j} className="text-[10px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded">{it}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="px-5 py-3 bg-gray-50/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center"><Building2 className="w-3.5 h-3.5 text-gray-700" /></div>
                  <div>
                    <div className="text-xs text-gray-900">Собственный капитал</div>
                    <div className="text-[10px] text-gray-400">{Math.round((equity / totalAssets) * 100)}% от пассивов</div>
                  </div>
                </div>
                <div className="text-sm text-gray-900 tabular-nums">{fmt(equity)}</div>
              </div>
              <div className="w-full h-1 bg-white rounded-full overflow-hidden">
                <div className="h-full bg-gray-700 rounded-full" style={{ width: `${(equity / totalAssets) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
