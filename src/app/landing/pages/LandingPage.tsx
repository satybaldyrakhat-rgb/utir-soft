import { LanguageProvider } from "../i18n/LanguageContext";
import { Header } from "../components/Header";
import { Hero } from "../components/Hero";
import { SavingsCalculator } from "../components/SavingsCalculator";
import { Trusted } from "../components/Trusted";
import { Features } from "../components/Features";
import { TargetAudience } from "../components/TargetAudience";
import { Showcase } from "../components/Showcase";
import { WhyUtirSoft } from "../components/WhyUtirSoft";
import { Integrations } from "../components/Integrations";
import { Pricing } from "../components/Pricing";
import { Onboarding } from "../components/Onboarding";
import { Testimonials } from "../components/Testimonials";
import { FAQ } from "../components/FAQ";
import { CTA } from "../components/CTA";
import { Footer } from "../components/Footer";

export function LandingPage() {
  return (
    <LanguageProvider>
    <div className="relative min-h-screen font-sans text-slate-900 antialiased overflow-x-hidden">
      {/* Ambient «liquid glass» backdrop — мягкий градиент с цветными
          пятнами, поверх которого секции-стёкла читаются с глубиной. */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-[#f6f8fc] via-white to-[#eef4f1]" />
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-32 w-[48rem] h-[48rem] rounded-full bg-emerald-300/20 blur-[130px]" />
        <div className="absolute top-1/4 -right-40 w-[42rem] h-[42rem] rounded-full bg-sky-300/20 blur-[130px]" />
        <div className="absolute top-2/3 left-1/4 w-[44rem] h-[44rem] rounded-full bg-violet-300/12 blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[40rem] h-[40rem] rounded-full bg-emerald-200/20 blur-[130px]" />
      </div>
      <Header />
      <main>
        <Hero />
        <SavingsCalculator />
        <Trusted />
        <Features />
        <TargetAudience />
        <Showcase />
        <WhyUtirSoft />
        <Integrations />
        <Pricing />
        <Onboarding />
        <Testimonials />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
    </LanguageProvider>
  );
}
