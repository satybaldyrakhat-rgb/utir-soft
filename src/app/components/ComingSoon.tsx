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
      style={{
        background: `
          radial-gradient(900px circle at 0% 0%,   rgba(196,181,253,0.32), transparent 45%),
          radial-gradient(800px circle at 100% 5%, rgba(252,165,165,0.26), transparent 45%),
          radial-gradient(900px circle at 100% 70%, rgba(125,211,252,0.30), transparent 50%),
          radial-gradient(900px circle at 0% 100%, rgba(167,243,208,0.28), transparent 50%),
          linear-gradient(180deg, #fbfafd 0%, #f3f4f9 100%)
        `,
      }}
    >
      <div className="max-w-md w-full bg-white/55 backdrop-blur-2xl backdrop-saturate-150 border border-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-8 text-center relative overflow-hidden">
        {/* Decorative corner orb */}
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br from-violet-200/60 to-indigo-100/30 blur-2xl pointer-events-none" />
        <div className="relative">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-violet-100/80 to-indigo-100/60 ring-1 ring-white/60 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-indigo-600" />
          </div>
          <div className="inline-block text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100/70 text-amber-700 ring-1 ring-white/40 mb-3">
            {badge}
          </div>
          <h2 className="text-slate-900 text-lg tracking-tight mb-2">{title}</h2>
          <p className="text-sm text-slate-500 leading-relaxed mb-6">{description || fallbackDesc}</p>
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-900/95 backdrop-blur-xl text-white rounded-2xl text-sm shadow-[0_8px_24px_-8px_rgba(15,23,42,0.4)] hover:shadow-[0_12px_32px_-8px_rgba(15,23,42,0.5)] hover:bg-slate-900 transition-all ring-1 ring-white/10"
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
