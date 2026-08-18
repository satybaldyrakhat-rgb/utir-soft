// ─── Модалка оплаты подписки ──────────────────────────────────────────
// Выбор тарифа + периода + способа оплаты. CloudPayments — виджет (карта +
// автопродление), FreedomPay — редирект, Kaspi — «Скоро» (в разработке).
// Подписку активирует webhook на сервере, НЕ этот компонент.

import { useEffect, useState } from 'react';
import { X, CreditCard, Check, Loader2 } from 'lucide-react';
import { api } from '../utils/api';

declare global { interface Window { cp?: any } }

type Lang = 'kz' | 'ru' | 'eng';
type PlanId = 'basic' | 'pro' | 'enterprise';
type Period = 'monthly' | 'semiannual' | 'annual';

interface PlanRow { plan: PlanId; monthly: number; prices: Record<Period, number> }
interface PlansResp { plans: PlanRow[]; providers: { cloudpayments: boolean; freedompay: boolean; kaspi: boolean } }
interface CheckoutResp {
  provider: 'cloudpayments' | 'freedompay';
  invoiceId: string; amount: number; currency?: string;
  publicId?: string; description?: string; accountId?: string; months?: number; testMode?: boolean;
  redirectUrl?: string;
}

const PLAN_NAMES: Record<PlanId, [string, string, string]> = {
  basic:      ['Базовый', 'Базалық', 'Basic'],
  pro:        ['Профи', 'Профи', 'Pro'],
  enterprise: ['Бизнес', 'Бизнес', 'Business'],
};

export function BillingModal({ language, open, onClose, onPaid }: {
  language: Lang; open: boolean; onClose: () => void; onPaid: () => void;
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [data, setData] = useState<PlansResp | null>(null);
  const [plan, setPlan] = useState<PlanId>('pro');
  const [period, setPeriod] = useState<Period>('monthly');
  const [provider, setProvider] = useState<'cloudpayments' | 'freedompay'>('cloudpayments');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api.get<PlansResp>('/api/billing/plans')
      .then(d => {
        setData(d);
        // выбрать доступный провайдер по умолчанию
        if (!d.providers.cloudpayments && d.providers.freedompay) setProvider('freedompay');
      })
      .catch(() => setErr(l('Не удалось загрузить тарифы', 'Тарифтерді жүктеу қатесі', 'Failed to load plans')));
  }, [open]);

  if (!open) return null;

  const priceFor = (p: PlanId) => data?.plans.find(x => x.plan === p)?.prices[period] ?? 0;
  const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸';
  const periodLabel = (p: Period) => p === 'annual'
    ? l('год', 'жыл', 'year') : p === 'semiannual'
    ? l('полгода', 'жарты жыл', '6 mo') : l('месяц', 'ай', 'month');

  async function pay() {
    setErr(null); setBusy(true);
    try {
      const c = await api.post<CheckoutResp>('/api/billing/checkout', { plan, period, provider, language });

      if (c.provider === 'freedompay' && c.redirectUrl) {
        window.location.href = c.redirectUrl;   // уходим на страницу FreedomPay
        return;
      }

      // CloudPayments: открыть виджет
      if (!window.cp?.CloudPayments) {
        setErr(l('Виджет оплаты не загрузился. Обновите страницу.', 'Төлем виджеті жүктелмеді. Бетті жаңартыңыз.', 'Payment widget failed to load. Refresh the page.'));
        setBusy(false); return;
      }
      const widget = new window.cp.CloudPayments({ language: language === 'kz' ? 'ru-RU' : language === 'eng' ? 'en-US' : 'ru-RU' });
      widget.pay('charge', {
        publicId: c.publicId,
        description: c.description,
        amount: c.amount,
        currency: c.currency || 'KZT',
        invoiceId: c.invoiceId,
        accountId: c.accountId,
        skin: 'modern',
        data: { plan, period, cloudPayments: { recurrent: { interval: 'Month', period: c.months || 1 } } },
      }, {
        onSuccess() {
          // НЕ активируем здесь — это делает webhook. Ждём и перечитываем статус.
          setBusy(false);
          setTimeout(onPaid, 2500);
          onClose();
        },
        onFail(reason: string) {
          setBusy(false);
          setErr(l('Оплата не прошла: ', 'Төлем өтпеді: ', 'Payment failed: ') + reason);
        },
        onComplete() { /* виджет закрыт */ },
      });
    } catch (e: any) {
      setBusy(false);
      const code = e?.message || '';
      if (code === 'cloudpayments_not_configured' || code === 'freedompay_not_configured') {
        setErr(l('Этот способ оплаты ещё не подключён.', 'Бұл төлем әдісі әлі қосылмаған.', 'This payment method is not connected yet.'));
      } else if (code === 'kaspi_soon') {
        setErr(l('Оплата через Kaspi скоро будет доступна.', 'Kaspi арқылы төлем жақында қосылады.', 'Kaspi payment is coming soon.'));
      } else {
        setErr(l('Ошибка. Попробуйте ещё раз.', 'Қате. Қайталап көріңіз.', 'Something went wrong. Try again.'));
      }
    }
  }

  const periods: Period[] = ['monthly', 'semiannual', 'annual'];
  const plans: PlanId[] = ['basic', 'pro', 'enterprise'];
  const pn = (p: PlanId) => PLAN_NAMES[p][language === 'kz' ? 1 : language === 'eng' ? 2 : 0];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-slate-900">{l('Оформить подписку', 'Жазылымды рәсімдеу', 'Subscribe')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg" aria-label="close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Период */}
          <div>
            <div className="text-xs text-slate-500 mb-2">{l('Период оплаты', 'Төлем мерзімі', 'Billing period')}</div>
            <div className="flex gap-2">
              {periods.map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`flex-1 py-2 rounded-xl text-sm border ${period === p ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'}`}>
                  {periodLabel(p)}{p === 'annual' && <span className="block text-[10px] text-emerald-600">−20%</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Тариф */}
          <div>
            <div className="text-xs text-slate-500 mb-2">{l('Тариф', 'Тариф', 'Plan')}</div>
            <div className="space-y-2">
              {plans.map(p => (
                <button key={p} onClick={() => setPlan(p)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left ${plan === p ? 'border-sky-500 bg-sky-50' : 'border-slate-200'}`}>
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    {plan === p && <Check className="w-4 h-4 text-sky-600" />}{pn(p)}
                  </span>
                  <span className="text-sm text-slate-900">{fmt(priceFor(p))}<span className="text-slate-400">/{periodLabel(period)}</span></span>
                </button>
              ))}
            </div>
          </div>

          {/* Способ оплаты */}
          <div>
            <div className="text-xs text-slate-500 mb-2">{l('Способ оплаты', 'Төлем әдісі', 'Payment method')}</div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setProvider('cloudpayments')}
                className={`py-2 rounded-xl text-xs border ${provider === 'cloudpayments' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'}`}>
                <CreditCard className="w-4 h-4 mx-auto mb-1" />{l('Картой', 'Картамен', 'Card')}
              </button>
              <button onClick={() => setProvider('freedompay')}
                className={`py-2 rounded-xl text-xs border ${provider === 'freedompay' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'}`}>
                FreedomPay
              </button>
              <button disabled title={l('В разработке', 'Әзірленуде', 'In development')}
                className="py-2 rounded-xl text-xs border border-slate-200 text-slate-300 cursor-not-allowed relative">
                Kaspi
                <span className="block text-[9px] text-slate-400">{l('скоро', 'жақында', 'soon')}</span>
              </button>
            </div>
          </div>

          {err && <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{err}</div>}

          <button onClick={pay} disabled={busy}
            className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-medium flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {l('Оплатить', 'Төлеу', 'Pay')} {fmt(priceFor(plan))}
          </button>
          <p className="text-[11px] text-slate-400 text-center">
            {l('Оплата защищена. Подписка активируется автоматически после оплаты.',
               'Төлем қорғалған. Жазылым төлемнен кейін автоматты іске қосылады.',
               'Secure payment. Subscription activates automatically after payment.')}
          </p>
        </div>
      </div>
    </div>
  );
}
