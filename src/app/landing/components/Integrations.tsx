import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";
import {
  SiWhatsapp,
  SiTelegram,
  SiInstagram,
  SiGooglecalendar,
} from "react-icons/si";
import type { IconType } from "react-icons";

function TwoGisIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor">
      <path d="M16 2C10.5 2 6 6.5 6 12c0 7.5 10 18 10 18s10-10.5 10-18c0-5.5-4.5-10-10-10zm0 13.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
    </svg>
  );
}
function RulerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 3L3 21l-2-2L19 1l2 2z" />
      <path d="M14 4l2 2M11 7l2 2M8 10l2 2M5 13l2 2" />
    </svg>
  );
}
function KitchenIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 9v12M15 13h2M7 6h.01" />
    </svg>
  );
}
function AiIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
    </svg>
  );
}

const meta: { icon: IconType | ((p: { className?: string }) => JSX.Element); color: string; bg: string }[] = [
  { icon: SiWhatsapp, color: "text-[#25D366]", bg: "bg-[#25D366]/10" },
  { icon: SiTelegram, color: "text-[#229ED9]", bg: "bg-[#229ED9]/10" },
  { icon: SiInstagram, color: "text-[#E4405F]", bg: "bg-[#E4405F]/10" },
  { icon: TwoGisIcon, color: "text-[#34A853]", bg: "bg-[#34A853]/10" },
  { icon: SiGooglecalendar, color: "text-[#4285F4]", bg: "bg-[#4285F4]/10" },
  { icon: RulerIcon, color: "text-slate-700", bg: "bg-slate-100" },
  { icon: KitchenIcon, color: "text-amber-600", bg: "bg-amber-50" },
  { icon: AiIcon, color: "text-[#58c084]", bg: "bg-emerald-50" },
];

export function Integrations() {
  const { t } = useLang();
  return (
    <section className="py-24 sm:py-32 border-y border-white/40">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm text-[#58c084]">{t.integrations.eyebrow}</p>
          <h2 className="mt-3 tracking-tight text-slate-900 text-3xl sm:text-4xl leading-tight">
            {t.integrations.title}
          </h2>
        </motion.div>

        <div className="mt-14 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {t.integrations.items.map(([name, sub]: [string, string], idx: number) => {
            const m = meta[idx];
            return (
              <motion.div
                key={name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: idx * 0.04 }}
                className="rounded-2xl bg-white/55 backdrop-blur-2xl ring-1 ring-white/55 shadow-[0_14px_44px_-18px_rgba(15,23,42,0.16)] p-5 sm:p-6 hover:border-[#58c084]/40 transition-colors"
              >
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${m.bg} ${m.color}`}>
                  <m.icon className="h-6 w-6" />
                </div>
                <div className="mt-4 text-slate-900">{name}</div>
                <div className="mt-1 text-xs text-slate-500">{sub}</div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-8 rounded-2xl bg-slate-100/70 border border-slate-200/60 px-5 py-5 sm:px-7 sm:py-6 text-sm text-slate-700 leading-relaxed"
        >
          <span className="mr-2">🚧</span>
          <span className="text-slate-900">{t.integrations.soonLabel}</span> {t.integrations.soon}
        </motion.div>

        <div className="mt-5 text-center">
          <a
            href="#/signup"
            className="inline-flex items-center gap-1.5 text-sm text-[#58c084] hover:text-[#47a66f] transition-colors"
          >
            {t.integrations.request}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
