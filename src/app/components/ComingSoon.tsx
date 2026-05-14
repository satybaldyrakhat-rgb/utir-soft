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
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-gray-100 rounded-2xl p-8 text-center">
        <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-indigo-500" />
        </div>
        <div className="inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 mb-3">
          {badge}
        </div>
        <h2 className="text-gray-900 text-lg mb-2">{title}</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">{description || fallbackDesc}</p>
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {l('На главную', 'Басты бетке', 'Back to home')}
          </button>
        )}
      </div>
    </div>
  );
}
