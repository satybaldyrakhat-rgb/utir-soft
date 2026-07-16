import { useState, useEffect, useCallback } from 'react';
import { Check, RefreshCw, Zap, Users, ShoppingBag, Activity, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../utils/api';
import { useDataStore } from '../utils/dataStore';
import { toast } from '../utils/toast';

interface Props { language: 'kz' | 'ru' | 'eng'; }

type Stats = {
  connected: boolean;
  totals: { events: number; leads: number; purchases: number; purchaseValue: number; errors: number };
  emqApprox: number;
  paramCoverage: number;
  lastEventAt: string | null;
};
type Ev = { eventName: string; dealId?: string | null; value?: number | null; status: string; paramCount?: number; at?: string; created_at?: string };

const GLASS = 'bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl';

export function MetaCapiDashboard({ language }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();
  const canWrite = store.getModuleLevel('settings') === 'full';

  const [cfg, setCfg] = useState<{ pixelId: string; testEventCode: string; connected: boolean } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [creatives, setCreatives] = useState<any[]>([]);
  const [crMeta, setCrMeta] = useState<{ configured: boolean; ok?: boolean; error?: string | null }>({ configured: false });
  const [aud, setAud] = useState<{ adsConfigured: boolean; audienceId: string | null; syncedAt: string | null; count: number } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  // Форма подключения
  const [pixelId, setPixelId] = useState('');
  const [capiToken, setCapiToken] = useState('');
  const [testCode, setTestCode] = useState('');
  const [saving, setSaving] = useState(false);

  const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ');
  const ago = (iso?: string | null) => {
    if (!iso) return '—';
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return l('только что', 'жаңа ғана', 'just now');
    if (mins < 60) return `${mins} ${l('мин назад', 'мин бұрын', 'min ago')}`;
    const h = Math.round(mins / 60);
    return `${h} ${l('ч назад', 'сағ бұрын', 'h ago')}`;
  };

  const load = useCallback(async () => {
    try {
      const c = await api.get<{ pixelId: string; testEventCode: string; connected: boolean }>('/api/meta-capi/config');
      setCfg(c);
      setPixelId(c.pixelId || '');
      setTestCode(c.testEventCode || '');
      if (c.connected) {
        const [s, e, cr, au] = await Promise.all([
          api.get<Stats>('/api/meta-capi/stats').catch(() => null),
          api.get<Ev[]>('/api/meta-capi/events').catch(() => []),
          api.get<{ configured: boolean; ok?: boolean; error?: string | null; creatives: any[] }>('/api/meta-capi/creatives').catch(() => null),
          api.get<{ adsConfigured: boolean; audienceId: string | null; syncedAt: string | null; count: number }>('/api/meta-capi/audience').catch(() => null),
        ]);
        if (s) setStats(s);
        setEvents(e || []);
        if (cr) { setCreatives(cr.creatives || []); setCrMeta({ configured: cr.configured, ok: cr.ok, error: cr.error }); }
        if (au) setAud(au);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const connect = async () => {
    if (!pixelId.trim() || !capiToken.trim()) { toast(l('Заполните Pixel ID и токен', 'Pixel ID мен токенді толтырыңыз', 'Fill Pixel ID and token')); return; }
    setSaving(true);
    try {
      await api.put('/api/meta-capi/config', { pixelId: pixelId.trim(), capiToken: capiToken.trim(), testEventCode: testCode.trim() });
      setCapiToken('');
      toast(l('Meta подключена', 'Meta қосылды', 'Meta connected'), 'success');
      await load();
    } catch { toast(l('Не удалось сохранить', 'Сақталмады', 'Save failed')); }
    finally { setSaving(false); }
  };

  const syncAudience = async () => {
    setSyncing(true);
    try {
      const r = await api.post<{ ok: boolean; count: number }>('/api/meta-capi/audience/sync', {});
      toast(`${l('Выгружено клиентов', 'Клиент жүктелді', 'Clients uploaded')}: ${r.count}`, 'success');
      await load();
    } catch (e: any) {
      const code = String(e?.message || '');
      toast(code === 'meta_ads_not_configured' ? l('Сначала подключите Meta Ads', 'Алдымен Meta Ads қосыңыз', 'Connect Meta Ads first') : l('Не удалось синхронизировать', 'Синхрондау сәтсіз', 'Sync failed'));
    } finally { setSyncing(false); }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const r = await api.post<{ ok: boolean; error?: string; eventsReceived?: number }>('/api/meta-capi/test', {});
      if (r.ok) toast(l('Тест-событие принято Meta ✓', 'Тест-оқиға Meta-ға жетті ✓', 'Test event received by Meta ✓'), 'success');
      else toast(`${l('Ошибка Meta', 'Meta қатесі', 'Meta error')}: ${r.error || ''}`.slice(0, 90));
      await load();
    } catch { toast(l('Тест не удался', 'Тест сәтсіз', 'Test failed')); }
    finally { setTesting(false); }
  };

  if (loading) {
    return <div className={`${GLASS} p-8 flex items-center justify-center text-slate-400`}><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  // ─── Не подключено — форма ──────────────────────────────────────────
  if (!cfg?.connected) {
    return (
      <div className={`${GLASS} p-6`}>
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-sky-50 flex items-center justify-center flex-shrink-0"><Zap className="w-5 h-5 text-sky-600" /></div>
          <div>
            <div className="text-sm text-slate-900 font-medium">{l('Передача данных в Meta (CAPI)', 'Meta-ға деректер (CAPI)', 'Send data to Meta (CAPI)')}</div>
            <div className="text-xs text-slate-500 mt-0.5 max-w-lg">{l('Отправляем заявки и оплаты из CRM прямо в рекламный кабинет — Meta учится на реальных продажах, а не на кликах.', 'Өтінімдер мен төлемдерді CRM-нен жарнама кабинетіне жібереміз.', 'We send leads and payments from CRM to Meta — it learns on real sales.')}</div>
          </div>
        </div>
        {canWrite ? (
          <div className="space-y-2.5 max-w-md">
            <input value={pixelId} onChange={e => setPixelId(e.target.value)} placeholder={l('Pixel ID (он же Dataset ID)', 'Pixel ID (Dataset ID)', 'Pixel ID (Dataset ID)')}
              className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            <input value={capiToken} onChange={e => setCapiToken(e.target.value)} type="password" placeholder={l('Access Token (Events Manager → Settings)', 'Access Token', 'Access Token')}
              className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            <input value={testCode} onChange={e => setTestCode(e.target.value)} placeholder={l('Test Event Code (необязательно, TESTxxxxx)', 'Test Event Code (міндетті емес)', 'Test Event Code (optional)')}
              className="w-full px-3 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            <button onClick={connect} disabled={saving} className="px-4 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all disabled:opacity-40">
              {saving ? l('Подключение…', 'Қосылуда…', 'Connecting…') : l('Подключить Meta', 'Meta қосу', 'Connect Meta')}
            </button>
            <p className="text-[11px] text-slate-400 pt-1">{l('Meta Events Manager → выберите Pixel → Settings → Conversions API → Generate access token.', 'Meta Events Manager → Pixel → Settings → Conversions API → токен.', 'Meta Events Manager → Pixel → Settings → Conversions API → token.')}</p>
          </div>
        ) : (
          <p className="text-xs text-slate-400">{l('Подключение доступно администратору.', 'Қосуды әкімші жасайды.', 'Connection is admin-only.')}</p>
        )}
      </div>
    );
  }

  // ─── Подключено — дашборд ───────────────────────────────────────────
  const t = stats?.totals || { events: 0, leads: 0, purchases: 0, purchaseValue: 0, errors: 0 };
  const healthy = t.errors === 0;
  const kpis = [
    { icon: Activity, label: l('Всего событий', 'Барлық оқиға', 'Total events'), value: fmt(t.events), tint: 'text-sky-600 bg-sky-50' },
    { icon: Users, label: l('Лидов передано', 'Лид жіберілді', 'Leads sent'), value: fmt(t.leads), tint: 'text-violet-600 bg-violet-50' },
    { icon: ShoppingBag, label: l('Покупок передано', 'Сатып алу', 'Purchases sent'), value: fmt(t.purchases), sub: t.purchaseValue ? `${fmt(t.purchaseValue)} ₸` : '', tint: 'text-emerald-600 bg-emerald-50' },
  ];

  return (
    <div className="space-y-4">
      {/* Статус */}
      <div className={`${GLASS} p-5`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${healthy ? 'bg-emerald-50' : 'bg-amber-50'}`}>
              {healthy ? <Check className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-amber-600" />}
            </div>
            <div>
              <div className="text-sm text-slate-900 font-medium">{healthy ? l('Всё работает', 'Бәрі жұмыс істейді', 'All good') : l('Есть ошибки доставки', 'Жеткізу қателері бар', 'Delivery errors')}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {l('Данные передаются в Meta.', 'Деректер Meta-ға жіберіледі.', 'Data is sent to Meta.')} {l('Последнее событие', 'Соңғы оқиға', 'Last event')}: {ago(stats?.lastEventAt)}
                {t.errors > 0 && <span className="text-amber-600"> · {t.errors} {l('с ошибкой', 'қатемен', 'errors')}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="w-9 h-9 flex items-center justify-center bg-white/50 ring-1 ring-white/60 rounded-xl hover:bg-white/80 transition-all"><RefreshCw className="w-4 h-4 text-slate-500" /></button>
            {canWrite && (
              <button onClick={runTest} disabled={testing} className="flex items-center gap-1.5 px-3 py-2 bg-white/50 ring-1 ring-white/60 rounded-xl text-xs text-slate-700 hover:bg-white/80 transition-all disabled:opacity-40">
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-sky-500" />} {l('Проверить', 'Тексеру', 'Test')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {kpis.map((k, i) => (
          <div key={i} className={`${GLASS} p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${k.tint}`}><k.icon className="w-3.5 h-3.5" /></div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wide">{k.label}</div>
            </div>
            <div className="text-2xl text-slate-900 tabular-nums">{k.value}</div>
            {k.sub && <div className="text-[11px] text-emerald-600 mt-0.5">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* EMQ + параметры */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={`${GLASS} p-4`}>
          <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-2">{l('Качество совпадений (EMQ)', 'Сәйкестік сапасы (EMQ)', 'Match quality (EMQ)')}</div>
          <div className="flex items-end gap-2">
            <div className="text-2xl text-slate-900 tabular-nums">{stats?.emqApprox ?? 0}</div>
            <div className="text-xs text-slate-400 mb-1">/ 10</div>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-400 to-emerald-500" style={{ width: `${Math.min(100, (stats?.emqApprox ?? 0) * 10)}%` }} />
          </div>
          <div className="text-[11px] text-slate-400 mt-1.5">{l('Приблизительно. Больше параметров (email, fbc) → выше точность.', 'Шамамен. Көп параметр → дәлдік жоғары.', 'Approximate. More params → higher accuracy.')}</div>
        </div>
        <div className={`${GLASS} p-4`}>
          <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-2">{l('Параметров в событии', 'Оқиғадағы параметр', 'Params per event')}</div>
          <div className="text-2xl text-slate-900 tabular-nums">{stats?.paramCoverage ?? 0}<span className="text-sm text-slate-400"> / 10</span></div>
          <div className="text-[11px] text-slate-400 mt-1.5">{l('Телефон, имя, город, external_id передаются. Добавьте email/fbc для роста EMQ.', 'Телефон, аты, қала, external_id. Email/fbc қосыңыз.', 'Phone, name, city, external_id sent. Add email/fbc.')}</div>
        </div>
      </div>

      {/* Lookalike-аудитория */}
      {aud?.adsConfigured && (
        <div className={`${GLASS} p-5`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-violet-50 flex items-center justify-center flex-shrink-0"><Users className="w-5 h-5 text-violet-600" /></div>
              <div>
                <div className="text-sm text-slate-900 font-medium">{l('Lookalike — похожие на покупателей', 'Lookalike — сатып алушыларға ұқсас', 'Lookalike — similar to buyers')}</div>
                <div className="text-xs text-slate-500 mt-0.5 max-w-lg">
                  {aud.audienceId
                    ? `${l('В аудитории', 'Аудиторияда', 'In audience')}: ${aud.count} ${l('клиентов', 'клиент', 'clients')} · ${l('обновлено', 'жаңартылды', 'updated')} ${ago(aud.syncedAt)}`
                    : l('Выгрузите успешных клиентов в Meta — создайте по ним lookalike-аудиторию в Ads Manager.', 'Сәтті клиенттерді Meta-ға жүктеп, lookalike жасаңыз.', 'Upload successful clients to Meta and build a lookalike in Ads Manager.')}
                </div>
              </div>
            </div>
            {canWrite && (
              <button onClick={syncAudience} disabled={syncing} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-2xl text-xs hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all disabled:opacity-40 flex-shrink-0">
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />} {aud.audienceId ? l('Обновить аудиторию', 'Аудиторияны жаңарту', 'Update audience') : l('Выгрузить клиентов', 'Клиенттерді жүктеу', 'Upload clients')}
              </button>
            )}
          </div>
          {aud.audienceId && <div className="text-[11px] text-slate-400 mt-3">{l('Дальше: Ads Manager → Аудитории → Создать lookalike по этой аудитории.', 'Ары қарай: Ads Manager → Аудиториялар → осы аудитория бойынша lookalike.', 'Next: Ads Manager → Audiences → create a lookalike from this audience.')}</div>}
        </div>
      )}

      {/* ROI по креативам (Meta Marketing API) */}
      <div className={`${GLASS} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-white/60 flex items-center justify-between">
          <span className="text-sm text-slate-900">{l('Аналитика по креативам', 'Креативтер аналитикасы', 'Creative analytics')}</span>
          <span className="text-[11px] text-slate-400">{l('за 30 дней', '30 күн', '30 days')}</span>
        </div>
        {!crMeta.configured ? (
          <div className="px-5 py-6 text-center">
            <div className="text-xs text-slate-500 mb-2">{l('Подключите рекламный аккаунт, чтобы видеть расход и ROI по каждому объявлению.', 'Әр жарнама бойынша шығын мен ROI көру үшін рекламалық аккаунтты қосыңыз.', 'Connect the ad account to see spend and ROI per ad.')}</div>
            <button onClick={() => window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page: 'settings', tab: 'integrations' } }))}
              className="text-xs text-emerald-600 hover:text-emerald-700">{l('Настройки → Интеграции → Meta Ads →', 'Баптаулар → Интеграциялар → Meta Ads →', 'Settings → Integrations → Meta Ads →')}</button>
          </div>
        ) : crMeta.ok === false ? (
          <div className="px-5 py-6 text-center text-xs text-rose-500">{l('Ошибка Meta', 'Meta қатесі', 'Meta error')}: {String(crMeta.error || '').slice(0, 100)}</div>
        ) : creatives.length === 0 ? (
          <div className="px-5 py-6 text-center text-xs text-slate-400">{l('Нет активных объявлений за период.', 'Кезеңде белсенді жарнама жоқ.', 'No active ads for the period.')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="text-[10px] text-slate-400 uppercase tracking-wide border-b border-white/60">
                  <th className="text-left font-normal px-5 py-2.5">{l('Креатив', 'Креатив', 'Creative')}</th>
                  <th className="text-right font-normal px-3 py-2.5">{l('Расход', 'Шығын', 'Spend')}</th>
                  <th className="text-right font-normal px-3 py-2.5">{l('Заявки', 'Өтінім', 'Leads')}</th>
                  <th className="text-right font-normal px-3 py-2.5">{l('Продажи', 'Сатылым', 'Sales')}</th>
                  <th className="text-right font-normal px-3 py-2.5">ROI</th>
                  <th className="text-right font-normal px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/50">
                {creatives.map((c, i) => {
                  const VERDICT_MAP: any = { profit: { l: l('Окупается', 'Өтеледі', 'Profit'), c: 'bg-emerald-50 text-emerald-700' }, even: { l: l('В ноль', 'Нөлде', 'Even'), c: 'bg-amber-50 text-amber-700' }, loss: { l: l('Убыточно', 'Шығынды', 'Loss'), c: 'bg-rose-50 text-rose-600' }, nodata: { l: '—', c: 'bg-slate-50 text-slate-400' } };
                  const vd = VERDICT_MAP[c.verdict] || VERDICT_MAP.nodata;
                  return (
                    <tr key={i} className="hover:bg-white/40">
                      <td className="px-5 py-3 text-slate-800 max-w-[220px] truncate" title={c.adName}>{c.adName}</td>
                      <td className="px-3 py-3 text-right text-slate-600 tabular-nums">{fmt(c.spend)} ₸</td>
                      <td className="px-3 py-3 text-right text-slate-600 tabular-nums">{c.leads}</td>
                      <td className="px-3 py-3 text-right text-slate-900 tabular-nums">{c.purchases}{c.revenue ? <span className="text-slate-400"> · {fmt(c.revenue)} ₸</span> : ''}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-medium text-slate-900">{c.roas != null ? `${c.roas.toFixed(1)}×` : '—'}</td>
                      <td className="px-5 py-3 text-right"><span className={`text-[10px] px-2 py-0.5 rounded-lg ${vd.c}`}>{vd.l}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Последние события */}
      <div className={`${GLASS} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-white/60 text-sm text-slate-900">{l('Последние события', 'Соңғы оқиғалар', 'Recent events')}</div>
        {events.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-400">{l('Пока нет событий. Они появятся при новых заявках и оплатах.', 'Оқиғалар жоқ. Жаңа өтінім/төлемде пайда болады.', 'No events yet.')}</div>
        ) : (
          <div className="divide-y divide-white/50 max-h-80 overflow-y-auto">
            {events.slice(0, 40).map((e, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-3 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.status === 'ok' ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                <span className="text-slate-700 font-medium w-28 flex-shrink-0">{e.eventName}</span>
                <span className="text-slate-400 flex-1 truncate font-mono text-[10px]">{e.dealId ? `#${String(e.dealId).slice(-6)}` : ''}</span>
                {e.value ? <span className="text-slate-900 tabular-nums">{fmt(e.value)} ₸</span> : null}
                <span className="text-slate-400 tabular-nums w-16 text-right">{ago(e.at || e.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
