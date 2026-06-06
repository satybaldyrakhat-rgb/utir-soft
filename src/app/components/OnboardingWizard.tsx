// First-run setup wizard. Shown once per team — App.tsx checks
// `store.onboarding.completed` and mounts this if false. Steps can be
// skipped (except niche, which has a default), so users in a hurry can
// finish in ~30 seconds. State persists between steps so back/forward
// doesn't lose data.
//
// Steps:
//   1. Niche      — what kind of business (drives stages, role labels)
//   2. Company    — name + logo (lives in user profile / localStorage)
//   3. Requisites — БИН, IBAN, bank — for invoices (optional)
//   4. Team       — invite first teammate (optional, deferrable)
//   5. Integrations — Telegram bot / Kaspi (informational link to Settings)
//
// On finish: PATCH /api/team/profile { onboarding: { completed: true, ... } }
// so the wizard never shows again.

import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, Sparkles, Upload, Mail, Send, Bot, CreditCard, MessageCircle, BarChart3 } from 'lucide-react';
import { useDataStore } from '../utils/dataStore';
import { NICHES, NICHE_ORDER, type NicheId } from '../utils/niches';
import { api } from '../utils/api';

type Lang = 'kz' | 'ru' | 'eng';

interface OnboardingWizardProps {
  language: Lang;
  onDone: () => void;
  currentUserName?: string;
  currentUserEmail?: string;
}

type StepId = 'niche' | 'company' | 'requisites' | 'team' | 'integrations';
const STEPS: StepId[] = ['niche', 'company', 'requisites', 'team', 'integrations'];

interface Requisites {
  legalName: string;
  bin: string;
  iban: string;
  bankName: string;
  director: string;
}

export function OnboardingWizard({ language, onDone, currentUserName, currentUserEmail }: OnboardingWizardProps) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;
  const store = useDataStore();

  // Pre-fill from existing profile so re-running the wizard (after
  // a manual reset by admin) doesn't make the user re-type everything.
  const [stepIdx, setStepIdx] = useState(0);
  const [selectedNiche, setSelectedNiche] = useState<NicheId>((store.niche as NicheId) || 'furniture');
  const [companyName, setCompanyName] = useState(store.profile.companyName || '');
  const [companyLogo, setCompanyLogo] = useState(store.profile.avatar || '');
  const [requisites, setRequisites] = useState<Requisites>({
    legalName: '', bin: '', iban: '', bankName: '', director: currentUserName || '',
  });
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  // ── Logo upload (data URL via FileReader) ──────────────────────
  const onLogoFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError(l('Логотип больше 2 МБ', '2 МБ-дан үлкен', 'Logo exceeds 2 MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCompanyLogo(String(reader.result || ''));
    reader.onerror = () => setError(l('Не удалось прочитать файл', 'Файлды оқу мүмкін болмады', 'Failed to read file'));
    reader.readAsDataURL(file);
  };

  // ── Send first-teammate invite (optional step) ──────────────────
  const sendInvite = async () => {
    if (!inviteEmail || !inviteEmail.includes('@')) {
      setInviteError(l('Введите корректный email', 'Дұрыс email енгізіңіз', 'Enter a valid email'));
      return;
    }
    setInviteError('');
    try {
      await api.post('/api/invitations', { email: inviteEmail, role: 'employee' });
      setInviteSent(true);
    } catch (e: any) {
      setInviteError(String(e?.message || l('Не удалось отправить', 'Жіберілмеді', 'Could not send')));
    }
  };

  // ── Persist + finish ───────────────────────────────────────────
  // Every step saves what it can on Next, so a tab close in the middle
  // doesn't lose work. Final step marks onboarding completed=true so
  // App.tsx stops mounting the wizard.
  const saveStep = async () => {
    setError('');
    if (step === 'niche') {
      await store.setNiche(selectedNiche);
    } else if (step === 'company') {
      if (companyName.trim()) {
        store.updateProfile({ companyName: companyName.trim(), avatar: companyLogo || undefined });
      }
    } else if (step === 'requisites') {
      // Skip silently if all empty — user opted out.
      const filled = Object.values(requisites).some(v => v && String(v).trim());
      if (filled) {
        try { await api.put('/api/team/requisites', requisites); }
        catch (e: any) { console.warn('[onboarding] requisites save failed', e); }
      }
    }
    // team + integrations steps don't have explicit per-step persists —
    // invite is its own action via sendInvite(), integrations is just
    // informational (deeplinks to Settings).
  };

  const next = async () => {
    try {
      await saveStep();
      if (isLast) {
        setFinishing(true);
        await store.setOnboarding({ completed: true, completedAt: new Date().toISOString() });
        onDone();
      } else {
        setStepIdx(stepIdx + 1);
      }
    } catch (e: any) {
      setError(String(e?.message || l('Ошибка сохранения', 'Сақтау қатесі', 'Save failed')));
    } finally {
      setFinishing(false);
    }
  };
  const back = () => { setError(''); setStepIdx(Math.max(0, stepIdx - 1)); };
  const skipAll = async () => {
    // "Пропустить" on any step → save current step + mark completed.
    // User can always come back to Settings → Профиль команды later.
    setFinishing(true);
    try {
      await saveStep();
      await store.setOnboarding({ completed: true, completedAt: new Date().toISOString() });
      onDone();
    } catch (e: any) {
      setError(String(e?.message || l('Ошибка', 'Қате', 'Error')));
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">
      {/* Glass-panel card matching Auth style so the transition from
          signup → wizard feels continuous. */}
      <div className="w-full max-w-[640px]">
        {/* Step indicator — 5 progress segments */}
        <div className="flex items-center gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all ${
                i <= stepIdx ? 'bg-emerald-600' : 'bg-white/60 ring-1 ring-white/40'
              }`}
            />
          ))}
        </div>

        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 border border-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl p-6 sm:p-8">
          {/* Header with step counter + skip button */}
          <div className="flex items-center justify-between mb-5">
            <div className="text-[10px] uppercase tracking-widest text-slate-400">
              {l('Шаг', 'Қадам', 'Step')} {stepIdx + 1} / {STEPS.length}
            </div>
            <button
              onClick={skipAll}
              disabled={finishing}
              className="text-[11px] text-slate-500 hover:text-slate-900 transition-colors disabled:opacity-40"
            >
              {l('Пропустить всё', 'Барлығын өткізу', 'Skip all')}
            </button>
          </div>

          {error && (
            <div className="bg-rose-100/70 text-rose-700 text-xs px-4 py-2.5 rounded-2xl ring-1 ring-rose-200/60 mb-4 flex items-center gap-2 backdrop-blur-xl">
              <div className="w-1.5 h-1.5 bg-rose-500 rounded-full flex-shrink-0" />{error}
            </div>
          )}

          {/* ─── STEP 1: NICHE ───────────────────────────────── */}
          {step === 'niche' && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xl text-slate-900">{l('Какая у вас ниша?', 'Қандай сала?', 'What is your niche?')}</h2>
              </div>
              <p className="text-sm text-slate-500 mb-5">
                {l('Платформа подстроит этапы производства, материалы и роли под выбранную нишу. Можно поменять позже в Настройках.',
                   'Платформа таңдалған салаға кезеңдерді, материалдарды және рөлдерді бейімдейді. Кейін Параметрлерде өзгертуге болады.',
                   'The platform adapts stages, materials and roles to your niche. You can change it later in Settings.')}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[400px] overflow-y-auto">
                {NICHE_ORDER.map(nid => {
                  const n = NICHES[nid];
                  const isSel = selectedNiche === nid;
                  return (
                    <button
                      key={nid}
                      onClick={() => setSelectedNiche(nid)}
                      className={`text-left p-3 rounded-2xl ring-1 transition-all ${
                        isSel
                          ? 'bg-emerald-50 ring-emerald-300 shadow-[0_4px_16px_-8px_rgba(16,185,129,0.4)]'
                          : 'bg-white/60 ring-white/60 hover:bg-white/85'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-2xl">{n.icon}</span>
                        {isSel && <Check className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <div className={`text-xs mb-0.5 ${isSel ? 'text-emerald-900' : 'text-slate-900'}`}>{n.name[language]}</div>
                      <div className="text-[10px] text-slate-500 leading-tight line-clamp-2">{n.description[language]}</div>
                    </button>
                  );
                })}
              </div>
              {/* Preview of what selecting this niche means */}
              <div className="mt-4 p-3 bg-white/40 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-[11px] text-slate-600">
                <div className="text-slate-500 mb-1">
                  {l('Этапы производства:', 'Өндіріс кезеңдері:', 'Production stages:')}
                </div>
                <div className="flex flex-wrap gap-1">
                  {NICHES[selectedNiche].productionStages.map(s => (
                    <span key={s.id} className="px-2 py-0.5 bg-white/70 rounded-full text-slate-700">
                      {s[language]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── STEP 2: COMPANY NAME + LOGO ─────────────────── */}
          {step === 'company' && (
            <div>
              <h2 className="text-xl text-slate-900 mb-1">{l('Название и логотип', 'Атау мен логотип', 'Name & logo')}</h2>
              <p className="text-sm text-slate-500 mb-5">
                {l('Будут показаны в шапке платформы, на счетах и в PDF-отчётах.',
                   'Платформа бастамасында, шот-фактураларда және PDF есептерде көрсетіледі.',
                   'Shown in the platform header, on invoices and PDF reports.')}
              </p>
              <div className="space-y-4">
                {/* Logo uploader — 80×80 preview, click to pick */}
                <div className="flex items-center gap-4">
                  <label className="cursor-pointer relative group">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => onLogoFile(e.target.files?.[0])}
                    />
                    {companyLogo ? (
                      <img
                        src={companyLogo}
                        alt=""
                        className="w-20 h-20 rounded-2xl object-cover ring-1 ring-white/60"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-white/60 ring-1 ring-white/60 ring-dashed flex items-center justify-center text-slate-400">
                        <Upload className="w-5 h-5" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-2xl flex items-center justify-center text-white text-[10px] transition-opacity">
                      {l('Загрузить', 'Жүктеу', 'Upload')}
                    </div>
                  </label>
                  <div className="flex-1">
                    <label className="block text-[11px] text-slate-500 mb-1.5">
                      {l('Название компании', 'Компания атауы', 'Company name')}
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder={l('ТОО «Ваша компания»', 'ЖШС «Сіздің компания»', 'Your Company LLP')}
                      autoFocus
                      className="w-full px-4 py-2.5 bg-white/60 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  {l('Логотип: PNG/JPG, до 2 МБ. Лучше квадрат.',
                     'Логотип: PNG/JPG, 2 МБ-ға дейін.',
                     'Logo: PNG/JPG, up to 2 MB. Square preferred.')}
                </p>
              </div>
            </div>
          )}

          {/* ─── STEP 3: REQUISITES ──────────────────────────── */}
          {step === 'requisites' && (
            <div>
              <h2 className="text-xl text-slate-900 mb-1">{l('Реквизиты компании', 'Компания деректемелері', 'Company requisites')}</h2>
              <p className="text-sm text-slate-500 mb-5">
                {l('Используются на счёт-фактурах и актах. Можно пропустить и заполнить позже в Настройках.',
                   'Шот-фактуралар мен актілерде қолданылады. Кейін Параметрлерде толтыруға болады.',
                   'Used on invoices and acts. You can skip and fill in later from Settings.')}
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5">
                    {l('Юридическое название', 'Заңды атауы', 'Legal name')}
                  </label>
                  <input
                    type="text"
                    value={requisites.legalName}
                    onChange={e => setRequisites({ ...requisites, legalName: e.target.value })}
                    placeholder={l('ТОО «Название»', 'ЖШС «Атау»', 'LLP "Name"')}
                    autoFocus
                    className="w-full px-4 py-2.5 bg-white/60 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1.5">БИН / ИИН</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={12}
                      value={requisites.bin}
                      onChange={e => setRequisites({ ...requisites, bin: e.target.value.replace(/[^0-9]/g, '').slice(0, 12) })}
                      placeholder="123456789012"
                      className="w-full px-4 py-2.5 bg-white/60 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1.5">{l('Директор', 'Директор', 'Director')}</label>
                    <input
                      type="text"
                      value={requisites.director}
                      onChange={e => setRequisites({ ...requisites, director: e.target.value })}
                      placeholder={currentUserName || l('ФИО', 'Аты-жөні', 'Full name')}
                      className="w-full px-4 py-2.5 bg-white/60 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5">{l('Банк', 'Банк', 'Bank')}</label>
                  <input
                    type="text"
                    value={requisites.bankName}
                    onChange={e => setRequisites({ ...requisites, bankName: e.target.value })}
                    placeholder={l('АО «Halyk Bank»', 'АҚ «Halyk Bank»', 'JSC "Halyk Bank"')}
                    className="w-full px-4 py-2.5 bg-white/60 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5">IBAN</label>
                  <input
                    type="text"
                    value={requisites.iban}
                    onChange={e => setRequisites({ ...requisites, iban: e.target.value.toUpperCase() })}
                    placeholder="KZ123456789012345678"
                    className="w-full px-4 py-2.5 bg-white/60 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all font-mono tracking-wider"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ─── STEP 4: INVITE TEAMMATE ─────────────────────── */}
          {step === 'team' && (
            <div>
              <h2 className="text-xl text-slate-900 mb-1">{l('Пригласите коллегу', 'Әріптесті шақырыңыз', 'Invite a teammate')}</h2>
              <p className="text-sm text-slate-500 mb-5">
                {l('Замерщик, дизайнер или менеджер — пусть начнут работать сразу. Можно пропустить.',
                   'Өлшеуші, дизайнер немесе менеджер — бірден жұмысқа кірісе алады. Өткізуге болады.',
                   'Measurer, designer or manager — let them start right away. Optional.')}
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={e => { setInviteEmail(e.target.value); setInviteError(''); }}
                      placeholder="colleague@company.kz"
                      disabled={inviteSent}
                      onKeyDown={e => e.key === 'Enter' && !inviteSent && sendInvite()}
                      className="w-full pl-10 pr-4 py-2.5 bg-white/60 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all disabled:opacity-60"
                    />
                  </div>
                  {inviteError && <div className="text-[11px] text-rose-600 mt-1.5">{inviteError}</div>}
                </div>
                {!inviteSent ? (
                  <button
                    onClick={sendInvite}
                    disabled={!inviteEmail}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-2xl text-sm text-slate-700 hover:bg-white transition-all disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {l('Отправить приглашение', 'Шақыру жіберу', 'Send invitation')}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl text-emerald-700 text-xs">
                    <Check className="w-4 h-4 flex-shrink-0" />
                    {l(`Приглашение отправлено на ${inviteEmail}. Они получат ссылку для регистрации.`,
                       `${inviteEmail} мекенжайына шақыру жіберілді.`,
                       `Invitation sent to ${inviteEmail}.`)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── STEP 5: INTEGRATIONS (informational) ────────── */}
          {step === 'integrations' && (
            <div>
              <h2 className="text-xl text-slate-900 mb-1">{l('Готово к запуску', 'Іске қосуға дайын', 'Ready to launch')}</h2>
              <p className="text-sm text-slate-500 mb-5">
                {l('Дальше — Telegram-бот, Kaspi, WhatsApp. Подключайте по мере роста бизнеса.',
                   'Кейіннен — Telegram-бот, Kaspi, WhatsApp. Бизнес өскен сайын қосыңыз.',
                   'Next — Telegram bot, Kaspi, WhatsApp. Connect as your business grows.')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { icon: Bot, title: l('Telegram-бот', 'Telegram-бот', 'Telegram bot'),
                    desc: l('AI-помощник в мессенджере: «Закрыл клиента X на 500к»',
                            'Хабарламадағы AI: «X клиентті жаптым»',
                            'AI assistant in chat') },
                  { icon: CreditCard, title: 'Kaspi Pay',
                    desc: l('Авто-сверка оплат с банка', 'Банк төлемдерін автоматты салыстыру', 'Auto-reconcile payments') },
                  { icon: MessageCircle, title: 'WhatsApp / Instagram',
                    desc: l('Заявки с мессенджеров в воронку', 'Хабарламалардан өтінімдер', 'Leads from messengers') },
                  { icon: BarChart3, title: '1С / Halyk Bank',
                    desc: l('Импорт выписок и бухучёт', 'Көшірмелерді импорттау', 'Statement import') },
                ].map((it, i) => {
                  const TileIcon = it.icon;
                  return (
                  <div key={i} className="p-3 bg-white/60 ring-1 ring-white/60 rounded-2xl">
                    <div className="flex items-center gap-2 mb-1">
                      <TileIcon className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
                      <span className="text-xs text-slate-900">{it.title}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 leading-snug">{it.desc}</div>
                  </div>
                  );
                })}
              </div>
              <div className="mt-4 p-3 bg-emerald-50/80 ring-1 ring-emerald-200/60 rounded-2xl text-[11px] text-emerald-900">
                {l('После завершения откроется ваш Dashboard. Все интеграции — в Настройках → Интеграции.',
                   'Аяқтағаннан кейін Dashboard ашылады.',
                   'After finishing you land on your Dashboard. Integrations live in Settings.')}
              </div>
              {currentUserEmail && (
                <div className="mt-3 text-[10px] text-slate-400">
                  {l('Аккаунт:', 'Аккаунт:', 'Account:')} {currentUserEmail}
                </div>
              )}
            </div>
          )}

          {/* ─── Navigation ─────────────────────────────────── */}
          <div className="mt-6 flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                onClick={back}
                disabled={finishing}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-white/60 ring-1 ring-white/60 rounded-2xl text-sm text-slate-700 hover:bg-white transition-all disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                {l('Назад', 'Артқа', 'Back')}
              </button>
            )}
            <button
              onClick={next}
              disabled={finishing || (step === 'niche' && !selectedNiche)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all disabled:opacity-40"
            >
              {finishing
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : isLast
                  ? <>{l('Запустить платформу', 'Платформаны іске қосу', 'Launch platform')} <Check className="w-4 h-4" /></>
                  : <>{l('Далее', 'Келесі', 'Next')} <ChevronRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-400 mt-4">
          {l('Все настройки можно изменить позже в Настройках', 'Барлық параметрлер кейін өзгертіледі', 'All settings editable later in Settings')}
        </p>
      </div>
    </div>
  );
}
