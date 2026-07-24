import { Flag, Hammer, Bot, MessagesSquare, Smartphone, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useLang } from "../i18n/LanguageContext";

const icons: LucideIcon[] = [Flag, Hammer, Bot, MessagesSquare, Smartphone, Zap];

export function WhyUtirSoft() {
  const { t } = useLang();
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm text-[#58c084]">{t.why.eyebrow}</p>
          <h2 className="mt-3 tracking-tight text-slate-900 text-3xl sm:text-4xl leading-tight">{t.why.title}</h2>
          <p className="mt-4 text-slate-600">{t.why.subtitle}</p>
        </motion.div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {t.why.cards.map(([title, desc]: [string, string], idx: number) => {
            const Icon = icons[idx];
            return (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: idx * 0.05 }}
                className="group relative rounded-2xl bg-white/55 backdrop-blur-2xl ring-1 ring-white/55 shadow-[0_14px_44px_-18px_rgba(15,23,42,0.16)] p-6 sm:p-8 hover:border-[#58c084]/40 hover:shadow-[0_20px_50px_-30px_rgba(88,192,132,0.4)] transition-all"
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-[#58c084]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 tracking-tight text-slate-900 text-lg">{title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
