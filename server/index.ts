import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleUpdate, issueLinkCode, getLinkStatus, unlink, isTelegramReady, sendMessage as tgSendMessage, registerBotCommands, getOrCreateTeamInviteCode, rotateTeamInviteCode, teamInviteLink, notifyAssignment, ensureTrackCode, trackLink, orderLink, chatsLink, warehouseLink, appLink, startDailySummaryScheduler, buildDailySummary, buildPeriodSummary, verifyWebhookSecret, configureWebhookSecret, isWebhookSecretSet } from './telegram.js';
import { seedDemoData, clearDemoData, demoStatus } from './demoSeed.js';
import { initOwnerSchema, makeRequireSuperAdmin, createOwnerRouter, isTeamSuspended, isSuperAdminEmail, logError as logOwnerError } from './ownerAdmin.js';
import { runBackup, listBackups, startBackupScheduler } from './backup.js';
import { exportTeam } from './teamExport.js';
import { sendCapiEvent, metaCapiConfigured, type CapiConfig, type CapiEvent } from './capi.js';
import { fetchCreativeInsights, createCustomAudience, addUsersToAudience } from './metaAds.js';
import { sendWhatsAppText, parseInboundWhatsApp, whatsAppConfigured, type WhatsAppConfig } from './whatsapp.js';
import { sendInstagramText, parseInboundInstagram, instagramConfigured, type InstagramConfig } from './instagram.js';
import { isClaudeReady, runAgent as claudeRunAgent } from './claudeAgent.js';
import { sendEmail, isEmailReady, otpTemplate, inviteTemplate, passwordResetTemplate } from './email.js';
import { generate as aiImageGenerate, providerStatuses as aiImageProviders, type ProviderId } from './aiImage.js';
import { chat as aiChat, chatProviderStatuses, type ChatProviderId, type ChatMessage } from './aiChat.js';
import aiTools from './aiTools.js';
import { getPermissionLevel as getPermLevel, canRunTool } from './permissions.js';
import { transcribeAudio, parseAudioDataUrl, isWhisperReady } from './whisper.js';
import { readClientAI, writeClientAI, runClientAITest, DEFAULT_CLIENT_AI, ALL_CLIENT_AI_MODELS, type ClientAIConfig, type DayKey } from './clientAi.js';
import { INTEGRATION_CATALOG, getAllStatuses as getIntegrationStatuses, saveConfig as saveIntegrationConfig, disconnect as disconnectIntegration } from './integrations2.js';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Dev flag: enables the local secret fallback and surfacing OTP/reset codes in
// API responses when no email/SMS provider is configured. NEVER true in prod.
const DEV = process.env.NODE_ENV !== 'production';
// JWT secret must be set in production. In dev we allow a fixed fallback so
// local login keeps working; in prod an unset secret is a hard startup error
// (forgeable tokens otherwise).
const JWT_SECRET = process.env.JWT_SECRET || (DEV ? 'utir-soft-dev-secret-change-me' : '');
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET must be set in production (NODE_ENV=production). Refusing to start.');
  process.exit(1);
}
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

-- Production templates (BOM = Bill Of Materials). Teams build a catalog
-- of standard products (kitchen, wardrobe, etc.) with materials, labour,
-- and markup, then «Use in order» to instantiate one against a deal.
-- data is a JSON blob with the full template shape (see BOMTemplate
-- interface in the frontend).
CREATE TABLE IF NOT EXISTS bom_templates (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bom_templates_team ON bom_templates(team_id);

-- Suppliers — vendor catalog. JSON blob holds: name, contactPerson,
-- phone, email, address, paymentTerms, deliveryDays, rating, category,
-- notes. Each team has its own list.
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_suppliers_team ON suppliers(team_id);

-- Purchase orders — when stock gets low or a deal needs materials,
-- create a PO. JSON blob holds: supplierId, items (array of {name, qty,
-- unit, costPerUnit}), totalCost, status (draft/sent/received/cancelled),
-- expectedDate, receivedDate, notes, linkedDealIds.
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_team ON purchase_orders(team_id);

CREATE TABLE IF NOT EXISTS tax_payments (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  -- Period + tax code together, e.g. '2026-05-IPN' (month tax) or
  -- '2026-Q2-KPN' (quarterly). Unique per team so marking a tax «paid»
  -- twice just updates the row instead of inserting duplicates.
  period_key TEXT NOT NULL,
  amount REAL NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_by TEXT,
  note TEXT,
  UNIQUE (team_id, period_key)
);
CREATE INDEX IF NOT EXISTS idx_tax_payments_team ON tax_payments(team_id);

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

-- Чаты (внутренний инбокс). Диалог = разговор с клиентом/контактом,
-- общий для всей команды. data JSON: { name, platform, orderId?, avatar?,
-- lastMessage, lastMessageAt, unreadCount, online }.
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conversations_team ON conversations(team_id);

-- Сообщения внутри диалога. data JSON: { text, type, direction:'in'|'out',
-- senderName, fileUrl?, fileName?, fileSize?, duration?, read, createdAt }.
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);

-- Кастомные модули (конструктор модулей) — определения модулей, созданных
-- пользователем: id, enabled, custom, icon, fields[], labels, roleAccess.
-- Team-scoped, чтобы модуль видели все в команде, а не только автор.
CREATE TABLE IF NOT EXISTS custom_modules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_custom_modules_team ON custom_modules(team_id);

-- Записи внутри кастомных модулей: id, moduleId, createdAt, updatedAt,
-- values{}. Team-scoped.
CREATE TABLE IF NOT EXISTS custom_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_custom_records_team ON custom_records(team_id);

-- Лог отправленных в Meta CAPI событий (для дашборда «Реклама»): data =
-- { eventName, dealId, value, currency, status:'ok'|'err', paramCount, error }.
CREATE TABLE IF NOT EXISTS meta_events (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meta_events_team ON meta_events(team_id);
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
// Pending photo a field worker sent outside the design wizard — held as a
// data URL until they pick which deal to attach it to (Этап 2).
migrateColumn('telegram_links', 'pending_photo', 'TEXT');
// Daily owner summary state — JSON { enabled?: bool, lastSent?: 'YYYY-MM-DD' }.
// Drives the 09:00 Almaty morning digest pushed to admins/managers.
migrateColumn('team_settings', 'daily_summary', 'TEXT');
// Finance lock — 'YYYY-MM-DD'. Transactions dated on/before this are frozen
// (no edit/delete) so a closed/reported period can't be changed задним числом.
migrateColumn('team_settings', 'finance_lock_date', 'TEXT');
// Telegram-native worker onboarding — masters / measurers / installers who
// join via a deep-link invite and never touch the web. The reusable team
// invite code lives on team_settings; the per-chat onboarding state (name +
// role collection before a real account exists) lives in its own table.
migrateColumn('team_settings', 'tg_invite_code', 'TEXT');
db.exec(`
  CREATE TABLE IF NOT EXISTS telegram_onboarding (
    chat_id INTEGER PRIMARY KEY,
    team_id TEXT NOT NULL,
    step TEXT NOT NULL,           -- 'name' | 'role'
    draft_name TEXT,
    username TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
// Public order-tracking links — short codes mapping to a deal so the
// client can check status at utir.kz/#/track/<code> WITHOUT logging in.
db.exec(`
  CREATE TABLE IF NOT EXISTS track_links (
    code TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_track_deal ON track_links(deal_id);
`);
migrateColumn('users', 'company', "TEXT DEFAULT ''");
migrateColumn('users', 'verification_code', 'TEXT');
const verifiedJustAdded = migrateColumn('users', 'email_verified', 'INTEGER DEFAULT 0');
migrateColumn('users', 'terms_accepted_at', 'TEXT');
// AI assistant settings (Block F.4 — per-module permissions for Telegram bot)
// Stored as a JSON blob of the same shape as AISettings on the frontend.
migrateColumn('users', 'ai_settings', 'TEXT');
// Phone auth (SMS code) + OAuth provider tracking. Phone/social users may
// not have a real email — signup synthesises a unique placeholder so the
// NOT NULL UNIQUE constraint on `email` still holds.
migrateColumn('users', 'phone', 'TEXT');
migrateColumn('users', 'phone_verified', 'INTEGER DEFAULT 0');
migrateColumn('users', 'phone_code', 'TEXT');
migrateColumn('users', 'auth_provider', "TEXT DEFAULT 'password'");

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
// Integration configs — JSON keyed by integration id (e.g. 'kaspi-qr':
// { config: { merchantId, ... }, savedAt }). Env-key integrations (AI,
// Telegram bot) are NOT stored here — those live in Railway env vars
// and we just read process.env at status-time.
migrateColumn('team_settings', 'integrations', 'TEXT');
// Catalogs — JSON { productTemplates: [...], materials: [...], ... }.
// Team-wide so every employee picks from the same lists when creating
// deals / products. Previously was per-user in localStorage only.
migrateColumn('team_settings', 'catalogs', 'TEXT');
// Niche — short id from src/app/utils/niches.ts (furniture / windows /
// ceilings / blinds / doors / stairs / flooring / construction / custom).
// Drives default production stages, role labels, material categories
// across the whole platform. Defaults to 'furniture' for legacy teams
// when no value is set (preserves the original product positioning).
migrateColumn('team_settings', 'niche', 'TEXT');
// Secondary niches — JSON array of niche ids for multi-niche businesses
// (e.g. a company doing furniture + doors + stairs). Each deal can then
// be tagged with one of (primary niche + secondaryNiches) so its status
// labels / production stages / material categories follow the right
// niche instead of being forced into the primary one.
migrateColumn('team_settings', 'secondary_niches', 'TEXT');
// Public lead-form code — stable per-team slug for the shareable заявка page
// (#/lead/<code>). Leads submitted there land in the funnel as new deals
// tagged with their source/campaign. Generated lazily on first request.
migrateColumn('team_settings', 'lead_form_code', 'TEXT');
// Onboarding state — JSON { completed: bool, step?: string, completedAt?: ISO }.
// Drives whether we show the first-time setup wizard. Once completed=true
// the user won't see the wizard again unless explicitly reset.
migrateColumn('team_settings', 'onboarding', 'TEXT');
// Company profile shown in Settings → Общие (name/BIN/address/logo). Team-wide
// branding used in invoice / akt PDF headers. Was localStorage-only before.
migrateColumn('team_settings', 'company_profile', 'TEXT');
// Telegram-bot settings (панель настроек бота): шаблоны клиентам, расписание
// отчётов директору, алёрты, настройки склада/замерщиков. Team-wide.
migrateColumn('team_settings', 'bot_settings', 'TEXT');
// Meta Conversions API (CAPI) конфиг: pixelId (dataset), capiToken, testEventCode.
migrateColumn('team_settings', 'meta_capi', 'TEXT');
if (teamIdJustAdded) {
  db.exec(`UPDATE users SET team_id = id WHERE team_id IS NULL`);
  db.exec(`UPDATE users SET team_role = 'admin' WHERE team_role IS NULL`);
  console.log('[migration] back-filled team_id=id and team_role=admin for existing users');
}

// Схема дашборда владельца: подписки, блокировки, лог ошибок.
initOwnerSchema(db);

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

// ─── Устойчивость процесса ───────────────────────────────────────────
// Express 4 НЕ ловит реджекты из async-обработчиков — в Node 22 такой
// unhandledRejection роняет весь процесс (платформа ложится у всех).
// `ah()` оборачивает async-хендлер: любой throw/reject уходит в
// error-middleware (ниже), клиент получает чистый 500, процесс живёт.
type AnyHandler = (req: any, res: any, next: any) => any;
const ah = (fn: AnyHandler): AnyHandler => (req, res, next) => {
  try {
    const out = fn(req, res, next);
    if (out && typeof (out as any).then === 'function') (out as Promise<any>).catch(next);
  } catch (e) { next(e); }
};

// Автообёртка всех обработчиков маршрутов: любой хендлер, зарегистрированный
// через get/post/put/patch/delete/all (и на app, и на любом express.Router),
// оборачивается в ah(). Так реджект async-хендлера уходит в error-middleware,
// а не в unhandledRejection. Error-middleware (arity 4) и суб-роутеры не
// трогаем. Патч стоит ДО создания любого роутера/маршрута — проверено на
// express 4.22 (см. scratch-тест: param-роуты, цепочки middleware, роутеры —
// всё работает, процесс не падает).
function patchRouteVerbs(target: any) {
  for (const m of ['get', 'post', 'put', 'patch', 'delete', 'all']) {
    const orig = target[m];
    if (typeof orig !== 'function') continue;
    target[m] = function (path: any, ...handlers: any[]) {
      return orig.call(this, path, ...handlers.map((h: any) =>
        (typeof h === 'function' && h.length < 4) ? ah(h) : h));
    };
  }
}
patchRouteVerbs(app);                 // app.get/post/…
patchRouteVerbs(express.Router);      // router.get/post/… (все инстансы наследуют)

// Последний рубеж: даже если что-то прорвётся мимо ah()/Express, процесс
// не должен падать. Логируем и продолжаем работать.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

// CORS: в проде ограничиваем список origin через env CORS_ORIGINS
// (запятые). Без токена запросы (curl/мобильные/same-origin) всегда
// разрешены. В dev — всё разрешено (localhost:5173 и т.п.). Если
// CORS_ORIGINS не задан в проде — не ломаем деплой (разрешаем), но
// предупреждаем в лог, чтобы админ включил ограничение.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
if (!DEV && ALLOWED_ORIGINS.length === 0) {
  console.warn('[security] CORS_ORIGINS не задан — CORS открыт. Укажите домены фронтенда, чтобы ограничить.');
}
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                       // curl / mobile / same-origin
    if (DEV) return cb(null, true);                           // dev: любой origin
    if (ALLOWED_ORIGINS.length === 0) return cb(null, true);  // не настроено — не ломаем прод
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
// Bumped to 25MB because AI-design img2img sends base64 images for the room
// photo + up to 3 reference shots in one body.
app.use(express.json({
  limit: '25mb',
  // Сохраняем сырое тело только для вебхука Meta — нужно для проверки
  // подписи X-Hub-Signature-256 (HMAC по точным байтам запроса).
  verify: (req: any, _res, buf) => {
    if (req.originalUrl === '/api/webhooks/meta') req.rawBody = buf;
  },
}));

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
    // Команда заблокирована владельцем платформы (неоплата) → доступ закрыт.
    if (isTeamSuspended(db, req.teamId)) return res.status(403).json({ error: 'team suspended' });
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

// Reads open to any authed team member, writes (POST/PATCH/PUT/DELETE) require
// `min` role. For resources everyone should SEE but only privileged roles may
// CHANGE — e.g. the employee list (salaries!) or custom-module definitions.
function requireRoleForWrites(min: 'admin' | 'manager' | 'employee') {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const isWrite = req.method !== 'GET' && req.method !== 'HEAD';
    if (isWrite && !roleAtLeast(req.teamRole, min)) {
      return res.status(403).json({ error: `requires ${min} role to modify` });
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

// ─── Auth rate limiting ───────────────────────────────────────────
// In-memory sliding-window per IP+bucket. Protects /signup, /login,
// /resend-code, /forgot-password from brute-force and bot spam. Cleared
// on process restart — acceptable for an MVP. For multi-instance prod
// later: swap the Map for Redis with the same shape.
const rateBuckets = new Map<string, number[]>();
const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  signup:        { max: 5,  windowMs: 60 * 60 * 1000 },  // 5 / hour per IP
  login:         { max: 10, windowMs: 5  * 60 * 1000 },  // 10 / 5min — soft
  'resend-code': { max: 5,  windowMs: 15 * 60 * 1000 },  // 5 / 15min
  'forgot':      { max: 3,  windowMs: 15 * 60 * 1000 },  // 3 / 15min — strict, prevents email-spam-via-form
  'lead':        { max: 20, windowMs: 60 * 60 * 1000 },  // 20 / hour per IP — public lead form
  'phone':       { max: 8,  windowMs: 15 * 60 * 1000 },  // 8 / 15min — SMS code requests
  'track':       { max: 60, windowMs: 60 * 1000 },       // 60 / min per IP — публичный трек-линк: клиенту хватает с запасом, а перебор 7-символьных кодов делает бессмысленным
  'token-check': { max: 30, windowMs: 15 * 60 * 1000 },  // 30 / 15min — оракул валидности reset-токена (токены и так 64-hex, это defense-in-depth)
  'client-error': { max: 30, windowMs: 60 * 1000 },      // 30 / min — приём клиентских ошибок, чтобы не спамили лог
};
// В тестах (и при явном отключении) rate-limit мешает — прогон делает
// десятки signup с одного IP. Отключаем только в этих режимах.
const RATE_LIMIT_OFF = process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === '1';
function rateLimit(bucket: keyof typeof RATE_LIMITS) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (RATE_LIMIT_OFF) return next();
    const cfg = RATE_LIMITS[bucket];
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
            || req.socket.remoteAddress || 'unknown';
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    const window = (rateBuckets.get(key) || []).filter(t => now - t < cfg.windowMs);
    if (window.length >= cfg.max) {
      const retryAfter = Math.ceil((cfg.windowMs - (now - window[0])) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: `rate_limit: попробуйте через ${Math.ceil(retryAfter / 60)} мин.`,
      });
    }
    window.push(now);
    rateBuckets.set(key, window);
    next();
  };
}

// Periodic cleanup so the Map doesn't grow forever — drop entries with
// no events in the last hour.
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of rateBuckets) {
    const fresh = arr.filter(t => now - t < 60 * 60 * 1000);
    if (fresh.length === 0) rateBuckets.delete(k);
    else if (fresh.length !== arr.length) rateBuckets.set(k, fresh);
  }
}, 5 * 60 * 1000);

// ─── Password reset tokens ────────────────────────────────────────
// Sparse table — only rows for in-flight reset flows. Tokens are 32-char
// hex (cryptographically random) so they can't be brute-forced. We
// expire them after 1 hour and mark as used after a successful reset.
db.exec(`
CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
`);

function genResetToken(): string {
  // 32 random bytes → 64 hex chars. Plenty of entropy against guessing.
  return Array.from(randomBytes(32)).map(b => b.toString(16).padStart(2, '0')).join('');
}

app.post('/api/auth/signup', rateLimit('signup'), async (req, res) => {
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
    // Код возвращаем только в dev без отправленного письма — в проде никогда.
    verificationCode: (!emailResult.ok && DEV) ? verifyCode : undefined,
    emailSent: emailResult.ok,
  });
});

app.post('/api/auth/login', rateLimit('login'), async (req, res) => {
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
    user: { id: user.id, email: user.email, name: user.name, company: user.company || '', emailVerified: verified, teamRole: user.team_role || 'admin', isSuperAdmin: isSuperAdminEmail(user.email) },
    // SECURITY: never return the OTP code in login response. Even for
    // unverified users — they should use /resend-code (rate-limited) to
    // get the code emailed. The previous behavior leaked OTP to anyone
    // who knew the password, defeating the email-verification purpose.
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

app.post('/api/auth/resend-code', rateLimit('resend-code'), authMiddleware, async (req: AuthedRequest, res) => {
  const user = db.prepare('SELECT email, email_verified FROM users WHERE id = ?').get(req.userId!) as any;
  if (!user) return res.status(404).json({ error: 'user not found' });
  if (user.email_verified) return res.status(400).json({ error: 'already verified' });
  const code = genVerificationCode();
  db.prepare('UPDATE users SET verification_code = ? WHERE id = ?').run(code, req.userId!);
  const otp = otpTemplate(code);
  const emailResult = await sendEmail(user.email, otp.subject, otp.html, otp.text);
  res.json({
    // Dev fallback: surface the code so the OTP screen still works when no email provider.
    verificationCode: (!emailResult.ok && DEV) ? code : undefined,
    emailSent: emailResult.ok,
  });
});

app.get('/api/auth/me', authMiddleware, (req: AuthedRequest, res) => {
  const user = db.prepare('SELECT id, email, name, company, email_verified, team_role FROM users WHERE id = ?').get(req.userId!) as any;
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json({ user: { id: user.id, email: user.email, name: user.name, company: user.company || '', emailVerified: !!user.email_verified, teamRole: user.team_role || 'admin', isSuperAdmin: isSuperAdminEmail(user.email) } });
});

app.post('/api/auth/logout', authMiddleware, (req: AuthedRequest, res) => {
  const u = db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.userId!) as any;
  if (u) logActivity(req.userId!, { user: u.name, action: 'Вышел из системы', target: u.email, type: 'logout', page: 'auth' });
  res.json({ ok: true });
});

// ─── Password reset flow ──────────────────────────────────────────
// POST /api/auth/forgot-password { email } → always returns ok:true
// (don't leak whether the email exists in the system — prevents user-
// enumeration). If the email IS registered, generates a token, stores it
// in password_resets, and emails the reset link. If Resend isn't
// configured, surfaces the token in the response so dev / local testing
// still works (mirrors the OTP fallback pattern).
app.post('/api/auth/forgot-password', rateLimit('forgot'), async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    // Don't 400 — keep the response shape identical for valid/invalid
    // so attackers can't probe.
    return res.json({ ok: true });
  }
  const user = db.prepare('SELECT id, name, disabled_at FROM users WHERE email = ?').get(email) as any;
  if (!user || user.disabled_at) {
    // Same shape, no leakage of whether the account exists.
    return res.json({ ok: true });
  }
  const token = genResetToken();
  // 1-hour expiry. SQLite stores ISO timestamps as TEXT.
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  db.prepare(
    'INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)'
  ).run(token, user.id, expiresAt);

  // Build the reset link. Frontend listens on /#/reset-password?token=XXX.
  const origin = (req.headers.origin as string) || (req.headers.referer as string)?.replace(/\/$/, '') || 'https://utir-soft.com';
  const link = `${origin}/#/reset-password?token=${token}`;
  const tpl = passwordResetTemplate(link);
  const emailResult = await sendEmail(email, tpl.subject, tpl.html, tpl.text);

  logActivity(user.id, {
    user: user.name, action: 'Запросил сброс пароля',
    target: email, type: 'settings', page: 'auth',
  });

  res.json({
    ok: true,
    emailSent: emailResult.ok,
    // Dev fallback — when no email provider is configured, surface the
    // token so the user can still complete the flow locally. Never in prod.
    resetToken: (!emailResult.ok && DEV) ? token : undefined,
  });
});

// POST /api/auth/reset-password { token, password } → verifies the token
// hasn't expired or been used, updates the password hash, marks the
// token as used. Doesn't issue a new session — the user is bounced back
// to the login page after success so they explicitly re-authenticate.
app.post('/api/auth/reset-password', rateLimit('forgot'), async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');
  if (!token || token.length < 32) return res.status(400).json({ error: 'invalid_token' });
  const pwdCheck = passwordOk(password);
  if (!pwdCheck.ok) return res.status(400).json({ error: pwdCheck.reason });

  const row = db.prepare(
    `SELECT pr.user_id, pr.expires_at, pr.used_at, u.name, u.email
     FROM password_resets pr JOIN users u ON u.id = pr.user_id
     WHERE pr.token = ?`
  ).get(token) as any;
  if (!row) return res.status(400).json({ error: 'invalid_token' });
  if (row.used_at) return res.status(400).json({ error: 'token_already_used' });
  if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'token_expired' });

  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
  db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE token = ?").run(token);

  logActivity(row.user_id, {
    user: row.name, action: 'Сменил пароль через сброс',
    target: row.email, type: 'settings', page: 'auth',
  });

  res.json({ ok: true });
});

// POST /api/auth/change-password { currentPassword, newPassword } — for a
// logged-in user. Verifies the current password via bcrypt, then updates the
// hash. Mirrors reset-password but authenticated instead of token-based.
app.post('/api/auth/change-password', authMiddleware, async (req: AuthedRequest, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!currentPassword) return res.status(400).json({ error: 'current_required' });
  const pwdCheck = passwordOk(newPassword);
  if (!pwdCheck.ok) return res.status(400).json({ error: pwdCheck.reason });

  const user = db.prepare('SELECT id, name, email, password_hash FROM users WHERE id = ?').get(req.userId!) as any;
  if (!user) return res.status(404).json({ error: 'not_found' });

  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) return res.status(400).json({ error: 'invalid_current' });
  // Reject a no-op change so the user doesn't think they rotated it when they didn't.
  if (await bcrypt.compare(newPassword, user.password_hash)) return res.status(400).json({ error: 'same_password' });

  const hash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  logActivity(user.id, { user: user.name, action: 'Сменил пароль', target: user.email, type: 'settings', page: 'settings' });
  res.json({ ok: true });
});

// GET /api/auth/check-reset-token?token=XXX → tells the frontend if the
// link is still valid before rendering the new-password form. Avoids
// the user typing a new password only to be told the link expired.
app.get('/api/auth/check-reset-token', rateLimit('token-check'), (req, res) => {
  const token = String(req.query?.token || '').trim();
  if (!token) return res.json({ valid: false, reason: 'missing' });
  const row = db.prepare(
    'SELECT expires_at, used_at FROM password_resets WHERE token = ?'
  ).get(token) as any;
  if (!row) return res.json({ valid: false, reason: 'invalid' });
  if (row.used_at) return res.json({ valid: false, reason: 'used' });
  if (new Date(row.expires_at).getTime() < Date.now()) return res.json({ valid: false, reason: 'expired' });
  res.json({ valid: true });
});

// ─── Owner-user provisioning helper ───────────────────────────────
// Creates a brand-new own-team owner (no invite): user row + employees
// row + default integrations. Mirrors the scaffolding in /api/auth/signup
// so phone- and OAuth-signups land in exactly the same shape.
function provisionOwnerUser(opts: {
  name: string; email: string; company: string;
  passwordHash?: string | null; phone?: string | null;
  provider?: string; emailVerified?: boolean; phoneVerified?: boolean;
}): string {
  const id = newId('u_');
  const teamId = id;
  const role = 'admin';
  db.prepare(
    `INSERT INTO users
       (id, email, password_hash, name, company, email_verified, phone, phone_verified, auth_provider, terms_accepted_at, team_id, team_role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`
  ).run(
    id, opts.email.toLowerCase(), opts.passwordHash || '', opts.name.trim(), (opts.company || '').trim(),
    opts.emailVerified ? 1 : 0, opts.phone || null, opts.phoneVerified ? 1 : 0,
    opts.provider || 'password', teamId, role,
  );
  const empId = newId('e');
  const initial = (opts.name.trim().charAt(0) || '?').toUpperCase();
  const employeeData = {
    id: empId, name: opts.name.trim(), email: opts.email.toLowerCase(), phone: opts.phone || '',
    role, department: '', status: 'active', salary: 0,
    joinDate: new Date().toISOString().slice(0, 10), lastActive: new Date().toISOString(), avatar: initial,
    permissions: { sales: true, finance: true, warehouse: false, chats: true, analytics: true, settings: true },
    performance: { ordersCompleted: 0, rating: 0, efficiency: 0 },
  };
  db.prepare('INSERT INTO employees (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(empId, id, teamId, JSON.stringify(employeeData));
  seedIntegrations(id);
  return id;
}

// ─── Phone auth (SMS code) ────────────────────────────────────────
// Normalise KZ phones to +7XXXXXXXXXX. Accepts 8XXXXXXXXXX / 10-digit input.
function normPhone(raw: string): string | null {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  if (d.length !== 11 || d[0] !== '7') return null;
  return '+' + d;
}

// DEV MODE: no SMS gateway wired → returns {ok:false} so the caller surfaces
// the code to the client (mirrors the email-OTP dev fallback). Plug a real
// provider (Mobizon / SMSC.kz / Twilio) here and return {ok:true} on send.
async function sendSms(_phone: string, _code: string): Promise<{ ok: boolean }> {
  if (!process.env.SMS_API_KEY) return { ok: false };
  // TODO: real provider call using SMS_API_KEY / SMS_SENDER here.
  return { ok: false };
}

app.post('/api/auth/phone/start', rateLimit('phone'), async (req, res) => {
  const { phone, mode, name, company } = req.body || {};
  const norm = normPhone(phone);
  if (!norm) return res.status(400).json({ error: 'invalid phone' });
  const code = genVerificationCode();
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(norm) as any;
  if (mode === 'signup') {
    if (existing) return res.status(409).json({ error: 'phone already registered' });
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    if (!company || !String(company).trim()) return res.status(400).json({ error: 'company required' });
    const placeholderEmail = `${norm.replace('+', '')}@phone.utir`;
    const id = provisionOwnerUser({ name, email: placeholderEmail, company, phone: norm, provider: 'phone' });
    db.prepare('UPDATE users SET phone_code = ? WHERE id = ?').run(code, id);
  } else {
    if (!existing) return res.status(404).json({ error: 'phone not found' });
    db.prepare('UPDATE users SET phone_code = ? WHERE id = ?').run(code, existing.id);
  }
  const sms = await sendSms(norm, code);
  res.json({ ok: true, smsSent: sms.ok, code: (!sms.ok && DEV) ? code : undefined });
});

app.post('/api/auth/phone/verify', rateLimit('phone'), (req, res) => {
  const { phone, code } = req.body || {};
  const norm = normPhone(phone);
  if (!norm) return res.status(400).json({ error: 'invalid phone' });
  const user = db.prepare('SELECT id, name, email, company, phone_code, team_role, disabled_at FROM users WHERE phone = ?').get(norm) as any;
  if (!user) return res.status(404).json({ error: 'phone not found' });
  if (user.disabled_at) return res.status(403).json({ error: 'account disabled' });
  if (!user.phone_code || String(user.phone_code) !== String(code).trim()) return res.status(400).json({ error: 'invalid code' });
  db.prepare('UPDATE users SET phone_verified = 1, phone_code = NULL WHERE id = ?').run(user.id);
  seedIntegrations(user.id);
  logActivity(user.id, { user: user.name, action: 'Вошёл по номеру телефона', target: norm, type: 'login', page: 'auth' });
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, company: user.company || '', phone: norm, emailVerified: true, teamRole: user.team_role || 'admin' } });
});

// ─── Google / Facebook OAuth (authorization-code flow) ────────────
// Gated on env credentials. When keys are missing the /api/auth/<p> route
// bounces back to the app with ?oauth=notconfigured so the UI can explain.
// Setup steps: см. SETUP-OAUTH.md в корне репозитория.
// Trim env values — pasting into hosting dashboards (Railway raw editor)
// easily introduces stray spaces/tabs/newlines which corrupt redirect URLs.
const envUrl = (v: string | undefined) => (v || '').trim().replace(/\/+$/, '');
const APP_URL = envUrl(process.env.APP_URL) || 'http://localhost:5173';
function oauthRedirectUri(req: any, provider: string): string {
  const base = envUrl(process.env.OAUTH_CALLBACK_BASE) || `${req.protocol}://${req.get('host')}`;
  return `${base}/api/auth/${provider}/callback`;
}
// Find-or-create a user from a verified social profile, return a JWT.
function upsertOAuthUser(opts: { email: string; name: string; provider: string }): string {
  const email = String(opts.email || '').toLowerCase();
  if (!email) throw new Error('no email from provider');
  const found = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as any;
  const id = found ? found.id : provisionOwnerUser({
    name: opts.name || email, email, company: opts.name || 'Моя компания',
    provider: opts.provider, emailVerified: true,
  });
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(id);
  seedIntegrations(id);
  logActivity(id, { user: opts.name || email, action: `Вошёл через ${opts.provider}`, target: email, type: 'login', page: 'auth' });
  return jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: '30d' });
}

// ─── OAuth CSRF-защита (state) + безопасная передача токена ──────────
// state: случайная строка, кладётся в httpOnly-cookie на старте и
// сравнивается с параметром при возврате — привязка к браузеру,
// закрывает login-CSRF. Оба OAuth-эндпоинта на одном (API) origin, так
// что cookie доезжает. SameSite=Lax → cookie доходит при top-level
// редиректе назад от Google/Facebook.
function setOAuthStateCookie(res: Response, state: string) {
  res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: !DEV, maxAge: 10 * 60 * 1000, path: '/' });
}
function readRawCookie(req: Request, name: string): string {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return '';
}
function oauthStateOk(req: Request, res: Response): boolean {
  const fromUrl = String(req.query.state || '');
  const fromCookie = readRawCookie(req, 'oauth_state');
  res.clearCookie('oauth_state', { path: '/' });
  return fromUrl.length > 0 && fromCookie.length > 0 && fromUrl === fromCookie;
}

app.get('/api/auth/google', (req, res) => {
  const cid = (process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!cid) return res.redirect(`${APP_URL}/?oauth=notconfigured`);
  const state = randomBytes(16).toString('hex');
  setOAuthStateCookie(res, state);
  const params = new URLSearchParams({
    client_id: cid, redirect_uri: oauthRedirectUri(req, 'google'),
    response_type: 'code', scope: 'openid email profile', prompt: 'select_account', state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});
app.get('/api/auth/google/callback', async (req, res) => {
  try {
    if (!oauthStateOk(req, res)) return res.redirect(`${APP_URL}/?oauth=failed`);
    const code = String(req.query.code || '');
    const cid = (process.env.GOOGLE_CLIENT_ID || '').trim(), secret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    if (!code || !cid || !secret) return res.redirect(`${APP_URL}/?oauth=failed`);
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: cid, client_secret: secret, redirect_uri: oauthRedirectUri(req, 'google'), grant_type: 'authorization_code' }).toString(),
    });
    const tk: any = await tokenResp.json();
    if (!tk.access_token) return res.redirect(`${APP_URL}/?oauth=failed`);
    const profResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tk.access_token}` } });
    const profile: any = await profResp.json();
    const token = upsertOAuthUser({ email: profile.email, name: profile.name || profile.email, provider: 'google' });
    // Токен во фрагменте (#), а не в query (?): фрагмент не уходит в
    // Referer и не пишется в логи прокси/сервера.
    res.redirect(`${APP_URL}/#oauth_token=${token}`);
  } catch { res.redirect(`${APP_URL}/?oauth=failed`); }
});

app.get('/api/auth/facebook', (req, res) => {
  const aid = (process.env.FACEBOOK_APP_ID || '').trim();
  if (!aid) return res.redirect(`${APP_URL}/?oauth=notconfigured`);
  const state = randomBytes(16).toString('hex');
  setOAuthStateCookie(res, state);
  const params = new URLSearchParams({
    client_id: aid, redirect_uri: oauthRedirectUri(req, 'facebook'),
    response_type: 'code', scope: 'email public_profile', state,
  });
  res.redirect(`https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`);
});
app.get('/api/auth/facebook/callback', async (req, res) => {
  try {
    if (!oauthStateOk(req, res)) return res.redirect(`${APP_URL}/?oauth=failed`);
    const code = String(req.query.code || '');
    const aid = (process.env.FACEBOOK_APP_ID || '').trim(), secret = (process.env.FACEBOOK_APP_SECRET || '').trim();
    if (!code || !aid || !secret) return res.redirect(`${APP_URL}/?oauth=failed`);
    const tokenResp = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${new URLSearchParams({
      client_id: aid, client_secret: secret, redirect_uri: oauthRedirectUri(req, 'facebook'), code,
    }).toString()}`);
    const tk: any = await tokenResp.json();
    if (!tk.access_token) return res.redirect(`${APP_URL}/?oauth=failed`);
    const profResp = await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(tk.access_token)}`);
    const profile: any = await profResp.json();
    if (!profile.email) return res.redirect(`${APP_URL}/?oauth=noemail`);
    const token = upsertOAuthUser({ email: profile.email, name: profile.name || profile.email, provider: 'facebook' });
    res.redirect(`${APP_URL}/#oauth_token=${token}`);
  } catch { res.redirect(`${APP_URL}/?oauth=failed`); }
});

// Report which social providers are configured — the UI shows the buttons
// but explains "нужна настройка" when a provider has no keys yet.
app.get('/api/auth/providers', (_req, res) => {
  res.json({
    google: !!process.env.GOOGLE_CLIENT_ID,
    facebook: !!process.env.FACEBOOK_APP_ID,
    sms: !!process.env.SMS_API_KEY,
  });
});

// ─── GENERIC CRUD ROUTER FACTORY ───────────────────────
// Filters by team_id, not user_id — every team member sees the same data.
// user_id is still recorded on INSERT as audit (who created the row), but
// access checks all go through team_id.
// Read the team's finance lock date (or null).
function financeLock(teamId: string): string | null {
  try {
    const row = db.prepare('SELECT finance_lock_date FROM team_settings WHERE team_id = ?').get(teamId) as any;
    return row?.finance_lock_date || null;
  } catch { return null; }
}
// A YYYY-MM-DD date is frozen when it falls on/before the lock date.
function isDateLocked(teamId: string, date: string | undefined): boolean {
  const lock = financeLock(teamId);
  if (!lock || !date) return false;
  return String(date).slice(0, 10) <= lock;
}

function makeCrud(table: string, idPrefix: string, opts?: { lockable?: boolean }) {
  const r = express.Router();
  r.use(authMiddleware);
  const lockable = !!opts?.lockable;
  const LOCK_MSG = 'period locked';

  r.get('/', (req: AuthedRequest, res) => {
    const rows = db.prepare(`SELECT id, data FROM ${table} WHERE team_id = ? ORDER BY rowid DESC`).all(req.teamId!) as any[];
    res.json(rows.map(r => ({ ...JSON.parse(r.data), id: r.id })));
  });

  r.post('/', (req: AuthedRequest, res) => {
    const body = req.body || {};
    // Can't backdate a new record into a locked (closed) period.
    if (lockable && isDateLocked(req.teamId!, body.date)) return res.status(409).json({ error: LOCK_MSG });
    const id = body.id || newId(idPrefix);
    const data = { ...body, id };
    db.prepare(`INSERT INTO ${table} (id, user_id, team_id, data) VALUES (?, ?, ?, ?)`).run(id, req.userId!, req.teamId!, JSON.stringify(data));
    res.json(data);
  });

  r.patch('/:id', (req: AuthedRequest, res) => {
    const row = db.prepare(`SELECT data FROM ${table} WHERE id = ? AND team_id = ?`).get(req.params.id, req.teamId!) as any;
    if (!row) return res.status(404).json({ error: 'not found' });
    const prev = JSON.parse(row.data);
    // Frozen if either the existing OR the new date sits in a locked period.
    if (lockable && (isDateLocked(req.teamId!, prev.date) || isDateLocked(req.teamId!, req.body?.date))) {
      return res.status(409).json({ error: LOCK_MSG });
    }
    const updated = { ...prev, ...req.body, id: req.params.id };
    db.prepare(`UPDATE ${table} SET data = ? WHERE id = ? AND team_id = ?`).run(JSON.stringify(updated), req.params.id, req.teamId!);
    res.json(updated);
  });

  r.delete('/:id', (req: AuthedRequest, res) => {
    if (lockable) {
      const row = db.prepare(`SELECT data FROM ${table} WHERE id = ? AND team_id = ?`).get(req.params.id, req.teamId!) as any;
      if (row && isDateLocked(req.teamId!, JSON.parse(row.data).date)) return res.status(409).json({ error: LOCK_MSG });
    }
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

// ─── Директорские алёрты бота (Настроить бота → алёрты) ──────────────
// Событие в CRM → реальное сообщение в Telegram всем привязанным
// админам/менеджерам команды, если этот тип алёрта включён в bot_settings.
function readBotSettings(teamId: string): any {
  try {
    const row = db.prepare('SELECT bot_settings FROM team_settings WHERE team_id = ?').get(teamId) as any;
    return row?.bot_settings ? JSON.parse(row.bot_settings) : {};
  } catch { return {}; }
}
function bossChatIds(teamId: string): number[] {
  const rows = db.prepare(
    `SELECT tl.chat_id FROM telegram_links tl JOIN users u ON u.id = tl.user_id
     WHERE u.team_id = ? AND tl.chat_id IS NOT NULL AND u.team_role IN ('admin','manager')`,
  ).all(teamId) as any[];
  return rows.map(r => r.chat_id as number).filter(Boolean);
}
async function sendBotAlert(teamId: string, alertKey: string, text: string) {
  if (!isTelegramReady()) return;
  const s = readBotSettings(teamId);
  // Если настройки ещё не сохраняли — считаем алёрты включёнными (как дефолт).
  const enabled = s.activeAlerts === undefined || (Array.isArray(s.activeAlerts) && s.activeAlerts.includes(alertKey));
  if (!enabled) return;
  const chatIds = bossChatIds(teamId);
  for (const chatId of chatIds) {
    try { await tgSendMessage(chatId, text); } catch { /* ignore per-recipient failure */ }
  }
}

// Deal-status notifications. Intercept PATCH /api/deals/:id before the
// generic CRUD: if `status` changed and the deal has an ownerId (or a
// matched paired teammate), DM them on Telegram with the new stage.
app.patch('/api/deals/:id', authMiddleware, requirePermission('orders'), async (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT data FROM deals WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  let before: any;
  try { before = JSON.parse(row.data); } catch { return res.status(422).json({ error: 'corrupt deal record' }); }
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
                `<a href="${orderLink(req.params.id)}">Открыть заказ →</a>`;
              await tgSendMessage(link.chat_id, msg);
            }
          }
        }
      }
    } catch (e) { console.warn('[deals] tg notify on status change failed', e); }
    // External webhook fan-out — separate event from the generic update so
    // consumers can listen specifically for stage transitions.
    emitEvent(req.teamId!, 'deal.status_changed', { dealId: req.params.id, from: before.status, to: updated.status, deal: updated });

    // Директорские алёрты в Telegram (реальная отправка по настройкам бота).
    try {
      const amt = Number(updated.amount) || 0;
      const amtStr = `${Math.round(amt).toLocaleString('ru-RU').replace(/,/g, ' ')} ₸`;
      const openLink = `\n\n<a href="${orderLink(req.params.id)}">Открыть заказ →</a>`;
      // Оплата поступила — когда paidAmount вырос (частичная или полная).
      const paidBefore = Number(before.paidAmount) || 0;
      const paidNow = Number(updated.paidAmount) || 0;
      if (paidNow > paidBefore) {
        const delta = paidNow - paidBefore;
        const deltaStr = `${Math.round(delta).toLocaleString('ru-RU').replace(/,/g, ' ')} ₸`;
        const rest = Math.max(0, amt - paidNow);
        const restStr = `${Math.round(rest).toLocaleString('ru-RU').replace(/,/g, ' ')} ₸`;
        const full = rest === 0 && amt > 0;
        await sendBotAlert(req.teamId!, 'Оплата поступила',
          `<b>💵 ${full ? 'Оплачено полностью' : 'Поступила оплата'}</b>\n${updated.customerName || 'Сделка'} · +${deltaStr}` +
          `${full ? '' : `\nОстаток: ${restStr}`}` + openLink);
      }
      if (updated.status === 'rejected') {
        const reason = updated.rejectReason || updated.lostReason || updated.rejectionReason;
        await sendBotAlert(req.teamId!, 'Отказ клиента',
          `<b>❌ Отказ клиента</b>\n${updated.customerName || 'Сделка'}${amt ? ` · ${amtStr}` : ''}` +
          `${reason ? `\nПричина: ${reason}` : ''}` + openLink);
      }
      if (updated.status === 'completed' && amt >= 1_000_000) {
        await sendBotAlert(req.teamId!, 'Крупная сделка > 1 млн ₸',
          `<b>💰 Крупная сделка закрыта</b>\n${updated.customerName || 'Сделка'} · ${amtStr}` + openLink);
      }
    } catch (e) { console.warn('[deals] bot alert failed', e); }
  }

  // Meta CAPI — событие в рекламный кабинет (если подключён). Независимо от
  // Telegram. Purchase на оплате, Lose_Deal на отказе, StageChange на этапе.
  if (statusChanged) {
    try {
      const amt = Number(updated.amount) || 0;
      if (updated.status === 'completed' && amt > 0) {
        await emitCapiForDeal(req.teamId!, 'Purchase', updated, { value: amt, eventId: `Purchase-${updated.id}` });
      } else if (updated.status === 'rejected') {
        await emitCapiForDeal(req.teamId!, 'Lose_Deal', updated, { eventId: `Lose-${updated.id}` });
      } else {
        await emitCapiForDeal(req.teamId!, 'StageChange', updated, { eventId: `StageChange-${updated.id}-${updated.status}`, stage: updated.status });
      }
    } catch (e) { console.warn('[deals] capi emit failed', e); }
  }
  // Always emit a generic 'deal.updated' too (with the same diff that landed
  // in deal_history) so integrations that want all changes can subscribe once.
  if (Object.keys(changes).length > 0) {
    emitEvent(req.teamId!, 'deal.updated', { dealId: req.params.id, changes, deal: updated });
  }

  // ─── Assignment push (Этап 5 — web → worker bridge) ──────────────
  // When a worker is freshly assigned to this deal (ownerId set, or a
  // role field like measurer/designer/foreman changed to a non-empty
  // name), DM them their action card on Telegram so the job lands the
  // instant the manager assigns it — no web, no polling.
  if (isTelegramReady()) {
    try {
      const assignEmpIds = new Set<string>();
      if (changes.ownerId && updated.ownerId) assignEmpIds.add(String(updated.ownerId));
      const nameFields = ['measurer', 'designer', 'foreman', 'architect'] as const;
      const changedNames = nameFields.filter(f => changes[f] && updated[f]).map(f => String(updated[f]));
      if (changedNames.length > 0) {
        const allEmps = db.prepare('SELECT id, data FROM employees WHERE team_id = ?').all(req.teamId!) as any[];
        for (const r of allEmps) {
          try {
            const d = JSON.parse(r.data);
            const nameLow = (d.name || '').toLowerCase(); if (!nameLow) continue;
            const firstLow = nameLow.split(/\s+/)[0] || '';
            const hit = changedNames.some(v => { const vl = v.toLowerCase(); return vl.includes(nameLow) || (firstLow.length > 2 && vl.includes(firstLow)); });
            if (hit) assignEmpIds.add(r.id);
          } catch { /* skip */ }
        }
      }
      for (const empId of assignEmpIds) {
        await notifyAssignment(db, req.teamId!, req.params.id, empId);
      }
    } catch (e) { console.warn('[deals] assignment notify failed', e); }
  }

  res.json(updated);
});

// Get (or mint) the public tracking link for a deal — shown to the
// client so they can follow their order without logging in.
app.get('/api/deals/:id/track-link', authMiddleware, requirePermission('orders'), (req: AuthedRequest, res) => {
  const own = db.prepare('SELECT 1 FROM deals WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!);
  if (!own) return res.status(404).json({ error: 'not found' });
  const code = ensureTrackCode(db, req.teamId!, req.params.id);
  res.json({ code, link: trackLink(code) });
});

// ─── PUBLIC order tracking (no auth) ──────────────────────────────
// GET /api/track/:code → sanitized snapshot of the deal for the client.
// Deliberately omits internal data: costs breakdown, notes, БИН, other
// clients. Shows what the customer legitimately needs: their order's
// status, timeline, payment progress, and how to reach the manager.
const TRACK_STAGE_LABEL: Record<string, string> = {
  new: 'Заявка принята', measured: 'Замер выполнен', 'project-agreed': 'Проект согласован',
  contract: 'Договор подписан', production: 'В производстве', assembly: 'Сборка',
  manufacturing: 'Изготовление', installation: 'Монтаж', completed: 'Готово', rejected: 'Отменён',
};
const TRACK_STAGE_ORDER = ['new', 'measured', 'project-agreed', 'contract', 'production', 'installation', 'completed'];
app.get('/api/track/:code', rateLimit('track'), (req, res) => {
  const link = db.prepare('SELECT deal_id, team_id FROM track_links WHERE code = ?').get(String(req.params.code || '').toUpperCase()) as any;
  if (!link) return res.status(404).json({ error: 'not found' });
  const row = db.prepare('SELECT data FROM deals WHERE id = ? AND team_id = ?').get(link.deal_id, link.team_id) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  let d: any; try { d = JSON.parse(row.data); } catch { return res.status(404).json({ error: 'not found' }); }

  // Manager contact — the assigned employee (owner → measurer → designer).
  let manager: { name: string; phone: string } | null = null;
  const tryEmp = (predicate: (e: any) => boolean) => {
    if (manager) return;
    const emps = db.prepare('SELECT data FROM employees WHERE team_id = ?').all(link.team_id) as any[];
    for (const r of emps) { try { const e = JSON.parse(r.data); if (predicate(e)) { manager = { name: e.name || '', phone: e.phone || '' }; return; } } catch { /* skip */ } }
  };
  if (d.ownerId) tryEmp(e => e.id === d.ownerId);
  if (!manager && d.designer) tryEmp(e => (e.name || '').toLowerCase() === String(d.designer).toLowerCase());
  if (!manager && d.measurer) tryEmp(e => (e.name || '').toLowerCase() === String(d.measurer).toLowerCase());

  // Company name + phone from team requisites (best-effort).
  let company: { name: string; phone: string } = { name: 'Utir Soft', phone: '' };
  try {
    const ts = db.prepare('SELECT company_requisites FROM team_settings WHERE team_id = ?').get(link.team_id) as any;
    if (ts?.company_requisites) {
      const r = JSON.parse(ts.company_requisites);
      company = { name: r.legalName || r.name || 'Utir Soft', phone: r.phone || '' };
    }
  } catch { /* keep default */ }

  // Timeline — funnel stages with done/active flags + known dates.
  const curIdx = Math.max(0, TRACK_STAGE_ORDER.indexOf(d.status));
  const stages = TRACK_STAGE_ORDER.map((id, i) => ({
    id, label: TRACK_STAGE_LABEL[id] || id,
    done: i < curIdx || d.status === 'completed',
    active: i === curIdx && d.status !== 'completed',
    date: id === 'new' ? (d.createdAt || '').slice(0, 10)
        : id === 'measured' ? (d.measurementDate || '')
        : id === 'completed' ? (d.installationDate || '')
        : '',
  }));

  // First name only — don't echo the full name on a shareable link.
  const firstName = String(d.customerName || '').split(/\s+/)[0] || '';

  res.json({
    company,
    order: {
      ref: String(link.deal_id).slice(-6).toUpperCase(),
      customerFirstName: firstName,
      product: d.product || d.furnitureType || '',
      status: d.status,
      statusLabel: TRACK_STAGE_LABEL[d.status] || d.status,
      progress: Number(d.progress) || 0,
      rejected: d.status === 'rejected',
      completed: d.status === 'completed',
      hasReview: !!d.review,
    },
    stages,
    payment: d.amount > 0 ? {
      amount: Number(d.amount) || 0,
      paid: Number(d.paidAmount) || 0,
      pct: d.amount ? Math.round(((d.paidAmount || 0) / d.amount) * 100) : 0,
    } : null,
    manager,
    warranty: d.warranty || null,
    installationDate: d.installationDate || '',
  });
});

// POST /api/track/:code/review → client leaves a rating (1-5) + optional
// text on a completed order. No auth (public Trackpage). Stored on the deal
// JSON as `review`; idempotent-ish — overwrites a previous review. Feeds the
// team's «Отзывы» (соц-доказательство) without exposing any team data.
app.post('/api/track/:code/review', rateLimit('track'), (req, res) => {
  const link = db.prepare('SELECT deal_id, team_id FROM track_links WHERE code = ?').get(String(req.params.code || '').toUpperCase()) as any;
  if (!link) return res.status(404).json({ error: 'not found' });
  const row = db.prepare('SELECT data FROM deals WHERE id = ? AND team_id = ?').get(link.deal_id, link.team_id) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  let d: any; try { d = JSON.parse(row.data); } catch { return res.status(404).json({ error: 'not found' }); }

  const rating = Math.round(Number((req.body || {}).rating));
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'rating must be 1-5' });
  const text = String((req.body || {}).text || '').slice(0, 1000).trim();

  d.review = { rating, text: text || undefined, at: new Date().toISOString() };
  db.prepare('UPDATE deals SET data = ? WHERE id = ? AND team_id = ?').run(JSON.stringify(d), link.deal_id, link.team_id);
  res.json({ ok: true });
});

// ─── Public lead form (заявка с сайта/рекламы) ──────────────────────
// Stable per-team code → a public form page can POST new leads straight
// into the funnel, tagged with their source/campaign for ROI attribution.
function getOrCreateLeadFormCode(teamId: string): string {
  const row = db.prepare('SELECT lead_form_code FROM team_settings WHERE team_id = ?').get(teamId) as any;
  if (row?.lead_form_code) return row.lead_form_code;
  const code = 'L' + Math.random().toString(36).slice(2, 8).toUpperCase();
  if (row) db.prepare('UPDATE team_settings SET lead_form_code = ? WHERE team_id = ?').run(code, teamId);
  else db.prepare('INSERT INTO team_settings (team_id, lead_form_code) VALUES (?, ?)').run(teamId, code);
  return code;
}

// Authed: get (or lazily create) this team's lead-form code. Marketing
// module gates it — same as the dashboard that consumes the leads.
app.get('/api/team/lead-form', authMiddleware, (req: AuthedRequest, res) => {
  res.json({ code: getOrCreateLeadFormCode(req.teamId!) });
});

// Public: company + niche info so the form can brand itself + offer the
// right product-type hint. No team data leaked beyond name.
app.get('/api/lead/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const ts = db.prepare('SELECT team_id, company_requisites, niche FROM team_settings WHERE lead_form_code = ?').get(code) as any;
  if (!ts) return res.status(404).json({ error: 'not found' });
  let company = { name: 'Utir Soft' };
  try { if (ts.company_requisites) { const r = JSON.parse(ts.company_requisites); company = { name: r.legalName || r.name || 'Utir Soft' }; } } catch { /* default */ }
  res.json({ company, niche: ts.niche || 'furniture' });
});

// Pick the sales-capable teammate with the FEWEST active deals — fair,
// load-balanced lead distribution. Returns '' if no eligible manager.
function pickLeastLoadedManager(teamId: string): string {
  const SALES_ROLES = new Set(['admin', 'manager', 'sales']);
  const empRows = db.prepare('SELECT id, data FROM employees WHERE team_id = ?').all(teamId) as any[];
  const eligible: { id: string }[] = [];
  for (const r of empRows) {
    try {
      const e = JSON.parse(r.data);
      if (SALES_ROLES.has(e.role) && (e.status || 'active') === 'active') eligible.push({ id: r.id });
    } catch { /* skip */ }
  }
  if (eligible.length === 0) return '';
  // Active (non-final) deal counts per owner.
  const load = new Map<string, number>();
  const dealRows = db.prepare('SELECT data FROM deals WHERE team_id = ?').all(teamId) as any[];
  for (const r of dealRows) {
    try {
      const d = JSON.parse(r.data);
      if (d.ownerId && d.status !== 'completed' && d.status !== 'rejected') {
        load.set(d.ownerId, (load.get(d.ownerId) || 0) + 1);
      }
    } catch { /* skip */ }
  }
  eligible.sort((a, b) => (load.get(a.id) || 0) - (load.get(b.id) || 0));
  return eligible[0].id;
}

// Public: submit a lead → creates a `new` deal in the team's funnel.
app.post('/api/lead/:code', rateLimit('lead'), (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const ts = db.prepare('SELECT team_id FROM team_settings WHERE lead_form_code = ?').get(code) as any;
  if (!ts) return res.status(404).json({ error: 'not found' });

  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 120);
  const phone = String(b.phone || '').trim().slice(0, 40);
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });

  const product = String(b.product || '').trim().slice(0, 200);
  const comment = String(b.comment || '').trim().slice(0, 1000);
  const source = String(b.source || 'Сайт').trim().slice(0, 60) || 'Сайт';
  const campaign = String(b.campaign || '').trim().slice(0, 120);

  const id = newId('D');
  const sourceIcon: Record<string, string> = { Instagram: 'instagram', WhatsApp: 'whatsapp', Telegram: 'telegram', Сайт: 'phone' };
  // Авто-распределение: лид уходит менеджеру с наименьшей загрузкой
  // (по числу активных сделок) — справедливо и быстро для SLA.
  const ownerId = pickLeastLoadedManager(ts.team_id);
  const deal: any = {
    id,
    customerName: name,
    phone,
    address: '', siteAddress: '',
    product: product || 'Заявка с сайта',
    furnitureType: product || '',
    amount: 0, paidAmount: 0,
    status: 'new',
    icon: sourceIcon[source] || 'phone',
    priority: 'medium',
    date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
    progress: 5,
    source,
    campaign: campaign || undefined,
    ownerId: ownerId || undefined,
    measurer: '', designer: '', materials: '',
    measurementDate: '', completionDate: '', installationDate: '',
    paymentMethods: {},
    // Рекламная атрибуция: fbc из fbclid перехода + fbp cookie (если есть).
    fbc: buildFbc(b), fbp: b.fbp ? String(b.fbp).slice(0, 100) : undefined,
    notes: comment ? `Заявка с лид-формы: ${comment}` : 'Заявка с лид-формы',
    createdAt: new Date().toISOString(),
  };
  db.prepare('INSERT INTO deals (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(id, 'lead-form', ts.team_id, JSON.stringify(deal));
  // Мгновенный пуш назначенному менеджеру в Telegram (best-effort).
  if (ownerId) { try { void notifyAssignment(db, ts.team_id, id, ownerId); } catch { /* ignore */ } }
  // Meta CAPI — Lead из рекламы (с fbc/fbp/ip/ua для атрибуции по креативу).
  void emitCapiForDeal(ts.team_id, 'Lead', deal, { actionSource: 'website', clientIp: clientIpOf(req), userAgent: req.headers['user-agent'] });
  res.json({ ok: true });
});

// Public: submit a measurement booking → creates a `new` deal carrying the
// measurement date/slot. Mirrors /api/lead but for the multi-step booking
// wizard, so a logged-out visitor can actually book (was silently dropped).
// Returns the new deal id so the client can build the tracking link.
app.post('/api/booking/:code', rateLimit('lead'), (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const ts = db.prepare('SELECT team_id FROM team_settings WHERE lead_form_code = ?').get(code) as any;
  if (!ts) return res.status(404).json({ error: 'not found' });

  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 120);
  const phone = String(b.phone || '').trim().slice(0, 40);
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });

  const product = String(b.product || '').trim().slice(0, 200);
  const address = String(b.address || '').trim().slice(0, 300);
  const measurementDate = String(b.measurementDate || '').trim().slice(0, 30);
  const dateLabel = String(b.date || '').trim().slice(0, 60);
  const slot = String(b.slot || '').trim().slice(0, 60);
  const notes = String(b.notes || '').trim().slice(0, 1000);

  const id = newId('D');
  const ownerId = pickLeastLoadedManager(ts.team_id);
  const deal: any = {
    id, customerName: name, phone, address, siteAddress: address,
    product: product || 'Запись на замер', furnitureType: product || '',
    amount: 0, paidAmount: 0, status: 'new', icon: 'phone', priority: 'medium',
    date: dateLabel || new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
    progress: 5, source: 'Сайт', ownerId: ownerId || undefined,
    measurer: '', designer: '', materials: '',
    measurementDate, completionDate: '', installationDate: '',
    paymentMethods: {},
    fbc: buildFbc(b), fbp: b.fbp ? String(b.fbp).slice(0, 100) : undefined,
    notes: [notes, slot && `Слот: ${slot}`].filter(Boolean).join('\n') || 'Запись на замер с сайта',
    createdAt: new Date().toISOString(),
  };
  db.prepare('INSERT INTO deals (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(id, 'booking', ts.team_id, JSON.stringify(deal));
  if (ownerId) { try { void notifyAssignment(db, ts.team_id, id, ownerId); } catch { /* ignore */ } }
  void emitCapiForDeal(ts.team_id, 'Lead', deal, { actionSource: 'website', clientIp: clientIpOf(req), userAgent: req.headers['user-agent'] });
  res.json({ ok: true, id });
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

  let before: any;
  try { before = JSON.parse(dealRow.data); } catch { return res.status(422).json({ error: 'corrupt deal record' }); }
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

// ─── ЧАТЫ: диалоги + сообщения (внутренний командный инбокс) ──────
// Диалоги общие для всей команды (team_id). Права — по модулю 'chats':
// view = читать, full = писать/создавать/удалять. Сообщения лежат в
// отдельной таблице и грузятся по conversation_id, чтобы не тащить всю
// переписку сразу. direction: 'out' — написали мы, 'in' — входящее.
app.get('/api/conversations', authMiddleware, requirePermission('chats'), (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT id, data FROM conversations WHERE team_id = ?').all(req.teamId!) as any[];
  const list = rows.map(r => ({ ...JSON.parse(r.data), id: r.id }));
  // Свежие диалоги сверху — по времени последнего сообщения.
  list.sort((a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')));
  res.json(list);
});

app.post('/api/conversations', authMiddleware, requirePermission('chats'), (req: AuthedRequest, res) => {
  const body = req.body || {};
  const id = body.id || newId('c');
  const now = new Date().toISOString();
  const data = {
    name: String(body.name || 'Без имени').slice(0, 120),
    platform: body.platform || 'telegram',
    orderId: body.orderId || undefined,
    avatar: body.avatar || undefined,
    online: false,
    unreadCount: 0,
    lastMessage: body.lastMessage || '',
    lastMessageAt: body.lastMessageAt || now,
    createdAt: now,
    ...body, id,
  };
  db.prepare('INSERT INTO conversations (id, team_id, user_id, data) VALUES (?, ?, ?, ?)')
    .run(id, req.teamId!, req.userId!, JSON.stringify(data));
  res.json(data);
});

app.patch('/api/conversations/:id', authMiddleware, requirePermission('chats'), (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT data FROM conversations WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  const updated = { ...JSON.parse(row.data), ...req.body, id: req.params.id };
  db.prepare('UPDATE conversations SET data = ? WHERE id = ? AND team_id = ?')
    .run(JSON.stringify(updated), req.params.id, req.teamId!);
  res.json(updated);
});

app.delete('/api/conversations/:id', authMiddleware, requirePermission('chats'), (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM messages WHERE conversation_id = ? AND team_id = ?').run(req.params.id, req.teamId!);
  db.prepare('DELETE FROM conversations WHERE id = ? AND team_id = ?').run(req.params.id, req.teamId!);
  res.json({ ok: true });
});

app.get('/api/conversations/:id/messages', authMiddleware, requirePermission('chats'), (req: AuthedRequest, res) => {
  const conv = db.prepare('SELECT id FROM conversations WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const rows = db.prepare('SELECT id, data FROM messages WHERE conversation_id = ? AND team_id = ? ORDER BY rowid ASC').all(req.params.id, req.teamId!) as any[];
  res.json(rows.map(r => ({ ...JSON.parse(r.data), id: r.id })));
});

app.post('/api/conversations/:id/messages', authMiddleware, requirePermission('chats'), (req: AuthedRequest, res) => {
  const conv = db.prepare('SELECT data FROM conversations WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!) as any;
  if (!conv) return res.status(404).json({ error: 'not found' });
  const body = req.body || {};
  const id = body.id || newId('m');
  const now = new Date().toISOString();
  const direction = body.direction === 'in' ? 'in' : 'out';
  const msg = {
    text: String(body.text || ''),
    type: body.type || 'text',
    senderName: body.senderName || undefined,
    fileUrl: body.fileUrl || undefined,
    fileName: body.fileName || undefined,
    fileSize: body.fileSize || undefined,
    duration: body.duration || undefined,
    read: direction === 'out',
    createdAt: now,
    ...body, id, direction,
  };
  db.prepare('INSERT INTO messages (id, conversation_id, team_id, user_id, data) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.params.id, req.teamId!, req.userId!, JSON.stringify(msg));
  // Обновляем превью и счётчик непрочитанных в самом диалоге.
  const prev = JSON.parse(conv.data);
  const preview = msg.type === 'text' ? msg.text
    : msg.type === 'image' ? '📷 Фото'
    : msg.type === 'voice' ? '🎤 Голосовое'
    : msg.type === 'file'  ? '📎 Файл'
    : msg.type === 'call'  ? '📞 Звонок'
    : msg.text;
  const updatedConv = {
    ...prev,
    lastMessage: String(preview || '').slice(0, 140),
    lastMessageAt: now,
    unreadCount: direction === 'in' ? (prev.unreadCount || 0) + 1 : (prev.unreadCount || 0),
  };
  db.prepare('UPDATE conversations SET data = ? WHERE id = ? AND team_id = ?')
    .run(JSON.stringify(updatedConv), req.params.id, req.teamId!);

  // Исходящее в WhatsApp: если это ответ в WhatsApp-диалоге с привязанным
  // клиентом — реально отправляем через Cloud API (best-effort).
  if (direction === 'out' && prev.platform === 'whatsapp' && prev.externalId) {
    const wa = readWhatsAppConfig(req.teamId!);
    if (whatsAppConfigured(wa) && msg.type === 'text' && msg.text) {
      void sendWhatsAppText(wa, prev.externalId, msg.text).catch(() => {});
    }
  }
  // Исходящее в Instagram Direct — тем же best-effort способом.
  if (direction === 'out' && prev.platform === 'instagram' && prev.externalId) {
    const ig = readInstagramConfig(req.teamId!);
    if (instagramConfigured(ig) && msg.type === 'text' && msg.text) {
      void sendInstagramText(ig, prev.externalId, msg.text).catch(() => {});
    }
  }

  res.json({ message: msg, conversation: updatedConv });
});

// ─── Входящие сообщения (WhatsApp / Instagram) ───────────────────────
function readWhatsAppConfig(teamId: string): Partial<WhatsAppConfig> {
  try {
    const row = db.prepare('SELECT integrations FROM team_settings WHERE team_id = ?').get(teamId) as any;
    if (!row?.integrations) return {};
    const cfg = JSON.parse(row.integrations)?.['whatsapp-business']?.config || {};
    return { phoneNumberId: cfg.phoneNumberId, accessToken: cfg.accessToken };
  } catch { return {}; }
}
// Ищем команду, чей WhatsApp phoneNumberId совпал с входящим (маппинг вебхука).
function findTeamByWhatsAppPhone(phoneNumberId: string): string | null {
  try {
    const rows = db.prepare('SELECT team_id, integrations FROM team_settings WHERE integrations IS NOT NULL').all() as any[];
    for (const r of rows) {
      try {
        const wa = JSON.parse(r.integrations)?.['whatsapp-business']?.config;
        if (wa?.phoneNumberId && String(wa.phoneNumberId) === String(phoneNumberId)) return r.team_id;
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  return null;
}
function readInstagramConfig(teamId: string): Partial<InstagramConfig> {
  try {
    const row = db.prepare('SELECT integrations FROM team_settings WHERE team_id = ?').get(teamId) as any;
    if (!row?.integrations) return {};
    const cfg = JSON.parse(row.integrations)?.['instagram-direct']?.config || {};
    return { pageId: cfg.pageId, igUserId: cfg.igUserId, accessToken: cfg.accessToken };
  } catch { return {}; }
}
// Ищем команду, чей Instagram igUserId совпал с recipient входящего сообщения.
function findTeamByInstagramId(igUserId: string): string | null {
  try {
    const rows = db.prepare('SELECT team_id, integrations FROM team_settings WHERE integrations IS NOT NULL').all() as any[];
    for (const r of rows) {
      try {
        const ig = JSON.parse(r.integrations)?.['instagram-direct']?.config;
        if (ig?.igUserId && String(ig.igUserId) === String(igUserId)) return r.team_id;
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  return null;
}
// Кладём входящее сообщение в инбокс: находим/создаём диалог по (platform +
// externalId), добавляем сообщение direction:'in', растим unreadCount.
function ingestInboundMessage(teamId: string, m: { platform: string; externalId: string; name?: string; text: string }) {
  const now = new Date().toISOString();
  const convs = db.prepare('SELECT id, data FROM conversations WHERE team_id = ?').all(teamId) as any[];
  let convId: string | null = null;
  let convData: any = null;
  for (const c of convs) {
    try { const d = JSON.parse(c.data); if (d.platform === m.platform && d.externalId === m.externalId) { convId = c.id; convData = d; break; } } catch { /* skip */ }
  }
  if (!convId) {
    convId = newId('c');
    convData = { name: m.name || m.externalId, platform: m.platform, externalId: m.externalId, online: false, unreadCount: 0, createdAt: now };
    db.prepare('INSERT INTO conversations (id, team_id, user_id, data) VALUES (?, ?, ?, ?)').run(convId, teamId, m.platform, JSON.stringify({ ...convData, id: convId }));
  }
  const msgId = newId('m');
  const msg = { id: msgId, text: m.text, type: 'text', direction: 'in', read: false, createdAt: now };
  db.prepare('INSERT INTO messages (id, conversation_id, team_id, user_id, data) VALUES (?, ?, ?, ?, ?)').run(msgId, convId, teamId, m.platform, JSON.stringify(msg));
  const upd = { ...convData, id: convId, name: convData.name || m.name || m.externalId, lastMessage: m.text.slice(0, 140), lastMessageAt: now, unreadCount: (convData.unreadCount || 0) + 1 };
  db.prepare('UPDATE conversations SET data = ? WHERE id = ? AND team_id = ?').run(JSON.stringify(upd), convId, teamId);

  // Директорский алёрт: новое входящее сообщение от клиента. Название канала
  // человекочитаемо; текст обрезаем. Ссылка ведёт в Чаты.
  const chLabel: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', telegram: 'Telegram' };
  const preview = m.text.length > 120 ? m.text.slice(0, 120) + '…' : m.text;
  void sendBotAlert(teamId, 'Новое сообщение', // no-op если бот не готов / алёрт выключен
    `<b>💬 Новое сообщение · ${chLabel[m.platform] || m.platform}</b>\n${upd.name}\n«${preview}»` +
    `\n\n<a href="${chatsLink()}">Открыть Чаты →</a>`);
}

// Верификация вебхука Meta (при подключении в App Dashboard).
app.get('/api/webhooks/meta', (req, res) => {
  const verifyToken = process.env.META_VERIFY_TOKEN || 'utir-verify';
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    return res.status(200).send(String(req.query['hub.challenge'] || ''));
  }
  res.sendStatus(403);
});
// Приём входящих сообщений WhatsApp (и Instagram — Фаза 2).
app.post('/api/webhooks/meta', (req, res) => {
  // Верификация подписи Meta (X-Hub-Signature-256 = HMAC-SHA256 по сырому
  // телу с app secret). Опт-ин: если META_APP_SECRET задан — проверяем и
  // отклоняем подделки; если нет — пропускаем (совместимость, но входящие
  // можно подделать — задайте секрет перед запуском WhatsApp/Instagram).
  const appSecret = process.env.META_APP_SECRET || '';
  if (appSecret) {
    const sig = String(req.get('X-Hub-Signature-256') || '');
    const raw: Buffer | undefined = (req as any).rawBody;
    let ok = false;
    if (sig.startsWith('sha256=') && raw) {
      const expected = 'sha256=' + createHmac('sha256', appSecret).update(raw).digest('hex');
      try { ok = timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { ok = false; }
    }
    if (!ok) return res.sendStatus(401);
  }
  // Отвечаем 200 сразу, чтобы Meta не ретраила; обработка — синхронно, но быстро.
  try {
    // WhatsApp (object: whatsapp_business_account)
    const wa = parseInboundWhatsApp(req.body);
    for (const m of wa) {
      const teamId = m.phoneNumberId ? findTeamByWhatsAppPhone(m.phoneNumberId) : null;
      if (teamId) ingestInboundMessage(teamId, { platform: 'whatsapp', externalId: m.from, name: m.name, text: m.text });
    }
    // Instagram Direct (object: instagram)
    const ig = parseInboundInstagram(req.body);
    for (const m of ig) {
      const teamId = m.recipientId ? findTeamByInstagramId(m.recipientId) : null;
      if (teamId) ingestInboundMessage(teamId, { platform: 'instagram', externalId: m.from, text: m.text });
    }
  } catch (e) { console.warn('[webhook/meta] failed', e); }
  res.sendStatus(200);
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

// Все видят список команды (для назначений), но менять записи сотрудников
// (включая salary) может только админ. Read — открыт, write — admin.
app.use('/api/employees', authMiddleware, requireRoleForWrites('admin'), makeCrud('employees', 'e'));
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
  let before: any;
  try { before = JSON.parse(row.data); } catch { return res.status(422).json({ error: 'corrupt task record' }); }
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
// Кастомные модули: определения (создать/изменить/удалить модуль) — только
// админ; читать модули и вести записи внутри них может вся команда.
app.use('/api/custom-modules', authMiddleware, requireRoleForWrites('admin'), makeCrud('custom_modules', 'cm_'));
// Записи кастомных модулей: чтение — любому члену команды, запись —
// менеджер+ (структуру модулей меняет только админ выше). Раньше писать
// мог кто угодно; теперь рядовой сотрудник только читает.
app.use('/api/custom-records', authMiddleware, requireRoleForWrites('manager'), makeCrud('custom_records', 'r_'));
app.use('/api/products', authMiddleware, requirePermission('production'), makeCrud('products', 'p'));
// Finance gated by the matrix (was requireRole('manager') — now matrix-driven
// so admin can hand finance to specific roles without touching code).
app.use('/api/transactions', authMiddleware, requirePermission('finance'), makeCrud('transactions', 'f', { lockable: true }));

// ─── Finance period lock (закрытие периода) ───────────────────────
app.get('/api/team/finance-lock', authMiddleware, (req: AuthedRequest, res) => {
  res.json({ lockDate: financeLock(req.teamId!) });
});
app.put('/api/team/finance-lock', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const raw = req.body?.lockDate;
  const lockDate = raw && /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? String(raw) : null;
  db.prepare(`
    INSERT INTO team_settings (team_id, finance_lock_date, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET finance_lock_date = excluded.finance_lock_date, updated_at = excluded.updated_at
  `).run(req.teamId!, lockDate);
  res.json({ lockDate });
});

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
    // Изображение уже сгенерировано (стоит реальных денег на API). Если
    // запись в историю сорвётся (диск/размер/busy) — НЕ теряем результат:
    // логируем и всё равно возвращаем картинку пользователю.
    try {
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
    } catch (e) { console.warn('[ai-design] history insert failed', e); }
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
// KZ tax defaults (2025 known values — MUST be verified against the new
// Tax Code effective 2026; that's exactly why they live in editable
// settings instead of hardcoded in the component).
const DEFAULT_TAX_RATES = {
  simplified: 0.03,  // СНР 910.00 (упрощёнка): 3% от оборота (1.5% ИПН/КПН + 1.5% СН)
  retail:     0.04,  // СНР 913.00 (розничный налог)
  ipn:        0.10,  // ИПН (с ФОТ / доход ИП)
  opv:        0.10,  // ОПВ (удержание у работника, в ЕНПФ)
  vosms:      0.02,  // ВОСМС (удержание у работника)
  oosms:      0.03,  // ООСМС (взнос работодателя)
  so:         0.035, // СО — социальные отчисления (работодатель)
  sn:         0.095, // СН — социальный налог (ОУР), за вычетом СО
  opvr:       0.025, // ОПВР — обязательные пенс. взносы работодателя (поэтапно)
  vat:        0.12,  // НДС
  kpn:        0.20,  // КПН (ТОО на ОУР)
  property:   0.015, // налог на имущество ТОО
};
const DEFAULT_REQ = {
  legalName: '', bin: '', address: '', bankName: '',
  iban: '', bik: '', kbe: '', director: '', phone: '', email: '',
  // KZ tax flags — affect which taxes Taxes.tsx calculates.
  vatPayer: false,   // плательщик НДС
  entityType: 'too', // 'too' = ТОО; 'ip' = ИП
  // Tax regime drives WHICH taxes apply. Most small furniture/windows/
  // doors shops are on the simplified declaration (910.00).
  taxRegime: 'simplified' as 'simplified' | 'retail' | 'general',
  // Year constants — пороги и вычеты считаются от них. Verify yearly.
  taxYear: 2026,
  mrp: 3932,
  mzp: 85000,
  rates: DEFAULT_TAX_RATES,
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
    vatPayer:  !!b.vatPayer,
    entityType: b.entityType === 'ip' ? 'ip' : 'too',
    taxRegime: ['simplified', 'retail', 'general'].includes(b.taxRegime) ? b.taxRegime : 'simplified',
    taxYear: Math.max(2020, Math.min(2100, Number(b.taxYear) || DEFAULT_REQ.taxYear)),
    mrp: Math.max(0, Number(b.mrp) || DEFAULT_REQ.mrp),
    mzp: Math.max(0, Number(b.mzp) || DEFAULT_REQ.mzp),
    // Rates — merge over defaults, clamp each to [0,1]. Keeps unknown
    // keys out and lets the admin tune a single rate without losing rest.
    rates: (() => {
      const r: Record<string, number> = { ...DEFAULT_TAX_RATES };
      const inb = (b.rates && typeof b.rates === 'object') ? b.rates : {};
      for (const k of Object.keys(DEFAULT_TAX_RATES)) {
        const v = Number(inb[k]);
        if (!Number.isNaN(v)) r[k] = Math.max(0, Math.min(1, v));
      }
      return r;
    })(),
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

// ─── Company profile (Settings → Общие) ──────────────────────────────
// Team-wide company branding: name / BIN / address / contacts / logo.
// Persisted so it syncs across devices and teammates (invoices/PDF use it).
// Separate from `company_requisites` (legal/tax) — this is the lighter
// profile card. Logo stored as a base64 data-URL (capped).
const companyRouter = express.Router();
companyRouter.use(authMiddleware);
const DEFAULT_COMPANY = { companyName: '', companyBIN: '', companyAddress: '', companyEmail: '', companyPhone: '', companyLogo: '' };
companyRouter.get('/', (req: AuthedRequest, res) => {
  try {
    const row = db.prepare('SELECT company_profile FROM team_settings WHERE team_id = ?').get(req.teamId!) as any;
    res.json(row?.company_profile ? { ...DEFAULT_COMPANY, ...JSON.parse(row.company_profile) } : DEFAULT_COMPANY);
  } catch { res.json(DEFAULT_COMPANY); }
});
companyRouter.put('/', requireRole('admin'), (req: AuthedRequest, res) => {
  const b = req.body || {};
  const logo = String(b.companyLogo || '');
  const clean = {
    companyName:    String(b.companyName    || '').slice(0, 200),
    companyBIN:     String(b.companyBIN     || '').slice(0, 20),
    companyAddress: String(b.companyAddress || '').slice(0, 300),
    companyEmail:   String(b.companyEmail   || '').slice(0, 100),
    companyPhone:   String(b.companyPhone   || '').slice(0, 40),
    // Cap the logo data-URL so a huge upload can't bloat the row. ~1MB base64.
    companyLogo:    logo.startsWith('data:') ? logo.slice(0, 1_400_000) : '',
  };
  db.prepare(`
    INSERT INTO team_settings (team_id, company_profile, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET
      company_profile = excluded.company_profile,
      updated_at = excluded.updated_at
  `).run(req.teamId!, JSON.stringify(clean));
  res.json({ ok: true, company: clean });
});
app.use('/api/team/company', companyRouter);

// ─── Telegram-bot settings (Настроить бота) ──────────────────────────
// Персистим настройки панели бота (шаблоны/отчёты/алёрты/склад/замерщики),
// чтобы они сохранялись и синхронизировались на команду, а не жили в
// локальном useState. Читать может вся команда, менять — админ.
const botSettingsRouter = express.Router();
botSettingsRouter.use(authMiddleware);
const DEFAULT_BOT_SETTINGS = {
  templates: [
    { id: 't1', text: 'Здравствуйте! Ваш заказ #{номер} принят в производство', trigger: 'Смена статуса на "Производство"', enabled: true },
    { id: 't2', text: 'Замер назначен на {дата} в {время}, замерщик {имя}', trigger: 'Создание задачи замера', enabled: true },
    { id: 't3', text: 'Ваша мебель готова! Установка {дата}', trigger: 'Статус "Готов"', enabled: true },
    { id: 't4', text: 'Завтра приедем устанавливать с {время}', trigger: 'За 1 день до установки', enabled: false },
  ],
  reports: { daily: true, weekly: true, monthly: false },
  bossGroup: '@UtirSoft_Boss',
  activeAlerts: ['Крупная сделка > 1 млн ₸', 'Отказ клиента', 'Просрочка заказа', 'Потеря горячего лида'],
  whAlerts: { inbound: true, supplier: true },
  fieldOpts: { photo: true, geo: true },
};
botSettingsRouter.get('/', (req: AuthedRequest, res) => {
  try {
    const row = db.prepare('SELECT bot_settings FROM team_settings WHERE team_id = ?').get(req.teamId!) as any;
    res.json(row?.bot_settings ? { ...DEFAULT_BOT_SETTINGS, ...JSON.parse(row.bot_settings) } : DEFAULT_BOT_SETTINGS);
  } catch { res.json(DEFAULT_BOT_SETTINGS); }
});
botSettingsRouter.put('/', requireRole('admin'), (req: AuthedRequest, res) => {
  const b = req.body || {};
  // Light validation + size caps; keep the shape predictable.
  const clean = {
    templates: Array.isArray(b.templates) ? b.templates.slice(0, 50).map((t: any) => ({
      id: String(t?.id || '').slice(0, 40) || newId('bt_'),
      text: String(t?.text || '').slice(0, 500),
      trigger: String(t?.trigger || '').slice(0, 120),
      enabled: !!t?.enabled,
    })) : DEFAULT_BOT_SETTINGS.templates,
    reports: {
      daily: !!(b.reports?.daily), weekly: !!(b.reports?.weekly), monthly: !!(b.reports?.monthly),
    },
    bossGroup: String(b.bossGroup || '').slice(0, 80),
    activeAlerts: Array.isArray(b.activeAlerts) ? b.activeAlerts.slice(0, 20).map((s: any) => String(s).slice(0, 120)) : [],
    whAlerts: { inbound: !!(b.whAlerts?.inbound), supplier: !!(b.whAlerts?.supplier) },
    fieldOpts: { photo: !!(b.fieldOpts?.photo), geo: !!(b.fieldOpts?.geo) },
  };
  db.prepare(`
    INSERT INTO team_settings (team_id, bot_settings, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET
      bot_settings = excluded.bot_settings,
      updated_at = excluded.updated_at
  `).run(req.teamId!, JSON.stringify(clean));
  res.json({ ok: true, settings: clean });
});
app.use('/api/team/bot-settings', botSettingsRouter);

// Реальное превью ежедневного отчёта директору (тот же текст, что бот шлёт
// в 09:00) — для панели «Настроить бота». Только менеджер+.
app.get('/api/telegram/daily-preview', authMiddleware, requireRole('manager'), (req: AuthedRequest, res) => {
  const period = String(req.query.period || 'day');
  try {
    const text = period === 'week' ? buildPeriodSummary(db, req.teamId!, 'week')
      : period === 'month' ? buildPeriodSummary(db, req.teamId!, 'month')
      : buildDailySummary(db, req.teamId!);
    res.json({ text });
  } catch { res.json({ text: '' }); }
});

// ─── Meta Conversions API (CAPI) ─────────────────────────────────────
function readMetaCapi(teamId: string): Partial<CapiConfig> {
  try {
    const row = db.prepare('SELECT meta_capi FROM team_settings WHERE team_id = ?').get(teamId) as any;
    return row?.meta_capi ? JSON.parse(row.meta_capi) : {};
  } catch { return {}; }
}
function logMetaEvent(teamId: string, entry: Record<string, any>) {
  try {
    db.prepare('INSERT INTO meta_events (id, team_id, data) VALUES (?, ?, ?)')
      .run(newId('me_'), teamId, JSON.stringify({ ...entry, at: new Date().toISOString() }));
  } catch (e) { console.warn('[meta] log failed', e); }
}
// Собирает fbc из fbclid (формат Meta: fb.1.<ts>.<fbclid>), если явного fbc нет.
function buildFbc(body: any): string | undefined {
  if (body?.fbc) return String(body.fbc).slice(0, 255);
  if (body?.fbclid) return `fb.1.${Date.now()}.${String(body.fbclid).slice(0, 200)}`;
  return undefined;
}
function clientIpOf(req: Request): string | undefined {
  const xf = (req.headers['x-forwarded-for'] as string) || '';
  return xf.split(',')[0].trim() || (req.socket as any)?.remoteAddress || undefined;
}

// Отправляет событие сделки в Meta CAPI (если настроено) и пишет в лог.
async function emitCapiForDeal(teamId: string, eventName: string, deal: any, opts?: { value?: number; eventId?: string; actionSource?: CapiEvent['actionSource']; stage?: string; clientIp?: string; userAgent?: string }) {
  const cfg = readMetaCapi(teamId);
  if (!metaCapiConfigured(cfg)) return;
  const nameParts = String(deal.customerName || '').trim().split(/\s+/);
  const ev: CapiEvent = {
    eventName,
    actionSource: opts?.actionSource || 'system_generated',
    eventId: opts?.eventId || `${eventName}-${deal.id}`,
    user: {
      phone: deal.phone, firstName: nameParts[0], lastName: nameParts.slice(1).join(' ') || undefined,
      city: deal.city, externalId: deal.id, fbc: deal.fbc, fbp: deal.fbp,
      clientIp: opts?.clientIp, userAgent: opts?.userAgent,
    },
    value: opts?.value,
    currency: opts?.value != null ? 'KZT' : undefined,
    customData: { crm_id: deal.id, ...(opts?.stage ? { stage: opts.stage } : {}) },
  };
  try {
    const res = await sendCapiEvent(cfg as CapiConfig, ev, Math.floor(Date.now() / 1000));
    logMetaEvent(teamId, { eventName, dealId: deal.id, value: opts?.value ?? null, currency: ev.currency ?? null, status: res.ok ? 'ok' : 'err', paramCount: res.paramCount, error: res.error ?? null });
  } catch (e: any) {
    logMetaEvent(teamId, { eventName, dealId: deal.id, value: opts?.value ?? null, status: 'err', paramCount: 0, error: String(e?.message || e) });
  }
}

// Конфиг подключения (токен не отдаём — только факт наличия).
const metaCapiRouter = express.Router();
metaCapiRouter.use(authMiddleware);
metaCapiRouter.get('/config', (req: AuthedRequest, res) => {
  const c = readMetaCapi(req.teamId!);
  res.json({ pixelId: c.pixelId || '', testEventCode: c.testEventCode || '', connected: metaCapiConfigured(c) });
});
metaCapiRouter.put('/config', requireRole('admin'), (req: AuthedRequest, res) => {
  const b = req.body || {};
  const prev = readMetaCapi(req.teamId!);
  const clean: CapiConfig = {
    pixelId: String(b.pixelId || '').trim().slice(0, 40),
    // Пустой токен в запросе = оставить прежний (форма не показывает токен).
    capiToken: b.capiToken ? String(b.capiToken).trim().slice(0, 400) : (prev.capiToken || ''),
    testEventCode: String(b.testEventCode || '').trim().slice(0, 40),
  };
  db.prepare(`
    INSERT INTO team_settings (team_id, meta_capi, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET meta_capi = excluded.meta_capi, updated_at = excluded.updated_at
  `).run(req.teamId!, JSON.stringify(clean));
  res.json({ ok: true, connected: metaCapiConfigured(clean) });
});
// Тест-отправка Lead-события (с test_event_code видно в Meta → Test Events).
metaCapiRouter.post('/test', requireRole('admin'), async (req: AuthedRequest, res) => {
  const cfg = readMetaCapi(req.teamId!);
  if (!metaCapiConfigured(cfg)) return res.status(400).json({ error: 'not_configured' });
  const result = await sendCapiEvent(cfg as CapiConfig, {
    eventName: 'Lead',
    actionSource: 'system_generated',
    eventId: `test-${Date.now()}`,
    user: { email: 'test@utir-soft.com', phone: '+77010000000', firstName: 'Test', externalId: 'test' },
    customData: { test: true },
  }, Math.floor(Date.now() / 1000));
  logMetaEvent(req.teamId!, { eventName: 'Lead(test)', dealId: null, value: null, status: result.ok ? 'ok' : 'err', paramCount: result.paramCount, error: result.error ?? null });
  res.json(result);
});
// Статистика для дашборда «Реклама».
metaCapiRouter.get('/stats', requireRole('manager'), (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT data, created_at FROM meta_events WHERE team_id = ? ORDER BY rowid DESC LIMIT 2000').all(req.teamId!) as any[];
  const events = rows.map(r => { try { return { ...JSON.parse(r.data), created_at: r.created_at }; } catch { return null; } }).filter(Boolean) as any[];
  const cfg = readMetaCapi(req.teamId!);
  const ok = events.filter(e => e.status === 'ok');
  const leads = ok.filter(e => e.eventName === 'Lead');
  const purchases = ok.filter(e => e.eventName === 'Purchase');
  const purchaseValue = purchases.reduce((s, e) => s + (Number(e.value) || 0), 0);
  const maxParams = ok.reduce((m, e) => Math.max(m, Number(e.paramCount) || 0), 0);
  // Грубая оценка EMQ по среднему покрытию параметров (0–10). Для ориентира.
  const avgParams = ok.length ? ok.reduce((s, e) => s + (Number(e.paramCount) || 0), 0) / ok.length : 0;
  res.json({
    connected: metaCapiConfigured(cfg),
    totals: {
      events: ok.length,
      leads: leads.length,
      purchases: purchases.length,
      purchaseValue,
      errors: events.length - ok.length,
    },
    emqApprox: Math.min(10, Math.round(avgParams * 1.2 * 10) / 10),
    paramCoverage: maxParams,
    lastEventAt: events[0]?.at || events[0]?.created_at || null,
  });
});
// Последние события / покупки для таблиц дашборда.
metaCapiRouter.get('/events', requireRole('manager'), (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT data, created_at FROM meta_events WHERE team_id = ? ORDER BY rowid DESC LIMIT 100').all(req.teamId!) as any[];
  res.json(rows.map(r => { try { return { ...JSON.parse(r.data), created_at: r.created_at }; } catch { return null; } }).filter(Boolean));
});
// ROI по креативам из Meta Marketing API (использует конфиг «Meta Ads»:
// adAccountId + System User токен). Кэш 5 мин, чтобы не бить API на каждый вход.
function readMetaAdsConfig(teamId: string): { adAccountId?: string; accessToken?: string } {
  try {
    const row = db.prepare('SELECT integrations FROM team_settings WHERE team_id = ?').get(teamId) as any;
    if (!row?.integrations) return {};
    const all = JSON.parse(row.integrations);
    return all?.['meta-ads']?.config || {};
  } catch { return {}; }
}
const creativesCache = new Map<string, { at: number; data: any }>();
metaCapiRouter.get('/creatives', requireRole('manager'), async (req: AuthedRequest, res) => {
  const range = String(req.query.range || 'last_30d');
  const cfg = readMetaAdsConfig(req.teamId!);
  if (!cfg.adAccountId || !cfg.accessToken) {
    return res.json({ configured: false, creatives: [] });
  }
  const key = `${req.teamId}:${range}`;
  const cached = creativesCache.get(key);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return res.json(cached.data);
  const r = await fetchCreativeInsights({ adAccountId: cfg.adAccountId, accessToken: cfg.accessToken }, range);
  const payload = { configured: true, ok: r.ok, error: r.error || null, creatives: r.creatives };
  if (r.ok) creativesCache.set(key, { at: Date.now(), data: payload });
  res.json(payload);
});

// ─── Lookalike: выгрузка успешных клиентов в Custom Audience ─────────
// Собирает клиентов из выигранных сделок (хеш email/phone) и заливает в
// Meta Custom Audience, чтобы затем построить lookalike в Ads Manager.
function saveAudienceId(teamId: string, audienceId: string, count: number) {
  let cfg: any = readMetaCapi(teamId);
  cfg = { ...cfg, lookalikeAudienceId: audienceId, lookalikeSyncedAt: new Date().toISOString(), lookalikeCount: count };
  db.prepare(`
    INSERT INTO team_settings (team_id, meta_capi, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET meta_capi = excluded.meta_capi, updated_at = excluded.updated_at
  `).run(teamId, JSON.stringify(cfg));
}
metaCapiRouter.get('/audience', requireRole('manager'), (req: AuthedRequest, res) => {
  const cfg: any = readMetaCapi(req.teamId!);
  const adsCfg = readMetaAdsConfig(req.teamId!);
  res.json({
    adsConfigured: !!(adsCfg.adAccountId && adsCfg.accessToken),
    audienceId: cfg.lookalikeAudienceId || null,
    syncedAt: cfg.lookalikeSyncedAt || null,
    count: cfg.lookalikeCount || 0,
  });
});
metaCapiRouter.post('/audience/sync', requireRole('admin'), async (req: AuthedRequest, res) => {
  const adsCfg = readMetaAdsConfig(req.teamId!);
  if (!adsCfg.adAccountId || !adsCfg.accessToken) return res.status(400).json({ error: 'meta_ads_not_configured' });

  // Клиенты из выигранных сделок — уникальные по телефону/email.
  const rows = db.prepare('SELECT data FROM deals WHERE team_id = ?').all(req.teamId!) as any[];
  const seen = new Set<string>();
  const clients: Array<{ email?: string; phone?: string }> = [];
  for (const r of rows) {
    try {
      const d = JSON.parse(r.data);
      if (d.status !== 'completed') continue;
      const key = (d.phone || '').replace(/\D/g, '') || (d.email || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      clients.push({ email: d.email, phone: d.phone });
    } catch { /* skip */ }
  }
  if (clients.length === 0) return res.json({ ok: true, count: 0, note: 'no_won_clients' });

  const cfg: any = readMetaCapi(req.teamId!);
  let audienceId = cfg.lookalikeAudienceId as string | undefined;
  if (!audienceId) {
    const created = await createCustomAudience({ adAccountId: adsCfg.adAccountId, accessToken: adsCfg.accessToken }, 'UTIR — успешные клиенты');
    if (!created.ok || !created.id) return res.status(502).json({ error: created.error || 'create_failed' });
    audienceId = created.id;
  }
  const up = await addUsersToAudience({ adAccountId: adsCfg.adAccountId, accessToken: adsCfg.accessToken }, audienceId, clients);
  if (!up.ok) return res.status(502).json({ error: up.error || 'upload_failed' });
  saveAudienceId(req.teamId!, audienceId, clients.length);
  res.json({ ok: true, audienceId, count: clients.length, received: up.received });
});
app.use('/api/meta-capi', metaCapiRouter);

// ─── Team catalogs (Product templates / Materials / Hardware / Addons /
//     Furniture types) ─────────────────────────────────────────────
// Whole JSON blob persisted on team_settings.catalogs. Everyone on the
// team reads (so non-admin employees pick from the same list when
// creating deals); manager-or-above writes.
const catalogsRouter = express.Router();
catalogsRouter.use(authMiddleware);
const DEFAULT_CATALOGS = {
  productTemplates: [] as string[],
  materials:        [] as string[],
  hardware:         [] as string[],
  addons:           [] as string[],
  furnitureTypes:   [] as string[],
};
type CatalogsShape = typeof DEFAULT_CATALOGS;
type CatalogKey = keyof CatalogsShape;

catalogsRouter.get('/', (req: AuthedRequest, res) => {
  try {
    const row = db.prepare('SELECT catalogs FROM team_settings WHERE team_id = ?').get(req.teamId!) as any;
    if (!row?.catalogs) return res.json(DEFAULT_CATALOGS);
    const parsed = JSON.parse(row.catalogs);
    // Shallow-merge with defaults so adding a new catalog key in code never
    // exposes «undefined» to old rows.
    res.json({ ...DEFAULT_CATALOGS, ...parsed });
  } catch {
    res.json(DEFAULT_CATALOGS);
  }
});

catalogsRouter.put('/', requireRole('manager'), (req: AuthedRequest, res) => {
  const incoming = (req.body || {}) as Partial<CatalogsShape>;
  const clean: CatalogsShape = { ...DEFAULT_CATALOGS };
  (Object.keys(DEFAULT_CATALOGS) as CatalogKey[]).forEach(k => {
    const v = incoming[k];
    if (Array.isArray(v)) {
      // Trim + dedupe + cap at 500 items per catalog to keep JSON small.
      const cleaned = Array.from(new Set(
        v.filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean)
      )).slice(0, 500);
      clean[k] = cleaned;
    }
  });
  db.prepare(`
    INSERT INTO team_settings (team_id, catalogs, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET
      catalogs = excluded.catalogs,
      updated_at = excluded.updated_at
  `).run(req.teamId!, JSON.stringify(clean));
  res.json({ ok: true, catalogs: clean });
});

app.use('/api/team/catalogs', catalogsRouter);

// ─── Niche + onboarding state ─────────────────────────────────────
// GET  /api/team/profile        → { niche, onboarding }
// PATCH /api/team/profile       → { niche?, onboarding? } merged into row
//
// Niche drives default stages / role labels / material categories
// platform-wide. Onboarding tracks whether the first-time setup wizard
// has been completed.
const profileRouter = express.Router();
profileRouter.use(authMiddleware);

// Whitelist of valid niche ids — kept here in sync with
// src/app/utils/niches.ts so an admin can't write garbage into the row.
const ALLOWED_NICHES = ['furniture','windows','ceilings','blinds','doors','stairs','flooring','construction','custom'];

profileRouter.get('/', (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT niche, secondary_niches, onboarding FROM team_settings WHERE team_id = ?').get(req.teamId!) as any;
  const niche = (row?.niche as string) || 'furniture';  // legacy default
  let secondaryNiches: string[] = [];
  try { if (row?.secondary_niches) secondaryNiches = JSON.parse(row.secondary_niches); } catch { /* keep empty */ }
  // Defensive: filter out unknown ids and the primary niche so the
  // client never has to dedupe.
  secondaryNiches = secondaryNiches.filter(n => ALLOWED_NICHES.includes(n) && n !== niche);
  let onboarding: any = { completed: false };
  try { if (row?.onboarding) onboarding = JSON.parse(row.onboarding); } catch { /* keep default */ }
  res.json({ niche, secondaryNiches, onboarding });
});

profileRouter.patch('/', (req: AuthedRequest, res) => {
  const patch = req.body || {};
  // Only the admin can change the niche or its secondaries — these have
  // platform-wide effects (stage names, category lists, AI prompts) so
  // a junior employee shouldn't be able to flip them.
  if ((patch.niche !== undefined || patch.secondaryNiches !== undefined) && req.teamRole !== 'admin') {
    return res.status(403).json({ error: 'only admin can change niche' });
  }
  const cur = db.prepare('SELECT niche, secondary_niches, onboarding FROM team_settings WHERE team_id = ?').get(req.teamId!) as any;
  const next: { niche?: string; secondary_niches?: string; onboarding?: string } = {};
  if (patch.niche !== undefined) {
    if (!ALLOWED_NICHES.includes(String(patch.niche))) return res.status(400).json({ error: 'invalid niche' });
    next.niche = String(patch.niche);
  }
  if (patch.secondaryNiches !== undefined) {
    if (!Array.isArray(patch.secondaryNiches)) return res.status(400).json({ error: 'secondaryNiches must be an array' });
    const primary = next.niche ?? cur?.niche ?? 'furniture';
    // Dedupe + filter unknown ids + drop the primary so we never store it twice.
    const cleaned = Array.from(new Set(
      patch.secondaryNiches
        .map((x: unknown) => String(x))
        .filter((n: string) => ALLOWED_NICHES.includes(n) && n !== primary),
    ));
    next.secondary_niches = JSON.stringify(cleaned);
  }
  if (patch.onboarding !== undefined) {
    let existing: any = {};
    try { if (cur?.onboarding) existing = JSON.parse(cur.onboarding); } catch { /* ignore */ }
    next.onboarding = JSON.stringify({ ...existing, ...patch.onboarding });
  }
  db.prepare(`
    INSERT INTO team_settings (team_id, niche, secondary_niches, onboarding, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(team_id) DO UPDATE SET
      niche = COALESCE(excluded.niche, team_settings.niche),
      secondary_niches = COALESCE(excluded.secondary_niches, team_settings.secondary_niches),
      onboarding = COALESCE(excluded.onboarding, team_settings.onboarding),
      updated_at = excluded.updated_at
  `).run(
    req.teamId!,
    next.niche ?? cur?.niche ?? null,
    next.secondary_niches ?? cur?.secondary_niches ?? null,
    next.onboarding ?? cur?.onboarding ?? null,
  );
  // Read back so caller has the merged state.
  const fresh = db.prepare('SELECT niche, secondary_niches, onboarding FROM team_settings WHERE team_id = ?').get(req.teamId!) as any;
  let ob: any = { completed: false };
  try { if (fresh?.onboarding) ob = JSON.parse(fresh.onboarding); } catch { /* keep default */ }
  let secondary: string[] = [];
  try { if (fresh?.secondary_niches) secondary = JSON.parse(fresh.secondary_niches); } catch { /* keep empty */ }
  res.json({ niche: fresh?.niche || 'furniture', secondaryNiches: secondary, onboarding: ob });
});

app.use('/api/team/profile', profileRouter);

// ─── Tax payments (mark a tax as paid / undo) ─────────────────────
// Stores one row per (team, period_key). period_key is built client-side
// from {YYYY-MM or YYYY-Qn}-{TAX_CODE}, e.g. '2026-05-IPN' or '2026-Q2-KPN'.
// All team members can read (so accountant + admin both see same picture);
// only manager-or-above can mark/unmark.
const taxesRouter = express.Router();
taxesRouter.use(authMiddleware);

taxesRouter.get('/payments', (req: AuthedRequest, res) => {
  const rows = db.prepare(
    'SELECT id, period_key, amount, paid_at, paid_by, note FROM tax_payments WHERE team_id = ? ORDER BY paid_at DESC',
  ).all(req.teamId!) as any[];
  res.json(rows.map(r => ({
    id: r.id, periodKey: r.period_key, amount: r.amount,
    paidAt: r.paid_at, paidBy: r.paid_by, note: r.note,
  })));
});

taxesRouter.post('/payments', requirePermission('finance'), (req: AuthedRequest, res) => {
  const periodKey = String(req.body?.periodKey || '').trim();
  const amount = Number(req.body?.amount) || 0;
  const note = String(req.body?.note || '').slice(0, 240);
  if (!periodKey) return res.status(400).json({ error: 'periodKey required' });
  const id = newId('tp_');
  const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId!) as any;
  // Upsert: if the same (team, period_key) already exists, just update
  // amount/note (let admin correct mistakes without insert-delete dance).
  db.prepare(`
    INSERT INTO tax_payments (id, team_id, period_key, amount, paid_at, paid_by, note)
    VALUES (?, ?, ?, ?, datetime('now'), ?, ?)
    ON CONFLICT(team_id, period_key) DO UPDATE SET
      amount = excluded.amount,
      paid_at = excluded.paid_at,
      paid_by = excluded.paid_by,
      note = excluded.note
  `).run(id, req.teamId!, periodKey, amount, actor?.name || '', note);
  logActivity(req.userId!, {
    user: actor?.name || 'Пользователь', actor: 'human',
    action: `Отметил уплату налога ${periodKey}`,
    target: `${amount.toLocaleString('ru-RU')} ₸`,
    type: 'create', page: 'finance',
  });
  res.json({ ok: true, periodKey, amount });
});

// Undo a payment mark — DELETE by period_key (not row id, simpler from UI).
taxesRouter.delete('/payments/:periodKey', requirePermission('finance'), (req: AuthedRequest, res) => {
  const periodKey = String(req.params.periodKey);
  db.prepare('DELETE FROM tax_payments WHERE team_id = ? AND period_key = ?').run(req.teamId!, periodKey);
  const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId!) as any;
  logActivity(req.userId!, {
    user: actor?.name || 'Пользователь', actor: 'human',
    action: `Отменил отметку об уплате ${periodKey}`,
    target: '', type: 'delete', page: 'finance',
  });
  res.json({ ok: true });
});

app.use('/api/taxes', taxesRouter);

// ─── BOM templates (production «recipes») ───────────────────────────
// Reusable item catalog for the production team. Each template stores its
// name, type (kitchen / wardrobe / ...), default dimensions, materials
// table (qty × unit × price), labour cost, markup %, lead time days.
// Frontend computes derived totals (materials sum, client total) — we
// just persist what the user typed.
const bomRouter = express.Router();
bomRouter.use(authMiddleware);

bomRouter.get('/', requirePermission('warehouse'), (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT id, data, created_at, updated_at FROM bom_templates WHERE team_id = ? ORDER BY rowid DESC').all(req.teamId!) as any[];
  res.json(rows.map(r => ({ id: r.id, ...JSON.parse(r.data), createdAt: r.created_at, updatedAt: r.updated_at })));
});

bomRouter.post('/', requirePermission('warehouse'), (req: AuthedRequest, res) => {
  const id = newId('bom_');
  const data = JSON.stringify(req.body || {});
  db.prepare('INSERT INTO bom_templates (id, team_id, data) VALUES (?, ?, ?)').run(id, req.teamId!, data);
  res.json({ id, ...req.body });
});

bomRouter.patch('/:id', requirePermission('warehouse'), (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT data FROM bom_templates WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  const merged = { ...JSON.parse(row.data), ...req.body };
  db.prepare("UPDATE bom_templates SET data = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(merged), req.params.id);
  res.json({ id: req.params.id, ...merged });
});

bomRouter.delete('/:id', requirePermission('warehouse'), (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM bom_templates WHERE id = ? AND team_id = ?').run(req.params.id, req.teamId!);
  res.json({ ok: true });
});

app.use('/api/bom-templates', bomRouter);

// ─── Suppliers ─────────────────────────────────────────────────────
// Vendor catalog used by the Производство → Поставщики tab. Same
// CRUD pattern as bom_templates: GET list, POST create, PATCH merge,
// DELETE row.
const suppliersRouter = express.Router();
suppliersRouter.use(authMiddleware);

suppliersRouter.get('/', requirePermission('warehouse'), (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT id, data, created_at, updated_at FROM suppliers WHERE team_id = ? ORDER BY rowid DESC').all(req.teamId!) as any[];
  res.json(rows.map(r => ({ id: r.id, ...JSON.parse(r.data), createdAt: r.created_at, updatedAt: r.updated_at })));
});

suppliersRouter.post('/', requirePermission('warehouse'), (req: AuthedRequest, res) => {
  const id = newId('sup_');
  db.prepare('INSERT INTO suppliers (id, team_id, data) VALUES (?, ?, ?)').run(id, req.teamId!, JSON.stringify(req.body || {}));
  res.json({ id, ...req.body });
});

suppliersRouter.patch('/:id', requirePermission('warehouse'), (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT data FROM suppliers WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  const merged = { ...JSON.parse(row.data), ...req.body };
  db.prepare("UPDATE suppliers SET data = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(merged), req.params.id);
  res.json({ id: req.params.id, ...merged });
});

suppliersRouter.delete('/:id', requirePermission('warehouse'), (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM suppliers WHERE id = ? AND team_id = ?').run(req.params.id, req.teamId!);
  res.json({ ok: true });
});

app.use('/api/suppliers', suppliersRouter);

// ─── Purchase orders ───────────────────────────────────────────────
// Закупки у поставщиков. PO is created when stock hits «low» or a deal
// requests materials. Status flow: draft → sent → received → archived.
const poRouter = express.Router();
poRouter.use(authMiddleware);

poRouter.get('/', requirePermission('warehouse'), (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT id, data, created_at, updated_at FROM purchase_orders WHERE team_id = ? ORDER BY rowid DESC').all(req.teamId!) as any[];
  res.json(rows.map(r => ({ id: r.id, ...JSON.parse(r.data), createdAt: r.created_at, updatedAt: r.updated_at })));
});

poRouter.post('/', requirePermission('warehouse'), (req: AuthedRequest, res) => {
  const id = newId('po_');
  db.prepare('INSERT INTO purchase_orders (id, team_id, data) VALUES (?, ?, ?)').run(id, req.teamId!, JSON.stringify(req.body || {}));
  res.json({ id, ...req.body });
});

poRouter.patch('/:id', requirePermission('warehouse'), (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT data FROM purchase_orders WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId!) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  const merged = { ...JSON.parse(row.data), ...req.body };
  db.prepare("UPDATE purchase_orders SET data = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(merged), req.params.id);
  res.json({ id: req.params.id, ...merged });
});

poRouter.delete('/:id', requirePermission('warehouse'), (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM purchase_orders WHERE id = ? AND team_id = ?').run(req.params.id, req.teamId!);
  res.json({ ok: true });
});

app.use('/api/purchase-orders', poRouter);

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
      const origin = (req.headers.origin as string) || (req.headers.referer as string) || 'https://utir-soft.com';
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
    // Diagnostic without leaking valid invite codes (они дают доступ к
    // команде — нельзя писать реальные коды в логи). Логируем только факт
    // и количество активных приглашений.
    const cnt = db.prepare('SELECT COUNT(*) AS n FROM invitations WHERE used_at IS NULL').get() as any;
    console.warn(`[invitations/preview] not found (len=${String(code).length}); active invites: ${cnt?.n ?? 0}`);
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

// ─── INTEGRATIONS v2 — real status + team-wide configs ────────────
// Replaces the legacy per-user toggle list with a catalog-driven system.
// Returns:
//   • catalog: definitions (name, fields, helpUrl, instructions, ...)
//   • statuses: live state (env vars set / config saved / connected bool)
// Admin-or-manager can write team config; everyone can read status.
const integrationsV2Router = express.Router();
integrationsV2Router.use(authMiddleware);

integrationsV2Router.get('/', (req: AuthedRequest, res) => {
  res.json({
    catalog: INTEGRATION_CATALOG,
    statuses: getIntegrationStatuses(db, req.teamId!),
  });
});

integrationsV2Router.put('/:id/config', requireRole('manager'), (req: AuthedRequest, res) => {
  const result = saveIntegrationConfig(db, req.teamId!, req.params.id, req.body || {});
  if (!result.ok) return res.status(400).json({ error: result.error });
  // Activity log entry so admin can audit integration changes.
  const def = INTEGRATION_CATALOG.find(d => d.id === req.params.id);
  const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId!) as any;
  logActivity(req.userId!, {
    user: actor?.name || 'Пользователь', actor: 'human',
    action: 'Настроил интеграцию',
    target: def?.name || req.params.id,
    type: 'settings', page: 'settings',
  });
  res.json({ ok: true, statuses: getIntegrationStatuses(db, req.teamId!) });
});

integrationsV2Router.delete('/:id', requireRole('manager'), (req: AuthedRequest, res) => {
  disconnectIntegration(db, req.teamId!, req.params.id);
  const def = INTEGRATION_CATALOG.find(d => d.id === req.params.id);
  const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId!) as any;
  logActivity(req.userId!, {
    user: actor?.name || 'Пользователь', actor: 'human',
    action: 'Отключил интеграцию',
    target: def?.name || req.params.id,
    type: 'settings', page: 'settings',
  });
  res.json({ ok: true, statuses: getIntegrationStatuses(db, req.teamId!) });
});

app.use('/api/integrations/v2', integrationsV2Router);

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

// ─── Демо-данные одной кнопкой (только админ) ───────────────────────
// Заполняет команду реалистичными данными мебельного бизнеса для показа
// клиентам. Все записи с id `demo-…` — очистка удаляет только их.
app.get('/api/team/demo/status', authMiddleware, (req: AuthedRequest, res) => {
  res.json(demoStatus(db, req.teamId!));
});
app.post('/api/team/demo/seed', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const counts = seedDemoData(db, req.teamId!, req.userId!);
  res.json({ ok: true, counts });
});
app.post('/api/team/demo/clear', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const removed = clearDemoData(db, req.teamId!);
  res.json({ ok: true, removed });
});

// Экспорт всех данных команды одним JSON (только админ команды).
app.get('/api/team/export', authMiddleware, requireRole('admin'), (req: AuthedRequest, res) => {
  const data = exportTeam(db, req.teamId!);
  res.setHeader('Content-Disposition', `attachment; filename="utir-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data, null, 2));
});

// ─── Бэкапы (только владелец) ───────────────────────────────────────
// Регистрируем ДО общего /api/owner-роутера, чтобы точные пути имели
// приоритет. Скачивание генерирует свежую консистентную копию БД.
const ownerGate = [authMiddleware, makeRequireSuperAdmin(db)];
app.get('/api/owner/backup/status', ...ownerGate, (_req, res) => res.json({ backups: listBackups(DB_PATH) }));
app.post('/api/owner/backup/run', ...ownerGate, async (_req, res) => {
  const r = await runBackup(db, DB_PATH);
  res.json({ ok: true, file: path.basename(r.file), size: r.size });
});
app.get('/api/owner/backup/download', ...ownerGate, async (_req, res) => {
  const r = await runBackup(db, DB_PATH);
  res.download(r.file, path.basename(r.file));
});

// ─── Дашборд владельца платформы (super-admin) ──────────────────────
// Кросс-командный обзор ВСЕЙ платформы. Доступ строго по email из
// SUPER_ADMIN_EMAILS (authMiddleware → requireSuperAdmin).
app.use('/api/owner', authMiddleware, makeRequireSuperAdmin(db), createOwnerRouter(db, (teamId, suspended) => {
  console.log(`[owner] team ${teamId} ${suspended ? 'suspended' : 'unsuspended'}`);
}));

// Приём клиентских ошибок (краши фронтенда) в лог владельца. Требует
// авторизации, чтобы привязать к команде; rate-limited от спама.
app.post('/api/client-error', rateLimit('client-error'), (req, res) => {
  let userId: string | undefined, teamId: string | undefined;
  try {
    const h = req.headers.authorization;
    if (h?.startsWith('Bearer ')) {
      const p = jwt.verify(h.slice(7), JWT_SECRET) as { sub: string };
      userId = p.sub;
      const u = db.prepare('SELECT team_id FROM users WHERE id = ?').get(p.sub) as any;
      teamId = u?.team_id || p.sub;
    }
  } catch { /* аноним — тоже логируем */ }
  const b = req.body || {};
  logOwnerError(db, { source: 'client', teamId, userId, method: 'CLIENT', url: String(b.url || '').slice(0, 300), message: String(b.message || 'client error'), stack: String(b.stack || '') });
  res.json({ ok: true });
});

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
  // Верификация источника ДО обработки: если TELEGRAM_WEBHOOK_SECRET задан
  // и заголовок не совпал — это поддельный апдейт, отклоняем. Если секрет
  // не настроен — verifyWebhookSecret вернёт true (совместимость).
  if (!verifyWebhookSecret(req.get('X-Telegram-Bot-Api-Secret-Token') || undefined)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  // Acknowledge quickly so Telegram doesn't retry; do the work async.
  res.json({ ok: true });
  try {
    await handleUpdate(db, req.body, (userId, entry) => {
      const id = newId('a_');
      const data = { id, timestamp: new Date().toISOString(), actor: 'human', ...entry };
      // team_id обязателен: читатель activity_logs фильтрует по team_id,
      // иначе действия ассистента из бота теряются для командного журнала.
      const u = db.prepare('SELECT team_id FROM users WHERE id = ?').get(userId) as any;
      db.prepare('INSERT INTO activity_logs (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(id, userId, u?.team_id || null, JSON.stringify(data));
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

// Тест-алёрт: шлёт пробное сообщение в ЛИЧНЫЙ Telegram текущего пользователя.
// Позволяет за 1 клик убедиться, что связка бот → уведомления работает, и
// понять, чего не хватает (нет токена / Telegram не привязан).
app.post('/api/telegram/test-alert', authMiddleware, async (req: AuthedRequest, res) => {
  if (!isTelegramReady()) {
    return res.json({ ok: false, reason: 'no_token', message: 'Бот не подключён на сервере (нет TELEGRAM_BOT_TOKEN). Добавьте токен в Railway → Variables.' });
  }
  const status = getLinkStatus(db, req.userId!);
  if (!status.paired || !status.chatId) {
    return res.json({ ok: false, reason: 'not_linked', message: 'Ваш Telegram не привязан. Нажмите «Привязать Telegram» и отправьте боту команду /link.' });
  }
  const who = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId!) as any;
  try {
    await tgSendMessage(status.chatId,
      `<b>✅ Проверка алёртов</b>\nПривет, ${who?.name || 'директор'}! Бот подключён и уведомления настроены.\n\n` +
      `Сюда будут приходить: новые сообщения клиентов, оплаты, крупные сделки, отказы, просрочки, горячие лиды и низкий остаток склада.\n\n` +
      `<a href="${appLink()}">Открыть платформу</a>`);
    return res.json({ ok: true, message: 'Тестовое сообщение отправлено вам в Telegram.' });
  } catch (e: any) {
    return res.json({ ok: false, reason: 'send_failed', message: `Не удалось отправить: ${String(e?.message || e)}` });
  }
});

// ─── Team Telegram invite (Этап 1 — onboard field workers) ────────
// A reusable, team-level deep link the owner shares with masters /
// measurers / installers. Tapping it opens the bot which collects the
// worker's name + role and auto-creates their account — they never
// touch the web platform. Manager-or-above only (it can create team
// members). The code is reusable so the owner shares it once in a
// team WhatsApp/Telegram group.
app.get('/api/telegram/team-invite', authMiddleware, (req: AuthedRequest, res) => {
  const code = getOrCreateTeamInviteCode(db, req.teamId!);
  res.json({ code, link: teamInviteLink(code), botReady: isTelegramReady() });
});
app.post('/api/telegram/team-invite/rotate', authMiddleware, requireRole('manager'), (req: AuthedRequest, res) => {
  const code = rotateTeamInviteCode(db, req.teamId!);
  res.json({ code, link: teamInviteLink(code), botReady: isTelegramReady() });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, telegram: isTelegramReady(), claude: isClaudeReady() }));

// ─── Lead follow-up auto-tasks (авто-догрев зависших лидов) ─────────
// Periodically: for each team, find early-funnel leads (new/measured) with
// NO movement for 3–30 days and auto-create ONE follow-up task so warm
// leads don't rot. Dedup by `autoFollowup` marker → one task per deal ever,
// so the scan is idempotent and safe to run often. The 30-day upper bound
// stops a first run from flooding the team with tasks for ancient leads.
const FOLLOWUP_MIN_DAYS = 3;
const FOLLOWUP_MAX_DAYS = 30;
const FOLLOWUP_STATUSES = new Set(['new', 'measured']);
function runLeadFollowupScan() {
  try {
    const now = Date.now();
    const staleBefore = now - FOLLOWUP_MIN_DAYS * 24 * 60 * 60 * 1000;
    const tooOld = now - FOLLOWUP_MAX_DAYS * 24 * 60 * 60 * 1000;
    const teams = db.prepare('SELECT DISTINCT team_id FROM deals WHERE team_id IS NOT NULL').all() as any[];
    for (const t of teams) {
      const teamId = t.team_id;
      if (!teamId) continue;
      // Leads that already have an auto follow-up — never nag twice.
      const taskRows = db.prepare('SELECT data FROM tasks WHERE team_id = ?').all(teamId) as any[];
      const haveFollowup = new Set<string>();
      for (const r of taskRows) {
        try { const tk = JSON.parse(r.data); if (tk.autoFollowup && tk.linkedDealId) haveFollowup.add(tk.linkedDealId); } catch { /* skip */ }
      }
      const dealRows = db.prepare('SELECT id, data FROM deals WHERE team_id = ?').all(teamId) as any[];
      for (const dr of dealRows) {
        let d: any; try { d = JSON.parse(dr.data); } catch { continue; }
        if (!FOLLOWUP_STATUSES.has(d.status)) continue;
        if (haveFollowup.has(dr.id)) continue;
        const hist = db.prepare('SELECT MAX(created_at) AS last FROM deal_history WHERE deal_id = ? AND team_id = ?').get(dr.id, teamId) as any;
        const lastTs = hist?.last ? Date.parse(String(hist.last).replace(' ', 'T') + 'Z')
                     : (d.createdAt ? Date.parse(d.createdAt) : now);
        if (isNaN(lastTs) || lastTs > staleBefore || lastTs < tooOld) continue; // not in the 3–30d stale window
        const id = newId('T');
        const task = {
          id,
          title: `Догреть лид: ${d.customerName || 'клиент'}`,
          description: `Лид без движения ${FOLLOWUP_MIN_DAYS}+ дн. Источник: ${d.source || '—'}${d.phone ? ` · ${d.phone}` : ''}. Перезвоните или напишите.`,
          status: 'new',
          priority: 'high',
          assigneeId: d.ownerId || '',
          createdAt: new Date().toISOString(),
          dueDate: new Date().toISOString().slice(0, 10),
          category: 'Продажи',
          subtasks: [],
          linkedDealId: dr.id,
          autoFollowup: true,
        };
        db.prepare('INSERT INTO tasks (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(id, 'auto-followup', teamId, JSON.stringify(task));
        console.log('[lead-followup] task for stalled lead', dr.id, 'team', teamId);
      }
    }
  } catch (e) { console.warn('[lead-followup] scan failed', e); }
}
let followupTimer: ReturnType<typeof setInterval> | null = null;
function startLeadFollowupScheduler() {
  if (followupTimer) return;
  setTimeout(runLeadFollowupScan, 60 * 1000);               // first pass ~1min after boot
  followupTimer = setInterval(runLeadFollowupScan, 12 * 60 * 60 * 1000); // then every 12h
  console.log('[server] lead follow-up scheduler started (every 12h)');
}

// ─── Directorские алёрты по времени: горячий лид без ответа + просрочка ──
// Оживляет тумблеры «Потеря горячего лида» и «Просрочка заказа» из панели
// бота (раньше они были в UI, но ничего не делали). Дедуп — флагами прямо
// на blob сделки, чтобы не слать одно и то же каждые 30 минут.
const HOT_LEAD_SLA_HOURS = 2;
function runAlertScan() {
  if (!isTelegramReady()) return;
  try {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const teams = db.prepare('SELECT DISTINCT team_id FROM deals WHERE team_id IS NOT NULL').all() as any[];
    for (const t of teams) {
      const teamId = t.team_id; if (!teamId) continue;
      const dealRows = db.prepare('SELECT id, data FROM deals WHERE team_id = ?').all(teamId) as any[];
      for (const dr of dealRows) {
        let d: any; try { d = JSON.parse(dr.data); } catch { continue; }
        if (d.status === 'rejected' || d.status === 'completed') continue;
        const amtStr = d.amount ? ` · ${Math.round(d.amount).toLocaleString('ru-RU').replace(/,/g, ' ')} ₸` : '';
        const link = `\n\n<a href="${orderLink(dr.id)}">Открыть заказ →</a>`;
        let dirty = false;

        // Горячий лид: новая заявка без первого контакта, старше SLA (но не старьё).
        if (d.status === 'new' && !d.firstContactAt && !d.hotLeadAlertedAt && d.createdAt) {
          const ageH = (now - Date.parse(d.createdAt)) / 3_600_000;
          if (ageH >= HOT_LEAD_SLA_HOURS && ageH < 72) {
            void sendBotAlert(teamId, 'Потеря горячего лида',
              `<b>🔥 Горячий лид без ответа</b>\n${d.customerName || 'Лид'}${amtStr}\nБез контакта ${Math.floor(ageH)} ч. Источник: ${d.source || '—'}${d.phone ? ` · ${d.phone}` : ''}` + link);
            d.hotLeadAlertedAt = new Date().toISOString(); dirty = true;
          }
        }

        // Просрочка: дата касания (nextActionAt) в прошлом, ещё не алёртили за эту дату.
        if (d.nextActionAt && d.nextActionAt < today && d.overdueAlertedFor !== d.nextActionAt) {
          void sendBotAlert(teamId, 'Просрочка заказа',
            `<b>⏰ Просрочено касание</b>\n${d.customerName || 'Сделка'}${amtStr}\nДата контакта была ${d.nextActionAt}${d.nextActionNote ? `: ${d.nextActionNote}` : ''}` + link);
          d.overdueAlertedFor = d.nextActionAt; dirty = true;
        }

        if (dirty) db.prepare('UPDATE deals SET data = ? WHERE id = ? AND team_id = ?').run(JSON.stringify(d), dr.id, teamId);
      }

      // Низкий остаток склада: материал в статусе low/outofstock, ещё не
      // алёртили за этот статус. Дедуп: lowStockAlerted = текущий статус;
      // при пополнении флаг сбрасываем, чтобы при следующем падении алёртнуть снова.
      const prodRows = db.prepare('SELECT id, data FROM products WHERE team_id = ?').all(teamId) as any[];
      for (const pr of prodRows) {
        let p: any; try { p = JSON.parse(pr.data); } catch { continue; }
        const low = p.status === 'low' || p.status === 'outofstock';
        if (low && p.lowStockAlerted !== p.status) {
          const label = p.status === 'outofstock' ? '🛒 Закончился' : '⚠️ Мало на складе';
          void sendBotAlert(teamId, 'Мало на складе',
            `<b>${label}</b>\n${p.name || 'Материал'} — осталось ${p.quantity ?? 0} ${p.unit || 'шт'}${p.minQty ? ` (мин. ${p.minQty})` : ''}` +
            `\n\n<a href="${warehouseLink()}">Открыть склад →</a>`);
          p.lowStockAlerted = p.status;
          db.prepare('UPDATE products SET data = ? WHERE id = ? AND team_id = ?').run(JSON.stringify(p), pr.id, teamId);
        } else if (!low && p.lowStockAlerted) {
          delete p.lowStockAlerted;
          db.prepare('UPDATE products SET data = ? WHERE id = ? AND team_id = ?').run(JSON.stringify(p), pr.id, teamId);
        }
      }
    }
  } catch (e) { console.warn('[alert-scan] failed', e); }
}
let alertTimer: ReturnType<typeof setInterval> | null = null;
function startAlertScanScheduler() {
  if (alertTimer) return;
  setTimeout(runAlertScan, 90 * 1000);
  alertTimer = setInterval(runAlertScan, 30 * 60 * 1000); // каждые 30 минут
  console.log('[server] alert scan scheduler started (every 30min)');
}

// ─── Error middleware (последний, после всех маршрутов) ──────────────
// Единая точка обработки ошибок: и синхронные throw (Express их ловит),
// и реджекты async-хендлеров, обёрнутых в ah(), приходят сюда. Отдаём
// чистый JSON-500 без утечки стектрейса клиенту; детали — только в лог.
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[api-error] ${req.method} ${req.originalUrl}`, err);
  // Пишем ошибку в error_logs для дашборда владельца (best-effort).
  logOwnerError(db, {
    source: 'server', teamId: (req as AuthedRequest).teamId, userId: (req as AuthedRequest).userId,
    method: req.method, url: req.originalUrl, message: err?.message || String(err), stack: err?.stack,
  });
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal server error' });
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  startLeadFollowupScheduler();
  startAlertScanScheduler();
  startBackupScheduler(db, DB_PATH);
  // Push the /-command menu to Telegram (idempotent — safe on every boot).
  // Adds /design to the blue menu button so users discover the wizard.
  if (isTelegramReady()) {
    registerBotCommands().then(() => console.log('[server] telegram /design menu registered'))
      .catch(e => console.warn('[server] registerBotCommands failed', e));
    // Верификация источника вебхука: если TELEGRAM_WEBHOOK_SECRET задан —
    // регистрируем вебхук с этим секретом (Telegram будет слать заголовок,
    // а мы его проверяем). Если не задан — предупреждаем, что публичный
    // вебхук без верификации можно подделать.
    if (isWebhookSecretSet()) {
      void configureWebhookSecret();
    } else {
      console.warn('[security] TELEGRAM_WEBHOOK_SECRET не задан — вебхук бота без верификации источника. Задайте секрет, чтобы исключить подделку апдейтов.');
    }
    // 09:00 Almaty morning digest to admins/managers.
    startDailySummaryScheduler(db);
  }
});
