// Bank statement import + reconciliation (Ф6).
// Upload a CSV export from Halyk / Kaspi / Forte etc., map columns, and
// the modal matches each line against existing completed transactions
// (same amount within ±3 days). Matched rows are marked «сверено»;
// unmatched rows can be imported as new transactions in one click.
// Saves the accountant the manual statement-vs-CRM reconciliation.

import { useMemo, useState } from 'react';
import { X, Upload, Check, AlertCircle, Loader2, Banknote } from 'lucide-react';
import { parseCsv, csvToObjects } from '../../utils/csv';
import { useDataStore } from '../../utils/dataStore';

interface Props { language: 'kz' | 'ru' | 'eng'; onClose: () => void; }

interface BankRow {
  date: string;       // YYYY-MM-DD
  amount: number;     // signed: + income, − expense
  description: string;
  matched: boolean;   // found an existing transaction
}

// Header aliases for the three columns we need. Covers common KZ bank exports.
const DATE_H = ['дата', 'date', 'дата операции', 'дата проводки', 'күні'];
const AMOUNT_H = ['сумма', 'amount', 'сумма операции', 'сома'];
const DEBIT_H = ['расход', 'дебет', 'debit', 'списание'];
const CREDIT_H = ['приход', 'кредит', 'credit', 'зачисление', 'поступление'];
const DESC_H = ['назначение', 'описание', 'детали', 'description', 'контрагент', 'комментарий', 'мақсаты'];

function pick(obj: Record<string, string>, aliases: string[]): string {
  for (const k of Object.keys(obj)) {
    if (aliases.includes(k.toLowerCase().trim())) return obj[k];
  }
  return '';
}
function toNum(s: string): number {
  // Strip spaces / currency, normalise comma decimal.
  const n = Number(String(s || '').replace(/[^\d,.\-]/g, '').replace(/\s/g, '').replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}
function toISODate(s: string): string {
  const t = String(s || '').trim();
  // dd.mm.yyyy → yyyy-mm-dd
  const m = t.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  // already iso-ish
  const iso = t.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
}

export function BankImportModal({ language, onClose }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();
  const [rows, setRows] = useState<BankRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  const matchExisting = (date: string, amount: number): boolean => {
    const target = new Date(date).getTime();
    const absAmt = Math.abs(amount);
    return store.transactions.some(t => {
      if (t.status !== 'completed') return false;
      if (Math.abs(t.amount - absAmt) > 1) return false;
      const td = new Date(t.date).getTime();
      return !isNaN(td) && Math.abs(td - target) <= 3 * 86400000;
    });
  };

  const onFile = async (file: File) => {
    setError('');
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) { setError(l('Файл пустой или без строк.', 'Файл бос.', 'Empty file.')); return; }
      const objs = csvToObjects(parsed);
      const out: BankRow[] = [];
      for (const o of objs) {
        const date = toISODate(pick(o, DATE_H));
        if (!date) continue;
        let amount = toNum(pick(o, AMOUNT_H));
        if (!amount) {
          const debit = toNum(pick(o, DEBIT_H));
          const credit = toNum(pick(o, CREDIT_H));
          amount = credit - debit; // + income, − expense
        }
        if (!amount) continue;
        const description = pick(o, DESC_H) || '';
        out.push({ date, amount, description, matched: matchExisting(date, amount) });
      }
      if (out.length === 0) { setError(l('Не нашёл колонки дата/сумма. Проверьте заголовки CSV.', 'Баған табылмады.', 'No date/amount columns found.')); return; }
      setRows(out);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  };

  const unmatched = useMemo(() => (rows || []).filter(r => !r.matched), [rows]);
  const matchedCount = (rows || []).length - unmatched.length;

  const importNew = async () => {
    if (unmatched.length === 0) return;
    setBusy(true);
    let n = 0;
    for (const r of unmatched) {
      store.addTransaction({
        type: r.amount >= 0 ? 'income' : 'expense',
        category: r.amount >= 0 ? l('Поступление', 'Түсім', 'Income') : l('Расход', 'Шығыс', 'Expense'),
        amount: Math.abs(r.amount),
        date: r.date,
        description: (r.description || l('Импорт из выписки', 'Выпискадан', 'Bank import')).slice(0, 200),
        status: 'completed',
        account: 'bank',
      });
      n++;
    }
    setDone(n);
    setBusy(false);
    setTimeout(onClose, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote className="w-4 h-4 text-sky-600" />
            <div className="text-sm text-gray-900">{l('Импорт банковской выписки', 'Банк выпискасын импорттау', 'Bank statement import')}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {!rows ? (
            <>
              <label className="flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-sky-300 hover:bg-sky-50/40 transition-colors">
                <Upload className="w-7 h-7 text-gray-300" />
                <span className="text-xs text-gray-500">{l('Загрузить CSV выписки', 'CSV жүктеу', 'Upload statement CSV')}</span>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
              </label>
              <div className="text-[11px] text-gray-400 leading-relaxed">
                {l('Поддерживаются выписки Halyk / Kaspi / Forte (CSV). Нужны колонки: дата, сумма (или приход/расход), назначение. Совпадения с существующими платежами помечаются «сверено», остальное можно импортировать.',
                   'Halyk / Kaspi / Forte CSV. Бағандар: күні, сома, мақсаты.',
                   'Halyk/Kaspi/Forte CSV with date, amount (or debit/credit), description columns.')}
              </div>
              {error && <div className="px-3 py-2 bg-rose-50 ring-1 ring-rose-100 rounded-xl text-xs text-rose-700 flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 mt-0.5" />{error}</div>}
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat label={l('Всего строк', 'Барлығы', 'Rows')} v={String(rows.length)} />
                <Stat label={l('Сверено', 'Сверилді', 'Matched')} v={String(matchedCount)} accent="emerald" />
                <Stat label={l('Новых', 'Жаңа', 'New')} v={String(unmatched.length)} accent="amber" />
              </div>
              <div className="border border-gray-100 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-[10px] text-gray-400 uppercase">
                    <tr>
                      <th className="text-left px-3 py-2 font-normal">{l('Дата', 'Күні', 'Date')}</th>
                      <th className="text-right px-3 py-2 font-normal">{l('Сумма', 'Сома', 'Amount')}</th>
                      <th className="text-left px-3 py-2 font-normal">{l('Назначение', 'Мақсаты', 'Description')}</th>
                      <th className="text-right px-3 py-2 font-normal">{l('Статус', 'Күй', 'Status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-3 py-2 text-gray-600">{r.date}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${r.amount >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{r.amount >= 0 ? '+' : '−'}{Math.abs(r.amount).toLocaleString('ru-RU')}</td>
                        <td className="px-3 py-2 text-gray-600 truncate max-w-[220px]">{r.description}</td>
                        <td className="px-3 py-2 text-right">
                          {r.matched
                            ? <span className="text-emerald-600 inline-flex items-center gap-1"><Check className="w-3 h-3" />{l('сверено', 'сверилді', 'matched')}</span>
                            : <span className="text-amber-600">{l('новая', 'жаңа', 'new')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {done > 0 && <div className="text-xs text-emerald-600 text-center">{l(`Импортировано ${done} операций ✓`, `${done} импортталды ✓`, `Imported ${done} ✓`)}</div>}
            </>
          )}
        </div>

        {rows && (
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
            <button onClick={() => { setRows(null); setError(''); }} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900">{l('Другой файл', 'Басқа файл', 'Another file')}</button>
            <button onClick={importNew} disabled={busy || unmatched.length === 0} className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {l(`Импортировать новые (${unmatched.length})`, `Жаңасын импорттау (${unmatched.length})`, `Import new (${unmatched.length})`)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, v, accent }: { label: string; v: string; accent?: 'emerald' | 'amber' }) {
  return (
    <div className={`rounded-2xl p-3 ring-1 ${accent === 'emerald' ? 'bg-emerald-50/70 ring-emerald-100/60' : accent === 'amber' ? 'bg-amber-50/70 ring-amber-100/60' : 'bg-gray-50 ring-gray-100'}`}>
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className={`text-base tabular-nums ${accent === 'emerald' ? 'text-emerald-700' : accent === 'amber' ? 'text-amber-700' : 'text-gray-900'}`}>{v}</div>
    </div>
  );
}
