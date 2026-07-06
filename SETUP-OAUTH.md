# Вход через Google и Facebook — инструкция по настройке

Кнопки Google/Facebook уже встроены в экран входа. Пока не заданы ключи,
бэкенд возвращает пользователя обратно с сообщением «вход ещё не настроен».
Чтобы они заработали — заведите OAuth-приложения и добавьте переменные
окружения на бэкенде (Railway).

Нужные переменные окружения (Railway → сервис бэкенда → Variables):

```
APP_URL=https://utir-soft.vercel.app          # URL фронтенда (куда вернуть после входа)
OAUTH_CALLBACK_BASE=https://utir-soft-production.up.railway.app   # публичный URL бэкенда (по нему Google/FB зовут callback)

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
```

После добавления переменных перезапустите сервис. Кнопки заработают сразу,
код менять не нужно.

---

## 1. Google

1. Откройте **Google Cloud Console** → https://console.cloud.google.com/
2. Создайте проект (или выберите существующий).
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create.
   - Заполните название приложения, email поддержки, домены.
   - Scopes: добавьте `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`.
   - Пока приложение в статусе *Testing* — добавьте свои тестовые email в «Test users».
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs** — впишите ТОЧНО:
     ```
     https://utir-soft-production.up.railway.app/api/auth/google/callback
     ```
     (для локальной разработки при наличии туннеля добавьте и его callback.)
5. Скопируйте **Client ID** и **Client secret** → это `GOOGLE_CLIENT_ID` и
   `GOOGLE_CLIENT_SECRET`.
6. Когда всё проверите — на OAuth consent screen нажмите **Publish app**,
   чтобы вход работал для всех, а не только для тест-юзеров.

## 2. Facebook

1. Откройте **Meta for Developers** → https://developers.facebook.com/apps/
2. **Create App** → тип **Consumer** (или «Authenticate and request data from
   users with Facebook Login») → введите название и email.
3. В приложении добавьте продукт **Facebook Login → Settings**.
4. В **Facebook Login → Settings → Valid OAuth Redirect URIs** впишите:
   ```
   https://utir-soft-production.up.railway.app/api/auth/facebook/callback
   ```
5. **App settings → Basic**: скопируйте **App ID** и **App Secret** → это
   `FACEBOOK_APP_ID` и `FACEBOOK_APP_SECRET`.
6. Убедитесь, что разрешение **email** доступно (в Consumer-приложениях
   `email` и `public_profile` доступны без App Review). Для публичного запуска
   переведите приложение в режим **Live** (переключатель вверху).

> ⚠️ Facebook отдаёт email только если пользователь дал согласие и email
> подтверждён. Если email не пришёл — вход вернёт «аккаунт не отдал email».

---

## Как это работает внутри (для справки)

- Кнопка ведёт на `GET /api/auth/google` (или `/facebook`).
- Бэкенд редиректит на согласие провайдера, тот возвращает на
  `…/api/auth/<provider>/callback?code=…`.
- Бэкенд меняет `code` на токен, читает профиль (email + имя), находит или
  создаёт пользователя (новая команда), выпускает наш JWT и редиректит на
  `${APP_URL}/?token=<jwt>`.
- Фронтенд ловит `?token=` из URL, сохраняет сессию и заходит внутрь.
- Соцвход **без кода подтверждения** (email уже верифицирован провайдером).

## Телефон (SMS-код)

Сейчас телефон работает в **демо-режиме**: код показывается на экране, SMS не
отправляется. Чтобы слать реальные SMS — задайте `SMS_API_KEY` (и при
необходимости `SMS_SENDER`) и реализуйте вызов провайдера в функции
`sendSms()` в `server/index.ts` (Mobizon / SMSC.kz / Twilio). Весь остальной
флоу (ввод номера → код → подтверждение) уже готов.
