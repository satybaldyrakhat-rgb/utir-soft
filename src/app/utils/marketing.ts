// ─── Marketing (маркетинг) ──────────────────────────────────────────
// Single source of truth for lead channels + the per-channel ROI maths.
// Works on REAL data the team already enters (deal.source + manually
// recorded ad-spend transactions) — no Meta/Instagram API required. When
// the real Meta integration ships later it can feed the same shape.

import type { Deal, FinanceTransaction } from './dataStore';

// Lead channels. These double as: deal.source options, the ad-spend
// channel picker, and the marketing dashboard rows. Stored as plain
// strings (data values) so they must match across all three places —
// that's how spend gets attributed to the channel that produced leads.
export const LEAD_SOURCES = [
  'Instagram', 'WhatsApp', 'Telegram', 'Сайт',
  'Рекомендация', 'Реклама Meta', 'Звонок', 'Visit', 'Прочее',
] as const;

// Channels you actually pay for — shown first in the spend picker. The
// rest (Рекомендация/Звонок/Visit/Прочее) are organic but still selectable.
export const PAID_CHANNELS = ['Instagram', 'Реклама Meta', 'WhatsApp', 'Telegram', 'Сайт'] as const;

// Expense category that marks a transaction as ad spend. Combined with
// `adChannel` it feeds the per-channel CPL/ROMI.
export const MARKETING_CATEGORY = 'Маркетинг';

// Why a deal was lost — питает аналитику «почему не покупают». Stored on
// deal.lostReason as the RU string (data value).
export const LOST_REASONS = [
  'Дорого',
  'Передумал',
  'Ушёл к конкуренту',
  'Долго думает / не отвечает',
  'Не тот регион / нет доставки',
  'Не подошли сроки',
  'Дубль / ошибочная заявка',
  'Другое',
] as const;

export interface ChannelStat {
  source: string;
  leads: number;       // сколько заявок пришло с канала
  won: number;         // сколько стали платящими (paidAmount > 0)
  lost: number;        // сколько отказов
  revenue: number;     // фактически полученные деньги (Σ paidAmount)
  spend: number;       // рекламный расход на канал (ручной ввод)
  cpl: number;         // стоимость лида = расход / лиды
  cac: number;         // стоимость клиента = расход / продажи
  romi: number | null; // (выручка − расход) / расход × 100; null если расхода нет
  conversion: number;  // продажи / лиды × 100
}

// A deal counts as "rejected/lost" by these status ids (kanban final-reject
// column). Kept loose so renamed statuses still resolve.
const isLost = (status: string) => /reject|отказ|lost|cancel/i.test(status || '');
const isWon = (d: Deal) => !isLost(d.status) && (d.paidAmount || 0) > 0;

// Build the per-channel table. `deals` and `txns` should already be
// period-scoped by the caller so the dashboard respects the date filter.
export function computeChannelStats(deals: Deal[], txns: FinanceTransaction[]): ChannelStat[] {
  // Spend per channel — expenses tagged with an adChannel.
  const spendByChannel = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== 'expense' || !t.adChannel) continue;
    spendByChannel.set(t.adChannel, (spendByChannel.get(t.adChannel) || 0) + (t.amount || 0));
  }

  // Every channel that appears either as a deal source or a spend tag.
  const channels = new Set<string>();
  deals.forEach(d => channels.add(d.source || 'Прочее'));
  spendByChannel.forEach((_, k) => channels.add(k));

  const rows: ChannelStat[] = [];
  channels.forEach(source => {
    const chDeals = deals.filter(d => (d.source || 'Прочее') === source);
    const leads = chDeals.length;
    const won = chDeals.filter(isWon).length;
    const lost = chDeals.filter(d => isLost(d.status)).length;
    const revenue = chDeals.reduce((s, d) => s + (d.paidAmount || 0), 0);
    const spend = spendByChannel.get(source) || 0;
    rows.push({
      source, leads, won, lost, revenue, spend,
      cpl: leads > 0 ? spend / leads : 0,
      cac: won > 0 ? spend / won : 0,
      romi: spend > 0 ? Math.round(((revenue - spend) / spend) * 100) : null,
      conversion: leads > 0 ? Math.round((won / leads) * 100) : 0,
    });
  });

  // Most leads first — that's what a marketer scans top-down.
  return rows.sort((a, b) => b.leads - a.leads);
}
