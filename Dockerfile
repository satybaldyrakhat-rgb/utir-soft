# ─── Бэкенд Utir Soft (API) ───────────────────────────────────────────
# Фронтенд живёт отдельно (Vercel) — здесь только API, поэтому образ лёгкий.
#
# ВАЖНО: вся база — один файл SQLite. Он ДОЛЖЕН лежать на постоянном диске,
# смонтированном в /data. Без диска данные исчезнут при первом же рестарте
# контейнера. См. DATABASE_PATH ниже и docs/DEPLOY_ENV.md.

# ── Сборка зависимостей ──────────────────────────────────────────────
# Отдельная стадия: better-sqlite3 — нативный модуль. Обычно ставится
# готовым бинарником, но если под платформу префилда нет, ему нужны
# python3/make/g++ — держим их только здесь, в финальный образ не тащим.
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Финальный образ ──────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY tsconfig.json ./

ENV NODE_ENV=production
ENV PORT=4010
# База и её бэкапы — на постоянном диске.
ENV DATABASE_PATH=/data/utir.db
ENV BACKUP_DIR=/data/backups
VOLUME ["/data"]

EXPOSE 4010
# npm start → tsx server/index.ts (tsx лежит в dependencies, не в dev).
CMD ["npm", "start"]
