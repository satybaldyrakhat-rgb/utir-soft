// Печать документов из сделки (КП / Счёт / Договор / Акт) — общий код
// для карточки заказа и для списка (канбан). Реквизиты компании тянем
// из team/requisites; тяжёлый PDF-модуль грузим лениво.
import { api } from './api';
import type { Deal } from './dataStore';
import type { PdfFile } from './pdfReports';

export type DealDocKind = 'quote' | 'invoice' | 'contract' | 'act';

export const DEAL_DOC_LABELS: { k: DealDocKind; ru: string; kz: string; eng: string }[] = [
  { k: 'quote',    ru: 'КП',      kz: 'КҰ',   eng: 'Quote' },
  { k: 'invoice',  ru: 'Счёт',    kz: 'Шот',  eng: 'Invoice' },
  { k: 'contract', ru: 'Договор', kz: 'Шарт', eng: 'Contract' },
  { k: 'act',      ru: 'Акт',     kz: 'Акт',  eng: 'Act' },
];

// Генерирует и скачивает выбранный документ по данным сделки.
// nicheLabel — подпись направления для мультинишевых команд (необязательно).
export async function printDealDoc(kind: DealDocKind, deal: Deal, nicheLabel?: string): Promise<void> {
  const pdf = await import('./pdfReports');
  let req: any = {};
  try { req = await api.get('/api/team/requisites'); } catch { /* best-effort — бланк без реквизитов */ }
  const d = deal as any;
  const base = { id: deal.id, customerName: deal.customerName || '—', amount: deal.amount || 0, product: deal.product, nicheLabel };
  if (kind === 'quote') {
    // Если по сделке есть расчёт замерщика — печатаем построчное КП
    // (клиенту видно, за что он платит), иначе прежний однострочник.
    await pdf.generateQuotePDF({ ...base, ...quoteExtras(deal), furnitureType: d.furnitureType, materials: d.materials }, req);
  } else if (kind === 'invoice') {
    await pdf.generateInvoicePDF({ ...base, customerPhone: d.phone, customerBIN: d.customerBIN, customerAddress: d.address, paidAmount: deal.paidAmount }, req);
  } else if (kind === 'contract') {
    await pdf.generateContractPDF({ ...base, customerPhone: d.phone, customerBIN: d.customerBIN, customerAddress: d.address, completionDate: d.completionDate, installationDate: d.installationDate }, req);
  } else if (kind === 'act') {
    await pdf.generateActPDF({ ...base, customerBIN: d.customerBIN, customerAddress: d.address }, req);
  }
}

// ─── Расчёт и спецификация: печать и отправка клиенту ─────────────────

// Поля КП, которые берутся из расчёта замерщика (если он есть).
function quoteExtras(deal: Deal) {
  const est = deal.estimate;
  if (!est) return { customerPhone: deal.phone };
  return {
    customerPhone: deal.phone,
    amount: est.total || deal.amount || 0,
    items: est.lines,
    dimensions: est.dims ? `${est.dims.length} × ${est.dims.width} × ${est.dims.height} м` : undefined,
    materials: est.materialChoices?.map(m => `${m.group}: ${m.option}`).join(', ') || undefined,
    product: est.productLabel || deal.product,
    leadDays: est.leadDays,
  };
}

async function requisites() {
  try { return await api.get<any>('/api/team/requisites'); } catch { return {}; }
}

// Собрать PDF файлом (не скачивая) — для отправки клиенту.
// output:'file' гарантированно возвращает PdfFile, поэтому сужаем тип.
export async function buildDealDocFile(kind: 'estimate' | 'spec', deal: Deal, nicheLabel?: string): Promise<PdfFile> {
  const pdf = await import('./pdfReports');
  const req = await requisites();
  if (kind === 'estimate') {
    return await pdf.generateQuotePDF({
      id: deal.id, customerName: deal.customerName || '—', amount: deal.amount || 0,
      nicheLabel, ...quoteExtras(deal),
    }, req, { output: 'file' }) as PdfFile;
  }
  return await pdf.generateSpecPDF({
    id: deal.id, customerName: deal.customerName || '—', customerPhone: deal.phone,
    product: deal.estimate?.productLabel || deal.product, nicheLabel,
    lines: deal.spec?.lines || [], note: deal.spec?.note,
  }, req, { output: 'file' }) as PdfFile;
}

// Скачать документ себе (просмотр перед отправкой / печать в цех).
export async function downloadDealDoc(kind: 'estimate' | 'spec', deal: Deal, nicheLabel?: string) {
  const pdf = await import('./pdfReports');
  const req = await requisites();
  if (kind === 'estimate') {
    await pdf.generateQuotePDF({
      id: deal.id, customerName: deal.customerName || '—', amount: deal.amount || 0,
      nicheLabel, ...quoteExtras(deal),
    }, req);
    return;
  }
  await pdf.generateSpecPDF({
    id: deal.id, customerName: deal.customerName || '—', customerPhone: deal.phone,
    product: deal.estimate?.productLabel || deal.product, nicheLabel,
    lines: deal.spec?.lines || [], note: deal.spec?.note,
  }, req);
}

export interface SendDocResult { ok: boolean; url: string; phone?: string; error?: string; doc?: any }

// Сгенерировать PDF и отправить клиенту в WhatsApp через сервер.
// Сервер сам проверит право подтверждать и статус документа.
export async function sendDealDocToClient(kind: 'estimate' | 'spec', deal: Deal, nicheLabel?: string): Promise<SendDocResult> {
  const file = await buildDealDocFile(kind, deal, nicheLabel);
  return api.post<SendDocResult>(`/api/deals/${deal.id}/${kind}/send`, {
    pdfBase64: file.base64,
    filename: file.filename,
  }, { timeoutMs: 60_000 });
}
