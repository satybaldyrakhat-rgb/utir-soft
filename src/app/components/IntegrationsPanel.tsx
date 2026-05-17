import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, MessageSquare, CreditCard, Calendar, Zap, Check, X, AlertCircle, Loader2,
  Copy, ExternalLink, Lock, Settings as SettingsIcon, Power, Search, KeyRound, ShieldCheck, Trash2,
} from 'lucide-react';
import { api } from '../utils/api';
import { KaspiLogo, HalykLogo, OneCLogo } from './PlatformLogos';
import { BrandLogo, hasBrandLogo } from './BrandLogo';

interface Props { language: 'kz' | 'ru' | 'eng'; canEdit: boolean }

// Shapes mirror server/integrations2.ts exports.
type IntegrationKind = 'env' | 'config' | 'oauth';
type IntegrationCategory = 'ai' | 'messaging' | 'payments' | 'mailcal' | 'other';

interface IntegrationField {
  id: string; label: string; type?: 'text' | 'password' | 'tel' | 'email';
  required?: boolean; placeholder?: string; hint?: string;
}
interface IntegrationDef {
  id: string; name: string; shortDesc: string; longDesc?: string;
  category: IntegrationCategory; kind: IntegrationKind;
  envVars?: string[]; configFields?: IntegrationField[];
  helpUrl?: string; instructions?: string;
}
interface IntegrationStatus {
  id: string; connected: boolean;
  envStatus?: Record<string, boolean>;
  configStatus?: { hasAllRequired: boolean; lastSavedAt?: string };
  config?: Record<string, string>;
}

// Logo registry — for KZ-local brands (Kaspi, Halyk, 1С) we keep the
// hand-drawn SVGs from PlatformLogos (Simple Icons doesn't cover them).
// Everything else goes through the unified <BrandLogo> which inlines
// pre-processed Simple Icons SVGs with brand-correct colour.
function logoFor(id: string): JSX.Element {
  if (id === 'kaspi-qr') return <KaspiLogo className="w-6 h-6" />;
  if (id === 'halyk-pos') return <HalykLogo className="w-6 h-6" />;
  if (id === '1c')        return <OneCLogo className="w-6 h-6" />;
  if (hasBrandLogo(id))   return <BrandLogo id={id} size={24} />;
  return <Zap className="w-5 h-5 text-gray-400" />;
}

const CAT_META: Record<IntegrationCategory, { ru: string; icon: any; cls: string }> = {
  ai:        { ru: 'AI провайдеры',       icon: Sparkles,     cls: 'bg-violet-50 text-violet-700' },
  messaging: { ru: 'Мессенджеры',         icon: MessageSquare, cls: 'bg-sky-50 text-sky-700' },
  payments:  { ru: 'Финансы / Эквайринг', icon: CreditCard,   cls: 'bg-emerald-50 text-emerald-700' },
  mailcal:   { ru: 'Календарь / Почта',   icon: Calendar,     cls: 'bg-amber-50 text-amber-700' },
  other:     { ru: 'Прочее',              icon: Zap,          cls: 'bg-gray-50 text-gray-700' },
};

export function IntegrationsPanel({ language, canEdit }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [catalog, setCatalog]   = useState<IntegrationDef[]>([]);
  const [statuses, setStatuses] = useState<IntegrationStatus[]>([]);
  const [loaded, setLoaded]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [editId, setEditId]     = useState<string | null>(null);
  const [toast, setToast]       = useState<string | null>(null);

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  async function refresh() {
    try {
      const r = await api.get<{ catalog: IntegrationDef[]; statuses: IntegrationStatus[] }>('/api/integrations/v2');
      setCatalog(r.catalog || []);
      setStatuses(r.statuses || []);
      setLoaded(true);
    } catch (e: any) { setError(String(e?.message || e)); setLoaded(true); }
  }

  const statusFor = (id: string) => statuses.find(s => s.id === id);

  // Filter by search query (matches id + name + short description).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(d =>
      d.id.toLowerCase().includes(q) ||
      d.name.toLowerCase().includes(q) ||
      d.shortDesc.toLowerCase().includes(q),
    );
  }, [catalog, search]);

  // KPI counters — always based on the full catalog (not filtered).
  const kpi = useMemo(() => {
    const total = catalog.length;
    const on    = statuses.filter(s => s.connected).length;
    const needsKey = catalog.filter(d => d.kind === 'env' && !statusFor(d.id)?.connected).length;
    const needsCfg = catalog.filter(d => d.kind === 'config' && !statusFor(d.id)?.connected).length;
    return { total, on, off: total - on, needsKey, needsCfg };
  }, [catalog, statuses]);

  async function disconnect(d: IntegrationDef) {
    if (!confirm(l(`Отключить «${d.name}»? Сохранённые ключи будут удалены.`, '...', `Disconnect ${d.name}? Stored keys will be removed.`))) return;
    try {
      await api.delete(`/api/integrations/v2/${d.id}`);
      setToast(l('Интеграция отключена', 'Өшірілді', 'Disconnected'));
      refresh();
    } catch (e: any) { setError(String(e?.message || e)); }
  }

  if (!loaded) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 flex items-center justify-center text-gray-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> {l('Загружаю…', 'Жүктеуде…', 'Loading…')}
      </div>
    );
  }

  // Group by category, preserving catalog order within each group.
  const groups: Array<{ cat: IntegrationCategory; items: IntegrationDef[] }> = [];
  (['ai', 'messaging', 'payments', 'mailcal', 'other'] as IntegrationCategory[]).forEach(cat => {
    const items = filtered.filter(d => d.category === cat);
    if (items.length > 0) groups.push({ cat, items });
  });

  return (
    <div className="space-y-5">
      {/* ─── Header + KPI strip ─────────────────────────────────── */}
      <div>
        <h2 className="text-gray-900 mb-1">{l('Интеграции', 'Интеграциялар', 'Integrations')}</h2>
        <p className="text-xs text-gray-400 max-w-xl">
          {l('Каждая интеграция показывает реальный статус: ключи из Railway проверяются на лету, конфиги команды (Kaspi, WhatsApp) сохраняются в БД. Все подключения и отключения попадают в журнал.',
             '...', 'Real status — env keys checked live, team configs persisted in DB. All connect/disconnect actions go to the activity log.')}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: l('Всего', 'Барлығы', 'Total'),       value: kpi.total,    cls: 'bg-gray-50 text-gray-700' },
          { label: l('Подключено', 'Қосылған', 'Active'), value: kpi.on,       cls: 'bg-emerald-50 text-emerald-700' },
          { label: l('Нужен ключ', 'Кілт керек', 'Need key'),  value: kpi.needsKey, cls: 'bg-amber-50 text-amber-700' },
          { label: l('Нужна настройка', 'Баптау керек', 'Need config'), value: kpi.needsCfg, cls: 'bg-sky-50 text-sky-700' },
        ].map((k, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-2xl p-3.5">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{k.label}</div>
            <div className="flex items-baseline gap-2">
              <div className="text-lg text-gray-900 tabular-nums">{k.value}</div>
              <div className={`text-[10px] px-1.5 py-0.5 rounded ${k.cls}`}>·</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-gray-100 p-2 flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-gray-300 ml-2" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={l('Поиск по интеграциям…', '...', 'Search integrations…')}
          className="flex-1 bg-transparent text-xs focus:outline-none placeholder:text-gray-400"
        />
        {search && (
          <button onClick={() => setSearch('')} className="w-6 h-6 hover:bg-gray-50 rounded-md flex items-center justify-center">
            <X className="w-3 h-3 text-gray-400" />
          </button>
        )}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2 text-xs text-rose-700 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-rose-400">×</button>
        </div>
      )}

      {/* ─── Groups ──────────────────────────────────────────────── */}
      {groups.length === 0 ? (
        <div className="text-center text-xs text-gray-400 py-8">
          {l('Ничего не найдено', '...', 'Nothing matches')}
        </div>
      ) : groups.map(g => {
        const meta = CAT_META[g.cat];
        const Icon = meta.icon;
        return (
          <div key={g.cat}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${meta.cls}`}>
                <Icon className="w-3 h-3" />
              </div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500">{meta.ru}</div>
              <div className="text-[10px] text-gray-400">
                · {g.items.filter(d => statusFor(d.id)?.connected).length} / {g.items.length} {l('подключено', 'қосылды', 'connected')}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {g.items.map(d => {
                const s = statusFor(d.id);
                const connected = !!s?.connected;
                const isEnv = d.kind === 'env';
                const isOAuth = d.kind === 'oauth';
                return (
                  <div key={d.id} className={`bg-white rounded-2xl border ${connected ? 'border-emerald-100' : 'border-gray-100'} p-4 hover:shadow-sm transition-all`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
                        {logoFor(d.id)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-sm text-gray-900">{d.name}</span>
                          {connected ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                              {l('Подключено', 'Қосылды', 'Connected')}
                            </span>
                          ) : isEnv ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">
                              <KeyRound className="w-2.5 h-2.5" /> {l('Нужен ключ', 'Кілт керек', 'Needs key')}
                            </span>
                          ) : isOAuth ? (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{l('Скоро', 'Жақын арада', 'Soon')}</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{l('Не настроено', 'Бапталмаған', 'Not configured')}</span>
                          )}
                          <span className="text-[9px] px-1.5 py-0.5 bg-gray-50 text-gray-400 rounded uppercase tracking-wide">{d.kind}</span>
                        </div>
                        <div className="text-[11px] text-gray-500 mb-2">{d.shortDesc}</div>

                        {/* env-kind shows which vars are set/missing */}
                        {isEnv && d.envVars && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {d.envVars.map(v => {
                              const set = s?.envStatus?.[v];
                              return (
                                <button
                                  key={v}
                                  onClick={() => { navigator.clipboard.writeText(v); setToast(l('Скопировано: ', '...', 'Copied: ') + v); }}
                                  className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono ${set ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'} hover:opacity-80`}
                                  title={l('Скопировать имя переменной', 'Айнымалы атын көшіру', 'Copy env name')}
                                >
                                  {set ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                                  {v}
                                  <Copy className="w-2.5 h-2.5 opacity-50" />
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* config-kind shows last-saved date */}
                        {d.kind === 'config' && s?.configStatus?.lastSavedAt && (
                          <div className="text-[10px] text-gray-400 mb-2">
                            {l('Сохранено: ', 'Сақталды: ', 'Saved: ')}
                            {new Date(s.configStatus.lastSavedAt).toLocaleDateString('ru-RU')}
                          </div>
                        )}

                        {/* Action row */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isEnv ? (
                            <>
                              {d.helpUrl && (
                                <a href={d.helpUrl} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-700">
                                  {l('Получить ключ', 'Кілт алу', 'Get key')} <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                              <button
                                onClick={() => setEditId(d.id)}
                                className="text-[11px] px-2.5 py-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg inline-flex items-center gap-1"
                              >
                                <SettingsIcon className="w-3 h-3" /> {l('Инструкция', 'Нұсқаулық', 'How to')}
                              </button>
                            </>
                          ) : isOAuth ? (
                            <button disabled className="text-[11px] px-2.5 py-1.5 bg-gray-50 text-gray-400 rounded-lg cursor-not-allowed">
                              <Lock className="w-3 h-3 inline mr-1" />
                              {l('Скоро', 'Жақын арада', 'Soon')}
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => setEditId(d.id)}
                                disabled={!canEdit && !connected}
                                className={`text-[11px] px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 ${
                                  connected
                                    ? 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    : 'bg-gray-900 text-white hover:bg-gray-800'
                                }`}
                              >
                                {connected ? <SettingsIcon className="w-3 h-3" /> : <KeyRound className="w-3 h-3" />}
                                {connected ? l('Изменить', 'Өзгерту', 'Edit') : l('Настроить', 'Баптау', 'Configure')}
                              </button>
                              {connected && canEdit && (
                                <button
                                  onClick={() => disconnect(d)}
                                  className="text-[11px] px-2.5 py-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg inline-flex items-center gap-1"
                                >
                                  <Trash2 className="w-3 h-3" /> {l('Отключить', 'Өшіру', 'Disconnect')}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ─── Configure / Instructions modal ────────────────────── */}
      {editId && (() => {
        const def = catalog.find(d => d.id === editId);
        const s = statuses.find(x => x.id === editId);
        if (!def) return null;
        return (
          <IntegrationModal
            language={language}
            def={def}
            status={s}
            canEdit={canEdit}
            onClose={() => setEditId(null)}
            onSaved={() => { setEditId(null); setToast(l('Сохранено', 'Сақталды', 'Saved')); refresh(); }}
          />
        );
      })()}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 z-[100]">
          <Check className="w-3.5 h-3.5 text-green-400" />
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Configure modal ─────────────────────────────────────────────
// Two paths:
//   - env kind: read-only — shows env var names with copy buttons + helpUrl.
//                 Admin must add them in Railway (security: not editable here).
//   - config kind: form with the per-integration fields, PUT to backend.
function IntegrationModal({
  language, def, status, canEdit, onClose, onSaved,
}: {
  language: 'kz' | 'ru' | 'eng';
  def: IntegrationDef;
  status?: IntegrationStatus;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const [form, setForm] = useState<Record<string, string>>(status?.config || {});
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const isEnv  = def.kind === 'env';

  async function save() {
    if (!canEdit) { setErr(l('Только админ может настраивать', '...', 'Admins only')); return; }
    setBusy(true); setErr(null);
    try {
      await api.put(`/api/integrations/v2/${def.id}/config`, form);
      onSaved();
    } catch (e: any) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
              {logoFor(def.id)}
            </div>
            <div className="min-w-0">
              <div className="text-sm text-gray-900">{def.name}</div>
              <div className="text-[11px] text-gray-400">{def.shortDesc}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {def.longDesc && (
            <p className="text-[11px] text-gray-500 leading-relaxed">{def.longDesc}</p>
          )}
          {def.instructions && (
            <div className="bg-sky-50 border border-sky-100 rounded-xl px-3 py-2 text-[11px] text-sky-800 flex items-start gap-2">
              <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div>{def.instructions}</div>
            </div>
          )}

          {/* ENV — show vars + copy */}
          {isEnv && (
            <div className="space-y-2">
              <div className="text-xs text-gray-900 mb-1">{l('Переменные окружения', 'Айнымалылар', 'Environment variables')}</div>
              {(def.envVars || []).map(v => {
                const set = !!status?.envStatus?.[v];
                return (
                  <div key={v} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
                    <span className={`w-2 h-2 rounded-full ${set ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                    <span className="font-mono text-xs text-gray-900 flex-1">{v}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${set ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {set ? l('задана', 'тағайындалған', 'set') : l('не задана', 'тағайындалмаған', 'not set')}
                    </span>
                    <button
                      onClick={() => navigator.clipboard.writeText(v)}
                      className="px-2 py-1 text-[10px] text-gray-500 hover:text-gray-900 hover:bg-white rounded inline-flex items-center gap-1"
                      title={l('Скопировать имя', '...', 'Copy name')}
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
              <div className="text-[10px] text-gray-400 leading-relaxed">
                {l('Откройте Railway → Project → Variables → New Variable, вставьте имя выше и значение API-ключа. Сервер автоматически подхватит после редеплоя.',
                   '...', 'Open Railway → Variables → New Variable. Paste the name above and your API key. Auto-applies on redeploy.')}
              </div>

              {/* «Как отключить» — для env-интеграций кнопки «Отключить»
                  быть НЕ может (env-vars живут в Railway, не в нашей БД).
                  Вместо обманной кнопки даём чёткую инструкцию. */}
              {(status?.connected) && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-900 mb-1.5 flex items-center gap-1.5">
                    <Power className="w-3 h-3 text-gray-500" />
                    {l('Как отключить эту интеграцию', 'Қалай өшіру керек', 'How to disable')}
                  </div>
                  <ol className="text-[11px] text-gray-600 space-y-1 pl-4 list-decimal">
                    <li>{l('Откройте Railway → этот проект → Variables', '...', 'Open Railway → this project → Variables')}</li>
                    <li>{l('Найдите переменную', '...', 'Find the variable')} <span className="font-mono text-[10px] bg-gray-50 px-1 rounded">{(def.envVars || [])[0]}</span></li>
                    <li>{l('Нажмите Delete (корзина) → Confirm', '...', 'Click Delete → Confirm')}</li>
                    <li>{l('Сервер сам перезапустится за ~30 секунд — интеграция отключится', '...', 'Server auto-redeploys in ~30s — integration goes offline')}</li>
                  </ol>
                  <a
                    href="https://railway.app/dashboard"
                    target="_blank" rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800"
                  >
                    {l('Открыть Railway →', 'Railway-ге өту', 'Open Railway')} <ExternalLink className="w-3 h-3" />
                  </a>
                  <div className="mt-2 text-[10px] text-gray-400 italic">
                    {l('Мы не показываем кнопку «Отключить» здесь, потому что браузер не имеет (и не должен иметь) доступ к env-vars Railway по соображениям безопасности.',
                       '...', 'No «Disconnect» button here — the browser has no (nor should have) access to Railway env vars.')}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CONFIG — form */}
          {def.kind === 'config' && def.configFields && def.configFields.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-gray-900">{l('Поля конфигурации', 'Конфигурация өрістері', 'Configuration fields')}</div>
              {def.configFields.map(f => (
                <div key={f.id}>
                  <div className="text-[10px] text-gray-400 mb-1">
                    {f.label}{f.required && <span className="text-rose-500 ml-0.5">*</span>}
                  </div>
                  <input
                    type={f.type === 'password' ? 'password' : (f.type || 'text')}
                    value={form[f.id] || ''}
                    onChange={e => setForm(prev => ({ ...prev, [f.id]: e.target.value }))}
                    placeholder={f.placeholder || (status?.config?.[f.id] || '')}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 disabled:opacity-50"
                  />
                  {f.hint && <div className="text-[10px] text-gray-400 mt-1">{f.hint}</div>}
                </div>
              ))}
            </div>
          )}

          {def.kind === 'config' && (!def.configFields || def.configFields.length === 0) && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-[11px] text-amber-800">
              {l('Эта интеграция настраивается в отдельном блоке (см. выше).', '...', 'This integration is configured in a separate panel.')}
            </div>
          )}

          {def.helpUrl && (
            <a href={def.helpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800">
              {l('Документация / получить ключ', 'Құжаттама', 'Docs / get keys')} <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {err && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-[11px] text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {err}
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900">
            {l('Закрыть', 'Жабу', 'Close')}
          </button>
          {def.kind === 'config' && (def.configFields?.length || 0) > 0 && canEdit && (
            <button
              onClick={save}
              disabled={busy}
              className="px-4 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              {l('Сохранить', 'Сақтау', 'Save')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
