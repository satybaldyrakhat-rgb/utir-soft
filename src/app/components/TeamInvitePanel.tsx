// Team invitations panel (Block C.2 / P4)
// Shown inside Settings → Команда. Admin-only.
//
// What it does:
//   - List pending invitations (with role, expiry, used/unused)
//   - "Создать приглашение" button → pick role (manager / employee) → POST
//     /api/invitations → show the resulting share link + raw code, ready to copy
//   - Revoke any pending invite

import { useEffect, useState } from 'react';
import { Copy, Trash2, Plus, Check, Link as LinkIcon } from 'lucide-react';
import { api } from '../utils/api';
import { useDataStore } from '../utils/dataStore';

interface Invitation {
  id: string;
  code: string;
  // Free-form so admin-defined custom role ids ('accountant', 'r_xxxx') pass through.
  role: string;
  email?: string | null;
  expiresAt: string;
  usedAt?: string | null;
  usedBy?: string | null;
  usedByName?: string | null;
  usedByEmail?: string | null;
  createdAt: string;
}

interface Props {
  language: 'kz' | 'ru' | 'eng';
}

const ROLE_LABEL: Record<string, { ru: string; kz: string; eng: string }> = {
  admin:    { ru: 'Администратор', kz: 'Әкімші',      eng: 'Admin' },
  manager:  { ru: 'Менеджер',      kz: 'Менеджер',    eng: 'Manager' },
  employee: { ru: 'Сотрудник',     kz: 'Қызметкер',   eng: 'Employee' },
};

function buildLink(code: string) {
  // Use the current origin so the link is shareable across local / Vercel / Railway envs.
  // We point at "/" rather than "/auth" because this app is a single-page Vite bundle
  // — there is no real /auth route on the server, only a query-param read on the root.
  if (typeof window === 'undefined') return `/?invite=${code}`;
  return `${window.location.origin}/?invite=${code}`;
}

export function TeamInvitePanel({ language }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();

  // Role choices for new invitations — built-ins + any custom roles defined
  // by the team admin. Admin is excluded — admins are created manually only.
  const roleOptions = store.roles.filter(r => r.id !== 'admin');
  const defaultRoleId = roleOptions.find(r => r.id === 'employee')?.id || roleOptions[0]?.id || 'employee';
  // Look up a human label for a role id (custom first, then built-in).
  const labelForRole = (id: string): string => {
    const found = store.roles.find(r => r.id === id);
    if (found) return found.name;
    return ROLE_LABEL[id]?.[language] || id;
  };

  const [list, setList] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [role, setRole] = useState<string>(defaultRoleId);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const rows = await api.get<Invitation[]>('/api/invitations');
      setList(rows);
    } catch (e: any) {
      // Non-admins get 403 — that's expected, hide the panel by showing nothing.
      if (String(e?.message || '').includes('admin')) setList([]);
      else setError(String(e?.message || 'load failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const [inviteEmail, setInviteEmail] = useState('');
  const [lastSent, setLastSent] = useState<string>('');

  const createInvite = async () => {
    setCreating(true); setError(''); setLastSent('');
    try {
      // emailSent comes back true only if backend dispatched via Resend/SMTP.
      // If email field is blank, backend just returns the code — admin shares
      // the link manually via the copy button.
      const result = await api.post<Invitation & { emailSent?: boolean }>('/api/invitations', {
        role,
        email: inviteEmail.trim() || undefined,
      });
      setShowCreate(false);
      setRole(defaultRoleId);
      if (inviteEmail && result.emailSent) setLastSent(inviteEmail);
      setInviteEmail('');
      await load();
    } catch (e: any) {
      setError(String(e?.message || 'create failed'));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm(l('Отозвать приглашение?', 'Шақыруды кері қайтару керек пе?', 'Revoke this invitation?'))) return;
    try {
      await api.delete(`/api/invitations/${id}`);
      await load();
    } catch (e: any) {
      setError(String(e?.message || 'revoke failed'));
    }
  };

  const copy = async (code: string, id: string) => {
    const link = buildLink(code);
    try { await navigator.clipboard.writeText(link); } catch { /* clipboard may fail without https; fall through */ }
    setCopiedId(id);
    setTimeout(() => setCopiedId(c => (c === id ? null : c)), 1800);
  };

  // Split into "still actionable" (pending) and "history" (used or expired) for clarity.
  const now = Date.now();
  const pending = list.filter(i => !i.usedAt && new Date(i.expiresAt).getTime() > now);
  const archive = list.filter(i => i.usedAt || new Date(i.expiresAt).getTime() <= now);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm text-gray-900">{l('Приглашения в команду', 'Командаға шақыру', 'Team invitations')}</div>
        <button
          onClick={() => { setShowCreate(s => !s); setError(''); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {l('Новое приглашение', 'Жаңа шақыру', 'New invitation')}
        </button>
      </div>
      <div className="text-[11px] text-gray-400 mb-4">
        {l(
          'Поделитесь ссылкой с сотрудником — он зарегистрируется и попадёт в вашу команду.',
          'Сілтемені қызметкерге беріңіз — ол тіркеліп, командаңызға қосылады.',
          'Share the link with a teammate — they will sign up and join your team.',
        )}
      </div>

      {showCreate && (
        <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
          <label className="block text-[11px] text-gray-500 mb-1.5">{l('Роль', 'Рөл', 'Role')}</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 mb-3"
          >
            {roleOptions.map(r => (
              <option key={r.id} value={r.id}>{labelForRole(r.id)}</option>
            ))}
          </select>
          <label className="block text-[11px] text-gray-500 mb-1.5">
            {l('Email сотрудника (необязательно)', 'Қызметкер email (міндетті емес)', 'Teammate email (optional)')}
          </label>
          <input
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 mb-1"
          />
          <div className="text-[10px] text-gray-400 mb-3">
            {l('Если заполнить — ссылка уйдёт на email автоматически. Иначе можно отправить вручную.',
               'Толтырсаңыз — сілтеме автоматты түрде email-ге жіберіледі. Әйтпесе қолмен жібересіз.',
               'Filled — the link is emailed automatically. Empty — copy and send it yourself.')}
          </div>
          <div className="flex gap-2">
            <button
              onClick={createInvite}
              disabled={creating}
              className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {creating ? l('Создаю…', 'Жасалуда…', 'Creating…') : l('Создать ссылку', 'Сілтеме жасау', 'Create link')}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-gray-600 rounded-lg text-xs hover:bg-white transition-colors"
            >
              {l('Отмена', 'Бас тарту', 'Cancel')}
            </button>
          </div>
        </div>
      )}

      {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">{error}</div>}
      {lastSent && (
        <div className="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg text-xs text-emerald-700 flex items-center justify-between">
          <span>{l('Ссылка отправлена на', 'Сілтеме жіберілді', 'Invite emailed to')} <b>{lastSent}</b></span>
          <button onClick={() => setLastSent('')} className="text-emerald-600 hover:text-emerald-800">×</button>
        </div>
      )}

      {loading && list.length === 0 && (
        <div className="text-xs text-gray-400 py-3">{l('Загрузка…', 'Жүктелуде…', 'Loading…')}</div>
      )}

      {!loading && pending.length === 0 && archive.length === 0 && !showCreate && (
        <div className="text-xs text-gray-400 py-3">
          {l('Пока нет активных приглашений.', 'Әзірге белсенді шақыру жоқ.', 'No active invitations yet.')}
        </div>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map(inv => (
            <div key={inv.id} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
              <LinkIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-900 font-mono truncate">{buildLink(inv.code)}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {labelForRole(inv.role)}
                  {' · '}
                  {l('Истекает', 'Жарамдылық', 'Expires')}{' '}
                  {new Date(inv.expiresAt).toLocaleDateString(language === 'eng' ? 'en-GB' : 'ru-RU')}
                </div>
              </div>
              <button
                onClick={() => copy(inv.code, inv.id)}
                className="p-1.5 rounded-lg hover:bg-white transition-colors"
                title={l('Копировать', 'Көшіру', 'Copy')}
              >
                {copiedId === inv.id
                  ? <Check className="w-4 h-4 text-emerald-600" />
                  : <Copy className="w-4 h-4 text-gray-500" />}
              </button>
              <button
                onClick={() => revoke(inv.id)}
                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                title={l('Отозвать', 'Кері қайтару', 'Revoke')}
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Archive */}
      {archive.length > 0 && (
        <details className="mt-3">
          <summary className="text-[11px] text-gray-400 cursor-pointer select-none">
            {l('История', 'Тарих', 'History')} ({archive.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            {archive.slice(0, 10).map(inv => (
              <div key={inv.id} className="flex items-center justify-between gap-3 px-2 py-1.5 text-[11px] text-gray-500">
                <span className="font-mono flex-shrink-0">{inv.code}</span>
                <span className="text-right truncate">
                  {inv.usedAt ? (
                    <>
                      {l('Использовано', 'Пайдаланылды', 'Used')}
                      {inv.usedByName && (
                        <span className="text-gray-700"> · {inv.usedByName}</span>
                      )}
                      {inv.usedByEmail && !inv.usedByName && (
                        <span className="text-gray-700"> · {inv.usedByEmail}</span>
                      )}
                    </>
                  ) : (
                    l('Просрочено', 'Мерзімі өтті', 'Expired')
                  )}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
