import { useState, useEffect } from 'react';
import { Phone, X, Users, Mail, Calendar, TrendingUp, XCircle, Plus, Search, Archive, Download, Upload, RotateCcw } from 'lucide-react';
import { ClientOrderModal } from './ClientOrderModal';
import { NewDealModal } from './NewDealModal';
import { useDataStore, type Deal } from '../utils/dataStore';
import { rowsToCsv, downloadCsv, todayStampedName, type CsvColumn } from '../utils/csv';
import { CsvImportModal, type CsvFieldSpec } from './CsvImportModal';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { t } from '../utils/translations';
import { WhatsAppLogo, TelegramLogo, InstagramLogo, TikTokLogo } from './PlatformLogos';
// PaymentsHub moved to its own top-level menu item «Финансы» (App.tsx /
// 'finance' route) — no longer embedded here as a tab.

interface SalesKanbanProps {
  language: 'kz' | 'ru' | 'eng';
}

// Shared glass-card class — same vocabulary as Dashboard / AI Design.
const GLASS_CARD = 'bg-white/65 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_4px_16px_-8px_rgba(15,23,42,0.12)] rounded-2xl';
const GLASS_DEEP = 'bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl';

// 6-stage funnel.
// `accent` paints a soft pastel chip around the stage dot so the column
// header reads as a glassy capsule instead of a flat label.
const stageConfig = [
  { id: 'new',             ru: 'Новая заявка',     kz: 'Жаңа өтінім',    eng: 'New Lead',           dot: 'bg-sky-500',     accent: 'bg-sky-100/70     text-sky-700' },
  { id: 'measured',        ru: 'Замер',            kz: 'Өлшем',           eng: 'Measured',          dot: 'bg-amber-500',   accent: 'bg-amber-100/70   text-amber-700' },
  { id: 'project-agreed',  ru: 'Проект и договор', kz: 'Жоба және шарт',  eng: 'Project & Contract',dot: 'bg-violet-500',  accent: 'bg-violet-100/70  text-violet-700' },
  { id: 'production',      ru: 'Производство',     kz: 'Өндіріс',         eng: 'Production',        dot: 'bg-cyan-500',    accent: 'bg-cyan-100/70    text-cyan-700' },
  { id: 'installation',    ru: 'Установка',        kz: 'Орнату',          eng: 'Installation',      dot: 'bg-indigo-500',  accent: 'bg-indigo-100/70  text-indigo-700' },
  { id: 'completed',       ru: 'Завершено',        kz: 'Аяқталды',        eng: 'Completed',         dot: 'bg-emerald-500', accent: 'bg-emerald-100/70 text-emerald-700' },
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
      phone: <Phone className="w-3.5 h-3.5 text-sky-600" />,
      whatsapp: <WhatsAppLogo className="w-3.5 h-3.5" />,
      email: <Mail className="w-3.5 h-3.5 text-violet-600" />,
      users: <Users className="w-3.5 h-3.5 text-amber-600" />,
      telegram: <TelegramLogo className="w-3.5 h-3.5" />,
      tiktok: <TikTokLogo className="w-3.5 h-3.5" />,
    };
    return map[icon] || <Phone className="w-3.5 h-3.5 text-slate-400" />;
  };

  // Priority pills in glass-pastel form so they sit nicely on the
  // translucent card background.
  const priorityConf = (p?: string) => ({
    high:   { label: l('Высокий', 'Жоғары', 'High'),  cls: 'bg-rose-100/70   text-rose-700   ring-rose-200/40' },
    medium: { label: l('Средний', 'Орташа', 'Medium'),cls: 'bg-amber-100/70  text-amber-700  ring-amber-200/40' },
    low:    { label: l('Низкий',  'Төмен',  'Low'),   cls: 'bg-emerald-100/70 text-emerald-700 ring-emerald-200/40' },
  }[p || 'medium'] || { label: '', cls: '' });

  const totalSum = activeDeals.reduce((s, d) => s + d.amount, 0);

  return (
    <>
      {/* Liquid-glass page backdrop. The kanban itself is a fixed-height
          flex column so the horizontal scroll lives inside the board, not
          on the page. Same orb vocabulary as Dashboard / AI Design. */}
      <div
        className="flex flex-col h-screen relative overflow-hidden"
        style={{
          background: `
            radial-gradient(900px circle at 0% 0%,   rgba(196,181,253,0.30), transparent 45%),
            radial-gradient(800px circle at 100% 0%, rgba(252,165,165,0.24), transparent 45%),
            radial-gradient(900px circle at 100% 100%, rgba(125,211,252,0.28), transparent 50%),
            radial-gradient(900px circle at 0% 100%, rgba(167,243,208,0.26), transparent 50%),
            linear-gradient(180deg, #fbfafd 0%, #f3f4f9 100%)
          `,
        }}
      >
        {/* ─── Header ─────────────────────────────────────────── */}
        <div className="px-4 md:px-8 py-5 flex-shrink-0 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
            <div>
              <p className="text-[11px] text-slate-400 mb-1 tracking-widest uppercase">{l('Заказы', 'Тапсырыстар', 'Orders')}</p>
              <h1 className="text-slate-900 text-2xl md:text-3xl font-medium tracking-tight">{l('Воронка продаж', 'Сату воронкасы', 'Sales Funnel')}</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowArchive(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs text-slate-600 bg-white/50 hover:bg-white/80 ring-1 ring-white/60 backdrop-blur-xl transition-all"
              >
                <Archive className="w-3.5 h-3.5" />
                {l('Архив отказов', 'Бас тарту мұрағаты', 'Rejected')}
                {rejectedDeals.length > 0 && (
                  <span className="ml-0.5 bg-rose-100/70 text-rose-700 text-[10px] px-1.5 py-0.5 rounded-full ring-1 ring-white/40 tabular-nums">
                    {rejectedDeals.length}
                  </span>
                )}
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
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs text-slate-600 bg-white/50 hover:bg-white/80 ring-1 ring-white/60 backdrop-blur-xl transition-all"
                title={l('Скачать сделки в CSV (Excel)', 'CSV-ге жүктеп алу', 'Export deals to CSV')}
              >
                <Download className="w-3.5 h-3.5" />
                {l('Экспорт', 'Экспорт', 'Export')}
              </button>
              {store.canWriteModule('orders') && (
                <button
                  onClick={() => setShowImport(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs text-slate-600 bg-white/50 hover:bg-white/80 ring-1 ring-white/60 backdrop-blur-xl transition-all"
                  title={l('Загрузить сделки из CSV', 'CSV-ден жүктеу', 'Import deals from CSV')}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {l('Импорт', 'Импорт', 'Import')}
                </button>
              )}
              {store.canWriteModule('orders') && (
                <button
                  onClick={() => setShowNewDealModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-900/95 backdrop-blur-xl text-white rounded-2xl text-xs shadow-[0_8px_24px_-8px_rgba(15,23,42,0.4)] hover:bg-slate-900 ring-1 ring-white/10 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />{l('Новая сделка', 'Жаңа мәміле', 'New Deal')}
                </button>
              )}
            </div>
          </div>

          {/* Stats + Search */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 px-2.5 py-1 rounded-full bg-white/60 ring-1 ring-white/60 backdrop-blur-xl">
                <span className="w-1.5 h-1.5 bg-slate-900 rounded-full" />
                <span className="tabular-nums">{activeDeals.length}</span> {l('сделок', 'мәміле', 'deals')}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 px-2.5 py-1 rounded-full bg-emerald-100/60 ring-1 ring-white/40 backdrop-blur-xl">
                <TrendingUp className="w-3 h-3 text-emerald-700" />
                <span className="tabular-nums text-emerald-700">{(totalSum / 1000000).toFixed(1)}М ₸</span>
              </div>
            </div>
            <div className="flex-1 max-w-xs ml-auto relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={l('Поиск по клиенту или продукту', 'Іздеу...', 'Search...')}
                className="w-full pl-9 pr-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all"
              />
            </div>
          </div>
        </div>

        {/* ─── Kanban Board ───────────────────────────────────── */}
        {activeTab === 'funnel' && (
          <div className="flex-1 overflow-hidden px-4 md:px-6 relative">
            <div className="flex gap-3 overflow-x-auto h-full py-3 pb-6">
              {stageConfig.map(stage => {
                const stageDeals = getDealsByStage(stage.id);
                const total = getTotalAmount(stage.id);
                return (
                  <div
                    key={stage.id}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleDrop(e, stage.id)}
                    className="flex-shrink-0 w-[272px] h-full flex flex-col"
                  >
                    {/* Column header — glass capsule */}
                    <div className="mb-2.5 flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-white/40 backdrop-blur-xl ring-1 ring-white/60">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 ${stage.dot} rounded-full flex-shrink-0`} />
                        <span className="text-[11px] text-slate-700 truncate">{stage[language]}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${stage.accent} ring-1 ring-white/40 tabular-nums flex-shrink-0`}>
                          {stageDeals.length}
                        </span>
                      </div>
                      {total > 0 && (
                        <span className="text-[10px] text-slate-500 tabular-nums flex-shrink-0">
                          {(total / 1000).toFixed(0)}К ₸
                        </span>
                      )}
                    </div>

                    {/* Cards column */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 pb-2">
                      {stageDeals.length === 0 && (
                        <div className="border-2 border-dashed border-white/70 bg-white/20 rounded-2xl py-8 flex items-center justify-center backdrop-blur-xl">
                          <span className="text-[10px] text-slate-400">{l('Перетащите сюда', 'Сүйреңіз', 'Drop here')}</span>
                        </div>
                      )}
                      {stageDeals.map(deal => (
                        <div
                          key={deal.id}
                          draggable
                          onDragStart={e => handleDragStart(e, deal.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => setSelectedDeal(deal)}
                          className={`${GLASS_CARD} p-3 cursor-pointer transition-all hover:bg-white/85 hover:shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 group`}
                        >
                          {/* Top row */}
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-8 h-8 bg-white/60 ring-1 ring-white/60 rounded-xl flex items-center justify-center flex-shrink-0">
                                {iconMap(deal.icon)}
                              </div>
                              <span className="text-xs text-slate-900 truncate">{deal.customerName}</span>
                            </div>
                            {store.canWriteModule('orders') && (
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={e => { e.stopPropagation(); handleRejectDeal(deal.id); }}
                                  className="p-1 hover:bg-rose-100/70 rounded-lg transition-colors"
                                  title={l('В архив отказов', 'Бас тарту', 'Reject')}
                                >
                                  <XCircle className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" />
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); handleDeleteDeal(deal.id); }}
                                  className="p-1 hover:bg-rose-100/70 rounded-lg transition-colors"
                                  title={l('Удалить', 'Жою', 'Delete')}
                                >
                                  <X className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Product + Amount */}
                          <div className="mb-2.5">
                            <div className="text-[11px] text-slate-500 truncate mb-1">{deal.product}</div>
                            <div className="text-sm text-slate-900 tabular-nums">{deal.amount.toLocaleString('ru-RU')} ₸</div>
                          </div>

                          {/* Progress */}
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
                              <div className="text-[9px] text-slate-400 text-right mt-0.5 tabular-nums">{deal.progress}%</div>
                            </div>
                          )}

                          {/* Footer */}
                          <div className="flex items-center justify-between pt-2 border-t border-white/60">
                            {deal.priority && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${priorityConf(deal.priority).cls} ring-1`}>
                                {priorityConf(deal.priority).label}
                              </span>
                            )}
                            {deal.date && (
                              <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                                <Calendar className="w-2.5 h-2.5" />{deal.date}
                              </span>
                            )}
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

      {/* Legacy inline new-deal modal — kept gated `false` for backward
          compat; NewDealModal above is the live one. */}
      {false && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={() => setShowNewDealModal(false)}>
          <div className="bg-white/85 backdrop-blur-2xl rounded-3xl max-w-md w-full ring-1 ring-white/70 shadow-[0_24px_64px_-12px_rgba(15,23,42,0.3)]" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/60 flex items-center justify-between">
              <span className="text-sm text-slate-900">{l('Новая сделка', 'Жаңа мәміле', 'New Deal')}</span>
              <button onClick={() => setShowNewDealModal(false)} className="w-8 h-8 bg-white/60 ring-1 ring-white/60 rounded-2xl flex items-center justify-center"><X className="w-3.5 h-3.5 text-slate-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="block text-[11px] text-slate-500 mb-1">{l('Имя клиента', 'Клиент аты', 'Client Name')}</label><input type="text" value={newDeal.customerName} onChange={e => setNewDeal({ ...newDeal, customerName: e.target.value })} placeholder={tt('customerNameMask')} className="w-full px-3 py-2.5 bg-white/50 ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300" /></div>
              <div><label className="block text-[11px] text-slate-500 mb-1">{l('Телефон', 'Телефон', 'Phone')}</label><input type="text" value={newDeal.phone} onChange={e => setNewDeal({ ...newDeal, phone: e.target.value })} placeholder={tt('phoneMask')} className="w-full px-3 py-2.5 bg-white/50 ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300" /></div>
              <div><label className="block text-[11px] text-slate-500 mb-1">{l('Продукт', 'Өнім', 'Product')}</label><input type="text" value={newDeal.product} onChange={e => setNewDeal({ ...newDeal, product: e.target.value })} placeholder={l('Шкаф-купе', 'Сырғымалы шкаф', 'Wardrobe')} className="w-full px-3 py-2.5 bg-white/50 ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300" /></div>
              <div><label className="block text-[11px] text-slate-500 mb-1">{l('Сумма (₸)', 'Сома (₸)', 'Amount (₸)')}</label><input type="number" value={newDeal.amount} onChange={e => setNewDeal({ ...newDeal, amount: e.target.value })} placeholder="0" className="w-full px-3 py-2.5 bg-white/50 ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300" /></div>
            </div>
            <div className="p-5 pt-0 flex gap-2">
              <button onClick={() => setShowNewDealModal(false)} className="flex-1 px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-2xl text-xs hover:bg-white">{l('Отмена', 'Болдырмау', 'Cancel')}</button>
              <button onClick={handleAddDeal} disabled={!newDeal.customerName || !newDeal.product || !newDeal.amount} className="flex-1 px-3 py-2.5 bg-slate-900/95 text-white rounded-2xl text-xs hover:bg-slate-900 disabled:opacity-30">{l('Создать', 'Жасау', 'Create')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Rejected archive modal (glass) ───────────────────── */}
      {showArchive && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={() => setShowArchive(false)}>
          <div className={`${GLASS_DEEP} max-w-lg w-full max-h-[80vh] flex flex-col`} onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/60 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-rose-100/70 text-rose-700 ring-1 ring-white/60 flex items-center justify-center">
                  <Archive className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm text-slate-900">{l('Архив отказов', 'Бас тарту мұрағаты', 'Rejected Archive')}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {rejectedDeals.length} {l('сделок', 'мәміле', 'deals')}
                  </div>
                </div>
              </div>
              <button onClick={() => setShowArchive(false)} className="w-9 h-9 bg-white/60 ring-1 ring-white/60 rounded-2xl flex items-center justify-center hover:bg-white transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {rejectedDeals.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/50 ring-1 ring-white/60 mx-auto mb-3 flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-xs text-slate-500">{l('Отказов нет', 'Бас тартулар жоқ', 'No rejections')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {rejectedDeals.map(deal => (
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
                          {deal.product} · {deal.amount > 0 ? `${deal.amount.toLocaleString('ru-RU')} ₸` : '—'}
                        </div>
                      </div>
                      {store.canWriteModule('orders') && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => store.updateDeal(deal.id, { status: 'new', progress: 5 })}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] bg-white/70 hover:bg-white ring-1 ring-white/60 rounded-xl text-slate-700 transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" />
                            {l('Вернуть', 'Қайтару', 'Restore')}
                          </button>
                          <button onClick={() => handleDeleteDeal(deal.id)} className="p-1.5 hover:bg-rose-100/70 rounded-xl transition-colors">
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
      )}

      {selectedDeal && <ClientOrderModal isOpen={!!selectedDeal} onClose={() => setSelectedDeal(null)} deal={selectedDeal} language={language} />}
    </>
  );
}
