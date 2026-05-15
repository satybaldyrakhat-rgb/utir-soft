// Thin wrapper around the Anthropic API that the Telegram webhook calls.
// One free-form admin message in → either a chat reply, or a proposed tool
// call (with a Russian summary) that the bot must confirm with the admin
// before executing.

import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';
import tools from './aiTools.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const SYSTEM_PROMPT = `Ты — AI-ассистент CRM-платформы Utir Soft. С тобой общается Админ (владелец бизнеса) через Telegram.

ТВОЯ ЗАДАЧА: понять, что произошло (свободный текст), и САМ обновить CRM через инструменты.

ПРАВИЛА:
1. НИКОГДА не показывай админу JSON, технические поля или внутренние термины. Говори по-русски, коротко, по-деловому.
2. Если в сообщении есть достаточно данных для действия — сразу вызывай инструмент. НЕ переспрашивай про мелкие детали (адрес, источник, дата) — оставь их пустыми.
3. ОБЯЗАТЕЛЬНО переспроси, если КРИТИЧЕСКОГО поля нет:
   - для add_deal критические поля: customerName и amount
4. Если поля есть — вызывай инструмент. Платформа сама покажет админу резюме и попросит подтвердить — тебе не нужно это делать.
5. Если сообщение не похоже на действие в CRM (просто вопрос / приветствие / болтовня) — отвечай текстом, кратко.
6. Если админ говорит «отмени», «не надо», «стой» — отвечай текстом, инструмент не вызывай.

Сейчас дата: ${new Date().toLocaleDateString('ru-RU')}. Валюта по умолчанию — тенге (₸).`;

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
}

export type AgentResult =
  | { kind: 'reply'; text: string }
  | { kind: 'tool'; toolName: string; toolInput: any; summary: string };

export async function runAgent(ctx: AgentTurnContext): Promise<AgentResult> {
  const c = getClient();
  if (!c) {
    return { kind: 'reply', text: 'AI-ассистент пока не настроен (нет ANTHROPIC_API_KEY на сервере). Сообщите Админу.' };
  }

  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: tools.toolsForClaude() as any,
    messages: [{ role: 'user', content: ctx.userText }],
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
