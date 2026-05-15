import { useEffect, useState } from 'react';
import { Send, Copy, Check, X, RefreshCw, Loader2 } from 'lucide-react';
import { api } from '../utils/api';

interface Props {
  language: 'kz' | 'ru' | 'eng';
}

interface LinkStatus {
  paired: boolean;
  chatId?: number;
  username?: string;
  linkedAt?: string;
  pendingCode?: string;
  serverReady?: { telegram: boolean; claude: boolean };
}

const BOT_USERNAME = 'utirsoftbot';

export function TelegramPairing({ language }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [generating, setGenerating] = useState(false);
  const [code, setCode] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const refresh = async () => {
    try {
      const s = await api.get<LinkStatus>('/api/telegram/link/status');
      setStatus(s);
    } catch (e) {
      setStatus({ paired: false });
    }
  };

  useEffect(() => { refresh(); }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await api.post<{ code: string; expiresAt: string }>('/api/telegram/link/new', {});
      setCode(r.code);
      setCopied(false);
    } finally {
      setGenerating(false);
    }
  };

  const copyLine = async () => {
    const text = `/link ${code}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const unlinkBot = async () => {
    if (!confirm(l('Отвязать Telegram-бот?', 'Telegram-ботты ажырату?', 'Unlink Telegram bot?'))) return;
    await api.delete('/api/telegram/link');
    setCode('');
    refresh();
  };

  const serverIssue = status?.serverReady && (!status.serverReady.telegram || !status.serverReady.claude);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Send className="w-4 h-4 text-violet-600" />
        <div className="text-sm text-gray-900">{l('Подключение Telegram-бота', 'Telegram-ботты қосу', 'Connect Telegram bot')}</div>
      </div>
      <div className="text-[11px] text-gray-400 mb-4 leading-relaxed">
        {l(
          'Привяжите ваш Telegram к этому аккаунту, и AI-ассистент сможет обновлять CRM по вашим свободным сообщениям.',
          'Telegram-ыңызды осы аккаунтқа байланыстырыңыз, сонда AI-көмекші еркін хабарламаларыңыз бойынша CRM-ді жаңартады.',
          'Pair your Telegram with this account so the AI assistant can update your CRM from your free-form messages.'
        )}
      </div>

      {/* Server-readiness warning */}
      {serverIssue && (
        <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-800">
          {!status?.serverReady?.telegram && (<div>⚠ TELEGRAM_BOT_TOKEN не задан на сервере</div>)}
          {!status?.serverReady?.claude && (<div>⚠ ANTHROPIC_API_KEY не задан на сервере</div>)}
        </div>
      )}

      {/* Paired state */}
      {status?.paired ? (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
            <div>
              <div className="text-xs text-emerald-900">
                {l('Бот подключён', 'Бот қосылды', 'Bot connected')}
                {status.username && <span className="text-emerald-700 ml-1">· @{status.username}</span>}
              </div>
              {status.linkedAt && (
                <div className="text-[10px] text-emerald-600/70">
                  {new Date(status.linkedAt).toLocaleString(language === 'eng' ? 'en-GB' : 'ru-RU')}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={unlinkBot}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
          >
            <X className="w-3 h-3" />
            {l('Отвязать', 'Ажырату', 'Unlink')}
          </button>
        </div>
      ) : code ? (
        /* Code generated — show pairing instruction */
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
          <div className="text-[11px] text-violet-700 mb-2">
            {l('Откройте бот и пришлите ему эту строку:', 'Ботты ашып, осы жолды жіберіңіз:', 'Open the bot and send it this line:')}
          </div>
          <div className="bg-white rounded-lg p-3 flex items-center justify-between mb-3">
            <code className="font-mono text-lg tracking-wider text-violet-900">/link {code}</code>
            <button onClick={copyLine} className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg">
              {copied ? <><Check className="w-3 h-3 text-emerald-500" /> {l('Скопировано', 'Көшірілді', 'Copied')}</> : <><Copy className="w-3 h-3" /> {l('Копировать', 'Көшіру', 'Copy')}</>}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <a
              href={`https://t.me/${BOT_USERNAME}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-violet-700 hover:underline"
            >
              <Send className="w-3.5 h-3.5" />
              t.me/{BOT_USERNAME}
            </a>
            <button onClick={generate} className="text-[11px] text-gray-500 hover:text-gray-900 inline-flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />{l('Новый код', 'Жаңа код', 'New code')}
            </button>
          </div>
          <div className="text-[10px] text-violet-700/70 mt-2">
            {l('Код действителен 1 час. Не делитесь им — это одноразовая привязка.',
               'Код 1 сағат жарамды. Бөліспеңіз — бұл бір реттік байланыс.',
               'Code is valid for 1 hour. Do not share — single-use pairing.')}
          </div>
        </div>
      ) : (
        /* Not paired, no code yet */
        <div>
          <button
            onClick={generate}
            disabled={generating}
            className="w-full sm:w-auto px-4 py-2.5 bg-violet-600 text-white rounded-xl text-xs hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {l('Сгенерировать код привязки', 'Байланыс кодын жасау', 'Generate link code')}
          </button>
          <div className="text-[10px] text-gray-400 mt-2">
            {l('Получите 6-значный код и пришлите его боту командой', 'Ботқа /link командасымен 6 таңбалы кодты жіберіңіз', 'Send the 6-char code to the bot with /link command')}: <code className="text-gray-600">/link XXXXXX</code>
          </div>
        </div>
      )}
    </div>
  );
}
