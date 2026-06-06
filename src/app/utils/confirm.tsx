// ─── Confirm dialog (Д7) ────────────────────────────────────────────
// On-brand replacement for the native confirm(). Promise-based so call
// sites read almost like before:
//
//   if (await confirmDialog({ message: 'Удалить?', danger: true })) …
//
// A single <ConfirmHost/> mounted in App listens (same pattern as the
// Toaster) and renders the glass modal. If the host isn't mounted yet
// (very early boot) we fall back to window.confirm so nothing silently
// no-ops. Buttons are localised via the language passed to the host.

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

type Lang = 'kz' | 'ru' | 'eng';

export interface ConfirmOpts {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface Req extends ConfirmOpts { resolve: (v: boolean) => void }

// Module-level bridge between confirmDialog() and the mounted host.
let push: ((r: Req) => void) | null = null;

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise(resolve => {
    if (typeof window === 'undefined') { resolve(false); return; }
    if (!push) { resolve(window.confirm(opts.message)); return; } // host not mounted yet
    push({ ...opts, resolve });
  });
}

const L = (lang: Lang) => ({
  cancel:  lang === 'kz' ? 'Болдырмау' : lang === 'eng' ? 'Cancel'  : 'Отмена',
  confirm: lang === 'kz' ? 'Растау'    : lang === 'eng' ? 'Confirm' : 'Подтвердить',
});

export function ConfirmHost({ language = 'ru' }: { language?: Lang }) {
  const [req, setReq] = useState<Req | null>(null);

  useEffect(() => {
    push = (r: Req) => setReq(r);
    return () => { push = null; };
  }, []);

  const done = (v: boolean) => { req?.resolve(v); setReq(null); };

  // Esc cancels · Enter confirms.
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      else if (e.key === 'Enter') { e.preventDefault(); done(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  if (!req) return null;
  const danger = !!req.danger;
  const t = L(language);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => done(false)} />
      <div className="relative w-full max-w-sm bg-white/85 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_24px_64px_-16px_rgba(15,23,42,0.35)] rounded-3xl p-5 animate-[toastIn_.18s_ease-out]">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${danger ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
            <AlertTriangle className="w-4 h-4" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            {req.title && <div className="text-sm text-slate-900 mb-1">{req.title}</div>}
            <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{req.message}</div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={() => done(false)}
            className="px-3.5 py-2 rounded-xl text-xs text-slate-600 bg-white/60 ring-1 ring-white/60 hover:bg-white transition-colors"
          >
            {req.cancelLabel || t.cancel}
          </button>
          <button
            onClick={() => done(true)}
            className={`px-3.5 py-2 rounded-xl text-xs text-white transition-colors ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
          >
            {req.confirmLabel || t.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
