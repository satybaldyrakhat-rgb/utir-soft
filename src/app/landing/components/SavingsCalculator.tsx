import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";

function fmt(n: number) {
  return Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ");
}

export function SavingsCalculator() {
  const { t } = useLang();
  const [orders, setOrders] = useState(30);
  const [hours, setHours] = useState(4);
  const [defectPct, setDefectPct] = useState(8);

  const result = useMemo(() => {
    const hoursSaved = orders * (hours * 0.5);
    const managersSaving = hoursSaved * 2000;
    const defectSaving = orders * 25000 * Math.max(0, (defectPct - 1) / 100) * 10;
    const stockSaving = orders * 1300;
    const total = managersSaving + defectSaving + stockSaving;
    return { total, hoursSaved, managersSaving, defectSaving, stockSaving };
  }, [orders, hours, defectPct]);

  return (
    <section className="py-20 sm:py-28 bg-slate-50 border-y border-slate-100">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm text-[#58c084]">{t.calc.eyebrow}</p>
          <h2 className="mt-3 tracking-tight text-slate-900 text-3xl sm:text-4xl leading-tight">
            {t.calc.title}
          </h2>
          <p className="mt-4 text-slate-600">{t.calc.subtitle}</p>
        </motion.div>

        <div className="mt-14 grid lg:grid-cols-5 gap-6 lg:gap-8">
          <div className="lg:col-span-3 rounded-3xl bg-white border border-slate-200/70 p-6 sm:p-10 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.15)]">
            <Slider label={t.calc.orders} value={orders} min={5} max={100} step={1} onChange={setOrders} suffix="" />
            <div className="mt-8">
              <Slider label={t.calc.hours} value={hours} min={1} max={8} step={1} onChange={setHours} suffix=" ч" />
            </div>
            <div className="mt-8">
              <Slider label={t.calc.defect} value={defectPct} min={1} max={20} step={1} onChange={setDefectPct} suffix="%" />
            </div>
          </div>

          <div className="lg:col-span-2 rounded-3xl bg-[#58c084] text-white p-6 sm:p-10 flex flex-col">
            <div className="inline-flex items-center gap-1.5 text-xs text-emerald-50/80">
              <Sparkles className="h-3.5 w-3.5" />
              {t.calc.result}
            </div>
            <div className="mt-3 tracking-tight text-3xl sm:text-4xl leading-tight">
              {fmt(result.total)} ₸<span className="text-emerald-50/80 text-base">{t.calc.perMonth}</span>
            </div>

            <div className="mt-6 space-y-3 text-sm">
              <Row label={t.calc.managers(Math.round(result.hoursSaved))} value={`${fmt(result.managersSaving)} ₸`} />
              <Row label={t.calc.defectRow(defectPct)} value={`${fmt(result.defectSaving)} ₸`} />
              <Row label={t.calc.stockRow} value={`${fmt(result.stockSaving)} ₸`} />
            </div>

            <a
              href="#/signup"
              className="mt-auto pt-8 inline-flex items-center justify-center gap-2 rounded-full bg-white text-slate-900 px-5 py-3 text-sm hover:bg-slate-50 transition-colors"
            >
              {t.calc.cta}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">{t.calc.footnote}</p>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/15 pb-2.5">
      <span className="text-emerald-50/85">{label}</span>
      <span className="tracking-tight">{value}</span>
    </div>
  );
}

function Slider({
  label, value, min, max, step, onChange, suffix,
}: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-end justify-between">
        <span className="text-sm text-slate-600">{label}</span>
        <span className="tracking-tight text-2xl text-slate-900">
          {value}
          <span className="text-slate-400 text-base">{suffix}</span>
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-4 w-full appearance-none h-1.5 rounded-full bg-slate-100 cursor-pointer accent-[#58c084]"
        style={{ background: `linear-gradient(to right, #58c084 ${pct}%, #f1f5f9 ${pct}%)` }}
      />
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{min}{suffix}</span>
        <span>{max}{suffix}</span>
      </div>
    </div>
  );
}
