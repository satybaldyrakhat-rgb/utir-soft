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
import { transcribeAudio, isWhisperReady } from './whisper.js';

const TG_API = 'https://api.telegram.org';
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
// Bot username for building deep-link invites (t.me/<username>?start=...).
// Falls back to the known handle; override via env if the bot is renamed.
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'utirsoftbot';

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

// Download a Telegram file by file_id and return the raw buffer + the
// extension-based MIME guess. Used by voice-message transcription where
// Whisper wants a real binary upload, not a data URL.
async function downloadTgFileAsBuffer(fileId: string): Promise<{ buf: Buffer; mime: string } | null> {
  if (!TOKEN) return null;
  try {
    const info = await tg<{ file_path: string; file_size?: number }>('getFile', { file_id: fileId });
    if (!info?.file_path) return null;
    if (info.file_size && info.file_size > 25 * 1024 * 1024) return null;
    const res = await fetch(`${TG_API}/file/bot${TOKEN}/${info.file_path}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = info.file_path.toLowerCase().split('.').pop() || '';
    const mime =
      ext === 'oga' || ext === 'ogg' ? 'audio/ogg' :
      ext === 'mp3' ? 'audio/mpeg' :
      ext === 'm4a' ? 'audio/mp4' :
      ext === 'wav' ? 'audio/wav' :
      ext === 'webm' ? 'audio/webm' :
      'application/octet-stream';
    return { buf, mime };
  } catch (e) {
    console.warn('[downloadTgFileAsBuffer]', e);
    return null;
  }
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
        { command: 'measures',description: '📐 Мои замеры' },
        { command: 'orders',  description: '🪚 Мои заказы (этапы цеха)' },
        { command: 'installs',description: '🔧 Мои монтажи' },
        { command: 'design',  description: '🎨 AI Дизайн интерьера (мастер)' },
        { command: 'summary', description: '☀️ Утренняя сводка' },
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

// ─── Team Telegram invite (Этап 1 — onboard field workers by link) ──
// A reusable, team-level code shared once with masters / measurers /
// installers. The deep link opens the bot, which collects name + role
// and auto-creates the worker's account so they never touch the web.

function newInviteCode() {
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function teamInviteLink(code: string): string {
  return `https://t.me/${BOT_USERNAME}?start=join_${code}`;
}

// ─── Public order-tracking link (Trackpage) ────────────────────────
// Frontend base URL where the SPA serves the #/track/<code> route.
const APP_URL = (process.env.PUBLIC_APP_URL || 'https://utir-soft.vercel.app').replace(/\/+$/, '');
export function trackLink(code: string): string { return `${APP_URL}/#/track/${code}`; }
// Get the deal's existing public track code or mint a new one. Used by
// the web "Ссылка для клиента" button and the bot completion messages.
export function ensureTrackCode(db: Database.Database, teamId: string, dealId: string): string {
  const existing = db.prepare('SELECT code FROM track_links WHERE deal_id = ? AND team_id = ?').get(dealId, teamId) as any;
  if (existing?.code) return existing.code as string;
  // 7-char unambiguous code (no 0/O/1/I) — short enough to paste in chat.
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 7; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  db.prepare('INSERT INTO track_links (code, deal_id, team_id) VALUES (?, ?, ?)').run(code, dealId, teamId);
  return code;
}

export function getOrCreateTeamInviteCode(db: Database.Database, teamId: string): string {
  const row = db.prepare('SELECT tg_invite_code FROM team_settings WHERE team_id = ?').get(teamId) as any;
  if (row?.tg_invite_code) return row.tg_invite_code as string;
  const code = newInviteCode();
  db.prepare(`
    INSERT INTO team_settings (team_id, tg_invite_code, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET tg_invite_code = excluded.tg_invite_code, updated_at = excluded.updated_at
  `).run(teamId, code);
  return code;
}

export function rotateTeamInviteCode(db: Database.Database, teamId: string): string {
  const code = newInviteCode();
  db.prepare(`
    INSERT INTO team_settings (team_id, tg_invite_code, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET tg_invite_code = excluded.tg_invite_code, updated_at = excluded.updated_at
  `).run(teamId, code);
  return code;
}

function findTeamByInviteCode(db: Database.Database, code: string): { teamId: string } | null {
  const row = db.prepare('SELECT team_id FROM team_settings WHERE tg_invite_code = ?').get(code.toUpperCase()) as any;
  return row ? { teamId: row.team_id } : null;
}

// ─── Worker onboarding state machine (chat-level, pre-account) ──────
// Stored in its own table because the chat has no user_id yet — the
// account is created only after name + role are collected.
type OnboardingStep = 'name' | 'role';
interface OnboardingState { teamId: string; step: OnboardingStep; draftName?: string; username?: string }

function getOnboarding(db: Database.Database, chatId: number): OnboardingState | null {
  const row = db.prepare('SELECT team_id, step, draft_name, username FROM telegram_onboarding WHERE chat_id = ?').get(chatId) as any;
  if (!row) return null;
  return { teamId: row.team_id, step: row.step, draftName: row.draft_name || undefined, username: row.username || undefined };
}
function setOnboarding(db: Database.Database, chatId: number, s: OnboardingState) {
  db.prepare(`
    INSERT INTO telegram_onboarding (chat_id, team_id, step, draft_name, username, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(chat_id) DO UPDATE SET team_id = excluded.team_id, step = excluded.step, draft_name = excluded.draft_name, username = excluded.username
  `).run(chatId, s.teamId, s.step, s.draftName || null, s.username || null);
}
function clearOnboarding(db: Database.Database, chatId: number) {
  db.prepare('DELETE FROM telegram_onboarding WHERE chat_id = ?').run(chatId);
}

// The four worker roles we offer at onboarding. `botRole` is stored on
// the employee record and drives the role-specific menu (Этап 2-4).
// `teamRole` maps into the existing permission system: workers are
// 'employee' (limited), the foreman/manager is 'manager'.
interface BotRoleDef { botRole: string; teamRole: string; label: string; emoji: string; department: string }
const BOT_ROLES: BotRoleDef[] = [
  { botRole: 'measurer',   teamRole: 'employee', label: 'Замерщик',    emoji: '📐', department: 'Замеры' },
  { botRole: 'production', teamRole: 'employee', label: 'Мастер цеха', emoji: '🪚', department: 'Производство' },
  { botRole: 'installer',  teamRole: 'employee', label: 'Монтажник',   emoji: '🔧', department: 'Монтаж' },
  { botRole: 'manager',    teamRole: 'manager',  label: 'Менеджер',    emoji: '👔', department: 'Продажи' },
];
function findBotRoleByLabel(text: string): BotRoleDef | null {
  const t = text.replace(/^[^a-zа-яё]+/i, '').trim().toLowerCase();
  return BOT_ROLES.find(r => r.label.toLowerCase() === t) || null;
}
// Reply keyboard shown during the role step.
const KB_ROLES = [
  ['📐 Замерщик', '🪚 Мастер цеха'],
  ['🔧 Монтажник', '👔 Менеджер'],
];

// Role-specific persistent menu (Этап 2-4 fill these in with real
// handlers). Foundation here: every worker gets a bottom keyboard so
// they tap, never type commands. Returned as a Telegram reply_markup.
export function roleMenuKeyboard(botRole: string): { keyboard: string[][]; resize_keyboard: boolean; is_persistent: boolean } {
  const menus: Record<string, string[][]> = {
    measurer:   [['📋 Мои замеры', '🎤 Записать замер'], ['📷 Фото объекта', '💰 Моя выручка']],
    production: [['📋 Мои заказы', '📷 Фото-отчёт'], ['💰 Зарплата', '✅ Мои задачи']],
    installer:  [['📋 Мои монтажи', '📷 Фото работы'], ['💰 Зарплата', '✅ Мои задачи']],
    manager:    [['☀️ Сводка', '📊 Сегодня'], ['✅ Задачи', '💰 Выручка'], ['🎨 AI Дизайн']],
  };
  return {
    keyboard: menus[botRole] || menus.manager,
    resize_keyboard: true,
    is_persistent: true,
  };
}

// Create a Telegram-native worker account: a synthetic users row (no
// web password — they log in only via the bot), an employees row with
// the picked botRole, and the chat↔user link. Returns the new ids.
function createWorkerAccount(
  db: Database.Database,
  teamId: string,
  name: string,
  roleDef: BotRoleDef,
  chatId: number,
  username?: string,
): { userId: string; employeeId: string } {
  const userId = newId('u_');
  const employeeId = newId('e_');
  // Synthetic email + unusable password hash — the worker never logs in
  // to the web, so these just satisfy NOT NULL constraints.
  const email = `tg${chatId}@telegram.local`;
  const pwHash = 'tg-only-' + Math.random().toString(36).slice(2);
  const initial = (name.charAt(0) || '?').toUpperCase();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, team_id, team_role, email_verified, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
    `).run(userId, email, pwHash, name, teamId, roleDef.teamRole);

    const empData = {
      id: employeeId,
      name,
      email,
      phone: '',
      role: roleDef.teamRole,
      botRole: roleDef.botRole,          // ← drives the bot menu
      department: roleDef.department,
      status: 'active',
      salary: 0,
      joinDate: new Date().toISOString().slice(0, 10),
      lastActive: new Date().toISOString(),
      avatar: initial,
      source: 'telegram',                // ← onboarded via bot, not web
      permissions: { sales: true, finance: false, warehouse: roleDef.botRole !== 'manager', chats: true, analytics: roleDef.teamRole === 'manager', settings: false },
      performance: { ordersCompleted: 0, rating: 0, efficiency: 0 },
    };
    db.prepare('INSERT INTO employees (id, user_id, team_id, data) VALUES (?, ?, ?, ?)')
      .run(employeeId, userId, teamId, JSON.stringify(empData));

    // Link the chat. Use INSERT OR REPLACE so a re-join overwrites cleanly.
    db.prepare(`
      INSERT INTO telegram_links (user_id, chat_id, linked_at, username)
      VALUES (?, ?, datetime('now'), ?)
      ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id, linked_at = excluded.linked_at, username = excluded.username
    `).run(userId, chatId, username || null);
  });
  tx();
  return { userId, employeeId };
}

// ─── Inline-keyboard (callback) helpers (Этап 2) ───────────────────
// Field workers tap inline buttons under each measurement / order card
// instead of typing. answerCallbackQuery dismisses the spinner; the
// edit helper strips the buttons after an action so a card can't be
// double-tapped.
async function answerCallback(callbackId: string, text?: string) {
  try { await tg('answerCallbackQuery', { callback_query_id: callbackId, text: text || undefined }); }
  catch { /* best-effort — Telegram tolerates a missing answer */ }
}
async function editReplyMarkupClear(chatId: number, messageId: number) {
  try { await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }); }
  catch { /* ignore — message may be too old to edit */ }
}
// Re-render a card in place after a stage tap (text + keyboard).
async function editMessageCard(chatId: number, messageId: number, text: string, inline_keyboard: any[]) {
  try { await tg('editMessageText', { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', text, reply_markup: { inline_keyboard } }); }
  catch { /* ignore — message unchanged or too old */ }
}

// 2GIS is the default map app in KZ — build a search link by address.
function routeUrl(address: string): string {
  return `https://2gis.kz/search/${encodeURIComponent(address)}`;
}

// ─── Pending photo state (worker sent a photo outside /design) ──────
interface PendingPhoto { dataUrl: string }
function setPendingPhoto(db: Database.Database, chatId: number, dataUrl: string) {
  db.prepare('UPDATE telegram_links SET pending_photo = ? WHERE chat_id = ?').run(JSON.stringify({ dataUrl }), chatId);
}
function getPendingPhoto(db: Database.Database, chatId: number): PendingPhoto | null {
  const row = db.prepare('SELECT pending_photo FROM telegram_links WHERE chat_id = ?').get(chatId) as any;
  if (!row?.pending_photo) return null;
  try { return JSON.parse(row.pending_photo) as PendingPhoto; } catch { return null; }
}
function clearPendingPhoto(db: Database.Database, chatId: number) {
  db.prepare('UPDATE telegram_links SET pending_photo = NULL WHERE chat_id = ?').run(chatId);
}

// ─── Deal helpers for worker flows ─────────────────────────────────
interface DealRow { rowId: number; id: string; data: any }
function loadDeals(db: Database.Database, teamId: string): DealRow[] {
  const rows = db.prepare('SELECT rowid, id, data FROM deals WHERE team_id = ? ORDER BY rowid DESC').all(teamId) as any[];
  return rows.map(r => { try { return { rowId: r.rowid, id: r.id, data: JSON.parse(r.data) }; } catch { return null; } }).filter(Boolean) as DealRow[];
}
function findDeal(db: Database.Database, teamId: string, dealId: string): DealRow | null {
  const r = db.prepare('SELECT rowid, id, data FROM deals WHERE team_id = ? AND id = ?').get(teamId, dealId) as any;
  if (!r) return null;
  try { return { rowId: r.rowid, id: r.id, data: JSON.parse(r.data) }; } catch { return null; }
}
function saveDeal(db: Database.Database, dealId: string, data: any) {
  db.prepare('UPDATE deals SET data = ? WHERE id = ?').run(JSON.stringify(data), dealId);
}
// ─── Production stages per niche (Этап 3) ──────────────────────────
// Mirror of src/app/utils/niches.ts productionStages (RU labels + ids).
// The bot must write the SAME stage ids the web expects so the Склад →
// Производство board renders the chain the master is ticking off.
const NICHE_STAGES: Record<string, Array<{ id: string; ru: string }>> = {
  furniture: [
    { id: 'cutting', ru: 'Распил' }, { id: 'edging', ru: 'Кромка' }, { id: 'assembly', ru: 'Сборка' },
    { id: 'packaging', ru: 'Упаковка' }, { id: 'delivery', ru: 'Доставка' },
  ],
  windows: [
    { id: 'cutting', ru: 'Резка профиля' }, { id: 'welding', ru: 'Сварка' }, { id: 'glazing', ru: 'Остекление' },
    { id: 'delivery', ru: 'Доставка' }, { id: 'installation', ru: 'Монтаж' },
  ],
  ceilings: [
    { id: 'cutting', ru: 'Раскрой полотна' }, { id: 'preparation', ru: 'Подготовка' }, { id: 'installation', ru: 'Монтаж' },
    { id: 'finishing', ru: 'Установка светильников' }, { id: 'handover', ru: 'Сдача объекта' },
  ],
  blinds: [
    { id: 'cutting', ru: 'Раскрой' }, { id: 'sewing', ru: 'Пошив' }, { id: 'assembly', ru: 'Сборка' },
    { id: 'delivery', ru: 'Доставка' }, { id: 'installation', ru: 'Монтаж' },
  ],
  doors: [
    { id: 'order', ru: 'Заказ у поставщика' }, { id: 'delivery', ru: 'Доставка' }, { id: 'preparation', ru: 'Подготовка проёма' },
    { id: 'installation', ru: 'Монтаж' }, { id: 'finishing', ru: 'Установка фурнитуры' },
  ],
  stairs: [
    { id: 'design', ru: 'Проектирование' }, { id: 'cutting', ru: 'Заготовка' }, { id: 'production', ru: 'Производство' },
    { id: 'delivery', ru: 'Доставка' }, { id: 'installation', ru: 'Монтаж' },
  ],
  flooring: [
    { id: 'order', ru: 'Заказ материалов' }, { id: 'delivery', ru: 'Доставка' }, { id: 'preparation', ru: 'Подготовка основания' },
    { id: 'installation', ru: 'Укладка' }, { id: 'finishing', ru: 'Финишная обработка' },
  ],
  construction: [
    { id: 'design', ru: 'Проект' }, { id: 'demolition', ru: 'Демонтаж' }, { id: 'rough', ru: 'Черновые работы' },
    { id: 'finishing', ru: 'Чистовая отделка' }, { id: 'handover', ru: 'Сдача объекта' },
  ],
  custom: [
    { id: 'stage1', ru: 'Этап 1' }, { id: 'stage2', ru: 'Этап 2' }, { id: 'stage3', ru: 'Этап 3' },
  ],
};
function stagesForNiche(nicheId: string) { return NICHE_STAGES[nicheId] || NICHE_STAGES.custom; }

function getTeamNiche(db: Database.Database, teamId: string): string {
  const row = db.prepare('SELECT niche FROM team_settings WHERE team_id = ?').get(teamId) as any;
  return (row?.niche as string) || 'furniture';
}

type StageStatus = 'pending' | 'in-progress' | 'done';
interface DealStage { id: string; status: StageStatus; startedAt?: string; completedAt?: string }

// Ensure deal.stages exists and covers the template (adds any missing
// stages as pending). Returns the normalised array.
function ensureStages(deal: any, template: Array<{ id: string; ru: string }>): DealStage[] {
  const existing: DealStage[] = Array.isArray(deal.stages) ? deal.stages : [];
  const byId = new Map(existing.map(s => [s.id, s]));
  return template.map(t => byId.get(t.id) || { id: t.id, status: 'pending' as StageStatus });
}

// True when this employee is the measurer/owner on the deal.
function isAssignedTo(deal: any, emp: { id: string; name: string }): boolean {
  if (deal.ownerId && deal.ownerId === emp.id) return true;
  const nameLow = (emp.name || '').toLowerCase().trim();
  if (!nameLow) return false;
  const first = nameLow.split(/\s+/)[0] || '';
  const test = (v: string | undefined) => !!v && (v.toLowerCase().includes(nameLow) || (first.length > 2 && v.toLowerCase().includes(first)));
  return test(deal.measurer) || test(deal.designer) || test(deal.foreman) || test(deal.architect);
}

// ─── Daily owner summary (Утренняя сводка) ─────────────────────────
// A 09:00 (Asia/Almaty) digest pushed to a team's admins / managers so
// the owner knows the state of the business without opening the web.
// KZ-only product → fixed Almaty timezone (UTC+5, no DST).
const SUMMARY_TZ = 'Asia/Almaty';
const SUMMARY_HOUR = 9;

function almatyToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: SUMMARY_TZ }); // YYYY-MM-DD
}
function almatyHour(): number {
  return Number(new Date().toLocaleTimeString('en-GB', { timeZone: SUMMARY_TZ, hour12: false }).slice(0, 2));
}

// Build the digest text for a team. Pure read — safe to call on demand
// (the /сводка command) or from the scheduler.
export function buildDailySummary(db: Database.Database, teamId: string): string {
  const today = almatyToday();
  const deals = loadDeals(db, teamId).map(d => d.data);
  const txRows = (db.prepare('SELECT data FROM transactions WHERE team_id = ?').all(teamId) as any[])
    .map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);
  const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';
  const now = Date.now();

  const newToday = deals.filter(d => (d.createdAt || '').slice(0, 10) === today).length;
  const revToday = txRows.filter(t => t.type === 'income' && t.status === 'completed' && (t.date || '').slice(0, 10) === today).reduce((s, t) => s + (t.amount || 0), 0);
  const inProd = deals.filter(d => ['production', 'assembly', 'manufacturing'].includes(d.status)).length;
  const onInstall = deals.filter(d => d.status === 'installation').length;
  const measToday = deals.filter(d => d.measurementDate === today && d.status !== 'completed' && d.status !== 'rejected');
  const instToday = deals.filter(d => d.installationDate === today && d.status !== 'completed' && d.status !== 'rejected');
  const debtDeals = deals.filter(d => !['completed', 'rejected'].includes(d.status) && (d.amount || 0) > (d.paidAmount || 0));
  const debt = debtDeals.reduce((s, d) => s + ((d.amount || 0) - (d.paidAmount || 0)), 0);
  const stale = deals.filter(d => d.status === 'new' && d.createdAt && (now - new Date(d.createdAt).getTime()) > 3 * 86400000).length;

  const dateNice = new Date().toLocaleDateString('ru-RU', { timeZone: SUMMARY_TZ, day: 'numeric', month: 'long' });
  const lines: string[] = [`☀️ <b>Доброе утро! Сводка на ${dateNice}</b>`, ''];

  lines.push(`📊 <b>Сегодня</b>`);
  lines.push(`• Новых заявок: <b>${newToday}</b>`);
  lines.push(`• Поступило: <b>${fmt(revToday)}</b>`);
  lines.push(`• В производстве: <b>${inProd}</b> · на монтаже: <b>${onInstall}</b>`);

  if (measToday.length || instToday.length) {
    lines.push('', `🗓 <b>На сегодня запланировано</b>`);
    measToday.slice(0, 5).forEach(d => lines.push(`• 📐 Замер — ${d.customerName || '—'}${d.siteAddress || d.address ? ' · ' + (d.siteAddress || d.address) : ''}`));
    instToday.slice(0, 5).forEach(d => lines.push(`• 🔧 Монтаж — ${d.customerName || '—'}${d.siteAddress || d.address ? ' · ' + (d.siteAddress || d.address) : ''}`));
  }

  const attention: string[] = [];
  if (debt > 0) attention.push(`• 💰 Дебиторка: <b>${fmt(debt)}</b> по ${debtDeals.length} сделкам`);
  if (stale > 0) attention.push(`• ⏳ Без движения >3 дней: <b>${stale}</b> новых заявок`);
  if (attention.length) { lines.push('', `⚠️ <b>Требует внимания</b>`, ...attention); }

  lines.push('', `<i>Открыть платформу для деталей.</i>`);
  return lines.join('\n');
}

// Recipients = paired admins / managers of the team.
function summaryRecipients(db: Database.Database, teamId: string): number[] {
  const rows = db.prepare(`
    SELECT tl.chat_id FROM telegram_links tl JOIN users u ON u.id = tl.user_id
    WHERE u.team_id = ? AND tl.chat_id IS NOT NULL AND u.team_role IN ('admin','manager')
  `).all(teamId) as any[];
  return rows.map(r => r.chat_id as number).filter(Boolean);
}

function getSummaryState(db: Database.Database, teamId: string): { enabled: boolean; lastSent?: string } {
  const row = db.prepare('SELECT daily_summary FROM team_settings WHERE team_id = ?').get(teamId) as any;
  if (!row?.daily_summary) return { enabled: true }; // on by default
  try { const s = JSON.parse(row.daily_summary); return { enabled: s.enabled !== false, lastSent: s.lastSent }; }
  catch { return { enabled: true }; }
}
function setSummaryLastSent(db: Database.Database, teamId: string, date: string) {
  const cur = getSummaryState(db, teamId);
  db.prepare(`
    INSERT INTO team_settings (team_id, daily_summary, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET daily_summary = excluded.daily_summary, updated_at = excluded.updated_at
  `).run(teamId, JSON.stringify({ enabled: cur.enabled, lastSent: date }));
}

// Scheduler tick — called every minute. Sends each team's digest once,
// the first minute on/after 09:00 Almaty that we haven't sent today.
async function dailySummaryTick(db: Database.Database) {
  if (!TOKEN) return;
  if (almatyHour() < SUMMARY_HOUR) return;
  const today = almatyToday();
  // Teams with at least one paired admin/manager.
  const teams = db.prepare(`
    SELECT DISTINCT u.team_id FROM telegram_links tl JOIN users u ON u.id = tl.user_id
    WHERE tl.chat_id IS NOT NULL AND u.team_role IN ('admin','manager')
  `).all() as any[];
  for (const t of teams) {
    const teamId = t.team_id;
    if (!teamId) continue;
    const state = getSummaryState(db, teamId);
    if (!state.enabled || state.lastSent === today) continue;
    try {
      const text = buildDailySummary(db, teamId);
      for (const chatId of summaryRecipients(db, teamId)) {
        await sendMessage(chatId, text);
      }
      setSummaryLastSent(db, teamId, today);
    } catch (e) { console.warn('[daily summary]', teamId, e); }
  }
}

// Start the once-a-minute scheduler. Idempotent guard so a hot-reload
// doesn't stack intervals.
let summaryTimer: ReturnType<typeof setInterval> | null = null;
export function startDailySummaryScheduler(db: Database.Database) {
  if (summaryTimer || !TOKEN) return;
  summaryTimer = setInterval(() => { void dailySummaryTick(db); }, 60 * 1000);
  console.log('[telegram] daily summary scheduler started (09:00 Asia/Almaty)');
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
    // Voice notes (microphone button in Telegram) — always Opus in OGG.
    voice?: { file_id: string; file_unique_id: string; duration: number; mime_type?: string; file_size?: number };
    // Audio attachments (paperclip → audio file) — mp3/m4a/etc.
    audio?: { file_id: string; file_unique_id: string; duration: number; mime_type?: string; title?: string; file_size?: number };
  };
  // Inline-button taps (Этап 2 — measurement / order cards).
  callback_query?: {
    id: string;
    from?: { id: number; username?: string; first_name?: string };
    message?: { chat: { id: number }; message_id: number };
    data?: string;
  };
}

// Short human label for a deal status (used in worker cards).
function statusLabelRu(status: string): string {
  const map: Record<string, string> = {
    new: '🆕 Новая заявка', measured: '📐 Замер сделан', 'project-agreed': '📝 Проект/договор',
    contract: '📝 Договор', production: '🏭 В производстве', assembly: '🔩 Сборка',
    manufacturing: '🏭 Изготовление', installation: '🔧 Монтаж', completed: '✅ Завершено', rejected: '❌ Отказ',
  };
  return map[status] || status;
}
const nowHM = () => new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
function appendNote(existing: string | undefined, line: string): string {
  return existing ? `${existing}\n${line}` : line;
}

// ─── «Мои замеры» — measurer's assigned, not-yet-finished deals ─────
// Build a single measurement card (text + inline keyboard). Reused by
// the «Мои замеры» list AND the assignment push from the web.
function measureCard(dd: any, dealId: string): { text: string; inline_keyboard: any[] } {
  const addr = dd.siteAddress || dd.address || '';
  const lines = [
    `<b>${dd.customerName || 'Без имени'}</b>`,
    dd.phone ? `📞 ${dd.phone}` : '',
    addr ? `📍 ${addr}` : '',
    (dd.furnitureType || dd.product) ? `🔧 ${dd.furnitureType || dd.product}` : '',
    dd.measurementDate ? `🗓 ${dd.measurementDate}` : '',
    `${statusLabelRu(dd.status)}`,
  ].filter(Boolean);
  const rows: any[] = [];
  if (addr) rows.push([{ text: '📍 Маршрут (2ГИС)', url: routeUrl(addr) }]);
  rows.push([
    { text: '🚗 Выехал', callback_data: `dep|${dealId}` },
    { text: '✅ Замер готов', callback_data: `msd|${dealId}` },
  ]);
  return { text: lines.join('\n'), inline_keyboard: rows };
}

async function sendMeasurements(db: Database.Database, chatId: number, teamId: string, emp: { id: string; name: string }) {
  const deals = loadDeals(db, teamId)
    .filter(d => isAssignedTo(d.data, emp))
    .filter(d => ['new', 'measured', 'project-agreed', 'contract'].includes(d.data.status))
    .slice(0, 8);
  if (deals.length === 0) {
    await sendMessage(chatId,
      `📐 <b>${emp.name}</b>, у вас сейчас нет назначенных замеров.\n\n` +
      `Как только менеджер назначит вас замерщиком на сделку — она появится здесь с кнопками «Маршрут», «Выехал» и «Замер готов».`);
    return;
  }
  await sendMessage(chatId, `📐 <b>Ваши замеры (${deals.length}):</b>`);
  for (const d of deals) {
    const card = measureCard(d.data, d.id);
    await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: card.text, reply_markup: { inline_keyboard: card.inline_keyboard } });
  }
}

// ─── «Мои заказы» — production cards with tappable stage chain (Этап 3) ──
// Statuses that count as "on the shop floor" — mirrors the web's
// Warehouse → Производство filter.
const PROD_STATUSES = ['project-agreed', 'contract', 'production', 'assembly', 'manufacturing', 'measured'];

const STAGE_ICON: Record<StageStatus, string> = { done: '✅', 'in-progress': '🔄', pending: '⚪' };

// Build the message body + inline keyboard for one production order.
// Each stage is its own button: tap cycles pending → in-progress → done.
function renderOrderCard(deal: any, template: Array<{ id: string; ru: string }>): { text: string; inline_keyboard: any[] } {
  const stages = ensureStages(deal, template);
  const done = stages.filter(s => s.status === 'done').length;
  const head = [
    `<b>${deal.product || deal.furnitureType || 'Заказ'}</b> · ${deal.customerName || ''}`.trim(),
    `Готово этапов: <b>${done}/${stages.length}</b>`,
  ].join('\n');
  // One button per stage, two per row to keep the card compact.
  const rows: any[] = [];
  for (let i = 0; i < template.length; i += 2) {
    const row = template.slice(i, i + 2).map(t => {
      const st = stages.find(s => s.id === t.id)?.status || 'pending';
      return { text: `${STAGE_ICON[st]} ${t.ru}`, callback_data: `stg|${deal.id}|${t.id}` };
    });
    rows.push(row);
  }
  return { text: head, inline_keyboard: rows };
}

// Cycle one stage and recompute progress/status. Mutates `deal`.
function cycleDealStage(deal: any, stageId: string, template: Array<{ id: string; ru: string }>): { label: string; status: StageStatus } {
  const stages = ensureStages(deal, template);
  const now = new Date().toISOString();
  const next = (s: StageStatus): StageStatus => s === 'pending' ? 'in-progress' : s === 'in-progress' ? 'done' : 'pending';
  let changed: { label: string; status: StageStatus } = { label: stageId, status: 'pending' };
  const updated = stages.map(s => {
    if (s.id !== stageId) return s;
    const ns = next(s.status);
    changed = { label: template.find(t => t.id === stageId)?.ru || stageId, status: ns };
    return {
      ...s, status: ns,
      startedAt: ns === 'in-progress' ? now : (ns === 'pending' ? undefined : s.startedAt),
      completedAt: ns === 'done' ? now : (ns === 'pending' ? undefined : s.completedAt),
    };
  });
  const total = template.length || 1;
  const doneCount = updated.filter(s => s.status === 'done').length;
  const inProg = updated.filter(s => s.status === 'in-progress').length;
  const perStage = 100 / total;
  deal.stages = updated;
  deal.progress = Math.min(100, Math.round(doneCount * perStage + (inProg > 0 ? Math.min(perStage / 4, 5) : 0)));
  if (doneCount === total) deal.status = 'completed';
  else if (deal.status === 'measured' || deal.status === 'project-agreed' || deal.status === 'contract') deal.status = 'production';
  return changed;
}

async function sendOrders(db: Database.Database, chatId: number, teamId: string, emp: { id: string; name: string }) {
  const teamNiche = getTeamNiche(db, teamId);
  const orders = loadDeals(db, teamId)
    .filter(d => PROD_STATUSES.includes(d.data.status))
    .slice(0, 8);
  if (orders.length === 0) {
    await sendMessage(chatId,
      `🪚 <b>${emp.name}</b>, сейчас нет заказов в производстве.\n\n` +
      `Когда менеджер переведёт сделку в работу — она появится здесь, и вы будете отмечать этапы кнопками.`);
    return;
  }
  await sendMessage(chatId, `🪚 <b>Заказы в производстве (${orders.length}):</b>\nТапайте этап: ⚪ не начат → 🔄 в работе → ✅ готово.`);
  for (const d of orders) {
    const tpl = stagesForNiche(d.data.niche || teamNiche);
    const card = renderOrderCard(d.data, tpl);
    await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: card.text, reply_markup: { inline_keyboard: card.inline_keyboard } });
  }
}

// ─── «Мои монтажи» — installer's ready-to-install / installing deals (Этап 4) ──
const INSTALL_STATUSES = ['production', 'assembly', 'manufacturing', 'installation'];

// Single install card (text + inline keyboard) — reused by the list AND
// the assignment push.
function installCard(dd: any, dealId: string): { text: string; inline_keyboard: any[] } {
  const addr = dd.siteAddress || dd.address || '';
  const lines = [
    `<b>${dd.customerName || 'Без имени'}</b>`,
    dd.phone ? `📞 ${dd.phone}` : '',
    addr ? `📍 ${addr}` : '',
    (dd.product || dd.furnitureType) ? `🔧 ${dd.product || dd.furnitureType}` : '',
    dd.installationDate ? `🗓 ${dd.installationDate}` : '',
    `${statusLabelRu(dd.status)}`,
  ].filter(Boolean);
  const rows: any[] = [];
  if (addr) rows.push([{ text: '📍 Маршрут (2ГИС)', url: routeUrl(addr) }]);
  rows.push([
    { text: '🚗 Выехал', callback_data: `dep|${dealId}` },
    { text: '🔧 Начал монтаж', callback_data: `ist|${dealId}` },
  ]);
  rows.push([{ text: '✅ Завершил монтаж', callback_data: `idn|${dealId}` }]);
  return { text: lines.join('\n'), inline_keyboard: rows };
}

async function sendInstalls(db: Database.Database, chatId: number, teamId: string, emp: { id: string; name: string }) {
  const deals = loadDeals(db, teamId)
    .filter(d => INSTALL_STATUSES.includes(d.data.status))
    .slice(0, 8);
  if (deals.length === 0) {
    await sendMessage(chatId,
      `🔧 <b>${emp.name}</b>, монтажей пока нет.\n\n` +
      `Когда заказ будет готов к установке — он появится здесь с кнопками «Маршрут», «Выехал», «Начал монтаж» и «Завершил».`);
    return;
  }
  await sendMessage(chatId, `🔧 <b>Монтажи (${deals.length}):</b>`);
  for (const d of deals) {
    const card = installCard(d.data, d.id);
    await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: card.text, reply_markup: { inline_keyboard: card.inline_keyboard } });
  }
}

// ─── Assignment push (Этап 5) — web → worker bridge ────────────────
// Called from the deals PATCH endpoint when a worker is freshly assigned
// to a deal (measurer / owner / etc.). Resolves the assignee's paired
// Telegram chat and pushes the right action card so the field worker
// gets the job the instant the manager assigns it — no web, no polling.
// `empId` is the employees.id of the newly-assigned worker.
export async function notifyAssignment(db: Database.Database, teamId: string, dealId: string, empId: string): Promise<boolean> {
  if (!TOKEN) return false;
  const empRow = db.prepare('SELECT data FROM employees WHERE id = ? AND team_id = ?').get(empId, teamId) as any;
  if (!empRow) return false;
  let empData: any; try { empData = JSON.parse(empRow.data); } catch { return false; }
  const email = (empData.email || '').toLowerCase();
  if (!email) return false;
  const userRow = db.prepare('SELECT id FROM users WHERE email = ? AND team_id = ?').get(email, teamId) as any;
  if (!userRow) return false;
  const link = db.prepare('SELECT chat_id FROM telegram_links WHERE user_id = ? AND chat_id IS NOT NULL').get(userRow.id) as any;
  if (!link?.chat_id) return false;
  const d = findDeal(db, teamId, dealId);
  if (!d) return false;
  // Pick the card by the deal's stage + the worker's botRole.
  const isInstall = INSTALL_STATUSES.includes(d.data.status) || empData.botRole === 'installer';
  const card = isInstall ? installCard(d.data, d.id) : measureCard(d.data, d.id);
  const header = isInstall ? '📌 <b>Вам назначен монтаж</b>' : '📌 <b>Вам назначен замер</b>';
  try {
    await tg('sendMessage', {
      chat_id: link.chat_id, parse_mode: 'HTML',
      text: `${header}\n\n${card.text}`,
      reply_markup: { inline_keyboard: card.inline_keyboard },
    });
    return true;
  } catch { return false; }
}

// ─── Inline-button tap handler (Этап 2) ────────────────────────────
async function handleCallback(
  db: Database.Database,
  cq: NonNullable<IncomingUpdate['callback_query']>,
  logActivity: (userId: string, entry: any) => void,
) {
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;
  const data = cq.data || '';
  if (!chatId) { await answerCallback(cq.id); return; }
  const user = findUserByChat(db, chatId);
  if (!user) { await answerCallback(cq.id, 'Аккаунт не привязан'); return; }
  const emp = findEmployeeForUser(db, user.id, user.teamId);
  const [action, dealId] = data.split('|');

  // Mark «выехал» (on the way to the measurement / install).
  if (action === 'dep' && dealId) {
    const d = findDeal(db, user.teamId, dealId);
    if (!d) { await answerCallback(cq.id, 'Заказ не найден'); return; }
    d.data.notes = appendNote(d.data.notes, `🚗 ${nowHM()} — ${emp?.name || 'мастер'} выехал на объект`);
    saveDeal(db, dealId, d.data);
    await answerCallback(cq.id, 'Отметил: выехал 🚗');
    if (messageId) await editReplyMarkupClear(chatId, messageId);
    await sendMessage(chatId,
      `🚗 Отметил, что вы выехали к <b>${d.data.customerName || 'клиенту'}</b>.\n` +
      `Клиент получит уведомление, когда подключим WhatsApp.`);
    logActivity(user.id, {
      user: emp?.name || user.name, actor: 'human',
      action: 'Выехал на объект', target: d.data.customerName || dealId,
      type: 'update', page: 'sales',
    });
    return;
  }

  // Mark «замер готов» → move the deal to 'measured' + nudge to record sizes.
  if (action === 'msd' && dealId) {
    const d = findDeal(db, user.teamId, dealId);
    if (!d) { await answerCallback(cq.id, 'Заказ не найден'); return; }
    d.data.status = 'measured';
    d.data.progress = Math.max(25, Number(d.data.progress) || 0);
    d.data.measurementDate = new Date().toISOString().slice(0, 10);
    d.data.notes = appendNote(d.data.notes, `📐 ${nowHM()} — замер выполнен (${emp?.name || 'мастер'})`);
    saveDeal(db, dealId, d.data);
    await answerCallback(cq.id, 'Замер отмечен ✅');
    if (messageId) await editReplyMarkupClear(chatId, messageId);
    await sendMessage(chatId,
      `✅ Замер у <b>${d.data.customerName || 'клиента'}</b> отмечен.\n\n` +
      `Теперь запишите размеры — просто наговорите голосом 🎤:\n` +
      `<i>«Три окна: 1.5 на 1.4 двухстворчатое, 1 на 1 глухое, балконный блок 2 на 2.1»</i>\n\n` +
      `Или пришлите 📷 фото объекта — я прикреплю к заказу.`);
    logActivity(user.id, {
      user: emp?.name || user.name, actor: 'human',
      action: 'Замер выполнен', target: d.data.customerName || dealId,
      type: 'update', page: 'sales',
    });
    return;
  }

  // Attach a pending photo to the chosen deal.
  if (action === 'att' && dealId) {
    const ph = getPendingPhoto(db, chatId);
    if (!ph) { await answerCallback(cq.id, 'Фото не найдено — пришлите заново'); if (messageId) await editReplyMarkupClear(chatId, messageId); return; }
    const d = findDeal(db, user.teamId, dealId);
    if (!d) { await answerCallback(cq.id, 'Заказ не найден'); return; }
    const docs = Array.isArray(d.data.documents) ? d.data.documents : [];
    docs.push({
      id: newId('doc_'),
      name: `Фото от ${emp?.name || 'мастера'} · ${nowHM()}`,
      dataUrl: ph.dataUrl,
      kind: 'image',
      uploadedAt: new Date().toISOString(),
      by: emp?.name || user.name,
      source: 'telegram',
    });
    d.data.documents = docs;
    saveDeal(db, dealId, d.data);
    clearPendingPhoto(db, chatId);
    await answerCallback(cq.id, 'Фото прикреплено ✅');
    if (messageId) await editReplyMarkupClear(chatId, messageId);
    await sendMessage(chatId, `📷 Фото прикреплено к заказу <b>${d.data.customerName || ''}</b>. Видно в карточке на платформе.`);
    logActivity(user.id, {
      user: emp?.name || user.name, actor: 'human',
      action: 'Прикрепил фото к заказу', target: d.data.customerName || dealId,
      type: 'update', page: 'sales',
    });
    return;
  }

  if (action === 'attcancel') {
    clearPendingPhoto(db, chatId);
    await answerCallback(cq.id, 'Отменено');
    if (messageId) await editReplyMarkupClear(chatId, messageId);
    return;
  }

  // Installer started the on-site installation (Этап 4).
  if (action === 'ist' && dealId) {
    const d = findDeal(db, user.teamId, dealId);
    if (!d) { await answerCallback(cq.id, 'Заказ не найден'); return; }
    d.data.status = 'installation';
    d.data.progress = Math.max(88, Number(d.data.progress) || 0);
    d.data.notes = appendNote(d.data.notes, `🔧 ${nowHM()} — начал монтаж (${emp?.name || 'монтажник'})`);
    saveDeal(db, dealId, d.data);
    await answerCallback(cq.id, 'Монтаж начат 🔧');
    if (messageId) await editReplyMarkupClear(chatId, messageId);
    await sendMessage(chatId, `🔧 Монтаж у <b>${d.data.customerName || 'клиента'}</b> начат. Как закончите — нажмите «✅ Завершил монтаж» в списке /монтажи.`);
    logActivity(user.id, {
      user: emp?.name || user.name, actor: 'human',
      action: 'Начал монтаж', target: d.data.customerName || dealId,
      type: 'update', page: 'sales',
    });
    return;
  }

  // Installer finished the installation → close the deal + warranty + photo nudge.
  if (action === 'idn' && dealId) {
    const d = findDeal(db, user.teamId, dealId);
    if (!d) { await answerCallback(cq.id, 'Заказ не найден'); return; }
    d.data.status = 'completed';
    d.data.progress = 100;
    d.data.installationDate = d.data.installationDate || new Date().toISOString().slice(0, 10);
    // Warranty — start today, 12 months default. Stored on the deal so
    // the web card / acceptance act can print it.
    const start = new Date();
    const end = new Date(start); end.setFullYear(end.getFullYear() + 1);
    d.data.warranty = { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), months: 12 };
    d.data.notes = appendNote(d.data.notes, `✅ ${nowHM()} — монтаж завершён (${emp?.name || 'монтажник'}). Гарантия 12 мес. до ${d.data.warranty.endDate}`);
    saveDeal(db, dealId, d.data);
    await answerCallback(cq.id, 'Монтаж завершён ✅');
    if (messageId) await editReplyMarkupClear(chatId, messageId);
    const tlink = trackLink(ensureTrackCode(db, user.teamId, dealId));
    await sendMessage(chatId,
      `🎉 Монтаж у <b>${d.data.customerName || 'клиента'}</b> завершён!\n` +
      `Гарантия 12 мес. до <b>${d.data.warranty.endDate}</b>.\n\n` +
      `📷 Пришлите фото готовой работы — прикреплю к заказу.\n\n` +
      `🔗 Ссылка для клиента (статус + гарантия):\n${tlink}\n\n` +
      `Акт приёмки и гарантийный талон — на платформе → Финансы → Документы.`);
    logActivity(user.id, {
      user: emp?.name || user.name, actor: 'human',
      action: 'Завершил монтаж', target: d.data.customerName || dealId,
      type: 'update', page: 'sales',
    });
    return;
  }

  // Cycle a production stage: stg|dealId|stageId (Этап 3).
  if (action === 'stg' && dealId) {
    const stageId = data.split('|')[2];
    const d = findDeal(db, user.teamId, dealId);
    if (!d || !stageId) { await answerCallback(cq.id, 'Заказ не найден'); return; }
    const tpl = stagesForNiche(d.data.niche || getTeamNiche(db, user.teamId));
    const changed = cycleDealStage(d.data, stageId, tpl);
    d.data.notes = appendNote(d.data.notes, `🪚 ${nowHM()} — ${changed.label}: ${changed.status === 'done' ? 'готово' : changed.status === 'in-progress' ? 'в работе' : 'сброшен'} (${emp?.name || 'мастер'})`);
    saveDeal(db, dealId, d.data);
    await answerCallback(cq.id, `${changed.label}: ${changed.status === 'done' ? 'готово ✅' : changed.status === 'in-progress' ? 'в работе 🔄' : 'сброшен ⚪'}`);
    // Re-render the card in place so the chain reflects the new state.
    const card = renderOrderCard(d.data, tpl);
    if (messageId) await editMessageCard(chatId, messageId, card.text, card.inline_keyboard);
    // When everything's done, congratulate + nudge for a finished-work photo.
    if (d.data.status === 'completed') {
      await sendMessage(chatId, `🎉 Заказ <b>${d.data.customerName || ''}</b> готов! Пришлите 📷 фото готовой работы — прикреплю к заказу.`);
    }
    logActivity(user.id, {
      user: emp?.name || user.name, actor: 'human',
      action: `Этап «${changed.label}» — ${changed.status === 'done' ? 'готово' : changed.status === 'in-progress' ? 'в работе' : 'сброшен'}`,
      target: d.data.customerName || dealId,
      type: 'update', page: 'warehouse',
    });
    return;
  }

  await answerCallback(cq.id);
}

export async function handleUpdate(db: Database.Database, update: IncomingUpdate, logActivity: (userId: string, entry: any) => void) {
  // ── Inline-button tap? Route to the callback handler and return. ──
  if (update.callback_query) {
    await handleCallback(db, update.callback_query, logActivity);
    return;
  }
  const msg = update.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const username = msg.from?.username;

  // ── Voice / audio message? Transcribe with Whisper and pretend the user
  //    typed the resulting text. This means the whole CRM tool flow — create
  //    deal, log payment, add task, change status — works hands-free.
  if ((msg.voice || msg.audio) && !msg.text) {
    if (!isWhisperReady()) {
      await sendMessage(chatId, '🎤 Распознавание речи отключено — админ не подключил OPENAI_API_KEY.');
      return;
    }
    const fileId = msg.voice?.file_id || msg.audio?.file_id;
    const duration = msg.voice?.duration || msg.audio?.duration || 0;
    if (!fileId) return;
    // Telegram caps voice messages at ~10MB / a few minutes; still hint the user
    // when it's clearly too long so they don't wait silently for a 504.
    if (duration > 300) {
      await sendMessage(chatId, '🎤 Голосовое слишком длинное (>5 мин). Сократите и пришлите ещё раз.');
      return;
    }
    await sendMessage(chatId, '🎤 Распознаю речь…');
    const file = await downloadTgFileAsBuffer(fileId);
    if (!file) { await sendMessage(chatId, '⚠️ Не удалось скачать аудио. Попробуйте ещё раз.'); return; }
    const tr = await transcribeAudio(file.buf, msg.voice?.mime_type || msg.audio?.mime_type || file.mime);
    if (!tr.ok || !tr.text) {
      await sendMessage(chatId, `⚠️ Не получилось распознать: ${tr.error || 'неизвестная причина'}`);
      return;
    }
    // Echo what we heard so the user can correct miss-transcriptions easily.
    await sendMessage(chatId, `📝 <i>Вы сказали:</i> «${tr.text}»`);
    // Re-enter handleUpdate as if the user had typed this text. We mutate
    // the local `msg` object so the slash-command / wizard / agent branches
    // below all see the new text and treat the voice note like a typed message.
    (msg as any).text = tr.text;
    // Fall through to text handling below.
  }

  // ── Photo message? Two cases:
  //    1. Inside /design wizard → stash as room photo / reference.
  //    2. Otherwise (field worker sending an object / work photo) →
  //       hold it and ask which deal to attach it to (Этап 2).
  if (msg.photo && msg.photo.length > 0 && !msg.text) {
    const designState = getDesignState(db, chatId);
    if (!designState || (designState.step !== 'room_photo' && designState.step !== 'references')) {
      // Photo-attach flow for field workers.
      const worker = findUserByChat(db, chatId);
      if (!worker) { await sendMessage(chatId, 'Сначала привяжите аккаунт по ссылке-приглашению от руководителя.'); return; }
      const emp = findEmployeeForUser(db, worker.id, worker.teamId);
      const largestPic = msg.photo[msg.photo.length - 1];
      await sendMessage(chatId, '📥 Загружаю фото…');
      const url = await downloadTgFileAsDataUrl(largestPic.file_id);
      if (!url) { await sendMessage(chatId, '⚠️ Не удалось скачать фото. Попробуйте ещё раз.'); return; }
      setPendingPhoto(db, chatId, url);
      // Offer the worker's own active deals first; fall back to recent.
      const all = loadDeals(db, worker.teamId);
      const assigned = emp ? all.filter(d => isAssignedTo(d.data, emp) && d.data.status !== 'rejected') : [];
      const pick = (assigned.length > 0 ? assigned : all.filter(d => d.data.status !== 'rejected')).slice(0, 6);
      if (pick.length === 0) {
        clearPendingPhoto(db, chatId);
        await sendMessage(chatId, 'Пока нет активных заказов, к которым можно прикрепить фото. Создайте сделку — потом пришлите фото снова.');
        return;
      }
      const rows = pick.map(d => [{ text: `${d.data.customerName || 'Без имени'}${d.data.product ? ' · ' + String(d.data.product).slice(0, 24) : ''}`, callback_data: `att|${d.id}` }]);
      rows.push([{ text: '✕ Отмена', callback_data: 'attcancel|' }]);
      await tg('sendMessage', {
        chat_id: chatId, parse_mode: 'HTML',
        text: '📷 К какому заказу прикрепить фото?',
        reply_markup: { inline_keyboard: rows },
      });
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
  // `let` because the role-menu router below may rewrite a button label
  // into its slash-command equivalent before the command branch runs.
  let text = msg.text.trim();

  // ── Worker onboarding continuation (Этап 1) ──────────────────────
  // If this chat is mid-onboarding (collecting name → role), handle the
  // step here before anything else. /cancel aborts. /start re-enters the
  // slash branch below (so a fresh join link can restart cleanly).
  {
    const ob = getOnboarding(db, chatId);
    if (ob && text.toLowerCase() !== '/cancel' && !text.toLowerCase().startsWith('/start')) {
      if (ob.step === 'name') {
        const name = text.replace(/\s+/g, ' ').trim().slice(0, 60);
        if (name.length < 2) {
          await sendMessage(chatId, 'Напишите, пожалуйста, ваше имя (например: Канат).');
          return;
        }
        setOnboarding(db, chatId, { ...ob, step: 'role', draftName: name });
        await tg('sendMessage', {
          chat_id: chatId, parse_mode: 'HTML',
          text: `Приятно познакомиться, <b>${name}</b>! 👋\n\nВыберите вашу роль:`,
          reply_markup: { keyboard: KB_ROLES, resize_keyboard: true, one_time_keyboard: true },
        });
        return;
      }
      if (ob.step === 'role') {
        const roleDef = findBotRoleByLabel(text);
        if (!roleDef) {
          await tg('sendMessage', {
            chat_id: chatId, parse_mode: 'HTML',
            text: 'Выберите роль кнопкой ниже 👇',
            reply_markup: { keyboard: KB_ROLES, resize_keyboard: true, one_time_keyboard: true },
          });
          return;
        }
        const name = ob.draftName || (msg.from?.first_name || 'Сотрудник');
        const { userId } = createWorkerAccount(db, ob.teamId, name, roleDef, chatId, username);
        clearOnboarding(db, chatId);
        logActivity(userId, {
          user: name, actor: 'human',
          action: `Присоединился через Telegram как «${roleDef.label}»`,
          target: username ? '@' + username : `chat ${chatId}`,
          type: 'invite', page: 'team',
        });
        await tg('sendMessage', {
          chat_id: chatId, parse_mode: 'HTML',
          text:
            `✅ Готово, <b>${name}</b>! Вы в команде как <b>${roleDef.emoji} ${roleDef.label}</b>.\n\n` +
            `Пользуйтесь меню внизу 👇 или просто пишите/говорите мне голосом — я пойму.\n\n` +
            `Например: <i>«Сегодня поставил окна у Айгуль, клиент доплатил 100 тысяч»</i>`,
          reply_markup: roleMenuKeyboard(roleDef.botRole),
        });
        return;
      }
    }
  }

  // ── Role-menu button router (Этап 1 foundation) ──────────────────
  // The persistent reply keyboard sends its label as plain text. Map
  // the labels whose features already exist onto their slash command;
  // the field-flow buttons (замеры / фото / заказы) land in Этап 2-4 —
  // for now they get a friendly "coming soon, describe it instead" so
  // the menu never feels broken. We rewrite `text` so the slash branch
  // below picks it up.
  {
    const menuMap: Record<string, string> = {
      '☀️ сводка': '/сводка',
      '📊 сегодня': '/today',
      '✅ задачи': '/tasks',
      '✅ мои задачи': '/tasks',
      '💰 выручка': '/revenue',
      '💰 зарплата': '/revenue',
      '💰 моя выручка': '/revenue',
      '🎨 ai дизайн': '/design',
      // Этап 2 — measurer measurement list.
      '📋 мои замеры': '/замеры',
      // Этап 4 — installer's monitoring queue.
      '📋 мои монтажи': '/монтажи',
      // Этап 3 — production master's order list with stage chain.
      '📋 мои заказы': '/заказы',
    };
    const soon: Record<string, string> = {
      // Photo buttons just guide the worker to send a photo — the attach
      // flow kicks in automatically when a photo arrives (Этап 2).
      '🎤 записать замер':'🎤 Запишите голосом: клиент, что замеряли, размеры, материал — я structurирую в сделку. Можно и текстом.',
      '📷 фото объекта': '📷 Просто пришлите фото — я спрошу, к какому заказу прикрепить.',
      '📷 фото-отчёт':   '📷 Просто пришлите фото — я спрошу, к какому заказу прикрепить.',
      '📷 фото работы':  '📷 Просто пришлите фото готовой работы — я спрошу, к какому заказу прикрепить.',
    };
    const low = text.toLowerCase();
    if (menuMap[low]) {
      text = menuMap[low];
    } else if (soon[low]) {
      await sendMessage(chatId, soon[low]);
      return;
    }
  }

  // --- Slash commands ------------------------------------------------
  if (text.startsWith('/')) {
    const [cmdRaw, ...args] = text.split(/\s+/);
    const cmd = cmdRaw.replace(/@.*$/, '').toLowerCase(); // strip @botname suffix

    if (cmd === '/start') {
      clearHistory(db, chatId);
      clearDesignState(db, chatId);
      const paired = findUserByChat(db, chatId);
      // Deep-link invite: /start join_CODE → onboard a new field worker.
      // Telegram passes the payload after /start when the user taps
      // t.me/<bot>?start=join_CODE. Only honoured when the chat isn't
      // already paired to an account.
      const startPayload = (args[0] || '').trim();
      if (!paired && startPayload.toLowerCase().startsWith('join_')) {
        const code = startPayload.slice(5);
        const team = findTeamByInviteCode(db, code);
        if (!team) {
          await sendMessage(chatId, '⚠️ Ссылка-приглашение недействительна или устарела. Попросите у руководителя новую.');
          return;
        }
        setOnboarding(db, chatId, { teamId: team.teamId, step: 'name', username });
        await sendMessage(chatId,
          `Здравствуйте! 👋 Вас пригласили в команду на платформе <b>Utir Soft</b>.\n\n` +
          `Давайте познакомимся. <b>Как вас зовут?</b>`,
        );
        return;
      }
      if (paired) {
        await sendMessage(chatId,
          `Здравствуйте, <b>${paired.name}</b>!\n\n` +
          `Я — AI-ассистент Utir Soft. Просто пишите мне свободным текстом, ` +
          `например:\n\n<i>«Закрыл нового клиента на сумму X тенге»</i>\n` +
          `<i>«Клиент доплатил остаток»</i>\n` +
          `<i>«Поставь задачу замерить завтра»</i>\n\n` +
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

    // /сводка — owner morning digest on demand (same content as the
    // scheduled 09:00 push). Lets the owner pull it any time / test it.
    if (cmd === '/сводка' || cmd === '/summary') {
      const user = findUserByChat(db, chatId);
      if (!user) { await sendMessage(chatId, 'Сначала привяжите аккаунт по ссылке-приглашению от руководителя.'); return; }
      await sendMessage(chatId, buildDailySummary(db, user.teamId));
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

    // /замеры — measurer/installer's assigned active deals with inline
    // [Маршрут][Выехал][Замер готов] buttons. The field worker's home screen.
    if (cmd === '/замеры' || cmd === '/measures' || cmd === '/мои_замеры') {
      const user = findUserByChat(db, chatId);
      if (!user) { await sendMessage(chatId, 'Сначала привяжите аккаунт по ссылке-приглашению от руководителя.'); return; }
      const emp = findEmployeeForUser(db, user.id, user.teamId);
      if (!emp) { await sendMessage(chatId, 'Ваш профиль не привязан к карточке сотрудника. Попросите админа.'); return; }
      await sendMeasurements(db, chatId, user.teamId, emp);
      return;
    }

    // /монтажи — installer's ready-to-install queue with
    // [Маршрут][Выехал][Начал монтаж][Завершил] buttons (Этап 4).
    if (cmd === '/монтажи' || cmd === '/installs') {
      const user = findUserByChat(db, chatId);
      if (!user) { await sendMessage(chatId, 'Сначала привяжите аккаунт по ссылке-приглашению от руководителя.'); return; }
      const emp = findEmployeeForUser(db, user.id, user.teamId);
      if (!emp) { await sendMessage(chatId, 'Ваш профиль не привязан к карточке сотрудника. Попросите админа.'); return; }
      await sendInstalls(db, chatId, user.teamId, emp);
      return;
    }

    // /заказы — production master's orders with a tappable stage chain
    // (Распил → Кромка → Сборка → …). The shop-floor home screen (Этап 3).
    if (cmd === '/заказы' || cmd === '/orders') {
      const user = findUserByChat(db, chatId);
      if (!user) { await sendMessage(chatId, 'Сначала привяжите аккаунт по ссылке-приглашению от руководителя.'); return; }
      const emp = findEmployeeForUser(db, user.id, user.teamId);
      if (!emp) { await sendMessage(chatId, 'Ваш профиль не привязан к карточке сотрудника. Попросите админа.'); return; }
      await sendOrders(db, chatId, user.teamId, emp);
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
          `Пример: <code>/assign &lt;имя сотрудника&gt; &lt;что сделать&gt;</code>`,
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
