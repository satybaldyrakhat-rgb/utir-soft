import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Package, Wrench, Settings2, Layers, Sparkles, Plus, X, Search, Edit2, Trash2,
  Download, Upload, Check, AlertTriangle, Loader2, RotateCcw,
} from 'lucide-react';
import { useDataStore, type CatalogKey } from '../utils/dataStore';
import { t } from '../utils/translations';

interface Props { language: 'kz' | 'ru' | 'eng' }

// One row of metadata per catalog — icon, accent colour, human title in
// 3 langs, short description. Keeps the page self-explanatory for first-
// timers without needing tooltips.
interface CatalogMeta {
  key: CatalogKey;
  icon: any;
  cls: string;
  titles: { ru: string; kz: string; eng: string };
  descriptions: { ru: string; kz: string; eng: string };
  placeholder: string;
}

const CATALOG_META: CatalogMeta[] = [
  {
    key: 'productTemplates',
    icon: Package, cls: 'bg-violet-50 text-violet-700',
    titles: { ru: 'Шаблоны изделий', kz: 'Бұйым шаблондары', eng: 'Product templates' },
    descriptions: {
      ru: 'Типовые позиции, которые часто продаёте. Появляются в выпадашке при создании сделки.',
      kz: 'Жиі сатылатын типтік позициялар.',
      eng: 'Common product names. Appear in the deal-creation dropdown.',
    },
    placeholder: 'Кухня прямая 3м, Шкаф-купе 2 двери…',
  },
  {
    key: 'materials',
    icon: Layers, cls: 'bg-amber-50 text-amber-700',
    titles: { ru: 'Материалы', kz: 'Материалдар', eng: 'Materials' },
    descriptions: {
      ru: 'Плиты, кромка, столешницы — что используете в производстве.',
      kz: 'Плита, кромка, үстел беті.',
      eng: 'Boards, edging, countertops — anything used in production.',
    },
    placeholder: 'ЛДСП Egger белый, Кромка ПВХ 2мм…',
  },
  {
    key: 'hardware',
    icon: Wrench, cls: 'bg-sky-50 text-sky-700',
    titles: { ru: 'Фурнитура', kz: 'Фурнитура', eng: 'Hardware' },
    descriptions: {
      ru: 'Петли, направляющие, ручки. Используется в BOM-калькуляторе.',
      kz: 'Топса, бағыттаушы, тұтқа.',
      eng: 'Hinges, slides, handles. Used by the BOM calculator.',
    },
    placeholder: 'Петли Blum, Направляющие Hettich…',
  },
  {
    key: 'addons',
    icon: Sparkles, cls: 'bg-emerald-50 text-emerald-700',
    titles: { ru: 'Доп. опции', kz: 'Қосымша опциялар', eng: 'Add-ons' },
    descriptions: {
      ru: 'Подсветка, доводчики, антресоли — пункты доп.продаж.',
      kz: 'Жарықтандыру, доводчик, антресоль.',
      eng: 'Lighting, soft-close, mezzanine — upsell items.',
    },
    placeholder: 'LED-подсветка, Доводчики Blum…',
  },
  {
    key: 'furnitureTypes',
    icon: Settings2, cls: 'bg-rose-50 text-rose-700',
    titles: { ru: 'Типы мебели', kz: 'Мебель түрлері', eng: 'Furniture types' },
    descriptions: {
      ru: 'Категории: кухня, гардероб, прихожая. Группировка для аналитики.',
      kz: 'Категориялар.',
      eng: 'Categories: kitchen, wardrobe, hallway. Used for analytics.',
    },
    placeholder: 'Кухня, Шкаф-купе, Гардероб…',
  },
];

export function CatalogsSettings({ language }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();

  const [search, setSearch]   = useState('');
  const [drafts, setDrafts]   = useState<Record<CatalogKey, string>>({
    productTemplates: '', materials: '', hardware: '', addons: '', furnitureTypes: '',
  });
  const [editing, setEditing] = useState<{ key: CatalogKey; original: string; value: string } | null>(null);
  const [toast, setToast]     = useState<string | null>(null);
  const importInputRef        = useRef<HTMLInputElement>(null);
  const [importingKey, setImportingKey] = useState<CatalogKey | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const flash = (msg: string) => setToast(msg);

  // KPI counters — total catalogs, total items, filled vs empty.
  const totals = useMemo(() => {
    const cats = Object.values(store.catalogs);
    const items = cats.reduce((s, list) => s + list.length, 0);
    const filled = cats.filter(list => list.length > 0).length;
    return { catalogs: cats.length, items, filled, empty: cats.length - filled };
  }, [store.catalogs]);

  function add(key: CatalogKey) {
    const v = drafts[key].trim();
    if (!v) return;
    store.addCatalogItem(key, v);
    setDrafts(prev => ({ ...prev, [key]: '' }));
    flash(l('Добавлено', 'Қосылды', 'Added'));
  }

  function remove(key: CatalogKey, value: string) {
    if (!confirm(l(`Удалить «${value}»?`, 'Жоюға?', `Delete «${value}»?`))) return;
    store.removeCatalogItem(key, value);
    flash(l('Удалено', 'Жойылды', 'Removed'));
  }

  function commitEdit() {
    if (!editing) return;
    if (!editing.value.trim()) { setEditing(null); return; }
    if (editing.value.trim() !== editing.original) {
      store.renameCatalogItem(editing.key, editing.original, editing.value);
      flash(l('Изменено', 'Өзгерді', 'Updated'));
    }
    setEditing(null);
  }

  function clearAll(key: CatalogKey, title: string) {
    if (!confirm(l(`Очистить весь справочник «${title}»? Действие не отменить.`, '...', `Clear all from «${title}»? Cannot be undone.`))) return;
    store.replaceCatalog(key, []);
    flash(l('Справочник очищен', 'Анықтамалық тазартылды', 'Catalog cleared'));
  }

  // ─── CSV import/export ──────────────────────────────────────────
  // One catalog = one CSV file with a header row + one item per line.
  function exportCSV(key: CatalogKey, title: string) {
    const items = store.catalogs[key];
    if (items.length === 0) { flash(l('Справочник пустой', '...', 'Catalog is empty')); return; }
    const csv = `name\n${items.map(x => /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x).join('\n')}`;
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catalog-${key}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(l('CSV скачан', 'CSV жүктелді', 'CSV downloaded'));
  }

  async function handleImport(file: File) {
    if (!importingKey) return;
    try {
      const text = await file.text();
      // Parse — supports both raw lines and CSV with header. We take the
      // first column of each row, skipping the «name» header if present.
      const rows = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      if (rows.length === 0) { flash(l('Файл пустой', '...', 'Empty file')); return; }
      const start = rows[0].toLowerCase() === 'name' ? 1 : 0;
      const items = rows.slice(start).map(row => {
        // Strip surrounding quotes + handle escaped quotes («""» → «"»).
        const cell = row.split(',')[0];
        return cell.startsWith('"') && cell.endsWith('"')
          ? cell.slice(1, -1).replace(/""/g, '"')
          : cell;
      }).filter(Boolean);
      // Merge with existing — append-only, dedupe.
      const merged = Array.from(new Set([...store.catalogs[importingKey], ...items]));
      store.replaceCatalog(importingKey, merged);
      flash(l(`Импортировано: ${items.length} (всего ${merged.length})`, '...', `Imported ${items.length} (total ${merged.length})`));
    } catch (e: any) {
      flash(l('Ошибка импорта: ', 'Қате: ', 'Import error: ') + (e?.message || e));
    } finally {
      setImportingKey(null);
    }
  }

  return (
    <div className="space-y-5 relative">
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div>
        <h2 className="text-gray-900 mb-1">{l('Справочники', 'Анықтамалықтар', 'Catalogs')}</h2>
        <p className="text-xs text-gray-400 max-w-xl">
          {l('Шаблоны, материалы, фурнитура и категории, которыми пользуется вся команда. Изменения сразу видны у всех сотрудников. Каждое действие пишется в журнал.',
             'Бүкіл команда қолданатын шаблондар, материалдар, фурнитура.',
             'Templates, materials, hardware and categories everyone on the team picks from. Changes are visible team-wide and logged.')}
        </p>
      </div>

      {/* ─── KPI strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: l('Справочников',  'Анықтамалық',     'Catalogs'),    value: totals.catalogs, sub: l('всего', 'барлығы', 'total'),       cls: 'bg-gray-50 text-gray-700' },
          { label: l('Записей',       'Жазба',            'Items'),       value: totals.items,    sub: l('в сумме', 'жиыны', 'across all'), cls: 'bg-sky-50 text-sky-700' },
          { label: l('Заполнены',     'Толтырылған',      'Filled'),      value: totals.filled,   sub: `${Math.round(totals.filled / Math.max(1, totals.catalogs) * 100)}%`, cls: 'bg-emerald-50 text-emerald-700' },
          { label: l('Пустых',        'Бос',              'Empty'),       value: totals.empty,    sub: l('требуют внимания', 'назар аудару', 'need attention'), cls: 'bg-amber-50 text-amber-700' },
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

      {/* ─── Search ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-2 flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-gray-300 ml-2" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={l('Поиск по всем справочникам…', 'Барлық анықтамалықтардан іздеу…', 'Search all catalogs…')}
          className="flex-1 bg-transparent text-xs focus:outline-none placeholder:text-gray-400"
        />
        {search && (
          <button onClick={() => setSearch('')} className="w-6 h-6 hover:bg-gray-50 rounded-md flex items-center justify-center">
            <X className="w-3 h-3 text-gray-400" />
          </button>
        )}
      </div>

      {/* Hidden file input — driven by importingKey state */}
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleImport(f);
          e.target.value = '';
        }}
      />

      {/* ─── Per-catalog cards ──────────────────────────────────── */}
      {CATALOG_META.map(meta => {
        const Icon = meta.icon;
        const all = store.catalogs[meta.key];
        // Filter visible items by global search. We still show empty catalogs
        // (just with the «no matches» line) so the admin can add items here too.
        const items = search.trim()
          ? all.filter(x => x.toLowerCase().includes(search.toLowerCase()))
          : all;
        const title = meta.titles[language];
        return (
          <div key={meta.key} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.cls}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm text-gray-900">{title}</div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${all.length === 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                      {all.length} {l('записей', 'жазба', 'items')}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{meta.descriptions[language]}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => exportCSV(meta.key, title)}
                  disabled={all.length === 0}
                  title={l('Экспорт CSV', 'CSV экспорт', 'Export CSV')}
                  className="text-[11px] px-2.5 py-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg disabled:opacity-30 inline-flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> CSV
                </button>
                <button
                  onClick={() => { setImportingKey(meta.key); importInputRef.current?.click(); }}
                  title={l('Импорт CSV (добавит к существующим)', '...', 'Import CSV (append)')}
                  className="text-[11px] px-2.5 py-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg inline-flex items-center gap-1"
                >
                  <Upload className="w-3 h-3" /> CSV
                </button>
                {all.length > 0 && (
                  <button
                    onClick={() => clearAll(meta.key, title)}
                    title={l('Очистить весь справочник', '...', 'Clear all')}
                    className="text-[11px] px-2.5 py-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="p-4">
              {/* Items chips */}
              {items.length === 0 ? (
                <div className="text-center py-4 text-[11px] text-gray-400 italic">
                  {search
                    ? l(`Ничего не найдено по «${search}»`, '...', `Nothing matches «${search}»`)
                    : l('Пока пусто. Добавьте первую запись ниже или импортируйте CSV.', 'Әзірше бос.', 'Empty. Add your first item below or import a CSV.')}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {items.map(item => {
                    const isEditing = editing?.key === meta.key && editing?.original === item;
                    return (
                      <div key={item}>
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1 bg-violet-50 border border-violet-200 rounded-lg pl-2 pr-1 py-0.5">
                            <input
                              autoFocus
                              value={editing.value}
                              onChange={e => setEditing({ ...editing, value: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                                if (e.key === 'Escape') { e.preventDefault(); setEditing(null); }
                              }}
                              className="bg-transparent text-xs focus:outline-none min-w-24"
                              style={{ width: `${Math.max(8, editing.value.length + 1)}ch` }}
                            />
                            <button onClick={commitEdit} className="w-5 h-5 hover:bg-violet-100 rounded flex items-center justify-center">
                              <Check className="w-3 h-3 text-violet-700" />
                            </button>
                            <button onClick={() => setEditing(null)} className="w-5 h-5 hover:bg-gray-100 rounded flex items-center justify-center">
                              <X className="w-3 h-3 text-gray-500" />
                            </button>
                          </div>
                        ) : (
                          <span className="group inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 hover:bg-gray-100 rounded-lg text-xs text-gray-700">
                            {item}
                            <button
                              onClick={() => setEditing({ key: meta.key, original: item, value: item })}
                              className="text-gray-300 hover:text-violet-600 opacity-0 group-hover:opacity-100 transition"
                              title={l('Изменить', 'Өзгерту', 'Edit')}
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => remove(meta.key, item)}
                              className="text-gray-300 hover:text-red-500 transition"
                              title={l('Удалить', 'Жою', 'Delete')}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add input */}
              <div className="flex gap-2 mt-3">
                <input
                  type="text"
                  value={drafts[meta.key]}
                  onChange={e => setDrafts(prev => ({ ...prev, [meta.key]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(meta.key); } }}
                  placeholder={meta.placeholder}
                  className="flex-1 px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                />
                <button
                  onClick={() => add(meta.key)}
                  disabled={!drafts[meta.key].trim()}
                  className="px-3 py-2 bg-gray-900 text-white rounded-xl text-xs hover:bg-gray-800 disabled:opacity-30 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> {l('Добавить', 'Қосу', 'Add')}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Footer hint about CSV format */}
      <div className="bg-sky-50 border border-sky-100 rounded-xl px-4 py-3 text-[11px] text-sky-800 flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <div>
          <b>{l('Формат CSV:', 'CSV форматы:', 'CSV format:')}</b>{' '}
          {l('одна колонка «name», по одной записи в строке. Заголовок можно опустить. Импорт добавляет к существующим, дубликаты пропускаются.',
             'Бір баған, бір жолда бір жазба.',
             'One column «name», one item per row. Header optional. Import appends, dedupes.')}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 z-[100]">
          <Check className="w-3.5 h-3.5 text-green-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
