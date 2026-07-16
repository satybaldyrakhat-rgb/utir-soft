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
  userId: string;  // creator / actor — used as audit field on inserts
  teamId: string;  // scoping key — every read/write filters by this
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

function listTeamDeals(db: Database.Database, teamId: string): DealRow[] {
  const rows = db.prepare('SELECT id, data FROM deals WHERE team_id = ? ORDER BY rowid DESC').all(teamId) as any[];
  return rows.map(r => ({ id: r.id, data: JSON.parse(r.data) }));
}

function findDealByCustomer(db: Database.Database, teamId: string, customerQuery: string): { single?: DealRow; multiple?: DealRow[] } {
  const q = customerQuery.trim().toLowerCase();
  if (!q) return {};
  const all = listTeamDeals(db, teamId);
  const matches = all.filter(d => String(d.data.customerName || '').toLowerCase().includes(q));
  if (matches.length === 0) return {};
  if (matches.length === 1) return { single: matches[0] };
  return { multiple: matches };
}

function patchDeal(db: Database.Database, teamId: string, dealId: string, updates: Record<string, any>) {
  // Скоуп по team_id обязателен: не полагаемся на то, что вызывающий уже
  // проверил принадлежность сделки команде (defense-in-depth против IDOR).
  const row = db.prepare('SELECT data FROM deals WHERE id = ? AND team_id = ?').get(dealId, teamId) as any;
  if (!row) throw new Error('deal not found');
  const data = { ...JSON.parse(row.data), ...updates };
  db.prepare('UPDATE deals SET data = ? WHERE id = ? AND team_id = ?').run(JSON.stringify(data), dealId, teamId);
  return data;
}

// ─── add_deal ─────────────────────────────────────────────────────
const addDeal: ToolDef = {
  module: 'sales',
  description:
    'Создать НОВУЮ сделку (deal). ВЫЗЫВАЙ ТОЛЬКО если клиент ещё не существует в системе. ' +
    'ПРАВИЛО: если пользователь упомянул имя похожее на существующего клиента — НЕ вызывай add_deal, ' +
    'вместо этого вызови update_deal с тем же customerName (поиск по подстроке найдёт сделку даже по части имени). ' +
    'Если сомневаешься — сначала вызови find_client. ' +
    'Все поля адресов/материалов/типа мебели — отдельные параметры, НЕ запихивай их в notes.',
  input_schema: {
    type: 'object',
    properties: {
      customerName:    { type: 'string', description: 'Имя клиента (обязательно).' },
      product:         { type: 'string', description: 'Краткое описание продукта/услуги/пакета.' },
      amount:          { type: 'number', description: 'Полная сумма сделки в тенге (KZT). 0 если пока неизвестно.' },
      paidAmount:      { type: 'number', description: 'Сколько уже оплачено в тенге. 0 если ничего.' },
      phone:           { type: 'string', description: 'Телефон клиента. Опционально.' },
      email:           { type: 'string', description: 'Email клиента. Опционально.' },
      address:         { type: 'string', description: 'Адрес клиента (для договора). Город, улица, дом. Опционально.' },
      siteAddress:     { type: 'string', description: 'Адрес объекта/стройки (куда выезжает прораб/замерщик). Опционально.' },
      furnitureType:   { type: 'string', description: 'Тип мебели: Кухня, Шкаф-купе, Гардероб, Прихожая, Спальня и т.п. Опционально.' },
      materials:       { type: 'string', description: 'Материалы: МДФ, ЛДСП, массив, шпон, пластик, и т.п. Опционально.' },
      source:          { type: 'string', description: 'Откуда клиент: Instagram, WhatsApp, Telegram, Сайт, Рекомендация, Звонок. Опционально.' },
      measurer:        { type: 'string', description: 'Имя замерщика. Опционально.' },
      designer:        { type: 'string', description: 'Имя дизайнера. Опционально.' },
      notes:           { type: 'string', description: 'Особые условия / нестандартные пожелания. НЕ дублируй сюда то что уже есть в других полях.' },
    },
    required: ['customerName'],
  },
  summarize: (i) => {
    const lines = [
      `<b>Записываю сделку:</b>`,
      `• Клиент: <b>${i.customerName}</b>`,
    ];
    if (i.product)         lines.push(`• Продукт: ${i.product}`);
    if (i.furnitureType)   lines.push(`• Тип мебели: ${i.furnitureType}`);
    if (i.materials)       lines.push(`• Материалы: ${i.materials}`);
    lines.push(`• Сумма: <b>${fmtKZT(i.amount || 0)}</b>`);
    if (i.paidAmount)      lines.push(`• Оплачено: ${fmtKZT(i.paidAmount)} (остаток ${fmtKZT((i.amount || 0) - i.paidAmount)})`);
    else                   lines.push(`• Оплата: ждём`);
    if (i.phone)           lines.push(`• Телефон: ${i.phone}`);
    if (i.email)           lines.push(`• Email: ${i.email}`);
    if (i.address)         lines.push(`• Адрес клиента: ${i.address}`);
    if (i.siteAddress)     lines.push(`• Адрес объекта: ${i.siteAddress}`);
    if (i.source)          lines.push(`• Источник: ${i.source}`);
    if (i.measurer)        lines.push(`• Замерщик: ${i.measurer}`);
    if (i.designer)        lines.push(`• Дизайнер: ${i.designer}`);
    if (i.notes)           lines.push(`• Заметка: ${i.notes}`);
    return lines.join('\n');
  },
  execute: async (ctx, i) => {
    const id = newId('D');
    // Map AI source string to the icon used in the UI (phone is default).
    const sourceLower = String(i.source || '').toLowerCase();
    const icon =
      sourceLower.includes('instagram') ? 'instagram' :
      sourceLower.includes('whatsapp')  ? 'whatsapp'  :
      sourceLower.includes('telegram')  ? 'telegram'  :
      sourceLower.includes('tiktok')    ? 'tiktok'    :
      sourceLower.includes('email')     ? 'email'     :
                                          'phone';
    const data = {
      id,
      customerName:    i.customerName,
      phone:           i.phone           || '',
      email:           i.email           || '',
      address:         i.address         || '',
      siteAddress:     i.siteAddress     || '',
      product:         i.product         || '',
      furnitureType:   i.furnitureType   || '',
      materials:       i.materials       || '',
      amount:          Number(i.amount)     || 0,
      paidAmount:      Number(i.paidAmount) || 0,
      status:          'new',
      icon,
      priority:        'medium',
      date:            new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
      progress:        5,
      source:          i.source          || '',
      measurer:        i.measurer        || '',
      designer:        i.designer        || '',
      measurementDate: '', completionDate: '', installationDate: '',
      paymentMethods:  {},
      notes:           i.notes           || '',
      workType:        'furniture',
      createdAt:       new Date().toISOString(),
    };
    ctx.db.prepare('INSERT INTO deals (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(id, ctx.userId, ctx.teamId, JSON.stringify(data));
    ctx.logActivity(ctx.userId, {
      user: 'AI-ассистент', actor: 'ai',
      action: `Создал сделку (по запросу ${ctx.userName})`,
      target: `${i.customerName} — ${fmtKZT(i.amount || 0)}`,
      type: 'create', page: 'sales',
    });
    return `Сделка <b>${i.customerName}</b> на ${fmtKZT(i.amount || 0)} создана. Открыть → Заказы.`;
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
    const r = findDealByCustomer(ctx.db, ctx.teamId, String(i.customerName));
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
    patchDeal(ctx.db, ctx.teamId, d.id, { paidAmount: nextPaid });
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
    const r = findDealByCustomer(ctx.db, ctx.teamId, String(i.customerName));
    if (!r.single && !r.multiple) throw new Error(`сделка по «${i.customerName}» не найдена`);
    if (r.multiple) {
      const names = r.multiple.slice(0, 5).map(d => `«${d.data.customerName}»`).join(', ');
      throw new Error(`нашёл несколько сделок: ${names}. Уточните вручную.`);
    }
    const d = r.single!;
    const prev = d.data.status;
    const meta = STATUS_MAP[i.status] || { code: i.status, label: i.status };
    patchDeal(ctx.db, ctx.teamId, d.id, { status: meta.code });
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

// ─── update_deal ──────────────────────────────────────────────────
// Fill arbitrary fields on a deal — phone / address / materials / etc.
// updateDealStatus only flips the «status» column; this tool covers
// every other detail the user might add later via «обнови карточку,
// телефон такой-то, адрес такой-то».
const updateDeal: ToolDef = {
  module: 'sales',
  description:
    'Обновить поля карточки клиента (телефон, адрес, материалы, сумма и т.п.). ' +
    'ВЫЗЫВАЙ когда админ говорит "добавь телефон / адрес / материалы / сумму к карточке X". ' +
    'НЕ ВЫЗЫВАЙ для смены статуса — для этого есть update_deal_status. ' +
    'Если поле не указано — не передавай его (не перезаписывай пустотой).',
  input_schema: {
    type: 'object',
    properties: {
      customerName:    { type: 'string', description: 'Имя клиента или его часть для поиска сделки.' },
      phone:           { type: 'string', description: 'Телефон клиента, любой формат. Опционально.' },
      email:           { type: 'string', description: 'Email клиента. Опционально.' },
      address:         { type: 'string', description: 'Адрес клиента (для договора). Опционально.' },
      siteAddress:     { type: 'string', description: 'Адрес объекта/стройки (куда выезжает прораб). Опционально.' },
      product:         { type: 'string', description: 'Название изделия / описание. Опционально.' },
      furnitureType:   { type: 'string', description: 'Тип мебели: Кухня, Шкаф-купе, Гардероб, Прихожая и т.п. Опционально.' },
      materials:       { type: 'string', description: 'Материалы: МДФ, ЛДСП, массив, шпон, пластик, и т.п. Опционально.' },
      amount:          { type: 'number', description: 'Сумма сделки в тенге. Опционально.' },
      source:          { type: 'string', description: 'Источник: Instagram, WhatsApp, Telegram, Сайт, Рекомендация и т.п. Опционально.' },
      measurer:        { type: 'string', description: 'Имя замерщика. Опционально.' },
      designer:        { type: 'string', description: 'Имя дизайнера. Опционально.' },
      measurementDate: { type: 'string', description: 'Дата замера в формате YYYY-MM-DD. Опционально.' },
      completionDate:  { type: 'string', description: 'Дата готовности YYYY-MM-DD. Опционально.' },
      installationDate:{ type: 'string', description: 'Дата установки YYYY-MM-DD. Опционально.' },
      notes:           { type: 'string', description: 'Заметки менеджера. Опционально.' },
    },
    required: ['customerName'],
  },
  summarize: (i) => {
    const FIELD_LABELS: Record<string, string> = {
      phone: 'Телефон', email: 'Email', address: 'Адрес клиента', siteAddress: 'Адрес объекта',
      product: 'Изделие', furnitureType: 'Тип мебели', materials: 'Материалы', amount: 'Сумма',
      source: 'Источник', measurer: 'Замерщик', designer: 'Дизайнер',
      measurementDate: 'Дата замера', completionDate: 'Готовность', installationDate: 'Установка',
      notes: 'Заметки',
    };
    const changes = Object.keys(i).filter(k => k !== 'customerName' && i[k] != null && i[k] !== '');
    if (changes.length === 0) {
      return `<b>Обновляю карточку:</b> <b>${i.customerName}</b> — но ни одно поле не указано.`;
    }
    const lines = [`<b>Обновляю карточку клиента:</b> <b>${i.customerName}</b>`];
    for (const k of changes) {
      const v = k === 'amount' ? `${Number(i[k]).toLocaleString('ru-RU')} ₸` : i[k];
      lines.push(`• ${FIELD_LABELS[k] || k}: ${v}`);
    }
    return lines.join('\n');
  },
  execute: async (ctx, i) => {
    const r = findDealByCustomer(ctx.db, ctx.teamId, String(i.customerName));
    if (!r.single && !r.multiple) throw new Error(`сделка по «${i.customerName}» не найдена`);
    if (r.multiple) {
      const names = r.multiple.slice(0, 5).map(d => `«${d.data.customerName}»`).join(', ');
      throw new Error(`нашёл несколько сделок: ${names}. Уточните вручную.`);
    }
    const d = r.single!;
    // Build the patch from only the non-empty fields the model sent.
    // Skip customerName (it's the search key, not a field to update).
    const patch: Record<string, any> = {};
    const allowed = ['phone','email','address','siteAddress','product','furnitureType','materials','amount','source','measurer','designer','measurementDate','completionDate','installationDate','notes'];
    for (const k of allowed) {
      if (i[k] != null && i[k] !== '') patch[k] = i[k];
    }
    if (Object.keys(patch).length === 0) {
      throw new Error('не указано ни одного поля для обновления');
    }
    patchDeal(ctx.db, ctx.teamId, d.id, patch);
    const changed = Object.keys(patch).join(', ');
    ctx.logActivity(ctx.userId, {
      user: 'AI-ассистент', actor: 'ai',
      action: `Обновил карточку (по запросу ${ctx.userName}): ${changed}`,
      target: d.data.customerName,
      type: 'update', page: 'sales',
    });
    return `Карточка <b>${d.data.customerName}</b> обновлена. Поля: ${changed}.`;
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
    ctx.db.prepare('INSERT INTO tasks (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(id, ctx.userId, ctx.teamId, JSON.stringify(data));
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
    const r = findDealByCustomer(ctx.db, ctx.teamId, String(i.query));
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

// ─── add_product (warehouse material) ─────────────────────────────
// Used when the company dumps its material catalog to the bot:
// «ЛДСП белая 100 листов 8000₸ поставщик Корпус». Status is auto-set
// from quantity (instock / low / outofstock) so the warehouse banner
// works immediately. If the supplier name matches an existing
// supplier row, we don't link by id — the warehouse UI joins by name.
const addProduct: ToolDef = {
  module: 'warehouse',
  description:
    'Добавить материал на склад. ВЫЗЫВАЙ когда админ говорит "заведи материал", "добавь на склад", ' +
    '"оприходовать", "у нас есть X листов МДФ", "закупили N". Категория — Плиты / Фурнитура / ' +
    'Кромка / Краска / Стекло / Электрика / Прочее.',
  input_schema: {
    type: 'object',
    properties: {
      name:     { type: 'string', description: 'Название материала. Обязательно.' },
      category: { type: 'string', description: 'Категория: Плиты, Фурнитура, Кромка, Краска, Стекло, Электрика, Прочее.' },
      quantity: { type: 'number', description: 'Текущий остаток. 0 если ничего нет.' },
      unit:     { type: 'string', description: 'Единица: лист, шт, м, пара, кг, и т.п.' },
      cost:     { type: 'number', description: 'Цена за единицу в тенге.' },
      supplier: { type: 'string', description: 'Поставщик (свободный текст, не id). Опционально.' },
      minQty:   { type: 'number', description: 'Минимальный остаток (при котором показывать «мало»). По умолчанию 10.' },
    },
    required: ['name'],
  },
  summarize: (i) => {
    const lines = [
      `<b>Записываю материал:</b>`,
      `• Название: <b>${i.name}</b>`,
    ];
    if (i.category)             lines.push(`• Категория: ${i.category}`);
    if (i.quantity != null)     lines.push(`• Кол-во: ${i.quantity} ${i.unit || ''}`);
    if (i.cost)                 lines.push(`• Цена: ${fmtKZT(i.cost)} / ${i.unit || 'ед.'}`);
    if (i.supplier)             lines.push(`• Поставщик: ${i.supplier}`);
    if (i.minQty != null)       lines.push(`• Мин. остаток: ${i.minQty}`);
    return lines.join('\n');
  },
  execute: async (ctx, i) => {
    const id = newId('p');
    const qty    = Number(i.quantity) || 0;
    const minQty = Number(i.minQty)   || 10;
    const status =
      qty === 0          ? 'outofstock' :
      qty < minQty       ? 'low'         :
                            'instock';
    const data = {
      id,
      name:     i.name,
      category: i.category || 'Прочее',
      quantity: qty,
      unit:     i.unit || 'шт',
      supplier: i.supplier || '',
      cost:     Number(i.cost) || 0,
      minQty,
      status,
    };
    ctx.db.prepare('INSERT INTO products (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(id, ctx.userId, ctx.teamId, JSON.stringify(data));
    ctx.logActivity(ctx.userId, {
      user: 'AI-ассистент', actor: 'ai',
      action: `Добавил материал (по запросу ${ctx.userName})`,
      target: `${i.name} · ${qty} ${i.unit || 'шт'}`,
      type: 'create', page: 'warehouse',
    });
    return `Материал <b>${i.name}</b> (${qty} ${i.unit || 'шт'}) добавлен на склад. Открыть → Производство → Склад.`;
  },
};

// ─── add_supplier ─────────────────────────────────────────────────
const addSupplier: ToolDef = {
  module: 'warehouse',
  description:
    'Добавить поставщика. ВЫЗЫВАЙ когда админ говорит "заведи поставщика", "новый поставщик", ' +
    '"у нас работает компания X". Категория — Плиты / Фурнитура / Кромка и т.п. Условия оплаты — ' +
    'предоплата / 50-50 / отсрочка 30 дней.',
  input_schema: {
    type: 'object',
    properties: {
      name:          { type: 'string', description: 'Название компании-поставщика. Обязательно.' },
      contactPerson: { type: 'string', description: 'ФИО контактного лица.' },
      phone:         { type: 'string', description: 'Телефон.' },
      email:         { type: 'string', description: 'Email.' },
      address:       { type: 'string', description: 'Адрес склада или офиса поставщика.' },
      category:      { type: 'string', description: 'Что поставляет: Плиты, Фурнитура, Кромка, Краска, и т.п.' },
      paymentTerms:  { type: 'string', description: 'Условия оплаты: предоплата, 50/50, отсрочка 30 дней.' },
      deliveryDays:  { type: 'number', description: 'Срок доставки в днях.' },
      rating:        { type: 'number', description: 'Рейтинг 1-5 (по опыту работы).' },
      notes:         { type: 'string', description: 'Заметки.' },
    },
    required: ['name'],
  },
  summarize: (i) => {
    const lines = [`<b>Записываю поставщика:</b>`, `• Название: <b>${i.name}</b>`];
    if (i.contactPerson) lines.push(`• Контакт: ${i.contactPerson}`);
    if (i.phone)         lines.push(`• Телефон: ${i.phone}`);
    if (i.email)         lines.push(`• Email: ${i.email}`);
    if (i.address)       lines.push(`• Адрес: ${i.address}`);
    if (i.category)      lines.push(`• Категория: ${i.category}`);
    if (i.paymentTerms)  lines.push(`• Оплата: ${i.paymentTerms}`);
    if (i.deliveryDays)  lines.push(`• Доставка: ${i.deliveryDays} дн.`);
    if (i.rating)        lines.push(`• Рейтинг: ${i.rating}/5`);
    return lines.join('\n');
  },
  execute: async (ctx, i) => {
    const id = 'sup_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    const data: any = {
      name:          i.name,
      contactPerson: i.contactPerson || '',
      phone:         i.phone         || '',
      email:         i.email         || '',
      address:       i.address       || '',
      category:      i.category      || '',
      paymentTerms:  i.paymentTerms  || '',
      deliveryDays:  Number(i.deliveryDays) || undefined,
      rating:        Number(i.rating)       || undefined,
      notes:         i.notes         || '',
    };
    ctx.db.prepare('INSERT INTO suppliers (id, team_id, data) VALUES (?, ?, ?)').run(id, ctx.teamId, JSON.stringify(data));
    ctx.logActivity(ctx.userId, {
      user: 'AI-ассистент', actor: 'ai',
      action: `Добавил поставщика (по запросу ${ctx.userName})`,
      target: i.name,
      type: 'create', page: 'warehouse',
    });
    return `Поставщик <b>${i.name}</b> добавлен. Открыть → Производство → Поставщики.`;
  },
};

// ─── add_employee ─────────────────────────────────────────────────
// Adds an employee record (not a user account — that requires
// invitation flow). Used to track who's on the team for assignment
// purposes: замерщик / дизайнер / прораб / архитектор / менеджер.
const addEmployee: ToolDef = {
  module: 'sales', // gated under sales since employees power deal-owner assignment
  description:
    'Добавить сотрудника в команду. ВЫЗЫВАЙ когда админ говорит "заведи замерщика X", ' +
    '"у нас работает дизайнер Y", "добавь прораба". Это запись о сотруднике без аккаунта — ' +
    'её можно использовать для назначения замерщика/дизайнера в сделке.',
  input_schema: {
    type: 'object',
    properties: {
      name:     { type: 'string', description: 'ФИО сотрудника. Обязательно.' },
      role:     { type: 'string', description: 'Должность: Замерщик / Дизайнер / Прораб / Архитектор / Менеджер / Сборщик / Установщик.' },
      phone:    { type: 'string', description: 'Телефон.' },
      email:    { type: 'string', description: 'Email.' },
      salary:   { type: 'number', description: 'Оклад в тенге (опционально).' },
    },
    required: ['name'],
  },
  summarize: (i) => {
    const lines = [`<b>Записываю сотрудника:</b>`, `• ФИО: <b>${i.name}</b>`];
    if (i.role)   lines.push(`• Должность: ${i.role}`);
    if (i.phone)  lines.push(`• Телефон: ${i.phone}`);
    if (i.email)  lines.push(`• Email: ${i.email}`);
    if (i.salary) lines.push(`• Оклад: ${fmtKZT(i.salary)}`);
    return lines.join('\n');
  },
  execute: async (ctx, i) => {
    const id = newId('e');
    const data = {
      id,
      name:     i.name,
      role:     i.role || 'Сотрудник',
      phone:    i.phone || '',
      email:    i.email || '',
      salary:   Number(i.salary) || 0,
      hireDate: new Date().toISOString().slice(0, 10),
    };
    ctx.db.prepare('INSERT INTO employees (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(id, ctx.userId, ctx.teamId, JSON.stringify(data));
    ctx.logActivity(ctx.userId, {
      user: 'AI-ассистент', actor: 'ai',
      action: `Добавил сотрудника (по запросу ${ctx.userName})`,
      target: `${i.name}${i.role ? ' · ' + i.role : ''}`,
      type: 'create', page: 'settings',
    });
    return `Сотрудник <b>${i.name}</b>${i.role ? ' (' + i.role + ')' : ''} добавлен. Открыть → Настройки → Сотрудники.`;
  },
};

// ─── add_finance_transaction ──────────────────────────────────────
// Manual income/expense not tied to a specific deal. Examples:
//   «Аренда офиса 200 000 ₸ за май»
//   «Зарплата команде 1.5 млн»
//   «Получили возврат от поставщика 50 000»
const addFinance: ToolDef = {
  module: 'finance',
  description:
    'Записать произвольную финансовую операцию (расход или доход), не привязанную к сделке. ' +
    'ВЫЗЫВАЙ когда админ говорит "потратили на аренду", "оплатили рекламу", "получили возврат", ' +
    '"зарплата за май". Для оплаты по сделке — используй log_payment.',
  input_schema: {
    type: 'object',
    properties: {
      type:        { type: 'string', enum: ['income', 'expense'], description: 'Тип: income (доход) | expense (расход).' },
      category:    { type: 'string', description: 'Категория: Аренда, Зарплаты, Реклама, Материалы, Транспорт, Налоги, Прочее.' },
      amount:      { type: 'number', description: 'Сумма в тенге. Обязательно.' },
      description: { type: 'string', description: 'Краткое описание операции.' },
      date:        { type: 'string', description: 'Дата YYYY-MM-DD. Если не указано — сегодня.' },
    },
    required: ['type', 'amount'],
  },
  summarize: (i) => {
    const lines = [
      `<b>Записываю ${i.type === 'income' ? 'доход' : 'расход'}:</b>`,
      `• Сумма: <b>${fmtKZT(i.amount)}</b>`,
    ];
    if (i.category)    lines.push(`• Категория: ${i.category}`);
    if (i.description) lines.push(`• Описание: ${i.description}`);
    lines.push(`• Дата: ${i.date || 'сегодня'}`);
    return lines.join('\n');
  },
  execute: async (ctx, i) => {
    const id = newId('f');
    const data = {
      id,
      type:        i.type,
      category:    i.category || 'Прочее',
      amount:      Number(i.amount) || 0,
      description: i.description || '',
      date:        i.date || new Date().toISOString().slice(0, 10),
      createdAt:   new Date().toISOString(),
    };
    ctx.db.prepare('INSERT INTO transactions (id, user_id, team_id, data) VALUES (?, ?, ?, ?)').run(id, ctx.userId, ctx.teamId, JSON.stringify(data));
    ctx.logActivity(ctx.userId, {
      user: 'AI-ассистент', actor: 'ai',
      action: `Записал ${i.type === 'income' ? 'доход' : 'расход'} (по запросу ${ctx.userName})`,
      target: `${i.category || 'Прочее'} — ${fmtKZT(i.amount)}`,
      type: 'create', page: 'finance',
    });
    return `${i.type === 'income' ? 'Доход' : 'Расход'} <b>${fmtKZT(i.amount)}</b> (${i.category || 'Прочее'}) записан. Открыть → Финансы.`;
  },
};

// ─── bulk_add_deals ───────────────────────────────────────────────
// Bulk import path: company dumps a list of clients in one Telegram
// message ("Айдар +7..., 500к; Мадина 800к...") — without this tool
// the AI would propose 50 individual cards. bulk_add_deals creates
// them all in one transaction and returns a digest.
const bulkAddDeals: ToolDef = {
  module: 'sales',
  description:
    'МАССОВО создать сделки из списка клиентов. ВЫЗЫВАЙ когда админ присылает 3+ клиентов одним ' +
    'сообщением или говорит "вот все наши клиенты", "импортируй список". Для одного клиента — ' +
    'используй add_deal. Каждый элемент массива — отдельная сделка с теми же полями.',
  input_schema: {
    type: 'object',
    properties: {
      deals: {
        type: 'array',
        description: 'Массив сделок. Минимум 2, максимум 50.',
        items: {
          type: 'object',
          properties: {
            customerName:  { type: 'string' },
            product:       { type: 'string' },
            amount:        { type: 'number' },
            paidAmount:    { type: 'number' },
            phone:         { type: 'string' },
            email:         { type: 'string' },
            address:       { type: 'string' },
            siteAddress:   { type: 'string' },
            furnitureType: { type: 'string' },
            materials:     { type: 'string' },
            source:        { type: 'string' },
            status:        { type: 'string', description: 'Статус: new / measured / project / production / installation / completed.' },
            notes:         { type: 'string' },
          },
          required: ['customerName'],
        },
      },
    },
    required: ['deals'],
  },
  summarize: (i) => {
    const arr: any[] = i.deals || [];
    const total = arr.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const lines = [
      `<b>Массовый импорт сделок:</b> ${arr.length}`,
      `• Общая сумма: <b>${fmtKZT(total)}</b>`,
      ``,
    ];
    arr.slice(0, 8).forEach((d, idx) => {
      lines.push(`${idx + 1}. ${d.customerName}${d.amount ? ' — ' + fmtKZT(d.amount) : ''}${d.status ? ' · ' + d.status : ''}`);
    });
    if (arr.length > 8) lines.push(`… и ещё ${arr.length - 8}`);
    return lines.join('\n');
  },
  execute: async (ctx, i) => {
    const arr: any[] = i.deals || [];
    if (arr.length === 0) throw new Error('пустой список сделок');
    if (arr.length > 50)  throw new Error('за раз можно создать не более 50 сделок');
    const insert = ctx.db.prepare('INSERT INTO deals (id, user_id, team_id, data) VALUES (?, ?, ?, ?)');
    const tx = ctx.db.transaction((items: any[]) => {
      for (const d of items) {
        const id = newId('D');
        const sourceLower = String(d.source || '').toLowerCase();
        const icon =
          sourceLower.includes('instagram') ? 'instagram' :
          sourceLower.includes('whatsapp')  ? 'whatsapp'  :
          sourceLower.includes('telegram')  ? 'telegram'  :
          sourceLower.includes('tiktok')    ? 'tiktok'    :
          sourceLower.includes('email')     ? 'email'     :
                                              'phone';
        const status = STATUS_MAP[d.status]?.code || 'new';
        const data = {
          id,
          customerName:    d.customerName,
          phone:           d.phone           || '',
          email:           d.email           || '',
          address:         d.address         || '',
          siteAddress:     d.siteAddress     || '',
          product:         d.product         || '',
          furnitureType:   d.furnitureType   || '',
          materials:       d.materials       || '',
          amount:          Number(d.amount)     || 0,
          paidAmount:      Number(d.paidAmount) || 0,
          status,
          icon,
          priority:        'medium',
          date:            new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
          progress:        status === 'completed' ? 100 : status === 'installation' ? 80 : status === 'production' ? 60 : 5,
          source:          d.source          || '',
          measurer:        '',
          designer:        '',
          measurementDate: '', completionDate: '', installationDate: '',
          paymentMethods:  {},
          notes:           d.notes           || '',
          workType:        'furniture',
          createdAt:       new Date().toISOString(),
        };
        insert.run(id, ctx.userId, ctx.teamId, JSON.stringify(data));
      }
    });
    tx(arr);
    const total = arr.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    ctx.logActivity(ctx.userId, {
      user: 'AI-ассистент', actor: 'ai',
      action: `Массовый импорт сделок (по запросу ${ctx.userName})`,
      target: `${arr.length} шт., на сумму ${fmtKZT(total)}`,
      type: 'create', page: 'sales',
    });
    return `Создано <b>${arr.length}</b> сделок на сумму <b>${fmtKZT(total)}</b>. Открыть → Заказы.`;
  },
};

// ─── Registry + public API ────────────────────────────────────────
const TOOLS: Record<string, ToolDef> = {
  add_deal:           addDeal,
  bulk_add_deals:     bulkAddDeals,
  log_payment:        logPayment,
  update_deal_status: updateDealStatus,
  update_deal:        updateDeal,
  add_task:           addTask,
  add_product:        addProduct,
  add_supplier:       addSupplier,
  add_employee:       addEmployee,
  add_finance:        addFinance,
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

async function execute(
  db: Database.Database,
  userId: string,
  teamId: string,
  userName: string,
  toolName: string,
  input: any,
  logActivity: (userId: string, entry: any) => void,
): Promise<string> {
  const t = TOOLS[toolName];
  if (!t) throw new Error(`unknown tool: ${toolName}`);
  return t.execute({ db, userId, teamId, userName, logActivity }, input);
}

export default { toolsForClaude, isReadOnly, getToolModule, summarize, execute };
