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
    { id: 'chatgpt',  name: 'ChatGPT (gpt-image-1)',     enabled: !!OPENAI_KEY,    envVar: 'OPENAI_API_KEY' },
    { id: 'gemini',   name: 'Gemini (nano-banana-pro)',     enabled: !!GEMINI_KEY,    envVar: 'GEMINI_API_KEY' },
    { id: 'claude',   name: 'Claude Opus + nano-banana-pro', enabled: !!ANTHROPIC_KEY && (!!OPENAI_KEY || !!GEMINI_KEY), envVar: 'ANTHROPIC_API_KEY' },
    { id: 'utir-mix', name: 'UTIR AI (всё сразу)',       enabled: !!OPENAI_KEY || !!GEMINI_KEY },
  ];
}

// ─── ChatGPT (OpenAI Images) ────────────────────────────────────────
// Text-to-image via /v1/images/generations, or image-to-image edit via
// /v1/images/edits when a room photo is provided. References are appended
// to the prompt as additional context (OpenAI's edit endpoint accepts only
// one image; the others are described in text).
async function genChatGPT(inp: GenInputs): Promise<GenResult> {
  if (!OPENAI_KEY) {
    return { provider: 'chatgpt', ok: false, error: 'OPENAI_API_KEY не задан в Railway' };
  }
  try {
    let body: any;
    let endpoint: string;
    if (inp.roomPhoto) {
      // Use the edit endpoint with the room photo as the source. multipart/form-data.
      const parts = dataUrlToParts(inp.roomPhoto);
      if (!parts) return { provider: 'chatgpt', ok: false, error: 'invalid roomPhoto data URL' };
      endpoint = 'https://api.openai.com/v1/images/edits';
      const form = new FormData();
      const buf = Buffer.from(parts.data, 'base64');
      form.append('image', new Blob([buf], { type: parts.mimeType }), 'room.png');
      form.append('model', 'gpt-image-1');
      form.append('prompt', inp.prompt);
      form.append('n', '1');
      form.append('size', '1024x1024');
      body = form;
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
    endpoint = 'https://api.openai.com/v1/images/generations';
    body = JSON.stringify({
      model: 'gpt-image-1',
      prompt: inp.prompt,
      n: 1,
      size: '1024x1024',
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

    const res = await fetch(
      // 'nano-banana-pro' = current Gemini image-preview model. Google may
      // promote it out of preview later — switch the model id here when they do.
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      },
    );
    const j: any = await res.json();
    if (!res.ok) return { provider: 'gemini', ok: false, error: j?.error?.message || `HTTP ${res.status}` };
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
        model: 'claude-opus-4-5',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content:
            'You are an interior-design prompt engineer. Take the user brief below and rewrite it ' +
            'into a single rich, English-language prompt for an image model. Keep it under 80 words. ' +
            'Include style, lighting, materials, colour palette, camera angle. Reply with only the prompt, no preface.\n\n' +
            `Brief: ${prompt}`,
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
  // 'Banana skill' — Claude prefers Gemini's nano-banana-pro for the actual
  // image generation (handles photoreal interiors well + free tier).
  // Falls back to OpenAI gpt-image-1 only if Gemini isn't configured.
  const enhancedInputs: GenInputs = { ...inp, prompt: enhanced };
  const downstream = GEMINI_KEY ? await genGemini(enhancedInputs) : await genChatGPT(enhancedInputs);
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
