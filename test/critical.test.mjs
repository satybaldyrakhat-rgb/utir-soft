// Критичные регресс-тесты платформы. Node 22 встроенный тест-раннер
// (node --test) — без внешних зависимостей. Поднимаем реальный сервер на
// временной БД и бьём по HTTP, как настоящий клиент.
//
// Покрываем самое дорогое по риску: вход, ИЗОЛЯЦИЮ команд (утечка данных
// между клиентами), гейт владельца, блокировку команды.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let proc, BASE, tmp;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'utir-test-'));
  const PORT = 4200 + Math.floor(Math.random() * 700);
  BASE = `http://127.0.0.1:${PORT}`;
  proc = spawn('npx', ['tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(PORT), DATABASE_PATH: join(tmp, 'test.db'),
           JWT_SECRET: 'test-secret', SUPER_ADMIN_EMAILS: 'owner@test.kz', NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  // Ждём готовности (health 200).
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('server did not start');
});

after(() => {
  if (proc) proc.kill('SIGKILL');
  if (tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } }
});

// ─── helpers ──────────────────────────────────────────────────────────
const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
};
// signup, а если email уже занят (409) — логинимся. Так один и тот же
// email (напр. owner) можно «получить» из нескольких тестов.
const signup = async (email, company) => {
  const r = await api('POST', '/api/auth/signup', { body: { email, password: 'Test1234!', name: email.split('@')[0], company, termsAccepted: true } });
  if (r.json?.token) return r.json.token;
  const l = await api('POST', '/api/auth/login', { body: { email, password: 'Test1234!' } });
  return l.json?.token;
};

// ─── Auth ─────────────────────────────────────────────────────────────
test('signup выдаёт токен, дубликат email → 409', async () => {
  const t = await signup('dup@test.kz', 'A');
  assert.ok(t, 'первый signup даёт токен');
  const r2 = await api('POST', '/api/auth/signup', { body: { email: 'dup@test.kz', password: 'Test1234!', name: 'x', company: 'A', termsAccepted: true } });
  assert.equal(r2.status, 409);
});

test('login: верный пароль → токен, неверный → 401', async () => {
  await signup('login@test.kz', 'A');
  const ok = await api('POST', '/api/auth/login', { body: { email: 'login@test.kz', password: 'Test1234!' } });
  assert.equal(ok.status, 200); assert.ok(ok.json.token);
  const bad = await api('POST', '/api/auth/login', { body: { email: 'login@test.kz', password: 'wrong' } });
  assert.equal(bad.status, 401);
});

test('/api/auth/me: с токеном → user, без → 401', async () => {
  const t = await signup('me@test.kz', 'A');
  const me = await api('GET', '/api/auth/me', { token: t });
  assert.equal(me.status, 200); assert.equal(me.json.user.email, 'me@test.kz');
  const no = await api('GET', '/api/auth/me');
  assert.equal(no.status, 401);
});

// ─── Изоляция команд (данные не текут между клиентами) ─────────────────
test('команда B не видит и не может изменить сделку команды A', async () => {
  const A = await signup('a-iso@test.kz', 'Team A');
  const B = await signup('b-iso@test.kz', 'Team B');
  // A создаёт сделку
  const created = await api('POST', '/api/deals', { token: A, body: { customerName: 'Секрет-Клиент A', amount: 999999 } });
  assert.equal(created.status, 200);
  const dealId = created.json.id;
  // B получает свой список — сделки A там НЕТ
  const bList = await api('GET', '/api/deals', { token: B });
  assert.equal(bList.status, 200);
  assert.ok(!bList.json.some(d => d.id === dealId), 'сделка A не видна команде B');
  // B пытается изменить сделку A по id → 404 (скоуп по team_id)
  const bPatch = await api('PATCH', `/api/deals/${dealId}`, { token: B, body: { amount: 1 } });
  assert.equal(bPatch.status, 404, 'B не может патчить чужую сделку');
  // A по-прежнему видит свою неизменённой
  const aList = await api('GET', '/api/deals', { token: A });
  const mine = aList.json.find(d => d.id === dealId);
  assert.equal(mine.amount, 999999, 'сумма сделки A не тронута');
});

// ─── Гейт владельца платформы ──────────────────────────────────────────
test('дашборд владельца: super-admin → 200, обычный клиент → 403', async () => {
  const owner = await signup('owner@test.kz', 'HQ');
  const client = await signup('client@test.kz', 'Client');
  assert.equal((await api('GET', '/api/owner/me', { token: owner })).status, 200);
  assert.equal((await api('GET', '/api/owner/teams', { token: owner })).status, 200);
  assert.equal((await api('GET', '/api/owner/me', { token: client })).status, 403);
  assert.equal((await api('POST', '/api/owner/backup/run', { token: client })).status, 403);
});

// ─── Блокировка команды владельцем ─────────────────────────────────────
test('блокировка команды закрывает ей доступ, разблокировка — открывает', async () => {
  const owner = await signup('owner@test.kz', 'HQ');           // уже super-admin
  const victim = await signup('victim@test.kz', 'Victim');
  // teamId жертвы = её user id; берём из owner/teams
  const teams = await api('GET', '/api/owner/teams', { token: owner });
  const v = teams.json.find(t => t.email === 'victim@test.kz');
  assert.ok(v, 'команда жертвы видна владельцу');
  // до блокировки — доступ есть
  assert.equal((await api('GET', '/api/deals', { token: victim })).status, 200);
  // блок
  assert.equal((await api('POST', `/api/owner/teams/${v.teamId}/suspend`, { token: owner })).status, 200);
  assert.equal((await api('GET', '/api/deals', { token: victim })).status, 403, 'заблокированная команда без доступа');
  // разблок
  assert.equal((await api('POST', `/api/owner/teams/${v.teamId}/unsuspend`, { token: owner })).status, 200);
  assert.equal((await api('GET', '/api/deals', { token: victim })).status, 200, 'доступ восстановлен');
});

// ─── Онлайн-оплата подписки ────────────────────────────────────────────
test('billing: каталог тарифов, валидация checkout, заглушка Kaspi', async () => {
  const t = await signup('payer@test.kz', 'Payer');
  // каталог отдаётся, цены считаются сервером
  const plans = await api('GET', '/api/billing/plans', { token: t });
  assert.equal(plans.status, 200);
  const pro = plans.json.plans.find(p => p.plan === 'pro');
  assert.equal(pro.prices.monthly, 34900, 'цена pro/мес = 34900 ₸');
  // провайдеры не настроены в тесте (нет env-ключей)
  assert.equal(plans.json.providers.cloudpayments, false);
  assert.equal(plans.json.providers.kaspi, false);
  // Kaspi → 501 «в разработке»
  const kaspi = await api('POST', '/api/billing/checkout', { token: t, body: { plan: 'pro', period: 'monthly', provider: 'kaspi' } });
  assert.equal(kaspi.status, 501);
  assert.equal(kaspi.json.error, 'kaspi_soon');
  // неизвестный тариф → 400
  const bad = await api('POST', '/api/billing/checkout', { token: t, body: { plan: 'ultra', period: 'monthly', provider: 'cloudpayments' } });
  assert.equal(bad.status, 400);
  // CloudPayments без ключей → 503 (не 500)
  const cp = await api('POST', '/api/billing/checkout', { token: t, body: { plan: 'pro', period: 'monthly', provider: 'cloudpayments' } });
  assert.equal(cp.status, 503);
});

test('billing: задачи по оплате есть в роадмапе Центра управления', async () => {
  const owner = await signup('owner@test.kz', 'HQ');
  const tasks = await api('GET', '/api/owner/tasks', { token: owner });
  assert.equal(tasks.status, 200);
  const titles = tasks.json.map(t => t.title);
  assert.ok(titles.some(t => t.includes('Оплата и подписка')), 'есть задача про раздел оплаты в приложении');
  assert.ok(titles.some(t => t.includes('CloudPayments')), 'есть задача про CloudPayments');
});

test('billing: webhook без подписи не активирует подписку (code 13)', async () => {
  const res = await fetch(`${BASE}/api/billing/webhook/cloudpayments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'AccountId=someteam&Amount=34900&Status=Completed&TransactionId=hack1',
  });
  const j = await res.json();
  assert.equal(j.code, 13, 'неверная подпись → отклонено');
});
