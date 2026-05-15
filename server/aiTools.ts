// Tool definitions + executors for the platform AI assistant.
//
// Each tool has:
//   - JSON-schema fed to Claude so it knows when/how to call
//   - summarize() builds the short RU summary the bot sends for "Записываю: ... Всё верно?"
//   - execute() performs the DB write and returns a short OK string
//   - readOnly tools (find_client) bypass the confirmation flow and reply directly

import Database from 'better-sqlite3';

export interface ToolContext {
  db: Database.Database;
  userId: string;
  userName: string;
  logActivity: (userId: string, entry: any) => void;
}

// Module key matches the frontend's AISettings.assistant.modulePermissions keys —
// the Telegram bot uses this to look up the user's per-module permission
// (auto / confirm / none) before executing a write tool.
export type ToolModule = 'sales' | 'finance' | 'tasks' | 'analytics' | 'chats' | 'warehouse' | 'readonly';

interface ToolDef {
  description: string;
  input_schema: any;
  readOnly?: boolean;
  module: ToolModule;
  summarize: (input: any) => string;
  execute: (ctx: ToolContext, input: any) => Promise<string>;
}

const newId = (prefix: string) => prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const fmtKZT = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} ₸`;

// ─── Generic helpers around the JSON-blob deals table ─────────────
interface DealRow { id: string; data: any }

function listUserDeals(db: Database.Database, userId: string): DealRow[] {
  const rows = db.prepare('SELECT id, data FROM deals WHERE user_id = ? ORDER BY rowid DESC').all(userId) as any[];
  return rows.map(r => ({ id: r.id, data: JSON.parse(r.data) }));
}

function findDealByCustomer(db: Database.Database, userId: string, customerQuery: string): { single?: DealRow; multiple?: DealRow[] } {
  const q = customerQuery.trim().toLowerCase();
  if (!q) return {};
  const all = listUserDeals(db, userId);
  const matches = all.filter(d => String(d.data.customerName || '').toLowerCase().includes(q));
  if (matches.length === 0) return {};
  if (matches.length === 1) return { single: matches[0] };
  return { multiple: matches };
}

function patchDeal(db: Database.Database, dealId: string, updates: Record<string, any>) {
  const row = db.prepare('SELECT data FROM deals WHERE id = ?').get(dealId) as any;
  if (!row) throw new Error('deal not found');
  const data = { ...JSON.parse(row.data), ...updates };
  db.prepare('UPDATE deals SET data = ? WHERE id = ?').run(JSON.stringify(data), dealId);
  return data;
}

// ─── add_deal ─────────────────────────────────────────────────────
const addDeal: ToolDef = {
  module: 'sales',
  description:
    'Создать новую сделку (deal). ВЫЗЫВАЙ когда админ описывает нового клиента, продажу, заказ. ' +
    'Не задавай уточняющих вопросов про второстепенные поля (адрес, источник) — оставляй пустыми. ' +
    'Уточняй ТОЛЬКО если нет имени клиента или суммы.',
  input_schema: {
    type: 'object',
    properties: {
      customerName: { type: 'string', description: 'Имя клиента (обязательно).' },
      product:      { type: 'string', description: 'Краткое описание продукта/услуги/пакета.' },
      amount:       { type: 'number', description: 'Полная сумма сделки в тенге (KZT). Обязательно.' },
      paidAmount:   { type: 'number', description: 'Сколько уже оплачено в тенге. 0 если ничего.' },
      phone:        { type: 'string', description: 'Телефон клиента (опционально).' },
      notes:        { type: 'string', description: 'Любые доп. детали: статус оплаты, сроки, особые условия.' },
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
      type: 'create', page: 'sales',
    });
    return `Сделка <b>${i.customerName}</b> на ${fmtKZT(i.amount)} создана. Открыть → Заказы.`;
  },
};

// ─── log_payment ──────────────────────────────────────────────────
const logPayment: ToolDef = {
  module: 'finance',
  description:
    'Зафиксировать оплату по существующей сделке. ВЫЗЫВАЙ когда админ говорит "X оплатил/доплатил/закинул Y тенге". ' +
    'Прибавит сумму к уже оплаченному в сделке клиента. Если такого клиента нет — вернёт ошибку.',
  input_schema: {
    type: 'object',
    properties: {
      customerName: { type: 'string', description: 'Имя клиента или его часть — для поиска сделки.' },
      amount:       { type: 'number', description: 'Сумма поступившей оплаты в тенге. Обязательно.' },
      note:         { type: 'string', description: 'Способ оплаты или примечание (опционально).' },
    },
    required: ['customerName', 'amount'],
  },
  summarize: (i) => {
    const lines = [
      `<b>Записываю оплату:</b>`,
      `• Клиент: <b>${i.customerName}</b>`,
      `• Сумма: <b>${fmtKZT(i.amount)}</b>`,
    ];
    if (i.note) lines.push(`• Примечание: ${i.note}`);
    return lines.join('\n');
  },
  execute: async (ctx, i) => {
    const r = findDealByCustomer(ctx.db, ctx.userId, String(i.customerName));
    if (!r.single && !r.multiple) throw new Error(`сделка по «${i.customerName}» не найдена`);
    if (r.multiple) {
      const names = r.multiple.slice(0, 5).map(d => `«${d.data.customerName}» (${fmtKZT(d.data.amount)})`).join(', ');
      throw new Error(`нашёл несколько сделок по «${i.customerName}»: ${names}. Уточните в платформе вручную.`);
    }
    const d = r.single!;
    const prevPaid = Number(d.data.paidAmount) || 0;
    const addAmount = Number(i.amount) || 0;
    const nextPaid = prevPaid + addAmount;
    const totalAmount = Number(d.data.amount) || 0;
    patchDeal(ctx.db, d.id, { paidAmount: nextPaid });
    ctx.logActivity(ctx.userId, {
      user: 'AI-ассистент', actor: 'ai',
      action: `Записал оплату (по запросу ${ctx.userName})`,
      target: `${d.data.customerName} — +${fmtKZT(addAmount)}`,
      type: 'update', page: 'finance',
      before: fmtKZT(prevPaid),
      after: fmtKZT(nextPaid),
    });
    const remaining = totalAmount - nextPaid;
    return remaining > 0
      ? `Оплата <b>${fmtKZT(addAmount)}</b> записана. Сделка <b>${d.data.customerName}</b>: оплачено ${fmtKZT(nextPaid)} / ${fmtKZT(totalAmount)} (остаток ${fmtKZT(remaining)}).`
      : `Оплата записана. Сделка <b>${d.data.customerName}</b> полностью оплачена ✅`;
  },
};

// ─── update_deal_status ───────────────────────────────────────────
const STATUS_MAP: Record<string, { code: string; label: string }> = {
  new:               { code: 'new',             label: 'Новая заявка' },
  measured:          { code: 'measured',        label: 'Замер' },
  project:           { code: 'project-agreed',  label: 'Проект и договор' },
  contract:          { code: 'project-agreed',  label: 'Проект и договор' },
  production:        { code: 'production',      label: 'Производство' },
  installation:      { code: 'installation',    label: 'Установка' },
  completed:         { code: 'completed',       label: 'Завершено' },
  done:              { code: 'completed',       label: 'Завершено' },
  rejected:          { code: 'rejected',        label: 'Отказ' },
  cancelled:         { code: 'rejected',        label: 'Отказ' },
};

const updateDealStatus: ToolDef = {
  module: 'sales',
  description:
    'Изменить статус сделки. ВЫЗЫВАЙ когда админ говорит "X подписал договор", "Y отказался", "сделка с Z завершена". ' +
    'Допустимые статусы (выбери ближайший): new, measured, project (проект и договор), production (производство), ' +
    'installation (установка), completed (готово), rejected (отказ).',
  input_schema: {
    type: 'object',
    properties: {
      customerName: { type: 'string', description: 'Имя клиента или его часть.' },
      status:       { type: 'string', enum: Object.keys(STATUS_MAP), description: 'Новый статус сделки.' },
      note:         { type: 'string', description: 'Опциональный комментарий.' },
    },
    required: ['customerName', 'status'],
  },
  summarize: (i) => {
    const meta = STATUS_MAP[i.status] || { label: i.status };
    return [
      `<b>Меняю статус сделки:</b>`,
      `• Клиент: <b>${i.customerName}</b>`,
      `• Новый статус: <b>${meta.label}</b>`,
      i.note ? `• Комментарий: ${i.note}` : '',
    ].filter(Boolean).join('\n');
  },
  execute: async (ctx, i) => {
    const r = findDealByCustomer(ctx.db, ctx.userId, String(i.customerName));
    if (!r.single && !r.multiple) throw new Error(`сделка по «${i.customerName}» не найдена`);
    if (r.multiple) {
      const names = r.multiple.slice(0, 5).map(d => `«${d.data.customerName}»`).join(', ');
      throw new Error(`нашёл несколько сделок: ${names}. Уточните вручную.`);
    }
    const d = r.single!;
    const prev = d.data.status;
    const meta = STATUS_MAP[i.status] || { code: i.status, label: i.status };
    patchDeal(ctx.db, d.id, { status: meta.code });
    ctx.logActivity(ctx.userId, {
      user: 'AI-ассистент', actor: 'ai',
      action: `Сменил статус сделки (по запросу ${ctx.userName})`,
      target: d.data.customerName,
      type: 'update', page: 'sales',
      before: prev || '—',
      after: meta.code,
    });
    return `Статус сделки <b>${d.data.customerName}</b> → <b>${meta.label}</b>.`;
  },
};

// ─── add_task ─────────────────────────────────────────────────────
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

const addTask: ToolDef = {
  module: 'tasks',
  description:
    'Создать новую задачу для команды. ВЫЗЫВАЙ когда админ говорит "нужно сделать X к Y дате", "поставь задачу", "напомни X-у про Y". ' +
    'Сегодняшнюю дату подставляй САМ исходя из текущей даты в системе.',
  input_schema: {
    type: 'object',
    properties: {
      title:       { type: 'string', description: 'Краткое название задачи. Обязательно.' },
      description: { type: 'string', description: 'Детали — что именно сделать.' },
      dueDate:     { type: 'string', description: 'Срок в формате YYYY-MM-DD. Если "завтра" — посчитай завтрашнюю дату.' },
      priority:    { type: 'string', enum: TASK_PRIORITIES as unknown as string[], description: 'Приоритет: low | medium | high | urgent.' },
      category:    { type: 'string', description: 'Категория задачи (Замер, Сборка, Дизайн, Продажи и т.п.) — опционально.' },
    },
    required: ['title'],
  },
  summarize: (i) => {
    // Show the actual date that will be saved, including the today-fallback used by execute().
    const today = new Date().toISOString().slice(0, 10);
    const due = i.dueDate || today;
    const dueLabel = i.dueDate ? i.dueDate : `сегодня (${today})`;
    const lines = [
      `<b>Создаю задачу:</b>`,
      `• Название: <b>${i.title}</b>`,
      `• Срок: ${dueLabel}`,
    ];
    if (i.description) lines.push(`• Описание: ${i.description}`);
    if (i.priority)    lines.push(`• Приоритет: ${i.priority}`);
    if (i.category)    lines.push(`• Категория: ${i.category}`);
    // Touch `due` so TS treats it as used even if all helpers above end up disabled.
    void due;
    return lines.join('\n');
  },
  execute: async (ctx, i) => {
    const id = newId('t');
    const due = i.dueDate || new Date().toISOString().slice(0, 10);
    const data = {
      id,
      title: i.title,
      description: i.description || '',
      status: 'new',
      priority: i.priority || 'medium',
      assigneeId: '',
      createdAt: new Date().toISOString(),
      dueDate: due,
      category: i.category || 'Прочее',
      subtasks: [],
    };
    ctx.db.prepare('INSERT INTO tasks (id, user_id, data) VALUES (?, ?, ?)').run(id, ctx.userId, JSON.stringify(data));
    ctx.logActivity(ctx.userId, {
      user: 'AI-ассистент', actor: 'ai',
      action: `Создал задачу (по запросу ${ctx.userName})`,
      target: i.title,
      type: 'create', page: 'tasks',
    });
    return `Задача «${i.title}» создана на ${due}. Открыть → Задачи.`;
  },
};

// ─── find_client (read-only) ──────────────────────────────────────
const findClient: ToolDef = {
  module: 'readonly',
  description:
    'Найти сделку и показать её сводку. ВЫЗЫВАЙ когда админ спрашивает "что по X?", "сколько у Y?", "статус Z?", "найди клиента". ' +
    'Это инструмент чтения — не пишет в базу.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Имя клиента или его часть.' },
    },
    required: ['query'],
  },
  readOnly: true,
  summarize: () => '', // unused — readOnly tools bypass confirmation
  execute: async (ctx, i) => {
    const r = findDealByCustomer(ctx.db, ctx.userId, String(i.query));
    if (!r.single && !r.multiple) return `По запросу «${i.query}» сделок не нашёл.`;
    const matches = r.single ? [r.single] : r.multiple!;
    const lines = matches.slice(0, 5).map(d => {
      const paid = Number(d.data.paidAmount) || 0;
      const total = Number(d.data.amount) || 0;
      const status = STATUS_MAP[d.data.status]?.label || d.data.status || '—';
      const remaining = total - paid;
      return [
        `<b>${d.data.customerName}</b>`,
        d.data.product ? `  Продукт: ${d.data.product}` : null,
        `  Сумма: ${fmtKZT(total)}`,
        `  Оплачено: ${fmtKZT(paid)}${remaining > 0 ? ` (остаток ${fmtKZT(remaining)})` : ' ✅'}`,
        `  Статус: ${status}`,
      ].filter(Boolean).join('\n');
    });
    const head = matches.length === 1 ? '' : `<b>Нашёл ${matches.length} сделок:</b>\n\n`;
    const tail = matches.length > 5 ? `\n\n…и ещё ${matches.length - 5}, смотри в платформе.` : '';
    return head + lines.join('\n\n') + tail;
  },
};

// ─── Registry + public API ────────────────────────────────────────
const TOOLS: Record<string, ToolDef> = {
  add_deal:           addDeal,
  log_payment:        logPayment,
  update_deal_status: updateDealStatus,
  add_task:           addTask,
  find_client:        findClient,
};

export function toolsForClaude() {
  return Object.entries(TOOLS).map(([name, def]) => ({
    name,
    description: def.description,
    input_schema: def.input_schema,
  }));
}

export function isReadOnly(toolName: string): boolean {
  return !!TOOLS[toolName]?.readOnly;
}

// Return the module key the tool belongs to (used for per-module permission lookup).
// Returns `null` for unknown tools so the bot can refuse safely.
export function getToolModule(toolName: string): ToolModule | null {
  return TOOLS[toolName]?.module ?? null;
}

export function summarize(toolName: string, input: any): string {
  const t = TOOLS[toolName];
  if (!t) return `Действие «${toolName}»: ${JSON.stringify(input)}`;
  return t.summarize(input);
}

async function execute(db: Database.Database, userId: string, userName: string, toolName: string, input: any, logActivity: (userId: string, entry: any) => void): Promise<string> {
  const t = TOOLS[toolName];
  if (!t) throw new Error(`unknown tool: ${toolName}`);
  return t.execute({ db, userId, userName, logActivity }, input);
}

export default { toolsForClaude, isReadOnly, getToolModule, summarize, execute };
