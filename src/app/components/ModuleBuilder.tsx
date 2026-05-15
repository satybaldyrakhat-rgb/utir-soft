import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Eye, EyeOff, GripVertical } from 'lucide-react';
import { CUSTOM_ICON_IDS, CustomIcon } from './CustomIcons';
import { useDataStore, ALL_ROLES, type CustomFieldDef, type CustomFieldType, type PlatformModule, type RoleKey } from '../utils/dataStore';
import { t, translations } from '../utils/translations';

interface Props {
  language: 'kz' | 'ru' | 'eng';
  onClose: () => void;
  editing?: PlatformModule;       // pass existing custom module to edit; undefined = create
}

const FIELD_TYPES: { value: CustomFieldType; tKey: keyof typeof translations }[] = [
  { value: 'text',      tKey: 'fieldTypeText' },
  { value: 'textarea',  tKey: 'fieldTypeTextarea' },
  { value: 'number',    tKey: 'fieldTypeNumber' },
  { value: 'date',      tKey: 'fieldTypeDate' },
  { value: 'select',    tKey: 'fieldTypeSelect' },
  { value: 'checkbox',  tKey: 'fieldTypeCheckbox' },
];

const newFieldId = () => 'f_' + Math.random().toString(36).slice(2, 8);
const newModuleId = () => 'm_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

export function ModuleBuilder({ language, onClose, editing }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const tt = (key: Parameters<typeof t>[0]) => t(key, language);
  const store = useDataStore();

  const [labelRu, setLabelRu] = useState(editing?.labels.ru || '');
  const [labelKz, setLabelKz] = useState(editing?.labels.kz || '');
  const [labelEng, setLabelEng] = useState(editing?.labels.eng || '');
  const [iconName, setIconName] = useState<string>(editing?.icon || 'box');
  const [fields, setFields] = useState<CustomFieldDef[]>(editing?.fields ? [...editing.fields] : []);
  const [access, setAccess] = useState<{ manager: boolean; employee: boolean }>(
    editing?.roleAccess || { manager: true, employee: false }
  );
  const [error, setError] = useState('');

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const addField = () => {
    setFields(f => [...f, { id: newFieldId(), type: 'text', label: { ru: '', kz: '', eng: '' } }]);
  };

  const updateField = (id: string, patch: Partial<CustomFieldDef>) => {
    setFields(f => f.map(x => x.id === id ? { ...x, ...patch } : x));
  };

  const removeField = (id: string) => {
    setFields(f => f.filter(x => x.id !== id));
  };

  const toggleRole = (r: Exclude<RoleKey, 'admin'>) => {
    setAccess(a => ({ ...a, [r]: !a[r] }));
  };

  const handleSave = () => {
    // Front-end validation: name in at least one language, every field has a RU label and a type,
    // every select has at least one option.
    if (!labelRu.trim() && !labelKz.trim() && !labelEng.trim()) {
      setError(l('Введите название модуля', 'Модуль атауын енгізіңіз', 'Enter module name'));
      return;
    }
    for (const f of fields) {
      if (!f.label.ru.trim() && !f.label.kz.trim() && !f.label.eng.trim()) {
        setError(l('У каждого поля должно быть название', 'Әр өрістің атауы болуы керек', 'Every field needs a name'));
        return;
      }
      if (f.type === 'select' && (!f.options || f.options.filter(o => o.trim()).length === 0)) {
        setError(l('У выпадающего списка должны быть варианты', 'Тізімде опциялар болуы керек', 'Select needs at least one option'));
        return;
      }
    }

    const labels = {
      ru: labelRu.trim() || labelEng.trim() || labelKz.trim(),
      kz: labelKz.trim() || labelRu.trim() || labelEng.trim(),
      eng: labelEng.trim() || labelRu.trim() || labelKz.trim(),
    };

    if (editing) {
      store.updateModule(editing.id, { labels, icon: iconName, fields, roleAccess: access });
    } else {
      store.addCustomModule({
        id: newModuleId(),
        labels,
        icon: iconName,
        fields,
        roleAccess: access,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center"><CustomIcon name={iconName} className="w-4 h-4 text-gray-700" /></div>
            <div>
              <div className="text-sm text-gray-900">{editing ? tt('editCustomModule') : tt('newCustomModule')}</div>
              <div className="text-[10px] text-gray-400">{tt('customModule')}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center hover:bg-gray-100"><X className="w-3.5 h-3.5 text-gray-400" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Basics: name + icon */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">{tt('builderBasicInfo')}</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
              {(['ru', 'kz', 'eng'] as const).map(lng => (
                <div key={lng}>
                  <label className="block text-[10px] uppercase text-gray-400 mb-1">{lng}</label>
                  <input
                    type="text"
                    value={lng === 'ru' ? labelRu : lng === 'kz' ? labelKz : labelEng}
                    onChange={e => { setError(''); (lng === 'ru' ? setLabelRu : lng === 'kz' ? setLabelKz : setLabelEng)(e.target.value); }}
                    placeholder={tt('builderName')}
                    className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-[10px] uppercase text-gray-400 mb-2">{tt('builderIcon')}</label>
              <div className="grid grid-cols-8 sm:grid-cols-12 gap-1.5">
                {CUSTOM_ICON_IDS.map(id => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setIconName(id)}
                    title={id}
                    className={`aspect-square rounded-lg flex items-center justify-center transition ${iconName === id ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                  >
                    <CustomIcon name={id} className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Fields */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-400">{tt('builderFields')}</div>
              <button onClick={addField} className="flex items-center gap-1 text-[11px] text-gray-700 hover:text-gray-900 px-2 py-1 bg-gray-50 hover:bg-gray-100 rounded-lg">
                <Plus className="w-3 h-3" />{tt('builderAddField')}
              </button>
            </div>
            {fields.length === 0 ? (
              <div className="text-[11px] text-gray-400 italic px-2 py-6 bg-gray-50 rounded-xl text-center">{tt('builderNoFields')}</div>
            ) : (
              <div className="space-y-2">
                {fields.map((f, idx) => (
                  <div key={f.id} className="border border-gray-100 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-3 h-3 text-gray-300" />
                      <span className="text-[10px] text-gray-400 tabular-nums">#{idx + 1}</span>
                      <select
                        value={f.type}
                        onChange={e => updateField(f.id, { type: e.target.value as CustomFieldType })}
                        className="px-2 py-1 bg-gray-50 rounded-lg text-[11px] focus:outline-none text-gray-700"
                      >
                        {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{tt(ft.tKey)}</option>)}
                      </select>
                      <label className="flex items-center gap-1 text-[11px] text-gray-500 cursor-pointer ml-auto">
                        <input
                          type="checkbox"
                          checked={!!f.required}
                          onChange={e => updateField(f.id, { required: e.target.checked })}
                          className="rounded accent-gray-900"
                        />
                        {tt('builderFieldRequired')}
                      </label>
                      <button onClick={() => removeField(f.id)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['ru', 'kz', 'eng'] as const).map(lng => (
                        <input
                          key={lng}
                          type="text"
                          value={f.label[lng]}
                          onChange={e => updateField(f.id, { label: { ...f.label, [lng]: e.target.value } })}
                          placeholder={`${tt('builderFieldLabel')} (${lng})`}
                          className="w-full px-2.5 py-1.5 bg-gray-50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-gray-200"
                        />
                      ))}
                    </div>
                    {f.type === 'select' && (
                      <textarea
                        value={(f.options || []).join('\n')}
                        onChange={e => updateField(f.id, { options: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
                        placeholder={tt('builderFieldOptions')}
                        rows={3}
                        className="w-full px-2.5 py-1.5 bg-gray-50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-gray-200 resize-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Permissions */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-3">{tt('builderPermissions')}</div>
            <div className="space-y-1.5">
              {ALL_ROLES.map(r => {
                const isAdmin = r === 'admin';
                const granted = isAdmin ? true : !!access[r as Exclude<RoleKey, 'admin'>];
                const label = r === 'admin' ? tt('roleAdmin') : r === 'manager' ? tt('roleManager') : tt('roleEmployee');
                return (
                  <label key={r} className={`flex items-center gap-2.5 p-3 border rounded-xl transition ${granted ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:bg-gray-50'} ${isAdmin ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={granted}
                      disabled={isAdmin}
                      onChange={() => !isAdmin && toggleRole(r as Exclude<RoleKey, 'admin'>)}
                      className="rounded"
                    />
                    <span className="text-xs text-gray-700 flex-1">{label}</span>
                    {granted ? <Eye className="w-3.5 h-3.5 text-emerald-500" /> : <EyeOff className="w-3.5 h-3.5 text-gray-300" />}
                  </label>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-50 flex items-center gap-2 flex-shrink-0">
          {error && <span className="text-xs text-red-500 mr-auto">{error}</span>}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 border border-gray-100 rounded-xl text-xs hover:bg-gray-50">{tt('cancel')}</button>
          <button onClick={handleSave} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800">{tt('builderSave')}</button>
        </div>
      </div>
    </div>
  );
}
