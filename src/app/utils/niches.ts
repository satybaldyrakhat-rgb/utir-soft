// Niche configuration — single source of truth for what "kind of business"
// the team operates in. Drives:
//   • Deal field labels (Тип мебели vs Тип окна vs Тип потолка...)
//   • Default production stages (cutting→edging→assembly for furniture;
//     measure→produce→install for windows; etc.)
//   • Default role labels (Замерщик / Монтажник / Прораб...)
//   • Material category suggestions
//   • Default sources (channels where leads come in)
//
// All measure-based niches share the same skeleton: Лид → Замер →
// Договор → Производство/Закупка → Установка → Завершено. We just
// rename / re-purpose stages per niche.
//
// `id` is what we persist on team_settings. Renaming a niche later
// keeps the id stable so historical data still resolves.
//
// LANGUAGE NOTE: all RU/KZ/EN trios are filled in. The platform's
// `l(ru, kz, eng)` helper picks the right one at render time.

export type NicheId =
  | 'furniture'    // Мебель (кухни, шкафы, гардеробы, столы)
  | 'windows'      // Пластиковые окна / двери
  | 'ceilings'     // Натяжные потолки
  | 'blinds'       // Жалюзи / шторы / рулонные
  | 'doors'        // Межкомнатные / входные двери
  | 'stairs'       // Лестницы
  | 'flooring'     // Полы / ламинат / паркет
  | 'construction' // Стройка / отделка под ключ
  | 'custom';      // Произвольная — пользователь сам настраивает

export interface NicheStage {
  id: string;
  ru: string;
  kz: string;
  eng: string;
}

export interface NicheRoleLabels {
  measurer:   { ru: string; kz: string; eng: string };  // выезжает на замер
  designer:   { ru: string; kz: string; eng: string };  // готовит проект
  installer:  { ru: string; kz: string; eng: string };  // монтаж на объекте
  foreman?:   { ru: string; kz: string; eng: string };  // (опционально) прораб
}

export interface NicheConfig {
  id: NicheId;
  name:        { ru: string; kz: string; eng: string };
  description: { ru: string; kz: string; eng: string };
  icon:        string;   // emoji or icon name — keep simple for now

  // Production stage template — used by Warehouse → Заказы chip strip
  // and the deal lifecycle. 5 stages is the default; can be shorter
  // for niches that don't manufacture (ceilings, doors).
  productionStages: NicheStage[];

  // What roles this niche needs. Determines which fields appear on
  // the deal card and which dropdowns the team fills.
  roleLabels: NicheRoleLabels;

  // Default material categories shown in Производство → Склад when
  // adding new products. Just suggestions — users can edit.
  materialCategories: string[];

  // What to call the "product type" field on the deal card.
  // For furniture: "Тип мебели" with options Кухня / Шкаф-купе / etc.
  // For windows: "Тип окна" with Двухстворчатое / Глухое / etc.
  productTypeLabel: { ru: string; kz: string; eng: string };
  productTypeOptions: string[];

  // Default invoice line item description. Shown when user generates
  // a счёт/акт and the product field is empty.
  defaultInvoiceItem: { ru: string; kz: string; eng: string };
}

// ─── Niche definitions ────────────────────────────────────────────

export const NICHES: Record<NicheId, NicheConfig> = {
  furniture: {
    id: 'furniture',
    name:        { ru: 'Мебель',      kz: 'Жиһаз',         eng: 'Furniture' },
    description: { ru: 'Кухни, шкафы-купе, гардеробы, столы, прихожие',
                   kz: 'Ас үй, сырғымалы шкаф, гардероб, үстелдер',
                   eng: 'Kitchens, wardrobes, closets, tables, hallways' },
    icon: '🪑',
    productionStages: [
      { id: 'cutting',   ru: 'Распил',   kz: 'Кесу',     eng: 'Cutting' },
      { id: 'edging',    ru: 'Кромка',   kz: 'Жиектеу',  eng: 'Edging' },
      { id: 'assembly',  ru: 'Сборка',   kz: 'Жинау',    eng: 'Assembly' },
      { id: 'packaging', ru: 'Упаковка', kz: 'Орау',     eng: 'Packaging' },
      { id: 'delivery',  ru: 'Доставка', kz: 'Жеткізу',  eng: 'Delivery' },
    ],
    roleLabels: {
      measurer:  { ru: 'Замерщик',  kz: 'Өлшеуші',  eng: 'Measurer' },
      designer:  { ru: 'Дизайнер',  kz: 'Дизайнер', eng: 'Designer' },
      installer: { ru: 'Сборщик',   kz: 'Жинаушы',  eng: 'Assembler' },
    },
    materialCategories: ['Плиты', 'Фурнитура', 'Кромка', 'Краска', 'Стекло', 'Электрика', 'Прочее'],
    productTypeLabel:   { ru: 'Тип мебели', kz: 'Жиһаз түрі', eng: 'Furniture type' },
    productTypeOptions: ['Кухня', 'Шкаф-купе', 'Гардероб', 'Спальня', 'Прихожая', 'Стол', 'Стеллаж', 'Прочее'],
    defaultInvoiceItem: { ru: 'Изготовление мебели',
                          kz: 'Жиһаз дайындау',
                          eng: 'Furniture manufacturing' },
  },

  windows: {
    id: 'windows',
    name:        { ru: 'Окна и двери (ПВХ/алюминий)',
                   kz: 'Терезе және есік',
                   eng: 'Windows & doors (PVC/aluminum)' },
    description: { ru: 'Пластиковые/алюминиевые окна, балконные блоки, двери',
                   kz: 'Пластик/алюминий терезелер, балкон блогы, есіктер',
                   eng: 'PVC/aluminum windows, balcony units, doors' },
    icon: '🪟',
    productionStages: [
      { id: 'cutting',     ru: 'Резка профиля', kz: 'Профильді кесу', eng: 'Profile cutting' },
      { id: 'welding',     ru: 'Сварка',         kz: 'Дәнекерлеу',     eng: 'Welding' },
      { id: 'glazing',     ru: 'Остекление',     kz: 'Әйнектеу',       eng: 'Glazing' },
      { id: 'delivery',    ru: 'Доставка',       kz: 'Жеткізу',         eng: 'Delivery' },
      { id: 'installation',ru: 'Монтаж',         kz: 'Монтаж',          eng: 'Installation' },
    ],
    roleLabels: {
      measurer:  { ru: 'Замерщик',   kz: 'Өлшеуші',    eng: 'Measurer' },
      designer:  { ru: 'Менеджер',   kz: 'Менеджер',   eng: 'Manager' },
      installer: { ru: 'Монтажник',  kz: 'Монтажшы',   eng: 'Installer' },
    },
    materialCategories: ['Профиль', 'Стеклопакеты', 'Фурнитура', 'Уплотнители', 'Откосы', 'Подоконники', 'Прочее'],
    productTypeLabel:   { ru: 'Тип конструкции', kz: 'Құрылым түрі', eng: 'Construction type' },
    productTypeOptions: ['Окно глухое', 'Окно двухстворчатое', 'Окно трёхстворчатое', 'Балконный блок', 'Дверь входная', 'Витраж', 'Прочее'],
    defaultInvoiceItem: { ru: 'Изготовление и монтаж окон/дверей',
                          kz: 'Терезе/есік дайындау және монтажы',
                          eng: 'Window/door manufacturing and installation' },
  },

  ceilings: {
    id: 'ceilings',
    name:        { ru: 'Натяжные потолки',
                   kz: 'Керме төбелер',
                   eng: 'Stretch ceilings' },
    description: { ru: 'Полотна, светильники, профиль, монтаж',
                   kz: 'Кенептер, шамдар, профиль, монтаж',
                   eng: 'Canvases, lighting, profiles, install' },
    icon: '🏠',
    // Ceilings don't have a "production" stage in the manufacturing
    // sense — they cut the canvas to size and install on site.
    productionStages: [
      { id: 'cutting',     ru: 'Раскрой полотна', kz: 'Кенепті кесу', eng: 'Canvas cutting' },
      { id: 'preparation', ru: 'Подготовка',      kz: 'Дайындау',      eng: 'Preparation' },
      { id: 'installation',ru: 'Монтаж',           kz: 'Монтаж',         eng: 'Installation' },
      { id: 'finishing',   ru: 'Установка светильников', kz: 'Шамдарды орнату', eng: 'Lighting setup' },
      { id: 'handover',    ru: 'Сдача объекта',    kz: 'Нысанды тапсыру', eng: 'Handover' },
    ],
    roleLabels: {
      measurer:  { ru: 'Замерщик',  kz: 'Өлшеуші',   eng: 'Measurer' },
      designer:  { ru: 'Менеджер',  kz: 'Менеджер',  eng: 'Manager' },
      installer: { ru: 'Монтажник', kz: 'Монтажшы',  eng: 'Installer' },
    },
    materialCategories: ['Полотно', 'Профиль', 'Светильники', 'Закладные', 'Уголки', 'Прочее'],
    productTypeLabel:   { ru: 'Тип потолка', kz: 'Төбе түрі', eng: 'Ceiling type' },
    productTypeOptions: ['Матовый', 'Глянцевый', 'Сатиновый', 'Многоуровневый', 'С фотопечатью', '3D', 'Тканевый', 'Прочее'],
    defaultInvoiceItem: { ru: 'Установка натяжного потолка',
                          kz: 'Керме төбені орнату',
                          eng: 'Stretch ceiling installation' },
  },

  blinds: {
    id: 'blinds',
    name:        { ru: 'Жалюзи и шторы',
                   kz: 'Перде және жалюзи',
                   eng: 'Blinds & curtains' },
    description: { ru: 'Рулонные, римские, горизонтальные, день-ночь, шторы',
                   kz: 'Орамдық, рим, көлденең, перделер',
                   eng: 'Roller, Roman, horizontal, day-night, curtains' },
    icon: '🪟',
    productionStages: [
      { id: 'cutting',     ru: 'Раскрой',  kz: 'Кесу',    eng: 'Cutting' },
      { id: 'sewing',      ru: 'Пошив',     kz: 'Тігу',    eng: 'Sewing' },
      { id: 'assembly',    ru: 'Сборка',    kz: 'Жинау',   eng: 'Assembly' },
      { id: 'delivery',    ru: 'Доставка',  kz: 'Жеткізу', eng: 'Delivery' },
      { id: 'installation',ru: 'Монтаж',     kz: 'Монтаж',  eng: 'Installation' },
    ],
    roleLabels: {
      measurer:  { ru: 'Замерщик',  kz: 'Өлшеуші',   eng: 'Measurer' },
      designer:  { ru: 'Дизайнер',  kz: 'Дизайнер',  eng: 'Designer' },
      installer: { ru: 'Монтажник', kz: 'Монтажшы',  eng: 'Installer' },
    },
    materialCategories: ['Ткань', 'Механизмы', 'Карнизы', 'Цепочки', 'Аксессуары', 'Прочее'],
    productTypeLabel:   { ru: 'Тип', kz: 'Түрі', eng: 'Type' },
    productTypeOptions: ['Рулонные', 'Римские', 'Горизонтальные', 'Вертикальные', 'День-ночь', 'Шторы тканевые', 'Тюль', 'Прочее'],
    defaultInvoiceItem: { ru: 'Изготовление и установка штор/жалюзи',
                          kz: 'Перде/жалюзи дайындау және орнату',
                          eng: 'Blinds/curtains manufacturing and installation' },
  },

  doors: {
    id: 'doors',
    name:        { ru: 'Двери',
                   kz: 'Есіктер',
                   eng: 'Doors' },
    description: { ru: 'Межкомнатные, входные, складные, раздвижные',
                   kz: 'Бөлме аралық, кіреберіс, бүгілмелі',
                   eng: 'Interior, entrance, folding, sliding' },
    icon: '🚪',
    productionStages: [
      { id: 'order',       ru: 'Заказ у поставщика', kz: 'Жеткізушіге тапсырыс', eng: 'Order from supplier' },
      { id: 'delivery',    ru: 'Доставка',            kz: 'Жеткізу',                eng: 'Delivery' },
      { id: 'preparation', ru: 'Подготовка проёма',   kz: 'Ойықты дайындау',        eng: 'Opening prep' },
      { id: 'installation',ru: 'Монтаж',               kz: 'Монтаж',                 eng: 'Installation' },
      { id: 'finishing',   ru: 'Установка фурнитуры', kz: 'Фурнитураны орнату',     eng: 'Hardware install' },
    ],
    roleLabels: {
      measurer:  { ru: 'Замерщик',  kz: 'Өлшеуші',   eng: 'Measurer' },
      designer:  { ru: 'Менеджер',  kz: 'Менеджер',  eng: 'Manager' },
      installer: { ru: 'Монтажник', kz: 'Монтажшы',  eng: 'Installer' },
    },
    materialCategories: ['Полотно', 'Коробка', 'Наличники', 'Фурнитура', 'Замки', 'Доборы', 'Прочее'],
    productTypeLabel:   { ru: 'Тип двери', kz: 'Есік түрі', eng: 'Door type' },
    productTypeOptions: ['Межкомнатная', 'Входная металлическая', 'Складная', 'Раздвижная', 'Стеклянная', 'Алюминиевая', 'Прочее'],
    defaultInvoiceItem: { ru: 'Поставка и установка дверей',
                          kz: 'Есіктерді жеткізу және орнату',
                          eng: 'Door supply and installation' },
  },

  stairs: {
    id: 'stairs',
    name:        { ru: 'Лестницы',
                   kz: 'Баспалдақтар',
                   eng: 'Stairs' },
    description: { ru: 'Деревянные, металлические, винтовые, маршевые',
                   kz: 'Ағаш, металл, бұрандалы',
                   eng: 'Wood, metal, spiral, straight' },
    icon: '🪜',
    productionStages: [
      { id: 'design',      ru: 'Проектирование', kz: 'Жобалау',  eng: 'Design' },
      { id: 'cutting',     ru: 'Заготовка',       kz: 'Дайындау', eng: 'Preparation' },
      { id: 'production',  ru: 'Производство',    kz: 'Өндіріс',  eng: 'Production' },
      { id: 'delivery',    ru: 'Доставка',         kz: 'Жеткізу',  eng: 'Delivery' },
      { id: 'installation',ru: 'Монтаж',            kz: 'Монтаж',   eng: 'Installation' },
    ],
    roleLabels: {
      measurer:  { ru: 'Замерщик',  kz: 'Өлшеуші',   eng: 'Measurer' },
      designer:  { ru: 'Проектировщик', kz: 'Жобалаушы', eng: 'Designer' },
      installer: { ru: 'Монтажник', kz: 'Монтажшы',  eng: 'Installer' },
    },
    materialCategories: ['Ступени', 'Балясины', 'Поручни', 'Косоуры', 'Тетивы', 'Крепёж', 'Прочее'],
    productTypeLabel:   { ru: 'Тип лестницы', kz: 'Баспалдақ түрі', eng: 'Stair type' },
    productTypeOptions: ['Маршевая', 'Винтовая', 'Г-образная', 'П-образная', 'На больцах', 'Прочее'],
    defaultInvoiceItem: { ru: 'Изготовление и монтаж лестницы',
                          kz: 'Баспалдақ дайындау және монтажы',
                          eng: 'Stair manufacturing and installation' },
  },

  flooring: {
    id: 'flooring',
    name:        { ru: 'Полы',
                   kz: 'Едендер',
                   eng: 'Flooring' },
    description: { ru: 'Ламинат, паркет, линолеум, наливные, плитка',
                   kz: 'Ламинат, паркет, линолеум, тақтайшалар',
                   eng: 'Laminate, parquet, linoleum, tiles' },
    icon: '🪵',
    productionStages: [
      { id: 'order',       ru: 'Заказ материалов', kz: 'Материал тапсырысы', eng: 'Material order' },
      { id: 'delivery',    ru: 'Доставка',           kz: 'Жеткізу',              eng: 'Delivery' },
      { id: 'preparation', ru: 'Подготовка основания', kz: 'Негізді дайындау',   eng: 'Subfloor prep' },
      { id: 'installation',ru: 'Укладка',             kz: 'Төсеу',                 eng: 'Laying' },
      { id: 'finishing',   ru: 'Финишная обработка',  kz: 'Аяқтау',                 eng: 'Finishing' },
    ],
    roleLabels: {
      measurer:  { ru: 'Замерщик',  kz: 'Өлшеуші',   eng: 'Measurer' },
      designer:  { ru: 'Менеджер',  kz: 'Менеджер',  eng: 'Manager' },
      installer: { ru: 'Укладчик',  kz: 'Төсеуші',   eng: 'Installer' },
    },
    materialCategories: ['Ламинат', 'Паркет', 'Линолеум', 'Подложка', 'Плинтус', 'Клей', 'Прочее'],
    productTypeLabel:   { ru: 'Тип покрытия', kz: 'Жабын түрі', eng: 'Floor type' },
    productTypeOptions: ['Ламинат', 'Паркетная доска', 'Массивная доска', 'Линолеум', 'Кварц-винил', 'Пробка', 'Наливной', 'Плитка', 'Прочее'],
    defaultInvoiceItem: { ru: 'Поставка и укладка напольного покрытия',
                          kz: 'Еден жабынын жеткізу және төсеу',
                          eng: 'Floor supply and installation' },
  },

  construction: {
    id: 'construction',
    name:        { ru: 'Стройка и отделка',
                   kz: 'Құрылыс және өңдеу',
                   eng: 'Construction & finishing' },
    description: { ru: 'Ремонт под ключ, фасады, кровля, общие строительные работы',
                   kz: 'Кілт ремонт, қасбеттер, шатыр',
                   eng: 'Turnkey renovation, facades, roofing, general works' },
    icon: '🏗',
    productionStages: [
      { id: 'design',      ru: 'Проект',         kz: 'Жоба',      eng: 'Project' },
      { id: 'demolition',  ru: 'Демонтаж',       kz: 'Бұзу',      eng: 'Demolition' },
      { id: 'rough',       ru: 'Черновые работы', kz: 'Дөрекі жұмыс', eng: 'Rough work' },
      { id: 'finishing',   ru: 'Чистовая отделка', kz: 'Таза өңдеу', eng: 'Fine finishing' },
      { id: 'handover',    ru: 'Сдача объекта',    kz: 'Нысанды тапсыру', eng: 'Handover' },
    ],
    roleLabels: {
      measurer:  { ru: 'Замерщик / Сметчик', kz: 'Сметашы',     eng: 'Estimator' },
      designer:  { ru: 'Архитектор',          kz: 'Сәулетші',     eng: 'Architect' },
      installer: { ru: 'Бригада',              kz: 'Бригада',      eng: 'Crew' },
      foreman:   { ru: 'Прораб',                kz: 'Прораб',       eng: 'Foreman' },
    },
    materialCategories: ['Стройматериалы', 'Сантехника', 'Электрика', 'Отделочные', 'Утеплители', 'Инструмент', 'Прочее'],
    productTypeLabel:   { ru: 'Тип работ', kz: 'Жұмыс түрі', eng: 'Work type' },
    productTypeOptions: ['Ремонт квартиры', 'Ремонт коммерческого', 'Строительство дома', 'Фасад', 'Кровля', 'Дизайн-проект', 'Прочее'],
    defaultInvoiceItem: { ru: 'Строительно-отделочные работы',
                          kz: 'Құрылыс және өңдеу жұмыстары',
                          eng: 'Construction and finishing works' },
  },

  custom: {
    id: 'custom',
    name:        { ru: 'Своя ниша',
                   kz: 'Өзіндік сала',
                   eng: 'Custom niche' },
    description: { ru: 'Настройте этапы, роли и материалы под свой бизнес',
                   kz: 'Кезеңдерді, рөлдерді өз бизнесіңізге бейімдеңіз',
                   eng: 'Customize stages, roles and materials for your business' },
    icon: '⚙️',
    productionStages: [
      { id: 'stage1', ru: 'Этап 1', kz: '1-кезең', eng: 'Stage 1' },
      { id: 'stage2', ru: 'Этап 2', kz: '2-кезең', eng: 'Stage 2' },
      { id: 'stage3', ru: 'Этап 3', kz: '3-кезең', eng: 'Stage 3' },
    ],
    roleLabels: {
      measurer:  { ru: 'Специалист по замеру', kz: 'Маман',     eng: 'Specialist' },
      designer:  { ru: 'Менеджер',                kz: 'Менеджер',   eng: 'Manager' },
      installer: { ru: 'Установщик',              kz: 'Орнатушы',   eng: 'Installer' },
    },
    materialCategories: ['Прочее'],
    productTypeLabel:   { ru: 'Тип продукта', kz: 'Өнім түрі', eng: 'Product type' },
    productTypeOptions: ['Прочее'],
    defaultInvoiceItem: { ru: 'Услуги по договору',
                          kz: 'Шарт бойынша қызметтер',
                          eng: 'Contract services' },
  },
};

// Display order for the niche picker — furniture first (largest user base),
// custom last (fallback). Other order is roughly «most adjacent niches
// to furniture» so the picker feels intuitive.
export const NICHE_ORDER: NicheId[] = [
  'furniture', 'windows', 'ceilings', 'blinds', 'doors',
  'stairs', 'flooring', 'construction', 'custom',
];

// Safe getter — falls back to 'furniture' if the stored niche id was
// removed or renamed. Existing teams without a niche field default to
// furniture (matches the original product positioning).
export function getNiche(id: string | undefined | null): NicheConfig {
  if (!id) return NICHES.furniture;
  return (NICHES as Record<string, NicheConfig>)[id] || NICHES.furniture;
}

// Resolve the effective niche for a deal in a multi-niche team. The
// deal's own niche field wins; falls back to the team's primary niche
// when not set (which is every deal created before the multi-niche
// feature shipped). Status labels / production stages / role names /
// material categories shown on the deal card / detail modal / PDFs
// should all key off this resolved niche.
export function getDealNiche(
  deal: { niche?: string | null } | null | undefined,
  teamNiche: string | undefined | null,
): NicheConfig {
  return getNiche(deal?.niche || teamNiche);
}
