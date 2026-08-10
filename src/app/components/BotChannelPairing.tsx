// ─── Выбор канала бота-ассистента: WhatsApp или Telegram ──────────────
// Один и тот же AI-ассистент доступен по двум каналам. Пользователь выбирает
// удобный и привязывает свой мессенджер по коду.

import { useState } from 'react';
import { Send, MessageCircle } from 'lucide-react';
import { TelegramPairing } from './TelegramPairing';
import { WhatsAppBotPairing } from './WhatsAppBotPairing';

const CHANNEL_KEY = 'utir_bot_channel';
type Channel = 'whatsapp' | 'telegram';

export function BotChannelPairing({ language }: { language: 'kz' | 'ru' | 'eng' }) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [channel, setChannel] = useState<Channel>(() => {
    try { const s = localStorage.getItem(CHANNEL_KEY); if (s === 'whatsapp' || s === 'telegram') return s; } catch { /* ignore */ }
    return 'whatsapp';
  });
  const pick = (c: Channel) => { setChannel(c); try { localStorage.setItem(CHANNEL_KEY, c); } catch { /* ignore */ } };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm text-gray-900 mb-1">{l('Бот-ассистент', 'Бот-көмекші', 'Assistant bot')}</div>
        <div className="text-[11px] text-slate-400 mb-3">
          {l('Выберите, где удобнее общаться с ассистентом — в WhatsApp или Telegram.',
             'Ассистентпен қай жерде сөйлескіңіз келетінін таңдаңыз — WhatsApp немесе Telegram.',
             'Choose where to chat with the assistant — WhatsApp or Telegram.')}
        </div>
        {/* Segmented control */}
        <div className="inline-flex p-1 bg-slate-100 rounded-xl gap-1">
          <button
            onClick={() => pick('whatsapp')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition ${channel === 'whatsapp' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </button>
          <button
            onClick={() => pick('telegram')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition ${channel === 'telegram' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Send className="w-3.5 h-3.5" /> Telegram
          </button>
        </div>
      </div>

      {channel === 'whatsapp' ? <WhatsAppBotPairing language={language} /> : <TelegramPairing language={language} />}
    </div>
  );
}
