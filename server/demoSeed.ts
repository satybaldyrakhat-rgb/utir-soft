// ─── Демо-данные команды ──────────────────────────────────────────────
// Наполняет пустой аккаунт связным срезом работы за ~3 месяца: сделки по
// всей воронке, платежи и расходы под них, склад с низкими остатками,
// сотрудники и задачи. Нужно, чтобы показать платформу клиенту на живых
// экранах, а не на пустых таблицах.
//
// Все таблицы (deals/transactions/products/tasks/employees) идут через
// общий insert со скоупом по team_id, а id получают префикс demo_ —
// поэтому очистка сносит ровно демо и не трогает настоящие данные.
//
// Профили (preset) — под нишу компании: кухни/шкафы или двери/лестницы.
// Профиль выбирают в Настройки → Основные → Демо-данные.

import type Database from 'better-sqlite3';

const DEMO_TABLES = ['deals', 'transactions', 'products', 'tasks', 'employees'] as const;
const PREFIX = 'demo_';

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function daysAgo(n: number): Date { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(10, 0, 0, 0); return d; }

export type DemoPreset = 'furniture' | 'doors';
export function isDemoPreset(v: unknown): v is DemoPreset { return v === 'furniture' || v === 'doors'; }

export interface DemoCounts { deals: number; transactions: number; products: number; tasks: number; employees: number; total: number }

export function demoStatus(db: Database.Database, teamId: string): DemoCounts {
  const count = (t: string) =>
    (db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE team_id = ? AND id LIKE '${PREFIX}%'`).get(teamId) as any).c as number;
  const c = { deals: count('deals'), transactions: count('transactions'), products: count('products'), tasks: count('tasks'), employees: count('employees') };
  return { ...c, total: c.deals + c.transactions + c.products + c.tasks + c.employees };
}

export function clearDemoData(db: Database.Database, teamId: string): DemoCounts {
  const before = demoStatus(db, teamId);
  const tx = db.transaction(() => {
    for (const t of DEMO_TABLES) db.prepare(`DELETE FROM ${t} WHERE team_id = ? AND id LIKE '${PREFIX}%'`).run(teamId);
  });
  tx();
  return before;
}

// ─── Наборы данных по нишам ───────────────────────────────────────────
type EmployeeRow = { key: string; name: string; email: string; phone: string; role: string; department: string; salary: number; commissionPct: number; monthlyTarget: number; perf: { ordersCompleted: number; rating: number; efficiency: number } };
type DealRow = [string, string, string, string, number, number, string, string, number, 'design' | 'measure' | 'install', Record<string, any>];
type ExpenseRow = [string, string, number, number, string, Record<string, any>];
type ProductRow = [string, string, string, number, string, number, number, string];
type TaskRow = [string, string, string, string, string, string, number, string];

interface DemoSet {
  city: string;
  niche: string;
  supplier: string;
  employees: EmployeeRow[];
  deals: DealRow[];
  expenses: ExpenseRow[];
  products: ProductRow[];
  tasks: TaskRow[];
}

// ── Кухни и шкафы (профиль по умолчанию) ──────────────────────────────
const FURNITURE: DemoSet = {
  city: 'г. Алматы',
  niche: 'furniture',
  supplier: 'ТОО «Мебель-Снаб»',
  employees: [
    { key: 'emp-1', name: 'Айгүл Жұмабекова (демо)', email: 'demo.aigul@example.kz', phone: '+7 701 555 0101', role: 'employee', department: 'Дизайн', salary: 320000, commissionPct: 3, monthlyTarget: 3500000, perf: { ordersCompleted: 12, rating: 4.8, efficiency: 92 } },
    { key: 'emp-2', name: 'Данияр Оспанов (демо)', email: 'demo.daniyar@example.kz', phone: '+7 702 555 0102', role: 'employee', department: 'Замер', salary: 280000, commissionPct: 2, monthlyTarget: 2500000, perf: { ordersCompleted: 18, rating: 4.6, efficiency: 88 } },
    { key: 'emp-3', name: 'Ерлан Серіков (демо)', email: 'demo.erlan@example.kz', phone: '+7 705 555 0103', role: 'employee', department: 'Монтаж', salary: 300000, commissionPct: 2.5, monthlyTarget: 0, perf: { ordersCompleted: 15, rating: 4.9, efficiency: 95 } },
  ],
  deals: [
    ['d1', 'Асель Нурланова', '+7 701 234 5670', 'Кухня «Модерн» под потолок', 1850000, 0, 'new', 'Instagram', 2, 'design', { campaign: 'Акция кухни', nextActionAt: ymd(daysAgo(-1)), nextActionNote: 'Согласовать замер' }],
    ['d2', 'Марат Әбдіров', '+7 702 345 6781', 'Шкаф-купе 3-дверный', 480000, 0, 'new', 'WhatsApp', 1, 'design', { nextActionAt: ymd(daysAgo(0)), nextActionNote: 'Перезвонить' }],
    ['d3', 'Гүлнар Сейтова', '+7 705 456 7892', 'Кухня угловая + остров', 2350000, 500000, 'measured', '2GIS', 8, 'measure', { measurementDate: ymd(daysAgo(3)) }],
    ['d4', 'Ержан Қасымов', '+7 707 567 8903', 'Прихожая на заказ', 320000, 100000, 'project-agreed', 'Сарафан', 12, 'design', { referrerName: 'Асель Нурланова', measurementDate: ymd(daysAgo(9)) }],
    ['d5', 'Динара Оспанова', '+7 701 678 9014', 'Кухня «Классик» с фасадами МДФ', 1650000, 800000, 'contract', 'Instagram', 18, 'design', { measurementDate: ymd(daysAgo(15)), completionDate: ymd(daysAgo(-14)) }],
    ['d6', 'Тимур Ахметов', '+7 702 789 0125', 'Гардеробная система', 720000, 360000, 'production', 'Instagram', 24, 'measure', { measurementDate: ymd(daysAgo(21)), completionDate: ymd(daysAgo(-7)), bomTemplateId: '' }],
    ['d7', 'Сауле Жаксылык', '+7 705 890 1236', 'Кухня прямая 3.2м', 1280000, 640000, 'manufacturing', 'WhatsApp', 28, 'design', { measurementDate: ymd(daysAgo(25)), completionDate: ymd(daysAgo(-5)) }],
    ['d8', 'Бауыржан Сүлейменов', '+7 707 901 2347', 'Шкаф + комод в спальню', 560000, 560000, 'assembly', 'Сарафан', 32, 'measure', { referrerName: 'Тимур Ахметов', measurementDate: ymd(daysAgo(29)), completionDate: ymd(daysAgo(-2)) }],
    ['d9', 'Айдана Мұратқызы', '+7 701 012 3458', 'Кухня «Лофт» с барной стойкой', 1950000, 975000, 'installation', 'Instagram', 40, 'install', { measurementDate: ymd(daysAgo(37)), completionDate: ymd(daysAgo(-1)) }],
    ['d10', 'Нұрлан Байжанов', '+7 702 123 4569', 'Кухня + пенал', 1450000, 1450000, 'completed', 'WhatsApp', 55, 'design', { measurementDate: ymd(daysAgo(52)), installationDate: ymd(daysAgo(10)), completionDate: ymd(daysAgo(10)), review: { rating: 5, text: 'Отличная работа, всё точно в срок!', at: daysAgo(9).toISOString() } }],
    ['d11', 'Жанна Ілиясова', '+7 705 234 5670', 'Шкаф-купе в прихожую', 420000, 420000, 'completed', 'Instagram', 68, 'measure', { measurementDate: ymd(daysAgo(64)), installationDate: ymd(daysAgo(20)), completionDate: ymd(daysAgo(20)), review: { rating: 5, text: 'Аккуратно, качественно. Рекомендую.', at: daysAgo(18).toISOString() } }],
    ['d12', 'Қайрат Тұрсынов', '+7 707 345 6781', 'Кухня «Скандинавия»', 1720000, 1720000, 'completed', 'Сарафан', 82, 'design', { referrerName: 'Нұрлан Байжанов', measurementDate: ymd(daysAgo(78)), installationDate: ymd(daysAgo(35)), completionDate: ymd(daysAgo(35)), review: { rating: 4, text: 'Хорошо, но были небольшие задержки.', at: daysAgo(33).toISOString() } }],
    ['d13', 'Мадина Ерболатова', '+7 701 456 7892', 'Кухня эконом 2.4м', 780000, 0, 'rejected', 'WhatsApp', 20, 'design', { lostReason: 'Дорого — выбрал дешевле' }],
    ['d14', 'Серік Оразбаев', '+7 702 567 8903', 'Гардеробная премиум', 1350000, 0, 'rejected', 'Instagram', 34, 'measure', { lostReason: 'Передумал / отложил ремонт' }],
  ],
  expenses: [
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
  ],
  products: [
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
  ],
  tasks: [
    ['t1', 'Позвонить и назначить замер', 'Асель Нурланова — кухня «Модерн»', 'new', 'high', 'Продажи', 0, 'd1'],
    ['t2', 'Согласовать проект с клиентом', 'Ержан Қасымов — прихожая', 'in_progress', 'medium', 'Дизайн', -1, 'd4'],
    ['t3', 'Закупить направляющие Blum', 'Закончились на складе', 'new', 'urgent', 'Снабжение', 0, ''],
    ['t4', 'Распил ЛДСП по заказу', 'Сауле Жаксылык — кухня 3.2м', 'in_progress', 'high', 'Производство', 1, 'd7'],
    ['t5', 'Выехать на монтаж', 'Айдана Мұратқызы — кухня «Лофт»', 'review', 'high', 'Монтаж', -1, 'd9'],
    ['t6', 'Взять отзыв у клиента', 'Нұрлан Байжанов — заказ завершён', 'done', 'low', 'Продажи', 8, 'd10'],
  ],
};

// ── Двери и лестницы (плюс корпусная мебель) ──────────────────────────
// Профиль для компаний вроде дверных/лестничных производств: крупные
// объектные заказы на двери соседствуют с частными лестницами и кухнями.
const DOORS: DemoSet = {
  city: 'г. Шымкент',
  niche: 'doors',
  supplier: 'ТОО «Сапа-Снаб»',
  employees: [
    { key: 'emp-1', name: 'Мөлдір Тасқынова (демо)', email: 'demo.moldir@example.kz', phone: '+7 701 555 0201', role: 'employee', department: 'Дизайн', salary: 340000, commissionPct: 3, monthlyTarget: 4000000, perf: { ordersCompleted: 14, rating: 4.9, efficiency: 94 } },
    { key: 'emp-2', name: 'Айдос Қуанышев (демо)', email: 'demo.aidos@example.kz', phone: '+7 702 555 0202', role: 'employee', department: 'Замер', salary: 300000, commissionPct: 2, monthlyTarget: 3000000, perf: { ordersCompleted: 21, rating: 4.7, efficiency: 90 } },
    { key: 'emp-3', name: 'Ержан Бекболат (демо)', email: 'demo.erzhan@example.kz', phone: '+7 705 555 0203', role: 'employee', department: 'Монтаж', salary: 320000, commissionPct: 2.5, monthlyTarget: 0, perf: { ordersCompleted: 17, rating: 4.8, efficiency: 93 } },
  ],
  deals: [
    ['d1', 'ЖК «Алтын Орда»', '+7 701 200 3301', 'Двери межкомнатные, 42 шт', 9660000, 4830000, 'production', 'Сарафан', 26, 'measure', { measurementDate: ymd(daysAgo(22)), completionDate: ymd(daysAgo(-10)) }],
    ['d2', 'ТОО «Шымкент Құрылыс»', '+7 702 200 3302', 'Двери входные, 18 шт', 4140000, 2070000, 'manufacturing', 'Сарафан', 31, 'measure', { measurementDate: ymd(daysAgo(27)), completionDate: ymd(daysAgo(-6)) }],
    ['d3', 'Айгүл Сәрсенова', '+7 705 200 3303', 'Кухня с островом, 12 м²', 3850000, 1925000, 'measured', 'Instagram', 9, 'design', { measurementDate: ymd(daysAgo(4)) }],
    ['d4', 'Дәурен Аманжолов', '+7 707 200 3304', 'Лестница дуб + перила', 3420000, 1710000, 'installation', 'Instagram', 38, 'install', { measurementDate: ymd(daysAgo(34)), completionDate: ymd(daysAgo(-1)) }],
    ['d5', 'Мадина Жақсылық', '+7 701 200 3305', 'Лестница, массив дуба', 2780000, 2780000, 'completed', 'Сарафан', 60, 'install', { measurementDate: ymd(daysAgo(56)), installationDate: ymd(daysAgo(12)), completionDate: ymd(daysAgo(12)), review: { rating: 5, text: 'Лестница идеальная, работой довольны.', at: daysAgo(10).toISOString() } }],
    ['d6', 'Асхат Молдағали', '+7 702 200 3306', 'Кухня прямая 4.2м', 2340000, 702000, 'project-agreed', 'WhatsApp', 14, 'design', { measurementDate: ymd(daysAgo(10)) }],
    ['d7', 'Бекзат Өмірбек', '+7 705 200 3307', 'Лестница бетон + отделка дубом', 1950000, 0, 'new', 'Instagram', 2, 'design', { nextActionAt: ymd(daysAgo(-1)), nextActionNote: 'Согласовать чертёж' }],
    ['d8', 'Гүлнар Бақытқызы', '+7 707 200 3308', 'Гардеробная комната', 1560000, 1560000, 'completed', 'Instagram', 71, 'design', { measurementDate: ymd(daysAgo(67)), installationDate: ymd(daysAgo(24)), completionDate: ymd(daysAgo(24)), review: { rating: 5, text: 'Аккуратно, всё по размерам.', at: daysAgo(22).toISOString() } }],
    ['d9', 'Ерлан Тұрғанбай', '+7 701 200 3309', 'Двери межкомнатные, 8 шт', 1240000, 620000, 'production', 'WhatsApp', 19, 'measure', { measurementDate: ymd(daysAgo(16)), completionDate: ymd(daysAgo(-4)) }],
    ['d10', 'Нұрлан Қасымов', '+7 702 200 3310', 'Шкаф-купе 2.4м', 890000, 0, 'new', 'WhatsApp', 1, 'measure', { nextActionAt: ymd(daysAgo(0)), nextActionNote: 'Выехать на замер' }],
    ['d11', 'Сәуле Нұрғали', '+7 705 200 3311', 'Двери межкомнатные, 5 шт', 775000, 775000, 'completed', '2GIS', 84, 'measure', { measurementDate: ymd(daysAgo(80)), installationDate: ymd(daysAgo(38)), completionDate: ymd(daysAgo(38)), review: { rating: 4, text: 'Хорошо, но ждали чуть дольше.', at: daysAgo(36).toISOString() } }],
    ['d12', 'Жанна Рахымова', '+7 707 200 3312', 'Прихожая с зеркалом', 680000, 340000, 'assembly', 'Instagram', 23, 'design', { measurementDate: ymd(daysAgo(20)), completionDate: ymd(daysAgo(-3)) }],
    ['d13', 'Арман Сейтқали', '+7 701 200 3313', 'Лестница эконом, сосна', 1180000, 0, 'rejected', 'WhatsApp', 29, 'design', { lostReason: 'Дорого — выбрал дешевле' }],
    ['d14', 'Динара Оспан', '+7 702 200 3314', 'Двери межкомнатные, 12 шт', 2100000, 0, 'rejected', 'Instagram', 44, 'measure', { lostReason: 'Отложил ремонт' }],
  ],
  expenses: [
    ['ex-mat-1', 'Материалы', 980000, 48, 'МДФ + шпон дубовый (партия)', { account: 'bank' }],
    ['ex-mat-2', 'Материалы', 540000, 36, 'Массив дуба на ступени', { account: 'bank' }],
    ['ex-mat-3', 'Материалы', 310000, 22, 'Фурнитура: петли, замки, ручки', { account: 'kaspi' }],
    ['ex-mat-4', 'Материалы', 185000, 16, 'Лак, грунт, расходники покраски', { account: 'kaspi' }],
    ['ex-sal-1', 'Зарплата', 1150000, 30, 'Зарплата цеха (месяц)', { account: 'bank' }],
    ['ex-sal-2', 'Зарплата', 1150000, 60, 'Зарплата цеха (месяц)', { account: 'bank' }],
    ['ex-rent-1', 'Аренда', 420000, 28, 'Аренда цеха + шоурум', { account: 'bank' }],
    ['ex-rent-2', 'Аренда', 420000, 58, 'Аренда цеха + шоурум', { account: 'bank' }],
    ['ex-tax-1', 'Налоги', 240000, 25, 'Налоги и отчисления', { account: 'bank' }],
    ['ex-mkt-1', 'Маркетинг', 260000, 15, 'Таргет Instagram', { account: 'kaspi', adChannel: 'Instagram' }],
  ],
  products: [
    ['p1', 'МДФ фасадная плита 18мм', 'Плита', 240, 'лист', 9800, 100, 'instock'],
    ['p2', 'ЛДСП Egger H1145 18мм', 'Плита', 186, 'лист', 9200, 80, 'instock'],
    ['p3', 'Массив дуба, ступени', 'Массив', 62, 'м²', 46000, 40, 'instock'],
    ['p4', 'Шпон дубовый', 'Шпон', 0, 'м²', 5400, 30, 'outofstock'],
    ['p5', 'Петли дверные Blum', 'Фурнитура', 84, 'шт', 1900, 200, 'low'],
    ['p6', 'Балясины точёные', 'Лестницы', 38, 'шт', 5200, 150, 'low'],
    ['p7', 'Лак полиуретановый', 'Покраска', 24, 'л', 7800, 60, 'low'],
    ['p8', 'Грунт по дереву', 'Покраска', 0, 'канистра', 6200, 10, 'outofstock'],
    ['p9', 'Замки врезные', 'Фурнитура', 46, 'компл', 8400, 20, 'instock'],
    ['p10', 'Ручки дверные', 'Фурнитура', 128, 'шт', 3600, 50, 'instock'],
    ['p11', 'Тетива лестничная (бук)', 'Лестницы', 12, 'шт', 32000, 8, 'instock'],
    ['p12', 'Уплотнитель дверной', 'Крепёж', 240, 'м', 450, 100, 'instock'],
  ],
  tasks: [
    ['t1', 'Заказать петли Blum', 'На складе 84 шт при минимуме 200', 'new', 'urgent', 'Снабжение', 1, ''],
    ['t2', 'Выехать на замер', 'Нұрлан Қасымов — шкаф-купе 2.4м', 'new', 'high', 'Замер', 0, 'd10'],
    ['t3', 'Согласовать чертёж лестницы', 'Бекзат Өмірбек — бетон + дуб', 'in_progress', 'medium', 'Дизайн', -1, 'd7'],
    ['t4', 'Покраска дверей', 'Ерлан Тұрғанбай — 8 шт', 'in_progress', 'high', 'Производство', 2, 'd9'],
    ['t5', 'Монтаж перил', 'Дәурен Аманжолов — лестница дуб', 'review', 'high', 'Монтаж', -1, 'd4'],
    ['t6', 'Взять отзыв у клиента', 'Мадина Жақсылық — заказ завершён', 'done', 'low', 'Продажи', 10, 'd5'],
  ],
};

const PRESETS: Record<DemoPreset, DemoSet> = { furniture: FURNITURE, doors: DOORS };

// Тип изделия для карточки — по названию продукта.
function typeOf(product: string): string {
  if (/двер/i.test(product)) return 'Двери';
  if (/лестниц/i.test(product)) return 'Лестница';
  if (/кухн/i.test(product)) return 'Кухня';
  if (/шкаф|гардероб/i.test(product)) return 'Шкаф';
  return 'Мебель';
}

export function seedDemoData(db: Database.Database, teamId: string, userId: string, preset: DemoPreset = 'furniture'): DemoCounts {
  const set = PRESETS[preset] || FURNITURE;
  const rid = (k: string) => `${PREFIX}${k}`;
  const insert = (table: string, id: string, data: Record<string, any>) => {
    db.prepare(`INSERT OR REPLACE INTO ${table} (id, user_id, team_id, data) VALUES (?, ?, ?, ?)`)
      .run(id, userId, teamId, JSON.stringify({ ...data, id }));
  };

  const tx = db.transaction(() => {
    // ─── Сотрудники ────────────────────────────────────────────────────
    for (const e of set.employees) {
      insert('employees', rid(e.key), {
        name: e.name, email: e.email, phone: e.phone, role: e.role, department: e.department,
        status: 'active', salary: e.salary, joinDate: ymd(daysAgo(240)), lastActive: ymd(daysAgo(1)),
        avatar: e.name.slice(0, 2), commissionPct: e.commissionPct, monthlyTarget: e.monthlyTarget,
        permissions: { sales: true, finance: false, warehouse: true, chats: true, analytics: false, settings: false },
        performance: e.perf,
      });
    }
    const OWNER = { design: rid('emp-1'), measure: rid('emp-2'), install: rid('emp-3') };
    const designer = set.employees[0].name;
    const measurer = set.employees[1].name;

    // ─── Сделки — вся воронка, суммы в ₸ ───────────────────────────────
    const ACTIVE_MEASURED = new Set(['measured', 'project-agreed', 'contract', 'production', 'manufacturing', 'assembly', 'installation', 'completed']);
    for (const [key, name, phone, product, amount, paid, status, source, createdDaysAgo, ownerKey, extra] of set.deals) {
      const created = daysAgo(createdDaysAgo);
      const progress = status === 'completed' ? 100 : status === 'installation' ? 90 : status === 'assembly' ? 75 : status === 'manufacturing' ? 60 : status === 'production' ? 45 : status === 'contract' ? 30 : status === 'project-agreed' ? 20 : status === 'measured' ? 12 : status === 'rejected' ? 0 : 5;
      insert('deals', rid(key), {
        customerName: name, phone, address: set.city, siteAddress: set.city,
        product, furnitureType: typeOf(product),
        amount, paidAmount: paid, status, icon: source === 'Instagram' ? 'instagram' : source === 'WhatsApp' ? 'whatsapp' : 'phone',
        priority: amount > 1500000 ? 'high' : amount > 700000 ? 'medium' : 'low',
        date: ymd(created), createdAt: created.toISOString(), progress, source,
        measurer, designer, materials: '',
        measurementDate: '', completionDate: '', installationDate: '',
        paymentMethods: {}, notes: '', ownerId: OWNER[ownerKey], niche: set.niche,
        firstContactAt: status !== 'new' ? new Date(created.getTime() + 2 * 3600 * 1000).toISOString() : undefined,
        ...extra,
      });

      // Приход по сделке (предоплата/оплата) — привязан к сделке.
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
    for (const [key, category, amount, dAgo, description, extra] of set.expenses) {
      insert('transactions', rid(key), {
        type: 'expense', category, amount, date: ymd(daysAgo(dAgo)), description, status: 'completed', ...extra,
      });
    }

    // ─── Склад — с низкими остатками, чтобы сработали алёрты ────────────
    for (const [key, name, category, quantity, unit, cost, minQty, status] of set.products) {
      insert('products', rid(key), {
        name, category, quantity, unit, supplier: set.supplier, cost, status, minQty, niche: set.niche,
      });
    }

    // ─── Задачи — по разным статусам, привязаны к сделкам ───────────────
    for (const [key, title, description, status, priority, category, dueOffset, dealKey] of set.tasks) {
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
