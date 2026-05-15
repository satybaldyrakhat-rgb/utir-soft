import { useEffect, useState } from 'react';
import { GripVertical, Home, Sparkles, ShoppingCart, Wrench, MessageSquare, CheckSquare, BarChart3, Settings as SettingsIcon, Plus, RotateCcw, Shield, X, Check, Lock, Eye, EyeOff, Edit2, Trash2 } from 'lucide-react';
import { useDataStore, ALL_ROLES, type RoleKey, type PlatformModule } from '../utils/dataStore';
import { t } from '../utils/translations';
import { CustomIcon } from './CustomIcons';
import { ModuleBuilder } from './ModuleBuilder';

interface Props { language: 'kz' | 'ru' | 'eng'; }

// Module id → lucide icon. Custom modules picked from the same palette in B.2.
const MODULE_ICON: Record<string, any> = {
  dashboard:  Home,
  'ai-design': Sparkles,
  sales:      ShoppingCart,
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
  warehouse:  'bg-amber-50 text-amber-700',
  chats:      'bg-sky-50 text-sky-700',
  tasks:      'bg-violet-50 text-violet-700',
  analytics:  'bg-rose-50 text-rose-700',
  settings:   'bg-gray-100 text-gray-600',
};

export function ModulesSettings({ language }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const tt = (key: Parameters<typeof t>[0]) => t(key, language);
  const store = useDataStore();

  const [permsFor, setPermsFor] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [toast, setToast] = useState<string>('');
  const [builderOpen, setBuilderOpen] = useState<{ editing?: PlatformModule } | null>(null);

  // Auto-clear toast after a short delay.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const flash = (msg: string) => setToast(msg);

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

  const enabledCount = store.modules.filter(m => m.enabled).length;

  return (
    <div className="space-y-6 relative">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-gray-900 mb-1">{l('Модули платформы', 'Платформа модульдері', 'Platform modules')}</h2>
          <p className="text-xs text-gray-400 max-w-md">
            {l('Перетащите для смены порядка. Изменения сохраняются автоматически.',
               'Ретін өзгерту үшін сүйреңіз. Өзгерістер автоматты сақталады.',
               'Drag to reorder. Changes save automatically.')}
          </p>
        </div>
        <div className="px-3 py-1.5 bg-gray-50 rounded-xl text-[11px] text-gray-500">
          {enabledCount} / {store.modules.length} {l('активны', 'белсенді', 'active')}
        </div>
      </div>

      <div className="space-y-2">
        {store.modules.map((m, idx) => {
          const Icon = MODULE_ICON[m.id] || SettingsIcon;
          const color = m.custom ? 'bg-violet-50 text-violet-700' : (MODULE_COLOR[m.id] || 'bg-gray-50 text-gray-700');
          const isEditing = editId === m.id;
          return (
            <div key={m.id}
              draggable={!m.locked}
              onDragStart={() => setDragId(m.id)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => onDrop(m.id)}
              className={`group bg-white rounded-2xl border ${m.enabled ? 'border-gray-100' : 'border-gray-100 opacity-60'} hover:shadow-sm transition-all ${dragId === m.id ? 'opacity-30 scale-[0.99]' : ''}`}>
              <div className="flex items-center gap-3 p-4">
                <div className="flex items-center gap-1 text-gray-300">
                  <span className="text-[10px] tabular-nums w-4">{idx + 1}</span>
                  <GripVertical className={`w-4 h-4 ${m.locked ? 'text-gray-200' : 'text-gray-300 cursor-move group-hover:text-gray-500'}`} />
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                  {m.custom ? <CustomIcon name={m.icon} className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-900">{m.labels[language]}</span>
                    {m.locked && <Lock className="w-3 h-3 text-gray-300" />}
                    {m.custom && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">{l('Кастом', 'Кастом', 'Custom')}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5 hidden sm:flex items-center gap-2">
                    <span>RU · {m.labels.ru}</span><span>·</span>
                    <span>KZ · {m.labels.kz}</span><span>·</span>
                    <span>EN · {m.labels.eng}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
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
        })}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
        <button
          onClick={() => setBuilderOpen({})}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">
          <Plus className="w-3.5 h-3.5" /> {tt('createCustomModule')}
        </button>
        <button onClick={() => { store.resetModules(); flash(l('Сброшено к настройкам по умолчанию', 'Әдепкі бойынша қалпына келтірілді', 'Reset to defaults')); }}
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 z-[100] animate-fade-in">
          <Check className="w-3.5 h-3.5 text-green-400" />
          {toast}
        </div>
      )}

      {/* Permissions modal — new admin/manager/employee enum */}
      {permsFor && (() => {
        const mod = store.modules.find(x => x.id === permsFor);
        if (!mod) return null;
        const granted = (r: RoleKey) => r === 'admin' ? true : !!mod.roleAccess[r as Exclude<RoleKey, 'admin'>];
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPermsFor(null)}>
            <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl p-5 max-w-md w-full">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm text-gray-900">{l('Права доступа', 'Қатынау құқықтары', 'Permissions')}</div>
                <button onClick={() => setPermsFor(null)}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
              <div className="text-[10px] text-gray-400 mb-4">{mod.labels[language]}</div>
              <div className="space-y-1.5">
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
              <div className="text-[10px] text-gray-400 mt-3">
                {l('Админ всегда имеет доступ ко всем модулям.', 'Әкімші барлық модульдерге әрқашан қол жеткізе алады.', 'Admin always has access to all modules.')}
              </div>
              <button
                onClick={() => { setPermsFor(null); flash(l('Доступы сохранены', 'Қатынау сақталды', 'Access saved')); }}
                className="w-full mt-4 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">
                {l('Готово', 'Дайын', 'Done')}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
