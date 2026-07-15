// Печать документов из сделки (КП / Счёт / Договор / Акт) — общий код
// для карточки заказа и для списка (канбан). Реквизиты компании тянем
// из team/requisites; тяжёлый PDF-модуль грузим лениво.
import { api } from './api';
import type { Deal } from './dataStore';

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
    await pdf.generateQuotePDF({ ...base, furnitureType: d.furnitureType, materials: d.materials }, req);
  } else if (kind === 'invoice') {
    await pdf.generateInvoicePDF({ ...base, customerPhone: d.phone, customerBIN: d.customerBIN, customerAddress: d.address, paidAmount: deal.paidAmount }, req);
  } else if (kind === 'contract') {
    await pdf.generateContractPDF({ ...base, customerPhone: d.phone, customerBIN: d.customerBIN, customerAddress: d.address, completionDate: d.completionDate, installationDate: d.installationDate }, req);
  } else if (kind === 'act') {
    await pdf.generateActPDF({ ...base, customerBIN: d.customerBIN, customerAddress: d.address }, req);
  }
}
