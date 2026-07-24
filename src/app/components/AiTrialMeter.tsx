// ─── Счётчик лимита AI на пробном периоде ──────────────────────────────
// Показывает «осталось N из M сегодня» на экранах AI, но ТОЛЬКО во время
// пробного периода (plan === 'trial'). Для оплаченных/владельца — ничего.
// Обновляется по событию 'utir:ai-used' после каждой генерации/сообщения.

import { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';

interface Status { plan: string; limit: number | null; used: number; remaining: number | null; unlimited: boolean; allowed: boolean }

export function AiTrialMeter({ kind, language, className = '' }: { kind: 'assistant' | 'design'; language: 'kz' | 'ru' | 'eng'; className?: string }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [s, setS] = useState<Status | null>(null);
  const load = () => api.get<Record<string, Status>>('/api/team/ai-limits').then(r => setS(r[kind])).catch(() => {});
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener('utir:ai-used', on);
    return () => window.removeEventListener('utir:ai-used', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!s || s.plan !== 'trial' || s.unlimited) return null;
  const rem = s.remaining ?? 0;
  const noun = kind === 'design'
    ? l('генераций', 'генерация', 'generations')
    : l('сообщений', 'хабарлама', 'messages');
  const low = rem <= (s.limit ? Math.max(1, Math.ceil(s.limit * 0.25)) : 1);

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] ${low ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'} ${className}`}>
      {low ? <AlertTriangle className="w-3 h-3 flex-shrink-0" /> : <Sparkles className="w-3 h-3 flex-shrink-0" />}
      <span>{l('Пробный период', 'Сынақ кезеңі', 'Free trial')}: {l('осталось', 'қалды', 'left')} <b className="tabular-nums">{rem}</b> {l('из', '/', 'of')} {s.limit} {noun} {l('сегодня', 'бүгін', 'today')}</span>
    </div>
  );
}
