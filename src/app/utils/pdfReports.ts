// PDF report generator for the «Платежи» / «Финансы компании» sections.
// Renders proper Cyrillic-capable PDFs in the browser using jsPDF +
// jspdf-autotable. Default jsPDF fonts (Helvetica/Times) don't support
// Cyrillic, so we lazy-load Roboto Regular from a CDN on first use and
// register it with the document.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Cache the loaded font across all PDF generations so we don't re-fetch.
let cachedRobotoBase64: string | null = null;

async function loadRobotoFont(): Promise<string> {
  if (cachedRobotoBase64) return cachedRobotoBase64;
  // Roboto Regular as a stable TTF — jsdelivr serves Google's own font
  // repo so this is high-availability and free.
  const url = 'https://cdn.jsdelivr.net/gh/google/fonts/apache/roboto/static/Roboto-Regular.ttf';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Не удалось загрузить шрифт для PDF');
  const buf = await res.arrayBuffer();
  // ArrayBuffer → binary string → base64 (chunked to avoid call stack limits).
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  cachedRobotoBase64 = btoa(binary);
  return cachedRobotoBase64;
}

async function newDoc(): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  try {
    const fontBase64 = await loadRobotoFont();
    doc.addFileToVFS('Roboto-Regular.ttf', fontBase64);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.setFont('Roboto', 'normal');
  } catch (e) {
    // Fall back to default font — Cyrillic will look broken but at least
    // the report opens. Surface to console for debugging.
    console.warn('[pdfReports] font load failed, falling back to Helvetica', e);
  }
  return doc;
}

// ─── Common helpers ────────────────────────────────────────────────
const KZT = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';
const fmtDate = (d = new Date()) => d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });

function drawHeader(doc: jsPDF, title: string, subtitle: string, company?: string) {
  const pageW = doc.internal.pageSize.getWidth();
  // Top brand band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(title, 14, 14);
  doc.setFontSize(9);
  doc.text(subtitle, 14, 21);
  if (company) {
    const w = doc.getTextWidth(company);
    doc.text(company, pageW - 14 - w, 14);
  }
  doc.setTextColor(120, 120, 120);
  doc.setFontSize(8);
  const stamp = `Сформировано: ${fmtDate()}`;
  doc.text(stamp, pageW - 14 - doc.getTextWidth(stamp), 21);
  // Reset to body colour
  doc.setTextColor(15, 23, 42);
}

function drawFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Utir Soft · автоматический отчёт', 14, pageH - 8);
    const pageLabel = `${p} / ${pageCount}`;
    doc.text(pageLabel, pageW - 14 - doc.getTextWidth(pageLabel), pageH - 8);
  }
}

function drawKpiCards(doc: jsPDF, y: number, cards: Array<{ label: string; value: string; sub?: string; accent?: [number, number, number] }>): number {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const gap = 4;
  const cardW = (pageW - margin * 2 - gap * (cards.length - 1)) / cards.length;
  const cardH = 22;
  cards.forEach((c, i) => {
    const x = margin + i * (cardW + gap);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
    if (c.accent) {
      doc.setFillColor(...c.accent);
      doc.rect(x, y, 1.5, cardH, 'F');
    }
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(c.label.toUpperCase(), x + 4, y + 5);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(c.value, x + 4, y + 12);
    if (c.sub) {
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(c.sub, x + 4, y + 18);
    }
  });
  return y + cardH + 6;
}

// ─── Deal payments report ──────────────────────────────────────────
export interface PaymentDealRow {
  id: string;
  customerName: string;
  product?: string;
  amount: number;
  paid: number;
  status: 'paid' | 'partial' | 'pending';
  date?: string;
}

const STATUS_LABEL: Record<PaymentDealRow['status'], string> = {
  paid:    'Оплачен',
  partial: 'Частично',
  pending: 'Ожидает',
};

export async function generatePaymentsPDF(deals: PaymentDealRow[], opts?: { company?: string }) {
  const doc = await newDoc();
  drawHeader(doc, 'Отчёт по платежам', `Сделки и оплаты на ${fmtDate()}`, opts?.company);

  const total = deals.reduce((s, d) => s + d.amount, 0);
  const paid  = deals.reduce((s, d) => s + d.paid, 0);
  const due   = total - paid;
  const overdueCount = deals.filter(d => d.status !== 'paid').length;

  let y = 38;
  y = drawKpiCards(doc, y, [
    { label: 'Всего сделок', value: String(deals.length), sub: 'в отчёте' },
    { label: 'К оплате',     value: KZT(total),           accent: [100, 116, 139] },
    { label: 'Получено',     value: KZT(paid),            accent: [16, 185, 129] },
    { label: 'Остаток',      value: KZT(due),             sub: `${overdueCount} ожидают`, accent: [245, 158, 11] },
  ]);

  // Sorted by largest outstanding first — that's what the operator actually
  // wants to see (who owes us the most).
  const rows = [...deals]
    .sort((a, b) => (b.amount - b.paid) - (a.amount - a.paid))
    .map(d => [
      d.customerName,
      d.product || '—',
      d.date || '—',
      KZT(d.amount),
      KZT(d.paid),
      KZT(d.amount - d.paid),
      STATUS_LABEL[d.status],
    ]);

  autoTable(doc, {
    startY: y,
    head: [['Клиент', 'Продукт', 'Дата', 'Сумма', 'Оплачено', 'Остаток', 'Статус']],
    body: rows,
    styles: { font: 'Roboto', fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'normal', font: 'Roboto' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'center' },
    },
    margin: { left: 14, right: 14 },
    didDrawCell: data => {
      // Color the status cell green/amber/grey based on text.
      if (data.section === 'body' && data.column.index === 6) {
        const label = String(data.cell.raw);
        const colour: [number, number, number] | null =
          label === 'Оплачен'   ? [16, 185, 129] :
          label === 'Частично'  ? [245, 158, 11] :
          label === 'Ожидает'   ? [100, 116, 139] : null;
        if (colour) {
          doc.setTextColor(...colour);
          doc.setFontSize(8);
          doc.text(label, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center', baseline: 'middle' });
          // Tell autoTable we drew it ourselves so it doesn't redraw.
          (data.cell as any).text = [''];
        }
      }
    },
  });

  drawFooter(doc);
  doc.save(`platezhi-${todayStamp()}.pdf`);
}

// ─── Company finance report ───────────────────────────────────────
export interface FinanceTxRow {
  id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  date: string;
  description: string;
  status: 'completed' | 'pending' | 'overdue';
}

export async function generateFinancePDF(transactions: FinanceTxRow[], opts?: { company?: string; period?: { from: Date; to: Date } }) {
  const doc = await newDoc();
  const periodLabel = opts?.period
    ? `${opts.period.from.toLocaleDateString('ru-RU')} – ${opts.period.to.toLocaleDateString('ru-RU')}`
    : `Период: всё время · ${fmtDate()}`;
  drawHeader(doc, 'Финансовый отчёт', periodLabel, opts?.company);

  const completed = transactions.filter(t => t.status === 'completed');
  const income  = completed.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = completed.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const profit  = income - expense;
  const margin  = income > 0 ? Math.round(profit / income * 1000) / 10 : 0;

  let y = 38;
  y = drawKpiCards(doc, y, [
    { label: 'Доходы',    value: KZT(income),                                    accent: [16, 185, 129] },
    { label: 'Расходы',   value: KZT(expense),                                   accent: [239, 68, 68] },
    { label: 'Прибыль',   value: KZT(profit),  sub: `маржа ${margin.toFixed(1)}%`, accent: [99, 102, 241] },
    { label: 'Операций',  value: String(completed.length),                       sub: 'завершено' },
  ]);

  // Income by category
  const incomeByCat = groupSum(completed.filter(t => t.type === 'income'), t => t.category, t => t.amount);
  const expenseByCat = groupSum(completed.filter(t => t.type === 'expense'), t => t.category, t => t.amount);

  if (incomeByCat.length > 0) {
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Доходы по категориям', 14, y);
    autoTable(doc, {
      startY: y + 2,
      head: [['Категория', 'Сумма', 'Доля']],
      body: incomeByCat.map(c => [c.key, KZT(c.sum), pct(c.sum, income)]),
      styles: { font: 'Roboto', fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'normal' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  if (expenseByCat.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Расходы по категориям', 14, y);
    autoTable(doc, {
      startY: y + 2,
      head: [['Категория', 'Сумма', 'Доля']],
      body: expenseByCat.map(c => [c.key, KZT(c.sum), pct(c.sum, expense)]),
      styles: { font: 'Roboto', fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'normal' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Detailed log (last 60 ops, sorted newest first)
  if (transactions.length > 0) {
    if (y > 200) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Журнал операций', 14, y);
    const latest = [...transactions]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 60);
    autoTable(doc, {
      startY: y + 2,
      head: [['Дата', 'Тип', 'Категория', 'Описание', 'Сумма']],
      body: latest.map(t => [
        t.date || '—',
        t.type === 'income' ? 'Приход' : 'Расход',
        t.category || '—',
        (t.description || '').slice(0, 50),
        (t.type === 'income' ? '+' : '−') + KZT(t.amount),
      ]),
      styles: { font: 'Roboto', fontSize: 7.5, cellPadding: 1.8, textColor: [30, 41, 59] },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'normal' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 4: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
  }

  drawFooter(doc);
  doc.save(`finansy-${todayStamp()}.pdf`);
}

// ─── Tiny helpers ────────────────────────────────────────────────
function groupSum<T>(arr: T[], key: (t: T) => string, val: (t: T) => number): Array<{ key: string; sum: number }> {
  const m = new Map<string, number>();
  for (const t of arr) {
    const k = key(t) || 'Без категории';
    m.set(k, (m.get(k) || 0) + val(t));
  }
  return Array.from(m.entries()).map(([key, sum]) => ({ key, sum })).sort((a, b) => b.sum - a.sum);
}
function pct(part: number, whole: number): string {
  if (!whole) return '—';
  return Math.round(part / whole * 1000) / 10 + ' %';
}
function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── CSV export — for Excel users ────────────────────────────────
export function downloadCSV(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  // BOM so Excel reads UTF-8 correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
