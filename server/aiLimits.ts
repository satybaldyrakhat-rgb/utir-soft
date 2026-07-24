// ─── Лимиты AI на бесплатном (пробном) периоде ─────────────────────────
// Новая команда → 14 дней бесплатно, но с дневными лимитами на
// AI-ассистента и на генерацию AI-дизайна. Активная (оплаченная) подписка
// — без лимитов этого слоя. После окончания триала без оплаты — AI
// закрыт (стимул оформить подписку).
//
// План берём из подписки (ownerAdmin.getSubscription): по умолчанию у
// команды 14-дневный триал от даты создания, поэтому лимиты работают
// сразу, даже если владелец ещё не заводил подписку вручную.

import type Database from 'better-sqlite3';
import { getSubscription } from './ownerAdmin.js';

export type AiKind = 'assistant' | 'design';
export type Plan = 'active' | 'trial' | 'expired';

// Дневные лимиты. null = без лимита.
const LIMITS: Record<Plan, Record<AiKind, number | null>> = {
  trial:   { assistant: Number(process.env.AI_TRIAL_ASSISTANT ?? 20), design: Number(process.env.AI_TRIAL_DESIGN ?? 8) },
  active:  { assistant: null, design: null },
  expired: { assistant: 0, design: 0 },
};

export function initAiLimitsSchema(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS ai_usage_daily (
    team_id TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER DEFAULT 0,
    PRIMARY KEY (team_id, day, kind)
  );`);
}

function teamCreatedAt(db: Database.Database, teamId: string): string | undefined {
  const u = db.prepare('SELECT created_at FROM users WHERE id = ?').get(teamId) as any;
  return u?.created_at;
}

export function effectivePlan(db: Database.Database, teamId: string): Plan {
  const sub = getSubscription(db, teamId, teamCreatedAt(db, teamId));
  if (sub.status === 'active') return 'active';
  if (sub.status === 'trial') {
    const exp = new Date(sub.expiresAt).getTime();
    return (!isNaN(exp) && Date.now() <= exp) ? 'trial' : 'expired';
  }
  // past_due / churned → нужна оплата
  return 'expired';
}

const today = () => new Date().toISOString().slice(0, 10);

export interface AiLimitStatus {
  plan: Plan; kind: AiKind; limit: number | null; used: number;
  remaining: number | null; unlimited: boolean; allowed: boolean;
}

export function aiLimitStatus(db: Database.Database, teamId: string, kind: AiKind): AiLimitStatus {
  const plan = effectivePlan(db, teamId);
  const limit = LIMITS[plan][kind];
  const row = db.prepare('SELECT count FROM ai_usage_daily WHERE team_id = ? AND day = ? AND kind = ?').get(teamId, today(), kind) as any;
  const used = Number(row?.count || 0);
  const unlimited = limit === null;
  const remaining = unlimited ? null : Math.max(0, (limit as number) - used);
  const allowed = unlimited || used < (limit as number);
  return { plan, kind, limit, used, remaining, unlimited, allowed };
}

export function consumeAi(db: Database.Database, teamId: string, kind: AiKind) {
  db.prepare(`INSERT INTO ai_usage_daily (team_id, day, kind, count) VALUES (?, ?, ?, 1)
              ON CONFLICT(team_id, day, kind) DO UPDATE SET count = count + 1`).run(teamId, today(), kind);
}

// Человеко-понятная причина отказа (для фронта).
export function limitReason(s: AiLimitStatus): string {
  if (s.plan === 'expired') {
    return s.kind === 'design'
      ? 'Пробный период завершён. Оформите подписку, чтобы продолжить генерацию AI-дизайна.'
      : 'Пробный период завершён. Оформите подписку, чтобы продолжить работу с AI-ассистентом.';
  }
  // trial, лимит на сегодня исчерпан
  return s.kind === 'design'
    ? `Дневной лимит AI-дизайна на пробном периоде исчерпан (${s.limit}/день). Завтра снова доступно, или оформите подписку для снятия лимитов.`
    : `Дневной лимит AI-ассистента на пробном периоде исчерпан (${s.limit}/день). Завтра снова доступно, или оформите подписку для снятия лимитов.`;
}
