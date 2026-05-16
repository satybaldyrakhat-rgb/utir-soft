// AI Chat — provider abstraction for the in-app AI Assistant popup.
//
// Five providers exposed to the platform UI:
//   1. utir-ai  → Claude with platform tools (full CRM control). Returns
//                 either a text reply or a tool-use proposal that the UI
//                 must confirm via /api/ai-chat/execute.
//   2. claude   → Claude Opus 4.5, pure text chat (no tool execution).
//   3. gemini   → Google Gemini 2.5 Pro, pure text chat.
//   4. chatgpt  → OpenAI GPT-4o latest, pure text chat.
//   5. deepseek → DeepSeek chat (OpenAI-compatible at api.deepseek.com),
//                 pure text chat.
//
// Missing key → that provider returns ok:false with a friendly reason so
// the UI can show 'Подключите ключ X в Railway' next to a disabled card.

const OPENAI_KEY    = process.env.OPENAI_API_KEY    || '';
const GEMINI_KEY    = process.env.GEMINI_API_KEY    || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const DEEPSEEK_KEY  = process.env.DEEPSEEK_API_KEY  || '';

export type ChatProviderId = 'utir-ai' | 'claude' | 'gemini' | 'chatgpt' | 'deepseek';

export interface ChatProviderStatus {
  id: ChatProviderId;
  name: string;
  enabled: boolean;
  envVar?: string;
  canControl?: boolean; // true → can invoke platform tools (utir-ai only)
  short?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatTextResult {
  kind: 'reply';
  provider: ChatProviderId;
  ok: true;
  text: string;
}

export interface ChatToolResult {
  kind: 'tool';
  provider: ChatProviderId;
  ok: true;
  toolName: string;
  toolInput: any;
  summary: string;
}

export interface ChatErrorResult {
  kind: 'error';
  provider: ChatProviderId;
  ok: false;
  error: string;
}

export type ChatResult = ChatTextResult | ChatToolResult | ChatErrorResult;

export function chatProviderStatuses(): ChatProviderStatus[] {
  return [
    { id: 'utir-ai',  name: 'UTIR AI',         short: 'управление платформой', enabled: !!ANTHROPIC_KEY, envVar: 'ANTHROPIC_API_KEY', canControl: true },
    { id: 'gemini',   name: 'Gemini 2.5 Pro',  short: 'gemini-2.5-pro',        enabled: !!GEMINI_KEY,    envVar: 'GEMINI_API_KEY' },
    { id: 'claude',   name: 'Claude Opus 4.5', short: 'claude-opus-4-5',       enabled: !!ANTHROPIC_KEY, envVar: 'ANTHROPIC_API_KEY' },
    { id: 'chatgpt',  name: 'GPT-4o',          short: 'gpt-4o',                enabled: !!OPENAI_KEY,    envVar: 'OPENAI_API_KEY' },
    { id: 'deepseek', name: 'DeepSeek V3',     short: 'deepseek-chat',         enabled: !!DEEPSEEK_KEY,  envVar: 'DEEPSEEK_API_KEY' },
  ];
}

const SYSTEM_PROMPT_GENERIC =
  'Ты — встроенный AI-помощник CRM-платформы Utir Soft. ' +
  'Отвечай по-русски, по-деловому, кратко и по делу. ' +
  'Если пользователь хочет создать сделку, оплату, задачу или изменить статус — ' +
  'мягко напомни, что для управления платформой надо выбрать модель «UTIR AI».';

// ─── Anthropic (Claude Opus, pure chat) ─────────────────────────────
async function chatClaude(messages: ChatMessage[]): Promise<ChatResult> {
  if (!ANTHROPIC_KEY) return { kind: 'error', provider: 'claude', ok: false, error: 'ANTHROPIC_API_KEY не задан' };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        system: SYSTEM_PROMPT_GENERIC,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });
    const j: any = await res.json();
    if (!res.ok) return { kind: 'error', provider: 'claude', ok: false, error: j?.error?.message || `HTTP ${res.status}` };
    const text = (j?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim() || '…';
    return { kind: 'reply', provider: 'claude', ok: true, text };
  } catch (e: any) {
    return { kind: 'error', provider: 'claude', ok: false, error: String(e?.message || e) };
  }
}

// ─── Gemini ─────────────────────────────────────────────────────────
async function chatGemini(messages: ChatMessage[]): Promise<ChatResult> {
  if (!GEMINI_KEY) return { kind: 'error', provider: 'gemini', ok: false, error: 'GEMINI_API_KEY не задан' };
  try {
    // Gemini expects role 'user' | 'model' (not 'assistant').
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT_GENERIC }] },
          contents,
        }),
      },
    );
    const j: any = await res.json();
    if (!res.ok) return { kind: 'error', provider: 'gemini', ok: false, error: j?.error?.message || `HTTP ${res.status}` };
    const text = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('').trim() || '…';
    return { kind: 'reply', provider: 'gemini', ok: true, text };
  } catch (e: any) {
    return { kind: 'error', provider: 'gemini', ok: false, error: String(e?.message || e) };
  }
}

// ─── OpenAI ChatGPT ─────────────────────────────────────────────────
async function chatOpenAI(messages: ChatMessage[]): Promise<ChatResult> {
  if (!OPENAI_KEY) return { kind: 'error', provider: 'chatgpt', ok: false, error: 'OPENAI_API_KEY не задан' };
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: SYSTEM_PROMPT_GENERIC }, ...messages],
        max_tokens: 1024,
      }),
    });
    const j: any = await res.json();
    if (!res.ok) return { kind: 'error', provider: 'chatgpt', ok: false, error: j?.error?.message || `HTTP ${res.status}` };
    const text = j?.choices?.[0]?.message?.content?.trim() || '…';
    return { kind: 'reply', provider: 'chatgpt', ok: true, text };
  } catch (e: any) {
    return { kind: 'error', provider: 'chatgpt', ok: false, error: String(e?.message || e) };
  }
}

// ─── DeepSeek (OpenAI-compatible) ───────────────────────────────────
async function chatDeepSeek(messages: ChatMessage[]): Promise<ChatResult> {
  if (!DEEPSEEK_KEY) return { kind: 'error', provider: 'deepseek', ok: false, error: 'DEEPSEEK_API_KEY не задан' };
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: SYSTEM_PROMPT_GENERIC }, ...messages],
        max_tokens: 1024,
      }),
    });
    const j: any = await res.json();
    if (!res.ok) return { kind: 'error', provider: 'deepseek', ok: false, error: j?.error?.message || `HTTP ${res.status}` };
    const text = j?.choices?.[0]?.message?.content?.trim() || '…';
    return { kind: 'reply', provider: 'deepseek', ok: true, text };
  } catch (e: any) {
    return { kind: 'error', provider: 'deepseek', ok: false, error: String(e?.message || e) };
  }
}

// Public entry — dispatches by provider id. UTIR AI is routed separately
// by the router (via claudeAgent.runAgent) because it needs DB access.
export async function chat(provider: ChatProviderId, messages: ChatMessage[]): Promise<ChatResult> {
  if (messages.length === 0) return { kind: 'error', provider, ok: false, error: 'empty conversation' };
  if (provider === 'claude')   return chatClaude(messages);
  if (provider === 'gemini')   return chatGemini(messages);
  if (provider === 'chatgpt')  return chatOpenAI(messages);
  if (provider === 'deepseek') return chatDeepSeek(messages);
  return { kind: 'error', provider, ok: false, error: 'unknown provider' };
}
