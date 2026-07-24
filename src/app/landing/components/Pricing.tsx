import { Check } from "lucide-react";
import { useState } from "react";
import { motion } from "motion/react";
import { useLang } from "../i18n/LanguageContext";

const prices: { monthly: number | "free" | "custom"; yearly: number | "free" | "custom" }[] = [
  { monthly: "free", yearly: "free" },
  { monthly: 9900, yearly: 7900 },
  { monthly: 29900, yearly: 23900 },
  { monthly: 79900, yearly: 63900 },
  { monthly: "custom", yearly: "custom" },
];

function fmt(n: number) {
  return n.toLocaleString("ru-RU").replace(/,/g, " ");
}

export function Pricing() {
  const { t } = useLang();
  const [yearly, setYearly] = useState(false);

  return (
    <section id="pricing" className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm text-[#58c084]">{t.pricing.eyebrow}</p>
          <h2 className="mt-3 tracking-tight text-slate-900 text-3xl sm:text-4xl leading-tight">
            {t.pricing.title1} <span className="text-slate-400">{t.pricing.title2}</span>
          </h2>
          <p className="mt-5 text-slate-600">{t.pricing.subtitle}</p>

          <div className="mt-8 relative inline-flex items-center rounded-full bg-slate-100 p-1 text-sm">
            <motion.div
              className="absolute top-1 bottom-1 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_4px_12px_-4px_rgba(15,23,42,0.12)]"
              initial={false}
              animate={{ left: yearly ? "calc(50% + 2px)" : "4px", right: yearly ? "4px" : "calc(50% + 2px)" }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            />
            <button
              onClick={() => setYearly(false)}
              className={`relative z-10 px-5 py-2 rounded-full transition-colors ${!yearly ? "text-slate-900" : "text-slate-500"}`}
            >
              {t.pricing.monthly}
            </button>
            <button
              onClick={() => setYearly(true)}
              className={`relative z-10 px-5 py-2 rounded-full inline-flex items-center gap-2 transition-colors ${yearly ? "text-slate-900" : "text-slate-500"}`}
            >
              {t.pricing.yearly}
              <span className="text-[10px] tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-50 text-[#58c084]">−20%</span>
            </button>
          </div>
        </motion.div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {t.pricing.plans.map((plan: any, idx: number) => {
            const [name, tagline, features, buttonText] = plan;
            const p = prices[idx];
            const price = yearly ? p.yearly : p.monthly;
            const isHighlighted = idx === 2;
            return (
              <motion.div
                key={name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                className={`relative rounded-3xl p-7 flex flex-col transition-all ${
                  isHighlighted
                    ? "bg-white border-2 border-[#58c084] shadow-[0_30px_60px_-30px_rgba(88,192,132,0.4)]"
                    : "bg-white/55 backdrop-blur-2xl ring-1 ring-white/55 shadow-[0_14px_44px_-18px_rgba(15,23,42,0.16)] hover:border-slate-300"
                }`}
              >
                {isHighlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-[#58c084] px-3 py-1 text-[10px] uppercase tracking-widest text-white whitespace-nowrap">
                    ⭐ {t.pricing.mostPopular}
                  </span>
                )}

                <div>
                  <h3 className="tracking-tight text-slate-900 text-lg">{name}</h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed min-h-[32px]">{tagline}</p>
                </div>

                <div className="mt-6 min-h-[64px]">
                  {price === "free" ? (
                    <div className="tracking-tight text-3xl text-slate-900">{t.pricing.free}</div>
                  ) : price === "custom" ? (
                    <div className="tracking-tight text-2xl text-slate-900 leading-tight pt-1">{t.pricing.custom}</div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1 flex-wrap">
                        <span className="tracking-tight text-3xl text-slate-900">{fmt(price)}</span>
                        <span className="text-xs text-slate-500">{t.pricing.perMonth}</span>
                      </div>
                      {yearly && typeof p.monthly === "number" && (
                        <div className="text-[11px] mt-1 text-slate-400 line-through">{fmt(p.monthly)} ₸</div>
                      )}
                    </>
                  )}
                </div>

                <div className="my-6 h-px bg-slate-100" />

                <ul className="space-y-2.5 flex-1">
                  {features.map((f: string) => (
                    <li key={f} className="flex items-start gap-2 text-xs">
                      <Check className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-[#58c084]" />
                      <span className="text-slate-600 leading-relaxed">{f}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href="#/signup"
                  className={`mt-7 w-full inline-flex items-center justify-center whitespace-nowrap rounded-full py-2.5 text-sm font-medium transition-colors ${
                    isHighlighted
                      ? "bg-[#58c084] text-white hover:bg-[#47a66f] shadow-[0_10px_28px_-12px_rgba(88,192,132,0.7)]"
                      : "ring-1 ring-slate-200 text-slate-700 hover:ring-slate-900 hover:text-slate-900"
                  }`}
                >
                  {buttonText}
                </a>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-10 text-center text-sm text-slate-600">
          {t.pricing.extraUser} <span className="text-slate-900">{t.pricing.extraUserPrice}</span>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
          {t.pricing.perks.map((p: string) => (
            <span key={p}>✓ {p}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
