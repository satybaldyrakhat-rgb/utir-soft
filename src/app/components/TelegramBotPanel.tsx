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

export function TelegramBotPanel({ onClose, language = 'ru' }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [tab, setTab] = useState<'tasks' | 'clients' | 'reports' | 'warehouse' | 'field'>('tasks');
  const [templates, setTemplates] = useState(CLIENT_TEMPLATES);
  const [bossGroup, setBossGroup] = useState('@UtirSoft_Boss');
  const [reports, setReports] = useState({ daily: true, weekly: true, monthly: false });
  const [activeAlerts, setActiveAlerts] = useState<string[]>(ALERTS);
  const [whAlerts, setWhAlerts] = useState({ inbound: true, supplier: true });
  const [fieldOpts, setFieldOpts] = useState({ photo: true, geo: true });

  const tabs = [
    { id: 'tasks', label: l('Задачи сотрудников', 'Қызметкерлер тапсырмалары', 'Employee tasks'), icon: Users },
    { id: 'clients', label: l('Уведомления клиентам', 'Клиенттерге хабарламалар', 'Client notifications'), icon: Bell },
    { id: 'reports', label: l('Отчёты директору', 'Директорға есептер', 'Director reports'), icon: FileText },
    { id: 'warehouse', label: l('Склад', 'Қойма', 'Warehouse'), icon: Package },
    { id: 'field', label: l('Замерщикам', 'Өлшеушілерге', 'Field staff'), icon: MapPin },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-sky-50 rounded-xl flex items-center justify-center"><Bot className="w-4 h-4 text-sky-600" /></div>
            <div>
              <div className="text-sm text-gray-900">{l('Telegram-бот Utir Soft', 'Utir Soft Telegram-боты', 'Utir Soft Telegram bot')}</div>
              <div className="text-[10px] text-slate-400">@UtirSoftBot · {l('Онлайн', 'Онлайн', 'Online')}</div>
            </div>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        <div className="flex gap-1 px-4 pt-3 border-b border-white/60 overflow-x-auto">
          {tabs.map(t => {
            const I = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs whitespace-nowrap ${tab === t.id ? 'bg-gray-900 text-white' : 'text-slate-500 hover:text-gray-900'}`}>
                <I className="w-3 h-3" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {tab === 'tasks' && (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-2xl p-4">
                <div className="text-xs text-slate-900 mb-2">{l('Как это работает', 'Бұл қалай жұмыс істейді', 'How it works')}</div>
                <ol className="text-xs text-slate-500 space-y-1.5 list-decimal pl-4">
                  <li>{l('Сотрудник пишет /start боту', 'Қызметкер ботқа /start жазады', 'Employee sends /start to the bot')}</li>
                  <li>{l('Получает задачи на день автоматически в 08:00', 'Күнделікті тапсырмаларды 08:00-де автоматты түрде алады', 'Receives daily tasks automatically at 08:00')}</li>
                  <li>{l('Отмечает статусы прямо в Telegram', 'Статустарды тікелей Telegram-да белгілейді', 'Marks statuses right in Telegram')}</li>
                  <li>{l('Фото/видео отчёт через бот', 'Бот арқылы фото/видео есеп', 'Photo/video report via the bot')}</li>
                </ol>
              </div>
              <div className="bg-sky-50 rounded-2xl p-3 space-y-2">
                <div className="bg-white rounded-xl p-2.5 text-xs text-slate-700">📋 {l('У вас X задач на сегодня', 'Бүгін сізде X тапсырма бар', 'You have X tasks for today')}</div>
                <div className="bg-white rounded-xl p-2.5 text-xs text-slate-700">⏰ {l('ЧЧ:ММ — Замер кухни, адрес клиента', 'СС:ММ — Ас үйді өлшеу, клиент мекенжайы', 'HH:MM — Kitchen measurement, client address')}</div>
                <div className="bg-white rounded-xl p-2.5 text-xs text-slate-700">📷 {l('Загрузите фото после установки', 'Орнатудан кейін фото жүктеңіз', 'Upload a photo after installation')}</div>
              </div>
            </div>
          )}

          {tab === 'clients' && (
            <div className="space-y-2.5">
              <div className="text-[11px] text-slate-400">{l('Переменные', 'Айнымалылар', 'Variables')}: {'{номер} {дата} {имя} {сумма} {время}'}</div>
              {templates.map(t => (
                <div key={t.id} className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-3.5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <textarea value={t.text} onChange={e => setTemplates(ts => ts.map(x => x.id === t.id ? { ...x, text: e.target.value } : x))}
                      rows={2} className="flex-1 text-xs bg-gray-50 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none" />
                    <button onClick={() => setTemplates(ts => ts.map(x => x.id === t.id ? { ...x, enabled: !x.enabled } : x))}
                      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${t.enabled ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-gray-200 hover:bg-gray-300'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${t.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="text-[10px] text-slate-400">{l('Триггер', 'Триггер', 'Trigger')}: {t.trigger}</div>
                </div>
              ))}
              <button className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2.5 border border-dashed border-gray-200 rounded-xl text-xs text-slate-500 hover:bg-white/50">
                <Plus className="w-3.5 h-3.5" /> {l('Создать новый шаблон', 'Жаңа үлгі жасау', 'Create new template')}
              </button>
            </div>
          )}

          {tab === 'reports' && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400">{l('Группа в Telegram', 'Telegram тобы', 'Telegram group')}</label>
                <input value={bossGroup} onChange={e => setBossGroup(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-gray-50 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
              </div>
              <div className="space-y-2">
                {[
                  { k: 'daily', label: l('Ежедневный отчёт в 18:00 — продажи дня, новые заявки, проблемы', 'Күн сайын 18:00-де есеп — күндік сатылым, жаңа өтінімдер, мәселелер', 'Daily report at 18:00 — day sales, new requests, issues') },
                  { k: 'weekly', label: l('Еженедельный отчёт ПН 09:00 — выручка, план/факт, рейтинг менеджеров', 'Апта сайын ДС 09:00-де есеп — түсім, жоспар/факт, менеджерлер рейтингі', 'Weekly report Mon 09:00 — revenue, plan/actual, manager ranking') },
                  { k: 'monthly', label: l('Ежемесячный отчёт 1 числа — финансовая сводка', 'Ай сайын 1-күні есеп — қаржылық жиынтық', 'Monthly report on the 1st — financial summary') },
                ].map(o => (
                  <label key={o.k} className="flex items-center gap-2 p-2.5 bg-white/60 ring-1 ring-white/60 backdrop-blur-xl rounded-xl cursor-pointer">
                    <input type="checkbox" checked={(reports as any)[o.k]} onChange={() => setReports(r => ({ ...r, [o.k]: !(r as any)[o.k] }))} />
                    <span className="text-xs text-slate-700">{o.label}</span>
                  </label>
                ))}
              </div>
              <div>
                <div className="text-xs text-slate-900 mb-2">{l('Алёрты в реальном времени', 'Нақты уақыттағы ескертулер', 'Real-time alerts')}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ALERTS.map(a => {
                    const on = activeAlerts.includes(a);
                    const alertLabel: Record<string, string> = {
                      'Крупная сделка > 1 млн ₸': l('Крупная сделка > 1 млн ₸', 'Ірі мәміле > 1 млн ₸', 'Large deal > 1M ₸'),
                      'Отказ клиента': l('Отказ клиента', 'Клиенттің бас тартуы', 'Client refusal'),
                      'Просрочка заказа': l('Просрочка заказа', 'Тапсырыстың мерзімі өтуі', 'Order overdue'),
                      'Потеря горячего лида': l('Потеря горячего лида', 'Ыстық лидтен айырылу', 'Hot lead lost'),
                    };
                    return (
                      <button key={a} onClick={() => setActiveAlerts(s => on ? s.filter(x => x !== a) : [...s, a])}
                        className={`px-3 py-2 rounded-xl text-xs text-left ${on ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-600'}`}>{alertLabel[a] ?? a}</button>
                    );
                  })}
                </div>
              </div>
              <div className="bg-sky-50 rounded-2xl p-3.5">
                <div className="text-[10px] text-slate-500 mb-1.5">{l('Превью отчёта', 'Есеп алдын ала қарау', 'Report preview')}</div>
                <div className="bg-white rounded-xl p-3 text-xs text-slate-700 space-y-1">
                  <div>📊 {l('Отчёт за 09.05.2026', '09.05.2026 есебі', 'Report for 09.05.2026')}</div>
                  <div>{l('Продажи: 4.2 млн ₸ (+12%)', 'Сатылым: 4.2 млн ₸ (+12%)', 'Sales: 4.2M ₸ (+12%)')}</div>
                  <div>{l('Новых заявок: 8', 'Жаңа өтінімдер: 8', 'New requests: 8')}</div>
                  <div>{l('В работе: 23 заказа', 'Жұмыста: 23 тапсырыс', 'In progress: 23 orders')}</div>
                </div>
              </div>
            </div>
          )}

          {tab === 'warehouse' && (
            <div className="space-y-3">
              <div className="text-xs text-gray-900">{l('Алёрты при остатке ниже минимума', 'Қалдық минимумнан төмен болғанда ескерту', 'Alerts when stock is below minimum')}</div>
              <div className="space-y-2">
                {STOCK_LOW.map(s => (
                  <div key={s.name} className="bg-white border border-rose-100 rounded-2xl p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-gray-900">{s.name}</div>
                      <div className="text-[10px] text-rose-500">{s.qty} {l('шт', 'дана', 'pcs')} · {l('мин', 'мин', 'min')} {s.min}</div>
                    </div>
                    <button className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] hover:bg-emerald-700">{l('Заказать', 'Тапсырыс беру', 'Order')}</button>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 p-2.5 bg-white/60 ring-1 ring-white/60 backdrop-blur-xl rounded-xl cursor-pointer">
                <input type="checkbox" checked={whAlerts.inbound} onChange={() => setWhAlerts(s => ({ ...s, inbound: !s.inbound }))} />
                <span className="text-xs text-slate-700">{l('Уведомлять при поступлении товара', 'Тауар келіп түскенде хабарлау', 'Notify when goods arrive')}</span>
              </label>
              <label className="flex items-center gap-2 p-2.5 bg-white/60 ring-1 ring-white/60 backdrop-blur-xl rounded-xl cursor-pointer">
                <input type="checkbox" checked={whAlerts.supplier} onChange={() => setWhAlerts(s => ({ ...s, supplier: !s.supplier }))} />
                <span className="text-xs text-slate-700">{l('Запросы от производства в @UtirSoft_Warehouse', 'Өндірістен @UtirSoft_Warehouse-ке сұраулар', 'Requests from production to @UtirSoft_Warehouse')}</span>
              </label>
              <button className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all">
                <Send className="w-3.5 h-3.5" /> {l('Сделать заказ поставщику', 'Жеткізушіге тапсырыс беру', 'Place order with supplier')}
              </button>
            </div>
          )}

          {tab === 'field' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">{l('Утренняя рассылка маршрута на день в 08:00', 'Күндік бағытты таңертең 08:00-де тарату', 'Morning route dispatch for the day at 08:00')}</div>
              <div className="bg-sky-50 rounded-2xl p-3.5">
                <div className="bg-white rounded-xl p-3 text-xs text-slate-700 space-y-2">
                  <div>☀️ {l('Доброе утро! Сегодня X выездов:', 'Қайырлы таң! Бүгін X шығу:', 'Good morning! Today X visits:')}</div>
                  <div className="pl-2 space-y-1 text-gray-600">
                    <div>{l('ЧЧ:ММ — Замер кухни, адрес клиента, тел.', 'СС:ММ — Ас үйді өлшеу, клиент мекенжайы, тел.', 'HH:MM — Kitchen measurement, client address, phone')}</div>
                    <div>{l('ЧЧ:ММ — Установка шкафа, адрес клиента, тел.', 'СС:ММ — Шкаф орнату, клиент мекенжайы, тел.', 'HH:MM — Cabinet installation, client address, phone')}</div>
                    <div>{l('ЧЧ:ММ — Контрольный замер, адрес клиента, тел.', 'СС:ММ — Бақылау өлшеуі, клиент мекенжайы, тел.', 'HH:MM — Control measurement, client address, phone')}</div>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {[l('Выехал', 'Шықтым', 'Departed'), l('На месте', 'Орындамын', 'On site'), l('Завершил', 'Аяқтадым', 'Done'), l('Перенести', 'Ауыстыру', 'Reschedule')].map(b => (
                    <span key={b} className="px-2.5 py-1 bg-white rounded-lg text-[10px] text-sky-600 border border-sky-100">{b}</span>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 p-2.5 bg-white/60 ring-1 ring-white/60 backdrop-blur-xl rounded-xl cursor-pointer">
                <input type="checkbox" checked={fieldOpts.photo} onChange={() => setFieldOpts(s => ({ ...s, photo: !s.photo }))} />
                <span className="text-xs text-slate-700">{l('Загрузка фото и видео отчёта прямо из Telegram', 'Фото және видео есепті тікелей Telegram-нан жүктеу', 'Upload photo and video reports right from Telegram')}</span>
              </label>
              <label className="flex items-center gap-2 p-2.5 bg-white/60 ring-1 ring-white/60 backdrop-blur-xl rounded-xl cursor-pointer">
                <input type="checkbox" checked={fieldOpts.geo} onChange={() => setFieldOpts(s => ({ ...s, geo: !s.geo }))} />
                <span className="text-xs text-slate-700">{l('Геолокация для подтверждения визита', 'Сапарды растау үшін геолокация', 'Geolocation to confirm the visit')}</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
