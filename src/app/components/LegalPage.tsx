import { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import profileLogo from '../../imports/utirsoft.png';

interface LegalPageProps {
  language: 'kz' | 'ru' | 'eng';
  onLanguageChange: (lang: 'kz' | 'ru' | 'eng') => void;
  title: string;
  updated: string;
  children: ReactNode;
}

export function LegalPage({ language, onLanguageChange, title, updated, children }: LegalPageProps) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  return (
    <div className="min-h-screen relative" style={{
        background: `
          radial-gradient(900px circle at 0% 0%,   rgba(196,181,253,0.30), transparent 45%),
          radial-gradient(800px circle at 100% 5%, rgba(252,165,165,0.24), transparent 45%),
          radial-gradient(900px circle at 100% 70%, rgba(125,211,252,0.28), transparent 50%),
          radial-gradient(900px circle at 0% 100%, rgba(167,243,208,0.26), transparent 50%),
          linear-gradient(180deg, #fbfafd 0%, #f3f4f9 100%)
        `,
      }}>
      <div className="border-b border-white/60 px-4 sm:px-8 py-4 flex items-center justify-between">
        <button
          onClick={() => { window.location.hash = ''; window.history.back(); }}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          {l('Назад', 'Артқа', 'Back')}
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md overflow-hidden bg-white/60 ring-1 ring-white/60 backdrop-blur-xl">
            <img src={profileLogo} alt="Utir Soft" className="w-full h-full object-cover" />
          </div>
          <span className="text-xs text-slate-500">Utir Soft</span>
        </div>
        <div className="flex gap-0.5 bg-gray-50 p-0.5 rounded-lg">
          {(['kz', 'ru', 'eng'] as const).map(lang => (
            <button key={lang} onClick={() => onLanguageChange(lang)} className={`px-2.5 py-1 rounded text-[10px] transition-all ${language === lang ? 'bg-white shadow-sm text-gray-900' : 'text-slate-400 hover:text-gray-600'}`}>
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-4 sm:px-8 py-10">
        <header className="mb-8">
          <h1 className="text-3xl text-slate-900 mb-2">{title}</h1>
          <p className="text-xs text-slate-400">{updated}</p>
        </header>
        <div className="prose prose-sm prose-gray max-w-none space-y-5 text-sm leading-relaxed text-slate-700">
          {children}
        </div>
        <footer className="mt-12 pt-6 border-t border-white/60 text-[11px] text-slate-400">
          {l(
            'Это шаблон документа. Перед использованием в коммерческой деятельности рекомендуется адаптировать его под вашу компанию и проверить с юристом.',
            'Бұл құжат үлгісі. Коммерциялық қызметте пайдаланардан бұрын оны өз компанияңызға бейімдеп, заңгермен тексеру ұсынылады.',
            'This is a template document. Adapt it to your company and review with a lawyer before commercial use.'
          )}
        </footer>
      </article>
    </div>
  );
}

interface SectionProps { num: number; title: string; children: ReactNode; }
export function LegalSection({ num, title, children }: SectionProps) {
  return (
    <section>
      <h2 className="text-base text-slate-900 mb-2">{num}. {title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
