// Reset-password landing page. Email reset link routes here:
//   /#/reset-password?token=XXX
// Flow:
//   1. On mount → GET /api/auth/check-reset-token → render either the
//      form, "link expired" message, or "already used" message
//   2. User types + confirms new password → POST /reset-password
//   3. On success → redirect to /#/login with success toast
//
// Kept intentionally minimal — no logo / no marketing copy. The user is
// already 1 click deep from an email; they just want to reset and go.

import { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';

type Lang = 'kz' | 'ru' | 'eng';

interface ResetPasswordProps {
  language: Lang;
  onLanguageChange: (lang: Lang) => void;
}

type State =
  | { kind: 'checking' }
  | { kind: 'form' }
  | { kind: 'invalid'; reason: 'missing' | 'invalid' | 'used' | 'expired' }
  | { kind: 'saving' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

export function ResetPassword({ language, onLanguageChange }: ResetPasswordProps) {
  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  // Parse token from the URL hash. Pattern: #/reset-password?token=XXX
  const token = (() => {
    const h = window.location.hash;
    const m = /\?token=([A-Za-z0-9]+)/.exec(h);
    return m ? m[1] : '';
  })();

  const [state, setState] = useState<State>({ kind: 'checking' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Verify the token once on mount so we don't ask the user to type a
  // new password just to be told the link expired.
  useEffect(() => {
    if (!token) { setState({ kind: 'invalid', reason: 'missing' }); return; }
    let cancelled = false;
    api.get<{ valid: boolean; reason?: 'missing' | 'invalid' | 'used' | 'expired' }>(
      `/api/auth/check-reset-token?token=${encodeURIComponent(token)}`,
    )
      .then(r => {
        if (cancelled) return;
        if (r.valid) setState({ kind: 'form' });
        else setState({ kind: 'invalid', reason: r.reason || 'invalid' });
      })
      .catch(err => {
        if (cancelled) return;
        setState({ kind: 'error', message: String(err?.message || 'network') });
      });
    return () => { cancelled = true; };
  }, [token]);

  // Password validation mirrors the server check so we don't round-trip
  // for trivial cases. Server is still source of truth.
  const validatePassword = (p: string, c: string): string | null => {
    if (p.length < 8) return l('Минимум 8 символов', 'Кемінде 8 таңба', 'Minimum 8 characters');
    if (!/[A-Za-zА-Яа-яЁё]/.test(p) || !/\d/.test(p)) {
      return l('Пароль должен содержать букву и цифру', 'Әріп пен цифрдан тұруы керек', 'Must contain a letter and a digit');
    }
    if (p !== c) return l('Пароли не совпадают', 'Сәйкес келмейді', 'Passwords do not match');
    return null;
  };

  const handleSubmit = async () => {
    const err = validatePassword(password, confirm);
    if (err) { setState({ kind: 'error', message: err }); return; }
    setState({ kind: 'saving' });
    try {
      await api.post('/api/auth/reset-password', { token, password });
      setState({ kind: 'done' });
      // Auto-redirect to login after a beat so the user sees the
      // success state, then lands on a clean login page.
      setTimeout(() => { window.location.hash = ''; }, 2200);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg === 'token_expired')      setState({ kind: 'invalid', reason: 'expired' });
      else if (msg === 'token_already_used') setState({ kind: 'invalid', reason: 'used' });
      else if (msg === 'invalid_token') setState({ kind: 'invalid', reason: 'invalid' });
      else setState({ kind: 'error', message: msg || l('Ошибка', 'Қате', 'Error') });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">
      {/* Language switcher in corner */}
      <div className="absolute top-4 right-4 flex gap-1 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 p-1 rounded-2xl">
        {(['kz', 'ru', 'eng'] as const).map(lang => (
          <button
            key={lang}
            onClick={() => onLanguageChange(lang)}
            className={`px-2.5 py-1 rounded-xl text-[10px] transition-all ${
              language === lang ? 'bg-emerald-600 text-white shadow-[0_2px_8px_-2px_var(--accent-shadow)]' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {lang.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="w-full max-w-[420px]">
        <div className="bg-white/55 backdrop-blur-2xl backdrop-saturate-150 border border-white/60 shadow-[0_10px_36px_-14px_rgba(15,23,42,0.16),inset_0_1px_0_0_rgba(255,255,255,0.65)] rounded-3xl p-6 sm:p-8">
          {state.kind === 'checking' && (
            <div className="text-center py-8">
              <Loader2 className="w-7 h-7 text-slate-400 animate-spin mx-auto mb-3" />
              <div className="text-sm text-slate-500">{l('Проверяю ссылку…', 'Сілтемені тексеремін…', 'Verifying link…')}</div>
            </div>
          )}

          {state.kind === 'invalid' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <AlertTriangle className="w-7 h-7 text-rose-600" />
              </div>
              <h2 className="text-xl text-gray-900 mb-2">
                {state.reason === 'expired'
                  ? l('Ссылка истекла', 'Сілтеме мерзімі өтті', 'Link expired')
                  : state.reason === 'used'
                  ? l('Ссылка уже использована', 'Сілтеме пайдаланылған', 'Link already used')
                  : l('Недействительная ссылка', 'Жарамсыз сілтеме', 'Invalid link')}
              </h2>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                {state.reason === 'expired'
                  ? l('Срок действия ссылки — 1 час. Запросите новую на странице входа.',
                      'Сілтеменің мерзімі — 1 сағат. Кіру бетінде жаңасын сұраңыз.',
                      'Reset links expire after 1 hour. Request a new one from the login page.')
                  : state.reason === 'used'
                  ? l('Эта ссылка уже была использована для смены пароля. Запросите новую если нужно ещё раз.',
                      'Бұл сілтеме пайдаланылған. Қажет болса жаңасын сұраңыз.',
                      'This link has already been used. Request a new one if needed.')
                  : l('Ссылка некорректная или не существует. Запросите новую на странице входа.',
                      'Сілтеме қате немесе жоқ. Жаңасын сұраңыз.',
                      'The link is invalid or does not exist. Request a new one.')}
              </p>
              <button
                onClick={() => { window.location.hash = ''; }}
                className="w-full py-3 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all"
              >
                {l('К входу', 'Кіруге', 'Back to login')}
              </button>
            </div>
          )}

          {(state.kind === 'form' || state.kind === 'saving' || state.kind === 'error') && (
            <div>
              <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <ShieldCheck className="w-7 h-7 text-gray-900" />
              </div>
              <h2 className="text-xl text-gray-900 mb-1 text-center">{l('Новый пароль', 'Жаңа құпия сөз', 'New password')}</h2>
              <p className="text-sm text-slate-500 mb-6 text-center">
                {l('Придумайте пароль — минимум 8 символов, буква и цифра',
                   'Кемінде 8 таңба, әріп пен цифр',
                   'At least 8 characters with a letter and a digit')}
              </p>

              {state.kind === 'error' && (
                <div className="bg-rose-100/70 text-rose-700 text-xs px-4 py-2.5 rounded-2xl ring-1 ring-rose-200/60 mb-4 flex items-center gap-2 backdrop-blur-xl">
                  <div className="w-1.5 h-1.5 bg-rose-500 rounded-full flex-shrink-0" />{state.message}
                </div>
              )}

              <div className="space-y-3 mb-5">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5">{l('Пароль', 'Құпия сөз', 'Password')}</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                      className="w-full px-4 py-3 bg-white/60 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all pr-12"
                    />
                    <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-gray-600">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5">{l('Повторите пароль', 'Қайталаңыз', 'Confirm')}</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    className="w-full px-4 py-3 bg-white/60 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all"
                  />
                  {confirm && password === confirm && (
                    <div className="flex items-center gap-1 mt-1">
                      <Check className="w-3 h-3 text-green-500" />
                      <span className="text-[10px] text-green-500">{l('Совпадает', 'Сәйкес', 'Match')}</span>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={state.kind === 'saving' || !password || !confirm}
                className="w-full py-3 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {state.kind === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : l('Сохранить пароль', 'Сақтау', 'Save password')}
              </button>
            </div>
          )}

          {state.kind === 'done' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Check className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-xl text-gray-900 mb-2">{l('Пароль обновлён', 'Құпия сөз жаңартылды', 'Password updated')}</h2>
              <p className="text-sm text-slate-500 mb-6">
                {l('Сейчас вернёмся на страницу входа…',
                   'Кіру бетіне қайтамыз…',
                   'Redirecting to login…')}
              </p>
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin mx-auto" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
