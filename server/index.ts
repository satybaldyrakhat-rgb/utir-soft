import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleUpdate, issueLinkCode, getLinkStatus, unlink, isTelegramReady } from './telegram.js';
import { isClaudeReady } from './claudeAgent.js';

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
migrateColumn('users', 'company', "TEXT DEFAULT ''");
migrateColumn('users', 'verification_code', 'TEXT');
const verifiedJustAdded = migrateColumn('users', 'email_verified', 'INTEGER DEFAULT 0');
migrateColumn('users', 'terms_accepted_at', 'TEXT');

// First time email_verified column appears → all pre-existing users predate verification, mark them verified.
if (verifiedJustAdded) {
  db.exec(`UPDATE users SET email_verified = 1`);
  console.log('[migration] back-filled email_verified=1 for existing users');
}

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
app.use(express.json({ limit: '10mb' }));

interface AuthedRequest extends Request {
  userId?: string;
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
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

function newId(prefix: string) {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Append an entry to the user's activity log. Used by auth handlers so we can record
// login/signup/verify events server-side (frontend can't insert before it has a token).
function logActivity(userId: string, entry: Record<string, any>) {
  const id = newId('a_');
  const data = { id, timestamp: new Date().toISOString(), actor: 'human', ...entry };
  try {
    db.prepare('INSERT INTO activity_logs (id, user_id, data) VALUES (?, ?, ?)').run(id, userId, JSON.stringify(data));
  } catch (e) { console.warn('[logActivity] failed', e); }
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
  const { email, password, name, company, termsAccepted } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email))) return res.status(400).json({ error: 'invalid email' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  if (!company || !String(company).trim()) return res.status(400).json({ error: 'company required' });
  if (!termsAccepted) return res.status(400).json({ error: 'terms must be accepted' });
  const pwdCheck = passwordOk(password);
  if (!pwdCheck.ok) return res.status(400).json({ error: pwdCheck.reason });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'email already registered' });

  const hash = await bcrypt.hash(password, 10);
  const id = newId('u_');
  const code = genVerificationCode();
  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, company, verification_code, email_verified, terms_accepted_at) VALUES (?, ?, ?, ?, ?, ?, 0, datetime(\'now\'))'
  ).run(id, String(email).toLowerCase(), hash, String(name).trim(), String(company).trim(), code);
  seedIntegrations(id);
  logActivity(id, { user: String(name).trim(), action: 'Зарегистрировался в системе', target: String(email).toLowerCase(), type: 'login', page: 'auth' });
  const token = jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: '30d' });
  // verificationCode is returned in dev mode (no real email sending). Frontend displays it on the OTP screen.
  res.json({ token, user: { id, email, name, company, emailVerified: false }, verificationCode: code });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const user = db.prepare('SELECT id, email, name, company, password_hash, email_verified, verification_code FROM users WHERE email = ?').get(String(email).toLowerCase()) as any;
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  seedIntegrations(user.id);
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '30d' });
  const verified = !!user.email_verified;
  logActivity(user.id, { user: user.name, action: 'Вошёл в систему', target: user.email, type: 'login', page: 'auth' });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, company: user.company || '', emailVerified: verified },
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

app.post('/api/auth/resend-code', authMiddleware, (req: AuthedRequest, res) => {
  const user = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(req.userId!) as any;
  if (!user) return res.status(404).json({ error: 'user not found' });
  if (user.email_verified) return res.status(400).json({ error: 'already verified' });
  const code = genVerificationCode();
  db.prepare('UPDATE users SET verification_code = ? WHERE id = ?').run(code, req.userId!);
  // Dev mode: return the new code in the response so the UI can display it.
  res.json({ verificationCode: code });
});

app.get('/api/auth/me', authMiddleware, (req: AuthedRequest, res) => {
  const user = db.prepare('SELECT id, email, name, company, email_verified FROM users WHERE id = ?').get(req.userId!) as any;
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json({ user: { id: user.id, email: user.email, name: user.name, company: user.company || '', emailVerified: !!user.email_verified } });
});

app.post('/api/auth/logout', authMiddleware, (req: AuthedRequest, res) => {
  const u = db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.userId!) as any;
  if (u) logActivity(req.userId!, { user: u.name, action: 'Вышел из системы', target: u.email, type: 'logout', page: 'auth' });
  res.json({ ok: true });
});

// ─── GENERIC CRUD ROUTER FACTORY ───────────────────────
function makeCrud(table: string, idPrefix: string) {
  const r = express.Router();
  r.use(authMiddleware);

  r.get('/', (req: AuthedRequest, res) => {
    const rows = db.prepare(`SELECT id, data FROM ${table} WHERE user_id = ? ORDER BY rowid DESC`).all(req.userId!) as any[];
    res.json(rows.map(r => ({ ...JSON.parse(r.data), id: r.id })));
  });

  r.post('/', (req: AuthedRequest, res) => {
    const body = req.body || {};
    const id = body.id || newId(idPrefix);
    const data = { ...body, id };
    db.prepare(`INSERT INTO ${table} (id, user_id, data) VALUES (?, ?, ?)`).run(id, req.userId!, JSON.stringify(data));
    res.json(data);
  });

  r.patch('/:id', (req: AuthedRequest, res) => {
    const row = db.prepare(`SELECT data FROM ${table} WHERE id = ? AND user_id = ?`).get(req.params.id, req.userId!) as any;
    if (!row) return res.status(404).json({ error: 'not found' });
    const updated = { ...JSON.parse(row.data), ...req.body, id: req.params.id };
    db.prepare(`UPDATE ${table} SET data = ? WHERE id = ? AND user_id = ?`).run(JSON.stringify(updated), req.params.id, req.userId!);
    res.json(updated);
  });

  r.delete('/:id', (req: AuthedRequest, res) => {
    db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(req.params.id, req.userId!);
    res.json({ ok: true });
  });

  return r;
}

app.use('/api/deals', makeCrud('deals', 'D'));
app.use('/api/employees', makeCrud('employees', 'e'));
app.use('/api/tasks', makeCrud('tasks', 't'));
app.use('/api/products', makeCrud('products', 'p'));
app.use('/api/transactions', makeCrud('transactions', 'f'));

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

activityRouter.get('/', (req: AuthedRequest, res) => {
  // Full Activity Log page filters client-side; return a generous window (10k most recent).
  const rows = db.prepare('SELECT data FROM activity_logs WHERE user_id = ? ORDER BY rowid DESC LIMIT 10000').all(req.userId!) as any[];
  res.json(rows.map(r => JSON.parse(r.data)));
});

activityRouter.post('/', (req: AuthedRequest, res) => {
  const id = newId('a_');
  const data = { ...req.body, id, timestamp: new Date().toISOString() };
  db.prepare('INSERT INTO activity_logs (id, user_id, data) VALUES (?, ?, ?)').run(id, req.userId!, JSON.stringify(data));
  // Trim retention to 10000 rows per workspace.
  db.prepare(`DELETE FROM activity_logs WHERE user_id = ? AND id NOT IN (SELECT id FROM activity_logs WHERE user_id = ? ORDER BY rowid DESC LIMIT 10000)`).run(req.userId!, req.userId!);
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
});
