import { useState, useEffect, useMemo } from 'react';
import { Package, TrendingUp, AlertTriangle, ShoppingCart, Wrench, Users, Clock, CheckCircle, Plus, X, Search, Edit2, Eye, Truck, Calendar, BarChart3, ArrowUpDown, MapPin, FileText, Trash2, Loader2, Copy, PlayCircle, Download, Upload, ArrowUp, ArrowDown } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';
import { Calculator } from './Calculator';
import { api } from '../utils/api';
import { getNiche, type NicheStage } from '../utils/niches';
import { CsvImportModal, type CsvFieldSpec } from './CsvImportModal';
import { rowsToCsv, downloadCsv, todayStampedName, type CsvColumn } from '../utils/csv';
import { toast } from '../utils/toast';

interface Product {
  id: string; name: string; category: string; quantity: number; unit: string; supplier: string; cost: number; status: 'instock' | 'low' | 'outofstock'; minQty: number;
}

interface ProdOrder {
  id: number; dealId: string; name: string; client: string; master: string;
  daysLeft: number; progress: number; status: 'working' | 'done' | 'started' | 'paused';
  start: string; end: string; materials: string[];
  stages?: DealStage[];
  consumed?: ConsumedMaterial[];
}

// ─── Material consumption per deal ────────────────────────────────
// When the workshop pulls material from stock onto a specific deal,
// we record it on the deal blob. Each row carries the source product
// id (to look up cost / category later), name (snapshot — if the
// product gets renamed the deal still shows what was actually used),
// qty / unit, and timestamp.
export interface ConsumedMaterial {
  productId: string;
  productName: string;
  qty: number;
  unit: string;
  costPerUnit: number;
  deductedAt: string;
  by?: string; // employee who deducted
}

// ─── Production stages (niche-aware workshop flow) ───────────────
// Each in-production deal carries a `stages` array tracking its
// workshop pipeline. The pipeline definition is NOT hardcoded — it
// comes from the team's niche (see src/app/utils/niches.ts):
//   • Furniture  → cutting → edging → assembly → packaging → delivery
//   • Windows    → cutting → welding → glazing → delivery → installation
//   • Ceilings   → cutting → preparation → installation → finishing → handover
//   • etc.
// Stored on the deal JSON blob alongside everything else, so no extra
// table is needed.
export type StageStatus = 'pending' | 'in-progress' | 'done';
export interface DealStage {
  id: string;  // matches a niche stage id (cutting, welding, glazing, etc.)
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  assignee?: string;
  notes?: string;
}
// Legacy export kept so other modules (e.g. ClientOrderModal) that
// imported DEFAULT_STAGES_TEMPLATE continue to compile. It's now just
// the furniture fallback — actual rendering inside Warehouse pulls
// from the live niche config.
export const DEFAULT_STAGES_TEMPLATE: { id: string; ru: string; kz: string; eng: string; icon: any }[] = [
  { id: 'cutting',    ru: 'Распил',   kz: 'Кесу',     eng: 'Cutting',   icon: Wrench },
  { id: 'edging',     ru: 'Кромка',   kz: 'Жиектеу',  eng: 'Edging',    icon: Wrench },
  { id: 'assembly',   ru: 'Сборка',   kz: 'Жинау',    eng: 'Assembly',  icon: Wrench },
  { id: 'packaging',  ru: 'Упаковка', kz: 'Орау',     eng: 'Packaging', icon: Package },
  { id: 'delivery',   ru: 'Доставка', kz: 'Жеткізу',  eng: 'Delivery',  icon: Truck },
];

// Heuristic stage → icon mapping. Niches don't carry icons in the config
// (keeping `niches.ts` non-React), so we infer one here based on the
// stage id. Falls back to Wrench.
function stageIcon(id: string): any {
  if (/deliver/i.test(id)) return Truck;
  if (/package|pack|hand|finish/i.test(id)) return Package;
  if (/install|monta/i.test(id)) return Wrench;
  return Wrench;
}

// Build a fresh `stages` array for a deal — used when a deal first
// enters production and we haven't tracked stages before. Takes the
// niche-specific stage list as input.
function makeDefaultStages(template: ReadonlyArray<{ id: string }>): DealStage[] {
  return template.map(s => ({ id: s.id, status: 'pending' as StageStatus }));
}

// (Stale mockProducts + prodOrders removed — store is the single source of
// truth now; production orders are built from store.deals below.)

interface WarehouseProps { language: 'kz' | 'ru' | 'eng'; }

// ─── Suppliers ────────────────────────────────────────────────────
// Vendor catalog. Stored team-wide on the server (/api/suppliers).
// Each row: name (required), contact person, phone, email, address,
// category (Плиты / Фурнитура / Кромка / Краска / ...), payment terms
// (предоплата / 50/50 / отсрочка), delivery days, rating 1-5, notes.
interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  category?: string;
  paymentTerms?: string;
  deliveryDays?: number;
  rating?: number;
  notes?: string;
  createdAt?: string;
}

// ─── Purchase Orders ──────────────────────────────────────────────
// Закупки у поставщиков. PO is created when stock hits «low» or a deal
// requests materials. Status flow: draft → sent → received → archived.
interface POItem { name: string; qty: number; unit: string; costPerUnit: number; }
interface PurchaseOrder {
  id: string;
  supplierId: string;
  items: POItem[];
  totalCost: number;
  status: 'draft' | 'sent' | 'received' | 'cancelled';
  expectedDate?: string;
  receivedDate?: string;
  notes?: string;
  linkedDealIds?: string[];
  createdAt?: string;
}

export function Warehouse({ language }: WarehouseProps) {
  const store = useDataStore();
  // Niche drives production stage labels, material categories, default
  // product types — everything that was hardcoded to furniture before.
  const niche = getNiche(store.niche);
  // Permission gate — Производство is a "production" module in the matrix.
  const canWrite = store.canWriteModule('production');
  // Cut-sheet (nesting) tab only applies to niches that physically cut
  // sheet material: furniture and stairs. Hide for ceilings/windows/etc.
  const hasNesting = niche.id === 'furniture' || niche.id === 'stairs' || niche.id === 'custom';
  // Default landing: if the team has no production work yet, land them
  // on Склад so they can populate materials first. Once they have deals
  // or products, default to the production order list.
  const initialView = useMemo<'materials' | 'production'>(() => {
    const hasProductionDeals = store.deals.some(d =>
      ['production', 'assembly', 'contract', 'project-agreed', 'manufacturing', 'installation', 'measured'].includes(d.status),
    );
    return hasProductionDeals || store.products.length > 0 ? 'production' : 'materials';
  }, [store.deals, store.products.length]);
  const [activeView, setActiveView] = useState<'materials' | 'production' | 'bom' | 'calculator' | 'nesting' | 'suppliers' | 'purchases' | 'reports'>(initialView);
  const [selectedCategory, setSelectedCategory] = useState('Все');
  // Niche filter for multi-niche teams. '' = all niches; otherwise
  // compares to product.niche. Materials without a niche tag are
  // treated as cross-niche (visible in every filter) — common for
  // generic hardware like screws or sealant.
  const [selectedNiche, setSelectedNiche] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ProdOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // CSV import modals for materials + suppliers (paste from Excel for
  // a new-team migration). Toggled via the import buttons in each tab.
  const [showProductImport, setShowProductImport] = useState(false);
  const [showSupplierImport, setShowSupplierImport] = useState(false);
  // Production tab — search + status filter + sort. Empty defaults so
  // users see everything until they narrow.
  const [prodSearch, setProdSearch] = useState('');
  const [prodStatusFilter, setProdStatusFilter] = useState<'all' | 'working' | 'started' | 'paused' | 'done'>('all');
  const [prodSort, setProdSort] = useState<'date' | 'deadline' | 'progress' | 'amount'>('date');
  // Materials tab — sort by qty/cost/value. Status filter (low/out)
  // already lives via selectedCategory.
  const [matSort, setMatSort] = useState<'name' | 'qty' | 'cost' | 'value' | 'status'>('name');
  // Default new-product category from the niche so the picker shows
  // sensible options (Плиты for furniture, Профиль for windows, etc.).
  const defaultCategory = niche.materialCategories[0] || 'Прочее';
  const [newProduct, setNewProduct] = useState({ name: '', category: defaultCategory, quantity: 0, unit: 'лист', supplier: '', cost: 0, niche: '' as string });

  // Suppliers & purchase orders — loaded from the server when their
  // tab opens (lazy: don't pay the network cost if the user never
  // visits these views).
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [supplierFlash, setSupplierFlash] = useState('');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showPoModal, setShowPoModal] = useState(false);
  const [editingPo, setEditingPo] = useState<PurchaseOrder | null>(null);

  useEffect(() => {
    if (activeView === 'suppliers' || activeView === 'purchases' || activeView === 'reports') {
      api.get<Supplier[]>('/api/suppliers').then(setSuppliers).catch(() => { /* ignore */ });
    }
    if (activeView === 'purchases' || activeView === 'reports') {
      api.get<PurchaseOrder[]>('/api/purchase-orders').then(setPurchaseOrders).catch(() => { /* ignore */ });
    }
  }, [activeView]);

  const flash = (msg: string) => { setSupplierFlash(msg); setTimeout(() => setSupplierFlash(''), 1800); };

  async function saveSupplier(s: Partial<Supplier>) {
    try {
      if (editingSupplier?.id) {
        const updated = await api.patch<Supplier>(`/api/suppliers/${editingSupplier.id}`, s);
        setSuppliers(prev => prev.map(x => x.id === editingSupplier.id ? updated : x));
        store.addActivity({
          user: 'Вы', action: 'Обновили поставщика', target: updated.name || s.name || '—',
          type: 'update', page: 'warehouse',
        });
      } else {
        const created = await api.post<Supplier>('/api/suppliers', s);
        setSuppliers(prev => [created, ...prev]);
        store.addActivity({
          user: 'Вы', action: 'Добавили поставщика', target: created.name || s.name || '—',
          type: 'create', page: 'warehouse',
        });
      }
      setShowSupplierModal(false);
      setEditingSupplier(null);
      flash(l('Поставщик сохранён', 'Жеткізуші сақталды', 'Supplier saved'));
    } catch (e: any) {
      flash(l('Ошибка: ', 'Қате: ', 'Error: ') + (e?.message || e));
    }
  }

  async function deleteSupplier(id: string) {
    const sup = suppliers.find(s => s.id === id);
    if (!confirm(l('Удалить поставщика?', 'Жеткізушіні жою?', 'Delete supplier?'))) return;
    try {
      await api.delete(`/api/suppliers/${id}`);
      setSuppliers(prev => prev.filter(x => x.id !== id));
      store.addActivity({
        user: 'Вы', action: 'Удалили поставщика', target: sup?.name || id,
        type: 'delete', page: 'warehouse',
      });
      flash(l('Поставщик удалён', 'Жойылды', 'Deleted'));
    } catch { /* ignore */ }
  }

  async function savePo(po: Partial<PurchaseOrder>) {
    try {
      const supName = suppliers.find(s => s.id === po.supplierId)?.name || '—';
      if (editingPo?.id) {
        const updated = await api.patch<PurchaseOrder>(`/api/purchase-orders/${editingPo.id}`, po);
        setPurchaseOrders(prev => prev.map(x => x.id === editingPo.id ? updated : x));
        store.addActivity({
          user: 'Вы', action: 'Обновили закупку',
          target: `${supName} — ${Math.round(updated.totalCost || 0).toLocaleString('ru-RU')} ₸`,
          type: 'update', page: 'warehouse',
        });
      } else {
        const created = await api.post<PurchaseOrder>('/api/purchase-orders', { ...po, status: 'draft' });
        setPurchaseOrders(prev => [created, ...prev]);
        store.addActivity({
          user: 'Вы', action: 'Создали закупку',
          target: `${supName} — ${Math.round(created.totalCost || 0).toLocaleString('ru-RU')} ₸ (${(created.items || []).length} поз.)`,
          type: 'create', page: 'warehouse',
        });
      }
      setShowPoModal(false);
      setEditingPo(null);
      flash(l('Закупка сохранена', 'Сатып алу сақталды', 'PO saved'));
    } catch (e: any) {
      flash(l('Ошибка: ', 'Қате: ', 'Error: ') + (e?.message || e));
    }
  }

  // Status transitions for a purchase order.
  // Critical side effect: when admin moves a PO to 'received', we
  // refill the warehouse — add each line item's qty to the matching
  // product (by case-insensitive name) and recompute the stock status.
  // Without this the whole PO pipeline is decorative: you "order"
  // materials but the warehouse never sees them.
  async function updatePoStatus(id: string, status: PurchaseOrder['status']) {
    const po = purchaseOrders.find(p => p.id === id);
    const patch: Partial<PurchaseOrder> = { status };
    if (status === 'received') patch.receivedDate = new Date().toISOString().slice(0, 10);
    try {
      const updated = await api.patch<PurchaseOrder>(`/api/purchase-orders/${id}`, patch);
      setPurchaseOrders(prev => prev.map(x => x.id === id ? updated : x));

      // ── Refill stock when transitioning to 'received' ──
      if (status === 'received' && po) {
        let refilled = 0;
        for (const item of po.items || []) {
          const match = store.products.find(
            p => p.name.toLowerCase().trim() === item.name.toLowerCase().trim(),
          );
          if (!match) continue;
          const nextQty = match.quantity + (item.qty || 0);
          const nextStatus =
            nextQty === 0                 ? 'outofstock' :
            nextQty < (match.minQty || 0) ? 'low'        :
                                             'instock';
          await store.updateProduct(match.id, { quantity: nextQty, status: nextStatus as any });
          refilled += 1;
        }
        const supName = suppliers.find(s => s.id === po.supplierId)?.name || '—';
        store.addActivity({
          user: 'Вы', action: 'Получили закупку',
          target: `${supName} — ${Math.round(po.totalCost || 0).toLocaleString('ru-RU')} ₸ (склад пополнен на ${refilled} поз.)`,
          type: 'update', page: 'warehouse',
        });
        flash(l(
          `Закупка получена — склад пополнен (${refilled} поз.)`,
          `Сатып алу алынды — қойма толтырылды (${refilled})`,
          `PO received — stock refilled (${refilled} items)`,
        ));
      }
    } catch (e: any) {
      flash(l('Ошибка: ', 'Қате: ', 'Error: ') + (e?.message || e));
    }
  }

  async function deletePo(id: string) {
    const po = purchaseOrders.find(p => p.id === id);
    if (!confirm(l('Удалить закупку?', 'Сатып алуды жою?', 'Delete PO?'))) return;
    try {
      await api.delete(`/api/purchase-orders/${id}`);
      setPurchaseOrders(prev => prev.filter(x => x.id !== id));
      const supName = suppliers.find(s => s.id === po?.supplierId)?.name || '—';
      store.addActivity({
        user: 'Вы', action: 'Удалили закупку',
        target: `${supName} — ${Math.round(po?.totalCost || 0).toLocaleString('ru-RU')} ₸`,
        type: 'delete', page: 'warehouse',
      });
    } catch { /* ignore */ }
  }

  // ─── Smart PO suggestion ────────────────────────────────────────
  // When a product is «low» or «outofstock» the user can one-click an
  // «→ Закупить» button. We seed the PO modal with that product as
  // the first item and try to guess the supplier:
  //   1. Exact match: any supplier whose name equals product.supplier
  //   2. Category match: supplier.category contains product.category
  //   3. First supplier in the list (fallback)
  // Always loads suppliers first if the list is empty so the modal's
  // dropdown isn't empty.
  function suggestSupplierFor(product: Product): Supplier | undefined {
    if (!suppliers.length) return undefined;
    const exact = suppliers.find(s => s.name.toLowerCase().trim() === (product.supplier || '').toLowerCase().trim());
    if (exact) return exact;
    const cat = suppliers.find(s => s.category && product.category &&
      s.category.toLowerCase().includes(product.category.toLowerCase().slice(0, 4)));
    if (cat) return cat;
    return suppliers[0];
  }

  async function triggerPurchaseFor(product: Product) {
    // Make sure suppliers are loaded so the modal dropdown has options.
    let sups = suppliers;
    if (sups.length === 0) {
      try { sups = await api.get<Supplier[]>('/api/suppliers'); setSuppliers(sups); }
      catch { /* ignore */ }
    }
    if (sups.length === 0) {
      flash(l('Сначала добавьте поставщика во вкладке «Поставщики»',
              'Алдымен «Жеткізушілер» қойындысында жеткізуші қосыңыз',
              'Add a supplier first in the Suppliers tab'));
      setActiveView('suppliers');
      return;
    }
    const supplier = suggestSupplierFor(product);
    // Suggested qty: enough to refill to «in stock» = minQty * 3, or 10 if no minQty
    const suggestedQty = Math.max((product.minQty || 0) * 3 - product.quantity, 10);
    const draft: PurchaseOrder = {
      id: '',
      supplierId: supplier?.id || sups[0].id,
      items: [{ name: product.name, qty: suggestedQty, unit: product.unit, costPerUnit: product.cost }],
      totalCost: suggestedQty * product.cost,
      status: 'draft',
      expectedDate: '',
      notes: l(`Авто-закупка по низкому остатку (текущий: ${product.quantity} ${product.unit})`,
               `Аз қалдыққа автоматты сатып алу (қазір: ${product.quantity} ${product.unit})`,
               `Auto-PO for low stock (current: ${product.quantity} ${product.unit})`),
      linkedDealIds: [],
    };
    setEditingPo(draft);
    setShowPoModal(true);
  }

  function triggerPurchaseForAll() {
    // Bulk: not yet — we open the modal for the FIRST low item; user can
    // add more items in the modal itself. Keeping it simple: one PO per
    // supplier later if grouping by supplier matters.
    const firstLow = store.products.find(p => p.status === 'low' || p.status === 'outofstock');
    if (firstLow) triggerPurchaseFor(firstLow);
  }

  // Use store products
  const products = store.products;
  const setProducts = (fn: any) => {}; // removed

  // Build production orders from store deals. Carry dealId through so the
  // action buttons (start / pause / done) can update the corresponding deal.
  // `stages` reads from the deal blob if present, else falls back to fresh
  // defaults (all pending).
  const prodOrders: ProdOrder[] = store.deals
    .filter(d => ['production', 'assembly', 'contract', 'project-agreed', 'manufacturing', 'installation', 'measured'].includes(d.status))
    .map((d, i) => {
      // Each deal carries its own niche template so a multi-niche team
      // shows the right pipeline per row: a furniture deal gets
      // Распил → Кромка → Сборка, a doors deal gets Резка → …, etc.
      // Single-niche teams continue using the team's primary niche.
      const dealNicheConfig = getNiche(d.niche || store.niche);
      return {
        id: i + 1, dealId: d.id,
        name: d.product, client: d.customerName.split(' ')[0] + ' ' + (d.customerName.split(' ')[1]?.[0] || '') + '.',
        master: d.measurer || 'Не назначен',
        daysLeft: d.completionDate ? Math.max(0, Math.ceil((new Date(d.completionDate).getTime() - Date.now()) / 86400000)) : 0,
        progress: d.progress,
        status: d.progress >= 100 ? 'done' as const : d.progress > 50 ? 'working' as const : d.progress > 0 ? 'started' as const : 'paused' as const,
        start: d.measurementDate || d.date, end: d.completionDate || '',
        materials: d.materials ? d.materials.split(', ').slice(0, 3) : [],
        // Stages built from the DEAL's niche template, not the team primary
        stages: ((d as any).stages as DealStage[] | undefined) || makeDefaultStages(dealNicheConfig.productionStages),
        consumed: ((d as any).consumed as ConsumedMaterial[] | undefined) || [],
        // Carry the niche template forward so the renderer can show the
        // right stage labels per row without re-deriving from deal.niche.
        nicheStages: dealNicheConfig.productionStages,
        nicheId: d.niche || store.niche,
      } as ProdOrder & { nicheStages: typeof dealNicheConfig.productionStages; nicheId: string };
    });

  // ─── Material consumption ────────────────────────────────────────
  // Single source of truth for the «Списать материалы» modal — captures
  // which order is being acted on and a temporary picklist while the
  // admin chooses qty per item.
  const [consumeForOrder, setConsumeForOrder] = useState<ProdOrder | null>(null);

  async function deductMaterials(order: ProdOrder, picks: { product: Product; qty: number }[]) {
    if (picks.length === 0) return;
    const now = new Date().toISOString();
    const newEntries: ConsumedMaterial[] = picks
      .filter(p => p.qty > 0)
      .map(p => ({
        productId:   p.product.id,
        productName: p.product.name,
        qty:         p.qty,
        unit:        p.product.unit,
        costPerUnit: p.product.cost,
        deductedAt:  now,
      }));
    if (newEntries.length === 0) return;
    // Append to existing consumption history (don't overwrite).
    const merged = [...(order.consumed || []), ...newEntries];
    try {
      // 1) Deduct from each product's quantity. Cap at 0 so we don't
      //    end up with negative stock — if the user overstates, we
      //    write zero and flag in the activity log (future work).
      for (const e of newEntries) {
        const prod = store.products.find(p => p.id === e.productId);
        if (!prod) continue;
        const nextQty = Math.max(0, prod.quantity - e.qty);
        const nextStatus =
          nextQty === 0                ? 'outofstock' :
          nextQty < (prod.minQty || 0) ? 'low'        :
                                          'instock';
        await store.updateProduct(prod.id, { quantity: nextQty, status: nextStatus as any });
      }
      // 2) Patch the deal with the new consumed list.
      await store.updateDeal(order.dealId, { consumed: merged } as any);
      const totalCost = newEntries.reduce((s, e) => s + e.qty * e.costPerUnit, 0);
      store.addActivity({
        user: 'Вы', action: 'Списали материалы',
        target: `${order.name} — ${newEntries.length} поз. на ${Math.round(totalCost).toLocaleString('ru-RU')} ₸`,
        type: 'update', page: 'warehouse',
      });
      flash(l(`Списано ${newEntries.length} позиций`, `${newEntries.length} позиция жазылды`, `Deducted ${newEntries.length} items`));
      setConsumeForOrder(null);
    } catch (e: any) {
      flash(l('Ошибка: ', 'Қате: ', 'Error: ') + (e?.message || e));
    }
  }

  // Cycle a stage forward: pending → in-progress → done → pending. Patches
  // the deal blob with the updated stages array and stamps timestamps as
  // appropriate. Also auto-bumps deal.progress proportional to completed
  // stages so the existing progress bar stays in sync without manual edits.
  //
  // Stage count is now niche-driven (3-6 depending on niche), so the
  // progress math is dynamic: each completed stage contributes
  // (100 / stages.length)%. Previously hardcoded `* 20` assumed exactly
  // 5 stages and broke for niches with fewer/more.
  async function cycleStage(order: ProdOrder, stageId: string) {
    if (!canWrite) return; // permission gate
    // Use the deal's own niche template so multi-niche teams cycle
    // stages by the right pipeline (door deal → door stages, furniture
    // deal → furniture stages). The template was attached when we
    // built prodOrders above.
    const stageTemplate = (order as any).nicheStages || niche.productionStages;
    const current = order.stages || makeDefaultStages(stageTemplate);
    const now = new Date().toISOString();
    const nextStatus = (s: StageStatus): StageStatus =>
      s === 'pending' ? 'in-progress' : s === 'in-progress' ? 'done' : 'pending';
    const updated = current.map(s => {
      if (s.id !== stageId) return s;
      const next = nextStatus(s.status);
      return {
        ...s,
        status: next,
        startedAt:  next === 'in-progress' ? now : (next === 'pending' ? undefined : s.startedAt),
        completedAt: next === 'done'       ? now : (next === 'pending' ? undefined : s.completedAt),
      };
    });
    const doneCount = updated.filter(s => s.status === 'done').length;
    const inProg    = updated.filter(s => s.status === 'in-progress').length;
    const totalStages = stageTemplate.length || 5;
    // Progress: (100 / N) per done stage + small bump for any in-progress
    // so the user sees immediate feedback when starting a new stage.
    const perStage = 100 / totalStages;
    const inProgressBump = Math.min(perStage / 4, 5);
    const newProgress = Math.min(100, Math.round(doneCount * perStage + (inProg > 0 ? inProgressBump : 0)));
    try {
      const patch: any = { stages: updated, progress: newProgress };
      // All stages done → mark deal completed.
      if (doneCount === totalStages) patch.status = 'completed';
      await store.updateDeal(order.dealId, patch);
      // Audit trail — make stage changes searchable in activity log.
      // Look up label from the niche's stage template (RU label fallback).
      const stageLabel = stageTemplate.find(t => t.id === stageId)?.ru || stageId;
      const newStat = updated.find(s => s.id === stageId)?.status;
      const statLabel = newStat === 'done' ? 'завершён'
                       : newStat === 'in-progress' ? 'в работе'
                       : 'сброшен';
      store.addActivity({
        user: 'Вы', action: 'Этап производства',
        target: `${order.name} · ${stageLabel} → ${statLabel}`,
        type: 'update', page: 'warehouse',
      });
    } catch (e: any) {
      toast('Не удалось обновить этап: ' + (e?.message || e), 'error');
    }
  }

  // Production order actions — update the underlying deal's progress so the
  // status badge moves accordingly. Status mapping:
  //   start (0%) → started   (set progress=10 if currently 0)
  //   working    (10-99%)     (set progress=60 if behind)
  //   pause      → paused     (set progress=1 — preserves «started» bucket
  //                            but flags as paused; never wipe real work)
  //   done       → done       (set progress=100, status='completed' +
  //                            mark every stage as done so they stay
  //                            in sync with the deal state)
  async function setOrderState(order: ProdOrder, target: 'started' | 'working' | 'done') {
    let patch: any;
    if (target === 'done') {
      // Closing the order from outside the stage strip — also mark every
      // stage 'done' so the chip strip / reports reflect reality.
      const now = new Date().toISOString();
      const stageTemplate = (order as any).nicheStages || niche.productionStages;
      const allDone = (order.stages || makeDefaultStages(stageTemplate)).map(s =>
        s.status === 'done' ? s : { ...s, status: 'done' as StageStatus, completedAt: now },
      );
      patch = { progress: 100, status: 'completed', stages: allDone };
    } else if (target === 'working') {
      patch = { progress: Math.max(60, order.progress) };
    } else {
      patch = { progress: Math.max(10, order.progress) };
    }
    try {
      await store.updateDeal(order.dealId, patch);
      if (target === 'done') {
        store.addActivity({
          user: 'Вы', action: 'Завершили производство',
          target: order.name,
          type: 'update', page: 'warehouse',
        });
      }
    } catch (e: any) {
      toast('Не удалось обновить заказ: ' + (e?.message || e), 'error');
    }
  }

  const categories = ['Все', ...new Set(store.products.map(p => p.category))];
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  // Filter + sort. The default 'name' sort matches the previous
  // alphabetical order (which is basically insertion order since names
  // are user-typed); other modes are opt-in via the toolbar.
  const filtered = useMemo(() => {
    const arr = products
      .filter(p => selectedCategory === 'Все' || p.category === selectedCategory)
      // Niche filter — products without a niche tag pass every filter
      // so cross-niche hardware (screws, sealant) stays visible always.
      .filter(p => !selectedNiche || !p.niche || p.niche === selectedNiche)
      .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const sorted = [...arr];
    const statusRank: Record<string, number> = { outofstock: 0, low: 1, instock: 2 };
    sorted.sort((a, b) => {
      if (matSort === 'qty')    return a.quantity - b.quantity;
      if (matSort === 'cost')   return b.cost - a.cost;
      if (matSort === 'value')  return (b.quantity * b.cost) - (a.quantity * a.cost);
      if (matSort === 'status') return (statusRank[a.status] ?? 3) - (statusRank[b.status] ?? 3);
      return (a.name || '').localeCompare(b.name || ''); // 'name'
    });
    return sorted;
  }, [products, selectedCategory, selectedNiche, searchQuery, matSort]);

  const totalValue = products.reduce((s, p) => s + p.quantity * p.cost, 0);
  const lowCount = products.filter(p => p.status === 'low').length;
  const outCount = products.filter(p => p.status === 'outofstock').length;
  const activeOrders = prodOrders.filter(o => o.status !== 'done').length;

  const handleAdd = () => {
    if (newProduct.name && newProduct.supplier && newProduct.cost > 0) {
      store.addProduct({ ...newProduct, status: newProduct.quantity > 20 ? 'instock' : newProduct.quantity > 0 ? 'low' : 'outofstock', minQty: 10 });
      setNewProduct({ name: '', category: defaultCategory, quantity: 0, unit: 'лист', supplier: '', cost: 0, niche: '' as string }); setShowAddModal(false);
    }
  };

  const handleSaveEdit = () => {
    if (selectedProduct) { store.updateProduct(selectedProduct.id, selectedProduct); setShowEditModal(false); setSelectedProduct(null); }
  };

  const statusConf = (s: Product['status']) => ({ instock: { dot: 'bg-green-500', label: l('Есть', 'Бар', 'In stock'), bg: 'bg-green-50 text-green-600' }, low: { dot: 'bg-yellow-500', label: l('Мало', 'Аз', 'Low'), bg: 'bg-yellow-50 text-yellow-600' }, outofstock: { dot: 'bg-red-500', label: l('Нет', 'Жоқ', 'Out'), bg: 'bg-red-50 text-red-600' } }[s]);
  const orderConf = (s: ProdOrder['status']) => ({ working: { icon: Wrench, label: l('В работе', 'Жұмыста', 'Working'), color: 'text-blue-600 bg-blue-50', bar: 'bg-blue-500' }, done: { icon: CheckCircle, label: l('Готово', 'Дайын', 'Done'), color: 'text-green-600 bg-green-50', bar: 'bg-green-500' }, started: { icon: Clock, label: l('Начали', 'Бастадық', 'Started'), color: 'text-orange-600 bg-orange-50', bar: 'bg-orange-500' }, paused: { icon: Clock, label: l('Пауза', 'Тоқтатылды', 'Paused'), color: 'text-gray-600 bg-gray-100', bar: 'bg-gray-400' } }[s]);

  const ModalInput = ({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <div><label className="block text-[11px] text-slate-400 mb-1">{label}</label><input className="w-full px-3 py-2.5 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all" {...props} /></div>
  );

  return (
    <div
      className="min-h-full relative"
    >
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-4">
        <div>
          <p className="text-[11px] text-slate-400 mb-1 tracking-widest uppercase">
            {l('Производство', 'Өндіріс', 'Production')}
            {' · '}
            <span className="normal-case tracking-normal text-slate-500">{niche.icon} {niche.name[language]}</span>
          </p>
          <h1 className="text-slate-900 text-2xl md:text-3xl font-medium tracking-tight">{l('Производство и склад', 'Өндіріс және қойма', 'Production & Warehouse')}</h1>
          {!canWrite && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-100/70 ring-1 ring-amber-200/40 px-2 py-0.5 rounded-full">
              <Eye className="w-3 h-3" />
              {l('Только просмотр', 'Тек қарау', 'View only')}
            </div>
          )}
        </div>
        <div className="flex items-stretch gap-1.5 min-w-0 w-full sm:w-auto">
          {/* Horizontal-scroll tab strip — was wrapping into 3 rows on
              phones which pushed the «Add» CTA below the fold. Now
              scrolls horizontally with snap so the active tab is always
              reachable. The Add button is anchored to the right of the
              strip so it stays visible. */}
          <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 -mx-1 px-1 snap-x">
            {[
              { id: 'production', label: l('Заказы',        'Тапсырыстар',  'Orders') },
              { id: 'bom',        label: l('BOM',           'BOM',          'BOM') },
              { id: 'calculator', label: l('Калькулятор',   'Калькулятор',  'Calculator') },
              ...(hasNesting ? [{ id: 'nesting' as const, label: l('Раскрой', 'Раскрой', 'Nesting') }] : []),
              { id: 'materials',  label: l('Склад',         'Қойма',        'Warehouse') },
              { id: 'suppliers',  label: l('Поставщики',    'Жеткізушілер', 'Suppliers') },
              { id: 'purchases',  label: l('Закупки',       'Сатып алулар', 'Purchases') },
              { id: 'reports',    label: l('Отчёты',        'Есептер',      'Reports') },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id as any)}
                className={`px-3.5 py-2 rounded-2xl text-xs whitespace-nowrap ring-1 transition-all flex-shrink-0 snap-start ${
                  activeView === tab.id
                    ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]'
                    : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* «Add» — context-aware: on Suppliers/Purchases/Materials tabs
              we open the right modal directly. Permission-gated. */}
          {canWrite && (
            <button
              onClick={() => {
                if (activeView === 'suppliers') { setEditingSupplier(null); setShowSupplierModal(true); }
                else if (activeView === 'purchases') { setEditingPo(null); setShowPoModal(true); }
                else { setShowAddModal(true); }
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />{l('Добавить', 'Қосу', 'Add')}
            </button>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label: l('В работе', 'Жұмыста', 'In Progress'), value: String(activeOrders), sub: l('заказов', 'тапсырыс', 'orders'), icon: Wrench, color: '' },
          { label: l('Материалов', 'Материалдар', 'Materials'), value: String(products.length), sub: l('позиций', 'позиция', 'items'), icon: Package, color: '' },
          { label: l('Стоимость склада', 'Қойма құны', 'Stock Value'), value: `${(totalValue / 1000000).toFixed(1)}М₸`, sub: l('общая', 'жалпы', 'total'), icon: TrendingUp, color: '' },
          { label: l('Мало', 'Аз', 'Low Stock'), value: String(lowCount), sub: l('заказать', 'тапсыру', 'reorder'), icon: AlertTriangle, color: lowCount > 0 ? 'text-yellow-600' : '' },
          { label: l('Закончилось', 'Жоқ', 'Out of Stock'), value: String(outCount), sub: l('срочно', 'шұғыл', 'urgent'), icon: ShoppingCart, color: outCount > 0 ? 'text-red-600' : '' },
        ].map((c, i) => (
          <div key={i} className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-slate-400">{c.label}</span>
              <div className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><c.icon className="w-3.5 h-3.5 text-slate-400" /></div>
            </div>
            <div className={`text-lg mb-0.5 ${c.color || 'text-gray-900'}`}>{c.value}</div>
            <div className="text-[10px] text-slate-400">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ===== PRODUCTION VIEW ===== */}
      {activeView === 'production' && (() => {
        // Filter + sort production orders by search query, status, sort key.
        const q = prodSearch.trim().toLowerCase();
        const filteredOrders = prodOrders
          .filter(o => prodStatusFilter === 'all' || o.status === prodStatusFilter)
          .filter(o => !q || (o.name || '').toLowerCase().includes(q)
                          || (o.client || '').toLowerCase().includes(q)
                          || (o.master || '').toLowerCase().includes(q));
        const sortedOrders = [...filteredOrders].sort((a, b) => {
          if (prodSort === 'progress') return b.progress - a.progress;
          if (prodSort === 'deadline') return a.daysLeft - b.daysLeft;
          if (prodSort === 'amount') {
            const da = store.deals.find(d => d.id === a.dealId)?.amount || 0;
            const db = store.deals.find(d => d.id === b.dealId)?.amount || 0;
            return db - da;
          }
          // date — newest first by deal createdAt
          const ta = store.deals.find(d => d.id === a.dealId)?.createdAt || '';
          const tb = store.deals.find(d => d.id === b.dealId)?.createdAt || '';
          return tb.localeCompare(ta);
        });
        return (
        <div className="space-y-4">
          {/* Toolbar — search, status chips, sort */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
              <input
                type="text"
                value={prodSearch}
                onChange={e => setProdSearch(e.target.value)}
                placeholder={l('Поиск по клиенту, продукту, мастеру', 'Іздеу...', 'Search...')}
                className="w-full pl-9 pr-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs focus:outline-none focus:bg-white"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {([
                { id: 'all',     label: l('Все', 'Барлығы', 'All') },
                { id: 'started', label: l('Начали', 'Бастадық', 'Started') },
                { id: 'working', label: l('В работе', 'Жұмыста', 'Working') },
                { id: 'paused',  label: l('Пауза', 'Тоқтат.', 'Paused') },
                { id: 'done',    label: l('Готово', 'Дайын', 'Done') },
              ] as const).map(s => (
                <button
                  key={s.id}
                  onClick={() => setProdStatusFilter(s.id as any)}
                  className={`px-3 py-2 rounded-xl text-xs whitespace-nowrap transition-all ${
                    prodStatusFilter === s.id
                      ? 'bg-gray-900 text-white'
                      : 'bg-white/60 ring-1 ring-white/60 backdrop-blur-xl text-slate-500 hover:bg-white/80'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <select
              value={prodSort}
              onChange={e => setProdSort(e.target.value as any)}
              className="px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs text-slate-600 cursor-pointer flex-shrink-0"
            >
              <option value="date">{l('Дата ↓', 'Күн ↓', 'Date ↓')}</option>
              <option value="deadline">{l('Срок', 'Мерзім', 'Deadline')}</option>
              <option value="progress">{l('Прогресс ↓', 'Прогресс ↓', 'Progress ↓')}</option>
              <option value="amount">{l('Сумма ↓', 'Сома ↓', 'Amount ↓')}</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-900">{l('Заказы в производстве', 'Өндірістегі тапсырыстар', 'Production Orders')}</div>
            <span className="text-[10px] text-slate-400">
              {sortedOrders.length}
              {sortedOrders.length !== prodOrders.length && <span className="text-slate-300"> / {prodOrders.length}</span>}
              {' '}{l('всего', 'барлығы', 'total')}
            </span>
          </div>

          {/* Order Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sortedOrders.map(o => {
              const conf = orderConf(o.status);
              const Icon = conf.icon;
              return (
                <div key={o.id} onClick={() => setSelectedOrder(o)} className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-4 hover:shadow-sm transition-all cursor-pointer group">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-sm text-gray-900 truncate">{o.name}</span>
                      <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg ${conf.color}`}><Icon className="w-3 h-3" />{conf.label}</span>
                      {/* Niche chip — only for multi-niche teams so the
                          shop floor knows which pipeline to follow when
                          a row sits next to one from a different direction. */}
                      {store.secondaryNiches.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg bg-emerald-50/80 text-emerald-700 ring-1 ring-emerald-100/60">
                          {getNiche((o as any).nicheId).icon} {getNiche((o as any).nicheId).name[language]}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">#{o.id}</span>
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="flex items-center gap-1.5 text-[11px]"><Users className="w-3 h-3 text-slate-300" /><span className="text-slate-500">{o.client}</span></div>
                    <div className="flex items-center gap-1.5 text-[11px]"><Wrench className="w-3 h-3 text-slate-300" /><span className="text-slate-500">{o.master}</span></div>
                    <div className="flex items-center gap-1.5 text-[11px]"><Calendar className="w-3 h-3 text-slate-300" /><span className="text-slate-500">{o.start} → {o.end}</span></div>
                    <div className="flex items-center gap-1.5 text-[11px]"><Clock className="w-3 h-3 text-slate-300" /><span className={o.daysLeft === 0 ? 'text-green-500' : o.daysLeft <= 3 ? 'text-red-500' : 'text-gray-500'}>{o.daysLeft === 0 ? l('Готово', 'Дайын', 'Ready') : `${o.daysLeft} ${l('дней', 'күн', 'days')}`}</span></div>
                  </div>

                  {/* Materials */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {o.materials.map((m, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-50 text-slate-400 rounded">{m}</span>)}
                  </div>

                  {/* Progress */}
                  <div>
                    <div className="flex justify-between text-[10px] mb-1"><span className="text-slate-400">{l('Прогресс', 'Прогресс', 'Progress')}</span><span className="text-gray-900">{o.progress}%</span></div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${conf.bar} rounded-full transition-all`} style={{ width: `${o.progress}%` }} /></div>
                  </div>

                  {/* Stage chain — N clickable dots representing the
                      workshop pipeline FOR THIS NICHE. Labels and count
                      come from niche.productionStages so a ceiling
                      business shows Раскрой/Подготовка/Монтаж/Светильники/Сдача
                      instead of furniture's Распил/Кромка/Сборка/etc.
                      Click cycles: pending → in-progress → done → pending. */}
                  <div
                    className="mt-3 grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${(o as any).nicheStages.length}, minmax(0, 1fr))` }}
                    onClick={e => e.stopPropagation()}
                  >
                    {((o as any).nicheStages as NicheStage[]).map((tpl: NicheStage) => {
                      const stage = (o.stages || []).find(s => s.id === tpl.id);
                      const status = stage?.status || 'pending';
                      const label = tpl[language];
                      const tip = stage?.completedAt
                        ? `${label} · ${l('завершён', 'аяқталды', 'done')} ${new Date(stage.completedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                        : stage?.startedAt
                          ? `${label} · ${l('в работе с', 'жұмыста', 'in progress since')} ${new Date(stage.startedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                          : `${label} · ${l('не начат', 'басталмаған', 'not started')}`;
                      return (
                        <button
                          key={tpl.id}
                          onClick={() => cycleStage(o, tpl.id)}
                          disabled={!canWrite}
                          title={tip}
                          className={`flex flex-col items-center gap-1 py-1.5 rounded-xl ring-1 transition-all ${!canWrite ? 'cursor-not-allowed' : ''} ${
                            status === 'done'        ? 'bg-emerald-100/80 text-emerald-700 ring-emerald-200/60' :
                            status === 'in-progress' ? 'bg-amber-100/80 text-amber-700 ring-amber-200/60' :
                                                       'bg-white/40 text-slate-400 ring-white/60 hover:bg-white/70'
                          }`}
                        >
                          <span className="text-[10px] leading-none">
                            {status === 'done' ? '✓' : status === 'in-progress' ? '●' : '○'}
                          </span>
                          <span className="text-[8px] leading-none truncate max-w-full px-1">{label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Consumed materials preview — shows up after the user
                       starts deducting stock onto this order. Compact list
                       with running cost subtotal. */}
                  {(o.consumed && o.consumed.length > 0) && (
                    <div className="mt-3 bg-white/40 ring-1 ring-white/60 rounded-2xl px-3 py-2 space-y-0.5">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1 flex items-center justify-between">
                        <span>{l('Использовано', 'Қолданылды', 'Used')}</span>
                        <span className="tabular-nums text-slate-700">
                          {Math.round(o.consumed.reduce((s, c) => s + c.qty * c.costPerUnit, 0)).toLocaleString('ru-RU')} ₸
                        </span>
                      </div>
                      {o.consumed.slice(0, 4).map((c, i) => (
                        <div key={i} className="text-[11px] flex items-center justify-between gap-2">
                          <span className="text-slate-700 truncate">{c.productName}</span>
                          <span className="text-slate-500 tabular-nums flex-shrink-0">{c.qty} {c.unit}</span>
                        </div>
                      ))}
                      {o.consumed.length > 4 && (
                        <div className="text-[10px] text-slate-400 italic">+ {o.consumed.length - 4} {l('ещё', 'тағы', 'more')}</div>
                      )}
                    </div>
                  )}

                  {/* Consume materials CTA — appears below the stage chain
                       so admin can pull stock onto this order in one click. */}
                  <div className="mt-3" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setConsumeForOrder(o)}
                      className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] px-3 py-1.5 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-xl text-slate-700 transition-colors"
                      title={l('Списать материалы со склада', 'Қоймадан материалдарды жазу', 'Deduct materials from stock')}
                    >
                      <Package className="w-3 h-3" />
                      {l('Списать материалы', 'Материалдарды жазу', 'Deduct materials')}
                    </button>
                  </div>

                  {/* Action buttons — stop propagation so they don't open
                       the order details modal at the same time. Each one
                       calls the underlying deal API (see setOrderState).
                       Pause was removed: we don't have a non-destructive
                       way to represent it on the deal blob (zeroing
                       progress used to wipe real stage work). */}
                  <div className="flex items-center gap-1.5 mt-3" onClick={e => e.stopPropagation()}>
                    {o.status === 'paused' && (
                      <button onClick={() => setOrderState(o, 'started')} className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800">
                        <PlayCircle className="w-3 h-3" /> {l('Старт', 'Бастау', 'Start')}
                      </button>
                    )}
                    {o.status === 'started' && (
                      <button onClick={() => setOrderState(o, 'working')} className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        <Wrench className="w-3 h-3" /> {l('В работу', 'Жұмысқа', 'Working')}
                      </button>
                    )}
                    {o.status !== 'done' && (
                      <button onClick={() => setOrderState(o, 'done')} className="flex-1 inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                        <CheckCircle className="w-3 h-3" /> {l('Готово', 'Дайын', 'Done')}
                      </button>
                    )}
                    {o.status === 'done' && (
                      <div className="flex-1 text-center text-[10px] text-emerald-600 py-1.5">✓ {l('Заказ завершён', 'Тапсырыс аяқталды', 'Order complete')}</div>
                    )}
                  </div>
                </div>
              );
            })}
            {sortedOrders.length === 0 && (
              <div className="md:col-span-2 bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-10 text-center">
                <Wrench className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <div className="text-sm text-slate-900 mb-1">
                  {prodOrders.length === 0
                    ? l('Нет заказов в производстве', 'Өндірісте тапсырыс жоқ', 'No production orders')
                    : l('Ничего не найдено по фильтрам', 'Сүзгілер бойынша табылмады', 'Nothing matches filters')}
                </div>
                <div className="text-xs text-slate-400">
                  {prodOrders.length === 0
                    ? l('Переведите сделку в статус «Производство» — она появится здесь', 'Мәмілені «Өндіріс» күйіне ауыстырыңыз', 'Move a deal to «Production» status to see it here')
                    : l('Сбросьте поиск или статус-фильтр', 'Сүзгіні тазалаңыз', 'Clear search or status filter')}
                </div>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* ===== MATERIALS VIEW ===== */}
      {activeView === 'materials' && (
        store.products.length === 0 ? (
          // ─── Empty-state hero ─────────────────────────────────
          // Brand-new team — no materials yet. Replace the empty table
          // with three clear paths: add manually, import CSV from Excel,
          // or ask AI to bulk-create from a free-text description.
          <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-10 text-center">
            <div className="text-4xl mb-3">{niche.icon}</div>
            <h3 className="text-lg text-slate-900 mb-2 tracking-tight">
              {l('Здесь будут материалы', 'Материалдар осы жерде болады', 'Materials live here')}
            </h3>
            <p className="text-xs text-slate-500 mb-5 max-w-md mx-auto leading-relaxed">
              {l(
                `Каталог под нишу «${niche.name[language]}» — ${niche.materialCategories.slice(0, 4).join(' / ')}. Добавьте первый материал или импортируйте из Excel.`,
                `«${niche.name[language]}» санатына арналған каталог. Бірінші материалды қосыңыз немесе CSV импорттаңыз.`,
                `Catalog for "${niche.name[language]}" — ${niche.materialCategories.slice(0, 4).join(' / ')}. Add the first item or import from Excel.`,
              )}
            </p>
            <div className="flex items-center gap-2 justify-center flex-wrap">
              {canWrite && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> {l('Добавить первый материал', 'Бірінші материал', 'Add first material')}
                </button>
              )}
              {canWrite && (
                <button
                  onClick={() => setShowProductImport(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-2xl text-xs text-slate-700 backdrop-blur-xl transition-all"
                >
                  <Upload className="w-3.5 h-3.5" /> {l('Импорт CSV', 'CSV импорт', 'Import CSV')}
                </button>
              )}
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('ai-assistant:open', {
                    detail: {
                      prompt: l(
                        `Заведи на склад: ЛДСП белый 50 листов 8000₸, петли Blum 100 пар 1500₸, и т.д. — у меня ниша «${niche.name[language]}»`,
                        `Қоймаға қос: материал тізімі — менің салам «${niche.name[language]}»`,
                        `Add to stock: a list of materials — my niche is "${niche.name[language]}"`,
                      ),
                    },
                  }));
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600/90 hover:bg-violet-700 text-white rounded-2xl text-xs ring-1 ring-white/10 transition-all"
              >
                ✨ {l('Через AI', 'AI арқылы', 'Via AI')}
              </button>
            </div>
          </div>
        ) : (
        <div className="space-y-4">
          {/* Low-stock banner — appears only when there's at least one
              low / out-of-stock material. Bulk CTA seeds the PO modal
              from the first low item; user can add more rows there. */}
          {(lowCount + outCount > 0) && (
            <div className="flex items-center gap-3 bg-amber-50/80 backdrop-blur-xl ring-1 ring-amber-200/60 rounded-2xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" />
              <div className="text-[12px] text-amber-900 flex-1">
                <b>{outCount + lowCount}</b> {l('материалов нужно докупить', 'материал сатып алу керек', 'materials need restocking')}
                {outCount > 0 && <span className="ml-1.5 text-amber-700">· {outCount} {l('нет в наличии', 'жоқ', 'out')}</span>}
              </div>
              {canWrite && (
                <button
                  onClick={triggerPurchaseForAll}
                  className="text-[11px] px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-xl ring-1 ring-amber-200/40 transition-colors flex-shrink-0"
                >
                  {l('Создать закупку →', 'Сатып алу жасау →', 'Create PO →')}
                </button>
              )}
            </div>
          )}

          {/* Niche filter chip-row (multi-niche teams). Lets the user
              slice the warehouse by direction (windows / doors / stairs
              etc). Materials without a niche tag are visible in every
              slice so generic hardware never disappears from the list. */}
          {store.secondaryNiches.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setSelectedNiche('')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-2xl text-[11px] ring-1 transition-all ${
                  selectedNiche === ''
                    ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]'
                    : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
                }`}
              >
                {l('Все направления', 'Барлық бағыттар', 'All directions')}
              </button>
              {store.allNiches.map(nid => {
                const n = getNiche(nid);
                const count = store.products.filter(p => p.niche === nid).length;
                const active = selectedNiche === nid;
                return (
                  <button
                    key={nid}
                    onClick={() => setSelectedNiche(nid)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-2xl text-[11px] ring-1 transition-all ${
                      active
                        ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]'
                        : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'
                    }`}
                  >
                    <span>{n.icon}</span>
                    <span>{n.name[language]}</span>
                    <span className={`text-[10px] tabular-nums ${active ? 'text-white/70' : 'text-slate-400'}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Search + Filters + CSV toolbar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={l('Поиск материалов...', 'Материал іздеу...', 'Search materials...')} className="w-full pl-9 pr-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all" />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {categories.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-3 py-2 rounded-xl text-xs whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-gray-900 text-white' : 'bg-white/60 ring-1 ring-white/60 backdrop-blur-xl text-slate-400 hover:border-gray-200'}`}>{cat}</button>
              ))}
            </div>
            {/* CSV export — produces an Excel-readable file with BOM */}
            <button
              onClick={() => {
                const cols: CsvColumn<Product>[] = [
                  { header: 'Название',  value: 'name' },
                  { header: 'Категория', value: 'category' },
                  { header: 'Кол-во',    value: 'quantity' },
                  { header: 'Ед.',       value: 'unit' },
                  { header: 'Поставщик', value: 'supplier' },
                  { header: 'Цена',      value: 'cost' },
                  { header: 'Мин',       value: 'minQty' },
                  { header: 'Статус',    value: 'status' },
                  // Niche column always present in the export so the
                  // file round-trips cleanly (export → edit → re-import)
                  // even for single-niche teams. Value is the niche id
                  // (furniture / windows / …) or blank for shared.
                  { header: 'Направление', value: (p: Product) => p.niche || '' },
                ];
                downloadCsv(todayStampedName('materials'), rowsToCsv(store.products as any[], cols));
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/50 hover:bg-white/80 ring-1 ring-white/60 rounded-xl text-xs text-slate-600 backdrop-blur-xl transition-all flex-shrink-0"
              title={l('Экспорт в CSV', 'CSV экспорт', 'Export CSV')}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            {canWrite && (
              <button
                onClick={() => setShowProductImport(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/50 hover:bg-white/80 ring-1 ring-white/60 rounded-xl text-xs text-slate-600 backdrop-blur-xl transition-all flex-shrink-0"
                title={l('Импорт из CSV', 'CSV-ден импорт', 'Import from CSV')}
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
            )}
            {/* Sort dropdown for materials — qty/cost/value useful when
                planning purchases or stock-takes. */}
            <select
              value={matSort}
              onChange={e => setMatSort(e.target.value as any)}
              className="px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-xl text-xs text-slate-600 cursor-pointer flex-shrink-0"
              title={l('Сортировка', 'Сұрыптау', 'Sort')}
            >
              <option value="name">{l('A → Я', 'А → Я', 'A → Z')}</option>
              <option value="qty">{l('Кол-во ↑', 'Саны ↑', 'Qty ↑')}</option>
              <option value="cost">{l('Цена ↓', 'Бағасы ↓', 'Price ↓')}</option>
              <option value="value">{l('Стоимость ↓', 'Құны ↓', 'Value ↓')}</option>
              <option value="status">{l('Статус', 'Күй', 'Status')}</option>
            </select>
          </div>

          {/* Materials Table */}
          <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl overflow-hidden">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 border-b border-white/60 text-[10px] text-slate-400">
              <div className="col-span-4">{l('Материал', 'Материал', 'Material')}</div>
              <div className="col-span-2">{l('Поставщик', 'Жеткізуші', 'Supplier')}</div>
              <div className="col-span-2 text-center">{l('Кол-во', 'Саны', 'Qty')}</div>
              <div className="col-span-2 text-right">{l('Цена', 'Бағасы', 'Price')}</div>
              <div className="col-span-2 text-right">{l('Статус', 'Күйі', 'Status')}</div>
            </div>
            {/* Items */}
            <div className="divide-y divide-gray-50">
              {filtered.map(p => {
                const st = statusConf(p.status);
                return (
                  <div key={p.id} onClick={() => { setSelectedProduct(p); setShowEditModal(true); }} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center px-4 py-3 hover:bg-white/30 transition-colors cursor-pointer group">
                    <div className="col-span-4 flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0"><Package className="w-3.5 h-3.5 text-slate-400" /></div>
                      <div><div className="text-sm text-gray-900">{p.name}</div><div className="text-[10px] text-slate-400">{p.category}</div></div>
                    </div>
                    <div className="col-span-2 text-xs text-slate-500 hidden sm:block">{p.supplier}</div>
                    <div className="col-span-2 text-center">
                      <span className="text-sm text-gray-900">{p.quantity}</span>
                      <span className="text-[10px] text-slate-400 ml-1">{p.unit}</span>
                      {p.quantity < p.minQty && p.quantity > 0 && <div className="text-[10px] text-yellow-500">min: {p.minQty}</div>}
                    </div>
                    <div className="col-span-2 text-right text-xs text-gray-900 hidden sm:block">{p.cost.toLocaleString()} ₸</div>
                    <div className="col-span-2 flex items-center justify-end gap-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-lg ${st.bg}`}>{st.label}</span>
                      {(p.status === 'low' || p.status === 'outofstock') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); triggerPurchaseFor(p); }}
                          className="text-[10px] px-2 py-0.5 rounded-lg bg-amber-100/80 text-amber-800 ring-1 ring-amber-200/60 hover:bg-amber-200/80 transition-colors flex-shrink-0"
                          title={l('Создать закупку этого материала', 'Бұл материалды сатып алу', 'Create PO for this material')}
                        >
                          ↳ {l('Закупить', 'Алу', 'Order')}
                        </button>
                      )}
                      <Edit2 className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="py-12 text-center"><Package className="w-8 h-8 text-gray-200 mx-auto mb-2" /><p className="text-xs text-slate-400">{l('Не найдено', 'Табылмады', 'Not found')}</p></div>
              )}
            </div>
          </div>
        </div>
        )
      )}

      {/* ===== BOM (Спецификации изделий) ===== */}
      {activeView === 'bom' && (
        <BomTemplates language={language} />
      )}

      {/* ===== Калькулятор стоимости ===== */}
      {activeView === 'calculator' && <Calculator language={language} />}

      {/* ===== Раскрой (Nesting) — only for cut-based niches ===== */}
      {activeView === 'nesting' && hasNesting && (
        <NestingView language={language} prodOrders={prodOrders} deals={store.deals} />
      )}

      {/* ===== Поставщики ===== */}
      {activeView === 'suppliers' && (
        <SuppliersView
          language={language}
          suppliers={suppliers}
          canWrite={canWrite}
          onAdd={() => { setEditingSupplier(null); setShowSupplierModal(true); }}
          onEdit={(s) => { setEditingSupplier(s); setShowSupplierModal(true); }}
          onDelete={deleteSupplier}
          onImport={() => setShowSupplierImport(true)}
          nicheCategories={niche.materialCategories}
        />
      )}

      {/* ===== Закупки ===== */}
      {activeView === 'purchases' && (
        <PurchasesView
          language={language}
          purchaseOrders={purchaseOrders}
          suppliers={suppliers}
          onAdd={() => { setEditingPo(null); setShowPoModal(true); }}
          onEdit={(p) => { setEditingPo(p); setShowPoModal(true); }}
          onDelete={deletePo}
          onUpdateStatus={updatePoStatus}
        />
      )}

      {/* ===== Отчёты ===== */}
      {activeView === 'reports' && (
        <ReportsView
          language={language}
          deals={store.deals}
          purchaseOrders={purchaseOrders}
          suppliers={suppliers}
        />
      )}

      {/* Flash toast for supplier/PO operations */}
      {supplierFlash && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 bg-slate-900/90 backdrop-blur-xl text-white text-xs rounded-2xl shadow-[0_12px_32px_-8px_var(--accent-shadow)] ring-1 ring-white/10 z-50">
          {supplierFlash}
        </div>
      )}

      {/* Supplier add/edit modal */}
      {showSupplierModal && (
        <SupplierModal
          language={language}
          initial={editingSupplier}
          onClose={() => { setShowSupplierModal(false); setEditingSupplier(null); }}
          onSave={saveSupplier}
          categories={niche.materialCategories}
        />
      )}

      {/* CSV import for materials */}
      {showProductImport && (
        <CsvImportModal
          language={language}
          title={l('Материалы', 'Материалдар', 'Materials')}
          fields={[
            { key: 'name',     headers: ['Название', 'Name', 'Material'], required: true },
            { key: 'category', headers: ['Категория', 'Category'] },
            { key: 'quantity', headers: ['Кол-во', 'Quantity', 'Qty'], transform: (v) => Number(String(v).replace(/[^0-9.-]/g, '')) || 0 },
            { key: 'unit',     headers: ['Ед.', 'Unit'] },
            { key: 'supplier', headers: ['Поставщик', 'Supplier'] },
            { key: 'cost',     headers: ['Цена', 'Price', 'Cost'], transform: (v) => Number(String(v).replace(/[^0-9.-]/g, '')) || 0 },
            { key: 'minQty',   headers: ['Мин', 'Min', 'MinQty'], transform: (v) => Number(String(v).replace(/[^0-9.-]/g, '')) || 0 },
            // Niche column — accepts either the niche id (furniture, windows,
            // doors, …) or its localized name (Мебель / Windows). Empty cell
            // means "applies to all directions" — same as in the UI dropdown.
            // Multi-niche teams can prepare a single import file split by
            // direction column instead of importing per-niche separately.
            { key: 'niche',    headers: ['Направление', 'Direction', 'Niche', 'Ниша'] },
          ] as CsvFieldSpec[]}
          onImport={async (rec) => {
            const quantity = Number(rec.quantity) || 0;
            const minQty = Number(rec.minQty) || 10;
            const status = quantity === 0 ? 'outofstock' : quantity < minQty ? 'low' : 'instock';
            // Resolve the niche cell: accept id directly OR match against
            // the team's allNiches by RU/KZ/EN name (case-insensitive).
            // Anything we can't recognise is silently dropped — never write
            // garbage into the column.
            const rawNiche = String(rec.niche || '').trim();
            let resolvedNiche: string | undefined;
            if (rawNiche) {
              if (store.allNiches.includes(rawNiche)) {
                resolvedNiche = rawNiche;
              } else {
                const lower = rawNiche.toLowerCase();
                for (const id of store.allNiches) {
                  const n = getNiche(id);
                  if (n.name.ru.toLowerCase() === lower ||
                      n.name.kz.toLowerCase() === lower ||
                      n.name.eng.toLowerCase() === lower) {
                    resolvedNiche = id;
                    break;
                  }
                }
              }
            }
            await store.addProduct({
              name: String(rec.name),
              category: String(rec.category || niche.materialCategories[0] || 'Прочее'),
              quantity,
              unit: String(rec.unit || 'шт'),
              supplier: String(rec.supplier || ''),
              cost: Number(rec.cost) || 0,
              status: status as any,
              minQty,
              niche: resolvedNiche,
            } as any);
          }}
          onClose={() => setShowProductImport(false)}
        />
      )}

      {/* CSV import for suppliers */}
      {showSupplierImport && (
        <CsvImportModal
          language={language}
          title={l('Поставщики', 'Жеткізушілер', 'Suppliers')}
          fields={[
            { key: 'name',          headers: ['Название', 'Name', 'Поставщик'], required: true },
            { key: 'contactPerson', headers: ['Контакт', 'Contact', 'ФИО'] },
            { key: 'phone',         headers: ['Телефон', 'Phone'] },
            { key: 'email',         headers: ['Email'] },
            { key: 'address',       headers: ['Адрес', 'Address'] },
            { key: 'category',      headers: ['Категория', 'Category'] },
            { key: 'paymentTerms',  headers: ['Оплата', 'Payment', 'Условия'] },
            { key: 'deliveryDays',  headers: ['Доставка', 'Delivery', 'Дни'], transform: (v) => Number(String(v).replace(/[^0-9]/g, '')) || undefined },
            { key: 'rating',        headers: ['Рейтинг', 'Rating'], transform: (v) => Number(v) || undefined },
            { key: 'notes',         headers: ['Заметки', 'Notes'] },
          ] as CsvFieldSpec[]}
          onImport={async (rec) => {
            await api.post<Supplier>('/api/suppliers', rec);
          }}
          onClose={() => {
            setShowSupplierImport(false);
            // Re-fetch so the imported rows appear immediately.
            api.get<Supplier[]>('/api/suppliers').then(setSuppliers).catch(() => { /* ignore */ });
          }}
        />
      )}

      {/* Purchase order add/edit modal */}
      {showPoModal && (
        <PoModal
          language={language}
          initial={editingPo}
          suppliers={suppliers}
          onClose={() => { setShowPoModal(false); setEditingPo(null); }}
          onSave={savePo}
        />
      )}

      {/* Material consumption modal — deduct stock onto a specific order */}
      {consumeForOrder && (
        <ConsumeMaterialsModal
          language={language}
          order={consumeForOrder}
          products={store.products}
          onClose={() => setConsumeForOrder(null)}
          onSave={(picks) => deductMaterials(consumeForOrder, picks)}
        />
      )}

      {/* ===== MODALS ===== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/60 flex items-center justify-between">
              <span className="text-sm text-gray-900">{l('Добавить материал', 'Материал қосу', 'Add Material')}</span>
              <button onClick={() => setShowAddModal(false)} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <ModalInput
                label={l('Название', 'Атауы', 'Name')}
                value={newProduct.name}
                onChange={e => setNewProduct({ ...newProduct, name: (e.target as HTMLInputElement).value })}
                placeholder={niche.id === 'furniture' ? 'ЛДСП White' : niche.id === 'windows' ? 'Профиль REHAU 70mm' : niche.id === 'ceilings' ? 'Полотно матовое 320×400' : niche.materialCategories[0]}
              />
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">{l('Категория', 'Санат', 'Category')}</label>
                <select value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none">
                  {/* Union of niche default categories + any custom ones
                      the user already entered (so old data still appears). */}
                  {Array.from(new Set([...niche.materialCategories, ...categories.filter(c => c !== 'Все')])).map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ModalInput label={l('Кол-во', 'Саны', 'Qty')} type="number" value={String(newProduct.quantity)} onChange={e => setNewProduct({ ...newProduct, quantity: Number((e.target as HTMLInputElement).value) })} />
                <div><label className="block text-[11px] text-slate-400 mb-1">{l('Ед.', 'Бірл.', 'Unit')}</label><select value={newProduct.unit} onChange={e => setNewProduct({ ...newProduct, unit: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none"><option value="лист">{l('лист', 'парақ', 'sheet')}</option><option value="шт">{l('шт', 'дана', 'pcs')}</option><option value="м">м</option><option value="пара">{l('пара', 'жұп', 'pair')}</option></select></div>
              </div>
              <ModalInput label={l('Поставщик', 'Жеткізуші', 'Supplier')} value={newProduct.supplier} onChange={e => setNewProduct({ ...newProduct, supplier: (e.target as HTMLInputElement).value })} />
              <ModalInput label={l('Цена (₸)', 'Бағасы (₸)', 'Price (₸)')} type="number" value={String(newProduct.cost)} onChange={e => setNewProduct({ ...newProduct, cost: Number((e.target as HTMLInputElement).value) })} />
              {/* Niche tag (multi-niche teams only). Empty = applies to all. */}
              {store.secondaryNiches.length > 0 && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {l('Направление', 'Бағыт', 'Direction')}
                    <span className="text-slate-300 ml-1">· {l('по желанию', 'қалау бойынша', 'optional')}</span>
                  </label>
                  <select
                    value={newProduct.niche || ''}
                    onChange={e => setNewProduct({ ...newProduct, niche: e.target.value })}
                    className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none"
                  >
                    <option value="">{l('Любое (общее)', 'Кез келген', 'Any (shared)')}</option>
                    {store.allNiches.map(nid => {
                      const n = getNiche(nid);
                      return <option key={nid} value={nid}>{n.icon} {n.name[language]}</option>;
                    })}
                  </select>
                </div>
              )}
            </div>
            <div className="p-5 pt-0 flex gap-2">
              <button onClick={() => setShowAddModal(false)} className="flex-1 px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs hover:bg-white transition-colors">{l('Отмена', 'Болдырмау', 'Cancel')}</button>
              <button onClick={handleAdd} className="flex-1 px-3 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all">{l('Добавить', 'Қосу', 'Add')}</button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={() => { setShowEditModal(false); setSelectedProduct(null); }}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/60 flex items-center justify-between">
              <div><div className="text-[10px] text-slate-400">{selectedProduct.category} · {selectedProduct.supplier}</div><div className="text-sm text-gray-900">{selectedProduct.name}</div></div>
              <button onClick={() => { setShowEditModal(false); setSelectedProduct(null); }} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <ModalInput label={l('Кол-во', 'Саны', 'Quantity')} type="number" value={String(selectedProduct.quantity)} onChange={e => setSelectedProduct({ ...selectedProduct, quantity: Number((e.target as HTMLInputElement).value) })} />
                <ModalInput label={l('Мин. остаток', 'Мин. қалдық', 'Min stock')} type="number" value={String(selectedProduct.minQty)} onChange={e => setSelectedProduct({ ...selectedProduct, minQty: Number((e.target as HTMLInputElement).value) })} />
              </div>
              <ModalInput label={l('Цена (₸)', 'Бағасы (₸)', 'Price (₸)')} type="number" value={String(selectedProduct.cost)} onChange={e => setSelectedProduct({ ...selectedProduct, cost: Number((e.target as HTMLInputElement).value) })} />
              {/* Niche tag — edit version. Empty = shared across niches. */}
              {store.secondaryNiches.length > 0 && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">{l('Направление', 'Бағыт', 'Direction')}</label>
                  <select
                    value={selectedProduct.niche || ''}
                    onChange={e => setSelectedProduct({ ...selectedProduct, niche: e.target.value || undefined })}
                    className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none"
                  >
                    <option value="">{l('Любое (общее)', 'Кез келген', 'Any (shared)')}</option>
                    {store.allNiches.map(nid => {
                      const n = getNiche(nid);
                      return <option key={nid} value={nid}>{n.icon} {n.name[language]}</option>;
                    })}
                  </select>
                </div>
              )}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="text-[10px] text-slate-400">{l('Итого на складе', 'Қоймадағы жиыны', 'Total stock value')}</span>
                <span className="text-sm text-gray-900">{(selectedProduct.quantity * selectedProduct.cost).toLocaleString()} ₸</span>
              </div>
            </div>
            <div className="p-5 pt-0 flex gap-2">
              <button onClick={() => { setShowEditModal(false); setSelectedProduct(null); }} className="flex-1 px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs hover:bg-white transition-colors">{l('Отмена', 'Болдырмау', 'Cancel')}</button>
              <button onClick={handleSaveEdit} className="flex-1 px-3 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all">{l('Сохранить', 'Сақтау', 'Save')}</button>
            </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={() => setSelectedOrder(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/60 flex items-center justify-between">
              <div><div className="text-sm text-gray-900">{selectedOrder.name}</div><div className="text-[10px] text-slate-400">#{selectedOrder.id} · {selectedOrder.client}</div></div>
              <button onClick={() => setSelectedOrder(null)} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[{ icon: Users, label: l('Клиент', 'Клиент', 'Client'), value: selectedOrder.client }, { icon: Wrench, label: l('Мастер', 'Шебер', 'Master'), value: selectedOrder.master }, { icon: Calendar, label: l('Сроки', 'Мерзім', 'Timeline'), value: `${selectedOrder.start} → ${selectedOrder.end}` }, { icon: Clock, label: l('Осталось', 'Қалды', 'Remaining'), value: selectedOrder.daysLeft === 0 ? l('Готово', 'Дайын', 'Ready') : `${selectedOrder.daysLeft} ${l('дней', 'күн', 'days')}` }].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
                    <item.icon className="w-3.5 h-3.5 text-slate-400" /><div><div className="text-[10px] text-slate-400">{item.label}</div><div className="text-xs text-gray-900">{item.value}</div></div>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[11px] text-slate-400 mb-2">{l('Материалы', 'Материалдар', 'Materials')}</div>
                <div className="flex flex-wrap gap-1">{selectedOrder.materials.map((m, i) => <span key={i} className="text-[10px] px-2 py-1 bg-gray-50 text-gray-600 rounded-lg">{m}</span>)}</div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1"><span className="text-slate-400">{l('Прогресс', 'Прогресс', 'Progress')}</span><span className="text-gray-900">{selectedOrder.progress}%</span></div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${orderConf(selectedOrder.status).bar} rounded-full`} style={{ width: `${selectedOrder.progress}%` }} /></div>
              </div>
            </div>
            <div className="p-5 pt-0"><button onClick={() => setSelectedOrder(null)} className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs hover:bg-white transition-colors">{l('Закрыть', 'Жабу', 'Close')}</button></div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

// ─── BomTemplates ─────────────────────────────────────────────────
// CRUD for production «recipes». Each template has a name, default
// dimensions, a materials table (qty × unit × price), labour cost,
// markup %, lead time. The card grid shows everything the team has
// saved; modal handles create/edit; «Использовать» creates a new deal
// pre-filled with the template's product name + total price.
interface BomMaterial { mat: string; sup: string; qty: number; unit: string; price: number }
interface BomTemplate {
  id?: string;
  name: string;
  type: string;       // kitchen / wardrobe / closet / hallway / bed / other
  width?: number; height?: number; depth?: number;  // mm
  materials: BomMaterial[];
  labourCost: number;
  markupPct: number;
  leadDays: number;
  createdAt?: string;
  updatedAt?: string;
}

// Fallback furniture-only BOM type list — kept for back-compat with
// existing data. The active list inside BomTemplates is built from
// the team's niche so a windows business sees "Окно глухое / Балкон"
// instead of "Кухня / Шкаф-купе".
const TYPE_LABELS: Record<string, string> = {
  kitchen: 'Кухня', wardrobe: 'Шкаф-купе', closet: 'Гардероб',
  hallway: 'Прихожая', bed: 'Кровать', table: 'Стол', other: 'Прочее',
};
const TYPE_OPTIONS: Array<{ id: string; ru: string }> = [
  { id: 'kitchen', ru: 'Кухня' }, { id: 'wardrobe', ru: 'Шкаф-купе' },
  { id: 'closet', ru: 'Гардероб' }, { id: 'hallway', ru: 'Прихожая' },
  { id: 'bed', ru: 'Кровать' }, { id: 'table', ru: 'Стол' }, { id: 'other', ru: 'Прочее' },
];

// Derived totals shared by card grid + modal preview.
function bomTotals(t: BomTemplate) {
  const materials = t.materials.reduce((s, m) => s + (m.qty || 0) * (m.price || 0), 0);
  const subtotal  = materials + (t.labourCost || 0);
  const markup    = subtotal * ((t.markupPct || 0) / 100);
  const clientTotal = subtotal + markup;
  return { materials, labour: t.labourCost || 0, markup, clientTotal };
}

function BomTemplates({ language }: { language: 'kz' | 'ru' | 'eng' }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();
  const niche = getNiche(store.niche);
  // Niche-aware product types — replaces the furniture-only TYPE_OPTIONS
  // for the picker. We also build a label map so old data referencing
  // legacy ids ('kitchen', 'wardrobe') still renders their RU labels.
  const typeOptions = useMemo(() => {
    return niche.productTypeOptions.map(name => ({ id: name, ru: name }));
  }, [niche]);
  const labelFor = (id: string) => TYPE_LABELS[id] || id;
  const [templates, setTemplates] = useState<BomTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<BomTemplate | null>(null); // null = no modal; «»  = new
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { refresh(); }, []);
  function refresh() {
    api.get<BomTemplate[]>('/api/bom-templates')
      .then(rows => { setTemplates(rows || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }

  async function save(t: BomTemplate) {
    setBusy(true); setError(null);
    try {
      if (t.id) await api.patch(`/api/bom-templates/${t.id}`, t);
      else      await api.post('/api/bom-templates', t);
      setEditing(null);
      refresh();
    } catch (e: any) { setError(String(e?.message || e)); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm('Удалить шаблон?')) return;
    setBusy(true);
    try { await api.delete(`/api/bom-templates/${id}`); refresh(); }
    catch (e: any) { setError(String(e?.message || e)); }
    finally { setBusy(false); }
  }
  function duplicate(t: BomTemplate) {
    const { id: _, createdAt, updatedAt, ...rest } = t;
    setEditing({ ...rest, name: rest.name + ' (копия)' });
  }
  function useInOrder(t: BomTemplate) {
    // Pre-fill a new deal from this template + jump to the Sales page so
    // the user can finish customer details. Total price = clientTotal.
    const totals = bomTotals(t);
    const seed = {
      product: t.name, amount: Math.round(totals.clientTotal),
      furnitureType: labelFor(t.type),
      completionDate: '', measurementDate: '',
      materials: t.materials.map(m => m.mat).join(', '),
      notes: `Из шаблона: материалы ${Math.round(totals.materials).toLocaleString('ru-RU')} ₸, работа ${Math.round(totals.labour).toLocaleString('ru-RU')} ₸, наценка ${t.markupPct}%`,
    };
    // Two-step hop: jump to «Заказы» first via the app:navigate event,
    // then dispatch the template-fill event on the next tick so the
    // SalesKanban listener (registered in useEffect) is mounted by the
    // time the event arrives. Without the delay the modal sometimes
    // wouldn't open when the user was on a different page.
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page: 'sales' } }));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('sales:create-deal-from-template', { detail: seed }));
    }, 50);
  }

  if (!loaded) return (
    <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-8 flex items-center justify-center text-slate-400 text-sm">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> {l('Загружаю шаблоны…', 'Жүктеуде…', 'Loading…')}
    </div>
  );

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2 text-xs text-rose-700 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-rose-400">×</button>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-sm text-gray-900">{l('Шаблоны изделий', 'Бұйым шаблондары', 'Product templates')}</div>
          <div className="text-[11px] text-slate-400">{templates.length} {l('шаблонов', 'шаблон', 'templates')}</div>
        </div>
        <button
          onClick={() => setEditing(blankTemplate(typeOptions[0]?.id))}
          className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 inline-flex items-center gap-1.5"
        >
          <Plus className="w-3 h-3" /> {l('Создать шаблон', 'Шаблон жасау', 'Create template')}
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-10 text-center">
          <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <div className="text-sm text-slate-900 mb-1">{l('Пока нет шаблонов', 'Әзірге шаблондар жоқ', 'No templates yet')}</div>
          <div className="text-xs text-slate-400 mb-4">{l('Создайте первый шаблон чтобы быстро повторять типовые изделия', 'Типтік бұйымдарды тез қайталау үшін алғашқы шаблон жасаңыз', 'Create a template to reuse common items')}</div>
          <button onClick={() => setEditing(blankTemplate(typeOptions[0]?.id))} className="px-4 py-2 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all inline-flex items-center gap-1.5">
            <Plus className="w-3 h-3" /> {l('Создать первый', 'Біріншісін жасау', 'Create first')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map(t => {
            const totals = bomTotals(t);
            return (
              <div key={t.id} className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-4 hover:shadow-sm transition-all">
                <div className="w-full h-24 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl flex items-center justify-center mb-3 relative">
                  <Package className="w-8 h-8 text-slate-300" />
                  <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 bg-white/80 rounded text-gray-600">{labelFor(t.type)}</span>
                </div>
                <div className="text-sm text-slate-900 mb-1 truncate" title={t.name}>{t.name}</div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                  <span>{Math.round(totals.clientTotal).toLocaleString('ru-RU')} ₸</span>
                  <span>{t.leadDays} {l('дн', 'күн', 'd')}</span>
                </div>
                <div className="text-[10px] text-slate-400 mb-3">
                  {t.materials.length} {l('материалов', 'материал', 'materials')} · {l('работа', 'жұмыс', 'labour')} {Math.round(totals.labour).toLocaleString('ru-RU')} ₸
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => useInOrder(t)} className="flex-1 text-[11px] px-2.5 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800">
                    {l('В заказ', 'Тапсырысқа', 'Use')}
                  </button>
                  <button onClick={() => setEditing(t)} title="Редактировать" className="w-7 h-7 hover:bg-white/50 border border-gray-100 rounded-lg flex items-center justify-center"><Edit2 className="w-3 h-3 text-slate-500" /></button>
                  <button onClick={() => duplicate(t)} title="Дублировать" className="w-7 h-7 hover:bg-white/50 border border-gray-100 rounded-lg flex items-center justify-center"><Copy className="w-3 h-3 text-slate-500" /></button>
                  <button onClick={() => t.id && remove(t.id)} title="Удалить" className="w-7 h-7 hover:bg-rose-50 border border-gray-100 rounded-lg flex items-center justify-center"><Trash2 className="w-3 h-3 text-rose-500" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <BomEditorModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={save}
          busy={busy}
          language={language}
          typeOptions={typeOptions}
        />
      )}
    </div>
  );
}

// Default dims are kitchen-counter-shaped; for non-furniture niches the
// user will override them in the editor. Niche-aware default `type` is
// applied by the caller (BomTemplates uses the first niche option).
function blankTemplate(defaultType = 'kitchen'): BomTemplate {
  return {
    name: '', type: defaultType,
    width: 3000, height: 900, depth: 600,
    materials: [{ mat: '', sup: '', qty: 1, unit: 'шт', price: 0 }],
    labourCost: 0, markupPct: 30, leadDays: 14,
  };
}

function BomEditorModal({ initial, onClose, onSave, busy, language, typeOptions }: {
  initial: BomTemplate; onClose: () => void; onSave: (t: BomTemplate) => void; busy: boolean; language: 'kz' | 'ru' | 'eng';
  typeOptions: Array<{ id: string; ru: string }>;
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [t, setT] = useState<BomTemplate>(initial);
  const totals = useMemo(() => bomTotals(t), [t]);
  const up = (patch: Partial<BomTemplate>) => setT(prev => ({ ...prev, ...patch }));
  const upMat = (idx: number, patch: Partial<BomMaterial>) => setT(prev => ({
    ...prev, materials: prev.materials.map((m, i) => i === idx ? { ...m, ...patch } : m),
  }));
  const addMat = () => setT(prev => ({ ...prev, materials: [...prev.materials, { mat: '', sup: '', qty: 1, unit: 'шт', price: 0 }] }));
  const removeMat = (idx: number) => setT(prev => ({ ...prev, materials: prev.materials.filter((_, i) => i !== idx) }));

  function commit() {
    if (!t.name.trim()) { toast('Укажите название шаблона', 'error'); return; }
    onSave({ ...t, name: t.name.trim() });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/60 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-900">{t.id ? l('Редактировать шаблон', 'Шаблонды өңдеу', 'Edit template') : l('Новый шаблон', 'Жаңа шаблон', 'New template')}</div>
            <div className="text-[11px] text-slate-400">{l('Сохраняется на сервере для всей команды', 'Бүкіл команда үшін серверде сақталады', 'Saved on the server for the whole team')}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-slate-400 mb-1">{l('Название', 'Атауы', 'Name')}</div>
              <input value={t.name} onChange={e => up({ name: e.target.value })} placeholder='Кухня прямая 3м' className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">{l('Тип изделия', 'Бұйым түрі', 'Type')}</div>
              <select value={t.type} onChange={e => up({ type: e.target.value })} className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200">
                {typeOptions.map(o => <option key={o.id} value={o.id}>{o.ru}</option>)}
              </select>
            </div>
          </div>

          {/* Dimensions */}
          <div>
            <div className="text-[10px] text-slate-400 mb-1">{l('Размеры (мм)', 'Өлшемдер (мм)', 'Dimensions (mm)')}</div>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" value={t.width || 0}  onChange={e => up({ width:  Number(e.target.value) })} placeholder="Длина"  className="px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
              <input type="number" value={t.depth || 0}  onChange={e => up({ depth:  Number(e.target.value) })} placeholder="Глубина" className="px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
              <input type="number" value={t.height || 0} onChange={e => up({ height: Number(e.target.value) })} placeholder="Высота"  className="px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
          </div>

          {/* Materials editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-900">{l('Материалы', 'Материалдар', 'Materials')}</div>
              <button onClick={addMat} className="text-[11px] text-emerald-600 hover:text-violet-800 inline-flex items-center gap-1"><Plus className="w-3 h-3" /> {l('Добавить', 'Қосу', 'Add')}</button>
            </div>
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-1 px-2 py-1.5 bg-gray-50 text-[10px] text-slate-400 uppercase tracking-wide">
                <div className="col-span-4">Материал</div>
                <div className="col-span-3">Поставщик</div>
                <div className="col-span-1 text-right">Кол-во</div>
                <div className="col-span-1">Ед.</div>
                <div className="col-span-2 text-right">Цена</div>
                <div className="col-span-1 text-right">Итого</div>
              </div>
              {t.materials.map((m, i) => (
                <div key={i} className="grid grid-cols-12 gap-1 px-2 py-1.5 border-t border-white/60 items-center">
                  <input value={m.mat}  onChange={e => upMat(i, { mat: e.target.value })}  placeholder="ЛДСП Egger…"   className="col-span-4 px-2 py-1 bg-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
                  <input value={m.sup}  onChange={e => upMat(i, { sup: e.target.value })}  placeholder="Поставщик"     className="col-span-3 px-2 py-1 bg-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
                  <input type="number"  value={m.qty}   onChange={e => upMat(i, { qty: Number(e.target.value) })}      className="col-span-1 px-2 py-1 bg-white rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-gray-200" />
                  <input value={m.unit} onChange={e => upMat(i, { unit: e.target.value })} placeholder="шт"             className="col-span-1 px-2 py-1 bg-white rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
                  <input type="number"  value={m.price} onChange={e => upMat(i, { price: Number(e.target.value) })}    className="col-span-2 px-2 py-1 bg-white rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-gray-200" />
                  <div className="col-span-1 flex items-center justify-end gap-1 text-xs text-slate-700 tabular-nums">
                    {Math.round(m.qty * m.price).toLocaleString('ru-RU')}
                    <button onClick={() => removeMat(i)} className="text-slate-300 hover:text-rose-500 ml-1"><X className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Labour + markup + lead time */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] text-slate-400 mb-1">{l('Работа (₸)', 'Жұмыс (₸)', 'Labour (₸)')}</div>
              <input type="number" value={t.labourCost} onChange={e => up({ labourCost: Number(e.target.value) })} className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">{l('Наценка %', 'Үстеме %', 'Markup %')}</div>
              <input type="number" value={t.markupPct} onChange={e => up({ markupPct: Number(e.target.value) })} className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 mb-1">{l('Срок (дн)', 'Мерзім (күн)', 'Lead time (days)')}</div>
              <input type="number" value={t.leadDays} onChange={e => up({ leadDays: Number(e.target.value) })} className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
          </div>

          {/* Computed totals */}
          <div className="bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div><div className="text-[10px] text-slate-400 mb-1">Материалы</div><div className="text-gray-900 tabular-nums">{Math.round(totals.materials).toLocaleString('ru-RU')} ₸</div></div>
            <div><div className="text-[10px] text-slate-400 mb-1">Работа</div><div className="text-gray-900 tabular-nums">{Math.round(totals.labour).toLocaleString('ru-RU')} ₸</div></div>
            <div><div className="text-[10px] text-slate-400 mb-1">Наценка {t.markupPct}%</div><div className="text-gray-900 tabular-nums">{Math.round(totals.markup).toLocaleString('ru-RU')} ₸</div></div>
            <div><div className="text-[10px] text-slate-400 mb-1">Итого клиенту</div><div className="text-gray-900 tabular-nums">{Math.round(totals.clientTotal).toLocaleString('ru-RU')} ₸</div></div>
          </div>
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-white/60 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900">{l('Отмена', 'Болдырмау', 'Cancel')}</button>
          <button onClick={commit} disabled={busy || !t.name.trim()} className="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-xs disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            {l('Сохранить', 'Сақтау', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NestingView ─────────────────────────────────────────────────
// Простой honest UI вместо фейковой раскладки. Берёт детали из выбранной
// сделки в производстве (или показывает empty state), считает количество
// листов простой формулой «общая площадь / площадь листа × коэффициент
// отходов», даёт CSV-экспорт для импорта в Felder/Holzma софт, и
// браузерную печать.
//
// Реальный nesting solver (genetic / bottom-left fill) — отдельный
// проект, не имитируем его. Кнопка «Оптимизировать» открывает
// info-блок про CNC-интеграцию.
function NestingView({ language, prodOrders, deals }: {
  language: 'kz' | 'ru' | 'eng';
  prodOrders: ProdOrder[];
  deals: any[];
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [selectedDealId, setSelectedDealId] = useState<string>(prodOrders[0]?.dealId || '');
  const selected = deals.find(d => d.id === selectedDealId) || prodOrders[0];
  const [showCnc, setShowCnc] = useState(false);

  // Parts — для v1 берём из строки materials сделки (через запятую),
  // умножаем на грубое количество. В будущем можно подключить parts из
  // BomTemplate.materials когда заказ создан из шаблона.
  const parts = useMemo(() => {
    if (!selected) return [];
    const mats: string = (selected.materials || '');
    const arr = mats.split(',').map((s: string) => s.trim()).filter(Boolean);
    return arr.map((name, i) => ({
      id: i, name,
      // Простая эвристика количества — по типу строки в названии.
      qty: /фасад|дверь|дверца/i.test(name) ? 4 : /полка/i.test(name) ? 6 : /столешница/i.test(name) ? 1 : 2,
      sizeMm: '600×400',  // дефолтный размер — пока без точных габаритов
    }));
  }, [selected]);

  // Лист ЛДСП 2750×1830 = 5.03 м²; деталь 0.6×0.4 = 0.24 м². 12% отходы.
  const sheetAreaM2 = 2.75 * 1.83;
  const partAreaM2  = 0.6 * 0.4;
  const totalPartArea = parts.reduce((s, p) => s + p.qty * partAreaM2, 0);
  const sheetsNeeded = Math.ceil(totalPartArea * 1.12 / sheetAreaM2);
  const utilizationPct = sheetsNeeded > 0 ? Math.round(totalPartArea / (sheetsNeeded * sheetAreaM2) * 100) : 0;
  const wastePct = 100 - utilizationPct;

  function exportCSV() {
    const rows: Array<Array<string | number>> = [
      ['Деталь', 'Размер (мм)', 'Кол-во', 'Площадь (м²)'],
      ...parts.map(p => [p.name, p.sizeMm, p.qty, (p.qty * partAreaM2).toFixed(3)]),
      ['', '', 'Итого', totalPartArea.toFixed(3)],
      ['', '', 'Листов', sheetsNeeded],
    ];
    const csv = rows.map(r => r.map(c => {
      const s = String(c ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `raskroy-${selected?.id || 'order'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function printMap() { window.print(); }

  if (prodOrders.length === 0) {
    return (
      <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-10 text-center">
        <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <div className="text-sm text-slate-900 mb-1">{l('Нет активных заказов', 'Белсенді тапсырыстар жоқ', 'No active orders')}</div>
        <div className="text-xs text-slate-400">{l('Раскрой работает на основе сделок в производстве — переведите сделку в нужный статус', 'Тілу өндірістегі мәмілелер негізінде жұмыс істейді — мәмілені тиісті күйге ауыстырыңыз', 'Nesting works from in-production deals')}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      {/* Order picker + parts list */}
      <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5">
        <div className="text-[10px] text-slate-400 mb-1 uppercase tracking-wide">{l('Выберите заказ', 'Тапсырыс таңдаңыз', 'Select order')}</div>
        <select
          value={selectedDealId}
          onChange={e => setSelectedDealId(e.target.value)}
          className="w-full px-3 py-2 bg-gray-50 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200 mb-4"
        >
          {prodOrders.map(o => (
            <option key={o.dealId} value={o.dealId}>{o.name} — {o.client}</option>
          ))}
        </select>

        <div className="text-sm text-slate-900 mb-3">{l('Детали', 'Бөліктер', 'Parts')} ({parts.length})</div>
        {parts.length === 0 ? (
          <div className="text-[11px] text-slate-400 italic text-center py-4">
            {l('Материалы не указаны в сделке. Заполните поле «Материалы» в карточке клиента.', 'Мәміледе материалдар көрсетілмеген. Клиент картасында «Материалдар» өрісін толтырыңыз.', 'Materials not specified in the deal')}
          </div>
        ) : (
          <div className="space-y-2">
            {parts.map(p => (
              <div key={p.id} className="flex items-center gap-2 text-xs p-2 bg-gray-50 rounded-lg">
                <Package className="w-3 h-3 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-gray-900 truncate">{p.name}</div>
                  <div className="text-[10px] text-slate-400">{p.sizeMm} мм</div>
                </div>
                <span className="text-slate-500">×{p.qty}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sheet visualisation (illustrative only — not a real solver) */}
      <div className="lg:col-span-2 bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm text-gray-900">{l('Лист ЛДСП 2750×1830 мм', 'ЛДСП парағы 2750×1830 мм', 'MFC sheet 2750×1830 mm')}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{l('Иллюстративная раскладка — для точного нестинга нужен CNC-софт', 'Иллюстрациялық сызба — нақты тілу үшін CNC бағдарламасы керек', 'Illustrative — real nesting requires CNC software')}</div>
          </div>
          <span className="text-[10px] text-slate-400">{l('Лист 1', '1-парақ', 'Sheet 1')} / {sheetsNeeded || 1}</span>
        </div>
        <div className="aspect-[2750/1830] bg-gray-50 rounded-xl border border-gray-100 relative overflow-hidden">
          {/* Render a simple grid of part rectangles — purely visual */}
          {parts.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-xs">
              {l('Выберите заказ с материалами', 'Материалдары бар тапсырысты таңдаңыз', 'Select an order with materials')}
            </div>
          ) : (
            <div className="absolute inset-1 grid grid-cols-6 grid-rows-4 gap-0.5 p-1">
              {Array.from({ length: Math.min(24, parts.reduce((s, p) => s + p.qty, 0)) }).map((_, i) => {
                const colors = ['bg-blue-200 border-blue-400', 'bg-purple-200 border-purple-400', 'bg-amber-200 border-amber-400', 'bg-emerald-200 border-emerald-400', 'bg-rose-200 border-rose-400'];
                return <div key={i} className={`border rounded ${colors[i % colors.length]}`} />;
              })}
            </div>
          )}
        </div>
      </div>

      {/* Stats + actions */}
      <div className="space-y-3">
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5">
          <div className="text-sm text-slate-900 mb-3">{l('Статистика', 'Статистика', 'Stats')}</div>
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">Использовано</span><span className="text-gray-900">{utilizationPct}%</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Отходы</span><span className="text-amber-600">{wastePct}%</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Листов нужно</span><span className="text-gray-900">{sheetsNeeded}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Площадь деталей</span><span className="text-gray-900">{totalPartArea.toFixed(2)} м²</span></div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/60 text-[10px] text-slate-400 leading-relaxed">
            {l('Оценка по средней детали 600×400 мм + 12% на отходы. Реальная раскладка зависит от размеров деталей и софта станка.',
               'Орташа 600×400 мм бөлшек бойынша бағалау + 12% қалдыққа. Нақты сызба бөлшек өлшеміне және станок бағдарламасына байланысты.',
               'Estimate based on avg 600×400 part + 12% waste.')}
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => setShowCnc(true)}
            className="w-full px-3 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all inline-flex items-center justify-center gap-1.5"
          >
            <Wrench className="w-3 h-3" /> {l('CNC-интеграция', 'CNC интеграция', 'CNC integration')}
          </button>
          <button
            onClick={exportCSV}
            disabled={parts.length === 0}
            className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs hover:bg-white transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <Download className="w-3 h-3" /> {l('Экспорт CSV (раскрой)', 'CSV экспорты', 'Export CSV')}
          </button>
          <button
            onClick={printMap}
            className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs hover:bg-white transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <FileText className="w-3 h-3" /> {l('Печать карты', 'Картаны басу', 'Print map')}
          </button>
        </div>

        {showCnc && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 flex-1">
                {l('Оптимизация раскладки', 'Раскрой оңтайландыру', 'Nesting optimisation')}
              </div>
              <button onClick={() => setShowCnc(false)} className="text-amber-400 hover:text-amber-700"><X className="w-3 h-3" /></button>
            </div>
            <div className="text-[11px] text-amber-800 leading-relaxed mb-2">
              {l('Реальная оптимизация раскладки — это отдельный класс задач (genetic / bottom-left-fill алгоритмы). Для точного нестинга экспортируйте CSV и загрузите в софт вашего станка: Felder Maxisoft, Holzma Cadmatic, Biesse bSolid.',
                 'Сызба оптимизациясы — бөлек тапсырмалар класы (genetic / bottom-left-fill алгоритмдері). Нақты нестинг үшін CSV экспорттап, өз станогыңыздың бағдарламасына жүктеңіз: Felder Maxisoft, Holzma Cadmatic, Biesse bSolid.',
                 'Use Felder/Holzma/Biesse software for real nesting via CSV.')}
            </div>
            <a href="https://www.felder-group.com/" target="_blank" rel="noopener noreferrer" className="text-[11px] text-amber-700 underline">Felder Maxisoft →</a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Suppliers view (vendor catalog) ──────────────────────────────
// KPI strip (количество / средний рейтинг / средние дни доставки) +
// search + add CTA + glass cards with phone/category/rating chips.
function SuppliersView({
  language, suppliers, canWrite, onAdd, onEdit, onDelete, onImport, nicheCategories,
}: {
  language: 'kz' | 'ru' | 'eng';
  suppliers: Supplier[];
  canWrite: boolean;
  onAdd: () => void;
  onEdit: (s: Supplier) => void;
  onDelete: (id: string) => void;
  onImport: () => void;
  nicheCategories: string[];
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [q, setQ] = useState('');
  const filtered = suppliers.filter(s =>
    !q.trim() || (s.name + ' ' + (s.category || '') + ' ' + (s.contactPerson || '')).toLowerCase().includes(q.toLowerCase()),
  );
  const avgRating = suppliers.length
    ? (suppliers.reduce((sum, s) => sum + (s.rating || 0), 0) / suppliers.length).toFixed(1)
    : '—';
  const avgDays = suppliers.filter(s => s.deliveryDays).length
    ? Math.round(suppliers.reduce((sum, s) => sum + (s.deliveryDays || 0), 0) / suppliers.filter(s => s.deliveryDays).length)
    : '—';

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-2xl p-3.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">{l('Поставщиков', 'Жеткізушілер', 'Suppliers')}</div>
          <div className="text-lg text-slate-900 tabular-nums">{suppliers.length}</div>
        </div>
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-2xl p-3.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">{l('Средний рейтинг', 'Орташа рейтинг', 'Avg rating')}</div>
          <div className="text-lg text-slate-900 tabular-nums">{avgRating}<span className="text-slate-300 text-sm"> / 5</span></div>
        </div>
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-2xl p-3.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">{l('Срок доставки', 'Жеткізу мерзімі', 'Delivery days')}</div>
          <div className="text-lg text-slate-900 tabular-nums">{avgDays} <span className="text-slate-300 text-sm">дней</span></div>
        </div>
      </div>

      {/* Search + actions toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={l('Поиск по имени, категории, контакту', 'Атау, санат, байланыс', 'Search by name, category, contact')}
            className="w-full pl-9 pr-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs focus:outline-none focus:bg-white focus:ring-slate-300 transition-all placeholder:text-slate-400"
          />
        </div>
        {canWrite && suppliers.length > 0 && (
          <button
            onClick={onImport}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/50 hover:bg-white/80 ring-1 ring-white/60 rounded-xl text-xs text-slate-600 backdrop-blur-xl transition-all"
            title={l('Импорт CSV', 'CSV импорт', 'Import CSV')}
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
        )}
        {canWrite && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            {l('Добавить поставщика', 'Жеткізуші қосу', 'Add supplier')}
          </button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        // Empty state — hero CTA card. Search-empty state has its own
        // softer copy; absolute-empty state pushes the user to add.
        suppliers.length === 0 ? (
          <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-3xl p-10 text-center shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)]">
            <Truck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm text-slate-900 mb-1.5">
              {l('Здесь будут поставщики', 'Жеткізушілер осы жерде болады', 'Suppliers live here')}
            </h3>
            <p className="text-[11px] text-slate-500 mb-5 max-w-md mx-auto leading-relaxed">
              {l(
                `Поставщики по категориям ${nicheCategories.slice(0, 3).join(' / ')} и др. Заведите первого или импортируйте список из Excel.`,
                'Бірінші жеткізушіні қосыңыз немесе CSV-тен импорттаңыз.',
                `Suppliers by category (${nicheCategories.slice(0, 3).join(' / ')} etc.). Add the first or import from Excel.`,
              )}
            </p>
            {canWrite && (
              <div className="flex items-center gap-2 justify-center flex-wrap">
                <button
                  onClick={onAdd}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> {l('Добавить первого поставщика', 'Бірінші жеткізуші', 'Add first supplier')}
                </button>
                <button
                  onClick={onImport}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-2xl text-xs text-slate-700 backdrop-blur-xl transition-all"
                >
                  <Upload className="w-3.5 h-3.5" /> {l('Импорт CSV', 'CSV импорт', 'Import CSV')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-3xl p-12 text-center text-xs text-slate-500 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)]">
            {l('Ничего не найдено', 'Ештеңе табылмады', 'Nothing found')}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {filtered.map(s => (
            <div key={s.id} className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-2xl p-4 group hover:bg-white/70 transition-all shadow-[0_4px_16px_-8px_rgba(15,23,42,0.08)]">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm text-slate-900 truncate">{s.name}</span>
                    {s.rating && (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded-full ring-1 ring-white/40">
                        ★ {s.rating}
                      </span>
                    )}
                  </div>
                  {s.contactPerson && <div className="text-[11px] text-slate-500 truncate">{s.contactPerson}</div>}
                </div>
                {canWrite && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => onEdit(s)} className="p-1.5 hover:bg-white/70 ring-1 ring-transparent hover:ring-white/60 rounded-xl transition-all" title={l('Редактировать', 'Өңдеу', 'Edit')}>
                      <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                    </button>
                    <button onClick={() => onDelete(s.id)} className="p-1.5 hover:bg-rose-100/70 rounded-xl transition-colors" title={l('Удалить', 'Жою', 'Delete')}>
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center flex-wrap gap-1.5 text-[10px] text-slate-600">
                {s.category && <span className="px-2 py-0.5 bg-white/60 ring-1 ring-white/60 rounded-full">{s.category}</span>}
                {s.phone && <span className="px-2 py-0.5 bg-white/60 ring-1 ring-white/60 rounded-full">{s.phone}</span>}
                {s.deliveryDays && <span className="px-2 py-0.5 bg-white/60 ring-1 ring-white/60 rounded-full">{s.deliveryDays} {l('дн.', 'күн.', 'd')}</span>}
                {s.paymentTerms && <span className="px-2 py-0.5 bg-white/60 ring-1 ring-white/60 rounded-full">{s.paymentTerms}</span>}
              </div>
              {s.notes && <div className="mt-2 text-[11px] text-slate-500 leading-snug">{s.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Purchase orders view ─────────────────────────────────────────
function PurchasesView({
  language, purchaseOrders, suppliers, onAdd, onEdit, onDelete, onUpdateStatus,
}: {
  language: 'kz' | 'ru' | 'eng';
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  onAdd: () => void;
  onEdit: (p: PurchaseOrder) => void;
  onDelete: (id: string) => void;
  onUpdateStatus: (id: string, status: PurchaseOrder['status']) => void;
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [filter, setFilter] = useState<'all' | PurchaseOrder['status']>('all');
  const supName = (id: string) => suppliers.find(s => s.id === id)?.name || '—';
  const filtered = purchaseOrders.filter(p => filter === 'all' || p.status === filter);

  const STATUS_META: Record<PurchaseOrder['status'], { ru: string; kz: string; eng: string; cls: string }> = {
    draft:     { ru: 'Черновик',  kz: 'Жоба',     eng: 'Draft',     cls: 'bg-slate-100/70 text-slate-700 ring-slate-200/40' },
    sent:      { ru: 'Отправлен', kz: 'Жіберілді',eng: 'Sent',      cls: 'bg-sky-100/70 text-sky-700 ring-sky-200/40' },
    received:  { ru: 'Получен',   kz: 'Қабылданды',eng: 'Received', cls: 'bg-emerald-100/70 text-emerald-700 ring-emerald-200/40' },
    cancelled: { ru: 'Отменён',   kz: 'Болдырмады',eng: 'Cancelled',cls: 'bg-rose-100/70 text-rose-700 ring-rose-200/40' },
  };

  const totalSpent = purchaseOrders
    .filter(p => p.status === 'received')
    .reduce((s, p) => s + (p.totalCost || 0), 0);
  const pending = purchaseOrders.filter(p => p.status === 'draft' || p.status === 'sent').length;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-2xl p-3.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">{l('Всего закупок', 'Барлық сатып алу', 'Total POs')}</div>
          <div className="text-lg text-slate-900 tabular-nums">{purchaseOrders.length}</div>
        </div>
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-2xl p-3.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">{l('В пути', 'Жолда', 'Pending')}</div>
          <div className="text-lg text-slate-900 tabular-nums">{pending}</div>
        </div>
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-2xl p-3.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">{l('Потрачено', 'Жұмсалды', 'Spent')}</div>
          <div className="text-lg text-slate-900 tabular-nums">{Math.round(totalSpent).toLocaleString('ru-RU')} ₸</div>
        </div>
      </div>

      {/* Filter chips + add */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(['all', 'draft', 'sent', 'received', 'cancelled'] as const).map(f => {
          const active = filter === f;
          const meta = f === 'all'
            ? { label: l('Все', 'Барлығы', 'All'), cls: 'bg-slate-100/70 text-slate-700 ring-slate-200/40' }
            : { label: STATUS_META[f][language], cls: STATUS_META[f].cls };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-[11px] ring-1 transition-all ${
                active
                  ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]'
                  : `${meta.cls} hover:bg-white/70`
              }`}
            >
              {meta.label}
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={onAdd}
          disabled={suppliers.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
          title={suppliers.length === 0 ? l('Сначала добавьте поставщика', 'Алдымен жеткізуші қосыңыз', 'Add a supplier first') : undefined}
        >
          <Plus className="w-3.5 h-3.5" />
          {l('Новая закупка', 'Жаңа сатып алу', 'New PO')}
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-3xl p-12 text-center text-xs text-slate-500 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)]">
          {suppliers.length === 0
            ? l('Сначала добавьте поставщика во вкладке «Поставщики»', 'Алдымен «Жеткізушілер» қойындысында жеткізуші қосыңыз', 'Add a supplier in the Suppliers tab first')
            : l('Закупок пока нет', 'Сатып алулар жоқ', 'No purchases yet')}
        </div>
      ) : (
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 rounded-3xl overflow-hidden shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)]">
          <div className="divide-y divide-white/50">
            {filtered.map(p => {
              const meta = STATUS_META[p.status];
              return (
                <div key={p.id} className="px-5 py-3 hover:bg-white/40 transition-colors group">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-slate-900 truncate">{supName(p.supplierId)}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 ${meta.cls}`}>
                        {meta[language]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-sm text-slate-900 tabular-nums">{Math.round(p.totalCost || 0).toLocaleString('ru-RU')} ₸</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                        {p.status === 'draft' && (
                          <button onClick={() => onUpdateStatus(p.id, 'sent')} className="text-[10px] px-2 py-1 bg-sky-100/70 text-sky-700 ring-1 ring-sky-200/40 rounded-lg hover:bg-sky-100" title={l('Отправить поставщику', 'Жеткізушіге жіберу', 'Mark as sent')}>
                            ✈ {l('Отправить', 'Жіберу', 'Send')}
                          </button>
                        )}
                        {p.status === 'sent' && (
                          <button onClick={() => onUpdateStatus(p.id, 'received')} className="text-[10px] px-2 py-1 bg-emerald-100/70 text-emerald-700 ring-1 ring-emerald-200/40 rounded-lg hover:bg-emerald-100" title={l('Отметить как получено', 'Қабылданды деп белгілеу', 'Mark received')}>
                            ✓ {l('Получено', 'Қабылданды', 'Received')}
                          </button>
                        )}
                        <button onClick={() => onEdit(p)} className="p-1.5 hover:bg-white/70 ring-1 ring-transparent hover:ring-white/60 rounded-xl transition-all">
                          <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                        <button onClick={() => onDelete(p.id)} className="p-1.5 hover:bg-rose-100/70 rounded-xl transition-colors">
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                    <span>{(p.items || []).length} {l('позиций', 'позиция', 'items')}</span>
                    {p.expectedDate && <span>· {l('ожидается', 'күтілуде', 'expected')} {p.expectedDate}</span>}
                    {p.receivedDate && <span>· {l('получено', 'қабылданды', 'received')} {p.receivedDate}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Supplier modal (add / edit) ──────────────────────────────────
// Categories list comes from the niche so a windows business sees
// «Профиль / Стеклопакеты / Фурнитура» instead of furniture-only options.
function SupplierModal({
  language, initial, onClose, onSave, categories,
}: {
  language: 'kz' | 'ru' | 'eng';
  initial: Supplier | null;
  onClose: () => void;
  onSave: (s: Partial<Supplier>) => void;
  categories: string[];
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [data, setData] = useState<Partial<Supplier>>({
    name: '', contactPerson: '', phone: '', email: '', address: '',
    category: '', paymentTerms: '50/50', deliveryDays: 7, rating: 5, notes: '',
    ...(initial || {}),
  });
  const INPUT = 'w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all';
  const LABEL = 'block text-[11px] text-slate-500 mb-1.5';

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white/85 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-[0_24px_64px_-12px_rgba(15,23,42,0.3)]">
        <div className="px-6 py-5 border-b border-white/60 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 mb-1 tracking-widest uppercase">{l('Поставщик', 'Жеткізуші', 'Supplier')}</div>
            <div className="text-lg text-slate-900 tracking-tight">
              {initial ? l('Редактировать', 'Өңдеу', 'Edit') : l('Новый поставщик', 'Жаңа жеткізуші', 'New supplier')}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-2xl flex items-center justify-center">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label className={LABEL}>{l('Название', 'Атауы', 'Name')} *</label>
            <input className={INPUT} value={data.name} onChange={e => setData(d => ({ ...d, name: e.target.value }))} placeholder={l('например: Kronospan', 'мысалы: Kronospan', 'e.g. Kronospan')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>{l('Контактное лицо', 'Байланыс тұлғасы', 'Contact')}</label>
              <input className={INPUT} value={data.contactPerson} onChange={e => setData(d => ({ ...d, contactPerson: e.target.value }))} />
            </div>
            <div>
              <label className={LABEL}>{l('Телефон', 'Телефон', 'Phone')}</label>
              <input className={INPUT} value={data.phone} onChange={e => setData(d => ({ ...d, phone: e.target.value }))} placeholder="+7 ___ ___ __ __" />
            </div>
          </div>
          <div>
            <label className={LABEL}>Email</label>
            <input className={INPUT} value={data.email} onChange={e => setData(d => ({ ...d, email: e.target.value }))} />
          </div>
          <div>
            <label className={LABEL}>{l('Адрес', 'Мекенжай', 'Address')}</label>
            <input className={INPUT} value={data.address} onChange={e => setData(d => ({ ...d, address: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>{l('Категория', 'Санат', 'Category')}</label>
              <select className={INPUT} value={data.category} onChange={e => setData(d => ({ ...d, category: e.target.value }))}>
                <option value="">—</option>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>{l('Условия оплаты', 'Төлем шарттары', 'Payment terms')}</label>
              <select className={INPUT} value={data.paymentTerms} onChange={e => setData(d => ({ ...d, paymentTerms: e.target.value }))}>
                <option value="100% предоплата">100% предоплата</option>
                <option value="50/50">50/50</option>
                <option value="Отсрочка 7 дн.">Отсрочка 7 дн.</option>
                <option value="Отсрочка 14 дн.">Отсрочка 14 дн.</option>
                <option value="Отсрочка 30 дн.">Отсрочка 30 дн.</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>{l('Срок доставки (дн.)', 'Жеткізу мерзімі', 'Delivery (days)')}</label>
              <input type="number" min={0} className={INPUT} value={data.deliveryDays || 0} onChange={e => setData(d => ({ ...d, deliveryDays: Number(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className={LABEL}>{l('Рейтинг 1-5', 'Рейтинг 1-5', 'Rating 1-5')}</label>
              <input type="number" min={1} max={5} step={0.5} className={INPUT} value={data.rating || 5} onChange={e => setData(d => ({ ...d, rating: Number(e.target.value) || 5 }))} />
            </div>
          </div>
          <div>
            <label className={LABEL}>{l('Заметки', 'Жазбалар', 'Notes')}</label>
            <textarea rows={3} className={`${INPUT} resize-none`} value={data.notes} onChange={e => setData(d => ({ ...d, notes: e.target.value }))} placeholder={l('Особенности, договорённости...', 'Ерекшеліктер...', 'Anything special...')} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-white/60 flex items-center gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-white/60 ring-1 ring-white/60 text-slate-700 rounded-2xl text-xs hover:bg-white transition-colors">
            {l('Отмена', 'Бас тарту', 'Cancel')}
          </button>
          <button onClick={() => data.name && onSave(data)} disabled={!data.name} className="px-4 py-2 bg-emerald-600 disabled:opacity-40 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all">
            {l('Сохранить', 'Сақтау', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Purchase order modal (add / edit) ────────────────────────────
function PoModal({
  language, initial, suppliers, onClose, onSave,
}: {
  language: 'kz' | 'ru' | 'eng';
  initial: PurchaseOrder | null;
  suppliers: Supplier[];
  onClose: () => void;
  onSave: (p: Partial<PurchaseOrder>) => void;
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [data, setData] = useState<Partial<PurchaseOrder>>({
    supplierId: suppliers[0]?.id || '',
    items: [{ name: '', qty: 1, unit: 'шт', costPerUnit: 0 }],
    expectedDate: '',
    notes: '',
    ...(initial || {}),
  });
  const INPUT = 'w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all';
  const LABEL = 'block text-[11px] text-slate-500 mb-1.5';

  const items = data.items || [];
  const totalCost = items.reduce((s, it) => s + (it.qty || 0) * (it.costPerUnit || 0), 0);

  const updateItem = (i: number, patch: Partial<POItem>) => {
    setData(d => ({ ...d, items: (d.items || []).map((it, idx) => idx === i ? { ...it, ...patch } : it) }));
  };
  const addItem = () => setData(d => ({ ...d, items: [...(d.items || []), { name: '', qty: 1, unit: 'шт', costPerUnit: 0 }] }));
  const removeItem = (i: number) => setData(d => ({ ...d, items: (d.items || []).filter((_, idx) => idx !== i) }));

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white/85 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-[0_24px_64px_-12px_rgba(15,23,42,0.3)]">
        <div className="px-6 py-5 border-b border-white/60 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="text-[11px] text-slate-400 mb-1 tracking-widest uppercase">{l('Закупка', 'Сатып алу', 'Purchase order')}</div>
            <div className="text-lg text-slate-900 tracking-tight">
              {initial ? l('Редактировать', 'Өңдеу', 'Edit') : l('Новая закупка', 'Жаңа сатып алу', 'New PO')}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-2xl flex items-center justify-center">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>{l('Поставщик', 'Жеткізуші', 'Supplier')} *</label>
              <select className={INPUT} value={data.supplierId} onChange={e => setData(d => ({ ...d, supplierId: e.target.value }))}>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>{l('Ожидаемая дата', 'Күтілетін күн', 'Expected date')}</label>
              <input type="date" className={INPUT} value={data.expectedDate} onChange={e => setData(d => ({ ...d, expectedDate: e.target.value }))} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className={LABEL}>{l('Позиции', 'Позициялар', 'Items')}</div>
              <button onClick={addItem} className="text-[11px] text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
                <Plus className="w-3 h-3" /> {l('Добавить позицию', 'Позиция қосу', 'Add item')}
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-white/40 ring-1 ring-white/60 rounded-2xl p-2">
                  <input className={`${INPUT} col-span-5`} placeholder={l('Материал', 'Материал', 'Material')} value={it.name} onChange={e => updateItem(i, { name: e.target.value })} />
                  <input type="number" min={0} step={0.1} className={`${INPUT} col-span-2`} placeholder={l('Кол.', 'Саны', 'Qty')} value={it.qty} onChange={e => updateItem(i, { qty: Number(e.target.value) || 0 })} />
                  <input className={`${INPUT} col-span-2`} placeholder={l('Ед.', 'Бір.', 'Unit')} value={it.unit} onChange={e => updateItem(i, { unit: e.target.value })} />
                  <input type="number" min={0} className={`${INPUT} col-span-2`} placeholder="₸/ед." value={it.costPerUnit} onChange={e => updateItem(i, { costPerUnit: Number(e.target.value) || 0 })} />
                  <button onClick={() => removeItem(i)} className="col-span-1 p-1.5 hover:bg-rose-100/70 rounded-xl transition-colors text-rose-500" title={l('Удалить', 'Жою', 'Remove')}>
                    <X className="w-3.5 h-3.5 mx-auto" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className={LABEL}>{l('Заметки', 'Жазбалар', 'Notes')}</label>
            <textarea rows={2} className={`${INPUT} resize-none`} value={data.notes} onChange={e => setData(d => ({ ...d, notes: e.target.value }))} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-white/60 flex items-center gap-2 justify-between flex-shrink-0">
          <div className="text-sm text-slate-900 tabular-nums">
            {l('Итого:', 'Барлығы:', 'Total:')} <b>{Math.round(totalCost).toLocaleString('ru-RU')} ₸</b>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-white/60 ring-1 ring-white/60 text-slate-700 rounded-2xl text-xs hover:bg-white transition-colors">
              {l('Отмена', 'Бас тарту', 'Cancel')}
            </button>
            <button
              onClick={() => data.supplierId && onSave({ ...data, totalCost })}
              disabled={!data.supplierId || items.length === 0 || !items.some(it => it.name.trim())}
              className="px-4 py-2 bg-emerald-600 disabled:opacity-40 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
            >
              {l('Сохранить', 'Сақтау', 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Material consumption modal ──────────────────────────────────
// «Списать материалы» picker for a specific production order. Lists
// every stock product with a per-row qty input, plus a search box
// since teams with 100+ SKUs need filtering. Saves all non-zero qty
// rows in one go, then closes.
function ConsumeMaterialsModal({
  language, order, products, onClose, onSave,
}: {
  language: 'kz' | 'ru' | 'eng';
  order: { dealId: string; name: string; client: string };
  products: Product[];
  onClose: () => void;
  onSave: (picks: { product: Product; qty: number }[]) => void;
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [q, setQ] = useState('');
  const [picks, setPicks] = useState<Record<string, number>>({});
  const filtered = products.filter(p =>
    p.quantity > 0 && (!q.trim() || (p.name + ' ' + p.category).toLowerCase().includes(q.toLowerCase())),
  );
  const INPUT = 'px-2 py-1.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-xs focus:outline-none focus:bg-white focus:ring-slate-300 transition-all w-20 text-center';
  const totalCost = filtered.reduce((s, p) => s + ((picks[p.id] || 0) * p.cost), 0);
  const totalRows = Object.values(picks).filter(v => v > 0).length;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white/85 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-[0_24px_64px_-12px_rgba(15,23,42,0.3)]">
        <div className="px-6 py-5 border-b border-white/60 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] text-slate-400 mb-1 tracking-widest uppercase">{l('Расход материалов', 'Материал шығыны', 'Material consumption')}</div>
            <div className="text-base text-slate-900 tracking-tight truncate">{order.name}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{order.client}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-2xl flex items-center justify-center flex-shrink-0">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="px-6 pt-4 pb-2 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={l('Поиск по складу...', 'Қойма іздеу...', 'Search stock...')}
              className="w-full pl-9 pr-3 py-2 bg-white/60 ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-1.5">
          {filtered.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-10">
              {q ? l('Не найдено', 'Табылмады', 'Not found') : l('Склад пуст — сначала добавьте материалы', 'Қойма бос — алдымен материал қосыңыз', 'Stock empty — add materials first')}
            </div>
          ) : filtered.map(p => {
            const picked = picks[p.id] || 0;
            const over = picked > p.quantity;
            return (
              <div key={p.id} className={`flex items-center gap-3 bg-white/40 ring-1 ring-white/60 rounded-2xl px-3 py-2 ${over ? 'ring-rose-200/80' : ''}`}>
                <div className="w-8 h-8 bg-white/60 ring-1 ring-white/60 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Package className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-900 truncate">{p.name}</div>
                  <div className="text-[10px] text-slate-500 flex items-center gap-2">
                    <span>{p.category}</span>
                    <span>· {p.quantity} {p.unit} {l('в наличии', 'қолда', 'in stock')}</span>
                    <span>· {p.cost.toLocaleString('ru-RU')} ₸/{p.unit}</span>
                  </div>
                </div>
                <input
                  type="number"
                  min={0}
                  max={p.quantity}
                  step={0.5}
                  value={picked || ''}
                  placeholder="0"
                  onChange={e => setPicks(prev => ({ ...prev, [p.id]: Number(e.target.value) || 0 }))}
                  className={`${INPUT} flex-shrink-0`}
                />
                <span className="text-[10px] text-slate-500 w-8 flex-shrink-0">{p.unit}</span>
                <div className="text-[11px] text-slate-700 tabular-nums w-20 text-right flex-shrink-0">
                  {picked > 0 ? `${Math.round(picked * p.cost).toLocaleString('ru-RU')} ₸` : '—'}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-white/60 flex items-center justify-between flex-shrink-0">
          <div className="text-sm text-slate-700">
            <span className="text-slate-500">{l('Позиций:', 'Позиция:', 'Items:')}</span> <b className="tabular-nums">{totalRows}</b>
            <span className="ml-3 text-slate-500">{l('Сумма:', 'Сома:', 'Total:')}</span> <b className="tabular-nums">{Math.round(totalCost).toLocaleString('ru-RU')} ₸</b>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-white/60 ring-1 ring-white/60 text-slate-700 rounded-2xl text-xs hover:bg-white transition-colors">
              {l('Отмена', 'Бас тарту', 'Cancel')}
            </button>
            <button
              onClick={() => onSave(filtered.filter(p => (picks[p.id] || 0) > 0).map(p => ({ product: p, qty: picks[p.id] })))}
              disabled={totalRows === 0}
              className="px-4 py-2 bg-emerald-600 disabled:opacity-40 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
            >
              {l('Списать', 'Жазу', 'Deduct')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Reports view ─────────────────────────────────────────────────
// Production-level analytics surfaced from data we already have:
//   • Supplier spend — sum totalCost of POs (received / sent), ranked.
//   • Top consumed materials — aggregate ConsumedMaterial across all
//     deals, by productName, with qty + cost.
//   • Material share of deal cost — sum(consumed cost) / sum(amount)
//     for completed deals → % of revenue absorbed by raw materials.
//   • Monthly purchase trend — last 6 months of PO spend.
// All inferred locally — no extra API calls.
function ReportsView({
  language, deals, purchaseOrders, suppliers,
}: {
  language: 'kz' | 'ru' | 'eng';
  deals: any[];
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

  // ── Supplier spend ranking ──
  // Only count POs that have actually moved past draft (sent/received).
  const supplierSpend = useMemo(() => {
    const map = new Map<string, { name: string; total: number; orders: number }>();
    for (const po of purchaseOrders) {
      if (po.status === 'draft' || po.status === 'cancelled') continue;
      const sup = suppliers.find(s => s.id === po.supplierId);
      const name = sup?.name || l('Без поставщика', 'Жеткізушісіз', 'No supplier');
      const prev = map.get(po.supplierId) || { name, total: 0, orders: 0 };
      prev.total += po.totalCost || 0;
      prev.orders += 1;
      map.set(po.supplierId, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [purchaseOrders, suppliers, language]);

  // ── Top consumed materials ──
  const topMaterials = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; unit: string; cost: number }>();
    for (const d of deals) {
      const consumed: ConsumedMaterial[] = (d as any).consumed || [];
      for (const c of consumed) {
        const prev = map.get(c.productName) || { name: c.productName, qty: 0, unit: c.unit, cost: 0 };
        prev.qty += c.qty;
        prev.cost += c.qty * c.costPerUnit;
        map.set(c.productName, prev);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }, [deals]);

  // ── Material share of revenue (completed deals only) ──
  const costShare = useMemo(() => {
    let revenue = 0;
    let materialCost = 0;
    let dealsWithConsumption = 0;
    for (const d of deals) {
      if (d.status !== 'completed') continue;
      revenue += d.amount || 0;
      const consumed: ConsumedMaterial[] = (d as any).consumed || [];
      const dealCost = consumed.reduce((s, c) => s + c.qty * c.costPerUnit, 0);
      if (dealCost > 0) dealsWithConsumption += 1;
      materialCost += dealCost;
    }
    const sharePct = revenue > 0 ? (materialCost / revenue) * 100 : 0;
    return { revenue, materialCost, sharePct, dealsWithConsumption };
  }, [deals]);

  // ── Monthly PO trend (last 6 months) ──
  const monthlyTrend = useMemo(() => {
    const months: { key: string; label: string; total: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('ru-RU', { month: 'short' });
      months.push({ key, label, total: 0 });
    }
    for (const po of purchaseOrders) {
      if (po.status === 'cancelled') continue;
      const created = po.createdAt ? new Date(po.createdAt) : null;
      if (!created || isNaN(created.getTime())) continue;
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
      const slot = months.find(m => m.key === key);
      if (slot) slot.total += po.totalCost || 0;
    }
    return months;
  }, [purchaseOrders]);

  const maxMonthly = Math.max(1, ...monthlyTrend.map(m => m.total));
  const totalSpend = supplierSpend.reduce((s, x) => s + x.total, 0);
  const maxSupplier = Math.max(1, ...supplierSpend.map(x => x.total));
  const maxMaterial = Math.max(1, ...topMaterials.map(x => x.cost));

  const hasAnyData = supplierSpend.length > 0 || topMaterials.length > 0 || costShare.revenue > 0;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-2xl p-3.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">{l('Расход на закупки', 'Сатып алу шығыны', 'Purchase spend')}</div>
          <div className="text-lg text-slate-900 tabular-nums">{fmt(totalSpend)} <span className="text-slate-300 text-sm">₸</span></div>
          <div className="text-[10px] text-slate-400 mt-1">{purchaseOrders.filter(p => p.status !== 'draft' && p.status !== 'cancelled').length} {l('заказов', 'тапсырыс', 'orders')}</div>
        </div>
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-2xl p-3.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">{l('Расход материалов', 'Материал шығыны', 'Material cost')}</div>
          <div className="text-lg text-slate-900 tabular-nums">{fmt(costShare.materialCost)} <span className="text-slate-300 text-sm">₸</span></div>
          <div className="text-[10px] text-slate-400 mt-1">{costShare.dealsWithConsumption} {l('сделок', 'мәміле', 'deals')}</div>
        </div>
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-2xl p-3.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">{l('Доля материалов', 'Материал үлесі', 'Material share')}</div>
          <div className="text-lg text-slate-900 tabular-nums">{costShare.sharePct.toFixed(1)}<span className="text-slate-300 text-sm">%</span></div>
          <div className="text-[10px] text-slate-400 mt-1">{l('от выручки', 'кірістен', 'of revenue')}</div>
        </div>
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-2xl p-3.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">{l('Поставщиков активно', 'Белсенді жеткізушілер', 'Active suppliers')}</div>
          <div className="text-lg text-slate-900 tabular-nums">{supplierSpend.length}<span className="text-slate-300 text-sm"> / {suppliers.length}</span></div>
          <div className="text-[10px] text-slate-400 mt-1">{l('были заказы', 'тапсырыс болды', 'with orders')}</div>
        </div>
      </div>

      {!hasAnyData ? (
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-3xl p-12 text-center text-xs text-slate-500 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)]">
          <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          {l('Данных пока нет — оформите первую закупку или спишите материал на сделку.',
             'Деректер әлі жоқ — алғашқы сатып алуды рәсімдеңіз немесе материалды мәмілеге жазыңыз.',
             'No data yet — record your first purchase or deduct materials to a deal.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Supplier spend ranking */}
          <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-2xl p-4 shadow-[0_4px_16px_-8px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-700">{l('Топ поставщиков по расходу', 'Шығын бойынша топ жеткізушілер', 'Top suppliers by spend')}</span>
              </div>
              <span className="text-[10px] text-slate-400">{supplierSpend.length}</span>
            </div>
            {supplierSpend.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-slate-400">{l('Нет данных', 'Деректер жоқ', 'No data')}</div>
            ) : (
              <div className="space-y-2">
                {supplierSpend.slice(0, 6).map((s, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-700 truncate flex-1 min-w-0">{s.name}</span>
                      <span className="text-slate-500 tabular-nums flex-shrink-0 ml-2">{fmt(s.total)} ₸ <span className="text-slate-300">· {s.orders}</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/40 ring-1 ring-white/60 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[var(--accent-500)] to-[var(--accent-600)] rounded-full transition-all"
                        style={{ width: `${(s.total / maxSupplier) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top materials by consumption */}
          <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-2xl p-4 shadow-[0_4px_16px_-8px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-700">{l('Топ материалов по расходу', 'Шығын бойынша топ материалдар', 'Top consumed materials')}</span>
              </div>
              <span className="text-[10px] text-slate-400">{topMaterials.length}</span>
            </div>
            {topMaterials.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-slate-400">{l('Нет списаний', 'Жазулар жоқ', 'No deductions')}</div>
            ) : (
              <div className="space-y-2">
                {topMaterials.slice(0, 6).map((m, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-700 truncate flex-1 min-w-0">{m.name}</span>
                      <span className="text-slate-500 tabular-nums flex-shrink-0 ml-2">{fmt(m.cost)} ₸ <span className="text-slate-300">· {fmt(m.qty)} {m.unit}</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/40 ring-1 ring-white/60 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-all"
                        style={{ width: `${(m.cost / maxMaterial) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Monthly purchase trend */}
          <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-2xl p-4 shadow-[0_4px_16px_-8px_rgba(15,23,42,0.08)] lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-700">{l('Закупки по месяцам', 'Айлар бойынша сатып алу', 'Purchases by month')}</span>
              </div>
              <span className="text-[10px] text-slate-400">{l('последние 6', 'соңғы 6', 'last 6')}</span>
            </div>
            <div className="flex items-end gap-2 h-32">
              {monthlyTrend.map((m, i) => {
                const h = m.total > 0 ? Math.max(4, (m.total / maxMonthly) * 100) : 2;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                    <div className="text-[10px] text-slate-500 tabular-nums truncate w-full text-center">{m.total > 0 ? fmt(m.total) : ''}</div>
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full bg-gradient-to-t from-[var(--accent-600)] to-[var(--accent-400)] rounded-t-lg ring-1 ring-white/40 transition-all"
                        style={{ height: `${h}%`, opacity: m.total > 0 ? 1 : 0.25 }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 capitalize">{m.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
