// ─── Дашборд владельца платформы (super-admin) ────────────────────────
// Кросс-командный обзор ВСЕЙ платформы: команды-клиенты, их пользователи,
// подписки, интеграции, активность, ошибки. Доступ — ТОЛЬКО у владельца
// (email из SUPER_ADMIN_EMAILS). Это единственное место, которое намеренно
// пересекает изоляцию по team_id, поэтому гейт строгий.
//
// Всё, что видит и меняет владелец, идёт через /api/owner/* под двумя
// middleware: authMiddleware (кто ты) + requireSuperAdmin (ты — владелец?).

import type Database from 'better-sqlite3';
import express from 'express';

// ─── Кто владелец ─────────────────────────────────────────────────────
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || 'satybaldy.rakhat@gmail.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export function isSuperAdminEmail(email: string | undefined | null): boolean {
  return !!email && SUPER_ADMIN_EMAILS.includes(String(email).toLowerCase());
}

// ─── Схема: подписки, блокировки, лог ошибок ──────────────────────────
export function initOwnerSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      team_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS error_logs (
      id TEXT PRIMARY KEY,
      source TEXT,            -- 'server' | 'client'
      team_id TEXT,
      user_id TEXT,
      method TEXT,
      url TEXT,
      message TEXT,
      stack TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at);
    -- Роадмап владельца: личные задачи по платформе (не привязаны к команде).
    CREATE TABLE IF NOT EXISTS owner_tasks (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    -- Финансы платформы: доходы/расходы владельца (ИИ, хостинг, зарплаты…).
    CREATE TABLE IF NOT EXISTS platform_finance (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ─── Подписки ─────────────────────────────────────────────────────────
export type SubPeriod = 'monthly' | 'semiannual' | 'annual';
export type SubStatus = 'trial' | 'active' | 'past_due' | 'churned';
export interface Subscription {
  plan: string;            // trial | basic | pro | enterprise (свободно)
  amount: number;          // ₸ за период
  currency: string;        // 'KZT'
  period: SubPeriod;
  status: SubStatus;
  startedAt: string;       // YYYY-MM-DD
  expiresAt: string;       // YYYY-MM-DD
  suspended: boolean;      // доступ команде заблокирован
  note: string;
  updatedAt?: string;
}

function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

function defaultSub(teamCreatedAt?: string): Subscription {
  const start = teamCreatedAt ? new Date(teamCreatedAt) : new Date();
  return {
    plan: 'trial', amount: 0, currency: 'KZT', period: 'monthly', status: 'trial',
    startedAt: ymd(start), expiresAt: ymd(addDays(start, 14)), suspended: false, note: '',
  };
}

export function getSubscription(db: Database.Database, teamId: string, teamCreatedAt?: string): Subscription {
  const row = db.prepare('SELECT data FROM subscriptions WHERE team_id = ?').get(teamId) as any;
  if (!row?.data) return defaultSub(teamCreatedAt);
  try { return { ...defaultSub(teamCreatedAt), ...JSON.parse(row.data) }; }
  catch { return defaultSub(teamCreatedAt); }
}

export function setSubscription(db: Database.Database, teamId: string, patch: Partial<Subscription>, teamCreatedAt?: string): Subscription {
  const cur = getSubscription(db, teamId, teamCreatedAt);
  const next: Subscription = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  db.prepare(`INSERT INTO subscriptions (team_id, data, updated_at) VALUES (?, ?, datetime('now'))
              ON CONFLICT(team_id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`)
    .run(teamId, JSON.stringify(next));
  return next;
}

// Блокировка команды — читается из subscriptions.suspended. Используется в
// authMiddleware, чтобы заблокированная команда теряла доступ немедленно.
export function isTeamSuspended(db: Database.Database, teamId: string): boolean {
  const row = db.prepare('SELECT data FROM subscriptions WHERE team_id = ?').get(teamId) as any;
  if (!row?.data) return false;
  try { return !!JSON.parse(row.data).suspended; } catch { return false; }
}

// ─── Лог ошибок ───────────────────────────────────────────────────────
export function logError(db: Database.Database, e: { source: string; teamId?: string; userId?: string; method?: string; url?: string; message: string; stack?: string }) {
  try {
    const id = 'err_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    db.prepare('INSERT INTO error_logs (id, source, team_id, user_id, method, url, message, stack) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, e.source, e.teamId || null, e.userId || null, e.method || null, e.url || null,
           String(e.message || '').slice(0, 2000), String(e.stack || '').slice(0, 6000));
    // Ретенция: держим последние 5000 записей, старьё чистим.
    db.prepare(`DELETE FROM error_logs WHERE id NOT IN (SELECT id FROM error_logs ORDER BY rowid DESC LIMIT 5000)`).run();
  } catch { /* лог ошибок не должен ронять запрос */ }
}

// ─── Агрегации ────────────────────────────────────────────────────────
const monthlyEquivalent = (s: Subscription): number => {
  if (s.status === 'churned' || s.status === 'trial') return 0;
  if (s.amount <= 0) return 0;
  return s.period === 'annual' ? Math.round(s.amount / 12) : s.period === 'semiannual' ? Math.round(s.amount / 6) : s.amount;
};

interface TeamSummary {
  teamId: string; name: string; email: string; company: string;
  createdAt: string;
  users: { total: number; admins: number; managers: number; employees: number };
  usage: { deals: number; transactions: number; products: number; tasks: number; revenue: number };
  lastActivityAt: string | null;
  integrations: string[];
  subscription: Subscription;
}

// Список всех команд с агрегатами. Небольшое число команд → per-team
// запросы приемлемы для SQLite.
export function listTeams(db: Database.Database): TeamSummary[] {
  const teamRows = db.prepare(`
    SELECT team_id AS teamId,
      COUNT(*) AS total,
      SUM(CASE WHEN team_role='admin' THEN 1 ELSE 0 END) AS admins,
      SUM(CASE WHEN team_role='manager' THEN 1 ELSE 0 END) AS managers,
      SUM(CASE WHEN team_role NOT IN ('admin','manager') THEN 1 ELSE 0 END) AS employees,
      MIN(created_at) AS createdAt
    FROM users WHERE team_id IS NOT NULL GROUP BY team_id
  `).all() as any[];

  const dealCount = db.prepare(`SELECT team_id, COUNT(*) n FROM deals GROUP BY team_id`).all() as any[];
  const txAgg = db.prepare(`SELECT team_id, data FROM transactions`).all() as any[];
  const prodCount = db.prepare(`SELECT team_id, COUNT(*) n FROM products GROUP BY team_id`).all() as any[];
  const taskCount = db.prepare(`SELECT team_id, COUNT(*) n FROM tasks GROUP BY team_id`).all() as any[];

  const mapN = (rows: any[]) => { const m = new Map<string, number>(); for (const r of rows) m.set(r.team_id, r.n); return m; };
  const deals = mapN(dealCount), prods = mapN(prodCount), tasks = mapN(taskCount);

  // Выручка (завершённые income) и число транзакций — считаем по блобам.
  const revByTeam = new Map<string, number>(); const txByTeam = new Map<string, number>();
  for (const r of txAgg) {
    txByTeam.set(r.team_id, (txByTeam.get(r.team_id) || 0) + 1);
    try { const t = JSON.parse(r.data); if (t.type === 'income' && (t.status === 'completed' || !t.status)) revByTeam.set(r.team_id, (revByTeam.get(r.team_id) || 0) + (Number(t.amount) || 0)); } catch { /* skip */ }
  }

  // Последняя активность — max created_at из activity_logs по команде.
  const lastAct = new Map<string, string>();
  for (const r of db.prepare(`SELECT team_id, MAX(created_at) AS last FROM activity_logs GROUP BY team_id`).all() as any[]) {
    if (r.team_id) lastAct.set(r.team_id, r.last);
  }

  return teamRows.map(t => {
    const owner = db.prepare('SELECT name, email, company, created_at FROM users WHERE id = ?').get(t.teamId) as any;
    return {
      teamId: t.teamId,
      name: owner?.company || owner?.name || '—',
      email: owner?.email || '',
      company: owner?.company || '',
      createdAt: t.createdAt || owner?.created_at || '',
      users: { total: t.total, admins: t.admins, managers: t.managers, employees: t.employees },
      usage: { deals: deals.get(t.teamId) || 0, transactions: txByTeam.get(t.teamId) || 0, products: prods.get(t.teamId) || 0, tasks: tasks.get(t.teamId) || 0, revenue: revByTeam.get(t.teamId) || 0 },
      lastActivityAt: lastAct.get(t.teamId) || null,
      integrations: teamIntegrations(db, t.teamId),
      subscription: getSubscription(db, t.teamId, t.createdAt),
    };
  });
}

// Подключённые каналы команды: из team_settings.integrations (WhatsApp/IG/…)
// + персональные integrations пользователей команды, помеченные connected.
function teamIntegrations(db: Database.Database, teamId: string): string[] {
  const set = new Set<string>();
  try {
    const ts = db.prepare('SELECT integrations FROM team_settings WHERE team_id = ?').get(teamId) as any;
    if (ts?.integrations) { const o = JSON.parse(ts.integrations); for (const k of Object.keys(o || {})) if (o[k]?.connected || o[k]?.phoneNumberId || o[k]?.igUserId || o[k]?.accessToken) set.add(k); }
  } catch { /* skip */ }
  try {
    const rows = db.prepare(`SELECT i.data FROM integrations i JOIN users u ON u.id = i.user_id WHERE u.team_id = ?`).all(teamId) as any[];
    for (const r of rows) { try { const d = JSON.parse(r.data); if (d.connected && d.name) set.add(d.name); } catch { /* skip */ } }
  } catch { /* skip */ }
  // Telegram — если у кого-то в команде привязан бот.
  try {
    const tg = db.prepare(`SELECT COUNT(*) n FROM telegram_links tl JOIN users u ON u.id = tl.user_id WHERE u.team_id = ? AND tl.chat_id IS NOT NULL`).get(teamId) as any;
    if (tg?.n > 0) set.add('Telegram');
  } catch { /* skip */ }
  return [...set];
}

export function ownerOverview(db: Database.Database) {
  const teams = listTeams(db);
  const now = new Date();
  const monthAgo = addDays(now, -30);
  const activeSubs = teams.filter(t => t.subscription.status === 'active' || t.subscription.status === 'past_due');
  const mrr = teams.reduce((s, t) => s + monthlyEquivalent(t.subscription), 0);
  const contracted = teams.reduce((s, t) => s + (t.subscription.status !== 'churned' && t.subscription.status !== 'trial' ? (Number(t.subscription.amount) || 0) : 0), 0);
  const byStatus = (st: SubStatus) => teams.filter(t => t.subscription.status === st).length;
  const newThisMonth = teams.filter(t => t.createdAt && new Date(t.createdAt) >= monthAgo).length;
  const activeUsers = teams.filter(t => t.lastActivityAt && new Date(t.lastActivityAt) >= monthAgo).length;
  const expiringSoon = teams.filter(t => {
    if (t.subscription.status === 'churned' || t.subscription.status === 'trial') return false;
    const exp = new Date(t.subscription.expiresAt); return exp >= now && exp <= addDays(now, 14);
  }).length;
  const atRisk = teams.filter(t => t.subscription.status !== 'churned' && (!t.lastActivityAt || new Date(t.lastActivityAt) < addDays(now, -14))).length;
  const totalUsers = teams.reduce((s, t) => s + t.users.total, 0);

  // Рост команд по месяцам (12 мес) — для графика.
  const growth: { m: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const count = teams.filter(t => { const c = new Date(t.createdAt); return c >= from && c < to; }).length;
    growth.push({ m: `${from.getMonth() + 1}.${String(from.getFullYear()).slice(2)}`, count });
  }

  return {
    totals: { teams: teams.length, users: totalUsers, mrr, contracted },
    subs: { active: byStatus('active'), trial: byStatus('trial'), pastDue: byStatus('past_due'), churned: byStatus('churned') },
    signals: { newThisMonth, activeUsers, expiringSoon, atRisk },
    growth,
  };
}

export function teamDetail(db: Database.Database, teamId: string) {
  const summary = listTeams(db).find(t => t.teamId === teamId);
  if (!summary) return null;
  const users = db.prepare('SELECT id, name, email, team_role, disabled_at, created_at, auth_provider, phone FROM users WHERE team_id = ? ORDER BY created_at ASC').all(teamId) as any[];
  const activity = db.prepare(`SELECT a.data, a.created_at FROM activity_logs a WHERE a.team_id = ? ORDER BY a.rowid DESC LIMIT 40`).all(teamId) as any[];
  return {
    ...summary,
    userList: users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.team_role || 'admin', disabled: !!u.disabled_at, createdAt: u.created_at, provider: u.auth_provider || 'password', phone: u.phone || '' })),
    activity: activity.map(a => { try { return { ...JSON.parse(a.data), at: a.created_at }; } catch { return { at: a.created_at }; } }),
  };
}

export function globalActivity(db: Database.Database, limit = 100) {
  const rows = db.prepare(`
    SELECT a.data, a.created_at, a.team_id, u.company AS teamName, u.name AS teamOwner
    FROM activity_logs a LEFT JOIN users u ON u.id = a.team_id
    ORDER BY a.rowid DESC LIMIT ?`).all(limit) as any[];
  return rows.map(r => { let d: any = {}; try { d = JSON.parse(r.data); } catch { /* skip */ } return { at: r.created_at, teamId: r.team_id, team: r.teamName || r.teamOwner || '—', user: d.user, action: d.action, target: d.target, actor: d.actor, source: d.source, type: d.type }; });
}

export function listAllUsers(db: Database.Database) {
  return (db.prepare(`
    SELECT u.id, u.name, u.email, u.team_role AS role, u.team_id, u.disabled_at, u.created_at, u.auth_provider,
      owner.company AS teamName, owner.name AS teamOwner
    FROM users u LEFT JOIN users owner ON owner.id = u.team_id
    ORDER BY u.created_at DESC`).all() as any[])
    .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role || 'admin', teamId: u.team_id, team: u.teamName || u.teamOwner || '—', disabled: !!u.disabled_at, createdAt: u.created_at, provider: u.auth_provider || 'password' }));
}

export function listErrors(db: Database.Database, limit = 200) {
  return db.prepare(`
    SELECT e.*, owner.company AS teamName, owner.name AS teamOwner
    FROM error_logs e LEFT JOIN users owner ON owner.id = e.team_id
    ORDER BY e.rowid DESC LIMIT ?`).all(limit) as any[];
}

// ─── Роадмап владельца ────────────────────────────────────────────────
export type OwnerTaskStatus = 'todo' | 'in_progress' | 'on_hold' | 'done';
const oid = () => 'ot_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// Стартовый роадмап — реальные незакрытые пункты по платформе. Заполняется
// один раз, если задач ещё нет (владелец потом правит/двигает/удаляет).
const DEFAULT_OWNER_TASKS: { title: string; description: string; status: OwnerTaskStatus; priority: string }[] = [
  { title: 'Задать TELEGRAM_WEBHOOK_SECRET в проде', description: 'Включить верификацию источника Telegram-вебхука (защита от подделки апдейтов).', status: 'todo', priority: 'high' },
  { title: 'Задать JWT_SECRET и постоянный DATABASE_PATH', description: 'Обязательно в проде: без JWT_SECRET сервер не стартует; БД — на постоянном диске.', status: 'todo', priority: 'high' },
  { title: 'Автобиллинг подписок', description: 'Автосписание/напоминания об оплате, интеграция с Kaspi/банком вместо ручного ведения.', status: 'todo', priority: 'medium' },
  { title: 'Напоминания о продлении подписки', description: 'За N дней до истечения — уведомление владельцу и клиенту (email/Telegram).', status: 'todo', priority: 'medium' },
  { title: 'История платежей по каждой команде', description: 'Лог оплат внутри карточки команды в Центре управления.', status: 'todo', priority: 'low' },
  { title: 'Экспорт данных дашборда в CSV', description: 'Команды, пользователи, финансы — выгрузка для отчётности.', status: 'todo', priority: 'low' },
  { title: 'Meta: верификация бизнеса (WhatsApp/Instagram)', description: 'На проверке у Meta. После подтверждения — включить каналы (META_APP_SECRET + токены).', status: 'on_hold', priority: 'high' },
  { title: 'Kaspi: онлайн-оплата', description: 'Ждём мерчант-данные Kaspi для приёма онлайн-платежей от клиентов.', status: 'on_hold', priority: 'medium' },
];

export function listOwnerTasks(db: Database.Database) {
  let rows = db.prepare('SELECT id, data FROM owner_tasks ORDER BY rowid ASC').all() as any[];
  if (rows.length === 0) {
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      for (const t of DEFAULT_OWNER_TASKS) {
        const id = oid();
        db.prepare('INSERT INTO owner_tasks (id, data) VALUES (?, ?)').run(id, JSON.stringify({ ...t, id, createdAt: now, seed: true }));
      }
    });
    tx();
    rows = db.prepare('SELECT id, data FROM owner_tasks ORDER BY rowid ASC').all() as any[];
  }
  return rows.map(r => { try { return { ...JSON.parse(r.data), id: r.id }; } catch { return { id: r.id }; } });
}
export function createOwnerTask(db: Database.Database, body: any) {
  const id = oid();
  const data = { title: String(body.title || 'Без названия').slice(0, 300), description: String(body.description || '').slice(0, 2000), status: (body.status || 'todo') as OwnerTaskStatus, priority: body.priority || 'medium', dueDate: body.dueDate || '', createdAt: new Date().toISOString(), id };
  db.prepare('INSERT INTO owner_tasks (id, data) VALUES (?, ?)').run(id, JSON.stringify(data));
  return data;
}
export function updateOwnerTask(db: Database.Database, id: string, patch: any) {
  const row = db.prepare('SELECT data FROM owner_tasks WHERE id = ?').get(id) as any;
  if (!row) return null;
  let cur: any = {}; try { cur = JSON.parse(row.data); } catch { /* skip */ }
  const allowed: any = {};
  for (const k of ['title', 'description', 'status', 'priority', 'dueDate']) if (patch[k] !== undefined) allowed[k] = patch[k];
  const next = { ...cur, ...allowed, id };
  db.prepare('UPDATE owner_tasks SET data = ? WHERE id = ?').run(JSON.stringify(next), id);
  return next;
}
export function deleteOwnerTask(db: Database.Database, id: string) {
  db.prepare('DELETE FROM owner_tasks WHERE id = ?').run(id);
}

// ─── Использование ИИ по всей платформе ───────────────────────────────
// Точных токенов не логируем, поэтому считаем натуральные единицы
// (генерации изображений, действия ассистента) и даём грубую ₸-оценку.
// Для точного P&L владелец вносит фактический расход в раздел финансов.
const EST_IMG_KZT = 25;   // ~ стоимость одной AI-генерации изображения
const EST_MSG_KZT = 4;    // ~ стоимость одного действия/ответа ассистента
function monthStartStr(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01 00:00:00`; }

export function aiUsage(db: Database.Database) {
  const ms = monthStartStr();
  const n = (sql: string, ...p: any[]) => (db.prepare(sql).get(...p) as any)?.n || 0;
  const imagesTotal = n('SELECT COUNT(*) n FROM ai_generations');
  const imagesMonth = n('SELECT COUNT(*) n FROM ai_generations WHERE created_at >= ?', ms);
  const actionsMonth = n(`SELECT COUNT(*) n FROM activity_logs WHERE created_at >= ? AND data LIKE '%"actor":"ai"%'`, ms);
  const byTeam = (db.prepare(`
    SELECT g.team_id, COUNT(*) n, owner.company AS teamName, owner.name AS teamOwner
    FROM ai_generations g LEFT JOIN users owner ON owner.id = g.team_id
    WHERE g.created_at >= ? GROUP BY g.team_id ORDER BY n DESC LIMIT 8`).all(ms) as any[])
    .map(r => ({ team: r.teamName || r.teamOwner || '—', images: r.n }));
  const estMonthlyCost = imagesMonth * EST_IMG_KZT + actionsMonth * EST_MSG_KZT;
  return { imagesTotal, imagesMonth, actionsMonth, estMonthlyCost, byTeam };
}

// ─── Финансы платформы ────────────────────────────────────────────────
export function listFinanceEntries(db: Database.Database) {
  return (db.prepare('SELECT id, data FROM platform_finance ORDER BY rowid DESC').all() as any[])
    .map(r => { try { return { ...JSON.parse(r.data), id: r.id }; } catch { return { id: r.id }; } });
}
export function createFinanceEntry(db: Database.Database, body: any) {
  const id = 'pf_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const data = { type: body.type === 'income' ? 'income' : 'expense', category: String(body.category || 'Прочее').slice(0, 100), amount: Number(body.amount) || 0, recurring: !!body.recurring, date: body.date || new Date().toISOString().slice(0, 10), note: String(body.note || '').slice(0, 300), id };
  db.prepare('INSERT INTO platform_finance (id, data) VALUES (?, ?)').run(id, JSON.stringify(data));
  return data;
}
export function deleteFinanceEntry(db: Database.Database, id: string) {
  db.prepare('DELETE FROM platform_finance WHERE id = ?').run(id);
}

export function financeOverview(db: Database.Database) {
  const teams = listTeams(db);
  const mrr = teams.reduce((s, t) => s + monthlyEquivalent(t.subscription), 0);
  const contracted = teams.reduce((s, t) => s + (t.subscription.status !== 'churned' && t.subscription.status !== 'trial' ? (Number(t.subscription.amount) || 0) : 0), 0);
  const entries = listFinanceEntries(db);
  const curMonth = new Date().toISOString().slice(0, 7);
  const expenseEntries = entries.filter(e => e.type === 'expense');
  const incomeEntries = entries.filter(e => e.type === 'income');
  // Месячные расходы = все recurring + разовые с датой в текущем месяце.
  const monthlyExpense = (list: any[]) => list.reduce((s, e) => s + (e.recurring || String(e.date || '').startsWith(curMonth) ? (Number(e.amount) || 0) : 0), 0);
  const expMonthly = monthlyExpense(expenseEntries);
  const incExtra = monthlyExpense(incomeEntries); // прочие доходы (не подписки)
  const byCategory = Object.entries(expenseEntries.reduce((m: Record<string, number>, e) => {
    if (e.recurring || String(e.date || '').startsWith(curMonth)) m[e.category] = (m[e.category] || 0) + (Number(e.amount) || 0);
    return m;
  }, {})).map(([category, amount]) => ({ category, amount: Number(amount) })).sort((a, b) => b.amount - a.amount);
  const ai = aiUsage(db);
  const totalMonthlyIncome = mrr + incExtra;
  return {
    income: { mrr, contracted, extra: incExtra, totalMonthly: totalMonthlyIncome },
    expenses: { monthly: expMonthly, byCategory },
    ai,
    net: totalMonthlyIncome - expMonthly,
    entries,
  };
}

// ─── Router ───────────────────────────────────────────────────────────
// Требует, чтобы ВЫШЕ уже отработали authMiddleware + requireSuperAdmin
// (см. монтирование в index.ts). requireSuperAdmin здесь же экспортируем.
export function makeRequireSuperAdmin(db: Database.Database) {
  return (req: any, res: any, next: any) => {
    const u = db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId) as any;
    if (!isSuperAdminEmail(u?.email)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

export function createOwnerRouter(db: Database.Database, onSuspendChange?: (teamId: string, suspended: boolean) => void) {
  const r = express.Router();

  r.get('/me', (_req, res) => res.json({ isSuperAdmin: true }));
  r.get('/overview', (_req, res) => res.json(ownerOverview(db)));
  r.get('/teams', (_req, res) => res.json(listTeams(db)));
  r.get('/teams/:id', (req, res) => { const d = teamDetail(db, req.params.id); if (!d) return res.status(404).json({ error: 'not found' }); res.json(d); });
  r.get('/users', (_req, res) => res.json(listAllUsers(db)));
  r.get('/activity', (req, res) => res.json(globalActivity(db, Math.min(500, Number(req.query.limit) || 100))));
  r.get('/errors', (req, res) => res.json(listErrors(db, Math.min(500, Number(req.query.limit) || 200))));

  // Роадмап владельца.
  r.get('/tasks', (_req, res) => res.json(listOwnerTasks(db)));
  r.post('/tasks', (req, res) => res.json(createOwnerTask(db, req.body || {})));
  r.patch('/tasks/:id', (req, res) => { const t = updateOwnerTask(db, req.params.id, req.body || {}); if (!t) return res.status(404).json({ error: 'not found' }); res.json(t); });
  r.delete('/tasks/:id', (req, res) => { deleteOwnerTask(db, req.params.id); res.json({ ok: true }); });

  // Финансы платформы.
  r.get('/finance', (_req, res) => res.json(financeOverview(db)));
  r.post('/finance/entries', (req, res) => res.json(createFinanceEntry(db, req.body || {})));
  r.delete('/finance/entries/:id', (req, res) => { deleteFinanceEntry(db, req.params.id); res.json({ ok: true }); });

  // Редактирование подписки (полный контроль).
  r.patch('/teams/:id/subscription', (req: any, res) => {
    const owner = db.prepare('SELECT created_at FROM users WHERE id = ?').get(req.params.id) as any;
    const body = req.body || {};
    const allowed: Partial<Subscription> = {};
    for (const k of ['plan', 'amount', 'currency', 'period', 'status', 'startedAt', 'expiresAt', 'note'] as const) {
      if (body[k] !== undefined) (allowed as any)[k] = body[k];
    }
    const sub = setSubscription(db, req.params.id, allowed, owner?.created_at);
    res.json({ ok: true, subscription: sub });
  });

  // Блокировка / разблокировка команды.
  r.post('/teams/:id/suspend', (req, res) => {
    const owner = db.prepare('SELECT created_at FROM users WHERE id = ?').get(req.params.id) as any;
    const sub = setSubscription(db, req.params.id, { suspended: true }, owner?.created_at);
    onSuspendChange?.(req.params.id, true);
    res.json({ ok: true, subscription: sub });
  });
  r.post('/teams/:id/unsuspend', (req, res) => {
    const owner = db.prepare('SELECT created_at FROM users WHERE id = ?').get(req.params.id) as any;
    const sub = setSubscription(db, req.params.id, { suspended: false }, owner?.created_at);
    onSuspendChange?.(req.params.id, false);
    res.json({ ok: true, subscription: sub });
  });

  return r;
}
