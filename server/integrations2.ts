// Real integrations system — replaces the per-user "list of toggles" with
// proper category-aware definitions, real env-key detection, and per-team
// config storage for things that need credentials (Kaspi merchant id,
// WhatsApp phone id, etc.).
//
// Three integration «kinds»:
//   - 'env'    → credential lives in Railway env (e.g. ANTHROPIC_API_KEY).
//                Status = whether that env var is set. UI shows the env
//                name + a one-click copy button; we can't write the value
//                ourselves (security: Railway-only).
//   - 'config' → credentials live in team_settings.integrations JSON.
//                Editable from UI via the configure modal. Status =
//                whether all required fields are filled in.
//   - 'oauth'  → would store per-user OAuth tokens (Google Calendar etc.).
//                Stubbed for now — the UI just says "скоро".

import Database from 'better-sqlite3';

export type IntegrationKind = 'env' | 'config' | 'oauth';
export type IntegrationCategory = 'ai' | 'messaging' | 'payments' | 'mailcal' | 'other';

export interface IntegrationField {
  id: string;
  label: string;
  type?: 'text' | 'password' | 'tel' | 'email';
  required?: boolean;
  placeholder?: string;
  hint?: string;
}

export interface IntegrationDef {
  id: string;
  name: string;
  shortDesc: string;
  longDesc?: string;
  category: IntegrationCategory;
  kind: IntegrationKind;
  // 'env' kind:
  envVars?: string[];        // all of these must be set for «connected»
  // 'config' kind:
  configFields?: IntegrationField[];
  // Where to point the admin if they need to register / get credentials:
  helpUrl?: string;
  // Pretty short instruction shown above the form / status:
  instructions?: string;
}

// ─── Catalog of integrations we support ─────────────────────────────
// Order in this array is the display order in the UI.
export const INTEGRATION_CATALOG: IntegrationDef[] = [
  // ── AI providers (auto-detected from Railway env) ──
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    shortDesc: 'Claude Opus / Sonnet / Haiku',
    longDesc: 'Используется в AI-помощнике, AI-дизайне (улучшение prompt) и в AI для клиентов.',
    category: 'ai',
    kind: 'env',
    envVars: ['ANTHROPIC_API_KEY'],
    helpUrl: 'https://console.anthropic.com/account/keys',
    instructions: 'Создайте API-ключ в Anthropic Console → добавьте в Railway → Variables как ANTHROPIC_API_KEY.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    shortDesc: 'GPT-4o, gpt-image-1, Whisper (голос)',
    longDesc: 'GPT-4o для чата, gpt-image-1 для AI-дизайна, Whisper для распознавания голоса в Telegram-боте и AI-помощнике.',
    category: 'ai',
    kind: 'env',
    envVars: ['OPENAI_API_KEY'],
    helpUrl: 'https://platform.openai.com/api-keys',
    instructions: 'platform.openai.com → API keys → Create new → добавьте в Railway как OPENAI_API_KEY.',
  },
  {
    id: 'google-gemini',
    name: 'Google Gemini',
    shortDesc: 'Gemini 2.5 Pro / Flash, nano-banana',
    longDesc: 'Gemini для чата + nano-banana-pro для AI-дизайна интерьера (best img2img).',
    category: 'ai',
    kind: 'env',
    envVars: ['GEMINI_API_KEY'],
    helpUrl: 'https://aistudio.google.com/app/apikey',
    instructions: 'aistudio.google.com → Get API key → добавьте в Railway как GEMINI_API_KEY.',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    shortDesc: 'DeepSeek V3, R1 Reasoner',
    longDesc: 'Дешёвая альтернатива GPT/Claude, отлично пишет на русском.',
    category: 'ai',
    kind: 'env',
    envVars: ['DEEPSEEK_API_KEY'],
    helpUrl: 'https://platform.deepseek.com/api_keys',
    instructions: 'platform.deepseek.com → API Keys → Create → добавьте в Railway как DEEPSEEK_API_KEY.',
  },

  // ── Messaging ──
  {
    id: 'telegram-bot',
    name: 'Telegram Bot',
    shortDesc: '@utirsoftbot — задачи, AI-команды, AI-дизайн',
    longDesc: 'Сотрудники привязывают свой Telegram через /link, получают задачи и голосом дают команды AI-помощнику.',
    category: 'messaging',
    kind: 'env',
    envVars: ['TELEGRAM_BOT_TOKEN'],
    helpUrl: 'https://t.me/BotFather',
    instructions: 'Создайте бота у @BotFather → токен в Railway как TELEGRAM_BOT_TOKEN.',
  },
  {
    id: 'whatsapp-business',
    name: 'WhatsApp Business',
    shortDesc: 'Авто-ответы AI в WhatsApp от вашего номера',
    longDesc: 'Через Meta WhatsApp Business Cloud API. Клиент пишет — AI отвечает в вашем стиле (настроить в AI для клиентов).',
    category: 'messaging',
    kind: 'config',
    configFields: [
      { id: 'phoneNumberId', label: 'Phone Number ID', required: true, placeholder: '1234567890' },
      { id: 'wabaId',        label: 'WhatsApp Business Account ID', required: true },
      { id: 'accessToken',   label: 'Access Token', type: 'password', required: true, hint: 'Долгоживущий токен из Meta Business' },
    ],
    helpUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    instructions: 'Зарегистрируйте номер в Meta Business → подключите WhatsApp Cloud API → скопируйте Phone Number ID + Access Token.',
  },
  {
    id: 'instagram-direct',
    name: 'Instagram Direct',
    shortDesc: 'Авто-ответы в Instagram Direct',
    longDesc: 'Через Meta Graph API. Instagram должен быть в Business + связан с Facebook Page.',
    category: 'messaging',
    kind: 'config',
    configFields: [
      { id: 'pageId',      label: 'Facebook Page ID', required: true },
      { id: 'igUserId',    label: 'Instagram User ID', required: true },
      { id: 'accessToken', label: 'Page Access Token', type: 'password', required: true },
    ],
    helpUrl: 'https://developers.facebook.com/docs/messenger-platform/instagram',
    instructions: 'Подключите Instagram-Business к Facebook-странице → получите Page Access Token через Meta Graph Explorer.',
  },

  // ── Payments (KZ-specific) ──
  {
    id: 'kaspi-qr',
    name: 'Kaspi QR',
    shortDesc: 'Приём оплаты по QR-коду Kaspi',
    longDesc: 'Создание счетов с QR — клиент сканирует Kaspi-приложением и платит. Транзакции попадают в Финансы.',
    category: 'payments',
    kind: 'config',
    configFields: [
      { id: 'merchantId', label: 'Merchant ID',  required: true },
      { id: 'terminalId', label: 'Terminal ID',  required: true },
      { id: 'secretKey',  label: 'Secret Key', type: 'password', required: true },
    ],
    helpUrl: 'https://kaspi.kz/merchant',
    instructions: 'kaspi.kz/merchant → Личный кабинет → Настройки → Реквизиты API.',
  },
  {
    id: 'halyk-pos',
    name: 'Halyk POS / Acquiring',
    shortDesc: 'Эквайринг Halyk Bank',
    longDesc: 'Терминалы и онлайн-эквайринг для приёма карт.',
    category: 'payments',
    kind: 'config',
    configFields: [
      { id: 'merchantId',   label: 'Merchant ID', required: true },
      { id: 'storeId',      label: 'Store ID',    required: true },
      { id: 'apiSecret',    label: 'API Secret',  type: 'password', required: true },
    ],
    helpUrl: 'https://epay.homebank.kz',
    instructions: 'Получите доступ через бизнес-менеджера Halyk Bank.',
  },
  {
    id: '1c',
    name: '1С:Предприятие',
    shortDesc: 'Синхронизация бухгалтерии',
    longDesc: 'Выгрузка финансовых операций и сделок в 1С (через REST или COM).',
    category: 'payments',
    kind: 'config',
    configFields: [
      { id: 'baseUrl',  label: 'URL 1С Web-сервиса', required: true, placeholder: 'https://1c.company.kz/...' },
      { id: 'username', label: 'Логин',              required: true },
      { id: 'password', label: 'Пароль',             type: 'password', required: true },
    ],
    instructions: 'Получите URL веб-сервиса у вашего 1С-программиста.',
  },

  // ── Calendar / Mail (OAuth — stubbed) ──
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    shortDesc: 'Календарь и Gmail',
    longDesc: 'Синхронизация замеров со встречами в Google Calendar.',
    category: 'mailcal',
    kind: 'oauth',
    helpUrl: 'https://workspace.google.com/',
    instructions: 'Интеграция через OAuth — пока в разработке. Свяжитесь с админом, чтобы настроить вручную.',
  },

  // ── Other ──
  {
    id: 'zapier-webhooks',
    name: 'Webhooks (Zapier / Make / n8n)',
    shortDesc: 'Отправка событий по HTTP во внешние сервисы',
    longDesc: 'Подключите Zapier, Make или собственный backend через webhooks. Каждая новая сделка / оплата / задача шлёт POST на ваш URL.',
    category: 'other',
    kind: 'config',
    configFields: [],
    instructions: 'Webhooks настраиваются в отдельном блоке выше (Webhooks) — поддерживают подпись HMAC.',
  },
];

// ─── Status computation ─────────────────────────────────────────────
export interface IntegrationStatus {
  id: string;
  connected: boolean;
  // For env kind: which env vars are set, which are missing.
  envStatus?: Record<string, boolean>;
  // For config kind: which fields are filled in, last-saved timestamp.
  configStatus?: { hasAllRequired: boolean; lastSavedAt?: string };
  // Stored config — values returned with passwords masked.
  config?: Record<string, string>;
}

function readTeamIntegrations(db: Database.Database, teamId: string): Record<string, any> {
  try {
    const row = db.prepare('SELECT integrations FROM team_settings WHERE team_id = ?').get(teamId) as any;
    if (!row?.integrations) return {};
    const parsed = JSON.parse(row.integrations);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function writeTeamIntegrations(db: Database.Database, teamId: string, all: Record<string, any>) {
  db.prepare(`
    INSERT INTO team_settings (team_id, integrations, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET
      integrations = excluded.integrations,
      updated_at = excluded.updated_at
  `).run(teamId, JSON.stringify(all));
}

// Returns one status entry per integration in the catalog.
export function getAllStatuses(db: Database.Database, teamId: string): IntegrationStatus[] {
  const stored = readTeamIntegrations(db, teamId);
  return INTEGRATION_CATALOG.map(def => {
    if (def.kind === 'env') {
      const envStatus: Record<string, boolean> = {};
      let allSet = true;
      for (const v of def.envVars || []) {
        const set = !!process.env[v];
        envStatus[v] = set;
        if (!set) allSet = false;
      }
      return { id: def.id, connected: allSet, envStatus };
    }
    if (def.kind === 'config') {
      const cfg = stored[def.id]?.config || {};
      const required = (def.configFields || []).filter(f => f.required).map(f => f.id);
      const hasAllRequired = required.length > 0
        ? required.every(k => typeof cfg[k] === 'string' && cfg[k].trim().length > 0)
        : false;  // empty config (e.g. webhooks) → not «connected» from this surface
      // Mask password fields in the returned config.
      const masked: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg)) {
        const field = (def.configFields || []).find(f => f.id === k);
        if (field?.type === 'password' && typeof v === 'string' && v.length > 0) {
          masked[k] = '••••••••' + String(v).slice(-4);
        } else {
          masked[k] = String(v);
        }
      }
      return {
        id: def.id,
        connected: hasAllRequired,
        configStatus: { hasAllRequired, lastSavedAt: stored[def.id]?.savedAt },
        config: masked,
      };
    }
    // oauth — placeholder
    return { id: def.id, connected: false };
  });
}

// Save a `config`-kind integration's fields. Passwords containing the
// «••••» mask are skipped (we only overwrite when the user typed a new
// value), so reopening the modal and clicking Save doesn't accidentally
// wipe an existing secret.
export function saveConfig(
  db: Database.Database, teamId: string, id: string, incoming: Record<string, string>,
): { ok: boolean; error?: string } {
  const def = INTEGRATION_CATALOG.find(d => d.id === id);
  if (!def) return { ok: false, error: 'unknown integration' };
  if (def.kind !== 'config') return { ok: false, error: 'integration is not configurable here' };
  const stored = readTeamIntegrations(db, teamId);
  const prev = stored[id]?.config || {};
  const next: Record<string, string> = { ...prev };
  for (const f of def.configFields || []) {
    const v = incoming[f.id];
    if (typeof v !== 'string') continue;
    // Skip empty / masked-back-to-us values to avoid clobbering secrets.
    if (v.startsWith('••••')) continue;
    next[f.id] = v.trim().slice(0, 500);
  }
  stored[id] = { config: next, savedAt: new Date().toISOString() };
  writeTeamIntegrations(db, teamId, stored);
  return { ok: true };
}

// Wipe an integration's config — used by the «Отключить» button.
export function disconnect(db: Database.Database, teamId: string, id: string): { ok: boolean } {
  const stored = readTeamIntegrations(db, teamId);
  delete stored[id];
  writeTeamIntegrations(db, teamId, stored);
  return { ok: true };
}
