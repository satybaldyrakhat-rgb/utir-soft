import { useState } from 'react';
import { GripVertical, Home, ShoppingCart, Wrench, MessageSquare, CheckSquare, BarChart3, Settings as SettingsIcon, Plus, RotateCcw, Shield, X, Check, Lock, Eye, EyeOff } from 'lucide-react';

interface Props { language: 'kz' | 'ru' | 'eng'; }
type Mod = { id: string; ru: string; kz: string; eng: string; icon: any; enabled: boolean; locked?: boolean; color?: string };

const DEFAULTS: Mod[] = [
  { id: 'dashboard', ru: 'Главная', kz: 'Басты бет', eng: 'Home', icon: Home, enabled: true, color: 'bg-gray-50 text-gray-700' },
  { id: 'sales', ru: 'Заказы', kz: 'Тапсырыстар', eng: 'Orders', icon: ShoppingCart, enabled: true, color: 'bg-emerald-50 text-emerald-700' },
  { id: 'warehouse', ru: 'Производство', kz: 'Өндіріс', eng: 'Production', icon: Wrench, enabled: true, color: 'bg-amber-50 text-amber-700' },
  { id: 'chats', ru: 'Чаты', kz: 'Чаттар', eng: 'Chats', icon: MessageSquare, enabled: true, color: 'bg-sky-50 text-sky-700' },
  { id: 'tasks', ru: 'Задачи', kz: 'Тапсырмалар', eng: 'Tasks', icon: CheckSquare, enabled: true, color: 'bg-violet-50 text-violet-700' },
  { id: 'analytics', ru: 'Аналитика', kz: 'Аналитика', eng: 'Analytics', icon: BarChart3, enabled: true, color: 'bg-rose-50 text-rose-700' },
  { id: 'settings', ru: 'Настройки', kz: 'Баптаулар', eng: 'Settings', icon: SettingsIcon, enabled: true, locked: true, color: 'bg-gray-100 text-gray-600' },
];
const ROLES = ['Админ', 'Менеджер', 'Дизайнер', 'Бухгалтер', 'Производство', 'Замерщик'];

export function ModulesSettings({ language }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [modules, setModules] = useState<Mod[]>(DEFAULTS);
  const [permsFor, setPermsFor] = useState<string | null>(null);
  const [perms, setPerms] = useState<Record<string, string[]>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<Mod>) => setModules(m => m.map(x => x.id === id ? { ...x, ...patch } : x));
  const onDrop = (target: string) => {
    if (!dragId || dragId === target) return;
    setModules(m => {
      const list = [...m];
      const f = list.findIndex(x => x.id === dragId), t = list.findIndex(x => x.id === target);
      const [moved] = list.splice(f, 1);
      list.splice(t, 0, moved);
      return list;
    });
    setDragId(null);
  };
  const togglePerm = (mod: string, role: string) => setPerms(p => {
    const cur = p[mod] || [...ROLES];
    return { ...p, [mod]: cur.includes(role) ? cur.filter(r => r !== role) : [...cur, role] };
  });

  const enabledCount = modules.filter(m => m.enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-gray-900 mb-1">{l('Модули платформы', 'Платформа модульдері', 'Platform modules')}</h2>
          <p className="text-xs text-gray-400 max-w-md">{l('Перетащите для смены порядка. Включите или отключите модули — изменения применятся для всех сотрудников.', 'Ретін өзгерту үшін сүйреңіз.', 'Drag to reorder. Toggle modules on or off.')}</p>
        </div>
        <div className="px-3 py-1.5 bg-gray-50 rounded-xl text-[11px] text-gray-500">
          {enabledCount} / {modules.length} {l('активны', 'белсенді', 'active')}
        </div>
      </div>

      <div className="space-y-2">
        {modules.map((m, idx) => {
          const Icon = m.icon;
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
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${m.color || 'bg-gray-50 text-gray-700'}`}><Icon className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-900">{m[language as 'ru' | 'kz' | 'eng']}</span>
                    {m.locked && <Lock className="w-3 h-3 text-gray-300" />}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5 hidden sm:flex items-center gap-2">
                    <span>RU · {m.ru}</span><span>·</span>
                    <span>KZ · {m.kz}</span><span>·</span>
                    <span>EN · {m.eng}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setEditId(isEditing ? null : m.id)}
                    className="px-2.5 py-1.5 text-[11px] text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg">{l('Названия', 'Атаулар', 'Names')}</button>
                  <button onClick={() => setPermsFor(m.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg">
                    <Shield className="w-3 h-3" /> {l('Доступ', 'Қатынау', 'Access')}
                  </button>
                  {!m.locked ? (
                    <button onClick={() => update(m.id, { enabled: !m.enabled })}
                      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${m.enabled ? 'bg-gray-900' : 'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${m.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                    </button>
                  ) : (
                    <span className="w-10 h-6 rounded-full bg-gray-50 flex items-center justify-center"><Check className="w-3 h-3 text-gray-400" /></span>
                  )}
                </div>
              </div>
              {isEditing && (
                <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-gray-50 pt-3">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">RU</label>
                    <input value={m.ru} onChange={e => update(m.id, { ru: e.target.value })} className="w-full px-3 py-2 bg-gray-50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">KZ</label>
                    <input value={m.kz} onChange={e => update(m.id, { kz: e.target.value })} className="w-full px-3 py-2 bg-gray-50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">EN</label>
                    <input value={m.eng} onChange={e => update(m.id, { eng: e.target.value })} className="w-full px-3 py-2 bg-gray-50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-gray-200" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
        <button className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">
          <Plus className="w-3.5 h-3.5" /> {l('Создать кастомный модуль', 'Кастом модуль жасау', 'Create custom module')}
        </button>
        <button onClick={() => { setModules(DEFAULTS); setPerms({}); setEditId(null); }}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-900">
          <RotateCcw className="w-3 h-3" /> {l('Сбросить к настройкам по умолчанию', 'Әдепкі бойынша қалпына келтіру', 'Reset to defaults')}
        </button>
      </div>

      {permsFor && (() => {
        const mod = modules.find(x => x.id === permsFor);
        const cur = perms[permsFor] || ROLES;
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPermsFor(null)}>
            <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl p-5 max-w-md w-full">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm text-gray-900">{l('Права доступа', 'Қатынау құқықтары', 'Permissions')}</div>
                <button onClick={() => setPermsFor(null)}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
              <div className="text-[10px] text-gray-400 mb-4">{mod?.[language as 'ru' | 'kz' | 'eng']} · {cur.length}/{ROLES.length}</div>
              <div className="space-y-1.5">
                {ROLES.map(r => {
                  const checked = cur.includes(r);
                  return (
                    <label key={r} className={`flex items-center gap-2.5 p-3 border rounded-xl cursor-pointer transition ${checked ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:bg-gray-50'}`}>
                      <input type="checkbox" checked={checked} onChange={() => togglePerm(permsFor, r)} className="rounded" />
                      <span className="text-xs text-gray-700 flex-1">{r}</span>
                      {checked ? <Eye className="w-3.5 h-3.5 text-emerald-500" /> : <EyeOff className="w-3.5 h-3.5 text-gray-300" />}
                    </label>
                  );
                })}
              </div>
              <button onClick={() => setPermsFor(null)} className="w-full mt-4 py-2.5 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">{l('Готово', 'Дайын', 'Done')}</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
