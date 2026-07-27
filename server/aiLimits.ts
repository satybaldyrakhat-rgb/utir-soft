// ─── Лимиты AI по тарифам ───────────────────────────────────────────
// Модель тарифов «Вариант A» (проникновение):
//   • Триал (14 дней бесплатно) — дневные лимиты, чтобы дать пощупать,
//     но не позволить майнить AI: по умолчанию 20 сообщений и 8 дизайнов
//     в ДЕНЬ.
//   • Платные тарифы — МЕСЯЧНЫЕ лимиты по тарифу (Старт/Цех/Бизнес/
//     Корпорация). Это защита маржи: один дизайн ≈ 70₸ себестоимости,
//     без потолка тяжёлый клиент уводит тариф в минус. Перерасход
//     продаётся пакетами (см. дашборд владельца / докупку).
//   • Корпорация — безлимитный чат, дизайн с большим потолком.
//   • Энтерпрайз и владелец платформы (super-admin) — без лимитов.
//   • Истёкший триал без оплаты — AI закрыт (стимул оформить подписку).
//
// Тариф берём из подписки (ownerAdmin.getSubscription): поле `plan`
// — свободная строка, которую владелец выставляет в Центре управления.
// Неизвестный платный план трактуем как «Бизнес» (щедрый потолок), чтобы
// случайно не заблокировать платящего клиента.

import type Database from 'better-sqlite3';
import { getSubscription, isSuperAdminTeam } from './ownerAdmin.js';

export type AiKind = 'assistant' | 'design';
export type Plan = 'active' | 'trial' | 'expired';
export type Window = 'day' | 'month';

interface LimitDef {
  assistant: number | null; // null = без лимита
  design: number | null;
  window: Window;
}

const UNLIMITED: LimitDef = { assistant: null, design: null, window: 'month' };

// Триал — дневные лимиты (переопределяются через env для тонкой настройки).
const TRIAL: LimitDef = {
  assistant: Number(process.env.AI_TRIAL_ASSISTANT ?? 20),
  design: Number(process.env.AI_TRIAL_DESIGN ?? 8),
  window: 'day',
};
const EXPIRED: LimitDef = { assistant: 0, design: 0, window: 'month' };

// Платные тарифы — МЕСЯЧНЫЕ потолки (Вариант A). Ключи нормализуются в
// lower-case; поддерживаем и человекочитаемые названия, и служебные.
const PAID_TIERS: Record<string, LimitDef> = {
  start:       { assistant: 30,   design: 5,    window: 'month' },
  'старт':     { assistant: 30,   design: 5,    window: 'month' },
  free:        { assistant: 30,   design: 5,    window: 'month' },
  basic:       { assistant: 200,  design: 20,   window: 'month' },
  tseh:        { assistant: 200,  design: 20,   window: 'month' },
  cex:         { assistant: 200,  design: 20,   window: 'month' },
  'цех':       { assistant: 200,  design: 20,   window: 'month' },
  pro:         { assistant: 800,  design: 80,   window: 'month' },
  business:    { assistant: 800,  design: 80,   window: 'month' },
  'бизнес':    { assistant: 800,  design: 80,   window: 'month' },
  corp:        { assistant: null, design: 250,  window: 'month' },
  corporation: { assistant: null, design: 250,  window: 'month' },
  'корпорация':{ assistant: null, design: 250,  window: 'month' },
  enterprise:  { assistant: null, design: null, window: 'month' },
  'энтерпрайз':{ assistant: null, design: null, window: 'month' },
};
// Неизвестный платный план → уровень «Бизнес» (щедро, но с потолком).
const DEFAULT_PAID: LimitDef = { assistant: 800, design: 80, window: 'month' };

export function initAiLimitsSchema(db: Database.Database) {
  // Колонка `day` хранит ключ периода: 'YYYY-MM-DD' для дневных лимитов
  // (триал) или 'YYYY-MM' для месячных (платные). Разные окна дают разные
  // ключи, поэтому одна таблица обслуживает оба режима без миграции.
  db.exec(`CREATE TABLE IF NOT EXISTS ai_usage_daily (
    team_id TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER DEFAULT 0,
    PRIMARY KEY (team_id, day, kind)
  );`);
  // Докупленные AI-пакеты: разовая прибавка к месячному лимиту тарифа.
  // Действует в пределах указанного месяца (сгорает в конце месяца).
  db.exec(`CREATE TABLE IF NOT EXISTS ai_bonus (
    team_id TEXT NOT NULL, month TEXT NOT NULL, kind TEXT NOT NULL, extra INTEGER DEFAULT 0,
    PRIMARY KEY (team_id, month, kind)
  );`);
}

// Сколько бонусных единиц (докупленных пакетов) у команды в этом месяце.
function getBonus(db: Database.Database, teamId: string, kind: AiKind, month: string): number {
  const row = db.prepare('SELECT extra FROM ai_bonus WHERE team_id = ? AND month = ? AND kind = ?').get(teamId, month, kind) as any;
  return Number(row?.extra || 0);
}

// Начислить AI-пакет команде на текущий месяц (владелец после оплаты).
export function grantAiPack(db: Database.Database, teamId: string, kind: AiKind, extra: number): AiLimitStatus {
  const add = Math.max(0, Math.floor(extra));
  db.prepare(`INSERT INTO ai_bonus (team_id, month, kind, extra) VALUES (?, ?, ?, ?)
              ON CONFLICT(team_id, month, kind) DO UPDATE SET extra = extra + excluded.extra`).run(teamId, monthKey(), kind, add);
  return aiLimitStatus(db, teamId, kind);
}

function teamCreatedAt(db: Database.Database, teamId: string): string | undefined {
  const u = db.prepare('SELECT created_at FROM users WHERE id = ?').get(teamId) as any;
  return u?.created_at;
}

// Грубый план (для сообщений/фронта): active | trial | expired.
export function effectivePlan(db: Database.Database, teamId: string): Plan {
  return resolveLimit(db, teamId).plan;
}

// Разрешаем тариф → набор лимитов + грубый план.
function resolveLimit(db: Database.Database, teamId: string): { def: LimitDef; plan: Plan } {
  if (isSuperAdminTeam(db, teamId)) return { def: UNLIMITED, plan: 'active' };
  const sub = getSubscription(db, teamId, teamCreatedAt(db, teamId));
  if (sub.status === 'active' || sub.status === 'past_due') {
    const key = String(sub.plan || '').toLowerCase().trim();
    return { def: PAID_TIERS[key] || DEFAULT_PAID, plan: 'active' };
  }
  if (sub.status === 'trial') {
    const exp = new Date(sub.expiresAt).getTime();
    if (!isNaN(exp) && Date.now() <= exp) return { def: TRIAL, plan: 'trial' };
    return { def: EXPIRED, plan: 'expired' };
  }
  // churned и прочее → нужна оплата
  return { def: EXPIRED, plan: 'expired' };
}

const dayKey = () => new Date().toISOString().slice(0, 10);   // YYYY-MM-DD
const monthKey = () => new Date().toISOString().slice(0, 7);  // YYYY-MM
const periodKey = (w: Window) => (w === 'month' ? monthKey() : dayKey());

export interface AiLimitStatus {
  plan: Plan; kind: AiKind; limit: number | null; used: number;
  remaining: number | null; unlimited: boolean; allowed: boolean;
  window: Window;
  baseLimit: number | null; // лимит тарифа без бонусов
  bonus: number;            // докупленные пакеты в этом месяце
}

export function aiLimitStatus(db: Database.Database, teamId: string, kind: AiKind): AiLimitStatus {
  const { def, plan } = resolveLimit(db, teamId);
  const base = def[kind];
  const key = periodKey(def.window);
  // Бонусные пакеты действуют только на месячные (платные) лимиты.
  const bonus = (def.window === 'month' && base !== null) ? getBonus(db, teamId, kind, key) : 0;
  const limit = base === null ? null : base + bonus;
  const row = db.prepare('SELECT count FROM ai_usage_daily WHERE team_id = ? AND day = ? AND kind = ?').get(teamId, key, kind) as any;
  const used = Number(row?.count || 0);
  const unlimited = limit === null;
  const remaining = unlimited ? null : Math.max(0, (limit as number) - used);
  const allowed = unlimited || used < (limit as number);
  return { plan, kind, limit, used, remaining, unlimited, allowed, window: def.window, baseLimit: base, bonus };
}

export function consumeAi(db: Database.Database, teamId: string, kind: AiKind) {
  const { def } = resolveLimit(db, teamId);
  const key = periodKey(def.window);
  db.prepare(`INSERT INTO ai_usage_daily (team_id, day, kind, count) VALUES (?, ?, ?, 1)
              ON CONFLICT(team_id, day, kind) DO UPDATE SET count = count + 1`).run(teamId, key, kind);
}

// Человеко-понятная причина отказа (для фронта).
export function limitReason(s: AiLimitStatus): string {
  if (s.plan === 'expired') {
    return s.kind === 'design'
      ? 'Пробный период завершён. Оформите подписку, чтобы продолжить генерацию AI-дизайна.'
      : 'Пробный период завершён. Оформите подписку, чтобы продолжить работу с AI-ассистентом.';
  }
  const per = s.window === 'month' ? 'мес' : 'день';
  const when = s.window === 'month' ? 'В следующем месяце' : 'Завтра';
  const tail = s.plan === 'trial'
    ? `${when} снова доступно, или оформите подписку для снятия лимитов.`
    : `${when} лимит обновится. Нужно больше сейчас — докупите пакет AI или перейдите на тариф выше.`;
  return s.kind === 'design'
    ? `Лимит AI-дизайна по вашему тарифу исчерпан (${s.limit}/${per}). ${tail}`
    : `Лимит AI-ассистента по вашему тарифу исчерпан (${s.limit}/${per}). ${tail}`;
}
