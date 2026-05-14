import { useState } from 'react';
import { Bot, X, Bell, FileText, Package, MapPin, Users, Plus, Send } from 'lucide-react';

interface Props { onClose: () => void; language?: 'kz' | 'ru' | 'eng'; }

const CLIENT_TEMPLATES = [
  { id: 't1', text: 'Здравствуйте! Ваш заказ #{номер} принят в производство', trigger: 'Смена статуса на "Производство"', enabled: true },
  { id: 't2', text: 'Замер назначен на {дата} в {время}, замерщик {имя}', trigger: 'Создание задачи замера', enabled: true },
  { id: 't3', text: 'Ваша мебель готова! Установка {дата}', trigger: 'Статус "Готов"', enabled: true },
  { id: 't4', text: 'Завтра приедем устанавливать с {время}', trigger: 'За 1 день до установки', enabled: false },
];

const ALERTS = ['Крупная сделка > 1 млн ₸', 'Отказ клиента', 'Просрочка заказа', 'Потеря горячего лида'];
const STOCK_LOW = [
  { name: 'ЛДСП Egger White', qty: 3, min: 5 },
  { name: 'Фурнитура Blum', qty: 12, min: 20 },
  { name: 'Кромка ПВХ 2мм', qty: 8, min: 15 },
];

export function TelegramBotPanel({ onClose }: Props) {
  const [tab, setTab] = useState<'tasks' | 'clients' | 'reports' | 'warehouse' | 'field'>('tasks');
  const [templates, setTemplates] = useState(CLIENT_TEMPLATES);
  const [bossGroup, setBossGroup] = useState('@UtirSoft_Boss');
  const [reports, setReports] = useState({ daily: true, weekly: true, monthly: false });
  const [activeAlerts, setActiveAlerts] = useState<string[]>(ALERTS);
  const [whAlerts, setWhAlerts] = useState({ inbound: true, supplier: true });
  const [fieldOpts, setFieldOpts] = useState({ photo: true, geo: true });

  const tabs = [
    { id: 'tasks', label: 'Задачи сотрудников', icon: Users },
    { id: 'clients', label: 'Уведомления клиентам', icon: Bell },
    { id: 'reports', label: 'Отчёты директору', icon: FileText },
    { id: 'warehouse', label: 'Склад', icon: Package },
    { id: 'field', label: 'Замерщикам', icon: MapPin },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-sky-50 rounded-xl flex items-center justify-center"><Bot className="w-4 h-4 text-sky-600" /></div>
            <div>
              <div className="text-sm text-gray-900">Telegram-бот Utir Soft</div>
              <div className="text-[10px] text-gray-400">@UtirSoftBot · Онлайн</div>
            </div>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>

        <div className="flex gap-1 px-4 pt-3 border-b border-gray-100 overflow-x-auto">
          {tabs.map(t => {
            const I = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs whitespace-nowrap ${tab === t.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}>
                <I className="w-3 h-3" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {tab === 'tasks' && (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-2xl p-4">
                <div className="text-xs text-gray-900 mb-2">Как это работает</div>
                <ol className="text-xs text-gray-500 space-y-1.5 list-decimal pl-4">
                  <li>Сотрудник пишет /start боту</li>
                  <li>Получает задачи на день автоматически в 08:00</li>
                  <li>Отмечает статусы прямо в Telegram</li>
                  <li>Фото/видео отчёт через бот</li>
                </ol>
              </div>
              <div className="bg-sky-50 rounded-2xl p-3 space-y-2">
                <div className="bg-white rounded-xl p-2.5 text-xs text-gray-700">📋 Алихан, у вас 3 задачи на сегодня</div>
                <div className="bg-white rounded-xl p-2.5 text-xs text-gray-700">⏰ 09:00 — Замер кухни, ул. Абая 45</div>
                <div className="bg-white rounded-xl p-2.5 text-xs text-gray-700">📷 Загрузите фото после установки</div>
              </div>
            </div>
          )}

          {tab === 'clients' && (
            <div className="space-y-2.5">
              <div className="text-[11px] text-gray-400">Переменные: {'{номер} {дата} {имя} {сумма} {время}'}</div>
              {templates.map(t => (
                <div key={t.id} className="bg-white rounded-2xl border border-gray-100 p-3.5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <textarea value={t.text} onChange={e => setTemplates(ts => ts.map(x => x.id === t.id ? { ...x, text: e.target.value } : x))}
                      rows={2} className="flex-1 text-xs bg-gray-50 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none" />
                    <button onClick={() => setTemplates(ts => ts.map(x => x.id === t.id ? { ...x, enabled: !x.enabled } : x))}
                      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${t.enabled ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${t.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-400">Триггер: {t.trigger}</div>
                </div>
              ))}
              <button className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2.5 border border-dashed border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-50">
                <Plus className="w-3.5 h-3.5" /> Создать новый шаблон
              </button>
            </div>
          )}

          {tab === 'reports' && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-gray-400">Группа в Telegram</label>
                <input value={bossGroup} onChange={e => setBossGroup(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
              </div>
              <div className="space-y-2">
                {[
                  { k: 'daily', label: 'Ежедневный отчёт в 18:00 — продажи дня, новые заявки, проблемы' },
                  { k: 'weekly', label: 'Еженедельный отчёт ПН 09:00 — выручка, план/факт, рейтинг менеджеров' },
                  { k: 'monthly', label: 'Ежемесячный отчёт 1 числа — финансовая сводка' },
                ].map(o => (
                  <label key={o.k} className="flex items-center gap-2 p-2.5 bg-white border border-gray-100 rounded-xl cursor-pointer">
                    <input type="checkbox" checked={(reports as any)[o.k]} onChange={() => setReports(r => ({ ...r, [o.k]: !(r as any)[o.k] }))} />
                    <span className="text-xs text-gray-700">{o.label}</span>
                  </label>
                ))}
              </div>
              <div>
                <div className="text-xs text-gray-900 mb-2">Алёрты в реальном времени</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ALERTS.map(a => {
                    const on = activeAlerts.includes(a);
                    return (
                      <button key={a} onClick={() => setActiveAlerts(s => on ? s.filter(x => x !== a) : [...s, a])}
                        className={`px-3 py-2 rounded-xl text-xs text-left ${on ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-600'}`}>{a}</button>
                    );
                  })}
                </div>
              </div>
              <div className="bg-sky-50 rounded-2xl p-3.5">
                <div className="text-[10px] text-gray-500 mb-1.5">Превью отчёта</div>
                <div className="bg-white rounded-xl p-3 text-xs text-gray-700 space-y-1">
                  <div>📊 Отчёт за 09.05.2026</div>
                  <div>Продажи: 4.2 млн ₸ (+12%)</div>
                  <div>Новых заявок: 8</div>
                  <div>В работе: 23 заказа</div>
                </div>
              </div>
            </div>
          )}

          {tab === 'warehouse' && (
            <div className="space-y-3">
              <div className="text-xs text-gray-900">Алёрты при остатке ниже минимума</div>
              <div className="space-y-2">
                {STOCK_LOW.map(s => (
                  <div key={s.name} className="bg-white border border-rose-100 rounded-2xl p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-gray-900">{s.name}</div>
                      <div className="text-[10px] text-rose-500">{s.qty} шт · мин {s.min}</div>
                    </div>
                    <button className="px-2.5 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] hover:bg-gray-800">Заказать</button>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 p-2.5 bg-white border border-gray-100 rounded-xl cursor-pointer">
                <input type="checkbox" checked={whAlerts.inbound} onChange={() => setWhAlerts(s => ({ ...s, inbound: !s.inbound }))} />
                <span className="text-xs text-gray-700">Уведомлять при поступлении товара</span>
              </label>
              <label className="flex items-center gap-2 p-2.5 bg-white border border-gray-100 rounded-xl cursor-pointer">
                <input type="checkbox" checked={whAlerts.supplier} onChange={() => setWhAlerts(s => ({ ...s, supplier: !s.supplier }))} />
                <span className="text-xs text-gray-700">Запросы от производства в @UtirSoft_Warehouse</span>
              </label>
              <button className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">
                <Send className="w-3.5 h-3.5" /> Сделать заказ поставщику
              </button>
            </div>
          )}

          {tab === 'field' && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500">Утренняя рассылка маршрута на день в 08:00</div>
              <div className="bg-sky-50 rounded-2xl p-3.5">
                <div className="bg-white rounded-xl p-3 text-xs text-gray-700 space-y-2">
                  <div>☀️ Доброе утро, Алихан! Сегодня 3 выезда:</div>
                  <div className="pl-2 space-y-1 text-gray-600">
                    <div>09:00 — Замер кухни, ул. Абая 45, Сериков А., +7 701...</div>
                    <div>12:00 — Установка шкафа, ЖК Премиум, Иванов И.</div>
                    <div>15:00 — Контрольный замер, мкр. Самал 2</div>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {['Выехал', 'На месте', 'Завершил', 'Перенести'].map(b => (
                    <span key={b} className="px-2.5 py-1 bg-white rounded-lg text-[10px] text-sky-600 border border-sky-100">{b}</span>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 p-2.5 bg-white border border-gray-100 rounded-xl cursor-pointer">
                <input type="checkbox" checked={fieldOpts.photo} onChange={() => setFieldOpts(s => ({ ...s, photo: !s.photo }))} />
                <span className="text-xs text-gray-700">Загрузка фото и видео отчёта прямо из Telegram</span>
              </label>
              <label className="flex items-center gap-2 p-2.5 bg-white border border-gray-100 rounded-xl cursor-pointer">
                <input type="checkbox" checked={fieldOpts.geo} onChange={() => setFieldOpts(s => ({ ...s, geo: !s.geo }))} />
                <span className="text-xs text-gray-700">Геолокация для подтверждения визита</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
