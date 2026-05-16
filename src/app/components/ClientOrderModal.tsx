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
      <label className="block text-[11px] text-gray-400 mb-1">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" {...props} />
    </div>
  );

  const FieldSelect = ({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) => (
    <div>
      <label className="block text-[11px] text-gray-400 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none">{children}</select>
    </div>
  );

  const tabs = [
    { id: 'main'     as const, label: l('Информация', 'Ақпарат',  'Info') },
    { id: 'progress' as const, label: l('Прогресс',   'Прогресс', 'Progress') },
    { id: 'chat'     as const, label: l('Чат',        'Чат',      'Chat') },
    { id: 'history'  as const, label: l('История',    'Тарих',    'History') },
  ];

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="text-sm text-gray-900">{deal.customerName}</div>
            <div className="text-[10px] text-gray-400">{l('Заказ', 'Тапсырыс', 'Order')} #{deal.id} · {deal.product} · {deal.amount.toLocaleString()} ₸</div>
          </div>
          <button onClick={onClose} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-gray-400" /></button>
        </div>

        {/* Sync status (real 1C/ERP sync — coming later) */}
        <div className="px-5 py-2 bg-gray-50/50 border-b border-gray-50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1 text-gray-400">
              <span className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
              {tt('notSynced')}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-[10px] text-gray-400">{tt('syncSoon')}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 border-b border-gray-50 flex gap-1 flex-shrink-0">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-3 py-2.5 text-xs transition-all border-b-2 ${activeTab === tab.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
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
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">{l('Контакты', 'Байланыс', 'Contacts')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FieldInput label={tt('phone')} value={phone} onChange={setPhone} placeholder={tt('phoneMask')} />
                  <FieldSelect label={l('Источник', 'Көзі', 'Source')} value={source} onChange={setSource}>
                    <option>Instagram</option><option>WhatsApp</option><option>Facebook</option><option>{l('Реклама', 'Жарнама', 'Ads')}</option><option>{l('Рекомендация', 'Ұсыныс', 'Referral')}</option>
                  </FieldSelect>
                </div>
              </section>

              {/* ── Section: Object addresses ── */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">{l('Объект', 'Объект', 'Object')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FieldInput label={tt('clientAddress')} value={address} onChange={setAddress} placeholder={tt('addressMask')} />
                  <FieldInput label={tt('siteAddress')} value={siteAddress} onChange={setSiteAddress} placeholder={tt('siteAddressMask')} />
                </div>
              </section>

              {/* ── Section: Furniture details ── */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">{l('Изделие', 'Бұйым', 'Product')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">{tt('furnitureType')}</label>
                    <input
                      list="dl-card-furniture-types"
                      value={furnitureType}
                      onChange={e => setFurnitureType(e.target.value)}
                      placeholder={catalogs.furnitureTypes.length ? '' : tt('catalogEmpty')}
                      className="w-full px-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">{l('Материалы', 'Материалдар', 'Materials')}</label>
                    <input
                      list="dl-card-materials"
                      value={materials}
                      onChange={e => setMaterials(e.target.value)}
                      placeholder={catalogs.materials.length ? '' : tt('catalogEmpty')}
                      className="w-full px-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                    />
                  </div>
                </div>
              </section>

              {/* ── Section: Team ── */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">{l('Команда', 'Команда', 'Team')}</div>
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
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">{l('Заметки', 'Жазбалар', 'Notes')}</div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder={l('Любые заметки по заказу', 'Тапсырыс бойынша жазбалар', 'Order notes')}
                  className="w-full px-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none"
                />
              </section>

              {/* ── Section: Documents (placeholder) ── */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">{l('Документы', 'Құжаттар', 'Documents')}</div>
                <div className="bg-gray-50 rounded-xl px-3 py-3 flex items-center gap-2 text-[11px] text-gray-400">
                  <FileText className="w-3.5 h-3.5" />
                  {l('Загрузка файлов появится после интеграции хранилища', 'Файлдарды жүктеу қойма интеграциясынан кейін шығады', 'File uploads will appear after storage integration')}
                </div>
              </section>
            </div>
          )}

          {/* PROGRESS TAB */}
          {activeTab === 'progress' && (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Timeline — furniture lifecycle: Замер → Готовность → Установка */}
              <div>
                <div className="text-xs text-gray-900 mb-3">{l('Сроки', 'Мерзімдер', 'Timeline')}</div>
                <div className="space-y-3">
                  {[
                    { label: tt('timelineMeasure'),       date: measurementDate,   done: !!measurementDate },
                    { label: tt('timelineCompletion'),    date: completionDate,    done: false },
                    { label: tt('timelineInstallation'),  date: installationDate,  done: false },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${item.done ? 'bg-green-500' : 'bg-gray-200'}`}>
                        {item.done ? <Check className="w-3 h-3 text-white" /> : <span className="text-[9px] text-white">{i + 1}</span>}
                      </div>
                      <div className="flex-1"><div className="text-xs text-gray-900">{item.label}</div><div className="text-[10px] text-gray-400">{item.date}</div></div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[10px] mb-1"><span className="text-gray-400">{l('Прогресс', 'Прогресс', 'Progress')}</span><span className="text-gray-900">65%</span></div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-gray-900 rounded-full" style={{ width: '65%' }} /></div>
                </div>
              </div>

              {/* Payment */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-900">{tt('payment')}</div>
                  <button
                    onClick={addPaymentMethod}
                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-50"
                  >
                    <Plus className="w-3 h-3" />{tt('addPaymentMethod')}
                  </button>
                </div>
                <div className="space-y-1.5 mb-4">
                  {Object.keys(paymentMethods).map(key => {
                    const meta = iconForPaymentKey(key);
                    const Icon = meta.icon;
                    return (
                      <div key={key} className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                        <input
                          type="checkbox"
                          checked={!!paymentMethods[key]}
                          onChange={e => setPaymentMethods({ ...paymentMethods, [key]: e.target.checked })}
                          className="w-3.5 h-3.5 rounded accent-gray-900"
                        />
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${meta.color}`}><Icon className="w-3.5 h-3.5" /></div>
                        <span className="text-xs text-gray-700 flex-1">{labelForPaymentKey(key)}</span>
                        <button
                          onClick={() => removePaymentMethod(key)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded-lg transition"
                          title={tt('delete')}
                        >
                          <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    );
                  })}
                  {Object.keys(paymentMethods).length === 0 && (
                    <div className="text-[11px] text-gray-400 italic px-2">{tt('paymentMethods')}: —</div>
                  )}
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-gray-400">{tt('paid')}: {paidPercent}%</span>
                    <span className="text-gray-900">{formatKZT(paidAmount)} / {formatKZT(deal.amount || 0)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${paidPercent}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px]">
                    <span className="text-gray-400">{tt('remaining')}</span>
                    <span className="text-gray-900">{formatKZT(remaining)}</span>
                  </div>
                  <div className="mt-2">
                    <label className="block text-[10px] text-gray-400 mb-1">{tt('paid')} ({tt('contractAmount')}: {formatKZT(deal.amount || 0)})</label>
                    <input
                      type="number"
                      min={0}
                      max={deal.amount || undefined}
                      value={paidAmount || ''}
                      onChange={e => setPaidAmount(Math.max(0, Number(e.target.value) || 0))}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 bg-white border-0 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-gray-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CHAT TAB — empty state until WhatsApp Business integration ships */}
          {activeTab === 'chat' && (
            <div className="flex flex-col items-center justify-center min-h-[400px] py-12 px-6 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <MessageCircle className="w-6 h-6 text-gray-400" />
              </div>
              <div className="text-sm text-gray-900 mb-2">{tt('chatComingSoon')}</div>
              <div className="text-xs text-gray-500 max-w-md leading-relaxed mb-5">
                {tt('chatEmptyDesc')}
              </div>
              <button
                disabled
                className="px-4 py-2 bg-gray-100 text-gray-400 rounded-xl text-xs cursor-not-allowed"
                title={tt('syncSoon')}
              >
                {tt('connectWorkNumber')}
              </button>
            </div>
          )}

          {/* HISTORY TAB — audit trail of edits, newest first */}
          {activeTab === 'history' && (
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-gray-400" />
                <div className="text-sm text-gray-900">{l('История изменений', 'Өзгерістер тарихы', 'Change history')}</div>
              </div>
              {historyLoading && history.length === 0 && (
                <div className="text-xs text-gray-400 py-6 text-center">{l('Загрузка…', 'Жүктелуде…', 'Loading…')}</div>
              )}
              {!historyLoading && history.length === 0 && (
                <div className="text-xs text-gray-400 py-10 text-center">
                  {l('Пока изменений нет — карточка ни разу не редактировалась.',
                     'Әзірге өзгерістер жоқ — карточка әлі редакцияланбаған.',
                     'No edits yet — the deal has not been changed.')}
                </div>
              )}
              <div className="space-y-3">
                {history.map(entry => {
                  // Only the latest non-rollback entry gets a Rollback button.
                  // (Rolling back an old entry mid-timeline is hard to reason
                  // about — admin can roll back top-most repeatedly instead.)
                  const isRollback = entry.userName?.includes('(rollback)');
                  const isTopActionable = !isRollback && entry.id === history.find(h => !h.userName?.includes('(rollback)'))?.id;
                  return (
                  <div key={entry.id} className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 mb-2">
                      <span>
                        <b className={isRollback ? 'text-amber-700' : 'text-gray-700'}>{entry.userName || l('Неизвестно', 'Белгісіз', 'Unknown')}</b>
                      </span>
                      <div className="flex items-center gap-2">
                        <span>{new Date(entry.createdAt).toLocaleString(language === 'eng' ? 'en-GB' : 'ru-RU', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}</span>
                        {isTopActionable && (
                          <button
                            onClick={() => rollbackEntry(entry.id)}
                            disabled={rollingBackId === entry.id}
                            className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-amber-700 hover:bg-amber-50 rounded transition-colors disabled:opacity-50"
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
                          <span className="text-gray-500">{FIELD_LABEL[key] || key}:</span>
                          <span className="text-gray-400 line-through truncate max-w-[40%]">{formatHistoryValue(key, diff.before)}</span>
                          <span className="text-gray-300">→</span>
                          <span className="text-gray-900 truncate max-w-[40%]">{formatHistoryValue(key, diff.after)}</span>
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
        <div className="px-5 py-3 border-t border-gray-50 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">{tt('cancel')}</button>
          {/* Save hidden for roles with only 'view' permission on orders/sales.
              Without this they'd hit the form, edit, click Save and get a 403. */}
          {store.canWriteModule('orders') && (
            <button onClick={handleSave} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">{tt('save')}</button>
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
      <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-3 flex items-center justify-between">
        <span>{l('AI Дизайн концепты', 'AI Дизайн концептері', 'AI Design concepts')}</span>
        <span className="text-gray-300 normal-case">{designIds.length}</span>
      </div>
      {designIds.length === 0 ? (
        <div className="text-[11px] text-gray-400 leading-relaxed bg-gray-50 rounded-xl p-3">
          {l(
            'Нет привязанных концептов. Сгенерируйте дизайн в разделе «AI Дизайн» и нажмите 🔗, чтобы прикрепить сюда.',
            'Концептер жоқ. AI Дизайн бөлімінде дизайн жасап, осында тіркеу үшін 🔗 басыңыз.',
            'No concepts attached yet. Generate in AI Design and click 🔗 to attach here.',
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {attached.map(c => (
            <div key={c.id} className="relative group">
              {c.imageUrl ? (
                <a href={c.imageUrl} target="_blank" rel="noreferrer">
                  <img src={c.imageUrl} alt={c.prompt} className="w-full aspect-square object-cover rounded-xl border border-gray-100" />
                </a>
              ) : (
                <div className="w-full aspect-square bg-gray-100 rounded-xl flex items-center justify-center text-gray-300">—</div>
              )}
              <div className="absolute bottom-1 left-1 right-1 px-1.5 py-0.5 bg-black/60 text-white text-[9px] rounded truncate">
                {c.provider}
              </div>
              <button
                onClick={() => detach(c.id)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-opacity"
                title={l('Открепить', 'Ажырату', 'Detach')}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {/* Stale ids (concept got deleted) — show placeholder so admin knows. */}
          {designIds.filter(id => !history.find(h => h.id === id)).map(id => (
            <div key={id} className="relative">
              <div className="w-full aspect-square bg-gray-50 border border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-[10px] text-gray-400 p-2 text-center">
                {l('Удалён', 'Жойылды', 'Deleted')}
                <button onClick={() => detach(id)} className="mt-1 text-red-400 hover:text-red-600">{l('убрать', 'жою', 'remove')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}