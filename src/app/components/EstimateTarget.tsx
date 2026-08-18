// ─── Шаг 0 калькулятора: «для какой карточки считаем» ─────────────────
// Замерщик обязан выбрать карточку ДО расчёта — обычно она уже заведена
// (лид пришёл раньше выезда). Кнопка «Новый заказ» показывается только
// если у роли есть право писать в «Заказы» — сервер это правило всё равно
// проверяет отдельно, здесь мы просто не дразним недоступной кнопкой.

import { useMemo, useState } from 'react';
import { Search, UserPlus, Check, X, Loader2 } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';
import { api } from '../utils/api';
import { toast } from '../utils/toast';
import type { Deal } from '../utils/dataStore';

export interface EstimateTargetValue { dealId: string; name: string; phone?: string }

interface Props {
  language: 'kz' | 'ru' | 'eng';
  value: EstimateTargetValue | null;
  onChange: (v: EstimateTargetValue | null) => void;
}

const digits = (s: string) => (s || '').replace(/\D/g, '');

export function EstimateTarget({ language, value, onChange }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();
  const canCreate = store.canWriteModule('orders');

  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '' });

  // Ищем и по имени, и по телефону — замерщик обычно знает номер.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Без запроса показываем свежие активные сделки — чаще всего нужная там.
      return store.deals
        .filter(d => d.status !== 'completed' && d.status !== 'rejected')
        .slice(0, 6);
    }
    const qd = digits(q);
    return store.deals.filter(d =>
      (d.customerName || '').toLowerCase().includes(q) ||
      (qd.length >= 3 && digits(d.phone || '').includes(qd)),
    ).slice(0, 8);
  }, [query, store.deals]);

  const pick = (d: Deal) => { onChange({ dealId: d.id, name: d.customerName || '—', phone: d.phone }); setQuery(''); };

  const createDeal = async () => {
    const name = draft.name.trim();
    if (!name) { toast(l('Укажите имя клиента', 'Клиент атын жазыңыз', 'Enter client name'), 'error'); return; }
    setBusy(true);
    try {
      // Создаём через API напрямую: store.addDeal возвращает временный id,
      // а нам нужен настоящий — к нему сразу прикрепим расчёт.
      const saved = await api.post<Deal>('/api/deals', {
        customerName: name,
        phone: draft.phone.trim(),
        address: '',
        product: '', furnitureType: '',
        amount: 0, paidAmount: 0, status: 'new',
        icon: 'phone', priority: 'medium',
        date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
        progress: 5,
        source: l('Замер', 'Өлшеу', 'Measurement'),
        measurer: '', designer: '', materials: '',
        measurementDate: '', completionDate: '', installationDate: '',
        paymentMethods: {}, notes: '',
        createdAt: new Date().toISOString(),
      });
      await store.reloadAll();
      onChange({ dealId: saved.id, name: saved.customerName || name, phone: saved.phone });
      setCreating(false);
      setDraft({ name: '', phone: '' });
    } catch (e: any) {
      toast(e?.message === 'orders is read-only for your role'
        ? l('Нет прав создавать заказ — выберите существующую карточку', 'Тапсырыс жасауға құқық жоқ — бар карточканы таңдаңыз', 'No permission to create an order — pick an existing card')
        : l('Не удалось создать заказ', 'Тапсырыс жасалмады', 'Failed to create order'), 'error');
    } finally { setBusy(false); }
  };

  // ── Карточка уже выбрана ──────────────────────────────────────────
  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200/70 px-4 py-3">
        <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-emerald-700/70">{l('Расчёт для карточки', 'Есеп карточкасы', 'Estimate for card')}</div>
          <div className="text-sm text-emerald-900 truncate">
            {value.name}{value.phone ? <span className="text-emerald-700/70"> · {value.phone}</span> : null}
          </div>
        </div>
        <button
          onClick={() => onChange(null)}
          className="text-[11px] text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg flex-shrink-0"
        >
          {l('Сменить', 'Ауыстыру', 'Change')}
        </button>
      </div>
    );
  }

  // ── Форма нового заказа ───────────────────────────────────────────
  if (creating) {
    return (
      <div className="rounded-2xl bg-white/60 ring-1 ring-white/60 px-4 py-3.5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-slate-900">{l('Новый заказ', 'Жаңа тапсырыс', 'New order')}</div>
          <button onClick={() => setCreating(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            autoFocus
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder={l('Имя клиента', 'Клиент аты', 'Client name')}
            className="px-3 py-2 bg-white rounded-xl text-sm ring-1 ring-slate-200 focus:ring-emerald-400 outline-none"
          />
          <input
            value={draft.phone}
            onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
            placeholder={l('Телефон', 'Телефон', 'Phone')}
            className="px-3 py-2 bg-white rounded-xl text-sm ring-1 ring-slate-200 focus:ring-emerald-400 outline-none"
          />
        </div>
        <button
          onClick={createDeal}
          disabled={busy}
          className="mt-3 w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {l('Создать и считать', 'Жасап, есептеу', 'Create and calculate')}
        </button>
      </div>
    );
  }

  // ── Поиск карточки ────────────────────────────────────────────────
  return (
    <div className="rounded-2xl bg-white/60 ring-1 ring-white/60 px-4 py-3.5">
      <div className="text-[10px] text-slate-400 mb-1">{l('Шаг 0', '0-қадам', 'Step 0')}</div>
      <div className="text-sm text-slate-900 mb-3">{l('Для какой карточки считаем?', 'Қай карточкаға есептейміз?', 'Which card is this estimate for?')}</div>

      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={l('Имя или телефон клиента', 'Клиент аты немесе телефоны', 'Client name or phone')}
            className="w-full pl-9 pr-3 py-2 bg-white rounded-xl text-sm ring-1 ring-slate-200 focus:ring-emerald-400 outline-none"
          />
        </div>
        {canCreate && (
          <button
            onClick={() => { setCreating(true); setDraft({ name: query.trim(), phone: '' }); }}
            className="px-3 py-2 bg-white ring-1 ring-slate-200 rounded-xl text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 flex-shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {l('Новый', 'Жаңа', 'New')}
          </button>
        )}
      </div>

      {matches.length === 0 ? (
        <div className="text-[11px] text-slate-400 py-2">
          {query.trim()
            ? l('Ничего не нашлось.', 'Ештеңе табылмады.', 'Nothing found.')
            : l('Начните вводить имя или телефон.', 'Атын не телефонын жазыңыз.', 'Start typing a name or phone.')}
          {!canCreate && ' ' + l('Создание новых заказов вам недоступно — обратитесь к администратору.',
                                 'Жаңа тапсырыс жасау сізге қолжетімсіз — әкімшіге хабарласыңыз.',
                                 'Creating new orders is not available to you — ask your admin.')}
        </div>
      ) : (
        <div className="max-h-52 overflow-y-auto -mx-1">
          {matches.map(d => (
            <button
              key={d.id}
              onClick={() => pick(d)}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-white transition-colors flex items-center justify-between gap-3"
            >
              <span className="min-w-0">
                <span className="block text-sm text-slate-800 truncate">{d.customerName || '—'}</span>
                <span className="block text-[11px] text-slate-400 truncate">
                  {d.phone || l('без телефона', 'телефонсыз', 'no phone')}
                  {d.product ? ` · ${d.product}` : ''}
                </span>
              </span>
              {d.amount > 0 && (
                <span className="text-[11px] text-slate-400 flex-shrink-0">{d.amount.toLocaleString('ru-RU')} ₸</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
