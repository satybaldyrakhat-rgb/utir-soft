# UTIR Soft

CRM-платформа для мебельного бизнеса. Frontend на React + Vite, backend на Express + SQLite.

## Локальная разработка

```bash
npm install
npm run dev
```

- Фронтенд: http://localhost:5173
- Бэкенд:   http://localhost:4010

`npm run dev` поднимает оба сервера сразу через `concurrently`.

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Запускает фронт и бэк одновременно (для разработки) |
| `npm run web` | Только фронтенд (Vite) |
| `npm run server` | Только бэкенд (Express + watch) |
| `npm run build` | Собирает фронтенд в `dist/` |
| `npm start` | Запускает бэкенд в продакшен-режиме |

## Переменные окружения

См. `.env.example`. На продакшене обязательно задай `JWT_SECRET`.

## Структура

```
server/        Express API + SQLite
src/app/       React SPA
  components/  Страницы и UI
  utils/       dataStore (контекст с состоянием) и api.ts (REST-клиент)
```
