// Telegram worker-invite panel (Этап 1).
// Shown inside Settings → Команда. Lets the owner onboard field workers
// (masters / measurers / installers) who work ONLY through the Telegram
// bot and never touch the web platform.
//
// Flow: owner copies / shares one reusable deep link → worker taps it →
// the bot collects their name + role and auto-creates the account. No
// pre-creating employees, no passwords, no web login for the worker.

import { useEffect, useState } from 'react';
import { Copy, Check, Link as LinkIcon, RefreshCw, Send, QrCode, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../utils/api';
import { confirmDialog } from '../utils/confirm';
import { useDataStore } from '../utils/dataStore';

interface Props {
  language: 'kz' | 'ru' | 'eng';
}

interface InviteResp {
  code: string;
  link: string;
  botReady: boolean;
}

export function TelegramInvitePanel({ language }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();
  // Only managers/admins can manage the team invite (it can create members).
  const canManage = store.currentUserRole === 'admin' || store.currentUserRole === 'manager';

  const [invite, setInvite] = useState<InviteResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get<InviteResp>('/api/telegram/team-invite')
      .then(r => { if (!cancelled) setInvite(r); })
      .catch(e => { if (!cancelled) setError(String(e?.message || e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const copy = async () => {
    if (!invite?.link) return;
    try {
      await navigator.clipboard.writeText(invite.link);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = invite.link; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rotate = async () => {
    if (!canManage) return;
    if (!(await confirmDialog({ message: l(
      'Сбросить ссылку? Старая перестанет работать — кто ещё не присоединился, не сможет по ней войти.',
      'Сілтемені қайта жасау керек пе? Ескісі жұмыс істемейді.',
      'Reset the link? The old one stops working for anyone who hasn\'t joined yet.',
    ), danger: true }))) return;
    setRotating(true);
    try {
      const r = await api.post<InviteResp>('/api/telegram/team-invite/rotate', {});
      setInvite(r);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setRotating(false);
    }
  };

  const qrUrl = invite?.link
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(invite.link)}`
    : '';

  return (
    <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl bg-sky-100/70 text-sky-700 ring-1 ring-white/60 flex items-center justify-center flex-shrink-0">
          <Send className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm text-gray-900">{l('Пригласить мастеров в Telegram', 'Шеберлерді Telegram-ға шақыру', 'Invite workers to Telegram')}</div>
          <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
            {l(
              'Замерщики, мастера цеха и монтажники работают прямо в Telegram-боте — без логина в платформу. Отправьте им эту ссылку: они откроют, напишут имя, выберут роль — и сразу в команде.',
              'Замершілер мен шеберлер Telegram-бот арқылы жұмыс істейді. Оларға осы сілтемені жіберіңіз.',
              'Measurers, shop masters and installers work right inside the Telegram bot — no platform login. Send them this link.',
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> {l('Загрузка…', 'Жүктелуде…', 'Loading…')}
        </div>
      ) : error ? (
        <div className="px-3 py-2.5 bg-rose-50 ring-1 ring-rose-100 rounded-xl text-xs text-rose-700 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : invite ? (
        <>
          {!invite.botReady && (
            <div className="mb-3 px-3 py-2 bg-amber-50 ring-1 ring-amber-100 rounded-xl text-[11px] text-amber-700">
              {l(
                'Бот ещё не подключён (нет TELEGRAM_BOT_TOKEN). Ссылка сгенерирована, но заработает после подключения бота.',
                'Бот әлі қосылмаған. Сілтеме дайын, бірақ бот қосылғаннан кейін жұмыс істейді.',
                'Bot is not connected yet (no TELEGRAM_BOT_TOKEN). The link is ready but works once the bot is online.',
              )}
            </div>
          )}

          {/* Link row */}
          <div className="flex items-center gap-2 bg-white/60 ring-1 ring-white/60 rounded-2xl px-3 py-2.5 mb-2">
            <LinkIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              readOnly
              value={invite.link}
              onFocus={e => e.currentTarget.select()}
              className="flex-1 bg-transparent text-xs text-gray-700 focus:outline-none min-w-0"
            />
            <button
              onClick={copy}
              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[11px] hover:bg-emerald-700 transition-colors flex-shrink-0"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? l('Скопировано', 'Көшірілді', 'Copied') : l('Копировать', 'Көшіру', 'Copy')}
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={invite.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white rounded-xl text-[11px] hover:bg-sky-700 transition-colors"
            >
              <Send className="w-3 h-3" /> {l('Открыть в Telegram', 'Telegram-да ашу', 'Open in Telegram')}
            </a>
            <button
              onClick={() => setShowQr(s => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-[11px] text-gray-700 hover:bg-white transition-colors"
            >
              <QrCode className="w-3 h-3" /> {showQr ? l('Скрыть QR', 'QR жасыру', 'Hide QR') : l('Показать QR', 'QR көрсету', 'Show QR')}
            </button>
            {canManage && (
              <button
                onClick={rotate}
                disabled={rotating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-[11px] text-gray-500 hover:text-rose-600 hover:bg-white transition-colors disabled:opacity-50"
                title={l('Сбросить ссылку', 'Сілтемені қайта жасау', 'Reset link')}
              >
                {rotating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {l('Сбросить', 'Қайта жасау', 'Reset')}
              </button>
            )}
          </div>

          {/* QR */}
          {showQr && qrUrl && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <img src={qrUrl} alt="QR" className="w-44 h-44 rounded-2xl ring-1 ring-white/60 bg-white p-2" />
              <div className="text-[10px] text-gray-400 text-center max-w-[220px] leading-relaxed">
                {l('Покажите этот QR мастеру — он наведёт камеру Telegram и сразу попадёт в бот.',
                   'Бұл QR-ды шеберге көрсетіңіз — Telegram камерасымен сканерлейді.',
                   'Show this QR to a worker — they scan it with Telegram and land in the bot.')}
              </div>
            </div>
          )}

          {/* How it looks for the worker */}
          <div className="mt-4 bg-white/40 ring-1 ring-white/60 rounded-2xl p-3">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">
              {l('Что увидит мастер', 'Шебер не көреді', 'What the worker sees')}
            </div>
            <ol className="text-[11px] text-gray-600 space-y-1 list-decimal list-inside leading-relaxed">
              <li>{l('Откроет ссылку → бот спросит имя', 'Сілтемені ашады → бот атын сұрайды', 'Opens the link → bot asks their name')}</li>
              <li>{l('Выберет роль: Замерщик / Мастер цеха / Монтажник / Менеджер', 'Рөлді таңдайды', 'Picks a role: Measurer / Shop master / Installer / Manager')}</li>
              <li>{l('Готово — внизу появится меню под его роль', 'Дайын — рөліне сай мәзір шығады', 'Done — a role-based menu appears at the bottom')}</li>
            </ol>
          </div>
        </>
      ) : null}
    </div>
  );
}
