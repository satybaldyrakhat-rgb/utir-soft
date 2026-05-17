import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Upload, User, Package, CalendarClock, FileText } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';
import { t } from '../utils/translations';

// Seed shape — pre-fills the modal when opened from a BOM template.
// All fields optional; whatever is supplied overrides the empty defaults.
// Dispatched by Warehouse → BOM → «В заказ» via the
// 'sales:create-deal-from-template' custom event; SalesKanban catches
// and threads it through here.
export interface NewDealSeed {
  product?: string;        // e.g. «Кухня прямая 3м» (goes into product.template)
  amount?: number;         // ₸ (goes into term.amount)
  furnitureType?: string;  // «Кухня» / «Шкаф-купе» (goes into product.type)
  materials?: string;      // comma-separated list (goes into product.material)
  notes?: string;          // any source-of-truth note (goes into docs.notes)
  width?: number;          // mm
  depth?: number;
  height?: number;
}

interface Props { language: 'kz' | 'ru' | 'eng'; onClose: () => void; seed?: NewDealSeed; }

// Shared glass-input class so every field across all four tabs reads the
// same on the translucent dialog background.
const INPUT = 'w-full px-3 py-2.5 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all';
const LABEL = 'block text-[11px] text-slate-500 mb-1.5';

export function NewDealModal({ language, onClose, seed }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const tt = (key: Parameters<typeof t>[0]) => t(key, language);
  const store = useDataStore();
  const catalogs = store.catalogs;
  // When opened from a BOM template we jump straight to the «Product»
  // tab so the user sees the pre-filled fields immediately and only needs
  // to fill in client info on tab 0. Plain «Новая сделка» starts on tab 0.
  const [tab, setTab] = useState<0 | 1 | 2 | 3>(seed ? 1 : 0);
  const [client, setClient] = useState({ name: '', phone: '', email: '', address: '', siteAddress: '', source: 'Instagram' });
  // Seed overrides — note we convert mm dimensions to m for the UI
  // (which works in meters: 3000mm → 3m).
  const [product, setProduct] = useState({
    type: seed?.furnitureType || '',
    template: seed?.product || '',
    l: seed?.width ? seed.width / 1000 : 3,
    w: seed?.depth ? seed.depth / 1000 : 0.6,
    h: seed?.height ? seed.height / 1000 : 0.9,
    material: seed?.materials || '',
    color: '', hardware: '', addons: [] as string[],
  });
  const [term, setTerm] = useState({
    measureDate: '', measurer: '', readyDate: '', installDate: '',
    amount: seed?.amount || 0,
    payMethod: 'kaspi', prepay: 50,
  });
  const [docs, setDocs] = useState({ notes: seed?.notes || '' });
  // Owner — feeds the team-metrics dashboard precisely. Empty = unassigned.
  const [ownerId, setOwnerId] = useState('');

  // Tabs with icons so the wizard step bar reads visually, not just by
  // number. Tab labels stay numbered for muscle-memory.
  const TABS = [
    { label: l('Клиент', 'Клиент', 'Client'),         icon: User },
    { label: l('Изделие', 'Бұйым', 'Product'),         icon: Package },
    { label: l('Срок и оплата', 'Мерзім', 'Term & Pay'), icon: CalendarClock },
    { label: l('Документы', 'Құжаттар', 'Documents'),  icon: FileText },
  ];

  const toggleAddon = (a: string) => setProduct(p => ({ ...p, addons: p.addons.includes(a) ? p.addons.filter(x => x !== a) : [...p.addons, a] }));

  const create = (draft = false) => {
    if (!client.name) return;
    const sourceMap: Record<string, any> = { Instagram: 'instagram', WhatsApp: 'whatsapp', Telegram: 'telegram' };
    store.addDeal({
      customerName: client.name,
      phone: client.phone,
      address: client.address,
      siteAddress: client.siteAddress || undefined,
      workType: 'furniture',
      product: product.template || (product.type ? `${product.type} ${product.l}×${product.w}×${product.h}м` : `${product.l}×${product.w}×${product.h}м`),
      furnitureType: product.type,
      amount: term.amount,
      paidAmount: Math.round(term.amount * term.prepay / 100),
      status: draft ? 'new' : 'measured',
      icon: sourceMap[client.source] || 'phone',
      priority: 'medium',
      date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
      progress: draft ? 5 : 25,
      source: client.source,
      measurer: term.measurer,
      designer: '',
      foreman: undefined,
      architect: undefined,
      materials: product.material,
      measurementDate: term.measureDate,
      completionDate: term.readyDate,
      installationDate: term.installDate,
      paymentMethods: {
        cash: term.payMethod === 'cash',
        kaspi: term.payMethod === 'kaspi',
        halyk: term.payMethod === 'halyk',
        card_transfer: term.payMethod === 'card_transfer',
        bank_transfer: term.payMethod === 'bank_transfer',
        installment: term.payMethod === 'installment',
      },
      notes: docs.notes,
      ownerId: ownerId || undefined,
    });
    onClose();
  };

  const canNext = tab === 0 ? client.name.trim().length > 0 : true;

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-[0_24px_64px_-12px_var(--accent-shadow-sm)] overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/60 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400 mb-1 tracking-widest uppercase">{l('Заказы', 'Тапсырыстар', 'Orders')}</div>
            <div className="text-lg text-slate-900 tracking-tight">{l('Новая сделка', 'Жаңа мәміле', 'New Deal')}</div>
            {seed && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-violet-700 bg-violet-100/70 ring-1 ring-white/40 px-2 py-0.5 rounded-full">
                <span>{l('Из шаблона:', 'Шаблоннан:', 'From template:')}</span>
                <b className="truncate max-w-[180px]">{seed.product}</b>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-2xl flex items-center justify-center transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Tab bar — glass capsules instead of underline tabs */}
        <div className="px-6 pt-4 pb-3 flex gap-1.5 overflow-x-auto flex-shrink-0">
          {TABS.map((t, i) => {
            const Icon = t.icon;
            const active = tab === i;
            return (
              <button
                key={i}
                onClick={() => setTab(i as any)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs whitespace-nowrap ring-1 transition-all ${
                  active
                    ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]'
                    : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="tabular-nums">{i + 1}.</span> {t.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {tab === 0 && (<>
            <div>
              <label className={LABEL}>{l('Имя клиента', 'Клиент аты', 'Client Name')}</label>
              <input value={client.name} onChange={e => setClient({ ...client, name: e.target.value })} placeholder={tt('customerNameMask')} className={INPUT} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>{tt('phone')}</label>
                <input value={client.phone} onChange={e => setClient({ ...client, phone: e.target.value })} placeholder={tt('phoneMask')} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Email</label>
                <input value={client.email} onChange={e => setClient({ ...client, email: e.target.value })} placeholder={tt('emailMask')} className={INPUT} />
              </div>
            </div>
            <div>
              <label className={LABEL}>
                {tt('clientAddress')} <span className="text-slate-400">· {tt('clientAddressHint')}</span>
              </label>
              <input value={client.address} onChange={e => setClient({ ...client, address: e.target.value })} placeholder={tt('addressMask')} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>
                {tt('siteAddress')} <span className="text-slate-400">· {tt('siteAddressHint')}</span>
              </label>
              <input value={client.siteAddress} onChange={e => setClient({ ...client, siteAddress: e.target.value })} placeholder={tt('siteAddressMask')} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>{l('Источник', 'Көзі', 'Source')}</label>
              <select value={client.source} onChange={e => setClient({ ...client, source: e.target.value })} className={INPUT}>
                {['Instagram', 'WhatsApp', 'Telegram', 'Сайт', 'Рекомендация', 'Реклама Meta', 'Звонок', 'Visit'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </>)}

          {tab === 1 && (<>
            {/* All product attributes use user-managed catalogs (Settings → Справочники).
                Empty catalog → user just types whatever they need. */}
            <datalist id="dl-furniture-types">{catalogs.furnitureTypes.map(v => <option key={v} value={v} />)}</datalist>
            <datalist id="dl-product-templates">{catalogs.productTemplates.map(v => <option key={v} value={v} />)}</datalist>
            <datalist id="dl-materials">{catalogs.materials.map(v => <option key={v} value={v} />)}</datalist>
            <datalist id="dl-hardware">{catalogs.hardware.map(v => <option key={v} value={v} />)}</datalist>

            <div>
              <label className={LABEL}>{tt('furnitureType')}</label>
              <input list="dl-furniture-types" value={product.type} onChange={e => setProduct({ ...product, type: e.target.value })} placeholder={catalogs.furnitureTypes.length ? '' : tt('catalogEmpty')} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>{tt('productTemplate')}</label>
              <input list="dl-product-templates" value={product.template} onChange={e => setProduct({ ...product, template: e.target.value })} placeholder={catalogs.productTemplates.length ? '' : tt('catalogEmpty')} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>{l('Габариты (м)', 'Өлшемдері (м)', 'Dimensions (m)')}</label>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" step="0.1" value={product.l} onChange={e => setProduct({ ...product, l: +e.target.value })} placeholder={l('Длина', 'Ұзындық', 'Length')} className={INPUT} />
                <input type="number" step="0.1" value={product.w} onChange={e => setProduct({ ...product, w: +e.target.value })} placeholder={l('Ширина', 'Ені', 'Width')} className={INPUT} />
                <input type="number" step="0.1" value={product.h} onChange={e => setProduct({ ...product, h: +e.target.value })} placeholder={l('Высота', 'Биіктігі', 'Height')} className={INPUT} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>{tt('material')}</label>
                <input list="dl-materials" value={product.material} onChange={e => setProduct({ ...product, material: e.target.value })} placeholder={catalogs.materials.length ? '' : tt('catalogEmpty')} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>{l('Цвет / Декор', 'Түс / Декор', 'Color')}</label>
                <input value={product.color} onChange={e => setProduct({ ...product, color: e.target.value })} className={INPUT} />
              </div>
            </div>
            <div>
              <label className={LABEL}>{tt('hardware')}</label>
              <input list="dl-hardware" value={product.hardware} onChange={e => setProduct({ ...product, hardware: e.target.value })} placeholder={catalogs.hardware.length ? '' : tt('catalogEmpty')} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>{tt('addons')}</label>
              {catalogs.addons.length === 0 ? (
                <div className="text-[11px] text-slate-500 italic px-3 py-3 bg-white/40 ring-1 ring-white/60 rounded-2xl backdrop-blur-xl">
                  {tt('catalogEmpty')} · {tt('manageInCatalogs')}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {catalogs.addons.map(a => {
                    const checked = product.addons.includes(a);
                    return (
                      <label
                        key={a}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl text-xs cursor-pointer ring-1 transition-all ${
                          checked
                            ? 'bg-emerald-600 text-white ring-white/10'
                            : 'bg-white/50 text-slate-700 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
                        }`}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleAddon(a)} className="rounded accent-slate-900" />
                        {a}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </>)}

          {tab === 2 && (<>
            {/* Owner picker — explicit assignee for team-metrics attribution. */}
            <div>
              <label className={LABEL}>{l('Ответственный', 'Жауапты', 'Owner')}</label>
              <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className={INPUT}>
                <option value="">{l('Не назначен', 'Тағайындалмаған', 'Unassigned')}</option>
                {store.employees.filter((e: any) => !e.removed_at).map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={LABEL}>{l('Дата замера', 'Өлшеу күні', 'Measure date')}</label><input type="date" value={term.measureDate} onChange={e => setTerm({ ...term, measureDate: e.target.value })} className={INPUT} /></div>
              <div>
                <label className={LABEL}>{l('Замерщик', 'Өлшеуші', 'Measurer')}</label>
                <input type="text" value={term.measurer} onChange={e => setTerm({ ...term, measurer: e.target.value })} placeholder={tt('notSelected')} className={INPUT} />
              </div>
              <div><label className={LABEL}>{l('Готовность', 'Дайын болу', 'Ready')}</label><input type="date" value={term.readyDate} onChange={e => setTerm({ ...term, readyDate: e.target.value })} className={INPUT} /></div>
              <div><label className={LABEL}>{l('Установка', 'Орнату', 'Install')}</label><input type="date" value={term.installDate} onChange={e => setTerm({ ...term, installDate: e.target.value })} className={INPUT} /></div>
            </div>
            <div>
              <label className={LABEL}>{l('Сумма (₸)', 'Сома (₸)', 'Amount (₸)')}</label>
              <input type="number" value={term.amount || ''} onChange={e => setTerm({ ...term, amount: +e.target.value })} placeholder="0" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>{l('Способ оплаты', 'Төлем әдісі', 'Payment method')}</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { key: 'cash',          ru: 'Наличные',         kz: 'Қолма-қол',         eng: 'Cash' },
                  { key: 'kaspi',         ru: 'Kaspi',            kz: 'Kaspi',             eng: 'Kaspi' },
                  { key: 'halyk',         ru: 'Halyk Bank',       kz: 'Halyk Bank',        eng: 'Halyk Bank' },
                  { key: 'card_transfer', ru: 'Перевод на карту', kz: 'Картаға аударым',   eng: 'Card transfer' },
                  { key: 'bank_transfer', ru: 'Безнал (счёт)',    kz: 'Қолма-қолсыз',      eng: 'Bank transfer' },
                  { key: 'installment',   ru: 'Рассрочка',        kz: 'Бөліп төлеу',       eng: 'Installment' },
                ].map(p => {
                  const active = term.payMethod === p.key;
                  return (
                    <label
                      key={p.key}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl text-[11px] cursor-pointer ring-1 transition-all ${
                        active
                          ? 'bg-emerald-600 text-white ring-white/10'
                          : 'bg-white/50 text-slate-700 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
                      }`}
                    >
                      <input type="radio" checked={active} onChange={() => setTerm({ ...term, payMethod: p.key })} className="accent-slate-900" />
                      {l(p.ru, p.kz, p.eng)}
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <label className={LABEL}>
                {l(`Предоплата ${term.prepay}%`, `Алдын ала ${term.prepay}%`, `Prepay ${term.prepay}%`)}
              </label>
              <input
                type="range" min="0" max="100" value={term.prepay}
                onChange={e => setTerm({ ...term, prepay: +e.target.value })}
                className="w-full accent-slate-900"
              />
              <div className="text-[11px] text-slate-600 mt-1 tabular-nums">
                {Math.round(term.amount * term.prepay / 100).toLocaleString('ru-RU')} ₸
              </div>
            </div>
          </>)}

          {tab === 3 && (<>
            <div>
              <label className={LABEL}>{l('Эскизы / чертежи', 'Эскиздер', 'Sketches')}</label>
              <div className="border-2 border-dashed border-white/70 bg-white/30 backdrop-blur-xl rounded-2xl p-6 text-center hover:bg-white/50 cursor-pointer transition-colors">
                <Upload className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                <div className="text-xs text-slate-500">{l('Перетащите файлы сюда', 'Файлдарды осында', 'Drop files')}</div>
              </div>
            </div>
            <div>
              <label className={LABEL}>{l('Договор', 'Шарт', 'Contract')}</label>
              <div className="border-2 border-dashed border-white/70 bg-white/30 backdrop-blur-xl rounded-2xl p-6 text-center hover:bg-white/50 cursor-pointer transition-colors">
                <Upload className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                <div className="text-xs text-slate-500">PDF, DOCX</div>
              </div>
            </div>
            <div>
              <label className={LABEL}>{l('Заметки менеджера', 'Жазбалар', 'Notes')}</label>
              <textarea
                value={docs.notes}
                onChange={e => setDocs({ ...docs, notes: e.target.value })}
                rows={4}
                className={`${INPUT} resize-none`}
              />
            </div>
          </>)}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/60 flex items-center gap-2 flex-shrink-0 flex-wrap">
          <button
            onClick={() => setTab(Math.max(0, tab - 1) as any)}
            disabled={tab === 0}
            className="px-3 py-2 text-xs flex items-center gap-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded-xl hover:bg-white/50 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> {l('Назад', 'Артқа', 'Back')}
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-3 py-2 text-xs text-slate-500 hover:text-slate-900 rounded-xl hover:bg-white/50 transition-colors">
            {l('Отмена', 'Болдырмау', 'Cancel')}
          </button>
          <button
            onClick={() => create(true)}
            disabled={!client.name}
            className="px-3.5 py-2 bg-white/70 hover:bg-white ring-1 ring-white/60 rounded-2xl text-xs text-slate-700 transition-colors disabled:opacity-40"
          >
            {l('Черновик', 'Жоба', 'Draft')}
          </button>
          {tab < 3 ? (
            <button
              onClick={() => canNext && setTab(Math.min(3, tab + 1) as any)}
              disabled={!canNext}
              className="px-4 py-2 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 flex items-center gap-1 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 disabled:opacity-40 disabled:shadow-none transition-all"
            >
              {l('Вперёд', 'Алға', 'Next')} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => create(false)}
              disabled={!client.name}
              className="px-4 py-2 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 disabled:opacity-40 disabled:shadow-none transition-all"
            >
              {l('Создать сделку', 'Мәміле жасау', 'Create deal')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
