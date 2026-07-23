// ─── Баннер подписки (мягкий, не блокирует) ───────────────────────────
// Показывается ТОЛЬКО если владелец завёл подписку команде (managed) и она
// в состоянии, о котором стоит напомнить: пробный кончается/кончился,
// подписка просрочена или скоро истекает. Для «активных с запасом» и для
// команд без заведённой подписки — ничего не показываем.

import { useEffect, useState } from 'react';
import { AlertTriangle, X, Clock } from 'lucide-react';
import { api } from '../utils/api';

interface SubView { managed: boolean; status?: string; plan?: string; expiresAt?: string; daysLeft?: number | null }
const DISMISS_KEY = 'utir_sub_banner_dismissed';

export function SubscriptionBanner({ language }: { language: 'kz' | 'ru' | 'eng' }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [sub, setSub] = useState<SubView | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => { api.get<SubView>('/api/team/subscription').then(setSub).catch(() => setSub(null)); }, []);

  if (!sub?.managed) return null;
  const { status, daysLeft, expiresAt } = sub;
  const d = daysLeft ?? 99;

  // Определяем, что показать (иначе — ничего).
  let msg: string | null = null;
  let tone: 'red' | 'amber' | 'sky' = 'sky';
  if (status === 'past_due') {
    msg = l('Подписка просрочена. Продлите, чтобы сохранить доступ.', 'Жазылым мерзімі өтті. Қол жеткізуді сақтау үшін ұзартыңыз.', 'Subscription past due. Renew to keep access.'); tone = 'red';
  } else if (status === 'trial' && d <= 0) {
    msg = l('Пробный период завершён. Оформите подписку для продолжения.', 'Сынақ кезеңі аяқталды. Жалғастыру үшін жазылыңыз.', 'Trial ended. Subscribe to continue.'); tone = 'amber';
  } else if (status === 'trial' && d <= 5) {
    msg = l(`Пробный период: осталось ${d} дн.`, `Сынақ кезеңі: ${d} күн қалды.`, `Trial: ${d} days left.`); tone = 'amber';
  } else if (status === 'active' && d <= 5 && d >= 0) {
    msg = l(`Подписка истекает через ${d} дн.`, `Жазылым ${d} күнде аяқталады.`, `Subscription expires in ${d} days.`); tone = 'sky';
  } else if (status === 'active' && d < 0) {
    msg = l('Срок подписки истёк. Свяжитесь для продления.', 'Жазылым мерзімі бітті. Ұзарту үшін хабарласыңыз.', 'Subscription expired. Contact to renew.'); tone = 'amber';
  }
  if (!msg) return null;

  // Дедуп-скрытие: привязываем к статусу+дате, чтобы баннер вернулся при
  // смене состояния.
  const sig = `${status}:${expiresAt}`;
  if (dismissed) return null;
  try { if (localStorage.getItem(DISMISS_KEY) === sig) return null; } catch { /* ignore */ }

  const tones = {
    red:   'bg-rose-50 text-rose-700 border-rose-100',
    amber: 'bg-amber-50 text-amber-800 border-amber-100',
    sky:   'bg-sky-50 text-sky-700 border-sky-100',
  };
  const Icon = tone === 'sky' ? Clock : AlertTriangle;

  return (
    <div className={`flex items-center gap-2 px-4 py-2 text-xs border-b ${tones[tone]}`}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1">{msg}</span>
      <button
        onClick={() => { try { localStorage.setItem(DISMISS_KEY, sig); } catch { /* ignore */ } setDismissed(true); }}
        className="p-1 hover:bg-black/5 rounded-lg"
        aria-label="dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
