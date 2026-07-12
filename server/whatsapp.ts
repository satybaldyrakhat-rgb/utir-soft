// ─── WhatsApp Business (Meta Cloud API) ──────────────────────────────
// Исходящие: отправка текста через graph.facebook.com/<phoneNumberId>/messages.
// Входящие: парсинг вебхука Meta в нормализованные сообщения.
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

export interface WhatsAppConfig { phoneNumberId: string; accessToken: string; }

export function whatsAppConfigured(c?: Partial<WhatsAppConfig> | null): c is WhatsAppConfig {
  return !!(c && c.phoneNumberId && c.accessToken);
}

// Отправить текстовое сообщение клиенту (toWaId — номер в формате wa_id, цифры).
export async function sendWhatsAppText(cfg: WhatsAppConfig, toWaId: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(cfg.phoneNumberId)}/messages`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.accessToken}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: String(toWaId).replace(/\D/g, ''), type: 'text', text: { body: text } }),
    });
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok || json?.error) return { ok: false, error: json?.error?.message || `HTTP ${resp.status}` };
    return { ok: true, id: json?.messages?.[0]?.id };
  } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
}

export interface InboundMessage {
  channel: 'whatsapp';
  phoneNumberId: string;   // наш номер (для маппинга на команду)
  from: string;            // wa_id клиента
  name?: string;           // имя из профиля
  text: string;
  msgId?: string;
  timestamp?: number;
}

// Разбирает payload вебхука WhatsApp в список входящих сообщений.
export function parseInboundWhatsApp(body: any): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries: any[] = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const ch of changes) {
      const value = ch?.value;
      if (!value || ch.field !== 'messages') continue;
      const phoneNumberId = value?.metadata?.phone_number_id;
      const contacts: any[] = Array.isArray(value?.contacts) ? value.contacts : [];
      const nameByWaId = new Map<string, string>();
      for (const c of contacts) if (c?.wa_id) nameByWaId.set(c.wa_id, c?.profile?.name || '');
      const messages: any[] = Array.isArray(value?.messages) ? value.messages : [];
      for (const m of messages) {
        if (m.type !== 'text' || !m.text?.body) continue;
        out.push({
          channel: 'whatsapp',
          phoneNumberId,
          from: m.from,
          name: nameByWaId.get(m.from) || undefined,
          text: m.text.body,
          msgId: m.id,
          timestamp: m.timestamp ? Number(m.timestamp) : undefined,
        });
      }
    }
  }
  return out;
}
