// Tool definitions + executors for the platform AI assistant (Block F.1).
//
// Each tool has:
//   - a JSON-schema definition fed to Claude (so it knows what to call)
//   - a `summarize` function that turns the tool args into a short RU summary
//     the bot sends to the admin for "Записываю: ... Всё верно?"
//   - an `execute` function that performs the DB write and returns a short OK string
//
// MVP scope: 1 tool — add_deal. The same shape covers add_task, log_payment etc.
// later — just register them in the TOOLS map.

import Database from 'better-sqlite3';

export interface ToolContext {
  db: Database.Database;
  userId: string;
  userName: string;
  logActivity: (userId: string, entry: any) => void;
}

interface ToolDef {
  description: string;
  input_schema: any;
  summarize: (input: any) => string;
  execute: (ctx: ToolContext, input: any) => Promise<string>;
}

const newId = (prefix: string) => prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const fmtKZT = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} ₸`;

// ─── add_deal ─────────────────────────────────────────────────────
const addDeal: ToolDef = {
  description:
    'Создать новую сделку (deal) в CRM. ВЫЗЫВАЙ когда админ описывает нового клиента, продажу, заказ — даже если деталей мало. ' +
    'Не задавай уточняющих вопросов про второстепенные поля (адрес, источник) — оставляй пустыми. ' +
    'Уточняй только если КРИТИЧЕСКОГО поля нет: имени клиента или суммы.',
  input_schema: {
    type: 'object',
    properties: {
      customerName: { type: 'string', description: 'Имя клиента (обязательно)' },
      product:      { type: 'string', description: 'Что заказал клиент. Краткое описание продукта/услуги/пакета.' },
      amount:       { type: 'number', description: 'Полная сумма по сделке в тенге (KZT). Обязательно.' },
      paidAmount:   { type: 'number', description: 'Сколько уже оплачено в тенге. 0 если ничего ещё.' },
      phone:        { type: 'string', description: 'Телефон клиента, опционально' },
      notes:        { type: 'string', description: 'Любые дополнительные детали из сообщения админа: статус оплаты, сроки, особые условия.' },
    },
    required: ['customerName', 'amount'],
  },
  summarize: (i) => {
    const lines = [
      `<b>Записываю сделку:</b>`,
      `• Клиент: <b>${i.customerName}</b>`,
    ];
    if (i.product)    lines.push(`• Продукт: ${i.product}`);
    lines.push(`• Сумма: <b>${fmtKZT(i.amount)}</b>`);
    if (i.paidAmount) lines.push(`• Оплачено: ${fmtKZT(i.paidAmount)} (остаток ${fmtKZT(i.amount - i.paidAmount)})`);
    else              lines.push(`• Оплата: ждём`);
    if (i.phone)      lines.push(`• Телефон: ${i.phone}`);
    if (i.notes)      lines.push(`• Заметка: ${i.notes}`);
    return lines.join('\n');
  },
  execute: async (ctx, i) => {
    const id = newId('D');
    const data = {
      id,
      customerName: i.customerName,
      phone: i.phone || '',
      address: '',
      product: i.product || '',
      furnitureType: '',
      amount: Number(i.amount) || 0,
      paidAmount: Number(i.paidAmount) || 0,
      status: 'new',
      icon: 'phone',
      priority: 'medium',
      date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
      progress: 5,
      source: '',
      measurer: '', designer: '', materials: '',
      measurementDate: '', completionDate: '', installationDate: '',
      paymentMethods: {},
      notes: i.notes || '',
      workType: 'furniture',
      createdAt: new Date().toISOString(),
    };
    ctx.db.prepare('INSERT INTO deals (id, user_id, data) VALUES (?, ?, ?)').run(id, ctx.userId, JSON.stringify(data));
    ctx.logActivity(ctx.userId, {
      user: 'AI-ассистент', actor: 'ai',
      action: `Создал сделку (по запросу ${ctx.userName})`,
      target: `${i.customerName} — ${fmtKZT(i.amount)}`,
      type: 'create',
      page: 'sales',
    });
    return `Сделка <b>${i.customerName}</b> на ${fmtKZT(i.amount)} создана. Открыть в платформе → Заказы.`;
  },
};

// ─── Registry + public API ────────────────────────────────────────
const TOOLS: Record<string, ToolDef> = { add_deal: addDeal };

export function toolsForClaude() {
  return Object.entries(TOOLS).map(([name, def]) => ({
    name,
    description: def.description,
    input_schema: def.input_schema,
  }));
}

export function summarize(toolName: string, input: any): string {
  const t = TOOLS[toolName];
  if (!t) return `Действие «${toolName}» с параметрами: ${JSON.stringify(input)}`;
  return t.summarize(input);
}

async function execute(db: Database.Database, userId: string, userName: string, toolName: string, input: any, logActivity: (userId: string, entry: any) => void): Promise<string> {
  const t = TOOLS[toolName];
  if (!t) throw new Error(`unknown tool: ${toolName}`);
  return t.execute({ db, userId, userName, logActivity }, input);
}

export default { toolsForClaude, summarize, execute };
