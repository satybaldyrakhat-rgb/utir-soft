// ─── Marketing dashboard (Реклама / каналы) ─────────────────────────
// Replaces the old AdAnalytics mock. Honest ROI per channel computed from
// REAL data the team already enters: deal.source (where the lead came
// from) + manually recorded ad-spend (expense tx tagged with adChannel).
// No Meta API needed — when that integration ships it can feed the same
// numbers. Answers the marketer's core question: "which channel pays off?".

import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Megaphone, Plus, Users, Percent, Wallet, Target, Loader2, Star, Heart, Link2, Copy, Check, Lightbulb, AlertTriangle, Sparkles } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';
import { api } from '../utils/api';
import { LEAD_SOURCES, PAID_CHANNELS, MARKETING_CATEGORY, computeChannelStats } from '../utils/marketing';

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';

type PeriodKey = 'month' | 'quarter' | 'year' | 'all';

export function MarketingDashboard({ language }: { language: 'kz' | 'ru' | 'eng' }) {
  const store = useDataStore();
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const canWrite = store.getModuleLevel('marketing') === 'full';

  const [period, setPeriod] = useState<PeriodKey>('all');

  // Public lead-form link + builder (источник/кампания → UTM-метки в ссылке).
  const [leadCode, setLeadCode] = useState<string | null>(null);
  const [linkSource, setLinkSource] = useState<string>('Instagram');
  const [linkCampaign, setLinkCampaign] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api.get<{ code: string }>('/api/team/lead-form').then(r => setLeadCode(r.code)).catch(() => {});
  }, []);
  const leadLink = useMemo(() => {
    if (!leadCode) return '';
    const base = `${window.location.origin}/#/lead/${leadCode}`;
    const params = new URLSearchParams();
    if (linkSource) params.set('s', linkSource);
    if (linkCampaign.trim()) params.set('c', linkCampaign.trim());
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [leadCode, linkSource, linkCampaign]);
  const copyLink = () => {
    if (!leadLink) return;
    try { navigator.clipboard?.writeText(leadLink); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const [spendOpen, setSpendOpen] = useState(false);
  const [spend, setSpend] = useState({ channel: PAID_CHANNELS[0] as string, amount: '', date: new Date().toISOString().slice(0, 10), campaign: '' });
  const [saving, setSaving] = useState(false);

  const range = useMemo<[number, number] | null>(() => {
    if (period === 'all') return null;
    const now = new Date(); const start = new Date(now);
    if (period === 'month') start.setMonth(now.getMonth() - 1);
    if (period === 'quarter') start.setMonth(now.getMonth() - 3);
    if (period === 'year') start.setFullYear(now.getFullYear() - 1);
    start.setHours(0, 0, 0, 0);
    return [start.getTime(), now.getTime()];
  }, [period]);
  const inRange = (iso?: string) => {
    if (!range) return true;
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= range[0] && t <= range[1];
  };

  const deals = useMemo(() => store.deals.filter(d => inRange(d.createdAt) || inRange(d.date)), [store.deals, range]);
  const txns = useMemo(() => store.transactions.filter(t => inRange(t.date)), [store.transactions, range]);

  const channels = useMemo(() => computeChannelStats(deals, txns), [deals, txns]);

  // Roll-ups for the KPI strip.
  const totals = useMemo(() => {
    const leads = channels.reduce((s, c) => s + c.leads, 0);
    const won = channels.reduce((s, c) => s + c.won, 0);
    const spendSum = channels.reduce((s, c) => s + c.spend, 0);
    const revenue = channels.reduce((s, c) => s + c.revenue, 0);
    return {
      leads, won, spend: spendSum, revenue,
      conversion: leads > 0 ? Math.round((won / leads) * 100) : 0,
      cpl: leads > 0 ? spendSum / leads : 0,
      romi: spendSum > 0 ? Math.round(((revenue - spendSum) / spendSum) * 100) : null,
    };
  }, [channels]);

  // Campaign breakdown — only deals that carry a campaign tag.
  const campaigns = useMemo(() => {
    const m = new Map<string, { campaign: string; source: string; leads: number; won: number; revenue: number }>();
    for (const d of deals) {
      if (!d.campaign) continue;
      const key = d.campaign;
      const row = m.get(key) || { campaign: d.campaign, source: d.source || '—', leads: 0, won: 0, revenue: 0 };
      row.leads += 1;
      if ((d.paidAmount || 0) > 0 && !/reject|отказ/i.test(d.status)) row.won += 1;
      row.revenue += d.paidAmount || 0;
      m.set(key, row);
    }
    return Array.from(m.values()).sort((a, b) => b.leads - a.leads);
  }, [deals]);

  // Reviews (отзывы) — collected via the public Trackpage after completion.
  const reviews = useMemo(() => {
    const withReview = store.deals.filter(d => d.review && d.review.rating > 0);
    const avg = withReview.length ? withReview.reduce((s, d) => s + (d.review!.rating), 0) / withReview.length : 0;
    return {
      avg: Math.round(avg * 10) / 10,
      count: withReview.length,
      list: withReview.slice().sort((a, b) => (b.review!.at || '').localeCompare(a.review!.at || '')),
    };
  }, [store.deals]);

  // Сарафан (referrals) — кто привёл клиентов.
  const referrers = useMemo(() => {
    const m = new Map<string, number>();
    store.deals.forEach(d => { if (d.referrerName) m.set(d.referrerName, (m.get(d.referrerName) || 0) + 1); });
    return Array.from(m.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [store.deals]);

  // Auto-insights — подсказки «куда вкладывать бюджет», из тех же цифр.
  type Insight = { tone: 'good' | 'bad' | 'info'; text: string };
  const insights = useMemo<Insight[]>(() => {
    const out: Insight[] = [];
    const withSpend = channels.filter(c => c.spend > 0 && c.romi !== null);
    const losing = withSpend.filter(c => (c.romi as number) < 0).sort((a, b) => (a.romi as number) - (b.romi as number));
    const best = withSpend.slice().sort((a, b) => (b.romi as number) - (a.romi as number))[0];
    const exp = withSpend.slice().sort((a, b) => b.cpl - a.cpl)[0];
    const conv = channels.filter(c => c.leads >= 3).slice().sort((a, b) => b.conversion - a.conversion)[0];

    if (losing[0]) out.push({ tone: 'bad', text: l(
      `Канал «${losing[0].source}» убыточен: ROMI ${losing[0].romi}%. Пересмотрите креатив или приостановите.`,
      `«${losing[0].source}» арнасы шығынды: ROMI ${losing[0].romi}%. Креативті қайта қараңыз.`,
      `Channel "${losing[0].source}" is unprofitable: ROMI ${losing[0].romi}%. Rework or pause it.`) });
    if (best && (best.romi as number) > 0 && best.source !== losing[0]?.source) out.push({ tone: 'good', text: l(
      `Лучше всех окупается «${best.source}»: ROMI ${best.romi}%. Можно увеличить бюджет.`,
      `Ең жақсы өтелетін «${best.source}»: ROMI ${best.romi}%. Бюджетті көбейтуге болады.`,
      `Best return: "${best.source}" at ROMI ${best.romi}%. Consider scaling it.`) });
    if (conv && out.length < 3) out.push({ tone: 'good', text: l(
      `Лучшая конверсия у «${conv.source}» — ${conv.conversion}% лидов в продажу.`,
      `Ең жоғары конверсия «${conv.source}» — ${conv.conversion}%.`,
      `Best conversion: "${conv.source}" — ${conv.conversion}% of leads close.`) });
    if (exp && out.length < 3 && exp.source !== best?.source) out.push({ tone: 'info', text: l(
      `Самый дорогой лид — «${exp.source}»: ${fmt(exp.cpl)} за заявку.`,
      `Ең қымбат лид — «${exp.source}»: өтінім үшін ${fmt(exp.cpl)}.`,
      `Priciest lead — "${exp.source}": ${fmt(exp.cpl)} per inquiry.`) });
    if (withSpend.length === 0 && totals.leads > 0) out.push({ tone: 'info', text: l(
      'Внесите рекламный расход — увидите стоимость лида и окупаемость по каналам.',
      'Жарнама шығынын енгізіңіз — лид құны мен өтелуін көресіз.',
      'Add ad spend to see cost per lead and ROI per channel.') });
    return out.slice(0, 4);
  }, [channels, totals, language]);

  const addSpend = () => {
    const amt = Number(spend.amount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    store.addTransaction({
      type: 'expense',
      category: MARKETING_CATEGORY,
      amount: amt,
      date: spend.date,
      status: 'completed',
      adChannel: spend.channel,
      description: spend.campaign.trim()
        ? `${l('Реклама', 'Жарнама', 'Ads')}: ${spend.channel} · ${spend.campaign.trim()}`
        : `${l('Реклама', 'Жарнама', 'Ads')}: ${spend.channel}`,
    });
    setSpend({ channel: PAID_CHANNELS[0], amount: '', date: new Date().toISOString().slice(0, 10), campaign: '' });
    setSpendOpen(false);
    setTimeout(() => setSaving(false), 300);
  };

  const PERIODS: { id: PeriodKey; label: string }[] = [
    { id: 'month', label: l('Месяц', 'Ай', 'Month') },
    { id: 'quarter', label: l('Квартал', 'Тоқсан', 'Quarter') },
    { id: 'year', label: l('Год', 'Жыл', 'Year') },
    { id: 'all', label: l('Всё время', 'Барлық уақыт', 'All time') },
  ];

  const kpis = [
    { label: l('Лидов', 'Лидтер', 'Leads'), value: String(totals.leads), icon: Users, cls: 'bg-sky-50 text-sky-600' },
    { label: l('Конверсия', 'Конверсия', 'Conversion'), value: `${totals.conversion}%`, icon: Percent, cls: 'bg-emerald-50 text-emerald-600' },
    { label: l('Расход на рекламу', 'Жарнама шығыны', 'Ad spend'), value: fmt(totals.spend), icon: Wallet, cls: 'bg-rose-50 text-rose-600' },
    { label: l('Стоимость лида', 'Лид құны', 'Cost / lead'), value: totals.spend > 0 ? fmt(totals.cpl) : '—', icon: Target, cls: 'bg-amber-50 text-amber-600' },
    { label: 'ROMI', value: totals.romi === null ? '—' : `${totals.romi}%`, icon: TrendingUp, cls: 'bg-violet-50 text-violet-600' },
  ];

  return (
    <div className="space-y-4">
      {/* Header row — period + add-spend */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-xl text-xs ring-1 transition-all ${period === p.id ? 'bg-emerald-600 text-white ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]' : 'bg-white/50 text-slate-600 ring-white/60 hover:bg-white/80 backdrop-blur-xl'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {canWrite && (
          <button onClick={() => setSpendOpen(v => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs ring-1 ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)] transition-colors">
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> {l('Внести расход на рекламу', 'Жарнама шығынын енгізу', 'Add ad spend')}
          </button>
        )}
      </div>

      {/* Add-spend inline form */}
      {spendOpen && canWrite && (
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
          <div className="sm:col-span-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{l('Канал', 'Арна', 'Channel')}</div>
            <select value={spend.channel} onChange={e => setSpend({ ...spend, channel: e.target.value })}
              className="w-full px-3 py-2 bg-white/60 ring-1 ring-white/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              {LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{l('Сумма ₸', 'Сома ₸', 'Amount ₸')}</div>
            <input type="number" value={spend.amount} onChange={e => setSpend({ ...spend, amount: e.target.value })} placeholder="200000"
              className="w-full px-3 py-2 bg-white/60 ring-1 ring-white/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{l('Дата', 'Күні', 'Date')}</div>
            <input type="date" value={spend.date} onChange={e => setSpend({ ...spend, date: e.target.value })}
              className="w-full px-3 py-2 bg-white/60 ring-1 ring-white/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{l('Кампания', 'Науқан', 'Campaign')}</div>
            <input value={spend.campaign} onChange={e => setSpend({ ...spend, campaign: e.target.value })} placeholder={l('необязательно', 'міндетті емес', 'optional')}
              className="w-full px-3 py-2 bg-white/60 ring-1 ring-white/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <button onClick={addSpend} disabled={saving || !spend.amount}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs ring-1 ring-white/10 transition-colors disabled:opacity-40">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : l('Добавить', 'Қосу', 'Add')}
          </button>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <div key={i} className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">{k.label}</div>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${k.cls}`}><Icon className="w-3.5 h-3.5" strokeWidth={1.5} /></div>
              </div>
              <div className="text-base text-gray-900 tabular-nums">{k.value}</div>
            </div>
          );
        })}
      </div>

      {/* Auto-insights — что делать с бюджетом */}
      {insights.length > 0 && (
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-violet-500" strokeWidth={1.5} />
            <span className="text-sm text-gray-900">{l('Подсказки по рекламе', 'Жарнама бойынша кеңестер', 'Marketing insights')}</span>
          </div>
          <div className="space-y-2">
            {insights.map((ins, i) => {
              const Icon = ins.tone === 'bad' ? AlertTriangle : ins.tone === 'good' ? TrendingUp : Lightbulb;
              const cls = ins.tone === 'bad' ? 'bg-rose-50 text-rose-600' : ins.tone === 'good' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600';
              return (
                <div key={i} className="flex items-start gap-2.5">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${cls}`}><Icon className="w-3.5 h-3.5" strokeWidth={1.5} /></div>
                  <div className="text-xs text-gray-700 leading-snug pt-0.5">{ins.text}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lead-form link builder — paste in Instagram bio / ads, leads land
          in the funnel tagged with this source+campaign for clean ROI. */}
      {canWrite && leadCode && (
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-3.5 h-3.5 text-emerald-600" strokeWidth={1.5} />
            <span className="text-sm text-gray-900">{l('Ссылка на форму заявки', 'Өтінім сілтемесі', 'Lead form link')}</span>
          </div>
          <div className="text-[11px] text-gray-400 mb-3 leading-relaxed">
            {l('Выберите канал и кампанию — ссылку вставьте в Instagram-bio или рекламу. Заявки попадут в воронку с этой меткой, и вы увидите, какая реклама даёт клиентов.',
               'Арна мен науқанды таңдаңыз — сілтемені Instagram-bio немесе жарнамаға қойыңыз.',
               'Pick channel + campaign — paste the link in your Instagram bio or ad. Leads land in the funnel with this tag.')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <select value={linkSource} onChange={e => setLinkSource(e.target.value)}
              className="w-full px-3 py-2 bg-white/60 ring-1 ring-white/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              {LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}
            </select>
            <input value={linkCampaign} onChange={e => setLinkCampaign(e.target.value)} placeholder={l('Кампания (необязательно)', 'Науқан', 'Campaign (optional)')}
              className="w-full px-3 py-2 bg-white/60 ring-1 ring-white/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex items-center gap-2">
            <input readOnly value={leadLink} onFocus={e => e.currentTarget.select()}
              className="flex-1 min-w-0 px-3 py-2 bg-gray-50 ring-1 ring-white/60 rounded-xl text-xs text-gray-600 focus:outline-none" />
            <button onClick={copyLink}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs ring-1 ring-white/10 transition-colors flex-shrink-0">
              {copied ? <Check className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {copied ? l('Скопировано', 'Көшірілді', 'Copied') : l('Копировать', 'Көшіру', 'Copy')}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {channels.length === 0 ? (
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-10 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/60 ring-1 ring-white/60 shadow-[0_8px_24px_-10px_rgba(15,23,42,0.18)] flex items-center justify-center text-slate-500"><Megaphone className="w-6 h-6" strokeWidth={1.5} /></div>
          <div className="text-sm text-slate-900 mb-1">{l('Пока нет данных по каналам', 'Арналар бойынша дерек жоқ', 'No channel data yet')}</div>
          <div className="text-[11px] text-slate-400 leading-relaxed max-w-md mx-auto">
            {l('Указывайте «Источник» и «Кампанию» при создании сделки, а сюда вносите рекламный расход — посчитаем стоимость лида и ROMI по каждому каналу.',
               'Мәміле жасағанда «Көзі» мен «Науқанды» көрсетіңіз, мұнда жарнама шығынын енгізіңіз.',
               'Set Source & Campaign on new deals and record ad spend here — we compute cost per lead and ROMI per channel.')}
          </div>
        </div>
      ) : (
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl overflow-hidden">
          <div className="px-5 py-3.5 text-sm text-gray-900 border-b border-white/60">{l('Эффективность каналов', 'Арналар тиімділігі', 'Channel performance')}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-50">
                  <th className="px-4 py-2.5 font-normal">{l('Канал', 'Арна', 'Channel')}</th>
                  <th className="px-3 py-2.5 font-normal text-right">{l('Лиды', 'Лидтер', 'Leads')}</th>
                  <th className="px-3 py-2.5 font-normal text-right">{l('Продажи', 'Сатылым', 'Sales')}</th>
                  <th className="px-3 py-2.5 font-normal text-right">{l('Конв.', 'Конв.', 'Conv.')}</th>
                  <th className="px-3 py-2.5 font-normal text-right">{l('Расход', 'Шығын', 'Spend')}</th>
                  <th className="px-3 py-2.5 font-normal text-right">CPL</th>
                  <th className="px-3 py-2.5 font-normal text-right">{l('Выручка', 'Түсім', 'Revenue')}</th>
                  <th className="px-3 py-2.5 font-normal text-right">ROMI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {channels.map(c => (
                  <tr key={c.source} className="hover:bg-white/40">
                    <td className="px-4 py-2.5 text-gray-800">{c.source}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{c.leads}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{c.won}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{c.conversion}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{c.spend > 0 ? fmt(c.spend) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{c.spend > 0 ? fmt(c.cpl) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">{fmt(c.revenue)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${c.romi === null ? 'text-gray-400' : c.romi >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {c.romi === null ? '—' : `${c.romi}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2.5 text-[10px] text-gray-400 border-t border-gray-50 leading-relaxed">
            {l('CPL — стоимость лида (расход ÷ лиды). ROMI — окупаемость рекламы ((выручка − расход) ÷ расход). Выручка — фактически полученные деньги.',
               'CPL — лид құны. ROMI — жарнаманың өтелуі. Түсім — нақты түскен ақша.',
               'CPL — cost per lead. ROMI — return on marketing investment. Revenue — money actually received.')}
          </div>
        </div>
      )}

      {/* Campaign breakdown */}
      {campaigns.length > 0 && (
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl overflow-hidden">
          <div className="px-5 py-3.5 text-sm text-gray-900 border-b border-white/60">{l('По кампаниям', 'Науқандар бойынша', 'By campaign')}</div>
          <div className="divide-y divide-gray-50">
            {campaigns.map((c, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between text-xs">
                <div className="min-w-0">
                  <div className="text-gray-800 truncate">{c.campaign}</div>
                  <div className="text-[10px] text-gray-400">{c.source}</div>
                </div>
                <div className="flex items-center gap-4 tabular-nums flex-shrink-0">
                  <span className="text-gray-500">{c.leads} {l('лид.', 'лид', 'leads')}</span>
                  <span className="text-gray-500">{c.won} {l('прод.', 'сат.', 'sales')}</span>
                  <span className="text-gray-900 w-28 text-right">{fmt(c.revenue)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reviews + Referrals (отзывы + сарафан) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Отзывы клиентов */}
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl overflow-hidden">
          <div className="px-5 py-3.5 flex items-center justify-between border-b border-white/60">
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.5} />
              <span className="text-sm text-gray-900">{l('Отзывы клиентов', 'Клиент пікірлері', 'Client reviews')}</span>
            </div>
            {reviews.count > 0 && (
              <span className="text-[11px] text-gray-500 tabular-nums">★ {reviews.avg} · {reviews.count}</span>
            )}
          </div>
          {reviews.count === 0 ? (
            <div className="px-5 py-6 text-center text-[11px] text-gray-400 leading-relaxed">
              {l('Отзывы появятся, когда клиенты оценят заказ на странице отслеживания (после завершения).',
                 'Тапсырыс аяқталған соң клиенттер бағалағанда пікірлер пайда болады.',
                 'Reviews appear once clients rate a completed order on the tracking page.')}
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {reviews.list.map(d => (
                <div key={d.id} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-gray-800 truncate">{d.customerName}</span>
                    <span className="text-[11px] text-amber-500 tabular-nums flex-shrink-0">{'★'.repeat(d.review!.rating)}<span className="text-gray-200">{'★'.repeat(5 - d.review!.rating)}</span></span>
                  </div>
                  {d.review!.text && <div className="text-[11px] text-gray-500 leading-snug">{d.review!.text}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Сарафан */}
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl overflow-hidden">
          <div className="px-5 py-3.5 flex items-center gap-2 border-b border-white/60">
            <Heart className="w-3.5 h-3.5 text-rose-400" strokeWidth={1.5} />
            <span className="text-sm text-gray-900">{l('Сарафан — кто рекомендует', 'Сарафан — кім ұсынады', 'Referrals')}</span>
          </div>
          {referrers.length === 0 ? (
            <div className="px-5 py-6 text-center text-[11px] text-gray-400 leading-relaxed">
              {l('При создании сделки с источником «Рекомендация» укажите, кто порекомендовал — здесь увидите ваших адвокатов бренда.',
                 'Мәмілені «Ұсыныс» көзімен жасағанда кім ұсынғанын көрсетіңіз.',
                 'When creating a deal from "Referral", note who referred — your brand advocates show up here.')}
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {referrers.map((r, i) => (
                <div key={i} className="px-5 py-2.5 flex items-center justify-between text-xs">
                  <span className="text-gray-800 truncate">{r.name}</span>
                  <span className="text-gray-500 tabular-nums flex-shrink-0">{r.count} {l('привёл', 'әкелді', 'referred')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
