# Utir Soft — TODO / состояние работы

_Обновлено: 2026-05-16_

Короткое резюме перед /compact, чтобы не потерять контекст между сессиями.

---

## 1. Сделано в текущей сессии (после прошлого TODO.md)

### Авто-обновление страниц
- `src/app/utils/useAutoRefresh.ts` — хук: polling каждые 15с + пауза при скрытой вкладке + refresh при возврате.
- Подключён в `Tasks.tsx`, `SalesKanban.tsx`, `ActivityLog.tsx`.

### Карточка задачи редактируется
- Раньше read-only с только статус-кнопками. Теперь редактируемая модалка: название, описание, исполнитель, приоритет, категория, срок, статус.
- Кнопки Сохранить / Отмена / Удалить (с подтверждением).

### Блок F.4 — per-module permissions для AI-бота
- Бот теперь читает `users.ai_settings` (новая колонка, JSON-blob, синхронизируется через `GET/PUT /api/ai-settings`).
- На каждый tool-call смотрит `assistant.modulePermissions[модуль]`:
  - `auto` → выполняет без подтверждения, отвечает «⚡ Автоматически…»
  - `confirm` → как было: сводка + «Да/Нет»
  - `none` → отказывает с подсказкой «зайди в Настройки…»
- В `aiTools.ts` у каждого инструмента поле `module`: sales / finance / tasks / readonly.

### Блок F.5 — Hand-off notifications
- Когда бот не смог/не захотел — пишет в Журнал действий (`type: 'ai'`, `actor: 'ai'`).
- 7 reason-веток: Claude API failed, tool execute failed (confirm/auto), read-only failed, rejected by admin, module disabled, unknown tool.

### Полировка
- AI-генерируемые задачи: убрал placeholder-сотрудников из дропдаунов, теперь только реальная команда; пустая команда → «Не назначен».
- Сводка `add_task` всегда показывает дату (если Claude не указал — «сегодня (YYYY-MM-DD)»).

### Блок P4 — Multi-tenancy через инвайты (БОЛЬШОЙ)
- БД: колонки `team_id`, `team_role`, `invited_by`, `disabled_at` на users; колонка `team_id` на всех шарных таблицах; новая таблица `invitations`. Идемпотентные миграции + бэкфилл существующих рядов.
- Auth middleware прокидывает `teamId` + `teamRole`. Все CRUD фильтруют по `team_id` (user_id остался audit-полем).
- Эндпоинты (только админ): POST/GET/DELETE `/api/invitations`. Публичный GET `/api/invitations/preview/:code` (зарегистрирован **перед** auth-роутером!).
- Signup принимает `inviteCode` → новый юзер наследует team_id и роль инвайта.
- Авто-создание `employees`-записи при любом signup'е + startup-backfill для существующих юзеров.
- Frontend: `TeamInvitePanel.tsx` в Настройки → Команда (генерация ссылки, копирование, отзыв, история с именем того кто использовал).
- Auth.tsx читает `?invite=XXX` из URL → preview → баннер «Приглашение от X · команда · роль».
- Модалка «invite held» в App.tsx когда залогиненный юзер открывает свою же ссылку: 3 кнопки (скопировать / выйти-и-принять / закрыть).
- vercel.json catch-all rewrite чтобы deep-links не давали 404.

### Удаление из команды
- DELETE `/api/employees/:id` теперь soft-disable: ставит `users.disabled_at` + сбрасывает team_id.
- Backend: 403 «account disabled» в login + authMiddleware. Защита «нельзя удалить себя».
- Frontend: кнопка 🗑 скрыта на своей же строке; кикнутый юзер автоматически выкидывается на Auth screen (api.ts ловит 403, чистит токен, App.tsx подписан на event).

### Фиксы по ходу
- `e7a1cb6` — invite link `/auth?invite=...` 404-ил на Vercel → перешли на `/?invite=...` + `vercel.json`.
- `7cf3447` — preview-эндпоинт возвращал 401 (был ЗА auth-роутером) → перенёс выше mount.
- `2c5632c` — fallback в баннере когда у инвайтера пустое company.
- `da24729` — в истории инвайтов теперь видно имя того, кто использовал код.

---

## 2. На каком моменте остановились

Только что закрыли «удаление из команды» (commit `726c0f8`). Жду от тебя следующего направления.

---

## 3. Очередь (что осталось)

### P1 — UX мелочи в роли-доступе
- Сейчас manager / employee видят те же модули и могут править всё, что админ. Нужно ограничить:
  - `requireRole('admin')` на роуты настроек / инвайтов / удаления (часть уже есть).
  - На фронте — спрятать табы и кнопки по роли (Финансы только админу/manager; Журнал только админу — уже есть; и т.д.).
  - Чёткая матрица «кто что может» в коде.

### P2 — Восстановление выгнанного сотрудника
- Пока чтобы вернуть — надо вручную в БД сбросить `disabled_at`. Сделать UI «История уволенных» с кнопкой «Восстановить».

### P3 — Telegram-бот для команды
- Сейчас каждый юзер пейрит свой собственный бот-чат. Хорошо бы:
  - У команды один общий бот, который понимает кто пишет (по `chat_id` → user → team_id).
  - Уведомления о новых задачах падают в личку исполнителю (если он спарился).

### P4 — Реальная отправка email
- Сейчас OTP/инвайты только on-screen (dev-mode). Подключить SMTP/Resend/SendGrid чтобы инвайт-ссылка реально уходила на email.

### Мелочи
- Очистить дублирующиеся placeholder-структуры в других компонентах (Chats, Dashboard…).
- Code-splitting в Vite (chunk > 500kB warning).
- Реакция на TypeScript-сообщения «store.profile.email пустое после signup».

---

## 4. Текущее состояние деплоя

- **Frontend (Vercel)**: `utir-soft.vercel.app` — Active, `vercel.json` есть, SPA-rewrite работает.
- **Backend (Railway)**: `utir-soft-production.up.railway.app` — Active, последний коммит `726c0f8`.
- **Telegram bot**: `@utirsoftbot` — pairing/память/per-module permissions/hand-off лог работают.
- **БД**: SQLite WAL на Railway volume. Все P4-миграции идемпотентные, при следующем рестарте автоматически добьются.
- **Секреты**: ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, JWT_SECRET — только в Railway env.

---

## Свежие коммиты

- `726c0f8` — Remove employee from team = revoke their account access
- `e3cf2f6` — Auto-create employees row on signup
- `da24729` — Invite history shows WHO accepted
- `2c5632c` — Invite banner: graceful fallback for empty company
- `7cf3447` — Fix: invitation preview 401 — register public route before auth router
- `14ea000` — Debug invite preview: server log + clearer client error bucket
- `424ba95` — Invite UX: handle invite link opened by an already-logged-in user
- `e7a1cb6` — Fix: invite link 404 on Vercel — root path + SPA rewrite
- `81e9de5` — Block P4: Multi-tenancy via team invitations
- `0ec2a2a` — Polish: real team employees + show date in add_task summary
- `35faff4` — Make task detail modal editable
- `213c688` — Auto-refresh on Tasks / Sales / ActivityLog
- `93609ed` — Block F.3: multi-turn memory (из прошлой сессии)
