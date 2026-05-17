import { useState, useMemo } from 'react';
import { Plus, Search } from 'lucide-react';
import { useDataStore } from '../../utils/dataStore';

type Order = { id: string; name: string; master: string; revenue: number; expenses: number; profit: number; margin: number; status: 'completed' | 'partial' | 'pending'; client?: string; hasRealExpenses: boolean; };

const STATUS: Record<Order['status'], { ru: string; cls: string }> = {
  completed: { ru: 'Оплачен', cls: 'bg-emerald-50 text-emerald-700' },
  partial: { ru: 'Частично', cls: 'bg-amber-50 text-amber-700' },
  pending: { ru: 'Ожидает', cls: 'bg-gray-50 text-gray-500' },
};
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';

export function OrderManagement() {
  const store = useDataStore();
  const [filter, setFilter] = useState<'all' | Order['status']>('all');
  const [query, setQuery] = useState('');

  // Real expenses come from FinanceTransaction rows that point back to the
  // deal via dealId (type='expense'). Previously we hardcoded 55% of revenue
  // — that made every order look identically profitable and was just wrong.
  // If no expenses are linked, we show 0 + a small «—» marker in the UI so
  // the user knows the margin is missing input data, not 100% profit.
  const expenseByDeal = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of store.transactions) {
      if (t.type !== 'expense' || !t.dealId) continue;
      m.set(t.dealId, (m.get(t.dealId) || 0) + t.amount);
    }
    return m;
  }, [store.transactions]);

  const storeOrders: Order[] = store.deals.filter(d => d.amount > 0).map(d => {
    const linkedExpenses = expenseByDeal.get(d.id) || 0;
    const hasRealExpenses = expenseByDeal.has(d.id);
    const profit = d.amount - linkedExpenses;
    const status: Order['status'] = (d.progress || 0) >= 100 ? 'completed' : (d.progress || 0) > 0 ? 'partial' : 'pending';
    return {
      id: d.id, name: d.product, client: d.customerName,
      master: (d as any).manager || d.designer || d.measurer || '—',
      revenue: d.amount, expenses: linkedExpenses, profit,
      margin: d.amount > 0 ? Math.round((profit / d.amount) * 100) : 0,
      status, hasRealExpenses,
    };
  });
  const orders = storeOrders;
  const visible = orders.filter(o => (filter === 'all' || o.status === filter) && (!query || o.name.toLowerCase().includes(query.toLowerCase()) || (o.client || '').toLowerCase().includes(query.toLowerCase())));

  const totalRevenue = orders.reduce((s, o) => s + o.revenue, 0);
  const totalProfit = orders.reduce((s, o) => s + o.profit, 0);
  const avgMargin = orders.length ? Math.round(orders.reduce((s, o) => s + o.margin, 0) / orders.length) : 0;

  const stats = [
    { label: 'Заказов', value: String(orders.length) },
    { label: 'Выручка', value: fmt(totalRevenue) },
    { label: 'Прибыль', value: fmt(totalProfit) },
    { label: 'Ср. маржа', value: avgMargin + '%' },
  ];
  const filters: Array<{ id: 'all' | Order['status']; label: string }> = [
    { id: 'all', label: 'Все' }, { id: 'completed', label: 'Оплаченные' },
    { id: 'partial', label: 'Частичные' }, { id: 'pending', label: 'Ожидают' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{s.label}</div>
            <div className="text-base text-gray-900 tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-3 border-b border-gray-50 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск..." className="w-full pl-9 pr-3 py-2 bg-gray-50 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
          </div>
          <div className="flex gap-1 bg-gray-50 rounded-xl p-1">
            {filters.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} className={`px-3 py-1.5 rounded-lg text-[11px] transition-colors ${filter === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{f.label}</button>
            ))}
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">
            <Plus className="w-3.5 h-3.5" /> Заказ
          </button>
        </div>

        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-gray-50 text-[10px] text-gray-400 uppercase tracking-wide">
          <div className="col-span-4">Заказ</div>
          <div className="col-span-2">Мастер</div>
          <div className="col-span-2 text-right">Выручка</div>
          <div className="col-span-2 text-right">Прибыль</div>
          <div className="col-span-1 text-right">Маржа</div>
          <div className="col-span-1 text-right">Статус</div>
        </div>

        <div className="divide-y divide-gray-50">
          {visible.map(o => (
            <div key={o.id} className="grid grid-cols-12 gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors items-center">
              <div className="col-span-12 md:col-span-4 flex items-center gap-3 min-w-0">
                {/* Customer initials avatar instead of the raw 16-char deal ID.
                    The full ID was overflowing its 8×8 box and bleeding into
                    the next column. We show the customer's first letters here
                    and surface the short id in the line below as small grey. */}
                <div className="w-8 h-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center text-[10px] text-gray-600 flex-shrink-0 font-medium uppercase">
                  {((o.client || o.name || '?').replace(/[^A-Za-zА-Яа-яЁё ]/g, '').trim().slice(0, 2) || '·')}
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-gray-900 truncate" title={o.name}>{o.name}</div>
                  {o.client && (
                    <div className="text-[10px] text-gray-400 truncate" title={`${o.id} · ${o.client}`}>
                      <span className="font-mono opacity-60">#{o.id.slice(-6)}</span> · {o.client}
                    </div>
                  )}
                </div>
              </div>
              <div className="col-span-6 md:col-span-2 text-xs text-gray-600">{o.master}</div>
              <div className="col-span-6 md:col-span-2 text-xs text-gray-900 md:text-right tabular-nums">{fmt(o.revenue)}</div>
              <div className="col-span-6 md:col-span-2 text-xs md:text-right tabular-nums text-emerald-600" title={o.hasRealExpenses ? '' : 'Расходы не привязаны к этой сделке — прибыль показана = выручке'}>
                {fmt(o.profit)}{!o.hasRealExpenses && <span className="text-gray-300 ml-1" title="Нет расходов">·</span>}
              </div>
              <div className="col-span-3 md:col-span-1 text-xs text-gray-500 md:text-right tabular-nums">{o.hasRealExpenses ? `${o.margin}%` : '—'}</div>
              <div className="col-span-3 md:col-span-1 md:text-right">
                <span className={`text-[10px] px-2 py-0.5 rounded-md ${STATUS[o.status].cls}`}>{STATUS[o.status].ru}</span>
              </div>
            </div>
          ))}
          {visible.length === 0 && (
            <div className="px-4 py-12 text-center text-xs text-gray-400">Нет заказов по выбранному фильтру</div>
          )}
        </div>
      </div>
    </div>
  );
}
