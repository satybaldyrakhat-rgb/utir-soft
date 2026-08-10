// ─── WhatsApp-ассистент (бот для команды) ─────────────────────────────
// Тот же AI-ассистент, что и в Telegram, но по WhatsApp. Переиспользует
// весь AI-стек (runAgent + aiTools + permissions) и сводки из telegram.ts.
// Транспорт — WhatsApp Cloud API на ОТДЕЛЬНОМ платформенном номере
// (WHATSAPP_BOT_PHONE_NUMBER_ID), не путать с клиентскими номерами команд.
//
// MVP: привязка по коду, AI-ассистент (чтение+запись через подтверждение),
// команды /summary /week /month /help /unlink. Остальные запросы («мои
// задачи», «выручка», «заказы») обрабатывает AI-агент естественным языком.
// Интерактивные кнопки/мастер дизайна — вне MVP (WhatsApp-кнопки иные).

import type Database from 'better-sqlite3';
import { runAgent } from './claudeAgent.js';
import { canRunTool } from './permissions.js';
import { buildDailySummary, buildPeriodSummary } from './telegram.js';

const GRAPH = process.env.META_GRAPH_VERSION || 'v21.0';
const PHONE_ID = (process.env.WHATSAPP_BOT_PHONE_NUMBER_ID || '').trim();
const TOKEN = (process.env.WHATSAPP_BOT_TOKEN || '').trim();

export function isWaBotReady(): boolean { return !!(PHONE_ID && TOKEN); }
// Совпадает ли входящий номер (phone_number_id вебхука) с нашим бот-номером.
export function isWaBotPhone(phoneNumberId: string | undefined | null): boolean {
  return !!PHONE_ID && String(phoneNumberId) === PHONE_ID;
}

// ─── Схема ────────────────────────────────────────────────────────────
export function initWaBotSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_links (
      user_id TEXT PRIMARY KEY,
      wa_id TEXT UNIQUE,              -- номер пользователя (цифры), ключ привязки
      link_code TEXT,
      code_expires_at TEXT,
      linked_at TEXT,
      name TEXT,
      chat_history TEXT,             -- JSON [{role,content}]
      pending_action TEXT            -- JSON {toolName,toolInput,summary,expiresAt}
    );
    CREATE INDEX IF NOT EXISTS idx_wa_links_code ON whatsapp_links(link_code);
    CREATE INDEX IF NOT EXISTS idx_wa_links_wa ON whatsapp_links(wa_id);
    -- Отдельная отметка об отправке сводок в WhatsApp (чтобы не конфликтовать
    -- с Telegram-дедупом — каналы шлют независимо).
    CREATE TABLE IF NOT EXISTS wa_summary_state (
      team_id TEXT PRIMARY KEY,
      last_daily TEXT,
      last_weekly TEXT,
      last_monthly TEXT
    );
  `);
}

// ─── Транспорт (WhatsApp Cloud API) ───────────────────────────────────
export async function sendWaText(toWaId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!isWaBotReady()) return { ok: false, error: 'wa bot not configured' };
  const url = `https://graph.facebook.com/${GRAPH}/${encodeURIComponent(PHONE_ID)}/messages`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: String(toWaId).replace(/\D/g, ''), type: 'text', text: { body: text.slice(0, 4000) } }),
    });
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok || json?.error) return { ok: false, error: json?.error?.message || `HTTP ${resp.status}` };
    return { ok: true };
  } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
}

// Telegram-HTML → WhatsApp-разметка (*bold*, _italic_, `mono`) + очистка.
export function htmlToWa(s: string): string {
  if (!s) return '';
  let t = s;
  t = t.replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gis, (_m, url, label) => `${label} (${url})`);
  t = t.replace(/<\/?b>/gi, '*').replace(/<\/?strong>/gi, '*');
  t = t.replace(/<\/?i>/gi, '_').replace(/<\/?em>/gi, '_');
  t = t.replace(/<\/?code>/gi, '`').replace(/<\/?pre>/gi, '`');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
  return t;
}

// ─── Привязка (аналог link-кода Telegram) ─────────────────────────────
const gen6 = () => Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6).toUpperCase().padEnd(6, '0');
function plus1h(): string { return new Date(Date.now() + 3600_000).toISOString(); }

export interface WaLinkStatus { paired: boolean; waId?: string; name?: string; linkedAt?: string; pendingCode?: string }

export function issueWaLinkCode(db: Database.Database, userId: string): { code: string; expiresAt: string } {
  const code = gen6();
  const expiresAt = plus1h();
  const existing = db.prepare('SELECT user_id FROM whatsapp_links WHERE user_id = ?').get(userId);
  if (existing) {
    db.prepare('UPDATE whatsapp_links SET link_code = ?, code_expires_at = ? WHERE user_id = ?').run(code, expiresAt, userId);
  } else {
    db.prepare('INSERT INTO whatsapp_links (user_id, link_code, code_expires_at) VALUES (?, ?, ?)').run(userId, code, expiresAt);
  }
  return { code, expiresAt };
}

export function getWaLinkStatus(db: Database.Database, userId: string): WaLinkStatus {
  const row = db.prepare('SELECT wa_id, name, linked_at, link_code, code_expires_at FROM whatsapp_links WHERE user_id = ?').get(userId) as any;
  if (!row) return { paired: false };
  const codeValid = row.link_code && row.code_expires_at && new Date(row.code_expires_at).getTime() > Date.now();
  return { paired: !!row.wa_id, waId: row.wa_id || undefined, name: row.name || undefined, linkedAt: row.linked_at || undefined, pendingCode: codeValid ? row.link_code : undefined };
}

export function unlinkWa(db: Database.Database, userId: string) {
  db.prepare('DELETE FROM whatsapp_links WHERE user_id = ?').run(userId);
}

// Привязать номер к пользователю по коду. Возвращает user или null.
function consumeWaCode(db: Database.Database, code: string, waId: string, name?: string): { userId: string } | null {
  const row = db.prepare('SELECT user_id, code_expires_at FROM whatsapp_links WHERE link_code = ?').get(code.toUpperCase()) as any;
  if (!row) return null;
  if (!row.code_expires_at || new Date(row.code_expires_at).getTime() < Date.now()) return null;
  // Этот номер уже привязан к другому пользователю?
  const taken = db.prepare('SELECT user_id FROM whatsapp_links WHERE wa_id = ? AND user_id != ?').get(waId, row.user_id) as any;
  if (taken) return null;
  db.prepare('UPDATE whatsapp_links SET wa_id = ?, name = ?, linked_at = ?, link_code = NULL, code_expires_at = NULL WHERE user_id = ?')
    .run(waId, name || null, new Date().toISOString(), row.user_id);
  return { userId: row.user_id };
}

// Карточка сотрудника пользователя (по email) — для фильтра «мои задачи».
function findEmployeeForUser(db: Database.Database, userId: string, teamId: string): { id: string; name: string } | null {
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as any;
  if (!u?.email) return null;
  const rows = db.prepare('SELECT id, data FROM employees WHERE team_id = ?').all(teamId) as any[];
  for (const r of rows) {
    try { const d = JSON.parse(r.data); if ((d.email || '').toLowerCase() === u.email.toLowerCase()) return { id: r.id, name: d.name || '' }; }
    catch { /* skip */ }
  }
  return null;
}

interface WaUser { id: string; teamId: string; name: string; teamRole: string }
function findUserByWa(db: Database.Database, waId: string): WaUser | null {
  const row = db.prepare(`SELECT u.id, u.team_id, u.name, u.team_role
                          FROM whatsapp_links w JOIN users u ON u.id = w.user_id
                          WHERE w.wa_id = ?`).get(waId) as any;
  if (!row) return null;
  return { id: row.id, teamId: row.team_id || row.id, name: row.name || 'Пользователь', teamRole: row.team_role || 'admin' };
}

// ─── Состояние: история + подтверждение ───────────────────────────────
const HISTORY_LIMIT = 20;
interface HistMsg { role: 'user' | 'assistant'; content: string }
function getWaHistory(db: Database.Database, userId: string): HistMsg[] {
  const row = db.prepare('SELECT chat_history FROM whatsapp_links WHERE user_id = ?').get(userId) as any;
  try { const a = JSON.parse(row?.chat_history || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
function appendWaHistory(db: Database.Database, userId: string, role: 'user' | 'assistant', content: string) {
  const hist = getWaHistory(db, userId);
  hist.push({ role, content: content.slice(0, 2000) });
  const trimmed = hist.slice(-HISTORY_LIMIT);
  db.prepare('UPDATE whatsapp_links SET chat_history = ? WHERE user_id = ?').run(JSON.stringify(trimmed), userId);
}

interface WaPending { toolName: string; toolInput: any; summary: string; expiresAt: string }
function setWaPending(db: Database.Database, userId: string, p: WaPending) {
  db.prepare('UPDATE whatsapp_links SET pending_action = ? WHERE user_id = ?').run(JSON.stringify(p), userId);
}
function getWaPending(db: Database.Database, userId: string): WaPending | null {
  const row = db.prepare('SELECT pending_action FROM whatsapp_links WHERE user_id = ?').get(userId) as any;
  if (!row?.pending_action) return null;
  try { const p = JSON.parse(row.pending_action); if (p?.expiresAt && new Date(p.expiresAt).getTime() < Date.now()) return null; return p; } catch { return null; }
}
function clearWaPending(db: Database.Database, userId: string) {
  db.prepare('UPDATE whatsapp_links SET pending_action = NULL WHERE user_id = ?').run(userId);
}

// Per-user разрешение модуля (auto/confirm/none) — как в Telegram-боте.
type ModulePermission = 'auto' | 'confirm' | 'none';
function getModulePermission(db: Database.Database, userId: string, moduleKey: string): ModulePermission {
  try {
    const row = db.prepare('SELECT ai_settings FROM users WHERE id = ?').get(userId) as any;
    if (!row?.ai_settings) return 'confirm';
    const v = JSON.parse(row.ai_settings)?.assistant?.modulePermissions?.[moduleKey];
    return (v === 'auto' || v === 'confirm' || v === 'none') ? v : 'confirm';
  } catch { return 'confirm'; }
}

const YES_RE = /^(да|ага|ок(ей)?|давай|конечно|yes|иә|ия|жарайды|жақсы|ма[кқ]ұл)\b/i;
const NO_RE = /^(нет|не надо|отмена|no|жо[кқ]|керек емес|болмайды)\b/i;

// ─── Главный обработчик входящего сообщения ───────────────────────────
export interface WaInbound { from: string; name?: string; text: string; msgId?: string }

export async function handleWaUpdate(
  db: Database.Database,
  msg: WaInbound,
  logActivity: (userId: string, entry: any) => void,
): Promise<void> {
  const waId = String(msg.from || '').replace(/\D/g, '');
  const text = String(msg.text || '').trim();
  if (!waId || !text) return;

  const send = (t: string) => sendWaText(waId, t).catch(() => {});
  const user = findUserByWa(db, waId);

  // ── Не привязан ─────────────────────────────────────────────────────
  if (!user) {
    const linkCmd = text.match(/^\/?(link|привязать|код)?\s*([A-Za-z0-9]{6})$/i);
    const code = linkCmd?.[2] || (/^[A-Za-z0-9]{6}$/.test(text) ? text : '');
    if (code) {
      const res = consumeWaCode(db, code, waId, msg.name);
      if (res) {
        const u = db.prepare('SELECT name FROM users WHERE id = ?').get(res.userId) as any;
        await send(`✅ Готово! WhatsApp привязан к аккаунту${u?.name ? ` (${u.name})` : ''}.\n\nТеперь можно писать запросы: «сводка за сегодня», «мои задачи», «создай сделку…». Команды: /help`);
      } else {
        await send('❌ Код неверный или истёк. Получите новый код в приложении: Настройки → Бот-ассистент → WhatsApp.');
      }
      return;
    }
    await send('👋 Это бот-ассистент Utir Soft.\n\nЧтобы привязать WhatsApp к вашему аккаунту, откройте приложение → Настройки → Бот-ассистент → WhatsApp, получите 6-значный код и отправьте его сюда.');
    return;
  }

  // ── Команды ─────────────────────────────────────────────────────────
  const lower = text.toLowerCase();
  if (lower === '/start') {
    await send(`С возвращением, ${user.name}! Напишите запрос или /help.`); return;
  }
  if (lower === '/help' || lower === 'помощь' || lower === 'көмек') {
    await send([
      '🤖 *Бот-ассистент Utir Soft*',
      '',
      'Просто напишите, что нужно — я пойму. Примеры:',
      '• «сводка за сегодня»  • «мои задачи»',
      '• «выручка за месяц»  • «создай сделку Айгүл, 250 000»',
      '',
      'Команды:',
      '/summary — сводка за сегодня',
      '/tasks — мои открытые задачи',
      '/week — итоги недели',
      '/month — итоги месяца',
      '/unlink — отвязать WhatsApp',
      '/help — помощь',
    ].join('\n'));
    return;
  }
  if (lower === '/unlink' || lower === 'отвязать') {
    unlinkWa(db, user.id);
    await send('WhatsApp отвязан от аккаунта. Чтобы привязать снова — получите код в приложении.');
    return;
  }
  if (lower === '/summary' || lower === '/сводка' || lower === 'сводка') {
    await send(htmlToWa(buildDailySummary(db, user.teamId)) || 'Пока нет данных за сегодня.'); return;
  }
  if (lower === '/week' || lower === '/неделя') {
    await send(htmlToWa(buildPeriodSummary(db, user.teamId, 'week')) || 'Нет данных.'); return;
  }
  if (lower === '/month' || lower === '/месяц') {
    await send(htmlToWa(buildPeriodSummary(db, user.teamId, 'month')) || 'Нет данных.'); return;
  }
  if (lower === '/tasks' || lower === '/задачи' || lower === 'мои задачи') {
    const emp = findEmployeeForUser(db, user.id, user.teamId);
    if (!emp) { await send('Ваш профиль ещё не привязан к карточке сотрудника. Попросите админа добавить вас в команду.'); return; }
    const rows = db.prepare('SELECT data FROM tasks WHERE team_id = ? ORDER BY rowid DESC LIMIT 200').all(user.teamId) as any[];
    const mine = rows.map(r => { try { return JSON.parse(r.data); } catch { return null; } })
      .filter((t: any) => t && t.assigneeId === emp.id && t.status !== 'done');
    if (mine.length === 0) { await send(`${emp.name}, открытых задач нет 🎉`); return; }
    const icon: Record<string, string> = { new: '🆕', in_progress: '⏳', review: '👀' };
    const lines = mine.slice(0, 20).map((t: any) => `${icon[t.status] || '•'} *${t.title}*${t.dueDate ? ` · 📅 ${t.dueDate}` : ''}${t.category ? ` · _${t.category}_` : ''}`);
    await send(`*Ваши задачи (${mine.length}):*\n\n${lines.join('\n')}${mine.length > 20 ? `\n\n…и ещё ${mine.length - 20}` : ''}`);
    return;
  }

  // ── Ожидающее подтверждение (Да/Нет) ────────────────────────────────
  const pending = getWaPending(db, user.id);
  if (pending) {
    if (YES_RE.test(text)) {
      clearWaPending(db, user.id);
      const { default: tools } = await import('./aiTools.js');
      const mod = tools.getToolModule(pending.toolName) || 'readonly';
      const isW = !tools.isReadOnly(pending.toolName);
      if (isW && !canRunTool(db, user.teamId, user.teamRole, mod, true)) {
        await send('⛔ Недостаточно прав для этого действия.'); return;
      }
      try {
        const result = await tools.execute(db, user.id, user.teamId, user.name, pending.toolName, pending.toolInput, logActivity);
        await send(`✅ ${result}`);
      } catch (e: any) { await send(`❌ Не удалось выполнить: ${String(e?.message || e).slice(0, 200)}`); }
      return;
    }
    if (NO_RE.test(text)) { clearWaPending(db, user.id); await send('Отменил.'); return; }
    // иначе — новый запрос, продолжаем ниже (старый pending останется до TTL)
  }

  // ── Свободный текст → AI-агент ──────────────────────────────────────
  appendWaHistory(db, user.id, 'user', text);
  let result;
  try {
    result = await runAgent({ db, userId: user.id, userName: user.name, userText: text, history: getWaHistory(db, user.id) });
  } catch (e: any) {
    await send('⚠️ Ассистент временно недоступен. Попробуйте позже.');
    return;
  }

  if (result.kind === 'reply') {
    appendWaHistory(db, user.id, 'assistant', result.text);
    await send(htmlToWa(result.text));
    return;
  }

  // Инструмент (запись/чтение)
  const { default: tools } = await import('./aiTools.js');
  const mod = tools.getToolModule(result.toolName) || 'readonly';
  const isWrite = !tools.isReadOnly(result.toolName);

  if (isWrite && !canRunTool(db, user.teamId, user.teamRole, mod, true)) {
    await send('⛔ У вас нет прав на это действие. Обратитесь к администратору.');
    return;
  }
  if (tools.isReadOnly(result.toolName)) {
    try {
      const r = await tools.execute(db, user.id, user.teamId, user.name, result.toolName, result.toolInput, logActivity);
      await send(htmlToWa(r));
    } catch { await send('Не удалось получить данные.'); }
    return;
  }
  // Запись: per-user разрешение
  const perm = getModulePermission(db, user.id, mod);
  if (perm === 'none') {
    await send('Действие требует ручного подтверждения в приложении (для этого модуля запрещено из бота).');
    try { logActivity(user.id, { user: user.name, actor: 'ai', type: 'ai', action: 'AI handoff: module none', target: result.summary?.slice(0, 200) }); } catch { /* ignore */ }
    return;
  }
  if (perm === 'auto') {
    try {
      const r = await tools.execute(db, user.id, user.teamId, user.name, result.toolName, result.toolInput, logActivity);
      await send(`✅ ${r}`);
    } catch (e: any) { await send(`❌ ${String(e?.message || e).slice(0, 200)}`); }
    return;
  }
  // confirm (по умолчанию)
  setWaPending(db, user.id, { toolName: result.toolName, toolInput: result.toolInput, summary: result.summary, expiresAt: new Date(Date.now() + 600_000).toISOString() });
  await send(`${result.summary}\n\nВыполнить? Ответьте «да» или «нет».`);
}

// ─── Проактивная отправка (best-effort) ───────────────────────────────
// Работает только внутри 24-часового окна WhatsApp (или для номеров, писавших
// боту недавно). Для гарантированных уведомлений вне окна нужны шаблоны Meta.
export async function waNotify(db: Database.Database, userId: string, text: string): Promise<boolean> {
  if (!isWaBotReady()) return false;
  const row = db.prepare('SELECT wa_id FROM whatsapp_links WHERE user_id = ?').get(userId) as any;
  if (!row?.wa_id) return false;
  const r = await sendWaText(row.wa_id, htmlToWa(text));
  return r.ok;
}

// ─── Проактивные ежедневные/недельные/месячные сводки по WhatsApp ──────
// Работает в пределах 24-часового окна WhatsApp (получатель писал боту
// недавно). Вне окна нужны утверждённые шаблоны Meta (фаза 2).
const TZ = 'Asia/Almaty';
const SUMMARY_HOUR = 9;
const almatyToday = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });          // YYYY-MM-DD
const almatyHour = () => Number(new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour12: false }).slice(0, 2));
const almatyDow = () => ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[
  new Date().toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' })] || 1;
const almatyDom = () => Number(almatyToday().slice(8, 10));

// Уважаем те же тумблеры отчётов, что и Telegram (team_settings).
function dailyEnabled(db: Database.Database, teamId: string): boolean {
  try { const r = db.prepare('SELECT daily_summary FROM team_settings WHERE team_id = ?').get(teamId) as any; if (!r?.daily_summary) return true; return JSON.parse(r.daily_summary).enabled !== false; } catch { return true; }
}
function reportKind(db: Database.Database, teamId: string, kind: 'daily' | 'weekly' | 'monthly'): boolean {
  try { const r = db.prepare('SELECT bot_settings FROM team_settings WHERE team_id = ?').get(teamId) as any; if (!r?.bot_settings) return kind !== 'monthly'; return !!JSON.parse(r.bot_settings)?.reports?.[kind]; } catch { return kind === 'daily'; }
}

// Получатели = WhatsApp-привязанные admin/manager команды.
function waRecipients(db: Database.Database, teamId: string): string[] {
  const rows = db.prepare(`SELECT w.wa_id FROM whatsapp_links w JOIN users u ON u.id = w.user_id
    WHERE u.team_id = ? AND w.wa_id IS NOT NULL AND u.team_role IN ('admin','manager')`).all(teamId) as any[];
  return rows.map(r => r.wa_id).filter(Boolean);
}
function waStateGet(db: Database.Database, teamId: string): { last_daily?: string; last_weekly?: string; last_monthly?: string } {
  return (db.prepare('SELECT last_daily, last_weekly, last_monthly FROM wa_summary_state WHERE team_id = ?').get(teamId) as any) || {};
}
function waStateSet(db: Database.Database, teamId: string, patch: Record<string, string>) {
  const cur = waStateGet(db, teamId);
  const next = { ...cur, ...patch };
  db.prepare(`INSERT INTO wa_summary_state (team_id, last_daily, last_weekly, last_monthly) VALUES (?, ?, ?, ?)
              ON CONFLICT(team_id) DO UPDATE SET last_daily=excluded.last_daily, last_weekly=excluded.last_weekly, last_monthly=excluded.last_monthly`)
    .run(teamId, next.last_daily || null, next.last_weekly || null, next.last_monthly || null);
}

async function waSummaryTick(db: Database.Database) {
  if (!isWaBotReady() || almatyHour() < SUMMARY_HOUR) return;
  const today = almatyToday();
  const teams = db.prepare(`SELECT DISTINCT u.team_id FROM whatsapp_links w JOIN users u ON u.id = w.user_id
    WHERE w.wa_id IS NOT NULL AND u.team_role IN ('admin','manager')`).all() as any[];
  for (const t of teams) {
    const teamId = t.team_id;
    if (!teamId) continue;
    const recipients = waRecipients(db, teamId);
    if (!recipients.length) continue;
    const st = waStateGet(db, teamId);

    // Ежедневная (09:00, раз в день)
    if (dailyEnabled(db, teamId) && st.last_daily !== today && reportKind(db, teamId, 'daily')) {
      try {
        const text = htmlToWa(buildDailySummary(db, teamId));
        for (const wa of recipients) await sendWaText(wa, text);
        waStateSet(db, teamId, { last_daily: today });
      } catch (e) { console.warn('[wa daily]', teamId, e); }
    }
    // Недельная (понедельник)
    if (almatyDow() === 1 && st.last_weekly !== today && reportKind(db, teamId, 'weekly')) {
      try {
        const text = htmlToWa(buildPeriodSummary(db, teamId, 'week'));
        for (const wa of recipients) await sendWaText(wa, text);
        waStateSet(db, teamId, { last_weekly: today });
      } catch (e) { console.warn('[wa weekly]', teamId, e); }
    }
    // Месячная (1-е число)
    const monthKey = today.slice(0, 7);
    if (almatyDom() === 1 && st.last_monthly !== monthKey && reportKind(db, teamId, 'monthly')) {
      try {
        const text = htmlToWa(buildPeriodSummary(db, teamId, 'month'));
        for (const wa of recipients) await sendWaText(wa, text);
        waStateSet(db, teamId, { last_monthly: monthKey });
      } catch (e) { console.warn('[wa monthly]', teamId, e); }
    }
  }
}

let waTimer: ReturnType<typeof setInterval> | null = null;
export function startWaSummaryScheduler(db: Database.Database) {
  if (waTimer || !isWaBotReady()) return;
  waTimer = setInterval(() => { void waSummaryTick(db); }, 60 * 1000);
  console.log('[wa-bot] daily summary scheduler started (09:00 Asia/Almaty)');
}
