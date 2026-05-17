import { useState, useEffect } from 'react';
import { Instagram, Phone, X, Users, MessageCircle, Mail, Calendar, TrendingUp, AlertCircle, CheckCircle, Package, Hammer, FileCheck, XCircle, Plus, Search, Filter, Archive, Download, Upload } from 'lucide-react';
import { ClientOrderModal } from './ClientOrderModal';
import { NewDealModal } from './NewDealModal';
import { useDataStore, type Deal } from '../utils/dataStore';
import { rowsToCsv, downloadCsv, todayStampedName, type CsvColumn } from '../utils/csv';
import { CsvImportModal, type CsvFieldSpec } from './CsvImportModal';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { t } from '../utils/translations';
import { WhatsAppLogo, TelegramLogo, InstagramLogo, TikTokLogo } from './PlatformLogos';
import { Finance } from './Finance';
// PaymentsHub moved to its own top-level menu item «Финансы» (App.tsx /
// 'finance' route) — no longer embedded here as a tab.

interface SalesKanbanProps {
  language: 'kz' | 'ru' | 'eng';
}

// 6-stage funnel
const stageConfig = [
  { id: 'new', ru: 'Новая заявка', kz: 'Жаңа өтінім', eng: 'New Lead', dot: 'bg-blue-500' },
  { id: 'measured', ru: 'Замер', kz: 'Өлшем', eng: 'Measured', dot: 'bg-amber-500' },
  { id: 'project-agreed', ru: 'Проект и договор', kz: 'Жоба және шарт', eng: 'Project & Contract', dot: 'bg-purple-500' },
  { id: 'production', ru: 'Производство', kz: 'Өндіріс', eng: 'Production', dot: 'bg-cyan-500' },
  { id: 'installation', ru: 'Установка', kz: 'Орнату', eng: 'Installation', dot: 'bg-blue-400' },
  { id: 'completed', ru: 'Завершено', kz: 'Аяқталды', eng: 'Completed', dot: 'bg-emerald-500' },
];

// Map old statuses to new stage IDs for display
const statusToStage = (status: string): string => {
  const map: Record<string, string> = {
    new: 'new',
    accepted: 'new',
    qualified: 'new',
    measured: 'measured',
    'project-agreed': 'project-agreed',
    contract: 'project-agreed',
    production: 'production',
    assembly: 'installation',
    installation: 'installation',
    completed: 'completed',
  };
  return map[status] || status;
};

export function SalesKanban({ language }: SalesKanbanProps) {
  const store = useDataStore();
  // Poll backend every 15s so deals created/updated via Telegram bot show up live.
  useAutoRefresh(store.reloadAll, 15000);
  const [showNewDealModal, setShowNewDealModal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [newDeal, setNewDeal] = useState({ customerName: '', phone: '', product: '', amount: '', furnitureType: 'Кухня', source: 'phone' as Deal['icon'] });
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [showImport, setShowImport] = useState(false);
  // Only one view remains here ('funnel') since «Платежи» moved to its own
  // top-level menu item. The state is kept for backward-compat with logic
  // that read `activeTab === 'funnel'` below; can be removed later.
  const [activeTab] = useState<'funnel'>('funnel');
  // Seed for the new-deal modal — populated when the user clicks
  // «В заказ» on a BOM template in Warehouse. NewDealModal reads it on
  // mount to pre-fill product / dimensions / materials / amount. Cleared
  // when the modal closes so the next manual «Новая сделка» starts blank.
  const [templateSeed, setTemplateSeed] = useState<any | null>(null);

  // Listen for «use template in order» events fired by Warehouse → BOM →
  // «В заказ» button. Switches us to the funnel tab and opens the modal
  // with the template's data attached as a seed.
  useEffect(() => {
    const onTemplate = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail || {};
      setTemplateSeed(detail);
      // Only «funnel» view exists now — payments moved to its own menu item.
      setShowNewDealModal(true);
    };
    window.addEventListener('sales:create-deal-from-template', onTemplate as EventListener);
    return () => window.removeEventListener('sales:create-deal-from-template', onTemplate as EventListener);
  }, []);

  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const tt = (key: Parameters<typeof t>[0]) => t(key, language);

  // Deals excluding rejected
  const activeDeals = store.deals.filter(d => d.status !== 'rejected');
  const rejectedDeals = store.deals.filter(d => d.status === 'rejected');

  const getDealsByStage = (stageId: string) =>
    activeDeals
      .filter(d => statusToStage(d.status) === stageId)
      .filter(d => !searchQuery || d.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || d.product.toLowerCase().includes(searchQuery.toLowerCase()));

  const getTotalAmount = (stageId: string) => getDealsByStage(stageId).reduce((s, d) => s + d.amount, 0);

  const handleDragStart = (e: React.DragEvent, id: string) => { e.dataTransfer.setData('dealId', id); e.currentTarget.classList.add('opacity-40', 'scale-95'); };
  const handleDragEnd = (e: React.DragEvent) => { e.currentTarget.classList.remove('opacity-40', 'scale-95'); };
  const handleDrop = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('dealId');
    const progressMap: Record<string, number> = { new: 5, measured: 25, 'project-agreed': 50, production: 70, installation: 88, completed: 100 };
    store.updateDeal(id, { status: stage, progress: progressMap[stage] || 0 });
  };

  const handleAddDeal = () => {
    if (newDeal.customerName && newDeal.product && newDeal.amount) {
      store.addDeal({
        customerName: newDeal.customerName, phone: newDeal.phone || '', address: '', product: newDeal.product,
        furnitureType: newDeal.furnitureType, amount: Number(newDeal.amount), paidAmount: 0, status: 'new',
        icon: newDeal.source, priority: 'medium',
        date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
        progress: 5, source: newDeal.source === 'instagram' ? 'Instagram' : newDeal.source === 'whatsapp' ? 'WhatsApp' : newDeal.source === 'telegram' ? 'Telegram' : 'Телефон',
        measurer: '', designer: '', materials: '', measurementDate: '', completionDate: '', installationDate: '',
        paymentMethods: { cash: false, kaspiGold: false, kaspiQR: false, cardTransfer: false, installment: false },
        notes: '',
      });
      setNewDeal({ customerName: '', phone: '', product: '', amount: '', furnitureType: 'Кухня', source: 'phone' });
      setShowNewDealModal(false);
    }
  };

  const handleDeleteDeal = (id: string) => { if (confirm(l('Удалить?', 'Жою?', 'Delete?'))) store.deleteDeal(id); };
  const handleRejectDeal = (id: string) => { store.updateDeal(id, { status: 'rejected', progress: 0 }); };

  const iconMap = (icon: Deal['icon']) => {
    const map: Record<string, JSX.Element> = {
      instagram: <InstagramLogo className="w-3.5 h-3.5" />,
      phone: <Phone className="w-3.5 h-3.5 text-blue-500" />,
      whatsapp: <WhatsAppLogo className="w-3.5 h-3.5" />,
      email: <Mail className="w-3.5 h-3.5 text-purple-500" />,
      users: <Users className="w-3.5 h-3.5 text-orange-500" />,
      telegram: <TelegramLogo className="w-3.5 h-3.5" />,
      tiktok: <TikTokLogo className="w-3.5 h-3.5" />,
    };
    return map[icon] || <Phone className="w-3.5 h-3.5 text-gray-400" />;
  };

  const priorityConf = (p?: string) => ({
    high: { label: l('Высокий', 'Жоғары', 'High'), cls: 'bg-red-50 text-red-500' },
    medium: { label: l('Средний', 'Орташа', 'Medium'), cls: 'bg-yellow-50 text-yellow-600' },
    low: { label: l('Низкий', 'Төмен', 'Low'), cls: 'bg-green-50 text-green-600' },
  }[p || 'medium'] || { label: '', cls: '' });

  const totalSum = activeDeals.reduce((s, d) => s + d.amount, 0);

  return (
    <>
      <div className="flex flex-col h-screen bg-white">
        {/* Header */}
        <div className="px-4 md:px-8 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">{l('Заказы', 'Тапсырыстар', 'Orders')}</p>
              {/* Payments tab moved to a top-level «Финансы» menu item — this
                  page is now just the sales funnel. */}
              <h1 className="text-gray-900">{l('Воронка продаж', 'Сату воронкасы', 'Sales Funnel')}</h1>
            </div>
            <div className="flex items-center gap-2">
              {/* Archive button */}
              <button
                onClick={() => setShowArchive(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-100 rounded-xl text-xs text-gray-500 hover:bg-gray-50"
              >
                <Archive className="w-3.5 h-3.5" />
                {l('Архив отказов', 'Бас тарту мұрағаты', 'Rejected Archive')}
                {rejectedDeals.length > 0 && <span className="ml-0.5 bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded-full">{rejectedDeals.length}</span>}
              </button>
              {/* CSV export — UTF-8 BOM so Excel reads Cyrillic without manual import. */}
              <button
                onClick={() => {
                  const ownerName = (id: string | undefined) => id ? (store.getEmployeeById(id)?.name || '') : '';
                  const cols: CsvColumn<Deal>[] = [
                    { header: 'ID',           value: 'id' },
                    { header: 'Клиент',       value: 'customerName' },
                    { header: 'Телефон',      value: 'phone' },
                    { header: 'Адрес',        value: 'address' },
                    { header: 'Продукт',      value: 'product' },
                    { header: 'Тип мебели',   value: 'furnitureType' },
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
                  const csv = rowsToCsv(store.deals, cols);
                  downloadCsv(todayStampedName('deals'), csv);
                }}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-100 rounded-xl text-xs text-gray-500 hover:bg-gray-50"
                title={l('Скачать сделки в CSV (Excel)', 'CSV-ге жүктеп алу', 'Export deals to CSV')}
              >
                <Download className="w-3.5 h-3.5" />
                {l('Экспорт', 'Экспорт', 'Export')}
              </button>
              {store.canWriteModule('orders') && (
                <button
                  onClick={() => setShowImport(true)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-100 rounded-xl text-xs text-gray-500 hover:bg-gray-50"
                  title={l('Загрузить сделки из CSV', 'CSV-ден жүктеу', 'Import deals from CSV')}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {l('Импорт', 'Импорт', 'Import')}
                </button>
              )}
              {store.canWriteModule('orders') && (
                <button onClick={() => setShowNewDealModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">
                  <Plus className="w-3.5 h-3.5" />{l('Новая сделка', 'Жаңа мәміле', 'New Deal')}
                </button>
              )}
            </div>
          </div>

          {/* Stats + Search */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-1.5 h-1.5 bg-gray-900 rounded-full" />{activeDeals.length} {l('сделок', 'мәміле', 'deals')}</div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400"><TrendingUp className="w-3 h-3" />{(totalSum / 1000000).toFixed(1)}М ₸</div>
            </div>
            <div className="flex-1 max-w-xs ml-auto relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={l('Поиск...', 'Іздеу...', 'Search...')} className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border-0 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
            </div>
          </div>
        </div>

        {/* Kanban Board — payments tab removed, now lives under top-level «Финансы» */}
        {activeTab === 'funnel' && (
          <div className="flex-1 overflow-hidden px-4 md:px-6">
          <div className="flex gap-3 overflow-x-auto h-full py-4 pb-6">
            {stageConfig.map(stage => {
              const stageDeals = getDealsByStage(stage.id);
              const total = getTotalAmount(stage.id);
              return (
                <div key={stage.id} onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, stage.id)} className="flex-shrink-0 w-[260px] h-full flex flex-col">
                  {/* Column Header */}
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 ${stage.dot} rounded-full`} />
                      <span className="text-xs text-gray-700">{stage[language]}</span>
                      <span className="text-[10px] text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded">{stageDeals.length}</span>
                    </div>
                    {total > 0 && <span className="text-[10px] text-gray-400">{(total / 1000).toFixed(0)}К ₸</span>}
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {stageDeals.length === 0 && (
                      <div className="border border-dashed border-gray-100 rounded-xl py-6 flex items-center justify-center">
                        <span className="text-[10px] text-gray-300">{l('Перетащите', 'Сүйреңіз', 'Drop here')}</span>
                      </div>
                    )}
                    {stageDeals.map(deal => (
                      <div key={deal.id} draggable onDragStart={e => handleDragStart(e, deal.id)} onDragEnd={handleDragEnd} onClick={() => setSelectedDeal(deal)}
                        className="bg-white border border-gray-100 rounded-xl p-3 cursor-pointer hover:shadow-sm hover:border-gray-200 transition-all group">
                        {/* Top row */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0">{iconMap(deal.icon)}</div>
                            <span className="text-xs text-gray-900 truncate">{deal.customerName}</span>
                          </div>
                          {store.canWriteModule('orders') && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={e => { e.stopPropagation(); handleRejectDeal(deal.id); }} className="p-0.5 hover:bg-red-50 rounded" title="Отказ">
                                <XCircle className="w-3 h-3 text-gray-300 hover:text-red-400" />
                              </button>
                              <button onClick={e => { e.stopPropagation(); handleDeleteDeal(deal.id); }} className="p-0.5 hover:bg-red-50 rounded">
                                <X className="w-3 h-3 text-gray-300 hover:text-red-500" />
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Product + Amount */}
                        <div className="mb-2">
                          <div className="text-[11px] text-gray-400 truncate mb-0.5">{deal.product}</div>
                          <div className="text-sm text-gray-900">{deal.amount.toLocaleString()} ₸</div>
                        </div>
                        {/* Progress */}
                        {deal.progress != null && deal.progress > 0 && (
                          <div className="mb-2">
                            <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-gray-900 rounded-full transition-all" style={{ width: `${deal.progress}%` }} />
                            </div>
                            <div className="text-[9px] text-gray-300 text-right mt-0.5">{deal.progress}%</div>
                          </div>
                        )}
                        {/* Footer */}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                          {deal.priority && <span className={`text-[9px] px-1.5 py-0.5 rounded ${priorityConf(deal.priority).cls}`}>{priorityConf(deal.priority).label}</span>}
                          {deal.date && <span className="text-[9px] text-gray-300 flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5" />{deal.date}</span>}
                        </div>
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

      {showNewDealModal && (
        <NewDealModal
          language={language}
          seed={templateSeed || undefined}
          onClose={() => { setShowNewDealModal(false); setTemplateSeed(null); }}
        />
      )}
      {showImport && (
        <CsvImportModal
          language={language}
          title={l('Сделки', 'Мәмілелер', 'Deals')}
          fields={(() => {
            const f: CsvFieldSpec[] = [
              { key: 'customerName', headers: ['Клиент', 'Customer', 'Имя'], required: true },
              { key: 'phone',        headers: ['Телефон', 'Phone'] },
              { key: 'address',      headers: ['Адрес', 'Address'] },
              { key: 'product',      headers: ['Продукт', 'Product'] },
              { key: 'furnitureType',headers: ['Тип мебели', 'Type'] },
              { key: 'amount',       headers: ['Сумма', 'Amount'], transform: (v) => Number(String(v).replace(/[^0-9.-]/g, '')) || 0 },
              { key: 'paidAmount',   headers: ['Оплачено', 'Paid'], transform: (v) => Number(String(v).replace(/[^0-9.-]/g, '')) || 0 },
              { key: 'status',       headers: ['Статус', 'Status'] },
              { key: 'source',       headers: ['Источник', 'Source'] },
              { key: 'measurer',     headers: ['Замерщик', 'Measurer'] },
              { key: 'designer',     headers: ['Дизайнер', 'Designer'] },
              { key: 'notes',        headers: ['Заметки', 'Notes'] },
            ];
            return f;
          })()}
          onImport={async (rec) => {
            // Defaults for fields the schema doesn't ask about so the row is
            // valid against the Deal interface that the store expects.
            store.addDeal({
              customerName: String(rec.customerName),
              phone: String(rec.phone || ''),
              address: String(rec.address || ''),
              product: String(rec.product || ''),
              furnitureType: String(rec.furnitureType || ''),
              amount: Number(rec.amount) || 0,
              paidAmount: Number(rec.paidAmount) || 0,
              status: String(rec.status || 'new'),
              icon: 'phone',
              priority: 'medium',
              date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
              progress: 5,
              source: String(rec.source || 'Импорт'),
              measurer: String(rec.measurer || ''),
              designer: String(rec.designer || ''),
              materials: '',
              measurementDate: '',
              completionDate: '',
              installationDate: '',
              paymentMethods: { cash: false, kaspi: false, halyk: false, card_transfer: false, bank_transfer: false, installment: false },
              notes: String(rec.notes || ''),
              workType: 'furniture',
            });
          }}
          onClose={() => { setShowImport(false); store.reloadAll(); }}
        />
      )}

      {/* New Deal Modal (legacy) */}
      {false && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowNewDealModal(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-50 flex items-center justify-between">
              <span className="text-sm text-gray-900">{l('Новая сделка', 'Жаңа мәміле', 'New Deal')}</span>
              <button onClick={() => setShowNewDealModal(false)} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="block text-[11px] text-gray-400 mb-1">{l('Имя клиента', 'Клиент аты', 'Client Name')}</label><input type="text" value={newDeal.customerName} onChange={e => setNewDeal({ ...newDeal, customerName: e.target.value })} placeholder={tt('customerNameMask')} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
              <div><label className="block text-[11px] text-gray-400 mb-1">{l('Телефон', 'Телефон', 'Phone')}</label><input type="text" value={newDeal.phone} onChange={e => setNewDeal({ ...newDeal, phone: e.target.value })} placeholder={tt('phoneMask')} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
              <div><label className="block text-[11px] text-gray-400 mb-1">{l('Продукт', 'Өнім', 'Product')}</label><input type="text" value={newDeal.product} onChange={e => setNewDeal({ ...newDeal, product: e.target.value })} placeholder={l('Шкаф-купе', 'Сырғымалы шкаф', 'Wardrobe')} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
              <div><label className="block text-[11px] text-gray-400 mb-1">{l('Сумма (₸)', 'Сома (₸)', 'Amount (₸)')}</label><input type="number" value={newDeal.amount} onChange={e => setNewDeal({ ...newDeal, amount: e.target.value })} placeholder="0" className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
              <div><label className="block text-[11px] text-gray-400 mb-1">{l('Тип мебели', 'Мебел түрі', 'Furniture Type')}</label><input type="text" value={newDeal.furnitureType} onChange={e => setNewDeal({ ...newDeal, furnitureType: e.target.value })} placeholder={l('Кухня', 'Кухня', 'Kitchen')} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
              <div><label className="block text-[11px] text-gray-400 mb-1">{l('Источник', 'Басталуы мекемесі', 'Source')}</label>
                <select value={newDeal.source} onChange={e => setNewDeal({ ...newDeal, source: e.target.value as Deal['icon'] })} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200">
                  <option value="phone">{l('Телефон', 'Телефон', 'Phone')}</option>
                  <option value="instagram">Instagram</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telegram">Telegram</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </div>
            </div>
            <div className="p-5 pt-0 flex gap-2">
              <button onClick={() => setShowNewDealModal(false)} className="flex-1 px-3 py-2.5 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">{l('Отмена', 'Болдырмау', 'Cancel')}</button>
              <button onClick={handleAddDeal} disabled={!newDeal.customerName || !newDeal.product || !newDeal.amount} className="flex-1 px-3 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 disabled:opacity-30">{l('Создать', 'Жасау', 'Create')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Modal */}
      {showArchive && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowArchive(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-50 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-900">{l('Архив отказов', 'Бас тарту мұрағаты', 'Rejected Archive')}</span>
                <span className="text-[10px] bg-red-50 text-red-500 px-2 py-0.5 rounded-full">{rejectedDeals.length}</span>
              </div>
              <button onClick={() => setShowArchive(false)} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {rejectedDeals.length === 0 ? (
                <div className="py-10 text-center">
                  <XCircle className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">{l('Отказов нет', 'Бас тартулар жоқ', 'No rejections')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {rejectedDeals.map(deal => (
                    <div key={deal.id} className="border border-gray-100 rounded-xl p-3 flex items-center gap-3">
                      <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <XCircle className="w-4 h-4 text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm text-gray-900 truncate">{deal.customerName}</span>
                          <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded">Отказ</span>
                        </div>
                        <div className="text-xs text-gray-400 truncate">{deal.product} · {deal.amount > 0 ? `${deal.amount.toLocaleString()} ₸` : '—'}</div>
                      </div>
                      {store.canWriteModule('orders') && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => store.updateDeal(deal.id, { status: 'new', progress: 5 })}
                          className="px-2 py-1 text-[10px] border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50"
                        >
                          {l('Вернуть', 'Қайтару', 'Restore')}
                        </button>
                        <button onClick={() => handleDeleteDeal(deal.id)} className="p-1.5 hover:bg-red-50 rounded-lg">
                          <X className="w-3.5 h-3.5 text-gray-300 hover:text-red-400" />
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
      )}

      {selectedDeal && <ClientOrderModal isOpen={!!selectedDeal} onClose={() => setSelectedDeal(null)} deal={selectedDeal} language={language} />}
    </>
  );
}

function PaymentsView({ deals, language }: { deals: Deal[]; language: 'kz' | 'ru' | 'eng' }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const active = deals.filter(d => d.status !== 'rejected');
  const totalSum = active.reduce((s, d) => s + (d.amount || 0), 0);
  const paidSum = active.reduce((s, d) => s + ((d.amount || 0) * ((d.progress || 0) / 100)), 0);
  const dueSum = totalSum - paidSum;
  const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸';

  const stats = [
    { label: l('Всего к оплате', 'Барлығы төлеуге', 'Total billed'), value: fmt(totalSum), sub: `${active.length} ${l('сделок', 'мәміле', 'deals')}`, accent: 'bg-gray-50 text-gray-900' },
    { label: l('Оплачено', 'Төленді', 'Paid'), value: fmt(Math.round(paidSum)), sub: totalSum ? `${Math.round((paidSum / totalSum) * 100)}%` : '—', accent: 'bg-emerald-50 text-emerald-700' },
    { label: l('Остаток', 'Қалдық', 'Outstanding'), value: fmt(Math.round(dueSum)), sub: l('к получению', 'алуға', 'pending'), accent: 'bg-amber-50 text-amber-700' },
  ];

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-sm transition-all">
            <div className="text-[10px] text-gray-400 mb-1.5 uppercase tracking-wide">{s.label}</div>
            <div className="text-lg text-gray-900 mb-1">{s.value}</div>
            <div className={`inline-block px-2 py-0.5 rounded-md text-[10px] ${s.accent}`}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-900">{l('Платежи по сделкам', 'Мәмілелер бойынша төлемдер', 'Payments by deal')}</div>
          <div className="text-[10px] text-gray-400">{active.length} {l('записей', 'жазба', 'records')}</div>
        </div>
        <div className="divide-y divide-gray-50">
          {active.map(d => {
            const paid = Math.round((d.amount || 0) * ((d.progress || 0) / 100));
            const due = (d.amount || 0) - paid;
            const pct = d.progress || 0;
            return (
              <div key={d.id} className="px-4 py-3 hover:bg-gray-50/50 transition-colors flex items-center gap-4">
                <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center text-[10px] text-gray-500 flex-shrink-0">{d.id}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900 truncate">{d.customerName}</div>
                  <div className="text-[10px] text-gray-400 truncate">{d.product}</div>
                </div>
                <div className="hidden sm:block w-32">
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                    <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-gray-900' : 'bg-amber-400'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="text-[9px] text-gray-400 text-right">{pct}%</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-gray-900 tabular-nums">{fmt(d.amount || 0)}</div>
                  <div className="text-[10px] text-gray-400">{due > 0 ? `${l('осталось', 'қалды', 'left')}: ${fmt(due)}` : `✓ ${l('оплачено', 'төленді', 'paid')}`}</div>
                </div>
              </div>
            );
          })}
          {active.length === 0 && (
            <div className="px-4 py-12 text-center text-xs text-gray-400">{l('Нет активных платежей', 'Активті төлемдер жоқ', 'No active payments')}</div>
          )}
        </div>
      </div>
    </div>
  );
}