// ─── Прайс калькулятора (свой у каждой команды) ───────────────────────
// Раньше базовые цены за м², коэффициенты материалов и доп. опции были
// зашиты в код и одинаковы для всех — расчёт замерщика не сходился с
// реальной себестоимостью конкретного цеха. Теперь это настройка команды:
// хранится в team_settings.pricing_config, редактируется в
// Настройки → Справочники → Прайс калькулятора.
//
// Значения по умолчанию ниже = ровно те, что были зашиты в Calculator.tsx,
// поэтому у команд, которые ничего не меняли, расчёт остаётся прежним.
//
// Локализация: у «коробочных» позиций есть ru/kz/eng. У позиций, которые
// завёл сам админ, есть только label — его и показываем.

export interface PriceNamed {
  id: string;
  label: string;          // что редактирует админ
  ru?: string; kz?: string; eng?: string;   // только у коробочных значений
}

export interface PriceProduct extends PriceNamed {
  baseM2: number;         // ₸ за м²
  days: number[];         // [мин, макс] срок изготовления
}

export interface PriceOption extends PriceNamed {
  mult: number;           // множитель к стоимости материалов
}

export interface PriceMaterialGroup extends PriceNamed {
  opts: PriceOption[];
}

export interface PriceLine extends PriceNamed {
  price: number;          // ₸
}

export interface PricingConfig {
  products: PriceProduct[];
  materialGroups: PriceMaterialGroup[];
  addons: PriceLine[];
  services: PriceLine[];
  defaultMarkupPct: number;
}

export const DEFAULT_PRICING: PricingConfig = {
  products: [
    { id: 'kitchen',  label: 'Кухня',     ru: 'Кухня',     kz: 'Ас үй',    eng: 'Kitchen',  baseM2: 35000, days: [14, 21] },
    { id: 'wardrobe', label: 'Шкаф',      ru: 'Шкаф',      kz: 'Шкаф',     eng: 'Wardrobe', baseM2: 28000, days: [10, 14] },
    { id: 'closet',   label: 'Гардероб',  ru: 'Гардероб',  kz: 'Гардероб', eng: 'Closet',   baseM2: 32000, days: [12, 18] },
    { id: 'hallway',  label: 'Прихожая',  ru: 'Прихожая',  kz: 'Дәліз',    eng: 'Hallway',  baseM2: 22000, days: [7, 10] },
    { id: 'kids',     label: 'Детская',   ru: 'Детская',   kz: 'Балалар',  eng: 'Kids',     baseM2: 26000, days: [10, 14] },
    { id: 'bedroom',  label: 'Спальня',   ru: 'Спальня',   kz: 'Жатын',    eng: 'Bedroom',  baseM2: 30000, days: [12, 16] },
    { id: 'living',   label: 'Гостиная',  ru: 'Гостиная',  kz: 'Қонақ',    eng: 'Living',   baseM2: 33000, days: [14, 21] },
  ],
  materialGroups: [
    {
      id: 'mfc', label: 'ЛДСП', ru: 'ЛДСП', kz: 'ЛДСП', eng: 'MFC',
      opts: [
        { id: 'egger-white',    label: 'Egger White',    mult: 1.0 },
        { id: 'egger-wood',     label: 'Egger Wood',     mult: 1.15 },
        { id: 'kronospan-oak',  label: 'Kronospan Дуб',  mult: 1.25 },
      ],
    },
    {
      id: 'facade', label: 'Фасады', ru: 'Фасады', kz: 'Фасадтар', eng: 'Facades',
      opts: [
        { id: 'mdf-matte', label: 'МДФ матовый', mult: 1.0 },
        { id: 'mdf-gloss', label: 'МДФ глянец',  mult: 1.3 },
        { id: 'massiv',    label: 'Массив',      mult: 1.8 },
      ],
    },
    {
      id: 'hardware', label: 'Фурнитура', ru: 'Фурнитура', kz: 'Фурнитура', eng: 'Hardware',
      opts: [
        { id: 'eco',     label: 'Economy', ru: 'Эконом', kz: 'Эконом', eng: 'Economy', mult: 0.9 },
        { id: 'hettich', label: 'Hettich', mult: 1.1 },
        { id: 'blum',    label: 'Blum',    mult: 1.25 },
      ],
    },
    {
      id: 'top', label: 'Столешница', ru: 'Столешница', kz: 'Үстел беті', eng: 'Countertop',
      opts: [
        { id: 'postformed', label: 'Postformed', ru: 'ЛДСП пост', kz: 'ЛДСП пост', eng: 'Postformed', mult: 1.0 },
        { id: 'stoneart',   label: 'Stone Art',  mult: 1.4 },
        { id: 'stone',      label: 'Stone',      ru: 'Камень', kz: 'Тас', eng: 'Stone', mult: 1.7 },
      ],
    },
  ],
  addons: [
    { id: 'led',       label: 'Подсветка LED',          ru: 'Подсветка LED',          kz: 'LED жарық',         eng: 'LED lighting',       price: 25000 },
    { id: 'softclose', label: 'Мягкое закрывание Blum', ru: 'Мягкое закрывание Blum', kz: 'Blum жұмсақ жабылу', eng: 'Blum soft-close',    price: 18000 },
    { id: 'builtin',   label: 'Встроенная техника',     ru: 'Встроенная техника',     kz: 'Кіріктірілген техника', eng: 'Built-in appliances', price: 45000 },
    { id: 'drawers',   label: 'Выдвижные ящики',        ru: 'Выдвижные ящики',        kz: 'Тартпалар',         eng: 'Pull-out drawers',   price: 22000 },
  ],
  services: [
    { id: 'measure',  label: 'Замер',         ru: 'Замер',         kz: 'Өлшеу',      eng: 'Measurement',  price: 5000 },
    { id: 'design',   label: 'Дизайн-проект', ru: 'Дизайн-проект', kz: 'Дизайн-жоба', eng: 'Design project', price: 25000 },
    { id: 'delivery', label: 'Доставка',      ru: 'Доставка',      kz: 'Жеткізу',    eng: 'Delivery',     price: 15000 },
    { id: 'install',  label: 'Установка',     ru: 'Установка',     kz: 'Орнату',     eng: 'Installation', price: 35000 },
  ],
  defaultMarkupPct: 30,
};

// Название с учётом языка: у коробочных позиций берём перевод,
// у заведённых админом — то, что он написал.
export function priceLabel(item: PriceNamed, language: 'kz' | 'ru' | 'eng'): string {
  if (item.ru) return language === 'kz' ? (item.kz || item.ru) : language === 'eng' ? (item.eng || item.ru) : item.ru;
  return item.label;
}

// Мержим то, что пришло с сервера, с дефолтами: если команда ничего не
// настраивала (или сервер отдал часть), калькулятор всё равно работает.
export function mergePricing(raw: any): PricingConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_PRICING;
  const arr = <T>(v: any, fallback: T[]): T[] => Array.isArray(v) && v.length ? v : fallback;
  return {
    products: arr(raw.products, DEFAULT_PRICING.products),
    materialGroups: arr(raw.materialGroups, DEFAULT_PRICING.materialGroups),
    // Пустой список доп. опций / услуг — валидный выбор команды, поэтому
    // здесь на дефолт не подменяем: проверяем именно «это массив?».
    addons: Array.isArray(raw.addons) ? raw.addons : DEFAULT_PRICING.addons,
    services: Array.isArray(raw.services) ? raw.services : DEFAULT_PRICING.services,
    defaultMarkupPct: Number.isFinite(Number(raw.defaultMarkupPct))
      ? Number(raw.defaultMarkupPct)
      : DEFAULT_PRICING.defaultMarkupPct,
  };
}
