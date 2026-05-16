// AI Design page — wizard-first UI so anyone can generate a great interior
// in 3 clicks without knowing how to write a prompt.
//
// Flow:
//   1. Pick a room (kitchen / bedroom / living / etc.) — visual cards
//   2. Pick a style (scandi / loft / minimalism / etc.)
//   3. (optional) Pick mood / colour / лайтинг chips for extra detail
//   4. Pick AI provider — Gemini / ChatGPT / Claude+banana / UTIR-mix
//   5. Generate — prompt is auto-assembled in Russian
//
// 'Свой prompt' toggle reveals a free-form textarea for advanced users
// who want to write the description by hand.

import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Loader2, Download, Check, X, Bot, History, Wand2,
  CookingPot, BedDouble, Sofa, Bath, Baby, DoorOpen, Link as LinkIcon, Search,
} from 'lucide-react';
import { api } from '../utils/api';
import { useDataStore } from '../utils/dataStore';
import utirLogo from '../../imports/utirsoft.png';

// ─── Brand-icon SVGs (real provider logos, inline so no extra requests) ──
// OpenAI knot / spiral
function OpenAiIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.792a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}
// Gemini — 4-point star (Google's mark for the model)
function GeminiIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 0c.844 6.844 5.156 11.156 12 12-6.844.844-11.156 5.156-12 12-.844-6.844-5.156-11.156-12-12C6.844 11.156 11.156 6.844 12 0z" />
    </svg>
  );
}
// Claude / Anthropic — the official multi-pointed star/spiral mark
function ClaudeIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden>
      <path d="M16 0c.6 7 8.3 14.7 16 16-7.7 1.3-15.4 9-16 16-.6-7-8.3-14.7-16-16C7.7 14.7 15.4 7 16 0z M16 6.5c-.4 4-4.5 8.1-8.5 8.5 4 .4 8.1 4.5 8.5 8.5.4-4 4.5-8.1 8.5-8.5-4-.4-8.1-4.5-8.5-8.5z" />
    </svg>
  );
}

interface AIDesignProps {
  language: 'kz' | 'ru' | 'eng';
}

type ProviderId = 'chatgpt' | 'gemini' | 'claude' | 'utir-mix';

interface ProviderStatus { id: ProviderId; name: string; enabled: boolean; envVar?: string }
interface GenResult { id?: string; provider: ProviderId; ok: boolean; imageUrl?: string; imageDataUrl?: string; enhancedPrompt?: string; error?: string }
interface HistoryEntry { id: string; userId: string; userName: string; provider: ProviderId; prompt: string; imageUrl: string | null; enhancedPrompt: string | null; createdAt: string }

// ─── Wizard data ──────────────────────────────────────────────────
// Each room / style is paired with a short Russian phrase that goes into
// the auto-assembled prompt. Icons are picked from lucide-react where
// reasonable; fallbacks are emoji.
const ROOMS: { id: string; label: { ru: string; kz: string; eng: string }; icon: React.ComponentType<{ className?: string }>; promptRu: string }[] = [
  { id: 'kitchen',    label: { ru: 'Кухня',     kz: 'Ас үй',      eng: 'Kitchen' },     icon: CookingPot, promptRu: 'просторная кухня' },
  { id: 'bedroom',    label: { ru: 'Спальня',   kz: 'Жатын бөлме',eng: 'Bedroom' },     icon: BedDouble,  promptRu: 'уютная спальня' },
  { id: 'living',     label: { ru: 'Гостиная',  kz: 'Қонақ бөлме',eng: 'Living room' }, icon: Sofa,       promptRu: 'светлая гостиная' },
  { id: 'bath',       label: { ru: 'Ванная',    kz: 'Ванна бөлме',eng: 'Bathroom' },    icon: Bath,       promptRu: 'современная ванная комната' },
  { id: 'kids',       label: { ru: 'Детская',   kz: 'Балалар бөлме', eng: 'Kids room' },icon: Baby,       promptRu: 'детская комната' },
  { id: 'hallway',    label: { ru: 'Прихожая',  kz: 'Дәліз',      eng: 'Hallway' },     icon: DoorOpen,   promptRu: 'прихожая' },
];

const STYLES: { id: string; label: { ru: string; kz: string; eng: string }; promptRu: string; emoji: string }[] = [
  { id: 'scandi',    label: { ru: 'Скандинавский', kz: 'Скандинав',    eng: 'Scandi' },     promptRu: 'в скандинавском стиле, белые матовые фасады, дерево, мягкое естественное освещение', emoji: '🌲' },
  { id: 'minimal',   label: { ru: 'Минимализм',    kz: 'Минимализм',   eng: 'Minimal' },    promptRu: 'в стиле минимализм, чистые линии, монохромная палитра, скрытые ручки',             emoji: '◻️' },
  { id: 'loft',      label: { ru: 'Лофт',          kz: 'Лофт',         eng: 'Loft' },       promptRu: 'в стиле лофт, кирпичная кладка, открытые балки, металл, индустриальные лампы',     emoji: '🧱' },
  { id: 'classic',   label: { ru: 'Классика',      kz: 'Классика',     eng: 'Classic' },    promptRu: 'в классическом стиле, лепнина, благородные материалы, тёплый свет',                 emoji: '🏛' },
  { id: 'modern',    label: { ru: 'Модерн',        kz: 'Модерн',       eng: 'Modern' },     promptRu: 'в стиле современный модерн, акцентные геометрии, тёмный дуб, латунь',                emoji: '✨' },
  { id: 'eco',       label: { ru: 'Эко',           kz: 'Эко',          eng: 'Eco' },        promptRu: 'в эко-стиле, натуральные материалы, лён, ротанг, много зелени и дневного света',    emoji: '🌿' },
];

const MOODS: { id: string; label: { ru: string; kz: string; eng: string }; promptRu: string }[] = [
  { id: 'morning',  label: { ru: 'Утренний свет',  kz: 'Таңертеңгі жарық', eng: 'Morning light' }, promptRu: 'мягкий утренний свет из окна' },
  { id: 'cozy',     label: { ru: 'Уютная атмосфера', kz: 'Жайлы атмосфера', eng: 'Cozy mood' },    promptRu: 'тёплая уютная атмосфера' },
  { id: 'luxe',     label: { ru: 'Премиум',        kz: 'Премиум',          eng: 'Premium' },      promptRu: 'премиальные материалы, латунь и натуральный камень' },
  { id: 'spacious', label: { ru: 'Просторный',     kz: 'Кең',              eng: 'Spacious' },     promptRu: 'высокие потолки, ощущение простора' },
  { id: 'plants',   label: { ru: 'С растениями',   kz: 'Өсімдіктермен',    eng: 'With plants' },  promptRu: 'много комнатных растений' },
  { id: 'evening',  label: { ru: 'Вечер, лампы',   kz: 'Кеш, шамдар',      eng: 'Evening lamps' },promptRu: 'вечернее тёплое освещение от ламп и торшеров' },
];

// Each provider's visual identity. `icon` is a render function so we can swap
// real brand SVGs in instead of emoji. `fullBleed` makes the logo fill the
// whole rounded square (no inner padding) — used for UTIR's platform logo.
const PROVIDER_VISUAL: Record<ProviderId, {
  bg: string;
  icon: (className: string) => React.ReactNode;
  sub: string;
  fullBleed?: boolean;
}> = {
  chatgpt: {
    bg: 'bg-[#0F1715]',
    icon: (cls) => <OpenAiIcon className={cls + ' text-white'} />,
    sub: 'ChatGPT · OpenAI',
  },
  gemini: {
    bg: 'bg-gradient-to-br from-[#4285F4] via-[#9168F0] to-[#D96570]',
    icon: (cls) => <GeminiIcon className={cls + ' text-white'} />,
    sub: 'Gemini · nano-banana-pro',
  },
  claude: {
    bg: 'bg-[#D4A27F]',
    icon: (cls) => <ClaudeIcon className={cls + ' text-[#1C1814]'} />,
    sub: 'Claude Opus → nano-banana-pro',
  },
  'utir-mix': {
    bg: 'bg-white',
    // fullBleed: the platform logo fills the whole rounded square instead of
    // sitting as a small icon with padding around it.
    icon: () => <img src={utirLogo} alt="UTIR" className="w-full h-full object-cover" />,
    sub: 'UTIR AI — все провайдеры',
    fullBleed: true,
  },
};

export function AIDesign({ language }: AIDesignProps) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('utir-mix');

  // Wizard state
  const [roomId, setRoomId] = useState<string>('');
  const [styleId, setStyleId] = useState<string>('');
  const [moodIds, setMoodIds] = useState<string[]>([]);
  const [extraText, setExtraText] = useState('');

  // Optional uploaded photos. Each is a data URL (base64) so we can send
  // straight to /api/ai-design/generate without an extra upload step.
  const [roomPhoto, setRoomPhoto] = useState<string | undefined>(undefined);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);

  const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const onRoomFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { setRoomPhoto(await fileToDataUrl(f)); } catch { /* ignore */ }
  };
  const onRefsAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const slots = Math.max(0, 3 - referenceImages.length);
    const picked = files.slice(0, slots);
    const dataUrls = await Promise.all(picked.map(fileToDataUrl).map(p => p.catch(() => null)));
    setReferenceImages(prev => [...prev, ...dataUrls.filter((x): x is string => !!x)]);
    // Reset input so the same file can be re-picked later.
    e.target.value = '';
  };

  // Attach-to-deal picker — opens a modal listing the team's active deals
  // and writes the generation id into deal.designIds via updateDeal.
  const store = useDataStore();
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [attachQuery, setAttachQuery] = useState('');
  const [attachToast, setAttachToast] = useState('');
  const dealsForAttach = useMemo(() => {
    const q = attachQuery.toLowerCase().trim();
    return store.deals
      .filter(d => d.status !== 'rejected')
      .filter(d => !q || d.customerName.toLowerCase().includes(q) || (d.phone || '').includes(q))
      .slice(0, 30);
  }, [store.deals, attachQuery]);

  const attachToDeal = (dealId: string) => {
    if (!attachingId) return;
    const deal = store.deals.find(d => d.id === dealId);
    if (!deal) return;
    const existing = deal.designIds || [];
    if (existing.includes(attachingId)) {
      setAttachToast(l('Уже прикреплено к этой сделке', 'Бұл мәмілеге қосылған', 'Already attached to this deal'));
    } else {
      store.updateDeal(dealId, { designIds: [...existing, attachingId] });
      setAttachToast(l(`Прикреплено к «${deal.customerName}»`, `«${deal.customerName}» қосылды`, `Attached to "${deal.customerName}"`));
    }
    setAttachingId(null);
    setAttachQuery('');
    setTimeout(() => setAttachToast(''), 2500);
  };

  // Free-form mode (advanced users)
  const [freeMode, setFreeMode] = useState(false);
  const [freePrompt, setFreePrompt] = useState('');

  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GenResult[]>([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Auto-assembled prompt from wizard selections. Concatenates room +
  // style + optional moods + extra free-text comma-separated, in Russian.
  const assembledPrompt = useMemo(() => {
    const parts: string[] = [];
    const room = ROOMS.find(r => r.id === roomId);
    const style = STYLES.find(s => s.id === styleId);
    if (room) parts.push(room.promptRu);
    if (style) parts.push(style.promptRu);
    for (const id of moodIds) {
      const m = MOODS.find(x => x.id === id);
      if (m) parts.push(m.promptRu);
    }
    if (extraText.trim()) parts.push(extraText.trim());
    return parts.join(', ');
  }, [roomId, styleId, moodIds, extraText]);

  const finalPrompt = freeMode ? freePrompt : assembledPrompt;
  const canGenerate = finalPrompt.trim().length > 0 && !generating;

  const reloadAll = async () => {
    try {
      const [p, h] = await Promise.all([
        api.get<ProviderStatus[]>('/api/ai-design/providers'),
        api.get<HistoryEntry[]>('/api/ai-design/history').catch(() => [] as HistoryEntry[]),
      ]);
      setProviders(p);
      setHistory(h);
      const stillEnabled = p.find(x => x.id === selectedProvider)?.enabled;
      if (!stillEnabled) setSelectedProvider(p.find(x => x.enabled)?.id || 'utir-mix');
    } catch (e: any) {
      setError(String(e?.message || 'load failed'));
    }
  };
  useEffect(() => { void reloadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const toggleMood = (id: string) => {
    setMoodIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const generate = async () => {
    if (!canGenerate) return;
    setGenerating(true); setError(''); setResults([]);
    try {
      const res = await api.post<{ provider: ProviderId; prompt: string; results: GenResult[] }>('/api/ai-design/generate', {
        provider: selectedProvider,
        prompt: finalPrompt,
        roomPhoto,
        referenceImages,
      });
      setResults(res.results || []);
      void reloadAll();
    } catch (e: any) {
      setError(String(e?.message || 'generation failed'));
    } finally {
      setGenerating(false);
    }
  };

  const resetWizard = () => {
    setRoomId(''); setStyleId(''); setMoodIds([]); setExtraText(''); setResults([]);
    setRoomPhoto(undefined); setReferenceImages([]);
  };

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-sm text-gray-400 mb-1">AI Дизайн</p>
          <h1 className="text-gray-900 mb-1">
            {l('Генерация интерьеров', 'Интерьер генерациясы', 'Interior generator')}
          </h1>
          <p className="text-xs text-gray-500 max-w-xl">
            {l('Выберите комнату и стиль — а мы сами соберём идеальный запрос для AI.',
               'Бөлме мен стильді таңдаңыз — біз AI үшін сұранысты өзіміз жинаймыз.',
               'Pick a room and style — we craft the perfect AI prompt for you.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFreeMode(f => !f)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${freeMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {freeMode ? l('Wizard режим', 'Wizard режимі', 'Wizard mode') : l('Свой prompt', 'Өз prompt', 'Custom prompt')}
          </button>
          {!freeMode && (roomId || styleId) && (
            <button onClick={resetWizard} className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100">
              {l('Сбросить', 'Тазарту', 'Reset')}
            </button>
          )}
        </div>
      </div>

      {/* WIZARD */}
      {!freeMode && (
        <div className="space-y-6 mb-6">
          {/* Step 1 — Room */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] flex items-center justify-center">1</div>
              <div className="text-sm text-gray-900">{l('Какая комната?', 'Қандай бөлме?', 'Which room?')}</div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {ROOMS.map(r => {
                const Icon = r.icon;
                const active = roomId === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setRoomId(r.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                      active ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${active ? 'text-gray-900' : 'text-gray-400'}`} />
                    <span className={`text-[11px] ${active ? 'text-gray-900' : 'text-gray-600'}`}>{r.label[language]}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2 — Style */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center ${roomId ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-400'}`}>2</div>
              <div className={`text-sm ${roomId ? 'text-gray-900' : 'text-gray-400'}`}>{l('Какой стиль?', 'Қандай стиль?', 'Which style?')}</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {STYLES.map(s => {
                const active = styleId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setStyleId(s.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                      active ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <span className="text-xl">{s.emoji}</span>
                    <span className={`text-[11px] ${active ? 'text-gray-900' : 'text-gray-600'}`}>{s.label[language]}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 3 — Mood / details (optional) */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center ${styleId ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-400'}`}>3</div>
              <div className={`text-sm ${styleId ? 'text-gray-900' : 'text-gray-400'}`}>
                {l('Дополнительные акценты', 'Қосымша акценттер', 'Mood & details')} <span className="text-[11px] text-gray-400">— {l('по желанию', 'қалау бойынша', 'optional')}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {MOODS.map(m => {
                const active = moodIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMood(m.id)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] border transition-colors ${
                      active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {active && <span className="mr-1">✓</span>}{m.label[language]}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={extraText}
              onChange={e => setExtraText(e.target.value)}
              placeholder={l('Ещё что-то добавить? Например: "бежевые шторы, мраморный пол"',
                            'Тағы не қосасыз?',
                            'Anything else? e.g. "beige curtains, marble floor"')}
              className="mt-3 w-full px-3 py-2 bg-gray-50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
          </section>
        </div>
      )}

      {/* FREE PROMPT MODE */}
      {freeMode && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <label className="text-[11px] text-gray-500 block mb-2">{l('Опишите интерьер своими словами', 'Интерьерді өз сөзіңізбен сипаттаңыз', 'Describe the interior yourself')}</label>
          <textarea
            value={freePrompt}
            onChange={e => setFreePrompt(e.target.value)}
            rows={4}
            placeholder={l(
              'Например: кухня в стиле сканди, белые матовые фасады, дубовая столешница, остров с барными стульями, утренний свет из окна',
              'Мысалы: сканди стиліндегі ас үй, ақ фасадтар, емен үстелі, бар орындықтары бар арал, таңертеңгі жарық',
              'e.g. scandi-style kitchen, matte white cabinets, oak countertop, island with bar stools, morning daylight',
            )}
            className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none"
          />
        </div>
      )}

      {/* Optional photo uploads (img2img + style references). Both are
          optional — UI shows compact upload tiles with previews. */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded-full bg-gray-200 text-gray-400 text-[10px] flex items-center justify-center">📷</div>
          <div className="text-sm text-gray-900">{l('Фото комнаты и референсы', 'Бөлме фотосы мен референстер', 'Room photo & references')}</div>
          <span className="text-[11px] text-gray-400">— {l('по желанию', 'қалау бойынша', 'optional')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Room photo — single image, used as the img2img source */}
          <div className="bg-white rounded-2xl border border-gray-100 p-3">
            <div className="text-[11px] text-gray-500 mb-2">{l('Фото вашей комнаты', 'Бөлмеңіздің фотосы', 'Your room photo')}</div>
            {roomPhoto ? (
              <div className="relative">
                <img src={roomPhoto} alt="" className="w-full aspect-video object-cover rounded-xl" />
                <button onClick={() => setRoomPhoto(undefined)} className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-1 aspect-video border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-gray-300 hover:bg-gray-50/50">
                <span className="text-2xl">📷</span>
                <span className="text-[11px] text-gray-500">{l('Загрузить фото', 'Фото жүктеу', 'Upload photo')}</span>
                <input type="file" accept="image/*" onChange={onRoomFile} className="hidden" />
              </label>
            )}
            <div className="text-[10px] text-gray-400 mt-2">
              {l('AI «перерисует» вашу комнату в выбранном стиле.',
                 'AI бөлмеңізді таңдалған стильде «қайта сызады».',
                 'AI will redesign your room in the chosen style.')}
            </div>
          </div>

          {/* References — up to 3 inspiration images */}
          <div className="bg-white rounded-2xl border border-gray-100 p-3">
            <div className="text-[11px] text-gray-500 mb-2">
              {l('Референсы стиля', 'Стиль референстері', 'Style references')} <span className="text-gray-400">({referenceImages.length}/3)</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {referenceImages.map((src, i) => (
                <div key={i} className="relative">
                  <img src={src} alt="" className="w-full aspect-square object-cover rounded-lg" />
                  <button onClick={() => setReferenceImages(prev => prev.filter((_, j) => j !== i))} className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {referenceImages.length < 3 && (
                <label className="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 hover:bg-gray-50/50">
                  <span className="text-xl text-gray-400">+</span>
                  <input type="file" accept="image/*" multiple onChange={onRefsAdd} className="hidden" />
                </label>
              )}
            </div>
            <div className="text-[10px] text-gray-400 mt-2">
              {l('Несколько вдохновляющих фото — AI подхватит палитру и настроение.',
                 'Бірнеше шабыттандыратын фото — AI палитра мен көңіл-күйді алады.',
                 'A few inspiration shots — AI picks up the palette and mood.')}
            </div>
          </div>
        </div>
      </section>

      {/* Provider grid */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center ${(freeMode ? freePrompt.trim() : (roomId && styleId)) ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-400'}`}>{freeMode ? 1 : 4}</div>
          <div className="text-sm text-gray-900">{l('Каким AI генерировать?', 'Қай AI-мен генерациялау?', 'Which AI?')}</div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {providers.map(p => {
            const vis = PROVIDER_VISUAL[p.id];
            const active = selectedProvider === p.id;
            return (
              <button
                key={p.id}
                onClick={() => p.enabled && setSelectedProvider(p.id)}
                disabled={!p.enabled}
                className={`relative text-left p-3 rounded-2xl border-2 transition-all ${
                  active && p.enabled ? 'border-gray-900 shadow-sm' : 'border-gray-100 hover:border-gray-300'
                } ${!p.enabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {/* Brand logo square — real SVG for ChatGPT / Gemini / Claude.
                    UTIR-mix uses the platform logo full-bleed (fills the box). */}
                <div className={`w-10 h-10 rounded-xl ${vis.bg} flex items-center justify-center overflow-hidden mb-2 ${vis.fullBleed ? 'border border-gray-200' : ''}`}>
                  {vis.fullBleed ? vis.icon('') : vis.icon('w-6 h-6')}
                </div>
                <div className="text-xs text-gray-900">{p.name}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{vis.sub}</div>
                {!p.enabled && p.envVar && (
                  <div className="text-[10px] text-amber-700 mt-1.5 leading-snug">
                    {l('Подключите', 'Қосыңыз', 'Add env')}: <code>{p.envVar}</code>
                  </div>
                )}
                {active && p.enabled && (
                  <div className="absolute top-2 right-2 w-4 h-4 bg-gray-900 rounded-full flex items-center justify-center"><Check className="w-2.5 h-2.5 text-white" /></div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Prompt preview + Generate */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-8">
        <div className="flex items-start gap-3 mb-3">
          <Wand2 className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{l('Что отправим в AI', 'AI-ге не жібереміз', 'AI prompt')}</div>
            <div className="text-sm text-gray-700 leading-relaxed">
              {finalPrompt
                ? finalPrompt
                : <span className="text-gray-400">{l('Выберите комнату и стиль выше — prompt соберётся автоматически.',
                                                       'Жоғарыдан бөлме мен стильді таңдаңыз.',
                                                       'Pick a room and style above — prompt assembles itself.')}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-gray-400">{l('Обычно 10–60 секунд', '10–60 секунд алады', 'Usually 10–60s')}</div>
          <button
            onClick={generate}
            disabled={!canGenerate}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating
              ? l('Генерирую…', 'Генерация…', 'Generating…')
              : l('Сгенерировать', 'Генерациялау', 'Generate')}
          </button>
        </div>
      </div>

      {/* Generation results */}
      {error && <div className="mb-5 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">{error}</div>}

      {results.length > 0 && (
        <div className="mb-8">
          <div className="text-sm text-gray-700 mb-3">{l('Результат', 'Нәтиже', 'Result')}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((r, i) => (
              <div key={r.id || i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {r.ok && (r.imageUrl || r.imageDataUrl) ? (
                  <>
                    <div className="aspect-square bg-gray-50">
                      <img src={r.imageUrl || r.imageDataUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs text-gray-900 flex items-center gap-1.5">
                          <span className={`w-4 h-4 rounded ${PROVIDER_VISUAL[r.provider].bg} flex items-center justify-center overflow-hidden`}>
                            {PROVIDER_VISUAL[r.provider].icon('w-2.5 h-2.5')}
                          </span>
                          <span>{r.provider}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {r.id && (
                            <button
                              onClick={() => setAttachingId(r.id!)}
                              className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700"
                              title={l('Прикрепить к сделке', 'Мәмілеге қосу', 'Attach to deal')}
                            >
                              <LinkIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <a
                            href={r.imageUrl || r.imageDataUrl}
                            download={`utir-design-${r.provider}.png`}
                            className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                      {r.enhancedPrompt && (
                        <details className="text-[10px] text-gray-400 mt-1">
                          <summary className="cursor-pointer flex items-center gap-1"><Wand2 className="w-2.5 h-2.5" /> {l('Улучшенный prompt', 'Жақсартылған prompt', 'Enhanced prompt')}</summary>
                          <div className="mt-1 leading-relaxed">{r.enhancedPrompt}</div>
                        </details>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="p-5 text-center">
                    <X className="w-6 h-6 text-red-400 mx-auto mb-2" />
                    <div className="text-xs text-gray-700">{r.provider}</div>
                    <div className="text-[10px] text-red-600 mt-1">{r.error}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team history */}
      <div className="mt-10">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-gray-400" />
          <div className="text-sm text-gray-700">{l('История генераций команды', 'Команданың генерация тарихы', 'Team generation history')}</div>
          <span className="text-[11px] text-gray-400">· {history.length}</span>
        </div>
        {history.length === 0 ? (
          <div className="text-xs text-gray-400 py-6 text-center">{l('Пока нет генераций.', 'Әзірге генерациялар жоқ.', 'No generations yet.')}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {history.map(h => (
              <div key={h.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden group">
                <div className="aspect-square bg-gray-50 relative">
                  {h.imageUrl ? (
                    <img src={h.imageUrl} alt={h.prompt} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300"><Bot className="w-8 h-8" /></div>
                  )}
                  <button
                    onClick={() => setAttachingId(h.id)}
                    className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-opacity"
                    title={l('Прикрепить к сделке', 'Мәмілеге қосу', 'Attach to deal')}
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-2.5">
                  <div className="text-[10px] text-gray-500 flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1">
                      <span className={`w-3.5 h-3.5 rounded ${PROVIDER_VISUAL[h.provider]?.bg || 'bg-gray-100'} flex items-center justify-center overflow-hidden`}>
                        {PROVIDER_VISUAL[h.provider]?.icon('w-2 h-2') || <Bot className="w-2 h-2 text-gray-400" />}
                      </span>
                      {h.provider}
                    </span>
                    <span>{new Date(h.createdAt).toLocaleDateString(language === 'eng' ? 'en-GB' : 'ru-RU', { day: '2-digit', month: '2-digit' })}</span>
                  </div>
                  <div className="text-[11px] text-gray-700 line-clamp-2 leading-snug" title={h.prompt}>{h.prompt}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{h.userName}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attach-to-deal picker — opens when admin clicks the link icon on
          any result/history card. Lists active team deals with a quick
          search box; tapping a row attaches the generation id and closes. */}
      {attachingId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setAttachingId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-900">{l('Прикрепить к сделке', 'Мәмілеге қосу', 'Attach to deal')}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{l('Выберите сделку из списка', 'Тізімнен мәмілені таңдаңыз', 'Pick a deal from the list')}</div>
              </div>
              <button onClick={() => setAttachingId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                <input
                  type="text"
                  value={attachQuery}
                  onChange={e => setAttachQuery(e.target.value)}
                  placeholder={l('Поиск по клиенту или телефону', 'Клиент немесе телефон бойынша іздеу', 'Search by customer or phone')}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {dealsForAttach.length === 0 && (
                <div className="text-xs text-gray-400 text-center py-8">{l('Сделок не найдено', 'Мәмілелер табылмады', 'No deals found')}</div>
              )}
              {dealsForAttach.map(d => {
                const alreadyHas = (d.designIds || []).includes(attachingId);
                return (
                  <button
                    key={d.id}
                    onClick={() => attachToDeal(d.id)}
                    className={`w-full text-left p-3 rounded-xl transition-colors ${alreadyHas ? 'bg-emerald-50 border border-emerald-100' : 'hover:bg-gray-50 border border-transparent'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 truncate">{d.customerName}</div>
                        <div className="text-[10px] text-gray-400 truncate">
                          {d.phone || '—'} · {d.product || d.furnitureType || ''}
                          {(d.designIds?.length || 0) > 0 && (
                            <span className="text-emerald-600 ml-1.5">· {d.designIds!.length} концепт{d.designIds!.length === 1 ? '' : 'ов'}</span>
                          )}
                        </div>
                      </div>
                      {alreadyHas && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Toast that fades after attach. */}
      {attachToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-gray-900 text-white text-xs rounded-full shadow-lg z-50">
          ✓ {attachToast}
        </div>
      )}
    </div>
  );
}
