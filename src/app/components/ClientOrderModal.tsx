import { useEffect, useMemo, useState } from 'react';
import { X, FileText, Check, Banknote, CreditCard, QrCode, Wallet, Building2, Calendar as CalendarIcon, MessageCircle, Plus, Trash2, History, RotateCcw } from 'lucide-react';
import { t } from '../utils/translations';
import { useDataStore, type Deal } from '../utils/dataStore';
import { api } from '../utils/api';

type Lang = 'kz' | 'ru' | 'eng';

interface ClientOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  deal: Deal;
  language?: Lang;
}

// Default KZ payment methods enum — used when deal.paymentMethods is empty.
// Stored as keys so we can edit the dictionary without DB migrations.
const DEFAULT_PAYMENT_KEYS = ['cash', 'kaspi', 'halyk', 'card_transfer', 'bank_transfer', 'installment'] as const;

const PAYMENT_KEY_META: Record<string, { i18nKey?: keyof typeof import('../utils/translations').translations; icon: any; color: string }> = {
  cash:           { i18nKey: 'paymentMethodCash',         icon: Banknote,     color: 'text-green-600 bg-green-50' },
  kaspi:          { i18nKey: 'paymentMethodKaspi',        icon: QrCode,       color: 'text-red-600 bg-red-50' },
  halyk:          { i18nKey: 'paymentMethodHalyk',        icon: Wallet,       color: 'text-emerald-600 bg-emerald-50' },
  card_transfer:  { i18nKey: 'paymentMethodCardTransfer', icon: CreditCard,   color: 'text-blue-600 bg-blue-50' },
  bank_transfer:  { i18nKey: 'paymentMethodBankTransfer', icon: Building2,    color: 'text-gray-700 bg-gray-100' },
  installment:    { i18nKey: 'paymentMethodInstallment',  icon: CalendarIcon, color: 'text-purple-600 bg-purple-50' },
};

const formatKZT = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} ₸`;

export function ClientOrderModal({ isOpen, onClose, deal, language = 'ru' }: ClientOrderModalProps) {
  const store = useDataStore();
  const catalogs = store.catalogs;
  const [activeTab, setActiveTab] = useState<'main' | 'progress' | 'chat' | 'history'>('main');

  // History state — populated by the useEffect below once 'l' is defined.
  interface HistoryEntry { id: string; userId: string; userName: string; changes: Record<string, { before: any; after: any }>; createdAt: string }
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // All editable fields initialized from the current deal (no fake hardcodes).
  const [phone, setPhone] = useState(deal.phone || '');
  const [address, setAddress] = useState(deal.address || '');
  const [siteAddress, setSiteAddress] = useState(deal.siteAddress || '');
  const [source, setSource] = useState(deal.source || 'Instagram');
  const [measurer, setMeasurer] = useState(deal.measurer || '');
  const [designer, setDesigner] = useState(deal.designer || '');
  // Owner — employee responsible for the deal (used by team-metrics tab).
  const [ownerId, setOwnerId] = useState(deal.ownerId || '');
  const [furnitureType, setFurnitureType] = useState(deal.furnitureType || '');
  const [materials, setMaterials] = useState(deal.materials || '');
  const [measurementDate, setMeasurementDate] = useState(deal.measurementDate || '');
  const [completionDate, setCompletionDate] = useState(deal.completionDate || '');
  const [installationDate, setInstallationDate] = useState(deal.installationDate || '');
  const [notes, setNotes] = useState(deal.notes || '');
  const [paidAmount, setPaidAmount] = useState(deal.paidAmount || 0);


  // Payment methods: render whatever is on the deal; if none, seed default KZ enum.
  const initialPM: Record<string, boolean> = useMemo(() => {
    const fromDeal = deal.paymentMethods || {};
    if (Object.keys(fromDeal).length > 0) return { ...fromDeal };
    return Object.fromEntries(DEFAULT_PAYMENT_KEYS.map(k => [k, false]));
  }, [deal.id]);
  const [paymentMethods, setPaymentMethods] = useState<Record<string, boolean>>(initialPM);

  if (!isOpen) return null;

  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const tt = (key: Parameters<typeof t>[0]) => t(key, language);

  // Lazy-load history when the tab opens; cancelled-on-unmount guard prevents
  // state updates after the modal is closed.
  useEffect(() => {
    if (activeTab !== 'history') return;
    let cancelled = false;
    setHistoryLoading(true);
    api.get<HistoryEntry[]>(`/api/deals/${deal.id}/history`)
      .then(rows => { if (!cancelled) setHistory(rows); })
      .catch(err => { console.warn('[deal history] fetch failed', err); if (!cancelled) setHistory([]); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, deal.id]);

  // Friendly labels for the audit trail. Anything not in this map shows the
  // raw key, which is still readable (status, paidAmount, etc.).
  const FIELD_LABEL: Record<string, string> = {
    customerName: l('Клиент', 'Клиент', 'Customer'),
    phone: l('Телефон', 'Телефон', 'Phone'),
    address: l('Адрес', 'Мекенжай', 'Address'),
    siteAddress: l('Адрес объекта', 'Нысан мекенжайы', 'Site address'),
    product: l('Продукт', 'Өнім', 'Product'),
    furnitureType: l('Тип мебели', 'Жиһаз түрі', 'Furniture type'),
    amount: l('Сумма', 'Сома', 'Amount'),
    paidAmount: l('Оплачено', 'Төленген', 'Paid'),
    status: l('Статус', 'Күй', 'Status'),
    source: l('Источник', 'Көзі', 'Source'),
    measurer: l('Замерщик', 'Өлшеуші', 'Measurer'),
    designer: l('Дизайнер', 'Дизайнер', 'Designer'),
    foreman: l('Прораб', 'Прораб', 'Foreman'),
    architect: l('Архитектор', 'Сәулетші', 'Architect'),
    ownerId: l('Ответственный', 'Жауапты', 'Owner'),
    materials: l('Материалы', 'Материалдар', 'Materials'),
    measurementDate: l('Дата замера', 'Өлшеу күні', 'Measure date'),
    completionDate: l('Готовность', 'Дайын болу', 'Ready'),
    installationDate: l('Установка', 'Орнату', 'Install'),
    notes: l('Заметки', 'Жазбалар', 'Notes'),
    paymentMethods: l('Способы оплаты', 'Төлем тәсілдері', 'Payment methods'),
  };
  const formatHistoryValue = (key: string, val: any): string => {
    if (val === null || val === undefined || val === '') return '—';
    if (typeof val === 'number') return val.toLocaleString('ru-RU').replace(/,/g, ' ');
    if (typeof val === 'boolean') return val ? 'да' : 'нет';
    if (key === 'ownerId') return store.getEmployeeById(val)?.name || val;
    if (typeof val === 'object') {
      const enabled = Object.entries(val).filter(([, v]) => v).map(([k]) => k);
      return enabled.length > 0 ? enabled.join(', ') : '—';
    }
    return String(val);
  };

  // Rollback handler — POSTs to the dedicated endpoint, refreshes the store
  // (so the main tab reflects the restored values) and reloads history (so
  // the rollback row appears at the top of the timeline).
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const rollbackEntry = async (entryId: string) => {
    if (!confirm(l(
      'Откатить это изменение? Поля вернутся к значениям до этой правки. Операция запишется в историю.',
      'Бұл өзгерісті қайтару керек пе? Өрістер бұрынғы мәндерге оралады. Әрекет тарихқа жазылады.',
      'Roll this change back? Fields will be restored to their previous values. The rollback is recorded in the history.',
    ))) return;
    setRollingBackId(entryId);
    try {
      await api.post(`/api/deals/${deal.id}/history/${entryId}/rollback`, {});
      await store.reloadAll();
      // Re-fetch the history list to show the new rollback entry.
      const rows = await api.get<HistoryEntry[]>(`/api/deals/${deal.id}/history`);
      setHistory(rows);
    } catch (e: any) {
      alert(String(e?.message || 'rollback failed'));
    } finally {
      setRollingBackId(null);
    }
  };

  const remaining = Math.max(0, (deal.amount || 0) - (paidAmount || 0));
  const paidPercent = deal.amount > 0 ? Math.min(100, Math.round((paidAmount / deal.amount) * 100)) : 0;

  const addPaymentMethod = () => {
    const name = window.prompt(tt('newPaymentMethodPrompt'));
    if (!name) return;
    const key = name.trim();
    if (!key) return;
    if (key in paymentMethods) return;
    setPaymentMethods({ ...paymentMethods, [key]: true });
  };

  const removePaymentMethod = (key: string) => {
    const next = { ...paymentMethods };
    delete next[key];
    setPaymentMethods(next);
  };

  const handleSave = () => {
    store.updateDeal(deal.id, {
      workType: 'furniture',
      phone, address,
      siteAddress: siteAddress || undefined,
      source, measurer, designer,
      furnitureType, materials,
      measurementDate, completionDate, installationDate,
      notes, paidAmount, paymentMethods,
      ownerId: ownerId || undefined,
    });
    onClose();
  };

  const labelForPaymentKey = (key: string) => {
    const meta = PAYMENT_KEY_META[key];
    if (meta?.i18nKey) return tt(meta.i18nKey);
    return key; // custom method — show its raw name
  };
  const iconForPaymentKey = (key: string) => PAYMENT_KEY_META[key] ?? { icon: Wallet, color: 'text-gray-500 bg-gray-100' };

  const FieldInput = ({ label, value, onChange, ...props }: { label: string; value: string; onChange: (v: string) => void } & Record<string, any>) => (
    <div>
      <label className="block text-[11px] text-slate-500 mb-1.5">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all" {...props} />
    </div>
  );

  const FieldSelect = ({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) => (
    <div>
      <label className="block text-[11px] text-slate-500 mb-1.5">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all">{children}</select>
    </div>
  );

  const tabs = [
    { id: 'main'     as const, label: l('Информация', 'Ақпарат',  'Info') },
    { id: 'progress' as const, label: l('Прогресс',   'Прогресс', 'Progress') },
    { id: 'chat'     as const, label: l('Чат',        'Чат',      'Chat') },
    { id: 'history'  as const, label: l('История',    'Тарих',    'History') },
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white/85 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_24px_64px_-12px_var(--accent-shadow-sm)] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/60 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400 mb-1 tracking-widest uppercase">{l('Заказ', 'Тапсырыс', 'Order')} · #{(deal.id || '').slice(-6)}</div>
            <div className="text-lg text-slate-900 tracking-tight truncate">{deal.customerName}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">{deal.product} · <span className="tabular-nums">{deal.amount.toLocaleString('ru-RU')} ₸</span></div>
          </div>
          <button onClick={onClose} className="w-9 h-9 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-2xl flex items-center justify-center transition-colors flex-shrink-0">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Sync status (real 1C/ERP sync — coming later) */}
        <div className="px-6 py-2 bg-white/30 backdrop-blur-xl border-b border-white/60 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1.5 text-slate-500 px-2 py-0.5 rounded-full bg-white/50 ring-1 ring-white/60">
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
              {tt('notSynced')}
            </span>
            <span className="text-slate-400">{tt('syncSoon')}</span>
          </div>
        </div>

        {/* Tabs — glass capsules */}
        <div className="px-6 pt-4 pb-3 flex gap-1.5 flex-shrink-0 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs whitespace-nowrap ring-1 transition-all ${
                activeTab === tab.id
                  ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]'
                  : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
              }`}
            >
              {tab.id === 'chat' && <MessageCircle className="w-3 h-3" />}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* MAIN TAB — furniture-only, structured into clean sections */}
          {activeTab === 'main' && (
            <div className="p-5 space-y-6">
              {/* Datalists from user-managed catalogs (Settings → Справочники) */}
              <datalist id="dl-card-furniture-types">{catalogs.furnitureTypes.map(v => <option key={v} value={v} />)}</datalist>
              <datalist id="dl-card-materials">{catalogs.materials.map(v => <option key={v} value={v} />)}</datalist>

              {/* ── Section: Contacts ── */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">{l('Контакты', 'Байланыс', 'Contacts')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FieldInput label={tt('phone')} value={phone} onChange={setPhone} placeholder={tt('phoneMask')} />
                  <FieldSelect label={l('Источник', 'Көзі', 'Source')} value={source} onChange={setSource}>
                    <option>Instagram</option><option>WhatsApp</option><option>Facebook</option><option>{l('Реклама', 'Жарнама', 'Ads')}</option><option>{l('Рекомендация', 'Ұсыныс', 'Referral')}</option>
                  </FieldSelect>
                </div>
              </section>

              {/* ── Section: Object addresses ── */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">{l('Объект', 'Объект', 'Object')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FieldInput label={tt('clientAddress')} value={address} onChange={setAddress} placeholder={tt('addressMask')} />
                  <FieldInput label={tt('siteAddress')} value={siteAddress} onChange={setSiteAddress} placeholder={tt('siteAddressMask')} />
                </div>
              </section>

              {/* ── Section: Furniture details ── */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">{l('Изделие', 'Бұйым', 'Product')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1.5">{tt('furnitureType')}</label>
                    <input
                      list="dl-card-furniture-types"
                      value={furnitureType}
                      onChange={e => setFurnitureType(e.target.value)}
                      placeholder={catalogs.furnitureTypes.length ? '' : tt('catalogEmpty')}
                      className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1.5">{l('Материалы', 'Материалдар', 'Materials')}</label>
                    <input
                      list="dl-card-materials"
                      value={materials}
                      onChange={e => setMaterials(e.target.value)}
                      placeholder={catalogs.materials.length ? '' : tt('catalogEmpty')}
                      className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all"
                    />
                  </div>
                </div>
              </section>

              {/* ── Section: Team ── */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">{l('Команда', 'Команда', 'Team')}</div>
                {/* Owner — explicit employee link. Falls back to first-name match
                    on measurer/designer/foreman fields when missing; this makes
                    revenue / conversion in the Team-metrics tab accurate. */}
                <FieldSelect
                  label={l('Ответственный', 'Жауапты', 'Owner')}
                  value={ownerId}
                  onChange={setOwnerId}
                >
                  <option value="">{l('Не назначен', 'Тағайындалмаған', 'Unassigned')}</option>
                  {store.employees
                    .filter((e: any) => !e.removed_at)
                    .map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </FieldSelect>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <FieldInput label={tt('measurer')} value={measurer} onChange={setMeasurer} placeholder={tt('notSelected')} />
                  <FieldInput label={tt('designer')} value={designer} onChange={setDesigner} placeholder={tt('notSelected')} />
                </div>
              </section>

              {/* ── Section: AI Дизайн концепты ── */}
              <DesignConcepts deal={deal} language={language} />

              {/* ── Section: Notes ── */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">{l('Заметки', 'Жазбалар', 'Notes')}</div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder={l('Любые заметки по заказу', 'Тапсырыс бойынша жазбалар', 'Order notes')}
                  className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all resize-none"
                />
              </section>

              {/* ── Section: Documents (placeholder) ── */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">{l('Документы', 'Құжаттар', 'Documents')}</div>
                <div className="bg-white/40 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl px-3 py-3 flex items-center gap-2 text-[11px] text-slate-500">
                  <FileText className="w-3.5 h-3.5" />
                  {l('Загрузка файлов появится после интеграции хранилища', 'Файлдарды жүктеу қойма интеграциясынан кейін шығады', 'File uploads will appear after storage integration')}
                </div>
              </section>
            </div>
          )}

          {/* PROGRESS TAB */}
          {activeTab === 'progress' && (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Timeline — furniture lifecycle: Замер → Готовность → Установка */}
              <div>
                <div className="text-xs text-slate-900 mb-3">{l('Сроки', 'Мерзімдер', 'Timeline')}</div>
                <div className="space-y-2">
                  {[
                    { label: tt('timelineMeasure'),       date: measurementDate,   done: !!measurementDate },
                    { label: tt('timelineCompletion'),    date: completionDate,    done: false },
                    { label: tt('timelineInstallation'),  date: installationDate,  done: false },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl">
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center ring-1 ring-white/60 ${item.done ? 'bg-emerald-500 text-white' : 'bg-white/60 text-slate-400'}`}>
                        {item.done ? <Check className="w-3.5 h-3.5" /> : <span className="text-[10px] tabular-nums">{i + 1}</span>}
                      </div>
                      <div className="flex-1">
                        <div className="text-xs text-slate-900">{item.label}</div>
                        <div className="text-[10px] text-slate-500">{item.date || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-slate-500">{l('Прогресс', 'Прогресс', 'Progress')}</span>
                    <span className="text-slate-900 tabular-nums">65%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden ring-1 ring-white/40">
                    <div className="h-full bg-gradient-to-r from-sky-400 to-violet-400 rounded-full" style={{ width: '65%' }} />
                  </div>
                </div>
              </div>

              {/* Payment */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-slate-900">{tt('payment')}</div>
                  <button
                    onClick={addPaymentMethod}
                    className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-xl bg-white/50 ring-1 ring-white/60 hover:bg-white/80 transition-colors"
                  >
                    <Plus className="w-3 h-3" />{tt('addPaymentMethod')}
                  </button>
                </div>
                <div className="space-y-1.5 mb-4">
                  {Object.keys(paymentMethods).map(key => {
                    const meta = iconForPaymentKey(key);
                    const Icon = meta.icon;
                    const checked = !!paymentMethods[key];
                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-2.5 p-2.5 rounded-2xl transition-colors group ring-1 ${
                          checked ? 'bg-white/70 ring-white/60' : 'bg-white/30 ring-white/40 hover:bg-white/60'
                        } backdrop-blur-xl`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => setPaymentMethods({ ...paymentMethods, [key]: e.target.checked })}
                          className="w-3.5 h-3.5 rounded accent-slate-900"
                        />
                        <div className={`w-7 h-7 rounded-xl ring-1 ring-white/60 flex items-center justify-center ${meta.color.replace('bg-', 'bg-').replace('-50', '-100/70')}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs text-slate-700 flex-1">{labelForPaymentKey(key)}</span>
                        <button
                          onClick={() => removePaymentMethod(key)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-100/70 rounded-lg transition"
                          title={tt('delete')}
                        >
                          <Trash2 className="w-3 h-3 text-slate-400 hover:text-rose-600" />
                        </button>
                      </div>
                    );
                  })}
                  {Object.keys(paymentMethods).length === 0 && (
                    <div className="text-[11px] text-slate-500 italic px-2">{tt('paymentMethods')}: —</div>
                  )}
                </div>
                <div className="bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-4">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-slate-500">{tt('paid')}: <span className="tabular-nums">{paidPercent}%</span></span>
                    <span className="text-slate-900 tabular-nums">{formatKZT(paidAmount)} / {formatKZT(deal.amount || 0)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden ring-1 ring-white/40">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full" style={{ width: `${paidPercent}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px]">
                    <span className="text-slate-500">{tt('remaining')}</span>
                    <span className="text-slate-900 tabular-nums">{formatKZT(remaining)}</span>
                  </div>
                  <div className="mt-3">
                    <label className="block text-[10px] text-slate-500 mb-1">
                      {tt('paid')} ({tt('contractAmount')}: <span className="tabular-nums">{formatKZT(deal.amount || 0)}</span>)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={deal.amount || undefined}
                      value={paidAmount || ''}
                      onChange={e => setPaidAmount(Math.max(0, Number(e.target.value) || 0))}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-white/70 backdrop-blur-xl ring-1 ring-white/60 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CHAT TAB — empty state until WhatsApp Business integration ships */}
          {activeTab === 'chat' && (
            <div className="flex flex-col items-center justify-center min-h-[400px] py-12 px-6 text-center">
              <div className="w-14 h-14 bg-white/60 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl flex items-center justify-center mb-4">
                <MessageCircle className="w-6 h-6 text-slate-400" />
              </div>
              <div className="text-sm text-slate-900 mb-2">{tt('chatComingSoon')}</div>
              <div className="text-xs text-slate-500 max-w-md leading-relaxed mb-5">
                {tt('chatEmptyDesc')}
              </div>
              <button
                disabled
                className="px-4 py-2 bg-white/40 ring-1 ring-white/60 text-slate-400 rounded-2xl text-xs cursor-not-allowed backdrop-blur-xl"
                title={tt('syncSoon')}
              >
                {tt('connectWorkNumber')}
              </button>
            </div>
          )}

          {/* HISTORY TAB — audit trail of edits, newest first */}
          {activeTab === 'history' && (
            <div className="px-6 py-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-xl bg-white/60 ring-1 ring-white/60 flex items-center justify-center">
                  <History className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="text-sm text-slate-900">{l('История изменений', 'Өзгерістер тарихы', 'Change history')}</div>
              </div>
              {historyLoading && history.length === 0 && (
                <div className="text-xs text-slate-500 py-6 text-center">{l('Загрузка…', 'Жүктелуде…', 'Loading…')}</div>
              )}
              {!historyLoading && history.length === 0 && (
                <div className="text-xs text-slate-500 py-10 text-center">
                  {l('Пока изменений нет — карточка ни разу не редактировалась.',
                     'Әзірге өзгерістер жоқ — карточка әлі редакцияланбаған.',
                     'No edits yet — the deal has not been changed.')}
                </div>
              )}
              <div className="space-y-2.5">
                {history.map(entry => {
                  const isRollback = entry.userName?.includes('(rollback)');
                  const isTopActionable = !isRollback && entry.id === history.find(h => !h.userName?.includes('(rollback)'))?.id;
                  return (
                  <div key={entry.id} className="bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-3.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
                      <span>
                        <b className={isRollback ? 'text-amber-700' : 'text-slate-700'}>{entry.userName || l('Неизвестно', 'Белгісіз', 'Unknown')}</b>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">{new Date(entry.createdAt).toLocaleString(language === 'eng' ? 'en-GB' : 'ru-RU', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}</span>
                        {isTopActionable && (
                          <button
                            onClick={() => rollbackEntry(entry.id)}
                            disabled={rollingBackId === entry.id}
                            className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-amber-700 bg-amber-100/60 ring-1 ring-amber-200/40 hover:bg-amber-100 rounded-full transition-colors disabled:opacity-50"
                            title={l('Откатить эту правку', 'Бұл түзетуді қайтару', 'Roll back this change')}
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            {rollingBackId === entry.id
                              ? l('Откатываю…', 'Қайтарылуда…', 'Rolling back…')
                              : l('Откатить', 'Қайтару', 'Roll back')}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {Object.entries(entry.changes).map(([key, diff]) => (
                        <div key={key} className="text-[11px] flex flex-wrap items-baseline gap-1.5">
                          <span className="text-slate-500">{FIELD_LABEL[key] || key}:</span>
                          <span className="text-slate-400 line-through truncate max-w-[40%]">{formatHistoryValue(key, diff.before)}</span>
                          <span className="text-slate-300">→</span>
                          <span className="text-slate-900 truncate max-w-[40%]">{formatHistoryValue(key, diff.after)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/60 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 bg-white/60 ring-1 ring-white/60 rounded-2xl text-xs hover:bg-white text-slate-700 transition-colors">{tt('cancel')}</button>
          {/* Save hidden for roles with only 'view' permission on orders/sales.
              Without this they'd hit the form, edit, click Save and get a 403. */}
          {store.canWriteModule('orders') && (
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
            >
              {tt('save')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AI Дизайн concepts gallery (inside the deal modal) ───────────
// Pulls the team's generation history once and shows only the entries
// listed in deal.designIds. Admin/owner can detach individual concepts
// from this deal (doesn't delete the global generation — just unlinks).
function DesignConcepts({ deal, language }: { deal: Deal; language: 'kz' | 'ru' | 'eng' }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();
  const [history, setHistory] = useState<Array<{ id: string; provider: string; prompt: string; imageUrl: string | null; createdAt: string }>>([]);
  const designIds = deal.designIds || [];

  useEffect(() => {
    if (designIds.length === 0) { setHistory([]); return; }
    let cancelled = false;
    api.get<typeof history>('/api/ai-design/history')
      .then(rows => { if (!cancelled) setHistory(rows); })
      .catch(() => { if (!cancelled) setHistory([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designIds.length]);

  const attached = history.filter(h => designIds.includes(h.id));

  const detach = (id: string) => {
    const next = designIds.filter(x => x !== id);
    store.updateDeal(deal.id, { designIds: next });
  };

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
        <span>{l('AI Дизайн концепты', 'AI Дизайн концептері', 'AI Design concepts')}</span>
        <span className="text-slate-400 normal-case tabular-nums px-2 py-0.5 rounded-full bg-white/50 ring-1 ring-white/60">{designIds.length}</span>
      </div>
      {designIds.length === 0 ? (
        <div className="text-[11px] text-slate-500 leading-relaxed bg-white/40 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-3">
          {l(
            'Нет привязанных концептов. Сгенерируйте дизайн в разделе «AI Дизайн» и прикрепите его к сделке кнопкой «К сделке».',
            'Концептер жоқ. AI Дизайн бөлімінде дизайн жасап, мәмілеге қосыңыз.',
            'No concepts attached yet. Generate in AI Design and attach via «To deal».',
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {attached.map(c => (
            <div key={c.id} className="relative group">
              {c.imageUrl ? (
                <a href={c.imageUrl} target="_blank" rel="noreferrer">
                  <img src={c.imageUrl} alt={c.prompt} className="w-full aspect-square object-cover rounded-2xl ring-1 ring-white/60" />
                </a>
              ) : (
                <div className="w-full aspect-square bg-white/40 ring-1 ring-white/60 rounded-2xl flex items-center justify-center text-slate-400">—</div>
              )}
              <div className="absolute bottom-1.5 left-1.5 right-1.5 px-2 py-0.5 bg-emerald-600/70 backdrop-blur-xl text-white text-[9px] rounded-full truncate ring-1 ring-white/20">
                {c.provider}
              </div>
              <button
                onClick={() => detach(c.id)}
                className="absolute top-1.5 right-1.5 w-6 h-6 bg-emerald-600/70 backdrop-blur-xl text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-emerald-700/90 transition-opacity ring-1 ring-white/20"
                title={l('Открепить', 'Ажырату', 'Detach')}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {/* Stale ids (concept got deleted) — show placeholder so admin knows. */}
          {designIds.filter(id => !history.find(h => h.id === id)).map(id => (
            <div key={id} className="relative">
              <div className="w-full aspect-square bg-white/30 border-2 border-dashed border-white/60 rounded-2xl flex flex-col items-center justify-center text-[10px] text-slate-500 p-2 text-center backdrop-blur-xl">
                {l('Удалён', 'Жойылды', 'Deleted')}
                <button onClick={() => detach(id)} className="mt-1 text-rose-600 hover:text-rose-700">{l('убрать', 'жою', 'remove')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}