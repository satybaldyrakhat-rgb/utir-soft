// Telegram Bot integration for Utir Soft platform AI assistant (Block F.1).
//
// Lives entirely server-side. The frontend never sees the bot token. A user
// pairs their Telegram chat with their platform account via the /link CODE flow:
// the platform issues a one-time code → user pastes it in chat → we save the
// (chat_id ↔ user_id) mapping. After that, every free-form message from this
// chat is treated as that user's request.

import Database from 'better-sqlite3';
import { runAgent, type AgentTurnContext } from './claudeAgent.js';
import { canRunTool } from './permissions.js';

const TG_API = 'https://api.telegram.org';
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

export function isTelegramReady() {
  return !!TOKEN;
}

// ─── Telegram Bot API helpers ─────────────────────────────────────
async function tg<T = any>(method: string, body?: Record<string, any>): Promise<T> {
  if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  const res = await fetch(`${TG_API}/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json() as any;
  if (!json.ok) throw new Error(`telegram ${method}: ${json.description}`);
  return json.result;
}

export async function sendMessage(chatId: number, text: string, options: { parse_mode?: 'HTML' | 'MarkdownV2' } = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: options.parse_mode || 'HTML', disable_web_page_preview: true });
}

// Download a Telegram photo by file_id and return a data URL. Used by the
// /design wizard to feed user-supplied room photos & references into the
// aiImage providers (which already accept data URLs).
//
// Telegram's /getFile returns { file_path }; the actual binary lives at
// https://api.telegram.org/file/bot<TOKEN>/<file_path>.
async function downloadTgFileAsDataUrl(fileId: string): Promise<string | null> {
  if (!TOKEN) return null;
  try {
    const info = await tg<{ file_path: string; file_size?: number }>('getFile', { file_id: fileId });
    if (!info?.file_path) return null;
    // Hard cap at ~20 MB so we don't blow our /generate body limit (25MB) on a single image.
    if (info.file_size && info.file_size > 20 * 1024 * 1024) return null;
    const res = await fetch(`${TG_API}/file/bot${TOKEN}/${info.file_path}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Telegram converts the file path's extension to give us a reasonable hint.
    const ext = info.file_path.toLowerCase().split('.').pop() || 'jpg';
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    console.warn('[downloadTgFile]', e);
    return null;
  }
}

// Register the /-command list shown in Telegram's blue menu button.
// Called once at server start; safe to re-run (Telegram just overwrites).
export async function registerBotCommands(): Promise<void> {
  if (!TOKEN) return;
  try {
    await tg('setMyCommands', {
      commands: [
        { command: 'start',   description: '🚀 Начать / приветствие' },
        { command: 'design',  description: '🎨 AI Дизайн интерьера (мастер)' },
        { command: 'today',   description: '📊 Что было сегодня' },
        { command: 'tasks',   description: '✅ Мои задачи' },
        { command: 'revenue', description: '💰 Моя выручка' },
        { command: 'assign',  description: '👥 Назначить задачу сотруднику' },
        { command: 'link',    description: '🔗 Привязать аккаунт по коду' },
        { command: 'cancel',  description: '✕ Отменить текущее действие' },
        { command: 'help',    description: '❓ Помощь' },
      ],
    });
  } catch (e) {
    console.warn('[registerBotCommands]', e);
  }
}

// ─── Pairing state in DB ──────────────────────────────────────────
function newLinkCode() {
  // 6 chars, easy to type, unambiguous (no 0/O/1/I).
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function issueLinkCode(db: Database.Database, userId: string): { code: string; expiresAt: string } {
  const code = newLinkCode();
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h
  // Upsert: keep existing chat_id if any (a previously paired user can refresh code without unpairing).
  db.prepare(`
    INSERT INTO telegram_links (user_id, link_code, code_expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET link_code = excluded.link_code, code_expires_at = excluded.code_expires_at
  `).run(userId, code, expires);
  return { code, expiresAt: expires };
}

export interface LinkStatus { paired: boolean; chatId?: number; username?: string; linkedAt?: string; pendingCode?: string }

export function getLinkStatus(db: Database.Database, userId: string): LinkStatus {
  const row = db.prepare('SELECT chat_id, link_code, code_expires_at, linked_at, username FROM telegram_links WHERE user_id = ?').get(userId) as any;
  if (!row) return { paired: false };
  return {
    paired: !!row.chat_id,
    chatId: row.chat_id || undefined,
    username: row.username || undefined,
    linkedAt: row.linked_at || undefined,
    pendingCode: row.link_code || undefined,
  };
}

export function unlink(db: Database.Database, userId: string) {
  db.prepare('DELETE FROM telegram_links WHERE user_id = ?').run(userId);
}

function findUserByChat(db: Database.Database, chatId: number): { id: string; teamId: string; name: string; teamRole: string } | undefined {
  const row = db.prepare(`
    SELECT u.id, u.team_id, u.name, u.team_role FROM telegram_links tl
    JOIN users u ON u.id = tl.user_id
    WHERE tl.chat_id = ?
  `).get(chatId) as any;
  return row ? { id: row.id, teamId: row.team_id || row.id, name: row.name, teamRole: row.team_role || 'admin' } : undefined;
}

// Find the employees row that belongs to this auth user (matching by email,
// since signup creates an employees row whose data.email equals user.email).
// Returns { id, name } or null.
function findEmployeeForUser(db: Database.Database, userId: string, teamId: string): { id: string; name: string } | null {
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as any;
  if (!u?.email) return null;
  const rows = db.prepare('SELECT id, data FROM employees WHERE team_id = ?').all(teamId) as any[];
  for (const r of rows) {
    try {
      const data = JSON.parse(r.data);
      if ((data.email || '').toLowerCase() === u.email.toLowerCase()) {
        return { id: r.id, name: data.name || '' };
      }
    } catch { /* skip */ }
  }
  return null;
}

// Stable-ish id helper used by /assign when creating a task directly.
function newId(prefix: string) {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function consumeLinkCode(db: Database.Database, code: string, chatId: number, username?: string): { ok: true; userId: string; userName: string } | { ok: false; reason: string } {
  const row = db.prepare(`
    SELECT tl.user_id, tl.code_expires_at, u.name
    FROM telegram_links tl JOIN users u ON u.id = tl.user_id
    WHERE tl.link_code = ?
  `).get(code.toUpperCase()) as any;
  if (!row) return { ok: false, reason: 'code_unknown' };
  if (row.code_expires_at && new Date(row.code_expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'code_expired' };
  }
  // Make sure this chat_id isn't already paired to a different user.
  const dup = db.prepare('SELECT user_id FROM telegram_links WHERE chat_id = ? AND user_id != ?').get(chatId, row.user_id) as any;
  if (dup) return { ok: false, reason: 'chat_already_linked' };
  db.prepare(`UPDATE telegram_links SET chat_id = ?, linked_at = datetime('now'), link_code = NULL, code_expires_at = NULL, username = ? WHERE user_id = ?`).run(chatId, username || null, row.user_id);
  return { ok: true, userId: row.user_id, userName: row.name };
}

// ─── Pending tool confirmation state (persisted in telegram_links.pending_action) ────
// Originally kept in-memory, but Railway proved to restart the process between webhook
// calls, so we serialise the pending action into SQLite. One slot per chat.
interface PendingAction {
  toolName: string;
  toolInput: any;
  summary: string;
  expiresAt: number;
}
const PENDING_TTL_MS = 10 * 60 * 1000;

function setPending(db: Database.Database, chatId: number, p: Omit<PendingAction, 'expiresAt'>) {
  const payload = JSON.stringify({ ...p, expiresAt: Date.now() + PENDING_TTL_MS });
  db.prepare('UPDATE telegram_links SET pending_action = ? WHERE chat_id = ?').run(payload, chatId);
}
function getPending(db: Database.Database, chatId: number): PendingAction | null {
  const row = db.prepare('SELECT pending_action FROM telegram_links WHERE chat_id = ?').get(chatId) as any;
  if (!row?.pending_action) return null;
  try {
    const p = JSON.parse(row.pending_action) as PendingAction;
    if (!p || p.expiresAt < Date.now()) { clearPending(db, chatId); return null; }
    return p;
  } catch { clearPending(db, chatId); return null; }
}
function clearPending(db: Database.Database, chatId: number) {
  db.prepare('UPDATE telegram_links SET pending_action = NULL WHERE chat_id = ?').run(chatId);
}

// ─── /design wizard state (multi-turn AI-design conversation) ────────────
// Stored on telegram_links.design_state as JSON. Lets a user type plain
// answers (or tap reply keyboard buttons) instead of crafting a full prompt.
type DesignStep = 'room' | 'style' | 'mood' | 'room_photo' | 'references' | 'confirm';
interface DesignState {
  step: DesignStep;
  room?: string;
  style?: string;
  extra?: string; // user's free-text mood/details
  // Optional input images for img2img. Both data URLs (base64).
  roomPhoto?: string;
  referenceImages?: string[]; // capped at 3
  expiresAt: number;
}
const DESIGN_TTL_MS = 15 * 60 * 1000;

function getDesignState(db: Database.Database, chatId: number): DesignState | null {
  const row = db.prepare('SELECT design_state FROM telegram_links WHERE chat_id = ?').get(chatId) as any;
  if (!row?.design_state) return null;
  try {
    const s = JSON.parse(row.design_state) as DesignState;
    if (!s || s.expiresAt < Date.now()) { clearDesignState(db, chatId); return null; }
    return s;
  } catch { clearDesignState(db, chatId); return null; }
}
function setDesignState(db: Database.Database, chatId: number, s: Omit<DesignState, 'expiresAt'>) {
  db.prepare('UPDATE telegram_links SET design_state = ? WHERE chat_id = ?').run(
    JSON.stringify({ ...s, expiresAt: Date.now() + DESIGN_TTL_MS }), chatId,
  );
}
function clearDesignState(db: Database.Database, chatId: number) {
  db.prepare('UPDATE telegram_links SET design_state = NULL WHERE chat_id = ?').run(chatId);
}

// Reply-keyboard rows for the wizard. Telegram renders them under the
// input area; tapping a button sends the label as a regular text message.
const KB_ROOMS = [
  ['🍳 Кухня', '🛏 Спальня', '🛋 Гостиная'],
  ['🛁 Ванная', '🧸 Детская', '🚪 Прихожая'],
  ['/skip'],
];
const KB_STYLES = [
  ['🌲 Скандинавский', '◻️ Минимализм'],
  ['🧱 Лофт', '🏛 Классика'],
  ['✨ Модерн', '🌿 Эко'],
  ['/skip'],
];
const KB_MOOD = [
  ['☀️ Утренний свет', '🛋 Уютно'],
  ['💎 Премиум', '📐 Просторно'],
  ['🌱 С растениями', '🌙 Вечерние лампы'],
  ['/skip готово'],
];
// Photo-step keyboards — only /skip, since the photo itself is a Telegram
// attachment, not a button. Tap the paperclip → photo / camera to upload.
const KB_SKIP_PHOTO = [
  ['/skip пропустить'],
];
const KB_REFS = [
  ['✅ Готово', '/skip пропустить'],
];

// Strip emoji/leading symbols from a button label so the answer matches our
// wizard's room/style keys.
function cleanLabel(s: string): string {
  return s.replace(/^[^a-zа-яё]+/i, '').trim().toLowerCase();
}

// Map a user's text answer (button label or freeform) to a Russian phrase
// that goes into the final assembled prompt.
const ROOM_MAP: Record<string, string> = {
  'кухня': 'просторная кухня',
  'спальня': 'уютная спальня',
  'гостиная': 'светлая гостиная',
  'ванная': 'современная ванная комната',
  'детская': 'детская комната',
  'прихожая': 'прихожая',
};
const STYLE_MAP: Record<string, string> = {
  'скандинавский': 'в скандинавском стиле, белые матовые фасады, дерево, мягкое естественное освещение',
  'сканди': 'в скандинавском стиле, белые матовые фасады, дерево, мягкое естественное освещение',
  'минимализм': 'в стиле минимализм, чистые линии, монохромная палитра',
  'лофт': 'в стиле лофт, кирпичная кладка, открытые балки, металл',
  'классика': 'в классическом стиле, лепнина, благородные материалы, тёплый свет',
  'классический': 'в классическом стиле, лепнина, благородные материалы, тёплый свет',
  'модерн': 'в стиле современный модерн, акцентные геометрии, тёмный дуб, латунь',
  'современный': 'в стиле современный модерн, акцентные геометрии, тёмный дуб, латунь',
  'эко': 'в эко-стиле, натуральные материалы, лён, ротанг, много зелени',
};

// Build a prompt from wizard answers.
function assemblePromptFromWizard(s: DesignState): string {
  const parts: string[] = [];
  if (s.room && ROOM_MAP[s.room]) parts.push(ROOM_MAP[s.room]);
  if (s.style && STYLE_MAP[s.style]) parts.push(STYLE_MAP[s.style]);
  if (s.extra) parts.push(s.extra);
  return parts.join(', ');
}

// Shared image generation routine — pulled out so /design with-args AND
// the wizard's final confirm step can share the same code path.
async function runDesignGeneration(
  db: Database.Database, chatId: number,
  user: { id: string; teamId: string; name: string },
  providerId: 'chatgpt' | 'gemini' | 'claude' | 'utir-mix',
  prompt: string,
  logActivity: (userId: string, entry: any) => void,
  inputImages?: { roomPhoto?: string; referenceImages?: string[] },
) {
  const extras: string[] = [];
  if (inputImages?.roomPhoto) extras.push('фото комнаты');
  if (inputImages?.referenceImages?.length) extras.push(`${inputImages.referenceImages.length} реф.`);
  const extraNote = extras.length ? ` (с ${extras.join(' + ')})` : '';
  await sendMessage(chatId, `🎨 Генерирую (${providerId})${extraNote}, это может занять 10-30 секунд…`);
  const { generate } = await import('./aiImage.js');
  let results;
  try { results = await generate(providerId, { prompt, roomPhoto: inputImages?.roomPhoto, referenceImages: inputImages?.referenceImages }); }
  catch (e: any) { await sendMessage(chatId, `❌ Ошибка генерации: ${String(e?.message || e)}`); return; }
  const ok = results.filter((r: any) => r.ok);
  if (ok.length === 0) {
    await sendMessage(chatId, `❌ Не получилось: ${results[0]?.error || 'неизвестная причина'}`);
    return;
  }
  const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(user.id) as any;
  for (const r of ok) {
    const id = 'aig_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    try {
      db.prepare(
        'INSERT INTO ai_generations (id, team_id, user_id, user_name, provider, prompt, image_url, image_data, enhanced_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(id, user.teamId, user.id, actor?.name || '', r.provider, prompt, r.imageUrl || null, r.imageDataUrl || null, r.enhancedPrompt || null);
    } catch (e) { console.warn('[design save]', e); }
  }
  for (const r of ok) {
    try {
      if (r.imageUrl) {
        await tg('sendPhoto', { chat_id: chatId, photo: r.imageUrl, caption: `<b>${r.provider}</b>${r.enhancedPrompt ? `\n<i>Prompt:</i> ${r.enhancedPrompt.slice(0, 200)}` : ''}`, parse_mode: 'HTML' });
      } else {
        await sendMessage(chatId, `<b>${r.provider}</b> ✅ — открыть на платформе → AI Дизайн.`);
      }
    } catch (e) {
      console.warn('[design send photo]', e);
      await sendMessage(chatId, `<b>${r.provider}</b>: открыть на платформе → AI Дизайн.`);
    }
  }
  logActivity(user.id, {
    user: user.name, actor: 'human', source: 'telegram',
    action: 'Сгенерировал AI-дизайн через Telegram',
    target: prompt.slice(0, 100),
    type: 'create', page: 'ai-design',
  });
}

// End-of-wizard: read state, build prompt, run generation with collected
// photos. Shared by the «✅ Готово» / /skip path and the auto-finish at 3 refs.
async function finalizeDesignWizard(
  db: Database.Database, chatId: number,
  user: { id: string; teamId: string; name: string },
  logActivity: (userId: string, entry: any) => void,
) {
  const state = getDesignState(db, chatId);
  if (!state) return;
  const prompt = assemblePromptFromWizard(state);
  const inputs = { roomPhoto: state.roomPhoto, referenceImages: state.referenceImages };
  clearDesignState(db, chatId);
  if (!prompt.trim() && !inputs.roomPhoto && !(inputs.referenceImages?.length)) {
    await tg('sendMessage', { chat_id: chatId, text: 'Слишком мало деталей — попробуйте /design ещё раз.', reply_markup: { remove_keyboard: true } });
    return;
  }
  await tg('sendMessage', {
    chat_id: chatId, parse_mode: 'HTML',
    text: `<b>Готовлю prompt:</b>\n<i>${prompt || '(только по фото)'}</i>`,
    reply_markup: { remove_keyboard: true },
  });
  // When the user uploaded a room photo, prefer Gemini (nano-banana-pro) —
  // it's the most reliable img2img provider for interiors. Otherwise stay
  // on UTIR-mix so the team sees multiple variants.
  const provider: 'chatgpt' | 'gemini' | 'claude' | 'utir-mix' = inputs.roomPhoto ? 'gemini' : 'utir-mix';
  await runDesignGeneration(db, chatId, user, provider, prompt || 'photoreal interior render', logActivity, inputs);
}

// ─── Per-module AI permissions (Block F.4) ────────────────────────────────
// Each user can configure per-module behaviour in Settings → AI-assistant:
//   - 'auto'    → bot executes the tool immediately, no confirmation
//   - 'confirm' → bot summarises and waits for "Да" (default, current behaviour)
//   - 'none'    → bot refuses, tells the admin the module is disabled
type ModulePermission = 'auto' | 'confirm' | 'none';

const HUMAN_MODULE_NAMES: Record<string, string> = {
  sales: 'Продажи / Сделки',
  finance: 'Финансы / Оплаты',
  tasks: 'Задачи',
  analytics: 'Аналитика',
  chats: 'Чаты',
  warehouse: 'Производство / Склад',
};

// Hand-off / failure logging (Block F.5) — every time the bot couldn't or
// wouldn't act, drop an entry into the user's activity log so the admin can
// review what was missed without scrolling through Telegram chat history.
function logHandoff(
  logActivity: (userId: string, entry: any) => void,
  userId: string,
  userName: string,
  reason: string,
  detail: string,
) {
  try {
    logActivity(userId, {
      user: userName,
      actor: 'ai',
      type: 'ai',
      page: 'ai',
      action: `AI handoff: ${reason}`,
      target: detail.slice(0, 240),
    });
  } catch (err) {
    console.error('[telegram] logHandoff failed', err);
  }
}

function getModulePermission(db: Database.Database, userId: string, moduleKey: string): ModulePermission {
  try {
    const row = db.prepare('SELECT ai_settings FROM users WHERE id = ?').get(userId) as any;
    if (!row?.ai_settings) return 'confirm';
    const parsed = JSON.parse(row.ai_settings);
    const perms = parsed?.assistant?.modulePermissions;
    const v = perms?.[moduleKey];
    if (v === 'auto' || v === 'confirm' || v === 'none') return v;
    return 'confirm';
  } catch {
    return 'confirm';
  }
}

// ─── Conversation history (last N messages per chat) ──────────────
// Stored as a JSON array on telegram_links.chat_history so Claude can see prior turns
// and reason about pronoun references like "доплатил 300 000" → which client.
export interface ChatMessage { role: 'user' | 'assistant'; content: string }
const HISTORY_LIMIT = 20; // keep last 10 exchanges; older trimmed

function getHistory(db: Database.Database, chatId: number): ChatMessage[] {
  const row = db.prepare('SELECT chat_history FROM telegram_links WHERE chat_id = ?').get(chatId) as any;
  if (!row?.chat_history) return [];
  try {
    const arr = JSON.parse(row.chat_history);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function appendHistory(db: Database.Database, chatId: number, role: 'user' | 'assistant', content: string) {
  if (!content) return;
  const cur = getHistory(db, chatId);
  cur.push({ role, content });
  const trimmed = cur.slice(-HISTORY_LIMIT);
  db.prepare('UPDATE telegram_links SET chat_history = ? WHERE chat_id = ?').run(JSON.stringify(trimmed), chatId);
}

function clearHistory(db: Database.Database, chatId: number) {
  db.prepare('UPDATE telegram_links SET chat_history = NULL WHERE chat_id = ?').run(chatId);
}

// Affirmative / negative phrases used to confirm or cancel a pending action.
// Note: JavaScript `\b` is ASCII-only — it treats Cyrillic letters as non-word, so `\b`
// after «да» wouldn't fire and the match would fail. We use a non-capturing trailing
// class (space / punctuation / end-of-string) instead, which works for both alphabets.
const YES_RE = /^(да|ага|ок|окей|ok|yes|y|sure|\+|👍|сохрани|сохранить|запиши|записать|подтверждаю|верно|подтверди|растайман|раста|иә|ия|жа|ja)(?:[\s.,!?]|$)/i;
const NO_RE = /^(нет|не|cancel|отмена|стоп|неверно|жоқ|отменить|отменяю|не надо)(?:[\s.,!?]|$)/i;

// ─── Main webhook entry point ─────────────────────────────────────
export interface IncomingUpdate {
  message?: {
    chat: { id: number };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
    // Photo updates carry an array of size variants — last one is the largest.
    photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }>;
    caption?: string;
  };
}

export async function handleUpdate(db: Database.Database, update: IncomingUpdate, logActivity: (userId: string, entry: any) => void) {
  const msg = update.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const username = msg.from?.username;

  // ── Photo message? Only meaningful inside the /design wizard. Route to the
  //    wizard handler below so it can stash the data URL and advance the step.
  if (msg.photo && msg.photo.length > 0 && !msg.text) {
    const designState = getDesignState(db, chatId);
    if (!designState || (designState.step !== 'room_photo' && designState.step !== 'references')) {
      await sendMessage(chatId, 'Получил фото, но я не в режиме сбора картинок. Начните /design.');
      return;
    }
    const user = findUserByChat(db, chatId);
    if (!user) { clearDesignState(db, chatId); await sendMessage(chatId, 'Аккаунт не привязан. /link КОД'); return; }
    const largest = msg.photo[msg.photo.length - 1];
    await sendMessage(chatId, '📥 Загружаю фото…');
    const dataUrl = await downloadTgFileAsDataUrl(largest.file_id);
    if (!dataUrl) {
      await sendMessage(chatId, '⚠️ Не удалось скачать фото. Попробуйте ещё раз или /skip.');
      return;
    }
    if (designState.step === 'room_photo') {
      setDesignState(db, chatId, { ...designState, step: 'references', roomPhoto: dataUrl, referenceImages: [] });
      await tg('sendMessage', {
        chat_id: chatId, parse_mode: 'HTML',
        text: '✅ Принял фото комнаты.\n\n<b>Шаг 5/5 — фото-референсы (необязательно).</b>\nПришлите до 3 фото-вдохновений по одному. Когда закончите — нажмите «✅ Готово». Можно пропустить кнопкой /skip.',
        reply_markup: { keyboard: KB_REFS, resize_keyboard: true, one_time_keyboard: false },
      });
      return;
    }
    // step === 'references'
    const refs = [...(designState.referenceImages || []), dataUrl].slice(0, 3);
    setDesignState(db, chatId, { ...designState, referenceImages: refs });
    if (refs.length >= 3) {
      // Auto-finish — we hit the cap, no need to wait for «Готово».
      await tg('sendMessage', { chat_id: chatId, text: `✅ Принял ${refs.length} референс(а). Запускаю генерацию…`, reply_markup: { remove_keyboard: true } });
      await finalizeDesignWizard(db, chatId, user, logActivity);
      return;
    }
    await tg('sendMessage', {
      chat_id: chatId, parse_mode: 'HTML',
      text: `✅ Принял ${refs.length}/3 референс(ов). Пришлите ещё или нажмите «✅ Готово».`,
      reply_markup: { keyboard: KB_REFS, resize_keyboard: true, one_time_keyboard: false },
    });
    return;
  }

  // ── Text message? Continue with the regular handler.
  if (!msg.text) return;
  const text = msg.text.trim();

  // --- Slash commands ------------------------------------------------
  if (text.startsWith('/')) {
    const [cmdRaw, ...args] = text.split(/\s+/);
    const cmd = cmdRaw.replace(/@.*$/, '').toLowerCase(); // strip @botname suffix

    if (cmd === '/start') {
      clearHistory(db, chatId);
      clearDesignState(db, chatId);
      const paired = findUserByChat(db, chatId);
      if (paired) {
        await sendMessage(chatId,
          `Здравствуйте, <b>${paired.name}</b>!\n\n` +
          `Я — AI-ассистент Utir Soft. Просто пишите мне свободным текстом, ` +
          `например:\n\n<i>«Закрыл клиента Айгуль на пакет за 50 000 ₸, оплата завтра»</i>\n\n` +
          `Я разберусь и обновлю CRM. Перед сохранением присылаю краткое резюме.`,
        );
      } else {
        await sendMessage(chatId,
          `Здравствуйте! Я — AI-ассистент платформы <b>Utir Soft</b>.\n\n` +
          `Чтобы начать, нужно привязать ваш аккаунт. Откройте <b>Настройки → AI-ассистент</b> на платформе, ` +
          `сгенерируйте код привязки и пришлите его сюда командой:\n\n<code>/link КОД</code>`,
        );
      }
      return;
    }

    if (cmd === '/help') {
      await sendMessage(chatId,
        `<b>Что я умею:</b>\n` +
        `• Записать клиента и сделку\n` +
        `• Зафиксировать оплату\n` +
        `• Создать задачу\n\n` +
        `<b>Свободный текст</b> — просто пишите, чем подробнее тем лучше. ` +
        `Перед сохранением я присылаю резюме на подтверждение.\n\n` +
        `<b>Личные команды:</b>\n` +
        `/tasks — ваши открытые задачи\n` +
        `/revenue — ваша выручка\n` +
        `/today — что происходило в команде сегодня\n\n` +
        `<b>Управление:</b>\n` +
        `<code>/assign Имя текст задачи</code> — поставить задачу сотруднику\n` +
        `<code>/assign @username текст задачи</code> — по Telegram-нику\n\n` +
        `<b>AI Дизайн:</b>\n` +
        `<code>/design</code> — wizard, отвечаете кнопками шаг за шагом\n` +
        `<code>/design описание интерьера</code> — мгновенно (UTIR-mix)\n` +
        `<code>/design @chatgpt|@gemini|@claude …</code> — выбрать провайдер\n\n` +
        `<b>Прочее:</b> /start /link /cancel /help`,
      );
      return;
    }

    if (cmd === '/link') {
      const code = args[0];
      if (!code) {
        await sendMessage(chatId, `Используйте: <code>/link КОД</code>\nКод можно получить в Настройки → AI-ассистент на платформе.`);
        return;
      }
      const r = consumeLinkCode(db, code, chatId, username);
      if (r.ok === false) {
        const reason = r.reason;
        const errMsg = reason === 'code_unknown'  ? 'Код не найден. Возможно, он истёк или вы ошиблись в наборе.'
                     : reason === 'code_expired'  ? 'Код истёк (срок 1 час). Сгенерируйте новый в Настройках платформы.'
                     : reason === 'chat_already_linked' ? 'Этот Telegram уже привязан к другому аккаунту.'
                     :                              'Не удалось привязать. Попробуйте ещё раз.';
        await sendMessage(chatId, errMsg);
        return;
      }
      await sendMessage(chatId,
        `✅ Аккаунт привязан, <b>${r.userName}</b>.\n\n` +
        `Теперь пишите свободным текстом — я сразу разберусь и обновлю CRM.`,
      );
      logActivity(r.userId, {
        user: r.userName, actor: 'ai',
        action: 'AI-ассистент привязан к Telegram',
        target: username ? '@' + username : `chat ${chatId}`,
        type: 'invite', page: 'ai',
      });
      return;
    }

    if (cmd === '/cancel') {
      const had = getPending(db, chatId);
      const hadDesign = !!getDesignState(db, chatId);
      clearPending(db, chatId);
      clearHistory(db, chatId);
      clearDesignState(db, chatId);
      await tg('sendMessage', {
        chat_id: chatId,
        text: had || hadDesign ? 'Действие отменено. История диалога очищена.' : 'История диалога очищена.',
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    if (cmd === '/today') {
      const user = findUserByChat(db, chatId);
      if (!user) { await sendMessage(chatId, 'Сначала привяжите аккаунт: <code>/link КОД</code>'); return; }
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const rows = db.prepare(`SELECT data FROM activity_logs WHERE team_id = ? ORDER BY rowid DESC LIMIT 100`).all(user.teamId) as any[];
      const today = rows.map(r => JSON.parse(r.data)).filter(a => new Date(a.timestamp).getTime() >= startOfDay.getTime());
      if (today.length === 0) {
        await sendMessage(chatId, `Сегодня в журнале пусто. Все действия попадут в Журнал автоматически.`);
        return;
      }
      const lines = today.slice(0, 15).map(a => {
        const time = new Date(a.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const tag = a.actor === 'ai' ? '🤖' : '👤';
        return `<code>${time}</code> ${tag} ${a.action}${a.target ? ' · ' + a.target : ''}`;
      });
      await sendMessage(chatId, `<b>Сегодня:</b>\n\n${lines.join('\n')}${today.length > 15 ? `\n\n…и ещё ${today.length - 15}` : ''}`);
      return;
    }

    // /tasks — show the user's own active tasks (anything not done).
    if (cmd === '/tasks' || cmd === '/мои_задачи') {
      const user = findUserByChat(db, chatId);
      if (!user) { await sendMessage(chatId, 'Сначала привяжите аккаунт: <code>/link КОД</code>'); return; }
      const emp = findEmployeeForUser(db, user.id, user.teamId);
      if (!emp) {
        await sendMessage(chatId, 'Ваш профиль ещё не привязан к карточке сотрудника. Попросите админа добавить вас в команду.');
        return;
      }
      const rows = db.prepare('SELECT data FROM tasks WHERE team_id = ? ORDER BY rowid DESC LIMIT 200').all(user.teamId) as any[];
      const mine = rows.map(r => JSON.parse(r.data)).filter(t => t.assigneeId === emp.id && t.status !== 'done');
      if (mine.length === 0) {
        await sendMessage(chatId, `<b>${emp.name}, у вас сейчас нет открытых задач 🎉</b>`);
        return;
      }
      const STATUS_LABEL: Record<string, string> = { new: '🆕', in_progress: '⏳', review: '👀' };
      const lines = mine.slice(0, 20).map(t =>
        `${STATUS_LABEL[t.status] || '•'} <b>${t.title}</b>${t.dueDate ? ` · 📅 ${t.dueDate}` : ''}${t.category ? ` · <i>${t.category}</i>` : ''}`,
      );
      await sendMessage(chatId,
        `<b>Ваши задачи (${mine.length}):</b>\n\n${lines.join('\n')}${mine.length > 20 ? `\n\n…и ещё ${mine.length - 20}` : ''}`,
      );
      return;
    }

    // /revenue — sum of paidAmount on the user's completed deals.
    if (cmd === '/revenue' || cmd === '/моя_выручка') {
      const user = findUserByChat(db, chatId);
      if (!user) { await sendMessage(chatId, 'Сначала привяжите аккаунт: <code>/link КОД</code>'); return; }
      const emp = findEmployeeForUser(db, user.id, user.teamId);
      if (!emp) { await sendMessage(chatId, 'Ваш профиль не привязан к карточке сотрудника.'); return; }
      const rows = db.prepare('SELECT data FROM deals WHERE team_id = ?').all(user.teamId) as any[];
      const deals = rows.map(r => JSON.parse(r.data));
      const nameLow = (emp.name || '').toLowerCase();
      const firstLow = nameLow.split(/\s+/)[0] || '';
      // Same attribution rules as the Аналитика → Команда tab.
      const mine = deals.filter(d => {
        if (d.ownerId) return d.ownerId === emp.id;
        const test = (v: string | undefined) => v && (v.toLowerCase().includes(nameLow) || (firstLow.length > 2 && v.toLowerCase().includes(firstLow)));
        return test(d.measurer) || test(d.designer) || test(d.foreman) || test(d.architect);
      });
      const completed = mine.filter(d => d.status === 'completed');
      const totalRev = completed.reduce((s, d) => s + (d.paidAmount || 0), 0);
      // Month-to-date.
      const firstOfMonth = new Date(); firstOfMonth.setDate(1); firstOfMonth.setHours(0, 0, 0, 0);
      const monthRev = completed
        .filter(d => new Date(d.createdAt || d.date).getTime() >= firstOfMonth.getTime())
        .reduce((s, d) => s + (d.paidAmount || 0), 0);
      const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';
      await sendMessage(chatId,
        `<b>Ваша выручка, ${emp.name}:</b>\n\n` +
        `За всё время: <b>${fmt(totalRev)}</b>  (${completed.length} сделок)\n` +
        `В этом месяце: <b>${fmt(monthRev)}</b>\n` +
        `Сейчас в работе: <b>${mine.length - completed.length}</b> сделок`,
      );
      return;
    }

    // /assign — create a task for a teammate.
    //   /assign Имя текст задачи
    //   /assign @username текст задачи  (matches paired Telegram username)
    // /design — generate an interior design image via the AI providers.
    // Defaults to UTIR-mix (runs every configured provider in parallel).
    //   /design <описание интерьера>
    //   /design @gemini <описание>   ← опционально выбрать провайдер
    // /design — start the wizard when called bare, or instant-generate when
    // the user supplies a description in one go.
    //   /design                                   → wizard (рекомендуем)
    //   /design <описание интерьера>              → мгновенно через UTIR-mix
    //   /design @gemini|@chatgpt|@claude <описание>  → выбрать провайдер
    if (cmd === '/design' || cmd === '/дизайн') {
      const user = findUserByChat(db, chatId);
      if (!user) { await sendMessage(chatId, 'Сначала привяжите аккаунт: <code>/link КОД</code>'); return; }
      if (args.length === 0) {
        // Start wizard: clear any old state, set step=room, send keyboard.
        setDesignState(db, chatId, { step: 'room' });
        await tg('sendMessage', {
          chat_id: chatId,
          parse_mode: 'HTML',
          text: '🎨 <b>Соберём AI-дизайн вместе.</b>\n\n<b>Шаг 1/5 — какая комната?</b>\nНа любом шаге можно нажать <code>/skip</code> чтобы пропустить, или <code>/cancel</code> чтобы прервать.',
          reply_markup: { keyboard: KB_ROOMS, resize_keyboard: true, one_time_keyboard: true },
        });
        return;
      }
      // Pick provider via leading @flag, default utir-mix.
      let providerId: 'chatgpt' | 'gemini' | 'claude' | 'utir-mix' = 'utir-mix';
      let promptArgs = args;
      if (args[0].startsWith('@')) {
        const tag = args[0].slice(1).toLowerCase();
        if (tag === 'chatgpt' || tag === 'gemini' || tag === 'claude' || tag === 'utir' || tag === 'utir-mix') {
          providerId = (tag === 'utir' ? 'utir-mix' : tag) as typeof providerId;
          promptArgs = args.slice(1);
        }
      }
      const prompt = promptArgs.join(' ');
      if (!prompt.trim()) { await sendMessage(chatId, 'Пустой запрос. Используйте /design без аргументов для wizard.'); return; }
      await runDesignGeneration(db, chatId, user, providerId, prompt, logActivity);
      return;
    }

    if (cmd === '/assign' || cmd === '/назначь' || cmd === '/назначить') {
      const user = findUserByChat(db, chatId);
      if (!user) { await sendMessage(chatId, 'Сначала привяжите аккаунт: <code>/link КОД</code>'); return; }
      if (args.length < 2) {
        await sendMessage(chatId,
          `<b>Использование:</b>\n<code>/assign Имя текст задачи</code>\n<code>/assign @username текст задачи</code>\n\n` +
          `Пример: <code>/assign Асхат позвонить клиенту Айдан</code>`,
        );
        return;
      }
      const target = args[0];
      const taskTitle = args.slice(1).join(' ');
      // Resolve the assignee — either by Telegram @username or by name substring.
      let assigneeRow: any = null;
      if (target.startsWith('@')) {
        const uname = target.slice(1).toLowerCase();
        const link = db.prepare(`SELECT u.id, u.email FROM telegram_links tl JOIN users u ON u.id = tl.user_id WHERE LOWER(tl.username) = ? AND u.team_id = ?`).get(uname, user.teamId) as any;
        if (link) {
          assigneeRow = db.prepare('SELECT id, data FROM employees WHERE team_id = ? AND LOWER(json_extract(data, \'$.email\')) = ?').get(user.teamId, (link.email || '').toLowerCase()) as any;
        }
      } else {
        // Match employees.data.name (case-insensitive substring).
        const allEmps = db.prepare('SELECT id, data FROM employees WHERE team_id = ?').all(user.teamId) as any[];
        const tLow = target.toLowerCase();
        assigneeRow = allEmps.find(r => {
          try { return (JSON.parse(r.data).name || '').toLowerCase().includes(tLow); } catch { return false; }
        });
      }
      if (!assigneeRow) {
        await sendMessage(chatId, `Не нашёл сотрудника <b>${target}</b> в команде.`);
        return;
      }
      // Create the task (and notify the assignee — same as the platform POST does).
      const taskId = newId('t');
      const due = new Date().toISOString().slice(0, 10);
      const data = {
        id: taskId, title: taskTitle, description: '', status: 'new',
        priority: 'medium', assigneeId: assigneeRow.id,
        createdAt: new Date().toISOString(),
        dueDate: due, category: 'Прочее', subtasks: [],
      };
      db.prepare('INSERT INTO tasks (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(taskId, user.id, user.teamId, JSON.stringify(data));
      logActivity(user.id, {
        user: user.name, actor: 'human', source: 'telegram',
        action: 'Назначил задачу через Telegram',
        target: `${JSON.parse(assigneeRow.data).name}: ${taskTitle}`,
        type: 'create', page: 'tasks',
      });
      // Push to the assignee's Telegram if paired.
      try {
        const assigneeData = JSON.parse(assigneeRow.data);
        const aEmail = (assigneeData.email || '').toLowerCase();
        if (aEmail) {
          const aUser = db.prepare('SELECT id FROM users WHERE email = ? AND team_id = ?').get(aEmail, user.teamId) as any;
          if (aUser) {
            const aLink = db.prepare('SELECT chat_id FROM telegram_links WHERE user_id = ? AND chat_id IS NOT NULL').get(aUser.id) as any;
            if (aLink?.chat_id) {
              await sendMessage(aLink.chat_id, `<b>📝 На вас назначена задача</b>\n${taskTitle}\n📅 Срок: ${due}\nот ${user.name}`);
            }
          }
        }
      } catch (e) { console.warn('[/assign tg notify]', e); }
      await sendMessage(chatId, `✅ Задача поставлена сотруднику <b>${JSON.parse(assigneeRow.data).name}</b>:\n${taskTitle}`);
      return;
    }

    await sendMessage(chatId, `Не знаю такой команды. Доступны: /start /help /link /today /tasks /revenue /assign /design /cancel`);
    return;
  }

  // --- /design wizard active? Step through it. ---------------------
  // Plain text (or reply-keyboard taps) routed here instead of Claude so the
  // user can answer "кухня" → "сканди" → ... without typing /design again.
  const designState = getDesignState(db, chatId);
  if (designState) {
    const user = findUserByChat(db, chatId);
    if (!user) { clearDesignState(db, chatId); await sendMessage(chatId, 'Аккаунт не привязан. /link КОД'); return; }
    const answer = cleanLabel(text);
    if (answer === 'cancel' || answer === '/cancel' || text === '/cancel') {
      clearDesignState(db, chatId);
      await tg('sendMessage', { chat_id: chatId, text: 'Отменил.', reply_markup: { remove_keyboard: true } });
      return;
    }
    // STEP 1 → room
    if (designState.step === 'room') {
      let room: string | undefined;
      for (const key of Object.keys(ROOM_MAP)) {
        if (answer.includes(key)) { room = key; break; }
      }
      if (!room && answer !== 'skip' && answer !== '/skip') {
        await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML',
          text: 'Не понял. Выберите кнопкой:',
          reply_markup: { keyboard: KB_ROOMS, resize_keyboard: true, one_time_keyboard: true },
        });
        return;
      }
      setDesignState(db, chatId, { ...designState, step: 'style', room });
      await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML',
        text: '<b>Шаг 2/5 — какой стиль?</b>',
        reply_markup: { keyboard: KB_STYLES, resize_keyboard: true, one_time_keyboard: true },
      });
      return;
    }
    // STEP 2 → style
    if (designState.step === 'style') {
      let style: string | undefined;
      for (const key of Object.keys(STYLE_MAP)) {
        if (answer.includes(key)) { style = key; break; }
      }
      if (!style && answer !== 'skip' && answer !== '/skip') {
        await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML',
          text: 'Не понял. Выберите кнопкой:',
          reply_markup: { keyboard: KB_STYLES, resize_keyboard: true, one_time_keyboard: true },
        });
        return;
      }
      setDesignState(db, chatId, { ...designState, step: 'mood', style });
      await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML',
        text: '<b>Шаг 3/5 — атмосфера / детали (по желанию).</b>\nТекстом любое: «бежевые шторы, мраморный пол, окно во всю стену». Или нажмите кнопку, либо <code>/skip</code>:',
        reply_markup: { keyboard: KB_MOOD, resize_keyboard: true, one_time_keyboard: true },
      });
      return;
    }
    // STEP 3 → mood / details → ask for room photo (optional)
    if (designState.step === 'mood') {
      let extra = '';
      if (answer && answer !== 'skip готово' && answer !== '/skip готово' && answer !== '/skip' && answer !== 'skip') {
        // Map labels to phrases; if user typed free text, use it raw.
        const moodPhrase: Record<string, string> = {
          'утренний свет': 'мягкий утренний свет из окна',
          'уютно':         'тёплая уютная атмосфера',
          'премиум':       'премиальные материалы, латунь и натуральный камень',
          'просторно':     'высокие потолки, ощущение простора',
          'с растениями':  'много комнатных растений',
          'вечерние лампы':'вечернее тёплое освещение от ламп',
        };
        const matched = Object.keys(moodPhrase).find(k => answer.includes(k));
        extra = matched ? moodPhrase[matched] : text.trim();
      }
      // Advance to optional room-photo step. Don't generate yet.
      setDesignState(db, chatId, { ...designState, step: 'room_photo', extra: extra || undefined });
      await tg('sendMessage', {
        chat_id: chatId, parse_mode: 'HTML',
        text: '<b>Шаг 4/5 — фото комнаты (необязательно).</b>\nПришлите фото текущего помещения, чтобы AI перерисовал именно его. Если фото нет — нажмите <code>/skip</code>.',
        reply_markup: { keyboard: KB_SKIP_PHOTO, resize_keyboard: true, one_time_keyboard: false },
      });
      return;
    }
    // STEP 4 → room photo (skip-only via text; photo comes through the
    // photo-message branch at the top of handleUpdate).
    if (designState.step === 'room_photo') {
      if (answer === 'skip' || answer === '/skip' || answer.startsWith('skip')) {
        setDesignState(db, chatId, { ...designState, step: 'references', referenceImages: [] });
        await tg('sendMessage', {
          chat_id: chatId, parse_mode: 'HTML',
          text: '<b>Шаг 5/5 — фото-референсы (необязательно).</b>\nПришлите до 3 фото для вдохновения. Когда закончите — нажмите «✅ Готово». Или /skip чтобы пропустить.',
          reply_markup: { keyboard: KB_REFS, resize_keyboard: true, one_time_keyboard: false },
        });
        return;
      }
      // Any other text — gently remind that we need a photo or /skip.
      await tg('sendMessage', {
        chat_id: chatId, parse_mode: 'HTML',
        text: '📷 Пришлите фото комнаты (через 📎 → Фото) или нажмите <code>/skip</code>.',
        reply_markup: { keyboard: KB_SKIP_PHOTO, resize_keyboard: true, one_time_keyboard: false },
      });
      return;
    }
    // STEP 5 → references — accept «Готово» / /skip, otherwise wait for photos.
    if (designState.step === 'references') {
      if (answer === 'skip' || answer === '/skip' || answer.startsWith('skip') ||
          answer === 'готово' || answer.includes('готово')) {
        await finalizeDesignWizard(db, chatId, user, logActivity);
        return;
      }
      await tg('sendMessage', {
        chat_id: chatId, parse_mode: 'HTML',
        text: `📷 Пришлите ещё фото-референс (есть ${(designState.referenceImages || []).length}/3) или нажмите «✅ Готово» / <code>/skip</code>.`,
        reply_markup: { keyboard: KB_REFS, resize_keyboard: true, one_time_keyboard: false },
      });
      return;
    }
  }

  // --- Confirmation of pending tool? -------------------------------
  const pendingAction = getPending(db, chatId);
  if (pendingAction) {
    if (YES_RE.test(text)) {
      const user = findUserByChat(db, chatId);
      if (!user) { clearPending(db, chatId); await sendMessage(chatId, 'Аккаунт не привязан. /link КОД'); return; }
      appendHistory(db, chatId, 'user', text);
      try {
        const { default: tools } = await import('./aiTools.js');
        // Re-check the role gate in case the admin downgraded the user
        // between the proposal and this confirmation (defence in depth).
        const m = tools.getToolModule(pendingAction.toolName) || '';
        const isW = !tools.isReadOnly(pendingAction.toolName);
        const g = canRunTool(db, user.teamId, user.teamRole, m, isW);
        if (!g.ok) {
          const refusal = `🚫 Действие отменено: у вашей роли (<b>${user.teamRole}</b>) нет прав на модуль <b>${g.matrixKey}</b>.`;
          await sendMessage(chatId, refusal);
          appendHistory(db, chatId, 'assistant', stripHtml(refusal));
          clearPending(db, chatId);
          logHandoff(logActivity, user.id, user.name, 'role gate denied on confirm',
            `${g.matrixKey}/${pendingAction.toolName} (role=${user.teamRole}, level=${g.level})`);
          return;
        }
        const result = await tools.execute(db, user.id, user.teamId, user.name, pendingAction.toolName, pendingAction.toolInput, logActivity);
        const reply = `✅ Готово.\n\n${result}`;
        await sendMessage(chatId, reply);
        appendHistory(db, chatId, 'assistant', stripHtml(reply));
      } catch (e: any) {
        const errReply = `❌ Не удалось сохранить: ${e.message || e}`;
        await sendMessage(chatId, errReply);
        appendHistory(db, chatId, 'assistant', errReply);
        logHandoff(logActivity, user.id, user.name, 'tool execute failed',
          `${pendingAction.toolName}: ${e.message || e}`);
      } finally {
        clearPending(db, chatId);
      }
      return;
    }
    if (NO_RE.test(text)) {
      const user = findUserByChat(db, chatId);
      clearPending(db, chatId);
      appendHistory(db, chatId, 'user', text);
      const reply = `Отменил. Можете написать новый запрос.`;
      await sendMessage(chatId, reply);
      appendHistory(db, chatId, 'assistant', reply);
      if (user) {
        logHandoff(logActivity, user.id, user.name, 'rejected by admin',
          `${pendingAction.toolName}: ${stripHtml(pendingAction.summary).slice(0, 200)}`);
      }
      return;
    }
    // Anything else → treat as a new request (correction or fresh topic). Don't clearPending
    // here — Telegram occasionally redelivers the same message twice, which used to wipe
    // the pending slot before the user's "Да" arrived. Let it expire naturally via TTL or
    // /cancel. setPending below will overwrite it if Claude proposes another tool.
  }

  // --- Free-form text → Claude agent --------------------------------
  const user = findUserByChat(db, chatId);
  if (!user) {
    await sendMessage(chatId,
      `Сначала привяжите аккаунт.\n\n` +
      `Откройте <b>Настройки → AI-ассистент</b> на платформе, сгенерируйте код, и пришлите его сюда: <code>/link КОД</code>`,
    );
    return;
  }

  // Pull prior conversation for context (last 20 messages). Record this user turn first
  // so that even if Claude crashes the message is still in history.
  const history = getHistory(db, chatId);
  appendHistory(db, chatId, 'user', text);

  const ctx: AgentTurnContext = { db, userId: user.id, userName: user.name, userText: text, history };
  let agentResult;
  try { agentResult = await runAgent(ctx); }
  catch (e: any) {
    console.error('[telegram] agent failed', e);
    const errReply = `Не получилось обработать запрос. Попробуйте переформулировать.`;
    await sendMessage(chatId, errReply + `\n\n<code>${(e.message || e).toString().slice(0, 200)}</code>`);
    appendHistory(db, chatId, 'assistant', errReply);
    logHandoff(logActivity, user.id, user.name, 'Claude API failed',
      `User: "${text.slice(0, 120)}" — ${e.message || e}`);
    return;
  }

  if (agentResult.kind === 'reply') {
    await sendMessage(chatId, agentResult.text);
    appendHistory(db, chatId, 'assistant', agentResult.text);
    return;
  }

  // ─── ROLE GATE (team matrix) — applies BEFORE per-user auto/confirm setting.
  // Admin always passes; manager/employee/custom limited by Settings → Команда.
  // Wrong role → polite refusal + handoff log so admin sees what employee tried.
  const { default: tools } = await import('./aiTools.js');
  const toolModule = tools.getToolModule(agentResult.toolName);
  if (!toolModule) {
    const errReply = `Неизвестное действие: <code>${agentResult.toolName}</code>`;
    await sendMessage(chatId, errReply);
    appendHistory(db, chatId, 'assistant', stripHtml(errReply));
    logHandoff(logActivity, user.id, user.name, 'unknown tool', agentResult.toolName);
    return;
  }
  const isWriteTool = !tools.isReadOnly(agentResult.toolName);
  const roleGate = canRunTool(db, user.teamId, user.teamRole, toolModule, isWriteTool);
  if (!roleGate.ok) {
    const reply = roleGate.level === 'none'
      ? `🚫 У вашей роли (<b>${user.teamRole}</b>) нет доступа к модулю <b>${roleGate.matrixKey}</b>.\nПопросите администратора открыть права в Платформа → Настройки → Команда.`
      : `🔒 Модуль <b>${roleGate.matrixKey}</b> доступен вам только для чтения (роль: <b>${user.teamRole}</b>).\nИзменения доступны менеджеру или администратору.`;
    await sendMessage(chatId, reply);
    appendHistory(db, chatId, 'assistant', stripHtml(reply));
    logHandoff(logActivity, user.id, user.name, 'role gate denied',
      `${roleGate.matrixKey}/${agentResult.toolName} (role=${user.teamRole}, level=${roleGate.level}): "${text.slice(0, 120)}"`);
    return;
  }

  // Read-only tools (find_client and similar) run immediately and reply with the result.
  if (tools.isReadOnly(agentResult.toolName)) {
    try {
      const result = await tools.execute(db, user.id, user.teamId, user.name, agentResult.toolName, agentResult.toolInput, logActivity);
      await sendMessage(chatId, result);
      appendHistory(db, chatId, 'assistant', stripHtml(result));
    } catch (e: any) {
      const errReply = `❌ Ошибка: ${e.message || e}`;
      await sendMessage(chatId, errReply);
      appendHistory(db, chatId, 'assistant', errReply);
      logHandoff(logActivity, user.id, user.name, 'read-only tool failed',
        `${agentResult.toolName}: ${e.message || e}`);
    }
    return;
  }

  // Write tools — apply the per-user auto/confirm/none preference (kept as a
  // *finer* control on top of the role gate above).
  const permission = getModulePermission(db, user.id, toolModule);
  const moduleName = HUMAN_MODULE_NAMES[toolModule] || toolModule;

  if (permission === 'none') {
    const reply = `🚫 Модуль <b>${moduleName}</b> отключён для AI-ассистента в настройках.\n\n` +
      `Чтобы включить — Платформа → Настройки → AI-ассистент → разрешения по модулям.`;
    await sendMessage(chatId, reply);
    appendHistory(db, chatId, 'assistant', stripHtml(reply));
    logHandoff(logActivity, user.id, user.name, 'module disabled',
      `${moduleName} (${agentResult.toolName}): user said "${text.slice(0, 120)}"`);
    return;
  }

  if (permission === 'auto') {
    // No confirmation step — execute immediately, send the brief summary as a heads-up.
    try {
      const result = await tools.execute(db, user.id, user.teamId, user.name, agentResult.toolName, agentResult.toolInput, logActivity);
      const reply = `⚡ Автоматически (${moduleName}):\n${agentResult.summary}\n\n${result}`;
      await sendMessage(chatId, reply);
      appendHistory(db, chatId, 'assistant', stripHtml(reply));
    } catch (e: any) {
      const errReply = `❌ Ошибка: ${e.message || e}`;
      await sendMessage(chatId, errReply);
      appendHistory(db, chatId, 'assistant', errReply);
      logHandoff(logActivity, user.id, user.name, 'auto tool execute failed',
        `${agentResult.toolName}: ${e.message || e}`);
    }
    return;
  }

  // permission === 'confirm' (default) — current behaviour: store as pending, ask "Да".
  setPending(db, chatId, { toolName: agentResult.toolName, toolInput: agentResult.toolInput, summary: agentResult.summary });
  const fullSummary = agentResult.summary + `\n\n<i>Подтвердите — «Да» или «Нет».</i>`;
  await sendMessage(chatId, fullSummary);
  appendHistory(db, chatId, 'assistant', stripHtml(agentResult.summary));
}

// Strip Telegram HTML tags so history entries stay clean text for Claude's context window.
function stripHtml(s: string): string {
  return s.replace(/<\/?[a-z][^>]*>/gi, '').replace(/\s+\n/g, '\n').trim();
}
