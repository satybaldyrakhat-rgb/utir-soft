// AI image generation — provider abstraction.
//
// Four "providers" exposed to the platform:
//   1. chatgpt   → OpenAI gpt-image-1 / DALL·E 3 (env: OPENAI_API_KEY)
//   2. gemini    → Google Gemini image preview   (env: GEMINI_API_KEY)
//   3. claude    → Anthropic Opus (no native image gen — it enhances the
//                  prompt and routes through whichever image provider is
//                  available). Env: ANTHROPIC_API_KEY.
//   4. utir-mix  → meta-provider: runs ALL available providers in parallel
//                  and returns every successful image so the admin can pick.
//
// Missing API keys → that provider returns ok:false with a friendly reason
// instead of crashing the request, so the UI can show 'Подключите ключ X
// в Railway' next to the disabled provider.
//
// All real network calls are wrapped with try/catch — a flaky upstream never
// blocks the originating /api/ai-design/generate request from responding.

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

export type ProviderId = 'chatgpt' | 'gemini' | 'claude' | 'utir-mix';

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  enabled: boolean;
  envVar?: string;
}

export interface GenResult {
  provider: ProviderId;
  ok: boolean;
  imageUrl?: string;
  // Some providers (Gemini) return base64; we surface it as data URL.
  imageDataUrl?: string;
  error?: string;
  // Claude — surfaces the enhanced prompt it crafted before routing.
  enhancedPrompt?: string;
}

// Optional input images for image-to-image flows. Each entry is a
// data URL (data:image/...;base64,...). roomPhoto = primary subject
// the AI should redesign. references = inspiration / mood boards.
export interface GenInputs {
  prompt: string;
  roomPhoto?: string;
  referenceImages?: string[];
}

// Helper: split 'data:image/png;base64,XXX' into { mimeType, data }.
function dataUrlToParts(dataUrl: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

export function providerStatuses(): ProviderStatus[] {
  return [
    { id: 'chatgpt',  name: 'ChatGPT (gpt-image-1, HD)',  enabled: !!OPENAI_KEY,    envVar: 'OPENAI_API_KEY' },
    { id: 'gemini',   name: 'Gemini (nano-banana-pro)',   enabled: !!GEMINI_KEY,    envVar: 'GEMINI_API_KEY' },
    { id: 'claude',   name: 'Claude Opus + gpt-image-1',  enabled: !!ANTHROPIC_KEY && (!!OPENAI_KEY || !!GEMINI_KEY), envVar: 'ANTHROPIC_API_KEY' },
    { id: 'utir-mix', name: 'UTIR AI (всё сразу)',        enabled: !!OPENAI_KEY || !!GEMINI_KEY },
  ];
}

// ─── ChatGPT (OpenAI Images) — gpt-image-1, highest quality ─────────
// We use OpenAI's most recent image model (gpt-image-1, GA April 2025)
// with the «high» quality tier — paid, ~$0.17/image at 1536x1024 but
// produces the cleanest interior renderings. There is no gpt-image-2
// yet (as of May 2026); when it ships we just need to change the model
// id below.
//
// Defaults tuned for furniture/interior design renderings:
//   • size       1536x1024 — landscape, matches how rooms are framed
//   • quality    'high'    — sharpest detail, best for showing clients
//   • format     png       — lossless; client downscales for thumbnails
async function genChatGPT(inp: GenInputs): Promise<GenResult> {
  if (!OPENAI_KEY) {
    return { provider: 'chatgpt', ok: false, error: 'OPENAI_API_KEY не задан в Railway' };
  }
  try {
    const MODEL = 'gpt-image-1';
    const SIZE = '1536x1024';
    const QUALITY = 'high';
    if (inp.roomPhoto) {
      // Image-to-image edit. multipart/form-data with the room photo as
      // the base canvas and the prompt describing the transformation.
      const parts = dataUrlToParts(inp.roomPhoto);
      if (!parts) return { provider: 'chatgpt', ok: false, error: 'invalid roomPhoto data URL' };
      const endpoint = 'https://api.openai.com/v1/images/edits';
      const form = new FormData();
      const buf = Buffer.from(parts.data, 'base64');
      // OpenAI accepts image/jpeg, image/png, image/webp only. Relabel
      // anything else as png so the API doesn't reject. The client
      // canvas re-encodes uploads, so this is a last-line safety net.
      const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
      const mimeType = ALLOWED.has(parts.mimeType) ? parts.mimeType : 'image/png';
      const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
      form.append('image', new Blob([buf], { type: mimeType }), `room.${ext}`);
      form.append('model', MODEL);
      form.append('prompt', inp.prompt);
      form.append('n', '1');
      form.append('size', SIZE);
      form.append('quality', QUALITY);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_KEY}` },
        body: form,
      });
      const j: any = await res.json();
      if (!res.ok) return { provider: 'chatgpt', ok: false, error: j?.error?.message || `HTTP ${res.status}` };
      const url = j?.data?.[0]?.url;
      const b64 = j?.data?.[0]?.b64_json;
      if (url) return { provider: 'chatgpt', ok: true, imageUrl: url };
      if (b64) return { provider: 'chatgpt', ok: true, imageDataUrl: `data:image/png;base64,${b64}` };
      return { provider: 'chatgpt', ok: false, error: 'no image in response' };
    }
    // Plain text-to-image.
    const endpoint = 'https://api.openai.com/v1/images/generations';
    const body = JSON.stringify({
      model: MODEL,
      prompt: inp.prompt,
      n: 1,
      size: SIZE,
      quality: QUALITY,
      output_format: 'png',
    });
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    const j: any = await res.json();
    if (!res.ok) return { provider: 'chatgpt', ok: false, error: j?.error?.message || `HTTP ${res.status}` };
    const url = j?.data?.[0]?.url;
    const b64 = j?.data?.[0]?.b64_json;
    if (url) return { provider: 'chatgpt', ok: true, imageUrl: url };
    if (b64) return { provider: 'chatgpt', ok: true, imageDataUrl: `data:image/png;base64,${b64}` };
    return { provider: 'chatgpt', ok: false, error: 'no image in response' };
  } catch (e: any) {
    return { provider: 'chatgpt', ok: false, error: String(e?.message || e) };
  }
}

// ─── Gemini (Google) nano-banana-pro ────────────────────────────────
// Naturally multimodal: room photo + N references go in as inlineData parts
// alongside the prompt. Returns inline base64 image.
async function genGemini(inp: GenInputs): Promise<GenResult> {
  if (!GEMINI_KEY) {
    return { provider: 'gemini', ok: false, error: 'GEMINI_API_KEY не задан в Railway' };
  }
  try {
    const parts: any[] = [];
    if (inp.roomPhoto) {
      const p = dataUrlToParts(inp.roomPhoto);
      if (p) parts.push({ inlineData: p });
    }
    for (const ref of inp.referenceImages || []) {
      const p = dataUrlToParts(ref);
      if (p) parts.push({ inlineData: p });
    }
    // Add textual hint when images are present so the model knows what they are.
    const hint = inp.roomPhoto
      ? 'Используй первое изображение как исходную комнату; ' +
        ((inp.referenceImages?.length || 0) > 0 ? 'остальные изображения как референсы стиля. ' : '')
      : ((inp.referenceImages?.length || 0) > 0 ? 'Используй изображения как референсы стиля. ' : '');
    parts.push({ text: hint + inp.prompt });

    // Model fallback chain — newest «Nano Banana 2» first, then the
    // original Nano Banana, then older snapshots. Order based on Google's
    // March 2026 state (gemini-3-pro-image-preview was shut down → we
    // skip it). If 3.1 hits a 404 (Google rotates names) we roll to 2.5
    // automatically, so the integration survives Google's churn.
    const MODEL_CANDIDATES = [
      'gemini-3.1-flash-image-preview',  // Nano Banana 2 — newest, up to 4K, 14 aspect ratios
      'gemini-2.5-flash-image',           // Nano Banana original — stable GA
      'gemini-2.5-flash-image-preview',   // old preview alias (kept as safety net)
      'gemini-2.0-flash-exp-image-generation',
    ];
    let res: Response | null = null;
    let j: any = null;
    let lastError = '';
    let lastWasQuota = false;
    for (const model of MODEL_CANDIDATES) {
      const generationConfig: any = {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: '16:9',
          imageSize: '2K',
        },
      };
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig,
          }),
        },
      );
      j = await res.json();
      if (res.ok) break;
      const msg = j?.error?.message || `HTTP ${res.status}`;
      lastError = msg;
      // Roll to the next candidate when:
      //   - 404 / «not found» — model name retired
      //   - 429 / quota exceeded — Gemini tracks quotas per-model on the
      //     free tier, so 3.1 being empty doesn't mean 2.5 is empty.
      //     Trying the older model can succeed.
      const isNotFound = res.status === 404 || /not found|is not supported for generateContent/i.test(msg);
      const isQuota    = res.status === 429 || /quota|rate limit|resource_exhausted/i.test(msg);
      lastWasQuota = isQuota;
      if (!isNotFound && !isQuota) break;
    }
    if (!res || !res.ok) {
      // Pretty-print the most common error so the UI doesn't dump a 200-char
      // Google JSON paragraph. Quota gets the friendliest message because
      // it's the most common one users hit on the free tier.
      const friendly = lastWasQuota
        ? 'Free-tier лимит Google Gemini исчерпан. Подождите минуту или подключите платный тариф в Google AI Studio.'
        : lastError || 'Gemini временно недоступен';
      return { provider: 'gemini', ok: false, error: friendly };
    }
    const out = j?.candidates?.[0]?.content?.parts || [];
    for (const p of out) {
      const inline = p?.inlineData;
      if (inline?.data && /^image\//.test(inline?.mimeType || '')) {
        return { provider: 'gemini', ok: true, imageDataUrl: `data:${inline.mimeType};base64,${inline.data}` };
      }
    }
    return { provider: 'gemini', ok: false, error: 'no image in response' };
  } catch (e: any) {
    return { provider: 'gemini', ok: false, error: String(e?.message || e) };
  }
}

// ─── Claude — prompt enhancer + auto-route to an image provider ─────
// Acts as a Creative Director for the image model. Constructs a prompt
// using Google's officially validated 5-component formula (Subject +
// Action + Location/Context + Composition + Style/Lighting) instead
// of comma-separated keywords. Pattern adapted from the banana-claude
// project (AgriciDaniel/banana-claude) — aligned with Google's March
// 2026 «Ultimate Prompting Guide» for Gemini image models.
async function enhancePromptWithClaude(prompt: string): Promise<string | null> {
  if (!ANTHROPIC_KEY) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Latest flagship — Opus 4.8 (1M context). Prompt enhancement
        // benefits from the smartest model since it shapes every
        // downstream image.
        model: 'claude-opus-4-8',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            'You are a Creative Director constructing prompts for the Gemini',
            'image model. Take the Russian/Kazakh interior-design brief below',
            'and rewrite it into a single rich English narrative paragraph',
            'using Google\'s 5-component formula. Write as flowing natural',
            'prose, NEVER as comma-separated keyword lists. Total length:',
            '70-120 words.',
            '',
            'The 5 components (in order, woven into a single paragraph):',
            '  1. SUBJECT — the primary focus (room type), with specific',
            '     materials, finishes, age, character',
            '  2. ACTION / STATE — arrangement, what is present in the scene',
            '  3. LOCATION / CONTEXT — apartment vs house, city, time of day,',
            '     atmospheric conditions, view from windows',
            '  4. COMPOSITION — camera perspective and framing (e.g. wide',
            '     three-quarter shot, eye-level, slight low angle)',
            '  5. STYLE & LIGHTING — reference real cameras (Canon EOS R5,',
            '     Sony A7 IV), publication style (Architectural Digest,',
            '     Dezeen, Dwell editorial), film stock, and explicit lighting',
            '     (e.g. soft directional morning light from camera-left,',
            '     warm interior lamps for fill, gentle Rembrandt on textures)',
            '',
            'BANNED keywords (do not use): "photorealistic", "8K", "4K",',
            '"masterpiece", "highly detailed", "ultra realistic". They make',
            'Gemini worse, not better — describe specific cameras and light',
            'instead.',
            '',
            'Reply with ONLY the enhanced prompt paragraph, no preface, no',
            'list, no explanation.',
            '',
            `Brief: ${prompt}`,
          ].join('\n'),
        }],
      }),
    });
    const j: any = await res.json();
    if (!res.ok) return null;
    const txt = j?.content?.[0]?.text?.trim();
    return txt || null;
  } catch { return null; }
}

async function genClaude(inp: GenInputs): Promise<GenResult> {
  if (!ANTHROPIC_KEY) {
    return { provider: 'claude', ok: false, error: 'ANTHROPIC_API_KEY не задан в Railway' };
  }
  if (!OPENAI_KEY && !GEMINI_KEY) {
    return { provider: 'claude', ok: false, error: 'Claude улучшает prompt, но нужен ещё OpenAI или Gemini для самой генерации' };
  }
  const enhanced = await enhancePromptWithClaude(inp.prompt);
  if (!enhanced) {
    return { provider: 'claude', ok: false, error: 'Claude не смог улучшить prompt' };
  }
  // Claude routes to OpenAI's gpt-image-1 (HD) when available — the paid
  // OpenAI model produces the sharpest interior renderings. Falls back
  // to Gemini's nano-banana-pro if OpenAI isn't configured (free tier
  // friendly).
  const enhancedInputs: GenInputs = { ...inp, prompt: enhanced };
  const downstream = OPENAI_KEY ? await genChatGPT(enhancedInputs) : await genGemini(enhancedInputs);
  return { ...downstream, provider: 'claude', enhancedPrompt: enhanced };
}

// ─── UTIR AI mix — run every available provider in parallel ─────────
async function genUtirMix(inp: GenInputs): Promise<GenResult[]> {
  const calls: Promise<GenResult>[] = [];
  if (OPENAI_KEY) calls.push(genChatGPT(inp));
  if (GEMINI_KEY) calls.push(genGemini(inp));
  if (ANTHROPIC_KEY && (OPENAI_KEY || GEMINI_KEY)) calls.push(genClaude(inp));
  if (calls.length === 0) {
    return [{ provider: 'utir-mix', ok: false, error: 'Ни один провайдер не настроен — добавьте ключи в Railway' }];
  }
  return Promise.all(calls);
}

// ─── Public entry ────────────────────────────────────────────────────
export async function generate(provider: ProviderId, inp: GenInputs): Promise<GenResult[]> {
  if (!inp.prompt.trim()) return [{ provider, ok: false, error: 'Опишите что нужно сгенерировать' }];
  if (provider === 'utir-mix') return genUtirMix(inp);
  let r: GenResult;
  if (provider === 'chatgpt')      r = await genChatGPT(inp);
  else if (provider === 'gemini')  r = await genGemini(inp);
  else if (provider === 'claude')  r = await genClaude(inp);
  else                              r = { provider, ok: false, error: 'unknown provider' };
  return [r];
}
