import { ArrowRight, Zap, MapPin, ShieldCheck, Sparkles, Calendar, Rocket, TrendingUp, Package, Factory } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";

export function Hero() {
  const { t } = useLang();
  return (
    <section className="relative overflow-hidden">
      <div className="absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-emerald-100/50 blur-3xl" />
      <div className="absolute -top-20 right-0 h-[420px] w-[420px] rounded-full bg-emerald-50 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6 lg:px-8 pt-20 sm:pt-24 pb-16 sm:pb-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full ring-1 ring-white/60 bg-white/60 backdrop-blur-xl px-3.5 py-1.5 text-xs text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-[#58c084]" />
              {t.hero.badge}
            </div>

            <h1 className="mt-6 tracking-tight text-slate-900 text-4xl sm:text-[58px] leading-[1.05]">
              {t.hero.title1} <span className="text-[#58c084]">{t.hero.titleAi}</span> {t.hero.title2}
            </h1>

            <p className="mt-6 text-lg text-slate-600 leading-relaxed max-w-lg">
              {t.hero.subtitle}
            </p>

            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <a
                href="#/signup"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#58c084] px-6 py-3.5 text-sm font-medium text-white shadow-[0_10px_28px_-12px_rgba(88,192,132,0.8)] hover:bg-[#47a66f] transition-colors"
              >
                {t.hero.ctaTry}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#features"
                className="inline-flex items-center justify-center rounded-full ring-1 ring-white/60 bg-white/60 backdrop-blur-xl px-6 py-3.5 text-sm font-medium text-slate-700 hover:bg-white/80 transition-colors"
              >
                {t.hero.ctaDemo}
              </a>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Zap size={14} className="text-amber-500" />
                {t.hero.micro1}
              </span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={14} className="text-emerald-500" />
                {t.hero.micro2}
              </span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-slate-500" />
                {t.hero.micro3}
              </span>
            </div>
          </div>

          <HeroInfographic />
        </div>

        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12 max-w-3xl">
          <Stat icon={<Calendar size={16} className="text-emerald-500" />} value={t.hero.stat1Value} label={t.hero.stat1Label} />
          <Stat icon={<Rocket size={16} className="text-amber-500" />} value={t.hero.stat2Value} label={t.hero.stat2Label} />
          <Stat icon={<Sparkles size={16} className="text-violet-500" />} value={t.hero.stat3Value} label={t.hero.stat3Label} />
        </div>
      </div>
    </section>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {icon}
      <div className="tracking-tight text-slate-900 text-2xl sm:text-3xl">{value}</div>
      <div className="text-xs sm:text-sm text-slate-500">{label}</div>
    </div>
  );
}

function HeroInfographic() {
  const { t } = useLang();
  return (
    <div className="relative w-full max-w-md mx-auto sm:max-w-none">
      <div className="absolute inset-0 -m-4 sm:-m-6 bg-gradient-to-tr from-emerald-50 to-transparent rounded-[24px] sm:rounded-[32px]" />

      <div className="relative flex flex-col sm:grid sm:grid-cols-6 sm:grid-rows-6 gap-3 sm:gap-4 sm:h-[480px]">
        <div className="sm:col-span-4 sm:row-span-4 rounded-2xl bg-white/55 backdrop-blur-2xl ring-1 ring-white/55 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.12)] p-5 sm:p-6 flex flex-col h-64 sm:h-auto">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">{t.hero.info.sales}</div>
            <div className="inline-flex items-center gap-1 text-[#58c084] text-xs">
              <TrendingUp className="h-3 w-3" />
              +47,8%
            </div>
          </div>
          <div className="mt-2 sm:mt-3 tracking-tight text-2xl text-slate-900">12,4 млн ₸</div>

          <svg viewBox="0 0 240 100" className="mt-auto w-full h-20 sm:h-24" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#58c084" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#58c084" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,80 L30,70 L60,75 L90,55 L120,60 L150,40 L180,45 L210,25 L240,15 L240,100 L0,100 Z"
              fill="url(#chartGrad)"
            />
            <path
              d="M0,80 L30,70 L60,75 L90,55 L120,60 L150,40 L180,45 L210,25 L240,15"
              fill="none"
              stroke="#58c084"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {[
              [30, 70],
              [90, 55],
              [150, 40],
              [210, 25],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="3" fill="#fff" stroke="#58c084" strokeWidth="2" />
            ))}
          </svg>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:col-span-2 sm:row-span-4 sm:flex sm:flex-col sm:h-auto">
          <div className="sm:flex-1 rounded-2xl bg-slate-900 text-white p-4 sm:p-5 flex flex-col justify-between h-32 sm:h-auto">
            <div className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-white/10">
              <Factory className="h-4 w-4 text-[#58c084]" />
            </div>
            <div>
              <div className="text-xs text-slate-400">{t.hero.info.production}</div>
              <div className="mt-1 tracking-tight text-xl sm:text-2xl">142</div>
              <div className="text-[10px] text-slate-500">{t.hero.info.productionSub}</div>
            </div>
          </div>

          <div className="sm:flex-1 rounded-2xl bg-white/55 backdrop-blur-2xl ring-1 ring-white/55 shadow-[0_14px_44px_-18px_rgba(15,23,42,0.16)] p-4 sm:p-5 flex flex-col justify-between h-32 sm:h-auto">
            <div className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-emerald-50">
              <Package className="h-4 w-4 text-[#58c084]" />
            </div>
            <div>
              <div className="text-xs text-slate-500">{t.hero.info.stock}</div>
              <div className="mt-1 tracking-tight text-xl sm:text-2xl text-slate-900">86%</div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full w-[86%] bg-[#58c084]" />
              </div>
            </div>
          </div>
        </div>

        <div className="sm:col-span-3 sm:row-span-2 rounded-2xl bg-[#58c084] text-white p-4 sm:p-5 flex flex-col justify-between h-auto sm:h-auto gap-3 sm:gap-0">
          <div className="text-xs text-emerald-50/80">{t.hero.info.funnel}</div>
          <div className="space-y-1.5 sm:space-y-2">
            {[
              [t.hero.info.leads, "100%", "100%"],
              [t.hero.info.measure, "72%", "72%"],
              [t.hero.info.contract, "48%", "48%"],
              [t.hero.info.payment, "31%", "31%"],
            ].map(([name, pct, w]) => (
              <div key={name as string} className="flex items-center gap-2 text-[10px] sm:text-[11px]">
                <span className="w-14 sm:w-16 opacity-90">{name as string}</span>
                <div className="flex-1 h-1.5 sm:h-2 rounded-full bg-white/15 overflow-hidden">
                  <div className="h-full bg-white" style={{ width: w as string }} />
                </div>
                <span className="w-8 text-right opacity-90">{pct as string}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="sm:col-span-3 sm:row-span-2 rounded-2xl bg-white/55 backdrop-blur-2xl ring-1 ring-white/55 shadow-[0_14px_44px_-18px_rgba(15,23,42,0.16)] p-4 sm:p-5 h-auto sm:h-auto">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">{t.hero.info.tasks}</div>
            <div className="text-[10px] text-[#58c084]">8/12</div>
          </div>
          <div className="mt-3 space-y-2">
            {[
              [t.hero.info.t1, true],
              [t.hero.info.t2, true],
              [t.hero.info.t3, false],
            ].map(([label, done]) => (
              <div key={label as string} className="flex items-center gap-2.5 text-xs">
                <span
                  className={`h-4 w-4 rounded-md flex items-center justify-center ${
                    done ? "bg-[#58c084]" : "border border-slate-300"
                  }`}
                >
                  {done && (
                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={done ? "text-slate-400 line-through" : "text-slate-700"}>{label as string}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
