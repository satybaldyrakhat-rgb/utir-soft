import { TrendingUp, TrendingDown } from 'lucide-react';
import { useDataStore } from '../../utils/dataStore';

const fmt = (n: number) => Math.abs(n).toLocaleString('ru-RU') + ' ₸';

export function ProfitLoss() {
  const store = useDataStore();
  const txs = store.transactions.filter(t => t.status === 'completed');
  const revenue = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  const exGroup = (categories: string[]) =>
    txs.filter(t => t.type === 'expense' && categories.includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const exOther = txs.filter(t => t.type === 'expense' && !['Материалы', 'Фурнитура', 'Столешницы', 'Зарплата', 'Аренда', 'Маркетинг', 'Налоги'].includes(t.category)).reduce((s, t) => s + t.amount, 0);

  const materials = exGroup(['Материалы', 'Фурнитура', 'Столешницы']);
  const salaries = exGroup(['Зарплата']);
  const rent = exGroup(['Аренда']);
  const marketing = exGroup(['Маркетинг']);
  const taxes = exGroup(['Налоги']);

  const grossProfit = revenue - materials;
  const grossMargin = revenue ? (grossProfit / revenue) * 100 : 0;
  const opProfit = grossProfit - salaries - rent - marketing - exOther;
  const opMargin = revenue ? (opProfit / revenue) * 100 : 0;
  const netProfit = opProfit - taxes;
  const netMargin = revenue ? (netProfit / revenue) * 100 : 0;

  const ROWS: { label: string; value: number; type: 'positive' | 'negative' | 'subtotal' | 'total'; detail: string }[] = [
    { label: 'Выручка', value: revenue, type: 'positive', detail: 'Все продажи' },
    { label: 'Себестоимость', value: -materials, type: 'negative', detail: 'Материалы, фурнитура' },
    { label: 'Валовая прибыль', value: grossProfit, type: 'subtotal', detail: `${grossMargin.toFixed(1)}% маржа` },
    { label: 'Зарплата', value: -salaries, type: 'negative', detail: `${store.employees.filter(e => e.status === 'active').length} активных сотрудников` },
    { label: 'Аренда', value: -rent, type: 'negative', detail: 'Цех, офис' },
    { label: 'Маркетинг', value: -marketing, type: 'negative', detail: 'Реклама, SMM' },
    { label: 'Прочие расходы', value: -exOther, type: 'negative', detail: 'Транспорт, связь, прочее' },
    { label: 'Операционная прибыль', value: opProfit, type: 'subtotal', detail: `${opMargin.toFixed(1)}% маржа` },
    { label: 'Налоги', value: -taxes, type: 'negative', detail: 'Уплачено' },
    { label: 'Чистая прибыль', value: netProfit, type: 'total', detail: `${netMargin.toFixed(1)}% чистая маржа` },
  ];

  const fmtM = (n: number) => `${(n / 1_000_000).toFixed(1)}М ₸`;
  const ebitda = grossProfit - salaries - rent - marketing - exOther; // before taxes
  const cards = [
    { label: 'Выручка', value: fmtM(revenue) },
    { label: 'Прибыль', value: fmtM(netProfit) },
    { label: 'Маржа', value: `${netMargin.toFixed(1)}%` },
    { label: 'EBITDA', value: fmtM(ebitda) },
  ];

  const period = new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((k, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{k.label}</div>
            <div className="text-base text-gray-900 tabular-nums mb-1">{k.value}</div>
            <div className="text-[10px] text-gray-500">Актуально</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-900">Отчёт о прибылях и убытках</div>
          <span className="text-[10px] text-gray-400 capitalize">{period}</span>
        </div>
        <div className="divide-y divide-gray-50">
          {ROWS.map((r, i) => {
            const isTotal = r.type === 'total';
            const isSub = r.type === 'subtotal';
            const isNeg = r.type === 'negative';
            return (
              <div key={i} className={`px-5 py-3 flex items-center justify-between ${isTotal ? 'bg-gray-50' : isSub ? 'bg-gray-50/50' : ''}`}>
                <div>
                  <div className={`text-xs ${isTotal || isSub ? 'text-gray-900' : 'text-gray-700'}`}>{r.label}</div>
                  <div className="text-[10px] text-gray-400">{r.detail}</div>
                </div>
                <div className={`text-sm tabular-nums ${isTotal ? 'text-gray-900' : isSub ? 'text-gray-900' : isNeg ? 'text-rose-500' : 'text-emerald-600'}`}>
                  {isNeg ? '−' : ''}{fmt(r.value)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
