import { useEffect, useState, useMemo, useRef } from 'react';
import {
  GripVertical, Home, Sparkles, ShoppingCart, Wrench, MessageSquare, CheckSquare, BarChart3,
  Settings as SettingsIcon, Plus, RotateCcw, Shield, X, Check, Lock, Eye, EyeOff, Edit2, Trash2,
  Search, ExternalLink, Download, Upload, ChevronRight, ChevronDown, Power, Wallet, FilePlus2, AlertCircle,
} from 'lucide-react';
import { useDataStore, ALL_ROLES, type RoleKey, type PlatformModule } from '../utils/dataStore';
import { t } from '../utils/translations';
import { CustomIcon } from './CustomIcons';
import { ModuleBuilder } from './ModuleBuilder';

interface Props { language: 'kz' | 'ru' | 'eng'; }

// ─── Per-module icon + accent colour. Custom modules pick from CustomIcons.
const MODULE_ICON: Record<string, any> = {
  dashboard:  Home,
  'ai-design': Sparkles,
  sales:      ShoppingCart,
  finance:    Wallet,
  warehouse:  Wrench,
  chats:      MessageSquare,
  tasks:      CheckSquare,
  analytics:  BarChart3,
  settings:   SettingsIcon,
};
const MODULE_COLOR: Record<string, string> = {
  dashboard:  'bg-gray-50 text-gray-700',
  'ai-design': 'bg-violet-50 text-violet-700',
  sales:      'bg-emerald-50 text-emerald-700',
  finance:    'bg-sky-50 text-sky-700',
  warehouse:  'bg-amber-50 text-amber-700',
  chats:      'bg-cyan-50 text-cyan-700',
  tasks:      'bg-violet-50 text-violet-700',
  analytics:  'bg-rose-50 text-rose-700',
  settings:   'bg-gray-100 text-gray-600',
};

// Short human description for each system module. Helps admins
// understand what they're toggling when they first set up the platform.
const MODULE_DESC: Record<string, { ru: string; kz: string; eng: string }> = {
  dashboard:   { ru: 'Сводка и быстрые ссылки',                        kz: 'Жиынтық панель',              eng: 'Overview and shortcuts' },
  'ai-design': { ru: 'Генерация дизайна интерьера через нейросети',    kz: 'AI интерьер дизайны',         eng: 'AI interior design' },
  sales:       { ru: 'Канбан-воронка сделок',                          kz: 'Сату воронкасы',              eng: 'Sales kanban funnel' },
  finance:     { ru: 'Платежи, P&L, отчёты, налоги, счета',            kz: 'Қаржы есептері',              eng: 'Payments, P&L, reports, taxes' },
  warehouse:   { ru: 'BOM-шаблоны, заказы в работе, склад',            kz: 'Қойма мен өндіріс',           eng: 'BOM templates, orders, stock' },
  chats:       { ru: 'Диалоги с клиентами (мессенджеры)',              kz: 'Клиенттермен чат',            eng: 'Customer messaging' },
  tasks:       { ru: 'Задачи команды с дедлайнами',                    kz: 'Тапсырмалар',                 eng: 'Team tasks with deadlines' },
  analytics:   { ru: 'Графики, тренды, отчёты по бизнесу',             kz: 'Бизнес аналитикасы',          eng: 'Charts, trends, reports' },
  settings:    { ru: 'Команда, реквизиты, модули, интеграции',         kz: 'Баптаулар',                    eng: 'Team, requisites, modules' },
};

export function ModulesSettings({ language }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const tt = (key: Parameters<typeof t>[0]) => t(key, language);
  const store = useDataStore();

  const [permsFor, setPermsFor]   = useState<string | null>(null);
  const [dragId, setDragId]       = useState<string | null>(null);
  const [editId, setEditId]       = useState<string | null>(null);
  const [toast, setToast]         = useState<string>('');
  const [builderOpen, setBuilderOpen] = useState<{ editing?: PlatformModule } | null>(null);
  const [search, setSearch]       = useState('');
  const [collapsed, setCollapsed] = useState<{ system: boolean; custom: boolean }>({ system: false, custom: false });
  const importInputRef = useRef<HTMLInputElement>(null);

  // Auto-clear toast after a short delay.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(id);
  }, [toast]);

  const flash = (msg: string) => setToast(msg);

  // ─── Filtering + grouping ────────────────────────────────────────
  // System modules = built-ins (have a known MODULE_ICON entry).
  // Custom modules = user-created via ModuleBuilder (have m.custom flag).
  // Section grouping makes the page scan much easier when 10+ modules.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return store.modules;
    return store.modules.filter(m =>
      m.id.toLowerCase().includes(q) ||
      m.labels.ru.toLowerCase().includes(q) ||
      m.labels.kz.toLowerCase().includes(q) ||
      m.labels.eng.toLowerCase().includes(q),
    );
  }, [store.modules, search]);

  const systemMods = filtered.filter(m => !m.custom);
  const customMods = filtered.filter(m =>  m.custom);

  // KPI counters always reflect the full set (not filtered) — admins want
  // the bird's-eye totals regardless of search query.
  const totals = useMemo(() => {
    const all = store.modules.length;
    const on  = store.modules.filter(m => m.enabled).length;
    const off = all - on;
    const system = store.modules.filter(m => !m.custom).length;
    const custom = store.modules.filter(m =>  m.custom).length;
    return { all, on, off, system, custom };
  }, [store.modules]);

  // ─── Actions ─────────────────────────────────────────────────────
  const onDrop = (target: string) => {
    if (!dragId || dragId === target) return;
    const ids = store.modules.map(m => m.id);
    const f = ids.indexOf(dragId), tIdx = ids.indexOf(target);
    if (f < 0 || tIdx < 0) return;
    const next = [...ids];
    const [moved] = next.splice(f, 1);
    next.splice(tIdx, 0, moved);
    store.reorderModules(next);
    setDragId(null);
    flash(l('Порядок сохранён', 'Реті сақталды', 'Order saved'));
  };

  const toggleEnabled = (m: PlatformModule) => {
    if (m.locked) return;
    store.updateModule(m.id, { enabled: !m.enabled });
    flash(m.enabled ? l('Модуль отключён', 'Модуль өшірілді', 'Module disabled') : l('Модуль включён', 'Модуль қосылды', 'Module enabled'));
  };

  const updateLabel = (m: PlatformModule, lang: 'ru' | 'kz' | 'eng', value: string) => {
    store.updateModule(m.id, { labels: { ...m.labels, [lang]: value } });
  };

  const toggleRoleAccess = (mod: PlatformModule, role: Exclude<RoleKey, 'admin'>) => {
    const next = { ...mod.roleAccess, [role]: !mod.roleAccess[role] };
    store.updateModule(mod.id, { roleAccess: next });
  };

  // Bulk enable/disable a group — respects locked modules.
  function setAllInGroup(group: 'system' | 'custom', enabled: boolean) {
    const list = group === 'system' ? systemMods : customMods;
    list.forEach(m => {
      if (m.locked || m.enabled === enabled) return;
      store.updateModule(m.id, { enabled });
    });
    flash(enabled
      ? l('Все модули включены', 'Барлық модульдер қосылды', 'All modules enabled')
      : l('Все модули отключены', 'Барлық модульдер өшірілді', 'All modules disabled'));
  }

  // Open the underlying page when clicking «Открыть →». Skips locked &
  // unrelated routes (settings sub-pages, custom record pages) — we just
  // jump to the main module id; App.tsx routes the rest.
  function openModule(m: PlatformModule) {
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page: m.id } }));
  }

  // Export the modules + role-permissions to a JSON file so the admin can
  // back up the team's layout or move it to another instance.
  function exportConfig() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      modules: store.modules,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `utir-modules-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(l('Конфиг скачан', 'Конфиг жүктелді', 'Config downloaded'));
  }

  // Import — accepts the JSON shape exportConfig produces. Validates and
  // applies module-by-module so a partial corruption doesn't lose unrelated
  // settings.
  async function importConfig(file: File) {
    try {
      const txt = await file.text();
      const data = JSON.parse(txt);
      if (!data || !Array.isArray(data.modules)) {
        flash(l('Неверный формат файла', 'Дұрыс емес файл', 'Invalid file')); return;
      }
      const incoming: PlatformModule[] = data.modules;
      // Reorder to match incoming order, then patch each known module.
      const incomingIds = incoming.map(m => m.id);
      store.reorderModules(incomingIds);
      for (const m of incoming) {
        const existing = store.modules.find(x => x.id === m.id);
        if (existing) {
          store.updateModule(m.id, {
            enabled: m.enabled,
            labels: m.labels,
            roleAccess: m.roleAccess,
          });
        }
      }
      flash(l('Конфиг применён', 'Конфиг қолданылды', 'Config imported'));
    } catch (e: any) {
      flash(l('Ошибка импорта: ', 'Қате: ', 'Import error: ') + (e?.message || e));
    }
  }

  // Number of roles (including admin) that can open this module.
  const roleCount = (m: PlatformModule) => 1 + (m.roleAccess.manager ? 1 : 0) + (m.roleAccess.employee ? 1 : 0);

  // ─── Card row renderer (reused for both groups) ─────────────────
  const Row = ({ m, idx }: { m: PlatformModule; idx: number }) => {
    const Icon = MODULE_ICON[m.id] || SettingsIcon;
    const color = m.custom ? 'bg-violet-50 text-violet-700' : (MODULE_COLOR[m.id] || 'bg-gray-50 text-gray-700');
    const isEditing = editId === m.id;
    const desc = MODULE_DESC[m.id]?.[language];
    const rc = roleCount(m);
    return (
      <div key={m.id}
        draggable={!m.locked}
        onDragStart={() => setDragId(m.id)}
        onDragOver={e => e.preventDefault()}
        onDrop={() => onDrop(m.id)}
        className={`group bg-white rounded-2xl border ${m.enabled ? 'border-gray-100' : 'border-gray-100 opacity-60'} hover:shadow-sm transition-all ${dragId === m.id ? 'opacity-30 scale-[0.99]' : ''}`}>
        <div className="flex items-center gap-3 p-4">
          <div className="flex items-center gap-1 text-gray-300 flex-shrink-0">
            <span className="text-[10px] tabular-nums w-5 text-right">{idx + 1}</span>
            <GripVertical className={`w-4 h-4 ${m.locked ? 'text-gray-200' : 'text-gray-300 cursor-move group-hover:text-gray-500'}`} />
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
            {m.custom ? <CustomIcon name={m.icon} className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-900 truncate">{m.labels[language]}</span>
              {m.locked && <Lock className="w-3 h-3 text-gray-300" />}
              {m.custom && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">{l('Кастом', 'Кастом', 'Custom')}</span>}
              {!m.enabled && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{l('Откл', 'Өшік', 'Off')}</span>}
              {/* Role count — quick view of who can open this module */}
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${rc === 1 ? 'bg-rose-50 text-rose-600' : rc === 3 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                title={`${rc} ${l('из 3 ролей', '/ 3 рөл', 'of 3 roles')}`}>
                {rc}/3 {l('ролей', 'рөл', 'roles')}
              </span>
            </div>
            {/* Description / labels preview */}
            {desc && <div className="text-[11px] text-gray-500 mt-0.5 truncate">{desc}</div>}
            {!desc && (
              <div className="text-[10px] text-gray-400 mt-0.5 hidden sm:flex items-center gap-2">
                <span>RU · {m.labels.ru}</span><span>·</span>
                <span>KZ · {m.labels.kz}</span><span>·</span>
                <span>EN · {m.labels.eng}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Quick-open — jumps to the module page via app:navigate */}
            {!m.locked && m.enabled && (
              <button
                onClick={() => openModule(m)}
                title={l('Открыть модуль', 'Ашу', 'Open')}
                className="w-7 h-7 hover:bg-gray-100 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hidden sm:flex"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            )}

            {m.custom ? (
              <>
                <button onClick={() => setBuilderOpen({ editing: m })}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg" title={tt('editCustomModule')}>
                  <Edit2 className="w-3 h-3" /> {l('Изменить', 'Өзгерту', 'Edit')}
                </button>
                <button
                  onClick={() => {
                    if (confirm(tt('deleteCustomModuleConfirm'))) {
                      store.deleteCustomModule(m.id);
                      flash(l('Модуль удалён', 'Модуль жойылды', 'Module deleted'));
                    }
                  }}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"
                  title={tt('delete')}>
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            ) : (
              <button onClick={() => setEditId(isEditing ? null : m.id)}
                className={`px-2.5 py-1.5 text-[11px] rounded-lg transition ${isEditing ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}>
                {l('Названия', 'Атаулар', 'Names')}
              </button>
            )}
            <button onClick={() => setPermsFor(m.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg">
              <Shield className="w-3 h-3" /> {l('Доступ', 'Қатынау', 'Access')}
            </button>
            {!m.locked ? (
              <button onClick={() => toggleEnabled(m)}
                className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${m.enabled ? 'bg-gray-900' : 'bg-gray-200'}`}
                title={m.enabled ? l('Отключить', 'Өшіру', 'Disable') : l('Включить', 'Қосу', 'Enable')}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${m.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </button>
            ) : (
              <span className="w-10 h-6 rounded-full bg-gray-50 flex items-center justify-center" title={l('Системный модуль', 'Жүйелік модуль', 'System module')}>
                <Check className="w-3 h-3 text-gray-400" />
              </span>
            )}
          </div>
        </div>
        {isEditing && (
          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-gray-50 pt-3">
            {(['ru', 'kz', 'eng'] as const).map(lang => (
              <div key={lang}>
                <label className="text-[10px] text-gray-400 block mb-1 uppercase">{lang}</label>
                <input
                  value={m.labels[lang]}
                  onChange={e => updateLabel(m, lang, e.target.value)}
                  onBlur={() => flash(l('Названия сохранены', 'Атаулар сақталды', 'Names saved'))}
                  className="w-full px-3 py-2 bg-gray-50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-gray-200"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ─── Section header used twice (System + Custom) ────────────────
  const SectionHeader = ({
    label, badge, count, isOpen, onToggle, group,
  }: {
    label: string; badge?: string; count: { total: number; on: number };
    isOpen: boolean; onToggle: () => void; group: 'system' | 'custom';
  }) => (
    <div className="flex items-center justify-between gap-3 px-1 py-1 mt-2">
      <button onClick={onToggle} className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-900">
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <span className="uppercase tracking-wide">{label}</span>
        {badge && <span className="text-[9px] px-1.5 py-0.5 bg-violet-50 text-violet-600 rounded">{badge}</span>}
        <span className="text-[10px] text-gray-400">· {count.on} / {count.total} {l('активны', 'белсенді', 'active')}</span>
      </button>
      {isOpen && count.total > 0 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAllInGroup(group, true)}
            disabled={count.on === count.total}
            className="text-[10px] text-gray-500 hover:text-emerald-600 inline-flex items-center gap-1 px-2 py-1 hover:bg-gray-50 rounded-md disabled:opacity-30"
            title={l('Включить все в группе', '...', 'Enable all in group')}
          >
            <Power className="w-3 h-3" /> {l('Все', 'Барлығы', 'All on')}
          </button>
          <button
            onClick={() => setAllInGroup(group, false)}
            disabled={count.on === 0}
            className="text-[10px] text-gray-500 hover:text-rose-600 inline-flex items-center gap-1 px-2 py-1 hover:bg-gray-50 rounded-md disabled:opacity-30"
            title={l('Отключить все в группе (кроме системных)', '...', 'Disable all (except locked)')}
          >
            <Power className="w-3 h-3" /> {l('Откл', 'Өшір', 'All off')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5 relative">
      {/* ─── Header + Export/Import ────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-gray-900 mb-1">{l('Модули платформы', 'Платформа модульдері', 'Platform modules')}</h2>
          <p className="text-xs text-gray-400 max-w-md">
            {l('Перетаскивайте чтобы изменить порядок. Включайте/отключайте, настраивайте доступ ролей, создавайте кастомные модули. Все изменения сохраняются автоматически и попадают в журнал.',
               'Реттік ауыстыру үшін сүйреңіз.',
               'Drag to reorder. Enable / disable, set role access, create custom modules. Changes auto-save and go to activity log.')}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={exportConfig}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-100 rounded-lg text-[11px] text-gray-700 hover:bg-gray-50"
            title={l('Скачать конфиг модулей в JSON', '...', 'Download module config as JSON')}
          >
            <Download className="w-3 h-3" /> {l('Экспорт', 'Экспорт', 'Export')}
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-100 rounded-lg text-[11px] text-gray-700 hover:bg-gray-50"
            title={l('Загрузить JSON-конфиг', '...', 'Upload JSON config')}
          >
            <Upload className="w-3 h-3" /> {l('Импорт', 'Импорт', 'Import')}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) importConfig(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* ─── KPI strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {[
          { label: l('Всего', 'Барлығы', 'Total'),       value: totals.all,    sub: l('модулей', 'модуль', 'modules'),  cls: 'bg-gray-50 text-gray-700' },
          { label: l('Активны', 'Белсенді', 'Active'),   value: totals.on,     sub: `${Math.round(totals.on / Math.max(1, totals.all) * 100)}%`, cls: 'bg-emerald-50 text-emerald-700' },
          { label: l('Отключены', 'Өшірілген', 'Off'),   value: totals.off,    sub: l('скрыты', 'жасырылған', 'hidden'), cls: 'bg-amber-50 text-amber-700' },
          { label: l('Системных', 'Жүйелік', 'System'),  value: totals.system, sub: l('встроенные', 'кіріктірілген', 'built-in'), cls: 'bg-sky-50 text-sky-700' },
          { label: l('Кастомных', 'Кастом', 'Custom'),   value: totals.custom, sub: l('свои', 'өзіңіздікі', 'yours'),   cls: 'bg-violet-50 text-violet-700' },
        ].map((k, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-2xl p-3.5">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{k.label}</div>
            <div className="flex items-baseline gap-2">
              <div className="text-lg text-gray-900 tabular-nums">{k.value}</div>
              <div className={`text-[10px] px-1.5 py-0.5 rounded ${k.cls}`}>{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Search bar ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-2 flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-gray-300 ml-2" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={l('Поиск по названию модуля…', 'Модуль аты бойынша іздеу…', 'Search modules…')}
          className="flex-1 bg-transparent text-xs focus:outline-none placeholder:text-gray-400"
        />
        {search && (
          <button onClick={() => setSearch('')} className="w-6 h-6 hover:bg-gray-50 rounded-md flex items-center justify-center">
            <X className="w-3 h-3 text-gray-400" />
          </button>
        )}
      </div>

      {/* ─── System modules section ────────────────────────────────── */}
      <div className="space-y-2">
        <SectionHeader
          label={l('Основные', 'Негізгі', 'Built-in')}
          count={{ total: systemMods.length, on: systemMods.filter(m => m.enabled).length }}
          isOpen={!collapsed.system}
          onToggle={() => setCollapsed(c => ({ ...c, system: !c.system }))}
          group="system"
        />
        {!collapsed.system && (
          systemMods.length === 0 ? (
            <div className="text-[11px] text-gray-400 italic text-center py-4">
              {l('Ничего не найдено по запросу', '...', 'Nothing matches')}
            </div>
          ) : (
            <div className="space-y-2">
              {systemMods.map(m => <Row key={m.id} m={m} idx={store.modules.findIndex(x => x.id === m.id)} />)}
            </div>
          )
        )}
      </div>

      {/* ─── Custom modules section ────────────────────────────────── */}
      <div className="space-y-2">
        <SectionHeader
          label={l('Кастомные', 'Кастом', 'Custom')}
          badge={String(customMods.length)}
          count={{ total: customMods.length, on: customMods.filter(m => m.enabled).length }}
          isOpen={!collapsed.custom}
          onToggle={() => setCollapsed(c => ({ ...c, custom: !c.custom }))}
          group="custom"
        />
        {!collapsed.custom && (
          customMods.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center">
              <FilePlus2 className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <div className="text-sm text-gray-900 mb-1">
                {search
                  ? l('Ничего не найдено', '...', 'Nothing matches')
                  : l('Пока нет кастомных модулей', 'Әзірге кастом модуль жоқ', 'No custom modules yet')}
              </div>
              {!search && (
                <>
                  <div className="text-[11px] text-gray-400 mb-4 max-w-xs mx-auto">
                    {l('Создайте свой раздел с произвольными полями — например, «Поставщики», «Гарантии», «Объекты на стройке».',
                       '...', 'Create your own section with custom fields — e.g. Suppliers, Warranties, Sites.')}
                  </div>
                  <button onClick={() => setBuilderOpen({})}
                    className="px-3.5 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 inline-flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> {tt('createCustomModule')}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {customMods.map(m => <Row key={m.id} m={m} idx={store.modules.findIndex(x => x.id === m.id)} />)}
            </div>
          )
        )}
      </div>

      {/* ─── Bottom toolbar — create + reset ─────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-2 mt-2 border-t border-gray-100">
        <button
          onClick={() => setBuilderOpen({})}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">
          <Plus className="w-3.5 h-3.5" /> {tt('createCustomModule')}
        </button>
        <button onClick={() => {
            if (!confirm(l('Сбросить порядок модулей и роли к настройкам по умолчанию?', '...', 'Reset module order and roles to defaults?'))) return;
            store.resetModules();
            flash(l('Сброшено к настройкам по умолчанию', 'Әдепкі бойынша қалпына келтірілді', 'Reset to defaults'));
          }}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-900">
          <RotateCcw className="w-3 h-3" /> {l('Сбросить к настройкам по умолчанию', 'Әдепкі бойынша қалпына келтіру', 'Reset to defaults')}
        </button>
      </div>

      {builderOpen && (
        <ModuleBuilder
          language={language}
          editing={builderOpen.editing}
          onClose={() => {
            const wasEdit = !!builderOpen.editing;
            setBuilderOpen(null);
            flash(wasEdit ? l('Модуль обновлён', 'Модуль жаңартылды', 'Module updated') : l('Модуль создан', 'Модуль жасалды', 'Module created'));
          }}
        />
      )}

      {/* ─── Toast ──────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 z-[100] animate-fade-in">
          <Check className="w-3.5 h-3.5 text-green-400" />
          {toast}
        </div>
      )}

      {/* ─── Permissions modal — role visibility for one module ── */}
      {permsFor && (() => {
        const mod = store.modules.find(x => x.id === permsFor);
        if (!mod) return null;
        const granted = (r: RoleKey) => r === 'admin' ? true : !!mod.roleAccess[r as Exclude<RoleKey, 'admin'>];
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPermsFor(null)}>
            <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl max-w-md w-full">
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-gray-900">{l('Видимость модуля', 'Модуль көрінуі', 'Module visibility')}</div>
                  <button onClick={() => setPermsFor(null)}><X className="w-4 h-4 text-gray-400" /></button>
                </div>
                <div className="text-[11px] text-gray-500">{mod.labels[language]}</div>
              </div>
              <div className="p-5 space-y-1.5">
                {ALL_ROLES.map(r => {
                  const checked = granted(r);
                  const isAdmin = r === 'admin';
                  const label = r === 'admin' ? tt('roleAdmin') : r === 'manager' ? tt('roleManager') : tt('roleEmployee');
                  return (
                    <label key={r}
                      className={`flex items-center gap-2.5 p-3 border rounded-xl transition ${checked ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:bg-gray-50'} ${isAdmin ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isAdmin}
                        onChange={() => !isAdmin && toggleRoleAccess(mod, r as Exclude<RoleKey, 'admin'>)}
                        className="rounded"
                      />
                      <span className="text-xs text-gray-700 flex-1">{label}</span>
                      {checked ? <Eye className="w-3.5 h-3.5 text-emerald-500" /> : <EyeOff className="w-3.5 h-3.5 text-gray-300" />}
                    </label>
                  );
                })}
              </div>
              <div className="px-5 pb-2 text-[10px] text-gray-400 leading-relaxed">
                {l('Этот переключатель управляет видимостью модуля в меню для роли. Тонкие права (что можно делать внутри — view / full) настраиваются в «Настройки → Команда → Матрица прав».',
                   '...', 'This toggles visibility in the menu. Fine-grained permissions live in Settings → Team → Permission matrix.')}
              </div>
              <div className="px-5 pb-5 pt-2 text-[10px] text-gray-400">
                {l('Админ всегда имеет доступ ко всем модулям.', 'Әкімші барлық модульдерге әрқашан қол жеткізе алады.', 'Admin always has access to all modules.')}
              </div>
              <div className="px-5 pb-5">
                <button
                  onClick={() => { setPermsFor(null); flash(l('Доступы сохранены', 'Қатынау сақталды', 'Access saved')); }}
                  className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">
                  {l('Готово', 'Дайын', 'Done')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
