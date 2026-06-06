import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Loader2, Phone, MessageCircle, ShieldCheck, PackageCheck } from 'lucide-react';
import { api } from '../utils/api';

interface Props { orderId: string; }

// Public order tracking — fed by GET /api/track/:code (NO auth). The
// previous version read from useDataStore(), which only has data for a
// logged-in team member, so it never worked for an actual customer.
// This version fetches a sanitized snapshot directly so any client can
// open utir.kz/#/track/<code> and follow their order.

interface TrackData {
  company: { name: string; phone: string };
  order: {
    ref: string;
    customerFirstName: string;
    product: string;
    status: string;
    statusLabel: string;
    progress: number;
    rejected: boolean;
  };
  stages: Array<{ id: string; label: string; done: boolean; active: boolean; date: string }>;
  payment: { amount: number; paid: number; pct: number } | null;
  manager: { name: string; phone: string } | null;
  warranty: { startDate: string; endDate: string; months: number } | null;
  installationDate: string;
}

const fmtKzt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';

export function ClientTrack({ orderId }: Props) {
  const code = (orderId || '').trim();
  const [data, setData] = useState<TrackData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    api.get<TrackData>(`/api/track/${encodeURIComponent(code)}`)
      .then(d => { if (!cancelled) { setData(d); setState('ok'); } })
      .catch(() => { if (!cancelled) setState('notfound'); });
    return () => { cancelled = true; };
  }, [code]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-slate-50">
        <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
      </div>
    );
  }

  if (state === 'notfound' || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-slate-50">
        <div className="bg-white ring-1 ring-slate-100 shadow-sm rounded-3xl p-8 max-w-md w-full text-center">
          <div className="text-base text-slate-900 mb-1">Заказ не найден</div>
          <div className="text-xs text-slate-400">Проверьте ссылку или обратитесь к менеджеру.</div>
        </div>
      </div>
    );
  }

  const { company, order, stages, payment, manager, warranty } = data;
  const waPhone = (p: string) => p.replace(/\D/g, '');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center text-white text-sm font-medium">
              {(company.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-sm text-slate-900">{company.name}</div>
              <div className="text-[10px] text-slate-400">Заказ #{order.ref}{order.customerFirstName ? ` · ${order.customerFirstName}` : ''}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-4">
        {/* Status hero */}
        <div className="bg-white ring-1 ring-slate-100 shadow-sm rounded-3xl p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-slate-400">{order.product || 'Ваш заказ'}</div>
            {!order.rejected && <div className="text-[11px] text-slate-400 tabular-nums">{order.progress}%</div>}
          </div>
          <div className={`text-lg tracking-tight mb-3 ${order.rejected ? 'text-rose-600' : 'text-slate-900'}`}>
            {order.statusLabel}
          </div>
          {!order.rejected && (
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${order.progress}%` }} />
            </div>
          )}
        </div>

        {/* Timeline */}
        {!order.rejected && (
          <div className="bg-white ring-1 ring-slate-100 shadow-sm rounded-3xl p-5">
            <div className="text-xs text-slate-400 mb-4">Этапы</div>
            <div className="space-y-3">
              {stages.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${s.done ? 'bg-emerald-50' : s.active ? 'bg-sky-50' : 'bg-slate-50'}`}>
                    {s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : s.active ? <Loader2 className="w-4 h-4 text-sky-500 animate-spin" /> : <Clock className="w-4 h-4 text-slate-300" />}
                  </div>
                  <div className="flex-1 flex items-center justify-between">
                    <div className={`text-xs ${s.done || s.active ? 'text-slate-900' : 'text-slate-400'}`}>{s.label}</div>
                    {s.date && <div className="text-[10px] text-slate-400">{s.date}</div>}
                  </div>
                </div>
              ))}
            </div>
            {data.installationDate && order.status !== 'completed' && (
              <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-700 flex items-center gap-1.5">
                <PackageCheck className="w-3.5 h-3.5 text-slate-400" /> Монтаж запланирован: <span className="text-slate-900">{data.installationDate}</span>
              </div>
            )}
          </div>
        )}

        {/* Warranty (after completion) */}
        {warranty && (
          <div className="bg-white ring-1 ring-emerald-100 shadow-sm rounded-3xl p-5 flex items-center gap-3">
            <ShieldCheck className="w-7 h-7 text-emerald-500 flex-shrink-0" />
            <div>
              <div className="text-sm text-slate-900">Гарантия {warranty.months} мес.</div>
              <div className="text-[11px] text-slate-400">действует до {warranty.endDate}</div>
            </div>
          </div>
        )}

        {/* Payment */}
        {payment && (
          <div className="bg-white ring-1 ring-slate-100 shadow-sm rounded-3xl p-5">
            <div className="text-xs text-slate-400 mb-2">Оплата</div>
            <div className="text-sm text-slate-900 mb-2">Оплачено {fmtKzt(payment.paid)} из {fmtKzt(payment.amount)}</div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-emerald-500" style={{ width: `${payment.pct}%` }} />
            </div>
            {payment.pct < 100 && manager?.phone && (
              <a
                href={`https://wa.me/${waPhone(manager.phone)}?text=${encodeURIComponent(`Здравствуйте! Хочу доплатить по заказу #${order.ref}`)}`}
                className="block w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs text-center hover:bg-emerald-700"
              >
                Уточнить оплату
              </a>
            )}
          </div>
        )}

        {/* Manager contact */}
        {manager && (manager.phone || manager.name) && (
          <div className="bg-white ring-1 ring-slate-100 shadow-sm rounded-3xl p-5">
            <div className="text-xs text-slate-400 mb-3">Ваш менеджер</div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 bg-slate-100 rounded-full flex items-center justify-center text-xs text-slate-700">
                {(manager.name || '?').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-sm text-slate-900">{manager.name || 'Менеджер'}</div>
                {manager.phone && <div className="text-[11px] text-slate-400">{manager.phone}</div>}
              </div>
            </div>
            {manager.phone && (
              <div className="flex gap-2">
                <a href={`https://wa.me/${waPhone(manager.phone)}`} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-500 text-white rounded-xl text-xs hover:bg-emerald-600">
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </a>
                <a href={`tel:${manager.phone.replace(/\s/g, '')}`} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-sky-500 text-white rounded-xl text-xs hover:bg-sky-600">
                  <Phone className="w-3.5 h-3.5" /> Позвонить
                </a>
              </div>
            )}
          </div>
        )}

        <div className="text-center py-4 text-[11px] text-slate-400">{company.name}</div>
      </div>
    </div>
  );
}
