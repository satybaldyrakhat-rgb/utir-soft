import { useState } from 'react';
import { Calendar, Search, Download, X, ArrowUpDown, Filter, ChevronRight, ArrowLeft, ToggleLeft, ToggleRight, BarChart3 } from 'lucide-react';

const creativeImages = [
  'https://images.unsplash.com/photo-1668026694348-b73c5eb5e299?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBraXRjaGVuJTIwaW50ZXJpb3IlMjBkZXNpZ258ZW58MXx8fHwxNzc1MTkxMjk2fDA&ixlib=rb-4.1.0&q=80&w=1080',
  'https://images.unsplash.com/photo-1618236444721-4a8dba415c15?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjB3YXJkcm9iZSUyMGNsb3NldHxlbnwxfHx8fDE3NzUxOTEyOTZ8MA&ixlib=rb-4.1.0&q=80&w=1080',
  'https://images.unsplash.com/photo-1768946131535-b90bad125f16?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBiZWRyb29tJTIwZnVybml0dXJlfGVufDF8fHx8MTc3NTE5MTI5Nnww&ixlib=rb-4.1.0&q=80&w=1080',
  'https://images.unsplash.com/photo-1768946131549-f03cafef7bc1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwbGl2aW5nJTIwcm9vbSUyMGZ1cm5pdHVyZXxlbnwxfHx8fDE3NzUxMTU5ODR8MA&ixlib=rb-4.1.0&q=80&w=1080',
  'https://images.unsplash.com/photo-1770987685744-630d3c2494bd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYXRocm9vbSUyMHZhbml0eSUyMGNhYmluZXR8ZW58MXx8fHwxNzc1MTkxMjk2fDA&ixlib=rb-4.1.0&q=80&w=1080',
  'https://images.unsplash.com/photo-1643903032976-8c0d0556a8ea?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxraXRjaGVuJTIwY2FiaW5ldCUyMHNob3dyb29tfGVufDF8fHx8MTc3NTE5MTI5Nnww&ixlib=rb-4.1.0&q=80&w=1080',
  'https://images.unsplash.com/photo-1774301211236-dab64d553241?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3YWxrJTIwaW4lMjBjbG9zZXQlMjBvcmdhbml6YXRpb258ZW58MXx8fHwxNzc1MTkxMjk2fDA&ixlib=rb-4.1.0&q=80&w=1080',
  'https://images.unsplash.com/photo-1724862873232-8716657e8bf4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxob21lJTIwb2ZmaWNlJTIwZGVzayUyMGZ1cm5pdHVyZXxlbnwxfHx8fDE3NzUxOTEyOTd8MA&ixlib=rb-4.1.0&q=80&w=1080',
];

// ─── CHANNELS ────────────────────────────────────────────────
interface Channel {
  id: string;
  name: string;
  icon: string;
  color: string;
  status: 'active' | 'paused' | 'error';
  spend: number;
  revenue: number;
  leads: number;
  qualLeads: number;
  sales: number;
  romi: number;
  campaignIds: string[];
}

const channels: Channel[] = [
  { id: 'meta', name: 'Meta Ads (Facebook + Instagram)', icon: 'f', color: '#1877F2', status: 'active', spend: 2205000, revenue: 9113350, leads: 835, qualLeads: 419, sales: 130, romi: 313, campaignIds: ['c1','c2','c3','c4'] },
  { id: 'google', name: 'Google Ads', icon: 'G', color: '#4285F4', status: 'active', spend: 680000, revenue: 2420000, leads: 214, qualLeads: 98, sales: 32, romi: 256, campaignIds: ['c5','c6'] },
  { id: 'yandex', name: 'Яндекс Директ', icon: 'Я', color: '#FC3F1D', status: 'paused', spend: 320000, revenue: 890000, leads: 95, qualLeads: 41, sales: 12, romi: 178, campaignIds: ['c7'] },
  { id: 'tiktok', name: 'TikTok Ads', icon: 'T', color: '#000000', status: 'active', spend: 450000, revenue: 1680000, leads: 312, qualLeads: 87, sales: 24, romi: 273, campaignIds: ['c8'] },
  { id: '2gis', name: '2GIS Реклама', icon: '2', color: '#2DB829', status: 'active', spend: 150000, revenue: 520000, leads: 68, qualLeads: 32, sales: 9, romi: 247, campaignIds: ['c9'] },
];

// ─── CAMPAIGNS ───────────────────────────────────────────────
interface Campaign {
  id: string;
  channelId: string;
  name: string;
  status: 'active' | 'paused' | 'completed';
  budget: number;
  budgetType: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualLeads: number;
  sales: number;
  romi: number;
  groupIds: string[];
}

const campaigns: Campaign[] = [
  { id: 'c1', channelId: 'meta', name: 'Кухни Алматы — Конверсии', status: 'active', budget: 750000, budgetType: '7 500/день', spend: 685000, revenue: 3120000, impressions: 420000, clicks: 5800, leads: 280, qualLeads: 142, sales: 48, romi: 356, groupIds: ['g1','g2'] },
  { id: 'c2', channelId: 'meta', name: 'Шкафы Астана — Трафик', status: 'active', budget: 500000, budgetType: '12 500/день', spend: 480000, revenue: 1890000, impressions: 310000, clicks: 4200, leads: 198, qualLeads: 89, sales: 28, romi: 294, groupIds: ['g3','g4'] },
  { id: 'c3', channelId: 'meta', name: 'Ретаргетинг — Все города', status: 'active', budget: 300000, budgetType: '5 000/день', spend: 280000, revenue: 1650000, impressions: 180000, clicks: 3100, leads: 167, qualLeads: 98, sales: 34, romi: 489, groupIds: ['g5'] },
  { id: 'c4', channelId: 'meta', name: 'Лид-магнит — Бесплатный дизайн', status: 'paused', budget: 850000, budgetType: '15 000/день', spend: 760000, revenue: 2453350, impressions: 580000, clicks: 7200, leads: 190, qualLeads: 90, sales: 20, romi: 223, groupIds: ['g6','g7'] },
  { id: 'c5', channelId: 'google', name: 'Поиск — Кухни на заказ', status: 'active', budget: 400000, budgetType: '8 000/день', spend: 380000, revenue: 1520000, impressions: 95000, clicks: 3200, leads: 134, qualLeads: 62, sales: 21, romi: 300, groupIds: ['g8'] },
  { id: 'c6', channelId: 'google', name: 'КМС — Мебель ремаркетинг', status: 'active', budget: 350000, budgetType: '6 000/день', spend: 300000, revenue: 900000, impressions: 520000, clicks: 2800, leads: 80, qualLeads: 36, sales: 11, romi: 200, groupIds: ['g9'] },
  { id: 'c7', channelId: 'yandex', name: 'РСЯ — Мебель Казахстан', status: 'paused', budget: 350000, budgetType: '7 000/день', spend: 320000, revenue: 890000, impressions: 280000, clicks: 2100, leads: 95, qualLeads: 41, sales: 12, romi: 178, groupIds: ['g10'] },
  { id: 'c8', channelId: 'tiktok', name: 'TikTok — Видео кухни', status: 'active', budget: 500000, budgetType: '10 000/день', spend: 450000, revenue: 1680000, impressions: 1200000, clicks: 8900, leads: 312, qualLeads: 87, sales: 24, romi: 273, groupIds: ['g11'] },
  { id: 'c9', channelId: '2gis', name: '2GIS — Приоритетное размещение', status: 'active', budget: 180000, budgetType: '30 000/мес', spend: 150000, revenue: 520000, impressions: 45000, clicks: 1200, leads: 68, qualLeads: 32, sales: 9, romi: 247, groupIds: ['g12'] },
];

// ─── AD GROUPS ───────────────────────────────────────────────
interface AdGroup {
  id: string;
  campaignId: string;
  name: string;
  targeting: string;
  status: 'active' | 'paused';
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualLeads: number;
  sales: number;
  romi: number;
  adIds: number[];
}

const adGroups: AdGroup[] = [
  { id: 'g1', campaignId: 'c1', name: 'Без интересов 25-45 Алматы', targeting: 'Жен. 25-45, Алматы', status: 'active', spend: 385000, revenue: 1920000, impressions: 245000, clicks: 3400, leads: 168, qualLeads: 86, sales: 29, romi: 399, adIds: [1, 5] },
  { id: 'g2', campaignId: 'c1', name: 'Интерес: ремонт + мебель', targeting: 'Все 25-50, интерес ремонт', status: 'active', spend: 300000, revenue: 1200000, impressions: 175000, clicks: 2400, leads: 112, qualLeads: 56, sales: 19, romi: 300, adIds: [3] },
  { id: 'g3', campaignId: 'c2', name: 'Lookalike покупателей', targeting: 'LAL 1% покупатели', status: 'active', spend: 280000, revenue: 1150000, impressions: 195000, clicks: 2600, leads: 118, qualLeads: 54, sales: 18, romi: 311, adIds: [2, 8] },
  { id: 'g4', campaignId: 'c2', name: 'Широкая Астана 25-55', targeting: 'Все 25-55, Астана', status: 'paused', spend: 200000, revenue: 740000, impressions: 115000, clicks: 1600, leads: 80, qualLeads: 35, sales: 10, romi: 270, adIds: [4] },
  { id: 'g5', campaignId: 'c3', name: 'Ретаргетинг сайт 30 дней', targeting: 'Посетители сайта', status: 'active', spend: 280000, revenue: 1650000, impressions: 180000, clicks: 3100, leads: 167, qualLeads: 98, sales: 34, romi: 489, adIds: [7] },
  { id: 'g6', campaignId: 'c4', name: 'Adventage+ автоматика', targeting: 'Advantage+ targeting', status: 'active', spend: 420000, revenue: 1453350, impressions: 340000, clicks: 4200, leads: 110, qualLeads: 52, sales: 12, romi: 246, adIds: [3, 6] },
  { id: 'g7', campaignId: 'c4', name: 'Вручную: женщины 28-45', targeting: 'Жен 28-45, интерес дизайн', status: 'paused', spend: 340000, revenue: 1000000, impressions: 240000, clicks: 3000, leads: 80, qualLeads: 38, sales: 8, romi: 194, adIds: [1] },
  { id: 'g8', campaignId: 'c5', name: 'Поиск — Кухни на заказ КЗ', targeting: 'Ключ: кухни на заказ', status: 'active', spend: 380000, revenue: 1520000, impressions: 95000, clicks: 3200, leads: 134, qualLeads: 62, sales: 21, romi: 300, adIds: [1, 5] },
  { id: 'g9', campaignId: 'c6', name: 'КМС — Мебельные сайты', targeting: 'Площадки: мебель, ремонт', status: 'active', spend: 300000, revenue: 900000, impressions: 520000, clicks: 2800, leads: 80, qualLeads: 36, sales: 11, romi: 200, adIds: [2, 4] },
  { id: 'g10', campaignId: 'c7', name: 'РСЯ — Мебель широкая', targeting: 'Авто: мебель, кухни', status: 'paused', spend: 320000, revenue: 890000, impressions: 280000, clicks: 2100, leads: 95, qualLeads: 41, sales: 12, romi: 178, adIds: [6] },
  { id: 'g11', campaignId: 'c8', name: 'TikTok — Видео 15сек', targeting: 'Все 18-35, интерес дом', status: 'active', spend: 450000, revenue: 1680000, impressions: 1200000, clicks: 8900, leads: 312, qualLeads: 87, sales: 24, romi: 273, adIds: [6, 3] },
  { id: 'g12', campaignId: 'c9', name: '2GIS — Карточка компании', targeting: 'Геотаргетинг', status: 'active', spend: 150000, revenue: 520000, impressions: 45000, clicks: 1200, leads: 68, qualLeads: 32, sales: 9, romi: 247, adIds: [1] },
];

// ─── ADS ─────────────────────────────────────────────────────
interface Ad {
  id: number;
  name: string;
  creative: string;
  type: 'image' | 'video' | 'carousel';
  status: 'active' | 'paused' | 'rejected';
  spend: number;
  revenue: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  metaLeads: number;
  waLeads: number;
  qualLeads: number;
  sales: number;
  romi: number;
}

const adsData: Ad[] = [
  { id: 1, name: 'Кухни на заказ — скидка 20%', creative: creativeImages[0], type: 'image', status: 'active', spend: 485000, revenue: 2565210, impressions: 210000, reach: 185000, clicks: 2847, ctr: 1.36, metaLeads: 412, waLeads: 124, qualLeads: 68, sales: 23, romi: 429 },
  { id: 2, name: 'Шкаф-купе 3D визуал', creative: creativeImages[1], type: 'video', status: 'active', spend: 320000, revenue: 1250440, impressions: 168000, reach: 142000, clicks: 1932, ctr: 1.15, metaLeads: 289, waLeads: 87, qualLeads: 41, sales: 14, romi: 291 },
  { id: 3, name: 'Бесплатный дизайн-проект', creative: creativeImages[2], type: 'image', status: 'active', spend: 590000, revenue: 2321830, impressions: 345000, reach: 298000, clicks: 4215, ctr: 1.22, metaLeads: 634, waLeads: 203, qualLeads: 95, sales: 31, romi: 294 },
  { id: 4, name: 'Гардеробная мечты', creative: creativeImages[3], type: 'carousel', status: 'paused', spend: 275000, revenue: 1027680, impressions: 112000, reach: 95000, clicks: 1456, ctr: 1.30, metaLeads: 198, waLeads: 62, qualLeads: 29, sales: 8, romi: 274 },
  { id: 5, name: 'Акция -20% на кухни', creative: creativeImages[4], type: 'image', status: 'active', spend: 410000, revenue: 1526180, impressions: 265000, reach: 220000, clicks: 3678, ctr: 1.39, metaLeads: 521, waLeads: 156, qualLeads: 72, sales: 19, romi: 272 },
  { id: 6, name: 'Видео-отзыв клиента', creative: creativeImages[5], type: 'video', status: 'active', spend: 180000, revenue: 778220, impressions: 92000, reach: 78000, clicks: 892, ctr: 0.97, metaLeads: 134, waLeads: 34, qualLeads: 18, sales: 6, romi: 332 },
  { id: 7, name: 'Ретаргетинг — сайт', creative: creativeImages[6], type: 'image', status: 'active', spend: 195000, revenue: 898390, impressions: 89000, reach: 65000, clicks: 1245, ctr: 1.40, metaLeads: 187, waLeads: 78, qualLeads: 52, sales: 17, romi: 361 },
  { id: 8, name: 'Lookalike — покупатели', creative: creativeImages[7], type: 'image', status: 'active', spend: 350000, revenue: 967560, impressions: 189000, reach: 156000, clicks: 2134, ctr: 1.13, metaLeads: 312, waLeads: 91, qualLeads: 44, sales: 12, romi: 176 },
];

interface AdAnalyticsProps {
  language: 'kz' | 'ru' | 'eng';
}

type TabType = 'channels' | 'campaigns' | 'groups' | 'ads';
type SortDir = 'asc' | 'desc';

const formatNum = (n: number) => n.toLocaleString('ru-RU');
const formatMoney = (n: number) => `${formatNum(Math.round(n))} ₸`;
const shortMoney = (n: number) => {
  if (n >= 1000000) return `${(n/1000000).toFixed(1)} млн ₸`;
  if (n >= 1000) return `${Math.round(n/1000)}K ₸`;
  return `${n} ₸`;
};

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    active: 'bg-green-50 text-green-700',
    paused: 'bg-yellow-50 text-yellow-700',
    completed: 'bg-gray-100 text-gray-500',
    error: 'bg-red-50 text-red-600',
    rejected: 'bg-red-50 text-red-600',
  };
  const labels: Record<string, string> = {
    active: 'Активно', paused: 'Пауза', completed: 'Завершено', error: 'Ошибка', rejected: 'Отклонено',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${styles[status] || 'bg-gray-100 text-gray-500'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-green-500' : status === 'paused' ? 'bg-yellow-500' : status === 'error' || status === 'rejected' ? 'bg-red-500' : 'bg-gray-400'}`} />
      {labels[status] || status}
    </span>
  );
};

const RomiCell = ({ value }: { value: number }) => (
  <span className={value > 300 ? 'text-green-600' : value > 100 ? 'text-yellow-600' : 'text-red-500'}>
    {value}%
  </span>
);

const SortHeader = ({ label, field, currentSort, currentDir, onSort }: { label: string; field: string; currentSort: string | null; currentDir: SortDir; onSort: (f: string) => void }) => (
  <th className="px-3 py-3 text-right text-xs text-gray-500 cursor-pointer select-none hover:text-gray-700 whitespace-nowrap" onClick={() => onSort(field)}>
    <span className="inline-flex items-center gap-1 justify-end">
      {label}
      <ArrowUpDown className={`w-3 h-3 ${currentSort === field ? 'text-green-600' : 'text-gray-300'}`} />
    </span>
  </th>
);

export function AdAnalytics({ language }: AdAnalyticsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('ads');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string | null>('romi');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Drill-down state
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Breadcrumb navigation
  const breadcrumbs: { label: string; onClick: () => void }[] = [];
  if (selectedChannelId) {
    const ch = channels.find(c => c.id === selectedChannelId);
    breadcrumbs.push({ label: ch?.name || '', onClick: () => { setSelectedCampaignId(null); setSelectedGroupId(null); setActiveTab('campaigns'); } });
  }
  if (selectedCampaignId) {
    const cm = campaigns.find(c => c.id === selectedCampaignId);
    breadcrumbs.push({ label: cm?.name || '', onClick: () => { setSelectedGroupId(null); setActiveTab('groups'); } });
  }
  if (selectedGroupId) {
    const gr = adGroups.find(g => g.id === selectedGroupId);
    breadcrumbs.push({ label: gr?.name || '', onClick: () => setActiveTab('ads') });
  }

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const sortItems = <T extends Record<string, any>>(items: T[]) => {
    if (!sortField) return items;
    return [...items].sort((a, b) => {
      const va = a[sortField] ?? 0;
      const vb = b[sortField] ?? 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  };

  const filterBySearch = <T extends { name: string }>(items: T[]) =>
    searchQuery ? items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())) : items;

  // Compute totals for current view
  const computeTotals = () => {
    let data: { spend: number; revenue: number; leads: number; qualLeads: number; sales: number }[];
    if (activeTab === 'channels') data = channels;
    else if (activeTab === 'campaigns') {
      data = selectedChannelId ? campaigns.filter(c => c.channelId === selectedChannelId) : campaigns;
    } else if (activeTab === 'groups') {
      let filtered = adGroups;
      if (selectedCampaignId) filtered = filtered.filter(g => g.campaignId === selectedCampaignId);
      else if (selectedChannelId) {
        const campIds = campaigns.filter(c => c.channelId === selectedChannelId).map(c => c.id);
        filtered = filtered.filter(g => campIds.includes(g.campaignId));
      }
      data = filtered;
    } else {
      data = adsData.map(a => ({ spend: a.spend, revenue: a.revenue, leads: a.waLeads, qualLeads: a.qualLeads, sales: a.sales }));
    }
    const totalSpend = data.reduce((s, i) => s + i.spend, 0);
    const totalRevenue = data.reduce((s, i) => s + i.revenue, 0);
    const totalLeads = data.reduce((s, i) => s + i.leads, 0);
    const totalQualLeads = data.reduce((s, i) => s + i.qualLeads, 0);
    const totalSales = data.reduce((s, i) => s + i.sales, 0);
    const romi = totalSpend > 0 ? Math.round(((totalRevenue - totalSpend) / totalSpend) * 100) : 0;
    return { totalSpend, totalRevenue, totalLeads, totalQualLeads, totalSales, romi };
  };

  const totals = computeTotals();
  const revenuePercent = totals.totalRevenue + totals.totalSpend > 0 ? (totals.totalRevenue / (totals.totalRevenue + totals.totalSpend)) * 100 : 50;
  const cpl = totals.totalLeads > 0 ? totals.totalSpend / totals.totalLeads : 0;
  const cpql = totals.totalQualLeads > 0 ? totals.totalSpend / totals.totalQualLeads : 0;
  const cps = totals.totalSales > 0 ? totals.totalSpend / totals.totalSales : 0;
  const avgCheck = totals.totalSales > 0 ? totals.totalRevenue / totals.totalSales : 0;
  const romiAngle = Math.min(totals.romi / 500 * 180, 180);

  const drillDown = (tab: TabType, id: string) => {
    if (tab === 'channels') {
      setSelectedChannelId(id);
      setSelectedCampaignId(null);
      setSelectedGroupId(null);
      setActiveTab('campaigns');
    } else if (tab === 'campaigns') {
      setSelectedCampaignId(id);
      setSelectedGroupId(null);
      setActiveTab('groups');
    } else if (tab === 'groups') {
      setSelectedGroupId(id);
      setActiveTab('ads');
    }
  };

  const goBack = () => {
    if (activeTab === 'ads' && selectedGroupId) { setSelectedGroupId(null); setActiveTab('groups'); }
    else if (activeTab === 'groups' && selectedCampaignId) { setSelectedCampaignId(null); setActiveTab('campaigns'); }
    else if (activeTab === 'campaigns' && selectedChannelId) { setSelectedChannelId(null); setActiveTab('channels'); }
  };

  const handleTabClick = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'channels') { setSelectedChannelId(null); setSelectedCampaignId(null); setSelectedGroupId(null); }
    else if (tab === 'campaigns') { setSelectedCampaignId(null); setSelectedGroupId(null); }
    else if (tab === 'groups') { setSelectedGroupId(null); }
  };

  // Best performing ad for AI insight
  const bestAd = adsData.reduce((a, b) => a.romi > b.romi ? a : b);

  return (
    <div>
      {/* Top Summary Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        {/* Funnel */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-3">Воронка: от показа до продажи</div>
          <div className="flex items-end justify-between gap-1">
            {[
              { label: 'Лиды Meta', value: adsData.reduce((s,a) => s + a.metaLeads, 0) },
              { label: 'Лиды WA', value: totals.totalLeads },
              { label: 'Квал. лиды', value: totals.totalQualLeads },
              { label: 'Продажи', value: totals.totalSales },
            ].map((step, i, arr) => {
              const maxVal = arr[0].value;
              const barHeight = Math.max(24, (step.value / maxVal) * 100);
              const pct = i === 0 ? '100%' : `${((step.value / arr[0].value) * 100).toFixed(1)}%`;
              const colors = ['#3B82F6', '#22C55E', '#F59E0B', '#10B981'];
              return (
                <div key={step.label} className="flex flex-col items-center flex-1 min-w-0">
                  <div className="text-sm text-gray-900 mb-0.5">{formatNum(step.value)}</div>
                  <div className="text-[10px] text-gray-500 mb-1">{pct}</div>
                  <div className="w-full rounded-t-md" style={{ height: `${barHeight}px`, backgroundColor: colors[i] }} />
                  <div className="text-[10px] text-gray-500 mt-1.5 truncate w-full text-center">{step.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Revenue / Expenses + KPIs */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-2">Доход / Расходы</div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-green-600">{shortMoney(totals.totalRevenue)}</span>
            <span className="text-sm text-red-500">{shortMoney(totals.totalSpend)}</span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex mb-4">
            <div className="h-full bg-green-500 rounded-l-full transition-all" style={{ width: `${revenuePercent}%` }} />
            <div className="h-full bg-red-400 rounded-r-full transition-all" style={{ width: `${100 - revenuePercent}%` }} />
          </div>
          <div className="grid grid-cols-4 gap-x-4 gap-y-2 text-xs">
            <div><span className="text-gray-400">CPL</span><div className="text-gray-900">{formatMoney(cpl)}</div></div>
            <div><span className="text-gray-400">CpqL</span><div className="text-gray-900">{formatMoney(cpql)}</div></div>
            <div><span className="text-gray-400">CPS</span><div className="text-gray-900">{formatMoney(cps)}</div></div>
            <div><span className="text-gray-400">Ср. чек</span><div className="text-gray-900">{formatMoney(avgCheck)}</div></div>
          </div>
        </div>

        {/* ROMI Gauge */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center justify-center">
          <div className="text-xs text-gray-500 mb-2">ROMI</div>
          <div className="relative w-28 h-16 mb-1">
            <svg viewBox="0 0 120 70" className="w-full h-full">
              <defs>
                <linearGradient id="romiGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#EF4444" />
                  <stop offset="33%" stopColor="#F59E0B" />
                  <stop offset="66%" stopColor="#10B981" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>
              <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="#E5E7EB" strokeWidth="8" strokeLinecap="round" />
              <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="url(#romiGrad)" strokeWidth="8" strokeLinecap="round" strokeDasharray="157" strokeDashoffset={157 - (romiAngle / 180) * 157} />
              <line x1="60" y1="60" x2={60 + 40 * Math.cos(Math.PI - (romiAngle / 180) * Math.PI)} y2={60 - 40 * Math.sin(Math.PI - (romiAngle / 180) * Math.PI)} stroke="#374151" strokeWidth="2" strokeLinecap="round" />
              <circle cx="60" cy="60" r="4" fill="#374151" />
            </svg>
          </div>
          <div className="text-2xl text-green-600">{totals.romi}%</div>
        </div>
      </div>

      {/* AI Insight → replaced with neutral info block */}
      <div className="border border-gray-100 bg-gray-50 rounded-xl px-4 py-3 mb-5 flex items-center gap-4">
        <div className="w-9 h-9 bg-white border border-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <BarChart3 className="w-4 h-4 text-gray-400" />
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-0.5">Лучший креатив за период</div>
          <div className="text-sm text-gray-900">«{bestAd.name}»</div>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs text-gray-500">ROMI <span className="text-green-600">{bestAd.romi}%</span></span>
            <span className="text-xs text-gray-500">{bestAd.sales} продаж</span>
            <span className="text-xs text-gray-500">{bestAd.metaLeads} лидов</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 mb-4 border-b border-gray-200 overflow-x-auto">
        {breadcrumbs.length > 0 && (
          <button onClick={goBack} className="px-2 py-2.5 text-gray-400 hover:text-gray-600 mr-1 flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        {([
          { key: 'channels' as TabType, label: 'Каналы', count: channels.length },
          { key: 'campaigns' as TabType, label: 'Кампании', count: selectedChannelId ? campaigns.filter(c => c.channelId === selectedChannelId).length : campaigns.length },
          { key: 'groups' as TabType, label: 'Группы', count: (() => { let g = adGroups; if (selectedCampaignId) g = g.filter(x => x.campaignId === selectedCampaignId); else if (selectedChannelId) { const cids = campaigns.filter(c => c.channelId === selectedChannelId).map(c => c.id); g = g.filter(x => cids.includes(x.campaignId)); } return g.length; })() },
          { key: 'ads' as TabType, label: 'Объявления', count: adsData.length },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabClick(tab.key)}
            className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key ? 'border-green-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{tab.count}</span>
          </button>
        ))}

        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <div className="ml-4 flex items-center gap-1 text-xs text-gray-400 py-2 flex-shrink-0">
            {breadcrumbs.map((bc, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                <button onClick={bc.onClick} className="hover:text-gray-700 truncate max-w-[120px]">{bc.label}</button>
              </span>
            ))}
          </div>
        )}

        {/* Right side totals */}
        <div className="ml-auto flex items-center gap-4 pb-1 text-xs text-gray-500 flex-shrink-0 pr-2">
          <span>Лиды <span className="text-gray-900">{totals.totalLeads}</span></span>
          <span>Квал. <span className="text-gray-900">{totals.totalQualLeads}</span></span>
          <span>Продажи <span className="text-green-600">{totals.totalSales}</span></span>
        </div>
      </div>

      {/* Search & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span>01.03.2026 – 03.04.2026</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-300 transition-colors">
            <Download className="w-4 h-4" />
            Экспорт
          </button>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
        </div>
      </div>

      {/* TABLE CONTENT BASED ON TAB */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          {activeTab === 'channels' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  <th className="px-4 py-3 text-left text-xs text-gray-500">Канал</th>
                  <th className="px-3 py-3 text-left text-xs text-gray-500">Статус</th>
                  <SortHeader label="Расход" field="spend" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Доход" field="revenue" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Лиды" field="leads" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Квал. лиды" field="qualLeads" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Продажи" field="sales" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="ROMI" field="romi" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortItems(filterBySearch(channels)).map(ch => (
                  <tr key={ch.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => drillDown('channels', ch.id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs" style={{ backgroundColor: ch.color }}>
                          {ch.icon}
                        </div>
                        <span className="text-gray-900">{ch.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={ch.status} /></td>
                    <td className="px-3 py-3 text-right text-gray-900 whitespace-nowrap">{formatMoney(ch.spend)}</td>
                    <td className="px-3 py-3 text-right text-gray-900 whitespace-nowrap">{formatMoney(ch.revenue)}</td>
                    <td className="px-3 py-3 text-right text-gray-900">{ch.leads}</td>
                    <td className="px-3 py-3 text-right text-gray-900">{ch.qualLeads}</td>
                    <td className="px-3 py-3 text-right text-gray-900">{ch.sales}</td>
                    <td className="px-3 py-3 text-right"><RomiCell value={ch.romi} /></td>
                    <td className="px-3 py-3"><ChevronRight className="w-4 h-4 text-gray-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'campaigns' && (() => {
            let filtered = campaigns;
            if (selectedChannelId) filtered = filtered.filter(c => c.channelId === selectedChannelId);
            return (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50">
                    <th className="px-4 py-3 text-left text-xs text-gray-500">Кампания</th>
                    <th className="px-3 py-3 text-left text-xs text-gray-500">Статус</th>
                    <th className="px-3 py-3 text-left text-xs text-gray-500">Бюджет</th>
                    <SortHeader label="Расход" field="spend" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Доход" field="revenue" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Клики" field="clicks" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Лиды" field="leads" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Квал." field="qualLeads" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Продажи" field="sales" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="ROMI" field="romi" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <th className="px-3 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortItems(filterBySearch(filtered)).map(cm => {
                    const ch = channels.find(c => c.id === cm.channelId);
                    return (
                      <tr key={cm.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => drillDown('campaigns', cm.id)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded flex items-center justify-center text-white text-[10px]" style={{ backgroundColor: ch?.color || '#888' }}>
                              {ch?.icon}
                            </div>
                            <div>
                              <div className="text-gray-900">{cm.name}</div>
                              <div className="text-xs text-gray-400">{ch?.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3"><StatusBadge status={cm.status} /></td>
                        <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{cm.budgetType}</td>
                        <td className="px-3 py-3 text-right text-gray-900 whitespace-nowrap text-xs">{formatMoney(cm.spend)}</td>
                        <td className="px-3 py-3 text-right text-gray-900 whitespace-nowrap text-xs">{formatMoney(cm.revenue)}</td>
                        <td className="px-3 py-3 text-right text-gray-900 text-xs">{formatNum(cm.clicks)}</td>
                        <td className="px-3 py-3 text-right text-gray-900 text-xs">{cm.leads}</td>
                        <td className="px-3 py-3 text-right text-gray-900 text-xs">{cm.qualLeads}</td>
                        <td className="px-3 py-3 text-right text-gray-900 text-xs">{cm.sales}</td>
                        <td className="px-3 py-3 text-right text-xs"><RomiCell value={cm.romi} /></td>
                        <td className="px-3 py-3"><ChevronRight className="w-4 h-4 text-gray-300" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}

          {activeTab === 'groups' && (() => {
            let filtered = adGroups;
            if (selectedCampaignId) filtered = filtered.filter(g => g.campaignId === selectedCampaignId);
            else if (selectedChannelId) {
              const cids = campaigns.filter(c => c.channelId === selectedChannelId).map(c => c.id);
              filtered = filtered.filter(g => cids.includes(g.campaignId));
            }
            return (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50">
                    <th className="px-4 py-3 text-left text-xs text-gray-500">Группа объявлений</th>
                    <th className="px-3 py-3 text-left text-xs text-gray-500">Таргетинг</th>
                    <th className="px-3 py-3 text-left text-xs text-gray-500">Статус</th>
                    <SortHeader label="Расход" field="spend" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Доход" field="revenue" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Клики" field="clicks" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Лиды" field="leads" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Квал." field="qualLeads" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Продажи" field="sales" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="ROMI" field="romi" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <th className="px-3 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortItems(filterBySearch(filtered)).map(gr => {
                    const cm = campaigns.find(c => c.id === gr.campaignId);
                    return (
                      <tr key={gr.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => drillDown('groups', gr.id)}>
                        <td className="px-4 py-3">
                          <div>
                            <div className="text-gray-900">{gr.name}</div>
                            <div className="text-xs text-gray-400">{cm?.name}</div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500 max-w-[140px] truncate">{gr.targeting}</td>
                        <td className="px-3 py-3"><StatusBadge status={gr.status} /></td>
                        <td className="px-3 py-3 text-right text-gray-900 whitespace-nowrap text-xs">{formatMoney(gr.spend)}</td>
                        <td className="px-3 py-3 text-right text-gray-900 whitespace-nowrap text-xs">{formatMoney(gr.revenue)}</td>
                        <td className="px-3 py-3 text-right text-gray-900 text-xs">{formatNum(gr.clicks)}</td>
                        <td className="px-3 py-3 text-right text-gray-900 text-xs">{gr.leads}</td>
                        <td className="px-3 py-3 text-right text-gray-900 text-xs">{gr.qualLeads}</td>
                        <td className="px-3 py-3 text-right text-gray-900 text-xs">{gr.sales}</td>
                        <td className="px-3 py-3 text-right text-xs"><RomiCell value={gr.romi} /></td>
                        <td className="px-3 py-3"><ChevronRight className="w-4 h-4 text-gray-300" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}

          {activeTab === 'ads' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  <th className="px-4 py-3 text-left text-xs text-gray-500">Креатив</th>
                  <th className="px-3 py-3 text-left text-xs text-gray-500">Название</th>
                  <th className="px-3 py-3 text-left text-xs text-gray-500">Тип</th>
                  <th className="px-3 py-3 text-left text-xs text-gray-500">Статус</th>
                  <SortHeader label="Расход" field="spend" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Показы" field="impressions" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Клики" field="clicks" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="CTR" field="ctr" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Лиды Meta" field="metaLeads" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Лиды WA" field="waLeads" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Квал." field="qualLeads" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Продажи" field="sales" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Доход" field="revenue" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="ROMI" field="romi" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortItems(filterBySearch(adsData)).map(ad => {
                  const typeLabels: Record<string, string> = { image: 'Фото', video: 'Видео', carousel: 'Карусель' };
                  return (
                    <tr key={ad.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-2">
                        <img src={ad.creative} alt="" className="w-12 h-16 object-cover rounded-lg" />
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-gray-900 max-w-[140px]">{ad.name}</div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{typeLabels[ad.type]}</span>
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={ad.status} /></td>
                      <td className="px-3 py-3 text-right text-gray-900 whitespace-nowrap text-xs">{formatMoney(ad.spend)}</td>
                      <td className="px-3 py-3 text-right text-gray-900 text-xs">{formatNum(ad.impressions)}</td>
                      <td className="px-3 py-3 text-right text-gray-900 text-xs">{formatNum(ad.clicks)}</td>
                      <td className="px-3 py-3 text-right text-gray-900 text-xs">{ad.ctr.toFixed(2)}%</td>
                      <td className="px-3 py-3 text-right text-xs">
                        <span className="text-blue-600">{ad.metaLeads}</span>
                      </td>
                      <td className="px-3 py-3 text-right text-xs">
                        <span className="text-green-600">{ad.waLeads}</span>
                      </td>
                      <td className="px-3 py-3 text-right text-xs">
                        <span className="text-yellow-600">{ad.qualLeads}</span>
                      </td>
                      <td className="px-3 py-3 text-right text-xs">
                        <span className="px-2 py-0.5 rounded bg-green-50 text-green-700">{ad.sales}</span>
                      </td>
                      <td className="px-3 py-3 text-right text-gray-900 whitespace-nowrap text-xs">{formatMoney(ad.revenue)}</td>
                      <td className="px-3 py-3 text-right text-xs"><RomiCell value={ad.romi} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}