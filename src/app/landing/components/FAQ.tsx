import { motion } from "motion/react";
import { Plus, Minus } from "lucide-react";
import { useState } from "react";
import { useLang } from "../i18n/LanguageContext";

export function FAQ() {
  const { t } = useLang();
  const [openKey, setOpenKey] = useState<string | null>("0-0");

  return (
    <section id="faq" className="py-24 sm:py-32 bg-slate-50 border-t border-slate-100">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm text-[#58c084]">{t.faq.eyebrow}</p>
          <h2 className="mt-3 tracking-tight text-slate-900 text-3xl sm:text-4xl leading-tight">{t.faq.title}</h2>
        </motion.div>

        <div className="mt-12 sm:mt-16 space-y-10">
          {t.faq.groups.map((group: any, gi: number) => (
            <motion.div
              key={group.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: gi * 0.05 }}
            >
              <h3 className="text-slate-900 tracking-tight text-lg sm:text-xl mb-4">{group.title}</h3>
              <div className="space-y-3">
                {group.items.map(([question, answer]: [string, string], fi: number) => {
                  const key = `${gi}-${fi}`;
                  const isOpen = openKey === key;
                  return (
                    <div key={key} className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden transition-all">
                      <button
                        className="flex w-full items-center justify-between p-5 sm:p-6 text-left"
                        onClick={() => setOpenKey(isOpen ? null : key)}
                      >
                        <span className="text-slate-900 pr-4 sm:text-base text-sm">{question}</span>
                        <span className="flex-shrink-0 text-slate-400">
                          {isOpen ? <Minus size={20} /> : <Plus size={20} />}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="px-5 sm:px-6 pb-5 sm:pb-6 text-slate-600 text-sm sm:text-base leading-relaxed border-t border-slate-50 pt-4">
                          {answer}
                        </div>
                      )}
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
