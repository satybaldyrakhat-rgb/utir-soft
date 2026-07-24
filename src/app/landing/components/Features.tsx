import {
  Users, MessageSquare, Smartphone, Factory, Calculator, ListChecks,
  Scissors, Boxes, Wallet, BarChart3, Sparkles, FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useLang } from "../i18n/LanguageContext";

const icons: Record<string, LucideIcon> = {
  crm: Users, msg: MessageSquare, portal: Smartphone,
  plan: Factory, calc: Calculator, bom: ListChecks, cnc: Scissors,
  stock: Boxes, fin: Wallet, analytics: BarChart3, ai: Sparkles, docs: FileText,
};

const layout: { eyebrow: string; titleKey: "g1" | "g2" | "g3"; cardKeys: (keyof typeof icons)[] }[] = [
  { eyebrow: "01", titleKey: "g1", cardKeys: ["crm", "msg", "portal"] },
  { eyebrow: "02", titleKey: "g2", cardKeys: ["plan", "calc", "bom", "cnc"] },
  { eyebrow: "03", titleKey: "g3", cardKeys: ["stock", "fin", "analytics", "ai", "docs"] },
];

export function Features() {
  const { t } = useLang();
  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <motion.div
          className="max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm text-[#58c084]">{t.features.eyebrow}</p>
          <h2 className="mt-3 tracking-tight text-slate-900 text-3xl sm:text-4xl leading-tight">
            {t.features.title1}<br />
            <span className="text-slate-400">{t.features.title2}</span>
          </h2>
        </motion.div>

        <div className="mt-16 space-y-16 sm:space-y-20">
          {layout.map((group) => (
            <motion.div
              key={group.titleKey}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5 }}
            >
              <div className="flex items-baseline gap-4">
                <span className="text-xs uppercase tracking-widest text-slate-400">{group.eyebrow}</span>
                <h3 className="tracking-tight text-slate-900 text-2xl sm:text-3xl">{t.features[group.titleKey]}</h3>
              </div>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                {group.cardKeys.map((key) => {
                  const Icon = icons[key];
                  const [name, description] = t.features.cards[key];
                  return (
                    <div
                      key={key}
                      className="rounded-2xl bg-white/55 backdrop-blur-2xl ring-1 ring-white/55 shadow-[0_14px_44px_-18px_rgba(15,23,42,0.16)] p-6 hover:border-[#58c084]/40 hover:bg-emerald-50/30 transition-colors"
                    >
                      <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-50 text-[#58c084] mb-5">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h4 className="text-slate-900 mb-2">{name}</h4>
                      <p className="text-slate-600 leading-relaxed text-sm">{description}</p>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
