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
