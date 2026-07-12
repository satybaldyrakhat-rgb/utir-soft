import { useState, useMemo } from 'react';
import { Pencil, Plus, Trash2, Check, X } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';
import { toast } from '../utils/toast';

interface CalcProps {
  language: 'kz' | 'ru' | 'eng';
}

type LineItem = { id: string; label: string; price: number; checked: boolean };

const PRODUCT_TYPES = [
  { id: 'kitchen', ru: 'Кухня', kz: 'Ас үй', eng: 'Kitchen', baseM2: 35000, days: [14, 21] },
  { id: 'wardrobe', ru: 'Шкаф', kz: 'Шкаф', eng: 'Wardrobe', baseM2: 28000, days: [10, 14] },
  { id: 'closet', ru: 'Гардероб', kz: 'Гардероб', eng: 'Closet', baseM2: 32000, days: [12, 18] },
  { id: 'hallway', ru: 'Прихожая', kz: 'Дәліз', eng: 'Hallway', baseM2: 22000, days: [7, 10] },
  { id: 'kids', ru: 'Детская', kz: 'Балалар', eng: 'Kids', baseM2: 26000, days: [10, 14] },
  { id: 'bedroom', ru: 'Спальня', kz: 'Жатын', eng: 'Bedroom', baseM2: 30000, days: [12, 16] },
  { id: 'living', ru: 'Гостиная', kz: 'Қонақ', eng: 'Living', baseM2: 33000, days: [14, 21] },
];

const MATERIAL_GROUPS = [
  {
    id: 'mfc', ru: 'ЛДСП', kz: 'ЛДСП', eng: 'MFC',
    opts: [
      { id: 'egger-white', label: 'Egger White', mult: 1.0 },
      { id: 'egger-wood', label: 'Egger Wood', mult: 1.15 },
      { id: 'kronospan-oak', label: 'Kronospan Дуб', mult: 1.25 },
    ],
  },
  {
    id: 'facade', ru: 'Фасады', kz: 'Фасадтар', eng: 'Facades',
    opts: [
      { id: 'mdf-matte', label: 'МДФ матовый', mult: 1.0 },
      { id: 'mdf-gloss', label: 'МДФ глянец', mult: 1.3 },
      { id: 'massiv', label: 'Массив', mult: 1.8 },
    ],
  },
  {
    id: 'hardware', ru: 'Фурнитура', kz: 'Фурнитура', eng: 'Hardware',
    opts: [
      { id: 'eco', ru: 'Эконом', kz: 'Эконом', eng: 'Economy', label: 'Economy', mult: 0.9 },
      { id: 'hettich', label: 'Hettich', mult: 1.1 },
      { id: 'blum', label: 'Blum', mult: 1.25 },
    ],
  },
  {
    id: 'top', ru: 'Столешница', kz: 'Үстел беті', eng: 'Countertop',
    opts: [
      { id: 'postformed', ru: 'ЛДСП пост', kz: 'ЛДСП пост', eng: 'Postformed', label: 'Postformed', mult: 1.0 },
      { id: 'stoneart', label: 'Stone Art', mult: 1.4 },
      { id: 'stone', ru: 'Камень', kz: 'Тас', eng: 'Stone', label: 'Stone', mult: 1.7 },
    ],
  },
];

export function Calculator({ language }: CalcProps) {
  const store = useDataStore();
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  const [productId, setProductId] = useState('kitchen');
  const [dims, setDims] = useState({ length: 3, width: 0.6, height: 0.9 });
  const [materials, setMaterials] = useState<Record<string, string>>({
    mfc: 'egger-white', facade: 'mdf-matte', hardware: 'hettich', top: 'postformed',
  });
  const [addons, setAddons] = useState<LineItem[]>([
    { id: 'led', label: l('Подсветка LED', 'LED жарық', 'LED lighting'), price: 25000, checked: false },
    { id: 'softclose', label: l('Мягкое закрывание Blum', 'Blum жұмсақ жабылу', 'Blum soft-close'), price: 18000, checked: true },
    { id: 'builtin', label: l('Встроенная техника', 'Кіріктірілген техника', 'Built-in appliances'), price: 45000, checked: false },
    { id: 'drawers', label: l('Выдвижные ящики', 'Тартпалар', 'Pull-out drawers'), price: 22000, checked: false },
  ]);
  const [services, setServices] = useState<LineItem[]>([
    { id: 'measure', label: l('Замер', 'Өлшеу', 'Measurement'), price: 5000, checked: true },
    { id: 'design', label: l('Дизайн-проект', 'Дизайн-жоба', 'Design project'), price: 25000, checked: true },
    { id: 'delivery', label: l('Доставка', 'Жеткізу', 'Delivery'), price: 15000, checked: true },
    { id: 'install', label: l('Установка', 'Орнату', 'Installation'), price: 35000, checked: true },
  ]);
  const [markupPct, setMarkupPct] = useState(30);
  const [editing, setEditing] = useState<string | null>(null);
  // price is kept as a raw string while editing so the field can be
  // cleared and retyped freely (a numeric state would snap an empty
  // field back to 0 and block editing). It's parsed on save.
  const [editValue, setEditValue] = useState<{ label: string; price: string }>({ label: '', price: '' });

  const product = PRODUCT_TYPES.find(p => p.id === productId)!;

  const calc = useMemo(() => {
    const length = Number(dims.length) || 0;
    const width = Number(dims.width) || 0;
    const height = Number(dims.height) || 0;
    // Approximate visible surface area (front + sides) — simplified for furniture
    const area = Math.max(0.5, length * height + 2 * width * height + length * width);

    const matMult =
      MATERIAL_GROUPS.reduce((acc, g) => {
        const opt = g.opts.find(o => o.id === materials[g.id]);
        return acc * (opt?.mult || 1);
      }, 1);

    const materialsCost = Math.round(product.baseM2 * area * matMult);
    const addonsCost = addons.filter(a => a.checked).reduce((s, a) => s + a.price, 0);
    const servicesCost = services.filter(s => s.checked).reduce((s, x) => s + x.price, 0);
    const subtotal = materialsCost + addonsCost + servicesCost;
    const markup = Math.round(subtotal * (markupPct / 100));
    const total = subtotal + markup;

    return { area, materialsCost, addonsCost, servicesCost, subtotal, markup, total };
  }, [dims, materials, addons, services, markupPct, product]);

  const updateLine = (list: 'addons' | 'services', id: string, patch: Partial<LineItem>) => {
    const setter = list === 'addons' ? setAddons : setServices;
    setter(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  };

  const removeLine = (list: 'addons' | 'services', id: string) => {
    const setter = list === 'addons' ? setAddons : setServices;
    setter(prev => prev.filter(it => it.id !== id));
  };

  const addLine = (list: 'addons' | 'services') => {
    const setter = list === 'addons' ? setAddons : setServices;
    const newItem: LineItem = {
      id: `custom-${Date.now()}`,
      label: l('Новый пункт', 'Жаңа тармақ', 'New item'),
      price: 0,
      checked: true,
    };
    setter(prev => [...prev, newItem]);
    setEditing(newItem.id);
    setEditValue({ label: newItem.label, price: '' });
  };

  const startEdit = (item: LineItem) => {
    setEditing(item.id);
    setEditValue({ label: item.label, price: String(item.price) });
  };

  const saveEdit = (list: 'addons' | 'services') => {
    if (editing) {
      updateLine(list, editing, { label: editValue.label, price: Number(editValue.price) || 0 });
      setEditing(null);
    }
  };

  const handleCreateOrder = () => {
    const productName = `${l(product.ru, product.kz, product.eng)} ${dims.length}×${dims.width}×${dims.height}м`;
    store.addDeal({
      customerName: l('Новый клиент', 'Жаңа клиент', 'New client'),
      phone: '', address: '',
      product: productName,
      furnitureType: l(product.ru, product.kz, product.eng),
      amount: calc.total, paidAmount: 0, status: 'new',
      icon: 'phone', priority: 'medium',
      date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
      progress: 5, source: l('Калькулятор', 'Калькулятор', 'Calculator'),
      measurer: '', designer: '',
      materials: MATERIAL_GROUPS.map(g => {
        const opt = g.opts.find(o => o.id === materials[g.id]);
        return opt?.label || '';
      }).filter(Boolean).join(', '),
      measurementDate: '', completionDate: '', installationDate: '',
      paymentMethods: { cash: false, kaspiGold: false, kaspiQR: false, cardTransfer: false, installment: false },
      notes: `${l('Расчёт', 'Есеп', 'Estimate')}: ${calc.total.toLocaleString('ru-RU')} ₸`,
    });
    toast(l('Заказ создан и добавлен в воронку', 'Тапсырыс жасалды', 'Order created'), 'success');
  };

  const fmt = (n: number) => n.toLocaleString('ru-RU');

  const renderLineList = (list: 'addons' | 'services', items: LineItem[]) => (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-2 p-2.5 bg-white/40 ring-1 ring-white/60 rounded-xl">
          <input
            type="checkbox" checked={item.checked}
            onChange={e => updateLine(list, item.id, { checked: e.target.checked })}
            className="rounded flex-shrink-0 accent-emerald-600 w-4 h-4"
          />
          {editing === item.id ? (
            <>
              <input
                type="text" value={editValue.label} autoFocus
                onChange={e => setEditValue({ ...editValue, label: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(list); if (e.key === 'Escape') setEditing(null); }}
                className="flex-1 min-w-0 px-2 py-1.5 bg-white/70 ring-1 ring-emerald-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <input
                type="number" inputMode="decimal" value={editValue.price}
                onFocus={e => e.target.select()}
                onChange={e => setEditValue({ ...editValue, price: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(list); if (e.key === 'Escape') setEditing(null); }}
                className="w-24 px-2 py-1.5 bg-white/70 ring-1 ring-emerald-200 rounded-lg text-xs text-right focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <button onClick={() => saveEdit(list)} className="p-1.5 bg-emerald-600 rounded-lg flex-shrink-0 hover:bg-emerald-700 transition-colors"><Check className="w-3.5 h-3.5 text-white" /></button>
              <button onClick={() => setEditing(null)} className="p-1.5 bg-white/60 ring-1 ring-white/60 rounded-lg flex-shrink-0 hover:bg-white transition-colors"><X className="w-3.5 h-3.5 text-slate-500" /></button>
            </>
          ) : (
            <>
              <button onClick={() => startEdit(item)} className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left">
                <span className="text-xs text-slate-700 truncate">{item.label}</span>
                <span className="text-xs text-slate-900 whitespace-nowrap tabular-nums">{fmt(item.price)} ₸</span>
              </button>
              <button onClick={() => startEdit(item)} aria-label={l('Изменить', 'Өзгерту', 'Edit')} className="p-1.5 bg-white/50 ring-1 ring-white/60 rounded-lg flex-shrink-0 hover:bg-white transition-colors">
                <Pencil className="w-3 h-3 text-slate-500" />
              </button>
              <button onClick={() => removeLine(list, item.id)} aria-label={l('Удалить', 'Жою', 'Delete')} className="p-1.5 bg-white/50 ring-1 ring-white/60 rounded-lg flex-shrink-0 hover:bg-red-50 hover:ring-red-200 transition-colors group">
                <Trash2 className="w-3 h-3 text-slate-500 group-hover:text-red-500" />
              </button>
            </>
          )}
        </div>
      ))}
      <button
        onClick={() => addLine(list)}
        className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-300 rounded-xl text-[11px] text-slate-400 hover:border-emerald-300 hover:text-emerald-600 hover:bg-white/50 transition-colors"
      >
        <Plus className="w-3 h-3" /> {l('Добавить', 'Қосу', 'Add')}
      </button>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        {/* Step 1: Product Type */}
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-5">
          <div className="text-[10px] text-slate-400 mb-2">{l('Шаг 1', '1-қадам', 'Step 1')}</div>
          <div className="text-sm text-slate-900 mb-3">{l('Тип изделия', 'Бұйым түрі', 'Product type')}</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {PRODUCT_TYPES.map(p => (
              <button
                key={p.id}
                onClick={() => setProductId(p.id)}
                className={`p-3 rounded-xl text-xs transition-all ring-1 ${
                  productId === p.id
                    ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]'
                    : 'bg-white/50 text-slate-700 ring-white/60 hover:bg-white/80'
                }`}
              >
                {l(p.ru, p.kz, p.eng)}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Dimensions */}
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-5">
          <div className="text-[10px] text-slate-400 mb-2">{l('Шаг 2', '2-қадам', 'Step 2')}</div>
          <div className="text-sm text-slate-900 mb-3">{l('Размеры (м)', 'Өлшемдері (м)', 'Dimensions (m)')}</div>
          <div className="grid grid-cols-3 gap-3">
            {([
              { key: 'length', lbl: l('Длина', 'Ұзындығы', 'Length') },
              { key: 'width', lbl: l('Ширина', 'Ені', 'Width') },
              { key: 'height', lbl: l('Высота', 'Биіктігі', 'Height') },
            ] as const).map(f => (
              <div key={f.key}>
                <label className="block text-[11px] text-slate-400 mb-1">{f.lbl}</label>
                <input
                  type="number" inputMode="decimal" min={0} step={0.1}
                  value={dims[f.key]}
                  onFocus={e => e.target.select()}
                  onChange={e => setDims({ ...dims, [f.key]: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-white/60 ring-1 ring-white/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-slate-400">
            {l('Расчётная площадь', 'Есептік ауданы', 'Calculated area')}: <span className="text-slate-700">{calc.area.toFixed(2)} м²</span>
          </div>
        </div>

        {/* Step 3: Materials */}
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-5">
          <div className="text-[10px] text-slate-400 mb-2">{l('Шаг 3', '3-қадам', 'Step 3')}</div>
          <div className="text-sm text-slate-900 mb-3">{l('Материалы', 'Материалдар', 'Materials')}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MATERIAL_GROUPS.map(g => (
              <div key={g.id}>
                <label className="block text-[11px] text-slate-400 mb-1">{l(g.ru, g.kz, g.eng)}</label>
                <select
                  value={materials[g.id]}
                  onChange={e => setMaterials({ ...materials, [g.id]: e.target.value })}
                  className="w-full px-3 py-2 bg-white/60 ring-1 ring-white/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  {g.opts.map(o => (
                    <option key={o.id} value={o.id}>
                      {(o as any).ru ? l((o as any).ru, (o as any).kz, (o as any).eng) : o.label}
                      {o.mult !== 1 && ` (${o.mult > 1 ? '+' : ''}${Math.round((o.mult - 1) * 100)}%)`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Step 4: Add-ons */}
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] text-slate-400">{l('Шаг 4', '4-қадам', 'Step 4')}</div>
              <div className="text-sm text-slate-900">{l('Дополнительно', 'Қосымша', 'Add-ons')}</div>
            </div>
            <span className="text-[11px] text-slate-400">{l('нажмите, чтобы изменить', 'өзгерту үшін басыңыз', 'tap to edit')}</span>
          </div>
          {renderLineList('addons', addons)}
        </div>

        {/* Step 5: Services */}
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] text-slate-400">{l('Шаг 5', '5-қадам', 'Step 5')}</div>
              <div className="text-sm text-slate-900">{l('Работа', 'Жұмыс', 'Services')}</div>
            </div>
            <span className="text-[11px] text-slate-400">{l('нажмите, чтобы изменить', 'өзгерту үшін басыңыз', 'tap to edit')}</span>
          </div>
          {renderLineList('services', services)}
        </div>

        {/* Markup */}
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-5">
          <div className="text-sm text-slate-900 mb-3">{l('Наценка', 'Үстеме', 'Markup')}</div>
          <div className="flex items-center gap-3">
            <input
              type="range" min={0} max={100} step={1}
              value={markupPct}
              onChange={e => setMarkupPct(Number(e.target.value))}
              className="flex-1"
            />
            <input
              type="number" inputMode="numeric" min={0} max={200}
              value={markupPct}
              onFocus={e => e.target.select()}
              onChange={e => setMarkupPct(Number(e.target.value))}
              className="w-20 px-2 py-1.5 bg-white/60 ring-1 ring-white/60 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <span className="text-sm text-slate-500">%</span>
          </div>
        </div>
      </div>

      {/* Total panel */}
      <div className="space-y-3">
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-5 sticky top-4">
          <div className="text-sm text-slate-900 mb-4">{l('Итого', 'Жиыны', 'Total')}</div>
          <div className="space-y-2.5 mb-4">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">{l('Материалы', 'Материалдар', 'Materials')}</span>
              <span className="text-slate-900">{fmt(calc.materialsCost)} ₸</span>
            </div>
            {calc.addonsCost > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">{l('Доп. опции', 'Қосымша опциялар', 'Add-ons')}</span>
                <span className="text-slate-900">{fmt(calc.addonsCost)} ₸</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">{l('Работа', 'Жұмыс', 'Labor')}</span>
              <span className="text-slate-900">{fmt(calc.servicesCost)} ₸</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">{l('Наценка', 'Үстеме', 'Markup')} {markupPct}%</span>
              <span className="text-slate-900">{fmt(calc.markup)} ₸</span>
            </div>
            <div className="border-t border-white/60 pt-2.5 flex justify-between">
              <span className="text-sm text-slate-900">{l('ИТОГО', 'ЖИЫНЫ', 'TOTAL')}</span>
              <span className="text-sm text-slate-900">{fmt(calc.total)} ₸</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mb-4">
            {l('Срок производства', 'Өндіріс мерзімі', 'Production time')}: {product.days[0]}-{product.days[1]} {l('дней', 'күн', 'days')}
          </div>
          <div className="space-y-2">
            <button
              onClick={handleCreateOrder}
              className="w-full px-3 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
            >
              {l('Создать заказ', 'Тапсырыс жасау', 'Create order')}
            </button>
            <button
              onClick={() => toast(l('Шаблон сохранён', 'Шаблон сақталды', 'Template saved'), 'success')}
              className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs hover:bg-white transition-colors"
            >
              {l('Сохранить как шаблон', 'Шаблон ретінде сақтау', 'Save as template')}
            </button>
            <button
              onClick={() => {
                const text = `${l('КП', 'КП', 'Quote')}: ${l(product.ru, product.kz, product.eng)} ${dims.length}×${dims.width}×${dims.height}м — ${fmt(calc.total)} ₸`;
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
              }}
              className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs hover:bg-white transition-colors"
            >
              {l('Отправить КП в WhatsApp', 'WhatsApp-қа КП жіберу', 'Send proposal via WhatsApp')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
