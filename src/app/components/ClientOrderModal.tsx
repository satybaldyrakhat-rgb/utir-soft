import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { X, FileText, Check, Banknote, CreditCard, QrCode, Wallet, Building2, Calendar as CalendarIcon, MessageCircle, Plus, Trash2, History, RotateCcw, AlertTriangle, Loader2, Upload, Download, FileSpreadsheet, FileImage, Paperclip, Layers, Package, ListChecks, ShoppingCart, ExternalLink, Wrench, Truck, TrendingUp, Star } from 'lucide-react';
import { t } from '../utils/translations';
import { useDataStore, type Deal } from '../utils/dataStore';
import { getNiche } from '../utils/niches';
import { api } from '../utils/api';
import { toast } from '../utils/toast';
import { confirmDialog } from '../utils/confirm';
import { NicheIcon } from './NicheIcon';
import { LEAD_SOURCES, LOST_REASONS } from '../utils/marketing';
import { DEFAULT_STAGES_TEMPLATE, type DealStage, type ConsumedMaterial } from './Warehouse';

type Lang = 'kz' | 'ru' | 'eng';

interface ClientOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  deal: Deal;
  language?: Lang;
}

// ─── Hoisted form helpers ─────────────────────────────────────────
// Defined OUTSIDE the parent component so React doesn't rebuild them
// on every render — the previous in-line definition caused the focus
// to drop after every keystroke on slower devices.
const FieldInput = ({ label, value, onChange, ...props }: { label: string; value: string; onChange: (v: string) => void } & Record<string, any>) => (
  <div>
    <label className="block text-[11px] text-slate-500 mb-1.5">{label}</label>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all"
      {...props}
    />
  </div>
);

const FieldSelect = ({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) => (
  <div>
    <label className="block text-[11px] text-slate-500 mb-1.5">{label}</label>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all"
    >
      {children}
    </select>
  </div>
);

// ─── Document attachment shape ─────────────────────────────────────
// Stored on the deal JSON blob as deal.documents = DealDoc[]. The
// platform already uses data URLs for uploads (see /transcribe in
// server/index.ts) and the express.json body limit is 25 MB, so we
// keep this pattern instead of adding multer + a file store.
// Limit: 5 MB per file, max 10 files per deal — large enough for
// contracts, measurement photos, and Excel quotes; small enough to
// not bloat the SQLite blob.
interface DealDoc {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  uploadedAt: string;
  uploadedBy?: string;
}
const MAX_DOC_SIZE  = 5 * 1024 * 1024;   // 5 MB
const MAX_DOCS_PER_DEAL = 10;
const docId = () => 'doc_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};
const docIcon = (type: string) => {
  if (/^image\//.test(type)) return FileImage;
  if (/sheet|excel|csv/i.test(type)) return FileSpreadsheet;
  return FileText;
};
// File → data URL via FileReader.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error || new Error('read failed'));
    r.readAsDataURL(file);
  });
}

// 6-stage status pipeline. Drives the status editor + progress bar
// + production module visibility. Kept in sync with stageConfig
// in SalesKanban.tsx — if you add a stage there, mirror it here.
const STATUS_OPTIONS: Array<{ id: string; ru: string; kz: string; eng: string; progress: number }> = [
  { id: 'new',             ru: 'Новая заявка',     kz: 'Жаңа өтінім',     eng: 'New Lead',          progress: 5  },
  { id: 'measured',        ru: 'Замер',            kz: 'Өлшем',            eng: 'Measured',         progress: 25 },
  { id: 'project-agreed',  ru: 'Проект и договор', kz: 'Жоба және шарт',  eng: 'Project & Contract',progress: 50 },
  { id: 'production',      ru: 'Производство',     kz: 'Өндіріс',          eng: 'Production',       progress: 70 },
  { id: 'installation',    ru: 'Установка',        kz: 'Орнату',           eng: 'Installation',     progress: 88 },
  { id: 'completed',       ru: 'Завершено',        kz: 'Аяқталды',         eng: 'Completed',        progress: 100 },
  { id: 'rejected',        ru: 'Отказ',            kz: 'Бас тарту',        eng: 'Rejected',         progress: 0  },
];
const statusIndex = (s: string) => Math.max(0, STATUS_OPTIONS.findIndex(o => o.id === s));

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
  // True when the team has multi-niche enabled — drives whether we show
  // the niche chip in the header and the "Тип проекта" picker in the form.
  const showNicheChip = store.secondaryNiches.length > 0;
  const [activeTab, setActiveTab] = useState<'main' | 'progress' | 'related' | 'chat' | 'history'>('main');

  // History state — populated by the useEffect below once 'l' is defined.
  interface HistoryEntry { id: string; userId: string; userName: string; changes: Record<string, { before: any; after: any }>; createdAt: string }
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // All editable fields initialized from the current deal (no fake hardcodes).
  const [phone, setPhone] = useState(deal.phone || '');
  const [address, setAddress] = useState(deal.address || '');
  const [siteAddress, setSiteAddress] = useState(deal.siteAddress || '');
  const [source, setSource] = useState(deal.source || 'Instagram');
  // Маркетинг — кампания/объявление, рекомендатель, причина отказа.
  const [campaign, setCampaign] = useState(deal.campaign || '');
  const [referrerName, setReferrerName] = useState(deal.referrerName || '');
  const [lostReason, setLostReason] = useState(deal.lostReason || '');
  // Следующий шаг — дата + заметка («перезвонить 10 июня»).
  const [nextActionAt, setNextActionAt] = useState(deal.nextActionAt || '');
  const [nextActionNote, setNextActionNote] = useState(deal.nextActionNote || '');
  // Чек-лист приёмки монтажа.
  const [installChecklist, setInstallChecklist] = useState<{ label: string; done: boolean }[]>(deal.installChecklist || []);
  const [measurer, setMeasurer] = useState(deal.measurer || '');
  const [designer, setDesigner] = useState(deal.designer || '');
  const [foreman, setForeman] = useState(deal.foreman || '');
  const [architect, setArchitect] = useState(deal.architect || '');
  // Owner — employee responsible for the deal (used by team-metrics tab).
  const [ownerId, setOwnerId] = useState(deal.ownerId || '');
  const [furnitureType, setFurnitureType] = useState(deal.furnitureType || '');
  // Per-deal niche — only editable for multi-niche teams. Initialised
  // from the deal's own niche (or the team primary if the deal has none).
  // The form labels below (productTypeLabel, role labels, material
  // categories) re-key live when this changes.
  const [editNiche, setEditNiche] = useState<string>(deal.niche || store.niche);
  // Resolved niche config for every label below. Updates instantly when
  // the user picks a different "Тип проекта".
  const dealNiche = getNiche(editNiche);
  const [materials, setMaterials] = useState(deal.materials || '');
  const [measurementDate, setMeasurementDate] = useState(deal.measurementDate || '');
  const [completionDate, setCompletionDate] = useState(deal.completionDate || '');
  const [installationDate, setInstallationDate] = useState(deal.installationDate || '');
  const [notes, setNotes] = useState(deal.notes || '');
  const [paidAmount, setPaidAmount] = useState(deal.paidAmount || 0);
  // Status editor — was missing entirely (status could only change via
  // kanban drag-and-drop). Now editable inline; changes drive Production
  // module visibility, Telegram notifications, and progress derivation.
  const [status, setStatus] = useState(deal.status || 'new');
  // КЗ-стандарт: БИН/ИИН клиента — нужен для счёта и акта. 12 цифр.
  const [customerBIN, setCustomerBIN] = useState(deal.customerBIN || '');
  // Document attachments. Persisted on the deal blob alongside everything
  // else. Max 5 MB / file, max 10 files (see MAX_DOC_* constants).
  const [documents, setDocuments] = useState<DealDoc[]>((deal as any).documents || []);
  const [docError, setDocError] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Save-state machinery — replaces silent fire-and-forget. Surfaces
  // network/permission errors instead of closing the modal blindly.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Client tracking link — minted on demand, copied to share with the
  // customer so they follow the order without a login.
  // Акт сверки взаиморасчётов — across ALL deals of this customer.
  const [sverkaBusy, setSverkaBusy] = useState(false);
  const downloadSverka = async () => {
    setSverkaBusy(true);
    try {
      const pdf = await import('../utils/pdfReports');
      let req: any = {};
      try { req = await api.get('/api/team/requisites'); } catch { /* best-effort */ }
      // All non-rejected deals of the same customer → debit (начислено) /
      // credit (оплачено) lines, oldest first.
      const custLow = (deal.customerName || '').toLowerCase().trim();
      const lines = store.deals
        .filter(d => d.status !== 'rejected' && (d.customerName || '').toLowerCase().trim() === custLow)
        .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
        .map(d => ({
          date: (d.createdAt || '').slice(0, 10),
          doc: `Заказ #${(d.id || '').slice(-6)} · ${d.product || ''}`.trim(),
          debit: d.amount || 0,
          credit: d.paidAmount || 0,
        }));
      await pdf.generateReconciliationPDF(
        { counterpartyName: deal.customerName || '—', counterpartyBIN: deal.customerBIN, lines },
        req || {},
      );
    } catch (e: any) { toast(String(e?.message || e), 'error'); }
    finally { setSverkaBusy(false); }
  };

  const [trackCopied, setTrackCopied] = useState(false);
  const copyTrackLink = async () => {
    try {
      const r = await api.get<{ link: string }>(`/api/deals/${deal.id}/track-link`);
      try { await navigator.clipboard.writeText(r.link); }
      catch {
        const ta = document.createElement('textarea'); ta.value = r.link; document.body.appendChild(ta);
        ta.select(); try { document.execCommand('copy'); } catch { /* ignore */ } document.body.removeChild(ta);
      }
      setTrackCopied(true);
      setTimeout(() => setTrackCopied(false), 2200);
    } catch { /* ignore */ }
  };

  // Запрос отзыва в 1 клик — открывает WhatsApp клиенту с ссылкой на
  // страницу заказа, где после завершения он ставит оценку (см. ClientTrack).
  const requestReview = async () => {
    try {
      const r = await api.get<{ link: string }>(`/api/deals/${deal.id}/track-link`);
      const ph = (deal.phone || '').replace(/\D/g, '');
      const first = (deal.customerName || '').split(/\s+/)[0];
      const msg = l(
        `${first ? first + ', з' : 'З'}дравствуйте! Спасибо, что выбрали нас 🙌 Будем благодарны за короткий отзыв — это займёт 10 секунд: ${r.link}`,
        `${first ? first + ', с' : 'С'}әлеметсіз бе! Бізді таңдағаныңызға рахмет 🙌 Қысқа пікір қалдырсаңыз қуанамыз: ${r.link}`,
        `${first ? first + ', h' : 'H'}i! Thanks for choosing us 🙌 We'd love a quick review — it takes 10 seconds: ${r.link}`,
      );
      window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank');
    } catch { toast(l('Не удалось получить ссылку', 'Сілтеме алынбады', 'Could not get link'), 'error'); }
  };

  // Payment methods: render whatever is on the deal; if none, seed default KZ enum.
  const initialPM: Record<string, boolean> = useMemo(() => {
    const fromDeal = deal.paymentMethods || {};
    if (Object.keys(fromDeal).length > 0) return { ...fromDeal };
    return Object.fromEntries(DEFAULT_PAYMENT_KEYS.map(k => [k, false]));
  }, [deal.id]);
  const [paymentMethods, setPaymentMethods] = useState<Record<string, boolean>>(initialPM);

  // ─── Re-init the form ONLY when a different deal opens ────────────
  // Bug fix: previously this effect depended on the whole `deal` object
  // (and every field), so ANY background update to the same deal — a
  // server poll, a Telegram status change, a parent re-render that hands
  // us a fresh `deal` object reference — re-ran it and OVERWROTE whatever
  // the user was typing (dates "flew away" mid-entry, edits weren't kept).
  // Now it keys only on the deal identity + open state: opening another
  // deal (or re-opening the modal) rebuilds the form, but background
  // refreshes of the SAME open deal never clobber in-progress edits.
  useEffect(() => {
    setPhone(deal.phone || '');
    setAddress(deal.address || '');
    setSiteAddress(deal.siteAddress || '');
    setSource(deal.source || 'Instagram');
    setCampaign(deal.campaign || '');
    setReferrerName(deal.referrerName || '');
    setLostReason(deal.lostReason || '');
    setNextActionAt(deal.nextActionAt || '');
    setNextActionNote(deal.nextActionNote || '');
    setInstallChecklist(deal.installChecklist || []);
    setMeasurer(deal.measurer || '');
    setDesigner(deal.designer || '');
    setForeman(deal.foreman || '');
    setArchitect(deal.architect || '');
    setOwnerId(deal.ownerId || '');
    setFurnitureType(deal.furnitureType || '');
    setEditNiche(deal.niche || store.niche);
    setMaterials(deal.materials || '');
    setMeasurementDate(deal.measurementDate || '');
    setCompletionDate(deal.completionDate || '');
    setInstallationDate(deal.installationDate || '');
    setNotes(deal.notes || '');
    setPaidAmount(deal.paidAmount || 0);
    setStatus(deal.status || 'new');
    setCustomerBIN(deal.customerBIN || '');
    setDocuments((deal as any).documents || []);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.id, isOpen]);

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
    // Niche-aware — "Тип мебели" was hardcoded, broken for windows/doors/etc.
    furnitureType: dealNiche.productTypeLabel[language],
    amount: l('Сумма', 'Сома', 'Amount'),
    paidAmount: l('Оплачено', 'Төленген', 'Paid'),
    status: l('Статус', 'Күй', 'Status'),
    source: l('Источник', 'Көзі', 'Source'),
    // Niche-aware role names — for windows/blinds the measurer label
    // might be "Замерщик", for ceilings "Замерщик-консультант", etc.
    measurer: dealNiche.roleLabels.measurer[language],
    designer: dealNiche.roleLabels.designer[language],
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
  // Translates raw status codes ('measured', 'project-agreed') to the
  // user's language. Used in the history audit trail so users don't
  // see English/internal identifiers.
  const STATUS_LABELS: Record<string, string> = Object.fromEntries(
    STATUS_OPTIONS.map(o => [o.id, o[language]]),
  );
  // Friendly labels for the payment method keys so the history reads
  // "Способы оплаты: Наличные, Kaspi" instead of "cash, kaspi".
  const PAYMENT_KEY_LABEL: Record<string, string> = {
    cash:          l('Наличные',          'Қолма-қол',       'Cash'),
    kaspi:         l('Kaspi (перевод/QR)', 'Kaspi',           'Kaspi'),
    halyk:         l('Halyk Bank',        'Halyk Bank',       'Halyk Bank'),
    card_transfer: l('Перевод на карту',  'Картаға аудару',   'Card transfer'),
    bank_transfer: l('Безнал',            'Қолма-қол емес',   'Bank transfer'),
    installment:   l('Рассрочка',          'Бөліп төлеу',     'Installment'),
  };
  const formatHistoryValue = (key: string, val: any): string => {
    if (val === null || val === undefined || val === '') return '—';
    if (typeof val === 'number') return val.toLocaleString('ru-RU').replace(/,/g, ' ');
    if (typeof val === 'boolean') return val ? l('да', 'иә', 'yes') : l('нет', 'жоқ', 'no');
    if (key === 'ownerId') return store.getEmployeeById(val)?.name || val;
    if (key === 'status' && typeof val === 'string') return STATUS_LABELS[val] || val;
    if (typeof val === 'object') {
      const enabled = Object.entries(val).filter(([, v]) => v).map(([k]) => PAYMENT_KEY_LABEL[k] || k);
      return enabled.length > 0 ? enabled.join(', ') : '—';
    }
    return String(val);
  };

  // Rollback handler — POSTs to the dedicated endpoint, refreshes the store
  // (so the main tab reflects the restored values) and reloads history (so
  // the rollback row appears at the top of the timeline).
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const rollbackEntry = async (entryId: string) => {
    if (!(await confirmDialog({ message: l(
      'Откатить это изменение? Поля вернутся к значениям до этой правки. Операция запишется в историю.',
      'Бұл өзгерісті қайтару керек пе? Өрістер бұрынғы мәндерге оралады. Әрекет тарихқа жазылады.',
      'Roll this change back? Fields will be restored to their previous values. The rollback is recorded in the history.',
    ), danger: true }))) return;
    setRollingBackId(entryId);
    try {
      await api.post(`/api/deals/${deal.id}/history/${entryId}/rollback`, {});
      await store.reloadAll();
      // Re-fetch the history list to show the new rollback entry.
      const rows = await api.get<HistoryEntry[]>(`/api/deals/${deal.id}/history`);
      setHistory(rows);
    } catch (e: any) {
      toast(String(e?.message || 'rollback failed'), 'error');
    } finally {
      setRollingBackId(null);
    }
  };

  const remaining = Math.max(0, (deal.amount || 0) - (paidAmount || 0));
  const paidPercent = deal.amount > 0 ? Math.min(100, Math.round((paidAmount / deal.amount) * 100)) : 0;

  // Nearest meaningful date for the summary strip: the follow-up if set,
  // otherwise the soonest of the timeline dates. Shown dd.mm so the user
  // sees "what's next" without opening the Dates tab.
  const nearestDate = (() => {
    const cands = [nextActionAt, measurementDate, completionDate, installationDate].filter(Boolean).sort();
    if (!cands.length) return '';
    const d = cands[0];
    const [y, m, dd] = d.split('-');
    return dd && m ? `${dd}.${m}` : d;
  })();

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

  // Clamp paidAmount to deal.amount so overpayments can't silently break
  // Finance reconciliation. If you genuinely need to record an overpayment,
  // adjust the contract amount first.
  const setPaidAmountClamped = useCallback((v: number) => {
    const max = deal.amount || 0;
    const clamped = Math.min(Math.max(0, v || 0), max);
    setPaidAmount(clamped);
  }, [deal.amount]);

  // Handles document selection from the <input type="file" multiple>.
  // Validates size + count, reads each file as a base64 data URL, then
  // appends to the documents array. The actual persist happens on Save.
  const handleDocsSelected = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setDocError(null);
    const room = MAX_DOCS_PER_DEAL - documents.length;
    if (room <= 0) {
      setDocError(l(
        `Лимит ${MAX_DOCS_PER_DEAL} документов — удалите ненужные.`,
        `${MAX_DOCS_PER_DEAL} құжат шегі — артықтарын жойыңыз.`,
        `${MAX_DOCS_PER_DEAL} doc limit — remove some first.`,
      ));
      return;
    }
    const toLoad = Array.from(files).slice(0, room);
    setUploadingDoc(true);
    try {
      const loaded: DealDoc[] = [];
      for (const f of toLoad) {
        if (f.size > MAX_DOC_SIZE) {
          setDocError(l(
            `«${f.name}» больше 5 МБ — пропущен.`,
            `«${f.name}» 5 МБ-дан үлкен — өткізілді.`,
            `"${f.name}" exceeds 5 MB — skipped.`,
          ));
          continue;
        }
        try {
          const dataUrl = await fileToDataUrl(f);
          loaded.push({
            id: docId(),
            name: f.name,
            size: f.size,
            type: f.type || 'application/octet-stream',
            dataUrl,
            uploadedAt: new Date().toISOString(),
          });
        } catch {
          setDocError(l(`Не удалось прочитать «${f.name}».`, `«${f.name}» оқу мүмкін болмады.`, `Failed to read "${f.name}".`));
        }
      }
      if (loaded.length > 0) setDocuments(prev => [...prev, ...loaded]);
    } finally {
      setUploadingDoc(false);
      // Reset the input so the user can re-select the same file.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents.length, language]);

  const removeDocument = useCallback((id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaveError(null);
    try {
      // CRITICAL: don't hardcode workType — it would overwrite real
      // workType values ('windows', 'construction', etc.) on every save.
      // CRITICAL: send '' instead of `undefined` for cleared optional
      // fields. The server merges req.body into stored data, so undefined
      // wipes the key from JSON; '' is preserved as an explicit empty.
      const patch: Partial<Deal> = {
        phone,
        address,
        siteAddress,
        source,
        campaign,
        referrerName: source === 'Рекомендация' ? referrerName : '',
        lostReason: status === 'rejected' ? lostReason : '',
        nextActionAt,
        nextActionNote,
        installChecklist,
        measurer,
        designer,
        foreman,
        architect,
        ownerId,
        furnitureType,
        materials,
        measurementDate,
        completionDate,
        installationDate,
        notes,
        paidAmount,
        paymentMethods,
        status,
        customerBIN,
        // Per-deal niche — persisted only when it differs from the
        // team's primary so single-niche teams stay clean.
        niche: editNiche && editNiche !== store.niche ? editNiche : undefined,
        // Auto-derive progress from status so the kanban and progress
        // bar stay in sync without a separate manual edit.
        progress: STATUS_OPTIONS.find(o => o.id === status)?.progress ?? deal.progress ?? 0,
        // Documents — base64 data URLs inside the deal blob. The Deal
        // interface doesn't include this field yet, but the server
        // PATCH merges arbitrary fields, so it round-trips fine.
        documents,
      } as any;
      await store.updateDeal(deal.id, patch);
      setDirty(false);
      onClose();
    } catch (e: any) {
      setSaveError(String(e?.message || e || 'не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  };

  // Wrap onClose with an unsaved-changes guard. Avoids silently losing
  // edits when the user clicks the backdrop / X / ESC mid-edit.
  const handleClose = useCallback(async () => {
    if (dirty && !(await confirmDialog({ message: l(
      'Есть несохранённые изменения. Закрыть без сохранения?',
      'Сақталмаған өзгерістер бар. Сақтамай жабу керек пе?',
      'Unsaved changes. Close without saving?',
    ) }))) return;
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, onClose, language]);

  // ESC closes the modal (with unsaved guard) — standard a11y.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  const labelForPaymentKey = (key: string) => {
    const meta = PAYMENT_KEY_META[key];
    if (meta?.i18nKey) return tt(meta.i18nKey);
    return key; // custom method — show its raw name
  };
  const iconForPaymentKey = (key: string) => PAYMENT_KEY_META[key] ?? { icon: Wallet, color: 'text-gray-500 bg-gray-100' };

  // Auto-detect dirty: if any current value differs from the deal prop,
  // the form is considered modified. Cheaper than wrapping every setter.
  useEffect(() => {
    const changed =
      phone !== (deal.phone || '') ||
      address !== (deal.address || '') ||
      siteAddress !== (deal.siteAddress || '') ||
      source !== (deal.source || 'Instagram') ||
      campaign !== (deal.campaign || '') ||
      referrerName !== (deal.referrerName || '') ||
      lostReason !== (deal.lostReason || '') ||
      nextActionAt !== (deal.nextActionAt || '') ||
      nextActionNote !== (deal.nextActionNote || '') ||
      JSON.stringify(installChecklist) !== JSON.stringify(deal.installChecklist || []) ||
      measurer !== (deal.measurer || '') ||
      designer !== (deal.designer || '') ||
      foreman !== (deal.foreman || '') ||
      architect !== (deal.architect || '') ||
      ownerId !== (deal.ownerId || '') ||
      furnitureType !== (deal.furnitureType || '') ||
      editNiche !== (deal.niche || store.niche) ||
      materials !== (deal.materials || '') ||
      measurementDate !== (deal.measurementDate || '') ||
      completionDate !== (deal.completionDate || '') ||
      installationDate !== (deal.installationDate || '') ||
      notes !== (deal.notes || '') ||
      paidAmount !== (deal.paidAmount || 0) ||
      status !== (deal.status || 'new') ||
      customerBIN !== (deal.customerBIN || '') ||
      JSON.stringify(paymentMethods) !== JSON.stringify(deal.paymentMethods || {}) ||
      JSON.stringify(documents.map(d => d.id).sort()) !== JSON.stringify(((deal as any).documents || []).map((d: DealDoc) => d.id).sort());
    setDirty(changed);
  }, [phone, address, siteAddress, source, campaign, referrerName, lostReason, nextActionAt, nextActionNote, installChecklist, measurer, designer, foreman, architect,
      ownerId, furnitureType, materials, measurementDate, completionDate,
      installationDate, notes, paidAmount, status, customerBIN, paymentMethods, documents, deal]);

  // Status helpers — used by progress bar + timeline derivation.
  const sIdx = statusIndex(status);
  const currentProgress = STATUS_OPTIONS.find(o => o.id === status)?.progress ?? deal.progress ?? 0;

  const tabs = [
    { id: 'main'     as const, label: l('Информация', 'Ақпарат',  'Info') },
    { id: 'progress' as const, label: l('Сроки · Оплата', 'Мерзім · Төлем', 'Dates · Pay') },
    { id: 'related'  as const, label: l('Связи',      'Байланыс', 'Related') },
    { id: 'chat'     as const, label: l('Чат',        'Чат',      'Chat') },
    { id: 'history'  as const, label: l('История',    'Тарих',    'History') },
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div className="bg-white/85 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_24px_64px_-12px_var(--accent-shadow-sm)] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/60 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400 mb-1 tracking-widest uppercase flex items-center gap-2 flex-wrap">
              <span>{l('Заказ', 'Тапсырыс', 'Order')} · #{(deal.id || '').slice(-6)}</span>
              {/* Niche tag — only when team has multi-niche AND this deal
                  has its own niche. Tells the user at a glance which
                  niche profile drives this deal's labels and stages. */}
              {showNicheChip && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50/80 text-emerald-700 normal-case tracking-normal ring-1 ring-emerald-100/60">
                  <NicheIcon niche={dealNiche} className="w-3 h-3" />
                  <span>{dealNiche.name[language]}</span>
                </span>
              )}
            </div>
            <div className="text-lg text-slate-900 tracking-tight truncate">{deal.customerName}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">{deal.product} · <span className="tabular-nums">{(deal.amount || 0).toLocaleString('ru-RU')} ₸</span></div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Акт сверки взаиморасчётов по этому клиенту */}
            <button
              onClick={downloadSverka}
              disabled={sverkaBusy}
              title={l('Акт сверки взаиморасчётов', 'Есеп айырысу актісі', 'Reconciliation act')}
              className="flex items-center gap-1.5 px-3 h-9 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-2xl text-[11px] text-slate-600 transition-colors disabled:opacity-50"
            >
              {sverkaBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{l('Акт сверки', 'Сверка', 'Reconciliation')}</span>
            </button>
            {/* Client tracking link — share so the customer follows the
                order at utir.kz/#/track/<code> with no login. */}
            <button
              onClick={copyTrackLink}
              title={l('Ссылка для клиента (статус заказа)', 'Клиентке сілтеме', 'Client tracking link')}
              className="flex items-center gap-1.5 px-3 h-9 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-2xl text-[11px] text-slate-600 transition-colors"
            >
              {trackCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <ExternalLink className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{trackCopied ? l('Скопировано', 'Көшірілді', 'Copied') : l('Ссылка клиенту', 'Сілтеме', 'Track link')}</span>
            </button>
            {/* Запрос отзыва — только для завершённых заказов. */}
            {status === 'completed' && (
              <button
                onClick={requestReview}
                title={l('Запросить отзыв у клиента (WhatsApp)', 'Клиенттен пікір сұрау (WhatsApp)', 'Request a review (WhatsApp)')}
                className="flex items-center gap-1.5 px-3 h-9 bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-white/10 rounded-2xl text-[11px] transition-colors"
              >
                <Star className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="hidden sm:inline">{l('Запросить отзыв', 'Пікір сұрау', 'Request review')}</span>
              </button>
            )}
            <button onClick={handleClose} className="w-9 h-9 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-2xl flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* ── Summary strip — key facts at a glance (no tab switching) ── */}
        <div className="px-6 py-3 border-b border-white/60 flex-shrink-0 flex gap-2 overflow-x-auto no-scrollbar fade-x">
          {[
            { label: l('Статус', 'Күй', 'Status'), value: STATUS_LABELS[status] || status, accent: true },
            { label: l('Прогресс', 'Прогресс', 'Progress'), value: `${currentProgress}%` },
            { label: l('Сумма', 'Сома', 'Amount'), value: formatKZT(deal.amount || 0) },
            { label: l('Оплачено', 'Төленген', 'Paid'), value: `${formatKZT(paidAmount)} · ${paidPercent}%` },
            { label: l('Остаток', 'Қалдық', 'Remaining'), value: formatKZT(remaining) },
            ...(nearestDate ? [{ label: l('Ближайшая дата', 'Жақын күн', 'Next date'), value: nearestDate }] : []),
          ].map((s, i) => (
            <div key={i} className="flex-shrink-0 min-w-[88px] px-3 py-2 bg-white/55 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl">
              <div className="text-[9px] uppercase tracking-wider text-slate-400">{s.label}</div>
              <div className={`text-xs tabular-nums truncate ${s.accent ? 'text-emerald-700' : 'text-slate-900'}`}>{s.value}</div>
            </div>
          ))}
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
        <div className="px-6 pt-4 pb-3 flex gap-1.5 flex-shrink-0 overflow-x-auto no-scrollbar fade-x">
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
              {/* Datalists from user-managed catalogs (Settings → Справочники).
                  When the team's catalog is empty we fall back to the niche's
                  default product-type / material lists from niches.ts, so a
                  fresh windows / ceilings / doors business sees suggestions
                  out of the box without having to seed the catalog manually. */}
              <datalist id="dl-card-furniture-types">
                {catalogs.furnitureTypes.length
                  ? catalogs.furnitureTypes.map(v => <option key={v} value={v} />)
                  : dealNiche.productTypeOptions.map(v => <option key={v} value={v} />)}
              </datalist>
              <datalist id="dl-card-materials">
                {catalogs.materials.length
                  ? catalogs.materials.map(v => <option key={v} value={v} />)
                  : dealNiche.materialCategories.map(v => <option key={v} value={v} />)}
              </datalist>

              {/* ── Section: Contacts ── */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">{l('Контакты', 'Байланыс', 'Contacts')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FieldInput label={tt('phone')} value={phone} onChange={setPhone} placeholder={tt('phoneMask')} />
                  <FieldSelect label={l('Источник', 'Көзі', 'Source')} value={source} onChange={setSource}>
                    {LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}
                  </FieldSelect>
                  <FieldInput
                    label={l('Кампания / объявление', 'Науқан / жарнама', 'Campaign / ad')}
                    value={campaign} onChange={setCampaign}
                    placeholder={l('напр. «Акция кухни май»', 'мыс. «Ас үй науқаны»', 'e.g. "Kitchen promo May"')}
                  />
                  {source === 'Рекомендация' && (
                    <FieldInput
                      label={l('Кто порекомендовал', 'Кім ұсынды', 'Referred by')}
                      value={referrerName} onChange={setReferrerName}
                      placeholder={l('имя клиента', 'клиент аты', 'client name')}
                    />
                  )}
                  {status === 'rejected' && (
                    <FieldSelect label={l('Причина отказа', 'Бас тарту себебі', 'Lost reason')} value={lostReason} onChange={setLostReason}>
                      <option value="">{l('— не указана —', '— көрсетілмеген —', '— none —')}</option>
                      {LOST_REASONS.map(r => <option key={r}>{r}</option>)}
                    </FieldSelect>
                  )}
                </div>
                {/* БИН/ИИН — нужен для счёт-фактур и актов. 12 цифр. */}
                <div className="mt-3">
                  <FieldInput
                    label={l('БИН / ИИН клиента', 'БИН / ЖСН', 'BIN / IIN')}
                    value={customerBIN}
                    onChange={(v: string) => setCustomerBIN(v.replace(/[^0-9]/g, '').slice(0, 12))}
                    placeholder="123456789012"
                    inputMode="numeric"
                    maxLength={12}
                  />
                </div>
              </section>

              {/* ── Section: Object addresses (grouped with client contacts) ── */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">{l('Объект', 'Объект', 'Object')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FieldInput label={tt('clientAddress')} value={address} onChange={setAddress} placeholder={tt('addressMask')} />
                  <FieldInput label={tt('siteAddress')} value={siteAddress} onChange={setSiteAddress} placeholder={tt('siteAddressMask')} />
                </div>
              </section>

              {/* ── Section: Next step (РОП — дисциплина касаний) ── */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">{l('Следующий шаг', 'Келесі қадам', 'Next step')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">{l('Дата контакта', 'Байланыс күні', 'Contact date')}</label>
                    <input
                      type="date" value={nextActionAt} onChange={e => setNextActionAt(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white/55 ring-1 ring-white/60 rounded-2xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    />
                    {nextActionAt && nextActionAt < new Date().toISOString().slice(0, 10) && (
                      <div className="text-[10px] text-rose-500 mt-1">{l('Просрочено', 'Мерзімі өтті', 'Overdue')}</div>
                    )}
                  </div>
                  <FieldInput
                    label={l('Что сделать', 'Не істеу керек', 'What to do')}
                    value={nextActionNote} onChange={setNextActionNote}
                    placeholder={l('напр. перезвонить, отправить замер', 'мыс. қоңырау шалу', 'e.g. call back, send quote')}
                  />
                </div>
              </section>

              {/* ── Section: Install acceptance checklist (приёмка монтажа) ── */}
              {(status === 'installation' || status === 'completed') && (() => {
                const DEFAULTS = [
                  l('Доставлено всё по спецификации', 'Спецификация бойынша жеткізілді', 'Delivered per spec'),
                  l('Установлено ровно, без зазоров', 'Тегіс, саңылаусыз орнатылды', 'Installed evenly'),
                  l('Проверена работа механизмов', 'Механизмдер тексерілді', 'Mechanisms checked'),
                  l('Нет повреждений и сколов', 'Зақым мен сынық жоқ', 'No damage or chips'),
                  l('Убран мусор после монтажа', 'Монтаждан кейін қоқыс жиналды', 'Site cleaned up'),
                  l('Клиент принял работу', 'Клиент жұмысты қабылдады', 'Client accepted'),
                ];
                const list = installChecklist.length ? installChecklist : DEFAULTS.map(label => ({ label, done: false }));
                const doneCount = list.filter(i => i.done).length;
                const toggle = (idx: number) => {
                  const base = installChecklist.length ? installChecklist : DEFAULTS.map(label => ({ label, done: false }));
                  setInstallChecklist(base.map((it, i) => i === idx ? { ...it, done: !it.done } : it));
                };
                return (
                  <section>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
                      <span>{l('Приёмка монтажа', 'Монтажды қабылдау', 'Installation acceptance')}</span>
                      <span className="text-slate-400 tabular-nums normal-case">{doneCount}/{list.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {list.map((it, i) => (
                        <button key={i} onClick={() => toggle(i)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 bg-white/50 ring-1 ring-white/60 rounded-xl text-left hover:bg-white/70 transition-colors">
                          <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ring-1 ${it.done ? 'bg-emerald-600 ring-white/10' : 'bg-white/60 ring-white/60'}`}>
                            {it.done && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                          </span>
                          <span className={`text-xs ${it.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{it.label}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })()}

              {/* ── Section: Project type (multi-niche teams only) ── */}
              {/* Lets admin/manager re-assign a deal to a different niche
                  if it was created under the wrong direction. Changes
                  re-key the product-type / role labels / material lists
                  below instantly so the user can verify the new niche
                  feels right before saving. */}
              {showNicheChip && (
                <section>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">
                    {l('Тип проекта', 'Жоба түрі', 'Project type')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {store.allNiches.map(nid => {
                      const n = getNiche(nid);
                      const active = editNiche === nid;
                      return (
                        <button
                          key={nid}
                          type="button"
                          onClick={() => setEditNiche(nid)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] border transition-all ${
                            active
                              ? 'border-emerald-400 bg-emerald-50/80 text-emerald-800'
                              : 'border-gray-100 bg-white/60 hover:border-emerald-200 text-gray-600'
                          }`}
                        >
                          <NicheIcon niche={n} className={`w-3.5 h-3.5 ${active ? 'text-emerald-700' : 'text-slate-400'}`} />
                          <span>{n.name[language]}</span>
                          {active && <Check className="w-3 h-3 text-emerald-700" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-2">
                    {l(
                      `Изменение перенастроит названия полей, материалов и этапов под нишу «${dealNiche.name.ru}».`,
                      `Өзгерту «${dealNiche.name.kz}» салаға бейімдейді.`,
                      `Switching rekeys labels, materials and stages to "${dealNiche.name.eng}".`,
                    )}
                  </div>
                </section>
              )}

              {/* ── Section: product details — niche-aware ── */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">{l('Изделие', 'Бұйым', 'Product')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    {/* Label flips with the niche: "Тип мебели" / "Тип окна"
                        / "Тип потолка" / "Тип двери" / etc. */}
                    <label className="block text-[11px] text-slate-500 mb-1.5">{dealNiche.productTypeLabel[language]}</label>
                    <input
                      list="dl-card-furniture-types"
                      value={furnitureType}
                      onChange={e => setFurnitureType(e.target.value)}
                      placeholder={catalogs.furnitureTypes.length || dealNiche.productTypeOptions.length ? '' : tt('catalogEmpty')}
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

              {/* ── Section: Status ── */}
              {/* Was missing entirely — status could only be changed via kanban
                  drag-and-drop. Now editable inline; saving the deal also
                  refreshes deal.progress and triggers Telegram notifications. */}
              <section>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-3">{l('Статус', 'Күй', 'Status')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FieldSelect
                    label={l('Этап воронки', 'Воронка кезеңі', 'Funnel stage')}
                    value={status}
                    onChange={setStatus}
                  >
                    {STATUS_OPTIONS.map(o => (
                      <option key={o.id} value={o.id}>{o[language]}</option>
                    ))}
                  </FieldSelect>
                  <div className="flex flex-col justify-end">
                    <div className="text-[10px] text-slate-500 mb-1.5">{l('Прогресс', 'Прогресс', 'Progress')}</div>
                    <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden ring-1 ring-white/40">
                      <div
                        className={`h-full rounded-full transition-all ${
                          currentProgress === 100
                            ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                            : 'bg-gradient-to-r from-sky-400 to-violet-400'
                        }`}
                        style={{ width: `${currentProgress}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 tabular-nums mt-1">{currentProgress}%</div>
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
                {/* Roles below — these are free-text on the data model but the
                    UI now suggests an employee-by-name datalist so users
                    typically pick a real teammate. Foreman/architect are
                    surfaced (they exist on the Deal interface but weren't
                    editable from the card before). */}
                <datalist id="dl-card-employees">
                  {store.employees.filter((e: any) => !e.removed_at).map(e => <option key={e.id} value={e.name} />)}
                </datalist>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <div>
                    {/* Niche-aware role label — "Замерщик" stays for furniture
                        but turns into the niche's own measurer role name for
                        windows / ceilings / etc when those configs add one. */}
                    <label className="block text-[11px] text-slate-500 mb-1.5">{dealNiche.roleLabels.measurer[language]}</label>
                    <input list="dl-card-employees" value={measurer} onChange={e => setMeasurer(e.target.value)}
                      placeholder={tt('notSelected')}
                      className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1.5">{dealNiche.roleLabels.designer[language]}</label>
                    <input list="dl-card-employees" value={designer} onChange={e => setDesigner(e.target.value)}
                      placeholder={tt('notSelected')}
                      className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1.5">{l('Прораб', 'Прораб', 'Foreman')}</label>
                    <input list="dl-card-employees" value={foreman} onChange={e => setForeman(e.target.value)}
                      placeholder={tt('notSelected')}
                      className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1.5">{l('Архитектор', 'Сәулетші', 'Architect')}</label>
                    <input list="dl-card-employees" value={architect} onChange={e => setArchitect(e.target.value)}
                      placeholder={tt('notSelected')}
                      className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all" />
                  </div>
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

              {/* ── Section: Documents ── */}
              {/* Real file attachments stored as base64 data URLs on the
                  deal blob. PDF contracts, photos of measurements, Excel
                  quotes — anything the team needs to pin to the deal.
                  Limits: 5 MB / file, 10 files / deal. */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Paperclip className="w-3 h-3" />
                    {l('Документы', 'Құжаттар', 'Documents')}
                    {documents.length > 0 && (
                      <span className="normal-case text-slate-400 tabular-nums px-1.5 py-0.5 rounded-full bg-white/50 ring-1 ring-white/60">
                        {documents.length}/{MAX_DOCS_PER_DEAL}
                      </span>
                    )}
                  </div>
                </div>

                {/* Upload area — input is hidden; the labelled drop zone
                    triggers it. Drag/drop also supported via the same handler. */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => handleDocsSelected(e.target.files)}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.heic"
                />
                {documents.length < MAX_DOCS_PER_DEAL && store.canWriteModule('orders') && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={e => {
                      e.preventDefault(); e.stopPropagation();
                      handleDocsSelected(e.dataTransfer.files);
                    }}
                    className="bg-white/40 backdrop-blur-xl ring-1 ring-dashed ring-white/80 hover:ring-emerald-300 hover:bg-white/60 rounded-2xl px-4 py-5 flex flex-col items-center gap-1.5 text-center cursor-pointer transition-all"
                  >
                    {uploadingDoc ? (
                      <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 text-slate-400" />
                    )}
                    <div className="text-[11px] text-slate-700">
                      {uploadingDoc
                        ? l('Загружаю…', 'Жүктелуде…', 'Uploading…')
                        : l('Нажмите или перетащите файлы сюда', 'Файлдарды басыңыз немесе осында сүйреңіз', 'Click or drop files here')}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {l('PDF, Word, Excel, изображения · до 5 МБ', 'PDF, Word, Excel, суреттер · 5 МБ дейін', 'PDF, Word, Excel, images · up to 5 MB')}
                    </div>
                  </div>
                )}

                {docError && (
                  <div className="mt-2 bg-amber-50/80 ring-1 ring-amber-200/60 rounded-xl px-3 py-2 text-[11px] text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">{docError}</div>
                    <button onClick={() => setDocError(null)} className="text-amber-700 opacity-60 hover:opacity-100">×</button>
                  </div>
                )}

                {documents.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {documents.map(doc => {
                      const Icon = docIcon(doc.type);
                      const isImage = /^image\//.test(doc.type);
                      return (
                        <div key={doc.id} className="flex items-center gap-3 p-2.5 bg-white/60 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl group">
                          {/* Image thumbnail if it's a picture, otherwise icon */}
                          {isImage ? (
                            <a href={doc.dataUrl} target="_blank" rel="noreferrer" className="flex-shrink-0">
                              <img src={doc.dataUrl} alt={doc.name} className="w-10 h-10 object-cover rounded-xl ring-1 ring-white/60" />
                            </a>
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-white/70 ring-1 ring-white/60 flex items-center justify-center flex-shrink-0">
                              <Icon className="w-4 h-4 text-slate-500" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-900 truncate">{doc.name}</div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                              <span className="tabular-nums">{formatBytes(doc.size)}</span>
                              <span className="text-slate-300">·</span>
                              <span>{new Date(doc.uploadedAt).toLocaleDateString(language === 'eng' ? 'en-GB' : 'ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <a
                              href={doc.dataUrl}
                              download={doc.name}
                              className="p-1.5 hover:bg-white rounded-xl transition-colors"
                              title={l('Скачать', 'Жүктеу', 'Download')}
                            >
                              <Download className="w-3.5 h-3.5 text-slate-500" />
                            </a>
                            {store.canWriteModule('orders') && (
                              <button
                                onClick={() => removeDocument(doc.id)}
                                className="p-1.5 hover:bg-rose-100/70 rounded-xl transition-colors"
                                title={l('Удалить', 'Жою', 'Delete')}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* PROGRESS TAB */}
          {activeTab === 'progress' && (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Timeline — editable date pickers. The `done` flag is
                  derived from the funnel status so check marks reflect
                  reality (e.g. status='production' → measurement counts
                  as done regardless of date). Setting a date here also
                  bumps the status forward automatically: filling
                  measurementDate → status='measured', completionDate →
                  'production', installationDate → 'installation'.
                  Saving the modal persists everything. */}
              <div>
                <div className="text-xs text-slate-900 mb-3">{l('Сроки', 'Мерзімдер', 'Timeline')}</div>
                <div className="space-y-2">
                  {[
                    { label: tt('timelineMeasure'),       value: measurementDate,   set: setMeasurementDate,
                      done: sIdx >= statusIndex('measured')     || !!measurementDate,
                      onCommit: () => { if (sIdx < statusIndex('measured'))     setStatus('measured'); } },
                    { label: tt('timelineCompletion'),    value: completionDate,    set: setCompletionDate,
                      done: sIdx >= statusIndex('installation'),
                      onCommit: () => { if (sIdx < statusIndex('production'))   setStatus('production'); } },
                    { label: tt('timelineInstallation'),  value: installationDate,  set: setInstallationDate,
                      done: sIdx >= statusIndex('completed'),
                      onCommit: () => { if (sIdx < statusIndex('installation')) setStatus('installation'); } },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl">
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center ring-1 ring-white/60 flex-shrink-0 ${item.done ? 'bg-emerald-500 text-white' : 'bg-white/60 text-slate-400'}`}>
                        {item.done ? <Check className="w-3.5 h-3.5" /> : <span className="text-[10px] tabular-nums">{i + 1}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-900 mb-1">{item.label}</div>
                        <input
                          type="date"
                          value={item.value}
                          onChange={e => item.set(e.target.value)}
                          onBlur={() => { if (item.value) item.onCommit(); }}
                          className="w-full px-2.5 py-1.5 bg-white/70 ring-1 ring-white/60 rounded-xl text-[11px] focus:outline-none focus:bg-white focus:ring-slate-300 transition-all tabular-nums"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-slate-500">{l('Прогресс', 'Прогресс', 'Progress')}</span>
                    <span className="text-slate-900 tabular-nums">{currentProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden ring-1 ring-white/40">
                    <div
                      className={`h-full rounded-full transition-all ${
                        currentProgress === 100
                          ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                          : 'bg-gradient-to-r from-sky-400 to-violet-400'
                      }`}
                      style={{ width: `${currentProgress}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                    {l(
                      'Заполните дату → статус автоматически продвинется. Сохраните изменения внизу.',
                      'Күнді толтырыңыз → күй автоматты түрде ілгерілейді. Төменде сақтаңыз.',
                      'Set a date → status auto-advances. Save below.',
                    )}
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
                      onChange={e => setPaidAmountClamped(Number(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-white/70 backdrop-blur-xl ring-1 ring-white/60 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all"
                    />
                    {paidAmount >= (deal.amount || 0) && (deal.amount || 0) > 0 && (
                      <div className="text-[10px] text-emerald-600 mt-1.5 flex items-center gap-1">
                        <Check className="w-3 h-3" /> {l('Полностью оплачено', 'Толық төленген', 'Fully paid')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* RELATED TAB — 360° view: production stages, materials,
              tasks, payments, purchases. Pulls from store + lazy-loads
              POs via API since they live outside the store. */}
          {activeTab === 'related' && (
            <RelatedView deal={deal} language={language} />
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
        <div className="px-6 py-4 border-t border-white/60 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="text-[11px] text-slate-500 flex-1 min-w-0">
            {saveError ? (
              <div className="flex items-center gap-1.5 text-rose-600">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{saveError}</span>
              </div>
            ) : dirty ? (
              <span className="text-amber-700">● {l('Есть несохранённые изменения', 'Сақталмаған өзгерістер бар', 'Unsaved changes')}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleClose}
              disabled={saving}
              className="px-4 py-2 bg-white/60 ring-1 ring-white/60 rounded-2xl text-xs hover:bg-white text-slate-700 transition-colors disabled:opacity-50"
            >
              {tt('cancel')}
            </button>
            {/* Save hidden for roles with only 'view' permission on orders/sales.
                Without this they'd hit the form, edit, click Save and get a 403. */}
            {store.canWriteModule('orders') && (
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                {saving ? l('Сохраняю…', 'Сақталуда…', 'Saving…') : tt('save')}
              </button>
            )}
          </div>
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
  const canEdit = store.canWriteModule('orders');

  const detach = (id: string) => {
    if (!canEdit) return; // viewers shouldn't trigger 403s
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
              <div className="absolute bottom-1.5 left-1.5 right-1.5 px-2 py-0.5 bg-emerald-600/70 backdrop-blur-xl text-white text-[10px] rounded-full truncate ring-1 ring-white/20">
                {c.provider}
              </div>
              {canEdit && (
                <button
                  onClick={() => detach(c.id)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-emerald-600/70 backdrop-blur-xl text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-emerald-700/90 transition-opacity ring-1 ring-white/20"
                  title={l('Открепить', 'Ажырату', 'Detach')}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
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

// ─── Related-data 360° view ────────────────────────────────────────
// Aggregates everything the platform knows about this single deal:
//   • Production stages (5-step workshop pipeline from deal.stages)
//   • Consumed materials (deal.consumed[]) with cost subtotal
//   • Tasks where task.linkedDealId === deal.id
//   • Finance transactions where t.dealId === deal.id
//   • Purchase orders that include this deal in linkedDealIds
//
// Tasks + finance read from the store (already loaded). Purchase orders
// live outside the store — we lazy-fetch them once per modal open.
// Each section also offers a deep-link to the relevant top-level module
// so the user can drill in.
function RelatedView({ deal, language }: { deal: Deal; language: 'kz' | 'ru' | 'eng' }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();
  const fmt = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} ₸`;

  // ── Derived per-deal slices from the store ────────────────────
  const linkedTasks = useMemo(
    () => store.tasks.filter((t: any) => t.linkedDealId === deal.id),
    [store.tasks, deal.id],
  );
  const linkedTransactions = useMemo(
    () => store.transactions.filter((t: any) => t.dealId === deal.id),
    [store.transactions, deal.id],
  );

  // ── Production stages from the deal blob ──────────────────────
  const stages: DealStage[] = (deal as any).stages || [];
  const consumed: ConsumedMaterial[] = (deal as any).consumed || [];
  const consumedTotal = consumed.reduce((s, c) => s + c.qty * c.costPerUnit, 0);

  // ── Lazy-loaded purchase orders ───────────────────────────────
  const [pos, setPos] = useState<any[]>([]);
  const [posLoaded, setPosLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api.get<any[]>('/api/purchase-orders')
      .then(rows => { if (!cancelled) { setPos(rows || []); setPosLoaded(true); } })
      .catch(() => { if (!cancelled) setPosLoaded(true); });
    return () => { cancelled = true; };
  }, [deal.id]);
  const linkedPOs = useMemo(
    () => pos.filter(p => Array.isArray(p.linkedDealIds) && p.linkedDealIds.includes(deal.id)),
    [pos, deal.id],
  );

  const navigate = (page: string) => {
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page } }));
  };

  // Aggregate payment numbers from BOTH the deal.paidAmount field AND
  // any income FinanceTransactions tagged to this deal — gives the
  // user both views (total on deal + event log of who/when/how).
  const paymentEvents = linkedTransactions.filter((t: any) => t.type === 'income');
  const paymentEventsSum = paymentEvents.reduce((s: number, t: any) => s + (t.amount || 0), 0);
  const remaining = Math.max(0, (deal.amount || 0) - (deal.paidAmount || 0));

  return (
    <div className="p-5 space-y-5">
      {/* Summary band — quick read of where this deal stands across modules. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="bg-white/55 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{l('Оплата', 'Төлем', 'Payments')}</div>
          <div className="text-sm text-slate-900 tabular-nums">{fmt(deal.paidAmount || 0)}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{l('остаток', 'қалдық', 'remaining')} {fmt(remaining)}</div>
        </div>
        <div className="bg-white/55 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{l('Материалы', 'Материал', 'Materials')}</div>
          <div className="text-sm text-slate-900 tabular-nums">{fmt(consumedTotal)}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{consumed.length} {l('поз.', 'поз.', 'items')}</div>
        </div>
        <div className="bg-white/55 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{l('Задачи', 'Тапсырм.', 'Tasks')}</div>
          <div className="text-sm text-slate-900 tabular-nums">{linkedTasks.length}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {linkedTasks.filter((t: any) => t.status !== 'done').length} {l('активных', 'белсенді', 'open')}
          </div>
        </div>
        <div className="bg-white/55 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{l('Закупки', 'Сатып алу', 'Purchases')}</div>
          <div className="text-sm text-slate-900 tabular-nums">{linkedPOs.length}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {linkedPOs.filter(p => p.status === 'received').length} {l('получено', 'алынды', 'received')}
          </div>
        </div>
      </div>

      {/* ── Производство — этапы сборки ── */}
      <section className="bg-white/55 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <div className="text-sm text-slate-900">{l('Производство', 'Өндіріс', 'Production')}</div>
          </div>
          <button
            onClick={() => navigate('warehouse')}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-white/70 transition-colors"
          >
            {l('Открыть', 'Ашу', 'Open')}
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
        {stages.length > 0 ? (
          <>
            <div className="grid grid-cols-5 gap-1.5 mb-2">
              {DEFAULT_STAGES_TEMPLATE.map(tpl => {
                const s = stages.find(x => x.id === tpl.id);
                const status = s?.status || 'pending';
                const Icon = tpl.icon;
                return (
                  <div
                    key={tpl.id}
                    className={`flex flex-col items-center gap-1 py-2 rounded-xl ring-1 ${
                      status === 'done'        ? 'bg-emerald-100/80 text-emerald-700 ring-emerald-200/60' :
                      status === 'in-progress' ? 'bg-amber-100/80 text-amber-700 ring-amber-200/60' :
                                                  'bg-white/40 text-slate-400 ring-white/60'
                    }`}
                    title={s?.completedAt
                      ? `${tpl[language]} · ${l('завершён', 'аяқталды', 'done')} ${new Date(s.completedAt).toLocaleDateString('ru-RU')}`
                      : s?.startedAt
                        ? `${tpl[language]} · ${l('в работе', 'жұмыста', 'in progress')}`
                        : `${tpl[language]} · ${l('не начат', 'басталмаған', 'not started')}`}
                  >
                    <Icon className="w-3 h-3" />
                    <span className="text-[10px] leading-tight text-center px-1">{tpl[language]}</span>
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] text-slate-400">
              {stages.filter(s => s.status === 'done').length} / 5 {l('этапов завершено', 'кезең аяқталды', 'stages done')}
            </div>
          </>
        ) : (
          <div className="text-[11px] text-slate-500">
            {l('Сделка ещё не дошла до производства — этапы появятся при статусе «Производство».',
               'Мәміле әлі өндіріске жеткен жоқ — «Өндіріс» күйінде кезеңдер пайда болады.',
               'Stages appear once status hits «Production».')}
          </div>
        )}
      </section>

      {/* ── Использованные материалы ── */}
      <section className="bg-white/55 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-slate-500" />
            <div className="text-sm text-slate-900">{l('Использованные материалы', 'Қолданылған материал', 'Materials used')}</div>
            {consumed.length > 0 && (
              <span className="text-[10px] text-slate-400 tabular-nums">{consumed.length}</span>
            )}
          </div>
          <div className="text-[11px] text-slate-700 tabular-nums">{fmt(consumedTotal)}</div>
        </div>
        {consumed.length > 0 ? (
          <div className="space-y-1">
            {consumed.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] py-1 border-b border-white/50 last:border-b-0">
                <div className="flex-1 min-w-0">
                  <div className="text-slate-900 truncate">{c.productName}</div>
                  <div className="text-[10px] text-slate-400">
                    {new Date(c.deductedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </div>
                </div>
                <div className="text-slate-700 tabular-nums flex-shrink-0 ml-3">
                  {c.qty} {c.unit} · {fmt(c.qty * c.costPerUnit)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-slate-500">
            {l('Материалы пока не списывались на эту сделку.',
               'Бұл мәмілеге материалдар әлі жазылмаған.',
               'No materials deducted to this deal yet.')}
          </div>
        )}
      </section>

      {/* ── Платежи ── */}
      <section className="bg-white/55 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Banknote className="w-3.5 h-3.5 text-slate-500" />
            <div className="text-sm text-slate-900">{l('Платежи', 'Төлемдер', 'Payments')}</div>
          </div>
          <button
            onClick={() => navigate('finance')}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-white/70 transition-colors"
          >
            {l('Открыть', 'Ашу', 'Open')}
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3 text-[11px]">
          <div className="bg-white/50 ring-1 ring-white/60 rounded-xl px-2.5 py-2">
            <div className="text-[10px] text-slate-500">{l('Сумма договора', 'Шарт сомасы', 'Contract')}</div>
            <div className="text-slate-900 tabular-nums">{fmt(deal.amount || 0)}</div>
          </div>
          <div className="bg-emerald-50/80 ring-1 ring-emerald-200/60 rounded-xl px-2.5 py-2">
            <div className="text-[10px] text-emerald-700">{l('Оплачено', 'Төленген', 'Paid')}</div>
            <div className="text-emerald-800 tabular-nums">{fmt(deal.paidAmount || 0)}</div>
          </div>
          <div className={`ring-1 rounded-xl px-2.5 py-2 ${remaining > 0 ? 'bg-amber-50/80 ring-amber-200/60' : 'bg-emerald-50/80 ring-emerald-200/60'}`}>
            <div className={`text-[10px] ${remaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{l('Остаток', 'Қалдық', 'Remaining')}</div>
            <div className={`tabular-nums ${remaining > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>{fmt(remaining)}</div>
          </div>
        </div>
        {paymentEvents.length > 0 ? (
          <div className="space-y-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
              {l('Поступления из финансов', 'Қаржыдан түсімдер', 'Income events')} · {fmt(paymentEventsSum)}
            </div>
            {paymentEvents.slice(0, 8).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between text-[11px] py-1 border-b border-white/50 last:border-b-0">
                <div className="flex-1 min-w-0">
                  <div className="text-slate-900 truncate">{t.description || t.category || '—'}</div>
                  <div className="text-[10px] text-slate-400">{t.date || '—'}</div>
                </div>
                <div className="text-emerald-700 tabular-nums flex-shrink-0 ml-3">+{fmt(t.amount || 0)}</div>
              </div>
            ))}
            {paymentEvents.length > 8 && (
              <div className="text-[10px] text-slate-400 italic">+ {paymentEvents.length - 8} {l('ещё', 'тағы', 'more')}</div>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-slate-500">
            {l('Отдельные платежные операции в Финансах ещё не привязаны к этой сделке.',
               'Қаржыдағы жеке төлемдер бұл мәмілеге әлі байланыспаған.',
               'No standalone payment events linked from Finance.')}
          </div>
        )}
      </section>

      {/* ── Задачи ── */}
      <section className="bg-white/55 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ListChecks className="w-3.5 h-3.5 text-slate-500" />
            <div className="text-sm text-slate-900">{l('Задачи', 'Тапсырмалар', 'Tasks')}</div>
            {linkedTasks.length > 0 && (
              <span className="text-[10px] text-slate-400 tabular-nums">{linkedTasks.length}</span>
            )}
          </div>
          <button
            onClick={() => navigate('tasks')}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-white/70 transition-colors"
          >
            {l('Открыть', 'Ашу', 'Open')}
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
        {linkedTasks.length > 0 ? (
          <div className="space-y-1.5">
            {linkedTasks.map((t: any) => {
              const isDone = t.status === 'done';
              const isOverdue = !isDone && t.dueDate && new Date(t.dueDate) < new Date();
              return (
                <div key={t.id} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl ring-1 ${
                  isDone ? 'bg-emerald-50/60 ring-emerald-100/40' : isOverdue ? 'bg-rose-50/60 ring-rose-100/40' : 'bg-white/40 ring-white/60'
                }`}>
                  <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isDone ? 'bg-emerald-500 text-white' : 'bg-white/70 ring-1 ring-white/60'
                  }`}>
                    {isDone && <Check className="w-3 h-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs truncate ${isDone ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{t.title}</div>
                    {t.dueDate && (
                      <div className={`text-[10px] ${isOverdue ? 'text-rose-600' : 'text-slate-400'}`}>
                        {l('срок', 'мерзім', 'due')} {t.dueDate}
                      </div>
                    )}
                  </div>
                  {t.priority && t.priority !== 'medium' && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ring-white/40 flex-shrink-0 ${
                      t.priority === 'urgent' ? 'bg-rose-100/70 text-rose-700' :
                      t.priority === 'high'   ? 'bg-amber-100/70 text-amber-700' :
                                                 'bg-emerald-100/70 text-emerald-700'
                    }`}>
                      {t.priority === 'urgent' ? l('срочно', 'шұғыл', 'urgent') :
                       t.priority === 'high'   ? l('высокий', 'жоғары', 'high') :
                                                   l('низкий', 'төмен', 'low')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-[11px] text-slate-500">
            {l('К сделке пока не привязано задач.', 'Мәмілеге тапсырмалар әлі тіркелмеген.', 'No tasks linked to this deal yet.')}
          </div>
        )}
      </section>

      {/* ── Закупки ── */}
      <section className="bg-white/55 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-3.5 h-3.5 text-slate-500" />
            <div className="text-sm text-slate-900">{l('Закупки', 'Сатып алулар', 'Purchases')}</div>
            {linkedPOs.length > 0 && (
              <span className="text-[10px] text-slate-400 tabular-nums">{linkedPOs.length}</span>
            )}
          </div>
          <button
            onClick={() => navigate('warehouse')}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-white/70 transition-colors"
          >
            {l('Открыть', 'Ашу', 'Open')}
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
        {!posLoaded ? (
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            {l('Загружаю…', 'Жүктелуде…', 'Loading…')}
          </div>
        ) : linkedPOs.length > 0 ? (
          <div className="space-y-1.5">
            {linkedPOs.map((p: any) => {
              const stat = p.status as 'draft' | 'sent' | 'received' | 'cancelled';
              const statLabel = stat === 'draft' ? l('Черновик', 'Жоба', 'Draft')
                              : stat === 'sent' ? l('Отправлено', 'Жіберілді', 'Sent')
                              : stat === 'received' ? l('Получено', 'Алынды', 'Received')
                              : l('Отменено', 'Тоқтатылды', 'Cancelled');
              const statCls = stat === 'received' ? 'bg-emerald-100/70 text-emerald-700'
                            : stat === 'sent'     ? 'bg-amber-100/70 text-amber-700'
                            : stat === 'cancelled' ? 'bg-rose-100/70 text-rose-700'
                            :                        'bg-white/60 text-slate-600';
              return (
                <div key={p.id} className="flex items-center gap-2.5 px-2.5 py-2 bg-white/40 ring-1 ring-white/60 rounded-xl">
                  <Truck className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-900 truncate">
                      {(p.items || []).slice(0, 2).map((it: any) => it.name).join(', ')}
                      {(p.items || []).length > 2 && ` + ${(p.items || []).length - 2}`}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {p.expectedDate || p.receivedDate || '—'}
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-700 tabular-nums flex-shrink-0">{fmt(p.totalCost || 0)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ring-white/40 flex-shrink-0 ${statCls}`}>
                    {statLabel}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-[11px] text-slate-500">
            {l('К сделке не привязана ни одна закупка. Привязать можно при создании PO в разделе «Закупки».',
               'Бұл мәмілеге сатып алу байланыспаған.',
               'No purchase orders linked to this deal yet.')}
          </div>
        )}
      </section>
    </div>
  );
}
