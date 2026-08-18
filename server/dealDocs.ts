// ─── Документы по сделке: расчёт (КП) и спецификация материалов ───────
//
// Конвейер один для обеих бумаг:
//   draft → pending (на подтверждении) → approved → sent (ушла клиенту)
//          → accepted / rejected (решение клиента)
//
// Ключевое правило: НИКТО не подтверждает собственный расчёт. Создание
// расчёта требует права 'pricing', подтверждение и отправку клиенту —
// отдельного права 'pricing-approve' (по умолчанию только у админа).
// Проверки живут здесь, на сервере: спрятать кнопку в браузере мало.
//
// Сгенерированный PDF кладём в deal_doc_files и отдаём по публичному
// одноразовому коду — чтобы WhatsApp мог забрать файл по ссылке.

import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

export interface AuthedReq extends Request { userId?: string; teamId?: string; teamRole?: string }

export type DocKind = 'estimate' | 'spec';
export type DocStatus = 'draft' | 'pending' | 'approved' | 'sent' | 'accepted' | 'rejected';

export function initDealDocsSchema(db: Database.Database) {
  db.exec(`
    -- Сгенерированные PDF (КП / спецификация). Отдаются клиенту по
    -- публичной ссылке — код длинный и случайный, как у track_links.
    CREATE TABLE IF NOT EXISTS deal_doc_files (
      code TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT,
      mime TEXT DEFAULT 'application/pdf',
      data TEXT NOT NULL,          -- base64 без data:-префикса
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_deal_doc_files_deal ON deal_doc_files(deal_id);
  `);
}

// ─── Помощники ────────────────────────────────────────────────────────
const num = (v: unknown, max = 1e12): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
};
const str = (v: unknown, max = 300): string => String(v ?? '').slice(0, max);
const newDocId = (p: string) => p + crypto.randomBytes(6).toString('hex');

interface DealRow { id: string; data: any }
function loadDeal(db: Database.Database, teamId: string, dealId: string): DealRow | null {
  const row = db.prepare('SELECT id, data FROM deals WHERE id = ? AND team_id = ?').get(dealId, teamId) as any;
  if (!row) return null;
  try { return { id: row.id, data: JSON.parse(row.data) }; } catch { return null; }
}
function saveDeal(db: Database.Database, teamId: string, dealId: string, data: any) {
  db.prepare('UPDATE deals SET data = ? WHERE id = ? AND team_id = ?').run(JSON.stringify(data), dealId, teamId);
}

// Нормализуем присланный расчёт: наружу пускаем только известные поля и
// только числа — чтобы клиент не мог подсунуть произвольный объект.
function sanitizeEstimate(body: any, actor: { id: string; name: string }) {
  const lines = Array.isArray(body?.lines) ? body.lines.slice(0, 100).map((l: any) => ({
    name: str(l?.name, 200) || '—',
    qty: num(l?.qty, 1e6) || 1,
    unit: str(l?.unit, 20) || 'шт',
    price: num(l?.price),
  })) : [];
  const materialChoices = Array.isArray(body?.materialChoices) ? body.materialChoices.slice(0, 20).map((m: any) => ({
    group: str(m?.group, 60), option: str(m?.option, 120),
  })) : [];
  return {
    id: newDocId('est_'),
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
    createdByName: actor.name,
    productId: str(body?.productId, 60),
    productLabel: str(body?.productLabel, 120),
    dims: {
      length: num(body?.dims?.length, 1000),
      width: num(body?.dims?.width, 1000),
      height: num(body?.dims?.height, 1000),
    },
    area: num(body?.area, 1e6),
    materialChoices,
    lines,
    materialsCost: num(body?.materialsCost),
    addonsCost: num(body?.addonsCost),
    servicesCost: num(body?.servicesCost),
    subtotal: num(body?.subtotal),
    markupPct: num(body?.markupPct, 1000),
    markup: num(body?.markup),
    total: num(body?.total),
    leadDays: Array.isArray(body?.leadDays) ? body.leadDays.slice(0, 2).map((d: any) => num(d, 3650)) : undefined,
    status: 'pending' as DocStatus,
  };
}

function sanitizeSpec(body: any, actor: { id: string; name: string }) {
  const lines = Array.isArray(body?.lines) ? body.lines.slice(0, 200).map((l: any) => ({
    name: str(l?.name, 200) || '—',
    qty: num(l?.qty, 1e6) || 1,
    unit: str(l?.unit, 20) || 'шт',
    note: str(l?.note, 200) || undefined,
  })) : [];
  return {
    id: newDocId('spec_'),
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
    createdByName: actor.name,
    lines,
    note: str(body?.note, 1000) || undefined,
    status: 'pending' as DocStatus,
  };
}

// ─── Роутер ───────────────────────────────────────────────────────────
// canCreate / canApprove — гейты, которые прокидывает index.ts (они знают
// про матрицу прав). Так вся проверка прав остаётся в одном месте.
export function createDealDocsRouter(
  db: Database.Database,
  deps: {
    canCreateEstimate: (req: AuthedReq, res: Response, next: NextFunction) => void;
    canCreateSpec: (req: AuthedReq, res: Response, next: NextFunction) => void;
    canApprove: (req: AuthedReq, res: Response, next: NextFunction) => void;
    logActivity: (userId: string, entry: Record<string, any>) => void;
    sendClientDocument: (teamId: string, phone: string, url: string, filename: string, caption: string)
      => Promise<{ ok: boolean; error?: string }>;
    publicBase: (req: Request) => string;
  },
) {
  const r = Router();

  const actorOf = (req: AuthedReq) => {
    const u = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId!) as any;
    return { id: req.userId!, name: u?.name || '' };
  };

  // ── Создать расчёт (замерщик) ───────────────────────────────────────
  r.post('/:id/estimate', deps.canCreateEstimate, (req: AuthedReq, res) => {
    const deal = loadDeal(db, req.teamId!, req.params.id);
    if (!deal) return res.status(404).json({ error: 'deal not found' });
    // Уже отправленный клиенту расчёт не переписываем молча — сначала надо
    // отозвать/пересоздать осознанно.
    if (deal.data.estimate?.status === 'sent' && !req.body?.replace) {
      return res.status(409).json({ error: 'estimate_already_sent' });
    }
    const est = sanitizeEstimate(req.body, actorOf(req));
    deal.data.estimate = est;
    // Сумма сделки подтягивается к расчёту — это и есть цена заказа.
    if (est.total > 0) deal.data.amount = est.total;
    saveDeal(db, req.teamId!, deal.id, deal.data);
    deps.logActivity(req.userId!, {
      user: est.createdByName, type: 'update', page: 'orders',
      action: 'Добавил расчёт по заказу', target: deal.data.customerName || deal.id,
    });
    res.json(est);
  });

  // ── Создать спецификацию материалов (дизайнер) ──────────────────────
  r.post('/:id/spec', deps.canCreateSpec, (req: AuthedReq, res) => {
    const deal = loadDeal(db, req.teamId!, req.params.id);
    if (!deal) return res.status(404).json({ error: 'deal not found' });
    if (deal.data.spec?.status === 'sent' && !req.body?.replace) {
      return res.status(409).json({ error: 'spec_already_sent' });
    }
    const spec = sanitizeSpec(req.body, actorOf(req));
    deal.data.spec = spec;
    saveDeal(db, req.teamId!, deal.id, deal.data);
    deps.logActivity(req.userId!, {
      user: spec.createdByName, type: 'update', page: 'orders',
      action: 'Добавил спецификацию материалов', target: deal.data.customerName || deal.id,
    });
    res.json(spec);
  });

  // ── Подтвердить / отклонить (финансист или админ) ───────────────────
  const decide = (kind: DocKind, action: 'approve' | 'reject') =>
    (req: AuthedReq, res: Response) => {
      const deal = loadDeal(db, req.teamId!, req.params.id);
      if (!deal) return res.status(404).json({ error: 'deal not found' });
      const doc = deal.data[kind];
      if (!doc) return res.status(404).json({ error: `${kind}_not_found` });
      if (doc.status !== 'pending') return res.status(409).json({ error: 'not_pending', status: doc.status });

      const actor = actorOf(req);
      if (action === 'approve') {
        doc.status = 'approved';
        doc.approvedBy = actor.id;
        doc.approvedByName = actor.name;
        doc.approvedAt = new Date().toISOString();
      } else {
        doc.status = 'rejected';
        doc.rejectedReason = str(req.body?.reason, 500);
      }
      saveDeal(db, req.teamId!, deal.id, deal.data);
      deps.logActivity(req.userId!, {
        user: actor.name, type: 'update', page: 'orders',
        action: action === 'approve'
          ? (kind === 'estimate' ? 'Подтвердил КП' : 'Подтвердил спецификацию')
          : (kind === 'estimate' ? 'Отклонил КП' : 'Отклонил спецификацию'),
        target: deal.data.customerName || deal.id,
      });
      res.json(doc);
    };

  r.post('/:id/estimate/approve', deps.canApprove, decide('estimate', 'approve'));
  r.post('/:id/estimate/reject',  deps.canApprove, decide('estimate', 'reject'));
  r.post('/:id/spec/approve',     deps.canApprove, decide('spec', 'approve'));
  r.post('/:id/spec/reject',      deps.canApprove, decide('spec', 'reject'));

  // ── Отправить клиенту в WhatsApp ────────────────────────────────────
  // Тело: { pdfBase64, filename }. PDF генерит браузер (там уже есть
  // шрифты и вёрстка), сервер только хранит и отправляет — чтобы ссылка
  // была публичной и WhatsApp мог забрать файл.
  const send = (kind: DocKind) => async (req: AuthedReq, res: Response) => {
    const deal = loadDeal(db, req.teamId!, req.params.id);
    if (!deal) return res.status(404).json({ error: 'deal not found' });
    const doc = deal.data[kind];
    if (!doc) return res.status(404).json({ error: `${kind}_not_found` });
    if (doc.status !== 'approved' && doc.status !== 'sent') {
      return res.status(409).json({ error: 'not_approved', status: doc.status });
    }

    const b64 = String(req.body?.pdfBase64 || '').replace(/^data:[^,]*,/, '');
    if (!b64 || b64.length > 12_000_000) return res.status(400).json({ error: 'bad_pdf' });

    const filename = str(req.body?.filename, 120) || (kind === 'estimate' ? 'KP.pdf' : 'Spec.pdf');
    const code = crypto.randomBytes(16).toString('hex');
    db.prepare(`INSERT INTO deal_doc_files (code, deal_id, team_id, kind, filename, mime, data)
                VALUES (?, ?, ?, ?, ?, 'application/pdf', ?)`)
      .run(code, deal.id, req.teamId!, kind, filename, b64);

    const url = `${deps.publicBase(req)}/api/public/doc/${code}`;
    doc.docCode = code;

    const phone = String(deal.data.phone || '').replace(/\D/g, '');
    const caption = kind === 'estimate'
      ? `Коммерческое предложение по вашему заказу.`
      : `Спецификация материалов по вашему заказу.`;

    let sent: { ok: boolean; error?: string } = { ok: false, error: 'no_phone' };
    if (phone) sent = await deps.sendClientDocument(req.teamId!, phone, url, filename, caption);

    if (sent.ok) {
      doc.status = 'sent';
      doc.sentAt = new Date().toISOString();
      doc.sentTo = phone;
      doc.sendError = undefined;
    } else {
      // Не смогли доставить автоматически (нет номера / не настроен
      // WhatsApp / вне 24-часового окна Meta). Документ уже сохранён —
      // отдаём ссылку, менеджер отправит вручную одной кнопкой.
      doc.sendError = sent.error || 'send_failed';
    }
    saveDeal(db, req.teamId!, deal.id, deal.data);

    const actor = actorOf(req);
    deps.logActivity(req.userId!, {
      user: actor.name, type: 'update', page: 'orders',
      action: sent.ok
        ? (kind === 'estimate' ? 'Отправил КП клиенту в WhatsApp' : 'Отправил спецификацию клиенту')
        : 'Подготовил документ клиенту (авто-отправка не прошла)',
      target: deal.data.customerName || deal.id,
    });

    res.json({ ok: sent.ok, url, phone, error: sent.error, doc });
  };

  r.post('/:id/estimate/send', deps.canApprove, send('estimate'));
  r.post('/:id/spec/send',     deps.canApprove, send('spec'));

  return r;
}

// ─── Публичная выдача PDF (без авторизации, по длинному коду) ─────────
export function createPublicDocRouter(db: Database.Database) {
  const r = Router();
  r.get('/:code', (req, res) => {
    const code = String(req.params.code || '').replace(/[^a-f0-9]/gi, '');
    if (code.length !== 32) return res.status(404).send('not found');
    const row = db.prepare('SELECT filename, mime, data FROM deal_doc_files WHERE code = ?').get(code) as any;
    if (!row) return res.status(404).send('not found');
    const buf = Buffer.from(row.data, 'base64');
    res.setHeader('Content-Type', row.mime || 'application/pdf');
    // inline — WhatsApp и браузер клиента откроют файл прямо в просмотрщике.
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.filename || 'document.pdf')}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buf);
  });
  return r;
}
