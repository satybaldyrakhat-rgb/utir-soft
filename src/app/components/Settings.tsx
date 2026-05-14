import { useState } from 'react';
import { MessageCircle, Bot, Sparkles, Users, Settings as SettingsIcon, Zap, Activity, Plus, Search, Edit2, Trash2, UserPlus, Star, CheckCircle, X, Shield, Check, Eye, ChevronDown, LayoutGrid } from 'lucide-react';
import { ModulesSettings } from './ModulesSettings';
import { WhatsAppLogo, TelegramLogo, InstagramLogo, TikTokLogo, KaspiLogo, FreedomLogo, HalykLogo, OneCLogo, ChatGPTLogo, GeminiLogo, GoogleLogo, MetaLogo } from './PlatformLogos';
import { useDataStore } from '../utils/dataStore';

interface Employee {
  id: string; name: string; email: string; phone: string;
  role: 'admin' | 'manager' | 'designer' | 'production' | 'sales' | 'accountant';
  department: string; status: 'active' | 'inactive' | 'vacation'; salary: number;
  joinDate: string; lastActive: string;
  permissions: { sales: boolean; finance: boolean; warehouse: boolean; chats: boolean; analytics: boolean; settings: boolean; };
  schedule: Record<string, string>;
  performance: { ordersCompleted: number; rating: number; efficiency: number; };
}

interface ActivityLog { id: string; user: string; action: string; target: string; timestamp: string; type: 'create' | 'update' | 'delete' | 'login' | 'logout'; }

interface SettingsProps { language: 'kz' | 'ru' | 'eng'; onLanguageChange?: (language: 'kz' | 'ru' | 'eng') => void; }

export function Settings({ language, onLanguageChange }: SettingsProps) {
  const store = useDataStore();
  const [activeTab, setActiveTab] = useState<'general' | 'employees' | 'ai' | 'modules' | 'integrations' | 'logs' | 'roles'>('general');
  const [aiChatEnabled, setAiChatEnabled] = useState(true);
  const [aiGlobalEnabled, setAiGlobalEnabled] = useState(true);
  const [selectedAiModel, setSelectedAiModel] = useState('default');
  const [aiTone, setAiTone] = useState<'professional' | 'friendly' | 'casual'>('friendly');
  const [companyName, setCompanyName] = useState('Utir Soft');
  const [companyAddress, setCompanyAddress] = useState('Алматы, ул. Сейфуллина 458');
  const [companyPhone, setCompanyPhone] = useState('+7 (727) 250-00-00');
  const [companyEmail, setCompanyEmail] = useState('admin@utirsoft.kz');
  const [companyBIN, setCompanyBIN] = useState('123456789012');

  // Use store employees mapped to local format
  const employees = store.employees.map(e => ({
    id: e.id, name: e.name, email: e.email, phone: e.phone, role: e.role,
    department: e.department, status: e.status, salary: e.salary, joinDate: e.joinDate,
    lastActive: e.lastActive, permissions: e.permissions, schedule: {} as Record<string, string>,
    performance: e.performance,
  }));
  const setEmployees = (updater: any) => {
    // Handle updates through store
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');

  const activityLogs = store.activityLogs;

  const integrationIcons: Record<string, JSX.Element> = {
    whatsapp: <WhatsAppLogo className="w-5 h-5" />, telegram: <TelegramLogo className="w-5 h-5" />,
    instagram: <InstagramLogo className="w-5 h-5" />, tiktok: <TikTokLogo className="w-5 h-5" />,
    'kaspi-qr': <KaspiLogo className="w-5 h-5" />, '1c': <OneCLogo className="w-5 h-5" />,
    chatgpt: <ChatGPTLogo className="w-5 h-5" />, gemini: <GeminiLogo className="w-5 h-5" />,
    google: <GoogleLogo className="w-5 h-5" />, meta: <MetaLogo className="w-5 h-5" />,
  };

  const integrations = store.integrations.map(ig => ({
    ...ig, icon: integrationIcons[ig.id] || <Zap className="w-5 h-5 text-gray-400" />,
  }));

  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const roleLabel = (r: string) => ({ admin: 'Админ', manager: 'Менеджер продаж', designer: 'Дизайнер', production: 'Производство', sales: 'Продажи', accountant: 'Бухгалтер' }[r] || r);
  const roleBg = (r: string) => ({ admin: 'bg-gray-200 text-gray-700', manager: 'bg-blue-50 text-blue-600', designer: 'bg-purple-50 text-purple-600', production: 'bg-orange-50 text-orange-600', sales: 'bg-green-50 text-green-600', accountant: 'bg-green-50 text-green-600' }[r] || 'bg-gray-50 text-gray-600');
  const statusDot = (s: string) => s === 'active' ? 'bg-green-500' : s === 'vacation' ? 'bg-blue-500' : 'bg-gray-300';

  const filteredEmployees = employees.filter(e => {
    const s = e.name.toLowerCase().includes(searchQuery.toLowerCase());
    const r = filterRole === 'all' || e.role === filterRole;
    return s && r;
  });

  const deleteEmployee = (id: string) => { if (confirm('Удалить?')) store.deleteEmployee(id); };

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button onClick={onChange} className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-gray-900' : 'bg-gray-200'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
    </button>
  );

  const Input = ({ label, value, onChange, ...props }: { label: string; value: string; onChange: (v: string) => void } & Record<string, any>) => (
    <div>
      <label className="block text-[11px] text-gray-400 mb-1">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" {...props} />
    </div>
  );

  const tabs = [
    { id: 'general' as const, icon: SettingsIcon, label: l('Основные', 'Негізгі', 'General') },
    { id: 'employees' as const, icon: Users, label: l('Команда', 'Команда', 'Team') },
    { id: 'ai' as const, icon: Bot, label: 'AI' },
    { id: 'modules' as const, icon: LayoutGrid, label: l('Модули', 'Модульдер', 'Modules') },
    { id: 'integrations' as const, icon: Zap, label: l('Интеграции', 'Интеграциялар', 'Integrations') },
    { id: 'roles' as const, icon: Shield, label: l('Роли и права', 'Рөлдер', 'Roles') },
    { id: 'logs' as const, icon: Activity, label: l('Журнал', 'Журнал', 'Logs') },
  ];

  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [empRole, setEmpRole] = useState<string>('manager');
  const [empPermissions, setEmpPermissions] = useState({ allOrders: true, finance: false, editTeam: false, export: false });

  return (
    <div className="p-4 md:p-8 max-w-[1000px]">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs text-gray-400 mb-1">{l('Настройки', 'Баптаулар', 'Settings')}</p>
        <h1 className="text-gray-900">{l('Управление системой', 'Жүйені басқару', 'System')}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap transition-all ${activeTab === t.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-100 text-gray-400 hover:text-gray-600'}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* ===== GENERAL ===== */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* Profile */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="text-sm text-gray-900">{l('Мой профиль', 'Менің профилім', 'My Profile')}</div>
              <span className="flex items-center gap-1 text-[10px] text-green-500"><span className="w-1.5 h-1.5 bg-green-500 rounded-full" />{l('Активен', 'Белсенді', 'Active')}</span>
            </div>
            <div className="flex flex-col md:flex-row gap-5">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-500 text-xl mb-2">Р</div>
                <button className="text-[10px] text-gray-400 hover:text-gray-600">{l('Изменить', 'Өзгерту', 'Change')}</button>
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input label={l('Имя', 'Аты', 'Name')} value="Рахат Сатыбалды" onChange={() => {}} />
                <Input label={l('Должность', 'Лауазым', 'Position')} value="Директор" onChange={() => {}} />
                <Input label="Email" value="rakhat@utir.kz" onChange={() => {}} />
                <Input label={l('Телефон', 'Телефон', 'Phone')} value="+7 701 234 5678" onChange={() => {}} />
              </div>
            </div>
          </div>

          {/* Company */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-900 mb-5">{l('Компания', 'Компания', 'Company')}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label={l('Название', 'Атауы', 'Name')} value={companyName} onChange={setCompanyName} />
              <Input label={l('БИН', 'БСН', 'BIN')} value={companyBIN} onChange={setCompanyBIN} />
              <div className="md:col-span-2"><Input label={l('Адрес', 'Мекенжай', 'Address')} value={companyAddress} onChange={setCompanyAddress} /></div>
              <Input label="Email" value={companyEmail} onChange={setCompanyEmail} />
              <Input label={l('Телефон', 'Телефон', 'Phone')} value={companyPhone} onChange={setCompanyPhone} />
            </div>
            <button onClick={() => alert('Сохранено!')} className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">{l('Сохранить', 'Сақтау', 'Save')}</button>
          </div>

          {/* Language */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-900 mb-4">{l('Язык системы', 'Жүйе тілі', 'Language')}</div>
            <div className="grid grid-cols-3 gap-2">
              {[{ code: 'kz' as const, flag: '🇰🇿', name: 'Қазақша' }, { code: 'ru' as const, flag: '🇷🇺', name: 'Русский' }, { code: 'eng' as const, flag: '🇬🇧', name: 'English' }].map(lang => (
                <button key={lang.code} onClick={() => onLanguageChange?.(lang.code)} className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${language === lang.code ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-200'}`}>
                  <span className="text-lg">{lang.flag}</span>
                  <span className="text-xs text-gray-600">{lang.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== EMPLOYEES ===== */}
      {activeTab === 'employees' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="flex-1 flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                <input type="text" placeholder={l('Поиск...', 'Іздеу...', 'Search...')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
              </div>
              <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="px-3 py-2 bg-gray-50 border-0 rounded-xl text-xs focus:outline-none text-gray-600">
                <option value="all">{l('Все', 'Бәрі', 'All')}</option>
                <option value="admin">{l('Админ', 'Админ', 'Admin')}</option>
                <option value="manager">{l('Менеджер', 'Менеджер', 'Manager')}</option>
                <option value="designer">{l('Дизайнер', 'Дизайнер', 'Designer')}</option>
                <option value="production">{l('Производство', 'Өндіріс', 'Production')}</option>
                <option value="sales">{l('Продажи', 'Сату', 'Sales')}</option>
                <option value="accountant">{l('Бухгалтер', 'Бухгалтер', 'Accountant')}</option>
              </select>
            </div>
            <button onClick={() => setShowEmployeeModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800"><UserPlus className="w-3.5 h-3.5" />{l('Добавить', 'Қосу', 'Add')}</button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: l('Всего', 'Барлығы', 'Total'), value: employees.length },
              { label: l('Активны', 'Белсенді', 'Active'), value: employees.filter(e => e.status === 'active').length },
              { label: l('Рейтинг', 'Рейтинг', 'Rating'), value: (employees.reduce((s, e) => s + e.performance.rating, 0) / employees.length).toFixed(1) },
              { label: l('Эффект.', 'Тиімд.', 'Effic.'), value: `${Math.round(employees.reduce((s, e) => s + e.performance.efficiency, 0) / employees.length)}%` },
            ].map((s, i) => <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4"><div className="text-[10px] text-gray-400 mb-2">{s.label}</div><div className="text-lg text-gray-900">{s.value}</div></div>)}
          </div>

          {/* Employee list */}
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {filteredEmployees.map(emp => (
              <div key={emp.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors group">
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 text-sm">{emp.name.charAt(0)}</div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 ${statusDot(emp.status)} border-2 border-white rounded-full`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm text-gray-900 truncate">{emp.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${roleBg(emp.role)}`}>{roleLabel(emp.role)}</span>
                  </div>
                  <div className="text-[10px] text-gray-400">{emp.email} · {emp.department}</div>
                </div>
                <div className="hidden sm:flex items-center gap-4 text-center">
                  <div><div className="text-[10px] text-gray-400">{l('Заказов', 'Тапсырыс', 'Orders')}</div><div className="text-xs text-gray-900">{emp.performance.ordersCompleted}</div></div>
                  <div><div className="text-[10px] text-gray-400">{l('Рейтинг', 'Рейтинг', 'Rating')}</div><div className="text-xs text-gray-900 flex items-center gap-0.5 justify-center"><Star className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500" />{emp.performance.rating}</div></div>
                  <div><div className="text-[10px] text-gray-400">{l('ЗП', 'Жалақы', 'Salary')}</div><div className="text-xs text-gray-900">{(emp.salary / 1000).toFixed(0)}К₸</div></div>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditingEmployee(emp); setEmpRole(emp.role); setShowEmployeeModal(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit2 className="w-3.5 h-3.5 text-gray-400" /></button>
                  <button onClick={() => deleteEmployee(emp.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                </div>
              </div>
            ))}
            {filteredEmployees.length === 0 && (
              <div className="py-12 text-center"><Users className="w-8 h-8 text-gray-200 mx-auto mb-2" /><p className="text-xs text-gray-400">{l('Не найдено', 'Табылмады', 'Not found')}</p></div>
            )}
          </div>
        </div>
      )}

      {/* ===== AI ===== */}
      {activeTab === 'ai' && (
        <div className="space-y-5">
          {/* AI Model Picker */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm text-gray-900">{l('Модель AI', 'AI моделі', 'AI Model')}</div>
                <div className="text-[10px] text-gray-400">{l('Выберите модель по умолчанию для всех модулей', 'Барлық модульдер үшін әдепкі модель', 'Default model for all modules')}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { id: 'default', name: 'Utir AI', desc: l('По умолчанию · быстро', 'Әдепкі · жылдам', 'Default · fast'), badge: l('Базовая', 'Базалық', 'Base') },
                { id: 'gemini', name: 'Gemini 3.1 Pro', desc: 'Google · 2M context', badge: 'Google' },
                { id: 'claude', name: 'Claude Opus 4.7', desc: l('Anthropic · точность', 'Anthropic · дәлдік', 'Anthropic · accuracy'), badge: 'Anthropic' },
                { id: 'gpt', name: 'ChatGPT 5', desc: l('OpenAI · универсальная', 'OpenAI · әмбебап', 'OpenAI · universal'), badge: 'OpenAI' },
                { id: 'deepseek', name: 'DeepSeek V3', desc: l('Open-source', 'Ашық код', 'Open-source'), badge: 'Open' },
                { id: 'grok', name: 'Grok 3', desc: 'xAI · realtime', badge: 'xAI' },
              ].map(m => (
                <button key={m.id} onClick={() => setSelectedAiModel(m.id)}
                  className={`p-3.5 rounded-xl border text-left transition ${selectedAiModel === m.id ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:bg-gray-50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm text-gray-900">{m.name}</div>
                    <span className="text-[9px] px-1.5 py-0.5 bg-white rounded text-gray-500">{m.badge}</span>
                  </div>
                  <div className="text-[10px] text-gray-400">{m.desc}</div>
                </button>
              ))}
            </div>
            <div className="text-[10px] text-gray-400 mt-3">{l('Также можно выбрать модель прямо в окне AI-ассистента (правый нижний угол).', 'Модельді AI-көмекші терезесінде де таңдауға болады.', 'You can also pick a model directly in the AI assistant popup.')}</div>
          </div>

          {/* Global AI */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></div>
                <div><div className="text-sm text-gray-900">{l('Глобальный AI', 'Жаһандық AI', 'Global AI')}</div><div className="text-[10px] text-gray-400">{l('Помощник на всех страницах', 'Барлық беттердегі көмекші', 'Assistant on all pages')}</div></div>
              </div>
              <Toggle value={aiGlobalEnabled} onChange={() => setAiGlobalEnabled(!aiGlobalEnabled)} />
            </div>
            {aiGlobalEnabled && (
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-50">
                {[l('Подсказки', 'Кеңестер', 'Tips'), l('Заполнение форм', 'Форма толтыру', 'Form fill'), l('Ответы', 'Жауаптар', 'Answers'), l('Рекомендации', 'Ұсыныстар', 'Recs')].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-500"><CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />{f}</div>
                ))}
              </div>
            )}
          </div>

          {/* Chat AI */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center"><MessageCircle className="w-4 h-4 text-green-600" /></div>
                <div><div className="text-sm text-gray-900">{l('AI в чатах', 'Чаттардағы AI', 'Chat AI')}</div><div className="text-[10px] text-gray-400">{l('Автоответы клиентам', 'Клиенттерге автожауап', 'Auto-replies')}</div></div>
              </div>
              <Toggle value={aiChatEnabled} onChange={() => setAiChatEnabled(!aiChatEnabled)} />
            </div>
            {aiChatEnabled && (
              <div className="space-y-4 pt-3 border-t border-gray-50">
                <div>
                  <div className="text-[11px] text-gray-400 mb-2">{l('Тон общения', 'Қарым-қатынас тоны', 'Tone')}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ id: 'professional' as const, emoji: '👔', label: l('Профессиональный', 'Кәсіби', 'Professional') }, { id: 'friendly' as const, emoji: '😊', label: l('Дружелюбный', 'Достық', 'Friendly') }, { id: 'casual' as const, emoji: '✌️', label: l('Неформальный', 'Бейресми', 'Casual') }].map(t => (
                      <button key={t.id} onClick={() => setAiTone(t.id)} className={`p-3 rounded-xl border text-center transition-all ${aiTone === t.id ? 'border-gray-900 bg-gray-50' : 'border-gray-100'}`}>
                        <div className="text-lg mb-1">{t.emoji}</div>
                        <div className="text-[10px] text-gray-600">{t.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-400 mb-1">{l('Инструкции', 'Нұсқаулар', 'Instructions')}</div>
                  <textarea defaultValue="Вы - консультант по мебели. Помогайте выбрать мебель и рассчитывать стоимость." rows={3} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'modules' && <ModulesSettings language={language} />}

      {/* ===== INTEGRATIONS ===== */}
      {activeTab === 'integrations' && (
        <div className="space-y-5">
          {['msg', 'fin', 'ai', 'other'].map(cat => {
            const items = integrations.filter(i => i.cat === cat);
            const catLabel = { msg: l('Мессенджеры', 'Мессенджерлер', 'Messaging'), fin: l('Финансы', 'Қаржы', 'Finance'), ai: 'AI', other: l('Другое', 'Басқа', 'Other') }[cat];
            return (
              <div key={cat}>
                <div className="text-[11px] text-gray-400 mb-2">{catLabel}</div>
                <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
                  {items.map(intg => (
                    <div key={intg.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0">{intg.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900">{intg.name}</div>
                        <div className="text-[10px] text-gray-400">{intg.desc}</div>
                      </div>
                      {intg.connected ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-500"><span className="w-1.5 h-1.5 bg-green-500 rounded-full" />{l('Подключено', 'Қосылды', 'Connected')}</span>
                      ) : (
                        <button onClick={() => store.toggleIntegration(intg.id)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-[10px] text-gray-500 hover:bg-gray-50">{l('Подключить', 'Қосу', 'Connect')}</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== ROLES & PERMISSIONS ===== */}
      {activeTab === 'roles' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-900 mb-4">Матрица доступа</div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left text-[11px] text-gray-400 pb-3 pr-4">Роль</th>
                    {['Заказы', 'Чаты', 'Финансы', 'Производство', 'Аналитика', 'Настройки'].map(m => (
                      <th key={m} className="text-center text-[11px] text-gray-400 pb-3 px-2 whitespace-nowrap">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {([
                    { role: 'Админ', badge: 'bg-gray-200 text-gray-700', access: ['full','full','full','full','full','full'] },
                    { role: 'Менеджер продаж', badge: 'bg-blue-50 text-blue-600', access: ['full','full','none','view','view','none'] },
                    { role: 'Дизайнер', badge: 'bg-purple-50 text-purple-600', access: ['view','full','none','none','none','none'] },
                    { role: 'Производство', badge: 'bg-orange-50 text-orange-600', access: ['view','none','none','full','none','none'] },
                    { role: 'Бухгалтер', badge: 'bg-green-50 text-green-600', access: ['view','none','full','none','view','none'] },
                  ]).map((row, ri) => (
                    <tr key={ri} className="hover:bg-gray-50/50">
                      <td className="py-3 pr-4">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${row.badge}`}>{row.role}</span>
                      </td>
                      {row.access.map((acc, ai) => (
                        <td key={ai} className="py-3 px-2 text-center">
                          {acc === 'full' && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-50"><Check className="w-3.5 h-3.5 text-green-600" /></span>}
                          {acc === 'view' && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-50"><Eye className="w-3.5 h-3.5 text-gray-400" /></span>}
                          {acc === 'none' && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-50"><X className="w-3.5 h-3.5 text-red-400" /></span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center gap-4 text-[11px] text-gray-400">
              <span className="flex items-center gap-1"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-50"><Check className="w-3 h-3 text-green-600" /></span>Полный доступ</span>
              <span className="flex items-center gap-1"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-50"><Eye className="w-3 h-3 text-gray-400" /></span>Только просмотр</span>
              <span className="flex items-center gap-1"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-50"><X className="w-3 h-3 text-red-400" /></span>Нет доступа</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== LOGS ===== */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-50">
            <div className="text-sm text-gray-900">{l('Последние действия', 'Соңғы әрекеттер', 'Recent Activity')}</div>
          </div>
          <div className="divide-y divide-gray-50">
            {activityLogs.map(log => (
              <div key={log.id} className="px-4 py-3 flex items-center gap-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${log.type === 'create' ? 'bg-green-50' : log.type === 'update' ? 'bg-blue-50' : log.type === 'delete' ? 'bg-red-50' : 'bg-gray-50'}`}>
                  {log.type === 'create' ? <Plus className="w-3 h-3 text-green-500" /> : log.type === 'update' ? <Edit2 className="w-3 h-3 text-blue-500" /> : log.type === 'logout' ? <X className="w-3 h-3 text-gray-400" /> : <Trash2 className="w-3 h-3 text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-900"><span className="text-gray-500">{log.user}</span> {log.action} {log.target && <span className="text-gray-900">{log.target}</span>}</div>
                </div>
                <span className="text-[10px] text-gray-300 flex-shrink-0">{log.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== ADD/EDIT EMPLOYEE MODAL ===== */}
      {showEmployeeModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowEmployeeModal(false); setEditingEmployee(null); }}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-50 flex items-center justify-between">
              <span className="text-sm text-gray-900">{editingEmployee ? 'Редактировать сотрудника' : 'Добавить сотрудника'}</span>
              <button onClick={() => { setShowEmployeeModal(false); setEditingEmployee(null); }} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="block text-[11px] text-gray-400 mb-1">Имя</label><input type="text" defaultValue={editingEmployee?.name || ''} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
              <div><label className="block text-[11px] text-gray-400 mb-1">Email</label><input type="email" defaultValue={editingEmployee?.email || ''} className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
              <div><label className="block text-[11px] text-gray-400 mb-1">Телефон</label><input type="text" defaultValue={editingEmployee?.phone || ''} placeholder="+7 (700) 123-45-67" className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" /></div>
              {/* Role block */}
              <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
                <div className="text-[11px] text-gray-500">Роль и доступ</div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-2">Роль</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([['admin', 'Админ', 'bg-gray-200 text-gray-700'], ['manager', 'Менеджер продаж', 'bg-blue-50 text-blue-600'], ['designer', 'Дизайнер', 'bg-purple-50 text-purple-600'], ['production', 'Производство', 'bg-orange-50 text-orange-600'], ['accountant', 'Бухгалтер', 'bg-green-50 text-green-600']] as [string, string, string][]).map(([id, label, cls]) => (
                      <button key={id} onClick={() => setEmpRole(id)} className={`px-3 py-2 rounded-xl text-[11px] border transition-all text-left ${empRole === id ? cls + ' border-current' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                        {empRole === id && <span className="mr-1">✓</span>}{label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-2">Дополнительные права</label>
                  <div className="space-y-1">
                    {([['allOrders', 'Видит все заказы (если выкл — только свои)'], ['finance', 'Видит финансовую информацию'], ['editTeam', 'Может редактировать настройки команды'], ['export', 'Может экспортировать данные']] as [keyof typeof empPermissions, string][]).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={empPermissions[key]} onChange={e => setEmpPermissions({ ...empPermissions, [key]: e.target.checked })} className="w-3.5 h-3.5 rounded accent-gray-900" />
                        <span className="text-xs text-gray-700">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5 pt-0 flex gap-2">
              <button onClick={() => { setShowEmployeeModal(false); setEditingEmployee(null); }} className="flex-1 px-3 py-2.5 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">Отмена</button>
              <button onClick={() => { setShowEmployeeModal(false); setEditingEmployee(null); }} className="flex-1 px-3 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}