import { useEffect, useMemo, useState } from 'react';
import {
  Home, Package, Truck, MessageCircle, CreditCard, Box, Gift, Star, Phone, Settings as SettingsIcon,
  LogOut, Search, ChevronRight, Share2, Send, Mic, Paperclip, Download, FileText,
  ShieldAlert, Sparkles, CheckCircle2, Clock, Loader2, Camera, Instagram, Plus, Tag, Bell,
} from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import profileLogo from '../../imports/utirsoft.png';
import { useDataStore, type Deal } from '../utils/dataStore';
import { ClientCabinetMap, type MapMarker } from './ClientCabinetMap';
import type { ClientSession } from './ClientAuth';

type Lang = 'kz' | 'ru' | 'eng';
type PageId = 'home' | 'orders' | 'tracking' | 'chats' | 'payments' | 'ar' | 'bonus' | 'reviews' | 'support' | 'settings';

const KITCHEN_IMG = 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800';
const WARDROBE_IMG = 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800';
const CLOSET_IMG = 'https://images.unsplash.com/photo-1558997519-83ea9252edf8?w=800';

const tl = (lang: Lang, ru: string, kz: string, eng: string) => lang === 'kz' ? kz : lang === 'eng' ? eng : ru;

// Almaty coords
const PRODUCTION: [number, number] = [43.2480, 76.9100];
const CLIENT_HOME: [number, number] = [43.2275, 76.8512];

function useCourierLocation() {
  const [pos, setPos] = useState<[number, number]>(PRODUCTION);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setProgress(p => {
        const next = (p + 0.04) % 1;
        const wobble = Math.sin(next * Math.PI * 4) * 0.0015;
        const lat = PRODUCTION[0] + (CLIENT_HOME[0] - PRODUCTION[0]) * next + wobble;
        const lng = PRODUCTION[1] + (CLIENT_HOME[1] - PRODUCTION[1]) * next + wobble;
        setPos([lat, lng]);
        return next;
      });
    }, 2200);
    return () => clearInterval(id);
  }, []);
  return { pos, progress };
}

const NAV: { id: PageId; ru: string; kz: string; eng: string; icon: any }[] = [
  { id: 'home', ru: 'Главная', kz: 'Басты', eng: 'Home', icon: Home },
  { id: 'orders', ru: 'Мои заказы', kz: 'Тапсырыстарым', eng: 'My orders', icon: Package },
  { id: 'tracking', ru: 'Отслеживание', kz: 'Бақылау', eng: 'Tracking', icon: Truck },
  { id: 'chats', ru: 'Чаты', kz: 'Чаттар', eng: 'Chats', icon: MessageCircle },
  { id: 'payments', ru: 'Оплаты', kz: 'Төлемдер', eng: 'Payments', icon: CreditCard },
  { id: 'ar', ru: 'AR-визуализация', kz: 'AR-көрсету', eng: 'AR view', icon: Box },
  { id: 'bonus', ru: 'Бонусы', kz: 'Бонустар', eng: 'Bonus', icon: Gift },
  { id: 'reviews', ru: 'Отзывы', kz: 'Пікірлер', eng: 'Reviews', icon: Star },
  { id: 'support', ru: 'Поддержка', kz: 'Қолдау', eng: 'Support', icon: Phone },
  { id: 'settings', ru: 'Настройки', kz: 'Баптаулар', eng: 'Settings', icon: SettingsIcon },
];

const STATUS_META: Record<string, { ru: string; kz: string; eng: string; cls: string; progress: number }> = {
  'new': { ru: 'Новый', kz: 'Жаңа', eng: 'New', cls: 'bg-gray-500', progress: 8 },
  'measure': { ru: 'Замер', kz: 'Өлшеу', eng: 'Measure', cls: 'bg-sky-500', progress: 25 },
  'design': { ru: 'Дизайн', kz: 'Дизайн', eng: 'Design', cls: 'bg-violet-500', progress: 40 },
  'production': { ru: 'В производстве', kz: 'Өндірісте', eng: 'In production', cls: 'bg-emerald-500', progress: 65 },
  'delivery': { ru: 'Доставка', kz: 'Жеткізу', eng: 'Delivery', cls: 'bg-teal-500', progress: 82 },
  'installation': { ru: 'Установка', kz: 'Орнату', eng: 'Installation', cls: 'bg-emerald-600', progress: 92 },
  'done': { ru: 'Завершён', kz: 'Аяқталған', eng: 'Done', cls: 'bg-emerald-500', progress: 100 },
};

function metaFor(status: string) {
  const key = status.toLowerCase();
  return STATUS_META[key] || STATUS_META['production'];
}

function imageFor(deal: Deal) {
  const t = (deal.furnitureType || deal.product || '').toLowerCase();
  if (t.includes('шкаф')) return WARDROBE_IMG;
  if (t.includes('гардероб')) return CLOSET_IMG;
  return KITCHEN_IMG;
}

export function ClientCabinet({ session, onLogout }: { session: ClientSession; onLogout: () => void }) {
  const store = useDataStore();
  const [page, setPage] = useState<PageId>('home');
  const [lang, setLang] = useState<Lang>('ru');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash;
      const sub = h.replace('#/cabinet', '').replace(/^\//, '');
      if (sub && NAV.some(n => n.id === sub)) setPage(sub as PageId);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const clientDeals = useMemo(() => {
    return store.deals.filter(d => d.customerName === session.name || d.phone === session.phone);
  }, [store.deals, session.name, session.phone]);

  const activeDeals = clientDeals.filter(d => d.status.toLowerCase() !== 'done');
  const totalActive = activeDeals.reduce((s, d) => s + (d.amount || 0), 0);
  const initials = session.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();

  const curNav = NAV.find(n => n.id === page);

  return (
    <div className="min-h-screen flex relative overflow-hidden" style={{ background: 'radial-gradient(circle at 0% 0%, #d1fae5 0%, transparent 45%), radial-gradient(circle at 100% 100%, #ccfbf1 0%, transparent 40%), radial-gradient(circle at 80% 10%, #ecfdf5 0%, transparent 50%), #f8fafc' }}>
      {/* Decorative blurry orbs for iOS feel */}
      <div className="pointer-events-none fixed -top-32 -left-20 w-96 h-96 rounded-full bg-emerald-300/30 blur-3xl" />
      <div className="pointer-events-none fixed top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full bg-teal-300/20 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-32 left-1/3 w-96 h-96 rounded-full bg-emerald-200/30 blur-3xl" />

      <aside className={`fixed lg:sticky lg:top-0 lg:h-screen inset-y-0 left-0 w-64 flex flex-col z-40 transition-transform ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} p-3`}>
        <div className="flex-1 flex flex-col bg-white/60 backdrop-blur-2xl border border-white/60 rounded-3xl shadow-[0_8px_32px_rgba(15,118,110,0.08)] overflow-hidden">
          <div className="p-4 border-b border-white/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl overflow-hidden bg-emerald-50/60 backdrop-blur flex items-center justify-center">
                <img src={profileLogo} className="w-full h-full object-cover" alt="Utir Soft" />
              </div>
              <div className="min-w-0">
                <div className="text-sm text-gray-900">Utir Soft</div>
                <div className="text-[10px] text-gray-500">{tl(lang, 'Кабинет клиента', 'Клиент кабинеті', 'Client cabinet')}</div>
              </div>
            </div>
          </div>

          <div className="p-3 border-b border-white/40">
            <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/50 backdrop-blur border border-white/60">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs shadow-inner">{initials}</div>
              <div className="min-w-0">
                <div className="text-sm text-gray-900 truncate">{session.name}</div>
                <div className="text-[11px] text-gray-500 truncate">{session.phone}</div>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
            {NAV.map(item => {
              const Icon = item.icon;
              const active = page === item.id;
              const badge = item.id === 'orders' && activeDeals.length > 0 ? String(activeDeals.length) : null;
              return (
                <button
                  key={item.id}
                  onClick={() => { setPage(item.id); setMobileOpen(false); window.location.hash = `#/cabinet/${item.id}`; }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
                    active
                      ? 'bg-white/80 backdrop-blur text-gray-900 shadow-sm border border-white/80'
                      : 'text-gray-600 hover:bg-white/40 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-emerald-600' : 'text-gray-400'}`} />
                  <span className="flex-1 text-left">{tl(lang, item.ru, item.kz, item.eng)}</span>
                  {badge && (
                    <span className="text-[10px] bg-emerald-500/90 text-white rounded-full px-1.5 py-0.5">{badge}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="p-3 border-t border-white/40 space-y-2">
            <div className="flex gap-1 bg-white/40 backdrop-blur rounded-xl p-1 border border-white/50">
              {(['kz', 'ru', 'eng'] as Lang[]).map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`flex-1 py-1 rounded-lg text-[10px] uppercase transition-all ${lang === l ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-500 hover:bg-red-50/70 hover:text-red-600 rounded-xl transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {tl(lang, 'Выйти', 'Шығу', 'Sign out')}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 relative">
        {/* Topbar */}
        <div className="sticky top-3 z-20 mx-3 lg:mx-4 bg-white/60 backdrop-blur-2xl border border-white/60 rounded-2xl shadow-[0_8px_32px_rgba(15,118,110,0.06)] px-4 lg:px-5 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden lg:flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-400/80" />
              <span className="w-3 h-3 rounded-full bg-amber-400/80" />
              <span className="w-3 h-3 rounded-full bg-emerald-400/80" />
            </div>
            <button onClick={() => setMobileOpen(true)} className="lg:hidden px-3 py-1.5 rounded-lg bg-gray-100 text-xs">Меню</button>
            <div className="min-w-0 lg:ml-2">
              <div className="text-sm text-gray-900 truncate">{curNav ? tl(lang, curNav.ru, curNav.kz, curNav.eng) : ''}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative hidden md:block">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                placeholder={tl(lang, 'Поиск...', 'Іздеу...', 'Search...')}
                className="w-48 pl-8 pr-3 py-1.5 text-xs bg-gray-100/80 border border-transparent rounded-lg focus:outline-none focus:bg-white focus:border-gray-200 transition-all"
              />
            </div>
            <button className="hidden md:flex w-8 h-8 items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title={tl(lang, 'Выйти', 'Шығу', 'Sign out')}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tl(lang, 'Выйти', 'Шығу', 'Sign out')}</span>
            </button>
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-[1400px]">
          {page === 'home' && <HomePage lang={lang} setPage={setPage} session={session} deals={clientDeals} activeDeals={activeDeals} totalActive={totalActive} />}
          {page === 'orders' && <OrdersPage lang={lang} deals={clientDeals} />}
          {page === 'tracking' && <TrackingPage lang={lang} deals={activeDeals.length ? activeDeals : clientDeals} />}
          {page === 'chats' && <ChatsPage lang={lang} />}
          {page === 'payments' && <PaymentsPage lang={lang} deals={clientDeals} />}
          {page === 'ar' && <ARPage lang={lang} deals={activeDeals.length ? activeDeals : clientDeals} />}
          {page === 'bonus' && <BonusPage lang={lang} />}
          {page === 'reviews' && <ReviewsPage lang={lang} deals={clientDeals.filter(d => d.status.toLowerCase() === 'done')} />}
          {page === 'support' && <SupportPage lang={lang} />}
          {page === 'settings' && <SettingsPage lang={lang} session={session} onLogout={onLogout} />}
        </div>
      </main>

      {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/40 z-30 lg:hidden" />}
    </div>
  );
}

// ─── HOME ────────────────────────────────────────────
function HomePage({
  lang, setPage, session, deals, activeDeals, totalActive,
}: {
  lang: Lang; setPage: (p: PageId) => void; session: ClientSession;
  deals: Deal[]; activeDeals: Deal[]; totalActive: number;
}) {
  const courier = useCourierLocation();
  const firstName = session.name.split(' ')[0];

  const markers: MapMarker[] = [
    { id: 'home', lat: CLIENT_HOME[0], lng: CLIENT_HOME[1], label: tl(lang, 'Вы здесь', 'Сіз осындасыз', 'You'), sub: 'ул. Абая 45', color: 'sky' },
    { id: 'prod', lat: PRODUCTION[0], lng: PRODUCTION[1], label: tl(lang, 'Производство', 'Өндіріс', 'Production'), sub: 'Utir Soft', color: 'gray' },
    { id: 'courier', lat: courier.pos[0], lng: courier.pos[1], label: tl(lang, 'Алихан · курьер', 'Алихан · курьер', 'Alikhan · courier'), sub: tl(lang, '~12 минут', '~12 минут', '~12 min'), color: 'emerald', initials: 'АМ' },
  ];

  const mainDeal = activeDeals[0] || deals[0];
  const secondaryDeal = activeDeals[1] || deals[1];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-gray-900">{tl(lang, `Здравствуйте, ${firstName}!`, `Сәлеметсіз бе, ${firstName}!`, `Hello, ${firstName}!`)} 👋</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeDeals.length > 0
              ? <>
                {tl(lang, `У вас ${activeDeals.length} активных заказа на сумму`, `Сізде ${activeDeals.length} белсенді тапсырыс, сомасы`, `You have ${activeDeals.length} active orders worth`)}{' '}
                <span className="text-gray-900 tabular-nums">{(totalActive / 1_000_000).toFixed(1)} млн ₸</span>
              </>
              : tl(lang, 'Активных заказов нет', 'Белсенді тапсырыс жоқ', 'No active orders')}
          </p>
        </div>
        <button onClick={() => setPage('orders')} className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors">
          {tl(lang, 'Все заказы', 'Барлық тапсырыс', 'All orders')} <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] p-4 hover:shadow-sm transition-shadow space-y-4">
        <ClientCabinetMap height={300} markers={markers} route={{ from: 'courier', to: 'home' }} center={[43.235, 76.88]} />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs">АМ</div>
            <div>
              <div className="text-sm text-gray-900">{tl(lang, 'Алихан подъезжает к вам', 'Алихан жақындап келе жатыр', 'Alikhan is approaching')}</div>
              <div className="text-xs text-gray-400">~12 минут · {tl(lang, 'обновлено сейчас', 'жаңартылды', 'updated now')}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-xl text-xs hover:bg-emerald-600 transition-colors">
              <Phone className="w-3.5 h-3.5" /> {tl(lang, 'Позвонить', 'Қоңырау', 'Call')}
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 transition-colors">
              <MessageCircle className="w-3.5 h-3.5" /> {tl(lang, 'Написать', 'Жазу', 'Message')}
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 bg-white/60 backdrop-blur-xl border border-white/60 text-gray-700 rounded-xl text-xs hover:bg-gray-50 transition-colors">
              <Share2 className="w-3.5 h-3.5" /> {tl(lang, 'Геолокация', 'Геолокация', 'Geo')}
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {mainDeal && <ActiveOrderCard lang={lang} deal={mainDeal} onOpen={() => setPage('orders')} accent="amber" detailed />}
        {secondaryDeal && <ActiveOrderCard lang={lang} deal={secondaryDeal} onOpen={() => setPage('orders')} accent="sky" />}
      </div>

      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}>
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute -right-16 -bottom-16 w-52 h-52 rounded-full bg-white/5" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2 text-[11px] text-white/80 uppercase tracking-wider">
            <Gift className="w-3.5 h-3.5" /> {tl(lang, 'Бонусные тенге', 'Бонус теңгелер', 'Bonus tenge')}
          </div>
          <div className="text-3xl mb-1 tabular-nums">12 500 ₸</div>
          <div className="text-sm text-white/80 mb-4">{tl(lang, 'Списать на следующий заказ — экономия до 30%', 'Келесі тапсырысқа жұмсаңыз — 30% дейін үнемдеу', 'Use on next order — save up to 30%')}</div>
          <div className="mb-4">
            <div className="flex justify-between text-[11px] text-white/80 mb-1.5">
              <span>{tl(lang, 'До статуса VIP', 'VIP мәртебесіне дейін', 'Until VIP')}</span>
              <span className="tabular-nums">87 500 ₸</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white" style={{ width: '38%' }} />
            </div>
          </div>
          <button onClick={() => setPage('bonus')} className="px-4 py-2 bg-white text-emerald-700 rounded-xl text-xs hover:bg-white/90 transition-colors">
            {tl(lang, 'Как получать больше', 'Көп алу жолдары', 'How to earn more')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActiveOrderCard({ lang, deal, onOpen, accent, detailed }: { lang: Lang; deal: Deal; onOpen: () => void; accent: 'amber' | 'sky'; detailed?: boolean }) {
  const meta = metaFor(deal.status);
  const img = imageFor(deal);
  const stages = [
    { st: meta.progress >= 8 ? 'done' : 'todo', title: tl(lang, 'Заявка принята', 'Қабылданды', 'Order accepted') },
    { st: meta.progress >= 25 ? 'done' : meta.progress >= 8 ? 'active' : 'todo', title: tl(lang, 'Замер выполнен', 'Өлшем жасалды', 'Measure done') },
    { st: meta.progress >= 40 ? 'done' : meta.progress >= 25 ? 'active' : 'todo', title: tl(lang, 'Договор и предоплата', 'Шарт және алдын ала төлем', 'Contract & advance') },
    { st: meta.progress >= 65 ? 'done' : meta.progress >= 40 ? 'active' : 'todo', title: tl(lang, 'В производстве', 'Өндірісте', 'In production') },
    { st: meta.progress >= 82 ? 'done' : meta.progress >= 65 ? 'active' : 'todo', title: tl(lang, 'Доставка', 'Жеткізу', 'Delivery') },
    { st: meta.progress >= 100 ? 'done' : meta.progress >= 82 ? 'active' : 'todo', title: tl(lang, 'Установлено', 'Орнатылды', 'Installed') },
  ] as const;
  const accentBar = accent === 'amber' ? 'from-emerald-400 to-emerald-600' : 'from-sky-400 to-blue-500';

  return (
    <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] overflow-hidden hover:shadow-sm transition-shadow">
      <div className="relative h-48">
        <ImageWithFallback src={img} alt={deal.product} className="w-full h-full object-cover" />
        <span className="absolute top-3 left-3 bg-white/95 backdrop-blur px-2.5 py-1 rounded-lg text-[10px] text-gray-700">#{deal.id}</span>
        <span className={`absolute top-3 right-3 ${meta.cls} text-white px-2.5 py-1 rounded-lg text-[10px]`}>
          {tl(lang, meta.ru, meta.kz, meta.eng)}
        </span>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <div className="text-sm text-gray-900">{deal.product}</div>
          <div className="text-xs text-gray-400">{tl(lang, 'Готовность', 'Дайын', 'Ready')}: {deal.completionDate || deal.installationDate || '—'}</div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] text-gray-500 mb-1">
            <span>{Math.round(meta.progress / 100 * 6)} / 6 {tl(lang, 'этапов', 'кезең', 'stages')}</span>
            <span className="text-gray-900 tabular-nums">{meta.progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full bg-gradient-to-r ${accentBar}`} style={{ width: `${meta.progress}%` }} />
          </div>
        </div>
        {detailed && (
          <div className="space-y-2 pt-2 border-t border-gray-50">
            {stages.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5">
                {s.st === 'done' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  : s.st === 'active' ? <Loader2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5 animate-spin" />
                  : <Clock className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />}
                <div className={`text-xs ${s.st === 'todo' ? 'text-gray-400' : 'text-gray-900'}`}>{s.title}</div>
              </div>
            ))}
          </div>
        )}
        <button onClick={onOpen} className="w-full mt-2 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 flex items-center justify-center gap-1.5 transition-colors">
          {tl(lang, 'Подробнее', 'Толығырақ', 'Details')} <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── ORDERS ──────────────────────────────────────────
function OrdersPage({ lang, deals }: { lang: Lang; deals: Deal[] }) {
  const [filter, setFilter] = useState<'active' | 'production' | 'delivery' | 'done' | 'all'>('all');
  const [query, setQuery] = useState('');

  const filtered = deals.filter(d => {
    const s = d.status.toLowerCase();
    const matchesFilter =
      filter === 'all' ||
      (filter === 'active' && s !== 'done') ||
      (filter === 'production' && s === 'production') ||
      (filter === 'delivery' && s === 'delivery') ||
      (filter === 'done' && s === 'done');
    const matchesQuery = !query || d.id.toLowerCase().includes(query.toLowerCase()) || d.product.toLowerCase().includes(query.toLowerCase());
    return matchesFilter && matchesQuery;
  });

  const counts = {
    active: deals.filter(d => d.status.toLowerCase() !== 'done').length,
    production: deals.filter(d => d.status.toLowerCase() === 'production').length,
    delivery: deals.filter(d => d.status.toLowerCase() === 'delivery').length,
    done: deals.filter(d => d.status.toLowerCase() === 'done').length,
    all: deals.length,
  };

  const FILTERS = [
    { id: 'all' as const, ru: 'Все', kz: 'Барлығы', eng: 'All' },
    { id: 'active' as const, ru: 'Активные', kz: 'Белсенді', eng: 'Active' },
    { id: 'production' as const, ru: 'В производстве', kz: 'Өндірісте', eng: 'In production' },
    { id: 'delivery' as const, ru: 'Доставка', kz: 'Жеткізу', eng: 'Delivery' },
    { id: 'done' as const, ru: 'Завершённые', kz: 'Аяқталған', eng: 'Done' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-gray-900">{tl(lang, 'Мои заказы', 'Тапсырыстарым', 'My orders')}</h1>
        <p className="text-sm text-gray-500 mt-1">{tl(lang, 'Все ваши заказы за всё время', 'Барлық уақыттағы тапсырыстар', 'All your orders ever')}</p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 bg-white/60 backdrop-blur-xl border border-white/60 rounded-xl p-1 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${filter === f.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}
            >
              {tl(lang, f.ru, f.kz, f.eng)} <span className="opacity-60">({counts[f.id]})</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={tl(lang, 'Поиск', 'Іздеу', 'Search')} className="w-full pl-9 pr-3 py-2 bg-white/60 backdrop-blur-xl border border-white/60 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {filtered.length === 0 && (
          <div className="md:col-span-2 bg-white/60 backdrop-blur-xl rounded-3xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
            {tl(lang, 'Заказов нет', 'Тапсырыс жоқ', 'No orders')}
          </div>
        )}
        {filtered.map(d => {
          const meta = metaFor(d.status);
          return (
            <div key={d.id} className="group bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] overflow-hidden hover:shadow-sm transition-all">
              <div className="relative h-40">
                <ImageWithFallback src={imageFor(d)} alt={d.product} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <span className="absolute top-3 left-3 bg-white/95 backdrop-blur px-2.5 py-1 rounded-lg text-[10px] text-gray-700">#{d.id}</span>
                <span className={`absolute top-3 right-3 ${meta.cls} text-white px-2.5 py-1 rounded-lg text-[10px]`}>{tl(lang, meta.ru, meta.kz, meta.eng)}</span>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-900 truncate">{d.product}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{d.date}</div>
                  </div>
                  <div className="text-sm text-gray-900 tabular-nums">{(d.amount / 1000).toFixed(0)}К ₸</div>
                </div>
                <div className="mb-3">
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>{tl(lang, 'Прогресс', 'Прогресс', 'Progress')}</span>
                    <span className="tabular-nums text-gray-700">{meta.progress}%</span>
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${meta.progress}%` }} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 transition-colors">{tl(lang, 'Открыть', 'Ашу', 'Open')}</button>
                  <button className="flex-1 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-xs hover:bg-emerald-100 transition-colors">{tl(lang, 'Повторить', 'Қайталау', 'Reorder')}</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TRACKING ────────────────────────────────────────
function TrackingPage({ lang, deals }: { lang: Lang; deals: Deal[] }) {
  const courier = useCourierLocation();
  const deal = deals[0];

  const markers: MapMarker[] = [
    { id: 'home', lat: CLIENT_HOME[0], lng: CLIENT_HOME[1], label: tl(lang, 'Ваш адрес', 'Сіздің мекенжай', 'Your address'), sub: 'ул. Абая 45', color: 'sky' },
    { id: 'prod', lat: PRODUCTION[0], lng: PRODUCTION[1], label: tl(lang, 'Производство', 'Өндіріс', 'Production'), sub: 'Utir Soft', color: 'gray' },
    { id: 'courier', lat: courier.pos[0], lng: courier.pos[1], label: tl(lang, 'Бригада', 'Бригада', 'Crew'), sub: 'Алихан · АМ', color: 'emerald', initials: 'АМ' },
  ];

  const TIMELINE = [
    { time: '09:30', text: tl(lang, 'Бригада начала погрузку', 'Бригада тиеуді бастады', 'Crew started loading'), done: true },
    { time: '10:15', text: tl(lang, 'Машина выехала из производства', 'Көлік өндірістен шықты', 'Truck left production'), done: true },
    { time: '11:00', text: tl(lang, 'Прибудет к вам (расчётное время)', 'Сізге жетеді (болжамды уақыт)', 'ETA to your address'), done: false },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-gray-900">{tl(lang, 'Отслеживание', 'Бақылау', 'Tracking')}</h1>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] p-3">
          <ClientCabinetMap height={520} markers={markers} route={{ from: 'courier', to: 'home' }} />
          <div className="mt-3 flex items-center gap-3 flex-wrap text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> {tl(lang, 'Ваш адрес', 'Сіздің мекенжай', 'Your address')}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-900" /> {tl(lang, 'Производство', 'Өндіріс', 'Production')}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {tl(lang, 'Бригада', 'Бригада', 'Crew')}</span>
          </div>
        </div>
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] p-5">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">{tl(lang, 'Ваш заказ', 'Тапсырысыңыз', 'Your order')}</div>
          <div className="text-base text-gray-900 mb-5">#{deal?.id || '—'} · {deal?.product || '—'}</div>
          <div className="space-y-4 relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-100" />
            {TIMELINE.map((step, i) => (
              <div key={i} className="flex gap-3 relative">
                <div className={`w-4 h-4 rounded-full mt-0.5 flex-shrink-0 ${step.done ? 'bg-emerald-500' : 'bg-white border-2 border-emerald-400'}`} />
                <div className="flex-1">
                  <div className="text-[11px] text-gray-400">{step.time}</div>
                  <div className={`text-sm ${step.done ? 'text-gray-900' : 'text-emerald-700'}`}>{step.text}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-2">
            <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-white rounded-xl text-xs hover:bg-emerald-600 transition-colors">
              <Phone className="w-3.5 h-3.5" /> {tl(lang, 'Позвонить водителю', 'Жүргізушіге қоңырау', 'Call driver')}
            </button>
            <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 transition-colors">
              <MessageCircle className="w-3.5 h-3.5" /> {tl(lang, 'Чат с бригадой', 'Бригадамен чат', 'Chat with crew')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CHATS ───────────────────────────────────────────
function ChatsPage({ lang }: { lang: Lang }) {
  const DIALOGS = [
    { id: 'm1', name: 'Айгерим М.', role: tl(lang, 'Менеджер по кухне', 'Менеджер', 'Manager'), last: tl(lang, 'Производство идёт по графику', 'Өндіріс кестеде', 'On schedule'), time: '10:42', unread: 0, avatar: 'bg-gradient-to-br from-emerald-400 to-teal-500' },
    { id: 'm2', name: 'Алихан Б.', role: tl(lang, 'Установщик', 'Монтаж', 'Installer'), last: tl(lang, 'Завтра приеду к 14:00', 'Ертең 14:00-де', 'Tomorrow 2pm'), time: '09:15', unread: 2, avatar: 'bg-gradient-to-br from-emerald-400 to-teal-500' },
    { id: 'm3', name: 'Сауле К.', role: tl(lang, 'Дизайнер', 'Дизайнер', 'Designer'), last: tl(lang, 'Фото 3D-проекта', '3D жоба', '3D draft'), time: tl(lang, 'вчера', 'кеше', 'yesterday'), unread: 0, avatar: 'bg-gradient-to-br from-sky-400 to-cyan-500' },
  ];
  const [active, setActive] = useState('m1');
  const MESSAGES = [
    { id: 1, from: 'them', text: tl(lang, 'Добрый день! Производство идёт по графику. К пятнице ждём фасады.', 'Сәлеметсіз бе!', 'Hi! On schedule.'), time: '10:30' },
    { id: 2, from: 'me', text: tl(lang, 'Отлично! А когда установка?', 'Жақсы!', 'Great! Install date?'), time: '10:35' },
    { id: 3, from: 'them', text: tl(lang, '20 апреля с 10:00. Бригада ~5 часов.', '20 сәуір 10:00.', 'Apr 20 at 10am.'), time: '10:40' },
    { id: 4, from: 'them', text: tl(lang, '📷 Фото этапа сборки', '📷 Сурет', '📷 Photo'), time: '10:42', image: KITCHEN_IMG },
  ];
  const cur = DIALOGS.find(d => d.id === active)!;

  return (
    <div className="space-y-4">
      <h1 className="text-gray-900">{tl(lang, 'Чаты с менеджерами', 'Менеджерлермен чат', 'Chats with managers')}</h1>
      <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] overflow-hidden grid md:grid-cols-3 h-[600px]">
        <div className="border-r border-gray-100 overflow-y-auto">
          {DIALOGS.map(d => (
            <button
              key={d.id}
              onClick={() => setActive(d.id)}
              className={`w-full text-left p-4 flex items-center gap-3 border-b border-gray-50 transition-colors ${active === d.id ? 'bg-emerald-50/50' : 'hover:bg-gray-50/50'}`}
            >
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0 ${d.avatar}`}>{d.name.split(' ').map(s => s[0]).join('')}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-gray-900 truncate">{d.name}</div>
                  <div className="text-[10px] text-gray-400">{d.time}</div>
                </div>
                <div className="text-[11px] text-gray-400 truncate">{d.role}</div>
                <div className="text-xs text-gray-500 truncate mt-0.5">{d.last}</div>
              </div>
              {d.unread > 0 && <div className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center">{d.unread}</div>}
            </button>
          ))}
        </div>
        <div className="md:col-span-2 flex flex-col">
          <div className="p-4 border-b border-gray-100 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs ${cur.avatar}`}>{cur.name.split(' ').map(s => s[0]).join('')}</div>
            <div>
              <div className="text-sm text-gray-900">{cur.name}</div>
              <div className="text-[11px] text-emerald-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {tl(lang, 'в сети', 'желіде', 'online')}</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-emerald-50/20">
            {MESSAGES.map(m => (
              <div key={m.id} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-2xl px-3 py-2 ${m.from === 'me' ? 'bg-gray-900 text-white' : 'bg-white/60 backdrop-blur-xl border border-white/60 text-gray-900'}`}>
                  {m.image && <ImageWithFallback src={m.image} alt="" className="rounded-lg mb-2 w-full max-w-[200px]" />}
                  <div className="text-sm">{m.text}</div>
                  <div className={`text-[10px] mt-1 ${m.from === 'me' ? 'text-white/50' : 'text-gray-400'}`}>{m.time}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-gray-100 flex items-center gap-2">
            <button className="w-9 h-9 hover:bg-gray-50 rounded-xl flex items-center justify-center text-gray-400"><Paperclip className="w-4 h-4" /></button>
            <input placeholder={tl(lang, 'Сообщение...', 'Хабарлама...', 'Message...')} className="flex-1 px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
            <button className="w-9 h-9 hover:bg-gray-50 rounded-xl flex items-center justify-center text-gray-400"><Mic className="w-4 h-4" /></button>
            <button className="w-9 h-9 bg-gray-900 text-white rounded-xl flex items-center justify-center hover:bg-gray-800"><Send className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENTS ────────────────────────────────────────
function PaymentsPage({ lang, deals }: { lang: Lang; deals: Deal[] }) {
  const total = deals.reduce((s, d) => s + (d.amount || 0), 0);
  const paid = deals.reduce((s, d) => s + (d.paidAmount || 0), 0);
  const owed = total - paid;

  const HISTORY = deals.flatMap(d => {
    const out: any[] = [];
    if (d.paidAmount > 0) out.push({ date: d.date, order: `#${d.id}`, amount: d.paidAmount, method: 'Kaspi', status: 'Оплачен', cls: 'bg-emerald-50 text-emerald-700' });
    if (d.amount - d.paidAmount > 0) out.push({ date: d.completionDate || d.date, order: `#${d.id}`, amount: d.amount - d.paidAmount, method: '—', status: 'К оплате', cls: 'bg-emerald-50 text-emerald-700' });
    return out;
  });

  const DOCS = [
    { type: tl(lang, 'Договор #DG-2026-004', '#DG-2026-004 шарты', 'Contract #DG-2026-004'), size: '2.1 МБ' },
    { type: tl(lang, 'Счёт-фактура (ЭСФ)', 'ЭСФ', 'e-Invoice'), size: '420 КБ' },
    { type: tl(lang, 'Акт приёмки замера', 'Өлшем актісі', 'Measurement act'), size: '180 КБ' },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-gray-900">{tl(lang, 'Оплаты и счета', 'Төлемдер мен шоттар', 'Payments & invoices')}</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: tl(lang, 'Всего по заказам', 'Барлығы', 'Total'), val: total, cls: 'text-gray-900' },
          { label: tl(lang, 'Оплачено', 'Төленген', 'Paid'), val: paid, cls: 'text-emerald-600' },
          { label: tl(lang, 'К доплате', 'Қосымша төлеу', 'Outstanding'), val: owed, cls: 'text-emerald-700' },
        ].map((s, i) => (
          <div key={i} className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] p-4">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{s.label}</div>
            <div className={`text-xl tabular-nums ${s.cls}`}>{(s.val / 1_000_000).toFixed(2)} млн ₸</div>
          </div>
        ))}
      </div>

      {owed > 0 && (
        <button className="w-full py-4 rounded-2xl text-white text-base hover:opacity-95 transition-opacity flex items-center justify-center gap-3" style={{ background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)' }}>
          <span className="px-2 py-0.5 bg-white text-emerald-600 rounded text-[11px]">Kaspi</span>
          {tl(lang, `Доплатить ${(owed / 1_000_000).toFixed(2)} млн ₸ через Kaspi`, `${(owed / 1_000_000).toFixed(2)} млн ₸ Kaspi арқылы`, `Pay ${(owed / 1_000_000).toFixed(2)}M ₸ via Kaspi`)}
        </button>
      )}

      <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] overflow-hidden">
        <div className="p-4 border-b border-gray-100 text-sm text-gray-900">{tl(lang, 'История платежей', 'Төлемдер тарихы', 'Payment history')}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50/50">
              <tr className="text-left text-gray-400">
                <th className="px-4 py-2 font-normal">{tl(lang, 'Дата', 'Күн', 'Date')}</th>
                <th className="px-4 py-2 font-normal">{tl(lang, 'Заказ', 'Тапсырыс', 'Order')}</th>
                <th className="px-4 py-2 font-normal">{tl(lang, 'Сумма', 'Сома', 'Amount')}</th>
                <th className="px-4 py-2 font-normal">{tl(lang, 'Способ', 'Әдіс', 'Method')}</th>
                <th className="px-4 py-2 font-normal">{tl(lang, 'Статус', 'Мәртебесі', 'Status')}</th>
                <th className="px-4 py-2 font-normal">{tl(lang, 'Чек', 'Чек', 'Receipt')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {HISTORY.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">{tl(lang, 'Платежей нет', 'Төлем жоқ', 'No payments')}</td></tr>
              )}
              {HISTORY.map((h, i) => (
                <tr key={i} className="hover:bg-gray-50/40">
                  <td className="px-4 py-3 text-gray-700">{h.date}</td>
                  <td className="px-4 py-3 text-gray-900">{h.order}</td>
                  <td className="px-4 py-3 text-gray-900 tabular-nums">{(h.amount / 1000).toFixed(0)}К ₸</td>
                  <td className="px-4 py-3 text-gray-600">{h.method}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-[10px] ${h.cls}`}>{tl(lang, h.status, h.status, h.status)}</span></td>
                  <td className="px-4 py-3">{h.status === 'Оплачен' ? <button className="text-gray-400 hover:text-gray-900"><Download className="w-3.5 h-3.5" /></button> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {DOCS.map((d, i) => (
          <div key={i} className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] p-4 hover:shadow-sm transition-shadow flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50/70 backdrop-blur text-emerald-700 flex items-center justify-center"><FileText className="w-4 h-4" /></div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-900 truncate">{d.type}</div>
              <div className="text-[10px] text-gray-400">PDF · {d.size}</div>
            </div>
            <button className="w-8 h-8 hover:bg-gray-50 rounded-lg flex items-center justify-center text-gray-400"><Download className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AR ──────────────────────────────────────────────
function ARPage({ lang, deals }: { lang: Lang; deals: Deal[] }) {
  return (
    <div className="space-y-5">
      <h1 className="text-gray-900">{tl(lang, 'AR-визуализация', 'AR-көрсету', 'AR visualization')}</h1>
      <p className="text-sm text-gray-500">{tl(lang, 'Посмотрите как ваша мебель будет стоять до установки', 'Жиһазыңыздың орналасуын алдын ала көру', 'See how your furniture fits before installation')}</p>

      <div className="grid lg:grid-cols-2 gap-4">
        {deals.slice(0, 2).map((d, idx) => (
          <div key={d.id} className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] overflow-hidden">
            <div className="relative h-80 bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
              <ImageWithFallback src={imageFor(d)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
              {idx === 0 && (
                <div className="relative text-center text-white p-6">
                  <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-4">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div className="text-base mb-1">{tl(lang, 'Наведите камеру на пол', 'Камераны еденге бағыттаңыз', 'Point camera at floor')}</div>
                  <div className="text-xs text-white/60">{tl(lang, 'Двигайте телефон чтобы поставить мебель', 'Жиһазды орналастыру', 'Move phone to place furniture')}</div>
                </div>
              )}
              {idx === 1 && (
                <div className="absolute bottom-4 left-4 text-white">
                  <div className="text-xs text-white/70 mb-1">AR Preview</div>
                  <div className="text-sm">{d.product}</div>
                </div>
              )}
            </div>
            <div className="p-4 space-y-3">
              <div className="text-sm text-gray-900">{d.product} · #{d.id}</div>
              <div className="flex gap-2">
                <button className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 transition-colors">{tl(lang, 'Открыть AR', 'AR ашу', 'Open AR')}</button>
                <button className="px-3 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-xs hover:bg-emerald-100 transition-colors flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5" /> {tl(lang, 'Дизайнеру', 'Дизайнерге', 'Designer')}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BONUS ───────────────────────────────────────────
function BonusPage({ lang }: { lang: Lang }) {
  const LEVELS = [
    { name: tl(lang, 'Новичок', 'Жаңадан', 'Newbie'), range: '0-100К', active: false },
    { name: tl(lang, 'Постоянный', 'Тұрақты', 'Regular'), range: '100К-500К', active: false },
    { name: 'VIP', range: '500К-2млн', active: true },
    { name: tl(lang, 'Премиум', 'Премиум', 'Premium'), range: '2млн+', active: false },
  ];
  const REWARDS = [
    { title: tl(lang, 'Бесплатная доставка', 'Тегін жеткізу', 'Free delivery'), status: 'active' },
    { title: tl(lang, 'Скидка 5% на следующую кухню', '5% жеңілдік', '5% off next kitchen'), status: 'active' },
    { title: tl(lang, 'Подарок: тумба под раковину', 'Сыйлық: тумба', 'Gift: sink cabinet'), status: 'locked', hint: tl(lang, 'при заказе от 1млн', '1млн-нан', 'orders 1M+') },
    { title: tl(lang, 'Приоритетная сборка (3 дня)', 'Жылдам құрастыру', 'Priority assembly'), status: 'vip' },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-gray-900">{tl(lang, 'Бонусы и скидки', 'Бонустар мен жеңілдіктер', 'Bonus & discounts')}</h1>
      <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] p-6">
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">{tl(lang, 'Ваш уровень', 'Деңгейіңіз', 'Your level')}</div>
        <div className="text-2xl text-gray-900 mb-1">VIP</div>
        <div className="text-sm text-gray-500 mb-5">{tl(lang, 'До Премиум осталось', 'Премиумға дейін', 'To Premium')}: <span className="text-gray-900 tabular-nums">87 500 ₸</span></div>
        <div className="relative h-2 bg-gray-100 rounded-full mb-3">
          <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-700" style={{ width: '62%' }} />
          <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-emerald-500 shadow" style={{ left: 'calc(62% - 8px)' }} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {LEVELS.map((lv, i) => (
            <div key={i} className={`text-center p-2 rounded-xl ${lv.active ? 'bg-emerald-50 border border-emerald-200' : ''}`}>
              <div className={`text-xs ${lv.active ? 'text-emerald-700' : 'text-gray-500'}`}>{lv.name}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{lv.range}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {REWARDS.map((r, i) => (
          <div key={i} className={`bg-white/60 backdrop-blur-xl rounded-3xl border p-4 ${r.status === 'active' ? 'border-emerald-100' : 'border-gray-100'}`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                r.status === 'active' ? 'bg-emerald-50 text-emerald-600' :
                r.status === 'vip' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
              }`}>
                <Gift className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900">{r.title}</div>
                {r.hint && <div className="text-[10px] text-gray-400 mt-0.5">{r.hint}</div>}
                <div className="mt-2">
                  {r.status === 'active' && <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">{tl(lang, 'Активно', 'Белсенді', 'Active')}</span>}
                  {r.status === 'vip' && <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">VIP</span>}
                  {r.status === 'locked' && <span className="text-[10px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded">{tl(lang, 'Заблокировано', 'Жабық', 'Locked')}</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <button className="bg-white/60 backdrop-blur-xl rounded-3xl border border-emerald-100 p-4 hover:shadow-sm transition-shadow text-left flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Plus className="w-4 h-4" /></div>
          <div className="flex-1">
            <div className="text-sm text-gray-900">{tl(lang, 'Пригласить друга', 'Дос шақыру', 'Invite friend')}</div>
            <div className="text-[11px] text-gray-400">{tl(lang, 'Получи 50К бонусов', '50К бонус ал', 'Get 50K bonus')}</div>
          </div>
        </button>
        <button className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] p-4 hover:shadow-sm transition-shadow text-left flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50/70 backdrop-blur text-emerald-600 flex items-center justify-center"><Tag className="w-4 h-4" /></div>
          <div className="flex-1">
            <div className="text-sm text-gray-900">{tl(lang, 'Промо-код', 'Промо-код', 'Promo code')}</div>
            <div className="text-[11px] text-gray-400">{tl(lang, 'Активировать купон', 'Купон қосу', 'Activate coupon')}</div>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── REVIEWS ─────────────────────────────────────────
function ReviewsPage({ lang, deals }: { lang: Lang; deals: Deal[] }) {
  const target = deals[0];
  const PARAMS = [
    tl(lang, 'Качество мебели', 'Жиһаз сапасы', 'Furniture quality'),
    tl(lang, 'Точность размеров', 'Өлшем дәлдігі', 'Size accuracy'),
    tl(lang, 'Чистота сборки', 'Құрастыру тазалығы', 'Assembly cleanliness'),
    tl(lang, 'Пунктуальность бригады', 'Уақыттылық', 'Crew punctuality'),
    tl(lang, 'Общение менеджера', 'Қарым-қатынас', 'Manager comms'),
  ];
  const [ratings, setRatings] = useState<number[]>([5, 5, 4, 5, 5]);

  return (
    <div className="space-y-5">
      <h1 className="text-gray-900">{tl(lang, 'Мои отзывы', 'Пікірлерім', 'My reviews')}</h1>
      <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <ImageWithFallback src={target ? imageFor(target) : CLOSET_IMG} alt="" className="w-14 h-14 rounded-xl object-cover" />
            <div>
              <div className="text-sm text-gray-900">{tl(lang, 'Оцените заказ', 'Бағалаңыз', 'Rate order')} #{target?.id || '—'}</div>
              <div className="text-[11px] text-gray-400">{target?.product || '—'} · {target?.date || ''}</div>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-4">
          {PARAMS.map((p, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="text-sm text-gray-700">{p}</div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setRatings(r => r.map((v, idx) => idx === i ? n : v))} className="hover:scale-110 transition-transform">
                    <Star className={`w-5 h-5 ${n <= ratings[i] ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
                  </button>
                ))}
              </div>
            </div>
          ))}
          <textarea
            placeholder={tl(lang, 'Что понравилось / что улучшить', 'Не ұнады / нені жақсартуға', 'What you liked / improve')}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none"
            rows={3}
          />
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-emerald-300 transition-colors cursor-pointer">
            <Camera className="w-6 h-6 text-gray-400 mx-auto mb-2" />
            <div className="text-xs text-gray-500">{tl(lang, 'Загрузить фото готовой мебели', 'Сурет жүктеу', 'Upload photo')}</div>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 transition-colors">{tl(lang, 'Опубликовать', 'Жариялау', 'Publish')}</button>
            <button className="flex items-center gap-1.5 px-3 py-2.5 bg-white/60 backdrop-blur border border-white/60 text-gray-700 rounded-xl text-xs hover:bg-white transition-colors">
              <Instagram className="w-3.5 h-3.5 text-emerald-600" /> Instagram
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SUPPORT ─────────────────────────────────────────
function SupportPage({ lang }: { lang: Lang }) {
  return (
    <div className="space-y-5">
      <h1 className="text-gray-900">{tl(lang, 'Поддержка 24/7', 'Қолдау 24/7', 'Support 24/7')}</h1>
      <div className="rounded-2xl p-5 border border-emerald-100 bg-emerald-50/50 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
          <Gift className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex-1">
          <div className="text-sm text-emerald-900 mb-0.5">{tl(lang, 'Ваша компенсация', 'Өтемақыңыз', 'Compensation')}</div>
          <div className="text-xs text-emerald-700">{tl(lang, 'За задержку на 2 дня начислено', '2 күн кешігу үшін', '2-day delay credit')} <span className="text-emerald-900">25 000 ₸ {tl(lang, 'бонусов', 'бонус', 'bonus')}</span></div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] p-5 hover:shadow-sm transition-shadow">
          <div className="w-11 h-11 rounded-xl bg-emerald-50/70 backdrop-blur text-emerald-700 flex items-center justify-center mb-3"><ShieldAlert className="w-5 h-5" /></div>
          <div className="text-sm text-gray-900 mb-1">{tl(lang, 'Гарантийный случай', 'Кепілдік', 'Warranty')}</div>
          <div className="text-[11px] text-gray-400 mb-3">{tl(lang, 'Гарантия 24 месяца', '24 ай кепілдік', '24-month warranty')}</div>
          <button className="w-full py-2 bg-emerald-600 text-white rounded-xl text-xs hover:bg-emerald-700 transition-colors">{tl(lang, 'Подать заявку', 'Өтінім', 'Submit claim')}</button>
        </div>

        <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] p-5 hover:shadow-sm transition-shadow">
          <div className="w-11 h-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-3"><MessageCircle className="w-5 h-5" /></div>
          <div className="text-sm text-gray-900 mb-1">{tl(lang, 'Связаться с менеджером', 'Менеджермен байланыс', 'Contact manager')}</div>
          <div className="text-[11px] text-gray-400 mb-3">{tl(lang, 'Среднее время ответа: 5 минут', '5 мин', 'Avg 5 min')}</div>
          <div className="grid grid-cols-3 gap-1.5">
            <button className="py-1.5 bg-emerald-500 text-white rounded-lg text-[10px] hover:bg-emerald-600 transition-colors">WhatsApp</button>
            <button className="py-1.5 bg-sky-500 text-white rounded-lg text-[10px] hover:bg-sky-600 transition-colors">Telegram</button>
            <button className="py-1.5 bg-gray-900 text-white rounded-lg text-[10px] hover:bg-gray-800 transition-colors">{tl(lang, 'Звонок', 'Қоңырау', 'Call')}</button>
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] p-5 hover:shadow-sm transition-shadow">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3"><Sparkles className="w-5 h-5" /></div>
          <div className="text-sm text-gray-900 mb-1">{tl(lang, 'AI-помощник', 'AI-көмекші', 'AI helper')}</div>
          <div className="text-[11px] text-gray-400 mb-3">{tl(lang, 'Ответы 24/7', '24/7 жауап', '24/7 answers')}</div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('ai-assistant:open', { detail: { prompt: 'Я клиент Utir Soft. Помоги с заказом.' } }))}
            className="w-full py-2 bg-emerald-500 text-white rounded-xl text-xs hover:bg-emerald-600 transition-colors"
          >
            {tl(lang, 'Спросить AI', 'AI сұрау', 'Ask AI')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS ────────────────────────────────────────
function SettingsPage({ lang, session, onLogout }: { lang: Lang; session: ClientSession; onLogout: () => void }) {
  return (
    <div className="space-y-5">
      <h1 className="text-gray-900">{tl(lang, 'Настройки', 'Баптаулар', 'Settings')}</h1>
      <div className="bg-white/60 backdrop-blur-xl rounded-3xl border border-white/60 shadow-[0_4px_24px_rgba(15,118,110,0.05)] divide-y divide-gray-50">
        {[
          { title: tl(lang, 'Имя', 'Аты', 'Name'), val: session.name },
          { title: tl(lang, 'Телефон', 'Телефон', 'Phone'), val: session.phone },
          { title: 'Email', val: 'client@example.com' },
          { title: tl(lang, 'Адрес доставки', 'Жеткізу мекенжайы', 'Delivery address'), val: 'г. Алматы, ул. Абая 45, кв. 12' },
          { title: tl(lang, 'Уведомления', 'Хабарландырулар', 'Notifications'), val: 'WhatsApp · SMS · Push' },
        ].map((s, i) => (
          <div key={i} className="px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
            <div>
              <div className="text-[11px] text-gray-400 mb-0.5">{s.title}</div>
              <div className="text-sm text-gray-900">{s.val}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </div>
        ))}
      </div>

      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 py-3 bg-white/60 backdrop-blur-xl border border-white/60 text-red-600 rounded-2xl text-sm hover:bg-red-50/60 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        {tl(lang, 'Выйти из кабинета', 'Кабинеттен шығу', 'Sign out')}
      </button>
    </div>
  );
}
