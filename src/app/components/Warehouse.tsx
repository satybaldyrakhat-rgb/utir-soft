import { useState, useEffect, useMemo } from 'react';
import { Package, TrendingUp, AlertTriangle, ShoppingCart, Wrench, Users, Clock, CheckCircle, Plus, X, Search, Edit2, Eye, Truck, Calendar, BarChart3, ArrowUpDown, MapPin, FileText, Trash2, Loader2, Copy, PlayCircle, PauseCircle, Download } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';
import { Calculator } from './Calculator';
import { api } from '../utils/api';

interface Product {
  id: string; name: string; category: string; quantity: number; unit: string; supplier: string; cost: number; status: 'instock' | 'low' | 'outofstock'; minQty: number;
}

interface ProdOrder {
  id: number; dealId: string; name: string; client: string; master: string;
  daysLeft: number; progress: number; status: 'working' | 'done' | 'started' | 'paused';
  start: string; end: string; materials: string[];
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
  const [activeView, setActiveView] = useState<'materials' | 'production' | 'bom' | 'calculator' | 'nesting' | 'suppliers' | 'purchases'>('production');
  const [selectedCategory, setSelectedCategory] = useState('Все');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ProdOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newProduct, setNewProduct] = useState({ name: '', category: 'Плиты', quantity: 0, unit: 'лист', supplier: '', cost: 0 });

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
    if (activeView === 'suppliers' || activeView === 'purchases') {
      api.get<Supplier[]>('/api/suppliers').then(setSuppliers).catch(() => { /* ignore */ });
    }
    if (activeView === 'purchases') {
      api.get<PurchaseOrder[]>('/api/purchase-orders').then(setPurchaseOrders).catch(() => { /* ignore */ });
    }
  }, [activeView]);

  const flash = (msg: string) => { setSupplierFlash(msg); setTimeout(() => setSupplierFlash(''), 1800); };

  async function saveSupplier(s: Partial<Supplier>) {
    try {
      if (editingSupplier?.id) {
        const updated = await api.patch<Supplier>(`/api/suppliers/${editingSupplier.id}`, s);
        setSuppliers(prev => prev.map(x => x.id === editingSupplier.id ? updated : x));
      } else {
        const created = await api.post<Supplier>('/api/suppliers', s);
        setSuppliers(prev => [created, ...prev]);
      }
      setShowSupplierModal(false);
      setEditingSupplier(null);
      flash(l('Поставщик сохранён', 'Жеткізуші сақталды', 'Supplier saved'));
    } catch (e: any) {
      flash(l('Ошибка: ', 'Қате: ', 'Error: ') + (e?.message || e));
    }
  }

  async function deleteSupplier(id: string) {
    if (!confirm(l('Удалить поставщика?', 'Жеткізушіні жою?', 'Delete supplier?'))) return;
    try {
      await api.delete(`/api/suppliers/${id}`);
      setSuppliers(prev => prev.filter(x => x.id !== id));
      flash(l('Поставщик удалён', 'Жойылды', 'Deleted'));
    } catch { /* ignore */ }
  }

  async function savePo(po: Partial<PurchaseOrder>) {
    try {
      if (editingPo?.id) {
        const updated = await api.patch<PurchaseOrder>(`/api/purchase-orders/${editingPo.id}`, po);
        setPurchaseOrders(prev => prev.map(x => x.id === editingPo.id ? updated : x));
      } else {
        const created = await api.post<PurchaseOrder>('/api/purchase-orders', { ...po, status: 'draft' });
        setPurchaseOrders(prev => [created, ...prev]);
      }
      setShowPoModal(false);
      setEditingPo(null);
      flash(l('Закупка сохранена', 'Сатып алу сақталды', 'PO saved'));
    } catch (e: any) {
      flash(l('Ошибка: ', 'Қате: ', 'Error: ') + (e?.message || e));
    }
  }

  async function updatePoStatus(id: string, status: PurchaseOrder['status']) {
    const patch: Partial<PurchaseOrder> = { status };
    if (status === 'received') patch.receivedDate = new Date().toISOString().slice(0, 10);
    try {
      const updated = await api.patch<PurchaseOrder>(`/api/purchase-orders/${id}`, patch);
      setPurchaseOrders(prev => prev.map(x => x.id === id ? updated : x));
    } catch { /* ignore */ }
  }

  async function deletePo(id: string) {
    if (!confirm(l('Удалить закупку?', 'Сатып алуды жою?', 'Delete PO?'))) return;
    try {
      await api.delete(`/api/purchase-orders/${id}`);
      setPurchaseOrders(prev => prev.filter(x => x.id !== id));
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
  const prodOrders: ProdOrder[] = store.deals
    .filter(d => ['production', 'assembly', 'contract', 'project-agreed', 'manufacturing', 'installation', 'measured'].includes(d.status))
    .map((d, i) => ({
      id: i + 1, dealId: d.id,
      name: d.product, client: d.customerName.split(' ')[0] + ' ' + (d.customerName.split(' ')[1]?.[0] || '') + '.',
      master: d.measurer || 'Не назначен',
      daysLeft: d.completionDate ? Math.max(0, Math.ceil((new Date(d.completionDate).getTime() - Date.now()) / 86400000)) : 0,
      progress: d.progress,
      status: d.progress >= 100 ? 'done' as const : d.progress > 50 ? 'working' as const : d.progress > 0 ? 'started' as const : 'paused' as const,
      start: d.measurementDate || d.date, end: d.completionDate || '',
      materials: d.materials ? d.materials.split(', ').slice(0, 3) : [],
    }));

  // Production order actions — update the underlying deal's progress so the
  // status badge moves accordingly. Status mapping:
  //   start (0%) → started   (set progress=10)
  //   working    (10-99%)     (set progress=60)
  //   pause      → paused     (set progress=0)
  //   done       → done       (set progress=100, status='completed')
  async function setOrderState(order: ProdOrder, target: 'started' | 'working' | 'paused' | 'done') {
    const patch: any =
      target === 'done'    ? { progress: 100, status: 'completed' } :
      target === 'paused'  ? { progress: 0 } :
      target === 'working' ? { progress: Math.max(60, order.progress) } :
                              { progress: Math.max(10, order.progress) };
    try { await store.updateDeal(order.dealId, patch); }
    catch (e: any) { alert('Не удалось обновить заказ: ' + (e?.message || e)); }
  }

  const categories = ['Все', ...new Set(store.products.map(p => p.category))];
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  const filtered = products
    .filter(p => selectedCategory === 'Все' || p.category === selectedCategory)
    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const totalValue = products.reduce((s, p) => s + p.quantity * p.cost, 0);
  const lowCount = products.filter(p => p.status === 'low').length;
  const outCount = products.filter(p => p.status === 'outofstock').length;
  const activeOrders = prodOrders.filter(o => o.status !== 'done').length;

  const handleAdd = () => {
    if (newProduct.name && newProduct.supplier && newProduct.cost > 0) {
      store.addProduct({ ...newProduct, status: newProduct.quantity > 20 ? 'instock' : newProduct.quantity > 0 ? 'low' : 'outofstock', minQty: 10 });
      setNewProduct({ name: '', category: 'Плиты', quantity: 0, unit: 'лист', supplier: '', cost: 0 }); setShowAddModal(false);
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
          <p className="text-[11px] text-slate-400 mb-1 tracking-widest uppercase">{l('Производство', 'Өндірі', 'Production')}</p>
          <h1 className="text-slate-900 text-2xl md:text-3xl font-medium tracking-tight">{l('Производство и склад', 'Өндіріс және қойма', 'Production & Warehouse')}</h1>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setActiveView('production')} className={`px-3.5 py-2 rounded-2xl text-xs whitespace-nowrap ring-1 transition-all ${activeView === 'production' ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]' : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'}`}>{l('Заказы', 'Тапсырыстар', 'Orders')}</button>
            <button onClick={() => setActiveView('bom')} className={`px-3.5 py-2 rounded-2xl text-xs whitespace-nowrap ring-1 transition-all ${activeView === 'bom' ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]' : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'}`}>{l('BOM', 'BOM', 'BOM')}</button>
            <button onClick={() => setActiveView('calculator')} className={`px-3.5 py-2 rounded-2xl text-xs whitespace-nowrap ring-1 transition-all ${activeView === 'calculator' ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]' : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'}`}>{l('Калькулятор', 'Калькулятор', 'Calculator')}</button>
            <button onClick={() => setActiveView('nesting')} className={`px-3.5 py-2 rounded-2xl text-xs whitespace-nowrap ring-1 transition-all ${activeView === 'nesting' ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]' : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'}`}>{l('Раскрой', 'Раскрой', 'Nesting')}</button>
            <button onClick={() => setActiveView('materials')} className={`px-3.5 py-2 rounded-2xl text-xs whitespace-nowrap ring-1 transition-all ${activeView === 'materials' ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]' : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'}`}>{l('Склад', 'Қойма', 'Warehouse')}</button>
            <button onClick={() => setActiveView('suppliers')} className={`px-3.5 py-2 rounded-2xl text-xs whitespace-nowrap ring-1 transition-all ${activeView === 'suppliers' ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]' : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'}`}>{l('Поставщики', 'Жеткізушілер', 'Suppliers')}</button>
            <button onClick={() => setActiveView('purchases')} className={`px-3.5 py-2 rounded-2xl text-xs whitespace-nowrap ring-1 transition-all ${activeView === 'purchases' ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]' : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'}`}>{l('Закупки', 'Сатып алулар', 'Purchases')}</button>
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all">
            <Plus className="w-3.5 h-3.5" />{l('Добавить', 'Қосу', 'Add')}
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
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
      {activeView === 'production' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-900">{l('Заказы в производстве', 'Өндірістегі тапсырыстар', 'Production Orders')}</div>
            <span className="text-[10px] text-slate-400">{prodOrders.length} {l('всего', 'барлығы', 'total')}</span>
          </div>

          {/* Order Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {prodOrders.map(o => {
              const conf = orderConf(o.status);
              const Icon = conf.icon;
              return (
                <div key={o.id} onClick={() => setSelectedOrder(o)} className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-4 hover:shadow-sm transition-all cursor-pointer group">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900">{o.name}</span>
                      <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg ${conf.color}`}><Icon className="w-3 h-3" />{conf.label}</span>
                    </div>
                    <span className="text-[10px] text-slate-400">#{o.id}</span>
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
                    {o.materials.map((m, i) => <span key={i} className="text-[9px] px-1.5 py-0.5 bg-gray-50 text-slate-400 rounded">{m}</span>)}
                  </div>

                  {/* Progress */}
                  <div>
                    <div className="flex justify-between text-[9px] mb-1"><span className="text-slate-400">{l('Прогресс', 'Прогресс', 'Progress')}</span><span className="text-gray-900">{o.progress}%</span></div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${conf.bar} rounded-full transition-all`} style={{ width: `${o.progress}%` }} /></div>
                  </div>

                  {/* Action buttons — stop propagation so they don't open
                       the order details modal at the same time. Each one
                       calls the underlying deal API (see setOrderState). */}
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
                    {o.status !== 'done' && o.status !== 'paused' && (
                      <button onClick={() => setOrderState(o, 'paused')} className="inline-flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 bg-gray-50 text-slate-700 border border-gray-100 rounded-lg hover:bg-white/70">
                        <PauseCircle className="w-3 h-3" /> {l('Пауза', 'Пауза', 'Pause')}
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
            {prodOrders.length === 0 && (
              <div className="md:col-span-2 bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-10 text-center">
                <Wrench className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <div className="text-sm text-slate-900 mb-1">{l('Нет заказов в производстве', 'Өндірісте тапсырыс жоқ', 'No production orders')}</div>
                <div className="text-xs text-slate-400">{l('Переведите сделку в статус «Производство» / «Сборка» — она появится здесь', 'Мәмілені «Өндіріс» / «Жинау» күйіне ауыстырыңыз — осында пайда болады', 'Move a deal to «Production» status to see it here')}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== MATERIALS VIEW ===== */}
      {activeView === 'materials' && (
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
              <button
                onClick={triggerPurchaseForAll}
                className="text-[11px] px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-xl ring-1 ring-amber-200/40 transition-colors flex-shrink-0"
              >
                {l('Создать закупку →', 'Сатып алу жасау →', 'Create PO →')}
              </button>
            </div>
          )}

          {/* Search + Filters */}
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
                      {p.quantity < p.minQty && p.quantity > 0 && <div className="text-[9px] text-yellow-500">min: {p.minQty}</div>}
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
      )}

      {/* ===== BOM (Спецификации изделий) ===== */}
      {activeView === 'bom' && (
        <BomTemplates language={language} />
      )}

      {/* ===== Калькулятор стоимости ===== */}
      {activeView === 'calculator' && <Calculator language={language} />}

      {/* ===== Раскрой (Nesting) ===== */}
      {activeView === 'nesting' && (
        <NestingView language={language} prodOrders={prodOrders} deals={store.deals} />
      )}

      {/* ===== Поставщики ===== */}
      {activeView === 'suppliers' && (
        <SuppliersView
          language={language}
          suppliers={suppliers}
          onAdd={() => { setEditingSupplier(null); setShowSupplierModal(true); }}
          onEdit={(s) => { setEditingSupplier(s); setShowSupplierModal(true); }}
          onDelete={deleteSupplier}
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

      {/* ===== MODALS ===== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/60 flex items-center justify-between">
              <span className="text-sm text-gray-900">{l('Добавить материал', 'Материал қосу', 'Add Material')}</span>
              <button onClick={() => setShowAddModal(false)} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <ModalInput label={l('Название', 'Атауы', 'Name')} value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: (e.target as HTMLInputElement).value })} placeholder="ЛДСП White" />
              <div><label className="block text-[11px] text-slate-400 mb-1">{l('Категория', 'Санат', 'Category')}</label><select value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none">{categories.filter(c => c !== 'Все').map(c => <option key={c}>{c}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <ModalInput label={l('Кол-во', 'Саны', 'Qty')} type="number" value={String(newProduct.quantity)} onChange={e => setNewProduct({ ...newProduct, quantity: Number((e.target as HTMLInputElement).value) })} />
                <div><label className="block text-[11px] text-slate-400 mb-1">{l('Ед.', 'Бірл.', 'Unit')}</label><select value={newProduct.unit} onChange={e => setNewProduct({ ...newProduct, unit: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none"><option value="лист">{l('лист', 'парақ', 'sheet')}</option><option value="шт">{l('шт', 'дана', 'pcs')}</option><option value="м">м</option><option value="пара">{l('пара', 'жұп', 'pair')}</option></select></div>
              </div>
              <ModalInput label={l('Поставщик', 'Жеткізуші', 'Supplier')} value={newProduct.supplier} onChange={e => setNewProduct({ ...newProduct, supplier: (e.target as HTMLInputElement).value })} />
              <ModalInput label={l('Цена (₸)', 'Бағасы (₸)', 'Price (₸)')} type="number" value={String(newProduct.cost)} onChange={e => setNewProduct({ ...newProduct, cost: Number((e.target as HTMLInputElement).value) })} />
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
      furnitureType: TYPE_LABELS[t.type] || t.type,
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
          onClick={() => setEditing(blankTemplate())}
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
          <button onClick={() => setEditing(blankTemplate())} className="px-4 py-2 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all inline-flex items-center gap-1.5">
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
                  <span className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 bg-white/80 rounded text-gray-600">{TYPE_LABELS[t.type] || t.type}</span>
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
        />
      )}
    </div>
  );
}

function blankTemplate(): BomTemplate {
  return {
    name: '', type: 'kitchen',
    width: 3000, height: 900, depth: 600,
    materials: [{ mat: '', sup: '', qty: 1, unit: 'шт', price: 0 }],
    labourCost: 0, markupPct: 30, leadDays: 14,
  };
}

function BomEditorModal({ initial, onClose, onSave, busy, language }: {
  initial: BomTemplate; onClose: () => void; onSave: (t: BomTemplate) => void; busy: boolean; language: 'kz' | 'ru' | 'eng';
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
    if (!t.name.trim()) { alert('Укажите название шаблона'); return; }
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
                {TYPE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.ru}</option>)}
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
              <div className="grid grid-cols-12 gap-1 px-2 py-1.5 bg-gray-50 text-[9px] text-slate-400 uppercase tracking-wide">
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
                  <div className="text-[9px] text-slate-400">{p.sizeMm} мм</div>
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
  language, suppliers, onAdd, onEdit, onDelete,
}: {
  language: 'kz' | 'ru' | 'eng';
  suppliers: Supplier[];
  onAdd: () => void;
  onEdit: (s: Supplier) => void;
  onDelete: (id: string) => void;
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

      {/* Search + add */}
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
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          {l('Добавить поставщика', 'Жеткізуші қосу', 'Add supplier')}
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-3xl p-12 text-center text-xs text-slate-500 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)]">
          {q ? l('Ничего не найдено', 'Ештеңе табылмады', 'Nothing found')
             : l('Пока нет поставщиков — добавьте первого', 'Жеткізушілер жоқ — біріншісін қосыңыз', 'No suppliers yet — add your first')}
        </div>
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
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => onEdit(s)} className="p-1.5 hover:bg-white/70 ring-1 ring-transparent hover:ring-white/60 rounded-xl transition-all" title={l('Редактировать', 'Өңдеу', 'Edit')}>
                    <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                  <button onClick={() => onDelete(s.id)} className="p-1.5 hover:bg-rose-100/70 rounded-xl transition-colors" title={l('Удалить', 'Жою', 'Delete')}>
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  </button>
                </div>
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
                      <span className={`text-[9px] px-2 py-0.5 rounded-full ring-1 ${meta.cls}`}>
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
function SupplierModal({
  language, initial, onClose, onSave,
}: {
  language: 'kz' | 'ru' | 'eng';
  initial: Supplier | null;
  onClose: () => void;
  onSave: (s: Partial<Supplier>) => void;
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
                <option>Плиты ЛДСП/МДФ</option>
                <option>Фурнитура</option>
                <option>Кромка</option>
                <option>Краска/Лак</option>
                <option>Стекло</option>
                <option>Освещение</option>
                <option>Прочее</option>
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
