// ─── Счётчик лимита AI ─────────────────────────────────────────────────
// Показывает остаток AI на экранах генерации/ассистента:
//   • на пробном периоде — «осталось N из M сегодня» (дневной лимит);
//   • на платном тарифе — «осталось N в этом месяце» (месячный лимит),
//     и только когда остаток на исходе, чтобы не шуметь;
//   • когда лимит исчерпан — кнопка «Запросить пакет» (заявка владельцу).
// Владелец/безлимит — ничего. Обновляется по событию 'utir:ai-used'.

import { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import { toast } from '../utils/toast';

interface Status {
  plan: string; limit: number | null; used: number; remaining: number | null;
  unlimited: boolean; allowed: boolean; window?: 'day' | 'month'; bonus?: number;
}

export function AiTrialMeter({ kind, language, className = '' }: { kind: 'assistant' | 'design'; language: 'kz' | 'ru' | 'eng'; className?: string }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [s, setS] = useState<Status | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const load = () => api.get<Record<string, Status>>('/api/team/ai-limits').then(r => setS(r[kind])).catch(() => {});
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener('utir:ai-used', on);
    return () => window.removeEventListener('utir:ai-used', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!s || s.unlimited || s.plan === 'expired') return null;

  const rem = s.remaining ?? 0;
  const noun = kind === 'design'
    ? l('генераций', 'генерация', 'generations')
    : l('сообщений', 'хабарлама', 'messages');
  const monthly = s.window === 'month';
  const when = monthly ? l('в этом месяце', 'осы айда', 'this month') : l('сегодня', 'бүгін', 'today');

  const requestPack = async () => {
    setRequesting(true);
    try {
      await api.post('/api/team/ai-pack-request', { kind });
      setRequested(true);
      toast(l('Заявка отправлена — с вами свяжутся для докупки пакета.', 'Өтінім жіберілді — пакет жайлы хабарласады.', 'Request sent — we will contact you to top up.'), 'success');
    } catch { toast(l('Не удалось отправить заявку', 'Өтінім жіберілмеді', 'Could not send request'), 'error'); }
    finally { setRequesting(false); }
  };

  // Лимит исчерпан → предложить докупку.
  if (rem <= 0) {
    return (
      <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-[11px] bg-rose-50 text-rose-700 ring-1 ring-rose-100 ${className}`}>
        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
        <span>{l('Лимит AI исчерпан', 'AI лимиті бітті', 'AI limit reached')} {when}.</span>
        {requested ? (
          <span className="font-medium">{l('Заявка отправлена', 'Өтінім жіберілді', 'Requested')} ✓</span>
        ) : (
          <button onClick={requestPack} disabled={requesting} className="font-medium underline underline-offset-2 hover:text-rose-900 disabled:opacity-50">
            {l('Запросить пакет', 'Пакет сұрау', 'Request a pack')}
          </button>
        )}
      </div>
    );
  }

  const low = rem <= (s.limit ? Math.max(1, Math.ceil(s.limit * 0.25)) : 1);
  // На платном тарифе показываем счётчик только когда остаток на исходе.
  if (s.plan !== 'trial' && !low) return null;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] ${low ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'} ${className}`}>
      {low ? <AlertTriangle className="w-3 h-3 flex-shrink-0" /> : <Sparkles className="w-3 h-3 flex-shrink-0" />}
      <span>
        {s.plan === 'trial'
          ? <>{l('Пробный период', 'Сынақ кезеңі', 'Free trial')}: {l('осталось', 'қалды', 'left')} <b className="tabular-nums">{rem}</b> {l('из', '/', 'of')} {s.limit} {noun} {when}</>
          : <>AI: {l('осталось', 'қалды', 'left')} <b className="tabular-nums">{rem}</b> {l('из', '/', 'of')} {s.limit} {noun} {when}</>}
      </span>
    </div>
  );
}
