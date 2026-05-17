// Client-facing AI configuration — used by the (future) Instagram /
// WhatsApp webhooks to auto-reply to customers in the team's house style.
//
// The admin configures everything in «Настройки → AI для клиентов» on the
// platform; we save it as a JSON blob on team_settings.client_ai. When a
// customer message arrives via Meta webhook, we:
//   1. Load this config for the team.
//   2. Build a system prompt that bakes in tone + scenarios + samples.
//   3. Send the customer's message + recent history to Claude.
//   4. Check handoff triggers — if any match, mark the chat for human
//      pickup and DON'T send a reply (or send a holding message).
//   5. Otherwise post the reply back to Instagram/WhatsApp.
//
// Until those webhooks are live, the same prompt powers the in-platform
// «Тест» playground so admins can iterate without external setup.

import Database from 'better-sqlite3';

// ─── Shape of the config saved per team ─────────────────────────────
export type Tone = 'polite' | 'casual' | 'premium' | 'strict';

export interface WorkingHours {
  enabled: boolean;       // false = AI отвечает 24/7
  weekdayStart: string;   // 'HH:MM' (Asia/Almaty assumed)
  weekdayEnd: string;
  saturdayStart?: string;
  saturdayEnd?: string;
  // Sunday on/off shorthand
  sundayOff: boolean;
}

// Which AI provider answers the customer. UTIR-mix means we route through
// the same Claude tool-capable agent the platform uses internally; the
// other ids match aiChat.ts ChatProviderId minus 'utir-ai' (no tools for
// outside customers — they shouldn't be able to create deals on our behalf).
export type ClientAIModel = 'claude' | 'gpt4o' | 'gemini' | 'deepseek';

export interface ClientAIConfig {
  enabled: boolean;
  // Channels the config applies to (toggle independently as they're wired up).
  channels: { instagram: boolean; whatsapp: boolean };
  // Brain
  aiModel: ClientAIModel;
  creativity: number;   // 0..1 → temperature for the call
  botName: string;      // shown in chat header + introduced in greetings
  tone: Tone;
  // Free-form: "представься как Айгуль, менеджер фабрики мебели Utir"
  persona: string;
  // 1–3 примера наших реальных писем клиентам — Claude мимикрирует стиль.
  writingSamples: string[];
  // Сценарии, на которые AI отвечает сам.
  scenarios: {
    answerFaq: boolean;          // часы работы, адрес, материалы и т.п.
    calculatePrice: boolean;     // прикидывать стоимость по габаритам
    bookMeasurement: boolean;    // записывать на замер (создаёт сделку)
    sendCatalog: boolean;        // отправлять ссылку на каталог
    askForContacts: boolean;     // просить телефон / адрес доставки
  };
  // Фразы, после которых AI замолкает и помечает чат «передать менеджеру».
  // Свободный текст, по одному на строку.
  handoffTriggers: string[];
  // Темы, которые AI вообще не обсуждает (политика, конкуренты, скидки 50%+).
  blacklistTopics: string[];
  workingHours: WorkingHours;
  // Сообщение, которое AI шлёт за рамками рабочих часов.
  outOfHoursMessage: string;
  // Сообщение при передаче живому менеджеру.
  handoffMessage: string;
}

export const DEFAULT_CLIENT_AI: ClientAIConfig = {
  enabled: false,
  channels: { instagram: false, whatsapp: false },
  aiModel: 'claude',
  creativity: 0.7,
  botName: 'Аяна',
  tone: 'polite',
  persona: '',
  writingSamples: [],
  scenarios: {
    answerFaq: true,
    calculatePrice: false,
    bookMeasurement: true,
    sendCatalog: true,
    askForContacts: true,
  },
  handoffTriggers: ['жалоба', 'юрист', 'возврат денег', 'позови менеджера', 'хочу с человеком'],
  blacklistTopics: ['политика', 'религия', 'конкуренты'],
  workingHours: {
    enabled: false,
    weekdayStart: '09:00', weekdayEnd: '20:00',
    saturdayStart: '10:00', saturdayEnd: '18:00',
    sundayOff: true,
  },
  outOfHoursMessage: 'Сейчас мы офлайн. Утром менеджер обязательно вам напишет — спасибо за терпение 🙏',
  handoffMessage: 'Передаю вас живому менеджеру — он подключится к диалогу в ближайшее время.',
};

// ─── DB helpers ─────────────────────────────────────────────────────
export function readClientAI(db: Database.Database, teamId: string): ClientAIConfig {
  try {
    const row = db.prepare('SELECT client_ai FROM team_settings WHERE team_id = ?').get(teamId) as any;
    if (row?.client_ai) {
      const parsed = JSON.parse(row.client_ai);
      // Shallow merge with defaults so adding new fields in code never
      // surfaces "undefined" on old rows.
      return {
        ...DEFAULT_CLIENT_AI,
        ...parsed,
        aiModel:    (['claude', 'gpt4o', 'gemini', 'deepseek'] as const).includes(parsed.aiModel) ? parsed.aiModel : DEFAULT_CLIENT_AI.aiModel,
        creativity: typeof parsed.creativity === 'number' && parsed.creativity >= 0 && parsed.creativity <= 1 ? parsed.creativity : DEFAULT_CLIENT_AI.creativity,
        botName:    typeof parsed.botName === 'string' && parsed.botName.trim() ? parsed.botName.slice(0, 60) : DEFAULT_CLIENT_AI.botName,
        channels:   { ...DEFAULT_CLIENT_AI.channels,   ...(parsed.channels   || {}) },
        scenarios:  { ...DEFAULT_CLIENT_AI.scenarios,  ...(parsed.scenarios  || {}) },
        workingHours: { ...DEFAULT_CLIENT_AI.workingHours, ...(parsed.workingHours || {}) },
        writingSamples:   Array.isArray(parsed.writingSamples)   ? parsed.writingSamples.slice(0, 5)   : DEFAULT_CLIENT_AI.writingSamples,
        handoffTriggers:  Array.isArray(parsed.handoffTriggers)  ? parsed.handoffTriggers.slice(0, 30)  : DEFAULT_CLIENT_AI.handoffTriggers,
        blacklistTopics:  Array.isArray(parsed.blacklistTopics)  ? parsed.blacklistTopics.slice(0, 30)  : DEFAULT_CLIENT_AI.blacklistTopics,
      };
    }
  } catch { /* fall through */ }
  return DEFAULT_CLIENT_AI;
}

export function writeClientAI(db: Database.Database, teamId: string, cfg: ClientAIConfig): void {
  db.prepare(`
    INSERT INTO team_settings (team_id, client_ai, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET
      client_ai = excluded.client_ai,
      updated_at = excluded.updated_at
  `).run(teamId, JSON.stringify(cfg));
}

// ─── Prompt builder ─────────────────────────────────────────────────
const TONE_DESC: Record<Tone, string> = {
  polite:  'Вежливый, тёплый, на «Вы». Дружелюбные обращения, лёгкая эмоция, без сленга.',
  casual:  'Неформальный, на «ты» если клиент тоже на «ты». Короткие фразы, эмодзи уместны.',
  premium: 'Сдержанный, выверенный, ощущение премиального бренда. Без эмодзи, без восклицаний.',
  strict:  'Кратко и по делу. Только факты, никаких подробностей сверх необходимого.',
};

const SCENARIO_DESC: Record<keyof ClientAIConfig['scenarios'], string> = {
  answerFaq:        '• Отвечать на типовые вопросы: часы работы, адрес, материалы, сроки изготовления.',
  calculatePrice:   '• Прикидывать примерную стоимость по описанию (габариты, материал) — обязательно говорить «ориентировочно».',
  bookMeasurement:  '• Записывать клиента на замер: запрашивать имя, телефон, адрес и удобную дату.',
  sendCatalog:      '• Отправлять ссылку на каталог / примеры работ если клиент хочет посмотреть варианты.',
  askForContacts:   '• Если клиент не оставил контакты — мягко спрашивать имя и телефон, чтобы менеджер мог связаться.',
};

export function buildClientSystemPrompt(cfg: ClientAIConfig, teamCompany?: string): string {
  const lines: string[] = [];
  const intro = cfg.botName
    ? `Тебя зовут «${cfg.botName}». Ты — AI-менеджер компании${teamCompany ? ` «${teamCompany}»` : ''}.`
    : `Ты — AI-менеджер компании${teamCompany ? ` «${teamCompany}»` : ''}.`;
  lines.push(`${intro} Общаешься напрямую с КЛИЕНТОМ в мессенджере (Instagram / WhatsApp).`);
  lines.push('');
  lines.push(`ТОН: ${TONE_DESC[cfg.tone]}`);
  if (cfg.persona.trim()) {
    lines.push('');
    lines.push(`ПЕРСОНА: ${cfg.persona.trim()}`);
  }
  if (cfg.writingSamples.length > 0) {
    lines.push('');
    lines.push('ОБРАЗЦЫ НАШИХ ПИСЕМ — пиши в этом же стиле:');
    cfg.writingSamples.slice(0, 3).forEach((s, i) => {
      const t = s.trim().slice(0, 500);
      if (t) lines.push(`Пример ${i + 1}: «${t}»`);
    });
  }
  const enabledScenarios = (Object.keys(cfg.scenarios) as Array<keyof ClientAIConfig['scenarios']>)
    .filter(k => cfg.scenarios[k]);
  if (enabledScenarios.length > 0) {
    lines.push('');
    lines.push('ЧТО МОЖЕШЬ ДЕЛАТЬ:');
    enabledScenarios.forEach(k => lines.push(SCENARIO_DESC[k]));
  }
  if (cfg.blacklistTopics.length > 0) {
    lines.push('');
    lines.push(`ЗАПРЕЩЁННЫЕ ТЕМЫ: ${cfg.blacklistTopics.join(', ')}. На такие вопросы коротко отвечай «не могу обсуждать» и предложи передать менеджеру.`);
  }
  if (cfg.handoffTriggers.length > 0) {
    lines.push('');
    lines.push(`ПЕРЕДАВАТЬ МЕНЕДЖЕРУ, если в сообщении клиента есть: ${cfg.handoffTriggers.join(', ')}. В этом случае ответь ОДНОЙ строкой: «HANDOFF» — больше ничего.`);
  }
  lines.push('');
  lines.push('ОБЩИЕ ПРАВИЛА:');
  lines.push('1. Отвечай коротко (1–4 предложения). Без длинных формальных вступлений.');
  lines.push('2. Никогда не выдумывай цены, сроки, наличие — если не знаешь, мягко предложи передать менеджеру.');
  lines.push('3. Не упоминай, что ты AI — просто отвечай от лица компании.');
  lines.push('4. Если клиент задаёт вопрос вне твоей компетенции — скажи «HANDOFF» одной строкой.');
  lines.push('5. Валюта по умолчанию — тенге (₸).');
  return lines.join('\n');
}

// ─── Test runner (used by /api/team/client-ai/test) ─────────────────
export interface TestResult {
  ok: boolean;
  reply?: string;
  handoff?: boolean;
  outOfHours?: boolean;
  error?: string;
  systemPromptPreview?: string;
  modelUsed?: string;
}

export interface TestTurn { role: 'user' | 'assistant'; content: string }

// Run a single AI turn given the full prior history (the test playground in
// settings sends [user, assistant, user, ...] so the bot remembers context).
// Routes to whichever provider the admin selected; falls back to Claude if
// the chosen one has no key.
export async function runClientAITest(
  cfg: ClientAIConfig,
  history: TestTurn[],
  teamCompany?: string,
): Promise<TestResult> {
  if (history.length === 0 || history[history.length - 1].role !== 'user') {
    return { ok: false, error: 'history must end with a user turn' };
  }
  // Out-of-hours short-circuit (Asia/Almaty, +5).
  if (cfg.workingHours.enabled && isOutOfHours(cfg.workingHours)) {
    return { ok: true, outOfHours: true, reply: cfg.outOfHoursMessage };
  }
  const system = buildClientSystemPrompt(cfg, teamCompany);
  const temperature = Math.max(0, Math.min(1, cfg.creativity ?? 0.7));
  try {
    const text = await callProvider(cfg.aiModel, system, history, temperature);
    if (!text) return { ok: false, error: 'пустой ответ от модели' };
    const handoff = /^HANDOFF\b/i.test(text);
    return {
      ok: true,
      reply: handoff ? cfg.handoffMessage : text,
      handoff,
      systemPromptPreview: system.slice(0, 600),
      modelUsed: cfg.aiModel,
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// ─── Provider call dispatcher ────────────────────────────────────────
// Same fetch shapes we use in server/aiChat.ts but with a system prompt,
// temperature, and multi-turn history. Returns just the text reply or
// throws with a readable message on failure.
async function callProvider(model: ClientAIModel, system: string, history: TestTurn[], temperature: number): Promise<string> {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
  const OPENAI_KEY    = process.env.OPENAI_API_KEY    || '';
  const GEMINI_KEY    = process.env.GEMINI_API_KEY    || '';
  const DEEPSEEK_KEY  = process.env.DEEPSEEK_API_KEY  || '';

  if (model === 'claude') {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY не задан');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 500, system, temperature, messages: history }),
    });
    const j: any = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
    return (j?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  }

  if (model === 'gpt4o') {
    if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY не задан');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 500,
        temperature,
        messages: [{ role: 'system', content: system }, ...history],
      }),
    });
    const j: any = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
    return String(j?.choices?.[0]?.message?.content || '').trim();
  }

  if (model === 'gemini') {
    if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY не задан');
    // Gemini wants role 'model' for assistant turns and a separate systemInstruction.
    const contents = history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { role: 'system', parts: [{ text: system }] },
        contents,
        generationConfig: { temperature, maxOutputTokens: 500 },
      }),
    });
    const j: any = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
    return (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('').trim();
  }

  if (model === 'deepseek') {
    if (!DEEPSEEK_KEY) throw new Error('DEEPSEEK_API_KEY не задан');
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DEEPSEEK_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 500,
        temperature,
        messages: [{ role: 'system', content: system }, ...history],
      }),
    });
    const j: any = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
    return String(j?.choices?.[0]?.message?.content || '').trim();
  }

  throw new Error(`unknown model: ${model}`);
}

// True when current time in Asia/Almaty is outside cfg.workingHours. Used by
// /test and (eventually) the webhook handler. We compare HH:MM strings as
// numbers to avoid Date arithmetic edge-cases.
function isOutOfHours(h: WorkingHours): boolean {
  const now = new Date();
  // Asia/Almaty is UTC+5 year-round (no DST).
  const ms = now.getTime() + 5 * 60 * 60 * 1000;
  const d = new Date(ms);
  const dow = d.getUTCDay(); // 0=Sun … 6=Sat
  const hhmm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  if (dow === 0) return h.sundayOff;
  if (dow === 6) {
    if (!h.saturdayStart || !h.saturdayEnd) return false;
    return hhmm < h.saturdayStart || hhmm > h.saturdayEnd;
  }
  return hhmm < h.weekdayStart || hhmm > h.weekdayEnd;
}
