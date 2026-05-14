import { useState, useMemo } from 'react';
import { Pencil, Plus, Trash2, Check, X } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';

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
  const [editValue, setEditValue] = useState({ label: '', price: 0 });

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
    setEditValue({ label: newItem.label, price: 0 });
  };

  const startEdit = (item: LineItem) => {
    setEditing(item.id);
    setEditValue({ label: item.label, price: item.price });
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
    alert(l('Заказ создан и добавлен в воронку', 'Тапсырыс жасалды', 'Order created'));
  };

  const fmt = (n: number) => n.toLocaleString('ru-RU');

  const renderLineList = (list: 'addons' | 'services', items: LineItem[]) => (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-2 p-2.5 border border-gray-100 rounded-xl group">
          <input
            type="checkbox" checked={item.checked}
            onChange={e => updateLine(list, item.id, { checked: e.target.checked })}
            className="rounded flex-shrink-0"
          />
          {editing === item.id ? (
            <>
              <input
                type="text" value={editValue.label}
                onChange={e => setEditValue({ ...editValue, label: e.target.value })}
                className="flex-1 px-2 py-1 bg-gray-50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-gray-200"
              />
              <input
                type="number" value={editValue.price}
                onChange={e => setEditValue({ ...editValue, price: Number(e.target.value) })}
                className="w-24 px-2 py-1 bg-gray-50 rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-gray-200"
              />
              <button onClick={() => saveEdit(list)} className="p-1 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5 text-green-600" /></button>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-gray-50 rounded"><X className="w-3.5 h-3.5 text-gray-400" /></button>
            </>
          ) : (
            <>
              <span className="text-xs text-gray-700 flex-1">{item.label}</span>
              <span className="text-xs text-gray-900">{fmt(item.price)} ₸</span>
              <button onClick={() => startEdit(item)} className="p-1 hover:bg-gray-50 rounded opacity-0 group-hover:opacity-100">
                <Pencil className="w-3 h-3 text-gray-400" />
              </button>
              <button onClick={() => removeLine(list, item.id)} className="p-1 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100">
                <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
              </button>
            </>
          )}
        </div>
      ))}
      <button
        onClick={() => addLine(list)}
        className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-200 rounded-xl text-[11px] text-gray-400 hover:border-gray-300 hover:text-gray-600 hover:bg-gray-50"
      >
        <Plus className="w-3 h-3" /> {l('Добавить', 'Қосу', 'Add')}
      </button>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        {/* Step 1: Product Type */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-[10px] text-gray-400 mb-2">{l('Шаг 1', '1-қадам', 'Step 1')}</div>
          <div className="text-sm text-gray-900 mb-3">{l('Тип изделия', 'Бұйым түрі', 'Product type')}</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {PRODUCT_TYPES.map(p => (
              <button
                key={p.id}
                onClick={() => setProductId(p.id)}
                className={`p-3 border rounded-xl text-xs transition-all ${
                  productId === p.id
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-100 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {l(p.ru, p.kz, p.eng)}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Dimensions */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-[10px] text-gray-400 mb-2">{l('Шаг 2', '2-қадам', 'Step 2')}</div>
          <div className="text-sm text-gray-900 mb-3">{l('Размеры (м)', 'Өлшемдері (м)', 'Dimensions (m)')}</div>
          <div className="grid grid-cols-3 gap-3">
            {([
              { key: 'length', lbl: l('Длина', 'Ұзындығы', 'Length') },
              { key: 'width', lbl: l('Ширина', 'Ені', 'Width') },
              { key: 'height', lbl: l('Высота', 'Биіктігі', 'Height') },
            ] as const).map(f => (
              <div key={f.key}>
                <label className="block text-[11px] text-gray-400 mb-1">{f.lbl}</label>
                <input
                  type="number" min={0} step={0.1}
                  value={dims[f.key]}
                  onChange={e => setDims({ ...dims, [f.key]: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                />
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-gray-400">
            {l('Расчётная площадь', 'Есептік ауданы', 'Calculated area')}: <span className="text-gray-700">{calc.area.toFixed(2)} м²</span>
          </div>
        </div>

        {/* Step 3: Materials */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-[10px] text-gray-400 mb-2">{l('Шаг 3', '3-қадам', 'Step 3')}</div>
          <div className="text-sm text-gray-900 mb-3">{l('Материалы', 'Материалдар', 'Materials')}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MATERIAL_GROUPS.map(g => (
              <div key={g.id}>
                <label className="block text-[11px] text-gray-400 mb-1">{l(g.ru, g.kz, g.eng)}</label>
                <select
                  value={materials[g.id]}
                  onChange={e => setMaterials({ ...materials, [g.id]: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
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
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] text-gray-400">{l('Шаг 4', '4-қадам', 'Step 4')}</div>
              <div className="text-sm text-gray-900">{l('Дополнительно', 'Қосымша', 'Add-ons')}</div>
            </div>
            <span className="text-[11px] text-gray-400">{l('наведите для редактирования', 'түзеу үшін бағыттаңыз', 'hover to edit')}</span>
          </div>
          {renderLineList('addons', addons)}
        </div>

        {/* Step 5: Services */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] text-gray-400">{l('Шаг 5', '5-қадам', 'Step 5')}</div>
              <div className="text-sm text-gray-900">{l('Работа', 'Жұмыс', 'Services')}</div>
            </div>
            <span className="text-[11px] text-gray-400">{l('редактируется', 'түзетіледі', 'editable')}</span>
          </div>
          {renderLineList('services', services)}
        </div>

        {/* Markup */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-sm text-gray-900 mb-3">{l('Наценка', 'Үстеме', 'Markup')}</div>
          <div className="flex items-center gap-3">
            <input
              type="range" min={0} max={100} step={1}
              value={markupPct}
              onChange={e => setMarkupPct(Number(e.target.value))}
              className="flex-1"
            />
            <input
              type="number" min={0} max={200}
              value={markupPct}
              onChange={e => setMarkupPct(Number(e.target.value))}
              className="w-20 px-2 py-1.5 bg-gray-50 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-gray-200"
            />
            <span className="text-sm text-gray-500">%</span>
          </div>
        </div>
      </div>

      {/* Total panel */}
      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 sticky top-4">
          <div className="text-sm text-gray-900 mb-4">{l('Итого', 'Жиыны', 'Total')}</div>
          <div className="space-y-2.5 mb-4">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">{l('Материалы', 'Материалдар', 'Materials')}</span>
              <span className="text-gray-900">{fmt(calc.materialsCost)} ₸</span>
            </div>
            {calc.addonsCost > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">{l('Доп. опции', 'Қосымша опциялар', 'Add-ons')}</span>
                <span className="text-gray-900">{fmt(calc.addonsCost)} ₸</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">{l('Работа', 'Жұмыс', 'Labor')}</span>
              <span className="text-gray-900">{fmt(calc.servicesCost)} ₸</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">{l('Наценка', 'Үстеме', 'Markup')} {markupPct}%</span>
              <span className="text-gray-900">{fmt(calc.markup)} ₸</span>
            </div>
            <div className="border-t border-gray-100 pt-2.5 flex justify-between">
              <span className="text-sm text-gray-900">{l('ИТОГО', 'ЖИЫНЫ', 'TOTAL')}</span>
              <span className="text-sm text-gray-900">{fmt(calc.total)} ₸</span>
            </div>
          </div>
          <div className="text-[11px] text-gray-400 mb-4">
            {l('Срок производства', 'Өндіріс мерзімі', 'Production time')}: {product.days[0]}-{product.days[1]} {l('дней', 'күн', 'days')}
          </div>
          <div className="space-y-2">
            <button
              onClick={handleCreateOrder}
              className="w-full px-3 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800"
            >
              {l('Создать заказ', 'Тапсырыс жасау', 'Create order')}
            </button>
            <button
              onClick={() => alert(l('Шаблон сохранён', 'Шаблон сақталды', 'Template saved'))}
              className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-xs hover:bg-gray-50"
            >
              {l('Сохранить как шаблон', 'Шаблон ретінде сақтау', 'Save as template')}
            </button>
            <button
              onClick={() => {
                const text = `${l('КП', 'КП', 'Quote')}: ${l(product.ru, product.kz, product.eng)} ${dims.length}×${dims.width}×${dims.height}м — ${fmt(calc.total)} ₸`;
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
              }}
              className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-xs hover:bg-gray-50"
            >
              {l('Отправить КП в WhatsApp', 'WhatsApp-қа КП жіберу', 'Send proposal via WhatsApp')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
