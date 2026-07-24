import { UserPlus, Settings, Upload, GraduationCap, Gift } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useLang } from "../i18n/LanguageContext";

const icons: LucideIcon[] = [UserPlus, Settings, Upload, GraduationCap];

export function Onboarding() {
  const { t } = useLang();
  return (
    <section className="py-24 sm:py-32 bg-white">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm text-[#58c084]">{t.onboarding.eyebrow}</p>
          <h2 className="mt-3 tracking-tight text-slate-900 text-3xl sm:text-4xl leading-tight">{t.onboarding.title}</h2>
        </motion.div>

        <div className="relative mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="hidden lg:block absolute top-7 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {t.onboarding.steps.map(([title, duration, description]: [string, string, string], idx: number) => {
            const Icon = icons[idx];
            return (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="relative rounded-2xl bg-white border border-slate-200/70 p-6 sm:p-7"
              >
                <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#58c084]">
                  <Icon className="h-5 w-5" />
                  <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center tracking-tight">
                    {idx + 1}
                  </span>
                </div>
                <div className="mt-5 tracking-tight text-slate-900 text-lg">{title}</div>
                <div className="mt-0.5 text-xs text-[#58c084]">{duration}</div>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">{description}</p>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-8 rounded-2xl bg-[#58c084] text-white px-6 py-5 flex items-center justify-center gap-3 text-sm sm:text-base"
        >
          <Gift className="h-5 w-5 flex-shrink-0" />
          {t.onboarding.gift}
        </motion.div>
      </div>
    </section>
  );
}
