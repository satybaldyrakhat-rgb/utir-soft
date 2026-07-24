import { motion } from "motion/react";
import { Quote } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";

export function Testimonials() {
  const { t } = useLang();
  return (
    <section id="cases" className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <motion.div
          className="max-w-2xl mx-auto text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm text-[#58c084]">{t.testimonials.eyebrow}</p>
          <h2 className="mt-3 tracking-tight text-slate-900 text-3xl sm:text-4xl leading-tight">{t.testimonials.title}</h2>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {t.testimonials.cases.map((c: any, idx: number) => {
            const featured = idx === 0;
            return (
              <motion.div
                key={c.company}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className={`relative rounded-3xl p-6 sm:p-8 flex flex-col ${
                  featured ? "bg-slate-900 text-white" : "bg-slate-50 border border-slate-100 text-slate-900"
                }`}
              >
                <Quote className="h-7 w-7 text-[#58c084]" />
                <p className={`mt-4 tracking-tight text-lg sm:text-xl leading-snug ${featured ? "text-white" : "text-slate-900"}`}>
                  «{c.quote}»
                </p>

                <div className={`mt-6 space-y-2.5 text-sm border-t pt-5 ${featured ? "border-white/10" : "border-slate-200"}`}>
                  {c.metrics.map((m: any) => (
                    <div key={m.label} className="flex items-center justify-between gap-3">
                      <span className={featured ? "text-slate-400" : "text-slate-500"}>{m.label}</span>
                      <span className="tracking-tight text-right">
                        {m.before ? (
                          <>
                            <span className={featured ? "text-slate-500" : "text-slate-400"}>{m.before}</span>
                            <span className="mx-1.5 opacity-60">→</span>
                            <span>{m.after}</span>
                            {m.change && <span className="ml-2 text-xs text-[#58c084]">{m.change}</span>}
                          </>
                        ) : (
                          m.after
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                <div className={`mt-6 pt-5 border-t flex items-center justify-between text-sm ${featured ? "border-white/10" : "border-slate-200"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center tracking-tight ${
                      featured ? "bg-white/10 text-[#58c084]" : "bg-[#58c084]/10 text-[#58c084]"
                    }`}>
                      {c.company.charAt(0)}
                    </div>
                    <div>
                      <div>{c.company}</div>
                      <div className={`text-xs ${featured ? "text-slate-400" : "text-slate-500"}`}>{c.location}</div>
                    </div>
                  </div>
                  <span className={`text-xs rounded-full px-2.5 py-1 ${featured ? "bg-[#58c084] text-white" : "bg-emerald-50 text-[#58c084]"}`}>
                    {c.plan}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
