// ─── Toast (Д3) ─────────────────────────────────────────────────────
// Replaces native alert() with a quiet, on-brand toast. Event-driven so
// any module can fire one without prop-drilling: import { toast } and
// call toast('Сохранено'). A single <Toaster/> mounted in App listens
// and renders the stack (bottom-centre, auto-dismiss).
//
// Types: 'info' (default, slate) · 'success' (emerald) · 'error' (rose).
// Most former alert() calls were errors, so toast(msg) without a type
// reads fine as a neutral notice; pass 'error'/'success' when known.

import { useEffect, useState } from 'react';
import { Check, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'error';
interface ToastItem { id: number; message: string; type: ToastType }

export function toast(message: string, type: ToastType = 'info') {
  if (typeof window === 'undefined' || !message) return;
  window.dispatchEvent(new CustomEvent('utir:toast', { detail: { message: String(message), type } }));
}

const STYLE: Record<ToastType, { ring: string; icon: any; iconCls: string }> = {
  info:    { ring: 'ring-white/60',        icon: Info,        iconCls: 'text-slate-400' },
  success: { ring: 'ring-emerald-200/60',  icon: Check,       iconCls: 'text-emerald-600' },
  error:   { ring: 'ring-rose-200/60',     icon: AlertCircle, iconCls: 'text-rose-600' },
};

let seq = 0;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const id = ++seq;
      const item: ToastItem = { id, message: String(d.message || ''), type: (d.type as ToastType) || 'info' };
      setItems(prev => [...prev.slice(-3), item]); // keep at most 4
      const ttl = item.type === 'error' ? 5000 : 3000;
      window.setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), ttl);
    };
    window.addEventListener('utir:toast', onToast);
    return () => window.removeEventListener('utir:toast', onToast);
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {items.map(t => {
        const s = STYLE[t.type];
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 max-w-[90vw] px-4 py-2.5 bg-white/85 backdrop-blur-2xl backdrop-saturate-150 ring-1 ${s.ring} shadow-[0_12px_32px_-8px_rgba(15,23,42,0.25)] rounded-2xl text-sm text-slate-800 animate-[toastIn_.18s_ease-out]`}
          >
            <Icon className={`w-4 h-4 flex-shrink-0 ${s.iconCls}`} strokeWidth={1.5} />
            <span className="leading-snug">{t.message}</span>
            <button onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))} className="ml-1 text-slate-300 hover:text-slate-600">
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
