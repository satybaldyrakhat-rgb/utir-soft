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

export function providerStatuses(): ProviderStatus[] {
  return [
    { id: 'chatgpt',  name: 'ChatGPT (gpt-image-1)',     enabled: !!OPENAI_KEY,    envVar: 'OPENAI_API_KEY' },
    { id: 'gemini',   name: 'Gemini (nano-banana)',      enabled: !!GEMINI_KEY,    envVar: 'GEMINI_API_KEY' },
    { id: 'claude',   name: 'Claude Opus + auto-route',  enabled: !!ANTHROPIC_KEY && (!!OPENAI_KEY || !!GEMINI_KEY), envVar: 'ANTHROPIC_API_KEY' },
    { id: 'utir-mix', name: 'UTIR AI (всё сразу)',       enabled: !!OPENAI_KEY || !!GEMINI_KEY },
  ];
}

// ─── ChatGPT (OpenAI Images) ────────────────────────────────────────
async function genChatGPT(prompt: string): Promise<GenResult> {
  if (!OPENAI_KEY) {
    return { provider: 'chatgpt', ok: false, error: 'OPENAI_API_KEY не задан в Railway' };
  }
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024',
      }),
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

// ─── Gemini (Google) ─────────────────────────────────────────────────
async function genGemini(prompt: string): Promise<GenResult> {
  if (!GEMINI_KEY) {
    return { provider: 'gemini', ok: false, error: 'GEMINI_API_KEY не задан в Railway' };
  }
  try {
    // Gemini image preview model. Returns inline base64 data.
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      },
    );
    const j: any = await res.json();
    if (!res.ok) return { provider: 'gemini', ok: false, error: j?.error?.message || `HTTP ${res.status}` };
    // Walk the response for inlineData with a mimeType image/*
    const parts = j?.candidates?.[0]?.content?.parts || [];
    for (const p of parts) {
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

async function genClaude(prompt: string): Promise<GenResult> {
  if (!ANTHROPIC_KEY) {
    return { provider: 'claude', ok: false, error: 'ANTHROPIC_API_KEY не задан в Railway' };
  }
  if (!OPENAI_KEY && !GEMINI_KEY) {
    return { provider: 'claude', ok: false, error: 'Claude улучшает prompt, но нужен ещё OpenAI или Gemini для самой генерации' };
  }
  const enhanced = await enhancePromptWithClaude(prompt);
  if (!enhanced) {
    return { provider: 'claude', ok: false, error: 'Claude не смог улучшить prompt' };
  }
  // Prefer OpenAI for the actual generation (better photoreal interiors); fall
  // back to Gemini if only Gemini is configured.
  const downstream = OPENAI_KEY ? await genChatGPT(enhanced) : await genGemini(enhanced);
  return { ...downstream, provider: 'claude', enhancedPrompt: enhanced };
}

// ─── UTIR AI mix — run every available provider in parallel ─────────
async function genUtirMix(prompt: string): Promise<GenResult[]> {
  const calls: Promise<GenResult>[] = [];
  if (OPENAI_KEY) calls.push(genChatGPT(prompt));
  if (GEMINI_KEY) calls.push(genGemini(prompt));
  if (ANTHROPIC_KEY && (OPENAI_KEY || GEMINI_KEY)) calls.push(genClaude(prompt));
  if (calls.length === 0) {
    return [{ provider: 'utir-mix', ok: false, error: 'Ни один провайдер не настроен — добавьте ключи в Railway' }];
  }
  return Promise.all(calls);
}

// ─── Public entry ────────────────────────────────────────────────────
export async function generate(provider: ProviderId, prompt: string): Promise<GenResult[]> {
  if (!prompt.trim()) return [{ provider, ok: false, error: 'Опишите что нужно сгенерировать' }];
  if (provider === 'utir-mix') return genUtirMix(prompt);
  let r: GenResult;
  if (provider === 'chatgpt')      r = await genChatGPT(prompt);
  else if (provider === 'gemini')  r = await genGemini(prompt);
  else if (provider === 'claude')  r = await genClaude(prompt);
  else                              r = { provider, ok: false, error: 'unknown provider' };
  return [r];
}
