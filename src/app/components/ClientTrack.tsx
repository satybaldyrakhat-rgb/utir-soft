import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Loader2, Phone, MessageCircle, Send } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';

interface Props { orderId: string; }

const STAGE_ORDER = ['new', 'measured', 'project-agreed', 'contract', 'production', 'assembly', 'completed'] as const;
const STAGE_LABEL: Record<string, string> = {
  'new': 'Заявка принята',
  'measured': 'Замер выполнен',
  'project-agreed': 'Проект согласован',
  'contract': 'Договор подписан',
  'production': 'В производстве',
  'assembly': 'Сборка',
  'completed': 'Установлено',
};

export function ClientTrack({ orderId }: Props) {
  const store = useDataStore();
  const deal = useMemo(() => store.deals.find(d => d.id === orderId), [store.deals, orderId]);
  const [chat, setChat] = useState<{ from: 'me' | 'mgr'; text: string; time: string }[]>([]);
  const [draft, setDraft] = useState('');
  const send = () => {
    if (!draft.trim()) return;
    setChat([...chat, { from: 'me', text: draft, time: 'сейчас' }]);
    setDraft('');
  };

  if (!deal) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-md w-full text-center">
          <div className="text-base text-gray-900 mb-1">Заказ не найден</div>
          <div className="text-xs text-gray-400">Проверьте ссылку или обратитесь к менеджеру.</div>
        </div>
      </div>
    );
  }

  const currentIdx = Math.max(0, STAGE_ORDER.indexOf(deal.status as any));
  const stages = STAGE_ORDER.map((id, i) => ({
    label: STAGE_LABEL[id],
    done: i < currentIdx,
    active: i === currentIdx,
    progress: i === currentIdx ? deal.progress : undefined,
    date: id === 'new' ? deal.createdAt?.slice(0, 10) : id === 'measured' ? deal.measurementDate : id === 'completed' ? deal.installationDate : id === 'production' ? 'Сейчас' : '—',
  }));

  const paidPct = deal.amount ? Math.round((deal.paidAmount / deal.amount) * 100) : 0;
  const manager = store.employees.find(e => e.name === deal.designer) || store.employees.find(e => e.name === deal.measurer);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-5 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center text-white text-xs">U</div>
            <div>
              <div className="text-sm text-gray-900">Utir Soft</div>
              <div className="text-[10px] text-gray-400">Заказ #{deal.id} · {deal.customerName}</div>
            </div>
          </div>
          <a href="#/" className="text-[11px] text-gray-400 hover:text-gray-900">utir.kz</a>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-xs text-gray-400 mb-4">Статус заказа</div>
          <div className="space-y-3">
            {stages.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${s.done ? 'bg-emerald-50' : s.active ? 'bg-sky-50' : 'bg-gray-50'}`}>
                  {s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : s.active ? <Loader2 className="w-4 h-4 text-sky-500 animate-spin" /> : <Clock className="w-4 h-4 text-gray-300" />}
                </div>
                <div className="flex-1">
                  <div className={`text-xs ${s.done || s.active ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}{s.active && s.progress ? ` (${s.progress}%)` : ''}</div>
                  <div className="text-[10px] text-gray-400">{s.date || '—'}</div>
                </div>
              </div>
            ))}
          </div>
          {deal.installationDate && (
            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-700">📦 Установка запланирована: <span className="text-gray-900">{deal.installationDate}</span></div>
          )}
        </div>

        {manager && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-400 mb-2">Ваш менеджер</div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 bg-gray-100 rounded-full flex items-center justify-center text-xs text-gray-700">{manager.avatar || manager.name.slice(0, 2)}</div>
              <div>
                <div className="text-sm text-gray-900">{manager.name}</div>
                <div className="text-[11px] text-gray-400">{manager.phone}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <a href={`https://wa.me/${manager.phone.replace(/\D/g, '')}`} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-500 text-white rounded-xl text-xs hover:bg-emerald-600">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
              <a href={`tel:${manager.phone.replace(/\s/g, '')}`} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-sky-500 text-white rounded-xl text-xs hover:bg-sky-600">
                <Phone className="w-3.5 h-3.5" /> Позвонить
              </a>
            </div>
          </div>
        )}

        {deal.amount > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-400 mb-2">Оплата</div>
            <div className="text-sm text-gray-900 mb-2">Оплачено {deal.paidAmount.toLocaleString('ru-RU')} из {deal.amount.toLocaleString('ru-RU')} ₸</div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3"><div className="h-full bg-emerald-500" style={{ width: `${paidPct}%` }} /></div>
            {paidPct < 100 && (
              <button className="w-full py-2.5 bg-rose-500 text-white rounded-xl text-xs hover:bg-rose-600">Доплатить через Kaspi</button>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-xs text-gray-900 mb-3">Чат с менеджером</div>
          <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
            {chat.length === 0 && (
              <div className="text-[11px] text-gray-400 text-center py-4">Напишите сообщение, чтобы начать диалог</div>
            )}
            {chat.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-xs ${m.from === 'me' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-700'}`}>
                  {m.text}
                  <div className="text-[9px] mt-0.5 text-gray-400">{m.time}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Сообщение..." className="flex-1 px-3 py-2 bg-gray-50 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
            <button onClick={send} className="px-3.5 py-2 bg-gray-900 text-white rounded-xl"><Send className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        <div className="text-center py-4 text-[11px] text-gray-400">
          <div>Utir Soft</div>
        </div>
      </div>
    </div>
  );
}
