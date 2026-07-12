import { useEffect, useState } from 'react';
import {
  CheckCircle2, Circle, Clock, AlertCircle, Plus, Search, Filter,
  ChevronDown, ChevronRight, MoreHorizontal, Calendar, User, Send,
  MessageCircle, X, GripVertical, ArrowRight, Bot, Smartphone,
  Check, RefreshCw, Eye, Trash2, Edit3, Flag, Download, Upload,
} from 'lucide-react';
import { useDataStore, Task as StoreTask } from '../utils/dataStore';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { rowsToCsv, downloadCsv, todayStampedName, type CsvColumn } from '../utils/csv';
import { CsvImportModal, type CsvFieldSpec } from './CsvImportModal';
import { TelegramBotPanel } from './TelegramBotPanel';
import { getNiche, type NicheConfig } from '../utils/niches';

// Niche-aware category palette. Production stage names from the niche
// become categories (Распил/Кромка for furniture, Замер/Монтаж for
// ceilings, etc.), plus a fixed set of cross-niche business categories.
// Colors cycle through a fixed palette so any category gets a chip color.
const CATEGORY_PALETTE = [
  'bg-cyan-100 text-cyan-700', 'bg-amber-100 text-amber-700', 'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700', 'bg-indigo-100 text-indigo-700', 'bg-pink-100 text-pink-700',
  'bg-violet-100 text-violet-700', 'bg-sky-100 text-sky-700',
];
const GENERIC_CATEGORIES = ['Замер', 'Дизайн', 'Продажи', 'Закупки', 'Доставка', 'Маркетинг', 'Прочее'];
function buildCategories(niche: NicheConfig): string[] {
  const fromNiche = niche.productionStages.map(s => s.ru);
  // De-dupe while preserving order: niche stages first, then generic.
  return Array.from(new Set([...fromNiche, ...GENERIC_CATEGORIES]));
}
function categoryColor(cat: string, allCats: string[]): string {
  const idx = allCats.indexOf(cat);
  return CATEGORY_PALETTE[(idx >= 0 ? idx : cat.length) % CATEGORY_PALETTE.length];
}

// ─── TYPES ───────────────────────────────────────────────────
interface Task {
  id: string;
  title: string;
  description: string;
  status: 'new' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee: Employee;
  createdAt: string;
  dueDate: string;
  completedAt?: string;
  source: 'telegram' | 'platform';
  telegramConfirmed: boolean;
  completionNote?: string;
  category: string;
  subtasks?: { id: string; title: string; done: boolean }[];
  linkedDealId?: string;
}

interface Employee {
  id: string;
  name: string;
  role: string;
  avatar: string;
  telegramUsername: string;
  telegramConnected: boolean;
  tasksToday: number;
  tasksDone: number;
}

// Single sentinel for tasks without an assignee (e.g. AI-generated tasks where
// Claude omitted assigneeId). Replaces the old hardcoded 4-slot placeholder team.
// Real team members come from store.employees (Block C.2 invitations populate this).
const UNASSIGNED: Employee = {
  id: '', name: 'Не назначен', role: '—', avatar: '?',
  telegramUsername: '', telegramConnected: false, tasksToday: 0, tasksDone: 0,
};

type Lang = 'kz' | 'ru' | 'eng';
const pickLang = (t: { ru: string; kz: string; eng: string }, language: Lang) =>
  language === 'kz' ? t.kz : language === 'eng' ? t.eng : t.ru;

const columns = [
  { id: 'new' as const, title: { ru: 'Новые', kz: 'Жаңа', eng: 'New' }, icon: Circle, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
  { id: 'in_progress' as const, title: { ru: 'В работе', kz: 'Жұмыста', eng: 'In progress' }, icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  { id: 'review' as const, title: { ru: 'На проверке', kz: 'Тексеруде', eng: 'In review' }, icon: Eye, color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
  { id: 'done' as const, title: { ru: 'Выполнено', kz: 'Орындалды', eng: 'Done' }, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50', border: 'border-green-200' },
];

const priorityConfig: Record<string, { label: { ru: string; kz: string; eng: string }; color: string; bg: string }> = {
  low: { label: { ru: 'Низкий', kz: 'Төмен', eng: 'Low' }, color: 'text-slate-500', bg: 'bg-slate-100' },
  medium: { label: { ru: 'Средний', kz: 'Орташа', eng: 'Medium' }, color: 'text-blue-600', bg: 'bg-blue-50' },
  high: { label: { ru: 'Высокий', kz: 'Жоғары', eng: 'High' }, color: 'text-orange-600', bg: 'bg-orange-50' },
  urgent: { label: { ru: 'Срочно', kz: 'Шұғыл', eng: 'Urgent' }, color: 'text-red-600', bg: 'bg-red-50' },
};

interface TasksProps {
  language: 'kz' | 'ru' | 'eng';
}

type ViewMode = 'board' | 'list' | 'employees';

export function Tasks({ language }: TasksProps) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();
  // Poll backend every 15s so tasks created via Telegram bot show up without manual reload.
  useAutoRefresh(store.reloadAll, 15000);
  const niche = getNiche(store.niche);
  // Tasks are intentionally writable by all team members (no matrix key),
  // BUT destructive actions (delete) are gated so a restricted role can't
  // wipe the board. canWrite reflects the 'tasks' module level.
  const canWrite = store.canWriteModule('tasks');
  const taskCategories = buildCategories(niche);

  // Real team members from the store, projected into this component's `Employee` shape
  // for use in dropdowns and the "Сотрудники" view. Empty array means no team yet.
  const teamEmployees: Employee[] = store.employees.map(e => ({
    id: e.id, name: e.name, role: e.department, avatar: e.avatar,
    telegramUsername: '@' + e.name.split(' ')[0].toLowerCase(),
    telegramConnected: e.status === 'active',
    tasksToday: store.tasks.filter(t => t.assigneeId === e.id).length,
    tasksDone: store.tasks.filter(t => t.assigneeId === e.id && t.status === 'done').length,
  }));

  // Map store tasks to local Task format
  const mapStoreTask = (st: StoreTask): Task => {
    const emp = store.getEmployeeById(st.assigneeId);
    return {
      id: st.id, title: st.title, description: st.description, status: st.status, priority: st.priority,
      assignee: emp ? { id: emp.id, name: emp.name, role: emp.department, avatar: emp.avatar, telegramUsername: '@' + emp.name.split(' ')[0].toLowerCase(), telegramConnected: emp.status === 'active', tasksToday: store.tasks.filter(t => t.assigneeId === emp.id).length, tasksDone: store.tasks.filter(t => t.assigneeId === emp.id && t.status === 'done').length } : UNASSIGNED,
      createdAt: st.createdAt, dueDate: st.dueDate, completedAt: st.completedAt,
      // Source derives from the stored field rather than always claiming
      // Telegram. Falls back to 'platform' for tasks created in-app.
      source: ((st as any).source === 'telegram' ? 'telegram' : 'platform'),
      telegramConfirmed: (st as any).source === 'telegram',
      completionNote: st.completionNote,
      category: st.category, subtasks: st.subtasks, linkedDealId: st.linkedDealId,
    };
  };

  const tasks = store.tasks.map(mapStoreTask);
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDue, setFilterDue] = useState<'all' | 'overdue' | 'today' | 'week'>('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showTelegramPanel, setShowTelegramPanel] = useState(false);
  const [showBotSettings, setShowBotSettings] = useState(false);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  // Overflow «•••» menu — keeps the header minimal (Telegram / export / import).
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const filteredTasks = tasks.filter(t => {
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase()) && !t.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterEmployee !== 'all' && t.assignee.id !== filterEmployee) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;
    if (filterDue !== 'all') {
      if (!t.dueDate) return false;
      if (filterDue === 'overdue' && !(t.dueDate < today && t.status !== 'done')) return false;
      if (filterDue === 'today' && t.dueDate !== today) return false;
      if (filterDue === 'week') {
        const weekAhead = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        if (!(t.dueDate >= today && t.dueDate <= weekAhead)) return false;
      }
    }
    return true;
  });

  // Headline stats cover ALL filtered tasks (not just today-due) so a
  // brand-new team that imported tasks doesn't see all-zero cards. The
  // "overdue" count is the actually-urgent signal.
  const openTasks = filteredTasks.filter(t => t.status !== 'done');
  const stats = {
    total: filteredTasks.length,
    done: filteredTasks.filter(t => t.status === 'done').length,
    inProgress: filteredTasks.filter(t => t.status === 'in_progress').length,
    review: filteredTasks.filter(t => t.status === 'review').length,
    newCount: filteredTasks.filter(t => t.status === 'new').length,
    overdue: openTasks.filter(t => t.dueDate && t.dueDate < today).length,
    dueToday: openTasks.filter(t => t.dueDate === today).length,
  };

  const moveTask = (taskId: string, newStatus: Task['status']) => {
    store.updateTask(taskId, { status: newStatus, completedAt: newStatus === 'done' ? new Date().toISOString() : undefined });
    if (selectedTask?.id === taskId) {
      setSelectedTask(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

  const getNextStatus = (current: Task['status']): Task['status'] | null => {
    const flow: Record<string, Task['status']> = { new: 'in_progress', in_progress: 'review', review: 'done' };
    return flow[current] || null;
  };

  // CSV export moved out of JSX to keep the header minimal.
  const exportTasks = () => {
    const cols: CsvColumn<StoreTask>[] = [
      { header: 'ID',           value: 'id' },
      { header: 'Название',     value: 'title' },
      { header: 'Описание',     value: 'description' },
      { header: 'Категория',    value: 'category' },
      { header: 'Статус',       value: 'status' },
      { header: 'Приоритет',    value: 'priority' },
      { header: 'Исполнитель',  value: (t) => store.getEmployeeById(t.assigneeId)?.name || '' },
      { header: 'Срок',         value: 'dueDate' },
      { header: 'Создано',      value: 'createdAt' },
      { header: 'Выполнено',    value: 'completedAt' },
    ];
    downloadCsv(todayStampedName('tasks'), rowsToCsv(store.tasks, cols));
  };

  return (
    // Liquid-glass page backdrop — same vocabulary as Dashboard / AI
    // Design / Sales. Wraps the whole page so cards / chips / modals
    // sit on a living pastel surface instead of plain grey.
    <div
      className="min-h-full relative"
    >
    <div className="px-4 py-5 sm:p-6 lg:p-8 relative max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div>
          <p className="text-[11px] text-slate-400 mb-1 tracking-widest uppercase">{l('Задачи', 'Тапсырмалар', 'Tasks')}</p>
          <h1 className="text-slate-900 text-2xl md:text-3xl font-medium tracking-tight mb-1">{l('Задачи команды', 'Команда тапсырмалары', 'Team tasks')}</h1>
          <p className="text-sm text-slate-500">{l('Ежедневные задачи сотрудников через Telegram-бот', 'Қызметкерлердің күнделікті тапсырмалары Telegram-бот арқылы', 'Daily employee tasks via Telegram bot')}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Overflow «•••» — Telegram bot, export, import tucked away */}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              className={`flex items-center justify-center w-9 h-9 rounded-2xl ring-1 transition-all ${showMoreMenu ? 'bg-white/85 text-slate-700 ring-white/60' : 'bg-white/50 text-slate-500 ring-white/60 hover:bg-white/80 backdrop-blur-xl'}`}
              title={l('Ещё', 'Тағы', 'More')}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute right-0 top-full mt-2 z-30 p-1.5 min-w-[230px] bg-white/50 backdrop-blur-2xl backdrop-saturate-150 border border-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl">
                  <button onClick={() => { setShowMoreMenu(false); setShowTelegramPanel(v => !v); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-700 hover:bg-white/60 transition-colors">
                    <Send className="w-4 h-4 text-[#2AABEE] flex-shrink-0" /><span className="flex-1 text-left">{l('Telegram-бот', 'Telegram-бот', 'Telegram bot')}</span>
                  </button>
                  <div className="h-px bg-white/50 my-1 mx-2" />
                  <button onClick={() => { setShowMoreMenu(false); exportTasks(); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-700 hover:bg-white/60 transition-colors">
                    <Download className="w-4 h-4 text-slate-400 flex-shrink-0" /><span className="flex-1 text-left">{l('Экспорт (CSV)', 'Экспорт (CSV)', 'Export (CSV)')}</span>
                  </button>
                  <button onClick={() => { setShowMoreMenu(false); setShowImport(true); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-700 hover:bg-white/60 transition-colors">
                    <Upload className="w-4 h-4 text-slate-400 flex-shrink-0" /><span className="flex-1 text-left">{l('Импорт из CSV', 'CSV-ден импорт', 'Import from CSV')}</span>
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setShowNewTaskModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
          >
            <Plus className="w-4 h-4" />
            {l('Новая задача', 'Жаңа тапсырма', 'New task')}
          </button>
        </div>
      </div>

      {/* Telegram Bot Panel — minimalist, honest empty state until Block F wires the real bot */}
      {showTelegramPanel && (
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl overflow-hidden mb-6">
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2AABEE]/10 rounded-xl flex items-center justify-center">
                <Bot className="w-5 h-5 text-[#2AABEE]" />
              </div>
              <div>
                <div className="text-sm text-slate-900">{l('Telegram-бот платформы', 'Платформаның Telegram-боты', 'Platform Telegram bot')}</div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
                  {l('Не подключён', 'Қосылмаған', 'Not connected')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowBotSettings(true)} className="px-3 py-1.5 bg-white/60 ring-1 ring-white/60 text-slate-700 rounded-xl text-xs hover:bg-white">{l('Настройки', 'Баптаулар', 'Settings')}</button>
              <button onClick={() => setShowTelegramPanel(false)} className="w-8 h-8 bg-white/60 ring-1 ring-white/60 rounded-2xl flex items-center justify-center hover:bg-white transition-colors">
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Body — 2 clean sections */}
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* How it will work */}
            <section>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-3">{l('Как это будет работать', 'Бұл қалай жұмыс істейді', 'How it will work')}</div>
              <ol className="space-y-2.5">
                {[
                  l('Сотрудник пишет боту свои задачи на день', 'Қызметкер ботқа күнделікті тапсырмаларын жазады', 'Employee writes their tasks for the day to the bot'),
                  l('Бот форматирует список и просит подтверждения', 'Бот тізімді құрастырып, растауды сұрайды', 'The bot formats the list and asks for confirmation'),
                  l('Сотрудник подтверждает — задачи попадают на платформу', 'Қызметкер растайды — тапсырмалар платформаға түседі', 'Employee confirms — tasks appear on the platform'),
                  l('По завершении сотрудник пишет отчёт боту', 'Аяқталған соң қызметкер ботқа есеп жазады', 'When finished, the employee sends a report to the bot'),
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-slate-600">
                    <span className="w-5 h-5 flex-shrink-0 rounded-lg bg-white/50 text-slate-500 text-[10px] flex items-center justify-center tabular-nums">{i + 1}</span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            {/* Connected employees — empty state */}
            <section>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-3">{l('Подключённые сотрудники', 'Қосылған қызметкерлер', 'Connected employees')}</div>
              <div className="bg-white/40 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl p-6 text-center">
                <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-white border border-white/60 flex items-center justify-center">
                  <Send className="w-4 h-4 text-slate-300" />
                </div>
                <div className="text-xs text-slate-700 mb-1">{l('Пока никто не подключён', 'Әзірге ешкім қосылмаған', 'No one is connected yet')}</div>
                <div className="text-[11px] text-slate-400 leading-relaxed max-w-[260px] mx-auto">
                  {l('Сотрудники появятся здесь после того, как Админ настроит Telegram-бот и пригласит команду.', 'Әкімші Telegram-ботты баптап, командаға шақыру жібергеннен кейін қызметкерлер осында пайда болады.', 'Employees will appear here after the Admin sets up the Telegram bot and invites the team.')}
                </div>
              </div>
            </section>
          </div>

          {/* Footer hint */}
          <div className="px-5 py-3 border-t border-white/50 text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
            {l('Полная интеграция Telegram-бота — в следующем обновлении. Сейчас задачи добавляются вручную.', 'Telegram-боттың толық интеграциясы — келесі жаңартуда. Қазір тапсырмалар қолмен қосылады.', 'Full Telegram bot integration is coming in the next update. For now, tasks are added manually.')}
          </div>
        </div>
      )}

      {/* Stats cards — minimal glass tiles with a single accent dot */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 sm:gap-3 mb-6">
        {[
          { label: l('Всего на сегодня', 'Барлығы бүгінге', 'Total'), value: stats.total, dot: 'bg-slate-300' },
          { label: l('Новые', 'Жаңа', 'New'), value: stats.newCount, dot: 'bg-sky-400' },
          { label: l('В работе', 'Жұмыста', 'In progress'), value: stats.inProgress, dot: 'bg-amber-400' },
          { label: l('На проверке', 'Тексеруде', 'In review'), value: stats.review, dot: 'bg-violet-400' },
          { label: l('Выполнено', 'Орындалды', 'Done'), value: stats.done, dot: 'bg-emerald-500', progress: stats.total > 0 ? (stats.done / stats.total) * 100 : 0 },
        ].map((s, i) => (
          <div key={i} className="bg-white/50 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.14),inset_0_1px_0_0_rgba(255,255,255,0.6)] rounded-2xl p-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot} flex-shrink-0`} />
              <span className="text-[11px] text-slate-500 truncate">{s.label}</span>
            </div>
            <div className="text-2xl text-slate-900 tabular-nums tracking-tight">{s.value}</div>
            {s.progress !== undefined && (
              <div className="w-full h-1.5 bg-white/60 rounded-full mt-2 overflow-hidden ring-1 ring-white/40">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${s.progress}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode — glass segmented, active is emerald */}
          <div className="flex gap-1 bg-white/50 ring-1 ring-white/60 backdrop-blur-xl rounded-2xl p-1">
            {([
              { key: 'board' as ViewMode, label: l('Доска', 'Тақта', 'Board') },
              { key: 'list' as ViewMode, label: l('Список', 'Тізім', 'List') },
              { key: 'employees' as ViewMode, label: l('Сотрудники', 'Қызметкерлер', 'Employees') },
            ]).map(v => (
              <button
                key={v.key}
                onClick={() => setViewMode(v.key)}
                className={`px-3 py-1.5 rounded-xl text-sm transition-all ${viewMode === v.key ? 'bg-emerald-600 text-white shadow-[0_4px_12px_-4px_var(--accent-shadow)]' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <select
            value={filterEmployee}
            onChange={e => setFilterEmployee(e.target.value)}
            className="px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all"
          >
            <option value="all">{l('Все сотрудники', 'Барлық қызметкерлер', 'All employees')}</option>
            {teamEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>

          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all"
          >
            <option value="all">{l('Все приоритеты', 'Барлық басымдықтар', 'All priorities')}</option>
            <option value="urgent">{l('Срочно', 'Шұғыл', 'Urgent')}</option>
            <option value="high">{l('Высокий', 'Жоғары', 'High')}</option>
            <option value="medium">{l('Средний', 'Орташа', 'Medium')}</option>
            <option value="low">{l('Низкий', 'Төмен', 'Low')}</option>
          </select>

          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all"
          >
            <option value="all">{l('Все категории', 'Барлық санаттар', 'All categories')}</option>
            {taskCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={filterDue}
            onChange={e => setFilterDue(e.target.value as any)}
            className="px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all"
          >
            <option value="all">{l('Все сроки', 'Барлық мерзімдер', 'All due dates')}</option>
            <option value="overdue">{l('Просроченные', 'Мерзімі өткен', 'Overdue')}</option>
            <option value="today">{l('На сегодня', 'Бүгінге', 'Today')}</option>
            <option value="week">{l('На неделю', 'Аптаға', 'This week')}</option>
          </select>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={l('Поиск задач...', 'Тапсырмаларды іздеу...', 'Search tasks...')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 pr-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm w-56 focus:outline-none focus:bg-white focus:ring-slate-300 transition-all"
          />
        </div>
      </div>

      {/* EMPTY STATE — fresh team with 0 tasks. Replaces 4 empty
          columns + zeroed stat cards with a single clear CTA. */}
      {viewMode === 'board' && tasks.length === 0 && (
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-10 text-center">
          <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg text-slate-900 mb-1 tracking-tight">{l('Здесь будут задачи команды', 'Мұнда команда тапсырмалары болады', 'Team tasks will appear here')}</h3>
          <p className="text-xs text-slate-500 mb-5 max-w-md mx-auto leading-relaxed">
            {l(
              'Канбан-доска: Новые → В работе → На проверке → Выполнено. Привязывайте задачи к сделкам, назначайте сотрудников, ставьте сроки. Категории — под нишу',
              'Канбан-тақта: Жаңа → Жұмыста → Тексеруде → Орындалды. Тапсырмаларды мәмілелерге байланыстырыңыз, қызметкерлерді тағайындаңыз, мерзім қойыңыз. Санаттар — сала бойынша',
              'Kanban board: New → In progress → In review → Done. Link tasks to deals, assign employees, set due dates. Categories match the niche',
            )} «{niche.name[language]}».
          </p>
          <div className="flex items-center gap-2 justify-center flex-wrap">
            <button
              onClick={() => setShowNewTaskModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> {l('Создать первую задачу', 'Алғашқы тапсырманы жасау', 'Create the first task')}
            </button>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('ai-assistant:open', {
                  detail: { prompt: `Поставь задачу: позвонить клиенту завтра. Моя ниша — ${niche.name.ru}.` },
                }));
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600/90 hover:bg-violet-700 text-white rounded-2xl text-xs ring-1 ring-white/10 transition-all"
            >
              ✨ {l('Через AI', 'AI арқылы', 'Via AI')}
            </button>
          </div>
        </div>
      )}

      {/* BOARD VIEW */}
      {viewMode === 'board' && tasks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {columns.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.id);
            const Icon = col.icon;
            return (
              <div key={col.id} className="min-h-[200px]">
                <div className={`flex items-center gap-2 mb-3 px-1`}>
                  <Icon className={`w-4 h-4 ${col.color}`} />
                  <span className="text-sm text-slate-700">{pickLang(col.title, language)}</span>
                  <span className="text-[11px] bg-white/60 ring-1 ring-white/60 text-slate-500 px-1.5 py-0.5 rounded-full ml-1 tabular-nums">{colTasks.length}</span>
                </div>
                <div className="space-y-3">
                  {colTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      categories={taskCategories}
                      language={language}
                      onClick={() => setSelectedTask(task)}
                      onMove={moveTask}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 shadow-[0_4px_16px_-8px_rgba(15,23,42,0.10)] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/60 bg-white/30">
                <th className="px-4 py-3 text-left text-xs text-slate-500">{l('Задача', 'Тапсырма', 'Task')}</th>
                <th className="px-3 py-3 text-left text-xs text-slate-500">{l('Категория', 'Санат', 'Category')}</th>
                <th className="px-3 py-3 text-left text-xs text-slate-500">{l('Исполнитель', 'Орындаушы', 'Assignee')}</th>
                <th className="px-3 py-3 text-left text-xs text-slate-500">{l('Приоритет', 'Басымдық', 'Priority')}</th>
                <th className="px-3 py-3 text-left text-xs text-slate-500">{l('Статус', 'Күй', 'Status')}</th>
                <th className="px-3 py-3 text-left text-xs text-slate-500">{l('Источник', 'Дереккөз', 'Source')}</th>
                <th className="px-3 py-3 text-left text-xs text-slate-500">{l('Срок', 'Мерзім', 'Due')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/50">
              {filteredTasks.map(task => {
                const pr = priorityConfig[task.priority];
                return (
                  <tr key={task.id} className="hover:bg-white/30 transition-colors cursor-pointer" onClick={() => setSelectedTask(task)}>
                    <td className="px-4 py-3">
                      <div className="text-slate-900">{task.title}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[250px]">{task.description}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColor(task.category, taskCategories)}`}>{task.category}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center text-[10px] text-slate-600">{task.assignee.avatar}</div>
                        <span className="text-xs text-slate-700">{task.assignee.name.split(' ')[0]}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${pr.bg} ${pr.color}`}>{pickLang(pr.label, language)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        task.status === 'done' ? 'bg-green-50 text-green-700' :
                        task.status === 'review' ? 'bg-purple-50 text-purple-700' :
                        task.status === 'in_progress' ? 'bg-yellow-50 text-yellow-700' :
                        'bg-blue-50 text-blue-700'
                      }`}>
                        {(() => { const c = columns.find(c => c.id === task.status); return c ? pickLang(c.title, language) : ''; })()}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {task.source === 'telegram' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#2AABEE]">
                          <Send className="w-3 h-3" /> Telegram
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                          <Smartphone className="w-3 h-3" /> {l('Платформа', 'Платформа', 'Platform')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{task.dueDate === today ? l('Сегодня', 'Бүгін', 'Today') : task.dueDate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* EMPLOYEES VIEW */}
      {viewMode === 'employees' && (
        <div className="space-y-4">
          {teamEmployees.length === 0 && (
            <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 shadow-[0_4px_16px_-8px_rgba(15,23,42,0.10)] rounded-2xl p-8 text-center">
              <div className="text-sm text-slate-500 mb-1">{l('Пока никого в команде', 'Әзірге командада ешкім жоқ', 'No one in the team yet')}</div>
              <div className="text-xs text-slate-400">{l('Добавьте сотрудников в Настройках → Команда — они появятся здесь со своими задачами.', 'Қызметкерлерді Баптаулар → Команда бөлімінде қосыңыз — олар осында тапсырмаларымен пайда болады.', 'Add employees in Settings → Team — they will appear here with their tasks.')}</div>
            </div>
          )}
          {teamEmployees.map(emp => {
            const empTasks = filteredTasks.filter(t => t.assignee.id === emp.id);
            const empDone = empTasks.filter(t => t.status === 'done').length;
            const isExpanded = expandedEmployee === emp.id;
            return (
              <div key={emp.id} className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 shadow-[0_4px_16px_-8px_rgba(15,23,42,0.10)] rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpandedEmployee(isExpanded ? null : emp.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-sm text-slate-600">{emp.avatar}</div>
                    <div className="text-left">
                      <div className="text-sm text-slate-900">{emp.name}</div>
                      <div className="text-xs text-slate-500">{emp.role} · {emp.telegramUsername}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm text-slate-900">{empDone}/{empTasks.length}</div>
                      <div className="text-xs text-slate-400">{l('задач', 'тапсырма', 'tasks')}</div>
                    </div>
                    <div className="w-20 h-2 bg-white/60 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: empTasks.length > 0 ? `${(empDone / empTasks.length) * 100}%` : '0%' }} />
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-white/60 p-4 space-y-2">
                    {empTasks.length === 0 && <div className="text-sm text-slate-400 text-center py-4">{l('Нет задач', 'Тапсырма жоқ', 'No tasks')}</div>}
                    {empTasks.map(task => {
                      const statusCol = columns.find(c => c.id === task.status)!;
                      const StatusIcon = statusCol.icon;
                      return (
                        <div
                          key={task.id}
                          className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/50 transition-colors cursor-pointer"
                          onClick={() => setSelectedTask(task)}
                        >
                          <div className="flex items-center gap-3">
                            <StatusIcon className={`w-4 h-4 ${statusCol.color}`} />
                            <div>
                              <div className="text-sm text-slate-900">{task.title}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${categoryColor(task.category, taskCategories)}`}>{task.category}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityConfig[task.priority].bg} ${priorityConfig[task.priority].color}`}>{pickLang(priorityConfig[task.priority].label, language)}</span>
                              </div>
                            </div>
                          </div>
                          {task.source === 'telegram' && <Send className="w-3.5 h-3.5 text-[#2AABEE]" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TASK DETAIL MODAL */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          language={language}
          storeEmployees={store.employees}
          onClose={() => setSelectedTask(null)}
          onMoveStatus={(status) => moveTask(selectedTask.id, status)}
          onSave={(updates) => {
            store.updateTask(selectedTask.id, {
              title: updates.title,
              description: updates.description,
              priority: updates.priority,
              category: updates.category,
              assigneeId: updates.assigneeId,
              dueDate: updates.dueDate,
            });
            // Close the modal so the admin doesn't have to dismiss it manually
            // after Save. The board will reload from the store on the next render.
            setSelectedTask(null);
          }}
          onDelete={() => {
            store.deleteTask(selectedTask.id);
            setSelectedTask(null);
          }}
          categories={taskCategories}
          canDelete={canWrite}
        />
      )}

      {/* NEW TASK MODAL */}
      {showNewTaskModal && (
        <NewTaskModal
          employees={teamEmployees}
          language={language}
          categories={taskCategories}
          deals={store.deals.filter(d => d.status !== 'rejected').map(d => ({ id: d.id, customerName: d.customerName, product: d.product }))}
          onClose={() => setShowNewTaskModal(false)}
          onAdd={(task) => {
            store.addTask({
              title: task.title, description: task.description, status: task.status,
              priority: task.priority, assigneeId: task.assignee.id, dueDate: task.dueDate,
              category: task.category, subtasks: task.subtasks || [],
              linkedDealId: task.linkedDealId,
            } as any);
            setShowNewTaskModal(false);
          }}
        />
      )}
      {showBotSettings && <TelegramBotPanel language={language} onClose={() => setShowBotSettings(false)} />}
      {showImport && (
        <CsvImportModal
          language={language}
          title={l('Задачи', 'Тапсырмалар', 'Tasks')}
          fields={(() => {
            const f: CsvFieldSpec[] = [
              { key: 'title',       headers: ['Название', 'Title'], required: true },
              { key: 'description', headers: ['Описание', 'Description'] },
              { key: 'category',    headers: ['Категория', 'Category'] },
              { key: 'priority',    headers: ['Приоритет', 'Priority'] },
              { key: 'status',      headers: ['Статус', 'Status'] },
              { key: 'dueDate',     headers: ['Срок', 'Due'] },
              { key: 'assignee',    headers: ['Исполнитель', 'Assignee'] }, // matched by name
            ];
            return f;
          })()}
          onImport={async (rec) => {
            // Resolve assignee name → employees.id (case-insensitive contains).
            let assigneeId = '';
            if (rec.assignee) {
              const lookup = (rec.assignee as string).toLowerCase();
              const emp = store.employees.find(e => e.name.toLowerCase().includes(lookup));
              if (emp) assigneeId = emp.id;
            }
            store.addTask({
              title: String(rec.title),
              description: String(rec.description || ''),
              status: (rec.status || 'new') as StoreTask['status'],
              priority: (rec.priority || 'medium') as StoreTask['priority'],
              assigneeId,
              dueDate: String(rec.dueDate || new Date().toISOString().slice(0, 10)),
              category: String(rec.category || 'Прочее'),
              subtasks: [],
            });
          }}
          onClose={() => { setShowImport(false); store.reloadAll(); }}
        />
      )}
    </div>
    </div>
  );
}

// ─── TASK CARD ───────────────────────────────────────────────
function TaskCard({ task, categories, language, onClick, onMove }: { task: Task; categories: string[]; language: 'kz' | 'ru' | 'eng'; onClick: () => void; onMove: (id: string, status: Task['status']) => void }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const next = task.status === 'new' ? 'in_progress' : task.status === 'in_progress' ? 'review' : task.status === 'review' ? 'done' : null;
  const subtasksDone = task.subtasks?.filter(s => s.done).length || 0;
  const subtasksTotal = task.subtasks?.length || 0;
  // Overdue = past due date and not done. Surfaced as a red due-date chip
  // so the board reads urgency at a glance.
  const todayISO = new Date().toISOString().slice(0, 10);
  const isOverdue = !!task.dueDate && task.dueDate < todayISO && task.status !== 'done';
  const isDueToday = task.dueDate === todayISO && task.status !== 'done';

  return (
    <div
      className={`bg-white/55 backdrop-blur-2xl ring-1 shadow-[0_4px_16px_-8px_rgba(15,23,42,0.10)] rounded-2xl p-3 hover:shadow-md transition-shadow cursor-pointer group ${
        isOverdue ? 'ring-rose-200/70' : 'ring-white/60'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${categoryColor(task.category, categories)}`}>{task.category}</span>
          {task.priority === 'urgent' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">{l('Срочно', 'Шұғыл', 'Urgent')}</span>}
          {task.priority === 'high' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600">{l('Высокий', 'Жоғары', 'High')}</span>}
        </div>
        {task.source === 'telegram' && <Send className="w-3 h-3 text-[#2AABEE]" />}
      </div>

      <div className="text-sm text-slate-900 mb-2">{task.title}</div>

      {/* Due-date chip — red when overdue, amber when due today */}
      {task.dueDate && (
        <div className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full mb-2 ${
          isOverdue ? 'bg-rose-100 text-rose-700' : isDueToday ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
        }`}>
          <Calendar className="w-2.5 h-2.5" />
          {isOverdue ? l('Просрочено · ', 'Мерзімі өтті · ', 'Overdue · ') : isDueToday ? l('Сегодня · ', 'Бүгін · ', 'Today · ') : ''}{task.dueDate}
        </div>
      )}

      {subtasksTotal > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-400">{subtasksDone}/{subtasksTotal}</span>
          </div>
          <div className="w-full h-1 bg-white/60 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(subtasksDone / subtasksTotal) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 bg-slate-200 rounded-full flex items-center justify-center text-[8px] text-slate-600">{task.assignee.avatar}</div>
          <span className="text-[10px] text-slate-500">{task.assignee.name.split(' ')[0]}</span>
        </div>
        {next && (
          // Always visible (was opacity-0 hover-only → invisible/unusable
          // on touch). Shows the next-stage label so it's clear what tap
          // does. Drag-drop is a future enhancement; this works everywhere.
          <button
            onClick={(e) => { e.stopPropagation(); onMove(task.id, next as Task['status']); }}
            className="text-[10px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg flex items-center gap-0.5 transition-colors"
            title={l('Передвинуть на следующий этап', 'Келесі кезеңге жылжыту', 'Move to the next stage')}
          >
            {next === 'in_progress' ? l('В работу', 'Жұмысқа', 'Start') : next === 'review' ? l('На проверку', 'Тексеруге', 'To review') : l('Готово', 'Дайын', 'Done')}
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── NEW TASK MODAL ──────────────────────────────────────────
function NewTaskModal({ employees, categories, language, deals, onClose, onAdd }: {
  employees: Employee[];
  categories: string[];
  language: 'kz' | 'ru' | 'eng';
  deals: Array<{ id: string; customerName: string; product: string }>;
  onClose: () => void;
  onAdd: (task: Task) => void;
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // If no team yet, default assigneeId to '' (unassigned).
  const [assigneeId, setAssigneeId] = useState(employees[0]?.id ?? '');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [category, setCategory] = useState(categories[0] || 'Прочее');
  // Default due date = today (was hardcoded to a past literal 2026-04-03).
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [linkedDealId, setLinkedDealId] = useState('');

  const handleSubmit = () => {
    if (!title.trim()) return;
    const assignee = employees.find(e => e.id === assigneeId) || UNASSIGNED;
    const task: Task = {
      id: `t${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      status: 'new',
      priority,
      assignee,
      createdAt: new Date().toISOString(),
      dueDate,
      source: 'platform',
      telegramConfirmed: false,
      category,
      linkedDealId: linkedDealId || undefined,
    };
    onAdd(task);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white/85 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl w-full max-w-md shadow-[0_24px_64px_-12px_var(--accent-shadow-sm)]" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-white/60 flex items-center justify-between">
          <h2 className="text-slate-900">{l('Новая задача', 'Жаңа тапсырма', 'New task')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">{l('Название задачи *', 'Тапсырма атауы *', 'Task title *')}</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={l('Например: Выезд на замер — ул. Абая 12', 'Мысалы: Өлшеуге шығу — Абай к-сі 12', 'For example: Site measurement — 12 Abay St.')}
              className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">{l('Описание', 'Сипаттама', 'Description')}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder={l('Подробности задачи...', 'Тапсырма мәліметтері...', 'Task details...')}
              className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{l('Исполнитель', 'Орындаушы', 'Assignee')}</label>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all">
                <option value="">{l('Не назначен', 'Тағайындалмаған', 'Unassigned')}</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{l('Приоритет', 'Басымдық', 'Priority')}</label>
              <select value={priority} onChange={e => setPriority(e.target.value as Task['priority'])} className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all">
                <option value="low">{l('Низкий', 'Төмен', 'Low')}</option>
                <option value="medium">{l('Средний', 'Орташа', 'Medium')}</option>
                <option value="high">{l('Высокий', 'Жоғары', 'High')}</option>
                <option value="urgent">{l('Срочно', 'Шұғыл', 'Urgent')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{l('Категория', 'Санат', 'Category')}</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{l('Срок', 'Мерзім', 'Due')}</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all tabular-nums"
              />
            </div>
          </div>
          {/* Link to a deal — feeds the «Связи» tab on the deal card so
              the task shows up there. Optional. */}
          {deals.length > 0 && (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{l('Связать со сделкой', 'Мәмілеге байланыстыру', 'Link to a deal')}</label>
              <select value={linkedDealId} onChange={e => setLinkedDealId(e.target.value)} className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all">
                <option value="">{l('— без привязки —', '— байланыссыз —', '— no link —')}</option>
                {deals.map(d => <option key={d.id} value={d.id}>{d.customerName}{d.product ? ` · ${d.product}` : ''}</option>)}
              </select>
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {l('Создать задачу', 'Тапсырма жасау', 'Create task')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TASK DETAIL MODAL (editable) ────────────────────────────
interface TaskUpdates {
  title: string;
  description: string;
  priority: Task['priority'];
  category: string;
  assigneeId: string;
  dueDate: string;
}

function TaskDetailModal({
  task,
  storeEmployees,
  categories,
  language,
  canDelete,
  onClose,
  onMoveStatus,
  onSave,
  onDelete,
}: {
  task: Task;
  storeEmployees: { id: string; name: string }[];
  categories: string[];
  language: 'kz' | 'ru' | 'eng';
  canDelete: boolean;
  onClose: () => void;
  onMoveStatus: (s: Task['status']) => void;
  onSave: (u: TaskUpdates) => void;
  onDelete: () => void;
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  // Local edit state — initialized from task and reset when a different task is opened.
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<Task['priority']>(task.priority);
  const [category, setCategory] = useState(task.category);
  const [assigneeId, setAssigneeId] = useState(task.assignee.id);
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setCategory(task.category);
    setAssigneeId(task.assignee.id);
    setDueDate(task.dueDate || '');
    setConfirmDelete(false);
  }, [task.id]);

  const dirty =
    title !== task.title ||
    description !== task.description ||
    priority !== task.priority ||
    category !== task.category ||
    assigneeId !== task.assignee.id ||
    (dueDate || '') !== (task.dueDate || '');

  // Category options: niche-derived + current value if it's not in the list (so AI-generated
  // categories like "Прочее" still appear and are editable).
  const categoryOptions = Array.from(new Set([...categories, 'Прочее', category])).filter(Boolean);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim(),
      priority,
      category,
      assigneeId,
      dueDate,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white/85 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-[0_24px_64px_-12px_var(--accent-shadow-sm)]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-white/60">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColor(category, categoryOptions)}`}>{category}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${priorityConfig[priority].bg} ${priorityConfig[priority].color}`}>
                  {pickLang(priorityConfig[priority].label, language)}
                </span>
                {task.source === 'telegram' && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-[#2AABEE] bg-blue-50 px-2 py-0.5 rounded-full">
                    <Send className="w-3 h-3" /> Telegram
                  </span>
                )}
              </div>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={l('Название задачи', 'Тапсырма атауы', 'Task title')}
                className="w-full text-slate-900 text-base bg-transparent border-0 border-b border-transparent hover:border-slate-200 focus:border-slate-300 focus:outline-none px-0 py-0.5"
              />
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Description */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">{l('Описание', 'Сипаттама', 'Description')}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder={l('Подробности задачи…', 'Тапсырма мәліметтері…', 'Task details…')}
              className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all resize-none"
            />
          </div>

          {/* Assignee + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{l('Исполнитель', 'Орындаушы', 'Assignee')}</label>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all"
              >
                {/* Keep current assignee even if it's not in the store list (e.g. placeholder ids). */}
                {!storeEmployees.find(e => e.id === assigneeId) && (
                  <option value={assigneeId}>{task.assignee.name || '—'}</option>
                )}
                {storeEmployees.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{l('Приоритет', 'Басымдық', 'Priority')}</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as Task['priority'])}
                className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all"
              >
                <option value="low">{l('Низкий', 'Төмен', 'Low')}</option>
                <option value="medium">{l('Средний', 'Орташа', 'Medium')}</option>
                <option value="high">{l('Высокий', 'Жоғары', 'High')}</option>
                <option value="urgent">{l('Срочно', 'Шұғыл', 'Urgent')}</option>
              </select>
            </div>
          </div>

          {/* Category + Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{l('Категория', 'Санат', 'Category')}</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all"
              >
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{l('Срок', 'Мерзім', 'Due')}</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 transition-all"
              />
            </div>
          </div>

          {/* Status flow */}
          <div>
            <label className="text-xs text-slate-500 mb-2 block">{l('Статус', 'Күй', 'Status')}</label>
            <div className="flex items-center gap-1 flex-wrap">
              {columns.map((col, i) => {
                const isActive = col.id === task.status;
                const isPast = columns.findIndex(c => c.id === task.status) > i;
                const Icon = col.icon;
                return (
                  <div key={col.id} className="flex items-center gap-1">
                    <button
                      onClick={() => onMoveStatus(col.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        isActive ? `${col.bg} ${col.color} border ${col.border}` :
                        isPast ? 'bg-green-50 text-green-600' :
                        'bg-white/50 text-slate-400 hover:bg-white/70'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {pickLang(col.title, language)}
                    </button>
                    {i < columns.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Subtasks (read-only — separate editor would be a bigger feature) */}
          {task.subtasks && task.subtasks.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-2">{l('Подзадачи', 'Ішкі тапсырмалар', 'Subtasks')} ({task.subtasks.filter(s => s.done).length}/{task.subtasks.length})</div>
              <div className="space-y-1.5">
                {task.subtasks.map(sub => (
                  <div key={sub.id} className="flex items-center gap-2 py-1">
                    {sub.done ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4 text-slate-300" />}
                    <span className={`text-sm ${sub.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{sub.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completion note (read-only, from Telegram) */}
          {task.completionNote && (
            <div className="bg-green-50 rounded-lg p-3 border border-green-100">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-xs text-green-700">{l('Отчёт о выполнении (через Telegram)', 'Орындалу туралы есеп (Telegram арқылы)', 'Completion report (via Telegram)')}</span>
              </div>
              <p className="text-sm text-green-800">{task.completionNote}</p>
            </div>
          )}

          {/* Created / completed dates */}
          <div className="flex items-center gap-6 text-xs text-slate-500 flex-wrap">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {l('Создано', 'Жасалды', 'Created')}: {new Date(task.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </div>
            {task.completedAt && (
              <div className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-green-500" />
                {l('Выполнено', 'Орындалды', 'Completed')}: {new Date(task.completedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/60">
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={!dirty || !title.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                {l('Сохранить', 'Сақтау', 'Save')}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 bg-white/60 ring-1 ring-white/60 text-slate-700 rounded-2xl text-sm hover:bg-white transition-colors"
              >
                {l('Отмена', 'Болдырмау', 'Cancel')}
              </button>
            </div>
            {/* Delete is gated — a restricted/view-only role can edit
                task status but can't permanently destroy a task. */}
            {canDelete && (confirmDelete ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                <span className="text-xs text-red-700 flex-1">{l('Удалить задачу безвозвратно?', 'Тапсырманы біржола жою керек пе?', 'Delete this task permanently?')}</span>
                <button
                  onClick={onDelete}
                  className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors"
                >
                  {l('Да, удалить', 'Иә, жою', 'Yes, delete')}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1 text-slate-600 rounded text-xs hover:bg-white transition-colors"
                >
                  {l('Отмена', 'Болдырмау', 'Cancel')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                {l('Удалить задачу', 'Тапсырманы жою', 'Delete task')}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}