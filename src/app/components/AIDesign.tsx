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
  CookingPot, BedDouble, Sofa, Bath, Baby, DoorOpen,
} from 'lucide-react';
import { api } from '../utils/api';

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

const PROVIDER_VISUAL: Record<ProviderId, { gradient: string; icon: string; sub: string }> = {
  chatgpt:    { gradient: 'from-emerald-400 to-teal-600',   icon: '🤖', sub: 'ChatGPT · OpenAI' },
  gemini:     { gradient: 'from-blue-400 to-indigo-600',    icon: '✨', sub: 'Gemini · Google' },
  claude:     { gradient: 'from-orange-400 to-pink-600',    icon: '🍌', sub: 'Claude prompt → nano-banana' },
  'utir-mix': { gradient: 'from-purple-500 to-fuchsia-600', icon: '🪄', sub: 'UTIR AI — все провайдеры' },
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
      });
      setResults(res.results || []);
      void reloadAll();
    } catch (e: any) {
      setError(String(e?.message || 'generation failed'));
    } finally {
      setGenerating(false);
    }
  };

  const resetWizard = () => { setRoomId(''); setStyleId(''); setMoodIds([]); setExtraText(''); setResults([]); };

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
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${vis.gradient} flex items-center justify-center text-base mb-2`}>{vis.icon}</div>
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
                          <span>{PROVIDER_VISUAL[r.provider].icon}</span>
                          <span>{r.provider}</span>
                        </div>
                        <a
                          href={r.imageUrl || r.imageDataUrl}
                          download={`utir-design-${r.provider}.png`}
                          className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
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
              <div key={h.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="aspect-square bg-gray-50 relative">
                  {h.imageUrl ? (
                    <img src={h.imageUrl} alt={h.prompt} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300"><Bot className="w-8 h-8" /></div>
                  )}
                </div>
                <div className="p-2.5">
                  <div className="text-[10px] text-gray-500 flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1"><span>{PROVIDER_VISUAL[h.provider]?.icon || '🤖'}</span> {h.provider}</span>
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
    </div>
  );
}
