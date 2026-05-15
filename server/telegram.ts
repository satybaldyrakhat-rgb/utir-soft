// Telegram Bot integration for Utir Soft platform AI assistant (Block F.1).
//
// Lives entirely server-side. The frontend never sees the bot token. A user
// pairs their Telegram chat with their platform account via the /link CODE flow:
// the platform issues a one-time code → user pastes it in chat → we save the
// (chat_id ↔ user_id) mapping. After that, every free-form message from this
// chat is treated as that user's request.

import Database from 'better-sqlite3';
import { runAgent, type AgentTurnContext } from './claudeAgent.js';

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

function findUserByChat(db: Database.Database, chatId: number): { id: string; name: string } | undefined {
  const row = db.prepare(`
    SELECT u.id, u.name FROM telegram_links tl
    JOIN users u ON u.id = tl.user_id
    WHERE tl.chat_id = ?
  `).get(chatId) as any;
  return row ? { id: row.id, name: row.name } : undefined;
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
  };
}

export async function handleUpdate(db: Database.Database, update: IncomingUpdate, logActivity: (userId: string, entry: any) => void) {
  const msg = update.message;
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const username = msg.from?.username;

  // --- Slash commands ------------------------------------------------
  if (text.startsWith('/')) {
    const [cmdRaw, ...args] = text.split(/\s+/);
    const cmd = cmdRaw.replace(/@.*$/, '').toLowerCase(); // strip @botname suffix

    if (cmd === '/start') {
      clearHistory(db, chatId);
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
        `• Создать задачу\n` +
        `• Показать сводку за день — /today\n\n` +
        `<b>Как работать:</b> просто пишите свободным текстом, чем подробнее тем лучше. ` +
        `Перед сохранением я присылаю резюме на подтверждение.\n\n` +
        `<b>Команды:</b>\n/start /help /link /today /cancel`,
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
      clearPending(db, chatId);
      clearHistory(db, chatId);
      await sendMessage(chatId, had ? 'Действие отменено. История диалога очищена.' : 'История диалога очищена.');
      return;
    }

    if (cmd === '/today') {
      const user = findUserByChat(db, chatId);
      if (!user) { await sendMessage(chatId, 'Сначала привяжите аккаунт: <code>/link КОД</code>'); return; }
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const rows = db.prepare(`SELECT data FROM activity_logs WHERE user_id = ? ORDER BY rowid DESC LIMIT 100`).all(user.id) as any[];
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

    await sendMessage(chatId, `Не знаю такой команды. Доступны: /start /help /link /today /cancel`);
    return;
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
        const result = await tools.execute(db, user.id, user.name, pendingAction.toolName, pendingAction.toolInput, logActivity);
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

  // Read-only tools (find_client and similar) run immediately and reply with the result.
  const { default: tools } = await import('./aiTools.js');
  if (tools.isReadOnly(agentResult.toolName)) {
    try {
      const result = await tools.execute(db, user.id, user.name, agentResult.toolName, agentResult.toolInput, logActivity);
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

  // Write tools — gate by the user's per-module permission setting.
  const toolModule = tools.getToolModule(agentResult.toolName);
  if (!toolModule) {
    const errReply = `Неизвестное действие: <code>${agentResult.toolName}</code>`;
    await sendMessage(chatId, errReply);
    appendHistory(db, chatId, 'assistant', stripHtml(errReply));
    logHandoff(logActivity, user.id, user.name, 'unknown tool', agentResult.toolName);
    return;
  }
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
      const result = await tools.execute(db, user.id, user.name, agentResult.toolName, agentResult.toolInput, logActivity);
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
