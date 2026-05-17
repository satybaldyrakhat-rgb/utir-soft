import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, ArrowDownRight, ArrowUpRight, X, Receipt, Wallet, Plus, Edit2, Trash2 } from 'lucide-react';
import { useDataStore, type FinanceTransaction } from '../../utils/dataStore';

type Cat = 'income' | 'expense' | 'tax' | 'salary' | 'planned';
// kind tells us whether a row is a real DB transaction (editable) or
// a synthesised projection from an active deal (read-only — edit the
// deal itself instead).
type Pay = {
  id: string; date: string; client: string;
  type: 'in' | 'out'; cat: Cat;
  amount: number; method: string; note?: string;
  status: 'paid' | 'pending' | 'overdue';
  kind: 'tx' | 'planned';
};

// Categories the user can pick when adding/editing a payment.
const INCOME_CATEGORIES  = ['Оплата сделки', 'Возврат', 'Аванс', 'Прочее'];
const EXPENSE_CATEGORIES = ['Материалы', 'Зарплата', 'Налоги', 'Аренда', 'Транспорт', 'Подрядчик', 'Прочее'];

const MOCK: Pay[] = [];

const STATUS: Record<Pay['status'], { label: string; cls: string }> = {
  paid: { label: 'Оплачен', cls: 'bg-emerald-50 text-emerald-700' },
  pending: { label: 'Ожидает', cls: 'bg-gray-50 text-gray-500' },
  overdue: { label: 'Просрочка', cls: 'bg-rose-50 text-rose-700' },
};

const CAT_COLOR: Record<Cat, string> = {
  income: 'bg-emerald-500',
  expense: 'bg-rose-500',
  tax: 'bg-amber-500',
  salary: 'bg-violet-500',
  planned: 'bg-sky-500',
};

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸';

type Filter = 'all' | 'income' | 'expense' | 'tax' | 'salary';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'income', label: 'Поступления' },
  { id: 'expense', label: 'Расходы' },
  { id: 'tax', label: 'Налоги' },
  { id: 'salary', label: 'Зарплата' },
];

export function PaymentCalendar() {
  const store = useDataStore();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  // Payment add/edit modal state. `editingId === null` → new payment;
  // string → edit existing transaction. Pre-filled date defaults to the
  // selected day or today.
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [initialDate, setInitialDate] = useState<string>('');

  const txPays: Pay[] = store.transactions.map(t => ({
    id: t.id,
    date: t.date,
    client: t.description || t.category,
    type: t.type === 'income' ? 'in' : 'out',
    cat: t.type === 'income' ? 'income' : (t.category === 'Налоги' ? 'tax' : t.category === 'Зарплата' ? 'salary' : 'expense'),
    amount: t.amount,
    method: t.category,
    status: t.status === 'completed' ? 'paid' : t.status === 'overdue' ? 'overdue' : 'pending',
    note: t.dealId ? `#${t.dealId}` : undefined,
    kind: 'tx',
  }));
  // Generate "planned" calendar entries from active deals — both the final
  // completion payment AND milestone dates (measurement, installation) so
  // the calendar shows everything you might want to be reminded of, not
  // just rows that already exist in the transactions table.
  const dealPays: Pay[] = [];
  for (const d of store.deals) {
    if (!d.amount || d.status === 'rejected') continue;
    const outstanding = d.amount - (d.paidAmount || 0);
    if (d.completionDate && (d.progress || 0) < 100 && outstanding > 0) {
      dealPays.push({
        id: `dc_${d.id}`, date: d.completionDate, client: d.customerName, type: 'in', cat: 'planned',
        amount: outstanding, method: 'Окончательная оплата', status: 'pending', note: d.product, kind: 'planned',
      });
    }
    if (d.measurementDate) {
      dealPays.push({
        id: `dm_${d.id}`, date: d.measurementDate, client: d.customerName, type: 'in', cat: 'planned',
        amount: 0, method: 'Замер', status: 'pending', note: d.product, kind: 'planned',
      });
    }
    if (d.installationDate) {
      dealPays.push({
        id: `di_${d.id}`, date: d.installationDate, client: d.customerName, type: 'in', cat: 'planned',
        amount: outstanding > 0 ? outstanding : 0, method: 'Установка / финал', status: 'pending', note: d.product, kind: 'planned',
      });
    }
  }
  const all = [...txPays, ...dealPays];
  const matchesFilter = (p: Pay) => filter === 'all' ? true : p.cat === filter;
  const visible = all.filter(matchesFilter);

  const incoming = all.filter(p => p.type === 'in').reduce((s, p) => s + p.amount, 0);
  const outgoing = all.filter(p => p.type === 'out').reduce((s, p) => s + p.amount, 0);
  const overdue = all.filter(p => p.status === 'overdue').length;

  const monthLabel = month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstWeekday = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, i) => i < firstWeekday ? null : i - firstWeekday + 1);

  const dayKey = (day: number) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dayPays = (day: number) => visible.filter(p => p.date === dayKey(day));
  const selectedPays = selectedDay ? all.filter(p => p.date === dayKey(selectedDay)) : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Поступления</div>
          <div className="text-base text-gray-900 tabular-nums mb-1">{fmt(incoming)}</div>
          <div className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded"><ArrowDownRight className="w-3 h-3" />{all.filter(p => p.type === 'in').length} платежей</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Расходы</div>
          <div className="text-base text-gray-900 tabular-nums mb-1">{fmt(outgoing)}</div>
          <div className="inline-flex items-center gap-1 text-[10px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded"><ArrowUpRight className="w-3 h-3" />{all.filter(p => p.type === 'out').length} платежей</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Просрочка</div>
          <div className="text-base text-gray-900 tabular-nums mb-1">{overdue}</div>
          <div className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded">требуют внимания</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1 rounded-md text-[10px] transition-colors ${filter === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-700'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
          {(['income', 'expense', 'tax', 'salary', 'planned'] as Cat[]).map(c => (
            <span key={c} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${CAT_COLOR[c]}`} />
              {c === 'income' ? 'Поступления' : c === 'expense' ? 'Расходы' : c === 'tax' ? 'Налоги' : c === 'salary' ? 'Зарплата' : 'Запланировано'}
            </span>
          ))}
          {/* «+ Платёж» — opens the add/edit modal pre-filled with today's
              date (or the currently-selected day in the calendar). */}
          <button
            onClick={() => {
              setEditingId(null);
              setInitialDate(selectedDay ? dayKey(selectedDay) : new Date().toISOString().slice(0, 10));
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-900 text-white rounded-md text-[10px] hover:bg-gray-800"
          >
            <Plus className="w-3 h-3" /> Платёж
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-900 capitalize">{monthLabel}</div>
            <div className="flex gap-1">
              <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="w-7 h-7 hover:bg-gray-50 rounded-lg flex items-center justify-center"><ChevronLeft className="w-3.5 h-3.5 text-gray-500" /></button>
              <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="w-7 h-7 hover:bg-gray-50 rounded-lg flex items-center justify-center"><ChevronRight className="w-3.5 h-3.5 text-gray-500" /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
              <div key={d} className="text-[9px] text-gray-300 text-center py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const pays = dayPays(day);
              const isSelected = selectedDay === day;
              const hasOverdue = pays.some(p => p.status === 'overdue');
              const cats = Array.from(new Set(pays.map(p => p.cat)));
              const isToday = (() => {
                const t = new Date();
                return t.getFullYear() === month.getFullYear() && t.getMonth() === month.getMonth() && t.getDate() === day;
              })();
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(day)}
                  className={`relative aspect-square border rounded-lg p-1.5 text-left transition-all hover:shadow-sm ${
                    isSelected ? 'border-gray-900 bg-gray-50' :
                    hasOverdue ? 'border-rose-200 bg-rose-50/40' :
                    pays.length ? 'border-gray-100 hover:border-gray-300 bg-white' : 'border-gray-50'
                  }`}
                >
                  {/* Top row: day number + category dots cluster + today badge */}
                  <div className="flex items-start justify-between mb-1">
                    <div className={`text-[10px] ${isToday ? 'text-white bg-gray-900 px-1.5 py-0.5 rounded-full' : 'text-gray-500'}`}>{day}</div>
                    {cats.length > 0 && (
                      <div className="flex gap-0.5">
                        {cats.slice(0, 3).map(c => (
                          <span key={c} className={`w-1.5 h-1.5 rounded-full ${CAT_COLOR[c]}`} />
                        ))}
                      </div>
                    )}
                  </div>
                  {pays.slice(0, 2).map((p, idx) => (
                    p.amount > 0 ? (
                      <div key={idx} className={`text-[9px] truncate tabular-nums ${p.type === 'in' ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {p.type === 'in' ? '+' : '−'}{(p.amount / 1000).toFixed(0)}К
                      </div>
                    ) : (
                      <div key={idx} className="text-[9px] text-sky-600 truncate">{p.method}</div>
                    )
                  ))}
                  {pays.length > 2 && <div className="text-[9px] text-gray-400">+{pays.length - 2}</div>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-3 border-b border-gray-50 flex items-center justify-between gap-2">
            <div className="text-sm text-gray-900 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              {selectedDay ? `${selectedDay} ${month.toLocaleDateString('ru-RU', { month: 'long' })}` : 'Выберите день'}
            </div>
            {selectedDay && (
              <button onClick={() => setSelectedDay(null)} className="w-6 h-6 hover:bg-gray-50 rounded-md flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            )}
          </div>
          {selectedDay ? (
            <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
              {selectedPays.length === 0 && (
                <div className="p-6 text-center text-xs text-gray-400">Платежей на эту дату нет</div>
              )}
              {selectedPays.map(p => (
                <div key={p.id} className="px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50/50 group">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${p.type === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
                    {p.cat === 'tax' ? <Receipt className="w-3.5 h-3.5" /> :
                      p.cat === 'salary' ? <Wallet className="w-3.5 h-3.5" /> :
                      p.type === 'in' ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-900 truncate flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${CAT_COLOR[p.cat]}`} />
                      {p.client}
                      {p.kind === 'planned' && <span className="text-[8px] px-1 py-0.5 bg-sky-50 text-sky-600 rounded uppercase tracking-wide">план</span>}
                    </div>
                    <div className="text-[10px] text-gray-400 truncate">{p.method}{p.note ? ` · ${p.note}` : ''}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-xs tabular-nums ${p.type === 'in' ? 'text-emerald-600' : 'text-rose-500'}`}>{p.type === 'in' ? '+' : '−'}{fmt(p.amount)}</div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
                  </div>
                  {/* Edit / Delete shown only on real transactions (planned
                       deal milestones are edited from the deal itself). */}
                  {p.kind === 'tx' && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => { setEditingId(p.id); setInitialDate(p.date); setModalOpen(true); }}
                        title="Редактировать"
                        className="w-7 h-7 hover:bg-gray-100 rounded-md flex items-center justify-center"
                      ><Edit2 className="w-3 h-3 text-gray-500" /></button>
                      <button
                        onClick={() => {
                          if (confirm(`Удалить платёж ${fmt(p.amount)}?`)) store.deleteTransaction(p.id);
                        }}
                        title="Удалить"
                        className="w-7 h-7 hover:bg-rose-50 rounded-md flex items-center justify-center"
                      ><Trash2 className="w-3 h-3 text-rose-500" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
              {visible.sort((a, b) => a.date.localeCompare(b.date)).map(p => (
                <button key={p.id} onClick={() => setSelectedDay(parseInt(p.date.slice(8), 10))} className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50/50">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${p.type === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
                    {p.type === 'in' ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-900 truncate">{p.client}</div>
                    <div className="text-[10px] text-gray-400 truncate">{p.date.slice(8)} · {p.method}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-xs tabular-nums ${p.type === 'in' ? 'text-emerald-600' : 'text-rose-500'}`}>{p.type === 'in' ? '+' : '−'}{fmt(p.amount)}</div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <PaymentModal
          initialDate={initialDate || new Date().toISOString().slice(0, 10)}
          editing={editingId ? store.transactions.find(t => t.id === editingId) : undefined}
          onClose={() => { setModalOpen(false); setEditingId(null); }}
          onSave={(payload) => {
            if (editingId) store.updateTransaction(editingId, payload);
            else           store.addTransaction(payload);
            setModalOpen(false); setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

// ─── PaymentModal ────────────────────────────────────────────────
// Reused for both Add and Edit. Receives optional `editing` row to
// prefill fields. Calls onSave with a complete FinanceTransaction
// payload (parent decides add vs update).
function PaymentModal({ initialDate, editing, onClose, onSave }: {
  initialDate: string;
  editing?: FinanceTransaction;
  onClose: () => void;
  onSave: (payload: Omit<FinanceTransaction, 'id'>) => void;
}) {
  const [type,        setType]        = useState<'income' | 'expense'>(editing?.type        || 'income');
  const [date,        setDate]        = useState<string>(editing?.date                      || initialDate);
  const [amount,      setAmount]      = useState<string>(editing ? String(editing.amount)   : '');
  const [category,    setCategory]    = useState<string>(editing?.category                  || INCOME_CATEGORIES[0]);
  const [description, setDescription] = useState<string>(editing?.description               || '');
  const [status,      setStatus]      = useState<FinanceTransaction['status']>(editing?.status || 'completed');

  // When the user flips income↔expense, the category list changes — reset
  // category to the first of the new list if it's not in there.
  const catList = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (!catList.includes(category)) {
    // Side-effect during render — safe since it only fires when the user
    // toggled type, and setState is idempotent on equal values.
    queueMicrotask(() => setCategory(catList[0]));
  }

  function commit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) { alert('Укажите сумму'); return; }
    if (!date) { alert('Укажите дату'); return; }
    onSave({
      type, date, amount: amt, category,
      description: description.trim(),
      status,
      // Keep dealId on edit (linked to a sale we don't want to break),
      // empty on create.
      dealId: editing?.dealId,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-900">{editing ? 'Редактировать платёж' : 'Новый платёж'}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-3">
          {/* Type — income / expense segmented control */}
          <div>
            <div className="text-[10px] text-gray-400 mb-1.5">Тип</div>
            <div className="flex gap-1 bg-gray-50 rounded-xl p-1">
              <button
                onClick={() => setType('income')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs transition ${type === 'income' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500'}`}
              >
                <ArrowDownRight className="w-3 h-3 inline mr-1" /> Поступление
              </button>
              <button
                onClick={() => setType('expense')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs transition ${type === 'expense' ? 'bg-rose-600 text-white shadow-sm' : 'text-gray-500'}`}
              >
                <ArrowUpRight className="w-3 h-3 inline mr-1" /> Расход
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-gray-400 mb-1">Дата</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
            <div>
              <div className="text-[10px] text-gray-400 mb-1">Сумма (₸)</div>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
          </div>

          <div>
            <div className="text-[10px] text-gray-400 mb-1">Категория</div>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200">
              {catList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <div className="text-[10px] text-gray-400 mb-1">Описание (опционально)</div>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Например: оплата по заказу" className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
          </div>

          <div>
            <div className="text-[10px] text-gray-400 mb-1.5">Статус</div>
            <div className="flex gap-1 bg-gray-50 rounded-xl p-1">
              {(['completed', 'pending', 'overdue'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] transition ${status === s ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                >{s === 'completed' ? 'Оплачен' : s === 'pending' ? 'Ожидает' : 'Просрочен'}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900">Отмена</button>
          <button onClick={commit} className="px-4 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs">
            {editing ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}
