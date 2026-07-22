// ─── Демо-данные одной кнопкой ────────────────────────────────────────
// Заполняет команду реалистичными данными мебельного бизнеса (Казахстан),
// чтобы показывать клиентам живую платформу, а не пустые экраны. Каждая
// запись получает id с префиксом `demo-` и флаг `_demo:true` в блобе —
// поэтому очистка удаляет ТОЛЬКО демо-данные и никогда не трогает
// реальные записи команды.
//
// Все таблицы (deals/transactions/products/tasks/employees) идут через
// generic-схему (id, user_id, team_id, data) — как makeCrud.

import type Database from 'better-sqlite3';

const DEMO_TABLES = ['deals', 'transactions', 'products', 'tasks', 'employees'] as const;
type DemoTable = typeof DEMO_TABLES[number];

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function daysAgo(n: number): Date { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(10, 0, 0, 0); return d; }

export interface DemoCounts { deals: number; transactions: number; products: number; tasks: number; employees: number; total: number }

export function demoStatus(db: Database.Database, teamId: string): DemoCounts {
  const count = (t: DemoTable) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE team_id = ? AND id LIKE 'demo-%'`).get(teamId) as any)?.n || 0;
  const c = { deals: count('deals'), transactions: count('transactions'), products: count('products'), tasks: count('tasks'), employees: count('employees') };
  return { ...c, total: c.deals + c.transactions + c.products + c.tasks + c.employees };
}

export function clearDemoData(db: Database.Database, teamId: string): DemoCounts {
  const before = demoStatus(db, teamId);
  const tx = db.transaction(() => {
    for (const t of DEMO_TABLES) db.prepare(`DELETE FROM ${t} WHERE team_id = ? AND id LIKE 'demo-%'`).run(teamId);
  });
  tx();
  return before;
}

export function seedDemoData(db: Database.Database, teamId: string, userId: string): DemoCounts {
  const insert = (table: DemoTable, id: string, data: Record<string, any>) =>
    db.prepare(`INSERT INTO ${table} (id, user_id, team_id, data) VALUES (?, ?, ?, ?)`)
      .run(id, userId, teamId, JSON.stringify({ ...data, id, _demo: true }));
  // id ДОЛЖЕН включать team_id: в этих таблицах `id` — единственный
  // первичный ключ, поэтому фиксированные `demo-d1` конфликтовали бы между
  // командами (вторая команда → UNIQUE constraint, весь сев откатывался).
  const rid = (key: string) => `demo-${teamId}-${key}`;

  const tx = db.transaction(() => {
    // Идемпотентность: пере-сев начинается с чистого листа демо-данных.
    for (const t of DEMO_TABLES) db.prepare(`DELETE FROM ${t} WHERE team_id = ? AND id LIKE 'demo-%'`).run(teamId);

    // ─── Сотрудники (3) — для аналитики команды и зарплатной ведомости ──
    const employees = [
      { key: 'emp-1', name: 'Айгүл Жұмабекова (демо)', email: 'demo.aigul@example.kz', phone: '+7 701 555 0101', role: 'employee', department: 'Дизайн', salary: 320000, commissionPct: 3, monthlyTarget: 3500000, perf: { ordersCompleted: 12, rating: 4.8, efficiency: 92 } },
      { key: 'emp-2', name: 'Данияр Оспанов (демо)', email: 'demo.daniyar@example.kz', phone: '+7 702 555 0102', role: 'employee', department: 'Замер', salary: 280000, commissionPct: 2, monthlyTarget: 2500000, perf: { ordersCompleted: 18, rating: 4.6, efficiency: 88 } },
      { key: 'emp-3', name: 'Ерлан Серіков (демо)', email: 'demo.erlan@example.kz', phone: '+7 705 555 0103', role: 'employee', department: 'Монтаж', salary: 300000, commissionPct: 2.5, monthlyTarget: 0, perf: { ordersCompleted: 15, rating: 4.9, efficiency: 95 } },
    ];
    for (const e of employees) {
      insert('employees', rid(e.key), {
        name: e.name, email: e.email, phone: e.phone, role: e.role, department: e.department,
        status: 'active', salary: e.salary, joinDate: ymd(daysAgo(220)), lastActive: ymd(daysAgo(1)),
        avatar: e.name.slice(0, 2), commissionPct: e.commissionPct, monthlyTarget: e.monthlyTarget,
        permissions: { sales: true, finance: false, warehouse: true, chats: true, analytics: false, settings: false },
        performance: e.perf,
      });
    }
    const OWNER = { design: rid('emp-1'), measure: rid('emp-2'), install: rid('emp-3') };

    // ─── Сделки (14) — вся воронка, реальные суммы в ₸ ──────────────────
    // [key, клиент, телефон, продукт, сумма, оплачено, статус, источник, дней_назад_создан, owner, extra]
    const deals: Array<[string, string, string, string, number, number, string, string, number, string, Record<string, any>]> = [
      ['d1', 'Асель Нурланова', '+7 701 234 5670', 'Кухня «Модерн» под потолок', 1850000, 0, 'new', 'Instagram', 2, OWNER.design, { campaign: 'Акция кухни', nextActionAt: ymd(daysAgo(-1)), nextActionNote: 'Согласовать замер' }],
      ['d2', 'Марат Әбдіров', '+7 702 345 6781', 'Шкаф-купе 3-дверный', 480000, 0, 'new', 'WhatsApp', 1, OWNER.design, { nextActionAt: ymd(daysAgo(0)), nextActionNote: 'Перезвонить' }],
      ['d3', 'Гүлнар Сейтова', '+7 705 456 7892', 'Кухня угловая + остров', 2350000, 500000, 'measured', '2GIS', 8, OWNER.measure, { measurementDate: ymd(daysAgo(3)) }],
      ['d4', 'Ержан Қасымов', '+7 707 567 8903', 'Прихожая на заказ', 320000, 100000, 'project-agreed', 'Сарафан', 12, OWNER.design, { referrerName: 'Асель Нурланова', measurementDate: ymd(daysAgo(9)) }],
      ['d5', 'Динара Оспанова', '+7 701 678 9014', 'Кухня «Классик» с фасадами МДФ', 1650000, 800000, 'contract', 'Instagram', 18, OWNER.design, { measurementDate: ymd(daysAgo(15)), completionDate: ymd(daysAgo(-14)) }],
      ['d6', 'Тимур Ахметов', '+7 702 789 0125', 'Гардеробная система', 720000, 360000, 'production', 'Instagram', 24, OWNER.measure, { measurementDate: ymd(daysAgo(21)), completionDate: ymd(daysAgo(-7)), bomTemplateId: '' }],
      ['d7', 'Сауле Жаксылык', '+7 705 890 1236', 'Кухня прямая 3.2м', 1280000, 640000, 'manufacturing', 'WhatsApp', 28, OWNER.design, { measurementDate: ymd(daysAgo(25)), completionDate: ymd(daysAgo(-5)) }],
      ['d8', 'Бауыржан Сүлейменов', '+7 707 901 2347', 'Шкаф + комод в спальню', 560000, 560000, 'assembly', 'Сарафан', 32, OWNER.measure, { referrerName: 'Тимур Ахметов', measurementDate: ymd(daysAgo(29)), completionDate: ymd(daysAgo(-2)) }],
      ['d9', 'Айдана Мұратқызы', '+7 701 012 3458', 'Кухня «Лофт» с барной стойкой', 1950000, 975000, 'installation', 'Instagram', 40, OWNER.install, { measurementDate: ymd(daysAgo(37)), completionDate: ymd(daysAgo(-1)) }],
      ['d10', 'Нұрлан Байжанов', '+7 702 123 4569', 'Кухня + пенал', 1450000, 1450000, 'completed', 'WhatsApp', 55, OWNER.design, { measurementDate: ymd(daysAgo(52)), installationDate: ymd(daysAgo(10)), completionDate: ymd(daysAgo(10)), review: { rating: 5, text: 'Отличная работа, всё точно в срок!', at: daysAgo(9).toISOString() } }],
      ['d11', 'Жанна Ілиясова', '+7 705 234 5670', 'Шкаф-купе в прихожую', 420000, 420000, 'completed', 'Instagram', 68, OWNER.measure, { measurementDate: ymd(daysAgo(64)), installationDate: ymd(daysAgo(20)), completionDate: ymd(daysAgo(20)), review: { rating: 5, text: 'Аккуратно, качественно. Рекомендую.', at: daysAgo(18).toISOString() } }],
      ['d12', 'Қайрат Тұрсынов', '+7 707 345 6781', 'Кухня «Скандинавия»', 1720000, 1720000, 'completed', 'Сарафан', 82, OWNER.design, { referrerName: 'Нұрлан Байжанов', measurementDate: ymd(daysAgo(78)), installationDate: ymd(daysAgo(35)), completionDate: ymd(daysAgo(35)), review: { rating: 4, text: 'Хорошо, но были небольшие задержки.', at: daysAgo(33).toISOString() } }],
      ['d13', 'Мадина Ерболатова', '+7 701 456 7892', 'Кухня эконом 2.4м', 780000, 0, 'rejected', 'WhatsApp', 20, OWNER.design, { lostReason: 'Дорого — выбрал дешевле' }],
      ['d14', 'Серік Оразбаев', '+7 702 567 8903', 'Гардеробная премиум', 1350000, 0, 'rejected', 'Instagram', 34, OWNER.measure, { lostReason: 'Передумал / отложил ремонт' }],
    ];
    const ACTIVE_MEASURED = new Set(['measured', 'project-agreed', 'contract', 'production', 'manufacturing', 'assembly', 'installation', 'completed']);
    for (const [key, name, phone, product, amount, paid, status, source, createdDaysAgo, ownerId, extra] of deals) {
      const created = daysAgo(createdDaysAgo);
      const progress = status === 'completed' ? 100 : status === 'installation' ? 90 : status === 'assembly' ? 75 : status === 'manufacturing' ? 60 : status === 'production' ? 45 : status === 'contract' ? 30 : status === 'project-agreed' ? 20 : status === 'measured' ? 12 : status === 'rejected' ? 0 : 5;
      insert('deals', rid(key), {
        customerName: name, phone, address: 'г. Алматы', siteAddress: 'г. Алматы',
        product, furnitureType: product.includes('Кухня') ? 'Кухня' : product.includes('Шкаф') || product.includes('Гардероб') ? 'Шкаф' : 'Мебель',
        amount, paidAmount: paid, status, icon: source === 'Instagram' ? 'instagram' : source === 'WhatsApp' ? 'whatsapp' : 'phone',
        priority: amount > 1500000 ? 'high' : amount > 700000 ? 'medium' : 'low',
        date: ymd(created), createdAt: created.toISOString(), progress, source,
        measurer: 'Данияр Оспанов (демо)', designer: 'Айгүл Жұмабекова (демо)', materials: '',
        measurementDate: '', completionDate: '', installationDate: '',
        paymentMethods: {}, notes: '', ownerId, niche: 'furniture',
        firstContactAt: status !== 'new' ? new Date(created.getTime() + 2 * 3600 * 1000).toISOString() : undefined,
        ...extra,
      });

      // Приход по сделкам (предоплата/оплата) — привязан к сделке.
      if (paid > 0) {
        const payDate = ACTIVE_MEASURED.has(status) ? daysAgo(createdDaysAgo - 2) : created;
        insert('transactions', rid(`tx-in-${key}`), {
          type: 'income', category: 'Оплата заказа', amount: paid, date: ymd(payDate),
          description: `${status === 'completed' ? 'Оплата' : 'Предоплата'} · ${name}`,
          dealId: rid(key), status: 'completed', account: 'kaspi',
        });
      }
    }

    // ─── Расходы (материалы, зарплата, аренда, налоги, маркетинг) ───────
    const expenses: Array<[string, string, number, number, string, Record<string, any>]> = [
      ['ex-mat-1', 'Материалы', 620000, 50, 'ЛДСП Egger + кромка (партия)', { account: 'bank' }],
      ['ex-mat-2', 'Материалы', 385000, 38, 'Фурнитура Blum (петли, направляющие)', { account: 'bank' }],
      ['ex-mat-3', 'Материалы', 240000, 20, 'Столешницы + мойки', { account: 'kaspi' }],
      ['ex-sal-1', 'Зарплата', 900000, 30, 'Зарплата цеха (месяц)', { account: 'bank' }],
      ['ex-sal-2', 'Зарплата', 900000, 60, 'Зарплата цеха (месяц)', { account: 'bank' }],
      ['ex-rent-1', 'Аренда', 350000, 28, 'Аренда цеха + шоурум', { account: 'bank' }],
      ['ex-rent-2', 'Аренда', 350000, 58, 'Аренда цеха + шоурум', { account: 'bank' }],
      ['ex-tax-1', 'Налоги', 180000, 25, 'Налоги и отчисления', { account: 'bank' }],
      ['ex-mkt-1', 'Маркетинг', 220000, 15, 'Таргет Instagram', { account: 'kaspi', adChannel: 'Instagram' }],
      ['ex-mkt-2', 'Маркетинг', 90000, 12, 'Реклама WhatsApp / рассылки', { account: 'kaspi', adChannel: 'WhatsApp' }],
    ];
    for (const [key, category, amount, dAgo, description, extra] of expenses) {
      insert('transactions', rid(key), {
        type: 'expense', category, amount, date: ymd(daysAgo(dAgo)), description, status: 'completed', ...extra,
      });
    }

    // ─── Склад (12 позиций) — с низкими остатками для алёртов ───────────
    const products: Array<[string, string, string, number, string, number, number, string]> = [
      ['p1', 'ЛДСП Egger белый 18мм', 'Плита', 42, 'лист', 8500, 15, 'instock'],
      ['p2', 'ЛДСП Egger дуб сонома 18мм', 'Плита', 8, 'лист', 9200, 15, 'low'],
      ['p3', 'МДФ фасад крашеный', 'Фасады', 24, 'шт', 12000, 10, 'instock'],
      ['p4', 'Кромка ПВХ 2мм белая', 'Кромка', 3, 'рулон', 6500, 5, 'low'],
      ['p5', 'Петли Blum Clip-top', 'Фурнитура', 320, 'шт', 850, 100, 'instock'],
      ['p6', 'Направляющие Blum Tandembox', 'Фурнитура', 0, 'компл', 4200, 20, 'outofstock'],
      ['p7', 'Столешница ЛДСП постформинг', 'Столешницы', 14, 'шт', 15000, 6, 'instock'],
      ['p8', 'Ручки мебельные (алюминий)', 'Фурнитура', 180, 'шт', 1200, 50, 'instock'],
      ['p9', 'Мойка нержавейка врезная', 'Сантехника', 6, 'шт', 18000, 4, 'instock'],
      ['p10', 'Подъёмник Aventos', 'Фурнитура', 2, 'компл', 22000, 8, 'low'],
      ['p11', 'Стекло матовое для фасадов', 'Стекло', 11, 'м²', 9500, 5, 'instock'],
      ['p12', 'Конфирмат + заглушки', 'Крепёж', 0, 'упак', 3500, 10, 'outofstock'],
    ];
    for (const [key, name, category, quantity, unit, cost, minQty, status] of products) {
      insert('products', rid(key), {
        name, category, quantity, unit, supplier: 'ТОО «Мебель-Снаб»', cost, status, minQty, niche: 'furniture',
      });
    }

    // ─── Задачи (6) — по разным статусам, привязаны к сделкам ───────────
    // Последнее поле — key связанной сделки ('d1') или '' если нет.
    const tasks: Array<[string, string, string, string, string, string, number, string]> = [
      ['t1', 'Позвонить и назначить замер', 'Асель Нурланова — кухня «Модерн»', 'new', 'high', 'Продажи', 0, 'd1'],
      ['t2', 'Согласовать проект с клиентом', 'Ержан Қасымов — прихожая', 'in_progress', 'medium', 'Дизайн', -1, 'd4'],
      ['t3', 'Закупить направляющие Blum', 'Закончились на складе', 'new', 'urgent', 'Снабжение', 0, ''],
      ['t4', 'Распил ЛДСП по заказу', 'Сауле Жаксылык — кухня 3.2м', 'in_progress', 'high', 'Производство', 1, 'd7'],
      ['t5', 'Выехать на монтаж', 'Айдана Мұратқызы — кухня «Лофт»', 'review', 'high', 'Монтаж', -1, 'd9'],
      ['t6', 'Взять отзыв у клиента', 'Нұрлан Байжанов — заказ завершён', 'done', 'low', 'Продажи', 8, 'd10'],
    ];
    for (const [key, title, description, status, priority, category, dueOffset, dealKey] of tasks) {
      const due = daysAgo(-dueOffset); // dueOffset>0 → в прошлом (просрочено/сделано)
      insert('tasks', rid(key), {
        title, description, status, priority,
        assigneeId: category === 'Монтаж' ? OWNER.install : category === 'Дизайн' || category === 'Продажи' ? OWNER.design : OWNER.measure,
        createdAt: daysAgo(3).toISOString(), dueDate: ymd(due),
        completedAt: status === 'done' ? daysAgo(dueOffset).toISOString() : undefined,
        category, subtasks: [], linkedDealId: dealKey ? rid(dealKey) : undefined,
      });
    }
  });
  tx();
  return demoStatus(db, teamId);
}
