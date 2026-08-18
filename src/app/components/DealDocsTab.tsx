// ─── Вкладка «Документы» в карточке заказа ────────────────────────────
// Две бумаги по заказу и их согласование:
//   1) Расчёт и КП (цены)   — виден только тем, у кого есть право 'pricing'
//   2) Спецификация материалов — без цен, поэтому доступна цеху и клиенту
//
// Подтверждает и отправляет клиенту только роль с правом
// 'pricing-approve'. Кнопки ниже — лишь удобство: настоящая проверка
// живёт на сервере (server/dealDocs.ts), из браузера её не обойти.

import { useState } from 'react';
import {
  Lock, FileText, Package, Download, Send, Check, X, Loader2,
  Plus, Trash2, ExternalLink, AlertTriangle,
} from 'lucide-react';
import { useDataStore, type Deal, type DocFlowStatus, type SpecLine } from '../utils/dataStore';
import { api } from '../utils/api';
import { toast } from '../utils/toast';
import { confirmDialog } from '../utils/confirm';
import { downloadDealDoc, sendDealDocToClient } from '../utils/dealDocs';

type Lang = 'kz' | 'ru' | 'eng';

const fmt = (n: number) => Math.round(n || 0).toLocaleString('ru-RU') + ' ₸';
const fmtDate = (s?: string) => { try { return s ? new Date(s).toLocaleString('ru-RU') : ''; } catch { return s || ''; } };

export function DealDocsTab({ deal, language, onChanged }: {
  deal: Deal; language: Lang; onChanged?: () => void;
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();

  const pricingLevel = store.getModuleLevel('pricing');
  const canSeePrices = pricingLevel !== 'none';
  const canApprove = store.canWriteModule('pricing-approve');
  const canEditSpec = store.canWriteModule('production');

  const [estimate, setEstimate] = useState(deal.estimate);
  const [spec, setSpec] = useState(deal.spec);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<{ kind: string; url: string } | null>(null);

  const refresh = () => { store.reloadAll().catch(() => {}); onChanged?.(); };

  const STATUS_LABEL: Record<DocFlowStatus, string> = {
    draft:    l('Черновик', 'Жоба', 'Draft'),
    pending:  l('На подтверждении', 'Бекітуде', 'Awaiting approval'),
    approved: l('Подтверждён', 'Бекітілді', 'Approved'),
    sent:     l('Отправлен клиенту', 'Клиентке жіберілді', 'Sent to client'),
    accepted: l('Клиент согласился', 'Клиент келісті', 'Accepted'),
    rejected: l('Отклонён', 'Қабылданбады', 'Rejected'),
  };
  const STATUS_CLS: Record<DocFlowStatus, string> = {
    draft: 'bg-slate-100 text-slate-600',
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-sky-100 text-sky-800',
    sent: 'bg-emerald-100 text-emerald-800',
    accepted: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-rose-100 text-rose-700',
  };

  const Badge = ({ s }: { s: DocFlowStatus }) => (
    <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_CLS[s]}`}>{STATUS_LABEL[s]}</span>
  );

  // ── Действия ────────────────────────────────────────────────────────
  const decide = async (kind: 'estimate' | 'spec', action: 'approve' | 'reject') => {
    if (action === 'reject') {
      const ok = await confirmDialog({
        message: l('Отклонить документ? Автор сможет пересобрать его заново.',
                   'Құжатты қайтарасыз ба? Авторы қайта жасай алады.',
                   'Reject the document? The author can rebuild it.'),
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(`${kind}-${action}`);
    try {
      const doc = await api.post<any>(`/api/deals/${deal.id}/${kind}/${action}`, {});
      kind === 'estimate' ? setEstimate(doc) : setSpec(doc);
      toast(action === 'approve'
        ? l('Подтверждено', 'Бекітілді', 'Approved')
        : l('Отклонено', 'Қайтарылды', 'Rejected'), 'success');
      refresh();
    } catch (e: any) {
      toast(String(e?.message || '').includes('pricing-approve')
        ? l('Нет прав подтверждать документы клиенту', 'Клиентке құжат бекітуге құқық жоқ', 'No permission to approve client documents')
        : l('Не удалось выполнить', 'Орындалмады', 'Action failed'), 'error');
    } finally { setBusy(null); }
  };

  const download = async (kind: 'estimate' | 'spec') => {
    setBusy(`${kind}-dl`);
    try { await downloadDealDoc(kind, { ...deal, estimate, spec } as Deal); }
    catch { toast(l('Не удалось собрать PDF (проверьте интернет)', 'PDF жасалмады (интернетті тексеріңіз)', 'Failed to build the PDF (check your connection)'), 'error'); }
    finally { setBusy(null); }
  };

  const sendToClient = async (kind: 'estimate' | 'spec') => {
    setBusy(`${kind}-send`);
    try {
      const res = await sendDealDocToClient(kind, { ...deal, estimate, spec } as Deal);
      if (res.doc) kind === 'estimate' ? setEstimate(res.doc) : setSpec(res.doc);
      setLastUrl({ kind, url: res.url });
      if (res.ok) {
        toast(l('Документ отправлен клиенту в WhatsApp', 'Құжат клиентке WhatsApp-қа жіберілді', 'Document sent to the client on WhatsApp'), 'success');
      } else {
        // Честно говорим, почему автоматически не ушло, и даём отправить руками.
        toast(l('Автоматически отправить не удалось — отправьте ссылку вручную',
                'Автоматты жіберілмеді — сілтемені қолмен жіберіңіз',
                'Auto-send failed — send the link manually'), 'error');
      }
      refresh();
    } catch (e: any) {
      const m = String(e?.message || '');
      toast(m === 'not_approved'
        ? l('Сначала документ должен быть подтверждён', 'Алдымен құжат бекітілуі керек', 'The document must be approved first')
        : l('Не удалось отправить', 'Жіберілмеді', 'Send failed'), 'error');
    } finally { setBusy(null); }
  };

  // Ручная отправка: открывает WhatsApp с уже готовым текстом и ссылкой.
  // Работает всегда — в отличие от авто-отправки, которую Meta режет вне
  // 24-часового окна переписки.
  const manualWhatsApp = (url: string, kind: 'estimate' | 'spec') => {
    const phone = (deal.phone || '').replace(/\D/g, '');
    const text = (kind === 'estimate'
      ? l('Коммерческое предложение по вашему заказу:', 'Тапсырысыңыз бойынша КҰ:', 'Your quote:')
      : l('Спецификация материалов по вашему заказу:', 'Материалдар спецификациясы:', 'Materials spec:')) + ' ' + url;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  // ── Секция расчёта ──────────────────────────────────────────────────
  const renderEstimate = () => {
    if (!canSeePrices) {
      return (
        <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 px-4 py-6 text-center">
          <Lock className="w-5 h-5 text-slate-300 mx-auto mb-2" />
          <div className="text-xs text-slate-500">
            {l('Доступ к ценам ограничен', 'Бағаға қолжетімділік шектеулі', 'Price access is restricted')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {l('Расчёт и КП видят только финансист и администратор.',
               'Есеп пен КҰ-ны тек қаржыгер мен әкімші көреді.',
               'Only finance and admin can see the estimate and quote.')}
          </div>
        </div>
      );
    }
    if (!estimate) {
      return (
        <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 px-4 py-6 text-center">
          <FileText className="w-5 h-5 text-slate-300 mx-auto mb-2" />
          <div className="text-xs text-slate-500">{l('Расчёта пока нет', 'Есеп әзірге жоқ', 'No estimate yet')}</div>
          <div className="text-[11px] text-slate-400 mt-1">
            {l('Замерщик считает его в разделе Производство → Калькулятор и прикрепляет к этой карточке.',
               'Өлшеуші оны Өндіріс → Калькулятор бөлімінде есептеп, осы карточкаға тіркейді.',
               'The measurer builds it in Production → Calculator and attaches it to this card.')}
          </div>
        </div>
      );
    }

    const e = estimate;
    return (
      <div className="rounded-2xl bg-white/70 ring-1 ring-white/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
          <FileText className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-900">{l('Расчёт и КП', 'Есеп және КҰ', 'Estimate & quote')}</span>
          <Badge s={e.status} />
          <span className="text-[11px] text-slate-400 ml-auto">
            {e.createdByName ? `${e.createdByName} · ` : ''}{fmtDate(e.createdAt)}
          </span>
        </div>

        <div className="px-4 py-3">
          <div className="text-[11px] text-slate-400 mb-2">
            {e.productLabel}{e.area ? ` · ${e.area.toFixed(2)} м²` : ''}
          </div>

          {/* Строки — ровно то, что увидит клиент */}
          <div className="divide-y divide-slate-100 mb-3">
            {e.lines?.map((it, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 gap-3">
                <span className="text-xs text-slate-700 min-w-0 truncate">{it.name}</span>
                <span className="text-xs text-slate-900 flex-shrink-0">{fmt(it.price)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-2">
            <span className="text-sm text-slate-900">{l('Итого клиенту', 'Клиентке жиыны', 'Client total')}</span>
            <span className="text-sm text-slate-900">{fmt(e.total)}</span>
          </div>

          {/* Внутренняя раскладка — только для тех, кто видит цены */}
          <details className="mt-3">
            <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-slate-600">
              {l('Внутренняя раскладка', 'Ішкі бөлініс', 'Internal breakdown')}
            </summary>
            <div className="mt-2 space-y-1 text-[11px] text-slate-500">
              <div className="flex justify-between"><span>{l('Материалы', 'Материалдар', 'Materials')}</span><span>{fmt(e.materialsCost)}</span></div>
              <div className="flex justify-between"><span>{l('Доп. опции', 'Қосымша', 'Add-ons')}</span><span>{fmt(e.addonsCost)}</span></div>
              <div className="flex justify-between"><span>{l('Работа', 'Жұмыс', 'Labour')}</span><span>{fmt(e.servicesCost)}</span></div>
              <div className="flex justify-between"><span>{l('Наценка', 'Үстеме', 'Markup')} {e.markupPct}%</span><span>{fmt(e.markup)}</span></div>
              <div className="text-[10px] text-slate-400 pt-1">
                {l('Наценка разнесена по строкам — в КП клиент её отдельно не видит.',
                   'Үстеме жолдарға бөлінген — клиент оны бөлек көрмейді.',
                   'Markup is spread across the lines — the client never sees it separately.')}
              </div>
            </div>
          </details>

          {e.status === 'rejected' && e.rejectedReason && (
            <div className="mt-3 text-[11px] text-rose-700 bg-rose-50 ring-1 ring-rose-100 rounded-lg px-3 py-2">
              {l('Причина отклонения', 'Қайтару себебі', 'Rejection reason')}: {e.rejectedReason}
            </div>
          )}
          {e.status === 'sent' && (
            <div className="mt-3 text-[11px] text-emerald-700">
              {l('Отправлено клиенту', 'Клиентке жіберілді', 'Sent to client')} {fmtDate(e.sentAt)}
              {e.sentTo ? ` · +${e.sentTo}` : ''}
            </div>
          )}
          {e.sendError && e.status !== 'sent' && (
            <div className="mt-3 flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 ring-1 ring-amber-100 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                {l('Автоматическая отправка не прошла', 'Автоматты жіберу өтпеді', 'Auto-send did not go through')}
                {' '}({e.sendError}). {l('Документ готов — отправьте ссылку вручную.', 'Құжат дайын — сілтемені қолмен жіберіңіз.', 'The document is ready — send the link manually.')}
              </span>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap gap-2">
          <button onClick={() => download('estimate')} disabled={busy === 'estimate-dl'}
            className="px-3 py-1.5 rounded-lg text-[11px] bg-white ring-1 ring-slate-200 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50">
            {busy === 'estimate-dl' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {l('Скачать PDF', 'PDF жүктеу', 'Download PDF')}
          </button>

          {e.status === 'pending' && canApprove && (
            <>
              <button onClick={() => decide('estimate', 'approve')} disabled={!!busy}
                className="px-3 py-1.5 rounded-lg text-[11px] bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 disabled:opacity-50">
                {busy === 'estimate-approve' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                {l('Подтвердить цену', 'Бағаны бекіту', 'Approve price')}
              </button>
              <button onClick={() => decide('estimate', 'reject')} disabled={!!busy}
                className="px-3 py-1.5 rounded-lg text-[11px] bg-white ring-1 ring-rose-200 text-rose-600 hover:bg-rose-50 flex items-center gap-1.5 disabled:opacity-50">
                <X className="w-3 h-3" />{l('Отклонить', 'Қайтару', 'Reject')}
              </button>
            </>
          )}
          {e.status === 'pending' && !canApprove && (
            <span className="text-[11px] text-slate-400 self-center">
              {l('Ждёт подтверждения финансиста / администратора', 'Қаржыгер / әкімші бекітуін күтуде', 'Awaiting finance / admin approval')}
            </span>
          )}

          {(e.status === 'approved' || e.status === 'sent') && canApprove && (
            <button onClick={() => sendToClient('estimate')} disabled={!!busy}
              className="px-3 py-1.5 rounded-lg text-[11px] bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 disabled:opacity-50">
              {busy === 'estimate-send' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              {e.status === 'sent'
                ? l('Отправить ещё раз', 'Қайта жіберу', 'Send again')
                : l('Отправить КП клиенту в WhatsApp', 'КҰ-ны WhatsApp-қа жіберу', 'Send quote on WhatsApp')}
            </button>
          )}

          {lastUrl?.kind === 'estimate' && (
            <button onClick={() => manualWhatsApp(lastUrl.url, 'estimate')}
              className="px-3 py-1.5 rounded-lg text-[11px] bg-white ring-1 ring-slate-200 hover:bg-slate-50 flex items-center gap-1.5">
              <ExternalLink className="w-3 h-3" />{l('Открыть WhatsApp вручную', 'WhatsApp-ты қолмен ашу', 'Open WhatsApp manually')}
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── Секция спецификации ─────────────────────────────────────────────
  const [draftLines, setDraftLines] = useState<SpecLine[]>(deal.spec?.lines?.length ? deal.spec.lines : [{ name: '', qty: 1, unit: 'шт' }]);
  const [draftNote, setDraftNote] = useState(deal.spec?.note || '');
  const [editingSpec, setEditingSpec] = useState(!deal.spec);

  const saveSpec = async (replace = false) => {
    const lines = draftLines.filter(x => x.name.trim());
    if (!lines.length) { toast(l('Добавьте хотя бы один материал', 'Кемінде бір материал қосыңыз', 'Add at least one material'), 'error'); return; }
    setBusy('spec-save');
    try {
      const doc = await api.post<any>(`/api/deals/${deal.id}/spec`, { lines, note: draftNote, replace });
      setSpec(doc); setEditingSpec(false);
      toast(l('Спецификация отправлена на подтверждение', 'Спецификация бекітуге жіберілді', 'Spec sent for approval'), 'success');
      refresh();
    } catch (e: any) {
      if (String(e?.message) === 'spec_already_sent') {
        const ok = await confirmDialog({
          message: l('Спецификация уже отправлена клиенту. Заменить новой?',
                     'Спецификация клиентке жіберілген. Жаңасымен ауыстырасыз ба?',
                     'The spec was already sent. Replace it?'),
          danger: true,
        });
        if (ok) await saveSpec(true);
      } else {
        toast(l('Не удалось сохранить спецификацию', 'Спецификация сақталмады', 'Failed to save the spec'), 'error');
      }
    } finally { setBusy(null); }
  };

  const renderSpec = () => (
    <div className="rounded-2xl bg-white/70 ring-1 ring-white/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
        <Package className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-slate-900">{l('Спецификация материалов', 'Материалдар спецификациясы', 'Materials spec')}</span>
        {spec && <Badge s={spec.status} />}
        <span className="text-[10px] text-slate-400 ml-auto">{l('без цен · для цеха и клиента', 'бағасыз · цех пен клиентке', 'no prices · for workshop and client')}</span>
      </div>

      <div className="px-4 py-3">
        {editingSpec ? (
          <div className="space-y-2">
            {draftLines.map((ln, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={ln.name}
                  onChange={ev => setDraftLines(p => p.map((x, j) => j === i ? { ...x, name: ev.target.value } : x))}
                  placeholder={l('Материал / комплектующие', 'Материал / жинақтауыш', 'Material / component')}
                  className="flex-1 min-w-0 px-3 py-1.5 bg-white rounded-lg text-xs ring-1 ring-slate-200 focus:ring-emerald-400 outline-none"
                />
                <input
                  type="number" min={0} value={ln.qty}
                  onChange={ev => setDraftLines(p => p.map((x, j) => j === i ? { ...x, qty: Number(ev.target.value) || 0 } : x))}
                  className="w-16 px-2 py-1.5 bg-white rounded-lg text-xs ring-1 ring-slate-200 focus:ring-emerald-400 outline-none"
                />
                <input
                  value={ln.unit}
                  onChange={ev => setDraftLines(p => p.map((x, j) => j === i ? { ...x, unit: ev.target.value } : x))}
                  className="w-16 px-2 py-1.5 bg-white rounded-lg text-xs ring-1 ring-slate-200 focus:ring-emerald-400 outline-none"
                />
                <button onClick={() => setDraftLines(p => p.filter((_, j) => j !== i))}
                  className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button onClick={() => setDraftLines(p => [...p, { name: '', qty: 1, unit: 'шт' }])}
              className="text-[11px] text-slate-500 hover:text-slate-900 flex items-center gap-1">
              <Plus className="w-3 h-3" />{l('Добавить материал', 'Материал қосу', 'Add material')}
            </button>
            <textarea
              value={draftNote}
              onChange={ev => setDraftNote(ev.target.value)}
              placeholder={l('Примечание для цеха и клиента', 'Цех пен клиентке ескертпе', 'Note for workshop and client')}
              rows={2}
              className="w-full px-3 py-2 bg-white rounded-lg text-xs ring-1 ring-slate-200 focus:ring-emerald-400 outline-none resize-none"
            />
          </div>
        ) : spec ? (
          <>
            <div className="divide-y divide-slate-100">
              {spec.lines.map((ln, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 gap-3">
                  <span className="text-xs text-slate-700 min-w-0 truncate">{ln.name}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">{ln.qty} {ln.unit}</span>
                </div>
              ))}
            </div>
            {spec.note && <div className="text-[11px] text-slate-500 mt-2">{spec.note}</div>}
            {spec.status === 'sent' && (
              <div className="mt-2 text-[11px] text-emerald-700">
                {l('Отправлено клиенту', 'Клиентке жіберілді', 'Sent to client')} {fmtDate(spec.sentAt)}
              </div>
            )}
            {spec.sendError && spec.status !== 'sent' && (
              <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 ring-1 ring-amber-100 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{l('Автоотправка не прошла', 'Автожіберу өтпеді', 'Auto-send failed')} ({spec.sendError})</span>
              </div>
            )}
          </>
        ) : (
          <div className="text-[11px] text-slate-400 py-3 text-center">
            {l('Дизайнер ещё не согласовал материалы.', 'Дизайнер материалдарды әлі келіспеген.', 'The designer has not agreed the materials yet.')}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap gap-2">
        {editingSpec ? (
          <>
            <button onClick={() => saveSpec()} disabled={!!busy}
              className="px-3 py-1.5 rounded-lg text-[11px] bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 disabled:opacity-50">
              {busy === 'spec-save' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {l('Отправить на подтверждение', 'Бекітуге жіберу', 'Send for approval')}
            </button>
            {spec && (
              <button onClick={() => setEditingSpec(false)}
                className="px-3 py-1.5 rounded-lg text-[11px] bg-white ring-1 ring-slate-200 hover:bg-slate-50">
                {l('Отмена', 'Болдырмау', 'Cancel')}
              </button>
            )}
          </>
        ) : (
          <>
            {spec && (
              <button onClick={() => download('spec')} disabled={busy === 'spec-dl'}
                className="px-3 py-1.5 rounded-lg text-[11px] bg-white ring-1 ring-slate-200 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50">
                {busy === 'spec-dl' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                {l('Скачать PDF (в цех)', 'PDF жүктеу (цехқа)', 'Download PDF (workshop)')}
              </button>
            )}
            {canEditSpec && (
              <button onClick={() => { setDraftLines(spec?.lines?.length ? spec.lines : [{ name: '', qty: 1, unit: 'шт' }]); setDraftNote(spec?.note || ''); setEditingSpec(true); }}
                className="px-3 py-1.5 rounded-lg text-[11px] bg-white ring-1 ring-slate-200 hover:bg-slate-50">
                {spec ? l('Изменить', 'Өзгерту', 'Edit') : l('Заполнить материалы', 'Материалдарды толтыру', 'Fill in materials')}
              </button>
            )}
            {spec?.status === 'pending' && canApprove && (
              <>
                <button onClick={() => decide('spec', 'approve')} disabled={!!busy}
                  className="px-3 py-1.5 rounded-lg text-[11px] bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 disabled:opacity-50">
                  {busy === 'spec-approve' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  {l('Подтвердить', 'Бекіту', 'Approve')}
                </button>
                <button onClick={() => decide('spec', 'reject')} disabled={!!busy}
                  className="px-3 py-1.5 rounded-lg text-[11px] bg-white ring-1 ring-rose-200 text-rose-600 hover:bg-rose-50 flex items-center gap-1.5 disabled:opacity-50">
                  <X className="w-3 h-3" />{l('Отклонить', 'Қайтару', 'Reject')}
                </button>
              </>
            )}
            {(spec?.status === 'approved' || spec?.status === 'sent') && canApprove && (
              <button onClick={() => sendToClient('spec')} disabled={!!busy}
                className="px-3 py-1.5 rounded-lg text-[11px] bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 disabled:opacity-50">
                {busy === 'spec-send' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                {spec.status === 'sent' ? l('Отправить ещё раз', 'Қайта жіберу', 'Send again') : l('Отправить клиенту', 'Клиентке жіберу', 'Send to client')}
              </button>
            )}
            {lastUrl?.kind === 'spec' && (
              <button onClick={() => manualWhatsApp(lastUrl.url, 'spec')}
                className="px-3 py-1.5 rounded-lg text-[11px] bg-white ring-1 ring-slate-200 hover:bg-slate-50 flex items-center gap-1.5">
                <ExternalLink className="w-3 h-3" />{l('Открыть WhatsApp вручную', 'WhatsApp-ты қолмен ашу', 'Open WhatsApp manually')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {renderEstimate()}
      {renderSpec()}
      <div className="text-[10px] text-slate-400 px-1 leading-relaxed">
        {l('Порядок: замерщик считает цену → финансист/админ подтверждает и отправляет КП клиенту → после согласия дизайнер заполняет материалы → админ подтверждает → спецификация уходит клиенту и в цех.',
           'Тәртіп: өлшеуші бағаны есептейді → қаржыгер/әкімші бекітіп, КҰ-ны клиентке жібереді → келіскен соң дизайнер материалдарды толтырады → әкімші бекітеді → спецификация клиентке және цехқа кетеді.',
           'Flow: measurer prices it → finance/admin approves and sends the quote → once agreed the designer fills in materials → admin approves → the spec goes to the client and the workshop.')}
      </div>
    </div>
  );
}
