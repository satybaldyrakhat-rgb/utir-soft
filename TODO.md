# Utir Soft — TODO / состояние работы

_Обновлено: 2026-05-16_

---

## 1. Что сделано в текущей сессии (после предыдущего TODO.md)

### Block P4 — Multi-tenancy и роли (большой блок)
- **БД**: `users.team_id`, `team_role`, `invited_by`, `disabled_at`. `team_settings` (role_permissions + team_roles JSON). На всех шарных таблицах `team_id`. Идемпотентные миграции + бэкфилл.
- **Auth middleware** прокидывает `teamId` и `teamRole`. Все CRUD фильтруют по `team_id`. JWT не менялся.
- **Эндпоинты приглашений**: `POST/GET/DELETE /api/invitations`, публичный `GET /api/invitations/preview/:code`.
- **Signup** принимает `inviteCode` → новый юзер наследует team_id и роль.
- **Auto-create `employees`-row** при signup + startup-backfill для существующих юзеров.
- **TeamInvitePanel** в Настройки → Команда: генерация ссылки, копирование, отзыв, история (с именем кто использовал).
- **Auth.tsx** читает `?invite=XXX`, preview, баннер «Приглашение от X».
- **Modal в App.tsx** когда залогиненный открыл свою же invite-ссылку (3 кнопки: скопировать/выйти-и-принять/закрыть).
- **vercel.json** catch-all rewrite для deep-links.

### Phase 1-2-3 — роли и матрица
- **Phase 1**: `requireRole` middleware (admin > manager > employee), сайдбар прячет Финансы / Настройки по роли.
- **Phase 2a**: `team_settings.role_permissions` через `GET/PUT /api/team-permissions`; матрица персистится в БД.
- **Phase 2b**: `requirePermission(module)` на роутах deals/products/transactions — backend 403 по матрице.
- **Phase 2c**: на фронте кнопки Create/Edit/Delete скрываются для роли с `view`.
- **Phase 3**: `PATCH /api/employees/:id/role` — admin может менять роли сотрудников; защита «нельзя оставить команду без админа» / «нельзя сменить свою роль».
- **Phase 4 — кастомные роли**: `RoleKey: string`, `TeamRole` interface, store CRUD ролей. UI: «Роли в команде» блок с rename/delete/add, матрица иттерирует store.roles. Invite + edit-employee dropdown'ы динамические. Превью матрицы в edit-модалке.
- **Объединил Команда + Роли** в одну вкладку «Команда и права».
- **Hard admin-only**: Команда и права + Журнал — даже если settings=full для другой роли.
- **Расширил матрицу**: Главная, AI Дизайн, Задачи, Платежи, Реклама + подразделы Настроек (settings-catalogs, settings-modules, settings-integrations, settings-ai). Группировка в шапке: «Рабочие модули» / «Настройки».
- **Кнопка «Сохранить»** на матрице (вместо автосейва на каждый клик) — `bulkSetRolePermissions`.

### Удаление/восстановление сотрудника
- Soft-delete: `users.disabled_at` + `employees.data.removed_at`. Не удаляет ряд.
- `POST /api/employees/:id/restore` + UI «Удалённые сотрудники» (свёрнутая секция с кнопкой «Восстановить»).
- Backend startup-sync: `users.team_role` приводится к `employees.data.role` (фикс старых данных).

### Командный Telegram-бот (F.6)
- **Уведомления исполнителю**: POST + PATCH `/api/tasks` шлют в личку Telegram «📝 Новая задача / На вас назначена задача».
- **`GET /api/team/pairings`** → список пар (email, chat_id, username).
- **✈️ бейдж** в списке команды для подключённых.

### Email через Resend
- `server/email.ts` (без новых npm-deps). Шаблоны: OTP + invite.
- `sendEmail()` подключён в `signup`, `resend-code`, `invitations POST` (если admin указал email).
- Env-gated: при `RESEND_API_KEY` отсутствует — dev-fallback (код на экране).
- **TeamInvitePanel** теперь принимает email в форме создания инвайта.

### Code-splitting
- `vite.config.ts` → `manualChunks` для вендоров: `vendor-react`, `vendor-charts`, `vendor-radix`, `vendor-lucide`, `vendor`.
- `React.lazy` + `Suspense` для тяжёлых страниц: Settings, Analytics, Chats, Warehouse, AIDesign, Finance, Booking, ClientCabinet, ClientTrack, CustomModulePage.
- **Первая загрузка**: с 1127 KB до 370 KB (gzip с 313 до 95 KB).

### Полировка
- 3-точечный фикс: TG-уведомление на PATCH, закрытие модалки задачи после Save, кнопка Save на матрице.
- Edit-модалка сотрудника: name/phone теперь сохраняются (раньше defaultValue без onChange). Email read-only.
- Убрал legacy «Дополнительные права» чекбоксы (теперь матрица — единственный источник истины).
- Placeholder при добавлении роли — нейтральный.

---

## 2. Где остановились

Только что закончили #4 code-splitting (commit `baed330`).

---

## 3. Очередь работ

### Технический долг
- **Подключить Resend** в prod: добавить `RESEND_API_KEY` в Railway → реальные письма. (Пока пауза по запросу.)
- **Большая PNG**: `src/imports/utirsoft.png` = 1.0 MB. Заменить на оптимизированный логотип (PNG/SVG ~50KB).
- **`store.profile.email`** иногда пустое после signup — низкий приоритет, баг косметический.

### Возможные направления (когда захочется)
- Дашборд: метрики по командам (сколько задач/сделок по каждому сотруднику).
- Push-уведомления через Telegram-бот на изменения статуса сделки.
- Bot-команды для команды: `/мои-задачи`, `/моя-выручка`, `/назначь-задачу @user текст`.
- Импорт/экспорт справочников (CSV / Excel).
- Версионирование сделок (история изменений с откатом).
- Public API для интеграций (webhook на создание сделки и т.п.).

---

## 4. Текущее состояние деплоя

- **Frontend (Vercel)**: `utir-soft.vercel.app` — Active. `vercel.json` rewrite работает.
- **Backend (Railway)**: `utir-soft-production.up.railway.app` — Active, последний commit `baed330`.
- **Telegram bot**: `@utirsoftbot` — pairing/память/per-module permissions/hand-off лог/уведомления о задачах работают.
- **БД**: SQLite WAL на Railway volume. Все миграции идемпотентные, бэкфилл team_role + employees-row при каждом старте.
- **Секреты**: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `JWT_SECRET` в Railway env.
- **Не подключено**: `RESEND_API_KEY` (готово, нужно только добавить ключ в Railway), `EMAIL_FROM` (опционально для своего домена).

---

## Свежие коммиты

- `baed330` — Code-splitting: vendor chunks + lazy-load
- `af63e98` — Real email via Resend (OTP + team invitations)
- `d3d7bea` — 3 UX fixes: TG notify on task PATCH, modal close, matrix Save btn
- `ca55a9d` — Hard admin gate on Команда, granular sub-tabs in matrix
- `900d833` — Matrix: add Платежи + Реклама modules
- `f46ae12` — Sync stale team_role, expand matrix modules
- `f323510` — Phase 4: custom team roles
- `1cf7cc8` — Phase 3: promote/demote teammates
- `fdc3d4c` — Phase 2a: role × module matrix persists to backend
- `8962523` — Phase 2b: backend enforces matrix
- `9bf4940` — Phase 2c: hide write buttons when role is 'view'
- `75dceea` — Phase 1: role-based access foundation
- `726c0f8` — Remove employee = revoke their account access
- `7978ce7` — Restore kicked teammate via UI
- `31d3d28` — Team Telegram bot: notifications + paired-member badges
- `e3cf2f6` — Auto-create employees row on signup
- `81e9de5` — Block P4: Multi-tenancy via team invitations
