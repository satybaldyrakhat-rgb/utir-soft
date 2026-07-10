// Sales funnel — main "Заказы" page.
//
// Two render modes:
//   • Desktop (≥md): 6-column kanban with drag-drop between stages.
//   • Mobile (<md): single column at a time with a pill-bar selector at
//     top; drag-drop is replaced with a "→" move button per card since
//     touch-drag-and-drop is unreliable. Same data flow, different UX.
//
// Niche-aware: stage labels and product-type hints read from the niche
// config so a stretch-ceiling business doesn't see furniture vocabulary.
//
// Performance: stage-filtered/sorted/searched lists are memoized so
// recharts-style re-renders don't run on unrelated store mutations.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Phone, X, Users, Mail, Calendar, TrendingUp, XCircle, Plus, Search,
  Archive, Download, Upload, RotateCcw, Trash2, Filter, ArrowUpDown,
  ChevronDown, MoveRight, Eye, Sparkles, MessageCircle, AlertTriangle, Clock,
} from 'lucide-react';
import { ClientOrderModal } from './ClientOrderModal';
import { NewDealModal } from './NewDealModal';
import { useDataStore, type Deal } from '../utils/dataStore';
import { confirmDialog } from '../utils/confirm';
import { NicheIcon } from './NicheIcon';
import { LOST_REASONS } from '../utils/marketing';
import { rowsToCsv, downloadCsv, todayStampedName, type CsvColumn } from '../utils/csv';
import { CsvImportModal, type CsvFieldSpec } from './CsvImportModal';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { t, plural } from '../utils/translations';
import { WhatsAppLogo, TelegramLogo, InstagramLogo, TikTokLogo } from './PlatformLogos';
import { getNiche, getDealNiche } from '../utils/niches';

interface SalesKanbanProps {
  language: 'kz' | 'ru' | 'eng';
}

// Shared glass-card class — same vocabulary as Dashboard / AI Design.
const GLASS_CARD = 'bg-white/65 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_4px_16px_-8px_rgba(15,23,42,0.12)] rounded-2xl';
const GLASS_DEEP = 'bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl';

// ─── Universal pipeline stages ───────────────────────────────────
// Stages are the same across niches (the sales funnel doesn't change —
// only the production sub-stages do). Labels stay neutral so they
// apply to any measure-based business.
const STAGES = [
  { id: 'new',             ru: 'Новая заявка',     kz: 'Жаңа өтінім',    eng: 'New Lead',          dot: 'bg-sky-500',     accent: 'bg-sky-100/70     text-sky-700' },
  { id: 'measured',        ru: 'Замер',            kz: 'Өлшем',           eng: 'Measured',         dot: 'bg-amber-500',   accent: 'bg-amber-100/70   text-amber-700' },
  { id: 'project-agreed',  ru: 'Проект и договор', kz: 'Жоба және шарт',  eng: 'Project & Contract',dot: 'bg-violet-500',  accent: 'bg-violet-100/70  text-violet-700' },
  { id: 'production',      ru: 'Производство',     kz: 'Өндіріс',         eng: 'Production',       dot: 'bg-cyan-500',    accent: 'bg-cyan-100/70    text-cyan-700' },
  { id: 'installation',    ru: 'Установка',        kz: 'Орнату',          eng: 'Installation',     dot: 'bg-indigo-500',  accent: 'bg-indigo-100/70  text-indigo-700' },
  { id: 'completed',       ru: 'Завершено',        kz: 'Аяқталды',        eng: 'Completed',        dot: 'bg-emerald-500', accent: 'bg-emerald-100/70 text-emerald-700' },
] as const;
const STAGE_ORDER: string[] = STAGES.map(s => s.id);

// Progress percent associated with each stage. Used only for FORWARD
// transitions — moving backwards no longer overwrites custom progress.
const PROGRESS_BY_STAGE: Record<string, number> = {
  new: 5, measured: 25, 'project-agreed': 50,
  production: 70, installation: 88, completed: 100,
};

// Maps any legacy / non-canonical status to a kanban column. Keeps old
// data (e.g. assembly, contract, qualified) showing up in the right
// place after the migration.
const statusToStage = (status: string): string => {
  const map: Record<string, string> = {
    new: 'new', accepted: 'new', qualified: 'new',
    measured: 'measured',
    'project-agreed': 'project-agreed', contract: 'project-agreed',
    production: 'production',
    assembly: 'installation', installation: 'installation',
    completed: 'completed',
  };
  return map[status] || status;
};

// Soft per-stage WIP advisory cap — when exceeded the column header
// switches to amber so the team notices the bottleneck. Not blocking
// — just a visual signal. Future: move into team settings.
const WIP_SOFT_CAP = 10;

// Format KZT with smart units. < 1k stays literal so a 500 ₸ deal doesn't
// display as "0K".
const fmtMoney = (n: number): string => {
  if (!n || n === 0) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₸`;
  if (Math.abs(n) >= 10_000)    return `${Math.round(n / 1_000)}K ₸`;
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`;
};

// Hook — returns true when viewport is below the md (768px) breakpoint.
// Used to switch from kanban → stage-tabs layout on phones since
// horizontal drag-drop is unusable on touch.
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

// ─── Component ───────────────────────────────────────────────────
export function SalesKanban({ language }: SalesKanbanProps) {
  const store = useDataStore();
  const niche = getNiche(store.niche);
  const isMobile = useIsMobile();

  // Auto-refresh paused during drag so a 15s tick doesn't yank the
  // card the user is currently dragging.
  const isDraggingRef = useRef(false);
  useAutoRefresh(() => {
    if (isDraggingRef.current) return;
    return store.reloadAll();
  }, 15000);

  const [showNewDealModal, setShowNewDealModal] = useState(false);
  const [newDealDefaults, setNewDealDefaults] = useState<{ status?: string } | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [confirmBackwardMove, setConfirmBackwardMove] = useState<{ id: string; from: string; to: string } | null>(null);
  const [templateSeed, setTemplateSeed] = useState<any | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  // Mobile: which stage column is currently visible
  const [mobileStage, setMobileStage] = useState<string>('new');

  // ─── Filters + sorting + bulk ──────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [filterSource, setFilterSource] = useState<string>('');
  const [filterOwner, setFilterOwner] = useState<string>('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  // Owners for the in-card quick-assign (РОП распределяет лиды без открытия).
  const owners = useMemo(() => store.employees.map(e => ({ id: e.id, name: e.name })), [store.employees]);
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  // Multi-niche teams get a chip-row above the board to slice deals by
  // direction. '' means "all niches"; otherwise compares the resolved
  // niche (deal.niche || team primary) to this filter value.
  const [filterNiche, setFilterNiche] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'priority' | 'progress'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);

  const canWrite = store.canWriteModule('orders');

  // Listen for «use template in order» events fired by Warehouse → BOM →
  // «В заказ» button.
  useEffect(() => {
    const onTemplate = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail || {};
      setTemplateSeed(detail);
      setShowNewDealModal(true);
    };
    window.addEventListener('sales:create-deal-from-template', onTemplate as EventListener);
    return () => window.removeEventListener('sales:create-deal-from-template', onTemplate as EventListener);
  }, []);

  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const tt = (key: Parameters<typeof t>[0]) => t(key, language);

  // ─── Derived data (memoized) ──────────────────────────────────
  const activeDeals = useMemo(() => store.deals.filter(d => d.status !== 'rejected'), [store.deals]);
  const rejectedDeals = useMemo(() => store.deals.filter(d => d.status === 'rejected'), [store.deals]);

  // Source values seen in current data → fuel the source filter dropdown.
  const knownSources = useMemo(() => {
    const set = new Set<string>();
    for (const d of activeDeals) if (d.source) set.add(d.source);
    return Array.from(set).sort();
  }, [activeDeals]);

  // Apply search + filters in one pass. The result is then bucketed per
  // stage by `dealsByStage` below.
  const filteredDeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const fromMs = filterDateFrom ? new Date(filterDateFrom).getTime() : null;
    const toMs   = filterDateTo   ? new Date(filterDateTo + 'T23:59:59').getTime() : null;
    return activeDeals.filter(d => {
      // Text search across name / product / phone.
      if (q && !((d.customerName || '').toLowerCase().includes(q)
              || (d.product || '').toLowerCase().includes(q)
              || (d.phone || '').toLowerCase().includes(q))) return false;
      // Filters.
      if (filterSource   && d.source   !== filterSource)   return false;
      if (filterOwner    && d.ownerId  !== filterOwner)    return false;
      if (unassignedOnly && d.ownerId)                     return false;
      if (filterPriority && d.priority !== filterPriority) return false;
      // Niche filter (multi-niche teams only). Resolves the effective
      // niche of the deal (own niche || team primary) so old deals
      // without a `niche` field are bucketed under the primary.
      if (filterNiche) {
        const effective = d.niche || store.niche;
        if (effective !== filterNiche) return false;
      }
      if (fromMs !== null || toMs !== null) {
        const ts = d.createdAt ? new Date(d.createdAt).getTime() : NaN;
        if (isNaN(ts)) return false;
        if (fromMs !== null && ts < fromMs) return false;
        if (toMs !== null && ts > toMs) return false;
      }
      return true;
    });
  }, [activeDeals, searchQuery, filterSource, filterOwner, filterPriority, filterDateFrom, filterDateTo, filterNiche, store.niche, unassignedOnly]);

  // Per-stage bucket + sort. Memoized so unrelated store mutations
  // (e.g. an unrelated transaction update) don't rebuild the kanban.
  const dealsByStage = useMemo(() => {
    const sortDeals = (arr: Deal[]) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const prioRank = (p?: string) => p === 'urgent' ? 0 : p === 'high' ? 1 : p === 'medium' ? 2 : 3;
      return [...arr].sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'amount') cmp = (a.amount || 0) - (b.amount || 0);
        else if (sortBy === 'priority') cmp = prioRank(a.priority) - prioRank(b.priority);
        else if (sortBy === 'progress') cmp = (a.progress || 0) - (b.progress || 0);
        else { // date
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          cmp = ta - tb;
        }
        return cmp * dir;
      });
    };
    const buckets: Record<string, Deal[]> = {};
    STAGE_ORDER.forEach(id => { buckets[id] = []; });
    for (const d of filteredDeals) {
      const stage = statusToStage(d.status);
      (buckets[stage] = buckets[stage] || []).push(d);
    }
    for (const id of Object.keys(buckets)) buckets[id] = sortDeals(buckets[id]);
    return buckets;
  }, [filteredDeals, sortBy, sortDir]);

  const totalSum = useMemo(() => activeDeals.reduce((s, d) => s + (d.amount || 0), 0), [activeDeals]);
  const hasActiveFilters = !!(filterSource || filterOwner || filterPriority || filterDateFrom || filterDateTo);

  // ─── Drag handlers ─────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (!canWrite) { e.preventDefault(); return; }
    isDraggingRef.current = true;
    e.dataTransfer.setData('dealId', id);
    e.currentTarget.classList.add('opacity-40', 'scale-95');
  };
  const handleDragEnd = (e: React.DragEvent) => {
    isDraggingRef.current = false;
    setDragOverStage(null);
    e.currentTarget.classList.remove('opacity-40', 'scale-95');
  };
  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    setDragOverStage(stage);
  };
  const handleDrop = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    isDraggingRef.current = false;
    if (!canWrite) return;
    const id = e.dataTransfer.getData('dealId');
    if (!id) return;
    moveDeal(id, stage);
  };

  // Centralised move handler — used by drag-drop AND the mobile-card
  // "→" dropdown. Confirms a backward move > 1 stage so the user
  // can't accidentally roll something from completed back to new.
  const moveDeal = useCallback((id: string, toStage: string) => {
    const deal = store.deals.find(d => d.id === id);
    if (!deal) return;
    const fromStage = statusToStage(deal.status);
    if (fromStage === toStage) return;
    const fromIdx = STAGE_ORDER.indexOf(fromStage);
    const toIdx = STAGE_ORDER.indexOf(toStage);
    // Backward move by more than 1 stage → require confirmation
    if (fromIdx > -1 && toIdx > -1 && toIdx < fromIdx - 1) {
      setConfirmBackwardMove({ id, from: fromStage, to: toStage });
      return;
    }
    // Only sync progress on forward transitions. Backwards (or sideways)
    // we leave the existing progress alone so manual edits aren't lost.
    const patch: Partial<Deal> = { status: toStage };
    if (toIdx > fromIdx) patch.progress = PROGRESS_BY_STAGE[toStage] ?? deal.progress;
    store.updateDeal(id, patch);
  }, [store]);

  const confirmAndExecuteBackwardMove = () => {
    if (!confirmBackwardMove) return;
    const { id, to } = confirmBackwardMove;
    store.updateDeal(id, { status: to });
    setConfirmBackwardMove(null);
  };

  const handleDeleteDeal = (id: string) => {
    const deal = store.deals.find(d => d.id === id);
    setConfirmDelete({ id, name: deal?.customerName || '' });
  };
  const confirmDeleteNow = () => {
    if (!confirmDelete) return;
    store.deleteDeal(confirmDelete.id);
    setConfirmDelete(null);
  };
  // Reject opens a reason picker first — the lostReason feeds the
  // "почему не покупают" analytics. Drag-to-reject / bulk reject skip it.
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const handleRejectDeal = (id: string) => setRejectingId(id);
  const confirmReject = (reason?: string) => {
    if (!rejectingId) return;
    store.updateDeal(rejectingId, { status: 'rejected', progress: 0, lostReason: reason });
    setRejectingId(null);
  };

  // ─── Bulk actions ──────────────────────────────────────────────
  const toggleBulk = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearBulk = () => setBulkSelected(new Set());
  const bulkMove = (toStage: string) => {
    for (const id of bulkSelected) moveDeal(id, toStage);
    clearBulk();
    setBulkMoveOpen(false);
  };
  const bulkDelete = async () => {
    if (!(await confirmDialog({ message: l(`Удалить ${bulkSelected.size} сделок?`, `${bulkSelected.size} мәмілені жою?`, `Delete ${bulkSelected.size} deals?`), danger: true }))) return;
    for (const id of bulkSelected) store.deleteDeal(id);
    clearBulk();
  };
  const bulkReject = () => {
    for (const id of bulkSelected) store.updateDeal(id, { status: 'rejected', progress: 0 });
    clearBulk();
  };

  // ─── Quick-create from column ──────────────────────────────────
  const openNewDealAt = (stage?: string) => {
    setNewDealDefaults(stage ? { status: stage } : null);
    setShowNewDealModal(true);
  };

  // ─── Iconography ───────────────────────────────────────────────
  const iconMap = (icon: Deal['icon']) => {
    const map: Record<string, JSX.Element> = {
      instagram: <InstagramLogo className="w-3.5 h-3.5" />,
      phone: <Phone className="w-3.5 h-3.5 text-sky-600" />,
      whatsapp: <WhatsAppLogo className="w-3.5 h-3.5" />,
      email: <Mail className="w-3.5 h-3.5 text-emerald-600" />,
      users: <Users className="w-3.5 h-3.5 text-amber-600" />,
      telegram: <TelegramLogo className="w-3.5 h-3.5" />,
      tiktok: <TikTokLogo className="w-3.5 h-3.5" />,
    };
    return map[icon] || <Phone className="w-3.5 h-3.5 text-slate-400" />;
  };

  const priorityConf = (p?: string) => {
    if (!p || p === 'medium') return null; // don't render the "medium" pill for the default
    return ({
      urgent: { label: l('Срочно', 'Шұғыл', 'Urgent'), cls: 'bg-rose-100/70 text-rose-700 ring-rose-200/40' },
      high:   { label: l('Высокий', 'Жоғары', 'High'), cls: 'bg-rose-100/70 text-rose-700 ring-rose-200/40' },
      low:    { label: l('Низкий', 'Төмен', 'Low'),    cls: 'bg-emerald-100/70 text-emerald-700 ring-emerald-200/40' },
    } as any)[p] || null;
  };

  // ─── Empty-state hero ─────────────────────────────────────────
  // When the team has zero non-rejected deals, render a centered hero
  // instead of six empty columns. Provides three clear paths:
  // create one, import CSV, or ask AI to bulk-import.
  const showEmptyHero = activeDeals.length === 0;

  return (
    <>
      <div className="flex flex-col h-screen relative overflow-hidden">
        {/* ─── Header ─────────────────────────────────────────── */}
        <div className="px-4 md:px-8 py-5 flex-shrink-0 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
            <div>
              <p className="text-[11px] text-slate-400 mb-1 tracking-widest uppercase">
                {l('Заказы', 'Тапсырыстар', 'Orders')}
                {' · '}
                <span className="inline-flex items-center gap-1 normal-case tracking-normal text-slate-500"><NicheIcon niche={niche} className="w-3 h-3" /> {niche.name[language]}</span>
              </p>
              <h1 className="text-slate-900 text-2xl md:text-3xl font-medium tracking-tight">
                {l('Воронка продаж', 'Сату воронкасы', 'Sales Funnel')}
              </h1>
              {!canWrite && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-100/70 ring-1 ring-amber-200/40 px-2 py-0.5 rounded-full">
                  <Eye className="w-3 h-3" />
                  {l('Только просмотр', 'Тек қарау', 'View only')}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowArchive(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs text-slate-600 bg-white/50 hover:bg-white/80 ring-1 ring-white/60 backdrop-blur-xl transition-all"
              >
                <Archive className="w-3.5 h-3.5" />
                {l('Архив отказов', 'Бас тарту', 'Rejected')}
                {rejectedDeals.length > 0 && (
                  <span className="ml-0.5 bg-rose-100/70 text-rose-700 text-[10px] px-1.5 py-0.5 rounded-full ring-1 ring-white/40 tabular-nums">
                    {rejectedDeals.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  const ownerName = (id: string | undefined) => id ? (store.getEmployeeById(id)?.name || '') : '';
                  const cols: CsvColumn<Deal>[] = [
                    { header: 'ID',           value: 'id' },
                    { header: 'Клиент',       value: 'customerName' },
                    { header: 'Телефон',      value: 'phone' },
                    { header: 'Адрес',        value: 'address' },
                    { header: 'Продукт',      value: 'product' },
                    { header: niche.productTypeLabel[language], value: 'furnitureType' },
                    { header: 'Сумма',        value: 'amount' },
                    { header: 'Оплачено',     value: 'paidAmount' },
                    { header: 'Статус',       value: 'status' },
                    { header: 'Источник',     value: 'source' },
                    { header: 'Замерщик',     value: 'measurer' },
                    { header: 'Дизайнер',     value: 'designer' },
                    { header: 'Ответственный',value: (d) => ownerName(d.ownerId) },
                    { header: 'Дата замера',  value: 'measurementDate' },
                    { header: 'Готовность',   value: 'completionDate' },
                    { header: 'Установка',    value: 'installationDate' },
                    { header: 'Создано',      value: 'createdAt' },
                    { header: 'Заметки',      value: 'notes' },
                  ];
                  downloadCsv(todayStampedName('deals'), rowsToCsv(store.deals, cols));
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs text-slate-600 bg-white/50 hover:bg-white/80 ring-1 ring-white/60 backdrop-blur-xl transition-all"
                title={l('Скачать сделки в CSV (Excel)', 'CSV-ге жүктеп алу', 'Export deals to CSV')}
              >
                <Download className="w-3.5 h-3.5" />
                {l('Экспорт', 'Экспорт', 'Export')}
              </button>
              <button
                onClick={() => {
                  // Собираем уникальных клиентов из сделок. Ключ — нормализованный
                  // телефон, а если телефона нет — имя в нижнем регистре.
                  type ClientAgg = {
                    name: string; phone: string; address: string;
                    orders: number; total: number; paid: number;
                    sources: Set<string>; products: Set<string>;
                    first: string; last: string;
                  };
                  const map = new Map<string, ClientAgg>();
                  for (const d of store.deals) {
                    // Нормализуем телефон по последним 10 цифрам, чтобы +7 700… и
                    // 8 700… (один и тот же KZ-номер) склеивались в одного клиента.
                    const digits = (d.phone || '').replace(/\D/g, '');
                    const norm = digits.length >= 10 ? digits.slice(-10) : digits;
                    const key = norm || (d.customerName || '').trim().toLowerCase();
                    if (!key) continue;
                    let c = map.get(key);
                    if (!c) {
                      c = { name: d.customerName || '', phone: d.phone || '', address: d.address || '',
                        orders: 0, total: 0, paid: 0, sources: new Set(), products: new Set(),
                        first: d.createdAt || '', last: d.createdAt || '' };
                      map.set(key, c);
                    }
                    c.orders += 1;
                    c.total += Number(d.amount) || 0;
                    c.paid += Number(d.paidAmount) || 0;
                    if (d.source) c.sources.add(d.source);
                    if (d.product) c.products.add(d.product);
                    if (!c.name && d.customerName) c.name = d.customerName;
                    if (!c.address && d.address) c.address = d.address;
                    if (d.createdAt) {
                      if (!c.first || d.createdAt < c.first) c.first = d.createdAt;
                      if (!c.last || d.createdAt > c.last) c.last = d.createdAt;
                    }
                  }
                  const clients = Array.from(map.values()).sort((a, b) => b.total - a.total);
                  const fmtDate = (iso: string) => (iso ? iso.slice(0, 10) : '');
                  const cols: CsvColumn<ClientAgg>[] = [
                    { header: 'Клиент',          value: 'name' },
                    { header: 'Телефон',         value: 'phone' },
                    { header: 'Адрес',           value: 'address' },
                    { header: 'Заказов',         value: 'orders' },
                    { header: 'Сумма',           value: 'total' },
                    { header: 'Оплачено',        value: 'paid' },
                    { header: 'Долг',            value: (c) => c.total - c.paid },
                    { header: 'Источники',       value: (c) => Array.from(c.sources).join(' / ') },
                    { header: 'Продукты',        value: (c) => Array.from(c.products).join(' / ') },
                    { header: 'Первый заказ',    value: (c) => fmtDate(c.first) },
                    { header: 'Последний заказ', value: (c) => fmtDate(c.last) },
                  ];
                  downloadCsv(todayStampedName('clients'), rowsToCsv(clients, cols));
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs text-slate-600 bg-white/50 hover:bg-white/80 ring-1 ring-white/60 backdrop-blur-xl transition-all"
                title={l('Экспорт уникальных клиентов в CSV (Excel)', 'Клиенттерді CSV-ге жүктеу', 'Export unique clients to CSV')}
              >
                <Users className="w-3.5 h-3.5" />
                {l('Клиенты', 'Клиенттер', 'Clients')}
              </button>
              {canWrite && (
                <button
                  onClick={() => setShowImport(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs text-slate-600 bg-white/50 hover:bg-white/80 ring-1 ring-white/60 backdrop-blur-xl transition-all"
                  title={l('Загрузить сделки из CSV', 'CSV-ден жүктеу', 'Import deals from CSV')}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {l('Импорт', 'Импорт', 'Import')}
                </button>
              )}
              {canWrite && (
                <button
                  onClick={() => openNewDealAt()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 backdrop-blur-xl text-white rounded-2xl text-xs shadow-[0_8px_24px_-8px_var(--accent-shadow)] hover:bg-emerald-700 ring-1 ring-white/10 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />{l('Новая сделка', 'Жаңа мәміле', 'New Deal')}
                </button>
              )}
            </div>
          </div>

          {/* Stats + Search + Filters + Sort */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 px-2.5 py-1 rounded-full bg-white/60 ring-1 ring-white/60 backdrop-blur-xl">
                <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full" />
                <span className="tabular-nums">{filteredDeals.length}</span>
                {hasActiveFilters && <span className="text-slate-400">/ {activeDeals.length}</span>}
                {' '}{l(plural(filteredDeals.length, 'сделка', 'сделки', 'сделок'), 'мәміле', 'deals')}
              </div>
              {totalSum > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-600 px-2.5 py-1 rounded-full bg-emerald-100/60 ring-1 ring-white/40 backdrop-blur-xl">
                  <TrendingUp className="w-3 h-3 text-emerald-700" />
                  <span className="tabular-nums text-emerald-700">{fmtMoney(totalSum)}</span>
                </div>
              )}
              {/* Нераспределённые лиды — РОП назначает быстро. */}
              {(() => {
                const unassigned = activeDeals.filter(d => !d.ownerId).length;
                if (unassigned === 0 && !unassignedOnly) return null;
                return (
                  <button
                    onClick={() => setUnassignedOnly(v => !v)}
                    className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full ring-1 transition-all ${unassignedOnly ? 'bg-amber-500 text-white ring-white/20' : 'bg-amber-100/70 text-amber-700 ring-white/40 hover:bg-amber-100'}`}
                    title={l('Показать только нераспределённые', 'Тек бөлінбегендерді көрсету', 'Show unassigned only')}
                  >
                    <Users className="w-3 h-3" />
                    <span className="tabular-nums">{unassigned}</span>
                    {' '}{l('без ответственного', 'жауапсыз', 'unassigned')}
                  </button>
                );
              })()}
            </div>

            <div className="flex-1 min-w-[180px] max-w-xs relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={l('Поиск по клиенту, продукту, телефону', 'Іздеу...', 'Search by client, product, phone')}
                className="w-full pl-9 pr-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all"
              />
            </div>

            {/* Filters toggle — chip-row appears below when expanded */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs ring-1 transition-all ${
                hasActiveFilters || showFilters
                  ? 'bg-emerald-600 text-white ring-white/10'
                  : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              {l('Фильтры', 'Сүзгілер', 'Filters')}
              {hasActiveFilters && (
                <span className="ml-0.5 bg-white/30 text-[10px] px-1.5 py-0.5 rounded-full tabular-nums">
                  {[filterSource, filterOwner, filterPriority, filterDateFrom, filterDateTo].filter(Boolean).length}
                </span>
              )}
            </button>

            {/* Sort dropdown */}
            <div className="relative">
              <select
                value={`${sortBy}:${sortDir}`}
                onChange={e => {
                  const [b, d] = e.target.value.split(':');
                  setSortBy(b as any); setSortDir(d as any);
                }}
                className="appearance-none pl-8 pr-7 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs text-slate-600 hover:bg-white/80 transition-all cursor-pointer"
              >
                <option value="date:desc">{l('Дата ↓', 'Күн ↓', 'Date ↓')}</option>
                <option value="date:asc">{l('Дата ↑', 'Күн ↑', 'Date ↑')}</option>
                <option value="amount:desc">{l('Сумма ↓', 'Сома ↓', 'Amount ↓')}</option>
                <option value="amount:asc">{l('Сумма ↑', 'Сома ↑', 'Amount ↑')}</option>
                <option value="priority:asc">{l('Приоритет', 'Басымдық', 'Priority')}</option>
                <option value="progress:desc">{l('Прогресс ↓', 'Прогресс ↓', 'Progress ↓')}</option>
              </select>
              <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Niche filter row — only for multi-niche teams. Sits above
              the standard filter chips so the user can slice the board
              by direction in one click, without opening the filter pane. */}
          {store.secondaryNiches.length > 0 && (
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setFilterNiche('')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-2xl text-[11px] ring-1 transition-all ${
                  filterNiche === ''
                    ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]'
                    : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
                }`}
              >
                {l('Все направления', 'Барлық бағыттар', 'All directions')}
              </button>
              {store.allNiches.map(nid => {
                const n = getNiche(nid);
                const count = activeDeals.filter(d => (d.niche || store.niche) === nid).length;
                const active = filterNiche === nid;
                return (
                  <button
                    key={nid}
                    onClick={() => setFilterNiche(nid)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-2xl text-[11px] ring-1 transition-all ${
                      active
                        ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]'
                        : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
                    }`}
                  >
                    <NicheIcon niche={n} className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-slate-400'}`} />
                    <span>{n.name[language]}</span>
                    <span className={`text-[10px] tabular-nums ${active ? 'text-white/70' : 'text-slate-400'}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Filter chip-row (expanded) */}
          {showFilters && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <select
                value={filterSource}
                onChange={e => setFilterSource(e.target.value)}
                className="px-3 py-1.5 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs"
              >
                <option value="">{l('Все источники', 'Барлық көздер', 'All sources')}</option>
                {knownSources.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={filterOwner}
                onChange={e => setFilterOwner(e.target.value)}
                className="px-3 py-1.5 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs"
              >
                <option value="">{l('Все ответственные', 'Барлық', 'All owners')}</option>
                {store.employees.filter((e: any) => !e.removed_at).map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <select
                value={filterPriority}
                onChange={e => setFilterPriority(e.target.value)}
                className="px-3 py-1.5 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs"
              >
                <option value="">{l('Любой приоритет', 'Кез келген басымдық', 'Any priority')}</option>
                <option value="urgent">{l('Срочно', 'Шұғыл', 'Urgent')}</option>
                <option value="high">{l('Высокий', 'Жоғары', 'High')}</option>
                <option value="medium">{l('Средний', 'Орташа', 'Medium')}</option>
                <option value="low">{l('Низкий', 'Төмен', 'Low')}</option>
              </select>
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                className="px-3 py-1.5 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs tabular-nums"
                title={l('С даты', 'Бастап', 'From date')}
              />
              <input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
                className="px-3 py-1.5 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs tabular-nums"
                title={l('По дату', 'Дейін', 'To date')}
              />
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setFilterSource(''); setFilterOwner(''); setFilterPriority('');
                    setFilterDateFrom(''); setFilterDateTo('');
                  }}
                  className="px-3 py-1.5 bg-rose-100/70 text-rose-700 ring-1 ring-rose-200/40 rounded-2xl text-xs hover:bg-rose-100"
                >
                  {l('Сбросить', 'Тазарту', 'Reset')}
                </button>
              )}
            </div>
          )}

          {/* Bulk action bar (visible only when something selected) */}
          {bulkSelected.size > 0 && (
            <div className="mt-3 flex items-center gap-2 flex-wrap p-2 bg-emerald-50/80 backdrop-blur-xl ring-1 ring-emerald-200/40 rounded-2xl">
              <span className="text-xs text-emerald-900 px-2">
                {l('Выбрано:', 'Таңдалды:', 'Selected:')} <b>{bulkSelected.size}</b>
              </span>
              <div className="relative">
                <button
                  onClick={() => setBulkMoveOpen(!bulkMoveOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/80 hover:bg-white ring-1 ring-white/60 rounded-xl text-xs text-slate-700 transition-colors"
                >
                  <MoveRight className="w-3 h-3" />
                  {l('Переместить', 'Жылжыту', 'Move')}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {bulkMoveOpen && (
                  <div className="absolute left-0 top-full mt-1 bg-white/95 backdrop-blur-xl ring-1 ring-white/60 rounded-xl shadow-lg z-20 p-1 min-w-[180px]">
                    {STAGES.map(s => (
                      <button
                        key={s.id}
                        onClick={() => bulkMove(s.id)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 rounded-lg flex items-center gap-2"
                      >
                        <span className={`w-1.5 h-1.5 ${s.dot} rounded-full`} />
                        {s[language]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={bulkReject}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/80 hover:bg-white ring-1 ring-white/60 rounded-xl text-xs text-slate-700 transition-colors"
              >
                <XCircle className="w-3 h-3" /> {l('В отказы', 'Бас тарту', 'Reject')}
              </button>
              <button
                onClick={bulkDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/90 hover:bg-rose-700 text-white rounded-xl text-xs transition-colors"
              >
                <Trash2 className="w-3 h-3" /> {l('Удалить', 'Жою', 'Delete')}
              </button>
              <button onClick={clearBulk} className="ml-auto text-[11px] text-slate-500 hover:text-slate-900 px-2">
                {l('Снять', 'Алып тастау', 'Clear')}
              </button>
            </div>
          )}
        </div>

        {/* ─── Empty-state hero ────────────────────────────────── */}
        {showEmptyHero ? (
          <div className="flex-1 flex items-center justify-center px-4 pb-12 overflow-y-auto">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/60 ring-1 ring-white/60 shadow-[0_8px_24px_-10px_rgba(15,23,42,0.18)] flex items-center justify-center text-slate-500"><NicheIcon niche={niche} className="w-7 h-7" /></div>
              <h2 className="text-xl text-slate-900 mb-2 tracking-tight">
                {l(`Здесь будут ваши сделки`, 'Мәмілелер осы жерде болады', 'Your deals will live here')}
              </h2>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                {l(
                  `6 этапов воронки от заявки до завершения — для ниши «${niche.name[language]}». Начните с первой сделки или импорта из CSV.`,
                  `Өтінімнен аяқтауға дейін 6 кезең — «${niche.name[language]}» саласы үшін.`,
                  `6 funnel stages from lead to done — tuned for "${niche.name[language]}". Start by adding one or importing CSV.`,
                )}
              </p>
              <div className="flex items-center gap-2 justify-center flex-wrap">
                {canWrite && (
                  <button
                    onClick={() => openNewDealAt('new')}
                    className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    {l('Создать первую сделку', 'Бірінші мәміле', 'Create first deal')}
                  </button>
                )}
                {canWrite && (
                  <button
                    onClick={() => setShowImport(true)}
                    className="flex items-center gap-2 px-4 py-3 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-2xl text-sm text-slate-700 backdrop-blur-xl transition-all"
                  >
                    <Upload className="w-4 h-4" /> {l('Импорт CSV', 'CSV импорт', 'Import CSV')}
                  </button>
                )}
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('ai-assistant:open', {
                      detail: {
                        prompt: l(
                          `Вот наши клиенты: Иван +7..., Петр +7... — заведи каждого как сделку в нише «${niche.name[language]}».`,
                          `Клиенттер тізімі: Иван +7..., Петр +7... — әрқайсын мәміле етіп жасаңыз.`,
                          `Here are our clients: Ivan +7..., Petr +7... — create each as a deal.`,
                        ),
                      },
                    }));
                  }}
                  className="flex items-center gap-2 px-4 py-3 bg-violet-600/90 hover:bg-violet-700 text-white rounded-2xl text-sm shadow-[0_8px_24px_-8px_rgba(124,58,237,0.4)] ring-1 ring-white/10 transition-all"
                >
                  <Sparkles className="w-4 h-4" /> {l('Через AI', 'AI арқылы', 'Via AI')}
                </button>
              </div>
            </div>
          </div>
        ) : isMobile ? (
          // ─── Mobile: single column + stage tabs ──────────────────
          <div className="flex-1 overflow-hidden flex flex-col px-4 pb-4">
            {/* Stage pill tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-3 flex-shrink-0">
              {STAGES.map(s => {
                const count = dealsByStage[s.id]?.length || 0;
                const active = mobileStage === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setMobileStage(s.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs whitespace-nowrap ring-1 transition-all ${
                      active
                        ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]'
                        : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 ${s.dot} rounded-full`} />
                    {s[language]}
                    <span className="text-[10px] opacity-80 tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
            {/* Single column body */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {(dealsByStage[mobileStage] || []).map(deal => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  selected={bulkSelected.has(deal.id)}
                  onToggleSelect={() => toggleBulk(deal.id)}
                  onOpen={() => setSelectedDeal(deal)}
                  onReject={() => handleRejectDeal(deal.id)}
                  onDelete={() => handleDeleteDeal(deal.id)}
                  onMove={(toStage) => moveDeal(deal.id, toStage)}
                  iconMap={iconMap}
                  priorityConf={priorityConf}
                  canWrite={canWrite}
                  isMobile={true}
                  language={language}
                  l={l}
                  teamNiche={store.niche}
                  showNicheChip={store.secondaryNiches.length > 0}
                  owners={owners}
                  onAssign={(ownerId: string) => store.updateDeal(deal.id, { ownerId })}
                />
              ))}
              {(dealsByStage[mobileStage] || []).length === 0 && (
                <div className="py-12 text-center">
                  <div className="text-[11px] text-slate-400 mb-3">
                    {l('Здесь пусто', 'Бос', 'Empty here')}
                  </div>
                  {canWrite && (
                    <button
                      onClick={() => openNewDealAt(mobileStage)}
                      className="text-[11px] px-3 py-1.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"
                    >
                      + {l('Сделка в этом этапе', 'Осы кезеңде мәміле', 'New deal in this stage')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          // ─── Desktop: 6-column kanban ─────────────────────────
          <div className="flex-1 overflow-hidden px-4 md:px-6 relative">
            <div className="flex gap-3 overflow-x-auto h-full py-3 pb-6">
              {STAGES.map(stage => {
                const stageDeals = dealsByStage[stage.id] || [];
                const total = stageDeals.reduce((s, d) => s + (d.amount || 0), 0);
                const overCap = stageDeals.length > WIP_SOFT_CAP;
                const isDropTarget = dragOverStage === stage.id;
                return (
                  <div
                    key={stage.id}
                    onDragOver={canWrite ? (e) => handleDragOver(e, stage.id) : undefined}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={canWrite ? (e) => handleDrop(e, stage.id) : undefined}
                    className={`flex-shrink-0 w-[272px] h-full flex flex-col rounded-3xl transition-all ${
                      isDropTarget ? 'bg-emerald-50/40 ring-2 ring-emerald-300/60 -m-1 p-1' : ''
                    }`}
                  >
                    {/* Column header — glass capsule with WIP indicator */}
                    <div className={`mb-2.5 flex items-center justify-between gap-2 px-3 py-2 rounded-2xl ring-1 backdrop-blur-xl ${
                      overCap ? 'bg-amber-50/80 ring-amber-200/60' : 'bg-white/40 ring-white/60'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 ${stage.dot} rounded-full flex-shrink-0`} />
                        <span className="text-[11px] text-slate-700 truncate">{stage[language]}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${stage.accent} ring-1 ring-white/40 tabular-nums flex-shrink-0`}>
                          {stageDeals.length}
                        </span>
                        {overCap && (
                          <AlertTriangle
                            className="w-3 h-3 text-amber-600 flex-shrink-0"
                            // eslint-disable-next-line jsx-a11y/aria-props
                            aria-label={l('WIP-лимит превышен', 'WIP-шегі асып кетті', 'WIP cap exceeded')}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {total > 0 && (
                          <span className="text-[10px] text-slate-500 tabular-nums">
                            {fmtMoney(total)}
                          </span>
                        )}
                        {canWrite && (
                          <button
                            onClick={() => openNewDealAt(stage.id)}
                            className="w-5 h-5 flex items-center justify-center rounded-lg hover:bg-white/70 text-slate-400 hover:text-emerald-700 transition-colors"
                            title={l('Создать сделку в этом этапе', 'Осы кезеңде жасау', 'Create deal in this stage')}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Cards column */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 pb-2">
                      {stageDeals.length === 0 && (
                        <div className={`border-2 border-dashed rounded-2xl py-8 flex flex-col items-center justify-center backdrop-blur-xl transition-colors ${
                          isDropTarget
                            ? 'border-emerald-300 bg-emerald-50/30'
                            : 'border-white/70 bg-white/20'
                        }`}>
                          <span className="text-[10px] text-slate-400 mb-2">
                            {canWrite
                              ? l('Перетащите сюда', 'Сүйреңіз', 'Drop here')
                              : l('Пусто', 'Бос', 'Empty')}
                          </span>
                          {canWrite && (
                            <button
                              onClick={() => openNewDealAt(stage.id)}
                              className="text-[10px] text-emerald-700 hover:underline"
                            >
                              + {l('Создать', 'Жасау', 'Create')}
                            </button>
                          )}
                        </div>
                      )}
                      {stageDeals.map(deal => (
                        <DealCard
                          key={deal.id}
                          deal={deal}
                          selected={bulkSelected.has(deal.id)}
                          onToggleSelect={() => toggleBulk(deal.id)}
                          onOpen={() => setSelectedDeal(deal)}
                          onReject={() => handleRejectDeal(deal.id)}
                          onDelete={() => handleDeleteDeal(deal.id)}
                          onMove={(toStage) => moveDeal(deal.id, toStage)}
                          onDragStart={(e) => handleDragStart(e, deal.id)}
                          onDragEnd={handleDragEnd}
                          iconMap={iconMap}
                          priorityConf={priorityConf}
                          canWrite={canWrite}
                          isMobile={false}
                          language={language}
                          l={l}
                          teamNiche={store.niche}
                          showNicheChip={store.secondaryNiches.length > 0}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── New-deal modal ──────────────────────────────────── */}
      {showNewDealModal && (
        <NewDealModal
          language={language}
          seed={templateSeed || undefined}
          defaultStatus={newDealDefaults?.status}
          onClose={() => {
            setShowNewDealModal(false);
            setTemplateSeed(null);
            setNewDealDefaults(null);
          }}
        />
      )}

      {/* ─── CSV import modal ────────────────────────────────── */}
      {showImport && (
        <CsvImportModal
          language={language}
          title={l('Сделки', 'Мәмілелер', 'Deals')}
          fields={[
            { key: 'customerName', headers: ['Клиент', 'Customer', 'Имя'], required: true },
            { key: 'phone',        headers: ['Телефон', 'Phone'] },
            { key: 'address',      headers: ['Адрес', 'Address'] },
            { key: 'product',      headers: ['Продукт', 'Product'] },
            { key: 'furnitureType',headers: ['Тип', 'Type', niche.productTypeLabel.ru] },
            { key: 'amount',       headers: ['Сумма', 'Amount'], transform: (v) => Number(String(v).replace(/[^0-9.-]/g, '')) || 0 },
            { key: 'paidAmount',   headers: ['Оплачено', 'Paid'], transform: (v) => Number(String(v).replace(/[^0-9.-]/g, '')) || 0 },
            { key: 'status',       headers: ['Статус', 'Status'] },
            { key: 'source',       headers: ['Источник', 'Source'] },
            { key: 'measurer',     headers: ['Замерщик', 'Measurer'] },
            { key: 'designer',     headers: ['Дизайнер', 'Designer'] },
            { key: 'notes',        headers: ['Заметки', 'Notes'] },
          ] as CsvFieldSpec[]}
          onImport={async (rec) => {
            // Validate status — silently coerce unknown values to 'new'
            // so a typo in the source CSV doesn't create an orphan stage.
            const rawStatus = String(rec.status || 'new').toLowerCase().trim();
            const knownStatuses = ['new', 'measured', 'project-agreed', 'production', 'installation', 'completed', 'rejected'];
            const status = knownStatuses.includes(rawStatus) ? rawStatus : 'new';
            // Duplicate-phone check: skip the row if we already have a
            // deal with the same phone. Empty phones are always allowed.
            const phone = String(rec.phone || '').replace(/[^0-9+]/g, '');
            if (phone && store.deals.some(d => (d.phone || '').replace(/[^0-9+]/g, '') === phone)) {
              console.warn('[csv import] skipping duplicate phone', phone);
              return;
            }
            store.addDeal({
              customerName: String(rec.customerName),
              phone: String(rec.phone || ''),
              address: String(rec.address || ''),
              product: String(rec.product || ''),
              furnitureType: String(rec.furnitureType || ''),
              amount: Number(rec.amount) || 0,
              paidAmount: Number(rec.paidAmount) || 0,
              status,
              icon: 'phone',
              priority: 'medium',
              date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
              progress: PROGRESS_BY_STAGE[status] ?? 5,
              source: String(rec.source || 'Импорт'),
              measurer: String(rec.measurer || ''),
              designer: String(rec.designer || ''),
              materials: '',
              measurementDate: '',
              completionDate: '',
              installationDate: '',
              paymentMethods: { cash: false, kaspi: false, halyk: false, card_transfer: false, bank_transfer: false, installment: false },
              notes: String(rec.notes || ''),
              // workType derives from the team's niche — no more hardcoded
              // 'furniture' for non-furniture businesses.
              workType: (store.niche || 'furniture') as any,
            });
          }}
          onClose={() => { setShowImport(false); store.reloadAll(); }}
        />
      )}

      {/* ─── Reject reason picker ────────────────────────────── */}
      {rejectingId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setRejectingId(null)} />
          <div className="relative w-full max-w-sm bg-white/85 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_24px_64px_-16px_rgba(15,23,42,0.35)] rounded-3xl p-5 animate-[toastIn_.18s_ease-out]">
            <div className="text-sm text-slate-900 mb-1">{l('Причина отказа', 'Бас тарту себебі', 'Reason for rejection')}</div>
            <div className="text-[11px] text-slate-500 mb-4">{l('Поможет понять, почему клиенты не покупают.', 'Клиенттер неге сатып алмайтынын түсінуге көмектеседі.', 'Helps understand why clients don\'t buy.')}</div>
            <div className="grid grid-cols-2 gap-2">
              {LOST_REASONS.map(r => (
                <button key={r} onClick={() => confirmReject(r)}
                  className="px-3 py-2 rounded-xl text-[11px] text-slate-700 bg-white/60 ring-1 ring-white/60 hover:bg-white hover:ring-rose-200 transition-colors text-left">
                  {r}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button onClick={() => confirmReject(undefined)} className="text-[11px] text-slate-400 hover:text-slate-600">{l('Без причины', 'Себепсіз', 'No reason')}</button>
              <button onClick={() => setRejectingId(null)} className="px-3.5 py-2 rounded-xl text-xs text-slate-600 bg-white/60 ring-1 ring-white/60 hover:bg-white transition-colors">{l('Отмена', 'Болдырмау', 'Cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Rejected archive modal (glass) ──────────────────── */}
      {showArchive && (
        <RejectedArchive
          rejectedDeals={rejectedDeals}
          canWrite={canWrite}
          language={language}
          l={l}
          onClose={() => setShowArchive(false)}
          onRestore={(id) => store.updateDeal(id, { status: 'new', progress: PROGRESS_BY_STAGE.new })}
          onDelete={(id) => handleDeleteDeal(id)}
        />
      )}

      {/* ─── Deal modal (live deal from store) ───────────────── */}
      {selectedDeal && (() => {
        const live = store.deals.find(d => d.id === selectedDeal.id) || selectedDeal;
        return (
          <ClientOrderModal
            isOpen={true}
            onClose={() => setSelectedDeal(null)}
            deal={live}
            language={language}
          />
        );
      })()}

      {/* ─── Confirm delete dialog ────────────────────────────── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-[60] flex items-center justify-center p-4"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-white/85 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl w-full max-w-sm p-6 shadow-[0_24px_64px_-12px_var(--accent-shadow-sm)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-100/70 text-rose-700 ring-1 ring-white/60 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="text-center text-sm text-slate-900 mb-1">
              {l('Удалить сделку?', 'Мәмілені жою?', 'Delete deal?')}
            </div>
            <div className="text-center text-[11px] text-slate-500 mb-5 leading-relaxed">
              {confirmDelete.name
                ? l(`«${confirmDelete.name}» будет удалён без возможности восстановить.`,
                    `«${confirmDelete.name}» қайтарылмастан жойылады.`,
                    `"${confirmDelete.name}" will be removed with no way to restore.`)
                : l('Действие нельзя отменить.', 'Әрекетті болдырмауға болмайды.', "This can't be undone.")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-2.5 bg-white/70 hover:bg-white ring-1 ring-white/60 text-slate-700 rounded-2xl text-xs transition-colors"
              >
                {l('Отмена', 'Бас тарту', 'Cancel')}
              </button>
              <button
                onClick={confirmDeleteNow}
                className="px-3 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs transition-colors shadow-[0_8px_24px_-8px_rgba(225,29,72,0.5)]"
              >
                {l('Удалить', 'Жою', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Confirm backward-move dialog ─────────────────────── */}
      {confirmBackwardMove && (() => {
        const fromLabel = STAGES.find(s => s.id === confirmBackwardMove.from)?.[language] || confirmBackwardMove.from;
        const toLabel = STAGES.find(s => s.id === confirmBackwardMove.to)?.[language] || confirmBackwardMove.to;
        return (
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-[60] flex items-center justify-center p-4"
            onClick={() => setConfirmBackwardMove(null)}
          >
            <div
              className="bg-white/85 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl w-full max-w-sm p-6 shadow-[0_24px_64px_-12px_var(--accent-shadow-sm)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-100/70 text-amber-700 ring-1 ring-white/60 flex items-center justify-center mx-auto mb-4">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="text-center text-sm text-slate-900 mb-2">
                {l('Вернуть сделку назад?', 'Мәмілені артқа қайтару?', 'Move deal backward?')}
              </div>
              <div className="text-center text-[11px] text-slate-500 mb-5 leading-relaxed">
                {l(`Из «${fromLabel}» обратно в «${toLabel}». Это нормально если решили переделать этап.`,
                   `«${fromLabel}» → «${toLabel}». Кезеңді қайта жасайтын болсаңыз қалыпты жағдай.`,
                   `From "${fromLabel}" back to "${toLabel}". Normal if you're redoing that stage.`)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setConfirmBackwardMove(null)}
                  className="px-3 py-2.5 bg-white/70 hover:bg-white ring-1 ring-white/60 text-slate-700 rounded-2xl text-xs transition-colors"
                >
                  {l('Отмена', 'Бас тарту', 'Cancel')}
                </button>
                <button
                  onClick={confirmAndExecuteBackwardMove}
                  className="px-3 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-xs transition-colors"
                >
                  {l('Переместить', 'Жылжыту', 'Move')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

// ─── Deal card — used by both desktop (drag) and mobile (move-menu) ─
function DealCard(props: {
  deal: Deal;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onReject: () => void;
  onDelete: () => void;
  onMove: (toStage: string) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  iconMap: (icon: Deal['icon']) => JSX.Element;
  priorityConf: (p?: string) => { label: string; cls: string } | null;
  canWrite: boolean;
  isMobile: boolean;
  language: 'kz' | 'ru' | 'eng';
  l: (ru: string, kz: string, eng: string) => string;
  // When the team has secondary niches and this deal belongs to a
  // non-primary one, we render a small icon+name chip so the manager
  // can scan the board and immediately tell which order is for which
  // direction (e.g. furniture team also doing doors — door deals get a
  // 🚪 chip). Undefined / equal-to-primary → no chip.
  teamNiche: string;
  showNicheChip: boolean;
  owners: { id: string; name: string }[];
  onAssign: (ownerId: string) => void;
}) {
  const { deal, selected, onToggleSelect, onOpen, onReject, onDelete, onMove,
          onDragStart, onDragEnd, iconMap, priorityConf, canWrite, isMobile, language, l,
          teamNiche, showNicheChip, owners, onAssign } = props;
  const [moveOpen, setMoveOpen] = useState(false);
  const currentStage = statusToStage(deal.status);
  const priority = priorityConf(deal.priority);
  // Resolved niche for this deal — falls back to team's primary so
  // single-niche teams get a stable chip-free render.
  const dealNiche = getDealNiche(deal, teamNiche);

  return (
    <div
      draggable={!isMobile && canWrite}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => !moveOpen && onOpen()}
      className={`${GLASS_CARD} p-3 transition-all hover:bg-white/85 hover:shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 group ${
        selected ? 'ring-2 ring-emerald-500' : ''
      } ${canWrite && !isMobile ? 'cursor-move' : 'cursor-pointer'}`}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {canWrite && (
            <input
              type="checkbox"
              checked={selected}
              onClick={e => e.stopPropagation()}
              onChange={() => onToggleSelect()}
              className="w-3.5 h-3.5 rounded accent-emerald-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              title={l('Выбрать для массового действия', 'Жаппай әрекет үшін', 'Select for bulk')}
            />
          )}
          <div className="w-8 h-8 bg-white/60 ring-1 ring-white/60 rounded-xl flex items-center justify-center flex-shrink-0">
            {iconMap(deal.icon)}
          </div>
          <span className="text-xs text-slate-900 truncate">{deal.customerName}</span>
        </div>
        {canWrite && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Mobile: move-to-stage dropdown. Desktop relies on drag. */}
            {isMobile && (
              <div className="relative">
                <button
                  onClick={e => { e.stopPropagation(); setMoveOpen(!moveOpen); }}
                  className="p-1 hover:bg-white/70 rounded-lg transition-colors"
                  title={l('Переместить', 'Жылжыту', 'Move')}
                >
                  <MoveRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
                {moveOpen && (
                  <div
                    className="absolute right-0 top-full mt-1 bg-white/95 backdrop-blur-xl ring-1 ring-white/60 rounded-xl shadow-lg z-30 p-1 min-w-[160px]"
                    onClick={e => e.stopPropagation()}
                  >
                    {STAGES.filter(s => s.id !== currentStage).map(s => (
                      <button
                        key={s.id}
                        onClick={() => { onMove(s.id); setMoveOpen(false); }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 rounded-lg flex items-center gap-2"
                      >
                        <span className={`w-1.5 h-1.5 ${s.dot} rounded-full`} />
                        {s[language]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={e => { e.stopPropagation(); onReject(); }}
              className="p-1 hover:bg-rose-100/70 rounded-lg transition-colors"
              title={l('В архив отказов', 'Бас тарту', 'Reject')}
            >
              <XCircle className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="p-1 hover:bg-rose-100/70 rounded-lg transition-colors"
              title={l('Удалить', 'Жою', 'Delete')}
            >
              <X className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" />
            </button>
          </div>
        )}
      </div>

      {/* Niche chip — only on multi-niche teams. Tells the manager
          which direction this deal is for at a glance. */}
      {showNicheChip && (
        <div className="mb-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50/70 text-emerald-700 text-[10px] ring-1 ring-emerald-100/60">
          <NicheIcon niche={dealNiche} className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{dealNiche.name[language]}</span>
        </div>
      )}

      {/* SLA — необработанный новый лид (скорость реакции). */}
      {deal.status === 'new' && !deal.firstContactAt && deal.createdAt && (() => {
        const mins = Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / 60000);
        if (isNaN(mins) || mins < 1) return null;
        const over = mins >= 120, warn = mins >= 30;
        const label = mins >= 60 ? `${Math.floor(mins / 60)} ${l('ч', 'сағ', 'h')}` : `${mins} ${l('мин', 'мин', 'min')}`;
        return (
          <div className={`mb-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ring-1 ${over ? 'bg-rose-50 text-rose-600 ring-rose-100/60' : warn ? 'bg-amber-50 text-amber-600 ring-amber-100/60' : 'bg-slate-50 text-slate-500 ring-white/60'}`}>
            <Clock className="w-2.5 h-2.5" /> {l('не обработан', 'өңделмеген', 'unhandled')} {label}
          </div>
        );
      })()}

      {/* Следующий шаг — подсветка сегодня/просрочено. */}
      {deal.nextActionAt && (() => {
        const today = new Date().toISOString().slice(0, 10);
        const overdue = deal.nextActionAt < today;
        const isToday = deal.nextActionAt === today;
        if (!overdue && !isToday) return null;
        return (
          <div className={`mb-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ring-1 ${overdue ? 'bg-rose-50 text-rose-600 ring-rose-100/60' : 'bg-amber-50 text-amber-600 ring-amber-100/60'}`}>
            <Calendar className="w-2.5 h-2.5" />
            {overdue ? l('касание просрочено', 'байланыс өтті', 'follow-up overdue') : l('касание сегодня', 'байланыс бүгін', 'follow-up today')}
            {deal.nextActionNote ? ` · ${deal.nextActionNote}` : ''}
          </div>
        );
      })()}

      {/* Быстрое назначение — РОП распределяет лид без открытия карточки. */}
      {!deal.ownerId && canWrite && owners.length > 0 && (
        <select
          value=""
          onClick={e => e.stopPropagation()}
          onChange={e => { if (e.target.value) onAssign(e.target.value); }}
          className="mb-2.5 w-full px-2 py-1 bg-amber-50 ring-1 ring-amber-100/60 rounded-lg text-[11px] text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-300"
        >
          <option value="">{l('Назначить ответственного…', 'Жауапты тағайындау…', 'Assign owner…')}</option>
          {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )}

      {/* Product + Amount */}
      <div className="mb-2.5">
        <div className="text-[11px] text-slate-500 truncate mb-1">{deal.product || '—'}</div>
        <div className="text-sm text-slate-900 tabular-nums">{fmtMoney(deal.amount || 0)}</div>
      </div>

      {/* Progress (only when > 0) */}
      {deal.progress != null && deal.progress > 0 && (
        <div className="mb-2.5">
          <div className="w-full h-1 bg-white/60 rounded-full overflow-hidden ring-1 ring-white/40">
            <div
              className={`h-full rounded-full transition-all ${
                deal.progress === 100
                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                  : 'bg-gradient-to-r from-sky-400 to-violet-400'
              }`}
              style={{ width: `${deal.progress}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400 text-right mt-0.5 tabular-nums">{deal.progress}%</div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-white/60">
        {priority ? (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${priority.cls} ring-1`}>
            {priority.label}
          </span>
        ) : (
          <span /> /* spacer */
        )}
        {deal.date && (
          <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
            <Calendar className="w-2.5 h-2.5" />{deal.date}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Rejected archive — with search since long lists are painful ───
function RejectedArchive(props: {
  rejectedDeals: Deal[];
  canWrite: boolean;
  language: 'kz' | 'ru' | 'eng';
  l: (ru: string, kz: string, eng: string) => string;
  onClose: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { rejectedDeals, canWrite, language, l, onClose, onRestore, onDelete } = props;
  const [q, setQ] = useState('');
  // Aggregate lost reasons — «почему не покупают», most common first.
  const reasonStats = useMemo(() => {
    const m = new Map<string, number>();
    rejectedDeals.forEach(d => { if (d.lostReason) m.set(d.lostReason, (m.get(d.lostReason) || 0) + 1); });
    return Array.from(m.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  }, [rejectedDeals]);
  const filtered = useMemo(() => {
    if (!q.trim()) return rejectedDeals;
    const lq = q.toLowerCase();
    return rejectedDeals.filter(d =>
      (d.customerName || '').toLowerCase().includes(lq)
      || (d.product || '').toLowerCase().includes(lq)
      || (d.phone || '').toLowerCase().includes(lq)
    );
  }, [rejectedDeals, q]);

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={`${GLASS_DEEP} max-w-lg w-full max-h-[80vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-white/60 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-rose-100/70 text-rose-700 ring-1 ring-white/60 flex items-center justify-center">
              <Archive className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm text-slate-900">{l('Архив отказов', 'Бас тарту мұрағаты', 'Rejected Archive')}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {filtered.length} / {rejectedDeals.length} {l(plural(rejectedDeals.length, 'сделка', 'сделки', 'сделок'), 'мәміле', 'deals')}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 bg-white/60 ring-1 ring-white/60 rounded-2xl flex items-center justify-center hover:bg-white transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        {/* Search */}
        {rejectedDeals.length > 5 && (
          <div className="px-4 py-3 border-b border-white/60 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={l('Поиск по архиву', 'Архивтен іздеу', 'Search archive')}
                className="w-full pl-9 pr-3 py-2 bg-white/50 ring-1 ring-white/60 rounded-2xl text-xs focus:outline-none focus:bg-white"
              />
            </div>
          </div>
        )}
        {/* Reasons summary — почему не покупают */}
        {reasonStats.length > 0 && (
          <div className="px-4 py-3 border-b border-white/60 flex-shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">{l('Почему не покупают', 'Неге сатып алмайды', 'Why they don\'t buy')}</div>
            <div className="flex flex-wrap gap-1.5">
              {reasonStats.map(r => (
                <span key={r.reason} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-rose-50 text-rose-700 ring-1 ring-rose-100/60">
                  {r.reason} <b className="tabular-nums">{r.count}</b>
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/50 ring-1 ring-white/60 mx-auto mb-3 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-xs text-slate-500">
                {q ? l('Ничего не найдено', 'Ештеңе табылмады', 'Nothing found')
                   : l('Отказов нет', 'Бас тартулар жоқ', 'No rejections')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(deal => (
                <div key={deal.id} className="bg-white/50 ring-1 ring-white/60 rounded-2xl p-3 flex items-center gap-3 backdrop-blur-xl">
                  <div className="w-9 h-9 rounded-2xl bg-rose-100/70 text-rose-700 ring-1 ring-white/60 flex items-center justify-center flex-shrink-0">
                    <XCircle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm text-slate-900 truncate">{deal.customerName}</span>
                      <span className="text-[10px] bg-rose-100/70 text-rose-700 ring-1 ring-white/40 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {l('Отказ', 'Бас тарту', 'Rejected')}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {deal.product || '—'} · {fmtMoney(deal.amount || 0)}
                    </div>
                    {deal.lostReason && (
                      <div className="text-[10px] text-rose-500 mt-0.5 truncate">{l('Причина', 'Себебі', 'Reason')}: {deal.lostReason}</div>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => onRestore(deal.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] bg-white/70 hover:bg-white ring-1 ring-white/60 rounded-xl text-slate-700 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        {l('Вернуть', 'Қайтару', 'Restore')}
                      </button>
                      <button onClick={() => onDelete(deal.id)} className="p-1.5 hover:bg-rose-100/70 rounded-xl transition-colors">
                        <X className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
