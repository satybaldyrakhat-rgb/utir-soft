import { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { ClientTrack } from './components/ClientTrack';
import { ClientCabinet } from './components/ClientCabinet';
import { ClientAuth, readClientSession, clearClientSession, type ClientSession } from './components/ClientAuth';
import { Booking } from './components/Booking';
import { AIDesign } from './components/AIDesign';
import { SalesKanban } from './components/SalesKanban';
import { Warehouse } from './components/Warehouse';
import { Finance } from './components/Finance';
import { Chats } from './components/Chats';
import { Analytics } from './components/Analytics';
import { Tasks } from './components/Tasks';
import { Settings } from './components/Settings';
import { CustomModulePage } from './components/CustomModulePage';
import { CustomIcon } from './components/CustomIcons';
import { AIAssistant } from './components/AIAssistant';
import { Auth } from './components/Auth';
import { ComingSoon } from './components/ComingSoon';
import { Terms } from './components/Terms';
import { Privacy } from './components/Privacy';
import { Menu, X, LogOut } from 'lucide-react';
import profileLogo from '../imports/utirsoft.png';
import { t } from './utils/translations';
import { DataProvider, useDataStore } from './utils/dataStore';
import { api, getToken, setToken } from './utils/api';

function AppContent() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [language, setLanguage] = useState<'kz' | 'ru' | 'eng'>('ru');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null);
  const dataStore = useDataStore();

  // Sidebar visibility is data-driven from Settings → Модули (Block B.1).
  // Locked modules (dashboard, settings) are always visible regardless of the toggle.
  const isModuleVisible = (id: string) => {
    const m = dataStore.modules.find(x => x.id === id);
    if (!m) return true; // unknown ids stay visible (e.g. legacy pages)
    return m.enabled || !!m.locked;
  };

  // If the currently open page got disabled, fall back to dashboard.
  useEffect(() => {
    if (!isModuleVisible(currentPage)) setCurrentPage('dashboard');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataStore.modules, currentPage]);

  // Restore session on mount
  useEffect(() => {
    const token = getToken();
    if (!token) { setAuthChecked(true); return; }
    api.get<{ user: { id: string; name: string; email: string } }>('/api/auth/me')
      .then(({ user }) => {
        setCurrentUser({ name: user.name, email: user.email });
        setIsAuthenticated(true);
      })
      .catch(() => {
        setToken(null);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const handleLogin = (user: { name: string; email: string }) => {
    setCurrentUser(user);
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

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard language={language} onNavigate={setCurrentPage} />;
      case 'ai-design':
        return <AIDesign language={language} />;
      case 'sales':
        return <SalesKanban language={language} />;
      case 'warehouse':
        return <ComingSoon
          language={language}
          title={language === 'kz' ? 'Өндіріс' : language === 'eng' ? 'Production' : 'Производство'}
          onBack={() => setCurrentPage('dashboard')}
        />;
      case 'finance':
        return <ComingSoon
          language={language}
          title={language === 'kz' ? 'Қаржы' : language === 'eng' ? 'Finance' : 'Финансы'}
          onBack={() => setCurrentPage('dashboard')}
        />;
      case 'chats':
        return <ComingSoon
          language={language}
          title={language === 'kz' ? 'Чаттар' : language === 'eng' ? 'Chats' : 'Чаты'}
          onBack={() => setCurrentPage('dashboard')}
        />;
      case 'analytics':
        return <Analytics language={language} />;
      case 'tasks':
        return <Tasks language={language} />;
      case 'settings':
        return <Settings language={language} onLanguageChange={setLanguage} />;
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
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md flex items-center justify-center overflow-hidden">
            <img src={profileLogo} alt="Utir Soft" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="text-sm">Utir Soft</div>
            <div className="text-xs text-gray-500">{getCurrentPageTitle()}</div>
          </div>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40 mt-[57px]"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-60'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} 
        lg:translate-x-0 fixed lg:static h-full z-50 mt-[57px] lg:mt-0`}>
        <div className="p-6 border-b border-gray-200 hidden lg:block">
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md flex items-center justify-center overflow-hidden">
                <img src={profileLogo} alt="Utir Soft" className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="mb-1">Utir Soft</h1>
                <p className="text-sm text-gray-500">Платформа управления</p>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-md flex items-center justify-center mx-auto overflow-hidden">
              <img src={profileLogo} alt="Utir Soft" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <button
            onClick={() => handleMenuClick('dashboard')}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg mb-1 transition-colors ${
              currentPage === 'dashboard' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
            }`}
            title={isSidebarCollapsed ? getMenuText('home') : ''}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            {!isSidebarCollapsed && <span>{getMenuText('home')}</span>}
          </button>

          {isModuleVisible('ai-design') && (
            <button
              onClick={() => handleMenuClick('ai-design')}
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg mb-1 transition-colors ${
                currentPage === 'ai-design' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
              }`}
              title={isSidebarCollapsed ? getMenuText('aiDesign') : ''}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
              {!isSidebarCollapsed && (
                <span className="flex items-center gap-1.5">
                  {dataStore.modules.find(m => m.id === 'ai-design')?.labels[language] || getMenuText('aiDesign')}
                  <span className="text-[9px] bg-gradient-to-r from-violet-500 to-indigo-600 text-white px-1.5 py-0.5 rounded">AI</span>
                </span>
              )}
            </button>
          )}

          {isModuleVisible('sales') && (
          <button
            onClick={() => handleMenuClick('sales')}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg mb-1 transition-colors ${
              currentPage === 'sales' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
            }`}
            title={isSidebarCollapsed ? getMenuText('orders') : ''}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            {!isSidebarCollapsed && <span>{dataStore.modules.find(m => m.id === 'sales')?.labels[language] || getMenuText('orders')}</span>}
          </button>
          )}

          {isModuleVisible('warehouse') && (
          <button
            onClick={() => handleMenuClick('warehouse')}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg mb-1 transition-colors ${
              currentPage === 'warehouse' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
            }`}
            title={isSidebarCollapsed ? getMenuText('production') : ''}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            {!isSidebarCollapsed && <span>{dataStore.modules.find(m => m.id === 'warehouse')?.labels[language] || getMenuText('production')}</span>}
          </button>
          )}

          {isModuleVisible('chats') && (
          <button
            onClick={() => handleMenuClick('chats')}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg mb-1 transition-colors ${
              currentPage === 'chats' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
            }`}
            title={isSidebarCollapsed ? getMenuText('chats') : ''}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {!isSidebarCollapsed && <span>{dataStore.modules.find(m => m.id === 'chats')?.labels[language] || getMenuText('chats')}</span>}
          </button>
          )}

          {isModuleVisible('tasks') && (
          <button
            onClick={() => handleMenuClick('tasks')}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg mb-1 transition-colors ${
              currentPage === 'tasks' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
            }`}
            title={isSidebarCollapsed ? getMenuText('tasks') : ''}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {!isSidebarCollapsed && <span>{dataStore.modules.find(m => m.id === 'tasks')?.labels[language] || getMenuText('tasks')}</span>}
          </button>
          )}

          {isModuleVisible('analytics') && (
          <button
            onClick={() => handleMenuClick('analytics')}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg mb-1 transition-colors ${
              currentPage === 'analytics' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
            }`}
            title={isSidebarCollapsed ? getMenuText('analytics') : ''}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {!isSidebarCollapsed && <span>{dataStore.modules.find(m => m.id === 'analytics')?.labels[language] || getMenuText('analytics')}</span>}
          </button>
          )}

          {/* Custom modules — rendered in the order they appear in dataStore.modules */}
          {dataStore.modules.filter(m => m.custom && m.enabled).map(m => (
            <button
              key={m.id}
              onClick={() => handleMenuClick(m.id)}
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg mb-1 transition-colors ${
                currentPage === m.id ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
              }`}
              title={isSidebarCollapsed ? m.labels[language] : ''}
            >
              <CustomIcon name={m.icon} className="w-5 h-5 flex-shrink-0" />
              {!isSidebarCollapsed && <span>{m.labels[language]}</span>}
            </button>
          ))}

          <button
            onClick={() => handleMenuClick('settings')}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-lg mb-1 transition-colors ${
              currentPage === 'settings' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
            }`}
            title={isSidebarCollapsed ? getMenuText('settings') : ''}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {!isSidebarCollapsed && <span>{getMenuText('settings')}</span>}
          </button>
        </nav>

        <div className="p-4 border-t border-gray-200">
          {/* Toggle Sidebar Button - Desktop only */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden lg:flex w-full items-center justify-center px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isSidebarCollapsed ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 19l-7-7 7-7m8 14l-7-7 7-7"} />
            </svg>
          </button>

          {!isSidebarCollapsed && (
            <>
              {/* Profile */}
              <button
                onClick={() => handleMenuClick('settings')}
                className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {(() => {
                  const profile = dataStore.profile;
                  const displayName = profile.name || currentUser?.name || '';
                  const displayEmail = profile.email || currentUser?.email || '';
                  const initials = (displayName || displayEmail).trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <>
                      <div className="w-10 h-10 rounded-md overflow-hidden bg-gray-200 flex items-center justify-center text-sm text-gray-600 flex-shrink-0">
                        {profile.avatar
                          ? <img src={profile.avatar} alt="Profile" className="w-full h-full object-cover" />
                          : <span>{initials || '👤'}</span>}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm truncate">{displayName}</div>
                        <div className="text-xs text-gray-500 truncate">{displayEmail}</div>
                      </div>
                    </>
                  );
                })()}
              </button>
              {/* Logout */}
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 mt-2 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
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
  return <>{children}</>;
}

export default function App() {
  return (
    <DataProvider>
      <PublicRouter>
        <AppContent />
      </PublicRouter>
    </DataProvider>
  );
}