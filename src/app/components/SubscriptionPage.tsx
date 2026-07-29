// ─── Страница «Оплата и подписка» (в приложении) ──────────────────────
// Текущий тариф, срок, автопродление, история платежей, кнопка оплаты.
// Оплату проводит BillingModal; подписку активирует webhook на сервере.

import { useEffect, useState } from 'react';
import { CreditCard, RefreshCw, Check, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { api } from '../utils/api';
import { BillingModal } from './BillingModal';

type Lang = 'kz' | 'ru' | 'eng';

interface SubFull {
  plan: string; status: string; effective: 'trial' | 'active' | 'expired';
  amount: number; currency: string; period: string;
  startedAt: string; expiresAt: string; daysLeft: number | null;
  autoRenew: boolean; provider: string | null; lastPaymentAt: string | null; suspended: boolean;
}
interface Payment { id: string; amount: number; currency: string; status: string; kind: string; provider: string; created_at: string }

const PLAN_NAMES: Record<string, [string, string, string]> = {
  trial:      ['Пробный', 'Сынақ', 'Trial'],
  basic:      ['Базовый', 'Базалық', 'Basic'],
  pro:        ['Профи', 'Профи', 'Pro'],
  enterprise: ['Бизнес', 'Бизнес', 'Business'],
};

export function SubscriptionPage({ language }: { language: Lang }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [sub, setSub] = useState<SubFull | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showBilling, setShowBilling] = useState(false);
  const [savingRenew, setSavingRenew] = useState(false);

  const load = () => {
    api.get<SubFull>('/api/billing/subscription').then(setSub).catch(() => setSub(null));
    api.get<Payment[]>('/api/billing/payments').then(setPayments).catch(() => setPayments([]));
  };
  useEffect(load, []);

  const planName = (p: string) => PLAN_NAMES[p]?.[language === 'kz' ? 1 : language === 'eng' ? 2 : 0] || p;
  const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸';
  const periodLabel = (p: string) => p === 'annual' ? l('год', 'жыл', 'year') : p === 'semiannual' ? l('полгода', 'жарты жыл', '6 mo') : l('месяц', 'ай', 'month');
  const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString('ru-RU'); } catch { return s; } };

  async function toggleRenew() {
    if (!sub) return;
    setSavingRenew(true);
    try {
      await api.post('/api/billing/auto-renew', { enabled: !sub.autoRenew });
      setSub({ ...sub, autoRenew: !sub.autoRenew });
    } catch { /* ignore */ } finally { setSavingRenew(false); }
  }

  // Статус-бейдж
  const statusView = () => {
    if (!sub) return null;
    if (sub.suspended) return { text: l('Заблокировано', 'Бұғатталған', 'Suspended'), cls: 'bg-rose-100 text-rose-700', Icon: AlertTriangle };
    if (sub.effective === 'active') return { text: l('Активна', 'Белсенді', 'Active'), cls: 'bg-emerald-100 text-emerald-700', Icon: Check };
    if (sub.effective === 'trial') return { text: l('Пробный период', 'Сынақ кезеңі', 'Trial'), cls: 'bg-sky-100 text-sky-700', Icon: Clock };
    return { text: l('Не оплачено', 'Төленбеген', 'Not paid'), cls: 'bg-amber-100 text-amber-700', Icon: AlertTriangle };
  };
  const sv = statusView();

  const payStatusLabel = (s: string) => s === 'paid' ? l('Оплачено', 'Төленді', 'Paid') : s === 'failed' ? l('Ошибка', 'Қате', 'Failed') : s === 'refunded' ? l('Возврат', 'Қайтарым', 'Refunded') : s;
  const payKindLabel = (k: string) => k === 'recurrent' ? l('автопродление', 'автоұзарту', 'auto-renew') : k === 'refund' ? l('возврат', 'қайтарым', 'refund') : l('платёж', 'төлем', 'payment');

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl lg:text-2xl font-semibold text-slate-900">{l('Оплата и подписка', 'Төлем және жазылым', 'Billing & subscription')}</h1>
        <button onClick={load} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" aria-label="refresh"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {/* Карточка тарифа */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:p-6 mb-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">{l('Текущий тариф', 'Ағымдағы тариф', 'Current plan')}</div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold text-slate-900">{sub ? planName(sub.plan) : '—'}</span>
              {sv && <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${sv.cls}`}><sv.Icon className="w-3 h-3" />{sv.text}</span>}
            </div>
            {sub && sub.amount > 0 && (
              <div className="text-sm text-slate-500 mt-1">{fmt(sub.amount)} / {periodLabel(sub.period)}</div>
            )}
          </div>
          <button onClick={() => setShowBilling(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium">
            <CreditCard className="w-4 h-4" />
            {sub?.effective === 'active' ? l('Продлить / сменить тариф', 'Ұзарту / тариф ауыстыру', 'Renew / change plan') : l('Оформить подписку', 'Жазылымды рәсімдеу', 'Subscribe')}
          </button>
        </div>

        {/* Срок + автопродление */}
        <div className="grid sm:grid-cols-2 gap-4 mt-5 pt-5 border-t border-slate-100">
          <div>
            <div className="text-xs text-slate-500">{sub?.effective === 'trial' ? l('Пробный период до', 'Сынақ кезеңі', 'Trial until') : l('Действует до', 'Дейін жарамды', 'Valid until')}</div>
            <div className="text-sm font-medium text-slate-900 mt-0.5">
              {sub ? fmtDate(sub.expiresAt) : '—'}
              {sub?.daysLeft != null && sub.daysLeft >= 0 && (
                <span className="text-slate-400 font-normal"> · {l('осталось', 'қалды', 'left')} {sub.daysLeft} {l('дн.', 'күн', 'd')}</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">{l('Автопродление', 'Автоұзарту', 'Auto-renewal')}</div>
            <button onClick={toggleRenew} disabled={savingRenew || !sub}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border ${sub?.autoRenew ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
              <span className={`w-8 h-4 rounded-full relative transition-colors ${sub?.autoRenew ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${sub?.autoRenew ? 'left-4' : 'left-0.5'}`} />
              </span>
              {sub?.autoRenew ? l('Включено', 'Қосулы', 'On') : l('Выключено', 'Өшірулі', 'Off')}
            </button>
          </div>
        </div>
      </div>

      {/* Безопасность */}
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-6 px-1">
        <ShieldCheck className="w-3.5 h-3.5" />
        {l('Платежи проходят через защищённый шлюз. Данные карты мы не храним.',
           'Төлемдер қорғалған шлюз арқылы өтеді. Карта деректерін сақтамаймыз.',
           'Payments go through a secure gateway. We don’t store card data.')}
      </div>

      {/* История платежей */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 text-sm font-medium text-slate-700">{l('История платежей', 'Төлемдер тарихы', 'Payment history')}</div>
        {payments.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">{l('Пока нет платежей', 'Әзірге төлемдер жоқ', 'No payments yet')}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-sm text-slate-800">{fmt(p.amount)} <span className="text-slate-400 text-xs">· {payKindLabel(p.kind)}</span></div>
                  <div className="text-xs text-slate-400">{fmtDate(p.created_at)} · {p.provider}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : p.status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                  {payStatusLabel(p.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <BillingModal language={language} open={showBilling} onClose={() => setShowBilling(false)} onPaid={load} />
    </div>
  );
}
