import { useEffect, useState } from 'react';
import { Plus, X, Edit2, Trash2, Search } from 'lucide-react';
import { CustomIcon } from './CustomIcons';
import { useDataStore, type CustomFieldDef, type CustomRecord, type PlatformModule } from '../utils/dataStore';
import { t } from '../utils/translations';

interface Props {
  moduleId: string;
  language: 'kz' | 'ru' | 'eng';
  onNotFound?: () => void;
}

function fieldLabel(f: CustomFieldDef, language: 'kz' | 'ru' | 'eng'): string {
  return f.label[language] || f.label.ru || f.label.eng || f.label.kz || f.id;
}

function formatValue(f: CustomFieldDef, v: any, language: 'kz' | 'ru' | 'eng'): string {
  if (v == null || v === '') return '—';
  switch (f.type) {
    case 'checkbox': return v ? '✓' : '—';
    case 'number':   return Number(v).toLocaleString(language === 'eng' ? 'en-GB' : 'ru-RU');
    case 'date':     return v;
    default:         return String(v);
  }
}

export function CustomModulePage({ moduleId, language, onNotFound }: Props) {
  const store = useDataStore();
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const tt = (key: Parameters<typeof t>[0]) => t(key, language);

  const mod: PlatformModule | undefined = store.modules.find(m => m.id === moduleId);
  const records: CustomRecord[] = store.customRecords[moduleId] || [];

  // Redirect if the module disappeared (e.g. deleted in another tab).
  useEffect(() => {
    if (!mod || !mod.custom) onNotFound?.();
  }, [mod, onNotFound]);

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CustomRecord | null>(null);
  const [showForm, setShowForm] = useState(false);

  if (!mod || !mod.custom) return null;

  const fields = mod.fields || [];

  const filtered = search.trim()
    ? records.filter(r => {
        const hay = Object.values(r.values).map(v => String(v ?? '')).join(' ').toLowerCase();
        return hay.includes(search.toLowerCase());
      })
    : records;

  // Pick up to 4 fields for column display.
  const tableFields = fields.slice(0, 4);

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gray-100 rounded-2xl flex items-center justify-center"><CustomIcon name={mod.icon} className="w-5 h-5 text-gray-700" /></div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">{tt('customModule')}</p>
            <h1 className="text-gray-900">{mod.labels[language]}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={l('Поиск…', 'Іздеу…', 'Search…')}
              className="pl-9 pr-3 py-2 bg-gray-50 border-0 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-gray-200"
            />
          </div>
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">
            <Plus className="w-3.5 h-3.5" />{tt('addRecord')}
          </button>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-xs text-gray-400">
          {l('У модуля пока нет полей. Откройте Настройки → Модули и добавьте поля.',
             'Модульдің әзірге өрістері жоқ. Баптаулар → Модульдер ашып, өрістер қосыңыз.',
             'No fields yet. Open Settings → Modules and add fields.')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-xs text-gray-400">
          {search ? l('Ничего не найдено', 'Ештеңе табылмады', 'Nothing found') : tt('recordsEmpty')}
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          {/* Header row */}
          <div className="grid gap-3 px-4 py-2.5 border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400" style={{ gridTemplateColumns: `repeat(${tableFields.length}, minmax(0, 1fr)) 120px 100px` }}>
            {tableFields.map(f => <div key={f.id} className="truncate">{fieldLabel(f, language)}</div>)}
            <div>{tt('recordCreated')}</div>
            <div className="text-right">·</div>
          </div>
          <div className="divide-y divide-gray-50">
            {filtered.map(r => (
              <div key={r.id} className="grid gap-3 px-4 py-3 items-center text-xs hover:bg-gray-50/50 group" style={{ gridTemplateColumns: `repeat(${tableFields.length}, minmax(0, 1fr)) 120px 100px` }}>
                {tableFields.map(f => (
                  <div key={f.id} className="text-gray-900 truncate">{formatValue(f, r.values[f.id], language)}</div>
                ))}
                <div className="text-[10px] text-gray-400 font-mono">{new Date(r.createdAt).toLocaleDateString(language === 'eng' ? 'en-GB' : 'ru-RU')}</div>
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditing(r); setShowForm(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg" title={tt('editRecord')}>
                    <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                  <button
                    onClick={() => { if (confirm(tt('deleteRecord') + '?')) store.deleteCustomRecord(moduleId, r.id); }}
                    className="p-1.5 hover:bg-red-50 rounded-lg"
                    title={tt('deleteRecord')}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <RecordForm
          mod={mod}
          editing={editing}
          language={language}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ─── Record form modal (add / edit) ────────────────────────────
interface RecordFormProps {
  mod: PlatformModule;
  editing: CustomRecord | null;
  language: 'kz' | 'ru' | 'eng';
  onClose: () => void;
}

function RecordForm({ mod, editing, language, onClose }: RecordFormProps) {
  const store = useDataStore();
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const tt = (key: Parameters<typeof t>[0]) => t(key, language);
  const fields = mod.fields || [];

  const [values, setValues] = useState<Record<string, any>>(() => {
    if (editing) return { ...editing.values };
    const initial: Record<string, any> = {};
    for (const f of fields) initial[f.id] = f.type === 'checkbox' ? false : '';
    return initial;
  });
  const [error, setError] = useState('');

  const handleSubmit = () => {
    // Required-field validation.
    for (const f of fields) {
      if (!f.required) continue;
      const v = values[f.id];
      const empty = v == null || v === '' || (f.type === 'checkbox' && !v);
      if (empty) {
        setError(`${fieldLabel(f, language)} — ${l('обязательное поле', 'міндетті өріс', 'required')}`);
        return;
      }
    }
    if (editing) store.updateCustomRecord(mod.id, editing.id, values);
    else store.addCustomRecord(mod.id, values);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-900">{editing ? tt('editRecord') : tt('addRecord')}</div>
          <button onClick={onClose} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center"><X className="w-3.5 h-3.5 text-gray-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {fields.length === 0 && (
            <div className="text-[11px] text-gray-400 italic">{l('У этого модуля нет полей. Сначала добавьте поля в Настройки → Модули.', 'Бұл модульдің өрістері жоқ.', 'No fields. Add some in Settings → Modules.')}</div>
          )}
          {fields.map(f => (
            <div key={f.id}>
              <label className="block text-[11px] text-gray-400 mb-1">
                {fieldLabel(f, language)} {f.required && <span className="text-red-400">*</span>}
              </label>
              {f.type === 'textarea' ? (
                <textarea
                  value={values[f.id] || ''}
                  onChange={e => { setValues(v => ({ ...v, [f.id]: e.target.value })); setError(''); }}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none"
                />
              ) : f.type === 'number' ? (
                <input
                  type="number"
                  value={values[f.id] ?? ''}
                  onChange={e => { setValues(v => ({ ...v, [f.id]: e.target.value === '' ? '' : Number(e.target.value) })); setError(''); }}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                />
              ) : f.type === 'date' ? (
                <input
                  type="date"
                  value={values[f.id] || ''}
                  onChange={e => { setValues(v => ({ ...v, [f.id]: e.target.value })); setError(''); }}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                />
              ) : f.type === 'select' ? (
                <select
                  value={values[f.id] || ''}
                  onChange={e => { setValues(v => ({ ...v, [f.id]: e.target.value })); setError(''); }}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                >
                  <option value="">—</option>
                  {(f.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!values[f.id]}
                    onChange={e => { setValues(v => ({ ...v, [f.id]: e.target.checked })); setError(''); }}
                    className="rounded accent-gray-900"
                  />
                  <span className="text-xs text-gray-600">{fieldLabel(f, language)}</span>
                </label>
              ) : (
                <input
                  type="text"
                  value={values[f.id] || ''}
                  onChange={e => { setValues(v => ({ ...v, [f.id]: e.target.value })); setError(''); }}
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                />
              )}
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-50 flex items-center gap-2">
          {error && <span className="text-xs text-red-500 mr-auto">{error}</span>}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">{tt('cancel')}</button>
          <button onClick={handleSubmit} disabled={fields.length === 0} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 disabled:opacity-30">{tt('save')}</button>
        </div>
      </div>
    </div>
  );
}
