import { Sparkles, ArrowLeft } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description?: string;
  onBack?: () => void;
  language?: 'kz' | 'ru' | 'eng';
}

export function ComingSoon({ title, description, onBack, language = 'ru' }: ComingSoonProps) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const badge = l('Скоро', 'Жақында', 'Coming soon');
  const fallbackDesc = l(
    'Этот раздел сейчас в разработке. Мы скоро его запустим — следите за обновлениями.',
    'Бұл бөлім жасалуда. Жақын арада іске қосылады.',
    'This section is under development. It will be available soon.'
  );

  return (
    // Liquid-glass page backdrop — same pastel orbs as Dashboard / AI
    // Design / Sales so navigating into this stub stays visually
    // continuous with the rest of the app.
    <div
      className="min-h-full relative flex items-center justify-center p-6"
    >
      <div className="max-w-md w-full bg-white/90 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-8 text-center relative overflow-hidden">
        {/* Subtle centred halo behind the icon — symmetric so all 4
            card corners stay visually equal. Card opacity bumped to
            white/90 so the global page orbs don't bleed through and
            make the right side look heavier than the left. */}
        <div
          className="absolute top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-50"
          style={{ background: 'radial-gradient(circle, var(--accent-200) 0%, transparent 65%)' }}
        />
        <div className="relative">
          <div
            className="w-14 h-14 mx-auto mb-5 rounded-2xl ring-1 ring-white/60 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--accent-100), var(--accent-50))' }}
          >
            <Sparkles className="w-6 h-6" style={{ color: 'var(--accent-600)' }} />
          </div>
          <div className="inline-block text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100/70 text-amber-700 ring-1 ring-white/40 mb-3">
            {badge}
          </div>
          <h2 className="text-slate-900 text-lg tracking-tight mb-2">{title}</h2>
          <p className="text-sm text-slate-500 leading-relaxed mb-6">{description || fallbackDesc}</p>
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 backdrop-blur-xl text-white rounded-2xl text-sm shadow-[0_8px_24px_-8px_var(--accent-shadow)] hover:shadow-[0_12px_32px_-8px_var(--accent-shadow)] hover:bg-emerald-700 transition-all ring-1 ring-white/10"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {l('На главную', 'Басты бетке', 'Back to home')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
