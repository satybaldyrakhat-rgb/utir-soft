// ─── Экспорт данных команды ───────────────────────────────────────────
// Админ команды может выгрузить ВСЕ свои данные одним JSON — доверие
// (клиент видит, что данные его) и портируемость (может уйти с ними).
// Строго team-scoped: отдаём только строки этой команды.

import type Database from 'better-sqlite3';

// Таблицы с JSON-блобом (id, …, team_id, data) — выгружаем как массив
// разобранных объектов. ai_generations намеренно без image_data (тяжёлый
// base64) — только метаданные.
const BLOB_TABLES = ['deals', 'transactions', 'products', 'tasks', 'employees',
  'bom_templates', 'suppliers', 'purchase_orders', 'custom_modules', 'custom_records'] as const;

export function exportTeam(db: Database.Database, teamId: string): Record<string, any> {
  const out: Record<string, any> = {
    _meta: { exportedAt: new Date().toISOString(), teamId, format: 'utir-soft-export-v1' },
  };

  for (const t of BLOB_TABLES) {
    try {
      const rows = db.prepare(`SELECT id, data FROM ${t} WHERE team_id = ?`).all(teamId) as any[];
      out[t] = rows.map(r => { try { return { id: r.id, ...JSON.parse(r.data) }; } catch { return { id: r.id }; } });
    } catch { out[t] = []; }
  }

  // Чаты: диалоги + их сообщения.
  try {
    const convs = db.prepare('SELECT id, data FROM conversations WHERE team_id = ?').all(teamId) as any[];
    out.conversations = convs.map(c => {
      let data: any = {}; try { data = JSON.parse(c.data); } catch { /* skip */ }
      const msgs = db.prepare('SELECT id, data FROM messages WHERE conversation_id = ? AND team_id = ? ORDER BY rowid ASC').all(c.id, teamId) as any[];
      return { id: c.id, ...data, messages: msgs.map(m => { try { return { id: m.id, ...JSON.parse(m.data) }; } catch { return { id: m.id }; } }) };
    });
  } catch { out.conversations = []; }

  // История изменений сделок.
  try {
    out.deal_history = (db.prepare('SELECT id, deal_id, user_name, changes, created_at FROM deal_history WHERE team_id = ? ORDER BY rowid ASC').all(teamId) as any[])
      .map(h => { let changes: any = {}; try { changes = JSON.parse(h.changes); } catch { /* skip */ } return { id: h.id, dealId: h.deal_id, user: h.user_name, changes, at: h.created_at }; });
  } catch { out.deal_history = []; }

  // AI-генерации — только метаданные (без картинок).
  try {
    out.ai_generations = (db.prepare('SELECT id, user_name, provider, prompt, image_url, created_at FROM ai_generations WHERE team_id = ? ORDER BY rowid ASC').all(teamId) as any[])
      .map(g => ({ id: g.id, user: g.user_name, provider: g.provider, prompt: g.prompt, imageUrl: g.image_url || null, at: g.created_at }));
  } catch { out.ai_generations = []; }

  // Настройки команды (реквизиты, ниша, каталоги, права ролей).
  try {
    const ts = db.prepare('SELECT * FROM team_settings WHERE team_id = ?').get(teamId) as any;
    if (ts) {
      const parse = (v: any) => { if (!v) return null; try { return JSON.parse(v); } catch { return v; } };
      out.settings = {
        companyRequisites: parse(ts.company_requisites), niche: ts.niche || null,
        secondaryNiches: parse(ts.secondary_niches), catalogs: parse(ts.catalogs),
        rolePermissions: parse(ts.role_permissions), teamRoles: parse(ts.team_roles),
      };
    }
  } catch { /* skip */ }

  // Пользователи команды (без хэшей паролей).
  try {
    out.users = (db.prepare('SELECT id, name, email, team_role, created_at FROM users WHERE team_id = ?').all(teamId) as any[])
      .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.team_role, createdAt: u.created_at }));
  } catch { out.users = []; }

  // Счётчики для быстрой сверки.
  out._counts = Object.fromEntries(Object.entries(out).filter(([k, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as any[]).length]));
  return out;
}
