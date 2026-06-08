import { useEffect, useMemo, useState } from 'react';
import { Loader2, CheckCircle2, Send } from 'lucide-react';
import { api } from '../utils/api';
import { getNiche } from '../utils/niches';

// Public lead-capture form — opened at #/lead/<code>?c=<campaign>&s=<source>.
// Submits straight into the team's funnel as a `new` deal tagged with the
// campaign/source from the URL, so a marketer can paste a UTM-style link in
// an Instagram bio or ad and see exactly which campaign produced each lead.
// No login, no team data exposed beyond the company name.

interface Props { route: string } // everything after '#/lead/'

interface Info { company: { name: string }; niche: string }

export function LeadForm({ route }: Props) {
  // route = "L1A2B3C?c=Промо&s=Instagram" → code + query params.
  const { code, campaign, source } = useMemo(() => {
    const [rawCode, qs] = (route || '').split('?');
    const p = new URLSearchParams(qs || '');
    return {
      code: (rawCode || '').trim().toUpperCase(),
      campaign: p.get('c') || p.get('campaign') || '',
      source: p.get('s') || p.get('source') || 'Сайт',
    };
  }, [route]);

  const [info, setInfo] = useState<Info | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading');
  const [form, setForm] = useState({ name: '', phone: '', product: '', comment: '' });
  const [submit, setSubmit] = useState<'idle' | 'sending' | 'done'>('idle');
  const [err, setErr] = useState('');

  useEffect(() => {
    let off = false;
    api.get<Info>(`/api/lead/${encodeURIComponent(code)}`)
      .then(d => { if (!off) { setInfo(d); setState('ok'); } })
      .catch(() => { if (!off) setState('notfound'); });
    return () => { off = true; };
  }, [code]);

  const productOptions = info ? getNiche(info.niche).productTypeOptions : [];

  const send = () => {
    if (!form.name.trim() || !form.phone.trim()) { setErr('Укажите имя и телефон'); return; }
    setErr('');
    setSubmit('sending');
    api.post(`/api/lead/${encodeURIComponent(code)}`, {
      name: form.name, phone: form.phone, product: form.product, comment: form.comment,
      source, campaign,
    })
      .then(() => setSubmit('done'))
      .catch(() => { setSubmit('idle'); setErr('Не удалось отправить. Попробуйте ещё раз.'); });
  };

  if (state === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-6 h-6 text-slate-300 animate-spin" /></div>;
  }
  if (state === 'notfound' || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 bg-slate-50">
        <div className="bg-white ring-1 ring-slate-100 shadow-sm rounded-3xl p-8 max-w-md w-full text-center">
          <div className="text-base text-slate-900 mb-1">Форма не найдена</div>
          <div className="text-xs text-slate-400">Проверьте ссылку или свяжитесь с компанией.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="flex items-center gap-2.5 mb-5 justify-center">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white text-sm font-medium">
            {(info.company.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="text-sm text-slate-900">{info.company.name}</div>
        </div>

        {submit === 'done' ? (
          <div className="bg-white ring-1 ring-emerald-100 shadow-sm rounded-3xl p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <div className="text-base text-slate-900 mb-1">Заявка отправлена!</div>
            <div className="text-xs text-slate-400">Мы свяжемся с вами в ближайшее время.</div>
          </div>
        ) : (
          <div className="bg-white ring-1 ring-slate-100 shadow-sm rounded-3xl p-6">
            <div className="text-lg text-slate-900 tracking-tight mb-1">Оставьте заявку</div>
            <div className="text-xs text-slate-400 mb-5">Заполните форму — перезвоним и бесплатно проконсультируем.</div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Ваше имя *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Как к вам обращаться"
                  className="w-full px-3.5 py-2.5 bg-slate-50 ring-1 ring-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Телефон *</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  inputMode="tel" placeholder="+7 ___ ___ __ __"
                  className="w-full px-3.5 py-2.5 bg-slate-50 ring-1 ring-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              {productOptions.length > 0 && (
                <div>
                  <label className="text-[11px] text-slate-500 mb-1 block">Что интересует</label>
                  <input list="lead-products" value={form.product} onChange={e => setForm({ ...form, product: e.target.value })}
                    placeholder="Необязательно"
                    className="w-full px-3.5 py-2.5 bg-slate-50 ring-1 ring-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  <datalist id="lead-products">{productOptions.map(p => <option key={p} value={p} />)}</datalist>
                </div>
              )}
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Комментарий</label>
                <textarea value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })}
                  rows={2} placeholder="Размеры, пожелания, удобное время звонка…"
                  className="w-full px-3.5 py-2.5 bg-slate-50 ring-1 ring-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
              </div>

              {err && <div className="text-[11px] text-rose-500">{err}</div>}

              <button onClick={send} disabled={submit === 'sending'}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {submit === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" strokeWidth={1.5} />}
                Отправить заявку
              </button>
              <div className="text-[10px] text-slate-400 text-center leading-relaxed">
                Нажимая «Отправить», вы соглашаетесь на обработку персональных данных.
              </div>
            </div>
          </div>
        )}
        <div className="text-center mt-5 text-[11px] text-slate-400">{info.company.name}</div>
      </div>
    </div>
  );
}
