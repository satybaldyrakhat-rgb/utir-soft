// ─── Прайс калькулятора (редактор для админа) ─────────────────────────
// Базовые цены за м², коэффициенты материалов, доп. опции и услуги.
// Раньше всё это было зашито в код и одинаково для всех команд — расчёт
// замерщика не сходился с реальной себестоимостью цеха. Теперь у каждой
// команды свой прайс.
//
// Сохранять может только админ (сервер проверяет отдельно): цифры отсюда
// уходят в КП клиенту.

import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Save, RotateCcw, Calculator as CalcIcon } from 'lucide-react';
import { api } from '../utils/api';
import { toast } from '../utils/toast';
import { confirmDialog } from '../utils/confirm';
import { useDataStore } from '../utils/dataStore';
import {
  DEFAULT_PRICING, mergePricing, priceLabel,
  type PricingConfig, type PriceProduct, type PriceMaterialGroup, type PriceLine,
} from '../utils/pricingConfig';

type Lang = 'kz' | 'ru' | 'eng';
const newId = (p: string) => p + Math.random().toString(36).slice(2, 8);

export function PricingSettings({ language }: { language: Lang }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();
  const isAdmin = store.currentUserRole === 'admin';

  const [cfg, setCfg] = useState<PricingConfig>(DEFAULT_PRICING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.get<any>('/api/team/pricing')
      .then(raw => { if (raw) setCfg(mergePricing(raw)); })
      .catch(() => { /* нет настроек — показываем дефолты */ })
      .finally(() => setLoading(false));
  }, []);

  const patch = (p: Partial<PricingConfig>) => { setCfg(c => ({ ...c, ...p })); setDirty(true); };

  const save = async () => {
    if (!cfg.products.length) {
      toast(l('Нужен хотя бы один тип изделия', 'Кемінде бір бұйым түрі керек', 'At least one product type is required'), 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put('/api/team/pricing', cfg);
      setDirty(false);
      toast(l('Прайс сохранён', 'Прайс сақталды', 'Price list saved'), 'success');
    } catch (e: any) {
      toast(String(e?.message || '').includes('admin')
        ? l('Менять прайс может только администратор', 'Прайсты тек әкімші өзгертеді', 'Only an admin can change the price list')
        : l('Не удалось сохранить', 'Сақталмады', 'Save failed'), 'error');
    } finally { setSaving(false); }
  };

  const resetToDefaults = async () => {
    const ok = await confirmDialog({
      message: l('Вернуть цены по умолчанию? Ваши текущие значения будут потеряны.',
                 'Әдепкі бағаларға қайтасыз ба? Ағымдағы мәндер жоғалады.',
                 'Restore default prices? Your current values will be lost.'),
      danger: true,
    });
    if (!ok) return;
    setCfg(DEFAULT_PRICING); setDirty(true);
  };

  const num = (v: string) => Math.max(0, Number(v) || 0);
  const inp = 'px-2 py-1.5 bg-white rounded-lg text-xs ring-1 ring-slate-200 focus:ring-emerald-400 outline-none';

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;
  }

  // ── Типы изделий ────────────────────────────────────────────────────
  const renderProducts = () => (
    <Section title={l('Типы изделий', 'Бұйым түрлері', 'Product types')}
             hint={l('Базовая цена за м² и срок изготовления', 'Бір м² базалық баға және дайындау мерзімі', 'Base price per m² and lead time')}>
      <div className="hidden sm:grid grid-cols-[1fr_110px_120px_32px] gap-2 text-[10px] text-slate-400 px-1 mb-1">
        <span>{l('Название', 'Атауы', 'Name')}</span>
        <span>₸ / м²</span>
        <span>{l('Срок, дней', 'Мерзім, күн', 'Lead, days')}</span>
        <span />
      </div>
      {cfg.products.map((p, i) => (
        <div key={p.id} className="grid grid-cols-[1fr_110px_120px_32px] gap-2 items-center mb-1.5">
          <input className={inp} value={priceLabel(p, language)}
            onChange={e => patch({ products: replaceAt(cfg.products, i, { ...p, label: e.target.value, ru: undefined, kz: undefined, eng: undefined } as PriceProduct) })} />
          <input className={inp} type="number" min={0} value={p.baseM2}
            onChange={e => patch({ products: replaceAt(cfg.products, i, { ...p, baseM2: num(e.target.value) }) })} />
          <div className="flex items-center gap-1">
            <input className={inp + ' w-full'} type="number" min={0} value={p.days?.[0] ?? 0}
              onChange={e => patch({ products: replaceAt(cfg.products, i, { ...p, days: [num(e.target.value), p.days?.[1] ?? 0] }) })} />
            <span className="text-slate-300 text-xs">–</span>
            <input className={inp + ' w-full'} type="number" min={0} value={p.days?.[1] ?? 0}
              onChange={e => patch({ products: replaceAt(cfg.products, i, { ...p, days: [p.days?.[0] ?? 0, num(e.target.value)] }) })} />
          </div>
          <IconBtn onClick={() => patch({ products: cfg.products.filter((_, j) => j !== i) })} />
        </div>
      ))}
      <AddBtn label={l('Добавить тип', 'Түр қосу', 'Add type')}
        onClick={() => patch({ products: [...cfg.products, { id: newId('p_'), label: '', baseM2: 0, days: [7, 14] }] })} />
    </Section>
  );

  // ── Материалы ───────────────────────────────────────────────────────
  const renderMaterials = () => (
    <Section title={l('Материалы', 'Материалдар', 'Materials')}
             hint={l('Коэффициент умножает стоимость материалов. 1.0 — базовый, 1.3 — дороже на 30%',
                     'Коэффициент материал құнын көбейтеді. 1.0 — базалық, 1.3 — 30% қымбат',
                     'The multiplier scales material cost. 1.0 = base, 1.3 = +30%')}>
      {cfg.materialGroups.map((g, gi) => (
        <div key={g.id} className="mb-3 rounded-xl bg-white/60 ring-1 ring-slate-100 p-3">
          <div className="flex items-center gap-2 mb-2">
            <input className={inp + ' flex-1'} value={priceLabel(g, language)}
              onChange={e => patch({ materialGroups: replaceAt(cfg.materialGroups, gi, { ...g, label: e.target.value, ru: undefined, kz: undefined, eng: undefined } as PriceMaterialGroup) })} />
            <IconBtn onClick={() => patch({ materialGroups: cfg.materialGroups.filter((_, j) => j !== gi) })} />
          </div>
          {g.opts.map((o, oi) => (
            <div key={o.id} className="grid grid-cols-[1fr_90px_32px] gap-2 items-center mb-1.5 pl-3">
              <input className={inp} value={priceLabel(o, language)}
                onChange={e => patch({ materialGroups: replaceAt(cfg.materialGroups, gi, { ...g, opts: replaceAt(g.opts, oi, { ...o, label: e.target.value, ru: undefined, kz: undefined, eng: undefined }) }) })} />
              <input className={inp} type="number" min={0.01} step={0.05} value={o.mult}
                onChange={e => patch({ materialGroups: replaceAt(cfg.materialGroups, gi, { ...g, opts: replaceAt(g.opts, oi, { ...o, mult: Math.max(0.01, Number(e.target.value) || 0.01) }) }) })} />
              <IconBtn onClick={() => patch({ materialGroups: replaceAt(cfg.materialGroups, gi, { ...g, opts: g.opts.filter((_, j) => j !== oi) }) })} />
            </div>
          ))}
          <div className="pl-3">
            <AddBtn label={l('Добавить вариант', 'Нұсқа қосу', 'Add option')}
              onClick={() => patch({ materialGroups: replaceAt(cfg.materialGroups, gi, { ...g, opts: [...g.opts, { id: newId('o_'), label: '', mult: 1 }] }) })} />
          </div>
        </div>
      ))}
      <AddBtn label={l('Добавить группу материалов', 'Материал тобын қосу', 'Add material group')}
        onClick={() => patch({ materialGroups: [...cfg.materialGroups, { id: newId('g_'), label: '', opts: [{ id: newId('o_'), label: '', mult: 1 }] }] })} />
    </Section>
  );

  // ── Доп. опции и услуги (одинаковая форма) ──────────────────────────
  const renderLines = (key: 'addons' | 'services', title: string, hint: string) => (
    <Section title={title} hint={hint}>
      {cfg[key].map((it: PriceLine, i: number) => (
        <div key={it.id} className="grid grid-cols-[1fr_120px_32px] gap-2 items-center mb-1.5">
          <input className={inp} value={priceLabel(it, language)}
            onChange={e => patch({ [key]: replaceAt(cfg[key], i, { ...it, label: e.target.value, ru: undefined, kz: undefined, eng: undefined }) } as any)} />
          <input className={inp} type="number" min={0} value={it.price}
            onChange={e => patch({ [key]: replaceAt(cfg[key], i, { ...it, price: num(e.target.value) }) } as any)} />
          <IconBtn onClick={() => patch({ [key]: cfg[key].filter((_, j) => j !== i) } as any)} />
        </div>
      ))}
      <AddBtn label={l('Добавить', 'Қосу', 'Add')}
        onClick={() => patch({ [key]: [...cfg[key], { id: newId('l_'), label: '', price: 0 }] } as any)} />
    </Section>
  );

  return (
    <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-2">
          <CalcIcon className="w-4 h-4 text-emerald-600" />
          <div className="text-sm text-gray-900">{l('Прайс калькулятора', 'Калькулятор прайсы', 'Calculator price list')}</div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={resetToDefaults}
              className="px-2.5 py-1.5 rounded-lg text-[11px] bg-white ring-1 ring-slate-200 hover:bg-slate-50 flex items-center gap-1.5">
              <RotateCcw className="w-3 h-3" />{l('По умолчанию', 'Әдепкі', 'Defaults')}
            </button>
            <button onClick={save} disabled={saving || !dirty}
              className="px-3 py-1.5 rounded-lg text-[11px] bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-1.5">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              {l('Сохранить', 'Сақтау', 'Save')}
            </button>
          </div>
        )}
      </div>
      <div className="text-[11px] text-slate-400 mb-4 leading-relaxed">
        {l('По этим цифрам замерщик считает заказ, и они попадают в КП клиенту. Раньше цены были одинаковыми для всех — теперь у вас свои.',
           'Осы сандар бойынша өлшеуші есептейді, олар клиенттің КҰ-на түседі. Бұрын бағалар бәріне бірдей еді — енді өз бағаңыз.',
           'The measurer prices orders from these numbers and they end up in the client quote. Previously the prices were identical for everyone — now they are yours.')}
      </div>

      {!isAdmin && (
        <div className="mb-4 px-3 py-2 bg-amber-50 ring-1 ring-amber-100 rounded-xl text-[11px] text-amber-800">
          {l('Только просмотр: менять прайс может администратор.',
             'Тек қарау: прайсты әкімші өзгертеді.',
             'View only: an admin can change the price list.')}
        </div>
      )}

      <fieldset disabled={!isAdmin} className={!isAdmin ? 'opacity-70' : ''}>
        <div className="mb-4">
          <label className="block text-[11px] text-slate-400 mb-1">
            {l('Наценка по умолчанию, %', 'Әдепкі үстеме, %', 'Default markup, %')}
          </label>
          <input className={inp + ' w-28'} type="number" min={0} max={500} value={cfg.defaultMarkupPct}
            onChange={e => patch({ defaultMarkupPct: num(e.target.value) })} />
        </div>

        {renderProducts()}
        {renderMaterials()}
        {renderLines('addons', l('Доп. опции', 'Қосымша опциялар', 'Add-ons'),
          l('Разовые опции — предлагаются галочками в калькуляторе', 'Бір реттік опциялар — калькуляторда белгіленеді', 'One-off options — offered as checkboxes'))}
        {renderLines('services', l('Работы и услуги', 'Жұмыстар мен қызметтер', 'Labour and services'),
          l('Замер, доставка, установка — по умолчанию включены', 'Өлшеу, жеткізу, орнату — әдепкіде қосулы', 'Measurement, delivery, install — on by default'))}
      </fieldset>

      {dirty && isAdmin && (
        <div className="mt-4 text-[11px] text-amber-700">
          {l('Есть несохранённые изменения.', 'Сақталмаған өзгерістер бар.', 'You have unsaved changes.')}
        </div>
      )}
    </div>
  );
}

// ─── Мелкие помощники вёрстки ─────────────────────────────────────────
function replaceAt<T>(arr: T[], i: number, v: T): T[] {
  return arr.map((x, j) => j === i ? v : x);
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-xs text-slate-700 mb-0.5">{title}</div>
      {hint && <div className="text-[10px] text-slate-400 mb-2">{hint}</div>}
      {children}
    </div>
  );
}

function IconBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} type="button"
      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg flex-shrink-0">
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} type="button"
      className="text-[11px] text-slate-500 hover:text-slate-900 flex items-center gap-1">
      <Plus className="w-3 h-3" />{label}
    </button>
  );
}
