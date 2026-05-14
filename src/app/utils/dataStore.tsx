import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { api, getToken } from './api';

// ─── TYPES ─────────────────────────────────────────
export interface Deal {
  id: string;
  customerName: string;
  phone: string;
  address: string;
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
  measurer: string;
  designer: string;
  materials: string;
  measurementDate: string;
  completionDate: string;
  installationDate: string;
  paymentMethods: Record<string, boolean>;
  notes: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'admin' | 'manager' | 'designer' | 'production' | 'sales' | 'accountant';
  department: string;
  status: 'active' | 'inactive' | 'vacation';
  salary: number;
  joinDate: string;
  lastActive: string;
  avatar: string;
  permissions: { sales: boolean; finance: boolean; warehouse: boolean; chats: boolean; analytics: boolean; settings: boolean; };
  performance: { ordersCompleted: number; rating: number; efficiency: number; };
}

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

export interface ActivityLog {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string;
  type: 'create' | 'update' | 'delete' | 'login' | 'logout';
  page?: string;
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
  loaded: boolean;

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

  toggleIntegration: (id: string) => void;
  updateIntegration: (id: string, updates: Partial<Integration>) => void;

  addActivity: (log: Omit<ActivityLog, 'id' | 'timestamp'>) => void;

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
  const [loaded, setLoaded] = useState(false);

  const reloadAll = useCallback(async () => {
    if (!getToken()) { setLoaded(true); return; }
    try {
      const [d, e, t, p, tx, ig, al] = await Promise.all([
        api.get<Deal[]>('/api/deals'),
        api.get<Employee[]>('/api/employees'),
        api.get<Task[]>('/api/tasks'),
        api.get<Product[]>('/api/products'),
        api.get<FinanceTransaction[]>('/api/transactions'),
        api.get<Integration[]>('/api/integrations'),
        api.get<ActivityLog[]>('/api/activity'),
      ]);
      setDeals(d); setEmployees(e); setTasks(t); setProducts(p);
      setTransactions(tx); setIntegrations(ig); setActivityLogs(al);
    } catch (err) {
      console.error('[dataStore] reloadAll failed', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  const resetLocal = useCallback(() => {
    setDeals([]); setEmployees([]); setTasks([]); setProducts([]);
    setTransactions([]); setIntegrations([]); setActivityLogs([]);
    setLoaded(false);
  }, []);

  useEffect(() => {
    reloadAll();
    const onAuth = () => reloadAll();
    window.addEventListener('utir:auth-changed', onAuth);
    return () => window.removeEventListener('utir:auth-changed', onAuth);
  }, [reloadAll]);

  const addActivity = useCallback((log: Omit<ActivityLog, 'id' | 'timestamp'>) => {
    api.post<ActivityLog>('/api/activity', log)
      .then(created => setActivityLogs(prev => [created, ...prev].slice(0, 50)))
      .catch(err => console.warn('[activity] failed', err));
  }, []);

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
    addActivity({ user: 'Вы', action: tx.type === 'income' ? 'Добавили приход' : 'Добавили расход', target: `${tx.amount.toLocaleString()} ₸`, type: 'create', page: 'finance' });
  }, [addActivity]);

  const updateTransaction = useCallback((id: string, updates: Partial<FinanceTransaction>) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    api.patch(`/api/transactions/${id}`, updates).catch(err => console.error('[updateTransaction]', err));
  }, []);

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

  const store: DataStore = {
    deals, employees, tasks, products, transactions, integrations, activityLogs, loaded,
    addDeal, updateDeal, deleteDeal,
    addEmployee, updateEmployee, deleteEmployee,
    addTask, updateTask, deleteTask,
    addProduct, updateProduct, deleteProduct,
    addTransaction, updateTransaction,
    toggleIntegration, updateIntegration,
    addActivity,
    reloadAll, resetLocal,
    getEmployeeById, getDealsByStatus, getTotalRevenue, getTotalExpenses, getActiveDealsCount, getTotalPipeline, getAverageCheck, getTotalClients,
  };

  return <DataContext.Provider value={store}>{children}</DataContext.Provider>;
}
