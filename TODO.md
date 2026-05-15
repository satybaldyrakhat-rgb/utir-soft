# Utir Soft — TODO / состояние работы

_Обновлено: 2026-05-15_

Короткое резюме перед /compact, чтобы не потерять контекст между сессиями.

---

## 1. Что уже сделали в этой сессии

- **Блок A — Auth**: signup с обязательными полями (email, password, name, company), верификация email через on-screen код, страницы Terms / Privacy, чекбокс согласия.
- **Блок B.1 — Modules**: исправили toggle / save / feedback.
- **Блок B.2 — Custom module constructor**: конструктор модулей (name / icon / fields / permissions). В `ModulesSettings.tsx` добавлены Edit/Trash для кастомных модулей и кнопка открытия ModuleBuilder.
- **Блок C.1 — Roles**: упростили до `admin / manager / employee`.
- **Блок D — Activity Log**: админ-only, фильтры, CSV-экспорт. Перенесён ВНУТРЬ Settings как вкладка.
- **Блок E — Split AI**: Client messenger AI ↔ Platform AI assistant. Попап на платформе возвращён по запросу.
- **Блок F.1 — Telegram bot + Claude foundation**: webhook, pairing через 6-символьные коды, free-form text → tool → подтверждение → запись в CRM. Бот @utirsoftbot настроен.
- **Блок F.2 — Доп. AI-инструменты**: `add_deal`, `log_payment`, `update_deal_status`, `add_task`, `find_client` (read-only). Read-only пропускают подтверждение.
- **Блок F.3 — Multi-turn memory**: rolling window 20 сообщений, persist в `telegram_links.chat_history`. Commit `93609ed`.
- **Фиксы по ходу**:
  - Pending state перевели с in-memory `Map` на колонку `pending_action` в SQLite (Railway рестартует процесс).
  - `YES_RE` / `NO_RE` починили под кириллицу (JS `\b` ASCII-only) — заменили `\b` на `(?:[\s.,!?]|$)`.
  - Убрали слишком агрессивный auto-clear pending (теперь только TTL или `/cancel`).
  - Откатили бренды (MAGNAT/Rakhmat/Magnat) — карточка снова под мебель, универсальной не делаем.

---

## 2. На каком моменте остановились (ждём подтверждение от тебя)

Ты подтвердил **«да, добавь авто-обновление»** — но я ещё НЕ начал реализацию.

Проблема, которую нужно решить: фронт кэширует данные через `dataStore.reloadAll()`, вызываемый один раз на mount. Когда Telegram-бот создаёт задачу / сделку на сервере — на странице Tasks / SalesKanban / ActivityLog она не появляется без ручного Cmd+Shift+R.

Жду от тебя: **«давай»** (или корректировки по интервалу 15 сек / списку страниц), чтобы начать реализацию авто-рефреша.

---

## 3. Очередь работ (приоритеты)

1. **[P1] Авто-обновление** на Tasks.tsx, SalesKanban.tsx, ActivityLog.tsx
   - `useEffect` + `setInterval` каждые 15 сек → `store.reloadAll()`
   - Триггер на `visibilitychange` (возврат вкладки из Telegram)
   - Пауза polling когда вкладка не видна
   - Возможно вынести в кастомный хук `useAutoRefresh(intervalMs)`
   - Проверить tsc + build + push → Railway redeploy

2. **[P2] Per-module permissions для AI** — `auto / confirm / none` из настроек (отложено с F.2).

3. **[P3] Hand-off notifications** когда AI не уверен (отложено с F.2).

4. **[P4] C.2 Invitation flow** — multi-tenancy, приглашение сотрудников по ссылке.

Дополнительно — обновить файлы памяти в `~/.claude/projects/.../memory/` после завершения F.3 / авто-рефреша.

---

## 4. Текущее состояние деплоя

- **Frontend (Vercel)**: `utir-soft.vercel.app` — Active, последний пуш из main.
- **Backend (Railway)**: `utir-soft-production.up.railway.app` — Active, последний коммит `93609ed` (Block F.3 multi-turn memory).
- **Telegram bot**: `@utirsoftbot` — webhook привязан к Railway, pairing работает, бот отвечает, память между сообщениями работает.
- **БД**: SQLite на Railway volume, WAL mode. Миграции идемпотентные на boot (`pending_action`, `chat_history`, `company`, `verification_code`, `email_verified`, `terms_accepted_at`).
- **Секреты**: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `JWT_SECRET` — в Railway env. (Ранее токен бота утёк дважды в чате — был отозван через @BotFather, новый только в Railway.)

---

## Свежие коммиты (для ориентира)

- `93609ed` — Block F.3: multi-turn memory
- `b0eaa3c` — fix: stop clearing pending on fall-through
- `2db4c47` — fix: YES/NO regex для кириллицы
- `7ea7713` — fix: pending state в SQLite вместо in-memory
- `b3fefca` — Block F.1: Telegram + Claude foundation
