import { useState } from 'react';
import {
  CheckCircle2, Circle, Clock, AlertCircle, Plus, Search, Filter,
  ChevronDown, ChevronRight, MoreHorizontal, Calendar, User, Send,
  MessageCircle, X, GripVertical, ArrowRight, Bot, Smartphone,
  Check, RefreshCw, Eye, Trash2, Edit3, Flag
} from 'lucide-react';
import { useDataStore, Task as StoreTask } from '../utils/dataStore';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { TelegramBotPanel } from './TelegramBotPanel';

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

// Placeholder team slots — real names + telegramConnected flip to true once Block C.2 invitations
// and Block F Telegram-bot pairing are wired. Kept non-empty so legacy hardcoded tasks below
// still have valid `assignee` references at render time.
const employees: Employee[] = [
  { id: 'e1', name: '—', role: '—', avatar: '?', telegramUsername: '', telegramConnected: false, tasksToday: 0, tasksDone: 0 },
  { id: 'e2', name: '—', role: '—', avatar: '?', telegramUsername: '', telegramConnected: false, tasksToday: 0, tasksDone: 0 },
  { id: 'e3', name: '—', role: '—', avatar: '?', telegramUsername: '', telegramConnected: false, tasksToday: 0, tasksDone: 0 },
  { id: 'e4', name: '—', role: '—', avatar: '?', telegramUsername: '', telegramConnected: false, tasksToday: 0, tasksDone: 0 },
];

const columns = [
  { id: 'new' as const, title: 'Новые', icon: Circle, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
  { id: 'in_progress' as const, title: 'В работе', icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  { id: 'review' as const, title: 'На проверке', icon: Eye, color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
  { id: 'done' as const, title: 'Выполнено', icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50', border: 'border-green-200' },
];

const priorityConfig: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'Низкий', color: 'text-gray-500', bg: 'bg-gray-100' },
  medium: { label: 'Средний', color: 'text-blue-600', bg: 'bg-blue-50' },
  high: { label: 'Высокий', color: 'text-orange-600', bg: 'bg-orange-50' },
  urgent: { label: 'Срочно', color: 'text-red-600', bg: 'bg-red-50' },
};

const categoryColors: Record<string, string> = {
  'Замер': 'bg-cyan-100 text-cyan-700',
  'Сборка': 'bg-amber-100 text-amber-700',
  'Дизайн': 'bg-violet-100 text-violet-700',
  'Продажи': 'bg-emerald-100 text-emerald-700',
  'Закупки': 'bg-rose-100 text-rose-700',
  'Монтаж': 'bg-indigo-100 text-indigo-700',
  'Маркетинг': 'bg-pink-100 text-pink-700',
};

interface TasksProps {
  language: 'kz' | 'ru' | 'eng';
}

type ViewMode = 'board' | 'list' | 'employees';

export function Tasks({ language }: TasksProps) {
  const store = useDataStore();
  // Poll backend every 15s so tasks created via Telegram bot show up without manual reload.
  useAutoRefresh(store.reloadAll, 15000);

  // Map store tasks to local Task format
  const mapStoreTask = (st: StoreTask): Task => {
    const emp = store.getEmployeeById(st.assigneeId);
    return {
      id: st.id, title: st.title, description: st.description, status: st.status, priority: st.priority,
      assignee: emp ? { id: emp.id, name: emp.name, role: emp.department, avatar: emp.avatar, telegramUsername: '@' + emp.name.split(' ')[0].toLowerCase(), telegramConnected: emp.status === 'active', tasksToday: store.tasks.filter(t => t.assigneeId === emp.id).length, tasksDone: store.tasks.filter(t => t.assigneeId === emp.id && t.status === 'done').length } : employees[0],
      createdAt: st.createdAt, dueDate: st.dueDate, completedAt: st.completedAt,
      source: 'telegram', telegramConfirmed: true, completionNote: st.completionNote,
      category: st.category, subtasks: st.subtasks, linkedDealId: st.linkedDealId,
    };
  };

  const tasks = store.tasks.map(mapStoreTask);
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showTelegramPanel, setShowTelegramPanel] = useState(false);
  const [showBotSettings, setShowBotSettings] = useState(false);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const filteredTasks = tasks.filter(t => {
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase()) && !t.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterEmployee !== 'all' && t.assignee.id !== filterEmployee) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    return true;
  });

  const todayTasks = filteredTasks.filter(t => t.dueDate === today);
  const stats = {
    total: todayTasks.length,
    done: todayTasks.filter(t => t.status === 'done').length,
    inProgress: todayTasks.filter(t => t.status === 'in_progress').length,
    review: todayTasks.filter(t => t.status === 'review').length,
    newCount: todayTasks.filter(t => t.status === 'new').length,
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

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="mb-1">Задачи</h1>
          <p className="text-sm text-gray-500">Ежедневные задачи сотрудников через Telegram-бот</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowTelegramPanel(!showTelegramPanel)}
            className="flex items-center gap-2 px-3 py-2 bg-[#2AABEE] text-white rounded-lg text-sm hover:bg-[#229ED9] transition-colors"
          >
            <Send className="w-4 h-4" />
            Telegram-бот
          </button>
          <button
            onClick={() => setShowNewTaskModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Новая задача
          </button>
        </div>
      </div>

      {/* Telegram Bot Panel — minimalist, honest empty state until Block F wires the real bot */}
      {showTelegramPanel && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#2AABEE]/10 rounded-xl flex items-center justify-center">
                <Bot className="w-5 h-5 text-[#2AABEE]" />
              </div>
              <div>
                <div className="text-sm text-gray-900">Telegram-бот платформы</div>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                  <span className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
                  Не подключён
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowBotSettings(true)} className="px-3 py-1.5 border border-gray-100 text-gray-700 rounded-lg text-xs hover:bg-gray-50">Настройки</button>
              <button onClick={() => setShowTelegramPanel(false)} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center hover:bg-gray-100">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Body — 2 clean sections */}
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* How it will work */}
            <section>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">Как это будет работать</div>
              <ol className="space-y-2.5">
                {[
                  'Сотрудник пишет боту свои задачи на день',
                  'Бот форматирует список и просит подтверждения',
                  'Сотрудник подтверждает — задачи попадают на платформу',
                  'По завершении сотрудник пишет отчёт боту',
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-gray-600">
                    <span className="w-5 h-5 flex-shrink-0 rounded-md bg-gray-50 text-gray-500 text-[10px] flex items-center justify-center tabular-nums">{i + 1}</span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            {/* Connected employees — empty state */}
            <section>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">Подключённые сотрудники</div>
              <div className="bg-gray-50 rounded-xl p-6 text-center">
                <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-white border border-gray-100 flex items-center justify-center">
                  <Send className="w-4 h-4 text-gray-300" />
                </div>
                <div className="text-xs text-gray-700 mb-1">Пока никто не подключён</div>
                <div className="text-[11px] text-gray-400 leading-relaxed max-w-[260px] mx-auto">
                  Сотрудники появятся здесь после того, как Админ настроит Telegram-бот и пригласит команду.
                </div>
              </div>
            </section>
          </div>

          {/* Footer hint */}
          <div className="px-5 py-3 border-t border-gray-50 text-[11px] text-gray-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
            Полная интеграция Telegram-бота — в следующем обновлении. Сейчас задачи добавляются вручную.
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Всего на сегодня</div>
          <div className="text-2xl text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-blue-500 mb-1">Новые</div>
          <div className="text-2xl text-gray-900">{stats.newCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-yellow-500 mb-1">В работе</div>
          <div className="text-2xl text-gray-900">{stats.inProgress}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-purple-500 mb-1">На проверке</div>
          <div className="text-2xl text-gray-900">{stats.review}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-green-500 mb-1">Выполнено</div>
          <div className="text-2xl text-gray-900">{stats.done}</div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: stats.total > 0 ? `${(stats.done / stats.total) * 100}%` : '0%' }} />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            {([
              { key: 'board' as ViewMode, label: 'Доска' },
              { key: 'list' as ViewMode, label: 'Список' },
              { key: 'employees' as ViewMode, label: 'Сотрудники' },
            ]).map(v => (
              <button
                key={v.key}
                onClick={() => setViewMode(v.key)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${viewMode === v.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <select
            value={filterEmployee}
            onChange={e => setFilterEmployee(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
          >
            <option value="all">Все сотрудники</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>

          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
          >
            <option value="all">Все приоритеты</option>
            <option value="urgent">Срочно</option>
            <option value="high">Высокий</option>
            <option value="medium">Средний</option>
            <option value="low">Низкий</option>
          </select>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск задач..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>
      </div>

      {/* BOARD VIEW */}
      {viewMode === 'board' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {columns.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.id);
            const Icon = col.icon;
            return (
              <div key={col.id} className="min-h-[200px]">
                <div className={`flex items-center gap-2 mb-3 px-1`}>
                  <Icon className={`w-4 h-4 ${col.color}`} />
                  <span className="text-sm text-gray-700">{col.title}</span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded ml-1">{colTasks.length}</span>
                </div>
                <div className="space-y-3">
                  {colTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="px-4 py-3 text-left text-xs text-gray-500">Задача</th>
                <th className="px-3 py-3 text-left text-xs text-gray-500">Категория</th>
                <th className="px-3 py-3 text-left text-xs text-gray-500">Исполнитель</th>
                <th className="px-3 py-3 text-left text-xs text-gray-500">Приоритет</th>
                <th className="px-3 py-3 text-left text-xs text-gray-500">Статус</th>
                <th className="px-3 py-3 text-left text-xs text-gray-500">Источник</th>
                <th className="px-3 py-3 text-left text-xs text-gray-500">Срок</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTasks.map(task => {
                const pr = priorityConfig[task.priority];
                return (
                  <tr key={task.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => setSelectedTask(task)}>
                    <td className="px-4 py-3">
                      <div className="text-gray-900">{task.title}</div>
                      <div className="text-xs text-gray-400 truncate max-w-[250px]">{task.description}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[task.category] || 'bg-gray-100 text-gray-600'}`}>{task.category}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-[10px] text-gray-600">{task.assignee.avatar}</div>
                        <span className="text-xs text-gray-700">{task.assignee.name.split(' ')[0]}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${pr.bg} ${pr.color}`}>{pr.label}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        task.status === 'done' ? 'bg-green-50 text-green-700' :
                        task.status === 'review' ? 'bg-purple-50 text-purple-700' :
                        task.status === 'in_progress' ? 'bg-yellow-50 text-yellow-700' :
                        'bg-blue-50 text-blue-700'
                      }`}>
                        {columns.find(c => c.id === task.status)?.title}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {task.source === 'telegram' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#2AABEE]">
                          <Send className="w-3 h-3" /> Telegram
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                          <Smartphone className="w-3 h-3" /> Платформа
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{task.dueDate === today ? 'Сегодня' : task.dueDate}</td>
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
          {employees.filter(e => e.telegramConnected).map(emp => {
            const empTasks = filteredTasks.filter(t => t.assignee.id === emp.id);
            const empDone = empTasks.filter(t => t.status === 'done').length;
            const isExpanded = expandedEmployee === emp.id;
            return (
              <div key={emp.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setExpandedEmployee(isExpanded ? null : emp.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-sm text-gray-600">{emp.avatar}</div>
                    <div className="text-left">
                      <div className="text-sm text-gray-900">{emp.name}</div>
                      <div className="text-xs text-gray-500">{emp.role} · {emp.telegramUsername}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm text-gray-900">{empDone}/{empTasks.length}</div>
                      <div className="text-xs text-gray-400">задач</div>
                    </div>
                    <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: empTasks.length > 0 ? `${(empDone / empTasks.length) * 100}%` : '0%' }} />
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 space-y-2">
                    {empTasks.length === 0 && <div className="text-sm text-gray-400 text-center py-4">Нет задач</div>}
                    {empTasks.map(task => {
                      const statusCol = columns.find(c => c.id === task.status)!;
                      const StatusIcon = statusCol.icon;
                      return (
                        <div
                          key={task.id}
                          className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => setSelectedTask(task)}
                        >
                          <div className="flex items-center gap-3">
                            <StatusIcon className={`w-4 h-4 ${statusCol.color}`} />
                            <div>
                              <div className="text-sm text-gray-900">{task.title}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${categoryColors[task.category] || 'bg-gray-100 text-gray-600'}`}>{task.category}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityConfig[task.priority].bg} ${priorityConfig[task.priority].color}`}>{priorityConfig[task.priority].label}</span>
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedTask(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[selectedTask.category] || 'bg-gray-100 text-gray-600'}`}>{selectedTask.category}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${priorityConfig[selectedTask.priority].bg} ${priorityConfig[selectedTask.priority].color}`}>
                      {priorityConfig[selectedTask.priority].label}
                    </span>
                    {selectedTask.source === 'telegram' && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#2AABEE] bg-blue-50 px-2 py-0.5 rounded-full">
                        <Send className="w-3 h-3" /> Telegram
                      </span>
                    )}
                  </div>
                  <h2 className="text-gray-900 mb-1">{selectedTask.title}</h2>
                </div>
                <button onClick={() => setSelectedTask(null)} className="text-gray-400 hover:text-gray-600 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Description */}
              <div>
                <div className="text-xs text-gray-500 mb-1">Описание</div>
                <p className="text-sm text-gray-700">{selectedTask.description}</p>
              </div>

              {/* Assignee */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs text-gray-600">{selectedTask.assignee.avatar}</div>
                <div>
                  <div className="text-sm text-gray-900">{selectedTask.assignee.name}</div>
                  <div className="text-xs text-gray-500">{selectedTask.assignee.role} · {selectedTask.assignee.telegramUsername}</div>
                </div>
              </div>

              {/* Status flow */}
              <div>
                <div className="text-xs text-gray-500 mb-2">Статус</div>
                <div className="flex items-center gap-1">
                  {columns.map((col, i) => {
                    const isActive = col.id === selectedTask.status;
                    const isPast = columns.findIndex(c => c.id === selectedTask.status) > i;
                    const Icon = col.icon;
                    return (
                      <div key={col.id} className="flex items-center gap-1">
                        <button
                          onClick={() => moveTask(selectedTask.id, col.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                            isActive ? `${col.bg} ${col.color} border ${col.border}` :
                            isPast ? 'bg-green-50 text-green-600' :
                            'bg-gray-50 text-gray-400 hover:bg-gray-100'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {col.title}
                        </button>
                        {i < columns.length - 1 && <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Subtasks */}
              {selectedTask.subtasks && selectedTask.subtasks.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 mb-2">Подзадачи ({selectedTask.subtasks.filter(s => s.done).length}/{selectedTask.subtasks.length})</div>
                  <div className="space-y-1.5">
                    {selectedTask.subtasks.map(sub => (
                      <div key={sub.id} className="flex items-center gap-2 py-1">
                        {sub.done ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        )}
                        <span className={`text-sm ${sub.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{sub.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Completion note */}
              {selectedTask.completionNote && (
                <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-green-700">Отчёт о выполнении (через Telegram)</span>
                  </div>
                  <p className="text-sm text-green-800">{selectedTask.completionNote}</p>
                </div>
              )}

              {/* Dates */}
              <div className="flex items-center gap-6 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Создано: {new Date(selectedTask.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
                {selectedTask.completedAt && (
                  <div className="flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-green-500" />
                    Выполнено: {new Date(selectedTask.completedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {selectedTask.status !== 'done' && (
                <div className="flex gap-2 pt-2">
                  {getNextStatus(selectedTask.status) && (
                    <button
                      onClick={() => {
                        const next = getNextStatus(selectedTask.status);
                        if (next) moveTask(selectedTask.id, next);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors"
                    >
                      <ArrowRight className="w-4 h-4" />
                      {selectedTask.status === 'new' ? 'Начать' : selectedTask.status === 'in_progress' ? 'На проверку' : 'Завершить'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NEW TASK MODAL */}
      {showNewTaskModal && (
        <NewTaskModal
          employees={employees}
          onClose={() => setShowNewTaskModal(false)}
          onAdd={(task) => {
            store.addTask({
              title: task.title, description: task.description, status: task.status,
              priority: task.priority, assigneeId: task.assignee.id, dueDate: task.dueDate,
              category: task.category, subtasks: task.subtasks || [],
            });
            setShowNewTaskModal(false);
          }}
        />
      )}
      {showBotSettings && <TelegramBotPanel language={language} onClose={() => setShowBotSettings(false)} />}
    </div>
  );
}

// ─── TASK CARD ───────────────────────────────────────────────
function TaskCard({ task, onClick, onMove }: { task: Task; onClick: () => void; onMove: (id: string, status: Task['status']) => void }) {
  const pr = priorityConfig[task.priority];
  const next = task.status === 'new' ? 'in_progress' : task.status === 'in_progress' ? 'review' : task.status === 'review' ? 'done' : null;
  const subtasksDone = task.subtasks?.filter(s => s.done).length || 0;
  const subtasksTotal = task.subtasks?.length || 0;

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-3 hover:shadow-md transition-shadow cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${categoryColors[task.category] || 'bg-gray-100 text-gray-600'}`}>{task.category}</span>
          {task.priority === 'urgent' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">Срочно</span>}
          {task.priority === 'high' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600">Высокий</span>}
        </div>
        {task.source === 'telegram' && <Send className="w-3 h-3 text-[#2AABEE]" />}
      </div>

      <div className="text-sm text-gray-900 mb-2">{task.title}</div>

      {subtasksTotal > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400">{subtasksDone}/{subtasksTotal}</span>
          </div>
          <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(subtasksDone / subtasksTotal) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 bg-gray-200 rounded-full flex items-center justify-center text-[8px] text-gray-600">{task.assignee.avatar}</div>
          <span className="text-[10px] text-gray-500">{task.assignee.name.split(' ')[0]}</span>
        </div>
        {next && (
          <button
            onClick={(e) => { e.stopPropagation(); onMove(task.id, next as Task['status']); }}
            className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-400 hover:text-gray-700 flex items-center gap-0.5 transition-opacity"
          >
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── NEW TASK MODAL ──────────────────────────────────────────
function NewTaskModal({ employees, onClose, onAdd }: { employees: Employee[]; onClose: () => void; onAdd: (task: Task) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState(employees[0].id);
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [category, setCategory] = useState('Замер');

  const handleSubmit = () => {
    if (!title.trim()) return;
    const assignee = employees.find(e => e.id === assigneeId) || employees[0];
    const task: Task = {
      id: `t${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      status: 'new',
      priority,
      assignee,
      createdAt: new Date().toISOString(),
      dueDate: '2026-04-03',
      source: 'platform',
      telegramConfirmed: false,
      category,
    };
    onAdd(task);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-gray-900">Новая задача</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Название задачи *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Например: Замер кухни — ул. Абая"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Описание</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Подробности задачи..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Исполнитель</label>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-200">
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Приоритет</label>
              <select value={priority} onChange={e => setPriority(e.target.value as Task['priority'])} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-200">
                <option value="low">Низкий</option>
                <option value="medium">Средний</option>
                <option value="high">Высокий</option>
                <option value="urgent">Срочно</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Категория</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-200">
              {Object.keys(categoryColors).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Создать задачу
          </button>
        </div>
      </div>
    </div>
  );
}