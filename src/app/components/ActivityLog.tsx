import { useMemo, useState } from 'react';
import { Search, Download, Plus, Edit2, Trash2, LogIn, LogOut, Shield, Settings as SettingsIcon, Sparkles, BookOpen } from 'lucide-react';
import { useDataStore, type ActivityType, type ActivityLog as ActivityLogEntry } from '../utils/dataStore';
import { t } from '../utils/translations';

interface Props {
  language: 'kz' | 'ru' | 'eng';
}

const TYPE_META: Record<ActivityType, { ru: string; kz: string; eng: string; icon: any; bg: string; fg: string }> = {
  create:     { ru: 'Создание',     kz: 'Жасау',         eng: 'Create',      icon: Plus,         bg: 'bg-green-50',  fg: 'text-green-600' },
  update:     { ru: 'Изменение',    kz: 'Өзгерту',       eng: 'Update',      icon: Edit2,        bg: 'bg-blue-50',   fg: 'text-blue-600' },
  delete:     { ru: 'Удаление',     kz: 'Жою',           eng: 'Delete',      icon: Trash2,       bg: 'bg-red-50',    fg: 'text-red-500' },
  login:      { ru: 'Вход',         kz: 'Кіру',          eng: 'Login',       icon: LogIn,        bg: 'bg-emerald-50',fg: 'text-emerald-600' },
  logout:     { ru: 'Выход',        kz: 'Шығу',          eng: 'Logout',      icon: LogOut,       bg: 'bg-gray-100',  fg: 'text-gray-500' },
  invite:     { ru: 'Приглашение',  kz: 'Шақыру',        eng: 'Invite',      icon: Sparkles,     bg: 'bg-amber-50',  fg: 'text-amber-700' },
  permission: { ru: 'Права',        kz: 'Құқықтар',      eng: 'Permissions', icon: Shield,       bg: 'bg-purple-50', fg: 'text-purple-600' },
  settings:   { ru: 'Настройки',    kz: 'Баптаулар',     eng: 'Settings',    icon: SettingsIcon, bg: 'bg-gray-100',  fg: 'text-gray-600' },
  ai:         { ru: 'AI-ассистент', kz: 'AI-көмекші',    eng: 'AI assistant',icon: Sparkles,     bg: 'bg-violet-50', fg: 'text-violet-600' },
};

const MODULE_OPTIONS: { value: string; ru: string; kz: string; eng: string }[] = [
  { value: 'all',       ru: 'Все модули',     kz: 'Барлық модуль',  eng: 'All modules' },
  { value: 'auth',      ru: 'Авторизация',    kz: 'Авторизация',    eng: 'Auth' },
  { value: 'sales',     ru: 'Заказы',         kz: 'Тапсырыстар',    eng: 'Orders' },
  { value: 'finance',   ru: 'Финансы',        kz: 'Қаржы',          eng: 'Finance' },
  { value: 'tasks',     ru: 'Задачи',         kz: 'Тапсырмалар',    eng: 'Tasks' },
  { value: 'warehouse', ru: 'Производство',   kz: 'Өндіріс',        eng: 'Production' },
  { value: 'analytics', ru: 'Аналитика',      kz: 'Аналитика',      eng: 'Analytics' },
  { value: 'chats',     ru: 'Чаты',           kz: 'Чаттар',         eng: 'Chats' },
  { value: 'settings',  ru: 'Настройки',      kz: 'Баптаулар',      eng: 'Settings' },
  { value: 'catalog',   ru: 'Справочники',    kz: 'Анықтамалықтар', eng: 'Catalogs' },
  { value: 'roles',     ru: 'Роли',           kz: 'Рөлдер',         eng: 'Roles' },
  { value: 'team',      ru: 'Команда',        kz: 'Команда',        eng: 'Team' },
  { value: 'ai',        ru: 'AI',             kz: 'AI',             eng: 'AI' },
];

function formatDateTime(iso: string, language: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(language === 'eng' ? 'en-GB' : 'ru-RU', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return iso; }
}

function toCSV(rows: ActivityLogEntry[]): string {
  const header = ['timestamp', 'user', 'actor', 'type', 'page', 'action', 'target', 'before', 'after'];
  const esc = (v: any) => {
    const s = v == null ? '' : String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([r.timestamp, r.user, r.actor || 'human', r.type, r.page || '', r.action, r.target, r.before || '', r.after || ''].map(esc).join(','));
  }
  // UTF-8 BOM so Excel detects encoding correctly when opening directly.
  return '﻿' + lines.join('\r\n');
}

export function ActivityLog({ language }: Props) {
  const store = useDataStore();
  const logs = store.activityLogs;
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const tt = (key: Parameters<typeof t>[0]) => t(key, language);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | ActivityType>('all');
  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<'all' | string>('all');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');

  // Unique user list — derived from current logs.
  const users = useMemo(() => Array.from(new Set(logs.map(l => l.user))).sort(), [logs]);

  const filtered = useMemo(() => {
    const fromTs = filterFrom ? new Date(filterFrom + 'T00:00:00').getTime() : 0;
    const toTs = filterTo ? new Date(filterTo + 'T23:59:59').getTime() : Number.MAX_SAFE_INTEGER;
    const q = search.trim().toLowerCase();
    return logs.filter(log => {
      if (filterType !== 'all' && log.type !== filterType) return false;
      if (filterModule !== 'all' && log.page !== filterModule) return false;
      if (filterUser !== 'all' && log.user !== filterUser) return false;
      const ts = new Date(log.timestamp).getTime();
      if (ts < fromTs || ts > toTs) return false;
      if (q) {
        const hay = `${log.user} ${log.action} ${log.target} ${log.before || ''} ${log.after || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, search, filterType, filterModule, filterUser, filterFrom, filterTo]);

  const handleExportCSV = () => {
    const blob = new Blob([toCSV(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.download = `activity-log-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSearch(''); setFilterType('all'); setFilterModule('all'); setFilterUser('all'); setFilterFrom(''); setFilterTo('');
  };

  const filtersActive = !!(search || filterType !== 'all' || filterModule !== 'all' || filterUser !== 'all' || filterFrom || filterTo);

  return (
    <div className="p-4 md:p-8 max-w-[1200px]">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400 mb-1">{l('Журнал', 'Журнал', 'Activity Log')}</p>
          <h1 className="text-gray-900">{l('Журнал действий', 'Әрекеттер журналы', 'Activity Log')}</h1>
          <p className="text-xs text-gray-400 mt-1 max-w-xl">
            {l(
              'Полный список действий на платформе: входы, изменения, AI-операции. Виден только Админу.',
              'Платформадағы әрекеттердің толық тізімі: кірулер, өзгерістер, AI-операциялары. Тек Әкімшіге көрінеді.',
              'Full list of actions on the platform: logins, changes, AI operations. Visible to Admin only.'
            )}
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 disabled:opacity-30"
        >
          <Download className="w-3.5 h-3.5" />
          {l('Экспорт CSV', 'CSV экспорт', 'Export CSV')}
          <span className="text-[10px] opacity-70">({filtered.length})</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-3">
          {/* Search */}
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={l('Поиск по тексту…', 'Мәтін бойынша іздеу…', 'Search text…')}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border-0 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200"
            />
          </div>
          {/* Type filter */}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as any)}
            className="px-3 py-2 bg-gray-50 border-0 rounded-xl text-xs focus:outline-none text-gray-600"
          >
            <option value="all">{l('Все типы', 'Барлық түрлер', 'All types')}</option>
            {(Object.keys(TYPE_META) as ActivityType[]).map(k => (
              <option key={k} value={k}>{l(TYPE_META[k].ru, TYPE_META[k].kz, TYPE_META[k].eng)}</option>
            ))}
          </select>
          {/* Module filter */}
          <select
            value={filterModule}
            onChange={e => setFilterModule(e.target.value)}
            className="px-3 py-2 bg-gray-50 border-0 rounded-xl text-xs focus:outline-none text-gray-600"
          >
            {MODULE_OPTIONS.map(m => (
              <option key={m.value} value={m.value}>{l(m.ru, m.kz, m.eng)}</option>
            ))}
          </select>
          {/* User filter */}
          <select
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            className="px-3 py-2 bg-gray-50 border-0 rounded-xl text-xs focus:outline-none text-gray-600"
          >
            <option value="all">{l('Все пользователи', 'Барлық пайдаланушылар', 'All users')}</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
          <div className="flex items-center gap-2 md:col-span-3">
            <label className="text-[11px] text-gray-400">{l('С', 'Бастап', 'From')}</label>
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-50 border-0 rounded-xl text-xs focus:outline-none text-gray-600"
            />
            <label className="text-[11px] text-gray-400">{l('по', 'дейін', 'to')}</label>
            <input
              type="date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-50 border-0 rounded-xl text-xs focus:outline-none text-gray-600"
            />
          </div>
          {filtersActive && (
            <button
              onClick={resetFilters}
              className="text-[11px] text-gray-500 hover:text-gray-900 underline justify-self-start md:col-span-3"
            >
              {l('Сбросить фильтры', 'Сүзгілерді тазалау', 'Reset filters')}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
          <div className="col-span-2">{l('Время', 'Уақыт', 'Time')}</div>
          <div className="col-span-2">{l('Пользователь', 'Пайдаланушы', 'User')}</div>
          <div className="col-span-1">{l('Тип', 'Түрі', 'Type')}</div>
          <div className="col-span-2">{l('Модуль', 'Модуль', 'Module')}</div>
          <div className="col-span-5">{l('Действие', 'Әрекет', 'Action')}</div>
        </div>
        <div className="divide-y divide-gray-50">
          {filtered.length === 0 && (
            <div className="px-4 py-16 text-center">
              <div className="text-xs text-gray-400">
                {filtersActive ? l('Ничего не найдено по фильтрам', 'Сүзгілер бойынша ештеңе табылмады', 'Nothing matches the filters') : l('Журнал пуст', 'Журнал бос', 'Log is empty')}
              </div>
            </div>
          )}
          {filtered.map(log => {
            const meta = TYPE_META[log.type] || TYPE_META.update;
            const Icon = meta.icon;
            const moduleOption = MODULE_OPTIONS.find(m => m.value === log.page);
            const moduleLabel = moduleOption ? l(moduleOption.ru, moduleOption.kz, moduleOption.eng) : (log.page || '—');
            const isAI = log.actor === 'ai';
            return (
              <div key={log.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center text-xs hover:bg-gray-50/50">
                <div className="col-span-2 text-gray-500 font-mono text-[11px]">{formatDateTime(log.timestamp, language)}</div>
                <div className="col-span-2 truncate">
                  <span className={`${isAI ? 'text-violet-600' : 'text-gray-900'}`}>{log.user || '—'}</span>
                  {isAI && <span className="ml-1 text-[9px] text-violet-500 bg-violet-50 px-1 py-0.5 rounded">AI</span>}
                </div>
                <div className="col-span-1">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${meta.bg} ${meta.fg} text-[10px]`}>
                    <Icon className="w-2.5 h-2.5" />
                    {l(meta.ru, meta.kz, meta.eng)}
                  </span>
                </div>
                <div className="col-span-2 text-gray-500 truncate">
                  {log.page === 'catalog' ? <span className="inline-flex items-center gap-1"><BookOpen className="w-3 h-3" />{moduleLabel}</span> : moduleLabel}
                </div>
                <div className="col-span-5 min-w-0">
                  <div className="text-gray-900 truncate">
                    {log.action}
                    {log.target && <span className="text-gray-500"> · {log.target}</span>}
                  </div>
                  {(log.before || log.after) && (
                    <div className="mt-0.5 text-[10px] text-gray-400 truncate">
                      {log.before && <span className="line-through">{log.before}</span>}
                      {log.before && log.after && <span className="mx-1">→</span>}
                      {log.after && <span className="text-gray-700">{log.after}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
