// ─── Форма «Запросить демо» ────────────────────────────────────────────
// Открывается по событию 'utir:open-demo' (его шлют кнопки «Запросить
// демо» в Hero и CTA). Заявка уходит в POST /api/demo-request → падает
// лидом в Центр управления + уведомление владельцу в Telegram.

import { useEffect, useState } from "react";
import { X, Check, Loader2 } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";

const API_BASE = ((import.meta as any).env?.VITE_API_BASE_URL || "").replace(/\/$/, "");

export function DemoRequestModal() {
  const { t } = useLang();
  const d = (t as any).demo || {};
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", company: "", message: "" });

  useEffect(() => {
    const on = () => { setOpen(true); setSent(false); setErr(""); };
    window.addEventListener("utir:open-demo", on);
    return () => window.removeEventListener("utir:open-demo", on);
  }, []);

  if (!open) return null;

  const submit = async () => {
    if (!form.name.trim() || !form.phone.trim()) { setErr(d.required || "Укажите имя и телефон"); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/demo-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: "landing" }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch { setErr(d.error || "Не удалось отправить. Попробуйте позже."); }
    finally { setBusy(false); }
  };

  const field = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <button onClick={() => setOpen(false)} className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="close"><X size={18} /></button>

        {sent ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100"><Check className="h-7 w-7 text-emerald-600" /></div>
            <div className="text-lg font-semibold text-slate-900">{d.thanksTitle || "Заявка принята!"}</div>
            <div className="mt-1 text-sm text-slate-500">{d.thanksText || "Свяжемся с вами в ближайшее время."}</div>
            <button onClick={() => setOpen(false)} className="mt-5 rounded-full bg-slate-900 px-6 py-2.5 text-sm text-white hover:bg-slate-800">{d.close || "Закрыть"}</button>
          </div>
        ) : (
          <>
            <div className="mb-1 text-xl font-semibold text-slate-900">{d.title || "Запросить демо"}</div>
            <div className="mb-5 text-sm text-slate-500">{d.subtitle || "Оставьте контакты — покажем платформу и ответим на вопросы."}</div>
            <div className="space-y-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={d.name || "Ваше имя"} className={field} autoFocus />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={d.phone || "Телефон / WhatsApp"} className={field} />
              <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder={d.company || "Компания (необязательно)"} className={field} />
              <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder={d.message || "Комментарий (необязательно)"} rows={3} className={field + " resize-none"} />
            </div>
            {err && <div className="mt-3 text-xs text-rose-600">{err}</div>}
            <button onClick={submit} disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {d.submit || "Отправить заявку"}
            </button>
            <div className="mt-3 text-center text-[11px] text-slate-400">{d.privacy || "Нажимая, вы соглашаетесь на обработку данных"}</div>
          </>
        )}
      </div>
    </div>
  );
}
