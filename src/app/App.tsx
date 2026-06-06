import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { ClientTrack } from './components/ClientTrack';
import { ClientCabinet } from './components/ClientCabinet';
import { Booking } from './components/Booking';
import { AIDesign } from './components/AIDesign';
import { SalesKanban } from './components/SalesKanban';
import { Warehouse } from './components/Warehouse';
import { PaymentsHub } from './components/PaymentsHub';
import { Chats } from './components/Chats';
import { Analytics } from './components/Analytics';
import { Tasks } from './components/Tasks';
import { Settings } from './components/Settings';
import { CustomModulePage } from './components/CustomModulePage';
import { CustomIcon } from './components/CustomIcons';
import { AIAssistant } from './components/AIAssistant';
import { Toaster } from './utils/toast';
import { Auth } from './components/Auth';
import { ComingSoon } from './components/ComingSoon';
import { Terms } from './components/Terms';
import { Privacy } from './components/Privacy';
import { ResetPassword } from './components/ResetPassword';
import { OnboardingWizard } from './components/OnboardingWizard';
import { Menu, X, LogOut } from 'lucide-react';
import profileLogo from '../imports/utirsoft.png';
import { t } from './utils/translations';
import { DataProvider, useDataStore } from './utils/dataStore';
import { api, getToken, setToken } from './utils/api';
import { applyTheme, loadTheme } from './utils/theme';

// Apply the user's saved accent theme as early as possible — before
// React even mounts — so first paint doesn't flash the platform default
// (black) when the user has chosen something else. The picker UI lives
// in Settings → Основные.
if (typeof document !== 'undefined') {
  applyTheme(loadTheme());
}

// Persist the active page across browser reloads so refreshing
// «Финансы → Налоги» doesn't bounce the user back to Dashboard.
const LAST_PAGE_KEY = 'utir_current_page';

function AppContent() {
  // Initial value: try URL hash first (deep links), then localStorage
  // (the last page the user visited), fall back to 'dashboard'. This runs
  // BEFORE first render so the right component mounts on refresh.
  const [currentPageRaw, setCurrentPageRaw] = useState<string>(() => {
    try {
      const hash = window.location.hash.replace(/^#\/?/, '').trim();
      if (hash) return hash;
      const saved = localStorage.getItem(LAST_PAGE_KEY);
      if (saved) return saved;
    } catch { /* localStorage blocked — use default */ }
    return 'dashboard';
  });
  const currentPage = currentPageRaw;
  // Wrapped setter: persists synchronously on every navigation so there's
  // no race condition with useEffect ordering. Previously the persistence
  // ran inside a useEffect gated on isAuthenticated, which could miss the
  // first navigation before auth completed.
  const setCurrentPage = (page: string) => {
    setCurrentPageRaw(page);
    try { localStorage.setItem(LAST_PAGE_KEY, page); } catch { /* ignore */ }
    try {
      const hashTarget = `#/${page}`;
      if (window.location.hash !== hashTarget) window.history.replaceState(null, '', hashTarget);
    } catch { /* ignore */ }
  };
  const [language, setLanguage] = useState<'kz' | 'ru' | 'eng'>('ru');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; teamRole: string } | null>(null);
  const dataStore = useDataStore();

  // If a logged-in user opens an invite link, the invite is meant for someone
  // else, not them — show a one-time banner explaining what to do with the link.
  // (When NOT logged in, the Auth screen handles the invite directly.)
  const [heldInviteCode, setHeldInviteCode] = useState<string | null>(null);
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      const code = new URLSearchParams(window.location.search).get('invite');
      if (code) setHeldInviteCode(code.toUpperCase());
    } catch { /* ignore */ }
  }, [isAuthenticated]);

  const dismissHeldInvite = () => {
    setHeldInviteCode(null);
    // Strip the `invite` param from the URL so a refresh doesn't re-open the banner.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.toString());
    } catch { /* ignore */ }
  };

  const handleAcceptHeldInvite = async () => {
    // The current user wants to drop their current session and sign up via this
    // invite themselves. Wipe the token, refresh state — Auth will pick up the
    // invite from the URL on the next render.
    const code = heldInviteCode;
    setToken(null);
    window.dispatchEvent(new Event('utir:auth-changed'));
    setIsAuthenticated(false);
    setCurrentUser(null);
    setHeldInviteCode(null);
    // Make sure the invite code stays in the URL for Auth.tsx to read.
    if (code) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('invite', code);
        window.history.replaceState({}, '', url.toString());
      } catch { /* ignore */ }
    }
  };

  // Keep dataStore aware of the current user's role so any page can call
  // store.canWriteModule('orders') without threading the role down via props.
  useEffect(() => {
    if (currentUser?.teamRole) dataStore.setCurrentUserRole(currentUser.teamRole);
  }, [currentUser?.teamRole, dataStore]);

  // Role-based hiding driven by the role-permissions matrix (Phase 2).
  // The matrix lives in dataStore.rolePermissions, synced from the backend.
  // Admin is never gated even if the matrix tries — protects against an admin
  // accidentally locking themselves out.
  const role = currentUser?.teamRole || 'admin';
  // Sidebar ids vs matrix keys aren't 1-to-1 — map at the boundary so we can
  // keep the matrix UI in Settings unchanged for now (Phase 2a).
  const sidebarToMatrixKey = (sidebarId: string): string => {
    const map: Record<string, string> = { sales: 'orders', warehouse: 'production' };
    return map[sidebarId] || sidebarId;
  };
  const moduleAllowedByRole = (id: string): boolean => {
    if (role === 'admin') return true;
    const matrixKey = sidebarToMatrixKey(id);
    // 'none' → hidden; 'view'/'full' → visible (write restrictions handled by buttons).
    const level = (dataStore.rolePermissions as any)?.[role]?.[matrixKey];
    if (level === 'none') return false;
    return true;
  };

  // Sidebar visibility is data-driven from Settings → Модули (Block B.1).
  // Locked modules (dashboard, settings) are always visible regardless of the toggle.
  const isModuleVisible = (id: string) => {
    if (!moduleAllowedByRole(id)) return false;
    const m = dataStore.modules.find(x => x.id === id);
    if (!m) return true; // unknown ids stay visible (e.g. legacy pages)
    return m.enabled || !!m.locked;
  };

  // If the currently open page got disabled, fall back to dashboard.
  // We wait until modules are actually loaded (length > 0) — otherwise the
  // first paint (empty modules array) could falsely flag «settings» / any
  // real page as «not visible» and bounce the user to Dashboard, wiping
  // their saved last-page. We also use setCurrentPage (not raw) so the
  // localStorage gets updated to dashboard too — the old page is genuinely
  // gone, so we shouldn't restore it on next refresh.
  useEffect(() => {
    if (dataStore.modules.length === 0) return;
    if (!isModuleVisible(currentPage)) setCurrentPage('dashboard');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataStore.modules, currentPage]);

  // Global navigate-to-page event so deep-link buttons in modals (e.g.
  // «Перейти в Заказы» after picking a BOM template) can jump pages
  // without prop-drilling onNavigate everywhere.
  useEffect(() => {
    const onNavigate = (e: Event) => {
      const page = (e as CustomEvent<{ page?: string }>).detail?.page;
      if (page && typeof page === 'string') setCurrentPage(page);
    };
    window.addEventListener('app:navigate', onNavigate as EventListener);
    return () => window.removeEventListener('app:navigate', onNavigate as EventListener);
  }, []);

  // Browser back / forward button → sync currentPage with the URL hash so
  // navigation feels native. Use setCurrentPageRaw here to avoid an
  // immediate replaceState ping-pong (the hash is already the new value).
  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').trim();
      if (hash) setCurrentPageRaw(hash);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Restore session on mount
  useEffect(() => {
    const token = getToken();
    if (!token) { setAuthChecked(true); return; }
    api.get<{ user: { id: string; name: string; email: string; teamRole?: string } }>('/api/auth/me')
      .then(({ user }) => {
        setCurrentUser({ name: user.name, email: user.email, teamRole: user.teamRole || 'admin' });
        setIsAuthenticated(true);
      })
      .catch(() => {
        setToken(null);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  // React to forced logout (e.g. api.ts dropped the token after a 'account
  // disabled' response): bounce back to the Auth screen so the user knows.
  useEffect(() => {
    const onAuth = () => {
      if (!getToken()) {
        setIsAuthenticated(false);
        setCurrentUser(null);
      }
    };
    window.addEventListener('utir:auth-changed', onAuth);
    return () => window.removeEventListener('utir:auth-changed', onAuth);
  }, []);

  const handleLogin = (user: { name: string; email: string; teamRole?: string }) => {
    setCurrentUser({ name: user.name, email: user.email, teamRole: user.teamRole || 'admin' });
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    // Fire-and-forget logout activity log before clearing the token (server-side handler reads JWT).
    try { await api.post('/api/auth/logout', {}); } catch { /* non-fatal */ }
    setToken(null);
    dataStore.resetLocal();
    window.dispatchEvent(new Event('utir:auth-changed'));
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentPage('dashboard');
    // Clear persisted last-page so the next user (or re-login) starts fresh
    // on Dashboard instead of bouncing into wherever the previous user was.
    try { localStorage.removeItem(LAST_PAGE_KEY); } catch { /* ignore */ }
    try { window.history.replaceState(null, '', '#/dashboard'); } catch { /* ignore */ }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">Загрузка…</div>
      </div>
    );
  }

  // Show Auth screen if not authenticated
  if (!isAuthenticated) {
    return <Auth onLogin={handleLogin} language={language} onLanguageChange={setLanguage} />;
  }

  // First-run wizard — shown to brand new teams whose onboarding flag
  // isn't set yet. We wait for the store to load so we don't flash the
  // wizard for a returning user during the (brief) initial fetch.
  // Existing teams created before this feature shipped have onboarding=
  // {completed:false} by default; for THEM we silently auto-complete the
  // wizard if they already have data (deals/employees), so we don't shove
  // a setup flow at someone who's been using the platform for months.
  if (dataStore.loaded && !dataStore.onboarding.completed) {
    const hasExistingData = dataStore.deals.length > 0 || dataStore.products.length > 0
                          || dataStore.tasks.length > 0 || dataStore.transactions.length > 0;
    if (hasExistingData) {
      // Legacy team — auto-complete silently (fire-and-forget, don't block UI).
      dataStore.setOnboarding({ completed: true, completedAt: new Date().toISOString() }).catch(() => { /* ignore */ });
    } else {
      // Fresh team — show the wizard.
      return (
        <OnboardingWizard
          language={language}
          currentUserName={currentUser?.name}
          currentUserEmail={currentUser?.email}
          onDone={() => { /* state will re-render once onboarding.completed flips */ }}
        />
      );
    }
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard language={language} onNavigate={setCurrentPage} />;
      case 'ai-design':
        return <AIDesign language={language} />;
      case 'sales':
        return <SalesKanban language={language} />;
      case 'warehouse':
        return <Warehouse language={language} />;
      case 'finance':
        // PaymentsHub gives both «Платежи по сделкам» and «Финансы компании»
        // tabs at the top — same component we used to embed inside SalesKanban.
        return <PaymentsHub language={language} />;
      case 'chats':
        return <ComingSoon
          language={language}
          title={language === 'kz' ? 'Чаттар' : language === 'eng' ? 'Chats' : 'Чаты'}
          description={
            language === 'kz'
              ? 'WhatsApp Business, Instagram Direct, Telegram — барлық диалогтар бір терезеде. Қазір — Параметрлер → Интеграциялар арқылы қосыңыз.'
              : language === 'eng'
              ? 'WhatsApp Business, Instagram Direct, Telegram — all conversations in one window. Connect via Settings → Integrations.'
              : 'WhatsApp Business, Instagram Direct, Telegram — все диалоги в одном окне. Пока — подключайте через Настройки → Интеграции.'
          }
          onBack={() => setCurrentPage('dashboard')}
        />;
      case 'analytics':
        return <Analytics language={language} />;
      case 'tasks':
        return <Tasks language={language} />;
      case 'settings':
        return <Settings language={language} onLanguageChange={setLanguage} currentUserEmail={currentUser?.email} onLogout={handleLogout} />;
      default: {
        // Custom modules from Settings → Модули render through the generic page.
        const customMod = dataStore.modules.find(m => m.id === currentPage && m.custom);
        if (customMod) {
          return <CustomModulePage moduleId={customMod.id} language={language} onNotFound={() => setCurrentPage('dashboard')} />;
        }
        return <Dashboard language={language} />;
      }
    }
  };

  const getMenuText = (key: string) => {
    const texts: Record<string, Record<string, string>> = {
      home: { kz: 'Басты бет', ru: 'Главная', eng: 'Home' },
      aiDesign: { kz: 'AI Дизайн', ru: 'AI Дизайн', eng: 'AI Design' },
      orders: { kz: 'Тапсырыстар', ru: 'Заказы', eng: 'Orders' },
      production: { kz: 'Өндіріс', ru: 'Производство', eng: 'Production' },
      finance: { kz: 'Қаржы', ru: 'Финансы', eng: 'Finance' },
      chats: { kz: 'Чаттар', ru: 'Чаты', eng: 'Chats' },
      analytics: { kz: 'Аналитика', ru: 'Аналитика', eng: 'Analytics' },
      tasks: { kz: 'Тапсырмалар', ru: 'Задачи', eng: 'Tasks' },
      settings: { kz: 'Баптаулар', ru: 'Настройки', eng: 'Settings' },
      logout: { kz: 'Шығу', ru: 'Выйти', eng: 'Logout' },
    };
    return texts[key]?.[language] || texts[key]?.ru || key;
  };

  const handleMenuClick = (page: string) => {
    setCurrentPage(page);
    setIsMobileMenuOpen(false);
  };

  const getCurrentPageTitle = () => {
    const pageMap: Record<string, string> = {
      'dashboard': 'home',
      'ai-design': 'aiDesign',
      'sales': 'orders',
      'warehouse': 'production',
      'finance': 'finance',
      'chats': 'chats',
      'analytics': 'analytics',
      'tasks': 'tasks',
      'settings': 'settings'
    };
    return getMenuText(pageMap[currentPage] || 'home');
  };

  return (
    // h-screen + overflow-hidden so the only scroll container is <main>.
    // Otherwise the document itself scrolls and the sidebar (lg:static)
    // scrolls along with the content — user wants the sidebar fixed.
    <div className="flex h-screen overflow-hidden relative">
      {/* Themable global page backdrop — paints once, every page renders
          on top. Theme changes recolour orbs instantly via CSS vars. */}
      <div className="app-backdrop" aria-hidden="true" />
      {/* Invite link held by a logged-in user — modal explaining what it's for. */}
      {heldInviteCode && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[60] flex items-center justify-center p-4" onClick={dismissHeldInvite}>
          <div className="bg-white/85 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl w-full max-w-md p-6 shadow-[0_24px_64px_-12px_var(--accent-shadow-sm)]" onClick={e => e.stopPropagation()}>
            <div className="text-lg text-slate-900 mb-2 tracking-tight">
              {language === 'kz' ? 'Командаға шақыру сілтемесі'
                : language === 'eng' ? 'Team invitation link'
                : 'Ссылка-приглашение в команду'}
            </div>
            <div className="text-sm text-slate-500 mb-4 leading-relaxed">
              {language === 'kz' ? 'Бұл сілтеме жаңа қызметкерлерді тіркеуге арналған. Сіз қазір тіркелген аккаунттасыз — оны ашылғыңыз келген адамға жіберіңіз немесе incognito режимінде ашыңыз.'
                : language === 'eng' ? 'This link is for inviting a new teammate to sign up. You are currently logged in — share it with the person you want to invite, or open it in an incognito window.'
                : 'Эта ссылка нужна, чтобы новый сотрудник зарегистрировался в вашей команде. Вы сейчас в своём аккаунте — отправьте ссылку нужному человеку или откройте её в режиме инкогнито.'}
            </div>
            <div className="px-3 py-2.5 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs font-mono text-slate-700 break-all mb-4">
              {typeof window !== 'undefined' ? `${window.location.origin}/?invite=${heldInviteCode}` : `/?invite=${heldInviteCode}`}
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  try { await navigator.clipboard.writeText(`${window.location.origin}/?invite=${heldInviteCode}`); } catch { /* ignore */ }
                  dismissHeldInvite();
                }}
                className="w-full py-2.5 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
              >
                {language === 'kz' ? 'Көшіріп, жабу'
                  : language === 'eng' ? 'Copy and close'
                  : 'Скопировать и закрыть'}
              </button>
              <button
                onClick={handleAcceptHeldInvite}
                className="w-full py-2.5 bg-white/60 ring-1 ring-white/60 text-slate-700 rounded-2xl text-sm hover:bg-white transition-colors"
              >
                {language === 'kz' ? 'Шығып, осы сілтеме арқылы тіркелу'
                  : language === 'eng' ? 'Sign out and accept this invite'
                  : 'Выйти и принять это приглашение'}
              </button>
              <button
                onClick={dismissHeldInvite}
                className="w-full py-2 text-slate-500 rounded-xl text-xs hover:bg-white/50 transition-colors"
              >
                {language === 'kz' ? 'Жабу' : language === 'eng' ? 'Dismiss' : 'Закрыть'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Header — glass */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white/70 backdrop-blur-2xl backdrop-saturate-150 border-b border-white/60 z-40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden bg-white/80 ring-1 ring-white/60">
            <img src={profileLogo} alt="Utir Soft" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="text-sm text-slate-900">Utir Soft</div>
            <div className="text-xs text-slate-500">{getCurrentPageTitle()}</div>
          </div>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-white/70 ring-1 ring-transparent hover:ring-white/60 rounded-xl transition-all"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6 text-slate-700" /> : <Menu className="w-6 h-6 text-slate-700" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-md z-40 mt-[57px]"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar — glass column */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-60'} bg-white/70 backdrop-blur-2xl backdrop-saturate-150 border-r border-white/60 flex flex-col transition-all duration-300
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 fixed lg:static h-full z-50 mt-[57px] lg:mt-0`}>
        <div className="px-5 pt-5 pb-4 border-b border-white/60 hidden lg:block">
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center overflow-hidden ring-1 ring-emerald-200/60 shadow-[0_4px_12px_-4px_var(--accent-shadow-sm)]">
                <img src={profileLogo} alt="Utir Soft" className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <div className="text-sm text-slate-900 tracking-tight">Utir Soft</div>
                <div className="text-[10px] text-slate-500">
                  {language === 'kz' ? 'Басқару платформасы' : language === 'eng' ? 'Management platform' : 'Платформа управления'}
                </div>
              </div>
            </div>
          ) : (
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center mx-auto overflow-hidden ring-1 ring-emerald-200/60 shadow-[0_4px_12px_-4px_var(--accent-shadow-sm)]">
              <img src={profileLogo} alt="Utir Soft" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {/* ─── Structured nav ────────────────────────────────────
            Items are grouped into 4 sections (Home / Business / Work /
            System) so the sidebar reads like a hierarchy rather than a
            flat list. Custom modules sit between Work and System.
            Active state = emerald gradient pill (matches brand). */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
          {(() => {
            // Section labels — only rendered above the first VISIBLE item
            // of each section, so we don't show a label for an empty
            // group (e.g. all business modules permission-locked).
            const sectionLabel = (txt: { ru: string; kz: string; eng: string }) =>
              !isSidebarCollapsed && (
                <div className="text-[9px] uppercase tracking-widest text-slate-400 px-3 pt-3 pb-1.5 select-none">
                  {txt[language]}
                </div>
              );

            // Single nav-item renderer. Keeps style + active-state logic
            // in one place so every row looks identical.
            const NavItem = ({
              id, icon, label, badge,
            }: { id: string; icon: React.ReactNode; label: string; badge?: React.ReactNode }) => {
              const active = currentPage === id;
              // Solid bg-emerald-600 (themable via CSS overrides) is more
              // robust than a gradient with --tw-gradient-from overrides,
              // which Tailwind v4 generates differently per theme. Inline
              // style is a safety fallback if the utility class somehow
              // isn't themed.
              return (
                <button
                  onClick={() => handleMenuClick(id)}
                  className={`group w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-2xl transition-all ${
                    active
                      ? 'bg-emerald-600 text-white shadow-[0_8px_20px_-6px_var(--accent-shadow)] ring-1 ring-white/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 ring-1 ring-transparent hover:ring-white/60'
                  }`}
                  style={active ? { backgroundColor: 'var(--accent-600)', boxShadow: '0 8px 20px -6px var(--accent-shadow)' } : undefined}
                  title={isSidebarCollapsed ? label : ''}
                >
                  <span
                    className={`flex-shrink-0 transition-colors`}
                    style={{ color: active ? '#ffffff' : undefined }}
                  >
                    {icon}
                  </span>
                  {!isSidebarCollapsed && (
                    <span
                      className={`flex-1 flex items-center gap-1.5 text-sm ${active ? 'font-medium' : ''}`}
                      style={{ color: active ? '#ffffff' : undefined }}
                    >
                      {label}
                      {badge}
                    </span>
                  )}
                </button>
              );
            };

            // Reusable icon JSX
            const IconHome = (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            );
            const IconAI = (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
            );
            const IconOrders = (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            );
            const IconFinance = (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            );
            const IconWarehouse = (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            );
            const IconChats = (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            );
            const IconTasks = (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            );
            const IconAnalytics = (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            );
            const IconSettings = (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            );

            const aiBadge = currentPage === 'ai-design'
              ? <span className="text-[8px] bg-white/30 text-white px-1.5 py-0.5 rounded font-medium tracking-wide backdrop-blur-xl">AI</span>
              : <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium tracking-wide ring-1 ring-emerald-200/60">AI</span>;

            // Build business / work groups so we can render the section
            // header only when at least one item in the group is visible.
            const businessItems = [
              isModuleVisible('ai-design')  && { id: 'ai-design', icon: IconAI,        label: dataStore.modules.find(m => m.id === 'ai-design')?.labels[language] || getMenuText('aiDesign'), badge: aiBadge },
              isModuleVisible('sales')      && { id: 'sales',     icon: IconOrders,    label: dataStore.modules.find(m => m.id === 'sales')?.labels[language]     || getMenuText('orders') },
              isModuleVisible('finance')    && { id: 'finance',   icon: IconFinance,   label: dataStore.modules.find(m => m.id === 'finance')?.labels[language]   || getMenuText('finance') },
              isModuleVisible('warehouse')  && { id: 'warehouse', icon: IconWarehouse, label: dataStore.modules.find(m => m.id === 'warehouse')?.labels[language] || getMenuText('production') },
            ].filter(Boolean) as Array<{ id: string; icon: React.ReactNode; label: string; badge?: React.ReactNode }>;

            const workItems = [
              isModuleVisible('chats')     && { id: 'chats',     icon: IconChats,     label: dataStore.modules.find(m => m.id === 'chats')?.labels[language]     || getMenuText('chats') },
              isModuleVisible('tasks')     && { id: 'tasks',     icon: IconTasks,     label: dataStore.modules.find(m => m.id === 'tasks')?.labels[language]     || getMenuText('tasks') },
              isModuleVisible('analytics') && { id: 'analytics', icon: IconAnalytics, label: dataStore.modules.find(m => m.id === 'analytics')?.labels[language] || getMenuText('analytics') },
            ].filter(Boolean) as Array<{ id: string; icon: React.ReactNode; label: string }>;

            const customItems = dataStore.modules.filter(m => m.custom && m.enabled);

            return (
              <>
                {/* Section 1: Home */}
                <NavItem id="dashboard" icon={IconHome} label={getMenuText('home')} />

                {/* Section 2: Business */}
                {businessItems.length > 0 && (
                  <>
                    {sectionLabel({ ru: 'Бизнес', kz: 'Бизнес', eng: 'Business' })}
                    {businessItems.map(it => <NavItem key={it.id} {...it} />)}
                  </>
                )}

                {/* Section 3: Work */}
                {workItems.length > 0 && (
                  <>
                    {sectionLabel({ ru: 'Работа', kz: 'Жұмыс', eng: 'Work' })}
                    {workItems.map(it => <NavItem key={it.id} {...it} />)}
                  </>
                )}

                {/* Section 4: Custom modules */}
                {customItems.length > 0 && (
                  <>
                    {sectionLabel({ ru: 'Мои модули', kz: 'Менің модульдерім', eng: 'My modules' })}
                    {customItems.map(m => (
                      <NavItem
                        key={m.id}
                        id={m.id}
                        icon={<CustomIcon name={m.icon} className="w-5 h-5" />}
                        label={m.labels[language]}
                      />
                    ))}
                  </>
                )}

                {/* Section 5: System */}
                {moduleAllowedByRole('settings') && (
                  <>
                    {sectionLabel({ ru: 'Система', kz: 'Жүйе', eng: 'System' })}
                    <NavItem id="settings" icon={IconSettings} label={getMenuText('settings')} />
                  </>
                )}
              </>
            );
          })()}
        </nav>

        <div className="p-4 border-t border-white/60">
          {/* Toggle Sidebar Button - Desktop only */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden lg:flex w-full items-center justify-center px-3 py-2 text-slate-600 hover:bg-white/70 ring-1 ring-transparent hover:ring-white/60 rounded-xl transition-all mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isSidebarCollapsed ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 19l-7-7 7-7m8 14l-7-7 7-7"} />
            </svg>
          </button>

          {!isSidebarCollapsed && (
            <>
              {/* Profile — clickable for admin (opens Settings), informational for others */}
              <button
                onClick={() => { if (moduleAllowedByRole('settings')) handleMenuClick('settings'); }}
                disabled={!moduleAllowedByRole('settings')}
                className={`w-full flex items-center gap-3 p-3 bg-white/55 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl transition-all ${
                  moduleAllowedByRole('settings') ? 'hover:bg-white/80' : 'cursor-default'
                }`}
              >
                {(() => {
                  const profile = dataStore.profile;
                  const displayName = profile.name || currentUser?.name || '';
                  const displayEmail = profile.email || currentUser?.email || '';
                  const initials = (displayName || displayEmail).trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
                  const roleLabel: Record<string, string> = {
                    admin:    language === 'kz' ? 'Әкімші'    : language === 'eng' ? 'Admin'    : 'Админ',
                    manager:  language === 'kz' ? 'Менеджер'  : language === 'eng' ? 'Manager'  : 'Менеджер',
                    employee: language === 'kz' ? 'Қызметкер' : language === 'eng' ? 'Employee' : 'Сотрудник',
                  };
                  return (
                    <>
                      <div
                        className="w-10 h-10 rounded-2xl overflow-hidden ring-1 ring-white/70 flex items-center justify-center text-sm text-white font-medium flex-shrink-0 shadow-[0_4px_12px_-4px_var(--accent-shadow)]"
                        style={{ background: 'linear-gradient(135deg, var(--accent-500), var(--accent-700))' }}
                      >
                        {profile.avatar
                          ? <img src={profile.avatar} alt="Profile" className="w-full h-full object-cover" />
                          : <span>{initials || '?'}</span>}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm truncate text-slate-900">{displayName}</div>
                        <div className="text-[10px] text-slate-500 truncate flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded-full ring-1 ${
                            role === 'admin'   ? 'bg-emerald-100 text-emerald-700 ring-emerald-200/60' :
                            role === 'manager' ? 'bg-teal-100 text-teal-700 ring-teal-200/60' :
                            'bg-white/60 text-slate-600 ring-white/60'
                          }`}>{roleLabel[role]}</span>
                          <span className="truncate">{displayEmail}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </button>
              {/* Logout */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 mt-2 text-slate-500 hover:bg-rose-100/70 hover:text-rose-700 ring-1 ring-transparent hover:ring-rose-200/60 rounded-xl transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm">{getMenuText('logout')}</span>
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Main Content. Platform AI assistant lives in two places per user's request:
          Telegram-bot is the primary channel (Block F), but a floating in-platform popup is also kept here for quick UI prompts. */}
      <main className="flex-1 overflow-y-auto pt-[57px] lg:pt-0 relative">
        {renderPage()}
        <AIAssistant
          context={currentPage as 'dashboard' | 'ai-design' | 'sales' | 'warehouse' | 'finance' | 'chats' | 'analytics' | 'tasks' | 'settings'}
          language={language}
        />
      </main>
    </div>
  );
}

function ClientCabinetRoute() {
  return (
    <ComingSoon
      title="Кабинет клиента"
      description="Личный кабинет клиента в разработке. Скоро вы сможете отслеживать свои заказы здесь."
      onBack={() => { window.location.hash = ''; }}
    />
  );
}

function PublicRouter({ children }: { children: React.ReactNode }) {
  const [hash, setHash] = useState(typeof window !== 'undefined' ? window.location.hash : '');
  const [legalLang, setLegalLang] = useState<'kz' | 'ru' | 'eng'>('ru');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  if (hash.startsWith('#/track/')) return <ClientTrack orderId={hash.replace('#/track/', '')} />;
  if (hash === '#/cabinet' || hash.startsWith('#/cabinet/')) return <ClientCabinetRoute />;
  if (hash === '#/booking') return <Booking />;
  if (hash === '#/terms') return <Terms language={legalLang} onLanguageChange={setLegalLang} />;
  if (hash === '#/privacy') return <Privacy language={legalLang} onLanguageChange={setLegalLang} />;
  // Password-reset landing — opened from the email link
  // (#/reset-password?token=XXX). Stays public so the user doesn't
  // need to be logged in to reset their forgotten password.
  if (hash.startsWith('#/reset-password')) return <ResetPassword language={legalLang} onLanguageChange={setLegalLang} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <DataProvider>
      <PublicRouter>
        <AppContent />
      </PublicRouter>
      {/* Global toast stack — fed by toast() from anywhere (Д3). */}
      <Toaster />
    </DataProvider>
  );
}