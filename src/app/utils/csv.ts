// CSV export helper. Used by Sales / Tasks / Team pages to give admins a
// one-click 'выгрузить в Excel' button.
//
// Output is UTF-8 with a BOM so Excel auto-detects encoding (Cyrillic shows
// correctly without manual import steps).

export type CsvColumn<T> = {
  header: string;
  // Either a key on the row, or a function that derives the value.
  value: keyof T | ((row: T) => string | number | undefined | null);
};

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // RFC 4180: wrap in quotes if cell contains comma, quote or newline. Double
  // any embedded quotes inside.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map(c => escapeCell(c.header)).join(',');
  const body = rows.map(row =>
    columns.map(c => {
      const raw = typeof c.value === 'function' ? c.value(row) : (row as any)[c.value];
      return escapeCell(raw);
    }).join(','),
  );
  // ﻿ = UTF-8 BOM, makes Excel pick up encoding correctly.
  return '﻿' + [header, ...body].join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Free the blob URL on the next tick — small but adds up over a session.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Build a date-stamped filename like 'utir-deals-2026-05-16.csv'.
export function todayStampedName(base: string): string {
  return `utir-${base}-${new Date().toISOString().slice(0, 10)}.csv`;
}

// ─── CSV parser ────────────────────────────────────────────────────
// Minimal RFC-4180-ish parser: handles quoted cells with embedded commas
// and newlines, escaped quotes (""), \r\n / \r / \n line endings, and an
// optional leading UTF-8 BOM. Used by CSV-import flows.

export function parseCsv(input: string): string[][] {
  // Strip BOM if present.
  if (input.charCodeAt(0) === 0xFEFF) input = input.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        // Double-quote inside a quoted field → literal "
        if (input[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(cell); cell = ''; i++; continue; }
    if (c === '\r' || c === '\n') {
      row.push(cell); cell = ''; rows.push(row); row = [];
      // Eat \r\n pair as one line break.
      if (c === '\r' && input[i + 1] === '\n') i += 2; else i++;
      continue;
    }
    cell += c; i++;
  }
  // Push the trailing cell / row if the file didn't end with a newline.
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  // Drop empty trailing rows so a file ending in '\n' doesn't add a phantom row.
  while (rows.length > 0 && rows[rows.length - 1].every(v => v === '')) rows.pop();
  return rows;
}

// Turn a parsed CSV into [{ header: value, ... }] using the first row
// as headers. Whitespace-trims keys.
export function csvToObjects(parsed: string[][]): Record<string, string>[] {
  if (parsed.length === 0) return [];
  const headers = parsed[0].map(h => h.trim());
  return parsed.slice(1).map(r => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = r[i] ?? '';
    return obj;
  });
}
