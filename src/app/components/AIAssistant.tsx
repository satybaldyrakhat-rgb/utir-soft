import { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Send, ChevronRight, ChevronDown, Check, AlertCircle, Loader2, Trash2, Mic, Square } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';
import { getNiche } from '../utils/niches';
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

// Display names must match what server/aiChat.ts actually requests from each
// provider's API — keep these in sync when bumping model versions.
export const AI_MODELS: AIModelDef[] = [
  { id: 'utir-ai',  name: 'UTIR AI',           short: 'UTIR AI',   desc: 'Управляет платформой · Claude Opus 4.7 + инструменты' },
  { id: 'gemini',   name: 'Gemini 2.5 Pro',    short: 'Gemini 2.5', desc: 'Google · gemini-2.5-pro, мультимодальный' },
  { id: 'claude',   name: 'Claude Opus 4.7',   short: 'Opus 4.7',   desc: 'Anthropic · claude-opus-4-7, 1M контекст, флагман' },
  { id: 'chatgpt',  name: 'GPT-5',             short: 'GPT-5',      desc: 'OpenAI · gpt-5, флагман, мультимодальный' },
  { id: 'deepseek', name: 'DeepSeek V3',       short: 'DeepSeek V3', desc: 'DeepSeek · deepseek-chat, лучший баланс цена/качество' },
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

// Greeting + quick-start are intentionally identical across all five
// providers — switching the model in the dropdown changes ONLY which
// AI answers (visible in the header subline). Layout, copy, and example
// prompts stay the same so the user gets a consistent surface.
//
// Quick actions now reference the team's niche — a windows business
// sees "Create an order for windows" instead of a generic "Create a
// new deal". Keeps the suggestions practically useful right after
// onboarding instead of forcing the user to translate generic verbs
// into their actual product line.
function getGreeting(language: 'kz' | 'ru' | 'eng', nicheRu: string, secondaryRu: string[]): string {
  // Multi-niche teams get a slightly different opener so they
  // immediately know the assistant is aware of all their directions —
  // a windows+doors+stairs business wants to feel that the AI won't
  // forget about the doors and stairs side of the company.
  const niches = secondaryRu.length > 0
    ? `${nicheRu} + ${secondaryRu.join(' + ')}`
    : nicheRu;
  if (language === 'kz') {
    return `Сәлем! Платформаны басқаруға және сұрақтарға жауап беруге көмектесемін. Тапсырманы еркін мәтінмен жазыңыз — мәмілені жасаймын, төлемді жазамын, тапсырма қоямын, клиентті табамын.`;
  }
  if (language === 'eng') {
    return `Hi! I can help run the platform and answer questions. Describe the task in plain words — I'll create deals, log payments, add tasks, look up clients.`;
  }
  return `Здравствуйте! Помогу управлять платформой по ${secondaryRu.length > 0 ? 'нишам' : 'нише'} «${niches}» и отвечу на любые вопросы. Опишите задачу свободным текстом — создам сделку, запишу оплату, поставлю задачу, найду клиента.`;
}

function getQuickActions(language: 'kz' | 'ru' | 'eng', nicheRu: string, nicheKeyword: string): string[] {
  // First action references the niche product type to give a real
  // starting point. The rest stay generic verbs because they apply
  // to every business (payment / task / search).
  if (language === 'kz') {
    return [
      `${nicheKeyword || 'мәміле'} бойынша жаңа тапсырыс жасау`,
      'Төлемді жазу',
      'Тапсырма қою',
      'Клиентті табу',
    ];
  }
  if (language === 'eng') {
    return [
      `Create an order for ${nicheKeyword || 'a deal'}`,
      'Log a payment',
      'Add a task',
      'Find a client',
    ];
  }
  return [
    `Создать заказ на ${nicheKeyword || 'сделку'}`,
    'Записать оплату',
    'Поставить задачу',
    'Найти клиента',
  ];
}

// Maps a niche to a short product-type word used by getQuickActions.
const NICHE_QUICK_NOUN: Record<string, string> = {
  furniture:    'мебель',
  windows:      'окна',
  ceilings:     'натяжной потолок',
  blinds:       'жалюзи',
  doors:        'дверь',
  stairs:       'лестницу',
  flooring:     'пол',
  construction: 'отделку',
  custom:       'заказ',
};

const now = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const newId = () => 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function AIAssistant({ context, language }: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  // Live Telegram-activity feed — shows admin what the team is doing through
  // the bot. Filters the global activity log to source === 'telegram'.
  const store = useDataStore();
  const niche = getNiche(store.niche);
  const nicheNoun = NICHE_QUICK_NOUN[store.niche] || 'заказ';
  // RU names of secondary niches — fed into the greeting so multi-niche
  // teams see "по нишам Мебель + Двери + Лестницы" instead of just the
  // primary. Empty array for single-niche teams.
  const secondaryNicheNames = store.secondaryNiches.map(id => getNiche(id).name.ru);
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
  // Voice input — Web MediaRecorder captures mic audio, we POST it as a base64
  // data URL to /api/ai-chat/transcribe, then drop the transcript into the
  // input box so the user can review/edit before sending.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const recordTimerRef = useRef<number | null>(null);
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
          content: getGreeting(language, niche.name.ru, secondaryNicheNames),
          timestamp: now(),
        });
      }
      setMessages(hist);
    }).catch(() => {
      setMessages([{
        id: 'greet',
        role: 'assistant',
        content: getGreeting(language, niche.name.ru, secondaryNicheNames),
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
        setError(resp.error || l('Ошибка провайдера', 'Провайдер қатесі', 'Provider error'));
      } else {
        setError(l('Не удалось получить ответ', 'Жауап алу мүмкін болмады', 'No response received'));
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
      ? { ...m, content: '✕ ' + l('Действие отменено.', 'Әрекет тоқтатылды.', 'Action cancelled.'), pendingTool: undefined }
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
      content: getGreeting(language, niche.name.ru, secondaryNicheNames),
      timestamp: now(),
    }]);
  }

  // ─── Voice recording ───────────────────────────────────────────────
  // Press mic → request mic permission once, start MediaRecorder, count
  // seconds. Press again (or click ⏹) → stop, collect blob, base64, POST
  // to /api/ai-chat/transcribe, drop the resulting text into inputValue
  // so the user can edit before sending.
  async function startRecording() {
    if (recording || transcribing) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Prefer audio/webm with Opus — supported by Chromium and Whisper.
      // Safari falls back to mp4/aac; Whisper handles both.
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : '';
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recordChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        // Always release the mic; otherwise the browser keeps the indicator on.
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recordChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        recordChunksRef.current = [];
        if (blob.size < 800) { setError(l('Запись слишком короткая.', 'Жазба тым қысқа.', 'Recording too short.')); return; }
        await sendForTranscription(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecordSec(0);
      recordTimerRef.current = window.setInterval(() => setRecordSec(s => s + 1), 1000);
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError'
        ? l('Браузер не дал доступ к микрофону. Разрешите в настройках сайта.',
            'Браузер микрофонға рұқсат бермеді. Сайт баптауларынан рұқсат беріңіз.',
            'Browser denied microphone access. Allow it in site settings.')
        : `${l('Микрофон недоступен', 'Микрофон қол жетімсіз', 'Mic unavailable')}: ${String(e?.message || e)}`);
    }
  }

  function stopRecording() {
    if (!recording) return;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
    setRecording(false);
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }

  async function sendForTranscription(blob: Blob) {
    setTranscribing(true);
    try {
      // Convert blob → data URL so we can POST as JSON (matches the existing
      // 25MB express.json limit; no need to add multer just for one route).
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error('failed to read recording'));
        fr.readAsDataURL(blob);
      });
      const r = await api.post<{ ok: boolean; text?: string; error?: string }>('/api/ai-chat/transcribe', {
        audioDataUrl: dataUrl,
        language: language === 'kz' ? 'kk' : language === 'eng' ? 'en' : 'ru',
      });
      if (r.ok && r.text) {
        // Append to whatever the user might have typed already.
        setInputValue(v => (v ? v.trim() + ' ' : '') + r.text);
      } else {
        setError(r.error || l('Не получилось распознать речь.', 'Сөзді тану мүмкін болмады.', 'Could not transcribe speech.'));
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setTranscribing(false);
    }
  }

  // Stop the recorder if the popup is closed mid-recording — otherwise the
  // mic indicator hangs forever in the browser tab.
  useEffect(() => {
    if (!isOpen && recording) stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <>
      {/* Floating button — glass slate pill with long shadow + slight ring,
          same vocabulary as primary CTAs across the app. */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-emerald-600 backdrop-blur-xl text-white ring-1 ring-white/10 shadow-[0_12px_32px_-8px_var(--accent-shadow)] ${
          isOpen ? 'rotate-90 scale-95' : 'hover:scale-105 hover:shadow-[0_16px_40px_-8px_rgba(15,23,42,0.6)]'
        }`}
      >
        {isOpen ? <X className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
      </button>

      {/* Chat panel — glass shell */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-[400px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-7rem)] bg-white/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl shadow-[0_24px_64px_-12px_rgba(15,23,42,0.30)] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/60 flex items-center justify-between relative">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-gradient-to-br from-slate-900 to-slate-700 rounded-2xl flex items-center justify-center flex-shrink-0 ring-1 ring-white/20 shadow-[0_4px_12px_-2px_var(--accent-shadow)]">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                {/* Title is identical for every model — switching providers
                    only changes WHO answers (visible in the subline as the
                    model id), not the role the popup plays for the user. */}
                <div className="text-sm text-slate-900 truncate">
                  {language === 'ru' ? 'AI Помощник платформы'
                    : language === 'kz' ? 'Платформа AI көмекшісі'
                    : 'Platform AI Assistant'}
                </div>
                <button
                  onClick={() => setShowModelMenu(s => !s)}
                  className="text-[10px] text-slate-500 flex items-center gap-1 hover:text-slate-900 mt-0.5 px-1.5 py-0.5 rounded-full bg-white/50 ring-1 ring-white/60 hover:bg-white/80 transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${selectedProvider?.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  {selectedModel.short}
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearHistory}
                title={l('Очистить историю чата', 'Чат тарихын тазалау', 'Clear chat history')}
                className="w-8 h-8 hover:bg-white/70 ring-1 ring-transparent hover:ring-white/60 rounded-xl flex items-center justify-center transition-all"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-500" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 hover:bg-white/70 ring-1 ring-transparent hover:ring-white/60 rounded-xl flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            {showModelMenu && (
              <div className="absolute top-full left-4 mt-1 bg-white/85 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-2xl shadow-[0_12px_32px_-12px_rgba(15,23,42,0.25)] py-1 z-20 w-[340px] max-h-[400px] overflow-y-auto">
                <div className="px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wide">{l('Модель AI', 'AI моделі', 'AI Model')}</div>
                {AI_MODELS.map(m => {
                  const status = providers.find(p => p.id === m.id);
                  const enabled = status?.enabled !== false;
                  return (
                    <button
                      key={m.id}
                      onClick={() => { setProviderId(m.id); setShowModelMenu(false); }}
                      className="w-full px-3 py-2.5 hover:bg-white/70 flex items-start justify-between gap-2 text-left transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-slate-900 flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          {m.name}
                          {m.id === 'utir-ai' && (
                            <span className="ml-1 inline-flex px-1.5 py-0.5 rounded-full text-[8px] bg-emerald-100/70 text-emerald-700 ring-1 ring-white/40 uppercase tracking-wide">tools</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{m.desc}</div>
                        {!enabled && status?.envVar && (
                          <div className="text-[10px] text-amber-700 mt-0.5">
                            {l('Подключите', 'Қосыңыз', 'Add')} {status.envVar} {l('в Railway', 'Railway ішінде', 'in Railway')}
                          </div>
                        )}
                      </div>
                      {providerId === m.id && <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />}
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
            <div className="px-4 pt-3 pb-2 border-b border-white/60 bg-sky-100/30 backdrop-blur-xl">
              <div className="flex items-center justify-between text-[10px] text-sky-700 mb-1.5">
                <span className="flex items-center gap-1"><b>{l('Из Telegram-бота', 'Telegram-боттан', 'From Telegram bot')}</b></span>
                <span className="text-slate-500 tabular-nums">{telegramFeed.length}</span>
              </div>
              <div className="space-y-1">
                {telegramFeed.map(a => (
                  <div key={a.id} className="text-[11px] text-slate-700 flex items-baseline gap-1.5">
                    <span className="text-[10px] text-slate-500 font-mono flex-shrink-0 tabular-nums">
                      {new Date(a.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-slate-900">{a.user}</span>
                    <span className="text-slate-500 truncate">{a.action}{a.target ? ' · ' + a.target : ''}</span>
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
                      <div className="w-5 h-5 bg-gradient-to-br from-slate-900 to-slate-700 rounded-lg flex items-center justify-center ring-1 ring-white/20">
                        <Sparkles className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-[10px] text-slate-500">{selectedModel.short} · <span className="tabular-nums">{msg.timestamp}</span></span>
                    </div>
                  )}
                  <div className={`px-3.5 py-2.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-white rounded-2xl rounded-tr-md shadow-[0_4px_12px_-2px_var(--accent-shadow-sm)] ring-1 ring-white/10'
                      : msg.pendingTool
                      ? 'bg-violet-100/60 text-slate-800 rounded-2xl rounded-tl-md ring-1 ring-emerald-200/60 backdrop-blur-xl'
                      : 'bg-white/60 text-slate-800 rounded-2xl rounded-tl-md ring-1 ring-white/60 backdrop-blur-xl'
                  }`}>
                    {/* Server summarize() returns simple HTML (<b>); render as-is for tool proposals. */}
                    {msg.pendingTool ? (
                      <div className="text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: msg.content }} />
                    ) : (
                      <p className="whitespace-pre-line leading-relaxed text-[13px]">{msg.content}</p>
                    )}
                    {msg.role === 'user' && (
                      <span className="text-[10px] text-white/60 block mt-1 tabular-nums">{msg.timestamp}</span>
                    )}
                  </div>

                  {msg.pendingTool && (
                    <div className="mt-2 flex gap-1.5">
                      <button
                        disabled={executingToolId === msg.id}
                        onClick={() => confirmTool(msg)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-[11px] flex items-center gap-1 shadow-[0_4px_12px_-2px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
                      >
                        {executingToolId === msg.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        {l('Выполнить', 'Орындау', 'Execute')}
                      </button>
                      <button
                        disabled={executingToolId === msg.id}
                        onClick={() => cancelTool(msg)}
                        className="px-3 py-1.5 bg-white/60 hover:bg-white ring-1 ring-white/60 text-slate-700 rounded-xl text-[11px] backdrop-blur-xl transition-all"
                      >
                        {l('Отмена', 'Бас тарту', 'Cancel')}
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
                  <div className="w-5 h-5 bg-gradient-to-br from-slate-900 to-slate-700 rounded-lg flex items-center justify-center ring-1 ring-white/20">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                  <div className="px-4 py-3 bg-white/60 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl rounded-tl-md">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quick actions on empty state — only when just the greeting is shown */}
            {messages.length === 1 && messages[0].id === 'greet' && !isTyping && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] text-slate-500 px-1 uppercase tracking-wide">
                  {l('Быстро начать', 'Жылдам бастау', 'Quick start')}
                  <span className="normal-case tracking-normal text-slate-400 ml-1">
                    · {niche.icon} {niche.name[language]}
                    {store.secondaryNiches.length > 0 && (
                      <span className="ml-1">
                        + {store.secondaryNiches.map(id => getNiche(id).icon).join(' ')}
                      </span>
                    )}
                  </span>
                </p>
                {getQuickActions(language, niche.name.ru, nicheNoun).map((text, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(text)}
                    className="w-full px-3.5 py-2.5 bg-white/50 ring-1 ring-white/60 rounded-2xl text-[13px] text-left text-slate-700 hover:bg-white/80 backdrop-blur-xl transition-all flex items-center justify-between group"
                  >
                    <span>{text}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="px-3 py-2 bg-rose-100/70 ring-1 ring-rose-200/60 backdrop-blur-xl rounded-2xl flex items-start gap-2 text-[11px] text-rose-700">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <div className="flex-1">{error}</div>
                <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700"><X className="w-3 h-3" /></button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-white/60 bg-white/30 backdrop-blur-xl">
            {recording ? (
              // Recording bar — pulses red so the user can see we're listening.
              // Click ⏹ to finish; the recorder also auto-cuts at 60s.
              <div className="flex items-center gap-2 px-3 py-2 bg-rose-100/70 ring-1 ring-rose-200/60 rounded-2xl backdrop-blur-xl">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                <div className="flex-1 text-[12px] text-rose-700">
                  {l('Идёт запись…', 'Жазу жүріп жатыр…', 'Recording…')} <span className="font-mono tabular-nums">{Math.floor(recordSec / 60)}:{(recordSec % 60).toString().padStart(2, '0')}</span>
                </div>
                <button
                  onClick={stopRecording}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[11px] flex items-center gap-1 shadow-[0_4px_12px_-2px_rgba(225,29,72,0.4)] ring-1 ring-white/10"
                >
                  <Square className="w-3 h-3 fill-current" /> {l('Стоп', 'Тоқтату', 'Stop')}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isTyping) { e.preventDefault(); sendMessage(inputValue); } }}
                  disabled={isTyping || transcribing || selectedProvider?.enabled === false}
                  placeholder={
                    transcribing
                      ? l('Распознаю речь…', 'Сөзді танып жатырмын…', 'Transcribing…')
                      : selectedProvider?.enabled === false
                        ? l(`Подключите ${selectedProvider?.envVar || 'API key'} в Railway`,
                            `${selectedProvider?.envVar || 'API key'} Railway-да қосыңыз`,
                            `Add ${selectedProvider?.envVar || 'API key'} in Railway`)
                        : l('Сообщение или голос…', 'Хабар немесе дауыс…', 'Message or voice…')
                  }
                  className="flex-1 px-3 py-2 bg-white/60 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 disabled:opacity-50 placeholder:text-slate-400 transition-all"
                />
                <button
                  onClick={startRecording}
                  disabled={isTyping || transcribing || selectedProvider?.enabled === false}
                  title={l('Записать голосовое', 'Дауыс жазу', 'Record voice')}
                  className="w-8 h-8 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 backdrop-blur-xl"
                >
                  {transcribing ? <Loader2 className="w-3.5 h-3.5 text-slate-600 animate-spin" /> : <Mic className="w-3.5 h-3.5 text-slate-600" />}
                </button>
                <button
                  onClick={() => sendMessage(inputValue)}
                  disabled={!inputValue.trim() || isTyping || transcribing || selectedProvider?.enabled === false}
                  className="w-8 h-8 bg-emerald-600 text-white rounded-xl flex items-center justify-center hover:bg-emerald-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_4px_12px_-2px_var(--accent-shadow)] ring-1 ring-white/10"
                >
                  {isTyping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
            {/* Same hint regardless of model — non-UTIR providers will just
                politely redirect to UTIR AI when asked to write data. */}
            <p className="text-[10px] text-slate-500 mt-1.5 px-1">
              {l(
                'Можно создавать сделки, оплаты, задачи и менять статусы — спросит подтверждение перед записью.',
                'Мәмілелер, төлемдер, тапсырмалар жасауға және мәртебелерді өзгертуге болады — жазудан бұрын растайды.',
                'Can create deals, payments, tasks and update statuses — will ask for confirmation before writing.',
              )}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
