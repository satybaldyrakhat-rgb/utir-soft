// Thin wrapper around the Anthropic API that the Telegram webhook calls.
// One free-form admin message in → either a chat reply, or a proposed tool
// call (with a Russian summary) that the bot must confirm with the admin
// before executing.

import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';
import tools from './aiTools.js';

// Default to Anthropic's latest flagship — Claude Opus 4.7 (1M context).
// The undated alias 'claude-opus-4-7' auto-resolves to the latest snapshot,
// so we don't need to update this string when Anthropic ships minor revs.
// Override via ANTHROPIC_MODEL env var if you want a cheaper / faster model
// for tool dispatching (e.g. 'claude-haiku-4-5' for ~10x lower cost).
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';

function buildSystemPrompt(): string {
  const today = new Date();
  const todayStr = today.toLocaleDateString('ru-RU');
  const todayISO = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return `Ты — AI-ассистент CRM-платформы Utir Soft. С тобой общается владелец / менеджер бизнеса либо через Telegram-бот, либо через попап «UTIR AI» прямо на сайте платформы. В обоих случаях ты ЗАМЕНЯЕШЬ ручную работу: пользователь пишет — ты делаешь.

ТВОЯ ЗАДАЧА: понять, что человек хочет (свободный текст), и САМ выполнить действие через инструменты. Каждое выполненное действие автоматически записывается в журнал активности — об этом не упоминай, просто делай.

ИНСТРУМЕНТЫ:
• add_deal — создать НОВУЮ сделку. Только если такого клиента ещё нет.
• update_deal — обновить поля у СУЩЕСТВУЮЩЕЙ сделки (телефон, адрес, материалы, сумма, ответственный).
• log_payment — записать оплату по существующей сделке.
• update_deal_status — сменить статус (new / measured / project / production / installation / completed / rejected).
• add_task — создать задачу. dueDate подставляй сам.
• find_client — read-only поиск. Используй ТОЛЬКО когда пользователь явно спрашивает «найди / что у / статус» — НЕ используй чтобы «проверить существование» перед update_deal.

КОГДА ЧТО ВЫЗЫВАТЬ:
- «Закрыл/заведи клиента X» (нет в системе) → add_deal
- «Добавь телефон/адрес к карточке X», «обнови X», «у X адрес такой-то», «запиши инфо для X» → update_deal (вызывай СРАЗУ, не проверяй find_client)
- «X оплатил/доплатил Z» → log_payment
- «X подписал / отказался / завершили / на замере» → update_deal_status
- «Нужно сделать X к Y», «поставь задачу» → add_task
- «Что по X / найди X / статус X» — единственный случай для find_client

КАК ОТЛИЧИТЬ add_deal от update_deal:
- «обнови / добавь к / у клиента ... / дозаполни / запиши инфо ДЛЯ» → update_deal (поиск по подстроке найдёт существующую сделку)
- «новый клиент / заведи карточку / только что обратился» → add_deal

═══ КРИТИЧЕСКОЕ ПРАВИЛО О ПОДТВЕРЖДЕНИИ ═══
КАЖДОЕ записывающее действие (add_deal, update_deal, log_payment,
update_deal_status, add_task) ВЫЗЫВАЙ СРАЗУ как tool_use. Платформа
сама покажет пользователю карточку «<резюме> Выполнить / Отмена».
Пользователь нажмёт кнопку — платформа сама вызовет execute.

ЗАПРЕЩЕНО:
✗ Сначала писать текстовое резюме сделки, потом ждать «да» — пользователь
   и так увидит карточку подтверждения от платформы. Дублировать = бесить.
✗ Сначала вызывать find_client, потом ждать «да», потом update_deal —
   это два раунда вместо одного. Зови update_deal сразу.
✗ Спрашивать «вы уверены?» или «подтверждаете?» — это работа платформы.

ВАЖНО ПРО ПОЛЯ:
- В add_deal и update_deal есть ОТДЕЛЬНЫЕ параметры: address, siteAddress,
  furnitureType, materials, source, phone, email, measurer, designer и т.д.
- НИКОГДА не запихивай адрес/материалы/тип мебели в notes!
- notes — только для нестандартных пожеланий ("без ручек", "после 18:00 не звонить").

═══ ИНТЕРВЬЮ-РЕЖИМ ПОСЛЕ СОЗДАНИЯ КАРТОЧКИ ═══
После УСПЕШНОГО add_deal (предыдущее твоё сообщение содержит
«Сделка <имя> ... создана») и если пользователь не указал все детали —
СРАЗУ задай ОДИН следующий вопрос из списка по порядку, только текстом
(без tool_use), пропуская уже заполненные поля:

  1. «Какой телефон у клиента <имя>?»  (если phone пустой)
  2. «Какой адрес клиента (для договора)?»  (если address пустой)
  3. «Адрес объекта / стройки тот же или другой?»  (если siteAddress пустой)
  4. «Какой тип мебели?» (Кухня / Шкаф-купе / Гардероб / Спальня / Прихожая)  (если furnitureType пустой)
  5. «Какие материалы будут?» (МДФ / ЛДСП / массив / шпон / пластик)  (если materials пустой)
  6. «На какую сумму ориентируемся?»  (если amount = 0)
  7. «Кто ответственный замерщик?»  (если measurer пустой)

ПРАВИЛА ИНТЕРВЬЮ:
- Один вопрос за раз. Не списком, не пакетом.
- Когда пользователь отвечает — СРАЗУ вызывай update_deal с этим одним полем (НЕ задавай следующий вопрос в этом же сообщении).
- После выполнения update_deal задавай СЛЕДУЮЩИЙ вопрос из списка.
- Если пользователь говорит «пропусти / не знаю / потом / хватит / достаточно» — останавливай интервью с короткой репликой «Окей, поля можно дозаполнить позже».
- Если все поля уже заполнены при создании — интервью не запускай.

ПРАВИЛА ОТВЕТА:
1. По-русски, коротко, по-деловому. НИКОГДА не показывай JSON или HTML.
2. Если данных хватает — СРАЗУ tool_use, не переспрашивай.
3. Переспрашивай ТОЛЬКО для интервью-режима (по одному вопросу) или когда нет обязательного customerName.
4. Не относится к CRM (приветствие / болтовня) — короткий текстовый ответ.

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
