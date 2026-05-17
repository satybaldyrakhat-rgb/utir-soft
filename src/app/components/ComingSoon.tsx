import { Sparkles, ArrowLeft } from 'lucide-react';

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
    // No card at all — Linear-style centred composition on the page
    // backdrop. Bigger typography, ghost CTA, animated pulse halo
    // around the icon. Symmetric by construction so all corners stay
    // visually equal.
    <div className="min-h-full flex items-center justify-center px-6 py-16">
      <div className="max-w-lg w-full text-center">
        {/* Icon with animated pulse ring + glass tile */}
        <div className="relative inline-flex mb-8">
          <div
            className="absolute inset-0 rounded-3xl animate-ping opacity-30"
            style={{ background: 'var(--accent-200)', animationDuration: '3s' }}
          />
          <div className="relative w-20 h-20 rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] flex items-center justify-center">
            <Sparkles className="w-9 h-9" style={{ color: 'var(--accent-600)' }} />
          </div>
        </div>

        {/* Eyebrow — uppercase tracking-widest with pulsing dot */}
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-5">
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: 'var(--accent-500)' }}
          />
          {eyebrow}
        </div>

        {/* Large title */}
        <h2 className="text-3xl md:text-4xl text-slate-900 tracking-tight mb-3 font-medium">
          {title}
        </h2>

        {/* Description */}
        <p className="text-[15px] text-slate-500 leading-relaxed mb-8 max-w-md mx-auto">
          {description || fallbackDesc}
        </p>

        {/* Ghost CTA — minimalist, no shadow, no solid bg.
            Hover slides the arrow + darkens text. */}
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-slate-500 hover:text-slate-900 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            {l('Вернуться на главную', 'Басты бетке оралу', 'Back to dashboard')}
          </button>
        )}
      </div>
    </div>
  );
}
