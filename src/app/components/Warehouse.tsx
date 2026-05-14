import { useState } from 'react';
import { Package, TrendingUp, AlertTriangle, ShoppingCart, Wrench, Users, Clock, CheckCircle, Plus, X, Search, Edit2, Eye, Truck, Calendar, BarChart3, ArrowUpDown, MapPin, FileText } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';
import { Calculator } from './Calculator';

interface Product {
  id: string; name: string; category: string; quantity: number; unit: string; supplier: string; cost: number; status: 'instock' | 'low' | 'outofstock'; minQty: number;
}

interface ProdOrder {
  id: number; name: string; client: string; master: string; daysLeft: number; progress: number; status: 'working' | 'done' | 'started' | 'paused'; start: string; end: string; materials: string[];
}

const mockProducts: Product[] = [
  { id: '1', name: 'ЛДСП Egger White', category: 'Плиты', quantity: 45, unit: 'лист', supplier: 'ТОО КазДСП', cost: 18000, status: 'instock', minQty: 10 },
  { id: '2', name: 'Фурнитура Blum Aventos', category: 'Фурнитура', quantity: 12, unit: 'шт', supplier: 'Blum KZ', cost: 45000, status: 'low', minQty: 20 },
  { id: '3', name: 'Кромка ПВХ 2мм', category: 'Кромка', quantity: 150, unit: 'м', supplier: 'ИП Кромка Люкс', cost: 350, status: 'instock', minQty: 50 },
  { id: '4', name: 'Столешница камень', category: 'Столешницы', quantity: 3, unit: 'шт', supplier: 'Stone Art', cost: 85000, status: 'low', minQty: 5 },
  { id: '5', name: 'МДФ фасады глянец', category: 'Фасады', quantity: 0, unit: 'шт', supplier: 'МДФ Мастер', cost: 12000, status: 'outofstock', minQty: 15 },
  { id: '6', name: 'Направляющие Hettich', category: 'Фурнитура', quantity: 65, unit: 'пара', supplier: 'Hettich KZ', cost: 2500, status: 'instock', minQty: 20 },
  { id: '7', name: 'Петли Blum накладные', category: 'Фурнитура', quantity: 180, unit: 'шт', supplier: 'Blum KZ', cost: 850, status: 'instock', minQty: 50 },
  { id: '8', name: 'ЛДСП Kronospan Дуб', category: 'Плиты', quantity: 28, unit: 'лист', supplier: 'ТОО КазДСП', cost: 22000, status: 'instock', minQty: 10 },
  { id: '9', name: 'Ручки скоба 128мм', category: 'Фурнитура', quantity: 95, unit: 'шт', supplier: 'Hettich KZ', cost: 1200, status: 'instock', minQty: 30 },
];

const prodOrders: ProdOrder[] = [
  { id: 1, name: 'Кухня ЖК Expo', client: 'Айгерим К.', master: 'Алихан С.', daysLeft: 5, progress: 65, status: 'working', start: '22 мар', end: '3 апр', materials: ['ЛДСП Egger', 'Blum Aventos', 'Столешница камень'] },
  { id: 2, name: 'Шкаф-купе Алатау', client: 'Марат А.', master: 'Нұрлан М.', daysLeft: 0, progress: 100, status: 'done', start: '15 мар', end: '27 мар', materials: ['ЛДСП Kronospan', 'Hettich'] },
  { id: 3, name: 'Гардероб Коттедж', client: 'Динара О.', master: 'Ерлан Т.', daysLeft: 8, progress: 15, status: 'started', start: '26 мар', end: '6 апр', materials: ['МДФ фасады', 'Blum', 'Кромка ПВХ'] },
  { id: 4, name: 'Офис стол + стулья', client: 'Асет Ж.', master: 'Алихан С.', daysLeft: 12, progress: 5, status: 'paused', start: '1 апр', end: '10 апр', materials: ['ЛДСП Egger', 'Направляющие'] },
];

interface WarehouseProps { language: 'kz' | 'ru' | 'eng'; }

export function Warehouse({ language }: WarehouseProps) {
  const store = useDataStore();
  const [activeView, setActiveView] = useState<'materials' | 'production' | 'bom' | 'calculator' | 'nesting'>('production');
  const [selectedCategory, setSelectedCategory] = useState('Все');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ProdOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newProduct, setNewProduct] = useState({ name: '', category: 'Плиты', quantity: 0, unit: 'лист', supplier: '', cost: 0 });

  // Use store products
  const products = store.products;
  const setProducts = (fn: any) => {}; // removed

  // Build production orders from store deals
  const prodOrders: ProdOrder[] = store.deals
    .filter(d => ['production', 'assembly', 'contract', 'project-agreed'].includes(d.status))
    .map((d, i) => ({
      id: i + 1, name: d.product, client: d.customerName.split(' ')[0] + ' ' + (d.customerName.split(' ')[1]?.[0] || '') + '.', 
      master: d.measurer || 'Не назначен', daysLeft: d.completionDate ? Math.max(0, Math.ceil((new Date(d.completionDate).getTime() - Date.now()) / 86400000)) : 0,
      progress: d.progress, status: d.progress >= 100 ? 'done' as const : d.progress > 50 ? 'working' as const : d.progress > 0 ? 'started' as const : 'paused' as const,
      start: d.measurementDate || d.date, end: d.completionDate || '', materials: d.materials ? d.materials.split(', ').slice(0, 3) : [],
    }));

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
    <div><label className="block text-[11px] text-gray-400 mb-1">{label}</label><input className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" {...props} /></div>
  );

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">{l('Производство', 'Өндірі', 'Production')}</p>
          <h1 className="text-gray-900">{l('Производство и склад', 'Өндіріс және қойма', 'Production & Warehouse')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-50 p-0.5 rounded-xl overflow-x-auto">
            <button onClick={() => setActiveView('production')} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all ${activeView === 'production' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>{l('Заказы', 'Тапсырыстар', 'Orders')}</button>
            <button onClick={() => setActiveView('bom')} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all ${activeView === 'bom' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>{l('BOM', 'BOM', 'BOM')}</button>
            <button onClick={() => setActiveView('calculator')} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all ${activeView === 'calculator' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>{l('Калькулятор', 'Калькулятор', 'Calculator')}</button>
            <button onClick={() => setActiveView('nesting')} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all ${activeView === 'nesting' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>{l('Раскрой', 'Раскрой', 'Nesting')}</button>
            <button onClick={() => setActiveView('materials')} className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all ${activeView === 'materials' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>{l('Склад', 'Қойма', 'Warehouse')}</button>
          </div>
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">
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
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-gray-400">{c.label}</span>
              <div className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><c.icon className="w-3.5 h-3.5 text-gray-400" /></div>
            </div>
            <div className={`text-lg mb-0.5 ${c.color || 'text-gray-900'}`}>{c.value}</div>
            <div className="text-[10px] text-gray-400">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ===== PRODUCTION VIEW ===== */}
      {activeView === 'production' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-900">{l('Заказы в производстве', 'Өндірістегі тапсырыстар', 'Production Orders')}</div>
            <span className="text-[10px] text-gray-400">{prodOrders.length} {l('всего', 'барлығы', 'total')}</span>
          </div>

          {/* Order Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {prodOrders.map(o => {
              const conf = orderConf(o.status);
              const Icon = conf.icon;
              return (
                <div key={o.id} onClick={() => setSelectedOrder(o)} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-sm transition-all cursor-pointer group">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900">{o.name}</span>
                      <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg ${conf.color}`}><Icon className="w-3 h-3" />{conf.label}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">#{o.id}</span>
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="flex items-center gap-1.5 text-[11px]"><Users className="w-3 h-3 text-gray-300" /><span className="text-gray-500">{o.client}</span></div>
                    <div className="flex items-center gap-1.5 text-[11px]"><Wrench className="w-3 h-3 text-gray-300" /><span className="text-gray-500">{o.master}</span></div>
                    <div className="flex items-center gap-1.5 text-[11px]"><Calendar className="w-3 h-3 text-gray-300" /><span className="text-gray-500">{o.start} → {o.end}</span></div>
                    <div className="flex items-center gap-1.5 text-[11px]"><Clock className="w-3 h-3 text-gray-300" /><span className={o.daysLeft === 0 ? 'text-green-500' : o.daysLeft <= 3 ? 'text-red-500' : 'text-gray-500'}>{o.daysLeft === 0 ? l('Готово', 'Дайын', 'Ready') : `${o.daysLeft} ${l('дней', 'күн', 'days')}`}</span></div>
                  </div>

                  {/* Materials */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {o.materials.map((m, i) => <span key={i} className="text-[9px] px-1.5 py-0.5 bg-gray-50 text-gray-400 rounded">{m}</span>)}
                  </div>

                  {/* Progress */}
                  <div>
                    <div className="flex justify-between text-[9px] mb-1"><span className="text-gray-400">{l('Прогресс', 'Прогресс', 'Progress')}</span><span className="text-gray-900">{o.progress}%</span></div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${conf.bar} rounded-full transition-all`} style={{ width: `${o.progress}%` }} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== MATERIALS VIEW ===== */}
      {activeView === 'materials' && (
        <div className="space-y-4">
          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={l('Поиск материалов...', 'Материал іздеу...', 'Search materials...')} className="w-full pl-9 pr-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {categories.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-3 py-2 rounded-xl text-xs whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-gray-900 text-white' : 'bg-white border border-gray-100 text-gray-400 hover:border-gray-200'}`}>{cat}</button>
              ))}
            </div>
          </div>

          {/* Materials Table */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 border-b border-gray-50 text-[10px] text-gray-400">
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
                  <div key={p.id} onClick={() => { setSelectedProduct(p); setShowEditModal(true); }} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center px-4 py-3 hover:bg-gray-50/50 transition-colors cursor-pointer group">
                    <div className="col-span-4 flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0"><Package className="w-3.5 h-3.5 text-gray-400" /></div>
                      <div><div className="text-sm text-gray-900">{p.name}</div><div className="text-[10px] text-gray-400">{p.category}</div></div>
                    </div>
                    <div className="col-span-2 text-xs text-gray-500 hidden sm:block">{p.supplier}</div>
                    <div className="col-span-2 text-center">
                      <span className="text-sm text-gray-900">{p.quantity}</span>
                      <span className="text-[10px] text-gray-400 ml-1">{p.unit}</span>
                      {p.quantity < p.minQty && p.quantity > 0 && <div className="text-[9px] text-yellow-500">min: {p.minQty}</div>}
                    </div>
                    <div className="col-span-2 text-right text-xs text-gray-900 hidden sm:block">{p.cost.toLocaleString()} ₸</div>
                    <div className="col-span-2 flex items-center justify-end gap-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-lg ${st.bg}`}>{st.label}</span>
                      <Edit2 className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="py-12 text-center"><Package className="w-8 h-8 text-gray-200 mx-auto mb-2" /><p className="text-xs text-gray-400">{l('Не найдено', 'Табылмады', 'Not found')}</p></div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== BOM (Спецификации изделий) ===== */}
      {activeView === 'bom' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-900">{l('Шаблоны изделий', 'Бұйым шаблондары', 'Product Templates')}</div>
            <button className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800">{l('Создать шаблон', 'Шаблон жасау', 'Create template')}</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { name: l('Кухня угловая', 'Бұрыштық ас үй', 'Corner Kitchen'), price: 850000, days: 21 },
              { name: l('Кухня прямая', 'Тікелей ас үй', 'Linear Kitchen'), price: 620000, days: 14 },
              { name: l('Шкаф-купе 3-дверный', '3 есікті шкаф-купе', 'Sliding Wardrobe (3 doors)'), price: 480000, days: 12 },
              { name: l('Гардеробная', 'Гардероб', 'Walk-in Closet'), price: 720000, days: 18 },
              { name: l('Прихожая', 'Дәліз', 'Hallway'), price: 320000, days: 10 },
              { name: l('Детская кровать', 'Балалар төсегі', 'Children\'s Bed'), price: 180000, days: 7 },
            ].map((tpl, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-sm transition-all cursor-pointer">
                <div className="w-full h-28 bg-gray-50 rounded-xl flex items-center justify-center mb-3">
                  <Package className="w-8 h-8 text-gray-300" />
                </div>
                <div className="text-sm text-gray-900 mb-1">{tpl.name}</div>
                <div className="flex items-center justify-between text-[11px] text-gray-400">
                  <span>{tpl.price.toLocaleString('ru-RU')} ₸</span>
                  <span>{tpl.days} {l('дней', 'күн', 'days')}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Detailed BOM example */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm text-gray-900">{l('Пример: Кухня прямая 3м', 'Мысал: 3м тікелей ас үй', 'Example: Linear Kitchen 3m')}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">3000 × 600 × 900 мм · {l('ЛДСП Egger White', 'ЛДСП Egger White', 'Egger White MFC')}</div>
              </div>
              <button className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">{l('Использовать в заказе', 'Тапсырыста қолдану', 'Use in order')}</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] text-gray-400">
                  <tr className="border-b border-gray-50">
                    <th className="text-left py-2">{l('Материал', 'Материал', 'Material')}</th>
                    <th className="text-left py-2">{l('Поставщик', 'Жеткізуші', 'Supplier')}</th>
                    <th className="text-center py-2">{l('Кол-во', 'Саны', 'Qty')}</th>
                    <th className="text-center py-2">{l('Ед.', 'Бірл.', 'Unit')}</th>
                    <th className="text-right py-2">{l('Цена', 'Бағасы', 'Price')}</th>
                    <th className="text-right py-2">{l('Итого', 'Жиыны', 'Total')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    { mat: 'ЛДСП Egger White W980', sup: 'ТОО КазДСП', qty: 4, unit: l('лист', 'парақ', 'sheet'), price: 18000 },
                    { mat: 'Кромка ПВХ 2мм', sup: 'ИП Кромка Люкс', qty: 22, unit: 'м', price: 350 },
                    { mat: 'Фурнитура Blum', sup: 'Blum KZ', qty: 6, unit: l('шт', 'дана', 'pcs'), price: 4500 },
                    { mat: 'Столешница Stone Art', sup: 'Stone Art', qty: 1, unit: l('шт', 'дана', 'pcs'), price: 85000 },
                  ].map((r, i) => (
                    <tr key={i}>
                      <td className="py-2.5 text-gray-900">{r.mat}</td>
                      <td className="py-2.5 text-gray-500">{r.sup}</td>
                      <td className="py-2.5 text-center text-gray-700">{r.qty}</td>
                      <td className="py-2.5 text-center text-gray-400">{r.unit}</td>
                      <td className="py-2.5 text-right text-gray-700">{r.price.toLocaleString('ru-RU')} ₸</td>
                      <td className="py-2.5 text-right text-gray-900">{(r.qty * r.price).toLocaleString('ru-RU')} ₸</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-50 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div><div className="text-[10px] text-gray-400 mb-1">{l('Материалы', 'Материалдар', 'Materials')}</div><div className="text-gray-900">182 700 ₸</div></div>
              <div><div className="text-[10px] text-gray-400 mb-1">{l('Работа', 'Жұмыс', 'Labor')}</div><div className="text-gray-900">120 000 ₸</div></div>
              <div><div className="text-[10px] text-gray-400 mb-1">{l('Наценка 30%', 'Үстеме 30%', 'Markup 30%')}</div><div className="text-gray-900">90 810 ₸</div></div>
              <div><div className="text-[10px] text-gray-400 mb-1">{l('Итого клиенту', 'Клиентке жиыны', 'Client total')}</div><div className="text-gray-900">393 510 ₸</div></div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Калькулятор стоимости ===== */}
      {activeView === 'calculator' && <Calculator language={language} />}
      {false && (
        <div className="hidden">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-[10px] text-gray-400 mb-2">{l('Шаг 1', '1-қадам', 'Step 1')}</div>
              <div className="text-sm text-gray-900 mb-3">{l('Тип изделия', 'Бұйым түрі', 'Product type')}</div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {[l('Кухня', 'Ас үй', 'Kitchen'), l('Шкаф', 'Шкаф', 'Wardrobe'), l('Гардероб', 'Гардероб', 'Closet'), l('Прихожая', 'Дәліз', 'Hallway'), l('Детская', 'Балалар', 'Kids'), l('Спальня', 'Жатын', 'Bedroom'), l('Гостиная', 'Қонақ', 'Living')].map((t, i) => (
                  <button key={i} className={`p-3 border rounded-xl text-xs hover:border-gray-300 hover:bg-gray-50 transition-all ${i === 0 ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-100 text-gray-700'}`}>{t}</button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-[10px] text-gray-400 mb-2">{l('Шаг 2', '2-қадам', 'Step 2')}</div>
              <div className="text-sm text-gray-900 mb-3">{l('Размеры (м)', 'Өлшемдері (м)', 'Dimensions (m)')}</div>
              <div className="grid grid-cols-3 gap-3">
                {[l('Длина', 'Ұзындығы', 'Length'), l('Ширина', 'Ені', 'Width'), l('Высота', 'Биіктігі', 'Height')].map((lbl, i) => (
                  <div key={i}>
                    <label className="block text-[11px] text-gray-400 mb-1">{lbl}</label>
                    <input type="number" defaultValue={i === 0 ? 3 : i === 1 ? 0.6 : 0.9} step="0.1" className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-[10px] text-gray-400 mb-2">{l('Шаг 3', '3-қадам', 'Step 3')}</div>
              <div className="text-sm text-gray-900 mb-3">{l('Материалы', 'Материалдар', 'Materials')}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { lbl: 'ЛДСП', opts: ['Egger White', 'Egger Wood', 'Kronospan Дуб'] },
                  { lbl: l('Фасады', 'Фасадтар', 'Facades'), opts: ['МДФ глянец', 'МДФ матовый', 'Массив'] },
                  { lbl: l('Фурнитура', 'Фурнитура', 'Hardware'), opts: ['Blum', 'Hettich', l('Эконом', 'Эконом', 'Economy')] },
                  { lbl: l('Столешница', 'Үстел беті', 'Countertop'), opts: ['Stone Art', l('ЛДСП пост', 'ЛДСП пост', 'Postformed'), l('Камень', 'Тас', 'Stone')] },
                ].map((g, i) => (
                  <div key={i}>
                    <label className="block text-[11px] text-gray-400 mb-1">{g.lbl}</label>
                    <select className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200">
                      {g.opts.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-[10px] text-gray-400 mb-2">{l('Шаг 4', '4-қадам', 'Step 4')}</div>
              <div className="text-sm text-gray-900 mb-3">{l('Дополнительно', 'Қосымша', 'Add-ons')}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  l('Подсветка LED', 'LED жарық', 'LED lighting'),
                  l('Мягкое закрывание Blum', 'Blum жұмсақ жабылу', 'Blum soft-close'),
                  l('Встроенная техника', 'Кіріктірілген техника', 'Built-in appliances'),
                  l('Выдвижные ящики', 'Тартпалар', 'Pull-out drawers'),
                ].map((opt, i) => (
                  <label key={i} className="flex items-center gap-2 p-2.5 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" className="rounded" />
                    <span className="text-xs text-gray-700">{opt}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-[10px] text-gray-400 mb-2">{l('Шаг 5', '5-қадам', 'Step 5')}</div>
              <div className="text-sm text-gray-900 mb-3">{l('Работа', 'Жұмыс', 'Services')}</div>
              <div className="space-y-2">
                {[
                  { lbl: l('Замер', 'Өлшеу', 'Measurement'), price: 5000 },
                  { lbl: l('Дизайн-проект', 'Дизайн-жоба', 'Design project'), price: 25000 },
                  { lbl: l('Доставка', 'Жеткізу', 'Delivery'), price: 15000 },
                  { lbl: l('Установка', 'Орнату', 'Installation'), price: 35000 },
                ].map((s, i) => (
                  <label key={i} className="flex items-center justify-between p-2.5 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span className="text-xs text-gray-700">{s.lbl}</span>
                    </div>
                    <span className="text-xs text-gray-900">{s.price.toLocaleString('ru-RU')} ₸</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Total panel */}
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 sticky top-4">
              <div className="text-sm text-gray-900 mb-4">{l('Итого', 'Жиыны', 'Total')}</div>
              <div className="space-y-2.5 mb-4">
                <div className="flex justify-between text-xs"><span className="text-gray-500">{l('Материалы', 'Материалдар', 'Materials')}</span><span className="text-gray-900">480 000 ₸</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">{l('Работа', 'Жұмыс', 'Labor')}</span><span className="text-gray-900">120 000 ₸</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">{l('Наценка 30%', 'Үстеме 30%', 'Markup 30%')}</span><span className="text-gray-900">180 000 ₸</span></div>
                <div className="border-t border-gray-100 pt-2.5 flex justify-between"><span className="text-sm text-gray-900">{l('ИТОГО', 'ЖИЫНЫ', 'TOTAL')}</span><span className="text-sm text-gray-900">780 000 ₸</span></div>
              </div>
              <div className="text-[11px] text-gray-400 mb-4">{l('Срок производства: 14-21 день', 'Өндіріс мерзімі: 14-21 күн', 'Production: 14-21 days')}</div>
              <div className="space-y-2">
                <button className="w-full px-3 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">{l('Создать заказ', 'Тапсырыс жасау', 'Create order')}</button>
                <button className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">{l('Сохранить как шаблон', 'Шаблон ретінде сақтау', 'Save as template')}</button>
                <button className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">{l('Отправить КП в WhatsApp', 'WhatsApp-қа КП жіберу', 'Send proposal via WhatsApp')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Раскрой (Nesting) ===== */}
      {activeView === 'nesting' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-900 mb-3">{l('Детали из заказа', 'Тапсырыстағы бөліктер', 'Order parts')}</div>
            <div className="space-y-2">
              {[
                { name: l('Фасады', 'Фасадтар', 'Facades'), qty: 5, color: 'bg-blue-400' },
                { name: l('Боковины', 'Бүйірлер', 'Side panels'), qty: 4, color: 'bg-purple-400' },
                { name: l('Столешница', 'Үстел беті', 'Countertop'), qty: 1, color: 'bg-amber-400' },
                { name: l('Полки', 'Сөрелер', 'Shelves'), qty: 6, color: 'bg-emerald-400' },
                { name: l('Задняя стенка', 'Артқы қабырға', 'Back panel'), qty: 2, color: 'bg-rose-400' },
              ].map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-xs p-2 bg-gray-50 rounded-lg">
                  <span className={`w-3 h-3 rounded ${p.color}`} />
                  <span className="flex-1 text-gray-700">{p.name}</span>
                  <span className="text-gray-400">×{p.qty}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-gray-900">{l('Лист ЛДСП 2750×1830', 'ЛДСП парағы 2750×1830', 'MFC sheet 2750×1830')}</div>
              <span className="text-[10px] text-gray-400">{l('Лист 1 из 4', '1/4 парақ', 'Sheet 1 of 4')}</span>
            </div>
            <div className="aspect-[2750/1830] bg-gray-50 rounded-xl border border-gray-100 relative overflow-hidden">
              {[
                { x: 1, y: 1, w: 38, h: 60, c: 'bg-blue-200 border-blue-400' },
                { x: 40, y: 1, w: 38, h: 60, c: 'bg-blue-200 border-blue-400' },
                { x: 1, y: 62, w: 25, h: 36, c: 'bg-purple-200 border-purple-400' },
                { x: 27, y: 62, w: 25, h: 36, c: 'bg-purple-200 border-purple-400' },
                { x: 53, y: 62, w: 35, h: 18, c: 'bg-amber-200 border-amber-400' },
                { x: 79, y: 1, w: 20, h: 30, c: 'bg-emerald-200 border-emerald-400' },
                { x: 79, y: 32, w: 20, h: 30, c: 'bg-emerald-200 border-emerald-400' },
                { x: 53, y: 81, w: 46, h: 17, c: 'bg-rose-200 border-rose-400' },
              ].map((b, i) => (
                <div key={i} className={`absolute border ${b.c}`}
                  style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }} />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-sm text-gray-900 mb-3">{l('Статистика', 'Статистика', 'Stats')}</div>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">{l('Использовано', 'Қолданылды', 'Used')}</span><span className="text-gray-900">87.5%</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{l('Отходы', 'Қалдықтар', 'Waste')}</span><span className="text-amber-600">12.5%</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{l('Листов нужно', 'Парақ керек', 'Sheets needed')}</span><span className="text-gray-900">4</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{l('Экономия', 'Үнемдеу', 'Savings')}</span><span className="text-green-600">18 000 ₸</span></div>
              </div>
            </div>
            <div className="space-y-2">
              <button className="w-full px-3 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">{l('Оптимизировать', 'Оңтайландыру', 'Optimize')}</button>
              <button className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">{l('Экспорт XML/DXF', 'XML/DXF экспорты', 'Export XML/DXF')}</button>
              <button className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">{l('Печать карты', 'Картаны басу', 'Print map')}</button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-sm text-gray-900 mb-3">{l('ЧПУ-станки', 'ЧПУ станоктары', 'CNC machines')}</div>
              <div className="space-y-2">
                {[
                  { name: 'Felder K540', status: l('Работает', 'Жұмыста', 'Running'), color: 'text-green-600 bg-green-50', queue: 3 },
                  { name: 'Holzma HPP', status: l('Простой', 'Бос тұр', 'Idle'), color: 'text-gray-500 bg-gray-50', queue: 0 },
                  { name: 'Biesse Rover', status: l('Загружено', 'Жүктелді', 'Loaded'), color: 'text-blue-600 bg-blue-50', queue: 2 },
                ].map((m, i) => (
                  <div key={i} className="flex items-center justify-between p-2 border border-gray-100 rounded-lg">
                    <div>
                      <div className="text-xs text-gray-900">{m.name}</div>
                      <div className="text-[10px] text-gray-400">{m.queue} {l('заданий', 'тапсырма', 'jobs')}</div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${m.color}`}>{m.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODALS ===== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-50 flex items-center justify-between">
              <span className="text-sm text-gray-900">{l('Добавить материал', 'Материал қосу', 'Add Material')}</span>
              <button onClick={() => setShowAddModal(false)} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <ModalInput label={l('Название', 'Атауы', 'Name')} value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: (e.target as HTMLInputElement).value })} placeholder="ЛДСП White" />
              <div><label className="block text-[11px] text-gray-400 mb-1">{l('Категория', 'Санат', 'Category')}</label><select value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none">{categories.filter(c => c !== 'Все').map(c => <option key={c}>{c}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <ModalInput label={l('Кол-во', 'Саны', 'Qty')} type="number" value={String(newProduct.quantity)} onChange={e => setNewProduct({ ...newProduct, quantity: Number((e.target as HTMLInputElement).value) })} />
                <div><label className="block text-[11px] text-gray-400 mb-1">{l('Ед.', 'Бірл.', 'Unit')}</label><select value={newProduct.unit} onChange={e => setNewProduct({ ...newProduct, unit: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none"><option value="лист">{l('лист', 'парақ', 'sheet')}</option><option value="шт">{l('шт', 'дана', 'pcs')}</option><option value="м">м</option><option value="пара">{l('пара', 'жұп', 'pair')}</option></select></div>
              </div>
              <ModalInput label={l('Поставщик', 'Жеткізуші', 'Supplier')} value={newProduct.supplier} onChange={e => setNewProduct({ ...newProduct, supplier: (e.target as HTMLInputElement).value })} />
              <ModalInput label={l('Цена (₸)', 'Бағасы (₸)', 'Price (₸)')} type="number" value={String(newProduct.cost)} onChange={e => setNewProduct({ ...newProduct, cost: Number((e.target as HTMLInputElement).value) })} />
            </div>
            <div className="p-5 pt-0 flex gap-2">
              <button onClick={() => setShowAddModal(false)} className="flex-1 px-3 py-2.5 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">{l('Отмена', 'Болдырмау', 'Cancel')}</button>
              <button onClick={handleAdd} className="flex-1 px-3 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">{l('Добавить', 'Қосу', 'Add')}</button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowEditModal(false); setSelectedProduct(null); }}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-50 flex items-center justify-between">
              <div><div className="text-[10px] text-gray-400">{selectedProduct.category} · {selectedProduct.supplier}</div><div className="text-sm text-gray-900">{selectedProduct.name}</div></div>
              <button onClick={() => { setShowEditModal(false); setSelectedProduct(null); }} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <ModalInput label={l('Кол-во', 'Саны', 'Quantity')} type="number" value={String(selectedProduct.quantity)} onChange={e => setSelectedProduct({ ...selectedProduct, quantity: Number((e.target as HTMLInputElement).value) })} />
                <ModalInput label={l('Мин. остаток', 'Мин. қалдық', 'Min stock')} type="number" value={String(selectedProduct.minQty)} onChange={e => setSelectedProduct({ ...selectedProduct, minQty: Number((e.target as HTMLInputElement).value) })} />
              </div>
              <ModalInput label={l('Цена (₸)', 'Бағасы (₸)', 'Price (₸)')} type="number" value={String(selectedProduct.cost)} onChange={e => setSelectedProduct({ ...selectedProduct, cost: Number((e.target as HTMLInputElement).value) })} />
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="text-[10px] text-gray-400">{l('Итого на складе', 'Қоймадағы жиыны', 'Total stock value')}</span>
                <span className="text-sm text-gray-900">{(selectedProduct.quantity * selectedProduct.cost).toLocaleString()} ₸</span>
              </div>
            </div>
            <div className="p-5 pt-0 flex gap-2">
              <button onClick={() => { setShowEditModal(false); setSelectedProduct(null); }} className="flex-1 px-3 py-2.5 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">{l('Отмена', 'Болдырмау', 'Cancel')}</button>
              <button onClick={handleSaveEdit} className="flex-1 px-3 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">{l('Сохранить', 'Сақтау', 'Save')}</button>
            </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedOrder(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-50 flex items-center justify-between">
              <div><div className="text-sm text-gray-900">{selectedOrder.name}</div><div className="text-[10px] text-gray-400">#{selectedOrder.id} · {selectedOrder.client}</div></div>
              <button onClick={() => setSelectedOrder(null)} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[{ icon: Users, label: l('Клиент', 'Клиент', 'Client'), value: selectedOrder.client }, { icon: Wrench, label: l('Мастер', 'Шебер', 'Master'), value: selectedOrder.master }, { icon: Calendar, label: l('Сроки', 'Мерзім', 'Timeline'), value: `${selectedOrder.start} → ${selectedOrder.end}` }, { icon: Clock, label: l('Осталось', 'Қалды', 'Remaining'), value: selectedOrder.daysLeft === 0 ? l('Готово', 'Дайын', 'Ready') : `${selectedOrder.daysLeft} ${l('дней', 'күн', 'days')}` }].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
                    <item.icon className="w-3.5 h-3.5 text-gray-400" /><div><div className="text-[10px] text-gray-400">{item.label}</div><div className="text-xs text-gray-900">{item.value}</div></div>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[11px] text-gray-400 mb-2">{l('Материалы', 'Материалдар', 'Materials')}</div>
                <div className="flex flex-wrap gap-1">{selectedOrder.materials.map((m, i) => <span key={i} className="text-[10px] px-2 py-1 bg-gray-50 text-gray-600 rounded-lg">{m}</span>)}</div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1"><span className="text-gray-400">{l('Прогресс', 'Прогресс', 'Progress')}</span><span className="text-gray-900">{selectedOrder.progress}%</span></div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${orderConf(selectedOrder.status).bar} rounded-full`} style={{ width: `${selectedOrder.progress}%` }} /></div>
              </div>
            </div>
            <div className="p-5 pt-0"><button onClick={() => setSelectedOrder(null)} className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">{l('Закрыть', 'Жабу', 'Close')}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}