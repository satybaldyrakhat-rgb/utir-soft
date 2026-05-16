import { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Send, ChevronRight, Paperclip, Mic, Image as ImageIcon, File, Film, Camera, StopCircle, ChevronDown, Check } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';

interface AIMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestions?: string[];
  actionButtons?: { label: string; action: string }[];
  attachmentType?: 'image' | 'file' | 'voice' | 'video';
  attachmentName?: string;
  duration?: string;
}

interface AIAssistantProps {
  context: 'dashboard' | 'ai-design' | 'sales' | 'warehouse' | 'finance' | 'chats' | 'analytics' | 'tasks' | 'settings';
  language: 'kz' | 'ru' | 'eng';
}

const contextLabels: Record<string, Record<string, string>> = {
  dashboard: { kz: 'Басты панель', ru: 'Главная', eng: 'Dashboard' },
  'ai-design': { kz: 'AI Дизайн', ru: 'AI Дизайн', eng: 'AI Design' },
  sales: { kz: 'Сатылым', ru: 'Продажи', eng: 'Sales' },
  warehouse: { kz: 'Өндіріс', ru: 'Производство', eng: 'Production' },
  finance: { kz: 'Қаржы', ru: 'Финансы', eng: 'Finance' },
  chats: { kz: 'Чаттар', ru: 'Чаты', eng: 'Chats' },
  analytics: { kz: 'Аналитика', ru: 'Аналитика', eng: 'Analytics' },
  tasks: { kz: 'Тапсырмалар', ru: 'Задачи', eng: 'Tasks' },
  settings: { kz: 'Баптаулар', ru: 'Настройки', eng: 'Settings' },
};

const contextRoles: Record<string, Record<string, string>> = {
  dashboard: { ru: 'AI Помощник', kz: 'AI Көмекші', eng: 'AI Assistant' },
  'ai-design': { ru: 'AI Дизайнер', kz: 'AI Дизайнер', eng: 'AI Designer' },
  sales: { ru: 'AI Менеджер продаж', kz: 'AI Сату менеджері', eng: 'AI Sales Manager' },
  warehouse: { ru: 'AI Технолог', kz: 'AI Технолог', eng: 'AI Technologist' },
  finance: { ru: 'AI Финансист', kz: 'AI Қаржыгер', eng: 'AI CFO' },
  chats: { ru: 'AI Ответчик', kz: 'AI Жауапкер', eng: 'AI Replier' },
  analytics: { ru: 'AI Аналитик', kz: 'AI Аналитик', eng: 'AI Analyst' },
  tasks: { ru: 'AI Планировщик', kz: 'AI Жоспарлаушы', eng: 'AI Planner' },
  settings: { ru: 'AI Настройщик', kz: 'AI Баптаушы', eng: 'AI Configurator' },
};

export const AI_MODELS = [
  { id: 'default', name: 'Utir AI (по умолчанию)', short: 'Utir AI', desc: 'Базовая модель, оптимальная скорость' },
  { id: 'gemini', name: 'Gemini 3.1 Pro', short: 'Gemini 3.1', desc: 'Google · мультимодальный, 2M контекст' },
  { id: 'claude', name: 'Claude Opus 4.7', short: 'Opus 4.7', desc: 'Anthropic · самая точная для бизнес-логики' },
  { id: 'gpt', name: 'ChatGPT 5', short: 'GPT-5', desc: 'OpenAI · быстрые ответы и кодинг' },
  { id: 'deepseek', name: 'DeepSeek V3', short: 'DeepSeek', desc: 'Open-source, лучший баланс цена/качество' },
  { id: 'grok', name: 'Grok 3', short: 'Grok 3', desc: 'xAI · реальное время и поиск' },
];

export function AIAssistant({ context, language }: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Live Telegram-activity feed — shows admin what the team is doing through
  // the bot. Filters the global activity log to source === 'telegram' and
  // takes the last 5. Refreshes on auto-refresh tick.
  const store = useDataStore();
  const telegramFeed = (store.activityLogs || [])
    .filter(a => (a as any).source === 'telegram')
    .slice(0, 5);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [model, setModel] = useState(AI_MODELS[0]);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string }>).detail;
      setIsOpen(true);
      if (detail?.prompt) setInputValue(detail.prompt);
    };
    window.addEventListener('ai-assistant:open', onOpen as EventListener);
    return () => window.removeEventListener('ai-assistant:open', onOpen as EventListener);
  }, []);

  const getGreeting = () => {
    const greetings: Record<string, Record<string, string>> = {
      dashboard: { kz: 'Сәлем! Бизнесіңізді басқаруға көмектесемін.', ru: 'Привет! Помогу управлять вашим бизнесом.', eng: "Hi! I'll help manage your business." },
      'ai-design': { kz: 'Қош келдіңіз! Не дизайн жасайық?', ru: 'Добро пожаловать! Что создадим?', eng: 'Welcome! What shall we create?' },
      sales: { kz: 'Сатылымдарға көмектесемін.', ru: 'Помогу с продажами.', eng: "I'll help with sales." },
      warehouse: { kz: 'Өндіріс пен қойманы басқарайық!', ru: 'Поможу с производством и складом!', eng: "I'll help with production!" },
      finance: { kz: 'Қаржыны талдауға көмектесемін.', ru: 'Помогу с финансами.', eng: "I'll help with finances." },
      chats: { kz: 'Чат-боттар мен рассылкаларды жасайық!', ru: 'Помогу с чат-ботами и рассылками!', eng: "I'll help with chatbots!" },
      analytics: { kz: 'Деректерді талдап, инсайттар берейін.', ru: 'Проанализирую данные и дам инсайты.', eng: "I'll analyze data and give insights." },
      tasks: { kz: 'Кестені жоспарлауға көмектесемін.', ru: 'Помогу с планированием задач.', eng: "I'll help plan tasks." },
      settings: { kz: 'Жүйені баптауға көмектесемін.', ru: 'Помогу настроить систему.', eng: "I'll help configure the system." },
    };
    return greetings[context]?.[language] || greetings.dashboard[language];
  };

  const getQuickActions = () => {
    const actions: Record<string, { kz: string; ru: string; eng: string; action: string }[]> = {
      dashboard: [
        { kz: 'Бүгін не маңызды?', ru: 'Что важно сегодня?', eng: 'What matters today?', action: 'today_focus' },
        { kz: 'Түсім болжамы', ru: 'Прогноз выручки', eng: 'Revenue forecast', action: 'revenue_forecast' },
        { kz: 'Мәселелерді тап', ru: 'Найди проблемы', eng: 'Find problems', action: 'find_problems' },
      ],
      'ai-design': [
        { kz: 'Жаңа дизайн жаса', ru: 'Создай дизайн', eng: 'Create design', action: 'create_design' },
        { kz: 'Трендтерді көрсет', ru: 'Покажи тренды', eng: 'Show trends', action: 'show_trends' },
        { kz: 'Түстерді таңда', ru: 'Подбери цвета', eng: 'Pick colors', action: 'pick_colors' },
      ],
      sales: [
        { kz: 'Ас үй құнын есепте', ru: 'Рассчитай стоимость кухни', eng: 'Calculate kitchen price', action: 'calc_kitchen' },
        { kz: 'WhatsApp-қа КП жаз', ru: 'Напиши КП в WhatsApp', eng: 'Write proposal to WhatsApp', action: 'write_proposal' },
        { kz: 'Қандай мәмілелер сорылуы мүмкін?', ru: 'Какие сделки могут сорваться?', eng: 'Which deals are at risk?', action: 'deals_at_risk' },
        { kz: 'Ұқсас тапсырыстар тарихы', ru: 'Похожие заказы из истории', eng: 'Similar past orders', action: 'similar_orders' },
      ],
      warehouse: [
        { kz: 'Бюджетке материал таңда', ru: 'Подбери материалы под бюджет', eng: 'Pick materials for budget', action: 'pick_materials' },
        { kz: 'Раскройды оңтайландыр', ru: 'Оптимизируй раскрой', eng: 'Optimize nesting', action: 'optimize_nesting' },
        { kz: 'BOM-ды қателерге тексер', ru: 'Проверь BOM на ошибки', eng: 'Check BOM for errors', action: 'check_bom' },
      ],
      finance: [
        { kz: 'Кіріс-шығынды талда', ru: 'Доходы и расходы', eng: 'Income & expenses', action: 'analyze_finances' },
        { kz: 'Төлем күнтізбесі', ru: 'Платежный календарь', eng: 'Payment calendar', action: 'payment_calendar' },
        { kz: 'Салық есепте', ru: 'Рассчитай налоги', eng: 'Calculate taxes', action: 'calculate_taxes' },
      ],
      chats: [
        { kz: 'Клиентке автожауап', ru: 'Ответь клиенту автоматически', eng: 'Auto-reply to client', action: 'auto_reply' },
        { kz: 'Диалогты қазақшаға аудар', ru: 'Переведи диалог на казахский/русский', eng: 'Translate dialog', action: 'translate_dialog' },
        { kz: 'Диалог қорытындысы 3 жолда', ru: 'Резюме диалога в 3 строчках', eng: 'Dialog summary in 3 lines', action: 'dialog_summary' },
        { kz: 'Ыстық лидті анықта', ru: 'Определи горячий лид', eng: 'Identify hot lead', action: 'hot_lead' },
      ],
      analytics: [
        { kz: 'Аптада не өзгерді?', ru: 'Что изменилось за неделю?', eng: 'What changed this week?', action: 'week_changes' },
        { kz: 'Жасырын трендтерді тап', ru: 'Найди скрытые тренды', eng: 'Find hidden trends', action: 'hidden_trends' },
        { kz: 'Келесі айға болжам', ru: 'Прогноз на следующий месяц', eng: 'Next month forecast', action: 'next_month_forecast' },
      ],
      tasks: [
        { kz: 'Шеберлерге тапсырмаларды бөл', ru: 'Распредели задачи по мастерам', eng: 'Distribute tasks to masters', action: 'distribute_tasks' },
        { kz: 'Кестедегі қақтығыстарды тап', ru: 'Найди конфликты в графике', eng: 'Find schedule conflicts', action: 'schedule_conflicts' },
      ],
      settings: [
        { kz: 'Жүйені оңтайландыр', ru: 'Оптимизируй систему', eng: 'Optimize system', action: 'optimize' },
        { kz: 'Қауіпсіздік тексер', ru: 'Проверь безопасность', eng: 'Check security', action: 'check_security' },
        { kz: 'Бэкап жаса', ru: 'Резервная копия', eng: 'Create backup', action: 'create_backup' },
      ],
    };
    return actions[context] || actions.dashboard;
  };

  const getAIResponse = (userMessage: string, action?: string) => {
    setIsTyping(true);
    setTimeout(() => {
      let response = '';
      let actionButtons: { label: string; action: string }[] = [];

      if (action === 'analyze_stats') {
        response = language === 'ru'
          ? '📊 Анализ на сегодня:\n\n• Выручка: +15% к вчера\n• Активных заказов: 23 (↑ 3)\n• Конверсия: 12.5%\n• Топ товар: Кухня "Модерн"\n\nРекомендация: сфокусируйтесь на допродажах.'
          : language === 'kz'
          ? '📊 Бүгінгі талдау:\n\n• Түсім: +15% кешеге қарағанда\n• Активті тапсырыстар: 23 (↑ 3)\n• Конверсия: 12.5%\n• Топ өнім: "Модерн" ас үй\n\nҰсыныс: қосымша сатуға назар аударыңыз.'
          : '📊 Today\'s analysis:\n\n• Revenue: +15% vs yesterday\n• Active orders: 23 (↑ 3)\n• Conversion: 12.5%\n• Top product: "Modern" kitchen\n\nFocus on upselling.';
        actionButtons = [
          { label: language === 'ru' ? 'Подробный отчет' : language === 'kz' ? 'Толық есеп' : 'Detailed report', action: 'detailed_report' },
        ];
      } else if (action === 'growth_tips') {
        response = language === 'ru'
          ? '💡 5 рекомендаций для роста:\n\n1. Комплекты мебели со скидкой 10%\n2. Автоответы в чат-ботах (-4 ч/день)\n3. Еженедельные акции (+15-20% продаж)\n4. Оптимизация склада\n5. Программа лояльности (+25% повторных)'
          : language === 'kz'
          ? '💡 Өсу үшін 5 ұсыныс:\n\n1. 10% жеңілдікпен жиһаз жиынтықтары\n2. Чат-боттарда автожауаптар (-4 сағ/күн)\n3. Апталық акциялар (+15-20% сатылым)\n4. Қойманы оңтайландыру\n5. Адалдық бағдарламасы (+25% қайталанатын)'
          : '💡 5 growth tips:\n\n1. Furniture sets with 10% discount\n2. Chatbot auto-replies (-4 hrs/day)\n3. Weekly promos (+15-20% sales)\n4. Warehouse optimization\n5. Loyalty program (+25% repeat)';
      } else if (action === 'analyze_finances') {
        response = language === 'ru'
          ? '💰 Финансы за месяц:\n\n📈 Доходы: 15.4М ₸\n📉 Расходы: 8.9М ₸\n💵 Прибыль: 6.5М ₸ (42.3%)\n\nТоп расходы:\n• Материалы: 4.2М ₸ (47%)\n• Зарплата: 2.8М ₸ (31%)\n• Аренда: 890К ₸ (10%)\n\nМожно сэкономить до 8% на закупках.'
          : language === 'kz'
          ? '💰 Айлық қаржы:\n\n📈 Кіріс: 15.4М ₸\n📉 Шығын: 8.9М ₸\n💵 Пайда: 6.5М ₸ (42.3%)\n\nНегізгі шығындар:\n• Материалдар: 4.2М ₸ (47%)\n• Жалақы: 2.8М ₸ (31%)\n• Жалға алу: 890К ₸ (10%)\n\nСатып алуда 8% дейін үнемдеуге болады.'
          : '💰 Monthly finances:\n\n📈 Income: 15.4M ₸\n📉 Expenses: 8.9M ₸\n💵 Profit: 6.5M ₸ (42.3%)\n\nTop expenses:\n• Materials: 4.2M ₸ (47%)\n• Salaries: 2.8M ₸ (31%)\n• Rent: 890K ₸ (10%)\n\nCan save up to 8% on procurement.';
        actionButtons = [
          { label: language === 'ru' ? 'План оптимизации' : language === 'kz' ? 'Оңтайландыру жоспары' : 'Optimization plan', action: 'optimize_plan' },
        ];
      } else if (action === 'create_bot') {
        response = language === 'ru'
          ? '🤖 Какой бот нужен?\n\n1. Приветствие клиентов\n2. FAQ по продуктам\n3. Приём заказов\n4. Техподдержка\n\nВыберите или опишите свой вариант.'
          : language === 'kz'
          ? '🤖 Қандай бот керек?\n\n1. Клиенттерді қарсы алу\n2. Өнімдер FAQ\n3. Тапсырыс қабылдау\n4. Техникалық қолдау\n\nТаңдаңыз немесе өз нұсқаңызды жазыңыз.'
          : '🤖 What type of bot?\n\n1. Welcome clients\n2. Product FAQ\n3. Order taking\n4. Tech support\n\nChoose or describe your own.';
      } else {
        response = language === 'ru'
          ? `Обрабатываю: "${userMessage}"\n\nМогу помочь с:\n• Анализом данных\n• Автоматизацией\n• Оптимизацией\n\nУточните, что нужно?`
          : language === 'kz'
          ? `Өңдеймін: "${userMessage}"\n\nКөмектесе аламын:\n• Деректерді талдау\n• Автоматтандыру\n• Оңтайландыру\n\nНақтылаңыз?`
          : `Processing: "${userMessage}"\n\nI can help with:\n• Data analysis\n• Automation\n• Optimization\n\nPlease specify?`;
      }

      setMessages(prev => [...prev, {
        id: String(Date.now()),
        type: 'assistant',
        content: response,
        timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        actionButtons,
      }]);
      setIsTyping(false);
      setShowSuggestions(false);
    }, 800 + Math.random() * 700);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const msg: AIMessage = {
      id: String(Date.now()),
      type: 'user',
      content: inputValue,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, msg]);
    getAIResponse(inputValue);
    setInputValue('');
  };

  const handleQuickAction = (text: string, action: string) => {
    const msg: AIMessage = {
      id: String(Date.now()),
      type: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, msg]);
    getAIResponse(text, action);
  };

  const handleAttachment = (type: string, label: string) => {
    const msg: AIMessage = {
      id: String(Date.now()),
      type: 'user',
      content: label,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      attachmentType: type as any,
      attachmentName: type === 'image' ? 'photo.jpg' : type === 'video' ? 'video.mp4' : 'document.pdf',
    };
    setMessages(prev => [...prev, msg]);
    setShowAttachMenu(false);
    getAIResponse(language === 'ru' ? `Обрабатываю ${label.toLowerCase()}` : language === 'kz' ? `${label} өңдеймін` : `Processing ${label.toLowerCase()}`);
  };

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: '0',
        type: 'assistant',
        content: getGreeting(),
        timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      }]);
    }
  }, [isOpen]);

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 w-12 h-12 rounded-2xl shadow-lg flex items-center justify-center transition-all duration-300 ${
          isOpen ? 'bg-gray-900 rotate-90 scale-90' : 'bg-gray-900 hover:scale-105 hover:shadow-xl'
        }`}
      >
        {isOpen ? <X className="w-5 h-5 text-white" /> : <Sparkles className="w-5 h-5 text-white" />}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] h-[560px] max-h-[calc(100vh-7rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between relative">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-sm text-gray-900 truncate">{contextRoles[context]?.[language] || 'AI'}</div>
                <button onClick={() => setShowModelMenu(s => !s)} className="text-[10px] text-gray-400 flex items-center gap-1 hover:text-gray-700">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  {model.short}
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="w-8 h-8 hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
            {showModelMenu && (
              <div className="absolute top-full left-4 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-20 w-72">
                <div className="px-3 py-2 text-[10px] text-gray-400 uppercase tracking-wide">Модель AI</div>
                {AI_MODELS.map(m => (
                  <button key={m.id} onClick={() => { setModel(m); setShowModelMenu(false); }}
                    className="w-full px-3 py-2 hover:bg-gray-50 flex items-start justify-between gap-2 text-left">
                    <div className="min-w-0">
                      <div className="text-xs text-gray-900">{m.name}</div>
                      <div className="text-[10px] text-gray-400">{m.desc}</div>
                    </div>
                    {model.id === m.id && <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Live Telegram-activity feed — only renders when something
              actually happened via the bot recently. Lets admin see who is
              doing what in real time without switching to the Журнал tab. */}
          {telegramFeed.length > 0 && (
            <div className="px-4 pt-3 pb-2 border-b border-gray-100 bg-blue-50/30">
              <div className="flex items-center justify-between text-[10px] text-[#2AABEE] mb-1.5">
                <span className="flex items-center gap-1">✈️ <b>Из Telegram-бота</b></span>
                <span className="text-gray-400">{telegramFeed.length}</span>
              </div>
              <div className="space-y-1">
                {telegramFeed.map(a => (
                  <div key={a.id} className="text-[11px] text-gray-700 flex items-baseline gap-1.5">
                    <span className="text-[9px] text-gray-400 font-mono flex-shrink-0">
                      {new Date(a.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-gray-900">{a.user}</span>
                    <span className="text-gray-500 truncate">{a.action}{a.target ? ' · ' + a.target : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.type === 'user' ? '' : ''}`}>
                  {msg.type === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-5 h-5 bg-gray-900 rounded-md flex items-center justify-center">
                        <Sparkles className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-[10px] text-gray-400">AI · {msg.timestamp}</span>
                    </div>
                  )}
                  <div className={`px-3.5 py-2.5 text-sm ${
                    msg.type === 'user'
                      ? 'bg-gray-900 text-white rounded-2xl rounded-tr-md'
                      : 'bg-gray-50 text-gray-800 rounded-2xl rounded-tl-md'
                  }`}>
                    <p className="whitespace-pre-line leading-relaxed text-[13px]">{msg.content}</p>
                    {msg.type === 'user' && (
                      <span className="text-[10px] text-white/50 block mt-1">{msg.timestamp}</span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  {msg.actionButtons && msg.actionButtons.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {msg.actionButtons.map((btn, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleQuickAction(btn.label, btn.action)}
                          className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-[11px] hover:bg-gray-50 hover:border-gray-300 transition-colors"
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 bg-gray-900 rounded-md flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                  <div className="px-4 py-3 bg-gray-50 rounded-2xl rounded-tl-md">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            {showSuggestions && messages.length === 1 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] text-gray-400 px-1">
                  {language === 'ru' ? 'Быстрые действия' : language === 'kz' ? 'Жылдам әрекеттер' : 'Quick actions'}
                </p>
                {getQuickActions().map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickAction(action[language], action.action)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl text-[13px] text-left text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-between group"
                  >
                    <span>{action[language]}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </button>
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-100">
            {isRecording ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 rounded-xl">
                <StopCircle className="w-4 h-4 text-red-500 animate-pulse" />
                <span className="text-xs text-red-700 flex-1">
                  {language === 'ru' ? 'Запись...' : language === 'kz' ? 'Жазу...' : 'Recording...'}
                  <span className="font-mono ml-1">{Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}</span>
                </span>
                <button
                  onClick={() => {
                    setIsRecording(false);
                    const dur = `${Math.floor(recordingDuration / 60)}:${(recordingDuration % 60).toString().padStart(2, '0')}`;
                    setRecordingDuration(0);
                    const msg: AIMessage = {
                      id: String(Date.now()), type: 'user',
                      content: language === 'ru' ? '🎤 Голосовое' : language === 'kz' ? '🎤 Дауыс' : '🎤 Voice',
                      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                      attachmentType: 'voice', duration: dur,
                    };
                    setMessages(prev => [...prev, msg]);
                    getAIResponse(language === 'ru' ? 'Анализирую голосовое' : language === 'kz' ? 'Дауысты талдаймын' : 'Analyzing voice');
                  }}
                  className="px-3 py-1 bg-red-500 text-white rounded-lg text-xs"
                >
                  {language === 'ru' ? 'Отправить' : language === 'kz' ? 'Жіберу' : 'Send'}
                </button>
                <button
                  onClick={() => { setIsRecording(false); setRecordingDuration(0); }}
                  className="px-3 py-1 border border-gray-200 rounded-lg text-xs text-gray-500"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {/* Attach */}
                <div className="relative">
                  <button
                    onClick={() => setShowAttachMenu(!showAttachMenu)}
                    className="w-8 h-8 hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors"
                  >
                    <Paperclip className="w-4 h-4 text-gray-400" />
                  </button>
                  {showAttachMenu && (
                    <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[140px] z-10">
                      {[
                        { type: 'image', icon: ImageIcon, label: language === 'ru' ? 'Фото' : language === 'kz' ? 'Фото' : 'Photo', color: 'text-purple-500' },
                        { type: 'image', icon: Camera, label: language === 'ru' ? 'Камера' : language === 'kz' ? 'Камера' : 'Camera', color: 'text-blue-500' },
                        { type: 'file', icon: File, label: language === 'ru' ? 'Файл' : language === 'kz' ? 'Файл' : 'File', color: 'text-orange-500' },
                        { type: 'video', icon: Film, label: language === 'ru' ? 'Видео' : language === 'kz' ? 'Видео' : 'Video', color: 'text-red-500' },
                      ].map((item, i) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={i}
                            onClick={() => handleAttachment(item.type, item.label)}
                            className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2.5 text-xs"
                          >
                            <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={language === 'ru' ? 'Сообщение...' : language === 'kz' ? 'Хабар...' : 'Message...'}
                  className="flex-1 px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                />

                <button
                  onClick={() => {
                    setIsRecording(true);
                    let d = 0;
                    const interval = setInterval(() => { d++; setRecordingDuration(d); }, 1000);
                    setTimeout(() => clearInterval(interval), 300000);
                  }}
                  className="w-8 h-8 hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors"
                >
                  <Mic className="w-4 h-4 text-gray-400" />
                </button>

                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className="w-8 h-8 bg-gray-900 text-white rounded-xl flex items-center justify-center hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
