// ─── Instagram Direct (Meta Messenger Platform) ─────────────────────
// Исходящие: отправка текста через graph.facebook.com/<igUserId>/messages.
// Входящие: парсинг вебхука Meta (object:"instagram", entry[].messaging[]).
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

export interface InstagramConfig { pageId: string; igUserId: string; accessToken: string; }

export function instagramConfigured(c?: Partial<InstagramConfig> | null): c is InstagramConfig {
  return !!(c && c.igUserId && c.accessToken);
}

// Отправить текст пользователю Instagram (toIgsid — scoped id отправителя).
export async function sendInstagramText(cfg: InstagramConfig, toIgsid: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(cfg.igUserId)}/messages`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.accessToken}` },
      body: JSON.stringify({ recipient: { id: String(toIgsid) }, message: { text } }),
    });
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok || json?.error) return { ok: false, error: json?.error?.message || `HTTP ${resp.status}` };
    return { ok: true, id: json?.message_id };
  } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
}

export interface InboundInstagram {
  channel: 'instagram';
  recipientId: string;   // наш igUserId (для маппинга на команду)
  from: string;          // IGSID клиента
  text: string;
  msgId?: string;
  timestamp?: number;
}

// Разбирает payload вебхука Instagram в список входящих сообщений.
// Пропускаем echo (наши же исходящие) и не-текстовые события.
export function parseInboundInstagram(body: any): InboundInstagram[] {
  const out: InboundInstagram[] = [];
  if (body?.object !== 'instagram') return out;
  const entries: any[] = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const events: any[] = Array.isArray(entry?.messaging) ? entry.messaging : [];
    for (const ev of events) {
      const msg = ev?.message;
      if (!msg || msg.is_echo) continue;
      if (typeof msg.text !== 'string' || !msg.text) continue;
      out.push({
        channel: 'instagram',
        recipientId: String(ev?.recipient?.id || entry?.id || ''),
        from: String(ev?.sender?.id || ''),
        text: msg.text,
        msgId: msg.mid,
        timestamp: ev?.timestamp ? Number(ev.timestamp) : undefined,
      });
    }
  }
  return out;
}
