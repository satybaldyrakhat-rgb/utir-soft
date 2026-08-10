// ─── Привязка WhatsApp-ассистента ─────────────────────────────────────
// Тот же принцип, что и Telegram: пользователь получает 6-значный код и
// отправляет его на платформенный WhatsApp-номер бота. Сервер-managed —
// ключи (WHATSAPP_BOT_TOKEN) живут в env, не в браузере.

import { useEffect, useState } from 'react';
import { MessageCircle, Copy, Check, X, RefreshCw, Loader2 } from 'lucide-react';
import { api } from '../utils/api';
import { confirmDialog } from '../utils/confirm';

interface Props { language: 'kz' | 'ru' | 'eng' }

interface WaLinkStatus {
  paired: boolean;
  waId?: string;
  name?: string;
  linkedAt?: string;
  pendingCode?: string;
  botNumber?: string;
  serverReady?: { whatsapp: boolean; claude: boolean };
}

export function WhatsAppBotPairing({ language }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  const [status, setStatus] = useState<WaLinkStatus | null>(null);
  const [generating, setGenerating] = useState(false);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  const refresh = async () => {
    try { setStatus(await api.get<WaLinkStatus>('/api/whatsapp-bot/link/status')); }
    catch { setStatus({ paired: false }); }
  };
  useEffect(() => { refresh(); }, []);

  const generate = async () => {
    setGenerating(true);
    try { const r = await api.post<{ code: string }>('/api/whatsapp-bot/link/new', {}); setCode(r.code); setCopied(false); }
    finally { setGenerating(false); }
  };

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  const unlink = async () => {
    if (!(await confirmDialog({ message: l('Отвязать WhatsApp-бот?', 'WhatsApp-ботты ажырату?', 'Unlink WhatsApp bot?'), danger: true }))) return;
    await api.delete('/api/whatsapp-bot/link'); setCode(''); refresh();
  };

  const serverIssue = status?.serverReady && (!status.serverReady.whatsapp || !status.serverReady.claude);
  const botNum = (status?.botNumber || '').replace(/\D/g, '');
  const waLink = botNum ? `https://wa.me/${botNum}${code ? `?text=${encodeURIComponent(code)}` : ''}` : '';

  return (
    <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <MessageCircle className="w-4 h-4 text-emerald-600" />
        <div className="text-sm text-gray-900">{l('Подключение WhatsApp-бота', 'WhatsApp-ботты қосу', 'Connect WhatsApp bot')}</div>
      </div>
      <div className="text-[11px] text-slate-400 mb-4 leading-relaxed">
        {l(
          'Привяжите свой WhatsApp к аккаунту — AI-ассистент будет отвечать и обновлять CRM по вашим сообщениям в WhatsApp.',
          'WhatsApp-ыңызды аккаунтқа байланыстырыңыз — AI-көмекші WhatsApp-тағы хабарларыңызға жауап беріп, CRM-ді жаңартады.',
          'Pair your WhatsApp with this account — the AI assistant will reply and update your CRM from your WhatsApp messages.'
        )}
      </div>

      {serverIssue && (
        <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-800">
          {!status?.serverReady?.whatsapp && (<div>⚠ {l('WhatsApp-бот не подключён на сервере (нет WHATSAPP_BOT_PHONE_NUMBER_ID / WHATSAPP_BOT_TOKEN).', 'Серверде WhatsApp-бот қосылмаған (WHATSAPP_BOT_PHONE_NUMBER_ID / WHATSAPP_BOT_TOKEN жоқ).', 'WhatsApp bot not configured on server.')}</div>)}
          {!status?.serverReady?.claude && (<div>⚠ ANTHROPIC_API_KEY {l('не задан на сервере', 'серверде жоқ', 'not set on server')}</div>)}
        </div>
      )}

      {status?.paired ? (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-emerald-900">
                {l('WhatsApp подключён', 'WhatsApp қосылды', 'WhatsApp connected')}
                {status.waId && <span className="text-emerald-700 ml-1">· +{status.waId}</span>}
              </div>
              {status.linkedAt && (
                <div className="text-[10px] text-emerald-600/70">{new Date(status.linkedAt).toLocaleString(language === 'eng' ? 'en-GB' : 'ru-RU')}</div>
              )}
            </div>
          </div>
          <button onClick={unlink} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0">
            <X className="w-3 h-3" />{l('Отвязать', 'Ажырату', 'Unlink')}
          </button>
        </div>
      ) : code ? (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <div className="text-[11px] text-emerald-700 mb-2">
            {botNum
              ? l('Отправьте этот код на WhatsApp-номер бота:', 'Осы кодты боттың WhatsApp-нөміріне жіберіңіз:', 'Send this code to the bot WhatsApp number:')
              : l('Отправьте этот код боту в WhatsApp:', 'Осы кодты WhatsApp-та ботқа жіберіңіз:', 'Send this code to the bot on WhatsApp:')}
          </div>
          <div className="bg-white rounded-lg p-3 flex items-center justify-between mb-3">
            <code className="font-mono text-lg tracking-[0.3em] text-emerald-900">{code}</code>
            <button onClick={copyCode} className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500 hover:text-gray-900 hover:bg-white/50 rounded-lg">
              {copied ? <><Check className="w-3 h-3 text-emerald-500" /> {l('Скопировано', 'Көшірілді', 'Copied')}</> : <><Copy className="w-3 h-3" /> {l('Копировать', 'Көшіру', 'Copy')}</>}
            </button>
          </div>
          <div className="flex items-center justify-between">
            {waLink ? (
              <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:underline">
                <MessageCircle className="w-3.5 h-3.5" />{l('Открыть WhatsApp', 'WhatsApp ашу', 'Open WhatsApp')} {botNum && `+${botNum}`}
              </a>
            ) : <span className="text-[11px] text-slate-400">{l('Номер бота появится после настройки на сервере', 'Бот нөмірі серверде бапталған соң шығады', 'Bot number appears after server setup')}</span>}
            <button onClick={generate} className="text-[11px] text-slate-500 hover:text-gray-900 inline-flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />{l('Новый код', 'Жаңа код', 'New code')}
            </button>
          </div>
          <div className="text-[10px] text-emerald-700/70 mt-2">
            {l('Код действителен 1 час. Одноразовая привязка.', 'Код 1 сағат жарамды. Бір реттік байланыс.', 'Valid for 1 hour. Single-use pairing.')}
          </div>
        </div>
      ) : (
        <div>
          <button onClick={generate} disabled={generating}
            className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
            {l('Сгенерировать код привязки', 'Байланыс кодын жасау', 'Generate link code')}
          </button>
          <div className="text-[10px] text-slate-400 mt-2">
            {l('Получите 6-значный код и отправьте его боту в WhatsApp.', 'WhatsApp-та ботқа 6 таңбалы кодты жіберіңіз.', 'Send the 6-char code to the bot on WhatsApp.')}
          </div>
        </div>
      )}
    </div>
  );
}
