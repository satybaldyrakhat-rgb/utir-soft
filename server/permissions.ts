// Role × module permission lookup. Shared between REST guards (index.ts),
// the Telegram bot tool executor (telegram.ts), and the in-app AI chat
// popup (/api/ai-chat/execute). Single source of truth so the platform
// behaves the same no matter which surface the user is on.
//
// Permission levels:
//   'full' → can read and write
//   'view' → read-only
//   'none' → no access (blocked entirely)
//
// Admin is always 'full' regardless of the configured matrix (safety net
// against an admin accidentally locking themselves out).

import Database from 'better-sqlite3';

export type PermissionLevel = 'full' | 'view' | 'none';

export const DEFAULT_MATRIX: Record<string, Record<string, PermissionLevel>> = {
  admin:    { orders: 'full', sales: 'full', chats: 'full', finance: 'full', production: 'full', warehouse: 'full', analytics: 'full', settings: 'full', tasks: 'full', 'ai-design': 'full' },
  manager:  { orders: 'full', sales: 'full', chats: 'full', finance: 'view', production: 'view', warehouse: 'view', analytics: 'view', settings: 'none', tasks: 'full', 'ai-design': 'full' },
  employee: { orders: 'view', sales: 'view', chats: 'view', finance: 'none', production: 'view', warehouse: 'view', analytics: 'none', settings: 'none', tasks: 'view', 'ai-design': 'view' },
};

export function getPermissionLevel(
  db: Database.Database,
  teamId: string,
  role: string,
  moduleKey: string,
): PermissionLevel {
  if (role === 'admin') return 'full';
  try {
    const row = db.prepare('SELECT role_permissions FROM team_settings WHERE team_id = ?').get(teamId) as any;
    if (row?.role_permissions) {
      const matrix = JSON.parse(row.role_permissions);
      const v = matrix?.[role]?.[moduleKey];
      if (v === 'full' || v === 'view' || v === 'none') return v;
    }
  } catch { /* fall through */ }
  const defLevel = DEFAULT_MATRIX[role]?.[moduleKey];
  if (defLevel) return defLevel;
  // Custom role with no matrix row → deny by default. Admin must explicitly
  // grant via Settings → Команда → матрица.
  return 'none';
}

// aiTools.getToolModule() returns Telegram-bot-style module keys ('sales',
// 'finance', 'tasks', 'warehouse', 'readonly'). The platform's permission
// matrix uses CRM-page keys ('orders', 'finance', 'tasks', 'production',
// 'warehouse'). This map keeps the two surfaces consistent.
export function aiToolModuleToMatrixKey(toolModule: string): string {
  switch (toolModule) {
    case 'sales':     return 'orders';     // add_deal, update_deal_status — sales = "Заказы / Сделки"
    case 'finance':   return 'finance';    // log_payment
    case 'tasks':     return 'tasks';      // add_task
    case 'warehouse': return 'warehouse';
    case 'analytics': return 'analytics';
    case 'chats':     return 'chats';
    case 'readonly':  return 'orders';     // find_client falls under read of orders
    default:          return toolModule;   // forward unknown so a brand-new tool fails closed
  }
}

// Convenience: "can this user perform a WRITE for the given tool module?"
// Combines mapping + level lookup. Returns the level so the caller can
// distinguish 'view' (read-only, refuse write) vs 'none' (no access at all).
export function canRunTool(
  db: Database.Database,
  teamId: string,
  role: string,
  toolModule: string,
  isWrite: boolean,
): { ok: boolean; level: PermissionLevel; matrixKey: string } {
  const matrixKey = aiToolModuleToMatrixKey(toolModule);
  const level = getPermissionLevel(db, teamId, role, matrixKey);
  if (level === 'none') return { ok: false, level, matrixKey };
  if (isWrite && level !== 'full') return { ok: false, level, matrixKey };
  return { ok: true, level, matrixKey };
}
