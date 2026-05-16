// AI Design page — generate interior images via ChatGPT / Gemini / Claude
// or the UTIR-mix meta-provider (runs all available in parallel).
//
// All providers go through /api/ai-design/generate on the backend, which
// fan-outs to the right HTTP endpoint based on which API keys are set in
// Railway env. Missing key → provider card shows as disabled with the env
// var name to add.

import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Download, Check, X, Bot, History, Wand2 } from 'lucide-react';
import { api } from '../utils/api';

interface AIDesignProps {
  language: 'kz' | 'ru' | 'eng';
}

type ProviderId = 'chatgpt' | 'gemini' | 'claude' | 'utir-mix';

interface ProviderStatus {
  id: ProviderId;
  name: string;
  enabled: boolean;
  envVar?: string;
}

interface GenResult {
  id?: string;
  provider: ProviderId;
  ok: boolean;
  imageUrl?: string;
  imageDataUrl?: string;
  enhancedPrompt?: string;
  error?: string;
}

interface HistoryEntry {
  id: string;
  userId: string;
  userName: string;
  provider: ProviderId;
  prompt: string;
  imageUrl: string | null;
  enhancedPrompt: string | null;
  createdAt: string;
}

// Pre-baked style / room shortcuts the admin can drop into the prompt.
const QUICK_STYLES = ['скандинавский', 'минимализм', 'лофт', 'классика', 'модерн', 'эко'];
const QUICK_ROOMS  = ['кухня', 'спальня', 'гостиная', 'детская', 'ванная', 'прихожая'];

const PROVIDER_VISUAL: Record<ProviderId, { gradient: string; icon: string; sub: string }> = {
  chatgpt:    { gradient: 'from-emerald-400 to-teal-600',   icon: '🤖', sub: 'ChatGPT · OpenAI' },
  gemini:     { gradient: 'from-blue-400 to-indigo-600',    icon: '✨', sub: 'Gemini · Google' },
  claude:     { gradient: 'from-orange-400 to-pink-600',    icon: '🎨', sub: 'Claude · Anthropic' },
  'utir-mix': { gradient: 'from-purple-500 to-fuchsia-600', icon: '🪄', sub: 'UTIR AI — все провайдеры' },
};

export function AIDesign({ language }: AIDesignProps) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [selected, setSelected] = useState<ProviderId>('utir-mix');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GenResult[]>([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Load provider statuses + history on mount and after each generation.
  const reloadAll = async () => {
    try {
      const [p, h] = await Promise.all([
        api.get<ProviderStatus[]>('/api/ai-design/providers'),
        api.get<HistoryEntry[]>('/api/ai-design/history').catch(() => [] as HistoryEntry[]),
      ]);
      setProviders(p);
      setHistory(h);
      // If the currently-selected provider got disabled (env key removed),
      // fall back to the first enabled one — utir-mix as a safe default.
      const stillEnabled = p.find(x => x.id === selected)?.enabled;
      if (!stillEnabled) {
        const next = p.find(x => x.enabled)?.id || 'utir-mix';
        setSelected(next);
      }
    } catch (e: any) {
      setError(String(e?.message || 'load failed'));
    }
  };
  useEffect(() => { void reloadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const generate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true); setError(''); setResults([]);
    try {
      const res = await api.post<{ provider: ProviderId; prompt: string; results: GenResult[] }>('/api/ai-design/generate', {
        provider: selected,
        prompt,
      });
      setResults(res.results || []);
      // Refresh history so the new entries appear at the top of the grid.
      void reloadAll();
    } catch (e: any) {
      setError(String(e?.message || 'generation failed'));
    } finally {
      setGenerating(false);
    }
  };

  const onQuickInsert = (chip: string) => {
    setPrompt(p => p ? `${p}, ${chip}` : chip);
  };

  return (
    <div className="p-4 md:p-8 max-w-[1400px]">
      <div className="mb-8">
        <p className="text-sm text-gray-400 mb-1">AI Дизайн</p>
        <h1 className="text-gray-900 mb-1">
          {l('Генерация интерьеров', 'Интерьер генерациясы', 'Interior generator')}
        </h1>
        <p className="text-xs text-gray-500 max-w-xl">
          {l('Опишите интерьер — несколько ИИ сгенерируют варианты. Сохраняются в истории команды.',
             'Интерьерді сипаттаңыз — бірнеше ИИ нұсқаларды жасайды. Команда тарихында сақталады.',
             'Describe the interior — multiple AIs generate variants. Saved to the team history.')}
        </p>
      </div>

      {/* Provider grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {providers.map(p => {
          const vis = PROVIDER_VISUAL[p.id];
          const active = selected === p.id;
          return (
            <button
              key={p.id}
              onClick={() => p.enabled && setSelected(p.id)}
              disabled={!p.enabled}
              className={`relative text-left p-4 rounded-2xl border-2 transition-all ${
                active && p.enabled ? 'border-gray-900 shadow-sm' : 'border-gray-100 hover:border-gray-300'
              } ${!p.enabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${vis.gradient} flex items-center justify-center text-lg mb-3`}>{vis.icon}</div>
              <div className="text-sm text-gray-900">{p.name}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{vis.sub}</div>
              {!p.enabled && p.envVar && (
                <div className="text-[10px] text-amber-700 mt-2 leading-snug">
                  {l('Нужно подключить', 'Қосу керек', 'Add env')}: <code>{p.envVar}</code>
                </div>
              )}
              {active && p.enabled && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Prompt input */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={l(
            'Например: кухня в стиле сканди, белые матовые фасады, дубовая столешница, остров с барными стульями, утренний свет из окна',
            'Мысалы: сканди стиліндегі ас үй, ақ фасадтар, емен үстелі, бар орындықтары бар арал, таңертеңгі жарық',
            'e.g. scandi-style kitchen, matte white cabinets, oak countertop, island with bar stools, morning daylight',
          )}
          rows={4}
          className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none"
        />

        {/* Quick chips — append to current prompt without replacing. */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {[...QUICK_ROOMS, ...QUICK_STYLES].map(chip => (
            <button
              key={chip}
              onClick={() => onQuickInsert(chip)}
              className="px-2.5 py-1 text-[11px] text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              + {chip}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="text-[11px] text-gray-400">{l('Генерация занимает 10–60 секунд', 'Генерация 10–60 сек.', 'Generation takes 10–60s')}</div>
          <button
            onClick={generate}
            disabled={!prompt.trim() || generating}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
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
              <div key={h.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden group">
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
