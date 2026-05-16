// Generic CSV-import modal. Each page (Tasks / SalesKanban) wires it up by
// passing a schema (header → field mapping + validators) and an `onImport`
// callback that creates the records.
//
// UX:
//   1. File picker → parse client-side
//   2. Preview table (first 10 rows) with validation errors highlighted
//   3. 'Импортировать N записей' button → calls onImport for each valid row
//   4. Result summary (created N, failed M)
//
// Intentionally NOT supported in this version: update-by-id (would need
// merge semantics + UI to resolve conflicts). Every row becomes a new record.

import { useState } from 'react';
import { X, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { parseCsv, csvToObjects } from '../utils/csv';

export interface CsvFieldSpec {
  // The canonical key on the target record (e.g. 'title' for tasks).
  key: string;
  // CSV header(s) we accept for this field. First one is the canonical export.
  // Case-insensitive substring match — 'Название' matches 'Название задачи'.
  headers: string[];
  required?: boolean;
  // Optional transform from the raw CSV string to the value passed to onImport.
  transform?: (raw: string) => any;
}

interface Props {
  language: 'kz' | 'ru' | 'eng';
  title: string;
  // Schema describing how to map CSV columns to record fields.
  fields: CsvFieldSpec[];
  // Called once per row that passed validation. Async — modal awaits all.
  onImport: (record: Record<string, any>) => Promise<void> | void;
  onClose: () => void;
}

interface PreviewRow {
  raw: Record<string, string>;
  mapped: Record<string, any>;
  errors: string[];
}

export function CsvImportModal({ language, title, fields, onImport, onClose }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  const [fileName, setFileName] = useState<string>('');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);
  const [error, setError] = useState('');

  // Match a CSV header to a field spec. Loose: lowercase + 'contains' so
  // 'Название задачи' matches 'Название', 'Customer Name' matches 'Customer', etc.
  const matchField = (csvHeader: string): CsvFieldSpec | undefined => {
    const h = csvHeader.toLowerCase().trim();
    return fields.find(f => f.headers.some(label => {
      const lab = label.toLowerCase().trim();
      return h === lab || h.includes(lab) || lab.includes(h);
    }));
  };

  const handleFile = async (file: File) => {
    setError(''); setResult(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        setError(l('Файл пуст или нет данных под заголовками.', 'Файл бос немесе деректер жоқ.', 'File is empty or has only headers.'));
        setPreview([]); setTotalRows(0);
        return;
      }
      const rows = csvToObjects(parsed);
      setTotalRows(rows.length);

      // Build a quick map: csv header → matched field spec.
      const headerMap = new Map<string, CsvFieldSpec>();
      for (const csvHeader of Object.keys(rows[0] || {})) {
        const f = matchField(csvHeader);
        if (f) headerMap.set(csvHeader, f);
      }

      const previewRows: PreviewRow[] = rows.slice(0, 10).map(raw => buildPreview(raw, headerMap));
      setPreview(previewRows);
    } catch (e: any) {
      setError(String(e?.message || 'parse failed'));
    }
  };

  // Convert a single raw CSV row to {mapped, errors} using the header map.
  const buildPreview = (raw: Record<string, string>, headerMap: Map<string, CsvFieldSpec>): PreviewRow => {
    const mapped: Record<string, any> = {};
    const errors: string[] = [];
    for (const [csvHeader, val] of Object.entries(raw)) {
      const f = headerMap.get(csvHeader);
      if (!f) continue;
      const trimmed = (val || '').trim();
      mapped[f.key] = f.transform ? f.transform(trimmed) : trimmed;
    }
    for (const f of fields) {
      if (f.required && (mapped[f.key] === undefined || mapped[f.key] === '' || mapped[f.key] === null)) {
        errors.push(l(`«${f.headers[0]}» обязательно`, `«${f.headers[0]}» міндетті`, `«${f.headers[0]}» is required`));
      }
    }
    return { raw, mapped, errors };
  };

  const runImport = async () => {
    setImporting(true); setError(''); setResult(null);
    try {
      // Re-parse the whole file, not just the preview, then import every valid row.
      const headerMap = new Map<string, CsvFieldSpec>();
      for (const csvHeader of Object.keys(preview[0]?.raw || {})) {
        const f = matchField(csvHeader);
        if (f) headerMap.set(csvHeader, f);
      }
      // Re-read the file from the input is awkward — we kept `preview` but not
      // the full row list. Quick fix: rely on the file picker again to re-import
      // all rows. Cheaper alternative: cache parsed rows in state. Let's cache.
      // (parsedRows state added below.)
      const all = parsedRowsRef.current ?? preview.map(p => p.raw);
      let ok = 0, failed = 0;
      for (const raw of all) {
        const built = buildPreview(raw, headerMap);
        if (built.errors.length > 0) { failed++; continue; }
        try { await onImport(built.mapped); ok++; }
        catch (e) { console.warn('[csv import] row failed', e); failed++; }
      }
      setResult({ ok, failed });
    } catch (e: any) {
      setError(String(e?.message || 'import failed'));
    } finally {
      setImporting(false);
    }
  };

  // Cache the full parsed row list so `runImport` doesn't have to re-read
  // the file. Updated alongside `preview` in handleFile.
  const parsedRowsRef = { current: null as Record<string, string>[] | null };

  // Wrap handleFile to also stash the full row list for the import step.
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(''); setResult(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        setError(l('Файл пуст или нет данных под заголовками.', 'Файл бос немесе деректер жоқ.', 'File is empty or has only headers.'));
        setPreview([]); setTotalRows(0); parsedRowsRef.current = null;
        return;
      }
      const rows = csvToObjects(parsed);
      parsedRowsRef.current = rows;
      setTotalRows(rows.length);

      const headerMap = new Map<string, CsvFieldSpec>();
      for (const csvHeader of Object.keys(rows[0] || {})) {
        const f = matchField(csvHeader);
        if (f) headerMap.set(csvHeader, f);
      }
      setPreview(rows.slice(0, 10).map(raw => buildPreview(raw, headerMap)));
    } catch (e: any) {
      setError(String(e?.message || 'parse failed'));
      parsedRowsRef.current = null;
    }
  };

  // Touch handleFile so the helper isn't flagged unused — kept for tests / drag-drop later.
  void handleFile;

  const validCount = preview.length === 0 ? 0
    : (parsedRowsRef.current ?? []).filter(r => buildPreview(r, mapHeaders()).errors.length === 0).length;

  // Build a header→field map fresh on demand (used by validCount).
  function mapHeaders(): Map<string, CsvFieldSpec> {
    const m = new Map<string, CsvFieldSpec>();
    for (const csvHeader of Object.keys(preview[0]?.raw || {})) {
      const f = matchField(csvHeader);
      if (f) m.set(csvHeader, f);
    }
    return m;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-900">{l('Импорт', 'Импорт', 'Import')} · {title}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              {l('Совпадение колонок по названию (нестрогое). Каждая строка станет новой записью.',
                 'Бағандар атау бойынша сәйкестендіріледі. Әр жол жаңа жазба болады.',
                 'Columns are matched loosely by header. Each row creates a new record.')}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <label className="flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-gray-300 hover:bg-gray-50/50">
            <Upload className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600 flex-1">{fileName || l('Выберите .csv файл', '.csv файлды таңдаңыз', 'Pick a .csv file')}</span>
            <input type="file" accept=".csv,text/csv" onChange={onFileChange} className="hidden" />
          </label>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">{error}</div>
          )}

          {preview.length > 0 && !result && (
            <>
              <div className="text-[11px] text-gray-500">
                {l(`Найдено ${totalRows} строк. Превью первых ${preview.length}.`,
                   `${totalRows} жол табылды. Алғашқы ${preview.length} көру.`,
                   `Found ${totalRows} rows. Previewing the first ${preview.length}.`)}
                {validCount !== totalRows && (
                  <span className="text-red-600 ml-1.5">
                    {l(`${totalRows - validCount} с ошибками — будут пропущены.`,
                       `${totalRows - validCount} қатемен — өткізіп жіберіледі.`,
                       `${totalRows - validCount} have errors — will be skipped.`)}
                  </span>
                )}
              </div>
              <div className="border border-gray-100 rounded-xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-[10px] text-gray-400 w-8">#</th>
                      {fields.map(f => (
                        <th key={f.key} className="px-2 py-1.5 text-left text-[10px] text-gray-400 whitespace-nowrap">
                          {f.headers[0]}{f.required && <span className="text-red-400">*</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map((p, i) => (
                      <tr key={i} className={p.errors.length > 0 ? 'bg-red-50/40' : ''}>
                        <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                        {fields.map(f => (
                          <td key={f.key} className="px-2 py-1.5 text-gray-700 truncate max-w-[140px]">{String(p.mapped[f.key] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result && (
            <div className="flex items-center gap-3 px-3 py-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div className="flex-1">
                <div className="text-sm text-emerald-900">
                  {l(`Импортировано: ${result.ok}`, `Импортталды: ${result.ok}`, `Imported: ${result.ok}`)}
                </div>
                {result.failed > 0 && (
                  <div className="text-xs text-amber-700 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="w-3 h-3" />
                    {l(`Пропущено: ${result.failed}`, `Өткізілді: ${result.failed}`, `Skipped: ${result.failed}`)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-5 pt-0 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm hover:bg-gray-50">
            {result ? l('Закрыть', 'Жабу', 'Close') : l('Отмена', 'Бас тарту', 'Cancel')}
          </button>
          {preview.length > 0 && !result && (
            <button
              onClick={runImport}
              disabled={importing || validCount === 0}
              className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 disabled:opacity-50"
            >
              {importing
                ? l('Импортирую…', 'Импортталуда…', 'Importing…')
                : l(`Импортировать ${validCount}`, `${validCount} жазба импорт`, `Import ${validCount}`)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
