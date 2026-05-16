// Admin-only outbound webhook subscriptions UI.
// Lives inside Settings → Интеграции.
//
// Lists existing subscriptions (URL, events, last delivery status), lets
// admin add a new one with a list of event types, fire a test ping, toggle
// active, or delete entirely. The secret returned by the create endpoint
// is shown ONCE so the admin can copy it into the receiver's HMAC verifier.

import { useEffect, useState } from 'react';
import { Plus, Trash2, Send, Copy, Check, Zap } from 'lucide-react';
import { api } from '../utils/api';

interface Webhook {
  id: string;
  url: string;
  eventTypes: string[];
  active: boolean;
  createdAt: string;
  lastStatus?: string | null;
  lastAt?: string | null;
}

interface Props { language: 'kz' | 'ru' | 'eng' }

// Curated list of event types admin can subscribe to. '*' = everything.
const EVENT_OPTIONS: { id: string; ru: string; kz: string; eng: string }[] = [
  { id: '*',                   ru: 'Все события',        kz: 'Барлық оқиғалар',     eng: 'All events' },
  { id: 'deal.updated',        ru: 'Сделка изменена',    kz: 'Мәміле өзгертілді',    eng: 'Deal updated' },
  { id: 'deal.status_changed', ru: 'Статус сделки',      kz: 'Мәміле күйі',         eng: 'Deal status changed' },
  { id: 'task.created',        ru: 'Создана задача',     kz: 'Тапсырма жасалды',    eng: 'Task created' },
  { id: 'task.assigned',       ru: 'Задача назначена',   kz: 'Тапсырма тағайындалды', eng: 'Task assigned' },
  { id: 'task.completed',      ru: 'Задача выполнена',   kz: 'Тапсырма орындалды',   eng: 'Task completed' },
  { id: 'task.updated',        ru: 'Задача изменена',    kz: 'Тапсырма өзгертілді',  eng: 'Task updated' },
];

export function WebhooksPanel({ language }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  const [list, setList] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [draftEvents, setDraftEvents] = useState<string[]>(['*']);
  // Newly-created secret — shown once for the admin to copy.
  const [revealedSecret, setRevealedSecret] = useState<{ url: string; secret: string } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setList(await api.get<Webhook[]>('/api/webhooks'));
    } catch (e: any) {
      // Non-admin gets 403 — panel intentionally renders nothing for them.
      if (!String(e?.message || '').includes('admin')) setError(String(e?.message || 'load failed'));
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const toggleEvent = (id: string) => {
    setDraftEvents(prev => {
      // '*' is exclusive — picking it clears everything else, and vice versa.
      if (id === '*') return ['*'];
      const next = prev.filter(e => e !== '*');
      return next.includes(id) ? next.filter(e => e !== id) : [...next, id];
    });
  };

  const create = async () => {
    setError('');
    if (!draftUrl.trim() || !/^https?:\/\//.test(draftUrl.trim())) {
      setError(l('Укажите URL вида https://…', 'https://… түріндегі URL көрсетіңіз', 'Enter a https://… URL'));
      return;
    }
    try {
      const created = await api.post<Webhook & { secret: string }>('/api/webhooks', {
        url: draftUrl.trim(),
        eventTypes: draftEvents.length === 0 ? ['*'] : draftEvents,
      });
      setRevealedSecret({ url: created.url, secret: created.secret });
      setDraftUrl('');
      setDraftEvents(['*']);
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(String(e?.message || 'create failed'));
    }
  };

  const remove = async (id: string) => {
    if (!confirm(l('Удалить webhook?', 'Webhook жойылсын ба?', 'Delete webhook?'))) return;
    try { await api.delete(`/api/webhooks/${id}`); await load(); }
    catch (e: any) { setError(String(e?.message || 'delete failed')); }
  };

  const toggleActive = async (w: Webhook) => {
    try { await api.patch(`/api/webhooks/${w.id}`, { active: !w.active }); await load(); }
    catch (e: any) { setError(String(e?.message || 'update failed')); }
  };

  const testPing = async (id: string) => {
    try { await api.post(`/api/webhooks/${id}/test`, {}); setTimeout(load, 800); }
    catch (e: any) { setError(String(e?.message || 'test failed')); }
  };

  const copySecret = async () => {
    if (!revealedSecret) return;
    try { await navigator.clipboard.writeText(revealedSecret.secret); } catch { /* ignore */ }
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 1800);
  };

  const labelFor = (id: string) => EVENT_OPTIONS.find(e => e.id === id)?.[language] || id;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-gray-400" />
          <div className="text-sm text-gray-900">{l('Webhook-подписки', 'Webhook-жазылулар', 'Webhook subscriptions')}</div>
        </div>
        <button
          onClick={() => { setShowForm(s => !s); setError(''); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs hover:bg-gray-800"
        >
          <Plus className="w-3 h-3" />
          {l('Добавить', 'Қосу', 'Add')}
        </button>
      </div>
      <div className="text-[11px] text-gray-400 mb-4 max-w-xl leading-relaxed">
        {l(
          'Получайте события CRM на свой сервер: создание/изменение сделок и задач. Заголовок X-UtirSoft-Signature содержит HMAC-SHA256 от тела запроса с секретом.',
          'CRM оқиғаларын өз серверіңізге алыңыз: мәмілелер мен тапсырмаларды жасау/өзгерту. X-UtirSoft-Signature тақырыбы құпиямен HMAC-SHA256 қамтиды.',
          'Receive CRM events on your own server: deal / task create / update / status. The X-UtirSoft-Signature header carries an HMAC-SHA256 of the body using your secret.',
        )}
      </div>

      {revealedSecret && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl">
          <div className="text-xs text-amber-900 mb-2">
            ⚠️ {l('Скопируйте секрет сейчас — он показывается только один раз. С его помощью ваш сервер проверяет подпись запросов.',
                  'Құпияны қазір көшіріңіз — ол тек бір рет көрсетіледі. Сіздің серверіңіз сұраулардың қолтаңбасын тексеру үшін қолданады.',
                  'Copy the secret now — it is shown only once. Your server uses it to verify incoming request signatures.')}
          </div>
          <div className="text-[10px] text-gray-500 mb-1">{revealedSecret.url}</div>
          <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
            <code className="flex-1 text-xs font-mono break-all">{revealedSecret.secret}</code>
            <button onClick={copySecret} className="p-1 hover:bg-amber-100 rounded">
              {copiedSecret ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
            </button>
          </div>
          <button onClick={() => setRevealedSecret(null)} className="text-[10px] text-gray-500 hover:text-gray-700 mt-2">
            {l('Скрыть', 'Жасыру', 'Hide')}
          </button>
        </div>
      )}

      {showForm && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-100 rounded-xl space-y-3">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">URL</label>
            <input
              type="url"
              value={draftUrl}
              onChange={e => setDraftUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1.5">{l('События', 'Оқиғалар', 'Events')}</label>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => toggleEvent(opt.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${
                    draftEvents.includes(opt.id)
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {opt[language]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={create} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs hover:bg-gray-800">
              {l('Создать', 'Жасау', 'Create')}
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-gray-600 rounded-lg text-xs hover:bg-white">
              {l('Отмена', 'Бас тарту', 'Cancel')}
            </button>
          </div>
        </div>
      )}

      {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">{error}</div>}

      {loading && list.length === 0 && <div className="text-xs text-gray-400 py-3">{l('Загрузка…', 'Жүктелуде…', 'Loading…')}</div>}
      {!loading && list.length === 0 && (
        <div className="text-xs text-gray-400 py-3">
          {l('Пока нет подписок. Добавьте URL вашего сервиса (Make, Zapier, n8n, или собственный) — будем слать туда события.',
             'Әзірге жазылулар жоқ. Сервисіңіздің URL-ін қосыңыз — оқиғаларды жібереміз.',
             'No subscriptions yet. Add the URL of your service (Make, Zapier, n8n or your own) and we will deliver events there.')}
        </div>
      )}

      <div className="space-y-1.5">
        {list.map(w => (
          <div key={w.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-900 font-mono truncate">{w.url}</div>
              <div className="text-[10px] text-gray-500 mt-0.5 truncate">
                {w.eventTypes.map(labelFor).join(' · ')}
                {w.lastStatus && <span className={` · ${w.lastStatus.startsWith('2') ? 'text-emerald-600' : 'text-red-600'}`}> · {w.lastStatus}</span>}
                {w.lastAt && <span className="text-gray-400"> · {new Date(w.lastAt).toLocaleString(language === 'eng' ? 'en-GB' : 'ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
            </div>
            <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
              <input type="checkbox" checked={w.active} onChange={() => toggleActive(w)} />
              {l('Активен', 'Белсенді', 'Active')}
            </label>
            <button onClick={() => testPing(w.id)} className="p-1.5 rounded-lg hover:bg-white" title={l('Тестовый пинг', 'Тест-пинг', 'Test ping')}>
              <Send className="w-3.5 h-3.5 text-gray-500" />
            </button>
            <button onClick={() => remove(w.id)} className="p-1.5 rounded-lg hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
