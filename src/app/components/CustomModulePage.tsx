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

// Shared input class for the record form. Same vocabulary as the rest of
// the glass modals across the app.
const INPUT = 'w-full px-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all';

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
  // Glass confirm-delete dialog instead of native confirm()
  const [confirmDelete, setConfirmDelete] = useState<CustomRecord | null>(null);

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
    <div
      className="min-h-full relative"
    >
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/60 ring-1 ring-white/60 rounded-2xl flex items-center justify-center backdrop-blur-xl">
            <CustomIcon name={mod.icon} className="w-5 h-5 text-slate-700" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-0.5 tracking-widest uppercase">{tt('customModule')}</p>
            <h1 className="text-slate-900 text-2xl md:text-3xl font-medium tracking-tight">{mod.labels[language]}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={l('Поиск…', 'Іздеу…', 'Search…')}
              className="pl-9 pr-3 py-2 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-xs focus:outline-none focus:bg-white focus:ring-slate-300 transition-all placeholder:text-slate-400"
            />
          </div>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />{tt('addRecord')}
          </button>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-3xl p-12 text-center text-xs text-slate-500 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)]">
          {l('У модуля пока нет полей. Откройте Настройки → Модули и добавьте поля.',
             'Модульдің әзірге өрістері жоқ. Баптаулар → Модульдер ашып, өрістер қосыңыз.',
             'No fields yet. Open Settings → Modules and add fields.')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white/55 backdrop-blur-2xl ring-1 ring-white/60 rounded-3xl p-12 text-center text-xs text-slate-500 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)]">
          {search ? l('Ничего не найдено', 'Ештеңе табылмады', 'Nothing found') : tt('recordsEmpty')}
        </div>
      ) : (
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 rounded-3xl overflow-hidden shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)]">
          {/* Header row */}
          <div
            className="grid gap-3 px-5 py-3 border-b border-white/60 bg-white/30 text-[10px] uppercase tracking-wider text-slate-500"
            style={{ gridTemplateColumns: `repeat(${tableFields.length}, minmax(0, 1fr)) 120px 100px` }}
          >
            {tableFields.map(f => <div key={f.id} className="truncate">{fieldLabel(f, language)}</div>)}
            <div>{tt('recordCreated')}</div>
            <div className="text-right">·</div>
          </div>
          <div className="divide-y divide-white/50">
            {filtered.map(r => (
              <div
                key={r.id}
                className="grid gap-3 px-5 py-3 items-center text-xs hover:bg-white/40 transition-colors group"
                style={{ gridTemplateColumns: `repeat(${tableFields.length}, minmax(0, 1fr)) 120px 100px` }}
              >
                {tableFields.map(f => (
                  <div key={f.id} className="text-slate-900 truncate">{formatValue(f, r.values[f.id], language)}</div>
                ))}
                <div className="text-[10px] text-slate-500 font-mono tabular-nums">
                  {new Date(r.createdAt).toLocaleDateString(language === 'eng' ? 'en-GB' : 'ru-RU')}
                </div>
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditing(r); setShowForm(true); }}
                    className="p-1.5 hover:bg-white/70 ring-1 ring-transparent hover:ring-white/60 rounded-xl transition-all"
                    title={tt('editRecord')}
                  >
                    <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(r)}
                    className="p-1.5 hover:bg-rose-100/70 rounded-xl transition-colors"
                    title={tt('deleteRecord')}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
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

      {/* Glass delete confirmation */}
      {confirmDelete && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-[80] flex items-center justify-center p-4"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-white/85 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl w-full max-w-sm p-6 shadow-[0_24px_64px_-12px_var(--accent-shadow-sm)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-100/70 text-rose-700 ring-1 ring-white/60 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="text-center text-sm text-slate-900 mb-1">{tt('deleteRecord')}?</div>
            <div className="text-center text-[11px] text-slate-500 mb-5 leading-relaxed">
              {l('Запись будет удалена без возможности восстановить.',
                 'Жазба қайтарылмастан жойылады.',
                 'The record will be removed with no way to restore.')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-2.5 bg-white/70 hover:bg-white ring-1 ring-white/60 text-slate-700 rounded-2xl text-xs transition-colors"
              >
                {tt('cancel')}
              </button>
              <button
                onClick={() => { store.deleteCustomRecord(moduleId, confirmDelete.id); setConfirmDelete(null); }}
                className="px-3 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs transition-colors shadow-[0_8px_24px_-8px_rgba(225,29,72,0.5)]"
              >
                {tt('deleteRecord')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white/85 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-[0_24px_64px_-12px_var(--accent-shadow-sm)]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-white/60 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 mb-1 tracking-widest uppercase">{mod.labels[language]}</div>
            <div className="text-lg text-slate-900 tracking-tight">{editing ? tt('editRecord') : tt('addRecord')}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 bg-white/60 hover:bg-white ring-1 ring-white/60 rounded-2xl flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {fields.length === 0 && (
            <div className="text-[11px] text-slate-500 italic px-3 py-3 bg-white/40 ring-1 ring-white/60 rounded-2xl backdrop-blur-xl">
              {l('У этого модуля нет полей. Сначала добавьте поля в Настройки → Модули.', 'Бұл модульдің өрістері жоқ.', 'No fields. Add some in Settings → Modules.')}
            </div>
          )}
          {fields.map(f => (
            <div key={f.id}>
              <label className="block text-[11px] text-slate-500 mb-1.5">
                {fieldLabel(f, language)} {f.required && <span className="text-rose-500">*</span>}
              </label>
              {f.type === 'textarea' ? (
                <textarea
                  value={values[f.id] || ''}
                  onChange={e => { setValues(v => ({ ...v, [f.id]: e.target.value })); setError(''); }}
                  rows={3}
                  className={`${INPUT} resize-none`}
                />
              ) : f.type === 'number' ? (
                <input
                  type="number"
                  value={values[f.id] ?? ''}
                  onChange={e => { setValues(v => ({ ...v, [f.id]: e.target.value === '' ? '' : Number(e.target.value) })); setError(''); }}
                  className={INPUT}
                />
              ) : f.type === 'date' ? (
                <input
                  type="date"
                  value={values[f.id] || ''}
                  onChange={e => { setValues(v => ({ ...v, [f.id]: e.target.value })); setError(''); }}
                  className={INPUT}
                />
              ) : f.type === 'select' ? (
                <select
                  value={values[f.id] || ''}
                  onChange={e => { setValues(v => ({ ...v, [f.id]: e.target.value })); setError(''); }}
                  className={INPUT}
                >
                  <option value="">—</option>
                  {(f.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 cursor-pointer px-3 py-2.5 bg-white/40 ring-1 ring-white/60 rounded-2xl backdrop-blur-xl hover:bg-white/60 transition-colors">
                  <input
                    type="checkbox"
                    checked={!!values[f.id]}
                    onChange={e => { setValues(v => ({ ...v, [f.id]: e.target.checked })); setError(''); }}
                    className="rounded accent-slate-900"
                  />
                  <span className="text-xs text-slate-700">{fieldLabel(f, language)}</span>
                </label>
              ) : (
                <input
                  type="text"
                  value={values[f.id] || ''}
                  onChange={e => { setValues(v => ({ ...v, [f.id]: e.target.value })); setError(''); }}
                  className={INPUT}
                />
              )}
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-white/60 flex items-center gap-2">
          {error && <span className="text-xs text-rose-600 mr-auto">{error}</span>}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/60 ring-1 ring-white/60 text-slate-700 rounded-2xl text-xs hover:bg-white transition-colors"
          >
            {tt('cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={fields.length === 0}
            className="px-4 py-2 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 disabled:opacity-30 disabled:shadow-none transition-all"
          >
            {tt('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
