import { Home, Factory, Network } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useLang } from "../i18n/LanguageContext";

const icons: LucideIcon[] = [Home, Factory, Network];

export function TargetAudience() {
  const { t } = useLang();
  const audiences = [
    { ...t.audience.a1, icon: Home, featured: false },
    { ...t.audience.a2, icon: Factory, featured: true },
    { ...t.audience.a3, icon: Network, featured: false },
  ];

  return (
    <section id="solutions" className="py-24 sm:py-32 border-y border-white/40">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm text-[#58c084]">{t.audience.eyebrow}</p>
          <h2 className="mt-3 tracking-tight text-slate-900 text-3xl sm:text-4xl leading-tight">
            {t.audience.title}
          </h2>
        </motion.div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
          {audiences.map((a, idx) => {
            const Icon = icons[idx];
            return (
              <motion.div
                key={a.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className={`relative rounded-3xl p-7 sm:p-9 flex flex-col ${
                  a.featured
                    ? "bg-slate-900 text-white shadow-[0_30px_60px_-30px_rgba(15,23,42,0.5)]"
                    : "bg-white/55 backdrop-blur-2xl ring-1 ring-white/55 shadow-[0_14px_44px_-18px_rgba(15,23,42,0.16)] text-slate-900"
                }`}
              >
                {a.featured && (
                  <span className="absolute -top-3 right-6 inline-flex items-center gap-1 rounded-full bg-[#58c084] px-3 py-1 text-[10px] uppercase tracking-widest text-white">
                    {t.audience.featured}
                  </span>
                )}
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${a.featured ? "bg-white/10 text-[#58c084]" : "bg-emerald-50 text-[#58c084]"}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-6 tracking-tight text-xl sm:text-2xl">{a.title}</h3>
                <p className={`mt-2 text-sm ${a.featured ? "text-slate-300" : "text-slate-500"}`}>{a.size}</p>
                <div className={`mt-6 rounded-2xl p-4 text-sm leading-relaxed italic ${a.featured ? "bg-white/5 text-slate-200" : "bg-slate-50 text-slate-600"}`}>
                  «{a.pains}»
                </div>
                <div className={`mt-6 pt-5 border-t text-sm ${a.featured ? "border-white/10 text-emerald-200" : "border-slate-100 text-[#58c084]"}`}>
                  {t.audience.planLabel} <span className="tracking-tight">{a.plan}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
