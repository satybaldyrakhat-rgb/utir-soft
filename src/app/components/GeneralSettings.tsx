import { useState, useEffect, useRef, useMemo } from 'react';
import {
  User, Building2, Globe, Camera, Check, X, Mail, Phone, Briefcase, MapPin, Hash,
  LogOut, Download, Lock, AlertCircle, Image as ImageIcon, ShieldCheck, Loader2,
} from 'lucide-react';
import { useDataStore, type UserProfile } from '../utils/dataStore';

interface Props {
  language: 'kz' | 'ru' | 'eng';
  onLanguageChange?: (lang: 'kz' | 'ru' | 'eng') => void;
  onLogout?: () => void;
  // Slot for the RequisitesCard (passed in from Settings.tsx so we don't
  // import its private types here — keeps that component the source of truth).
  requisitesSlot?: React.ReactNode;
}

const TIMEZONES = [
  { tz: 'Asia/Almaty',         label: 'Алматы (UTC+5)' },
  { tz: 'Asia/Aqtau',          label: 'Актау (UTC+5)' },
  { tz: 'Asia/Atyrau',         label: 'Атырау (UTC+5)' },
  { tz: 'Asia/Aqtobe',         label: 'Актобе (UTC+5)' },
  { tz: 'Asia/Tashkent',       label: 'Ташкент (UTC+5)' },
  { tz: 'Europe/Moscow',       label: 'Москва (UTC+3)' },
  { tz: 'Europe/Kiev',         label: 'Киев (UTC+2)' },
  { tz: 'Asia/Dubai',          label: 'Дубай (UTC+4)' },
];

// Resize + downscale an uploaded image (avatar or logo) into a small data
// URL so localStorage doesn't fill up. 256px max for avatar, 512px for
// logo (logo needs more detail because it ends up in PDF invoices).
function imageToDataUrl(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Не изображение'));
    if (file.size > 4 * 1024 * 1024) return reject(new Error('Файл больше 4 МБ'));
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0, w, h);
        // PNG keeps transparency for logos; JPEG is smaller for photos.
        const isPng = file.type === 'image/png';
        resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.88));
      };
      img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsDataURL(file);
  });
}

// Used by the KPI strip to tell admins «4 of 5 filled». Counts non-empty
// strings (treats whitespace-only as empty).
function fillRatio(values: Array<string | undefined>): { filled: number; total: number; pct: number } {
  const total = values.length;
  const filled = values.filter(v => (v || '').trim().length > 0).length;
  return { filled, total, pct: total > 0 ? Math.round(filled / total * 100) : 0 };
}

export function GeneralSettings({ language, onLanguageChange, onLogout, requisitesSlot }: Props) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();
  const profile = store.profile;

  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef   = useRef<HTMLInputElement>(null);

  // Email-verification badge — admin / employee endpoint returns whether
  // the current user has clicked the «verify your email» link. We just
  // check once on mount and ignore failures (the badge degrades silently).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${localStorage.getItem('utir_auth_token') || ''}` },
        });
        if (!res.ok) return;
        const j = await res.json();
        if (!cancelled) setEmailVerified(!!j?.user?.emailVerified);
      } catch { /* network failure — leave badge null (hidden) */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-save indicator — flashes for 1.6s after any profile update.
  useEffect(() => {
    if (!savedFlash) return;
    const id = setTimeout(() => setSavedFlash(false), 1600);
    return () => clearTimeout(id);
  }, [savedFlash]);

  // Wraps updateProfile so every input change triggers the «Сохранено ✓»
  // flash. Profile fields auto-persist to localStorage via store; this is
  // just a visual confirmation.
  const upd = (patch: Partial<UserProfile>) => {
    store.updateProfile(patch);
    setSavedFlash(true);
  };

  // ─── Image upload handlers ────────────────────────────────────────
  const handleAvatar = async (f: File | null) => {
    if (!f) return;
    try {
      const url = await imageToDataUrl(f, 256);
      upd({ avatar: url });
    } catch (e: any) { setError(String(e?.message || e)); }
  };
  const handleLogo = async (f: File | null) => {
    if (!f) return;
    try {
      const url = await imageToDataUrl(f, 512);
      upd({ companyLogo: url });
    } catch (e: any) { setError(String(e?.message || e)); }
  };

  // KPI completion stats
  const profileFill = fillRatio([profile.name, profile.email, profile.phone, profile.avatar]);
  const companyFill = fillRatio([profile.companyName, profile.companyBIN, profile.companyAddress, profile.companyEmail, profile.companyPhone]);

  // Export all the team's data as JSON for backup / portability.
  async function exportData() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: store.profile,
      deals: store.deals,
      employees: store.employees,
      tasks: store.tasks,
      products: store.products,
      transactions: store.transactions,
      catalogs: store.catalogs,
      modules: store.modules,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `utir-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const initials = (profile.name || profile.email || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-5">
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-gray-900 mb-1">{l('Основные настройки', 'Жалпы баптаулар', 'General settings')}</h2>
          <p className="text-xs text-gray-400 max-w-xl">
            {l('Ваш профиль, реквизиты компании, язык. Большинство полей сохраняются автоматически при каждом изменении.',
               'Сіздің профиліңіз, компания деректері, тіл.',
               'Your profile, company details, language. Most fields auto-save on change.')}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] transition-opacity ${savedFlash ? 'opacity-100 bg-emerald-50 text-emerald-700' : 'opacity-0'}`}>
          <Check className="w-3 h-3" /> {l('Сохранено', 'Сақталды', 'Saved')}
        </div>
      </div>

      {/* ─── KPI strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        <CompletionCard
          icon={User}
          cls="bg-violet-50 text-violet-700"
          label={l('Профиль', 'Профиль', 'Profile')}
          filled={profileFill.filled}
          total={profileFill.total}
          pct={profileFill.pct}
        />
        <CompletionCard
          icon={Building2}
          cls="bg-sky-50 text-sky-700"
          label={l('Компания', 'Компания', 'Company')}
          filled={companyFill.filled}
          total={companyFill.total}
          pct={companyFill.pct}
        />
        <CompletionCard
          icon={Globe}
          cls="bg-emerald-50 text-emerald-700"
          label={l('Локализация', 'Локализация', 'Locale')}
          filled={1}
          total={1}
          pct={100}
          subText={(language === 'kz' ? '🇰🇿 Қазақша' : language === 'eng' ? '🇬🇧 English' : '🇷🇺 Русский') + ` · ${profile.timezone || 'Asia/Almaty'}`}
        />
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2 text-xs text-rose-700 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-rose-400">×</button>
        </div>
      )}

      {/* ─── Profile section ──────────────────────────────────── */}
      <SectionCard icon={User} cls="bg-violet-50 text-violet-700" title={l('Мой профиль', 'Менің профилім', 'My Profile')}
        subtitle={l('Видно только вам и админу команды', 'Тек сізге және әкімшіге көрінеді', 'Visible only to you and admin')}>
        <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleAvatar(e.target.files?.[0] || null)} />
        <div className="flex flex-col md:flex-row gap-5">
          {/* Avatar tile */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="relative w-24 h-24 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-2xl overflow-hidden mb-2 group ring-1 ring-violet-100"
              title={l('Загрузить фото', 'Сурет жүктеу', 'Upload photo')}
            >
              {profile.avatar ? (
                <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-violet-600 text-2xl font-medium">
                  {initials !== '?' ? initials : <Camera className="w-6 h-6" />}
                </span>
              )}
              <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <Camera className="w-5 h-5 text-white" />
              </span>
            </button>
            <div className="text-[10px] text-gray-400 mb-1">PNG, JPG · до 4 МБ</div>
            {profile.avatar && (
              <button onClick={() => upd({ avatar: '' })} className="text-[10px] text-gray-400 hover:text-rose-500">
                {l('Удалить', 'Жою', 'Remove')}
              </button>
            )}
          </div>
          {/* Fields */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={l('Имя', 'Аты', 'Name')} icon={User} value={profile.name} onChange={v => upd({ name: v })} placeholder={l('Введите имя', 'Атыңызды енгізіңіз', 'Enter name')} />
            <Field label={l('Должность', 'Лауазым', 'Position')} icon={Briefcase} value={profile.position} onChange={v => upd({ position: v })} placeholder={l('Например: Директор', 'Мысалы: Директор', 'e.g. Director')} />
            <div>
              <FieldLabel icon={Mail}>Email</FieldLabel>
              <div className="relative">
                <input
                  type="email"
                  value={profile.email}
                  onChange={e => upd({ email: e.target.value })}
                  placeholder="email@domen.kz"
                  className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 pr-20"
                />
                {emailVerified === true && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                    <ShieldCheck className="w-3 h-3" /> {l('подтверждён', 'расталған', 'verified')}
                  </span>
                )}
                {emailVerified === false && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                    {l('не подтверждён', 'расталмаған', 'unverified')}
                  </span>
                )}
              </div>
            </div>
            <Field label={l('Телефон', 'Телефон', 'Phone')} icon={Phone} value={profile.phone} onChange={v => upd({ phone: v })} placeholder="+7 ___ ___ __ __" />
          </div>
        </div>
      </SectionCard>

      {/* ─── Company section ─────────────────────────────────── */}
      <SectionCard icon={Building2} cls="bg-sky-50 text-sky-700" title={l('Компания', 'Компания', 'Company')}
        subtitle={l('Используется на счетах, актах и в шапке отчётов', 'Шот-фактураларда қолданылады', 'Used on invoices, acts and report headers')}>
        <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleLogo(e.target.files?.[0] || null)} />
        <div className="flex flex-col md:flex-row gap-5">
          {/* Company logo tile */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="relative w-24 h-24 bg-white rounded-2xl overflow-hidden mb-2 group ring-1 ring-gray-100 border border-dashed border-gray-200"
              title={l('Загрузить логотип', 'Логотип жүктеу', 'Upload logo')}
            >
              {profile.companyLogo ? (
                <img src={profile.companyLogo} alt="" className="w-full h-full object-contain p-2" />
              ) : (
                <span className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
                  <ImageIcon className="w-7 h-7 mb-1" />
                  <span className="text-[9px]">LOGO</span>
                </span>
              )}
              <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <Camera className="w-5 h-5 text-white" />
              </span>
            </button>
            <div className="text-[10px] text-gray-400 mb-1">PNG · 512px+</div>
            {profile.companyLogo && (
              <button onClick={() => upd({ companyLogo: '' })} className="text-[10px] text-gray-400 hover:text-rose-500">
                {l('Удалить', 'Жою', 'Remove')}
              </button>
            )}
          </div>
          {/* Fields */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={l('Название', 'Атауы', 'Name')} icon={Building2} value={profile.companyName} onChange={v => upd({ companyName: v })} placeholder={l('Название компании', 'Компания атауы', 'Company name')} />
            <Field label={l('БИН / ИИН', 'БСН / ЖСН', 'BIN/IIN')} icon={Hash} value={profile.companyBIN} onChange={v => upd({ companyBIN: v })} placeholder="000000000000" maxLength={20} />
            <div className="md:col-span-2">
              <Field label={l('Адрес', 'Мекенжай', 'Address')} icon={MapPin} value={profile.companyAddress} onChange={v => upd({ companyAddress: v })} placeholder={l('Город, улица, дом', 'Қала, көше, үй', 'City, street, building')} />
            </div>
            <Field label={l('Email компании', 'Компания email', 'Company email')} icon={Mail} value={profile.companyEmail} onChange={v => upd({ companyEmail: v })} placeholder="info@company.kz" type="email" />
            <Field label={l('Телефон компании', 'Компания телефоны', 'Company phone')} icon={Phone} value={profile.companyPhone} onChange={v => upd({ companyPhone: v })} placeholder="+7 ___ ___ __ __" />
          </div>
        </div>
      </SectionCard>

      {/* ─── Requisites (banking) ─── slot passed in from Settings.tsx */}
      {requisitesSlot}

      {/* ─── Localization ──────────────────────────────────────── */}
      <SectionCard icon={Globe} cls="bg-emerald-50 text-emerald-700" title={l('Язык и часовой пояс', 'Тіл және уақыт белдеуі', 'Language & timezone')}
        subtitle={l('Применяется ко всему интерфейсу и расчётам времени (например, налоги КЗ)', '...', 'Applies across the UI and time calculations')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-gray-400 mb-2 uppercase tracking-wide">{l('Язык интерфейса', 'Интерфейс тілі', 'UI Language')}</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { code: 'kz' as const,  flag: '🇰🇿', name: 'Қазақша' },
                { code: 'ru' as const,  flag: '🇷🇺', name: 'Русский' },
                { code: 'eng' as const, flag: '🇬🇧', name: 'English' },
              ].map(lang => (
                <button
                  key={lang.code}
                  onClick={() => onLanguageChange?.(lang.code)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${language === lang.code ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-200'}`}
                >
                  <span className="text-lg">{lang.flag}</span>
                  <span className="text-xs text-gray-600">{lang.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 mb-2 uppercase tracking-wide">{l('Часовой пояс', 'Уақыт белдеуі', 'Timezone')}</div>
            <select
              value={profile.timezone || 'Asia/Almaty'}
              onChange={e => upd({ timezone: e.target.value })}
              className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
            >
              {TIMEZONES.map(t => (
                <option key={t.tz} value={t.tz}>{t.label}</option>
              ))}
            </select>
            <div className="text-[10px] text-gray-400 mt-1">
              {l('Сейчас: ', 'Қазір: ', 'Now: ')}
              {new Date().toLocaleString(language === 'kz' ? 'kk-KZ' : language === 'eng' ? 'en-US' : 'ru-RU', {
                timeZone: profile.timezone || 'Asia/Almaty',
                hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
              })}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ─── Account actions ───────────────────────────────────── */}
      <SectionCard icon={Lock} cls="bg-gray-50 text-gray-700" title={l('Аккаунт', 'Аккаунт', 'Account')}
        subtitle={l('Экспорт данных, смена пароля, выход', '...', 'Data export, password, sign out')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            onClick={exportData}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs text-gray-700 border border-gray-100"
          >
            <Download className="w-3.5 h-3.5" /> {l('Экспорт моих данных', 'Деректерді экспорт', 'Export my data')}
          </button>
          <button
            onClick={() => alert(l('Смена пароля скоро будет доступна. Пока — выйдите и используйте «Восстановить пароль».', '...', 'Password change coming soon. For now sign out and use «Reset password».'))}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs text-gray-700 border border-gray-100"
          >
            <Lock className="w-3.5 h-3.5" /> {l('Сменить пароль', 'Пароль ауыстыру', 'Change password')}
          </button>
          {onLogout && (
            <button
              onClick={() => { if (confirm(l('Выйти из аккаунта?', 'Шығу?', 'Sign out?'))) onLogout(); }}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-rose-50 hover:bg-rose-100 rounded-xl text-xs text-rose-700 border border-rose-100"
            >
              <LogOut className="w-3.5 h-3.5" /> {l('Выйти', 'Шығу', 'Sign out')}
            </button>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────

function SectionCard({
  icon: Icon, cls, title, subtitle, children,
}: { icon: any; cls: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cls}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-900">{title}</div>
          {subtitle && <div className="text-[11px] text-gray-400 mt-0.5">{subtitle}</div>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function CompletionCard({
  icon: Icon, cls, label, filled, total, pct, subText,
}: { icon: any; cls: string; label: string; filled: number; total: number; pct: number; subText?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${cls}`}>
          <Icon className="w-3 h-3" />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <div className="text-lg text-gray-900 tabular-nums">{filled}<span className="text-gray-300 text-sm">/{total}</span></div>
        <div className={`text-[10px] px-1.5 py-0.5 rounded ${pct === 100 ? 'bg-emerald-50 text-emerald-700' : pct >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
          {pct}%
        </div>
      </div>
      {/* Progress bar */}
      <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {subText && <div className="text-[10px] text-gray-500 mt-1.5 truncate">{subText}</div>}
    </div>
  );
}

function FieldLabel({ icon: Icon, children }: { icon?: any; children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1">
      {Icon && <Icon className="w-2.5 h-2.5" />} {children}
    </div>
  );
}

function Field({
  label, icon, value, onChange, placeholder, type = 'text', maxLength,
}: {
  label: string; icon?: any; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; maxLength?: number;
}) {
  return (
    <div>
      <FieldLabel icon={icon}>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-200"
      />
    </div>
  );
}
