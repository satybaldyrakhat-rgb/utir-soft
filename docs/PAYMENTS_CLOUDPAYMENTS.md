# Оплата подписки картой — CloudPayments (+ FreedomPay, Kaspi)

Полная инструкция по добавлению онлайн-оплаты подписки в Utir Soft.
Написана под текущую архитектуру проекта: таблица `subscriptions`,
функции `getSubscription` / `setSubscription` (`server/ownerAdmin.ts`),
middleware `authMiddleware` + `req.teamId` (`server/index.ts`),
фронтовый хелпер `api` (`src/app/utils/api.ts`).

**Способы оплаты:**

| Способ         | Статус в этой инструкции      | Что делает                                  |
|----------------|-------------------------------|----------------------------------------------|
| CloudPayments  | ✅ Основной, реализуем сейчас | Карта Visa/Mastercard + автопродление        |
| FreedomPay     | ✅ Второй способ, реализуем   | Карта + Freedom Pay кошелёк (KZ)             |
| Kaspi          | 🚧 В разработке (заглушка)    | Показываем «скоро», кнопка неактивна          |

---

## 0. Как это работает (общая схема)

```
Пользователь (владелец команды)
   │  1. Открывает «Подписка» → выбирает тариф → «Оплатить картой»
   ▼
Фронтенд  ──2. POST /api/billing/checkout {plan, period, provider}──►  Наш сервер
   │                                                                      │
   │  3. Сервер создаёт «намерение оплаты» (invoice) в нашей БД,           │
   │     возвращает данные для виджета (сумма, invoiceId, publicId)        │
   ▼                                                                      │
Виджет CloudPayments (widget.js) открывает форму ввода карты
   │
   │  4. Пользователь платит. CloudPayments списывает деньги.
   ▼
CloudPayments  ──5. Webhook POST /api/billing/webhook/cloudpayments──►  Наш сервер
                    (server-to-server, с HMAC-подписью)                   │
                                                                          │  6. Сервер:
                                                                          │     • проверяет HMAC
                                                                          │     • находит invoice
                                                                          │     • setSubscription(active, +месяц)
                                                                          │     • пишет платёж в billing_payments
                                                                          │     • пишет в activity_logs
                                                                          ▼
                                                            Команда мгновенно активна
```

**Ключевой принцип безопасности:** подписку активирует **только webhook**
(шаг 5–6), а не «успех» на фронте. Фронт может соврать/перезагрузиться —
webhook приходит напрямую от CloudPayments и подписан секретом. Никогда не
активируйте подписку по ответу виджета на клиенте.

---

## 1. Что нужно получить у CloudPayments (до кода)

1. Зарегистрировать мерчант-аккаунт на **cloudpayments.kz** (казахстанское
   юрлицо/ИП, договор, KZT-счёт).
2. В личном кабинете CloudPayments взять:
   - **Public ID** — публичный идентификатор (виден на фронте, не секрет).
   - **API Secret** (Пароль для API) — **секрет**, только на сервере.
3. В настройках CloudPayments → **Уведомления (Webhooks)** указать URL наших
   webhook'ов (см. §5) и включить типы: **Pay**, **Fail**, **Recurrent**,
   **Refund**, **Cancel**. Для каждого включить проверку по HMAC.
4. Включить **тестовый режим** — сначала всё делаем на тестовых картах.

Тестовые карты CloudPayments (тестовый режим):
- Успех без 3DS: `4111 1111 1111 1111`, срок любой будущий, CVV любой.
- 3DS-успех: `4242 4242 4242 4242` (пароль 3DS в тесте — `12345678`).
- Отказ: `4111 1111 1111 1112`.

---

## 2. Переменные окружения

Проект уже читает конфиг через `process.env.*` (см. `server/index.ts`,
`server/aiChat.ts`). Добавляем новые переменные в тот же стиль. На проде
задаются в Railway (сервер) и Vercel (фронт). Локально — в `.env`.

**Сервер (Railway):**
```bash
# CloudPayments
CLOUDPAYMENTS_PUBLIC_ID=pk_xxxxxxxxxxxxxxxxxxxx
CLOUDPAYMENTS_API_SECRET=yyyyyyyyyyyyyyyyyyyy   # СЕКРЕТ, не отдавать на фронт
CLOUDPAYMENTS_TEST_MODE=1                        # 1 = тест, пусто = боевой

# FreedomPay (второй способ)
FREEDOMPAY_MERCHANT_ID=xxxxxx
FREEDOMPAY_SECRET_KEY=yyyyyyyy

# Базовый URL приложения для redirect'ов после оплаты
# (переменная APP_URL уже используется в server/index.ts)
APP_URL=https://app.utirsoft.kz
```

**Фронт (Vercel):**
```bash
# Public ID безопасно светить на клиенте — это НЕ секрет
VITE_CLOUDPAYMENTS_PUBLIC_ID=pk_xxxxxxxxxxxxxxxxxxxx
```

Добавьте эти строки в `docs/DEPLOY_ENV.md`, чтобы не потерять.

---

## 3. Модель данных

### 3.1. Расширяем `Subscription` (server/ownerAdmin.ts)

В интерфейс `Subscription` (сейчас ~строка 66) добавляем поля для привязки к
платёжному провайдеру и автопродления. Это обратно совместимо: `getSubscription`
уже мёржит через `{ ...defaultSub(), ...JSON.parse(row.data) }`, поэтому старые
строки без новых полей продолжат работать.

```ts
export interface Subscription {
  plan: string;
  amount: number;
  currency: string;
  period: SubPeriod;
  status: SubStatus;
  startedAt: string;
  expiresAt: string;
  suspended: boolean;
  note: string;
  updatedAt?: string;
  remindedExpiringFor?: string;
  remindedExpiredFor?: string;

  // ── НОВОЕ: онлайн-оплата ──────────────────────────────────
  provider?: 'cloudpayments' | 'freedompay' | 'manual';
  autoRenew?: boolean;              // включено ли автопродление
  cpToken?: string;                 // токен карты CloudPayments для рекуррента
  lastPaymentAt?: string;           // ISO дата последнего успешного платежа
  lastInvoiceId?: string;           // последний оплаченный invoice
}
```

> `cpToken` — токен рекуррентного списания, который CloudPayments вернёт в
> первом webhook'е (`Token`). Это **не** номер карты, а безопасный токен;
> хранить его можно. Но обращайтесь с ним как с секретом (не логировать).

### 3.2. Новые таблицы

Добавляем в `initOwnerSchema` (server/ownerAdmin.ts) две таблицы:
`billing_invoices` (намерения оплаты) и `billing_payments` (история платежей).

```sql
-- Намерение оплаты: создаётся ПЕРЕД показом виджета, закрывается webhook'ом.
CREATE TABLE IF NOT EXISTS billing_invoices (
  id TEXT PRIMARY KEY,        -- invoiceId, наш uuid, уходит в CloudPayments
  team_id TEXT NOT NULL,
  plan TEXT NOT NULL,         -- basic | pro | enterprise
  period TEXT NOT NULL,       -- monthly | semiannual | annual
  amount INTEGER NOT NULL,    -- ₸
  currency TEXT DEFAULT 'KZT',
  provider TEXT NOT NULL,     -- cloudpayments | freedompay
  status TEXT DEFAULT 'pending', -- pending | paid | failed | cancelled
  created_at TEXT DEFAULT (datetime('now')),
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_team ON billing_invoices(team_id);

-- История успешных/неуспешных платежей (для чека и для дашборда владельца).
CREATE TABLE IF NOT EXISTS billing_payments (
  id TEXT PRIMARY KEY,        -- TransactionId провайдера
  invoice_id TEXT,
  team_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'KZT',
  status TEXT NOT NULL,       -- paid | failed | refunded
  kind TEXT DEFAULT 'payment',-- payment | recurrent | refund
  raw TEXT,                   -- сырой JSON webhook'а (для разбора спорных)
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_billing_payments_team ON billing_payments(team_id);
```

### 3.3. Каталог тарифов (единый источник цен)

Сейчас цены дублируются: фронт-лендинг (`src/app/landing/components/Pricing.tsx`:
12900 / 34900 / 89900, доп. пользователь 3 500 ₸) и нигде на сервере их нет.
Чтобы сервер знал сумму и её нельзя было подделать с фронта, заводим каталог
на сервере — **сервер сам считает сумму по plan+period**, фронт сумму не
присылает.

Новый файл `server/billing.ts`:
```ts
export type PlanId = 'basic' | 'pro' | 'enterprise';
export type Period = 'monthly' | 'semiannual' | 'annual';

// Цены в ₸ за ПЕРИОД (не за месяц). Держите синхронно с лендингом.
const MONTHLY: Record<PlanId, number> = {
  basic: 12900,
  pro: 34900,
  enterprise: 89900,
};

// Множители периода (годовой — со скидкой ~20%, как на лендинге).
const PERIOD_MONTHS: Record<Period, number> = { monthly: 1, semiannual: 6, annual: 12 };
const PERIOD_DISCOUNT: Record<Period, number> = { monthly: 1, semiannual: 0.9, annual: 0.8 };

export function planAmount(plan: PlanId, period: Period): number {
  const base = MONTHLY[plan];
  if (!base) throw new Error('unknown plan');
  const months = PERIOD_MONTHS[period];
  return Math.round(base * months * PERIOD_DISCOUNT[period]);
}

export function planMonths(period: Period): number { return PERIOD_MONTHS[period]; }
```

---

## 4. Бэкенд: создание оплаты (checkout)

Новый роутер, монтируется рядом с остальными в `server/index.ts` (после
`app.use('/api/transactions', ...)`). Требует авторизации и роли `admin`
(платит владелец команды).

`server/billingRoutes.ts`:
```ts
import { Router } from 'express';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { planAmount, PlanId, Period } from './billing.js';

export function createBillingRouter(db: Database.Database) {
  const r = Router();

  // 1) Создать намерение оплаты. Возвращает данные для виджета.
  //    Сумму считает СЕРВЕР — фронт её не присылает.
  r.post('/checkout', (req: any, res) => {
    const teamId = req.teamId as string;
    const plan = req.body?.plan as PlanId;
    const period = (req.body?.period || 'monthly') as Period;
    const provider = (req.body?.provider || 'cloudpayments') as string;

    let amount: number;
    try { amount = planAmount(plan, period); }
    catch { return res.status(400).json({ error: 'unknown plan' }); }

    if (provider === 'kaspi') {
      return res.status(501).json({ error: 'kaspi_soon', message: 'Оплата через Kaspi в разработке' });
    }

    const invoiceId = crypto.randomUUID();
    db.prepare(`INSERT INTO billing_invoices (id, team_id, plan, period, amount, provider)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(invoiceId, teamId, plan, period, amount, provider);

    // Данные для виджета CloudPayments (publicId безопасен на клиенте).
    res.json({
      invoiceId,
      amount,
      currency: 'KZT',
      publicId: process.env.CLOUDPAYMENTS_PUBLIC_ID || '',
      description: `Utir Soft — тариф ${plan} (${period})`,
      // accountId нужен для рекуррента — привязка карты к команде
      accountId: teamId,
    });
  });

  // 2) История платежей команды (для страницы «Подписка»).
  r.get('/payments', (req: any, res) => {
    const rows = db.prepare(
      `SELECT id, amount, currency, status, kind, created_at
         FROM billing_payments WHERE team_id = ? ORDER BY created_at DESC LIMIT 50`
    ).all(req.teamId);
    res.json(rows);
  });

  // 3) Переключить автопродление.
  r.post('/auto-renew', (req: any, res) => {
    // setSubscription(db, req.teamId, { autoRenew: !!req.body?.enabled });
    res.json({ ok: true });
  });

  return r;
}
```

Монтаж в `server/index.ts`:
```ts
import { createBillingRouter } from './billingRoutes.js';
// ...рядом с другими app.use, ПОСЛЕ authMiddleware-роутов:
app.use('/api/billing', authMiddleware, requireRole('admin'), createBillingRouter(db));
```

> `requireRole('admin')` и `authMiddleware` уже есть в `server/index.ts`.
> `req.teamId` проставляет `authMiddleware` (строка ~655).

---

## 5. Бэкенд: webhook CloudPayments (сердце системы)

Webhook приходит **без** JWT — CloudPayments не знает нашего токена. Защита —
**HMAC-подпись** тела запроса нашим `API_SECRET`. Поэтому webhook монтируется
**без** `authMiddleware`, но с проверкой подписи.

**Важно про body-parser:** для проверки HMAC нужно **сырое тело** запроса.
Сейчас в `server/index.ts` стоит глобальный `express.json()` (строка ~623) —
он съедает raw body. Для webhook-роута нужен `express.raw()` **до** json-парсера.

`server/billingWebhooks.ts`:
```ts
import { Router, raw } from 'express';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { setSubscription, getSubscription } from './ownerAdmin.js';
import { planMonths, Period } from './billing.js';

function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function ymd(d: Date) { return d.toISOString().slice(0, 10); }

export function createBillingWebhookRouter(db: Database.Database) {
  const r = Router();
  const secret = process.env.CLOUDPAYMENTS_API_SECRET || '';

  // ВАЖНО: raw-парсер именно на этом роуте, чтобы посчитать HMAC по сырому телу.
  r.post('/cloudpayments', raw({ type: '*/*' }), (req: any, res) => {
    const rawBody: Buffer = req.body; // Buffer, т.к. express.raw
    const signature = req.get('Content-HMAC') || req.get('X-Content-HMAC') || '';

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    // сравнение в постоянное время
    const ok = signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!ok) {
      // Отвечаем 200 с code!=0? Нет — при неверной подписи просто 200 {code:13}
      return res.json({ code: 13 }); // 13 = «не принято»
    }

    // CloudPayments шлёт application/x-www-form-urlencoded
    const params = new URLSearchParams(rawBody.toString('utf8'));
    const type = detectType(req); // Pay / Fail / Recurrent — по URL или полю
    const invoiceId = params.get('InvoiceId') || '';
    const accountId = params.get('AccountId') || '';   // = teamId (мы так передали)
    const transactionId = params.get('TransactionId') || '';
    const amount = Math.round(Number(params.get('Amount') || 0));
    const token = params.get('Token') || '';           // токен для рекуррента
    const status = params.get('Status') || '';

    // Идемпотентность: один TransactionId обрабатываем один раз.
    const seen = db.prepare('SELECT 1 FROM billing_payments WHERE id = ?').get(transactionId);
    if (seen) return res.json({ code: 0 });

    const teamId = accountId;
    if (!teamId) return res.json({ code: 0 });

    // Определяем период по invoice (или по подписке для рекуррента).
    const inv = invoiceId
      ? db.prepare('SELECT * FROM billing_invoices WHERE id = ?').get(invoiceId) as any
      : null;
    const period = (inv?.period || 'monthly') as Period;

    const isSuccess = status === 'Completed' || status === 'Authorized';
    if (isSuccess) {
      // Продлеваем от максимума (сейчас, конец текущей подписки).
      const cur = getSubscription(db, teamId);
      const from = new Date(Math.max(Date.now(), new Date(cur.expiresAt).getTime() || 0));
      const newExpires = ymd(addMonths(from, planMonths(period)));

      setSubscription(db, teamId, {
        status: 'active',
        plan: inv?.plan || cur.plan,
        amount,
        currency: 'KZT',
        period,
        expiresAt: newExpires,
        suspended: false,
        provider: 'cloudpayments',
        autoRenew: true,
        cpToken: token || cur.cpToken,
        lastPaymentAt: new Date().toISOString(),
        lastInvoiceId: invoiceId,
      });

      db.prepare(`INSERT INTO billing_payments (id, invoice_id, team_id, provider, amount, currency, status, kind, raw)
                  VALUES (?, ?, ?, 'cloudpayments', ?, 'KZT', 'paid', ?, ?)`)
        .run(transactionId, invoiceId, teamId, amount, type === 'recurrent' ? 'recurrent' : 'payment', rawBody.toString('utf8'));

      if (inv) db.prepare(`UPDATE billing_invoices SET status='paid', paid_at=datetime('now') WHERE id=?`).run(invoiceId);

      // TODO: activity_logs + письмо-чек через server/email.ts
    } else {
      db.prepare(`INSERT INTO billing_payments (id, invoice_id, team_id, provider, amount, currency, status, kind, raw)
                  VALUES (?, ?, ?, 'cloudpayments', ?, 'KZT', 'failed', 'payment', ?)`)
        .run(transactionId || crypto.randomUUID(), invoiceId, teamId, amount, rawBody.toString('utf8'));
      if (inv) db.prepare(`UPDATE billing_invoices SET status='failed' WHERE id=?`).run(invoiceId);
    }

    // CloudPayments ждёт {"code":0} = принято.
    res.json({ code: 0 });
  });

  return r;
}

// Тип события определяем по разным webhook-URL (см. §5.1) или по полю.
function detectType(req: any): 'pay' | 'fail' | 'recurrent' {
  if (req.path.includes('recurrent')) return 'recurrent';
  if (req.path.includes('fail')) return 'fail';
  return 'pay';
}
```

### 5.1. Монтаж webhook-роутера ДО express.json()

В `server/index.ts` webhook нужно повесить **до** глобального `express.json()`,
иначе raw body будет потерян:

```ts
import { createBillingWebhookRouter } from './billingWebhooks.js';

// ... СРАЗУ после создания app, ДО app.use(express.json({...})):
app.use('/api/billing/webhook', createBillingWebhookRouter(db));

// затем уже существующий:
app.use(express.json({ ... }));
```

В кабинете CloudPayments настраиваете три URL уведомлений на один и тот же
роут (или три пути, тогда `detectType` их различит):
- Pay:        `https://app.utirsoft.kz/api/billing/webhook/cloudpayments`
- Fail:       тот же URL (различаем по `Status`)
- Recurrent:  `https://app.utirsoft.kz/api/billing/webhook/cloudpayments`
  (или отдельный `/api/billing/webhook/cloudpayments-recurrent`)

---

## 6. Фронтенд: страница «Подписка» + виджет

### 6.1. Подключение виджета

CloudPayments грузится скриптом. Добавьте в `index.html` перед `</body>`:
```html
<script src="https://widget.cloudpayments.kz/bundles/cloudpayments.js"></script>
```
(для боевого RU-домена — `widget.cloudpayments.ru`; для KZ — `.kz`.)

### 6.2. Компонент оплаты

Новый файл `src/app/components/PaymentButton.tsx`. Использует существующий
хелпер `api` из `src/app/utils/api.ts`.

```tsx
import { api } from '../utils/api';

declare global { interface Window { cp: any } }

interface CheckoutResp {
  invoiceId: string; amount: number; currency: string;
  publicId: string; description: string; accountId: string;
}

export function PaymentButton({
  plan, period, onPaid,
}: { plan: 'basic' | 'pro' | 'enterprise'; period: 'monthly' | 'semiannual' | 'annual'; onPaid: () => void }) {

  async function pay() {
    // 1) сервер создаёт invoice и считает сумму
    const c = await api.post<CheckoutResp>('/api/billing/checkout', { plan, period, provider: 'cloudpayments' });

    // 2) открываем виджет CloudPayments
    const widget = new window.cp.CloudPayments({ language: 'ru-RU' });
    widget.pay('charge', {
      publicId:    c.publicId,
      description: c.description,
      amount:      c.amount,
      currency:    c.currency,
      invoiceId:   c.invoiceId,   // вернётся в webhook
      accountId:   c.accountId,   // = teamId, нужно для рекуррента
      skin:        'modern',
      data: { plan, period, cloudPayments: { recurrent: { interval: 'Month', period: 1 } } }, // автопродление
    }, {
      onSuccess() {
        // НЕ активируем подписку здесь — это делает webhook.
        // Просто показываем «оплата принята, обновляем статус».
        setTimeout(onPaid, 2500); // дать webhook'у долететь, затем перечитать /api/team/subscription
      },
      onFail(reason: string) {
        alert('Оплата не прошла: ' + reason);
      },
    });
  }

  return <button onClick={pay} className="...">Оплатить картой</button>;
}
```

### 6.3. Где показать

- На баннере подписки (`src/app/components/SubscriptionBanner.tsx`) — кнопка
  «Продлить» при `plan === 'expired'` / `past_due`.
- Отдельная страница/модалка «Подписка» с выбором тарифа (переиспользуйте
  цены из каталога — но лучше отдать их с сервера через новый
  `GET /api/billing/plans`, чтобы не дублировать).
- Блок «Способы оплаты» со списком:
  - **Картой (CloudPayments)** — активно.
  - **FreedomPay** — активно (см. §8).
  - **Kaspi** — серая кнопка с подписью «Скоро» (§9).

После `onPaid` фронт перечитывает `GET /api/team/subscription`
(этот эндпоинт уже есть — `server/index.ts:4054`) и баннер обновляется.

---

## 7. Автопродление (рекуррент)

CloudPayments сам списывает по расписанию, если при первом платеже передан
объект `recurrent` (см. §6.2, `data.cloudPayments.recurrent`). На каждое
автосписание приходит **Recurrent-webhook** — он обрабатывается тем же кодом
(§5), просто `type === 'recurrent'`, и подписка продлевается ещё на период.

Отмена автопродления:
- Пользователь жмёт «Отключить автопродление» → `POST /api/billing/auto-renew {enabled:false}`.
- Сервер: `setSubscription(db, teamId, { autoRenew: false })` **и** вызывает
  REST API CloudPayments `POST https://api.cloudpayments.kz/subscriptions/cancel`
  (Basic-auth: `PublicID:ApiSecret`) с id подписки.

---

## 8. FreedomPay (второй способ)

Модель похожа, но подпись другая (MD5/SHA от отсортированных параметров +
secret key). Реализуем как **отдельный провайдер** за тем же интерфейсом:

- `POST /api/billing/checkout {provider:'freedompay'}` → сервер зовёт
  FreedomPay `init_payment.php`, получает `pg_redirect_url` → возвращает его
  фронту → фронт делает `window.location = redirectUrl`.
- FreedomPay после оплаты шлёт **result_url** webhook →
  `POST /api/billing/webhook/freedompay` → проверяем `pg_sig` (подпись по их
  алгоритму) → та же логика активации, что в §5.
- `success_url` / `failure_url` = страницы `#/billing/success` и `#/billing/fail`
  (роутер у вас hash-based — см. `App.tsx`).

Вынесите общую активацию (`setSubscription + billing_payments + activity_logs`)
в одну функцию `activateSubscription(db, {teamId, plan, period, amount, provider, transactionId})`,
чтобы CloudPayments и FreedomPay её переиспользовали.

---

## 9. Kaspi — заглушка «в разработке»

Пока **не** реализуем платёж, но место готовим:

- В списке способов оплаты показываем «Kaspi Pay» с бейджем «Скоро» и
  неактивной кнопкой.
- Сервер на `provider:'kaspi'` уже отвечает `501 { error:'kaspi_soon' }`
  (см. §4) — фронт ловит и показывает тост «Оплата через Kaspi скоро будет
  доступна».
- В `server/index.ts` в каталоге интеграций уже есть запись `kaspi-qr`
  (строка ~538) — с ней Kaspi-оплату можно будет связать позже.

Когда дойдёт до реализации: Kaspi интегрируется либо через Kaspi Pay API
(нужен договор с Kaspi Business), либо через QR/deeplink. Логика webhook'а —
та же `activateSubscription`.

---

## 10. Порядок внедрения (чек-лист)

- [ ] §1 Получить Public ID + API Secret (тестовый режим CloudPayments).
- [ ] §2 Прописать env-переменные (Railway + Vercel + локальный `.env`).
- [ ] §3.1 Расширить интерфейс `Subscription` новыми полями.
- [ ] §3.2 Добавить таблицы `billing_invoices` + `billing_payments` в `initOwnerSchema`.
- [ ] §3.3 Создать `server/billing.ts` (каталог цен).
- [ ] §4 Создать `server/billingRoutes.ts`, смонтировать `/api/billing`.
- [ ] §5 Создать `server/billingWebhooks.ts`, смонтировать `/api/billing/webhook` **ДО** `express.json()`.
- [ ] §6 Подключить `widget.cloudpayments.js` в `index.html`, создать `PaymentButton.tsx`.
- [ ] §6.3 Встроить кнопку в `SubscriptionBanner` и на страницу «Подписка».
- [ ] Настроить webhook-URL в кабинете CloudPayments, включить HMAC.
- [ ] §11 Прогнать тестовые карты, проверить активацию через webhook.
- [ ] §8 FreedomPay (после того как CloudPayments заработает end-to-end).
- [ ] §9 Kaspi — заглушка «Скоро».
- [ ] Переключить `CLOUDPAYMENTS_TEST_MODE` в боевой, реальный тест на 100 ₸.

---

## 11. Тестирование

1. **Локально:** webhook CloudPayments не достучится до `localhost`. Варианты:
   - Прокинуть туннель (`cloudflared tunnel` / `ngrok`) и указать его URL в
     кабинете как webhook.
   - Или временный ручной тест: `curl` с правильным `Content-HMAC`
     (посчитать HMAC-SHA256 base64 от тела с вашим секретом).
2. **Happy path:** checkout → виджет → тест-карта `4111...1111` → webhook
   `Status=Completed` → проверить, что `subscriptions` стал `active`,
   `expiresAt` +1 мес, появилась строка в `billing_payments`, баннер исчез.
3. **Идемпотентность:** отправить тот же webhook дважды → вторая обработка
   не должна продлевать повторно (проверка по `TransactionId`).
4. **Плохая подпись:** послать webhook с неверным HMAC → сервер отвечает
   `{code:13}`, подписка не меняется.
5. **Отказ:** карта `4111...1112` → `Status=Declined` → подписка не активна,
   в истории `failed`.
6. **Рекуррент:** в тесте инициировать повторное списание из кабинета →
   weblook `recurrent` → `expiresAt` продлился.

---

## 12. Безопасность (обязательно)

- **API Secret** — только на сервере, никогда в `VITE_*`, никогда в git.
- Подписку активирует **только webhook с валидным HMAC**, не фронт.
- Сумму считает **сервер** по plan+period, фронт сумму не присылает.
- **Идемпотентность** по `TransactionId` — защита от повторной обработки.
- `timingSafeEqual` для сравнения подписей (защита от timing-атак).
- Не логировать `cpToken`, `Content-HMAC`, полные данные карты (их и так нет —
  CloudPayments отдаёт только маскированный `CardLastFour`).
- Webhook-роут — вне `authMiddleware`, но за проверкой подписи.
- Все `billing_*` таблицы фильтруются по `team_id` — команда видит только свои
  платежи (как остальные таблицы в проекте).

---

## 13. Итоговые новые/изменённые файлы

| Файл                              | Изменение                                        |
|-----------------------------------|--------------------------------------------------|
| `server/billing.ts`               | НОВЫЙ — каталог тарифов, расчёт суммы             |
| `server/billingRoutes.ts`         | НОВЫЙ — `/api/billing/checkout`, `/payments`      |
| `server/billingWebhooks.ts`       | НОВЫЙ — webhook + HMAC + активация                |
| `server/ownerAdmin.ts`            | +поля в `Subscription`, +2 таблицы в schema      |
| `server/index.ts`                 | монтаж роутеров (webhook ДО json, billing после) |
| `index.html`                      | `<script>` виджета CloudPayments                 |
| `src/app/components/PaymentButton.tsx` | НОВЫЙ — виджет оплаты                        |
| `src/app/components/SubscriptionBanner.tsx` | +кнопка «Продлить/Оплатить»            |
| `docs/DEPLOY_ENV.md`              | +новые env-переменные                            |

Готово — по этой инструкции подписку можно оплачивать картой (CloudPayments) с
автопродлением, вторым способом идёт FreedomPay, Kaspi — заглушка «Скоро».
