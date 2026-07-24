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
    <div className="min-h-screen bg-white font-sans text-slate-900 antialiased">
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
