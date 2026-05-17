import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleUpdate, issueLinkCode, getLinkStatus, unlink, isTelegramReady, sendMessage as tgSendMessage, registerBotCommands } from './telegram.js';
import { isClaudeReady, runAgent as claudeRunAgent } from './claudeAgent.js';
import { sendEmail, isEmailReady, otpTemplate, inviteTemplate } from './email.js';
import { generate as aiImageGenerate, providerStatuses as aiImageProviders, type ProviderId } from './aiImage.js';
import { chat as aiChat, chatProviderStatuses, type ChatProviderId, type ChatMessage } from './aiChat.js';
import aiTools from './aiTools.js';
import { getPermissionLevel as getPermLevel, canRunTool } from './permissions.js';
import { transcribeAudio, parseAudioDataUrl, isWhisperReady } from './whisper.js';
import { readClientAI, writeClientAI, runClientAITest, DEFAULT_CLIENT_AI, ALL_CLIENT_AI_MODELS, type ClientAIConfig, type DayKey } from './clientAi.js';
import { createHmac, randomBytes } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || 'utir-soft-dev-secret-change-me';
const PORT = Number(process.env.PORT) || 4010;
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'utir.db');

const db = new Database(DB_PATH);
console.log(`[server] using database at ${DB_PATH}`);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT DEFAULT '',
  verification_code TEXT,
  email_verified INTEGER DEFAULT 0,
  terms_accepted_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deals_user ON deals(user_id);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);

CREATE TABLE IF NOT EXISTS telegram_links (
  user_id TEXT PRIMARY KEY,
  chat_id INTEGER UNIQUE,
  link_code TEXT,
  code_expires_at TEXT,
  linked_at TEXT,
  username TEXT
);
CREATE INDEX IF NOT EXISTS idx_telegram_chat ON telegram_links(chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_code ON telegram_links(link_code);

-- Block C.2 — team invitations. One row per pending invite. Used codes stay
-- around for audit; pruning is left to a future maintenance pass.
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  email TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invitations_team ON invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_invitations_code ON invitations(code);

-- Phase 2 of role gating — per-team role permissions matrix.
-- One row per team, holding the JSON-encoded {role: {module: 'full'|'view'|'none'}}.
CREATE TABLE IF NOT EXISTS team_settings (
  team_id TEXT PRIMARY KEY,
  role_permissions TEXT,
  updated_at TEXT
);

-- Per-deal audit trail. One row per PATCH that actually changes something.
-- 'changes' is JSON: { fieldName: { before: …, after: … }, … }.
CREATE TABLE IF NOT EXISTS deal_history (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT,
  changes TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deal_history_deal ON deal_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_history_team ON deal_history(team_id);

-- Outbound webhook subscriptions. Admin sets these up in Настройки →
-- Интеграции; emitEvent fans out each event to every active subscription
-- whose event_types include the matching type.
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  event_types TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  last_status TEXT,
  last_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_webhooks_team ON webhooks(team_id);

-- AI Дизайн — каждый generate сохраняется тут чтобы команда видела историю.
-- image_url пустой если провайдер вернул base64; в таком случае image_data
-- хранит data:image/...;base64,... строку.
CREATE TABLE IF NOT EXISTS ai_generations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT,
  provider TEXT NOT NULL,
  prompt TEXT NOT NULL,
  image_url TEXT,
  image_data TEXT,
  enhanced_prompt TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_generations_team ON ai_generations(team_id);

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  -- JSON array: [{ role: 'user'|'assistant', content: string, ts: string }]
  messages TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_user ON ai_chat_sessions(user_id);
`);

// Idempotent migration: add columns if missing. Returns true when column was just added.
function migrateColumn(table: string, column: string, ddl: string): boolean {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`); return true; }
  catch (e: any) {
    if (String(e?.message || '').includes('duplicate column')) return false;
    throw e;
  }
}
// Pending tool-confirmation state for the Telegram bot — moved from in-memory to DB
// after we observed Railway restarting the process between requests and dropping the Map.
migrateColumn('telegram_links', 'pending_action', 'TEXT');
migrateColumn('telegram_links', 'chat_history', 'TEXT');
// Multi-turn /design wizard state — JSON with current step + answers so far.
migrateColumn('telegram_links', 'design_state', 'TEXT');
migrateColumn('users', 'company', "TEXT DEFAULT ''");
migrateColumn('users', 'verification_code', 'TEXT');
const verifiedJustAdded = migrateColumn('users', 'email_verified', 'INTEGER DEFAULT 0');
migrateColumn('users', 'terms_accepted_at', 'TEXT');
// AI assistant settings (Block F.4 — per-module permissions for Telegram bot)
// Stored as a JSON blob of the same shape as AISettings on the frontend.
migrateColumn('users', 'ai_settings', 'TEXT');

// First time email_verified column appears → all pre-existing users predate verification, mark them verified.
if (verifiedJustAdded) {
  db.exec(`UPDATE users SET email_verified = 1`);
  console.log('[migration] back-filled email_verified=1 for existing users');
}

// ─── Block C.2 / P4 — Multi-tenancy via team_id ───────────────────────────
// Every existing user becomes the owner of their own one-person team
// (team_id = user.id, team_role = 'admin'). New users invited via /api/invitations
// inherit the inviter's team_id and the role specified on the invite.
const teamIdJustAdded = migrateColumn('users', 'team_id', 'TEXT');
migrateColumn('users', 'team_role', "TEXT DEFAULT 'admin'");
migrateColumn('users', 'invited_by', 'TEXT');
// Set when an admin removes a teammate from the team — blocks future logins.
migrateColumn('users', 'disabled_at', 'TEXT');
// Phase 4 — admin-defined role list (e.g. 'Бухгалтер', 'Мастер'). Stored as a
// JSON array on the same team_settings row alongside the existing matrix.
migrateColumn('team_settings', 'team_roles', 'TEXT');
// AI generation quotas — JSON map { roleId: monthlyLimit|null }. null = unlimited.
migrateColumn('team_settings', 'ai_quotas', 'TEXT');
// Brand kit — JSON { photorealism: bool, styleHint: string } injected into
// every AI Дизайн prompt so the whole team's generations look consistent.
migrateColumn('team_settings', 'brand_kit', 'TEXT');
// Client-facing AI config — JSON used by Instagram / WhatsApp webhooks when
// auto-replying to customers. See ClientAIConfig below for the shape.
migrateColumn('team_settings', 'client_ai', 'TEXT');
// Company requisites — JSON { legalName, bin, iban, bik, ... } used by
// invoice PDFs. Lives on team_settings so the whole team uses the same
// bank details on every счёт the admin prints.
migrateColumn('team_settings', 'company_requisites', 'TEXT');
if (teamIdJustAdded) {
  db.exec(`UPDATE users SET team_id = id WHERE team_id IS NULL`);
  db.exec(`UPDATE users SET team_role = 'admin' WHERE team_role IS NULL`);
  console.log('[migration] back-filled team_id=id and team_role=admin for existing users');
}

// Each shared data table gets a team_id column. Pre-existing rows belong to the
// creator's personal team (team_id = user_id), so single-user installs see no
// change.
const SHARED_TABLES = ['deals', 'employees', 'tasks', 'products', 'transactions', 'activity_logs'] as const;
for (const t of SHARED_TABLES) {
  const justAdded = migrateColumn(t, 'team_id', 'TEXT');
  if (justAdded) {
    db.exec(`UPDATE ${t} SET team_id = user_id WHERE team_id IS NULL`);
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_${t}_team ON ${t}(team_id)`); } catch {}
    console.log(`[migration] back-filled team_id for ${t}`);
  }
}

// Ensure every user has a matching row in the employees table (so the team list
// in Settings → Команда reflects everyone who has actually joined the team).
// Idempotent: skips users who already have a corresponding employees row.
try {
  const orphans = db.prepare(
    `SELECT u.id, u.name, u.email, u.team_id, u.team_role, u.created_at
     FROM users u
     WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id)`
  ).all() as any[];
  if (orphans.length > 0) {
    const insert = db.prepare('INSERT INTO employees (id, user_id, team_id, data) VALUES (?, ?, ?, ?)');
    const tx = db.transaction(() => {
      for (const u of orphans) {
        const empId = 'e' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        const initial = (String(u.name || '?').charAt(0) || '?').toUpperCase();
        const data = {
          id: empId,
          name: u.name || '',
          email: u.email || '',
          phone: '',
          role: (u.team_role as string) || 'admin',
          department: '',
          status: 'active',
          salary: 0,
          joinDate: (u.created_at || new Date().toISOString()).slice(0, 10),
          lastActive: new Date().toISOString(),
          avatar: initial,
          permissions: { sales: true, finance: u.team_role === 'admin', warehouse: false, chats: true, analytics: u.team_role === 'admin', settings: u.team_role === 'admin' },
          performance: { ordersCompleted: 0, rating: 0, efficiency: 0 },
        };
        insert.run(empId, u.id, u.team_id || u.id, JSON.stringify(data));
      }
    });
    tx();
    console.log(`[migration] created ${orphans.length} employees row(s) for users without one`);
  }
} catch (e) { console.warn('[migration] employees backfill failed', e); }

// Sync users.team_role with employees.data.role for any rows that diverged
// (most often: users created before users.team_role column existed got the
// default 'admin' even though their employees row says 'manager'/'employee').
// Source of truth is the employees row because that's what the admin edits
// in the UI; the UPDATE in role-PATCH already keeps both in sync going forward.
try {
  const rows = db.prepare(`SELECT u.id as user_id, u.team_role, e.data FROM users u JOIN employees e ON e.user_id = u.id`).all() as any[];
  let synced = 0;
  for (const r of rows) {
    try {
      const empRole = JSON.parse(r.data)?.role;
      if (empRole && empRole !== r.team_role) {
        db.prepare('UPDATE users SET team_role = ? WHERE id = ?').run(empRole, r.user_id);
        synced++;
      }
    } catch { /* skip rows with bad JSON */ }
  }
  if (synced > 0) console.log(`[migration] synced team_role for ${synced} user(s) from their employees row`);
} catch (e) { console.warn('[migration] team_role sync failed', e); }

const DEFAULT_INTEGRATIONS = [
  { id: 'whatsapp', name: 'WhatsApp Business', desc: 'Сообщения WhatsApp', connected: false, cat: 'msg' },
  { id: 'telegram', name: 'Telegram Bot', desc: 'Боты и уведомления', connected: false, cat: 'msg' },
  { id: 'instagram', name: 'Instagram', desc: 'Instagram бизнес', connected: false, cat: 'msg' },
  { id: 'tiktok', name: 'TikTok Business', desc: 'Реклама и аналитика', connected: false, cat: 'msg' },
  { id: 'kaspi-qr', name: 'Kaspi QR', desc: 'Приём платежей через QR-код Kaspi', connected: false, cat: 'fin' },
  { id: '1c', name: '1С:Предприятие', desc: 'Бухгалтерия', connected: false, cat: 'fin' },
  { id: 'chatgpt', name: 'ChatGPT', desc: 'AI для клиентов', connected: false, cat: 'ai' },
  { id: 'gemini', name: 'Google Gemini', desc: 'AI контент', connected: false, cat: 'ai' },
  { id: 'google', name: 'Google Workspace', desc: 'Календарь, почта', connected: false, cat: 'other' },
  { id: 'meta', name: 'Meta Business', desc: 'FB / IG реклама', connected: false, cat: 'other' },
];

function seedIntegrations(userId: string) {
  const exists = db.prepare('SELECT COUNT(*) as c FROM integrations WHERE user_id = ?').get(userId) as { c: number };
  if (exists.c > 0) return;
  const insert = db.prepare('INSERT INTO integrations (id, user_id, data) VALUES (?, ?, ?)');
  const tx = db.transaction(() => {
    for (const ig of DEFAULT_INTEGRATIONS) {
      insert.run(ig.id, userId, JSON.stringify(ig));
    }
  });
  tx();
}

const app = express();
app.use(cors());
// Bumped to 25MB because AI-design img2img sends base64 images for the room
// photo + up to 3 reference shots in one body.
app.use(express.json({ limit: '25mb' }));

interface AuthedRequest extends Request {
  userId?: string;
  teamId?: string;
  // Free-form so custom team roles ('accountant' etc.) pass through. The
  // built-in hierarchy in roleAtLeast still works for the three named values.
  teamRole?: string;
}

function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    req.userId = payload.sub;
    // Resolve the team this user belongs to. Single extra SELECT per request —
    // fine for SQLite. Falls back to user_id so legacy tokens always work.
    const row = db.prepare('SELECT team_id, team_role, disabled_at FROM users WHERE id = ?').get(payload.sub) as any;
    // Disabled users (kicked from team) lose access immediately — their existing
    // tokens stop working until an admin re-enables them.
    if (row?.disabled_at) return res.status(403).json({ error: 'account disabled' });
    req.teamId = row?.team_id || payload.sub;
    req.teamRole = (row?.team_role as string) || 'admin';
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

function newId(prefix: string) {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ─── Role-based access (Phase 1) ──────────────────────────────────
// Hierarchy: admin > manager > employee. A handler that requires at least
// 'manager' lets admins through too; 'employee' lets everyone in the team.
const ROLE_RANK: Record<string, number> = { admin: 3, manager: 2, employee: 1 };
function roleAtLeast(role: string | undefined, min: 'admin' | 'manager' | 'employee'): boolean {
  return (ROLE_RANK[role || ''] || 0) >= ROLE_RANK[min];
}
function requireRole(min: 'admin' | 'manager' | 'employee') {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!roleAtLeast(req.teamRole, min)) {
      return res.status(403).json({ error: `requires ${min} role` });
    }
    next();
  };
}

// Append an entry to the user's activity log. Used by auth handlers so we can record
// login/signup/verify events server-side (frontend can't insert before it has a token).
function logActivity(userId: string, entry: Record<string, any>) {
  const id = newId('a_');
  const data = { id, timestamp: new Date().toISOString(), actor: 'human', ...entry };
  try {
    // Look up team to scope the entry; falls back to userId for legacy / orphaned rows.
    const row = db.prepare('SELECT team_id FROM users WHERE id = ?').get(userId) as any;
    const teamId = row?.team_id || userId;
    db.prepare('INSERT INTO activity_logs (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(id, userId, teamId, JSON.stringify(data));
  } catch (e) { console.warn('[logActivity] failed', e); }
}

// ─── Outbound webhooks (public API) ─────────────────────────────────
// Fire-and-forget POST to every active subscription whose event_types
// list contains `event`. Each request carries an HMAC signature of the
// body so the receiver can verify it came from us.
function emitEvent(teamId: string, event: string, payload: any) {
  let rows: any[] = [];
  try {
    rows = db.prepare('SELECT id, url, secret, event_types FROM webhooks WHERE team_id = ? AND active = 1').all(teamId) as any[];
  } catch { return; }
  if (rows.length === 0) return;
  const body = JSON.stringify({
    event,
    teamId,
    occurredAt: new Date().toISOString(),
    data: payload,
  });
  for (const r of rows) {
    let types: string[] = [];
    try { types = JSON.parse(r.event_types || '[]'); } catch { /* skip */ }
    // '*' subscription matches all events. Otherwise list must include this event.
    if (!types.includes('*') && !types.includes(event)) continue;
    const sig = createHmac('sha256', r.secret).update(body).digest('hex');
    // Don't await — webhook delivery must never block the originating API call.
    fetch(r.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-UtirSoft-Event': event,
        'X-UtirSoft-Signature': `sha256=${sig}`,
      },
      body,
    })
      .then(res => {
        db.prepare('UPDATE webhooks SET last_status = ?, last_at = datetime(\'now\') WHERE id = ?').run(`${res.status}`, r.id);
      })
      .catch(err => {
        db.prepare('UPDATE webhooks SET last_status = ?, last_at = datetime(\'now\') WHERE id = ?').run(`err:${String(err).slice(0, 80)}`, r.id);
      });
  }
}

// ─── AUTH ──────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
function passwordOk(p: string): { ok: boolean; reason?: string } {
  if (typeof p !== 'string' || p.length < PASSWORD_MIN) return { ok: false, reason: `password must be at least ${PASSWORD_MIN} chars` };
  if (!/[A-Za-zА-Яа-яЁё]/.test(p)) return { ok: false, reason: 'password must contain a letter' };
  if (!/\d/.test(p)) return { ok: false, reason: 'password must contain a digit' };
  return { ok: true };
}
function genVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name, company, termsAccepted, inviteCode } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email))) return res.status(400).json({ error: 'invalid email' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  if (!termsAccepted) return res.status(400).json({ error: 'terms must be accepted' });
  const pwdCheck = passwordOk(password);
  if (!pwdCheck.ok) return res.status(400).json({ error: pwdCheck.reason });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'email already registered' });

  // If an inviteCode is provided we'll join that team; otherwise the user starts
  // their own team-of-one. `company` is required only for new-team signups
  // (invited members inherit the inviter's company from the team).
  let joinTeamId: string | null = null;
  // Free-form role id — admins can create custom roles like 'Бухгалтер'.
  let joinRole: string = 'admin';
  let invitationRow: any = null;
  let inviterCompany = '';
  if (inviteCode) {
    invitationRow = db.prepare(
      `SELECT i.id, i.team_id, i.role, i.expires_at, i.used_at, u.company
       FROM invitations i JOIN users u ON u.id = i.created_by
       WHERE i.code = ?`
    ).get(String(inviteCode).toUpperCase().trim()) as any;
    if (!invitationRow) return res.status(400).json({ error: 'invalid invite code' });
    if (invitationRow.used_at) return res.status(400).json({ error: 'invite already used' });
    if (new Date(invitationRow.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'invite expired' });
    joinTeamId = invitationRow.team_id;
    joinRole = invitationRow.role as string;
    inviterCompany = invitationRow.company || '';
  } else {
    if (!company || !String(company).trim()) return res.status(400).json({ error: 'company required' });
  }

  const hash = await bcrypt.hash(password, 10);
  const id = newId('u_');
  const verifyCode = genVerificationCode();
  const finalCompany = joinTeamId ? (inviterCompany || String(company || '').trim()) : String(company).trim();
  const finalTeamId = joinTeamId || id; // own-team starter uses their own id as team_id

  db.prepare(
    `INSERT INTO users
       (id, email, password_hash, name, company, verification_code, email_verified, terms_accepted_at, team_id, team_role, invited_by)
     VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), ?, ?, ?)`
  ).run(
    id, String(email).toLowerCase(), hash, String(name).trim(), finalCompany,
    verifyCode, finalTeamId, joinRole, invitationRow?.id || null,
  );

  if (invitationRow) {
    db.prepare('UPDATE invitations SET used_at = datetime(\'now\'), used_by = ? WHERE id = ?').run(id, invitationRow.id);
  }

  // Materialise a row in the employees table so this user immediately shows up
  // under Settings → Команда. Done for both invite and self-signup paths.
  {
    const empId = newId('e');
    const initial = (String(name).trim().charAt(0) || '?').toUpperCase();
    const isAdmin = joinRole === 'admin';
    const employeeData = {
      id: empId,
      name: String(name).trim(),
      email: String(email).toLowerCase(),
      phone: '',
      role: joinRole,
      department: '',
      status: 'active',
      salary: 0,
      joinDate: new Date().toISOString().slice(0, 10),
      lastActive: new Date().toISOString(),
      avatar: initial,
      permissions: {
        sales: true, finance: isAdmin, warehouse: false, chats: true,
        analytics: isAdmin, settings: isAdmin,
      },
      performance: { ordersCompleted: 0, rating: 0, efficiency: 0 },
    };
    db.prepare('INSERT INTO employees (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(
      empId, id, finalTeamId, JSON.stringify(employeeData),
    );
  }

  seedIntegrations(id);
  logActivity(id, {
    user: String(name).trim(),
    action: invitationRow ? `Присоединился к команде (роль: ${joinRole})` : 'Зарегистрировался в системе',
    target: String(email).toLowerCase(), type: invitationRow ? 'invite' : 'login', page: 'auth',
  });

  // Fire-and-forget OTP email. If Resend / SMTP isn't configured we still
  // surface the code in the JSON response so dev / local works as before.
  const otp = otpTemplate(verifyCode);
  const emailResult = await sendEmail(String(email).toLowerCase(), otp.subject, otp.html, otp.text);

  const token = jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    token,
    user: { id, email, name, company: finalCompany, emailVerified: false, teamRole: joinRole },
    // Only include the code when no email was actually sent — protects against
    // leaking the code in the response once real email is wired up.
    verificationCode: emailResult.ok ? undefined : verifyCode,
    emailSent: emailResult.ok,
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const user = db.prepare('SELECT id, email, name, company, password_hash, email_verified, verification_code, team_role, disabled_at FROM users WHERE email = ?').get(String(email).toLowerCase()) as any;
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  if (user.disabled_at) return res.status(403).json({ error: 'account disabled' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  seedIntegrations(user.id);
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '30d' });
  const verified = !!user.email_verified;
  logActivity(user.id, { user: user.name, action: 'Вошёл в систему', target: user.email, type: 'login', page: 'auth' });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, company: user.company || '', emailVerified: verified, teamRole: user.team_role || 'admin' },
    // If not verified, also return the pending code so the OTP screen can pre-fill / display it.
    verificationCode: verified ? undefined : user.verification_code,
  });
});

app.post('/api/auth/verify-email', authMiddleware, (req: AuthedRequest, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code required' });
  const user = db.prepare('SELECT verification_code, email_verified FROM users WHERE id = ?').get(req.userId!) as any;
  if (!user) return res.status(404).json({ error: 'user not found' });
  if (user.email_verified) return res.json({ emailVerified: true });
  if (String(user.verification_code) !== String(code).trim()) return res.status(400).json({ error: 'invalid code' });
  db.prepare('UPDATE users SET email_verified = 1, verification_code = NULL WHERE id = ?').run(req.userId!);
  const u = db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.userId!) as any;
  if (u) logActivity(req.userId!, { user: u.name, action: 'Подтвердил email', target: u.email, type: 'settings', page: 'auth' });
  res.json({ emailVerified: true });
});

app.post('/api/auth/resend-code', authMiddleware, async (req: AuthedRequest, res) => {
  const user = db.prepare('SELECT email, email_verified FROM users WHERE id = ?').get(req.userId!) as any;
  if (!user) return res.status(404).json({ error: 'user not found' });
  if (user.email_verified) return res.status(400).json({ error: 'already verified' });
  const code = genVerificationCode();
  db.prepare('UPDATE users SET verification_code = ? WHERE id = ?').run(code, req.userId!);
  const otp = otpTemplate(code);
  const emailResult = await sendEmail(user.email, otp.subject, otp.html, otp.text);
  res.json({
    // Dev fallback: surface the code so the OTP screen still works when no email provider.
    verificationCode: emailResult.ok ? undefined : code,
    emailSent: emailResult.ok,
  });
});

app.get('/api/auth/me', authMiddleware, (req: AuthedRequest, res) => {
  const user = db.prepare('SELECT id, email, name, company, email_verified, team_role FROM users WHERE id = ?').get(req.userId!) as any;
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json({ user: { id: user.id, email: user.email, name: user.name, company: user.company || '', emailVerified: !!user.email_verified, teamRole: user.team_role || 'admin' } });
});

app.post('/api/auth/logout', authMiddleware, (req: AuthedRequest, res) => {
  const u = db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.userId!) as any;
  if (u) logActivity(req.userId!, { user: u.name, action: 'Вышел из системы', target: u.email, type: 'logout', page: 'auth' });
  res.json({ ok: true });
});

// ─── GENERIC CRUD ROUTER FACTORY ───────────────────────
// Filters by team_id, not user_id — every team member sees the same data.
// user_id is still recorded on INSERT as audit (who created the row), but
// access checks all go through team_id.
function makeCrud(table: string, idPrefix: string) {
  const r = express.Router();
  r.use(authMiddleware);

  r.get('/', (req: AuthedRequest, res) => {
    const rows = db.prepare(`SELECT id, data FROM ${table} WHERE team_id = ? ORDER BY rowid DESC`).all(req.teamId!) as any[];
    res.json(rows.map(r => ({ ...JSON.parse(r.data), id: r.id })));
  });

  r.post('/', (req: AuthedRequest, res) => {
    const body = req.body || {};
    const id = body.id || newId(idPrefix);
    const data = { ...body, id };
    db.prepare(`INSERT INTO ${table} (id, user_id, team_id, data) VALUES (?, ?, ?, ?)`).run(id, req.userId!, req.teamId!, JSON.stringify(data));
    res.json(data);
  });

  r.patch('/:id', (req: AuthedRequest, res) => {
    const row = db.prepare(`SELECT data FROM ${table} WHERE id = ? AND team_id = ?`).get(req.params.id, req.teamId!) as any;
    if (!row) return res.status(404).json({ error: 'not found' });
    const updated = { ...JSON.parse(row.data), ...req.body, id: req.params.id };
    db.prepare(`UPDATE ${table} SET data = ? WHERE id = ? AND team_id = ?`).run(JSON.stringify(updated), req.params.id, req.teamId!);
    res.json(updated);
  });

  r.delete('/:id', (req: AuthedRequest, res) => {
    db.prepare(`DELETE FROM ${table} WHERE id = ? AND team_id = ?`).run(req.params.id, req.teamId!);
    res.json({ ok: true });
  });

  return r;
}

// Data routes are gated by the team's role-permissions matrix (Phase 2b):
//   - none  → 403 on anything (the route is hidden in the sidebar anyway)
//   - view  → 403 on POST/PATCH/PUT/DELETE; GET allowed
//   - full  → all methods allowed
// Tasks intentionally stay open to every team member — no matrix key for it.
// Deal-status notifications. Intercept PATCH /api/deals/:id before the
// generic CRUD: if `status` changed and the deal has an ownerId (or a
// matched paired teammate), DM them on Telegram with the new stage.
app.patch('/api/deals/:id', authMiddleware, requirePermission('orders'), async (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT data FROM deals WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  const before = JSON.parse(row.data);
  const updated = { ...before, ...req.body, id: req.params.id };
  db.prepare('UPDATE deals SET data = ? WHERE id = ? AND team_id = ?').run(JSON.stringify(updated), req.params.id, req.teamId!);

  // ─── Audit trail ─────────────────────────────────────────────────
  // Compute a per-field diff and store it so the deal modal can show
  // 'who changed what when'. Skip noisy fields like progress (auto-derived).
  const SKIP = new Set(['id', 'progress']);
  const changes: Record<string, { before: any; after: any }> = {};
  for (const key of Object.keys(req.body || {})) {
    if (SKIP.has(key)) continue;
    const a = before[key];
    const b = updated[key];
    // Deep compare via JSON.stringify so nested paymentMethods / arrays work.
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes[key] = { before: a ?? null, after: b ?? null };
    }
  }
  if (Object.keys(changes).length > 0) {
    try {
      const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId!) as any;
      db.prepare('INSERT INTO deal_history (id, deal_id, team_id, user_id, user_name, changes) VALUES (?, ?, ?, ?, ?, ?)').run(
        newId('dh_'), req.params.id, req.teamId!, req.userId!, actor?.name || '', JSON.stringify(changes),
      );
    } catch (e) { console.warn('[deals history] insert failed', e); }
  }

  const statusChanged = updated.status && updated.status !== before.status;
  if (statusChanged && isTelegramReady()) {
    try {
      // Resolve the deal's owner. Prefer ownerId; fall back to a name match
      // on the role fields, same rules as the team-metrics tab.
      let ownerEmpRow: any = null;
      if (updated.ownerId) {
        ownerEmpRow = db.prepare('SELECT data FROM employees WHERE id = ? AND team_id = ?').get(updated.ownerId, req.teamId!) as any;
      } else {
        const candidates = [updated.measurer, updated.designer, updated.foreman, updated.architect].filter(Boolean);
        if (candidates.length > 0) {
          const allEmps = db.prepare('SELECT id, data FROM employees WHERE team_id = ?').all(req.teamId!) as any[];
          for (const r of allEmps) {
            try {
              const d = JSON.parse(r.data);
              const nameLow = (d.name || '').toLowerCase();
              if (!nameLow) continue;
              const firstLow = nameLow.split(/\s+/)[0] || '';
              const hit = candidates.some((v: string) => {
                const vLow = (v || '').toLowerCase();
                return vLow.includes(nameLow) || (firstLow.length > 2 && vLow.includes(firstLow));
              });
              if (hit) { ownerEmpRow = r; break; }
            } catch { /* skip */ }
          }
        }
      }
      if (ownerEmpRow) {
        const ownerData = JSON.parse(ownerEmpRow.data);
        const email = (ownerData.email || '').toLowerCase();
        if (email) {
          const user = db.prepare('SELECT id FROM users WHERE email = ? AND team_id = ?').get(email, req.teamId!) as any;
          if (user) {
            const link = db.prepare('SELECT chat_id FROM telegram_links WHERE user_id = ? AND chat_id IS NOT NULL').get(user.id) as any;
            if (link?.chat_id) {
              const STAGE_LABEL: Record<string, string> = {
                new: '🆕 Новая заявка',
                measured: '📐 Замер',
                'project-agreed': '✍️ Проект и договор',
                production: '🏭 Производство',
                installation: '🚚 Установка',
                completed: '✅ Завершено',
                rejected: '❌ Отказ',
              };
              const fromL = STAGE_LABEL[before.status] || before.status || '—';
              const toL = STAGE_LABEL[updated.status] || updated.status;
              const amount = updated.amount ? `${Math.round(updated.amount).toLocaleString('ru-RU').replace(/,/g, ' ')} ₸` : '';
              const msg =
                `<b>Статус сделки изменён</b>\n` +
                `${updated.customerName || 'Сделка'}${amount ? ` · ${amount}` : ''}\n\n` +
                `<i>${fromL}</i>  →  <b>${toL}</b>\n\n` +
                `Открыть на платформе → Заказы`;
              await tgSendMessage(link.chat_id, msg);
            }
          }
        }
      }
    } catch (e) { console.warn('[deals] tg notify on status change failed', e); }
    // External webhook fan-out — separate event from the generic update so
    // consumers can listen specifically for stage transitions.
    emitEvent(req.teamId!, 'deal.status_changed', { dealId: req.params.id, from: before.status, to: updated.status, deal: updated });
  }
  // Always emit a generic 'deal.updated' too (with the same diff that landed
  // in deal_history) so integrations that want all changes can subscribe once.
  if (Object.keys(changes).length > 0) {
    emitEvent(req.teamId!, 'deal.updated', { dealId: req.params.id, changes, deal: updated });
  }

  res.json(updated);
});

// Audit-trail readback. Returns the deal_history rows newest-first.
// Same module-permission as deals read (orders), so view-only roles see it too.
app.get('/api/deals/:id/history', authMiddleware, requirePermission('orders'), (req: AuthedRequest, res) => {
  // Cross-check the deal exists in this team before returning history.
  const own = db.prepare('SELECT 1 FROM deals WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!);
  if (!own) return res.status(404).json({ error: 'not found' });
  const rows = db.prepare(
    'SELECT id, user_id, user_name, changes, created_at FROM deal_history WHERE deal_id = ? AND team_id = ? ORDER BY rowid DESC LIMIT 500',
  ).all(req.params.id, req.teamId!) as any[];
  res.json(rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    changes: (() => { try { return JSON.parse(r.changes); } catch { return {}; } })(),
    createdAt: r.created_at,
  })));
});

// Rollback a single history entry — applies its 'before' values back to the
// deal. Writes a new history row so the rollback itself is auditable and
// can be re-rolled forward via the same UI.
// Requires write permission on orders (otherwise users with view-only would
// be able to mutate via this endpoint).
app.post('/api/deals/:id/history/:entryId/rollback', authMiddleware, requirePermission('orders'), async (req: AuthedRequest, res) => {
  const dealRow = db.prepare('SELECT data FROM deals WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!) as any;
  if (!dealRow) return res.status(404).json({ error: 'deal not found' });
  const entryRow = db.prepare('SELECT changes FROM deal_history WHERE id = ? AND deal_id = ? AND team_id = ?').get(req.params.entryId, req.params.id, req.teamId!) as any;
  if (!entryRow) return res.status(404).json({ error: 'history entry not found' });

  let entryChanges: Record<string, { before: any; after: any }> = {};
  try { entryChanges = JSON.parse(entryRow.changes); } catch { return res.status(400).json({ error: 'corrupt history entry' }); }
  const fieldKeys = Object.keys(entryChanges);
  if (fieldKeys.length === 0) return res.status(400).json({ error: 'nothing to roll back' });

  const before = JSON.parse(dealRow.data);
  const updated = { ...before };
  // For each field touched in the entry, restore its 'before' value.
  const rollbackDiff: Record<string, { before: any; after: any }> = {};
  for (const key of fieldKeys) {
    const targetVal = entryChanges[key].before;
    if (JSON.stringify(before[key]) !== JSON.stringify(targetVal)) {
      rollbackDiff[key] = { before: before[key] ?? null, after: targetVal ?? null };
      updated[key] = targetVal;
    }
  }
  if (Object.keys(rollbackDiff).length === 0) {
    return res.status(400).json({ error: 'fields already match the target state' });
  }

  db.prepare('UPDATE deals SET data = ? WHERE id = ? AND team_id = ?').run(JSON.stringify(updated), req.params.id, req.teamId!);
  // Record the rollback as its own history entry — keeps the timeline honest.
  try {
    const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId!) as any;
    db.prepare('INSERT INTO deal_history (id, deal_id, team_id, user_id, user_name, changes) VALUES (?, ?, ?, ?, ?, ?)').run(
      newId('dh_'), req.params.id, req.teamId!, req.userId!,
      `${actor?.name || ''} (rollback)`,
      JSON.stringify(rollbackDiff),
    );
  } catch (e) { console.warn('[deals rollback] history insert failed', e); }
  // Webhook fan-out so external systems learn about the rollback too.
  emitEvent(req.teamId!, 'deal.updated', { dealId: req.params.id, changes: rollbackDiff, deal: updated, rolledBackFrom: req.params.entryId });
  res.json({ ok: true, changes: rollbackDiff, deal: updated });
});

app.use('/api/deals', authMiddleware, requirePermission('orders'), makeCrud('deals', 'D'));

// Custom DELETE on /api/employees/:id — must register BEFORE the generic
// makeCrud router so this handler matches first. When the employees row
// corresponds to an actual user (matched by email), also disable that user
// and detach them from the team so they lose access. For manually-added
// employee records (no matching auth user) the behaviour is unchanged.
// Promote / demote a teammate (Phase 3 of role gating).
// Resolves the linked auth user via the employees row's email, refuses self,
// updates users.team_role and the employees data blob in one shot.
app.patch('/api/employees/:id/role', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const role = String(req.body?.role || '');
  if (!ROLE_RANK[role]) return res.status(400).json({ error: 'invalid role' });
  const empRow = db.prepare('SELECT data FROM employees WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!) as any;
  if (!empRow) return res.status(404).json({ error: 'not found' });
  const data = JSON.parse(empRow.data);
  const email = String(data.email || '').toLowerCase();
  if (!email) return res.status(400).json({ error: 'employee has no email' });
  const target = db.prepare('SELECT id, name, team_role FROM users WHERE email = ? AND team_id = ?').get(email, req.teamId!) as any;
  if (!target) return res.status(400).json({ error: 'no linked auth account' });
  if (target.id === req.userId) return res.status(400).json({ error: 'cannot change own role' });
  // If demoting an admin, make sure the team still has at least one other admin.
  if (target.team_role === 'admin' && role !== 'admin') {
    const adminCount = (db.prepare(
      'SELECT COUNT(*) AS c FROM users WHERE team_id = ? AND team_role = ? AND (disabled_at IS NULL)'
    ).get(req.teamId!, 'admin') as any).c as number;
    if (adminCount <= 1) return res.status(400).json({ error: 'team must keep at least one admin' });
  }
  db.prepare('UPDATE users SET team_role = ? WHERE id = ?').run(role, target.id);
  data.role = role;
  db.prepare('UPDATE employees SET data = ? WHERE id = ? AND team_id = ?').run(JSON.stringify(data), req.params.id, req.teamId!);
  const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId!) as any;
  logActivity(req.userId!, {
    user: actor?.name || '', actor: 'human',
    action: `Изменил роль сотрудника на ${role}`,
    target: target.name,
    type: 'permission', page: 'team',
  });
  res.json({ ok: true, role });
});

app.delete('/api/employees/:id', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT data FROM employees WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  let email = '';
  try { email = JSON.parse(row.data)?.email || ''; } catch { /* ignore */ }
  let kickedUser: { id: string; name: string } | null = null;
  if (email) {
    const user = db.prepare('SELECT id, name FROM users WHERE email = ? AND team_id = ?').get(email.toLowerCase(), req.teamId!) as any;
    if (user) {
      // Safety: an admin cannot remove themselves this way — would orphan the team.
      if (user.id === req.userId) return res.status(400).json({ error: 'cannot remove yourself' });
      // Soft-remove: block login (disabled_at) but keep team_id so admin can
      // see and restore the user from the "Removed" list. Previously we also
      // reset team_id, which made restoration impossible without manual SQL.
      db.prepare(`UPDATE users SET disabled_at = datetime('now') WHERE id = ?`).run(user.id);
      kickedUser = { id: user.id, name: user.name };
    }
  }
  // Mark the employees row as removed (rather than DELETE) so the data — name,
  // phone, role, history — survives for restoration.
  try {
    const data = JSON.parse(row.data);
    data.removed_at = new Date().toISOString();
    db.prepare('UPDATE employees SET data = ? WHERE id = ? AND team_id = ?').run(JSON.stringify(data), req.params.id, req.teamId!);
  } catch {
    // If JSON parse fails (shouldn't happen), fall back to actual delete to keep prior behaviour.
    db.prepare('DELETE FROM employees WHERE id = ? AND team_id = ?').run(req.params.id, req.teamId!);
  }
  if (kickedUser) {
    logActivity(req.userId!, {
      user: '', action: 'Удалил сотрудника из команды',
      target: kickedUser.name, type: 'delete', page: 'team',
    });
  }
  res.json({ ok: true, kicked: !!kickedUser });
});

// Restore a previously-kicked teammate. Inverse of the DELETE above:
// clears removed_at on the employees row and disabled_at on the user row.
app.post('/api/employees/:id/restore', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT data FROM employees WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  let email = '';
  let data: any = {};
  try { data = JSON.parse(row.data); email = data.email || ''; } catch { /* ignore */ }
  if (!data.removed_at) return res.status(400).json({ error: 'not removed' });

  delete data.removed_at;
  db.prepare('UPDATE employees SET data = ? WHERE id = ? AND team_id = ?').run(JSON.stringify(data), req.params.id, req.teamId!);

  let restoredUser: { id: string; name: string } | null = null;
  if (email) {
    const user = db.prepare('SELECT id, name FROM users WHERE email = ? AND team_id = ?').get(email.toLowerCase(), req.teamId!) as any;
    if (user) {
      db.prepare('UPDATE users SET disabled_at = NULL WHERE id = ?').run(user.id);
      restoredUser = { id: user.id, name: user.name };
    }
  }
  if (restoredUser) {
    logActivity(req.userId!, {
      user: '', action: 'Восстановил сотрудника в команде',
      target: restoredUser.name, type: 'invite', page: 'team',
    });
  }
  res.json({ ok: true, restored: !!restoredUser });
});

app.use('/api/employees', makeCrud('employees', 'e'));
// Team-wide Telegram notification on task assignment. Runs BEFORE the generic
// CRUD mount so POST /api/tasks lands here first — we insert manually, then
// look up the assignee's Telegram pairing and ping them in their bot chat.
// For GET/PATCH/DELETE Express falls through to makeCrud below.
app.post('/api/tasks', authMiddleware, async (req: AuthedRequest, res) => {
  const body = req.body || {};
  const id = body.id || newId('t');
  const data = { ...body, id };
  db.prepare('INSERT INTO tasks (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(id, req.userId!, req.teamId!, JSON.stringify(data));

  // Best-effort assignee notification. Wrapped so a Telegram outage / missing
  // pairing / no token never blocks task creation.
  if (data.assigneeId && isTelegramReady()) {
    try {
      const emp = db.prepare('SELECT data FROM employees WHERE id = ? AND team_id = ?').get(data.assigneeId, req.teamId!) as any;
      if (emp) {
        const empData = JSON.parse(emp.data) as { email?: string; name?: string };
        const email = (empData.email || '').toLowerCase();
        if (email) {
          const user = db.prepare('SELECT id FROM users WHERE email = ? AND team_id = ?').get(email, req.teamId!) as any;
          if (user) {
            const link = db.prepare('SELECT chat_id FROM telegram_links WHERE user_id = ? AND chat_id IS NOT NULL').get(user.id) as any;
            if (link?.chat_id) {
              const due = data.dueDate ? `\n📅 Срок: ${data.dueDate}` : '';
              const desc = data.description ? `\n\n${data.description}` : '';
              const cat = data.category ? ` · <i>${data.category}</i>` : '';
              await tgSendMessage(link.chat_id,
                `<b>📝 Новая задача${cat}</b>\n${data.title}${desc}${due}\n\n<i>Открыть на платформе → Задачи</i>`,
              );
            }
          }
        }
      }
    } catch (e) {
      console.warn('[tasks] telegram notify failed', e);
    }
  }

  // Webhook fan-out for integrations.
  emitEvent(req.teamId!, 'task.created', { task: data });

  res.json(data);
});

// Catch task updates too — if the assignee changes (e.g. admin edits the
// task and picks an исполнитель) we need to notify the NEW assignee. Same
// flow as the POST above, just keyed off the diff.
app.patch('/api/tasks/:id', authMiddleware, async (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT data FROM tasks WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  const before = JSON.parse(row.data);
  const updated = { ...before, ...req.body, id: req.params.id };
  db.prepare('UPDATE tasks SET data = ? WHERE id = ? AND team_id = ?').run(JSON.stringify(updated), req.params.id, req.teamId!);

  const assigneeChanged = updated.assigneeId && updated.assigneeId !== before.assigneeId;
  if (assigneeChanged && isTelegramReady()) {
    try {
      const emp = db.prepare('SELECT data FROM employees WHERE id = ? AND team_id = ?').get(updated.assigneeId, req.teamId!) as any;
      if (emp) {
        const empData = JSON.parse(emp.data) as { email?: string; name?: string };
        const email = (empData.email || '').toLowerCase();
        if (email) {
          const user = db.prepare('SELECT id FROM users WHERE email = ? AND team_id = ?').get(email, req.teamId!) as any;
          if (user) {
            const link = db.prepare('SELECT chat_id FROM telegram_links WHERE user_id = ? AND chat_id IS NOT NULL').get(user.id) as any;
            if (link?.chat_id) {
              const due = updated.dueDate ? `\n📅 Срок: ${updated.dueDate}` : '';
              const desc = updated.description ? `\n\n${updated.description}` : '';
              const cat = updated.category ? ` · <i>${updated.category}</i>` : '';
              await tgSendMessage(link.chat_id,
                `<b>📝 На вас назначена задача${cat}</b>\n${updated.title}${desc}${due}\n\n<i>Открыть на платформе → Задачи</i>`,
              );
            }
          }
        }
      }
    } catch (e) { console.warn('[tasks] telegram notify on patch failed', e); }
    emitEvent(req.teamId!, 'task.assigned', { taskId: req.params.id, assigneeId: updated.assigneeId, task: updated });
  }
  // Status transitions to 'done' are interesting for billing / KPI dashboards.
  if (updated.status === 'done' && before.status !== 'done') {
    emitEvent(req.teamId!, 'task.completed', { taskId: req.params.id, task: updated });
  }
  emitEvent(req.teamId!, 'task.updated', { taskId: req.params.id, task: updated });

  res.json(updated);
});

app.use('/api/tasks', makeCrud('tasks', 't'));
app.use('/api/products', authMiddleware, requirePermission('production'), makeCrud('products', 'p'));
// Finance gated by the matrix (was requireRole('manager') — now matrix-driven
// so admin can hand finance to specific roles without touching code).
app.use('/api/transactions', authMiddleware, requirePermission('finance'), makeCrud('transactions', 'f'));

// ─── AI SETTINGS (per-user JSON blob, Block F.4) ──────────────────
// The Telegram bot reads `assistant.modulePermissions` from here to decide
// whether to auto-execute / ask for confirmation / refuse for each tool call.
const aiSettingsRouter = express.Router();
aiSettingsRouter.use(authMiddleware);

aiSettingsRouter.get('/', (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT ai_settings FROM users WHERE id = ?').get(req.userId!) as any;
  if (!row || !row.ai_settings) return res.json(null);
  try { res.json(JSON.parse(row.ai_settings)); }
  catch { res.json(null); }
});

// Only the admin can change AI settings (they govern the bot for the team).
aiSettingsRouter.put('/', requireRole('admin'), (req: AuthedRequest, res) => {
  const blob = JSON.stringify(req.body || {});
  db.prepare('UPDATE users SET ai_settings = ? WHERE id = ?').run(blob, req.userId!);
  res.json({ ok: true });
});

app.use('/api/ai-settings', aiSettingsRouter);

// ─── TEAM PERMISSIONS (Phase 2 — role × module matrix) ────────────
// Single JSON blob per team, written by admins, read by every member.
// Frontend uses it to decide what's visible; backend uses it (via the
// requirePermission middleware below) to enforce the same rules.
const teamPermsRouter = express.Router();
teamPermsRouter.use(authMiddleware);

// Returns { permissions, roles } — current shape. Legacy clients that expect
// the flat matrix still see it as `permissions` at the top level.
teamPermsRouter.get('/', (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT role_permissions, team_roles FROM team_settings WHERE team_id = ?').get(req.teamId!) as any;
  if (!row) return res.json(null);
  let permissions: any = null, roles: any = null;
  try { if (row.role_permissions) permissions = JSON.parse(row.role_permissions); } catch { /* ignore */ }
  try { if (row.team_roles)       roles       = JSON.parse(row.team_roles); }       catch { /* ignore */ }
  res.json({ permissions, roles });
});

// Accepts either the legacy flat matrix or the new { permissions, roles } shape.
// admin-only — non-admins can read but never write team-wide settings.
teamPermsRouter.put('/', requireRole('admin'), (req: AuthedRequest, res) => {
  const body = req.body || {};
  // Detect new shape vs legacy flat matrix.
  const hasNewShape = body && (typeof body === 'object') && ('permissions' in body || 'roles' in body);
  const permissions = hasNewShape ? body.permissions : body;
  const roles = hasNewShape ? body.roles : undefined;

  const permsJson = permissions ? JSON.stringify(permissions) : null;
  const rolesJson = roles ? JSON.stringify(roles) : null;

  db.prepare(`
    INSERT INTO team_settings (team_id, role_permissions, team_roles, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET
      role_permissions = COALESCE(excluded.role_permissions, team_settings.role_permissions),
      team_roles       = COALESCE(excluded.team_roles,       team_settings.team_roles),
      updated_at = excluded.updated_at
  `).run(req.teamId!, permsJson, rolesJson);
  res.json({ ok: true });
});

app.use('/api/team-permissions', teamPermsRouter);

// ─── WEBHOOKS (admin-managed outbound subscriptions) ─────────────
const webhooksRouter = express.Router();
webhooksRouter.use(authMiddleware);

webhooksRouter.get('/', requireRole('admin'), (req: AuthedRequest, res) => {
  const rows = db.prepare(
    'SELECT id, url, event_types, active, created_at, last_status, last_at FROM webhooks WHERE team_id = ? ORDER BY rowid DESC',
  ).all(req.teamId!) as any[];
  res.json(rows.map(r => ({
    id: r.id,
    url: r.url,
    eventTypes: (() => { try { return JSON.parse(r.event_types); } catch { return []; } })(),
    active: !!r.active,
    createdAt: r.created_at,
    lastStatus: r.last_status,
    lastAt: r.last_at,
  })));
});

webhooksRouter.post('/', requireRole('admin'), (req: AuthedRequest, res) => {
  const url = String(req.body?.url || '').trim();
  if (!url || !/^https?:\/\//.test(url)) return res.status(400).json({ error: 'invalid url' });
  const eventTypes: string[] = Array.isArray(req.body?.eventTypes) && req.body.eventTypes.length
    ? req.body.eventTypes
    : ['*'];
  const id = newId('wh_');
  const secret = randomBytes(24).toString('hex');
  db.prepare(
    'INSERT INTO webhooks (id, team_id, url, secret, event_types, active) VALUES (?, ?, ?, ?, ?, 1)',
  ).run(id, req.teamId!, url, secret, JSON.stringify(eventTypes));
  // Return secret once on create — admin must copy it now (HMAC verify side).
  res.json({ id, url, eventTypes, secret });
});

webhooksRouter.patch('/:id', requireRole('admin'), (req: AuthedRequest, res) => {
  const fields: string[] = [];
  const vals: any[] = [];
  if (typeof req.body?.url === 'string')             { fields.push('url = ?');         vals.push(req.body.url); }
  if (Array.isArray(req.body?.eventTypes))           { fields.push('event_types = ?'); vals.push(JSON.stringify(req.body.eventTypes)); }
  if (typeof req.body?.active === 'boolean')         { fields.push('active = ?');      vals.push(req.body.active ? 1 : 0); }
  if (fields.length === 0) return res.json({ ok: true });
  vals.push(req.params.id, req.teamId!);
  db.prepare(`UPDATE webhooks SET ${fields.join(', ')} WHERE id = ? AND team_id = ?`).run(...vals);
  res.json({ ok: true });
});

webhooksRouter.delete('/:id', requireRole('admin'), (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM webhooks WHERE id = ? AND team_id = ?').run(req.params.id, req.teamId!);
  res.json({ ok: true });
});

// Test ping — sends a synthetic event so admin can verify the receiver works.
webhooksRouter.post('/:id/test', requireRole('admin'), (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT 1 FROM webhooks WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!);
  if (!row) return res.status(404).json({ error: 'not found' });
  emitEvent(req.teamId!, 'test.ping', { id: req.params.id, message: 'Hello from Utir Soft' });
  res.json({ ok: true });
});

app.use('/api/webhooks', webhooksRouter);

// ─── AI Дизайн (image generation) ──────────────────────────────────
// Status + history are open to any team member; generate respects the
// matrix on 'ai-design' (so admin can lock it off per role if needed).
const aiDesignRouter = express.Router();
aiDesignRouter.use(authMiddleware);

// ── Quota helpers (per-role monthly cap on /generate) ───────────────────
// Stored as { admin: null, manager: 100, employee: 30 } JSON on
// team_settings.ai_quotas. null/undefined = unlimited for that role.
// Admin is ALWAYS unlimited regardless of the configured value (matches the
// 'admin can't lock themselves out' rule from the matrix module).
const DEFAULT_AI_QUOTAS: Record<string, number | null> = { admin: null, manager: 100, employee: 30 };

function readQuotas(teamId: string): Record<string, number | null> {
  try {
    const row = db.prepare('SELECT ai_quotas FROM team_settings WHERE team_id = ?').get(teamId) as any;
    if (row?.ai_quotas) {
      const parsed = JSON.parse(row.ai_quotas);
      if (parsed && typeof parsed === 'object') return { ...DEFAULT_AI_QUOTAS, ...parsed };
    }
  } catch { /* fallthrough */ }
  return DEFAULT_AI_QUOTAS;
}

function quotaForRole(teamId: string, role: string): number | null {
  if (role === 'admin') return null; // safety net — admin never gets blocked
  const q = readQuotas(teamId);
  if (Object.prototype.hasOwnProperty.call(q, role)) return q[role];
  return DEFAULT_AI_QUOTAS[role] ?? null;
}

function countGenerationsThisMonth(teamId: string, userId: string): number {
  const firstOfMonth = new Date(); firstOfMonth.setDate(1); firstOfMonth.setHours(0, 0, 0, 0);
  const since = firstOfMonth.toISOString().slice(0, 19).replace('T', ' ');
  const row = db.prepare(
    'SELECT COUNT(*) AS c FROM ai_generations WHERE team_id = ? AND user_id = ? AND created_at >= ?',
  ).get(teamId, userId, since) as any;
  return Number(row?.c || 0);
}

// ── Brand kit (team-wide style prefs injected into every prompt) ───────
interface BrandKit { photorealism: boolean; styleHint: string }
const DEFAULT_BRAND_KIT: BrandKit = { photorealism: true, styleHint: '' };

function readBrandKit(teamId: string): BrandKit {
  try {
    const row = db.prepare('SELECT brand_kit FROM team_settings WHERE team_id = ?').get(teamId) as any;
    if (row?.brand_kit) {
      const parsed = JSON.parse(row.brand_kit);
      return {
        photorealism: typeof parsed.photorealism === 'boolean' ? parsed.photorealism : DEFAULT_BRAND_KIT.photorealism,
        styleHint: typeof parsed.styleHint === 'string' ? parsed.styleHint : DEFAULT_BRAND_KIT.styleHint,
      };
    }
  } catch { /* fall through */ }
  return DEFAULT_BRAND_KIT;
}

// Build the final prompt by appending brand-kit additions (style hint +
// photorealism phrase) to the user's prompt. Kept separate so the team can
// see the diff in the saved 'prompt' field if we ever decide to log it.
function applyBrandKit(userPrompt: string, kit: BrandKit): string {
  const bits = [userPrompt.trim()];
  if (kit.styleHint.trim()) bits.push(kit.styleHint.trim());
  if (kit.photorealism) {
    bits.push('photorealistic interior architectural photography, ' +
              'soft realistic lighting, fine material detail, ' +
              'wide-angle perspective, 4k quality');
  }
  return bits.filter(Boolean).join('. ');
}

aiDesignRouter.get('/brand-kit', (req: AuthedRequest, res) => {
  res.json(readBrandKit(req.teamId!));
});

aiDesignRouter.put('/brand-kit', requireRole('admin'), (req: AuthedRequest, res) => {
  const kit: BrandKit = {
    photorealism: !!req.body?.photorealism,
    styleHint: String(req.body?.styleHint || '').slice(0, 500),
  };
  db.prepare(`
    INSERT INTO team_settings (team_id, brand_kit, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET
      brand_kit = excluded.brand_kit,
      updated_at = excluded.updated_at
  `).run(req.teamId!, JSON.stringify(kit));
  res.json({ ok: true, kit });
});

aiDesignRouter.get('/quotas', (req: AuthedRequest, res) => {
  // Everyone can see the team's quota config + their own usage.
  const quotas = readQuotas(req.teamId!);
  const used = countGenerationsThisMonth(req.teamId!, req.userId!);
  const limit = quotaForRole(req.teamId!, req.teamRole || 'employee');
  res.json({ quotas, you: { used, limit, role: req.teamRole || 'employee' } });
});

aiDesignRouter.put('/quotas', requireRole('admin'), (req: AuthedRequest, res) => {
  const body = req.body || {};
  // Sanitise: only numbers or null allowed as values.
  const clean: Record<string, number | null> = {};
  for (const [role, val] of Object.entries(body)) {
    if (val === null || val === undefined) { clean[role] = null; continue; }
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) clean[role] = Math.floor(n);
  }
  db.prepare(`
    INSERT INTO team_settings (team_id, ai_quotas, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET
      ai_quotas = excluded.ai_quotas,
      updated_at = excluded.updated_at
  `).run(req.teamId!, JSON.stringify(clean));
  res.json({ ok: true, quotas: clean });
});

aiDesignRouter.get('/providers', (_req: AuthedRequest, res) => {
  res.json(aiImageProviders());
});

aiDesignRouter.get('/history', (req: AuthedRequest, res) => {
  const rows = db.prepare(
    'SELECT id, user_id, user_name, provider, prompt, image_url, image_data, enhanced_prompt, created_at FROM ai_generations WHERE team_id = ? ORDER BY rowid DESC LIMIT 100',
  ).all(req.teamId!) as any[];
  res.json(rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    provider: r.provider,
    prompt: r.prompt,
    imageUrl: r.image_url || r.image_data || null,
    enhancedPrompt: r.enhanced_prompt || null,
    createdAt: r.created_at,
  })));
});

aiDesignRouter.post('/generate', requirePermission('ai-design'), async (req: AuthedRequest, res) => {
  // Quota check — block early so we don't burn provider credits when the
  // user is over budget. Admin bypasses (limit always null for admin).
  const limit = quotaForRole(req.teamId!, req.teamRole || 'employee');
  if (limit !== null) {
    const used = countGenerationsThisMonth(req.teamId!, req.userId!);
    if (used >= limit) {
      return res.status(429).json({
        error: 'quota exceeded',
        used, limit,
        message: `Лимит ${limit} генераций в этом месяце исчерпан (использовано ${used}). Лимит сбросится 1-го числа.`,
      });
    }
  }

  const provider = String(req.body?.provider || 'utir-mix') as ProviderId;
  const userPrompt = String(req.body?.prompt || '').trim();
  // Optional input images for img2img. Accept data-URLs only (the frontend
  // converts files via FileReader.readAsDataURL). Cap the refs at 3 so we
  // don't blow request size limits.
  const roomPhoto = typeof req.body?.roomPhoto === 'string' && req.body.roomPhoto.startsWith('data:') ? req.body.roomPhoto : undefined;
  const referenceImages: string[] = Array.isArray(req.body?.referenceImages)
    ? req.body.referenceImages.filter((s: any) => typeof s === 'string' && s.startsWith('data:')).slice(0, 3)
    : [];
  if (!userPrompt) return res.status(400).json({ error: 'prompt required' });

  // Inject the team brand kit (style hint + photorealism). Always applied so
  // every member's generation stays on-brand. Per-call opt-out via
  // skipBrandKit boolean on the body for advanced users.
  const kit = readBrandKit(req.teamId!);
  const prompt = req.body?.skipBrandKit ? userPrompt : applyBrandKit(userPrompt, kit);

  const results = await aiImageGenerate(provider, { prompt, roomPhoto, referenceImages });

  // Persist every successful image so the team can browse them later.
  const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId!) as any;
  const saved = results.map(r => {
    if (!r.ok) return { ...r };
    const id = newId('aig_');
    db.prepare(
      'INSERT INTO ai_generations (id, team_id, user_id, user_name, provider, prompt, image_url, image_data, enhanced_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id, req.teamId!, req.userId!, actor?.name || '',
      // Save the user's ORIGINAL prompt for clean history. The brand-kit
      // additions are deterministic + readable in the team settings.
      r.provider, userPrompt,
      r.imageUrl || null,
      r.imageDataUrl || null,
      r.enhancedPrompt || null,
    );
    return { ...r, id };
  });

  // Telegram notify: when a teammate generates a design, ping them so they
  // see the result even if they're chatting in the bot.
  try {
    if (isTelegramReady()) {
      const link = db.prepare('SELECT chat_id FROM telegram_links WHERE user_id = ? AND chat_id IS NOT NULL').get(req.userId!) as any;
      if (link?.chat_id) {
        const okCount = saved.filter(s => s.ok).length;
        await tgSendMessage(link.chat_id, `🎨 <b>AI Дизайн готов</b>\nПровайдер: ${provider}\n${okCount > 0 ? `Получено ${okCount} изображ.` : 'К сожалению, не удалось сгенерировать.'}\n\nОткрыть → AI Дизайн`);
      }
    }
  } catch (e) { console.warn('[ai-design tg notify]', e); }

  res.json({ provider, prompt, results: saved });
});

aiDesignRouter.delete('/:id', requireRole('admin'), (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM ai_generations WHERE id = ? AND team_id = ?').run(req.params.id, req.teamId!);
  res.json({ ok: true });
});

app.use('/api/ai-design', aiDesignRouter);

// ─── AI Chat (in-app assistant popup) ──────────────────────────────────
// Five providers; UTIR AI is routed through claudeRunAgent so it can call
// platform tools (create deal, log payment, change status, add task,
// find client). Other providers do pure text chat without tool execution.
//
// Flow:
//   POST /message  { provider, messages } → returns text reply OR a
//     pending tool proposal { kind: 'tool', toolName, toolInput, summary }
//   POST /execute  { toolName, toolInput } → user-confirmed tool run,
//     writes to DB, returns short result string.
const aiChatRouter = express.Router();
aiChatRouter.use(authMiddleware);

aiChatRouter.get('/providers', (_req: AuthedRequest, res) => {
  res.json(chatProviderStatuses());
});

// Persisted history (per user × provider). Lets the popup reopen and
// continue from where the user left off, on any device.
aiChatRouter.get('/history', (req: AuthedRequest, res) => {
  const provider = String(req.query?.provider || '');
  if (!provider) return res.json({ messages: [] });
  const row = db.prepare(
    'SELECT messages FROM ai_chat_sessions WHERE user_id = ? AND provider = ?',
  ).get(req.userId!, provider) as any;
  let messages: any[] = [];
  try { messages = row?.messages ? JSON.parse(row.messages) : []; } catch { messages = []; }
  res.json({ messages });
});

aiChatRouter.delete('/history', (req: AuthedRequest, res) => {
  const provider = String(req.query?.provider || '');
  if (provider) {
    db.prepare('DELETE FROM ai_chat_sessions WHERE user_id = ? AND provider = ?').run(req.userId!, provider);
  } else {
    db.prepare('DELETE FROM ai_chat_sessions WHERE user_id = ?').run(req.userId!);
  }
  res.json({ ok: true });
});

function saveChatHistory(teamId: string, userId: string, provider: string, messages: ChatMessage[]) {
  // Cap history at last 40 turns to keep storage small and prompts cheap.
  const trimmed = messages.slice(-40).map(m => ({ role: m.role, content: m.content, ts: new Date().toISOString() }));
  const id = `chat_${userId}_${provider}`;
  db.prepare(`
    INSERT INTO ai_chat_sessions (id, team_id, user_id, provider, messages, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      messages = excluded.messages,
      updated_at = excluded.updated_at
  `).run(id, teamId, userId, provider, JSON.stringify(trimmed));
}

aiChatRouter.post('/message', async (req: AuthedRequest, res) => {
  const provider = String(req.body?.provider || 'utir-ai') as ChatProviderId;
  const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages: ChatMessage[] = rawMessages
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m: any) => ({ role: m.role, content: String(m.content) }))
    .slice(-40);
  if (messages.length === 0) return res.status(400).json({ error: 'messages required' });
  if (messages[messages.length - 1].role !== 'user') return res.status(400).json({ error: 'last message must be user' });

  const userRow = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId!) as any;
  const userName = userRow?.name || 'Пользователь';

  // ─── UTIR AI → tool-capable platform agent ─────────────────────────
  if (provider === 'utir-ai') {
    if (!isClaudeReady()) {
      return res.json({ kind: 'error', provider, ok: false, error: 'ANTHROPIC_API_KEY не задан — UTIR AI пока недоступен.' });
    }
    try {
      const last = messages[messages.length - 1].content;
      const history = messages.slice(0, -1); // everything BEFORE last user turn
      const agentResult = await claudeRunAgent({
        db,
        userId: req.userId!,
        userName,
        userText: last,
        history,
      });

      if (agentResult.kind === 'reply') {
        const newHistory: ChatMessage[] = [...messages, { role: 'assistant', content: agentResult.text }];
        saveChatHistory(req.teamId!, req.userId!, provider, newHistory);
        return res.json({ kind: 'reply', provider, ok: true, text: agentResult.text });
      }

      // Role gate (matches the team matrix). Tools belong to modules; the
      // user's role must have at least 'view' for read-only tools or 'full'
      // for write tools, otherwise we refuse and offer guidance.
      const toolModule = aiTools.getToolModule(agentResult.toolName) || '';
      const isWrite = !aiTools.isReadOnly(agentResult.toolName);
      const gate = canRunTool(db, req.teamId!, req.teamRole || 'admin', toolModule, isWrite);
      if (!gate.ok) {
        const denyText = gate.level === 'none'
          ? `У вашей роли (${req.teamRole}) нет доступа к модулю «${gate.matrixKey}». Действие отменено. Попросите администратора открыть права.`
          : `Модуль «${gate.matrixKey}» доступен только для чтения для вашей роли (${req.teamRole}). Действие отменено.`;
        const newHistory: ChatMessage[] = [...messages, { role: 'assistant', content: denyText }];
        saveChatHistory(req.teamId!, req.userId!, provider, newHistory);
        return res.json({ kind: 'reply', provider, ok: true, text: denyText });
      }

      // Tool proposal — read-only tools (find_client) execute immediately.
      if (aiTools.isReadOnly(agentResult.toolName)) {
        try {
          const result = await aiTools.execute(
            db, req.userId!, req.teamId!, userName,
            agentResult.toolName, agentResult.toolInput, logActivity,
          );
          const newHistory: ChatMessage[] = [...messages, { role: 'assistant', content: result }];
          saveChatHistory(req.teamId!, req.userId!, provider, newHistory);
          return res.json({ kind: 'reply', provider, ok: true, text: result });
        } catch (e: any) {
          const errText = `Не удалось выполнить: ${String(e?.message || e)}`;
          return res.json({ kind: 'reply', provider, ok: true, text: errText });
        }
      }

      // Write tool — return proposal, UI shows confirm/cancel buttons.
      // Persist the proposal as an assistant turn so the conversation flows.
      const proposalText = `${agentResult.summary}\n\n<i>Подтвердите выполнение действия кнопками ниже.</i>`;
      const newHistory: ChatMessage[] = [...messages, { role: 'assistant', content: proposalText }];
      saveChatHistory(req.teamId!, req.userId!, provider, newHistory);
      return res.json({
        kind: 'tool',
        provider,
        ok: true,
        toolName: agentResult.toolName,
        toolInput: agentResult.toolInput,
        summary: agentResult.summary,
      });
    } catch (e: any) {
      return res.json({ kind: 'error', provider, ok: false, error: String(e?.message || e) });
    }
  }

  // ─── Pure-chat providers (claude / gemini / chatgpt / deepseek) ────
  const result = await aiChat(provider, messages);
  if (result.kind === 'reply') {
    const newHistory: ChatMessage[] = [...messages, { role: 'assistant', content: result.text }];
    saveChatHistory(req.teamId!, req.userId!, provider, newHistory);
  }
  return res.json(result);
});

// User-confirmed tool execution. Body: { provider, toolName, toolInput }.
// Returns { ok, text } where text is the short success/error sentence the
// popup can render as an assistant message.
aiChatRouter.post('/execute', async (req: AuthedRequest, res) => {
  const provider = String(req.body?.provider || 'utir-ai');
  const toolName = String(req.body?.toolName || '');
  const toolInput = req.body?.toolInput || {};
  if (!toolName) return res.status(400).json({ error: 'toolName required' });

  // Per-module permission check (same role matrix used by REST guards). Admin
  // always passes; manager/employee/custom roles need the module marked 'full'
  // (since every aiTool is a write — read-only tools bypass /execute entirely).
  const toolModule = aiTools.getToolModule(toolName);
  if (!toolModule) return res.status(400).json({ error: 'unknown tool' });
  const isWrite = !aiTools.isReadOnly(toolName);
  const gate = canRunTool(db, req.teamId!, req.teamRole || 'admin', toolModule, isWrite);
  if (!gate.ok) {
    const msg = gate.level === 'none'
      ? `Нет доступа к модулю «${gate.matrixKey}». Попросите администратора открыть его в Настройки → Команда → права.`
      : `Модуль «${gate.matrixKey}» доступен только для чтения для вашей роли (${req.teamRole}). Действие отменено.`;
    return res.status(403).json({ ok: false, text: msg });
  }

  const userRow = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId!) as any;
  const userName = userRow?.name || 'Пользователь';

  try {
    const text = await aiTools.execute(
      db, req.userId!, req.teamId!, userName,
      toolName, toolInput, logActivity,
    );
    // Append the result to the saved chat history so reopening the popup
    // shows the confirmation outcome inline.
    try {
      const row = db.prepare(
        'SELECT messages FROM ai_chat_sessions WHERE user_id = ? AND provider = ?',
      ).get(req.userId!, provider) as any;
      const prior: any[] = row?.messages ? JSON.parse(row.messages) : [];
      prior.push({ role: 'assistant', content: `✅ ${text}`, ts: new Date().toISOString() });
      saveChatHistory(req.teamId!, req.userId!, provider, prior);
    } catch { /* non-fatal */ }
    res.json({ ok: true, text });
  } catch (e: any) {
    res.json({ ok: false, text: `Не удалось выполнить: ${String(e?.message || e)}` });
  }
});

// Voice → text. Body: { audioDataUrl: 'data:audio/webm;base64,...', language? }.
// Browser MediaRecorder produces 'audio/webm' by default; we forward straight
// to Whisper which handles webm, ogg, mp3, m4a, etc. Returns { ok, text }.
//
// We accept data URLs (not multipart) so this endpoint can reuse the existing
// express.json 25MB body limit without pulling in multer just for one route.
aiChatRouter.post('/transcribe', async (req: AuthedRequest, res) => {
  if (!isWhisperReady()) return res.status(503).json({ ok: false, error: 'OPENAI_API_KEY не задан' });
  const dataUrl = String(req.body?.audioDataUrl || '');
  const language = req.body?.language ? String(req.body.language) : undefined;
  const parsed = parseAudioDataUrl(dataUrl);
  if (!parsed) return res.status(400).json({ ok: false, error: 'audioDataUrl required (data:audio/...;base64,...)' });
  const r = await transcribeAudio(parsed.buf, parsed.mime, language);
  if (!r.ok) return res.status(502).json({ ok: false, error: r.error });
  res.json({ ok: true, text: r.text, language: r.language });
});

app.use('/api/ai-chat', aiChatRouter);

// ─── Client-facing AI (для общения с покупателями в Instagram / WhatsApp) ──
// Admin-only configuration + sandbox test. The actual webhook handlers for
// Instagram and WhatsApp will read this same config and feed it into the
// system prompt — so admins can dial in the tone today and have it apply
// automatically the moment the integration is wired up.
const clientAiRouter = express.Router();
clientAiRouter.use(authMiddleware);

// Anyone on the team can read the config (so the «Чаты» page can show
// «отвечает AI» badges in the right tone), but only admins can mutate it.
clientAiRouter.get('/', (req: AuthedRequest, res) => {
  res.json(readClientAI(db, req.teamId!));
});

clientAiRouter.put('/', requireRole('admin'), (req: AuthedRequest, res) => {
  // Sanitise the incoming body — never store anything we don't expect. We start
  // from the defaults and overlay only the keys the admin actually sent.
  const incoming = (req.body || {}) as Partial<ClientAIConfig>;
  const cfg: ClientAIConfig = {
    enabled: !!incoming.enabled,
    channels: {
      instagram: !!incoming.channels?.instagram,
      whatsapp:  !!incoming.channels?.whatsapp,
    },
    aiModel: (ALL_CLIENT_AI_MODELS as string[]).includes(incoming.aiModel as any)
      ? (incoming.aiModel as ClientAIConfig['aiModel'])
      : DEFAULT_CLIENT_AI.aiModel,
    creativity: typeof incoming.creativity === 'number' && incoming.creativity >= 0 && incoming.creativity <= 1
      ? incoming.creativity
      : DEFAULT_CLIENT_AI.creativity,
    botName: typeof incoming.botName === 'string'
      ? incoming.botName.slice(0, 60)
      : DEFAULT_CLIENT_AI.botName,
    tone: (['polite', 'casual', 'premium', 'strict'] as const).includes(incoming.tone as any)
      ? (incoming.tone as ClientAIConfig['tone'])
      : DEFAULT_CLIENT_AI.tone,
    persona: String(incoming.persona || '').slice(0, 500),
    writingSamples: Array.isArray(incoming.writingSamples)
      ? incoming.writingSamples.filter(s => typeof s === 'string').map(s => s.slice(0, 1000)).slice(0, 5)
      : [],
    scenarios: {
      answerFaq:       !!incoming.scenarios?.answerFaq,
      calculatePrice:  !!incoming.scenarios?.calculatePrice,
      bookMeasurement: !!incoming.scenarios?.bookMeasurement,
      sendCatalog:     !!incoming.scenarios?.sendCatalog,
      askForContacts:  !!incoming.scenarios?.askForContacts,
    },
    handoffTriggers: Array.isArray(incoming.handoffTriggers)
      ? incoming.handoffTriggers.filter(s => typeof s === 'string').map(s => s.slice(0, 80)).slice(0, 30)
      : [],
    blacklistTopics: Array.isArray(incoming.blacklistTopics)
      ? incoming.blacklistTopics.filter(s => typeof s === 'string').map(s => s.slice(0, 80)).slice(0, 30)
      : [],
    workingHours: (() => {
      const wh = incoming.workingHours as any;
      const KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      const days = { ...DEFAULT_CLIENT_AI.workingHours.days };
      if (wh?.days && typeof wh.days === 'object') {
        for (const k of KEYS) {
          const d = wh.days[k];
          if (d && typeof d === 'object') {
            days[k] = {
              enabled: d.enabled !== false,
              start: typeof d.start === 'string' ? d.start.slice(0, 5) : days[k].start,
              end:   typeof d.end   === 'string' ? d.end.slice(0, 5)   : days[k].end,
            };
          }
        }
      }
      return { enabled: !!wh?.enabled, days };
    })(),
    outOfHoursMessage: String(incoming.outOfHoursMessage || DEFAULT_CLIENT_AI.outOfHoursMessage).slice(0, 500),
    handoffMessage:    String(incoming.handoffMessage    || DEFAULT_CLIENT_AI.handoffMessage).slice(0, 500),
  };
  writeClientAI(db, req.teamId!, cfg);
  res.json({ ok: true, config: cfg });
});

// Sandbox — feed a multi-turn conversation through the current config and
// return what the AI would reply on the latest user turn. The test panel
// sends full history so the bot remembers context turn-to-turn just like
// it will in a real Instagram/WhatsApp thread.
//
// Body: {
//   history?: [{ role: 'user' | 'assistant', content: string }, ...],
//   message?: string   // shorthand for single-turn — treated as last user msg
//   override?: Partial<ClientAIConfig>  // try unsaved tweaks without saving
// }
clientAiRouter.post('/test', requireRole('admin'), async (req: AuthedRequest, res) => {
  const body = req.body || {};
  const rawHist = Array.isArray(body.history) ? body.history : [];
  const history = rawHist
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content) }))
    .slice(-30);
  // Allow single-turn shorthand: { message: '...' }
  if (typeof body.message === 'string' && body.message.trim()) {
    history.push({ role: 'user', content: body.message.trim() });
  }
  if (history.length === 0) return res.status(400).json({ ok: false, error: 'history or message required' });
  if (history[history.length - 1].role !== 'user') return res.status(400).json({ ok: false, error: 'last turn must be user' });

  // Pick up the saved config and overlay any unsaved override (so admins can
  // try changes without losing the test conversation).
  const saved = readClientAI(db, req.teamId!);
  const cfg = body.override && typeof body.override === 'object'
    ? { ...saved, ...body.override, scenarios: { ...saved.scenarios, ...(body.override.scenarios || {}) }, channels: { ...saved.channels, ...(body.override.channels || {}) }, workingHours: { ...saved.workingHours, ...(body.override.workingHours || {}) } }
    : saved;

  const meRow = db.prepare('SELECT company FROM users WHERE id = ?').get(req.userId!) as any;
  const result = await runClientAITest(cfg, history, meRow?.company || undefined);
  res.json(result);
});

app.use('/api/team/client-ai', clientAiRouter);

// ─── Company requisites (for invoice PDFs) ────────────────────────
// Stored as JSON blob on team_settings.company_requisites. All team
// members can read (so any employee can print an invoice that has the
// right reqs), but only admin can mutate.
const requisitesRouter = express.Router();
requisitesRouter.use(authMiddleware);
const DEFAULT_REQ = {
  legalName: '', bin: '', address: '', bankName: '',
  iban: '', bik: '', kbe: '', director: '', phone: '', email: '',
};
requisitesRouter.get('/', (req: AuthedRequest, res) => {
  try {
    const row = db.prepare('SELECT company_requisites FROM team_settings WHERE team_id = ?').get(req.teamId!) as any;
    res.json(row?.company_requisites ? { ...DEFAULT_REQ, ...JSON.parse(row.company_requisites) } : DEFAULT_REQ);
  } catch { res.json(DEFAULT_REQ); }
});
requisitesRouter.put('/', requireRole('admin'), (req: AuthedRequest, res) => {
  const b = req.body || {};
  const clean = {
    legalName: String(b.legalName || '').slice(0, 200),
    bin:       String(b.bin       || '').slice(0, 20),
    address:   String(b.address   || '').slice(0, 300),
    bankName:  String(b.bankName  || '').slice(0, 200),
    iban:      String(b.iban      || '').slice(0, 40),
    bik:       String(b.bik       || '').slice(0, 20),
    kbe:       String(b.kbe       || '').slice(0, 5),
    director:  String(b.director  || '').slice(0, 200),
    phone:     String(b.phone     || '').slice(0, 40),
    email:     String(b.email     || '').slice(0, 100),
  };
  db.prepare(`
    INSERT INTO team_settings (team_id, company_requisites, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET
      company_requisites = excluded.company_requisites,
      updated_at = excluded.updated_at
  `).run(req.teamId!, JSON.stringify(clean));
  res.json({ ok: true, requisites: clean });
});
app.use('/api/team/requisites', requisitesRouter);

// Map of team-wide Telegram pairings (Block F.6). Used by the team panel to
// show which teammates have linked their account to the bot — admin sees who
// can receive notifications and whose chat will route through the AI tools.
app.get('/api/team/pairings', authMiddleware, (req: AuthedRequest, res) => {
  const rows = db.prepare(`
    SELECT u.id as user_id, u.email, u.name, tl.chat_id, tl.username, tl.linked_at
    FROM users u
    JOIN telegram_links tl ON tl.user_id = u.id
    WHERE u.team_id = ? AND tl.chat_id IS NOT NULL
  `).all(req.teamId!) as any[];
  res.json(rows.map(r => ({
    userId: r.user_id,
    email: r.email,
    name: r.name,
    chatId: r.chat_id,
    username: r.username,
    linkedAt: r.linked_at,
  })));
});

// Permission check helper now lives in ./permissions.ts — see canRunTool /
// getPermissionLevel exports there. requirePermission is the Express adapter.
function requirePermission(moduleKey: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const level = getPermLevel(db, req.teamId!, req.teamRole || 'admin', moduleKey);
    if (level === 'none') return res.status(403).json({ error: `no access to ${moduleKey}` });
    const isWrite = req.method !== 'GET' && req.method !== 'HEAD';
    if (isWrite && level !== 'full') return res.status(403).json({ error: `${moduleKey} is read-only for your role` });
    next();
  };
}

// ─── INVITATIONS (Block C.2 — team invites) ───────────────────────
// Flow:
//   1. Admin POST /api/invitations → returns { code, expiresAt }
//      Frontend builds a link like /auth?invite=<code> to share.
//   2. Anyone (no auth) GET /api/invitations/preview/:code → see team name
//      so the signup form can show "You're joining <Company>".
//   3. POST /api/auth/signup with { inviteCode } → new user is created
//      with team_id = invitation.team_id, team_role = invitation.role.
//      Invite is marked used.
//   4. Admin DELETE /api/invitations/:id → revoke.

function newInviteCode() {
  // 8 chars, easy-to-type, ambiguous chars stripped (no 0/O/1/I).
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 8; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

// Built-in roles always recognised by name. Custom team-defined ids
// (e.g. 'r_xxxxxxx' or 'accountant') are also accepted — validated against
// the team's stored role list in the invite handler.
const BUILTIN_ROLE_VALUES = new Set(['admin', 'manager', 'employee']);

const invitationsRouter = express.Router();
invitationsRouter.use(authMiddleware);

// Convenience alias — admin-level access for the invitations router.
const requireAdmin = requireRole('admin');

invitationsRouter.get('/', requireAdmin, (req: AuthedRequest, res) => {
  // LEFT JOIN on users so the admin sees WHO accepted each used invite, not just
  // a raw user id. For pending invites usedByName stays null.
  const rows = db.prepare(
    `SELECT i.id, i.code, i.role, i.email, i.expires_at, i.used_at, i.used_by, i.created_at,
            u.name AS used_by_name, u.email AS used_by_email
     FROM invitations i
     LEFT JOIN users u ON u.id = i.used_by
     WHERE i.team_id = ?
     ORDER BY i.rowid DESC`
  ).all(req.teamId!) as any[];
  res.json(rows.map(r => ({
    id: r.id, code: r.code, role: r.role, email: r.email,
    expiresAt: r.expires_at, usedAt: r.used_at, usedBy: r.used_by,
    usedByName: r.used_by_name || null,
    usedByEmail: r.used_by_email || null,
    createdAt: r.created_at,
  })));
});

invitationsRouter.post('/', requireAdmin, async (req: AuthedRequest, res) => {
  const { role, email } = req.body || {};
  // Allow any non-admin role id. If the team defined custom roles in
  // team_settings, accept those too; otherwise fall back to the built-in list.
  let knownRoles: Set<string> = BUILTIN_ROLE_VALUES;
  try {
    const row = db.prepare('SELECT team_roles FROM team_settings WHERE team_id = ?').get(req.teamId!) as any;
    if (row?.team_roles) {
      const parsed = JSON.parse(row.team_roles) as Array<{ id: string }>;
      if (Array.isArray(parsed)) {
        knownRoles = new Set([...BUILTIN_ROLE_VALUES, ...parsed.map(r => r.id)]);
      }
    }
  } catch { /* fall back to built-ins */ }

  const r = (role && knownRoles.has(role)) ? role : 'employee';
  // Don't allow inviting a second admin via this endpoint — keeps the model simple.
  const safeRole = r === 'admin' ? 'manager' : r;
  const id = newId('iv_');
  const code = newInviteCode();
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(); // 7 days
  db.prepare(
    `INSERT INTO invitations (id, team_id, created_by, code, role, email, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.teamId!, req.userId!, code, safeRole, email || null, expires);
  const inviter = db.prepare('SELECT name, company FROM users WHERE id = ?').get(req.userId!) as any;
  logActivity(req.userId!, {
    user: inviter?.name || '', action: 'Создал приглашение в команду',
    target: `${safeRole}${email ? ` → ${email}` : ''}`,
    type: 'invite', page: 'team',
  });

  // If admin pre-filled an email AND a provider is configured, send the
  // invitation link automatically. Falls back to dev-mode (no send) when
  // RESEND_API_KEY isn't set — admin shares the link manually as before.
  let emailSent = false;
  if (email && isEmailReady()) {
    try {
      const origin = (req.headers.origin as string) || (req.headers.referer as string) || 'https://utir-soft.vercel.app';
      const link = `${origin.replace(/\/$/, '')}/?invite=${code}`;
      const tpl = inviteTemplate(inviter?.name || 'Admin', inviter?.company || '', safeRole, link);
      const r = await sendEmail(String(email).toLowerCase(), tpl.subject, tpl.html, tpl.text);
      emailSent = r.ok;
    } catch (e) { console.warn('[invite email]', e); }
  }

  res.json({ id, code, role: safeRole, email: email || null, expiresAt: expires, emailSent });
});

invitationsRouter.delete('/:id', requireAdmin, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT code FROM invitations WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM invitations WHERE id = ? AND team_id = ?').run(req.params.id, req.teamId!);
  const inviter = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId!) as any;
  logActivity(req.userId!, {
    user: inviter?.name || '', action: 'Отозвал приглашение',
    target: row.code, type: 'invite', page: 'team',
  });
  res.json({ ok: true });
});

// Public preview — anyone landing on /?invite=XYZ can see who invited them
// before they decide to sign up. Returns minimal info.
// IMPORTANT: this route MUST be registered BEFORE `app.use('/api/invitations', …)`
// — otherwise the authenticated router below catches the request and rejects it
// with 401 before this handler ever runs.
app.get('/api/invitations/preview/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  const row = db.prepare(
    `SELECT i.role, i.email, i.expires_at, i.used_at, u.name AS inviter_name, u.company AS inviter_company
     FROM invitations i JOIN users u ON u.id = i.created_by
     WHERE i.code = ?`
  ).get(code) as any;
  if (!row) {
    // Diagnostic: log the mismatch so we can see in Railway logs whether the issue
    // is a typo, a casing problem, or the row genuinely doesn't exist.
    const allCodes = db.prepare('SELECT code FROM invitations ORDER BY rowid DESC LIMIT 5').all() as any[];
    console.warn(`[invitations/preview] not found: "${code}". Recent codes: ${allCodes.map(r => r.code).join(', ')}`);
    return res.status(404).json({ error: 'invalid code' });
  }
  if (row.used_at) return res.status(410).json({ error: 'already used' });
  if (new Date(row.expires_at).getTime() < Date.now()) return res.status(410).json({ error: 'expired' });
  res.json({
    role: row.role,
    email: row.email,
    inviter: row.inviter_name,
    company: row.inviter_company || '',
    expiresAt: row.expires_at,
  });
});

app.use('/api/invitations', invitationsRouter);

// ─── INTEGRATIONS (per-user list with stable ids) ──────
const integrationsRouter = express.Router();
integrationsRouter.use(authMiddleware);

integrationsRouter.get('/', (req: AuthedRequest, res) => {
  seedIntegrations(req.userId!);
  const rows = db.prepare('SELECT data FROM integrations WHERE user_id = ?').all(req.userId!) as any[];
  res.json(rows.map(r => JSON.parse(r.data)));
});

integrationsRouter.patch('/:id', (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT data FROM integrations WHERE id = ? AND user_id = ?').get(req.params.id, req.userId!) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  const updated = { ...JSON.parse(row.data), ...req.body, id: req.params.id };
  db.prepare('UPDATE integrations SET data = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(updated), req.params.id, req.userId!);
  res.json(updated);
});

app.use('/api/integrations', integrationsRouter);

// ─── ACTIVITY LOG ──────────────────────────────────────
const activityRouter = express.Router();
activityRouter.use(authMiddleware);

activityRouter.get('/', requireRole('admin'), (req: AuthedRequest, res) => {
  // Full Activity Log page filters client-side; return a generous window (10k most recent).
  // Admin-only — managers/employees don't see the audit log.
  const rows = db.prepare('SELECT data FROM activity_logs WHERE team_id = ? ORDER BY rowid DESC LIMIT 10000').all(req.teamId!) as any[];
  res.json(rows.map(r => JSON.parse(r.data)));
});

activityRouter.post('/', (req: AuthedRequest, res) => {
  const id = newId('a_');
  const data = { ...req.body, id, timestamp: new Date().toISOString() };
  db.prepare('INSERT INTO activity_logs (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(id, req.userId!, req.teamId!, JSON.stringify(data));
  // Trim retention to 10000 rows per team.
  db.prepare(`DELETE FROM activity_logs WHERE team_id = ? AND id NOT IN (SELECT id FROM activity_logs WHERE team_id = ? ORDER BY rowid DESC LIMIT 10000)`).run(req.teamId!, req.teamId!);
  res.json(data);
});

app.use('/api/activity', activityRouter);

// ─── CLIENT CABINET PASSWORDLESS (phone) ───────────────
// Stores a session by phone — non-secure demo; not tied to JWT users.
// For a real deployment, replace with SMS-OTP via a provider.
app.post('/api/client/session', (req, res) => {
  const { phone, name } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone required' });
  res.json({ phone, name: name || 'Клиент' });
});

// ─── TELEGRAM AI ASSISTANT (Block F) ──────────────────────
// Webhook is intentionally PUBLIC — Telegram calls it directly. We don't trust
// the request body's user info; we map by chat_id → user_id via telegram_links.
app.post('/api/telegram/webhook', async (req, res) => {
  // Acknowledge quickly so Telegram doesn't retry; do the work async.
  res.json({ ok: true });
  try {
    await handleUpdate(db, req.body, (userId, entry) => {
      const id = newId('a_');
      const data = { id, timestamp: new Date().toISOString(), actor: 'human', ...entry };
      db.prepare('INSERT INTO activity_logs (id, user_id, data) VALUES (?, ?, ?)').run(id, userId, JSON.stringify(data));
    });
  } catch (e) {
    console.error('[telegram webhook]', e);
  }
});

// Generate a one-time link code so the admin can pair their Telegram with this account.
app.post('/api/telegram/link/new', authMiddleware, (req: AuthedRequest, res) => {
  const { code, expiresAt } = issueLinkCode(db, req.userId!);
  res.json({ code, expiresAt });
});

// Current pairing status — used by the Settings UI to show "Connected" or the code prompt.
app.get('/api/telegram/link/status', authMiddleware, (req: AuthedRequest, res) => {
  res.json({
    ...getLinkStatus(db, req.userId!),
    serverReady: { telegram: isTelegramReady(), claude: isClaudeReady() },
  });
});

// Detach the Telegram chat from this account.
app.delete('/api/telegram/link', authMiddleware, (req: AuthedRequest, res) => {
  unlink(db, req.userId!);
  res.json({ ok: true });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, telegram: isTelegramReady(), claude: isClaudeReady() }));

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  // Push the /-command menu to Telegram (idempotent — safe on every boot).
  // Adds /design to the blue menu button so users discover the wizard.
  if (isTelegramReady()) {
    registerBotCommands().then(() => console.log('[server] telegram /design menu registered'))
      .catch(e => console.warn('[server] registerBotCommands failed', e));
  }
});
