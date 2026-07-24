// ─── Дашборд владельца платформы (super-admin) ────────────────────────
// Отдельный полноэкранный командный центр: все команды-клиенты,
// подписки, пользователи, активность, ошибки, канбан по оплате.
// Дизайн: macOS Tahoe (liquid glass — глубина, матовое стекло, крупные
// радиусы, мягкие тени) × ChatGPT (спокойная типографика, воздух,
// сдержанная палитра). Доступ гейтится на бэкенде (/api/owner/*).

import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, KanbanSquare, Users2, Activity, Bug, X, Search, LogOut,
  TrendingUp, Wallet, Building2, CircleDollarSign, ArrowUpRight, AlertTriangle,
  Clock, Ban, ShieldCheck, ChevronRight, Loader2, Check, Zap, UserCog, Radio,
  ListTodo, Plus, Trash2, Sparkles, Receipt, TrendingDown, Image as ImageIcon, MessageSquare,
  Database, Download, ShieldAlert, Inbox, Phone, Mail,
} from 'lucide-react';
import { api, getToken } from '../utils/api';
import { toast } from '../utils/toast';
import { confirmDialog } from '../utils/confirm';

// ─── Типы ответов API ─────────────────────────────────────────────────
type SubPeriod = 'monthly' | 'semiannual' | 'annual';
type SubStatus = 'trial' | 'active' | 'past_due' | 'churned';
interface Subscription {
  plan: string; amount: number; currency: string; period: SubPeriod;
  status: SubStatus; startedAt: string; expiresAt: string; suspended: boolean; note: string;
}
interface TeamSummary {
  teamId: string; name: string; email: string; company: string; createdAt: string;
  users: { total: number; admins: number; managers: number; employees: number };
  usage: { deals: number; transactions: number; products: number; tasks: number; revenue: number };
  lastActivityAt: string | null; integrations: string[]; subscription: Subscription;
}
interface Overview {
  totals: { teams: number; users: number; mrr: number; contracted: number };
  subs: { active: number; trial: number; pastDue: number; churned: number };
  signals: { newThisMonth: number; activeUsers: number; expiringSoon: number; atRisk: number };
  growth: { m: string; count: number }[];
}

// ─── Утилиты ──────────────────────────────────────────────────────────
const KZT = (n: number) => (n || 0).toLocaleString('ru-RU') + ' ₸';
const KZTm = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1).replace('.0', '') + 'М ₸' : n >= 1000 ? Math.round(n / 1000) + 'К ₸' : (n || 0) + ' ₸';
const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const ago = (s?: string | null) => {
  if (!s) return 'никогда';
  const d = (Date.now() - new Date(s).getTime()) / 86400000;
  if (d < 1) return 'сегодня'; if (d < 2) return 'вчера';
  if (d < 30) return `${Math.floor(d)} дн. назад`;
  return `${Math.floor(d / 30)} мес. назад`;
};
const daysLeft = (s: string) => Math.ceil((new Date(s).getTime() - Date.now()) / 86400000);

const STATUS_META: Record<SubStatus, { label: string; dot: string; chip: string }> = {
  trial:    { label: 'Триал',     dot: 'bg-sky-400',     chip: 'bg-sky-50 text-sky-700 ring-sky-100' },
  active:   { label: 'Активна',   dot: 'bg-emerald-400', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  past_due: { label: 'Просрочка', dot: 'bg-amber-400',   chip: 'bg-amber-50 text-amber-700 ring-amber-100' },
  churned:  { label: 'Отказ',     dot: 'bg-rose-400',    chip: 'bg-rose-50 text-rose-600 ring-rose-100' },
};
const PERIOD_LABEL: Record<SubPeriod, string> = { monthly: 'Месяц', semiannual: '6 месяцев', annual: 'Год' };

// ─── Стеклянная панель (Tahoe) ────────────────────────────────────────
function Glass({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/60 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_18px_50px_-24px_rgba(30,27,75,0.35),inset_0_1px_0_0_rgba(255,255,255,0.7)] rounded-[26px] ${className}`}>
      {children}
    </div>
  );
}

// ─── Корень ───────────────────────────────────────────────────────────
type Tab = 'overview' | 'leads' | 'kanban' | 'teams' | 'finance' | 'roadmap' | 'users' | 'activity' | 'errors';

export function OwnerDashboard({ onExit }: { onExit: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);
  const [openTeam, setOpenTeam] = useState<string | null>(null);

  const loadTeams = async () => {
    try { setTeams(await api.get<TeamSummary[]>('/api/owner/teams')); }
    catch { toast('Не удалось загрузить команды', 'error'); }
  };
  useEffect(() => { loadTeams(); }, []);

  const NAV: { id: Tab; icon: any; label: string }[] = [
    { id: 'overview', icon: LayoutDashboard, label: 'Обзор' },
    { id: 'leads',    icon: Inbox,           label: 'Заявки' },
    { id: 'kanban',   icon: KanbanSquare,    label: 'Подписки' },
    { id: 'teams',    icon: Building2,       label: 'Команды' },
    { id: 'finance',  icon: Wallet,          label: 'Финансы' },
    { id: 'roadmap',  icon: ListTodo,        label: 'Задачи' },
    { id: 'users',    icon: Users2,          label: 'Пользователи' },
    { id: 'activity', icon: Activity,        label: 'Активность' },
    { id: 'errors',   icon: Bug,             label: 'Ошибки' },
  ];

  return (
    <div className="min-h-screen w-full text-slate-800 relative overflow-x-hidden">
      {/* Ambient Tahoe backdrop — мягкий градиент с цветными пятнами */}
      <div className="fixed inset-0 -z-10 bg-[#eef1f8]" />
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-24 w-[46rem] h-[46rem] rounded-full bg-indigo-300/30 blur-[120px]" />
        <div className="absolute top-1/3 -right-32 w-[40rem] h-[40rem] rounded-full bg-sky-300/25 blur-[120px]" />
        <div className="absolute -bottom-40 left-1/4 w-[42rem] h-[42rem] rounded-full bg-violet-300/20 blur-[130px]" />
      </div>

      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight text-slate-900">Центр управления</div>
              <div className="text-[11px] text-slate-400 -mt-0.5">Владелец платформы · Utir Soft</div>
            </div>
          </div>
          <button onClick={onExit} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs text-slate-500 hover:text-slate-900 bg-white/50 hover:bg-white/80 ring-1 ring-white/60 rounded-xl backdrop-blur-xl transition-all">
            <LogOut className="w-3.5 h-3.5" /> В платформу
          </button>
        </div>

        {/* Segmented nav */}
        <Glass className="p-1.5 mb-6 inline-flex flex-wrap gap-1">
          {NAV.map(n => {
            const active = tab === n.id;
            return (
              <button key={n.id} onClick={() => setTab(n.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs transition-all ${active ? 'bg-white text-slate-900 shadow-[0_4px_14px_-6px_rgba(30,27,75,0.35)] ring-1 ring-white/80' : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'}`}>
                <n.icon className={`w-4 h-4 ${active ? 'text-indigo-500' : ''}`} /> {n.label}
              </button>
            );
          })}
        </Glass>

        {tab === 'overview' && <OverviewTab />}
        {tab === 'leads'    && <LeadsTab />}
        {tab === 'kanban'   && <KanbanTab teams={teams} reload={loadTeams} onOpen={setOpenTeam} />}
        {tab === 'teams'    && <TeamsTab teams={teams} onOpen={setOpenTeam} />}
        {tab === 'finance'  && <FinanceTab />}
        {tab === 'roadmap'  && <RoadmapTab />}
        {tab === 'users'    && <UsersTab teams={teams} />}
        {tab === 'activity' && <ActivityTab teams={teams} />}
        {tab === 'errors'   && <ErrorsTab />}
      </div>

      {openTeam && <TeamDrawer teamId={openTeam} onClose={() => setOpenTeam(null)} onChanged={loadTeams} />}
    </div>
  );
}

// ─── Обзор ────────────────────────────────────────────────────────────
function OverviewTab() {
  const [ov, setOv] = useState<Overview | null>(null);
  useEffect(() => { api.get<Overview>('/api/owner/overview').then(setOv).catch(() => {}); }, []);
  if (!ov) return <Skeleton />;

  const kpis = [
    { icon: Building2,        label: 'Команд',        value: ov.totals.teams,            sub: `+${ov.signals.newThisMonth} за месяц`, tint: 'from-indigo-500 to-blue-500' },
    { icon: CircleDollarSign, label: 'MRR',           value: KZTm(ov.totals.mrr),        sub: `${KZT(ov.totals.contracted)} законтрактовано`, tint: 'from-emerald-500 to-teal-500' },
    { icon: Users2,          label: 'Пользователей',  value: ov.totals.users,            sub: `${ov.signals.activeUsers} активны`, tint: 'from-violet-500 to-purple-500' },
    { icon: Wallet,          label: 'Активных подписок', value: ov.subs.active,          sub: `${ov.subs.trial} на триале`, tint: 'from-sky-500 to-cyan-500' },
  ];
  const signals = [
    { icon: TrendingUp,     label: 'Новые за месяц',  value: ov.signals.newThisMonth,  good: true },
    { icon: Zap,            label: 'Активно исп.',    value: ov.signals.activeUsers,   good: true },
    { icon: Clock,          label: 'Скоро истекает',  value: ov.signals.expiringSoon,  warn: true },
    { icon: AlertTriangle,  label: 'Риск оттока',     value: ov.signals.atRisk,        warn: true },
  ];
  const maxG = Math.max(1, ...ov.growth.map(g => g.count));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <Glass key={i} className="p-5">
            <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${k.tint} flex items-center justify-center shadow-lg mb-3`}>
              <k.icon className="w-5 h-5 text-white" />
            </div>
            <div className="text-[11px] text-slate-400">{k.label}</div>
            <div className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{k.value}</div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-emerald-500" />{k.sub}</div>
          </Glass>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Growth chart */}
        <Glass className="p-5 lg:col-span-2">
          <div className="text-sm text-slate-900 mb-1">Рост команд</div>
          <div className="text-[11px] text-slate-400 mb-4">Новые команды по месяцам (12 мес)</div>
          <div className="flex items-end gap-1.5 h-40">
            {ov.growth.map((g, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
                <div className="w-full rounded-lg bg-gradient-to-t from-indigo-400 to-violet-400 transition-all group-hover:from-indigo-500 group-hover:to-violet-500 relative" style={{ height: `${(g.count / maxG) * 100}%`, minHeight: g.count ? '6px' : '2px', opacity: g.count ? 1 : 0.25 }}>
                  {g.count > 0 && <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">{g.count}</div>}
                </div>
                <div className="text-[9px] text-slate-400">{g.m}</div>
              </div>
            ))}
          </div>
        </Glass>

        {/* Signals */}
        <Glass className="p-5">
          <div className="text-sm text-slate-900 mb-4">Сигналы</div>
          <div className="space-y-2.5">
            {signals.map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${s.warn ? 'bg-amber-50 text-amber-500' : 'bg-emerald-50 text-emerald-500'}`}><s.icon className="w-4 h-4" /></div>
                  <span className="text-xs text-slate-600">{s.label}</span>
                </div>
                <span className="text-lg font-semibold tabular-nums text-slate-900">{s.value}</span>
              </div>
            ))}
          </div>
        </Glass>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Subscription status bar */}
        <Glass className="p-5 lg:col-span-2">
          <div className="text-sm text-slate-900 mb-4">Подписки по статусам</div>
          <div className="flex gap-2">
            {([['active', ov.subs.active], ['trial', ov.subs.trial], ['past_due', ov.subs.pastDue], ['churned', ov.subs.churned]] as [SubStatus, number][]).map(([st, n]) => {
              const total = Math.max(1, ov.subs.active + ov.subs.trial + ov.subs.pastDue + ov.subs.churned);
              return (
                <div key={st} className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1.5"><span className={`w-2 h-2 rounded-full ${STATUS_META[st].dot}`} /><span className="text-[11px] text-slate-500 truncate">{STATUS_META[st].label}</span><span className="text-[11px] text-slate-900 ml-auto tabular-nums">{n}</span></div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${STATUS_META[st].dot}`} style={{ width: `${(n / total) * 100}%` }} /></div>
                </div>
              );
            })}
          </div>
        </Glass>
        <BackupCard />
      </div>
    </div>
  );
}

// ─── Резервные копии базы ─────────────────────────────────────────────
function BackupCard() {
  const [backups, setBackups] = useState<{ file: string; size: number; at: string }[] | null>(null);
  const [dl, setDl] = useState(false);
  const refresh = () => api.get<{ backups: any[] }>('/api/owner/backup/status').then(r => setBackups(r.backups)).catch(() => setBackups([]));
  useEffect(() => { refresh(); }, []);
  const last = backups?.[0];
  const stale = last ? (Date.now() - new Date(last.at).getTime()) > 2 * 86400000 : true;

  const download = async () => {
    setDl(true);
    try {
      const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
      const res = await fetch(`${base}/api/owner/backup/download`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `utir-backup-${new Date().toISOString().slice(0, 10)}.db`; a.click();
      URL.revokeObjectURL(url);
      toast('Свежий бэкап скачан', 'success'); refresh();
    } catch { toast('Не удалось скачать бэкап', 'error'); } finally { setDl(false); }
  };

  return (
    <Glass className="p-5">
      <div className="flex items-center gap-2 mb-1"><Database className="w-4 h-4 text-indigo-500" /><div className="text-sm text-slate-900">Резервные копии</div></div>
      <div className="text-[11px] text-slate-400 mb-3">Авто-бэкап раз в сутки</div>
      <div className={`flex items-center gap-2 text-[11px] mb-3 px-2.5 py-2 rounded-xl ${stale ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
        {stale ? <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" /> : <Check className="w-3.5 h-3.5 flex-shrink-0" />}
        <span>{last ? `Последний: ${fmtDate(last.at)} · ${Math.round(last.size / 1024)} КБ` : 'Бэкапов пока нет'}</span>
      </div>
      <button onClick={download} disabled={dl} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs hover:bg-indigo-700 disabled:opacity-50">
        {dl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Скачать свежий бэкап
      </button>
      <div className="text-[10px] text-slate-300 mt-2 leading-relaxed">Скачивайте офсайт-копию регулярно — это защита от потери диска сервера.</div>
    </Glass>
  );
}

// ─── Канбан ───────────────────────────────────────────────────────────
// Колонки: Триал / Активные (месяц) / Оплата 6 мес / Оплата год /
// Просрочка / Отказ. Перетаскивание карточки в колонку меняет статус/период.
const COLS: { id: string; label: string; match: (s: Subscription) => boolean; apply: Partial<Subscription>; accent: string }[] = [
  { id: 'trial',    label: 'Триал',        match: s => s.status === 'trial',                          apply: { status: 'trial' },                       accent: 'sky' },
  { id: 'monthly',  label: 'Активные · месяц', match: s => s.status === 'active' && s.period === 'monthly', apply: { status: 'active', period: 'monthly' },   accent: 'emerald' },
  { id: 'semi',     label: 'Оплата · 6 мес',   match: s => s.status === 'active' && s.period === 'semiannual', apply: { status: 'active', period: 'semiannual' }, accent: 'emerald' },
  { id: 'annual',   label: 'Оплата · год',     match: s => s.status === 'active' && s.period === 'annual', apply: { status: 'active', period: 'annual' },     accent: 'emerald' },
  { id: 'past_due', label: 'Просрочка',    match: s => s.status === 'past_due',                       apply: { status: 'past_due' },                    accent: 'amber' },
  { id: 'churned',  label: 'Отказ',        match: s => s.status === 'churned',                        apply: { status: 'churned' },                     accent: 'rose' },
];

function KanbanTab({ teams, reload, onOpen }: { teams: TeamSummary[] | null; reload: () => void; onOpen: (id: string) => void }) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  if (!teams) return <Skeleton />;

  const drop = async (colId: string) => {
    const col = COLS.find(c => c.id === colId); const teamId = drag;
    setDrag(null); setOver(null);
    if (!col || !teamId) return;
    const team = teams.find(t => t.teamId === teamId);
    if (team && col.match(team.subscription)) return; // уже в этой колонке
    try {
      await api.patch(`/api/owner/teams/${teamId}/subscription`, col.apply);
      toast('Статус подписки обновлён', 'success');
      reload();
    } catch { toast('Не удалось обновить', 'error'); }
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
      {COLS.map(col => {
        const items = teams.filter(t => col.match(t.subscription));
        const sum = items.reduce((s, t) => s + (t.subscription.status !== 'churned' && t.subscription.status !== 'trial' ? t.subscription.amount : 0), 0);
        return (
          <div key={col.id}
            onDragOver={e => { e.preventDefault(); setOver(col.id); }}
            onDragLeave={() => setOver(o => o === col.id ? null : o)}
            onDrop={() => drop(col.id)}
            className={`flex-shrink-0 w-[260px] transition-all ${over === col.id ? 'scale-[1.01]' : ''}`}>
            <Glass className={`p-3 h-full min-h-[200px] ${over === col.id ? 'ring-2 ring-indigo-300' : ''}`}>
              <div className="flex items-center justify-between px-1 mb-3">
                <div className="text-xs font-medium text-slate-700">{col.label}</div>
                <div className="text-[10px] text-slate-400 bg-white/60 px-1.5 py-0.5 rounded-lg">{items.length}</div>
              </div>
              {sum > 0 && <div className="text-[10px] text-slate-400 px-1 mb-2">{KZTm(sum)} / период</div>}
              <div className="space-y-2">
                {items.map(t => {
                  const dl = daysLeft(t.subscription.expiresAt);
                  const urgent = t.subscription.status !== 'churned' && t.subscription.status !== 'trial' && dl <= 14;
                  return (
                    <div key={t.teamId} draggable
                      onDragStart={() => setDrag(t.teamId)} onDragEnd={() => { setDrag(null); setOver(null); }}
                      onClick={() => onOpen(t.teamId)}
                      className={`bg-white/80 rounded-2xl p-3 ring-1 ring-white/70 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md hover:bg-white transition-all ${drag === t.teamId ? 'opacity-40' : ''}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-[9px] text-slate-500 flex-shrink-0">{(t.name || '—').slice(0, 2).toUpperCase()}</div>
                        <div className="text-xs text-slate-800 truncate flex-1">{t.name}</div>
                        {t.subscription.suspended && <Ban className="w-3 h-3 text-rose-500 flex-shrink-0" />}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">{t.users.total} польз.</span>
                        {t.subscription.amount > 0 && <span className="text-[10px] text-slate-600 tabular-nums">{KZTm(t.subscription.amount)}</span>}
                      </div>
                      {t.subscription.status !== 'trial' && t.subscription.status !== 'churned' && (
                        <div className={`text-[10px] mt-1 flex items-center gap-1 ${urgent ? 'text-amber-600' : 'text-slate-400'}`}>
                          <Clock className="w-2.5 h-2.5" /> до {fmtDate(t.subscription.expiresAt)}{urgent && dl >= 0 ? ` · ${dl} дн.` : ''}
                        </div>
                      )}
                    </div>
                  );
                })}
                {items.length === 0 && <div className="text-[11px] text-slate-300 text-center py-6">Перетащите сюда</div>}
              </div>
            </Glass>
          </div>
        );
      })}
    </div>
  );
}

// ─── Команды ──────────────────────────────────────────────────────────
function TeamsTab({ teams, onOpen }: { teams: TeamSummary[] | null; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  if (!teams) return <Skeleton />;
  const filtered = teams.filter(t => !q || t.name.toLowerCase().includes(q.toLowerCase()) || t.email.toLowerCase().includes(q.toLowerCase()));

  return (
    <Glass className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск команды…" className="w-full pl-9 pr-3 py-2 bg-white/60 ring-1 ring-white/70 rounded-xl text-xs focus:outline-none focus:ring-indigo-200 placeholder:text-slate-300" />
        </div>
        <div className="text-[11px] text-slate-400 ml-auto">{filtered.length} команд</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] text-slate-400 uppercase tracking-wide">
              <th className="px-3 py-2 font-medium">Команда</th>
              <th className="px-3 py-2 font-medium">Люди</th>
              <th className="px-3 py-2 font-medium">Подписка</th>
              <th className="px-3 py-2 font-medium text-right">Сумма</th>
              <th className="px-3 py-2 font-medium">Каналы</th>
              <th className="px-3 py-2 font-medium">Активность</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/50">
            {filtered.map(t => (
              <tr key={t.teamId} onClick={() => onOpen(t.teamId)} className="hover:bg-white/40 cursor-pointer transition-colors">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center text-[10px] text-indigo-600 flex-shrink-0">{(t.name || '—').slice(0, 2).toUpperCase()}</div>
                    <div className="min-w-0">
                      <div className="text-slate-800 truncate flex items-center gap-1.5">{t.name}{t.subscription.suspended && <Ban className="w-3 h-3 text-rose-500" />}</div>
                      <div className="text-[10px] text-slate-400 truncate">{t.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-slate-500 tabular-nums">{t.users.total}<span className="text-slate-300"> · {t.users.admins}а/{t.users.managers}м/{t.users.employees}с</span></td>
                <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg ring-1 text-[10px] ${STATUS_META[t.subscription.status].chip}`}><span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[t.subscription.status].dot}`} />{STATUS_META[t.subscription.status].label} · {PERIOD_LABEL[t.subscription.period]}</span></td>
                <td className="px-3 py-3 text-right text-slate-700 tabular-nums">{t.subscription.amount ? KZT(t.subscription.amount) : '—'}</td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{t.integrations.slice(0, 3).map(i => <span key={i} className="text-[9px] px-1.5 py-0.5 bg-white/70 rounded-md text-slate-500">{i}</span>)}{t.integrations.length > 3 && <span className="text-[9px] text-slate-400">+{t.integrations.length - 3}</span>}{t.integrations.length === 0 && <span className="text-[10px] text-slate-300">нет</span>}</div></td>
                <td className="px-3 py-3 text-slate-400 text-[11px]">{ago(t.lastActivityAt)}</td>
                <td className="px-3 py-3 text-right"><ChevronRight className="w-4 h-4 text-slate-300" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center text-slate-300 text-xs py-10">Ничего не найдено</div>}
      </div>
    </Glass>
  );
}

// ─── Пользователи ─────────────────────────────────────────────────────
interface OwnerUser { id: string; name: string; email: string; role: string; teamId: string; team: string; disabled: boolean; createdAt: string; provider: string }
const roleLabelFn = (r: string) => r === 'admin' ? 'Админ' : r === 'manager' ? 'Менеджер' : r === 'employee' ? 'Сотрудник' : r;
const ROLE_CHIP: Record<string, string> = { admin: 'bg-indigo-50 text-indigo-600', manager: 'bg-violet-50 text-violet-600', employee: 'bg-slate-100 text-slate-500' };

function UsersTab({ teams }: { teams: TeamSummary[] | null }) {
  const [users, setUsers] = useState<OwnerUser[] | null>(null);
  const [role, setRole] = useState('all');
  const [team, setTeam] = useState('all');
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => { api.get<OwnerUser[]>('/api/owner/users').then(setUsers).catch(() => {}); }, []);
  if (!users) return <Skeleton />;

  const filtered = users.filter(u =>
    (role === 'all' || u.role === role) &&
    (team === 'all' || u.teamId === team) &&
    (!q || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()) || (u.team || '').toLowerCase().includes(q.toLowerCase())));

  // Группируем по команде — так при большом числе пользователей их легко
  // найти: каждая команда своим блоком, со счётчиком и сворачиванием.
  const groups = new Map<string, { name: string; users: OwnerUser[] }>();
  for (const u of filtered) {
    const g = groups.get(u.teamId) || { name: u.team || '—', users: [] };
    g.users.push(u); groups.set(u.teamId, g);
  }
  const groupList = [...groups.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));

  return (
    <div className="space-y-4">
      <Glass className="p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Имя, email, команда…" className="w-full pl-9 pr-3 py-2 bg-white/60 ring-1 ring-white/70 rounded-xl text-xs focus:outline-none placeholder:text-slate-300" />
          </div>
          <select value={team} onChange={e => setTeam(e.target.value)} className="px-3 py-2 bg-white/60 ring-1 ring-white/70 rounded-xl text-xs focus:outline-none max-w-[180px]">
            <option value="all">Все команды</option>
            {(teams || []).map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
          </select>
          <div className="flex gap-1">
            {['all', 'admin', 'manager', 'employee'].map(r => (
              <button key={r} onClick={() => setRole(r)} className={`px-3 py-1.5 rounded-xl text-[11px] transition-all ${role === r ? 'bg-white text-slate-900 shadow-sm ring-1 ring-white/80' : 'text-slate-500 hover:bg-white/40'}`}>{r === 'all' ? 'Все' : roleLabelFn(r)}</button>
            ))}
          </div>
          <div className="text-[11px] text-slate-400 ml-auto">{filtered.length} чел · {groupList.length} команд</div>
        </div>
      </Glass>

      {groupList.map(([teamId, g]) => {
        const isCollapsed = collapsed[teamId];
        return (
          <Glass key={teamId} className="p-3">
            <button onClick={() => setCollapsed(c => ({ ...c, [teamId]: !c[teamId] }))} className="w-full flex items-center gap-2.5 px-2 py-1.5 hover:bg-white/40 rounded-xl transition-colors">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center text-[10px] text-indigo-600 flex-shrink-0">{(g.name || '—').slice(0, 2).toUpperCase()}</div>
              <div className="text-sm text-slate-800 flex-1 text-left">{g.name}</div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                {g.users.filter(u => u.role === 'admin').length > 0 && <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-500 rounded">{g.users.filter(u => u.role === 'admin').length} админ</span>}
                <span className="bg-white/70 px-1.5 py-0.5 rounded-lg">{g.users.length}</span>
              </div>
              <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
            </button>
            {!isCollapsed && (
              <div className="mt-2 divide-y divide-white/50">
                {g.users.map(u => (
                  <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/40 transition-colors rounded-lg">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-[10px] text-slate-500 flex-shrink-0">{(u.name || '—').slice(0, 2).toUpperCase()}</div>
                    <div className="min-w-0 flex-1"><div className="text-xs text-slate-800 truncate flex items-center gap-1.5">{u.name}{u.disabled && <span className="text-[9px] px-1.5 py-0.5 bg-rose-50 text-rose-500 rounded">откл.</span>}</div><div className="text-[10px] text-slate-400 truncate">{u.email}</div></div>
                    <span className="text-[10px] text-slate-400 hidden sm:block">{u.provider}</span>
                    <span className="text-[10px] text-slate-400 hidden sm:block w-20 text-right">{fmtDate(u.createdAt)}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] ${ROLE_CHIP[u.role] || 'bg-slate-100 text-slate-500'}`}>{roleLabelFn(u.role)}</span>
                  </div>
                ))}
              </div>
            )}
          </Glass>
        );
      })}
      {groupList.length === 0 && <Glass className="p-10"><div className="text-center text-slate-300 text-xs">Ничего не найдено</div></Glass>}
    </div>
  );
}

// ─── Активность ───────────────────────────────────────────────────────
function ActivityTab({ teams }: { teams: TeamSummary[] | null }) {
  const [feed, setFeed] = useState<any[] | null>(null);
  const [team, setTeam] = useState('all');
  const [kind, setKind] = useState('all'); // all | human | ai | telegram
  useEffect(() => {
    setFeed(null);
    const url = team === 'all' ? '/api/owner/activity?limit=200' : `/api/owner/activity?limit=200&teamId=${encodeURIComponent(team)}`;
    api.get<any[]>(url).then(setFeed).catch(() => setFeed([]));
  }, [team]);

  const shown = (feed || []).filter(a => kind === 'all' || (kind === 'ai' ? a.actor === 'ai' : kind === 'telegram' ? a.source === 'telegram' : a.actor !== 'ai' && a.source !== 'telegram'));

  return (
    <div className="space-y-4">
      <Glass className="p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm text-slate-900 mr-2">Лента действий</div>
          <select value={team} onChange={e => setTeam(e.target.value)} className="px-3 py-2 bg-white/60 ring-1 ring-white/70 rounded-xl text-xs focus:outline-none max-w-[180px]">
            <option value="all">Все команды</option>
            {(teams || []).map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
          </select>
          <div className="flex gap-1">
            {[['all', 'Все'], ['human', 'Люди'], ['ai', 'ИИ'], ['telegram', 'Telegram']].map(([k, l]) => (
              <button key={k} onClick={() => setKind(k)} className={`px-3 py-1.5 rounded-xl text-[11px] transition-all ${kind === k ? 'bg-white text-slate-900 shadow-sm ring-1 ring-white/80' : 'text-slate-500 hover:bg-white/40'}`}>{l}</button>
            ))}
          </div>
          <div className="text-[11px] text-slate-400 ml-auto">{shown.length}</div>
        </div>
      </Glass>
      <Glass className="p-4">
        {!feed ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div> : (
          <div className="space-y-1 max-h-[68vh] overflow-y-auto">
            {shown.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/40 transition-colors">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${a.actor === 'ai' ? 'bg-violet-50 text-violet-500' : a.source === 'telegram' ? 'bg-sky-50 text-sky-500' : 'bg-slate-100 text-slate-400'}`}>{a.actor === 'ai' ? <Zap className="w-3.5 h-3.5" /> : a.source === 'telegram' ? <Radio className="w-3.5 h-3.5" /> : <UserCog className="w-3.5 h-3.5" />}</div>
                <div className="min-w-0 flex-1"><div className="text-xs text-slate-700 truncate"><span className="text-slate-900">{a.user || 'Система'}</span> {a.action} {a.target && <span className="text-slate-400">· {a.target}</span>}</div>{team === 'all' && <div className="text-[10px] text-slate-400">{a.team}</div>}</div>
                <div className="text-[10px] text-slate-400 flex-shrink-0">{ago(a.at)}</div>
              </div>
            ))}
            {shown.length === 0 && <div className="text-center text-slate-300 text-xs py-10">Нет действий по фильтру</div>}
          </div>
        )}
      </Glass>
    </div>
  );
}

// ─── Ошибки ───────────────────────────────────────────────────────────
function ErrorsTab() {
  const [errs, setErrs] = useState<any[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api.get<any[]>('/api/owner/errors?limit=200').then(setErrs).catch(() => {}); }, []);
  if (!errs) return <Skeleton />;
  return (
    <Glass className="p-5">
      <div className="flex items-center justify-between mb-4"><div className="text-sm text-slate-900">Ошибки платформы</div><div className="text-[11px] text-slate-400">{errs.length} записей</div></div>
      <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
        {errs.map(e => (
          <div key={e.id} className="bg-white/60 rounded-2xl ring-1 ring-white/60 overflow-hidden">
            <button onClick={() => setOpen(o => o === e.id ? null : e.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/40 transition-colors">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${e.source === 'client' ? 'bg-amber-50 text-amber-500' : 'bg-rose-50 text-rose-500'}`}><Bug className="w-3.5 h-3.5" /></div>
              <div className="min-w-0 flex-1"><div className="text-xs text-slate-800 truncate font-mono">{e.message}</div><div className="text-[10px] text-slate-400">{e.method} {e.url} · {e.teamName || e.teamOwner || 'без команды'}</div></div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${e.source === 'client' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>{e.source}</span>
              <div className="text-[10px] text-slate-400 flex-shrink-0 w-20 text-right">{ago(e.created_at)}</div>
            </button>
            {open === e.id && e.stack && <pre className="text-[10px] text-slate-500 bg-slate-50/70 px-4 py-3 overflow-x-auto whitespace-pre-wrap border-t border-white/60">{e.stack}</pre>}
          </div>
        ))}
        {errs.length === 0 && <div className="text-center text-emerald-400 text-xs py-10 flex flex-col items-center gap-2"><Check className="w-6 h-6" />Ошибок нет — чисто</div>}
      </div>
    </Glass>
  );
}

// ─── Заявки на демо ───────────────────────────────────────────────────
interface Lead { id: string; name: string; phone?: string; email?: string; company?: string; message?: string; status: string; at: string; source?: string }
const LEAD_STATUS: Record<string, { label: string; chip: string }> = {
  new:       { label: 'Новая',      chip: 'bg-indigo-50 text-indigo-600 ring-indigo-100' },
  contacted: { label: 'Связались',  chip: 'bg-amber-50 text-amber-700 ring-amber-100' },
  converted: { label: 'Клиент',     chip: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  rejected:  { label: 'Отказ',      chip: 'bg-slate-100 text-slate-500 ring-slate-200' },
};
function LeadsTab() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [filter, setFilter] = useState('all');
  const load = () => api.get<Lead[]>('/api/owner/leads').then(setLeads).catch(() => setLeads([]));
  useEffect(() => { load(); }, []);
  if (!leads) return <Skeleton />;

  const setStatus = async (id: string, status: string) => {
    setLeads(ls => ls!.map(l => l.id === id ? { ...l, status } : l));
    try { await api.patch(`/api/owner/leads/${id}`, { status }); } catch { load(); }
  };
  const del = async (id: string) => {
    if (!(await confirmDialog({ message: 'Удалить заявку?', danger: true }))) return;
    try { await api.delete(`/api/owner/leads/${id}`); load(); } catch { /* */ }
  };
  const shown = leads.filter(l => filter === 'all' || l.status === filter);
  const newCount = leads.filter(l => l.status === 'new').length;

  return (
    <div className="space-y-4">
      <Glass className="p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm text-slate-900 mr-2 flex items-center gap-2"><Inbox className="w-4 h-4 text-indigo-500" /> Заявки на демо {newCount > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-indigo-500 text-white rounded-full">{newCount} новых</span>}</div>
          <div className="flex gap-1 ml-auto">
            {[['all', 'Все'], ['new', 'Новые'], ['contacted', 'Связались'], ['converted', 'Клиенты'], ['rejected', 'Отказ']].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-xl text-[11px] transition-all ${filter === k ? 'bg-white text-slate-900 shadow-sm ring-1 ring-white/80' : 'text-slate-500 hover:bg-white/40'}`}>{l}</button>
            ))}
          </div>
        </div>
      </Glass>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {shown.map(lead => (
          <Glass key={lead.id} className="p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="text-sm text-slate-900 font-medium truncate">{lead.name}</div>
                {lead.company && <div className="text-[11px] text-slate-400 truncate">{lead.company}</div>}
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-lg ring-1 flex-shrink-0 ${LEAD_STATUS[lead.status]?.chip || LEAD_STATUS.new.chip}`}>{LEAD_STATUS[lead.status]?.label || lead.status}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
              {lead.phone && <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-indigo-600"><Phone className="w-3 h-3" />{lead.phone}</a>}
              {lead.email && <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-indigo-600"><Mail className="w-3 h-3" />{lead.email}</a>}
            </div>
            {lead.message && <div className="text-[11px] text-slate-500 bg-white/50 rounded-lg px-3 py-2 mb-2 leading-snug">«{lead.message}»</div>}
            <div className="flex items-center gap-1.5">
              <select value={lead.status} onChange={e => setStatus(lead.id, e.target.value)} className="text-[11px] px-2 py-1 bg-white/70 ring-1 ring-white/70 rounded-lg focus:outline-none">
                {Object.entries(LEAD_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <span className="text-[10px] text-slate-400 ml-auto">{ago(lead.at)}</span>
              <button onClick={() => del(lead.id)} className="p-1 hover:bg-rose-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-rose-400" /></button>
            </div>
          </Glass>
        ))}
      </div>
      {shown.length === 0 && <Glass className="p-10"><div className="text-center text-slate-300 text-xs">{filter === 'all' ? 'Заявок пока нет' : 'Нет заявок по фильтру'}</div></Glass>}
    </div>
  );
}

// ─── Финансы платформы ────────────────────────────────────────────────
interface FinanceData {
  income: { mrr: number; contracted: number; extra: number; totalMonthly: number };
  expenses: { monthly: number; byCategory: { category: string; amount: number }[] };
  ai: { imagesTotal: number; imagesMonth: number; actionsMonth: number; estMonthlyCost: number; byTeam: { team: string; images: number }[] };
  net: number;
  entries: any[];
}
function FinanceTab() {
  const [d, setD] = useState<FinanceData | null>(null);
  const [form, setForm] = useState({ type: 'expense', category: '', amount: '', recurring: true, note: '' });
  const [adding, setAdding] = useState(false);
  const load = () => api.get<FinanceData>('/api/owner/finance').then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!d) return <Skeleton />;

  const add = async () => {
    if (!form.category.trim() || !Number(form.amount)) { toast('Укажите категорию и сумму', 'error'); return; }
    setAdding(true);
    try { await api.post('/api/owner/finance/entries', { ...form, amount: Number(form.amount) }); setForm({ type: 'expense', category: '', amount: '', recurring: true, note: '' }); await load(); toast('Добавлено', 'success'); }
    catch { toast('Ошибка', 'error'); } finally { setAdding(false); }
  };
  const del = async (id: string) => { try { await api.delete(`/api/owner/finance/entries/${id}`); await load(); } catch { /* */ } };

  const maxCat = Math.max(1, ...d.expenses.byCategory.map(c => c.amount));
  const tiles = [
    { label: 'Доход / мес', value: KZTm(d.income.totalMonthly), sub: `${KZT(d.income.contracted)} законтрактовано`, icon: TrendingUp, tint: 'from-emerald-500 to-teal-500' },
    { label: 'Расход / мес', value: KZTm(d.expenses.monthly), sub: `${d.expenses.byCategory.length} категорий`, icon: TrendingDown, tint: 'from-rose-500 to-orange-500' },
    { label: 'Прибыль / мес', value: KZTm(d.net), sub: d.net >= 0 ? 'в плюсе' : 'в минусе', icon: Wallet, tint: d.net >= 0 ? 'from-indigo-500 to-violet-500' : 'from-rose-500 to-rose-600' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tiles.map((t, i) => (
          <Glass key={i} className="p-5">
            <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${t.tint} flex items-center justify-center shadow-lg mb-3`}><t.icon className="w-5 h-5 text-white" /></div>
            <div className="text-[11px] text-slate-400">{t.label}</div>
            <div className={`text-2xl font-semibold tracking-tight tabular-nums ${t.label.includes('Прибыль') && d.net < 0 ? 'text-rose-500' : 'text-slate-900'}`}>{t.value}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{t.sub}</div>
          </Glass>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* AI usage */}
        <Glass className="p-5 lg:col-span-1">
          <div className="flex items-center gap-2 mb-1"><Sparkles className="w-4 h-4 text-violet-500" /><div className="text-sm text-slate-900">Расходы на ИИ</div></div>
          <div className="text-[11px] text-slate-400 mb-4">За текущий месяц · оценка</div>
          <div className="text-3xl font-semibold tracking-tight text-slate-900 mb-1">≈ {KZTm(d.ai.estMonthlyCost)}</div>
          <div className="flex gap-4 mb-4 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><ImageIcon className="w-3.5 h-3.5 text-slate-400" /> {d.ai.imagesMonth} <span className="text-slate-300">картинок</span></div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><MessageSquare className="w-3.5 h-3.5 text-slate-400" /> {d.ai.actionsMonth} <span className="text-slate-300">ответов</span></div>
          </div>
          {d.ai.byTeam.length > 0 && (
            <div className="space-y-1.5 pt-3 border-t border-white/60">
              <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Кто больше генерит</div>
              {d.ai.byTeam.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-xs"><span className="text-slate-600 truncate">{t.team}</span><span className="text-slate-400 tabular-nums">{t.images}</span></div>
              ))}
            </div>
          )}
          <div className="text-[10px] text-slate-300 mt-3 leading-relaxed">Оценка по количеству генераций/ответов. Точную сумму вносите расходом ниже.</div>
        </Glass>

        {/* Expense breakdown */}
        <Glass className="p-5 lg:col-span-2">
          <div className="text-sm text-slate-900 mb-4">Расходы по категориям (месяц)</div>
          {d.expenses.byCategory.length === 0 ? (
            <div className="text-center text-slate-300 text-xs py-10">Добавьте расходы ниже — они появятся здесь</div>
          ) : (
            <div className="space-y-3">
              {d.expenses.byCategory.map((c, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1"><span className="text-slate-600">{c.category}</span><span className="text-slate-800 tabular-nums">{KZT(c.amount)}</span></div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-gradient-to-r from-rose-400 to-orange-400" style={{ width: `${(c.amount / maxCat) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </Glass>
      </div>

      {/* Ledger */}
      <Glass className="p-5">
        <div className="text-sm text-slate-900 mb-3 flex items-center gap-2"><Receipt className="w-4 h-4 text-slate-400" /> Учёт доходов и расходов</div>
        {/* Add form */}
        <div className="flex flex-wrap items-end gap-2 mb-4 pb-4 border-b border-white/60">
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inputCls + ' w-28'}><option value="expense">Расход</option><option value="income">Доход</option></select>
          <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Категория (ИИ, Хостинг…)" className={inputCls + ' flex-1 min-w-[140px]'} />
          <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="Сумма ₸" className={inputCls + ' w-32'} />
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 px-1"><input type="checkbox" checked={form.recurring} onChange={e => setForm({ ...form, recurring: e.target.checked })} className="rounded" /> ежемесячно</label>
          <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Заметка" className={inputCls + ' flex-1 min-w-[120px]'} />
          <button onClick={add} disabled={adding} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white rounded-xl text-xs hover:bg-indigo-700 disabled:opacity-50">{adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Добавить</button>
        </div>
        <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
          {d.entries.length === 0 && <div className="text-center text-slate-300 text-xs py-6">Пока нет записей</div>}
          {d.entries.map(e => (
            <div key={e.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/40 group">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${e.type === 'income' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>{e.type === 'income' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}</div>
              <div className="min-w-0 flex-1"><div className="text-xs text-slate-800 truncate">{e.category}{e.recurring && <span className="text-[9px] text-slate-400 ml-1.5">/мес</span>}</div>{e.note && <div className="text-[10px] text-slate-400 truncate">{e.note}</div>}</div>
              <div className={`text-xs tabular-nums ${e.type === 'income' ? 'text-emerald-600' : 'text-rose-500'}`}>{e.type === 'income' ? '+' : '−'}{KZT(e.amount)}</div>
              <button onClick={() => del(e.id)} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-rose-50 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5 text-rose-400" /></button>
            </div>
          ))}
        </div>
      </Glass>
    </div>
  );
}

// ─── Роадмап владельца ────────────────────────────────────────────────
interface OwnerTask { id: string; title: string; description: string; status: string; priority: string; dueDate?: string }
const ROADMAP_COLS: { id: string; label: string; accent: string }[] = [
  { id: 'todo', label: 'Надо сделать', accent: 'bg-slate-400' },
  { id: 'in_progress', label: 'В работе', accent: 'bg-indigo-400' },
  { id: 'on_hold', label: 'На стопе', accent: 'bg-amber-400' },
  { id: 'done', label: 'Готово', accent: 'bg-emerald-400' },
];
const PRIO: Record<string, { c: string; l: string }> = { high: { c: 'bg-rose-400', l: 'Высокий' }, medium: { c: 'bg-amber-400', l: 'Средний' }, low: { c: 'bg-slate-300', l: 'Низкий' } };

function RoadmapTab() {
  const [tasks, setTasks] = useState<OwnerTask[] | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [edit, setEdit] = useState<OwnerTask | null>(null);
  const [creating, setCreating] = useState(false);
  const load = () => api.get<OwnerTask[]>('/api/owner/tasks').then(setTasks).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!tasks) return <Skeleton />;

  const drop = async (col: string) => {
    const id = drag; setDrag(null); setOver(null);
    if (!id) return;
    const t = tasks.find(x => x.id === id);
    if (!t || t.status === col) return;
    setTasks(ts => ts!.map(x => x.id === id ? { ...x, status: col } : x)); // оптимистично
    try { await api.patch(`/api/owner/tasks/${id}`, { status: col }); } catch { load(); }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] text-slate-400">{tasks.length} задач · перетаскивайте карточки между колонками</div>
        <button onClick={() => { setCreating(true); setEdit({ id: '', title: '', description: '', status: 'todo', priority: 'medium' }); }} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white rounded-xl text-xs hover:bg-indigo-700"><Plus className="w-3.5 h-3.5" /> Новая задача</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ROADMAP_COLS.map(col => {
          const items = tasks.filter(t => t.status === col.id);
          return (
            <div key={col.id}
              onDragOver={e => { e.preventDefault(); setOver(col.id); }}
              onDragLeave={() => setOver(o => o === col.id ? null : o)}
              onDrop={() => drop(col.id)}>
              <Glass className={`p-3 min-h-[300px] ${over === col.id ? 'ring-2 ring-indigo-300' : ''}`}>
                <div className="flex items-center gap-2 px-1 mb-3"><span className={`w-2 h-2 rounded-full ${col.accent}`} /><div className="text-xs font-medium text-slate-700 flex-1">{col.label}</div><span className="text-[10px] text-slate-400 bg-white/60 px-1.5 py-0.5 rounded-lg">{items.length}</span></div>
                <div className="space-y-2">
                  {items.map(t => (
                    <div key={t.id} draggable
                      onDragStart={() => setDrag(t.id)} onDragEnd={() => { setDrag(null); setOver(null); }}
                      onClick={() => { setCreating(false); setEdit(t); }}
                      className={`bg-white/80 rounded-2xl p-3 ring-1 ring-white/70 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md hover:bg-white transition-all ${drag === t.id ? 'opacity-40' : ''}`}>
                      <div className="flex items-start gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${PRIO[t.priority]?.c || 'bg-slate-300'}`} />
                        <div className="min-w-0">
                          <div className={`text-xs text-slate-800 ${t.status === 'done' ? 'line-through text-slate-400' : ''}`}>{t.title}</div>
                          {t.description && <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{t.description}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <div className="text-[11px] text-slate-300 text-center py-6">—</div>}
                </div>
              </Glass>
            </div>
          );
        })}
      </div>
      {edit && <TaskEditor task={edit} creating={creating} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </>
  );
}

function TaskEditor({ task, creating, onClose, onSaved }: { task: OwnerTask; creating: boolean; onClose: () => void; onSaved: () => void }) {
  const [t, setT] = useState<OwnerTask>(task);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!t.title.trim()) { toast('Введите название', 'error'); return; }
    setSaving(true);
    try {
      if (creating) await api.post('/api/owner/tasks', t);
      else await api.patch(`/api/owner/tasks/${t.id}`, t);
      onSaved();
    } catch { toast('Ошибка', 'error'); } finally { setSaving(false); }
  };
  const del = async () => { if (!(await confirmDialog({ message: 'Удалить задачу?', danger: true }))) return; try { await api.delete(`/api/owner/tasks/${t.id}`); onSaved(); } catch { /* */ } };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()} className="relative w-full max-w-md bg-white/85 backdrop-blur-2xl ring-1 ring-white/60 shadow-2xl rounded-[26px] p-5 space-y-3">
        <div className="flex items-center justify-between"><div className="text-sm font-semibold text-slate-900">{creating ? 'Новая задача' : 'Задача'}</div><button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button></div>
        <Field label="Название"><input value={t.title} onChange={e => setT({ ...t, title: e.target.value })} className={inputCls} autoFocus /></Field>
        <Field label="Описание"><textarea value={t.description} onChange={e => setT({ ...t, description: e.target.value })} rows={3} className={inputCls + ' resize-none'} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Статус"><select value={t.status} onChange={e => setT({ ...t, status: e.target.value })} className={inputCls}>{ROADMAP_COLS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
          <Field label="Приоритет"><select value={t.priority} onChange={e => setT({ ...t, priority: e.target.value })} className={inputCls}><option value="high">Высокий</option><option value="medium">Средний</option><option value="low">Низкий</option></select></Field>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={saving} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs hover:bg-indigo-700 disabled:opacity-50">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Сохранить</button>
          {!creating && <button onClick={del} className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-600 rounded-xl text-xs hover:bg-rose-100"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      </div>
    </div>
  );
}

// ─── Детальная панель команды (drawer) ────────────────────────────────
function TeamDrawer({ teamId, onClose, onChanged }: { teamId: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<any | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [saving, setSaving] = useState(false);
  const load = () => api.get<any>(`/api/owner/teams/${teamId}`).then(t => { setD(t); setSub(t.subscription); }).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [teamId]);

  const saveSub = async () => {
    if (!sub) return;
    setSaving(true);
    try {
      await api.patch(`/api/owner/teams/${teamId}/subscription`, { plan: sub.plan, amount: Number(sub.amount) || 0, period: sub.period, status: sub.status, startedAt: sub.startedAt, expiresAt: sub.expiresAt, note: sub.note });
      toast('Подписка сохранена', 'success'); onChanged(); load();
    } catch { toast('Не удалось сохранить', 'error'); } finally { setSaving(false); }
  };
  const toggleSuspend = async () => {
    const suspended = !!d?.subscription?.suspended;
    if (!(await confirmDialog({ message: suspended ? 'Разблокировать команду? Доступ восстановится.' : 'Заблокировать команду? Все её пользователи потеряют доступ до разблокировки.', danger: !suspended }))) return;
    try {
      await api.post(`/api/owner/teams/${teamId}/${suspended ? 'unsuspend' : 'suspend'}`, {});
      toast(suspended ? 'Команда разблокирована' : 'Команда заблокирована', 'success'); onChanged(); load();
    } catch { toast('Ошибка', 'error'); }
  };

  const roleLabel = (r: string) => r === 'admin' ? 'Админ' : r === 'manager' ? 'Менеджер' : r === 'employee' ? 'Сотрудник' : r;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()} className="relative w-full max-w-md h-full bg-white/80 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-2xl overflow-y-auto animate-[slideIn_.2s_ease-out]">
        <style>{`@keyframes slideIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
        {!d || !sub ? <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div> : (
          <div className="p-5 space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-sm text-white">{(d.name || '—').slice(0, 2).toUpperCase()}</div>
                <div><div className="text-base font-semibold text-slate-900 flex items-center gap-2">{d.name}{d.subscription.suspended && <span className="text-[10px] px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded">заблокирована</span>}</div><div className="text-[11px] text-slate-400">{d.email}</div></div>
              </div>
              <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            {/* Usage tiles */}
            <div className="grid grid-cols-4 gap-2">
              {[['Сделки', d.usage.deals], ['Выручка', KZTm(d.usage.revenue)], ['Склад', d.usage.products], ['Задачи', d.usage.tasks]].map(([l, v], i) => (
                <div key={i} className="bg-white/70 rounded-2xl p-2.5 text-center ring-1 ring-white/60"><div className="text-sm font-semibold text-slate-900 tabular-nums">{v}</div><div className="text-[9px] text-slate-400">{l}</div></div>
              ))}
            </div>

            {/* Subscription editor */}
            <div className="bg-white/60 rounded-2xl p-4 ring-1 ring-white/60 space-y-3">
              <div className="text-xs font-medium text-slate-700 flex items-center gap-1.5"><CircleDollarSign className="w-3.5 h-3.5 text-indigo-500" /> Подписка</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Тариф"><input value={sub.plan} onChange={e => setSub({ ...sub, plan: e.target.value })} className={inputCls} /></Field>
                <Field label="Сумма (₸)"><input type="number" value={sub.amount} onChange={e => setSub({ ...sub, amount: Number(e.target.value) })} className={inputCls} /></Field>
                <Field label="Период"><select value={sub.period} onChange={e => setSub({ ...sub, period: e.target.value as SubPeriod })} className={inputCls}><option value="monthly">Месяц</option><option value="semiannual">6 месяцев</option><option value="annual">Год</option></select></Field>
                <Field label="Статус"><select value={sub.status} onChange={e => setSub({ ...sub, status: e.target.value as SubStatus })} className={inputCls}><option value="trial">Триал</option><option value="active">Активна</option><option value="past_due">Просрочка</option><option value="churned">Отказ</option></select></Field>
                <Field label="Начало"><input type="date" value={sub.startedAt} onChange={e => setSub({ ...sub, startedAt: e.target.value })} className={inputCls} /></Field>
                <Field label="Истекает"><input type="date" value={sub.expiresAt} onChange={e => setSub({ ...sub, expiresAt: e.target.value })} className={inputCls} /></Field>
              </div>
              <Field label="Заметка"><input value={sub.note} onChange={e => setSub({ ...sub, note: e.target.value })} placeholder="напр. оплата Kaspi 12.03" className={inputCls} /></Field>
              <div className="flex gap-2 pt-1">
                <button onClick={saveSub} disabled={saving} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs hover:bg-indigo-700 disabled:opacity-50">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Сохранить</button>
                <button onClick={toggleSuspend} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs ${d.subscription.suspended ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`}>{d.subscription.suspended ? <ShieldCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}{d.subscription.suspended ? 'Разблок.' : 'Блок'}</button>
              </div>
            </div>

            {/* Channels */}
            {d.integrations.length > 0 && (
              <div><div className="text-[11px] text-slate-400 mb-1.5">Каналы</div><div className="flex flex-wrap gap-1.5">{d.integrations.map((i: string) => <span key={i} className="text-[10px] px-2 py-1 bg-white/70 ring-1 ring-white/60 rounded-lg text-slate-600">{i}</span>)}</div></div>
            )}

            {/* Users */}
            <div>
              <div className="text-[11px] text-slate-400 mb-1.5">Команда ({d.userList.length})</div>
              <div className="space-y-1.5">
                {d.userList.map((u: any) => (
                  <div key={u.id} className="flex items-center gap-2.5 bg-white/60 rounded-xl px-3 py-2 ring-1 ring-white/60">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] text-slate-500">{(u.name || '—').slice(0, 2).toUpperCase()}</div>
                    <div className="min-w-0 flex-1"><div className="text-xs text-slate-800 truncate">{u.name} {u.disabled && <span className="text-[9px] text-rose-500">(откл.)</span>}</div><div className="text-[10px] text-slate-400 truncate">{u.email}</div></div>
                    <span className="text-[10px] text-slate-500">{roleLabel(u.role)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            {d.activity?.length > 0 && (
              <div>
                <div className="text-[11px] text-slate-400 mb-1.5">Последние действия</div>
                <div className="space-y-1">
                  {d.activity.slice(0, 12).map((a: any, i: number) => (
                    <div key={i} className="text-[11px] text-slate-500 flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-slate-300" /><span className="truncate">{a.user} {a.action}</span><span className="text-slate-300 ml-auto flex-shrink-0">{ago(a.at)}</span></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls = 'w-full px-2.5 py-1.5 bg-white/70 ring-1 ring-white/70 rounded-lg text-xs focus:outline-none focus:ring-indigo-200';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] text-slate-400 mb-0.5 block">{label}</span>{children}</label>;
}

function Skeleton() {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-[26px] bg-white/40 animate-pulse" />)}</div>;
}
