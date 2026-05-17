import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { api, getToken } from './api';

const newId = (prefix: string) => prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ─── TYPES ─────────────────────────────────────────
export type WorkTypeKey = 'house' | 'finishing' | 'facade' | 'furniture' | 'other';

export interface Deal {
  id: string;
  customerName: string;
  phone: string;
  address: string;          // client / billing address
  siteAddress?: string;     // site / object address
  workType?: WorkTypeKey;   // user-picked classifier
  product: string;
  furnitureType: string;
  amount: number;
  paidAmount: number;
  status: string;
  icon: 'instagram' | 'phone' | 'users' | 'whatsapp' | 'email' | 'telegram' | 'tiktok';
  priority: 'high' | 'medium' | 'low';
  date: string;
  progress: number;
  source: string;
  // Furniture-team fields (shown when workType = 'furniture')
  measurer: string;
  designer: string;
  // Construction-team fields (shown when workType is house/finishing/facade)
  foreman?: string;
  architect?: string;
  materials: string;
  // Dates — labels reinterpreted by workType
  measurementDate: string;
  completionDate: string;
  installationDate: string;
  paymentMethods: Record<string, boolean>;
  notes: string;
  createdAt: string;
  // Owner — the employee responsible for the deal. Used by the team-metrics
  // dashboard for precise attribution. Falls back to the free-text role fields
  // (measurer/designer/foreman/architect) when missing. Optional so legacy
  // rows without it keep working.
  ownerId?: string;
  // AI Дизайн concepts attached to this deal — array of ai_generations.id.
  // Lets the team show the client a gallery of design options in the deal
  // modal and keeps every render tied to its source CRM record.
  designIds?: string[];
}

// RoleKey is now a free-form string id (e.g. 'admin', 'manager', 'accountant').
// 'admin' is reserved and treated as a system role — it can't be deleted or
// renamed and always has 'full' access regardless of the matrix.
export type RoleKey = string;

// Each team has a list of roles it has defined. The matrix in
// `RolePermissions` is keyed by these ids.
export interface TeamRole {
  id: string;
  name: string;     // human label, e.g. 'Бухгалтер'
  system?: boolean; // true for built-ins like 'admin' that can't be removed
}
export type PermissionLevel = 'full' | 'view' | 'none';
// All modules that the matrix can gate. The names match sidebar page ids
// where possible; 'orders'/'production' are legacy and aliased from
// 'sales'/'warehouse' at the lookup boundary (see sidebarToMatrixKey).
export type ModuleKey =
  | 'dashboard'  // Главная
  | 'ai-design'  // AI Дизайн
  | 'orders'     // Заказы (sales)
  | 'production' // Производство (warehouse)
  | 'finance'    // Финансы компании
  | 'payments'   // Платежи — tab inside Заказы
  | 'chats'      // Чаты
  | 'tasks'      // Задачи
  | 'analytics'  // Аналитика
  | 'marketing'  // Реклама — tab inside Аналитика
  | 'settings'           // Настройки (umbrella — controls sidebar visibility)
  | 'settings-catalogs'  // Настройки → Справочники
  | 'settings-modules'   // Настройки → Модули
  | 'settings-integrations' // Настройки → Интеграции
  | 'settings-ai';       // Настройки → AI (assistant + client)
// Note: 'Команда и права' and 'Журнал' are intentionally NOT in the matrix —
// they are hard admin-only at the UI layer, so the matrix can't grant access.

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: RoleKey;
  department: string;
  status: 'active' | 'inactive' | 'vacation';
  salary: number;
  joinDate: string;
  lastActive: string;
  avatar: string;
  permissions: { sales: boolean; finance: boolean; warehouse: boolean; chats: boolean; analytics: boolean; settings: boolean; };
  performance: { ordersCompleted: number; rating: number; efficiency: number; };
}

// Role → per-module permission level. Stored in localStorage so Admin can tune.
export type RolePermissions = Record<RoleKey, Record<ModuleKey, PermissionLevel>>;

const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  admin: {
    dashboard: 'full', 'ai-design': 'full', orders: 'full', production: 'full',
    finance: 'full', payments: 'full', chats: 'full', tasks: 'full',
    analytics: 'full', marketing: 'full',
    settings: 'full', 'settings-catalogs': 'full', 'settings-modules': 'full',
    'settings-integrations': 'full', 'settings-ai': 'full',
  },
  manager: {
    dashboard: 'full', 'ai-design': 'full', orders: 'full', production: 'view',
    finance: 'view', payments: 'full', chats: 'full', tasks: 'full',
    analytics: 'view', marketing: 'view',
    settings: 'full', 'settings-catalogs': 'full', 'settings-modules': 'none',
    'settings-integrations': 'none', 'settings-ai': 'none',
  },
  employee: {
    dashboard: 'full', 'ai-design': 'view', orders: 'view', production: 'view',
    finance: 'none', payments: 'none', chats: 'view', tasks: 'full',
    analytics: 'none', marketing: 'none',
    settings: 'view', 'settings-catalogs': 'view', 'settings-modules': 'none',
    'settings-integrations': 'none', 'settings-ai': 'none',
  },
};

export const ALL_MODULES: ModuleKey[] = [
  'dashboard', 'ai-design', 'orders', 'production', 'finance', 'payments',
  'chats', 'tasks', 'analytics', 'marketing',
  'settings', 'settings-catalogs', 'settings-modules', 'settings-integrations', 'settings-ai',
];

// Groups for rendering the matrix with section headers (UI helper).
export const MODULE_GROUPS: { id: string; ru: string; kz: string; eng: string; modules: ModuleKey[] }[] = [
  {
    id: 'operations',
    ru: 'Рабочие модули', kz: 'Жұмыс модульдері', eng: 'Operations',
    modules: ['dashboard', 'ai-design', 'orders', 'production', 'finance', 'payments', 'chats', 'tasks', 'analytics', 'marketing'],
  },
  {
    id: 'settings',
    ru: 'Настройки', kz: 'Баптаулар', eng: 'Settings',
    modules: ['settings', 'settings-catalogs', 'settings-modules', 'settings-integrations', 'settings-ai'],
  },
];
// Default roles every brand-new team starts with. Admin is system (locked);
// the other two are convenience pre-fills that the admin can rename or delete.
export const DEFAULT_ROLES: TeamRole[] = [
  { id: 'admin',    name: 'Администратор', system: true },
  { id: 'manager',  name: 'Менеджер' },
  { id: 'employee', name: 'Сотрудник' },
];
// Kept as a fallback list for places that still iterate roles statically.
// New code should read from store.roles instead.
export const ALL_ROLES: RoleKey[] = ['admin', 'manager', 'employee'];

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'new' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId: string;
  createdAt: string;
  dueDate: string;
  completedAt?: string;
  category: string;
  subtasks: { id: string; title: string; done: boolean }[];
  completionNote?: string;
  linkedDealId?: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  supplier: string;
  cost: number;
  status: 'instock' | 'low' | 'outofstock';
  minQty: number;
}

export interface FinanceTransaction {
  id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  date: string;
  description: string;
  dealId?: string;
  status: 'completed' | 'pending' | 'overdue';
}

export interface Integration {
  id: string;
  name: string;
  desc: string;
  connected: boolean;
  cat: 'msg' | 'fin' | 'ai' | 'other';
  apiKey?: string;
  lastSync?: string;
}

export type ActivityType = 'create' | 'update' | 'delete' | 'login' | 'logout' | 'invite' | 'permission' | 'settings' | 'ai';
export type ActivityActor = 'human' | 'ai';
export type ActivityModule = 'sales' | 'finance' | 'tasks' | 'warehouse' | 'analytics' | 'chats' | 'settings' | 'auth' | 'catalog' | 'team' | 'roles' | 'ai';

export interface ActivityLog {
  id: string;
  user: string;             // display name of the actor (or 'AI-ассистент')
  actor?: ActivityActor;    // 'human' (default) or 'ai'
  source?: 'platform' | 'telegram'; // where the action originated
  action: string;           // short verb-phrase, e.g. 'Создал сделку'
  target: string;           // what was acted upon
  timestamp: string;
  type: ActivityType;
  page?: ActivityModule | string;
  before?: string;          // optional: previous value (stringified short summary)
  after?: string;           // optional: new value
}

export interface UserProfile {
  name: string;
  position: string;
  email: string;
  phone: string;
  avatar: string;
  companyName: string;
  companyBIN: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
}

const EMPTY_PROFILE: UserProfile = {
  name: '', position: '', email: '', phone: '', avatar: '',
  companyName: '', companyBIN: '', companyAddress: '', companyEmail: '', companyPhone: '',
};

const PROFILE_STORAGE_KEY = 'utir_user_profile';

function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return EMPTY_PROFILE;
    return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
  } catch { return EMPTY_PROFILE; }
}

function saveProfile(p: UserProfile) {
  try { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(p)); } catch {}
}

// ─── User-managed catalogs (Справочники) ─────────────────────
// Empty defaults — user fills them in Settings → Справочники.
// Used by deal modals as <datalist> autocomplete suggestions.
export type CatalogKey = 'productTemplates' | 'materials' | 'hardware' | 'addons' | 'furnitureTypes';

export interface UserCatalogs {
  productTemplates: string[];
  materials: string[];
  hardware: string[];
  addons: string[];
  furnitureTypes: string[];
}

const EMPTY_CATALOGS: UserCatalogs = {
  productTemplates: [], materials: [], hardware: [], addons: [], furnitureTypes: [],
};

const CATALOGS_STORAGE_KEY = 'utir_user_catalogs';

function loadCatalogs(): UserCatalogs {
  try {
    const raw = localStorage.getItem(CATALOGS_STORAGE_KEY);
    if (!raw) return EMPTY_CATALOGS;
    return { ...EMPTY_CATALOGS, ...JSON.parse(raw) };
  } catch { return EMPTY_CATALOGS; }
}

function saveCatalogs(c: UserCatalogs) {
  try { localStorage.setItem(CATALOGS_STORAGE_KEY, JSON.stringify(c)); } catch {}
}

const ROLE_PERMS_STORAGE_KEY = 'utir_role_permissions';

function loadRolePermissions(): RolePermissions {
  try {
    const raw = localStorage.getItem(ROLE_PERMS_STORAGE_KEY);
    if (!raw) return DEFAULT_ROLE_PERMISSIONS;
    const parsed = JSON.parse(raw) as Partial<RolePermissions>;
    // Merge with defaults for known role ids; preserve unknown (custom) ones.
    const merged: RolePermissions = { ...DEFAULT_ROLE_PERMISSIONS };
    for (const [roleId, perms] of Object.entries(parsed)) {
      merged[roleId] = { ...(merged[roleId] || EMPTY_PERMS), ...(perms as any || {}) };
    }
    return merged;
  } catch { return DEFAULT_ROLE_PERMISSIONS; }
}

// Default permission set for a brand-new role: 'none' on every module.
const EMPTY_PERMS: Record<ModuleKey, PermissionLevel> = {
  dashboard: 'none', 'ai-design': 'none', orders: 'none', production: 'none',
  finance: 'none', payments: 'none', chats: 'none', tasks: 'none',
  analytics: 'none', marketing: 'none',
  settings: 'none', 'settings-catalogs': 'none', 'settings-modules': 'none',
  'settings-integrations': 'none', 'settings-ai': 'none',
};

const ROLES_STORAGE_KEY = 'utir_team_roles';

function loadTeamRoles(): TeamRole[] {
  try {
    const raw = localStorage.getItem(ROLES_STORAGE_KEY);
    if (!raw) return DEFAULT_ROLES;
    const parsed = JSON.parse(raw) as TeamRole[];
    if (!Array.isArray(parsed)) return DEFAULT_ROLES;
    // Make sure the system 'admin' role is always present and locked.
    const withoutAdmin = parsed.filter(r => r.id !== 'admin');
    return [{ id: 'admin', name: 'Администратор', system: true }, ...withoutAdmin];
  } catch { return DEFAULT_ROLES; }
}

function saveTeamSettings(roles: TeamRole[], perms: RolePermissions) {
  try {
    localStorage.setItem(ROLE_PERMS_STORAGE_KEY, JSON.stringify(perms));
    localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(roles));
  } catch {}
  // Mirror to the backend so settings follow the team across devices. Admin-only
  // on the PUT; non-admins get a 403 here which we silently ignore.
  api.put('/api/team-permissions', { permissions: perms, roles }).catch(err => {
    if (String(err?.message || '') !== 'requires admin role') {
      console.error('[saveTeamSettings]', err);
    }
  });
}

// ─── Module settings (Block B.1) ────────────────────────
// User-tunable per-platform-module config: order, on/off toggle, custom labels, role-access flags.
// Custom modules added in B.2 will append to the same `modules` list with `custom: true`.
export type CustomFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';

export interface CustomFieldDef {
  id: string;              // stable key inside the record.values map
  type: CustomFieldType;
  label: { ru: string; kz: string; eng: string };
  required?: boolean;
  options?: string[];      // only meaningful for type='select'
}

export interface PlatformModule {
  id: string;              // navigation key — must match App.tsx case ids (e.g. 'dashboard', 'sales')
  enabled: boolean;
  locked?: boolean;        // 'dashboard' and 'settings' cannot be disabled
  custom?: boolean;        // true for user-created modules (B.2)
  icon?: string;           // lucide icon name (custom modules)
  fields?: CustomFieldDef[]; // schema for custom modules
  labels: { ru: string; kz: string; eng: string };
  // Which roles may open this module (besides admin, who always can).
  roleAccess: { manager: boolean; employee: boolean };
}

// One row of data inside a custom module — stored locally; backend persistence is a follow-up.
export interface CustomRecord {
  id: string;
  moduleId: string;
  createdAt: string;
  updatedAt?: string;
  values: Record<string, any>;   // keyed by CustomFieldDef.id
}

export type CustomRecordsByModule = Record<string, CustomRecord[]>;

const DEFAULT_MODULES: PlatformModule[] = [
  { id: 'dashboard',  enabled: true, locked: true,  labels: { ru: 'Главная',       kz: 'Басты бет',    eng: 'Home' },        roleAccess: { manager: true,  employee: true  } },
  { id: 'ai-design',  enabled: true,                labels: { ru: 'AI Дизайн',     kz: 'AI Дизайн',    eng: 'AI Design' },   roleAccess: { manager: true,  employee: false } },
  { id: 'sales',      enabled: true,                labels: { ru: 'Заказы',        kz: 'Тапсырыстар',  eng: 'Orders' },      roleAccess: { manager: true,  employee: true  } },
  { id: 'finance',    enabled: true,                labels: { ru: 'Финансы',       kz: 'Қаржы',        eng: 'Finance' },     roleAccess: { manager: true,  employee: false } },
  { id: 'warehouse',  enabled: true,                labels: { ru: 'Производство',  kz: 'Өндіріс',      eng: 'Production' },  roleAccess: { manager: true,  employee: true  } },
  { id: 'chats',      enabled: true,                labels: { ru: 'Чаты',          kz: 'Чаттар',       eng: 'Chats' },       roleAccess: { manager: true,  employee: false } },
  { id: 'tasks',      enabled: true,                labels: { ru: 'Задачи',        kz: 'Тапсырмалар',  eng: 'Tasks' },       roleAccess: { manager: true,  employee: true  } },
  { id: 'analytics',  enabled: true,                labels: { ru: 'Аналитика',     kz: 'Аналитика',    eng: 'Analytics' },   roleAccess: { manager: true,  employee: false } },
  { id: 'settings',   enabled: true, locked: true,  labels: { ru: 'Настройки',     kz: 'Баптаулар',    eng: 'Settings' },    roleAccess: { manager: false, employee: false } },
];

const MODULES_STORAGE_KEY = 'utir_module_settings';

function loadModules(): PlatformModule[] {
  try {
    const raw = localStorage.getItem(MODULES_STORAGE_KEY);
    if (!raw) return DEFAULT_MODULES;
    const stored = JSON.parse(raw) as PlatformModule[];
    // Merge any new default modules that didn't exist when the user last saved
    // (so adding a module in code doesn't disappear from existing workspaces).
    const byId = new Map(stored.map(m => [m.id, m]));
    const merged: PlatformModule[] = stored.filter(m => DEFAULT_MODULES.some(d => d.id === m.id) || m.custom);
    for (const d of DEFAULT_MODULES) {
      if (!byId.has(d.id)) merged.push(d);
    }
    return merged;
  } catch { return DEFAULT_MODULES; }
}

function saveModules(m: PlatformModule[]) {
  try { localStorage.setItem(MODULES_STORAGE_KEY, JSON.stringify(m)); } catch {}
}

const CUSTOM_RECORDS_STORAGE_KEY = 'utir_custom_records';

function loadCustomRecords(): CustomRecordsByModule {
  try {
    const raw = localStorage.getItem(CUSTOM_RECORDS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CustomRecordsByModule;
  } catch { return {}; }
}

function saveCustomRecords(r: CustomRecordsByModule) {
  try { localStorage.setItem(CUSTOM_RECORDS_STORAGE_KEY, JSON.stringify(r)); } catch {}
}

// ─── AI settings (Block E) ────────────────────────────
// Two completely separate products:
//   - clientAI: chats with customers in WhatsApp/Telegram/Instagram
//   - platformAssistant: helps Admin manage the platform — via Telegram bot only
export type AITone = 'professional' | 'friendly' | 'casual';
export type AILanguage = 'auto' | 'kz' | 'ru' | 'eng';
export type AIModulePermission = 'auto' | 'confirm' | 'none';
export type ClarifyingLevel = 'minimal' | 'balanced' | 'verbose';

export interface KnowledgeSource {
  id: string;
  name: string;
  type: 'doc' | 'faq' | 'pricelist';
  addedAt: string;
}

export interface AISettings {
  client: {
    enabled: boolean;
    personality: string;
    tone: AITone;
    language: AILanguage;
    replyTemplates: string[];
    handoffKeywords: string[];
    knowledgeSources: KnowledgeSource[];
  };
  assistant: {
    enabled: boolean;
    botToken: string;
    botUsername: string;
    tone: AITone;
    language: AILanguage;
    clarifyingLevel: ClarifyingLevel;
    modulePermissions: Record<string, AIModulePermission>;
  };
}

const DEFAULT_AI_SETTINGS: AISettings = {
  client: {
    enabled: false,
    personality: '',
    tone: 'friendly',
    language: 'auto',
    replyTemplates: [],
    handoffKeywords: [],
    knowledgeSources: [],
  },
  assistant: {
    enabled: false,
    botToken: '',
    botUsername: '',
    tone: 'friendly',
    language: 'auto',
    clarifyingLevel: 'balanced',
    modulePermissions: {
      sales: 'confirm', finance: 'confirm', tasks: 'auto',
      analytics: 'auto', chats: 'confirm', warehouse: 'confirm',
    },
  },
};

const AI_SETTINGS_STORAGE_KEY = 'utir_ai_settings';

function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AISettings>;
    return {
      client: { ...DEFAULT_AI_SETTINGS.client, ...(parsed.client || {}) },
      assistant: { ...DEFAULT_AI_SETTINGS.assistant, ...(parsed.assistant || {}) },
    };
  } catch { return DEFAULT_AI_SETTINGS; }
}

function saveAISettings(s: AISettings) {
  try { localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(s)); } catch {}
  // Also persist to the backend so the Telegram bot (server-side) can honour
  // `assistant.modulePermissions` for auto / confirm / none gating.
  api.put('/api/ai-settings', s).catch(err => console.error('[saveAISettings]', err));
}

// ─── CONTEXT ─────────────────────────────────────
interface DataStore {
  deals: Deal[];
  employees: Employee[];
  tasks: Task[];
  products: Product[];
  transactions: FinanceTransaction[];
  integrations: Integration[];
  activityLogs: ActivityLog[];
  profile: UserProfile;
  catalogs: UserCatalogs;
  rolePermissions: RolePermissions;
  roles: TeamRole[];
  modules: PlatformModule[];
  customRecords: CustomRecordsByModule;
  aiSettings: AISettings;
  loaded: boolean;
  // Current user's role — set by App.tsx after auth. Used together with
  // `rolePermissions` so any page can ask "can I write this module?".
  currentUserRole: RoleKey;
  setCurrentUserRole: (role: RoleKey) => void;
  // Returns the matrix level ('full' | 'view' | 'none') for the current user
  // on the given module key. Admin always full. Sidebar ids like 'sales' are
  // mapped to matrix keys ('orders') automatically.
  getModuleLevel: (moduleKey: string) => PermissionLevel;
  // Sugar around getModuleLevel.
  canWriteModule: (moduleKey: string) => boolean;

  addDeal: (deal: Omit<Deal, 'id' | 'createdAt'>) => Deal;
  updateDeal: (id: string, updates: Partial<Deal>) => void;
  deleteDeal: (id: string) => void;

  addEmployee: (emp: Omit<Employee, 'id'>) => void;
  updateEmployee: (id: string, updates: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;

  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  addTransaction: (tx: Omit<FinanceTransaction, 'id'>) => void;
  updateTransaction: (id: string, updates: Partial<FinanceTransaction>) => void;
  deleteTransaction: (id: string) => void;

  toggleIntegration: (id: string) => void;
  updateIntegration: (id: string, updates: Partial<Integration>) => void;

  addActivity: (log: Omit<ActivityLog, 'id' | 'timestamp'>) => void;

  updateProfile: (updates: Partial<UserProfile>) => void;
  addCatalogItem: (key: CatalogKey, value: string) => void;
  removeCatalogItem: (key: CatalogKey, value: string) => void;
  setRolePermission: (role: RoleKey, module: ModuleKey, level: PermissionLevel) => void;
  // Bulk replace — used by the matrix UI to commit multiple cell changes in
  // one click instead of saving on every toggle.
  bulkSetRolePermissions: (next: RolePermissions) => void;
  // Manage the role list (admins only — backend rejects non-admins).
  addRole: (name: string) => string; // returns generated id
  renameRole: (roleId: string, name: string) => void;
  deleteRole: (roleId: string) => void;
  updateModule: (id: string, updates: Partial<PlatformModule>) => void;
  reorderModules: (orderedIds: string[]) => void;
  resetModules: () => void;
  addCustomModule: (mod: Omit<PlatformModule, 'enabled' | 'custom'>) => PlatformModule;
  deleteCustomModule: (id: string) => void;
  addCustomRecord: (moduleId: string, values: Record<string, any>) => CustomRecord;
  updateCustomRecord: (moduleId: string, recordId: string, values: Record<string, any>) => void;
  deleteCustomRecord: (moduleId: string, recordId: string) => void;
  updateAIClient: (updates: Partial<AISettings['client']>) => void;
  updateAIAssistant: (updates: Partial<AISettings['assistant']>) => void;

  reloadAll: () => Promise<void>;
  resetLocal: () => void;

  getEmployeeById: (id: string) => Employee | undefined;
  getDealsByStatus: (status: string) => Deal[];
  getTotalRevenue: () => number;
  getTotalExpenses: () => number;
  getActiveDealsCount: () => number;
  getTotalPipeline: () => number;
  getAverageCheck: () => number;
  getTotalClients: () => number;
}

const DataContext = createContext<DataStore | null>(null);

export function useDataStore() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useDataStore must be used within DataProvider');
  return ctx;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());
  const [catalogs, setCatalogs] = useState<UserCatalogs>(() => loadCatalogs());
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(() => loadRolePermissions());
  const [roles, setRoles] = useState<TeamRole[]>(() => loadTeamRoles());
  // Default to 'admin' so single-user installs work before App.tsx wires the
  // real value — admins always get 'full' so this is the safest fallback.
  const [currentUserRole, setCurrentUserRole] = useState<RoleKey>('admin');
  const [modules, setModules] = useState<PlatformModule[]>(() => loadModules());
  const [customRecords, setCustomRecords] = useState<CustomRecordsByModule>(() => loadCustomRecords());
  const [aiSettings, setAISettings] = useState<AISettings>(() => loadAISettings());
  const [loaded, setLoaded] = useState(false);

  const updateAIClient = useCallback((updates: Partial<AISettings['client']>) => {
    setAISettings(prev => {
      const next: AISettings = { ...prev, client: { ...prev.client, ...updates } };
      saveAISettings(next);
      return next;
    });
  }, []);

  const updateAIAssistant = useCallback((updates: Partial<AISettings['assistant']>) => {
    setAISettings(prev => {
      const next: AISettings = { ...prev, assistant: { ...prev.assistant, ...updates } };
      saveAISettings(next);
      return next;
    });
  }, []);

  // Hoisted above settings/catalog callbacks so they can fire activity events.
  const addActivity = useCallback((log: Omit<ActivityLog, 'id' | 'timestamp'>) => {
    api.post<ActivityLog>('/api/activity', log)
      .then(created => setActivityLogs(prev => [created, ...prev].slice(0, 10000)))
      .catch(err => console.warn('[activity] failed', err));
  }, []);

  const setRolePermission = useCallback((role: RoleKey, module: ModuleKey, level: PermissionLevel) => {
    let beforeLevel: PermissionLevel | undefined;
    setRolePermissions(prev => {
      beforeLevel = prev[role]?.[module];
      const next: RolePermissions = { ...prev, [role]: { ...(prev[role] || EMPTY_PERMS), [module]: level } };
      saveTeamSettings(roles, next);
      return next;
    });
    addActivity({
      user: 'Вы', actor: 'human',
      action: 'Изменил права роли',
      target: `${role} · ${module}`,
      type: 'permission',
      page: 'roles',
      before: beforeLevel,
      after: level,
    });
  }, [addActivity, roles]);

  // Used by the matrix UI: commit a whole pending matrix in one PUT instead of
  // saving on each cell toggle. Logs a single 'matrix updated' activity entry
  // rather than one per changed cell.
  const bulkSetRolePermissions = useCallback((next: RolePermissions) => {
    setRolePermissions(next);
    saveTeamSettings(roles, next);
    addActivity({
      user: 'Вы', actor: 'human',
      action: 'Обновил матрицу прав',
      target: '', type: 'permission', page: 'roles',
    });
  }, [addActivity, roles]);

  // ─── Role list management ─────────────────────────────────────
  const addRole = useCallback((name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) return '';
    const id = 'r_' + Math.random().toString(36).slice(2, 9);
    const nextRole: TeamRole = { id, name: trimmed };
    setRoles(prev => {
      const next = [...prev, nextRole];
      // Also seed an EMPTY_PERMS row for this role and persist atomically.
      setRolePermissions(perms => {
        const nextPerms: RolePermissions = { ...perms, [id]: { ...EMPTY_PERMS } };
        saveTeamSettings(next, nextPerms);
        return nextPerms;
      });
      return next;
    });
    addActivity({ user: 'Вы', actor: 'human', action: 'Создал роль', target: trimmed, type: 'create', page: 'roles' });
    return id;
  }, [addActivity]);

  const renameRole = useCallback((roleId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || roleId === 'admin') return; // admin label is fixed
    setRoles(prev => {
      const next = prev.map(r => r.id === roleId ? { ...r, name: trimmed } : r);
      saveTeamSettings(next, rolePermissions);
      return next;
    });
    addActivity({ user: 'Вы', actor: 'human', action: 'Переименовал роль', target: trimmed, type: 'update', page: 'roles' });
  }, [addActivity, rolePermissions]);

  const deleteRole = useCallback((roleId: string) => {
    if (roleId === 'admin') return; // admin can't be deleted
    setRoles(prev => {
      const next = prev.filter(r => r.id !== roleId);
      setRolePermissions(perms => {
        const nextPerms = { ...perms };
        delete nextPerms[roleId];
        saveTeamSettings(next, nextPerms);
        return nextPerms;
      });
      return next;
    });
    addActivity({ user: 'Вы', actor: 'human', action: 'Удалил роль', target: roleId, type: 'delete', page: 'roles' });
  }, [addActivity]);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile(prev => {
      const next = { ...prev, ...updates };
      saveProfile(next);
      return next;
    });
  }, []);

  const addCatalogItem = useCallback((key: CatalogKey, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    let added = false;
    setCatalogs(prev => {
      if (prev[key].includes(trimmed)) return prev;
      added = true;
      const next: UserCatalogs = { ...prev, [key]: [...prev[key], trimmed] };
      saveCatalogs(next);
      return next;
    });
    if (added) addActivity({
      user: 'Вы', actor: 'human',
      action: 'Добавил в справочник',
      target: `${key} · ${trimmed}`,
      type: 'create',
      page: 'catalog',
    });
  }, [addActivity]);

  const updateModule = useCallback((id: string, updates: Partial<PlatformModule>) => {
    let before: PlatformModule | undefined;
    let after: PlatformModule | undefined;
    setModules(prev => {
      before = prev.find(m => m.id === id);
      const next = prev.map(m => m.id === id ? { ...m, ...updates } : m);
      after = next.find(m => m.id === id);
      saveModules(next);
      return next;
    });
    // Targeted activity entry — only for the meaningful flips, not every label keystroke.
    if (before && after && before.enabled !== after.enabled) {
      addActivity({
        user: 'Вы', actor: 'human',
        action: after.enabled ? 'Включил модуль' : 'Отключил модуль',
        target: after.labels.ru,
        type: 'settings', page: 'settings',
        before: before.enabled ? 'enabled' : 'disabled',
        after: after.enabled ? 'enabled' : 'disabled',
      });
    }
  }, [addActivity]);

  const reorderModules = useCallback((orderedIds: string[]) => {
    setModules(prev => {
      const byId = new Map(prev.map(m => [m.id, m]));
      const next = orderedIds.map(id => byId.get(id)).filter((m): m is PlatformModule => !!m);
      // Keep any module that was somehow missing from the input (defensive).
      for (const m of prev) if (!orderedIds.includes(m.id)) next.push(m);
      saveModules(next);
      return next;
    });
    addActivity({
      user: 'Вы', actor: 'human',
      action: 'Изменил порядок модулей',
      target: '',
      type: 'settings', page: 'settings',
    });
  }, [addActivity]);

  const resetModules = useCallback(() => {
    setModules(DEFAULT_MODULES);
    saveModules(DEFAULT_MODULES);
    addActivity({
      user: 'Вы', actor: 'human',
      action: 'Сбросил настройки модулей по умолчанию',
      target: '',
      type: 'settings', page: 'settings',
    });
  }, [addActivity]);

  const addCustomModule = useCallback((mod: Omit<PlatformModule, 'enabled' | 'custom'>): PlatformModule => {
    const full: PlatformModule = { ...mod, enabled: true, custom: true };
    setModules(prev => {
      const next = [...prev, full];
      saveModules(next);
      return next;
    });
    addActivity({
      user: 'Вы', actor: 'human',
      action: 'Создал кастомный модуль',
      target: full.labels.ru || full.id,
      type: 'create', page: 'settings',
    });
    return full;
  }, [addActivity]);

  const deleteCustomModule = useCallback((id: string) => {
    let label: string | undefined;
    setModules(prev => {
      const target = prev.find(m => m.id === id);
      if (!target || !target.custom) return prev;
      label = target.labels.ru;
      const next = prev.filter(m => m.id !== id);
      saveModules(next);
      return next;
    });
    // Also drop the data rows that belonged to this module.
    setCustomRecords(prev => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      saveCustomRecords(next);
      return next;
    });
    if (label) addActivity({
      user: 'Вы', actor: 'human',
      action: 'Удалил кастомный модуль',
      target: label,
      type: 'delete', page: 'settings',
    });
  }, [addActivity]);

  const addCustomRecord = useCallback((moduleId: string, values: Record<string, any>): CustomRecord => {
    const record: CustomRecord = {
      id: newId('r_'),
      moduleId,
      createdAt: new Date().toISOString(),
      values,
    };
    setCustomRecords(prev => {
      const next = { ...prev, [moduleId]: [record, ...(prev[moduleId] || [])] };
      saveCustomRecords(next);
      return next;
    });
    const modLabel = modules.find(m => m.id === moduleId)?.labels.ru || moduleId;
    addActivity({
      user: 'Вы', actor: 'human',
      action: 'Добавил запись',
      target: modLabel,
      type: 'create', page: 'settings',
    });
    return record;
  }, [addActivity, modules]);

  const updateCustomRecord = useCallback((moduleId: string, recordId: string, values: Record<string, any>) => {
    setCustomRecords(prev => {
      const list = prev[moduleId] || [];
      const next = { ...prev, [moduleId]: list.map(r => r.id === recordId ? { ...r, values, updatedAt: new Date().toISOString() } : r) };
      saveCustomRecords(next);
      return next;
    });
    const modLabel = modules.find(m => m.id === moduleId)?.labels.ru || moduleId;
    addActivity({
      user: 'Вы', actor: 'human',
      action: 'Обновил запись',
      target: `${modLabel} · #${recordId}`,
      type: 'update', page: 'settings',
    });
  }, [addActivity, modules]);

  const deleteCustomRecord = useCallback((moduleId: string, recordId: string) => {
    setCustomRecords(prev => {
      const list = prev[moduleId] || [];
      const next = { ...prev, [moduleId]: list.filter(r => r.id !== recordId) };
      saveCustomRecords(next);
      return next;
    });
    const modLabel = modules.find(m => m.id === moduleId)?.labels.ru || moduleId;
    addActivity({
      user: 'Вы', actor: 'human',
      action: 'Удалил запись',
      target: `${modLabel} · #${recordId}`,
      type: 'delete', page: 'settings',
    });
  }, [addActivity, modules]);

  const removeCatalogItem = useCallback((key: CatalogKey, value: string) => {
    let removed = false;
    setCatalogs(prev => {
      if (!prev[key].includes(value)) return prev;
      removed = true;
      const next: UserCatalogs = { ...prev, [key]: prev[key].filter(v => v !== value) };
      saveCatalogs(next);
      return next;
    });
    if (removed) addActivity({
      user: 'Вы', actor: 'human',
      action: 'Удалил из справочника',
      target: `${key} · ${value}`,
      type: 'delete',
      page: 'catalog',
    });
  }, [addActivity]);

  const reloadAll = useCallback(async () => {
    if (!getToken()) { setLoaded(true); return; }
    try {
      // Note: /api/transactions and /api/activity are role-gated on the
      // backend, so non-admins may get 403 here — swallow to null and use
      // empty lists locally rather than tearing down the whole reload.
      // Matrix-gated reads (deals/products/transactions/activity) may return
      // 403 for a role whose matrix entry is 'none'. Swallow so the UI still
      // boots — the sidebar item for that module is hidden anyway.
      const [d, e, t, p, tx, ig, al, ai, rp] = await Promise.all([
        api.get<Deal[]>('/api/deals').catch(() => [] as Deal[]),
        api.get<Employee[]>('/api/employees'),
        api.get<Task[]>('/api/tasks'),
        api.get<Product[]>('/api/products').catch(() => [] as Product[]),
        api.get<FinanceTransaction[]>('/api/transactions').catch(() => [] as FinanceTransaction[]),
        api.get<Integration[]>('/api/integrations'),
        api.get<ActivityLog[]>('/api/activity').catch(() => [] as ActivityLog[]),
        api.get<AISettings | null>('/api/ai-settings').catch(() => null),
        api.get<{ permissions?: RolePermissions; roles?: TeamRole[] } | RolePermissions | null>('/api/team-permissions').catch(() => null),
      ]);
      setDeals(d); setEmployees(e); setTasks(t); setProducts(p);
      setTransactions(tx); setIntegrations(ig); setActivityLogs(al);
      // Role settings come from the backend so all teammates see the same rules.
      // Accepts both the legacy shape (flat matrix) and the new shape ({permissions, roles}).
      if (rp) {
        const raw: any = rp;
        const legacyMatrix = raw && !('permissions' in raw) && !('roles' in raw) ? raw : null;
        const matrixPart = (raw?.permissions ?? legacyMatrix ?? {}) as Partial<RolePermissions>;
        const rolesPart: TeamRole[] = Array.isArray(raw?.roles) ? raw.roles : [];

        // Merge matrix with defaults so new module keys land; preserve custom role ids.
        const mergedMatrix: RolePermissions = { ...DEFAULT_ROLE_PERMISSIONS };
        for (const [roleId, perms] of Object.entries(matrixPart)) {
          mergedMatrix[roleId] = { ...(mergedMatrix[roleId] || EMPTY_PERMS), ...(perms as any || {}) };
        }
        setRolePermissions(mergedMatrix);
        try { localStorage.setItem(ROLE_PERMS_STORAGE_KEY, JSON.stringify(mergedMatrix)); } catch {}

        // Roles list — make sure admin is always present and locked.
        if (rolesPart.length > 0) {
          const withoutAdmin = rolesPart.filter(r => r.id !== 'admin');
          const fullRoles = [{ id: 'admin', name: 'Администратор', system: true }, ...withoutAdmin];
          setRoles(fullRoles);
          try { localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(fullRoles)); } catch {}
        }
      }
      // Backend is the source of truth for AI settings — merge with defaults so
      // newly-added fields don't crash older saved blobs.
      if (ai) {
        const merged: AISettings = {
          client: { ...DEFAULT_AI_SETTINGS.client, ...(ai.client || {}) },
          assistant: {
            ...DEFAULT_AI_SETTINGS.assistant,
            ...(ai.assistant || {}),
            modulePermissions: {
              ...DEFAULT_AI_SETTINGS.assistant.modulePermissions,
              ...((ai.assistant && ai.assistant.modulePermissions) || {}),
            },
          },
        };
        setAISettings(merged);
        try { localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(merged)); } catch {}
      }
    } catch (err) {
      console.error('[dataStore] reloadAll failed', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  const resetLocal = useCallback(() => {
    setDeals([]); setEmployees([]); setTasks([]); setProducts([]);
    setTransactions([]); setIntegrations([]); setActivityLogs([]);
    setProfile(EMPTY_PROFILE);
    setCatalogs(EMPTY_CATALOGS);
    setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
    setRoles(DEFAULT_ROLES);
    setModules(DEFAULT_MODULES);
    setCustomRecords({});
    setAISettings(DEFAULT_AI_SETTINGS);
    try { localStorage.removeItem(PROFILE_STORAGE_KEY); } catch {}
    try { localStorage.removeItem(CATALOGS_STORAGE_KEY); } catch {}
    try { localStorage.removeItem(ROLE_PERMS_STORAGE_KEY); } catch {}
    try { localStorage.removeItem(ROLES_STORAGE_KEY); } catch {}
    try { localStorage.removeItem(MODULES_STORAGE_KEY); } catch {}
    try { localStorage.removeItem(CUSTOM_RECORDS_STORAGE_KEY); } catch {}
    try { localStorage.removeItem(AI_SETTINGS_STORAGE_KEY); } catch {}
    setLoaded(false);
  }, []);

  useEffect(() => {
    reloadAll();
    const onAuth = () => reloadAll();
    window.addEventListener('utir:auth-changed', onAuth);
    return () => window.removeEventListener('utir:auth-changed', onAuth);
  }, [reloadAll]);

  // Deal CRUD
  const addDeal = useCallback((deal: Omit<Deal, 'id' | 'createdAt'>) => {
    const placeholder: Deal = { ...deal, id: 'tmp_' + Date.now(), createdAt: new Date().toISOString() } as Deal;
    setDeals(prev => [placeholder, ...prev]);
    api.post<Deal>('/api/deals', { ...deal, createdAt: placeholder.createdAt })
      .then(saved => setDeals(prev => prev.map(d => d.id === placeholder.id ? saved : d)))
      .catch(err => {
        console.error('[addDeal] failed', err);
        setDeals(prev => prev.filter(d => d.id !== placeholder.id));
      });
    addActivity({ user: 'Вы', action: 'Создали сделку', target: `${deal.customerName} — ${deal.product}`, type: 'create', page: 'sales' });
    return placeholder;
  }, [addActivity]);

  const updateDeal = useCallback((id: string, updates: Partial<Deal>) => {
    setDeals(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    api.patch(`/api/deals/${id}`, updates).catch(err => console.error('[updateDeal]', err));
    addActivity({ user: 'Вы', action: 'Обновили сделку', target: `#${id}`, type: 'update', page: 'sales' });
  }, [addActivity]);

  const deleteDeal = useCallback((id: string) => {
    setDeals(prev => prev.filter(d => d.id !== id));
    api.delete(`/api/deals/${id}`).catch(err => console.error('[deleteDeal]', err));
    addActivity({ user: 'Вы', action: 'Удалили сделку', target: `#${id}`, type: 'delete', page: 'sales' });
  }, [addActivity]);

  // Employee CRUD
  const addEmployee = useCallback((emp: Omit<Employee, 'id'>) => {
    api.post<Employee>('/api/employees', emp)
      .then(saved => setEmployees(prev => [...prev, saved]))
      .catch(err => console.error('[addEmployee]', err));
    addActivity({ user: 'Вы', action: 'Добавили сотрудника', target: emp.name, type: 'create', page: 'settings' });
  }, [addActivity]);

  const updateEmployee = useCallback((id: string, updates: Partial<Employee>) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    api.patch(`/api/employees/${id}`, updates).catch(err => console.error('[updateEmployee]', err));
  }, []);

  const deleteEmployee = useCallback((id: string) => {
    const emp = employees.find(e => e.id === id);
    setEmployees(prev => prev.filter(e => e.id !== id));
    api.delete(`/api/employees/${id}`).catch(err => console.error('[deleteEmployee]', err));
    if (emp) addActivity({ user: 'Вы', action: 'Удалили сотрудника', target: emp.name, type: 'delete', page: 'settings' });
  }, [employees, addActivity]);

  // Task CRUD
  const addTask = useCallback((task: Omit<Task, 'id' | 'createdAt'>) => {
    const payload = { ...task, createdAt: new Date().toISOString() };
    api.post<Task>('/api/tasks', payload)
      .then(saved => setTasks(prev => [...prev, saved]))
      .catch(err => console.error('[addTask]', err));
    addActivity({ user: 'Вы', action: 'Создали задачу', target: task.title, type: 'create', page: 'tasks' });
  }, [addActivity]);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    api.patch(`/api/tasks/${id}`, updates).catch(err => console.error('[updateTask]', err));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    api.delete(`/api/tasks/${id}`).catch(err => console.error('[deleteTask]', err));
  }, []);

  // Product CRUD
  const addProduct = useCallback((product: Omit<Product, 'id'>) => {
    api.post<Product>('/api/products', product)
      .then(saved => setProducts(prev => [...prev, saved]))
      .catch(err => console.error('[addProduct]', err));
    addActivity({ user: 'Вы', action: 'Добавили материал', target: product.name, type: 'create', page: 'warehouse' });
  }, [addActivity]);

  const updateProduct = useCallback((id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    api.patch(`/api/products/${id}`, updates).catch(err => console.error('[updateProduct]', err));
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    api.delete(`/api/products/${id}`).catch(err => console.error('[deleteProduct]', err));
  }, []);

  // Transaction CRUD
  const addTransaction = useCallback((tx: Omit<FinanceTransaction, 'id'>) => {
    api.post<FinanceTransaction>('/api/transactions', tx)
      .then(saved => setTransactions(prev => [...prev, saved]))
      .catch(err => console.error('[addTransaction]', err));
    addActivity({
      user: 'Вы', actor: 'human',
      action: tx.type === 'income' ? 'Добавил приход' : 'Добавил расход',
      target: `${tx.amount.toLocaleString('ru-RU')} ₸ · ${tx.category || ''}${tx.description ? ' (' + tx.description + ')' : ''}`,
      type: 'create', page: 'finance',
    });
  }, [addActivity]);

  const updateTransaction = useCallback((id: string, updates: Partial<FinanceTransaction>) => {
    // Capture the pre-update row so we can log a meaningful before/after.
    const prevRow = transactions.find(t => t.id === id);
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    api.patch(`/api/transactions/${id}`, updates).catch(err => console.error('[updateTransaction]', err));
    if (prevRow) {
      const merged = { ...prevRow, ...updates };
      addActivity({
        user: 'Вы', actor: 'human',
        action: merged.type === 'income' ? 'Изменил приход' : 'Изменил расход',
        target: `${merged.amount.toLocaleString('ru-RU')} ₸ · ${merged.category || ''}`,
        type: 'update', page: 'finance',
        before: `${prevRow.amount.toLocaleString('ru-RU')} ₸`,
        after: `${merged.amount.toLocaleString('ru-RU')} ₸`,
      });
    }
  }, [transactions, addActivity]);

  const deleteTransaction = useCallback((id: string) => {
    const removed = transactions.find(t => t.id === id);
    setTransactions(prev => prev.filter(t => t.id !== id));
    api.delete(`/api/transactions/${id}`).catch(err => console.error('[deleteTransaction]', err));
    if (removed) {
      addActivity({
        user: 'Вы', actor: 'human',
        action: removed.type === 'income' ? 'Удалил приход' : 'Удалил расход',
        target: `${removed.amount.toLocaleString('ru-RU')} ₸ · ${removed.description || removed.category || ''}`,
        type: 'delete', page: 'finance',
      });
    }
  }, [transactions, addActivity]);

  // Integration
  const toggleIntegration = useCallback((id: string) => {
    setIntegrations(prev => prev.map(i => {
      if (i.id !== id) return i;
      const next = { ...i, connected: !i.connected, lastSync: !i.connected ? new Date().toISOString() : undefined };
      api.patch(`/api/integrations/${id}`, { connected: next.connected, lastSync: next.lastSync }).catch(err => console.error('[toggleIntegration]', err));
      return next;
    }));
  }, []);

  const updateIntegration = useCallback((id: string, updates: Partial<Integration>) => {
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
    api.patch(`/api/integrations/${id}`, updates).catch(err => console.error('[updateIntegration]', err));
  }, []);

  // Computed
  const getEmployeeById = useCallback((id: string) => employees.find(e => e.id === id), [employees]);
  const getDealsByStatus = useCallback((status: string) => deals.filter(d => d.status === status), [deals]);
  const getActiveDealsCount = useCallback(() => deals.filter(d => !['completed', 'rejected'].includes(d.status)).length, [deals]);
  const getTotalPipeline = useCallback(() => deals.filter(d => !['completed', 'rejected'].includes(d.status)).reduce((s, d) => s + d.amount, 0), [deals]);
  const getTotalRevenue = useCallback(() => transactions.filter(t => t.type === 'income' && t.status === 'completed').reduce((s, t) => s + t.amount, 0), [transactions]);
  const getTotalExpenses = useCallback(() => transactions.filter(t => t.type === 'expense' && t.status === 'completed').reduce((s, t) => s + t.amount, 0), [transactions]);
  const getAverageCheck = useCallback(() => {
    const paid = deals.filter(d => d.amount > 0);
    return paid.length ? Math.round(paid.reduce((s, d) => s + d.amount, 0) / paid.length) : 0;
  }, [deals]);
  const getTotalClients = useCallback(() => deals.length, [deals]);

  // Sidebar ids like 'sales' / 'warehouse' don't match matrix keys 'orders' /
  // 'production' — translate at the boundary so callers can pass either.
  const sidebarToMatrixKey = (id: string): string => {
    const map: Record<string, string> = { sales: 'orders', warehouse: 'production' };
    return map[id] || id;
  };
  const getModuleLevel = useCallback((moduleKey: string): PermissionLevel => {
    if (currentUserRole === 'admin') return 'full';
    const key = sidebarToMatrixKey(moduleKey);
    const level = (rolePermissions as any)?.[currentUserRole]?.[key];
    if (level === 'full' || level === 'view' || level === 'none') return level;
    return 'full'; // permissive fallback for unknown keys (e.g. tasks)
  }, [currentUserRole, rolePermissions]);
  const canWriteModule = useCallback((moduleKey: string) => getModuleLevel(moduleKey) === 'full', [getModuleLevel]);

  const store: DataStore = {
    deals, employees, tasks, products, transactions, integrations, activityLogs, profile, catalogs, rolePermissions, roles, modules, customRecords, aiSettings, loaded,
    currentUserRole, setCurrentUserRole, getModuleLevel, canWriteModule,
    addDeal, updateDeal, deleteDeal,
    addEmployee, updateEmployee, deleteEmployee,
    addTask, updateTask, deleteTask,
    addProduct, updateProduct, deleteProduct,
    addTransaction, updateTransaction, deleteTransaction,
    toggleIntegration, updateIntegration,
    addActivity,
    updateProfile,
    addCatalogItem, removeCatalogItem,
    setRolePermission,
    bulkSetRolePermissions,
    addRole, renameRole, deleteRole,
    updateModule, reorderModules, resetModules,
    addCustomModule, deleteCustomModule,
    addCustomRecord, updateCustomRecord, deleteCustomRecord,
    updateAIClient, updateAIAssistant,
    reloadAll, resetLocal,
    getEmployeeById, getDealsByStatus, getTotalRevenue, getTotalExpenses, getActiveDealsCount, getTotalPipeline, getAverageCheck, getTotalClients,
  };

  return <DataContext.Provider value={store}>{children}</DataContext.Provider>;
}
