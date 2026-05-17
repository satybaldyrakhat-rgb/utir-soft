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

// Schedule shape — one row per weekday, NextBot-style. Each day has an
// on/off toggle and a from/to time pair. Times are in Asia/Almaty (UTC+5,
// no DST). When `enabled` is false the schedule is ignored and the bot
// answers 24/7.
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DaySlot {
  enabled: boolean;    // false = выходной (бот шлёт outOfHoursMessage)
  start: string;       // 'HH:MM'
  end:   string;       // 'HH:MM'
}

export interface WorkingHours {
  enabled: boolean;                         // master toggle
  days: Record<DayKey, DaySlot>;
}

// The model the bot uses to answer customers. Values are the actual API
// model IDs we send to each provider — keeps backend/frontend in sync and
// makes it obvious which family a model belongs to (claude-* → Anthropic,
// gpt-* → OpenAI, gemini-* → Google, deepseek-* → DeepSeek).
//
// Each family is gated by a separate env key. The frontend disables model
// cards whose family has no key configured (see /api/ai-chat/providers).
export type ClientAIModel =
  | 'claude-opus-4-5' | 'claude-sonnet-4-5' | 'claude-haiku-4-5'
  | 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo'
  | 'gemini-2.5-pro' | 'gemini-2.5-flash'
  | 'deepseek-chat' | 'deepseek-reasoner';

export const ALL_CLIENT_AI_MODELS: ClientAIModel[] = [
  'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5',
  'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo',
  'gemini-2.5-pro', 'gemini-2.5-flash',
  'deepseek-chat', 'deepseek-reasoner',
];

// Map a model id to its provider family. Used by callProvider() to pick
// the right base URL, header, and request body shape.
export function modelFamily(m: ClientAIModel): 'anthropic' | 'openai' | 'gemini' | 'deepseek' {
  if (m.startsWith('claude'))   return 'anthropic';
  if (m.startsWith('gpt'))      return 'openai';
  if (m.startsWith('gemini'))   return 'gemini';
  if (m.startsWith('deepseek')) return 'deepseek';
  return 'anthropic';
}

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

const DEFAULT_DAY: DaySlot = { enabled: true, start: '09:00', end: '20:00' };

export const DEFAULT_CLIENT_AI: ClientAIConfig = {
  enabled: false,
  channels: { instagram: false, whatsapp: false },
  aiModel: 'claude-opus-4-5',
  creativity: 0.7,
  botName: '',
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
    days: {
      mon: { ...DEFAULT_DAY },
      tue: { ...DEFAULT_DAY },
      wed: { ...DEFAULT_DAY },
      thu: { ...DEFAULT_DAY },
      fri: { ...DEFAULT_DAY },
      sat: { enabled: true,  start: '10:00', end: '18:00' },
      sun: { enabled: false, start: '10:00', end: '18:00' },
    },
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
      // Map legacy short model ids ('claude', 'gpt4o') to full versions so
      // existing rows keep working after the migration to model-id strings.
      const LEGACY_MODEL_MAP: Record<string, ClientAIModel> = {
        claude:   'claude-opus-4-5',
        gpt4o:    'gpt-4o',
        gemini:   'gemini-2.5-pro',
        deepseek: 'deepseek-chat',
      };
      const rawModel = parsed.aiModel;
      const aiModel: ClientAIModel = (ALL_CLIENT_AI_MODELS as string[]).includes(rawModel)
        ? rawModel
        : (LEGACY_MODEL_MAP[rawModel] || DEFAULT_CLIENT_AI.aiModel);
      return {
        ...DEFAULT_CLIENT_AI,
        ...parsed,
        aiModel,
        creativity: typeof parsed.creativity === 'number' && parsed.creativity >= 0 && parsed.creativity <= 1 ? parsed.creativity : DEFAULT_CLIENT_AI.creativity,
        botName:    typeof parsed.botName === 'string' ? parsed.botName.slice(0, 60) : DEFAULT_CLIENT_AI.botName,
        channels:   { ...DEFAULT_CLIENT_AI.channels,   ...(parsed.channels   || {}) },
        scenarios:  { ...DEFAULT_CLIENT_AI.scenarios,  ...(parsed.scenarios  || {}) },
        workingHours: mergeWorkingHours(parsed.workingHours),
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
  // Bot is intentionally anonymous — no human name, no fake identity. If the
  // admin wants a custom intro it goes through the persona field, but the
  // baseline is just "AI-помощник компании X".
  lines.push(`Ты — AI-помощник компании${teamCompany ? ` «${teamCompany}»` : ''}. Общаешься напрямую с КЛИЕНТОМ в мессенджере (Instagram / WhatsApp).`);
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
  lines.push('3. Не выдумывай себе человеческое имя и не представляйся конкретным сотрудником. Если клиент спросит как тебя зовут — ответь «Я виртуальный помощник компании» и сразу переходи к делу.');
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

  const family = modelFamily(model);

  if (family === 'anthropic') {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY не задан');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 500, system, temperature, messages: history }),
    });
    const j: any = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
    return (j?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  }

  if (family === 'openai') {
    if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY не задан');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 500, temperature,
        messages: [{ role: 'system', content: system }, ...history],
      }),
    });
    const j: any = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
    return String(j?.choices?.[0]?.message?.content || '').trim();
  }

  if (family === 'gemini') {
    if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY не задан');
    const contents = history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`, {
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

  if (family === 'deepseek') {
    if (!DEEPSEEK_KEY) throw new Error('DEEPSEEK_API_KEY не задан');
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DEEPSEEK_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 500, temperature,
        messages: [{ role: 'system', content: system }, ...history],
      }),
    });
    const j: any = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
    return String(j?.choices?.[0]?.message?.content || '').trim();
  }

  throw new Error(`unknown model: ${model}`);
}

// Merge stored working-hours JSON with defaults. Handles:
//   • new shape { enabled, days: { mon: {enabled,start,end}, ... } }
//   • legacy shape { enabled, weekdayStart, weekdayEnd, saturdayStart,
//                    saturdayEnd, sundayOff } — converted to new shape
function mergeWorkingHours(raw: any): WorkingHours {
  const def = DEFAULT_CLIENT_AI.workingHours;
  if (!raw || typeof raw !== 'object') return def;
  // New shape — just overlay each day if provided.
  if (raw.days && typeof raw.days === 'object') {
    const days = { ...def.days };
    const KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    for (const k of KEYS) {
      const d = raw.days[k];
      if (d && typeof d === 'object') {
        days[k] = {
          enabled: d.enabled !== false,
          start: typeof d.start === 'string' ? d.start : def.days[k].start,
          end:   typeof d.end   === 'string' ? d.end   : def.days[k].end,
        };
      }
    }
    return { enabled: !!raw.enabled, days };
  }
  // Legacy shape — translate.
  const wkStart = typeof raw.weekdayStart === 'string' ? raw.weekdayStart : def.days.mon.start;
  const wkEnd   = typeof raw.weekdayEnd   === 'string' ? raw.weekdayEnd   : def.days.mon.end;
  const satOn   = typeof raw.saturdayStart === 'string' && typeof raw.saturdayEnd === 'string';
  return {
    enabled: !!raw.enabled,
    days: {
      mon: { enabled: true, start: wkStart, end: wkEnd },
      tue: { enabled: true, start: wkStart, end: wkEnd },
      wed: { enabled: true, start: wkStart, end: wkEnd },
      thu: { enabled: true, start: wkStart, end: wkEnd },
      fri: { enabled: true, start: wkStart, end: wkEnd },
      sat: satOn ? { enabled: true, start: raw.saturdayStart, end: raw.saturdayEnd } : { ...def.days.sat },
      sun: { enabled: !raw.sundayOff, start: def.days.sun.start, end: def.days.sun.end },
    },
  };
}

// True when current time in Asia/Almaty falls outside today's schedule. The
// day's enabled=false counts as out-of-hours (full day off).
function isOutOfHours(h: WorkingHours): boolean {
  const now = new Date();
  const ms = now.getTime() + 5 * 60 * 60 * 1000;  // Asia/Almaty UTC+5
  const d = new Date(ms);
  const KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const day = h.days[KEYS[d.getUTCDay()]];
  if (!day || !day.enabled) return true;
  const hhmm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return hhmm < day.start || hhmm > day.end;
}
