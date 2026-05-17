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

// Filter transactions to the optional [from, to] window (inclusive). Same
// helper used by P&L and Cash Flow PDFs so they all interpret «период»
// the same way.
function filterByPeriod<T extends { date: string }>(items: T[], period?: { from: Date; to: Date }): T[] {
  if (!period) return items;
  const fromMs = period.from.getTime();
  const toMs   = period.to.getTime();
  return items.filter(t => {
    if (!t.date) return false;
    const ms = new Date(t.date).getTime();
    return ms >= fromMs && ms <= toMs;
  });
}

// Build a short period suffix for filenames: 2026-05 / 2026-Q2 / 2026 / range
function periodSlug(period?: { from: Date; to: Date }): string {
  if (!period) return todayStamp();
  const f = period.from, t = period.to;
  // Whole month
  if (f.getDate() === 1 && t.getMonth() === f.getMonth() && t.getFullYear() === f.getFullYear()) {
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
  }
  // Whole year
  if (f.getMonth() === 0 && f.getDate() === 1 && t.getMonth() === 11 && t.getDate() >= 28 && f.getFullYear() === t.getFullYear()) {
    return String(f.getFullYear());
  }
  return `${f.toISOString().slice(0, 10)}_${t.toISOString().slice(0, 10)}`;
}

export async function generateFinancePDF(transactions: FinanceTxRow[], opts?: { company?: string; period?: { from: Date; to: Date } }) {
  const doc = await newDoc();
  const periodLabel = opts?.period
    ? `${opts.period.from.toLocaleDateString('ru-RU')} – ${opts.period.to.toLocaleDateString('ru-RU')}`
    : `Период: всё время · ${fmtDate()}`;
  drawHeader(doc, 'Финансовый отчёт', periodLabel, opts?.company);

  const scoped = filterByPeriod(transactions, opts?.period);
  const completed = scoped.filter(t => t.status === 'completed');
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

  // Detailed log (last 60 ops in period, sorted newest first)
  if (scoped.length > 0) {
    if (y > 200) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Журнал операций', 14, y);
    const latest = [...scoped]
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
  doc.save(`finansy-${periodSlug(opts?.period)}.pdf`);
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

// ─── Company requisites (used by invoices) ─────────────────────────
// Lives on team_settings.company_requisites JSON server-side. The shape
// matches the form in Settings → Реквизиты компании.
export interface CompanyRequisites {
  legalName?: string;     // ТОО / ИП «Название»
  bin?: string;           // БИН (юр.лица) или ИИН (ИП), 12 цифр
  address?: string;       // Юр. адрес
  bankName?: string;      // АО «Halyk Bank»
  iban?: string;          // KZ12345...
  bik?: string;           // HSBKKZKX
  kbe?: string;           // КБЕ — 2 цифры
  director?: string;      // ФИО директора
  phone?: string;
  email?: string;
}

// ─── Invoice / Счёт на оплату (single deal) ────────────────────────
// One-page KZ-style invoice. Header has «Счёт №X от ДД.ММ.ГГГГ», then
// the seller's requisites + buyer details, the line item with the deal's
// amount, total in words, and footer with the director signature line.
export interface InvoiceDeal {
  id: string;
  customerName: string;
  customerPhone?: string;
  product?: string;
  amount: number;
  paidAmount?: number;
}

export async function generateInvoicePDF(deal: InvoiceDeal, requisites: CompanyRequisites = {}, opts?: { invoiceNumber?: string }) {
  const doc = await newDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const num = opts?.invoiceNumber || invoiceNumberFor(deal.id);
  drawHeader(doc, `Счёт на оплату № ${num}`, `от ${fmtDate()}`, requisites.legalName);

  let y = 38;

  // ─── Seller block ─────────────────────────────────────────────
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text('Поставщик', 14, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  const sellerLines = [
    requisites.legalName || '—',
    requisites.bin ? `БИН/ИИН: ${requisites.bin}` : '',
    requisites.address || '',
    requisites.bankName ? `Банк: ${requisites.bankName}` : '',
    requisites.iban ? `IBAN: ${requisites.iban}` : '',
    [requisites.bik && `БИК: ${requisites.bik}`, requisites.kbe && `КБЕ: ${requisites.kbe}`].filter(Boolean).join('   '),
    requisites.phone || requisites.email ? [requisites.phone, requisites.email].filter(Boolean).join('  ·  ') : '',
  ].filter(Boolean);
  sellerLines.forEach(line => { doc.text(line, 14, y); y += 4.5; });

  // ─── Buyer block ──────────────────────────────────────────────
  y += 3;
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text('Покупатель', 14, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(deal.customerName, 14, y);   y += 4.5;
  if (deal.customerPhone) { doc.text(`Телефон: ${deal.customerPhone}`, 14, y); y += 4.5; }
  y += 4;

  // ─── Line items table ─────────────────────────────────────────
  const remaining = Math.max(0, deal.amount - (deal.paidAmount || 0));
  autoTable(doc, {
    startY: y,
    head: [['№', 'Наименование', 'Кол-во', 'Цена', 'Сумма']],
    body: [
      ['1', deal.product || `Заказ ${deal.id}`, '1', KZT(deal.amount), KZT(deal.amount)],
    ],
    styles: { font: 'Roboto', fontSize: 9, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'normal' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'right',  cellWidth: 32 },
      4: { halign: 'right',  cellWidth: 36 },
    },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // ─── Totals block (right-aligned) ─────────────────────────────
  const rightX = pageW - 14;
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const label = (text: string, val: string, bold = false) => {
    doc.setTextColor(120, 120, 120); doc.text(text, rightX - 60, y);
    if (bold) doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(val, rightX, y, { align: 'right' });
    if (bold) doc.setFontSize(9);
    y += 5.5;
  };
  label('Всего к оплате:', KZT(deal.amount));
  if (deal.paidAmount && deal.paidAmount > 0) label('Уже оплачено:', KZT(deal.paidAmount));
  if (remaining !== deal.amount) label('Остаток к оплате:', KZT(remaining), true);

  // ─── Sum in words ─────────────────────────────────────────────
  y += 4;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Сумма прописью: ${kztInWords(remaining || deal.amount)}`, 14, y, { maxWidth: pageW - 28 });
  y += 12;

  // ─── Notice ───────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Внимание! Оплата производится только по реквизитам, указанным в счёте.', 14, y, { maxWidth: pageW - 28 });
  doc.text('При оплате необходимо указать номер счёта в назначении платежа.', 14, y + 4, { maxWidth: pageW - 28 });
  y += 16;

  // ─── Director signature line ──────────────────────────────────
  doc.setDrawColor(180, 180, 180);
  doc.line(14, y + 8, 90, y + 8);
  doc.setFontSize(8); doc.setTextColor(120, 120, 120);
  doc.text('Директор / подпись', 14, y + 12);
  if (requisites.director) {
    doc.setFontSize(9); doc.setTextColor(15, 23, 42);
    doc.text(requisites.director, 14, y + 6);
  }
  // М.П. on the right
  doc.setDrawColor(200, 200, 200);
  doc.setLineDashPattern([1, 1], 0);
  doc.circle(pageW - 35, y + 4, 14);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(8); doc.setTextColor(180, 180, 180);
  doc.text('М. П.', pageW - 38, y + 5);

  drawFooter(doc);
  doc.save(`schet-${num}-${todayStamp()}.pdf`);
}

function invoiceNumberFor(dealId: string): string {
  // Take the last 6 chars of the deal id and prefix with year for a
  // human-readable invoice number like «25-A1B2C3».
  const tail = dealId.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
  return `${String(new Date().getFullYear()).slice(-2)}-${tail}`;
}

// Convert a KZT amount to Russian words ("123 456 тенге 00 тиын").
// Lightweight implementation — handles 0..999_999_999 which is plenty
// for invoices in a small-business CRM.
function kztInWords(n: number): string {
  const tenge = Math.floor(n);
  const tiyin = Math.round((n - tenge) * 100);
  const words = numberToRussianWords(tenge);
  return `${capitalize(words)} тенге ${String(tiyin).padStart(2, '0')} тиын`;
}

const ONES_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS  = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS   = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDS  = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function triadWords(n: number, feminine: boolean): string {
  const ones = feminine ? ONES_F : ONES_M;
  const out: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) out.push(HUNDS[h]);
  if (r < 10)        { if (r) out.push(ones[r]); }
  else if (r < 20)   out.push(TEENS[r - 10]);
  else               { out.push(TENS[Math.floor(r / 10)]); if (r % 10) out.push(ones[r % 10]); }
  return out.join(' ');
}
function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return forms[2];
  if (m10 === 1) return forms[0];
  if (m10 >= 2 && m10 <= 4) return forms[1];
  return forms[2];
}
function numberToRussianWords(n: number): string {
  if (n === 0) return 'ноль';
  const millions  = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const rest      = n % 1_000;
  const parts: string[] = [];
  if (millions)  parts.push(triadWords(millions, false), plural(millions, ['миллион', 'миллиона', 'миллионов']));
  if (thousands) parts.push(triadWords(thousands, true),  plural(thousands, ['тысяча', 'тысячи', 'тысяч']));
  if (rest)      parts.push(triadWords(rest, false));
  return parts.join(' ').trim();
}
function capitalize(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ─── Receivables aging report ──────────────────────────────────────
// Buckets outstanding deal amounts by how long they've been unpaid
// (0-30, 30-60, 60-90, 90+). Most useful report for chasing money.
export interface AgingDealRow {
  id: string;
  customerName: string;
  product?: string;
  outstanding: number;
  daysOverdue: number; // 0 = on time
}

export async function generateAgingPDF(deals: AgingDealRow[], opts?: { company?: string }) {
  const doc = await newDoc();
  drawHeader(doc, 'Отчёт по дебиторке', `Aging-анализ на ${fmtDate()}`, opts?.company);
  let y = 38;

  const bucket = (d: AgingDealRow) =>
    d.daysOverdue <= 0  ? 'current'
    : d.daysOverdue <= 30 ? '0-30'
    : d.daysOverdue <= 60 ? '31-60'
    : d.daysOverdue <= 90 ? '61-90'
    : '90+';

  const sums: Record<string, { count: number; sum: number; rows: AgingDealRow[] }> = {
    current: { count: 0, sum: 0, rows: [] },
    '0-30':  { count: 0, sum: 0, rows: [] },
    '31-60': { count: 0, sum: 0, rows: [] },
    '61-90': { count: 0, sum: 0, rows: [] },
    '90+':   { count: 0, sum: 0, rows: [] },
  };
  for (const d of deals.filter(d => d.outstanding > 0)) {
    const b = bucket(d);
    sums[b].count++; sums[b].sum += d.outstanding; sums[b].rows.push(d);
  }
  const grandSum = Object.values(sums).reduce((s, b) => s + b.sum, 0);

  y = drawKpiCards(doc, y, [
    { label: 'В графике',  value: KZT(sums.current.sum), sub: `${sums.current.count} сделок`, accent: [16, 185, 129] },
    { label: '0–30 дней',  value: KZT(sums['0-30'].sum), sub: `${sums['0-30'].count} сделок`, accent: [234, 179, 8] },
    { label: '31–60',      value: KZT(sums['31-60'].sum), sub: `${sums['31-60'].count} сделок`, accent: [249, 115, 22] },
    { label: '61–90',      value: KZT(sums['61-90'].sum), sub: `${sums['61-90'].count} сделок`, accent: [239, 68, 68] },
    { label: '90+',        value: KZT(sums['90+'].sum),  sub: `${sums['90+'].count} сделок`,  accent: [127, 29, 29] },
  ]);

  // Summary line
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Всего к получению: ${KZT(grandSum)}`, 14, y);
  y += 8;

  // Detailed rows — most-overdue first
  const rows = deals
    .filter(d => d.outstanding > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.outstanding - a.outstanding)
    .map(d => [
      d.customerName,
      d.product || '—',
      d.daysOverdue <= 0 ? '—' : `${d.daysOverdue} дн.`,
      bucket(d),
      KZT(d.outstanding),
    ]);

  autoTable(doc, {
    startY: y,
    head: [['Клиент', 'Продукт', 'Просрочка', 'Корзина', 'К получению']],
    body: rows,
    styles: { font: 'Roboto', fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'normal' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  drawFooter(doc);
  doc.save(`debitorka-${todayStamp()}.pdf`);
}

// ─── P&L statement (Profit & Loss) ──────────────────────────────────
// Compact P&L for a chosen period. Single-page when possible: revenue
// breakdown, COGS, gross profit, opex, net profit + margins. Distinct
// from generateFinancePDF (which is more of an operations log) — P&L
// is the formal report you'd hand to an accountant.
export async function generatePLPDF(transactions: FinanceTxRow[], opts: { period: { from: Date; to: Date }; company?: string }) {
  const doc = await newDoc();
  drawHeader(
    doc, 'Отчёт о прибылях и убытках',
    `${opts.period.from.toLocaleDateString('ru-RU')} – ${opts.period.to.toLocaleDateString('ru-RU')}`,
    opts.company,
  );

  const scoped = filterByPeriod(transactions, opts.period).filter(t => t.status === 'completed');
  const revenueByCat = groupSum(scoped.filter(t => t.type === 'income'),  t => t.category, t => t.amount);
  const expenseByCat = groupSum(scoped.filter(t => t.type === 'expense'), t => t.category, t => t.amount);
  const revenue = revenueByCat.reduce((s, c) => s + c.sum, 0);
  const expense = expenseByCat.reduce((s, c) => s + c.sum, 0);
  const profit  = revenue - expense;
  const margin  = revenue > 0 ? (profit / revenue * 100) : 0;

  let y = 38;
  y = drawKpiCards(doc, y, [
    { label: 'Выручка', value: KZT(revenue), accent: [16, 185, 129] },
    { label: 'Расходы', value: KZT(expense), accent: [239, 68, 68] },
    { label: 'Прибыль', value: KZT(profit),  sub: `маржа ${margin.toFixed(1)}%`, accent: [99, 102, 241] },
  ]);

  // P&L statement table — classic accountant layout
  const rows: Array<[string, string]> = [];
  rows.push(['ВЫРУЧКА', KZT(revenue)]);
  revenueByCat.forEach(c => rows.push([`  ${c.key}`, KZT(c.sum)]));
  rows.push(['РАСХОДЫ', KZT(expense)]);
  expenseByCat.forEach(c => rows.push([`  ${c.key}`, KZT(c.sum)]));
  rows.push(['ПРИБЫЛЬ ДО НАЛОГОВ', KZT(profit)]);
  rows.push(['МАРЖА', `${margin.toFixed(1)} %`]);

  autoTable(doc, {
    startY: y,
    body: rows,
    styles: { font: 'Roboto', fontSize: 9, cellPadding: 2.5, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { halign: 'right' },
    },
    didParseCell: data => {
      const txt = String(data.cell.raw);
      if (/^(ВЫРУЧКА|РАСХОДЫ|ПРИБЫЛЬ|МАРЖА)/.test(txt)) {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.textColor = [15, 23, 42];
      }
    },
    margin: { left: 14, right: 14 },
  });

  drawFooter(doc);
  doc.save(`pribyl-ubytki-${periodSlug(opts.period)}.pdf`);
}
