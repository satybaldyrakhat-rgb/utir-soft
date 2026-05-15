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
  const r = db.prepare('UPDATE telegram_links SET pending_action = ? WHERE chat_id = ?').run(payload, chatId);
  console.log(`[pending] SET chat=${chatId} tool=${p.toolName} rows=${r.changes}`);
}
function getPending(db: Database.Database, chatId: number): PendingAction | null {
  const row = db.prepare('SELECT pending_action FROM telegram_links WHERE chat_id = ?').get(chatId) as any;
  console.log(`[pending] GET chat=${chatId} raw=${row?.pending_action ? row.pending_action.slice(0, 80) : 'null'}`);
  if (!row?.pending_action) return null;
  try {
    const p = JSON.parse(row.pending_action) as PendingAction;
    if (!p || p.expiresAt < Date.now()) { clearPending(db, chatId); return null; }
    return p;
  } catch { clearPending(db, chatId); return null; }
}
function clearPending(db: Database.Database, chatId: number) {
  db.prepare('UPDATE telegram_links SET pending_action = NULL WHERE chat_id = ?').run(chatId);
  console.log(`[pending] CLEAR chat=${chatId}`);
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
      await sendMessage(chatId, had ? 'Действие отменено.' : 'Нечего отменять.');
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
  console.log(`[webhook] chat=${chatId} text="${text.slice(0, 60)}" pending=${pendingAction ? pendingAction.toolName : 'no'}`);
  if (pendingAction) {
    if (YES_RE.test(text)) {
      const user = findUserByChat(db, chatId);
      if (!user) { clearPending(db, chatId); await sendMessage(chatId, 'Аккаунт не привязан. /link КОД'); return; }
      try {
        const { default: tools } = await import('./aiTools.js');
        const result = await tools.execute(db, user.id, user.name, pendingAction.toolName, pendingAction.toolInput, logActivity);
        await sendMessage(chatId, `✅ Готово.\n\n${result}`);
      } catch (e: any) {
        await sendMessage(chatId, `❌ Не удалось сохранить: ${e.message || e}`);
      } finally {
        clearPending(db, chatId);
      }
      return;
    }
    if (NO_RE.test(text)) {
      clearPending(db, chatId);
      await sendMessage(chatId, `Отменил. Можете написать новый запрос.`);
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

  const ctx: AgentTurnContext = { db, userId: user.id, userName: user.name, userText: text };
  let agentResult;
  try { agentResult = await runAgent(ctx); }
  catch (e: any) {
    console.error('[telegram] agent failed', e);
    await sendMessage(chatId, `Не получилось обработать запрос. Попробуйте переформулировать.\n\n<code>${e.message || e}</code>`);
    return;
  }

  if (agentResult.kind === 'reply') {
    await sendMessage(chatId, agentResult.text);
    return;
  }

  // Tool was proposed → store as pending and ask the user to confirm.
  setPending(db, chatId, { toolName: agentResult.toolName, toolInput: agentResult.toolInput, summary: agentResult.summary });
  await sendMessage(chatId, agentResult.summary + `\n\n<i>Подтвердите — «Да» или «Нет».</i>`);
}
