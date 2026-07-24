import { ArrowRight, Phone, Star } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";

export function CTA() {
  const { t } = useLang();
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-[#58c084] px-6 py-14 sm:px-14 sm:py-20 text-white">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
          <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-emerald-300/20 blur-3xl" />

          <div className="relative text-center max-w-3xl mx-auto">
            <h2 className="tracking-tight text-3xl sm:text-5xl leading-[1.05]">{t.cta.title}</h2>
            <p className="mt-5 text-emerald-50/95 leading-relaxed text-base sm:text-lg">{t.cta.subtitle}</p>

            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="#/signup"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-white text-slate-900 px-6 py-3.5 text-sm hover:bg-slate-50 transition-colors"
              >
                {t.cta.btn1}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#pricing"
                className="inline-flex items-center justify-center rounded-full border border-white/40 px-6 py-3.5 text-sm text-white hover:bg-white/10 transition-colors"
              >
                {t.cta.btn2}
              </a>
              <a
                href="tel:+77779631717"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/40 px-6 py-3.5 text-sm text-white hover:bg-white/10 transition-colors"
              >
                <Phone className="h-4 w-4" />
                +7 777 963 17 17
              </a>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs sm:text-sm text-emerald-50/90">
              <span className="inline-flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-white text-white" />
                ))}
              </span>
              <span>{t.cta.rating}</span>
              <span className="opacity-60">·</span>
              <span>{t.cta.socialProof}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
