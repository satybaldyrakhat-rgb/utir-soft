import { useState, useMemo, useRef } from 'react';
import { Pencil, Plus, Trash2, Check, X, Loader2, Paperclip } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';
import { api } from '../utils/api';
import { toast } from '../utils/toast';
import { confirmDialog } from '../utils/confirm';
import { EstimateTarget, type EstimateTargetValue } from './EstimateTarget';
import type { EstimateLine } from '../utils/dataStore';

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
  // Карточка, к которой прикрепится расчёт. Выбирается ДО расчёта.
  const [target, setTarget] = useState<EstimateTargetValue | null>(null);
  const [saving, setSaving] = useState(false);
  // Если жмут «прикрепить», не выбрав карточку — не молчим и не гасим
  // кнопку: подсвечиваем выбор карточки и прокручиваем к нему.
  const targetRef = useRef<HTMLDivElement>(null);
  const [needTarget, setNeedTarget] = useState(false);
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

  // Название выбранной опции материала с учётом языка.
  const optLabel = (g: typeof MATERIAL_GROUPS[number]) => {
    const o: any = g.opts.find(x => x.id === materials[g.id]);
    if (!o) return '';
    return o.ru ? l(o.ru, o.kz, o.eng) : o.label;
  };
  const productName = () => `${l(product.ru, product.kz, product.eng)} ${dims.length}×${dims.width}×${dims.height} м`;

  // Строки КП в том виде, в каком их увидит клиент. Наценка разносится по
  // строкам пропорционально: клиенту показываем конечные цены, а не нашу
  // внутреннюю маржу отдельной строкой.
  const buildClientLines = (): EstimateLine[] => {
    const k = 1 + markupPct / 100;
    const raw = [
      { name: `${productName()} — ${l('изготовление', 'дайындау', 'manufacturing')}`, unit: l('компл', 'жин', 'set'), base: calc.materialsCost },
      ...addons.filter(a => a.checked).map(a => ({ name: a.label, unit: l('шт', 'дана', 'pcs'), base: a.price })),
      ...services.filter(s => s.checked).map(s => ({ name: s.label, unit: l('услуга', 'қызмет', 'service'), base: s.price })),
    ].filter(r => r.base > 0);

    const lines: EstimateLine[] = raw.map(r => ({ name: r.name, qty: 1, unit: r.unit, price: Math.round(r.base * k) }));
    // Копейки округления добиваем в последнюю строку, чтобы сумма строк
    // совпадала с итогом до тенге.
    if (lines.length) {
      const sum = lines.reduce((s, x) => s + x.price, 0);
      lines[lines.length - 1].price += calc.total - sum;
    }
    return lines;
  };

  // Прикрепить расчёт к выбранной карточке. Расчёт уходит «на подтверждение» —
  // отправить клиенту сможет только тот, у кого есть право подтверждать.
  const attachEstimate = async (replace = false) => {
    if (!target) {
      // Спрашиваем прямо здесь: подсвечиваем блок выбора и прокручиваем к нему.
      setNeedTarget(true);
      targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast(l('К какой карточке прикрепить расчёт? Выберите клиента вверху.',
              'Есепті қай карточкаға тіркейміз? Жоғарыдан клиентті таңдаңыз.',
              'Which card should this estimate go to? Pick a client above.'), 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/deals/${target.dealId}/estimate`, {
        productId,
        productLabel: productName(),
        dims,
        area: calc.area,
        materialChoices: MATERIAL_GROUPS.map(g => ({ group: l(g.ru, g.kz, g.eng), option: optLabel(g) })).filter(m => m.option),
        lines: buildClientLines(),
        materialsCost: calc.materialsCost,
        addonsCost: calc.addonsCost,
        servicesCost: calc.servicesCost,
        subtotal: calc.subtotal,
        markupPct,
        markup: calc.markup,
        total: calc.total,
        leadDays: product.days,
        replace,
      });
      await store.reloadAll();
      toast(l('Расчёт прикреплён к карточке — ждёт подтверждения',
              'Есеп карточкаға тіркелді — бекітуді күтуде',
              'Estimate attached to the card — awaiting approval'), 'success');
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg === 'estimate_already_sent') {
        const ok = await confirmDialog({
          message: l('По этой карточке КП уже отправлено клиенту. Заменить расчёт новым?',
                     'Бұл карточка бойынша КҰ клиентке жіберілген. Есепті жаңасымен ауыстырасыз ба?',
                     'A quote was already sent for this card. Replace the estimate?'),
          danger: true,
        });
        if (ok) await attachEstimate(true);
      } else if (msg.includes('pricing')) {
        toast(l('Нет прав на расчёты — обратитесь к администратору',
                'Есеп жасауға құқық жоқ — әкімшіге хабарласыңыз',
                'No permission for estimates — contact your admin'), 'error');
      } else {
        toast(l('Не удалось прикрепить расчёт', 'Есепті тіркеу сәтсіз', 'Failed to attach the estimate'), 'error');
      }
    } finally { setSaving(false); }
  };

  // Persist the current calculator configuration as a real BOM template
  // (/api/bom-templates) so it shows up in Производство → BOM. Maps the
  // computed material cost + checked add-ons to material lines and the
  // checked services to labour, preserving dims, markup and lead time.
  const saveAsTemplate = async () => {
    const materials = [
      { mat: l('Материалы (расчёт)', 'Материалдар (есеп)', 'Materials (calc)'), sup: '', qty: 1, unit: 'компл', price: calc.materialsCost },
      ...addons.filter(a => a.checked).map(a => ({ mat: a.label, sup: '', qty: 1, unit: 'шт', price: a.price })),
    ];
    const labourCost = services.filter(s => s.checked).reduce((sum, x) => sum + x.price, 0);
    const template = {
      name: `${l(product.ru, product.kz, product.eng)} ${dims.length}×${dims.width}×${dims.height}м`,
      type: productId,
      width: Math.round(Number(dims.length) * 1000),
      height: Math.round(Number(dims.height) * 1000),
      depth: Math.round(Number(dims.width) * 1000),
      materials,
      labourCost,
      markupPct,
      leadDays: product.days[0],
    };
    try {
      await api.post('/api/bom-templates', template);
      toast(l('Сохранено как BOM-шаблон', 'BOM-шаблон ретінде сақталды', 'Saved as BOM template'), 'success');
    } catch {
      toast(l('Не удалось сохранить шаблон', 'Шаблонды сақтау сәтсіз', 'Failed to save template'), 'error');
    }
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
        {/* Step 0: к какой карточке относится расчёт */}
        <div
          ref={targetRef}
          className={needTarget && !target ? 'rounded-2xl ring-2 ring-amber-400 animate-pulse' : ''}
        >
          <EstimateTarget
            language={language}
            value={target}
            onChange={v => { setTarget(v); if (v) setNeedTarget(false); }}
          />
        </div>

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
            {/* Кнопка активна всегда: если карточка не выбрана — она сама
                спросит какая, а не молча погаснет. */}
            <button
              onClick={() => attachEstimate()}
              disabled={saving}
              className="w-full px-3 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 disabled:opacity-50 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
              {target
                ? l('Прикрепить расчёт к карточке', 'Есепті карточкаға тіркеу', 'Attach estimate to card')
                : l('Прикрепить расчёт — выбрать клиента', 'Есепті тіркеу — клиентті таңдау', 'Attach estimate — pick a client')}
            </button>
            {!target && (
              <div className="text-[10px] text-slate-400 text-center px-1">
                {l('Расчёт всегда привязывается к карточке клиента',
                   'Есеп әрқашан клиент карточкасына байланады',
                   'An estimate is always tied to a client card')}
              </div>
            )}
            {target && (
              <div className="text-[10px] text-slate-400 text-center px-1">
                {l('КП клиенту отправит тот, кто подтверждает цены',
                   'КҰ-ны клиентке бағаны бекітетін адам жібереді',
                   'The quote is sent to the client by whoever approves prices')}
              </div>
            )}
            <button
              onClick={saveAsTemplate}
              className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs hover:bg-white transition-colors"
            >
              {l('Сохранить как шаблон', 'Шаблон ретінде сақтау', 'Save as template')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
