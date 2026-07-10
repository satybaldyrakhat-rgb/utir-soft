import { Check, CheckCheck, Download, FileText, Phone, Play, Pause, Volume2 } from 'lucide-react';
import { translations } from '../utils/translations';

// Convention across all bubble types:
//   isUser === true  → OUR (team) message  → right side, emerald bubble,
//                      read receipts (✓ / ✓✓).
//   isUser === false → client's message     → left side, white bubble.
interface BaseMessageProps {
  message: {
    id: string;
    text: string;
    time: string;
    isUser: boolean;
    read?: boolean;
    type?: 'text' | 'voice' | 'file' | 'image' | 'video' | 'call';
    fileUrl?: string;
    fileName?: string;
    fileSize?: string;
    duration?: string;
    callStatus?: 'missed' | 'incoming' | 'outgoing' | 'ended';
  };
  language: 'kz' | 'ru' | 'eng';
  playingVoiceId?: string | null;
  onToggleVoicePlay?: (id: string) => void;
}

export function TextMessage({ message }: BaseMessageProps) {
  if (!message.text || (message.type && message.type !== 'text')) return null;

  return (
    <div
      className={`px-4 py-2.5 rounded-2xl shadow-sm ${
        message.isUser
          ? 'bg-emerald-600 text-white rounded-tr-md'
          : 'bg-white text-gray-900 rounded-tl-md border border-gray-100'
      }`}
    >
      <p className="text-sm leading-relaxed break-words">{message.text}</p>
      <div className={`flex items-center justify-end gap-1 mt-1.5 ${
        message.isUser ? 'text-emerald-100' : 'text-gray-400'
      }`}>
        <span className="text-xs">{message.time}</span>
        {message.isUser && message.read !== undefined && (
          message.read ? (
            <CheckCheck className="w-3.5 h-3.5" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )
        )}
      </div>
    </div>
  );
}

export function ImageMessage({ message }: BaseMessageProps) {
  if (message.type !== 'image') return null;

  return (
    <div
      className={`rounded-2xl shadow-sm overflow-hidden ${
        message.isUser ? 'rounded-tr-md' : 'rounded-tl-md'
      }`}
    >
      <img
        src={message.fileUrl || 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=600'}
        alt={message.fileName}
        className="w-full max-w-xs cursor-pointer hover:opacity-95 transition-opacity"
      />
      <div className={`px-3 py-2 ${
        message.isUser ? 'bg-emerald-600 text-white' : 'bg-white/60 ring-1 ring-white/60 backdrop-blur-xl'
      }`}>
        <div className="flex items-center justify-between">
          <span className="text-xs">{message.fileName}</span>
          <span className="text-xs opacity-70">{message.time}</span>
        </div>
      </div>
    </div>
  );
}

export function FileMessage({ message }: BaseMessageProps) {
  if (message.type !== 'file') return null;

  return (
    <div
      className={`px-4 py-3 rounded-2xl shadow-sm ${
        message.isUser
          ? 'bg-emerald-600 text-white rounded-tr-md'
          : 'bg-white text-gray-900 rounded-tl-md border border-gray-100'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${
          message.isUser ? 'bg-white/20' : 'bg-emerald-50'
        }`}>
          <FileText className={`w-5 h-5 ${
            message.isUser ? 'text-white' : 'text-emerald-600'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate">{message.fileName}</p>
          <p className={`text-xs ${
            message.isUser ? 'text-emerald-100' : 'text-gray-500'
          }`}>{message.fileSize}</p>
        </div>
        <Download className={`w-4 h-4 flex-shrink-0 ${
          message.isUser ? 'text-white' : 'text-gray-400'
        }`} />
      </div>
      <div className={`flex items-center justify-end gap-1 mt-2 ${
        message.isUser ? 'text-emerald-100' : 'text-gray-400'
      }`}>
        <span className="text-xs">{message.time}</span>
        {message.isUser && message.read !== undefined && (
          message.read ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />
        )}
      </div>
    </div>
  );
}

export function VoiceMessage({ message, playingVoiceId, onToggleVoicePlay }: BaseMessageProps) {
  if (message.type !== 'voice') return null;

  return (
    <div
      className={`px-4 py-3 rounded-2xl shadow-sm ${
        message.isUser
          ? 'bg-emerald-600 text-white rounded-tr-md'
          : 'bg-white text-gray-900 rounded-tl-md border border-gray-100'
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => onToggleVoicePlay?.(message.id)}
          className={`p-2 rounded-full transition-colors ${
            message.isUser
              ? 'bg-white/20 hover:bg-white/30'
              : 'bg-emerald-50 hover:bg-emerald-100'
          }`}
        >
          {playingVoiceId === message.id ? (
            <Pause className={`w-4 h-4 ${
              message.isUser ? 'text-white' : 'text-emerald-600'
            }`} />
          ) : (
            <Play className={`w-4 h-4 ${
              message.isUser ? 'text-white' : 'text-emerald-600'
            }`} />
          )}
        </button>
        <div className="flex-1">
          <div className={`h-6 flex items-center gap-0.5 ${
            playingVoiceId === message.id ? 'opacity-100' : 'opacity-60'
          }`}>
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className={`w-1 rounded-full ${
                  message.isUser ? 'bg-white' : 'bg-emerald-600'
                }`}
                style={{
                  height: `${Math.random() * 100}%`,
                  minHeight: '20%'
                }}
              />
            ))}
          </div>
        </div>
        <Volume2 className={`w-4 h-4 ${
          message.isUser ? 'text-white' : 'text-gray-400'
        }`} />
        <span className="text-xs font-mono">{message.duration}</span>
      </div>
      <div className={`flex items-center justify-end gap-1 mt-1.5 ${
        message.isUser ? 'text-emerald-100' : 'text-gray-400'
      }`}>
        <span className="text-xs">{message.time}</span>
        {message.isUser && message.read !== undefined && (
          message.read ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />
        )}
      </div>
    </div>
  );
}

export function CallMessage({ message, language }: BaseMessageProps) {
  if (message.type !== 'call') return null;

  return (
    <div
      className={`px-4 py-3 rounded-2xl shadow-sm ${
        message.callStatus === 'missed'
          ? 'bg-red-50 border border-red-200'
          : message.isUser
            ? 'bg-emerald-50 rounded-tr-md border border-emerald-200'
            : 'bg-white rounded-tl-md border border-gray-100'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full ${
          message.callStatus === 'missed'
            ? 'bg-red-100'
            : 'bg-emerald-100'
        }`}>
          <Phone className={`w-4 h-4 ${
            message.callStatus === 'missed'
              ? 'text-red-600'
              : 'text-emerald-600'
          }`} />
        </div>
        <div className="flex-1">
          <p className={`text-sm font-medium ${
            message.callStatus === 'missed' ? 'text-red-700' : 'text-gray-900'
          }`}>
            {message.callStatus === 'outgoing' && translations.outgoingCall[language]}
            {message.callStatus === 'incoming' && translations.incomingCall[language]}
            {message.callStatus === 'missed' && translations.missedCall[language]}
            {message.callStatus === 'ended' && translations.callEnded[language]}
          </p>
          <p className="text-xs text-slate-500">{message.duration}</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 mt-1.5 text-slate-400">
        <span className="text-xs">{message.time}</span>
      </div>
    </div>
  );
}
