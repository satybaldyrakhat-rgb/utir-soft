// PDF report generator for the «Платежи» / «Финансы компании» sections.
// Renders proper Cyrillic-capable PDFs in the browser using jsPDF +
// jspdf-autotable. Default jsPDF fonts (Helvetica/Times) don't support
// Cyrillic, so we lazy-load Roboto Regular from a CDN on first use and
// register it with the document.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Cache the loaded fonts across all PDF generations so we don't re-fetch.
let cachedRobotoBase64: string | null = null;
let cachedRobotoBoldBase64: string | null = null;

async function fetchTtfAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('font fetch failed: HTTP ' + res.status);
  const buf = await res.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Try multiple CDN URLs in order. Returns the first one that fetches OK.
// Roboto is hosted in different paths across mirrors; if one CDN removes
// or moves the file we don't want PDFs to silently break.
async function fetchFontWithFallback(urls: string[]): Promise<string> {
  let lastError: any = null;
  for (const url of urls) {
    try {
      return await fetchTtfAsBase64(url);
    } catch (e) {
      lastError = e;
      console.warn('[pdfReports] font fetch failed, trying next mirror', url, e);
    }
  }
  throw lastError || new Error('all font mirrors failed');
}

async function loadRobotoRegular(): Promise<string> {
  if (cachedRobotoBase64) return cachedRobotoBase64;
  cachedRobotoBase64 = await fetchFontWithFallback([
    'https://cdn.jsdelivr.net/gh/google/fonts/apache/roboto/static/Roboto-Regular.ttf',
    'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.ttf',
  ]);
  return cachedRobotoBase64;
}

// Bold is OPTIONAL — if the CDN is down we fall back to Regular registered
// under the 'bold' weight. The PDF still renders correctly with Cyrillic;
// table headers just won't be visually heavier. Crucial because the Bold
// font being unavailable was crashing every PDF download with a confusing
// «check your internet» error even when Regular loaded fine.
async function tryLoadRobotoBold(): Promise<string | null> {
  if (cachedRobotoBoldBase64) return cachedRobotoBoldBase64;
  try {
    cachedRobotoBoldBase64 = await fetchFontWithFallback([
      'https://cdn.jsdelivr.net/gh/google/fonts/apache/roboto/static/Roboto-Bold.ttf',
      'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc4.ttf',
    ]);
    return cachedRobotoBoldBase64;
  } catch (e) {
    console.warn('[pdfReports] Bold font unavailable, will reuse Regular for bold weight', e);
    return null;
  }
}

// Sentinel error so callers can branch on font-load failure (show a toast
// telling the user to check internet) vs other errors (generic «не удалось»).
export class PdfFontError extends Error {
  constructor(message: string) { super(message); this.name = 'PdfFontError'; }
}

async function newDoc(): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let regular: string;
  try {
    regular = await loadRobotoRegular();
  } catch (e) {
    // Regular IS required — without a Cyrillic font, the report would
    // print «????» where Russian letters should be. Fail loud with a
    // friendly message so the user knows to check connectivity.
    console.warn('[pdfReports] Regular font load failed', e);
    throw new PdfFontError('Не удалось загрузить шрифт для PDF. Проверьте интернет и попробуйте ещё раз.');
  }
  doc.addFileToVFS('Roboto-Regular.ttf', regular);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  // Bold is best-effort — if the CDN doesn't have it, register Regular
  // under the 'bold' slot too. autoTable's default bold headers then
  // stay on Roboto (Cyrillic-safe) instead of falling back to Helvetica
  // which would print «????» for Russian.
  const bold = await tryLoadRobotoBold();
  if (bold) {
    doc.addFileToVFS('Roboto-Bold.ttf', bold);
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  } else {
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'bold');
  }
  doc.setFont('Roboto', 'normal');
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
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', font: 'Roboto' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'center' },
    },
    margin: { left: 14, right: 14 },
    // Color the status cell text green/amber/grey based on label. Using
    // didParseCell (runs BEFORE drawing) sets the style cleanly — the
    // previous didDrawCell-with-manual-text-draw approach left the
    // original black text underneath the colored draw, producing a
    // double-printed look.
    didParseCell: data => {
      if (data.section === 'body' && data.column.index === 6) {
        const label = String(data.cell.raw);
        const colour: [number, number, number] | null =
          label === 'Оплачен'   ? [16, 185, 129] :
          label === 'Частично'  ? [245, 158, 11] :
          label === 'Ожидает'   ? [100, 116, 139] : null;
        if (colour) data.cell.styles.textColor = colour;
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
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'bold' },
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
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'bold' },
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
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'bold' },
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
  customerBIN?: string;     // БИН/ИИН покупателя — обязательно для B2B
  customerAddress?: string; // юр. адрес покупателя
  product?: string;
  amount: number;
  paidAmount?: number;
  // VAT mode: 'with' = в т.ч. НДС 12% (КЗ-стандарт, по умолчанию),
  //          'without' = без НДС, 'exempt' = освобождён от НДС.
  vatMode?: 'with' | 'without' | 'exempt';
  // Direction tag — for multi-niche companies. Printed under the
  // header as a small "Направление: ..." line so the accountant can
  // see at a glance whether this invoice is for the furniture / doors
  // / stairs side of the business. Plain text; no emoji in PDFs.
  nicheLabel?: string;
}

export async function generateInvoicePDF(deal: InvoiceDeal, requisites: CompanyRequisites = {}, opts?: { invoiceNumber?: string }) {
  const doc = await newDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const num = opts?.invoiceNumber || invoiceNumberFor(deal.id);
  drawHeader(doc, `Счёт на оплату № ${num}`, `от ${fmtDate()}`, requisites.legalName);

  let y = 38;

  // Niche line — only when the seller works in multiple niches and the
  // deal carries a niche label. Compact "Направление: Двери" line so
  // the accountant immediately sees which line of business.
  if (deal.nicheLabel) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Направление: ${deal.nicheLabel}`, 14, y);
    y += 6;
  }

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
  // КЗ-стандарт: БИН/ИИН покупателя обязателен для B2B счетов и нужен
  // для оформления НДС-операций. Если пустой — на бланке остаётся
  // подсказка с пустой строкой для ручного заполнения.
  if (deal.customerBIN) {
    doc.text(`БИН/ИИН: ${deal.customerBIN}`, 14, y); y += 4.5;
  } else {
    doc.setTextColor(180, 180, 180);
    doc.text('БИН/ИИН: ___________________', 14, y); y += 4.5;
    doc.setTextColor(15, 23, 42);
  }
  if (deal.customerAddress) { doc.text(`Адрес: ${deal.customerAddress}`, 14, y); y += 4.5; }
  if (deal.customerPhone)   { doc.text(`Телефон: ${deal.customerPhone}`, 14, y); y += 4.5; }
  y += 4;

  // ─── Line items table ─────────────────────────────────────────
  const remaining = Math.max(0, deal.amount - (deal.paidAmount || 0));
  // НДС-расчёт. KZ-стандарт: ставка 12%, выделяется ИЗ суммы (включая),
  // если сделка с НДС. vatMode = 'without' → НДС = 0, всё чистая база.
  // vatMode = 'exempt' → показываем «без НДС» отдельной строкой.
  const vatMode = deal.vatMode || 'with';
  const vatAmount  = vatMode === 'with' ? Math.round(deal.amount * 12 / 112) : 0;
  const netAmount  = deal.amount - vatAmount;
  autoTable(doc, {
    startY: y,
    head: [['№', 'Наименование', 'Кол-во', 'Цена', 'Сумма']],
    body: [
      ['1', deal.product || `Заказ ${deal.id}`, '1', KZT(deal.amount), KZT(deal.amount)],
    ],
    styles: { font: 'Roboto', fontSize: 9, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'bold' },
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
    doc.setTextColor(120, 120, 120); doc.text(text, rightX - 70, y);
    if (bold) doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(val, rightX, y, { align: 'right' });
    if (bold) doc.setFontSize(9);
    y += 5.5;
  };
  label('Сумма без НДС:', KZT(netAmount));
  if (vatMode === 'with') {
    label('в т.ч. НДС 12%:', KZT(vatAmount));
  } else if (vatMode === 'exempt') {
    label('НДС:', 'Без НДС');
  }
  label('Всего к оплате:', KZT(deal.amount), true);
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
  // Name above the line, "Директор / подпись · дата" caption below.
  if (requisites.director) {
    doc.setFontSize(9); doc.setTextColor(80, 80, 80);
    doc.text(requisites.director, 14, y + 4);
  }
  doc.setDrawColor(180, 180, 180);
  doc.line(14, y + 10, 90, y + 10);
  doc.setFontSize(8); doc.setTextColor(120, 120, 120);
  doc.text('Директор / подпись · дата', 14, y + 14);
  // М.П. circle moved up + smaller so it doesn't bleed into the
  // signature underline.
  doc.setDrawColor(200, 200, 200);
  doc.setLineDashPattern([1, 1], 0);
  doc.circle(pageW - 30, y + 6, 10);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(8); doc.setTextColor(180, 180, 180);
  doc.text('М.П.', pageW - 34, y + 7);

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
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'bold' },
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
// Category keywords used to split expense categories into COGS (direct
// costs of producing the goods/services) vs OPEX (overhead). Tuned for
// the furniture / construction business that's our primary user.
const COGS_KEYWORDS = ['материал', 'фурнитур', 'распил', 'кромк', 'плит', 'мдф', 'лдсп',
                       'комплектующ', 'себестоимост', 'закупк', 'cogs', 'cost of goods'];
function isCOGS(category: string): boolean {
  const low = (category || '').toLowerCase();
  return COGS_KEYWORDS.some(k => low.includes(k));
}

export async function generatePLPDF(transactions: FinanceTxRow[], opts: { period: { from: Date; to: Date }; company?: string; taxRate?: number }) {
  const doc = await newDoc();
  drawHeader(
    doc, 'Отчёт о прибылях и убытках',
    `${opts.period.from.toLocaleDateString('ru-RU')} – ${opts.period.to.toLocaleDateString('ru-RU')}`,
    opts.company,
  );

  const scoped = filterByPeriod(transactions, opts.period).filter(t => t.status === 'completed');
  const revenueByCat = groupSum(scoped.filter(t => t.type === 'income'),  t => t.category, t => t.amount);
  const allExpenses  = scoped.filter(t => t.type === 'expense');
  // Split expenses into COGS (direct cost of sales) vs OPEX (overhead).
  // The split lets us show Gross Profit + EBIT — the classic KZ P&L
  // structure that an accountant expects.
  const cogsByCat   = groupSum(allExpenses.filter(t => isCOGS(t.category)),  t => t.category, t => t.amount);
  const opexByCat   = groupSum(allExpenses.filter(t => !isCOGS(t.category)), t => t.category, t => t.amount);
  const revenue     = revenueByCat.reduce((s, c) => s + c.sum, 0);
  const cogs        = cogsByCat.reduce((s, c) => s + c.sum, 0);
  const opex        = opexByCat.reduce((s, c) => s + c.sum, 0);
  const grossProfit = revenue - cogs;
  const ebit        = grossProfit - opex;
  // KZ default КПН (corporate income tax) is 20%. Override via opts.taxRate.
  const taxRate     = opts.taxRate ?? 0.20;
  const tax         = ebit > 0 ? Math.round(ebit * taxRate) : 0;
  const netProfit   = ebit - tax;
  const grossMargin = revenue > 0 ? (grossProfit / revenue * 100) : 0;
  const netMargin   = revenue > 0 ? (netProfit  / revenue * 100) : 0;

  let y = 38;
  y = drawKpiCards(doc, y, [
    { label: 'Выручка',         value: KZT(revenue),    accent: [16, 185, 129] },
    { label: 'Валовая прибыль', value: KZT(grossProfit), sub: `маржа ${grossMargin.toFixed(1)}%`, accent: [99, 102, 241] },
    { label: 'EBIT',            value: KZT(ebit),       accent: [99, 102, 241] },
    { label: 'Чистая прибыль',  value: KZT(netProfit),  sub: `маржа ${netMargin.toFixed(1)}%`,   accent: netProfit >= 0 ? [16, 185, 129] : [239, 68, 68] },
  ]);

  // P&L statement table — classic KZ-accountant layout:
  //   Выручка
  //     - COGS (себестоимость)
  //   = Валовая прибыль
  //     - OPEX (операционные расходы)
  //   = EBIT (операционная прибыль)
  //     - КПН (corporate tax)
  //   = Чистая прибыль
  const rows: Array<[string, string]> = [];
  rows.push(['ВЫРУЧКА', KZT(revenue)]);
  revenueByCat.forEach(c => rows.push([`  ${c.key}`, KZT(c.sum)]));
  if (cogsByCat.length > 0) {
    rows.push(['СЕБЕСТОИМОСТЬ (COGS)', `(${KZT(cogs)})`]);
    cogsByCat.forEach(c => rows.push([`  ${c.key}`, `(${KZT(c.sum)})`]));
  }
  rows.push(['ВАЛОВАЯ ПРИБЫЛЬ', KZT(grossProfit)]);
  rows.push([`  Валовая маржа`, `${grossMargin.toFixed(1)} %`]);
  if (opexByCat.length > 0) {
    rows.push(['ОПЕРАЦИОННЫЕ РАСХОДЫ (OPEX)', `(${KZT(opex)})`]);
    opexByCat.forEach(c => rows.push([`  ${c.key}`, `(${KZT(c.sum)})`]));
  }
  rows.push(['ПРИБЫЛЬ ДО НАЛОГА (EBIT)', KZT(ebit)]);
  rows.push([`КПН ${(taxRate * 100).toFixed(0)} %`, `(${KZT(tax)})`]);
  rows.push(['ЧИСТАЯ ПРИБЫЛЬ', KZT(netProfit)]);
  rows.push([`  Чистая маржа`, `${netMargin.toFixed(1)} %`]);

  autoTable(doc, {
    startY: y,
    body: rows,
    styles: { font: 'Roboto', fontSize: 9, cellPadding: 2.5, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { halign: 'right' },
    },
    didParseCell: data => {
      // Color header rows for the major P&L lines. Match on row index
      // (column 0) so both cells in the row get the styling.
      if (data.section !== 'body') return;
      const rowText = String((data.row.raw as any[])?.[0] ?? '');
      if (/^(ВЫРУЧКА|СЕБЕСТОИМОСТЬ|ВАЛОВАЯ ПРИБЫЛЬ|ОПЕРАЦИОННЫЕ|ПРИБЫЛЬ ДО НАЛОГА|ЧИСТАЯ ПРИБЫЛЬ|КПН)/.test(rowText)) {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.textColor = [15, 23, 42];
        data.cell.styles.fontStyle = 'bold';
      }
      // Highlight the final net-profit line emphatically.
      if (/^ЧИСТАЯ ПРИБЫЛЬ/.test(rowText)) {
        data.cell.styles.fillColor = netProfit >= 0 ? [220, 252, 231] : [254, 226, 226];
        data.cell.styles.textColor = netProfit >= 0 ? [4, 120, 87] : [153, 27, 27];
      }
    },
    margin: { left: 14, right: 14 },
  });

  drawFooter(doc);
  doc.save(`pribyl-ubytki-${periodSlug(opts.period)}.pdf`);
}

// ─── Акт выполненных работ (Act of work completion) ────────────────
// KZ business standard — client signs this after the work is delivered
// so both sides have proof the service was rendered. Usually paired with
// the invoice (same deal). Two signature lines + dashed М.П. circles.
export interface ActDeal {
  id: string;
  customerName: string;
  customerBIN?: string;     // БИН/ИИН заказчика — обязательно для KZ
  customerAddress?: string;
  product?: string;
  amount: number;
  // Optional override of the act date; defaults to today.
  date?: string;
  // Direction label for multi-niche companies — same as InvoiceDeal.
  nicheLabel?: string;
}

export async function generateActPDF(deal: ActDeal, requisites: CompanyRequisites = {}, opts?: { actNumber?: string }) {
  const doc = await newDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const num = opts?.actNumber || invoiceNumberFor(deal.id);
  const actDate = deal.date ? new Date(deal.date) : new Date();
  drawHeader(doc, `Акт выполненных работ № ${num}`, `от ${fmtDate(actDate)}`, requisites.legalName);

  let y = 38;

  // Niche line — printed once under the header for multi-niche shops
  // so the act mirrors the invoice's "Направление" tag.
  if (deal.nicheLabel) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Направление: ${deal.nicheLabel}`, 14, y);
    y += 6;
  }

  // Party blocks — Исполнитель (we) + Заказчик (client)
  doc.setFontSize(10); doc.setTextColor(120, 120, 120);
  doc.text('Исполнитель', 14, y); y += 5;
  doc.setFontSize(9);  doc.setTextColor(15, 23, 42);
  const sellerLines = [
    requisites.legalName || '—',
    requisites.bin ? `БИН/ИИН: ${requisites.bin}` : '',
    requisites.address || '',
  ].filter(Boolean);
  sellerLines.forEach(line => { doc.text(line, 14, y); y += 4.5; });

  y += 3;
  doc.setFontSize(10); doc.setTextColor(120, 120, 120);
  doc.text('Заказчик', 14, y); y += 5;
  doc.setFontSize(9);  doc.setTextColor(15, 23, 42);
  doc.text(deal.customerName, 14, y); y += 4.5;
  // КЗ-стандарт: БИН/ИИН заказчика обязателен для оформления акта.
  if (deal.customerBIN) {
    doc.text(`БИН/ИИН: ${deal.customerBIN}`, 14, y); y += 4.5;
  } else {
    doc.setTextColor(180, 180, 180);
    doc.text('БИН/ИИН: ___________________', 14, y); y += 4.5;
    doc.setTextColor(15, 23, 42);
  }
  if (deal.customerAddress) { doc.text(`Адрес: ${deal.customerAddress}`, 14, y); y += 4.5; }
  y += 2;

  // Body paragraph (formal КЗ language)
  doc.setFontSize(9.5); doc.setTextColor(15, 23, 42);
  const body =
    `Настоящий акт составлен в подтверждение того, что Исполнитель выполнил, а Заказчик принял ` +
    `работы (услуги) в полном объёме и в соответствии с условиями договора / заказа № ${deal.id}.`;
  doc.text(body, 14, y, { maxWidth: pageW - 28 });
  y += 14;

  // Line items table
  autoTable(doc, {
    startY: y,
    head: [['№', 'Наименование работ / услуг', 'Кол-во', 'Цена', 'Сумма']],
    body: [
      ['1', deal.product || `Работы по заказу ${deal.id}`, '1', KZT(deal.amount), KZT(deal.amount)],
    ],
    styles: { font: 'Roboto', fontSize: 9, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'right',  cellWidth: 32 },
      4: { halign: 'right',  cellWidth: 36 },
    },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // Total + sum in words
  const rightX = pageW - 14;
  doc.setFontSize(11); doc.setTextColor(15, 23, 42);
  doc.text(`Итого: ${KZT(deal.amount)}`, rightX, y, { align: 'right' });
  y += 7;
  doc.setFontSize(9); doc.setTextColor(80, 80, 80);
  doc.text(`Сумма прописью: ${kztInWords(deal.amount)}`, 14, y, { maxWidth: pageW - 28 });
  y += 12;

  // Acceptance statement
  doc.setFontSize(9.5); doc.setTextColor(15, 23, 42);
  doc.text(
    'Работы выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам выполнения работ не имеет.',
    14, y, { maxWidth: pageW - 28 },
  );
  y += 16;

  // Two signature blocks side by side. М.П. circle was overlapping
  // the signature underline at y+14 (radius 12 centered at y+10 → bottom
  // at y+22). Fixed by placing the circle ABOVE the signature line and
  // making it smaller so it doesn't crowd the «подпись» caption.
  const halfW = (pageW - 28 - 10) / 2;
  const drawSignBlock = (x: number, label: string, name?: string) => {
    // Header label
    doc.setFontSize(9); doc.setTextColor(15, 23, 42);
    doc.text(label, x, y);
    // Name above the line (if known) — fills the role «who is signing»
    if (name) {
      doc.setFontSize(9); doc.setTextColor(80, 80, 80);
      doc.text(name, x, y + 8, { maxWidth: halfW - 8 });
    }
    // Signature underline — visible separator for the actual signature
    doc.setDrawColor(180, 180, 180);
    doc.line(x, y + 18, x + halfW - 8, y + 18);
    // Caption under the line
    doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
    doc.text('подпись · дата', x, y + 22);
    // М.П. dashed circle on the right edge — placed in the row ABOVE
    // the signature line so it doesn't intersect.
    doc.setDrawColor(200, 200, 200);
    doc.setLineDashPattern([1, 1], 0);
    doc.circle(x + halfW - 14, y + 6, 8);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(7); doc.setTextColor(180, 180, 180);
    doc.text('М.П.', x + halfW - 16, y + 7);
  };
  drawSignBlock(14, 'Сдал / Исполнитель:', requisites.director);
  drawSignBlock(14 + halfW + 10, 'Принял / Заказчик:', deal.customerName);

  drawFooter(doc);
  doc.save(`akt-${num}-${todayStamp()}.pdf`);
}

// fmtDate exists for the report header but takes Date; surface for Act override.
// (Re-declaration not needed — already imported via module scope.)

// ─── Cash flow forecast ────────────────────────────────────────────
// Forward-looking cash projection by month. Adds expected inflows from
// active deals (outstanding balances on deals with completion/installation
// dates ahead) to provide a 3-month cash forecast. Helpful for «can I
// afford to pay salaries on the 25th?» kind of decisions.
export interface ForecastInflow {
  date: string;          // ISO yyyy-mm-dd
  customerName: string;
  product?: string;
  expectedAmount: number;
}
export interface ForecastOutflow {
  date: string;
  category: string;
  description?: string;
  expectedAmount: number;
}

export async function generateCashFlowForecastPDF(
  inflows: ForecastInflow[],
  outflows: ForecastOutflow[],
  opts: { company?: string; openingBalance?: number; horizonMonths?: number },
) {
  const doc = await newDoc();
  const horizon = opts.horizonMonths || 3;
  drawHeader(doc, 'Прогноз денежного потока', `На ${horizon} месяца(ев) вперёд · ${fmtDate()}`, opts.company);
  let y = 38;

  const now = new Date();
  // Build N month buckets
  const months: Array<{ key: string; label: string; start: Date; end: Date }> = [];
  for (let i = 0; i < horizon; i++) {
    const start = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + i + 1, 0, 23, 59, 59);
    months.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      label: start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
      start, end,
    });
  }
  const sumIn = (m: typeof months[number]) => inflows
    .filter(x => x.date && new Date(x.date) >= m.start && new Date(x.date) <= m.end)
    .reduce((s, x) => s + x.expectedAmount, 0);
  const sumOut = (m: typeof months[number]) => outflows
    .filter(x => x.date && new Date(x.date) >= m.start && new Date(x.date) <= m.end)
    .reduce((s, x) => s + x.expectedAmount, 0);

  let balance = opts.openingBalance || 0;
  const rows = months.map(m => {
    const i = sumIn(m); const o = sumOut(m);
    const net = i - o;
    balance += net;
    return [
      m.label.charAt(0).toUpperCase() + m.label.slice(1),
      KZT(i),
      `-${KZT(o)}`,
      `${net >= 0 ? '+' : ''}${KZT(net)}`,
      KZT(balance),
    ];
  });

  const totalIn = months.reduce((s, m) => s + sumIn(m), 0);
  const totalOut = months.reduce((s, m) => s + sumOut(m), 0);
  y = drawKpiCards(doc, y, [
    { label: 'Открыто на счёте', value: KZT(opts.openingBalance || 0), sub: 'на сегодня' },
    { label: 'Ожидается прихода', value: KZT(totalIn),  accent: [16, 185, 129], sub: `${inflows.length} платежей` },
    { label: 'Ожидается расхода', value: KZT(totalOut), accent: [239, 68, 68], sub: `${outflows.length} платежей` },
    { label: 'Прогноз остатка', value: KZT(balance), accent: balance >= 0 ? [99, 102, 241] : [239, 68, 68] },
  ]);

  doc.setFontSize(11); doc.setTextColor(15, 23, 42);
  doc.text('Помесячный прогноз', 14, y);
  autoTable(doc, {
    startY: y + 2,
    head: [['Месяц', 'Приход', 'Расход', 'Чистый поток', 'Остаток']],
    body: rows,
    styles: { font: 'Roboto', fontSize: 9, cellPadding: 2.5, textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  if (inflows.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setTextColor(15, 23, 42);
    doc.text('Ожидаемые поступления', 14, y);
    autoTable(doc, {
      startY: y + 2,
      head: [['Дата', 'Клиент', 'Продукт', 'Сумма']],
      body: inflows
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .map(x => [x.date, x.customerName, (x.product || '—').slice(0, 50), KZT(x.expectedAmount)]),
      styles: { font: 'Roboto', fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 3: { halign: 'right' } },
      foot: [['', '', 'Итого', KZT(totalIn)]],
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], font: 'Roboto', fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Outflows detail — symmetric to inflows so the user sees what the
  // expected расход consists of. Was missing entirely before, making
  // the forecast asymmetric and hard to audit.
  if (outflows.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setTextColor(15, 23, 42);
    doc.text('Ожидаемые расходы', 14, y);
    autoTable(doc, {
      startY: y + 2,
      head: [['Дата', 'Категория', 'Описание', 'Сумма']],
      body: outflows
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .map(x => [x.date, x.category, (x.description || '—').slice(0, 50), KZT(x.expectedAmount)]),
      styles: { font: 'Roboto', fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 3: { halign: 'right' } },
      foot: [['', '', 'Итого', KZT(totalOut)]],
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], font: 'Roboto', fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
    });
  }

  drawFooter(doc);
  doc.save(`forecast-${todayStamp()}.pdf`);
}

// ─── Tax report (summary across taxes for the chosen period) ───────
// Lists every applicable tax with: код, ставка, база, сумма, срок,
// статус (оплачен / к оплате). Useful as a hand-off for the accountant
// or for filing FNO returns.
export interface TaxReportRow {
  code: string;        // Cyrillic short label: «ИПН», «КПН»...
  label: string;       // full description
  rate: string;        // «10%» / «12%» / «9.5% − ОПВ»
  base: number;
  amount: number;
  due: string;         // ISO date
  paid: boolean;
}

export async function generateTaxReportPDF(opts: {
  periodLabel: string;
  rows: TaxReportRow[];
  company?: string;
}) {
  const doc = await newDoc();
  drawHeader(doc, `Налоговый отчёт`, `Период: ${opts.periodLabel} · ${fmtDate()}`, opts.company);

  const total = opts.rows.reduce((s, r) => s + r.amount, 0);
  const paid  = opts.rows.filter(r => r.paid).reduce((s, r) => s + r.amount, 0);
  const due   = total - paid;
  let y = 38;
  y = drawKpiCards(doc, y, [
    { label: 'Всего налогов', value: KZT(total),  sub: `${opts.rows.length} позиций` },
    { label: 'Оплачено',      value: KZT(paid),   accent: [16, 185, 129] },
    { label: 'К оплате',      value: KZT(due),    accent: [245, 158, 11] },
    { label: 'Период',        value: opts.periodLabel },
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Код', 'Налог', 'Ставка', 'База', 'Сумма', 'Срок', 'Статус']],
    body: opts.rows.map(r => [
      r.code, r.label, r.rate, KZT(r.base), KZT(r.amount), r.due,
      r.paid ? 'Оплачен' : 'К оплате',
    ]),
    styles: { font: 'Roboto', fontSize: 8, cellPadding: 2.5, textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      6: { halign: 'center' },
    },
    margin: { left: 14, right: 14 },
    // Same fix as in generatePaymentsPDF — didParseCell colors the
    // status text natively instead of drawing manually after autoTable
    // has already painted the cell.
    didParseCell: data => {
      if (data.section === 'body' && data.column.index === 6) {
        const txt = String(data.cell.raw);
        data.cell.styles.textColor = txt === 'Оплачен' ? [16, 185, 129] : [245, 158, 11];
      }
    },
  });

  // Totals row outside the table so the user sees the big "К оплате"
  // number prominently after the detail list.
  const finalY = (doc as any).lastAutoTable.finalY + 4;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, finalY, doc.internal.pageSize.getWidth() - 28, 10, 'F');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('ИТОГО к уплате:', 18, finalY + 6);
  doc.text(KZT(due), doc.internal.pageSize.getWidth() - 18, finalY + 6, { align: 'right' });

  drawFooter(doc);
  doc.save(`nalogi-${todayStamp()}.pdf`);
}

// ─── ЭСФ / VAT (НДС) report for the quarter ────────────────────────
// Pairs nicely with KZ requirement to submit ФНО 300.00 quarterly. We
// list every outgoing (sale → НДС начислен) and every incoming purchase
// (расход → НДС к зачёту), with totals at the bottom. Backs out НДС
// from a gross amount: VAT = gross * 12 / 112.
export interface VATLine {
  date: string;
  counterparty: string;
  amount: number;  // gross (с НДС)
  vat: number;     // backed-out VAT
}

export async function generateVATReportPDF(opts: {
  period: { from: Date; to: Date };
  periodLabel: string;
  outgoing: VATLine[];
  incoming: VATLine[];
  company?: string;
}) {
  const doc = await newDoc();
  drawHeader(doc, 'Отчёт по НДС / ЭСФ', `${opts.periodLabel} · ${fmtDate()}`, opts.company);

  const outGross = opts.outgoing.reduce((s, x) => s + x.amount, 0);
  const outVat   = opts.outgoing.reduce((s, x) => s + x.vat,    0);
  const inGross  = opts.incoming.reduce((s, x) => s + x.amount, 0);
  const inVat    = opts.incoming.reduce((s, x) => s + x.vat,    0);
  const toPay    = Math.max(0, outVat - inVat);

  let y = 38;
  y = drawKpiCards(doc, y, [
    { label: 'Оборот (исходящие)', value: KZT(outGross), accent: [16, 185, 129], sub: `${opts.outgoing.length} операций` },
    { label: 'НДС начисленный',    value: KZT(outVat),   accent: [16, 185, 129] },
    { label: 'НДС к зачёту',       value: KZT(inVat),    accent: [99, 102, 241] },
    { label: 'НДС к уплате',       value: KZT(toPay),    accent: [245, 158, 11] },
  ]);

  // Outgoing (sales) section
  if (opts.outgoing.length > 0) {
    doc.setFontSize(11); doc.setTextColor(15, 23, 42);
    doc.text('Исходящие операции (реализация)', 14, y);
    autoTable(doc, {
      startY: y + 2,
      head: [['Дата', 'Контрагент', 'Сумма с НДС', 'в т.ч. НДС']],
      body: opts.outgoing
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .map(x => [x.date, x.counterparty.slice(0, 60), KZT(x.amount), KZT(x.vat)]),
      styles: { font: 'Roboto', fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
      foot: [['Итого', '', KZT(outGross), KZT(outVat)]],
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], font: 'Roboto', fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  if (opts.incoming.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setTextColor(15, 23, 42);
    doc.text('Входящие операции (закупки)', 14, y);
    autoTable(doc, {
      startY: y + 2,
      head: [['Дата', 'Контрагент', 'Сумма с НДС', 'в т.ч. НДС']],
      body: opts.incoming
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .map(x => [x.date, x.counterparty.slice(0, 60), KZT(x.amount), KZT(x.vat)]),
      styles: { font: 'Roboto', fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255], font: 'Roboto', fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
      foot: [['Итого', '', KZT(inGross), KZT(inVat)]],
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], font: 'Roboto', fontStyle: 'bold' },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Prominent «НДС к уплате» summary band — the headline number any KZ
  // accountant looks for. Was buried in a KPI card; now duplicated as
  // a wide green/amber band right after the tables so it's impossible
  // to miss.
  if (y > 240) { doc.addPage(); y = 20; }
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(toPay > 0 ? 254 : 240, toPay > 0 ? 243 : 253, toPay > 0 ? 199 : 244);
  doc.rect(14, y, pageW - 28, 18, 'F');
  doc.setDrawColor(toPay > 0 ? 245 : 16, toPay > 0 ? 158 : 185, toPay > 0 ? 11 : 129);
  doc.setLineWidth(0.4);
  doc.line(14, y, 14, y + 18);
  doc.setLineWidth(0.2);
  doc.setFontSize(9); doc.setTextColor(80, 80, 80);
  doc.text('НДС начисленный', 20, y + 6);
  doc.setFontSize(11); doc.setTextColor(15, 23, 42);
  doc.text(KZT(outVat), 20, y + 13);
  doc.setFontSize(9); doc.setTextColor(80, 80, 80);
  doc.text('НДС к зачёту', 80, y + 6);
  doc.setFontSize(11); doc.setTextColor(15, 23, 42);
  doc.text(KZT(inVat), 80, y + 13);
  doc.setFontSize(9); doc.setTextColor(120, 80, 0);
  doc.text(toPay > 0 ? 'К УПЛАТЕ В БЮДЖЕТ' : 'К ВОЗМЕЩЕНИЮ ИЗ БЮДЖЕТА', 140, y + 6);
  doc.setFontSize(14); doc.setTextColor(toPay > 0 ? 180 : 16, toPay > 0 ? 83 : 185, toPay > 0 ? 9 : 129);
  doc.text(KZT(Math.abs(outVat - inVat)), pageW - 20, y + 13, { align: 'right' });

  drawFooter(doc);
  doc.save(`nds-esf-${todayStamp()}.pdf`);
}

// ─── Акт сверки взаиморасчётов ─────────────────────────────────────
// KZ-standard reconciliation act between the company (Исполнитель) and a
// client. Lists every charge (sale) and payment for the period, then the
// closing balance ("задолженность в пользу ..."). Two signature lines.
export interface ReconciliationLine { date: string; doc: string; debit: number; credit: number }
export interface ReconciliationInput {
  counterpartyName: string;
  counterpartyBIN?: string;
  lines: ReconciliationLine[];   // debit = начислено клиенту, credit = оплачено клиентом
  openingBalance?: number;       // сальдо на начало (в пользу исполнителя +)
  periodLabel?: string;
}
export async function generateReconciliationPDF(input: ReconciliationInput, requisites: CompanyRequisites = {}, opts?: { number?: string }) {
  const doc = await newDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const num = opts?.number || todayStamp();
  drawHeader(doc, `Акт сверки № ${num}`, `Взаиморасчёты${input.periodLabel ? ' · ' + input.periodLabel : ''}`, requisites.legalName);

  let y = 38;
  doc.setFontSize(9); doc.setTextColor(15, 23, 42);
  doc.text(`Исполнитель: ${requisites.legalName || '—'}${requisites.bin ? `, БИН/ИИН ${requisites.bin}` : ''}`, 14, y); y += 5;
  doc.text(`Заказчик: ${input.counterpartyName}${input.counterpartyBIN ? `, БИН/ИИН ${input.counterpartyBIN}` : ''}`, 14, y); y += 7;

  const opening = input.openingBalance || 0;
  let running = opening;
  const body = input.lines.map(l => {
    running += (l.debit || 0) - (l.credit || 0);
    return [l.date || '', l.doc || '', l.debit ? KZT(l.debit) : '', l.credit ? KZT(l.credit) : '', KZT(running)];
  });
  const totalDebit = input.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = input.lines.reduce((s, l) => s + (l.credit || 0), 0);

  autoTable(doc, {
    startY: y,
    head: [['Дата', 'Документ', 'Начислено', 'Оплачено', 'Сальдо']],
    body: opening ? [['', 'Сальдо на начало', '', '', KZT(opening)], ...body] : body,
    foot: [['', 'Итого', KZT(totalDebit), KZT(totalCredit), KZT(running)]],
    styles: { font: 'Roboto', fontSize: 8, cellPadding: 2 },
    headStyles: { font: 'Roboto', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: 255 },
    footStyles: { font: 'Roboto', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });
  let yy = (doc as any).lastAutoTable.finalY + 8;

  const inFavor = running > 0 ? 'Исполнителя' : running < 0 ? 'Заказчика' : '—';
  doc.setFontSize(10); doc.setTextColor(15, 23, 42);
  doc.text(`Задолженность на конец периода: ${KZT(Math.abs(running))} в пользу ${inFavor}`, 14, yy); yy += 14;

  // Signature lines
  doc.setFontSize(9); doc.setTextColor(15, 23, 42);
  doc.text('От Исполнителя: __________________', 14, yy);
  doc.text('От Заказчика: __________________', pageW / 2 + 6, yy); yy += 6;
  doc.setFontSize(7); doc.setTextColor(120, 120, 120);
  doc.text(`М.П.  ${requisites.director || ''}`, 14, yy);
  doc.text('М.П.', pageW / 2 + 6, yy);

  drawFooter(doc);
  doc.save(`akt-sverki-${todayStamp()}.pdf`);
}

// ─── Расчётный листок (payslip) ────────────────────────────────────
export interface PayslipInput {
  employeeName: string;
  periodLabel: string;
  base: number; commission: number; gross: number;
  opv: number; vosms: number; ipn: number; net: number;
  oosms: number; so: number; opvr: number; sn: number;
  employerCost: number;
}
export async function generatePayslipPDF(p: PayslipInput, requisites: CompanyRequisites = {}) {
  const doc = await newDoc();
  drawHeader(doc, 'Расчётный листок', `${p.employeeName} · ${p.periodLabel}`, requisites.legalName);
  let y = 38;

  autoTable(doc, {
    startY: y,
    head: [['Начисления', 'Сумма']],
    body: [
      ['Оклад', KZT(p.base)],
      ['Премия (сделки)', KZT(p.commission)],
      ['Начислено (gross)', KZT(p.gross)],
    ],
    styles: { font: 'Roboto', fontSize: 9, cellPadding: 2.5 },
    headStyles: { font: 'Roboto', fontStyle: 'bold', fillColor: [16, 185, 129], textColor: 255 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  autoTable(doc, {
    startY: y,
    head: [['Удержания у работника', 'Сумма']],
    body: [
      ['ОПВ 10%', KZT(p.opv)],
      ['ВОСМС 2%', KZT(p.vosms)],
      ['ИПН 10% (с вычетом 14 МРП)', KZT(p.ipn)],
      ['К выплате на руки', KZT(p.net)],
    ],
    styles: { font: 'Roboto', fontSize: 9, cellPadding: 2.5 },
    headStyles: { font: 'Roboto', fontStyle: 'bold', fillColor: [225, 29, 72], textColor: 255 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  autoTable(doc, {
    startY: y,
    head: [['Взносы работодателя', 'Сумма']],
    body: [
      ['ООСМС 3%', KZT(p.oosms)],
      ['СО 3.5%', KZT(p.so)],
      ['ОПВР 2.5%', KZT(p.opvr)],
      ...(p.sn > 0 ? [['СН', KZT(p.sn)]] : []),
      ['Полная стоимость для бизнеса', KZT(p.employerCost)],
    ],
    styles: { font: 'Roboto', fontSize: 9, cellPadding: 2.5 },
    headStyles: { font: 'Roboto', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: 255 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  drawFooter(doc);
  doc.save(`payslip-${p.employeeName}-${todayStamp()}.pdf`);
}
