// Email delivery helper. Two modes:
//   1. Production: RESEND_API_KEY env var set → POST to api.resend.com.
//      We use Resend because it needs nothing more than a single fetch call
//      (no nodemailer dependency, no SMTP config), has a free tier, and
//      reports status synchronously.
//   2. Dev: no API key → log to console and return ok=false so callers can
//      still surface the code on-screen as a fallback.
//
// Other providers (SES, SendGrid, Mailgun, plain SMTP via nodemailer) are
// trivial drop-ins later — change `dispatch` and keep the public API.

const FROM_DEFAULT = process.env.EMAIL_FROM || 'Utir Soft <onboarding@resend.dev>';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

export function isEmailReady(): boolean {
  return !!RESEND_API_KEY;
}

export interface SendResult {
  ok: boolean;
  // Dev mode reason (e.g. 'no_provider') or upstream error message.
  reason?: string;
}

export async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<SendResult> {
  if (!RESEND_API_KEY) {
    // Dev fallback — log so the developer can copy the body from Railway logs.
    console.log(`[email DEV] would send to=${to}\n  subject=${subject}\n  ${text || html.replace(/<[^>]+>/g, ' ').slice(0, 200)}`);
    return { ok: false, reason: 'no_provider' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_DEFAULT,
        to: [to],
        subject,
        html,
        text: text || html.replace(/<[^>]+>/g, ' '),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[email] resend failed', res.status, body.slice(0, 200));
      return { ok: false, reason: `resend_${res.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    console.warn('[email] dispatch threw', e?.message || e);
    return { ok: false, reason: 'dispatch_error' };
  }
}

// ─── Templates ────────────────────────────────────────────────────
// Plain HTML; keeps things working everywhere from Gmail to Outlook to Apple
// Mail. No external CSS / images / fonts — most email clients strip them.

export function otpTemplate(code: string, productName = 'Utir Soft'): { subject: string; html: string; text: string } {
  return {
    subject: `Ваш код подтверждения ${productName}: ${code}`,
    text: `Код подтверждения: ${code}\n\nКод действует 10 минут.`,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111;">
        <h2 style="margin: 0 0 12px;">Подтверждение email</h2>
        <p style="color: #555; line-height: 1.5;">Введите этот код на странице регистрации в ${productName}:</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; padding: 16px 24px; background: #f5f5f5; border-radius: 12px; text-align: center; margin: 16px 0;">
          ${code}
        </div>
        <p style="color: #999; font-size: 12px;">Код действует 10 минут. Если вы не запрашивали — просто проигнорируйте это письмо.</p>
      </div>
    `,
  };
}

export function inviteTemplate(inviter: string, company: string | undefined, role: string, link: string): { subject: string; html: string; text: string } {
  const where = company ? `команду «${company}»` : 'команду';
  return {
    subject: `${inviter} приглашает вас в ${where} на Utir Soft`,
    text: `${inviter} приглашает вас присоединиться к ${where} на платформе Utir Soft (роль: ${role}).\n\nЧтобы зарегистрироваться, откройте ссылку:\n${link}\n\nСсылка действует 7 дней.`,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #111;">
        <h2 style="margin: 0 0 12px;">Приглашение в команду</h2>
        <p style="color: #444; line-height: 1.5;">
          <b>${inviter}</b> приглашает вас присоединиться к ${where} на платформе <b>Utir Soft</b>.
        </p>
        <p style="color: #555; line-height: 1.5;">Роль: <b>${role}</b></p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 12px; font-weight: 500;">
            Принять приглашение
          </a>
        </p>
        <p style="color: #888; font-size: 12px; line-height: 1.4;">Если кнопка не работает, скопируйте ссылку:<br><span style="word-break: break-all;">${link}</span></p>
        <p style="color: #aaa; font-size: 11px; margin-top: 24px;">Ссылка действует 7 дней. Если вы не ждали приглашения — проигнорируйте это письмо.</p>
      </div>
    `,
  };
}
