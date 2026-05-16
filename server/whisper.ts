// OpenAI Whisper integration — speech-to-text used by:
//   1. AI Assistant popup (mic button → record audio → POST data URL)
//   2. Telegram bot (voice messages → getFile binary → transcribe)
//
// Whisper handles Russian and Kazakh well out of the box. We pass
// `language: 'ru'` as a hint but Whisper auto-detects fine without it.
// Returns just the transcribed text — caller decides what to do with it.

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

export function isWhisperReady() { return !!OPENAI_KEY; }

export interface TranscribeResult {
  ok: boolean;
  text?: string;
  language?: string;
  error?: string;
}

// Convert a data URL ('data:audio/webm;base64,XXX' OR
// 'data:audio/webm;codecs=opus;base64,XXX') into { mime, buf }.
//
// We can't use a single-segment regex because browser MediaRecorder
// produces MIME types with extra parameters (codecs=opus). Split on the
// literal ';base64,' marker instead — the left side is everything between
// 'data:' and ';base64,', including any parameters; the right side is the
// raw base64 payload.
export function parseAudioDataUrl(dataUrl: string): { mime: string; buf: Buffer } | null {
  if (!dataUrl.startsWith('data:')) return null;
  const marker = ';base64,';
  const idx = dataUrl.indexOf(marker);
  if (idx === -1) return null;
  const mime = dataUrl.slice(5, idx); // strip 'data:' prefix
  const b64  = dataUrl.slice(idx + marker.length);
  if (!mime || !b64) return null;
  try {
    return { mime, buf: Buffer.from(b64, 'base64') };
  } catch { return null; }
}

// Map a mime type to the filename extension Whisper expects (it looks at the
// extension, not the Content-Type, to pick a decoder).
function extForMime(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg'))  return 'ogg';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('mp3'))  return 'mp3';
  if (mime.includes('mp4'))  return 'mp4';
  if (mime.includes('m4a'))  return 'm4a';
  if (mime.includes('wav'))  return 'wav';
  if (mime.includes('flac')) return 'flac';
  // Telegram's voice notes are 'audio/ogg; codecs=opus' → caught above.
  return 'webm';
}

// Core transcription call. Caller passes the raw audio buffer + its MIME.
// Returns { ok, text } or { ok: false, error }. Never throws.
export async function transcribeAudio(buf: Buffer, mime: string, languageHint?: string): Promise<TranscribeResult> {
  if (!OPENAI_KEY) return { ok: false, error: 'OPENAI_API_KEY не задан в Railway' };
  // Sanity: cap at ~25MB (Whisper limit) so we don't waste a roundtrip.
  if (buf.length > 25 * 1024 * 1024) return { ok: false, error: 'audio слишком большой (макс 25МБ)' };
  if (buf.length === 0) return { ok: false, error: 'пустое аудио' };
  try {
    const form = new FormData();
    const ext = extForMime(mime);
    // Buffer → Uint8Array so the BlobPart type matches under strict TS.
    form.append('file', new Blob([new Uint8Array(buf)], { type: mime }), `voice.${ext}`);
    form.append('model', 'whisper-1');
    // Hint helps with short / accented clips; safe to skip and let
    // Whisper auto-detect for mixed Kazakh + Russian conversations.
    if (languageHint) form.append('language', languageHint);
    // verbose_json returns detected language too — handy for the UI.
    form.append('response_format', 'verbose_json');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: form,
    });
    const j: any = await res.json();
    if (!res.ok) return { ok: false, error: j?.error?.message || `HTTP ${res.status}` };
    const text = String(j?.text || '').trim();
    if (!text) return { ok: false, error: 'Whisper вернул пустой текст — попробуйте ещё раз громче.' };
    return { ok: true, text, language: j?.language };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
