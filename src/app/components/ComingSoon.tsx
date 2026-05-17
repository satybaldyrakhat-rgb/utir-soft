import { ArrowLeft } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description?: string;
  onBack?: () => void;
  language?: 'kz' | 'ru' | 'eng';
}

export function ComingSoon({ title, description, onBack, language = 'ru' }: ComingSoonProps) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const eyebrow = l('В разработке', 'Жасалуда', 'In development');
  const fallbackDesc = l(
    'Скоро запустим этот раздел. А пока — пользуйтесь главной, заказами и аналитикой.',
    'Бұл бөлімді жақын арада іске қосамыз. Ал қазір — басты бетті, тапсырыстар мен аналитиканы пайдаланыңыз.',
    'Launching soon. In the meantime — use the dashboard, orders, and analytics.',
  );

  return (
    // Liquid-glass composition — no big icon, no card frame. Three
    // floating glass pills (eyebrow, title surround, CTA) sit on the
    // shared page backdrop. Symmetric by construction.
    <div className="min-h-full flex items-center justify-center px-6 py-16">
      <div className="max-w-lg w-full text-center">
        {/* Glass eyebrow capsule with pulsing accent dot */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 rounded-full shadow-[0_4px_16px_-8px_rgba(15,23,42,0.10)] mb-6">
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: 'var(--accent-500)' }}
          />
          <span className="text-[10px] uppercase tracking-[0.22em] text-slate-600">{eyebrow}</span>
        </div>

        {/* Large title */}
        <h2 className="text-3xl md:text-5xl text-slate-900 tracking-tight mb-4 font-medium leading-[1.05]">
          {title}
        </h2>

        {/* Description */}
        <p className="text-[15px] text-slate-500 leading-relaxed mb-10 max-w-md mx-auto">
          {description || fallbackDesc}
        </p>

        {/* Glass CTA — translucent capsule, slate text, accent arrow */}
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 hover:bg-white/80 hover:ring-white/80 text-sm text-slate-700 hover:text-slate-900 rounded-full transition-all shadow-[0_4px_16px_-8px_rgba(15,23,42,0.10)] hover:shadow-[0_8px_24px_-8px_rgba(15,23,42,0.15)] group"
          >
            <ArrowLeft
              className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
              style={{ color: 'var(--accent-600)' }}
            />
            {l('Вернуться на главную', 'Басты бетке оралу', 'Back to dashboard')}
          </button>
        )}
      </div>
    </div>
  );
}
