import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

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
`);

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

// ─── AUTH ──────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: 'email, password, name required' });
  if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 chars' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'email already registered' });
  const hash = await bcrypt.hash(password, 10);
  const id = newId('u_');
  db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(id, email, hash, name);
  seedIntegrations(id);
  const token = jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id, email, name } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const user = db.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?').get(email) as any;
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  seedIntegrations(user.id);
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

app.get('/api/auth/me', authMiddleware, (req: AuthedRequest, res) => {
  const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(req.userId!) as any;
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json({ user });
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
  const rows = db.prepare('SELECT data FROM activity_logs WHERE user_id = ? ORDER BY rowid DESC LIMIT 50').all(req.userId!) as any[];
  res.json(rows.map(r => JSON.parse(r.data)));
});

activityRouter.post('/', (req: AuthedRequest, res) => {
  const id = newId('a_');
  const data = { ...req.body, id, timestamp: new Date().toISOString() };
  db.prepare('INSERT INTO activity_logs (id, user_id, data) VALUES (?, ?, ?)').run(id, req.userId!, JSON.stringify(data));
  db.prepare(`DELETE FROM activity_logs WHERE user_id = ? AND id NOT IN (SELECT id FROM activity_logs WHERE user_id = ? ORDER BY rowid DESC LIMIT 100)`).run(req.userId!, req.userId!);
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

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
