// Thin wrapper around the Anthropic API that the Telegram webhook calls.
// One free-form admin message in → either a chat reply, or a proposed tool
// call (with a Russian summary) that the bot must confirm with the admin
// before executing.

import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';
import tools from './aiTools.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

function buildSystemPrompt(): string {
  const today = new Date();
  const todayStr = today.toLocaleDateString('ru-RU');
  const todayISO = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return `Ты — AI-ассистент CRM-платформы Utir Soft. С тобой общается владелец / менеджер бизнеса либо через Telegram-бот, либо через попап «UTIR AI» прямо на сайте платформы. В обоих случаях ты ЗАМЕНЯЕШЬ ручную работу: пользователь пишет — ты делаешь.

ТВОЯ ЗАДАЧА: понять, что человек хочет (свободный текст), и САМ выполнить действие через инструменты. Каждое выполненное действие автоматически записывается в журнал активности — об этом не упоминай, просто делай.

ИНСТРУМЕНТЫ:
• add_deal — создать сделку (новый клиент + продажа / карточка клиента). Критические поля: customerName, amount.
• log_payment — записать оплату по существующей сделке. Критические: customerName, amount.
• update_deal_status — сменить статус сделки. Критические: customerName, status.
• add_task — создать задачу для команды. Критическое: title. dueDate подставляй сам.
• find_client — найти и показать сводку по сделке (НЕ записывает, просто отвечает).

КОГДА ЧТО ВЫЗЫВАТЬ:
- «Закрыл клиента X на Y тенге», «Создай карточку клиента X», «Заведи клиента X» → add_deal
- «X оплатил/доплатил Z тенге» → log_payment
- «X подписал договор / отказался / завершили заказ X», «X на замере / в производстве» → update_deal_status
- «Нужно сделать X к Y / напомни / поставь задачу», «созвониться с X завтра» → add_task
- «Что по X? / Сколько у Y? / Статус X? / Найди клиента X» → find_client

ПРАВИЛА ОТВЕТА:
1. Говори по-русски, коротко, по-деловому. НИКОГДА не показывай JSON или технические поля.
2. Если данных хватает для критических полей — СРАЗУ вызывай инструмент. Не переспрашивай про мелкие детали (адрес, источник, телефон) — оставь пустыми.
3. Переспрашивай ТОЛЬКО когда нет критического поля. Один-два вопроса максимум, не больше.
4. Если сообщение не относится к CRM (приветствие / болтовня / непонятно что нужно) — короткий текстовый ответ, инструмент не вызывай.
5. Платформа сама присылает резюме и просит подтверждение — тебе делать это не нужно.
6. Для статусов используй из списка: new, measured, project, production, installation, completed, rejected (выбирай ближайший по смыслу).

ДАТЫ:
- Сегодня: ${todayStr} (${todayISO})
- Завтра: ${tomorrow}
- Когда админ говорит «завтра/сегодня/в пятницу» — подставляй конкретную дату YYYY-MM-DD.

ВАЛЮТА: тенге (₸). Все суммы в KZT.`;
}


let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function isClaudeReady() { return !!process.env.ANTHROPIC_API_KEY; }

export interface AgentTurnContext {
  db: Database.Database;
  userId: string;
  userName: string;
  userText: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export type AgentResult =
  | { kind: 'reply'; text: string }
  | { kind: 'tool'; toolName: string; toolInput: any; summary: string };

export async function runAgent(ctx: AgentTurnContext): Promise<AgentResult> {
  const c = getClient();
  if (!c) {
    return { kind: 'reply', text: 'AI-ассистент пока не настроен (нет ANTHROPIC_API_KEY на сервере). Сообщите Админу.' };
  }

  // Build message list: prior turns from history (if any) + current user turn.
  // Claude needs the conversation to alternate user/assistant strictly. Dedupe consecutive
  // same-role messages just in case and ensure history ends with assistant before our user turn.
  const history = (ctx.history || []).filter(m => m.content && (m.role === 'user' || m.role === 'assistant'));
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of history) {
    // collapse repeated same-role into the last one (keeps strict alternation)
    if (messages.length && messages[messages.length - 1].role === m.role) {
      messages[messages.length - 1] = m;
    } else {
      messages.push(m);
    }
  }
  // Make sure last item is assistant before appending the user — if it's already user, replace it.
  if (messages.length && messages[messages.length - 1].role === 'user') {
    messages[messages.length - 1] = { role: 'user', content: ctx.userText };
  } else {
    messages.push({ role: 'user', content: ctx.userText });
  }

  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(),
    tools: tools.toolsForClaude() as any,
    messages: messages as any,
  });

  // Pick the first tool_use block if Claude decided to call a tool.
  const toolBlock = resp.content.find((b: any) => b.type === 'tool_use') as any;
  if (toolBlock) {
    const toolName = toolBlock.name;
    const toolInput = toolBlock.input;
    const summary = tools.summarize(toolName, toolInput);
    return { kind: 'tool', toolName, toolInput, summary };
  }

  // Otherwise concatenate all text blocks as the reply.
  const text = resp.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim() || '…';
  return { kind: 'reply', text };
}
