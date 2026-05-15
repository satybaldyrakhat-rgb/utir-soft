import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Bot, Sparkles, Users, Settings as SettingsIcon, Zap, Activity, Plus, Search, Edit2, Trash2, UserPlus, Star, CheckCircle, X, Shield, Check, Eye, ChevronDown, LayoutGrid, Camera, BookOpen, Send } from 'lucide-react';
import { ModulesSettings } from './ModulesSettings';
import { ActivityLog } from './ActivityLog';
import { TelegramPairing } from './TelegramPairing';
import { TeamInvitePanel } from './TeamInvitePanel';
import { WhatsAppLogo, TelegramLogo, InstagramLogo, TikTokLogo, KaspiLogo, FreedomLogo, HalykLogo, OneCLogo, ChatGPTLogo, GeminiLogo, GoogleLogo, MetaLogo } from './PlatformLogos';
import { useDataStore, ALL_MODULES, ALL_ROLES, MODULE_GROUPS, type CatalogKey, type RoleKey, type ModuleKey, type PermissionLevel } from '../utils/dataStore';
import { api } from '../utils/api';
import { t } from '../utils/translations';

// Until C.2 (invitations) ships, the workspace owner is always the admin.
// Once server returns real per-user role, replace this with a store/prop value.
// isAdmin was a hardcoded placeholder before the role system
// landed. Now it's computed at render time from store.currentUserRole below.
const ADMIN_ONLY_TABS: ReadonlyArray<string> = ['employees', 'activity'];

interface Employee {
  id: string; name: string; email: string; phone: string;
  role: RoleKey;
  department: string; status: 'active' | 'inactive' | 'vacation'; salary: number;
  joinDate: string; lastActive: string;
  permissions: { sales: boolean; finance: boolean; warehouse: boolean; chats: boolean; analytics: boolean; settings: boolean; };
  schedule: Record<string, string>;
  performance: { ordersCompleted: number; rating: number; efficiency: number; };
}

interface ActivityLog { id: string; user: string; action: string; target: string; timestamp: string; type: 'create' | 'update' | 'delete' | 'login' | 'logout'; }

interface SettingsProps {
  language: 'kz' | 'ru' | 'eng';
  onLanguageChange?: (language: 'kz' | 'ru' | 'eng') => void;
  currentUserEmail?: string;
}

export function Settings({ language, onLanguageChange, currentUserEmail }: SettingsProps) {
  const store = useDataStore();
  // Real admin check. Used for hard-gated sub-tabs (Команда и права, Журнал)
  // that should never be visible to non-admins regardless of the matrix.
  const isAdmin = store.currentUserRole === 'admin';

  // Pending matrix state — clicks on permission cells update this locally;
  // nothing hits the backend until the admin clicks 'Сохранить'. Null means
  // 'no pending edits, show store values'.
  const [pendingMatrix, setPendingMatrix] = useState<Record<string, Record<string, PermissionLevel>> | null>(null);
  const currentMatrix: Record<string, Record<string, PermissionLevel>> = pendingMatrix ?? (store.rolePermissions as any);
  const matrixDirty = pendingMatrix !== null;
  const updateMatrixCell = (role: string, module: string, level: PermissionLevel) => {
    setPendingMatrix(prev => {
      const base = prev ?? (store.rolePermissions as any);
      return {
        ...base,
        [role]: { ...(base[role] || {}), [module]: level },
      };
    });
  };
  const saveMatrix = () => {
    if (!pendingMatrix) return;
    store.bulkSetRolePermissions(pendingMatrix as any);
    setPendingMatrix(null);
  };
  const discardMatrix = () => setPendingMatrix(null);
  const profile = store.profile;
  const catalogs = store.catalogs;
  const aiClient = store.aiSettings.client;
  const aiAssistant = store.aiSettings.assistant;
  const [activeTab, setActiveTab] = useState<'general' | 'employees' | 'ai-client' | 'ai-assistant' | 'modules' | 'integrations' | 'catalogs' | 'activity'>('general');
  const tt = (key: Parameters<typeof t>[0]) => t(key, language);
  const [savedFlash, setSavedFlash] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const handleAvatarPick = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 4 * 1024 * 1024) {
      alert('Файл больше 4 МБ. Выберите меньшее фото.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      // Downscale via canvas to keep localStorage small
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          store.updateProfile({ avatar: canvas.toDataURL('image/jpeg', 0.85) });
        } else {
          store.updateProfile({ avatar: dataUrl });
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleProfileSave = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
    store.addActivity({ user: 'Вы', action: 'Обновили профиль и компанию', target: '', type: 'update', page: 'settings' });
  };

  const initials = (profile.name || '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // Use store employees mapped to local format
  // Map store employees to local view-model. We split into active (visible in
  // the main team list) and removed (shown in the 'Удалённые сотрудники' block)
  // by looking at the optional `removed_at` field added by the kick handler.
  const allEmployees = store.employees.map(e => ({
    id: e.id, name: e.name, email: e.email, phone: e.phone, role: e.role,
    department: e.department, status: e.status, salary: e.salary, joinDate: e.joinDate,
    lastActive: e.lastActive, permissions: e.permissions, schedule: {} as Record<string, string>,
    performance: e.performance,
    removedAt: (e as any).removed_at as string | undefined,
  }));
  const employees = allEmployees.filter(e => !e.removedAt);
  const removedEmployees = allEmployees.filter(e => e.removedAt);

  // Team-wide Telegram pairings — fetched once on mount + refreshed on the
  // 'utir:auth-changed' event. Used to show a paperplane badge on each
  // teammate row so admin sees who can receive bot notifications.
  const [pairedEmails, setPairedEmails] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.get<Array<{ email: string }>>('/api/team/pairings')
        .then(rows => { if (!cancelled) setPairedEmails(new Set(rows.map(r => (r.email || '').toLowerCase()))); })
        .catch(() => { /* non-admin or empty — ignore */ });
    };
    load();
    const reload = () => load();
    window.addEventListener('utir:auth-changed', reload);
    return () => { cancelled = true; window.removeEventListener('utir:auth-changed', reload); };
  }, []);
  const setEmployees = (updater: any) => {
    // Handle updates through store
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');


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
  // Look up a role's human label first in the team's role list (admin can
  // rename or add roles), then fall back to the canonical localised labels
  // for the three built-ins, finally to the raw id.
  const roleLabel = (r: string) => {
    const custom = store.roles.find(x => x.id === r);
    if (custom) return custom.name;
    return ({
      admin: tt('roleAdmin'),
      manager: tt('roleManager'),
      employee: tt('roleEmployee'),
    } as Record<string, string>)[r] || r;
  };
  const roleBg = (r: string) => ({
    admin: 'bg-gray-200 text-gray-700',
    manager: 'bg-blue-50 text-blue-600',
    employee: 'bg-emerald-50 text-emerald-600',
  } as Record<string, string>)[r] || 'bg-gray-50 text-gray-600';
  const moduleLabel = (m: ModuleKey) => ({
    dashboard:               l('Главная',             'Басты бет',         'Home'),
    'ai-design':             l('AI Дизайн',           'AI Дизайн',         'AI Design'),
    orders:                  tt('modOrders'),
    production:              tt('modProduction'),
    finance:                 l('Финансы',             'Қаржы',             'Finance'),
    payments:                l('Платежи',             'Төлемдер',          'Payments'),
    chats:                   tt('modChats'),
    tasks:                   l('Задачи',              'Тапсырмалар',       'Tasks'),
    analytics:               tt('modAnalytics'),
    marketing:               l('Реклама',             'Жарнама',           'Marketing'),
    settings:                l('Настройки (общее)',   'Баптаулар (жалпы)', 'Settings (overview)'),
    'settings-catalogs':     l('Справочники',         'Анықтамалықтар',    'Catalogs'),
    'settings-modules':      l('Модули',              'Модульдер',         'Modules'),
    'settings-integrations': l('Интеграции',          'Интеграциялар',     'Integrations'),
    'settings-ai':           l('AI-настройки',        'AI баптаулары',     'AI settings'),
  })[m];
  const statusDot = (s: string) => s === 'active' ? 'bg-green-500' : s === 'vacation' ? 'bg-blue-500' : 'bg-gray-300';

  const filteredEmployees = employees.filter(e => {
    const s = e.name.toLowerCase().includes(searchQuery.toLowerCase());
    const r = filterRole === 'all' || e.role === filterRole;
    return s && r;
  });

  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState<string>('');

  const closeEmployeeModal = () => {
    setShowEmployeeModal(false);
    setEditingEmployee(null);
    setRoleError('');
  };

  const saveEmployeeRole = async () => {
    if (!editingEmployee) { closeEmployeeModal(); return; }
    setRoleError('');

    const name = empName.trim();
    const phone = empPhone.trim();
    const profileChanged = name !== (editingEmployee.name || '') || phone !== (editingEmployee.phone || '');
    const roleChanged = editingEmployee.role !== empRole;

    // Self-protection mirrors the backend rule.
    const isSelf = !!currentUserEmail && editingEmployee.email.toLowerCase() === currentUserEmail.toLowerCase();
    if (roleChanged && isSelf) {
      setRoleError(l('Нельзя менять собственную роль.', 'Өз рөліңізді өзгерте алмайсыз.', "You can't change your own role."));
      return;
    }

    if (!profileChanged && !roleChanged) { closeEmployeeModal(); return; }

    setRoleSaving(true);
    try {
      // Profile fields go through the generic employees PATCH endpoint.
      if (profileChanged) {
        store.updateEmployee(editingEmployee.id, { name, phone });
      }
      // Role goes through the dedicated endpoint so it also updates users.team_role.
      if (roleChanged) {
        await api.patch(`/api/employees/${editingEmployee.id}/role`, { role: empRole });
      }
      await store.reloadAll();
      closeEmployeeModal();
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg === 'team must keep at least one admin') {
        setRoleError(l('Нельзя оставить команду без админа.', 'Команданы әкімшісіз қалдыруға болмайды.', "Team must keep at least one admin."));
      } else if (msg === 'cannot change own role') {
        setRoleError(l('Нельзя менять собственную роль.', 'Өз рөліңізді өзгерте алмайсыз.', "You can't change your own role."));
      } else if (msg === 'no linked auth account') {
        setRoleError(l('У этого сотрудника нет аккаунта — изменение роли применится только локально.',
          'Бұл қызметкердің аккаунты жоқ — рөл тек жергілікті өзгереді.',
          "This teammate has no auth account — role change applies locally only."));
      } else {
        setRoleError(msg || l('Не удалось обновить.', 'Жаңарту мүмкін болмады.', 'Could not save changes.'));
      }
    } finally {
      setRoleSaving(false);
    }
  };

  const deleteEmployee = (id: string) => {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    const isSelf = !!currentUserEmail && emp.email.toLowerCase() === currentUserEmail.toLowerCase();
    if (isSelf) {
      alert(l(
        'Нельзя удалить самого себя из команды. Передайте управление другому администратору, затем попросите его удалить вас.',
        'Командадан өзіңізді жоюға болмайды. Басқаруды басқа әкімшіге беріңіз, содан кейін олардан жоюды сұраңыз.',
        "You can't remove yourself from the team. Hand admin off first, then ask the other admin to remove you.",
      ));
      return;
    }
    const msg = l(
      `Удалить ${emp.name} из команды? Сотрудник потеряет доступ к данным и не сможет войти.`,
      `${emp.name} командадан жойылсын ба? Қызметкер деректерге қол жеткізе алмайды және кіре алмайды.`,
      `Remove ${emp.name} from the team? They will lose access to all data and won't be able to sign in.`,
    );
    if (confirm(msg)) store.deleteEmployee(id);
  };

  // Inverse: restore a previously-kicked teammate. Calls the POST /restore
  // endpoint which clears removed_at on the employees row and disabled_at on
  // the user row; then we refresh the store.
  const restoreEmployee = async (id: string) => {
    const emp = removedEmployees.find(e => e.id === id);
    if (!emp) return;
    if (!confirm(l(
      `Восстановить ${emp.name} в команде? Сотрудник снова сможет войти со своими прежними правами.`,
      `${emp.name} командаға қайта қосылсын ба? Қызметкер бұрынғы рұқсаттарымен қайта кіре алады.`,
      `Restore ${emp.name} to the team? They will be able to sign in again with their previous role.`,
    ))) return;
    try {
      await api.post(`/api/employees/${id}/restore`, {});
      await store.reloadAll();
    } catch (e: any) {
      alert(String(e?.message || 'restore failed'));
    }
  };

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

  // 'roles' tab was merged into 'employees' — the permission matrix now lives
  // at the bottom of the Команда tab so admin can manage who is in the team
  // and what each role can do in one place.
  // If the currently selected tab disappeared (admin yanked access), fall
  // back to 'general' so the page doesn't render a blank section.
  useEffect(() => {
    const ok =
      activeTab === 'general' ||
      (activeTab === 'employees' && isAdmin) ||
      (activeTab === 'activity'  && isAdmin) ||
      (activeTab === 'catalogs'     && store.getModuleLevel('settings-catalogs') !== 'none') ||
      (activeTab === 'ai-client'    && store.getModuleLevel('settings-ai') !== 'none') ||
      (activeTab === 'ai-assistant' && store.getModuleLevel('settings-ai') !== 'none') ||
      (activeTab === 'modules'      && store.getModuleLevel('settings-modules') !== 'none') ||
      (activeTab === 'integrations' && store.getModuleLevel('settings-integrations') !== 'none');
    if (!ok) setActiveTab('general');
  }, [activeTab, isAdmin, store.rolePermissions, store.currentUserRole]);

  // Tab visibility rules:
  //   - 'general' is always shown — every user can see/edit their own profile.
  //   - 'employees' (Команда и права) is HARD admin-only regardless of matrix.
  //     Otherwise a manager with settings=full could rewrite their own
  //     permissions, which the user explicitly called out as a hole.
  //   - 'activity' is HARD admin-only (audit log).
  //   - The rest are matrix-driven via settings-* sub-keys.
  const matrixShow = (key: string) => store.getModuleLevel(key) !== 'none';
  const tabs = [
    { id: 'general' as const, icon: SettingsIcon, label: l('Основные', 'Негізгі', 'General') },
    ...(isAdmin ? [{ id: 'employees' as const, icon: Users, label: l('Команда и права', 'Команда және рұқсаттар', 'Team & permissions') }] : []),
    ...(matrixShow('settings-catalogs')     ? [{ id: 'catalogs'     as const, icon: BookOpen,      label: tt('catalogs') }] : []),
    ...(matrixShow('settings-ai')           ? [{ id: 'ai-client'    as const, icon: MessageCircle, label: tt('aiClientTab') }] : []),
    ...(matrixShow('settings-ai')           ? [{ id: 'ai-assistant' as const, icon: Bot,           label: tt('aiAssistantTab') }] : []),
    ...(matrixShow('settings-modules')      ? [{ id: 'modules'      as const, icon: LayoutGrid,    label: l('Модули', 'Модульдер', 'Modules') }] : []),
    ...(matrixShow('settings-integrations') ? [{ id: 'integrations' as const, icon: Zap,           label: l('Интеграции', 'Интеграциялар', 'Integrations') }] : []),
    ...(isAdmin ? [{ id: 'activity' as const, icon: Activity, label: tt('activityLog') }] : []),
  ];

  const CATALOG_KEYS: { key: CatalogKey; titleKey: Parameters<typeof t>[0] }[] = [
    { key: 'productTemplates', titleKey: 'catalogProductTemplates' },
    { key: 'materials',         titleKey: 'catalogMaterials' },
    { key: 'hardware',          titleKey: 'catalogHardware' },
    { key: 'addons',            titleKey: 'catalogAddons' },
    { key: 'furnitureTypes',    titleKey: 'catalogFurnitureTypes' },
  ];

  const [catalogDraft, setCatalogDraft] = useState<Record<CatalogKey, string>>({
    productTemplates: '', materials: '', hardware: '', addons: '', furnitureTypes: '',
  });

  const submitCatalogItem = (key: CatalogKey) => {
    const value = catalogDraft[key];
    if (!value.trim()) return;
    store.addCatalogItem(key, value);
    setCatalogDraft({ ...catalogDraft, [key]: '' });
  };

  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);

  // Re-seed the controlled fields each time a different employee is opened
  // (or the modal is dismissed). Without this the inputs keep stale values
  // from the previously-edited row.
  useEffect(() => {
    setEmpName(editingEmployee?.name || '');
    setEmpEmail(editingEmployee?.email || '');
    setEmpPhone(editingEmployee?.phone || '');
  }, [editingEmployee]);
  const [empRole, setEmpRole] = useState<string>('manager');
  // Controlled state for the edit-employee modal. Initialised from
  // editingEmployee when it opens (see useEffect below).
  const [empName, setEmpName] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empPhone, setEmpPhone] = useState('');

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
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handleAvatarPick(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="relative w-20 h-20 bg-gray-100 rounded-2xl overflow-hidden mb-2 group"
                  title={l('Загрузить фото', 'Сурет жүктеу', 'Upload photo')}
                >
                  {profile.avatar ? (
                    <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-gray-400 text-lg">
                      {initials || <Camera className="w-5 h-5" />}
                    </span>
                  )}
                  <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <Camera className="w-5 h-5 text-white" />
                  </span>
                </button>
                {profile.avatar && (
                  <button
                    onClick={() => store.updateProfile({ avatar: '' })}
                    className="text-[10px] text-gray-400 hover:text-red-500"
                  >
                    {l('Удалить', 'Жою', 'Remove')}
                  </button>
                )}
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input label={l('Имя', 'Аты', 'Name')} value={profile.name} onChange={v => store.updateProfile({ name: v })} placeholder={l('Введите имя', 'Атыңызды енгізіңіз', 'Enter name')} />
                <Input label={l('Должность', 'Лауазым', 'Position')} value={profile.position} onChange={v => store.updateProfile({ position: v })} placeholder={l('Например: Директор', 'Мысалы: Директор', 'e.g. Director')} />
                <Input label="Email" value={profile.email} onChange={v => store.updateProfile({ email: v })} placeholder="email@домен.kz" />
                <Input label={l('Телефон', 'Телефон', 'Phone')} value={profile.phone} onChange={v => store.updateProfile({ phone: v })} placeholder="+7 ___ ___ __ __" />
              </div>
            </div>
          </div>

          {/* Company */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-900 mb-5">{l('Компания', 'Компания', 'Company')}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label={l('Название', 'Атауы', 'Name')} value={profile.companyName} onChange={v => store.updateProfile({ companyName: v })} placeholder={l('Название компании', 'Компания атауы', 'Company name')} />
              <Input label={l('БИН', 'БСН', 'BIN')} value={profile.companyBIN} onChange={v => store.updateProfile({ companyBIN: v })} placeholder="000000000000" />
              <div className="md:col-span-2"><Input label={l('Адрес', 'Мекенжай', 'Address')} value={profile.companyAddress} onChange={v => store.updateProfile({ companyAddress: v })} placeholder={l('Город, улица, дом', 'Қала, көше, үй', 'City, street, building')} /></div>
              <Input label="Email" value={profile.companyEmail} onChange={v => store.updateProfile({ companyEmail: v })} placeholder="info@company.kz" />
              <Input label={l('Телефон', 'Телефон', 'Phone')} value={profile.companyPhone} onChange={v => store.updateProfile({ companyPhone: v })} placeholder="+7 ___ ___ __ __" />
            </div>
            <button onClick={handleProfileSave} className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">
              {savedFlash ? l('Сохранено ✓', 'Сақталды ✓', 'Saved ✓') : l('Сохранить', 'Сақтау', 'Save')}
            </button>
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

      {/* ===== CATALOGS (Справочники) ===== */}
      {activeTab === 'catalogs' && (
        <div className="space-y-5">
          <div className="text-[11px] text-gray-400 max-w-xl">{tt('catalogsDesc')}</div>
          {CATALOG_KEYS.map(({ key, titleKey }) => (
            <div key={key} className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="text-sm text-gray-900 mb-3">{tt(titleKey)}</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {catalogs[key].map(item => (
                  <span key={item} className="group inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-lg text-xs text-gray-700">
                    {item}
                    <button
                      onClick={() => store.removeCatalogItem(key, item)}
                      className="text-gray-300 hover:text-red-500 transition"
                      title={tt('delete')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {catalogs[key].length === 0 && (
                  <span className="text-[11px] text-gray-300 italic">{tt('catalogEmpty')}</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={catalogDraft[key]}
                  onChange={e => setCatalogDraft({ ...catalogDraft, [key]: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitCatalogItem(key); } }}
                  placeholder={tt('catalogAddItemHint')}
                  className="flex-1 px-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                />
                <button
                  onClick={() => submitCatalogItem(key)}
                  disabled={!catalogDraft[key].trim()}
                  className="px-3 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 disabled:opacity-30 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />{tt('add')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== EMPLOYEES — invite-only (no manual add until invite flow ships) ===== */}
      {activeTab === 'employees' && isAdmin && (
        <div className="space-y-5">
          {/* Invitation links (Block C.2 / P4) — visible to admins only.
              Non-admins get a 403 inside and the panel quietly hides itself. */}
          <TeamInvitePanel language={language} />

          {employees.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-6 h-6 text-gray-400" />
              </div>
              <div className="text-sm text-gray-900 mb-2">{tt('teamEmptyTitle')}</div>
              <div className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed mb-5">{tt('teamEmptyDesc')}</div>
              <div className="text-[11px] text-gray-400">
                {l('Используйте панель приглашений выше — сотрудник зарегистрируется по ссылке и появится здесь.',
                   'Жоғарыдағы шақыру тақтасын пайдаланыңыз — қызметкер сілтеме арқылы тіркеліп, осы жерде шығады.',
                   'Use the invitations panel above — invited teammates will appear here once they sign up.')}
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="flex-1 flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                    <input type="text" placeholder={l('Поиск...', 'Іздеу...', 'Search...')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200" />
                  </div>
                  <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="px-3 py-2 bg-gray-50 border-0 rounded-xl text-xs focus:outline-none text-gray-600">
                    <option value="all">{tt('all')}</option>
                    <option value="admin">{tt('roleAdmin')}</option>
                    <option value="manager">{tt('roleManager')}</option>
                    <option value="employee">{tt('roleEmployee')}</option>
                  </select>
                </div>
                {/* Inviting moved up to TeamInvitePanel; this slot intentionally left blank
                    so the search/filter row balances visually. */}
                <span className="w-1" aria-hidden />
              </div>

              {/* Stats — only when team exists */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: l('Всего', 'Барлығы', 'Total'), value: employees.length },
                  { label: l('Активны', 'Белсенді', 'Active'), value: employees.filter(e => e.status === 'active').length },
                  { label: tt('roleManager'), value: employees.filter(e => e.role === 'manager').length },
                  { label: tt('roleEmployee'), value: employees.filter(e => e.role === 'employee').length },
                ].map((s, i) => <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4"><div className="text-[10px] text-gray-400 mb-2">{s.label}</div><div className="text-lg text-gray-900">{s.value}</div></div>)}
              </div>

              {/* Employee list */}
              <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
                {filteredEmployees.map(emp => (
                  <div key={emp.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors group">
                    <div className="relative flex-shrink-0">
                      <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 text-sm">{emp.name.charAt(0) || '?'}</div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 ${statusDot(emp.status)} border-2 border-white rounded-full`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-sm text-gray-900 truncate">{emp.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${roleBg(emp.role)}`}>{roleLabel(emp.role)}</span>
                        {/* Paperplane badge — this teammate has paired Telegram and
                            can receive task notifications via the team bot. */}
                        {pairedEmails.has(emp.email.toLowerCase()) && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] text-[#2AABEE] bg-blue-50 px-1.5 py-0.5 rounded"
                            title={l('Telegram-бот подключён', 'Telegram-бот қосылған', 'Telegram bot connected')}
                          >
                            <Send className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400">{emp.email}{emp.department ? ` · ${emp.department}` : ''}</div>
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingEmployee(emp); setEmpRole(emp.role); setShowEmployeeModal(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit2 className="w-3.5 h-3.5 text-gray-400" /></button>
                      {(!currentUserEmail || emp.email.toLowerCase() !== currentUserEmail.toLowerCase()) && (
                        <button onClick={() => deleteEmployee(emp.id)} className="p-1.5 hover:bg-red-50 rounded-lg" title={l('Удалить из команды', 'Командадан жою', 'Remove from team')}><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      )}
                    </div>
                  </div>
                ))}
                {filteredEmployees.length === 0 && (
                  <div className="py-12 text-center"><Users className="w-8 h-8 text-gray-200 mx-auto mb-2" /><p className="text-xs text-gray-400">{l('Не найдено', 'Табылмады', 'Not found')}</p></div>
                )}
              </div>
            </>
          )}

          {/* ===== Removed teammates (admin can restore access) ===== */}
          {removedEmployees.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <details>
                <summary className="text-sm text-gray-900 cursor-pointer flex items-center justify-between select-none">
                  <span>{l('Удалённые сотрудники', 'Жойылған қызметкерлер', 'Removed teammates')}</span>
                  <span className="text-[11px] text-gray-400">{removedEmployees.length}</span>
                </summary>
                <div className="mt-3 space-y-1.5">
                  {removedEmployees.map(emp => (
                    <div key={emp.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl">
                      <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-500">
                        {emp.name.charAt(0) || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 truncate">{emp.name}</div>
                        <div className="text-[10px] text-gray-400 truncate">
                          {emp.email}
                          {emp.removedAt && (
                            <> · {l('удалён', 'жойылды', 'removed')} {new Date(emp.removedAt).toLocaleDateString(language === 'eng' ? 'en-GB' : 'ru-RU')}</>
                          )}
                        </div>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${roleBg(emp.role)}`}>{roleLabel(emp.role)}</span>
                      <button
                        onClick={() => restoreEmployee(emp.id)}
                        className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] hover:bg-emerald-700 transition-colors"
                      >
                        {l('Восстановить', 'Қалпына келтіру', 'Restore')}
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* ===== Role list (admin can rename / delete / add custom roles) ===== */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-gray-900">{l('Роли в команде', 'Командадағы рөлдер', 'Team roles')}</div>
              <AddRoleButton language={language} onAdd={(n) => store.addRole(n)} />
            </div>
            <div className="text-[11px] text-gray-400 mb-3 max-w-xl">
              {l('Добавьте роли под структуру своей команды и настройте их доступ в матрице ниже.',
                 'Команда құрылымына сай рөлдер қосып, төмендегі матрицада олардың рұқсаттарын баптаңыз.',
                 'Add roles that match your team structure and set their access in the matrix below.')}
            </div>
            <div className="space-y-1.5">
              {store.roles.map(r => (
                <RoleRow
                  key={r.id}
                  role={r}
                  language={language}
                  onRename={(name) => store.renameRole(r.id, name)}
                  onDelete={() => store.deleteRole(r.id)}
                  // Block deleting a role that's currently assigned to anyone in the team.
                  inUseBy={employees.filter(e => e.role === r.id).length}
                />
              ))}
            </div>
          </div>

          {/* ===== Permissions matrix (merged from the old 'Роли и права' tab) ===== */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-gray-400" />
                <div className="text-sm text-gray-900">{tt('permissionsMatrixTitle')}</div>
              </div>
              {/* Save / Discard appear only when there's a pending diff.
                  Cell clicks no longer auto-save — they update local state. */}
              {matrixDirty && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={discardMatrix}
                    className="px-2.5 py-1.5 text-xs text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {l('Отменить', 'Бас тарту', 'Discard')}
                  </button>
                  <button
                    onClick={saveMatrix}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs hover:bg-gray-800 transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    {l('Сохранить', 'Сақтау', 'Save')}
                  </button>
                </div>
              )}
            </div>
            <div className="text-[11px] text-gray-400 mb-4 max-w-xl">{tt('permissionsMatrixHint')}</div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  {/* Section row — visually groups modules into 'Рабочие модули'
                      and 'Настройки' so the wide matrix is easier to scan. */}
                  <tr>
                    <th className="pb-2"></th>
                    {MODULE_GROUPS.map(g => (
                      <th
                        key={g.id}
                        colSpan={g.modules.length}
                        className="text-center text-[10px] uppercase tracking-wide text-gray-400 pb-1 px-2 border-l border-gray-100 first:border-l-0"
                      >
                        {g.id === 'settings' ? l(g.ru, g.kz, g.eng) : l(g.ru, g.kz, g.eng)}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className="text-left text-[11px] text-gray-400 pb-3 pr-4">{l('Роль', 'Рөл', 'Role')}</th>
                    {MODULE_GROUPS.flatMap(g => g.modules).map(m => (
                      <th key={m} className="text-center text-[11px] text-gray-400 pb-3 px-2 whitespace-nowrap">{moduleLabel(m)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {/* Iterates the team's role list — built-in or custom. */}
                  {store.roles.map(roleObj => {
                    const roleK = roleObj.id;
                    return (
                    <tr key={roleK} className="hover:bg-gray-50/50">
                      <td className="py-3 pr-4">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${roleBg(roleK)}`}>{roleLabel(roleK)}</span>
                      </td>
                      {MODULE_GROUPS.flatMap(g => g.modules).map(module => {
                        // Read from the pending matrix so unsaved cell clicks
                        // are visible immediately; commit happens on 'Save'.
                        const current = currentMatrix[roleK]?.[module] || 'none';
                        const isAdminFull = roleK === 'admin';
                        const cycle: PermissionLevel[] = ['full', 'view', 'none'];
                        const nextLevel = cycle[(cycle.indexOf(current) + 1) % cycle.length];
                        return (
                          <td key={module} className="py-3 px-2 text-center">
                            <button
                              onClick={() => !isAdminFull && updateMatrixCell(roleK, module, nextLevel)}
                              disabled={isAdminFull}
                              title={isAdminFull ? tt('roleAdmin') : ''}
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition ${
                                current === 'full' ? 'bg-green-50 hover:bg-green-100' :
                                current === 'view' ? 'bg-gray-50 hover:bg-gray-100' :
                                                     'bg-red-50 hover:bg-red-100'
                              } ${isAdminFull ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {current === 'full' && <Check className="w-3.5 h-3.5 text-green-600" />}
                              {current === 'view' && <Eye className="w-3.5 h-3.5 text-gray-400" />}
                              {current === 'none' && <X className="w-3.5 h-3.5 text-red-400" />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center gap-4 text-[11px] text-gray-400 flex-wrap">
              <span className="flex items-center gap-1"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-50"><Check className="w-3 h-3 text-green-600" /></span>{tt('permLevelFull')}</span>
              <span className="flex items-center gap-1"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-50"><Eye className="w-3 h-3 text-gray-400" /></span>{tt('permLevelView')}</span>
              <span className="flex items-center gap-1"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-50"><X className="w-3 h-3 text-red-400" /></span>{tt('permLevelNone')}</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== AI for clients (Block E1) — independent product ===== */}
      {activeTab === 'ai-client' && (
        <div className="space-y-5">
          {/* Product header — green theme so it never visually mixes with the assistant */}
          <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border border-emerald-100 p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-sm text-gray-900">{tt('aiClientHeader')}</div>
                  <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">{tt('aiTwoProductsBadge')}</span>
                </div>
                <div className="text-[11px] text-gray-500 leading-relaxed">{tt('aiClientDesc')}</div>
              </div>
              <Toggle value={aiClient.enabled} onChange={() => store.updateAIClient({ enabled: !aiClient.enabled })} />
            </div>
          </div>

          {/* Personality / role prompt */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-900 mb-1">{tt('aiClientPersonality')}</div>
            <div className="text-[11px] text-gray-400 mb-3">{tt('aiClientPersonalityHint')}</div>
            <textarea
              value={aiClient.personality}
              onChange={e => store.updateAIClient({ personality: e.target.value })}
              rows={4}
              className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none"
            />
          </div>

          {/* Tone + Language */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <div className="text-sm text-gray-900 mb-3">{tt('aiClientTone')}</div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'professional' as const, emoji: '👔', label: tt('aiTonePro') },
                  { id: 'friendly' as const,     emoji: '😊', label: tt('aiToneFriendly') },
                  { id: 'casual' as const,       emoji: '✌️', label: tt('aiToneCasual') },
                ]).map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => store.updateAIClient({ tone: opt.id })}
                    className={`p-3 rounded-xl border text-center transition ${aiClient.tone === opt.id ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 hover:bg-gray-50'}`}
                  >
                    <div className="text-lg mb-1">{opt.emoji}</div>
                    <div className="text-[10px] text-gray-600">{opt.label}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-900 mb-3">{tt('aiClientLang')}</div>
              <select
                value={aiClient.language}
                onChange={e => store.updateAIClient({ language: e.target.value as any })}
                className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
              >
                <option value="auto">{tt('aiLangAuto')}</option>
                <option value="ru">Русский</option>
                <option value="kz">Қазақша</option>
                <option value="eng">English</option>
              </select>
            </div>
          </div>

          {/* Connected channels — read from integrations table */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-900 mb-1">{tt('aiClientChannels')}</div>
            <div className="text-[11px] text-gray-400 mb-3">{tt('aiClientChannelsHint')}</div>
            <div className="flex flex-wrap gap-1.5">
              {store.integrations.filter(i => i.cat === 'msg').map(i => (
                <span key={i.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${i.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${i.connected ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  {i.name}
                </span>
              ))}
              {store.integrations.filter(i => i.cat === 'msg').length === 0 && (
                <span className="text-[11px] text-gray-400 italic">{l('Каналы не настроены', 'Арналар бапталмаған', 'No channels configured')}</span>
              )}
            </div>
          </div>

          {/* Knowledge base */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-900 mb-1">{tt('aiClientKnowledge')}</div>
            <div className="text-[11px] text-gray-400 mb-3">{tt('aiClientKnowledgeHint')}</div>
            {aiClient.knowledgeSources.length === 0 ? (
              <div className="bg-gray-50 rounded-xl px-3 py-4 text-center text-[11px] text-gray-400 italic">
                {l('Пока пусто', 'Әзірге бос', 'Empty')}
              </div>
            ) : (
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl">
                {aiClient.knowledgeSources.map(s => (
                  <div key={s.id} className="px-3 py-2 flex items-center justify-between text-xs">
                    <span className="text-gray-700">{s.name}</span>
                    <span className="text-[10px] text-gray-400">{s.type}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              disabled
              title={l('Скоро', 'Жақын арада', 'Coming soon')}
              className="mt-3 px-3 py-2 bg-gray-100 text-gray-400 rounded-xl text-xs cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <Plus className="w-3 h-3" />{l('Добавить источник', 'Дереккөз қосу', 'Add source')}
              <span className="text-[9px] opacity-70">{l('скоро', 'жақын арада', 'soon')}</span>
            </button>
          </div>

          {/* Reply templates */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-900 mb-1">{tt('aiClientTemplates')}</div>
            <div className="text-[11px] text-gray-400 mb-3">{tt('aiClientTemplatesHint')}</div>
            <textarea
              value={aiClient.replyTemplates.join('\n')}
              onChange={e => store.updateAIClient({ replyTemplates: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
              rows={4}
              className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none"
            />
          </div>

          {/* Hand-off to human */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-900 mb-1">{tt('aiClientHandoff')}</div>
            <div className="text-[11px] text-gray-400 mb-3">{tt('aiClientHandoffHint')}</div>
            <input
              type="text"
              value={aiClient.handoffKeywords.join(', ')}
              onChange={e => store.updateAIClient({ handoffKeywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              placeholder={tt('aiClientHandoffPlaceholder')}
              className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
            />
          </div>

          {/* Dialog analytics placeholder */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-900 mb-1">{tt('aiClientAnalytics')}</div>
            <div className="text-[11px] text-gray-400">{tt('aiClientAnalyticsSoon')}</div>
          </div>
        </div>
      )}

      {/* ===== AI assistant for platform (Block E2) — independent product ===== */}
      {activeTab === 'ai-assistant' && (
        <div className="space-y-5">
          {/* Product header — violet theme so it never visually mixes with the client AI */}
          <div className="bg-gradient-to-br from-violet-50 to-white rounded-2xl border border-violet-100 p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-sm text-gray-900">{tt('aiAssistantHeader')}</div>
                  <span className="text-[9px] px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded">{tt('aiTwoProductsBadge')}</span>
                </div>
                <div className="text-[11px] text-gray-500 leading-relaxed">{tt('aiAssistantDesc')}</div>
              </div>
              <Toggle value={aiAssistant.enabled} onChange={() => store.updateAIAssistant({ enabled: !aiAssistant.enabled })} />
            </div>
          </div>

          {/* Telegram pairing — server-managed; token lives in Railway env, never in the browser. */}
          <TelegramPairing language={language} />

          {/* Tone + Language */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <div className="text-sm text-gray-900 mb-3">{tt('aiClientTone')}</div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'professional' as const, emoji: '👔', label: tt('aiTonePro') },
                  { id: 'friendly' as const,     emoji: '😊', label: tt('aiToneFriendly') },
                  { id: 'casual' as const,       emoji: '✌️', label: tt('aiToneCasual') },
                ]).map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => store.updateAIAssistant({ tone: opt.id })}
                    className={`p-3 rounded-xl border text-center transition ${aiAssistant.tone === opt.id ? 'border-violet-500 bg-violet-50' : 'border-gray-100 hover:bg-gray-50'}`}
                  >
                    <div className="text-lg mb-1">{opt.emoji}</div>
                    <div className="text-[10px] text-gray-600">{opt.label}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-900 mb-3">{tt('aiClientLang')}</div>
              <select
                value={aiAssistant.language}
                onChange={e => store.updateAIAssistant({ language: e.target.value as any })}
                className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
              >
                <option value="auto">{tt('aiLangAuto')}</option>
                <option value="ru">Русский</option>
                <option value="kz">Қазақша</option>
                <option value="eng">English</option>
              </select>
            </div>
          </div>

          {/* Per-module permissions */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-900 mb-1">{tt('aiAssistantPermissions')}</div>
            <div className="text-[11px] text-gray-400 mb-4">{tt('aiAssistantPermissionsHint')}</div>
            <div className="space-y-1.5">
              {store.modules.filter(m => !m.locked || m.id === 'settings').map(m => {
                const current = aiAssistant.modulePermissions[m.id] || 'confirm';
                return (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl">
                    <span className="text-xs text-gray-700 flex-1 truncate">{m.labels[language]}</span>
                    <div className="flex gap-1">
                      {(['auto', 'confirm', 'none'] as const).map(level => {
                        const labelKey = level === 'auto' ? 'aiPermAuto' : level === 'confirm' ? 'aiPermConfirm' : 'aiPermNone';
                        const active = current === level;
                        const colour =
                          level === 'auto'    ? (active ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50') :
                          level === 'confirm' ? (active ? 'bg-amber-500 text-white'   : 'text-amber-700 hover:bg-amber-50') :
                                                (active ? 'bg-gray-700 text-white'   : 'text-gray-500 hover:bg-gray-100');
                        return (
                          <button
                            key={level}
                            onClick={() => store.updateAIAssistant({ modulePermissions: { ...aiAssistant.modulePermissions, [m.id]: level } })}
                            className={`px-2.5 py-1 rounded-lg text-[10px] transition ${colour}`}
                          >
                            {tt(labelKey as Parameters<typeof t>[0])}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Clarifying questions verbosity */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-900 mb-1">{tt('aiClarifying')}</div>
            <div className="text-[11px] text-gray-400 mb-3">{tt('aiClarifyingHint')}</div>
            <div className="space-y-1.5">
              {([
                { id: 'minimal' as const,  label: tt('aiClarifyingMinimal') },
                { id: 'balanced' as const, label: tt('aiClarifyingBalanced') },
                { id: 'verbose' as const,  label: tt('aiClarifyingVerbose') },
              ]).map(opt => (
                <label key={opt.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition ${aiAssistant.clarifyingLevel === opt.id ? 'border-violet-500 bg-violet-50' : 'border-gray-100 hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    checked={aiAssistant.clarifyingLevel === opt.id}
                    onChange={() => store.updateAIAssistant({ clarifyingLevel: opt.id })}
                    className="accent-violet-600"
                  />
                  <span className="text-xs text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Interaction history placeholder */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-sm text-gray-900 mb-1">{tt('aiAssistantHistory')}</div>
            <div className="text-[11px] text-gray-400 leading-relaxed">{tt('aiAssistantHistoryEmpty')}</div>
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

      {/* ===== ROLES & PERMISSIONS — editable matrix ===== */}

      {/* ===== ACTIVITY LOG — admin-only ===== */}
      {activeTab === 'activity' && isAdmin && (
        <div className="-mx-4 md:-mx-8">
          <ActivityLog language={language} />
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
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">{l('Имя', 'Аты', 'Name')}</label>
                <input
                  type="text"
                  value={empName}
                  onChange={e => setEmpName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  value={empEmail}
                  readOnly
                  disabled
                  className="w-full px-3 py-2.5 bg-gray-100 border-0 rounded-xl text-sm text-gray-500 cursor-not-allowed"
                />
                <div className="text-[10px] text-gray-400 mt-1">
                  {l('Email привязан к аккаунту и не редактируется.',
                     'Email аккаунтпен байланысты және өзгертілмейді.',
                     'Email is tied to the auth account and cannot be changed.')}
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">{l('Телефон', 'Телефон', 'Phone')}</label>
                <input
                  type="text"
                  value={empPhone}
                  onChange={e => setEmpPhone(e.target.value)}
                  placeholder="+7 ___ ___ __ __"
                  className="w-full px-3 py-2.5 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                />
              </div>
              {/* Role block */}
              <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
                <div className="text-[11px] text-gray-500">{l('Роль и доступ', 'Рөл және рұқсат', 'Role & access')}</div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-2">{l('Роль', 'Рөл', 'Role')}</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {/* Iterates the team's role list — built-in and custom. */}
                    {store.roles.map(r => (
                      <button
                        key={r.id}
                        onClick={() => setEmpRole(r.id)}
                        className={`px-3 py-2 rounded-xl text-[11px] border transition-all text-left ${
                          empRole === r.id ? roleBg(r.id) + ' border-current' : 'border-gray-100 text-gray-500 hover:border-gray-200'
                        }`}
                      >
                        {empRole === r.id && <span className="mr-1">✓</span>}{r.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Read-only preview of what the currently-picked role can access.
                    Shows the matrix row for empRole as a compact list of bullets. */}
                <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="text-[10px] text-gray-500 mb-1.5">
                    {l('Доступы этой роли', 'Осы рөлдің рұқсаттары', "What this role can access")}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {ALL_MODULES.map(m => {
                      const lvl = empRole === 'admin' ? 'full' : (store.rolePermissions[empRole]?.[m] || 'none');
                      const icon = lvl === 'full' ? <Check className="w-3 h-3 text-green-600" />
                                 : lvl === 'view' ? <Eye   className="w-3 h-3 text-gray-400" />
                                 :                  <X     className="w-3 h-3 text-red-400" />;
                      return (
                        <div key={m} className="flex items-center gap-1.5 text-[10px] text-gray-700">
                          {icon}
                          <span className="truncate">{moduleLabel(m)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="text-[10px] text-gray-400 leading-relaxed">
                  {l(
                    'Подробные права настраиваются в матрице ниже — общие правила для всей роли.',
                    'Толық рұқсаттар төмендегі матрицада — рөл бойынша жалпы ережелер.',
                    'Detailed permissions are configured in the matrix below — they apply to the whole role.',
                  )}
                </div>
              </div>
            </div>
            {roleError && (
              <div className="mx-5 mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">{roleError}</div>
            )}
            <div className="p-5 pt-0 flex gap-2">
              <button onClick={closeEmployeeModal} className="flex-1 px-3 py-2.5 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">{l('Отмена', 'Бас тарту', 'Cancel')}</button>
              <button
                onClick={saveEmployeeRole}
                disabled={roleSaving}
                className="flex-1 px-3 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 disabled:opacity-50"
              >
                {roleSaving ? l('Сохраняю…', 'Сақталуда…', 'Saving…') : l('Сохранить', 'Сақтау', 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AddRoleButton ───────────────────────────────────────────────
// Small inline form for adding a custom role. Hidden form that toggles open
// when the admin clicks "Добавить роль".
function AddRoleButton({ language, onAdd }: { language: 'kz' | 'ru' | 'eng'; onAdd: (name: string) => string }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-900 text-white rounded-lg text-[11px] hover:bg-gray-800 transition-colors"
      >
        <Plus className="w-3 h-3" />
        {l('Добавить роль', 'Рөл қосу', 'Add role')}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setName(''); setOpen(false); } }}
        autoFocus
        placeholder={l('Название роли', 'Рөл атауы', 'Role name')}
        className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-gray-300 w-32"
      />
      <button onClick={submit} className="px-2 py-1.5 bg-gray-900 text-white rounded-lg text-[11px] hover:bg-gray-800">
        {l('Готово', 'Дайын', 'Done')}
      </button>
      <button onClick={() => { setName(''); setOpen(false); }} className="px-2 py-1.5 text-gray-500 rounded-lg text-[11px] hover:bg-gray-50">
        ×
      </button>
    </div>
  );
}

// ─── RoleRow ──────────────────────────────────────────────────────
// One row in the role list with inline rename + delete. System roles
// (admin) are read-only and show a small lock label.
function RoleRow({
  role, language, onRename, onDelete, inUseBy,
}: {
  role: { id: string; name: string; system?: boolean };
  language: 'kz' | 'ru' | 'eng';
  onRename: (name: string) => void;
  onDelete: () => void;
  inUseBy: number;
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(role.name);

  const commit = () => {
    if (draft.trim() && draft.trim() !== role.name) onRename(draft.trim());
    setEditing(false);
  };

  const askDelete = () => {
    if (role.system) return;
    if (inUseBy > 0) {
      alert(l(
        `Нельзя удалить роль — она назначена ${inUseBy} сотрудник(ам). Сначала смените их роли.`,
        `Рөлді жоюға болмайды — ол ${inUseBy} қызметкерге тағайындалған. Алдымен олардың рөлдерін өзгертіңіз.`,
        `Can't delete this role — it's currently assigned to ${inUseBy} teammate(s). Change their role first.`,
      ));
      return;
    }
    if (confirm(l(`Удалить роль «${role.name}»?`, `«${role.name}» рөлін жою керек пе?`, `Delete role "${role.name}"?`))) {
      onDelete();
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
      <span className={`w-2 h-2 rounded-full ${role.system ? 'bg-gray-400' : 'bg-emerald-400'}`} />
      {editing ? (
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(role.name); setEditing(false); } }}
          onBlur={commit}
          autoFocus
          className="flex-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
        />
      ) : (
        <span className="flex-1 text-xs text-gray-900">{role.name}</span>
      )}
      {role.system ? (
        <span className="text-[10px] text-gray-400">{l('Системная', 'Жүйелік', 'System')}</span>
      ) : (
        <>
          {inUseBy > 0 && (
            <span className="text-[10px] text-gray-400">
              {l(`${inUseBy} сотр.`, `${inUseBy} қызм.`, `${inUseBy} member${inUseBy === 1 ? '' : 's'}`)}
            </span>
          )}
          <button
            onClick={() => setEditing(true)}
            className="p-1 hover:bg-white rounded transition-colors"
            title={l('Переименовать', 'Қайта атау', 'Rename')}
          >
            <Edit2 className="w-3 h-3 text-gray-400" />
          </button>
          <button
            onClick={askDelete}
            className="p-1 hover:bg-red-50 rounded transition-colors"
            title={l('Удалить', 'Жою', 'Delete')}
          >
            <Trash2 className="w-3 h-3 text-red-400" />
          </button>
        </>
      )}
    </div>
  );
}