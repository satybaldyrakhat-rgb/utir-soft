import { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Send, ChevronRight, ChevronDown, Check, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';
import { api } from '../utils/api';

// ─── Provider catalog ────────────────────────────────────────────────
// 5 providers, ordered as the user requested. UTIR AI is special — it can
// actually CONTROL the platform (create deals, log payments, etc.) via the
// claudeAgent tool-use flow on the server. Others do pure text chat.
//
// AI_MODELS stays exported so other components can render the same logo
// row (Settings → AI assistant tab references it for the provider grid).
type ProviderId = 'utir-ai' | 'gemini' | 'claude' | 'chatgpt' | 'deepseek';

interface AIModelDef {
  id: ProviderId;
  name: string;
  short: string;
  desc: string;
}

export const AI_MODELS: AIModelDef[] = [
  { id: 'utir-ai',  name: 'UTIR AI',           short: 'UTIR AI',   desc: 'Управляет платформой — создаёт сделки, оплаты, задачи' },
  { id: 'gemini',   name: 'Gemini 3.1 Pro',    short: 'Gemini 3.1', desc: 'Google · мультимодальный, 2M контекст' },
  { id: 'claude',   name: 'Claude Opus 4.7',   short: 'Opus 4.7',   desc: 'Anthropic · самая точная для бизнес-логики' },
  { id: 'chatgpt',  name: 'ChatGPT (latest)',  short: 'ChatGPT',    desc: 'OpenAI · быстрые ответы и кодинг' },
  { id: 'deepseek', name: 'DeepSeek (latest)', short: 'DeepSeek',   desc: 'Open-source, лучший баланс цена/качество' },
];

interface ProviderStatus {
  id: ProviderId;
  name: string;
  enabled: boolean;
  envVar?: string;
  canControl?: boolean;
  short?: string;
}

interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  // For UTIR AI tool proposals — UI shows confirm/cancel buttons that hit
  // /api/ai-chat/execute when accepted.
  pendingTool?: { toolName: string; toolInput: any; summary: string };
}

interface AIAssistantProps {
  context: 'dashboard' | 'ai-design' | 'sales' | 'warehouse' | 'finance' | 'chats' | 'analytics' | 'tasks' | 'settings';
  language: 'kz' | 'ru' | 'eng';
}

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

const greetings: Record<ProviderId, Record<string, string>> = {
  'utir-ai': {
    ru: 'Привет! Я UTIR AI — управляю платформой. Напишите свободным текстом: «Закрыл клиента Айдос на 450 000 ₸», «Поставь задачу замерить завтра у Айгуль», «Что по Кенжебеку?» — и я сам создам / обновлю / найду.',
    kz: 'Сәлем! Мен UTIR AI — платформаны басқарамын. Еркін мәтінмен жазыңыз: «Айдосты 450 000 ₸-ге жаптым», «Айгүлге ертең өлшеу тапсырмасын қой» — мен өзім жасап беремін.',
    eng: "Hi! I'm UTIR AI — I run the platform. Just write naturally: 'closed customer X for Y', 'remind me to call Z tomorrow' — I'll create / update / look up.",
  },
  gemini:   { ru: 'Это Gemini 3.1 Pro. Спросите что угодно — отвечу как обычный чат.', kz: 'Бұл Gemini 3.1 Pro. Кез келген сұрақ қойыңыз.', eng: "Gemini 3.1 Pro here — chat freely." },
  claude:   { ru: 'Claude Opus 4.7 на связи. Готов помочь с анализом, текстами, идеями.', kz: 'Claude Opus 4.7 қосылды.', eng: 'Claude Opus 4.7 ready.' },
  chatgpt:  { ru: 'ChatGPT (последняя версия). Спросите что нужно.', kz: 'ChatGPT (соңғы нұсқа).', eng: 'ChatGPT (latest) ready.' },
  deepseek: { ru: 'DeepSeek (последняя версия). Готов отвечать.', kz: 'DeepSeek (соңғы нұсқа).', eng: 'DeepSeek (latest) ready.' },
};

// Provider-specific helper actions shown on the empty-state. Only UTIR AI
// gets CRM-action prompts; the rest get generic chat starters.
function getQuickActions(providerId: ProviderId, language: 'kz' | 'ru' | 'eng'): string[] {
  if (providerId === 'utir-ai') {
    if (language === 'kz') return ['Айдосты 500 000 ₸-ге жаптым', 'Айгүл 200 000 ₸ төледі', 'Ертеңге өлшеу тапсырмасы', 'Кенжебек бойынша не бар?'];
    if (language === 'eng') return ['Closed Aydos for 500 000 ₸', 'Aigul paid 200 000 ₸', 'Add task: measure tomorrow', "What's on customer Kenzhe?"];
    return ['Закрыл Айдоса на 500 000 ₸', 'Айгуль оплатила 200 000 ₸', 'Поставь задачу замерить завтра', 'Что по Кенжебеку?'];
  }
  if (language === 'kz') return ['Бұл айға болжам жаса', 'Клиентке хат жаз', 'Аналитика түсіндір'];
  if (language === 'eng') return ['Forecast this month', 'Draft a client message', 'Explain analytics'];
  return ['Сделай прогноз на месяц', 'Составь письмо клиенту', 'Объясни аналитику'];
}

const now = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const newId = () => 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function AIAssistant({ context, language }: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Live Telegram-activity feed — shows admin what the team is doing through
  // the bot. Filters the global activity log to source === 'telegram'.
  const store = useDataStore();
  const telegramFeed = (store.activityLogs || [])
    .filter(a => (a as any).source === 'telegram')
    .slice(0, 5);

  const [providers, setProviders] = useState<ProviderStatus[]>(
    AI_MODELS.map(m => ({ id: m.id, name: m.name, short: m.short, enabled: true })),
  );
  const [providerId, setProviderId] = useState<ProviderId>('utir-ai');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executingToolId, setExecutingToolId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedModel = AI_MODELS.find(m => m.id === providerId) || AI_MODELS[0];
  const selectedProvider = providers.find(p => p.id === providerId);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

  // Allow other components to open the popup with a pre-filled prompt
  // (e.g. AIDesign's "ask the assistant about this image" button).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string; provider?: ProviderId }>).detail;
      setIsOpen(true);
      if (detail?.prompt) setInputValue(detail.prompt);
      if (detail?.provider) setProviderId(detail.provider);
    };
    window.addEventListener('ai-assistant:open', onOpen as EventListener);
    return () => window.removeEventListener('ai-assistant:open', onOpen as EventListener);
  }, []);

  // Fetch provider statuses once (which keys are configured on the server).
  useEffect(() => {
    api.get<ProviderStatus[]>('/api/ai-chat/providers')
      .then(rows => {
        // Keep the order from AI_MODELS but apply enabled/envVar from server.
        const byId = new Map(rows.map(r => [r.id, r]));
        setProviders(AI_MODELS.map(m => {
          const r = byId.get(m.id);
          return r ? { ...r, name: m.name, short: m.short } : { id: m.id, name: m.name, short: m.short, enabled: false };
        }));
      })
      .catch(() => { /* keep optimistic defaults */ });
  }, []);

  // Load saved history when the popup opens or the user switches model.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setMessages([]);
    api.get<{ messages: Array<{ role: 'user' | 'assistant'; content: string; ts?: string }> }>(
      `/api/ai-chat/history?provider=${providerId}`,
    ).then(r => {
      if (cancelled) return;
      const hist: AIMessage[] = (r.messages || []).map((m, i) => ({
        id: `h_${i}_${Date.now()}`,
        role: m.role,
        content: m.content,
        timestamp: m.ts ? new Date(m.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '',
      }));
      if (hist.length === 0) {
        hist.push({
          id: 'greet',
          role: 'assistant',
          content: greetings[providerId][language] || greetings[providerId].ru,
          timestamp: now(),
        });
      }
      setMessages(hist);
    }).catch(() => {
      setMessages([{
        id: 'greet',
        role: 'assistant',
        content: greetings[providerId][language] || greetings[providerId].ru,
        timestamp: now(),
      }]);
    });
    return () => { cancelled = true; };
  }, [isOpen, providerId, language]);

  async function sendMessage(text: string) {
    if (!text.trim()) return;
    setError(null);
    const userMsg: AIMessage = { id: newId(), role: 'user', content: text, timestamp: now() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);
    try {
      // Build conversation history for the backend (full transcript so the model has context).
      // Strip out greeting + pending-tool placeholder rows because they aren't real turns.
      const history = [...messages, userMsg]
        .filter(m => !m.pendingTool && m.id !== 'greet')
        .map(m => ({ role: m.role, content: m.content }));
      const resp = await api.post<any>('/api/ai-chat/message', { provider: providerId, messages: history });
      if (resp?.kind === 'tool') {
        const proposalMsg: AIMessage = {
          id: newId(),
          role: 'assistant',
          content: resp.summary,
          timestamp: now(),
          pendingTool: { toolName: resp.toolName, toolInput: resp.toolInput, summary: resp.summary },
        };
        setMessages(prev => [...prev, proposalMsg]);
      } else if (resp?.kind === 'reply') {
        setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: resp.text, timestamp: now() }]);
      } else if (resp?.kind === 'error') {
        setError(resp.error || 'Ошибка провайдера');
      } else {
        setError('Не удалось получить ответ');
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setIsTyping(false);
    }
  }

  async function confirmTool(msg: AIMessage) {
    if (!msg.pendingTool) return;
    setExecutingToolId(msg.id);
    try {
      const resp = await api.post<{ ok: boolean; text: string }>('/api/ai-chat/execute', {
        provider: providerId,
        toolName: msg.pendingTool.toolName,
        toolInput: msg.pendingTool.toolInput,
      });
      // Replace the proposal with the executed result (drops the buttons).
      setMessages(prev => prev.map(m => m.id === msg.id
        ? { ...m, content: (resp.ok ? '✅ ' : '⚠️ ') + (resp.text || ''), pendingTool: undefined, timestamp: now() }
        : m,
      ));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setExecutingToolId(null);
    }
  }

  function cancelTool(msg: AIMessage) {
    setMessages(prev => prev.map(m => m.id === msg.id
      ? { ...m, content: '✕ Действие отменено.', pendingTool: undefined }
      : m,
    ));
  }

  async function clearHistory() {
    try {
      await api.delete(`/api/ai-chat/history?provider=${providerId}`);
    } catch { /* ignore — UI clears regardless */ }
    setMessages([{
      id: 'greet',
      role: 'assistant',
      content: greetings[providerId][language] || greetings[providerId].ru,
      timestamp: now(),
    }]);
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 w-12 h-12 rounded-2xl shadow-lg flex items-center justify-center transition-all duration-300 ${
          isOpen ? 'bg-gray-900 rotate-90 scale-90' : 'bg-gray-900 hover:scale-105 hover:shadow-xl'
        }`}
      >
        {isOpen ? <X className="w-5 h-5 text-white" /> : <Sparkles className="w-5 h-5 text-white" />}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-[400px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-7rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between relative">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                {/* UTIR AI is a universal platform manager (has tools to create deals,
                    log payments, change statuses, etc.) — always label it as such,
                    regardless of which page the popup is opened from. Other providers
                    stay context-aware so users get a relevant role hint. */}
                <div className="text-sm text-gray-900 truncate">
                  {providerId === 'utir-ai'
                    ? (language === 'ru' ? 'AI Помощник платформы' : language === 'kz' ? 'Платформа AI көмекшісі' : 'Platform AI Assistant')
                    : (contextRoles[context]?.[language] || 'AI')}
                </div>
                <button onClick={() => setShowModelMenu(s => !s)} className="text-[10px] text-gray-400 flex items-center gap-1 hover:text-gray-700">
                  <span className={`w-1.5 h-1.5 rounded-full ${selectedProvider?.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  {selectedModel.short}
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearHistory}
                title="Очистить историю чата"
                className="w-8 h-8 hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-gray-400" />
              </button>
              <button onClick={() => setIsOpen(false)} className="w-8 h-8 hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            {showModelMenu && (
              <div className="absolute top-full left-4 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-20 w-[340px] max-h-[400px] overflow-y-auto">
                <div className="px-3 py-2 text-[10px] text-gray-400 uppercase tracking-wide">Модель AI</div>
                {AI_MODELS.map(m => {
                  const status = providers.find(p => p.id === m.id);
                  const enabled = status?.enabled !== false;
                  return (
                    <button
                      key={m.id}
                      onClick={() => { setProviderId(m.id); setShowModelMenu(false); }}
                      className="w-full px-3 py-2.5 hover:bg-gray-50 flex items-start justify-between gap-2 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-900 flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                          {m.name}
                          {m.id === 'utir-ai' && (
                            <span className="ml-1 inline-flex px-1.5 py-0.5 rounded text-[8px] bg-violet-100 text-violet-700 uppercase tracking-wide">tools</span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{m.desc}</div>
                        {!enabled && status?.envVar && (
                          <div className="text-[10px] text-amber-600 mt-0.5">Подключите {status.envVar} в Railway</div>
                        )}
                      </div>
                      {providerId === m.id && <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
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
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%]">
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-5 h-5 bg-gray-900 rounded-md flex items-center justify-center">
                        <Sparkles className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-[10px] text-gray-400">{selectedModel.short} · {msg.timestamp}</span>
                    </div>
                  )}
                  <div className={`px-3.5 py-2.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-gray-900 text-white rounded-2xl rounded-tr-md'
                      : msg.pendingTool
                      ? 'bg-violet-50 text-gray-800 rounded-2xl rounded-tl-md border border-violet-200'
                      : 'bg-gray-50 text-gray-800 rounded-2xl rounded-tl-md'
                  }`}>
                    {/* Server summarize() returns simple HTML (<b>); render as-is for tool proposals. */}
                    {msg.pendingTool ? (
                      <div className="text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: msg.content }} />
                    ) : (
                      <p className="whitespace-pre-line leading-relaxed text-[13px]">{msg.content}</p>
                    )}
                    {msg.role === 'user' && (
                      <span className="text-[10px] text-white/50 block mt-1">{msg.timestamp}</span>
                    )}
                  </div>

                  {msg.pendingTool && (
                    <div className="mt-2 flex gap-1.5">
                      <button
                        disabled={executingToolId === msg.id}
                        onClick={() => confirmTool(msg)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-[11px] flex items-center gap-1"
                      >
                        {executingToolId === msg.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Выполнить
                      </button>
                      <button
                        disabled={executingToolId === msg.id}
                        onClick={() => cancelTool(msg)}
                        className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-lg text-[11px]"
                      >
                        Отмена
                      </button>
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

            {/* Quick actions on empty state — only when just the greeting is shown */}
            {messages.length === 1 && messages[0].id === 'greet' && !isTyping && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] text-gray-400 px-1">Быстро начать</p>
                {getQuickActions(providerId, language).map((text, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(text)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl text-[13px] text-left text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-between group"
                  >
                    <span>{text}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </button>
                ))}
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-[11px] text-red-700">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <div className="flex-1">{error}</div>
                <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isTyping) { e.preventDefault(); sendMessage(inputValue); } }}
                disabled={isTyping || selectedProvider?.enabled === false}
                placeholder={
                  selectedProvider?.enabled === false
                    ? `Подключите ${selectedProvider?.envVar || 'API key'} в Railway`
                    : language === 'ru' ? 'Сообщение...' : language === 'kz' ? 'Хабар...' : 'Message...'
                }
                className="flex-1 px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 disabled:opacity-50"
              />
              <button
                onClick={() => sendMessage(inputValue)}
                disabled={!inputValue.trim() || isTyping || selectedProvider?.enabled === false}
                className="w-8 h-8 bg-gray-900 text-white rounded-xl flex items-center justify-center hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isTyping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
            {providerId === 'utir-ai' && (
              <p className="text-[10px] text-gray-400 mt-1.5 px-1">
                💡 UTIR AI может создавать сделки, оплаты, задачи и менять статусы — спросит подтверждение перед записью.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
