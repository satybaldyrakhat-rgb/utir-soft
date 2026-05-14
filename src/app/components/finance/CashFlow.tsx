import { useMemo, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { useDataStore } from '../../utils/dataStore';

const askAI = (prompt: string) => window.dispatchEvent(new CustomEvent('ai-assistant:open', { detail: { prompt } }));

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸';
const fmtShort = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1).replace('.0', '') + 'М' : Math.round(n / 1000) + 'К';

export function CashFlow() {
  const store = useDataStore();
  const [period, setPeriod] = useState<'3m' | '6m' | '12m'>('6m');
  const [scope, setScope] = useState<'day' | 'week' | 'month' | 'quarter'>('month');

  const monthsBack = period === '3m' ? 3 : period === '12m' ? 12 : 6;

  // Time series
  const DATA = useMemo(() => {
    const now = new Date();
    const out: { m: string; in: number; out: number }[] = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const inflow = store.transactions
        .filter(t => t.type === 'income' && t.status === 'completed' && t.date.startsWith(key))
        .reduce((s, t) => s + t.amount, 0);
      const outflow = store.transactions
        .filter(t => t.type === 'expense' && t.status === 'completed' && t.date.startsWith(key))
        .reduce((s, t) => s + t.amount, 0);
      out.push({ m: MONTHS[d.getMonth()], in: inflow, out: outflow });
    }
    return out;
  }, [store.transactions, monthsBack]);

  // Categories
  const CATEGORIES_IN = useMemo(() => buildCategoryBreakdown(store.transactions, 'income'), [store.transactions]);
  const CATEGORIES_OUT = useMemo(() => buildCategoryBreakdown(store.transactions, 'expense'), [store.transactions]);

  // Forecast: simple — pending income - upcoming expenses
  const pendingIn = store.transactions.filter(t => t.type === 'income' && t.status !== 'completed').reduce((s, t) => s + t.amount, 0);
  const pendingOut = store.transactions.filter(t => t.type === 'expense' && t.status !== 'completed').reduce((s, t) => s + t.amount, 0);
  const forecastGap = pendingIn - pendingOut;
  const gapStatus: 'safe' | 'warn' | 'danger' = forecastGap >= 0 ? 'safe' : forecastGap > -500_000 ? 'warn' : 'danger';

  const max = Math.max(1, ...DATA.map(d => Math.max(d.in, d.out)));
  const totalIn = DATA.reduce((s, d) => s + d.in, 0);
  const totalOut = DATA.reduce((s, d) => s + d.out, 0);
  const net = totalIn - totalOut;

  const gapCfg = gapStatus === 'safe'
    ? { wrap: 'bg-emerald-50 border-emerald-100 text-emerald-900', icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />, title: '✓ Касса в плюсе', sub: 'Прогноз стабильный, кассовых разрывов не ожидается' }
    : gapStatus === 'warn'
    ? { wrap: 'bg-amber-50 border-amber-100 text-amber-900', icon: <AlertCircle className="w-4 h-4 text-amber-600" />, title: '⚠ Возможен кассовый разрыв', sub: `Прогнозируемая нехватка: ${Math.abs(forecastGap).toLocaleString('ru-RU')} ₸` }
    : { wrap: 'bg-rose-50 border-rose-100 text-rose-900', icon: <AlertCircle className="w-4 h-4 text-rose-600" />, title: '🚨 Кассовый разрыв', sub: `Нехватка ${Math.abs(forecastGap).toLocaleString('ru-RU')} ₸ — требуется решение` };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Период анализа</div>
        <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
          {([['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц'], ['quarter', 'Квартал']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setScope(id)} className={`px-3 py-1 rounded-md text-[10px] transition-colors ${scope === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-700'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className={`rounded-2xl border p-4 flex items-start gap-3 ${gapCfg.wrap}`}>
        <div className="mt-0.5 flex-shrink-0">{gapCfg.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm mb-0.5">{gapCfg.title}</div>
          <div className="text-xs opacity-80">{gapCfg.sub}</div>
        </div>
        <button
          onClick={() => askAI(`Прогноз кассы: входящие ${pendingIn.toLocaleString('ru-RU')} ₸, исходящие ${pendingOut.toLocaleString('ru-RU')} ₸. Что мне делать?`)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-900 border border-gray-100 rounded-lg text-xs hover:shadow-sm transition-shadow flex-shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-500" /> Что делать?
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Притоки</div>
            <ArrowDownRight className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-base text-gray-900 tabular-nums">{fmt(totalIn)}</div>
          <div className="text-[10px] text-gray-500 mt-1">за {monthsBack} мес</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Оттоки</div>
            <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className="text-base text-gray-900 tabular-nums">{fmt(totalOut)}</div>
          <div className="text-[10px] text-gray-500 mt-1">за {monthsBack} мес</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Чистый поток</div>
            {net >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-500" />}
          </div>
          <div className="text-base text-gray-900 tabular-nums">{fmt(net)}</div>
          <div className="text-[10px] text-gray-500 mt-1">маржа {totalIn ? Math.round((net / totalIn) * 100) : 0}%</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="text-sm text-gray-900">Динамика притоков и оттоков</div>
          <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
            {(['3m', '6m', '12m'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded-md text-[10px] ${period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>{p === '3m' ? '3 мес' : p === '6m' ? '6 мес' : '12 мес'}</button>
            ))}
          </div>
        </div>
        <div className="flex items-end gap-3 h-48 mb-2">
          {DATA.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex items-end gap-0.5 flex-1 w-full">
                <div className="flex-1 bg-emerald-100 rounded-t-md relative group" style={{ height: `${(d.in / max) * 100}%` }}>
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-emerald-700 opacity-0 group-hover:opacity-100 whitespace-nowrap">{fmtShort(d.in)}</div>
                </div>
                <div className="flex-1 bg-rose-100 rounded-t-md relative group" style={{ height: `${(d.out / max) * 100}%` }}>
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-rose-700 opacity-0 group-hover:opacity-100 whitespace-nowrap">{fmtShort(d.out)}</div>
                </div>
              </div>
              <div className="text-[10px] text-gray-400">{d.m}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-4 text-[10px] text-gray-500 pt-2 border-t border-gray-50">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-300 rounded" /> Притоки</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-rose-300 rounded" /> Оттоки</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <CategoryBlock title="Структура притоков" categories={CATEGORIES_IN} barClass="bg-emerald-400" />
        <CategoryBlock title="Структура оттоков" categories={CATEGORIES_OUT} barClass="bg-rose-400" />
      </div>
    </div>
  );
}

function CategoryBlock({ title, categories, barClass }: { title: string; categories: { name: string; amount: number; pct: number }[]; barClass: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="text-sm text-gray-900 mb-4">{title}</div>
      {categories.length === 0 ? (
        <div className="text-xs text-gray-400 py-6 text-center">Нет данных</div>
      ) : (
        <div className="space-y-3">
          {categories.map((c, i) => (
            <div key={i}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-700">{c.name}</span>
                <span className="text-gray-900 tabular-nums">{fmt(c.amount)}</span>
              </div>
              <div className="w-full h-1.5 bg-gray-50 rounded-full overflow-hidden">
                <div className={`h-full ${barClass}`} style={{ width: `${c.pct}%` }} />
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">{c.pct}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildCategoryBreakdown(txs: { type: 'income' | 'expense'; category: string; amount: number; status: string }[], type: 'income' | 'expense') {
  const map = new Map<string, number>();
  txs.filter(t => t.type === type && t.status === 'completed').forEach(t => {
    map.set(t.category, (map.get(t.category) || 0) + t.amount);
  });
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0) || 1;
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount, pct: Math.round((amount / total) * 100) }));
}
