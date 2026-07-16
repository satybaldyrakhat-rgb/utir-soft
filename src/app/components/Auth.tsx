import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, ArrowLeft, Check, Loader2, Mail, ShieldCheck, ArrowRight, Package, ChevronRight, ChevronDown, Phone, Sparkles, BarChart3, MessageCircle } from 'lucide-react';

// Country dial codes for the phone-login field. Kazakhstan first (primary
// market); the rest cover neighbouring CIS countries.
const DIAL_CODES = [
  { flag: '🇰🇿', code: '+7' },
  { flag: '🇺🇿', code: '+998' },
  { flag: '🇰🇬', code: '+996' },
  { flag: '🇹🇯', code: '+992' },
  { flag: '🇦🇿', code: '+994' },
  { flag: '🇹🇲', code: '+993' },
  { flag: '🇬🇪', code: '+995' },
];
import profileLogo from '../../imports/utirsoft.png';
import { api, setToken } from '../utils/api';

interface AuthProps {
  onLogin: (user: { name: string; email: string; avatar?: string; teamRole?: string }) => void;
  language: 'kz' | 'ru' | 'eng';
  onLanguageChange: (lang: 'kz' | 'ru' | 'eng') => void;
}

// Console structure: a single glass panel with a Вход/Регистрация tab
// switcher. Multi-step sub-flows (OTP after signup, password reset) render
// as full-panel screens with a back arrow.
type AuthStep = 'console' | 'otp' | 'forgot' | 'forgot-sent';

export function Auth({ onLogin, language, onLanguageChange }: AuthProps) {
  const [step, setStep] = useState<AuthStep>('console');
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  // Auth method within a tab: email/password or phone/SMS-code.
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [phone, setPhone] = useState('');
  const [dialCode, setDialCode] = useState('+7');
  // Which flow the OTP screen is verifying — email confirmation or phone login.
  const [otpFor, setOtpFor] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [otpTimer, setOtpTimer] = useState(60);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Team invitation flow ────────────────────────────────────────
  // If the URL has ?invite=XYZ we fetch a preview (company + inviter + role)
  // and prefill the signup form. Company field becomes hidden — the invited
  // user inherits the inviter's company.
  const [inviteCode, setInviteCode] = useState<string>('');
  const [invitePreview, setInvitePreview] = useState<
    | { company: string; inviter: string; role: string; email?: string }
    | { error: string }
    | null
  >(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('invite');
      if (!code) return;
      setInviteCode(code.toUpperCase());
      // Jump straight into the signup tab so the invited user starts there.
      setStep('console');
      setTab('signup');
      api.get<{ company: string; inviter: string; role: string; email?: string | null }>(
        `/api/invitations/preview/${encodeURIComponent(code)}`,
      ).then(p => {
        setInvitePreview({ company: p.company, inviter: p.inviter, role: p.role, email: p.email || undefined });
        if (p.email && !email) setEmail(p.email);
        if (p.company) setCompany(p.company);
      }).catch(err => {
        // Log full details to the console so we can see exactly what went wrong
        // (network failure, 404, CORS) — the UI message stays user-friendly.
        console.warn('[invite preview] failed', { code, err });
        const msg = String(err?.message || 'invalid').toLowerCase();
        const bucket = msg.includes('expired')
          ? 'expired'
          : msg.includes('already used')
            ? 'used'
            : msg.includes('invalid code')
              ? 'invalid'
              : 'network'; // any other error (network, CORS, server down) lands here
        setInvitePreview({ error: bucket });
      });
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const l = (ru: string, kz: string, eng: string) => language === 'kz' ? kz : language === 'eng' ? eng : ru;

  // ── OAuth return handler ────────────────────────────────────────
  // After Google/Facebook the backend redirects to /?token=<jwt> (success)
  // or /?oauth=<reason> (not configured / failed). Pick it up on mount.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      // Токен теперь приходит во фрагменте (#oauth_token=) — не утекает в
      // Referer/логи. Старый ?token= читаем как fallback (совместимость).
      const hashMatch = /(?:^#|&)oauth_token=([^&]+)/.exec(window.location.hash || '');
      const oauthToken = (hashMatch ? decodeURIComponent(hashMatch[1]) : null) || p.get('token');
      const oauthErr = p.get('oauth');
      if (oauthToken) {
        setToken(oauthToken);
        window.history.replaceState({}, '', window.location.pathname);
        window.dispatchEvent(new Event('utir:auth-changed'));
        window.location.reload();
        return;
      }
      if (oauthErr) {
        setError(oauthErr === 'notconfigured'
          ? l('Вход через Google/Facebook ещё не настроен администратором.', 'Google/Facebook кіру әлі бапталмаған.', 'Google/Facebook sign-in is not configured yet.')
          : oauthErr === 'noemail'
            ? l('Аккаунт не отдал email. Разрешите доступ к email или войдите иначе.', 'Аккаунт email бермеді.', 'The account did not share an email.')
            : l('Не удалось войти через соцсеть. Попробуйте ещё раз.', 'Әлеуметтік желі арқылы кіру сәтсіз.', 'Social sign-in failed. Try again.'));
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // API origin for full-page OAuth redirects (buttons are <a> to the backend).
  // In prod the API lives on another origin (Railway) → use VITE_API_BASE_URL.
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string) || '';

  // Format a KZ phone for display: +7 700 000 00 00. Stores raw digits.
  const formatKzPhone = (raw: string): string => {
    let d = raw.replace(/\D/g, '');
    // Disambiguate the country code by LENGTH (KZ national numbers also start
    // with 7): 11 digits ⇒ has country code (7…/8…) → drop it → 10 national.
    if (d.length === 11 && d[0] === '8') d = d.slice(1);
    else if (d.length === 11 && d[0] === '7') d = d.slice(1);
    const p = d.slice(0, 10); // national part, up to 10 digits
    let out = '+7';
    if (p.length > 0) out += ' ' + p.slice(0, 3);
    if (p.length >= 4) out += ' ' + p.slice(3, 6);
    if (p.length >= 7) out += ' ' + p.slice(6, 8);
    if (p.length >= 9) out += ' ' + p.slice(8, 10);
    return out;
  };

  // National part only (no dial code), grouped 3-3-2-2. The dial code lives in
  // its own dropdown, so the input shows just the local number.
  const formatNational = (raw: string): string => {
    let d = raw.replace(/\D/g, '');
    if (d.length === 11 && (d[0] === '7' || d[0] === '8')) d = d.slice(1);
    d = d.slice(0, 10);
    let out = '';
    if (d.length > 0) out += d.slice(0, 3);
    if (d.length >= 4) out += ' ' + d.slice(3, 6);
    if (d.length >= 7) out += ' ' + d.slice(6, 8);
    if (d.length >= 9) out += ' ' + d.slice(8, 10);
    return out;
  };

  // Request an SMS code (phone login/signup) then jump to the OTP screen.
  const handlePhoneStart = async () => {
    let digits = phone.replace(/\D/g, '');
    // Drop country code (7/8) if present so we validate the 10 national digits.
    if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) digits = digits.slice(1);
    if (digits.length < 10) { setError(l('Введите номер телефона полностью', 'Телефон нөмірін толық енгізіңіз', 'Enter the full phone number')); return; }
    if (tab === 'signup') {
      if (!name.trim()) { setError(l('Введите имя', 'Атыңызды енгізіңіз', 'Enter your name')); return; }
      if (!company.trim()) { setError(l('Введите название компании', 'Компания атауын енгізіңіз', 'Enter your company name')); return; }
      if (!agreeTerms) { setError(l('Необходимо принять условия использования', 'Пайдалану шарттарын қабылдау керек', 'You must accept the terms of use')); return; }
    }
    setIsLoading(true); setError('');
    try {
      const r = await api.post<{ ok: boolean; smsSent?: boolean; code?: string }>('/api/auth/phone/start', { phone: `${dialCode} ${formatNational(phone)}`, mode: tab, name, company });
      if (r.code) setDevVerificationCode(r.code);
      setOtpFor('phone'); setStep('otp');
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg === 'phone already registered') setError(l('Этот номер уже зарегистрирован — войдите.', 'Бұл нөмір тіркелген — кіріңіз.', 'This number is already registered — sign in.'));
      else if (msg === 'phone not found') setError(l('Номер не найден — сначала зарегистрируйтесь.', 'Нөмір табылмады — алдымен тіркеліңіз.', 'Number not found — sign up first.'));
      else if (msg === 'invalid phone') setError(l('Некорректный номер телефона', 'Қате телефон нөмірі', 'Invalid phone number'));
      else setError(msg || l('Не удалось отправить код', 'Код жіберілмеді', 'Could not send code'));
    } finally { setIsLoading(false); }
  };

  // OTP timer
  useEffect(() => {
    if (step === 'otp' && otpTimer > 0) {
      const timer = setTimeout(() => setOtpTimer(otpTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [step, otpTimer]);

  // Auto-focus first OTP input
  useEffect(() => {
    if (step === 'otp') { otpRefs.current[0]?.focus(); setOtpTimer(60); }
  }, [step]);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value[value.length - 1];
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];
    pasted.split('').forEach((ch, i) => { newOtp[i] = ch; });
    setOtp(newOtp);
    if (pasted.length >= 6) otpRefs.current[5]?.focus();
    else otpRefs.current[pasted.length]?.focus();
  };

  const simulateLoading = (callback: () => void, ms = 600) => {
    setIsLoading(true); setError('');
    setTimeout(() => { setIsLoading(false); callback(); }, ms);
  };

  const finishAuth = (data: { token: string; user: { id: string; name: string; email: string; teamRole?: string } }) => {
    setToken(data.token);
    window.dispatchEvent(new Event('utir:auth-changed'));
    onLogin({ name: data.user.name, email: data.user.email, teamRole: data.user.teamRole });
  };

  const handleLogin = async () => {
    if (!email || !email.includes('@')) { setError(l('Введите корректный email', 'Дұрыс email енгізіңіз', 'Enter a valid email')); return; }
    if (!password) { setError(l('Введите пароль', 'Құпия сөзді енгізіңіз', 'Enter password')); return; }
    setIsLoading(true); setError('');
    try {
      const data = await api.post<{ token: string; user: { id: string; name: string; email: string; company?: string; emailVerified?: boolean }; verificationCode?: string }>(
        '/api/auth/login',
        { email, password }
      );
      setToken(data.token);
      setName(data.user.name);
      if (data.user.company) setCompany(data.user.company);
      if (data.user.emailVerified === false) {
        // Account exists but email never confirmed — push them to the OTP screen with the dev code.
        setDevVerificationCode(data.verificationCode || '');
        setStep('otp');
        return;
      }
      finishAuth(data);
    } catch (err: any) {
      setError(err?.message === 'invalid credentials'
        ? l('Неверный email или пароль', 'Қате email немесе құпия сөз', 'Invalid email or password')
        : (err?.message || l('Ошибка входа', 'Кіру қатесі', 'Login failed')));
    } finally {
      setIsLoading(false);
    }
  };

  // Dev-mode verification code received from the signup/resend response.
  // Displayed on the OTP screen so the tester doesn't need a real inbox.
  const [devVerificationCode, setDevVerificationCode] = useState<string>('');

  const handleSignup = async () => {
    if (!name.trim()) { setError(l('Введите имя', 'Атыңызды енгізіңіз', 'Enter your name')); return; }
    if (!hasValidInvite && !company.trim()) { setError(l('Введите название компании', 'Компания атауын енгізіңіз', 'Enter your company name')); return; }
    if (!email || !email.includes('@')) { setError(l('Введите корректный email', 'Дұрыс email енгізіңіз', 'Enter a valid email')); return; }
    if (password.length < 8) { setError(l('Минимум 8 символов', 'Кемінде 8 таңба', 'Minimum 8 characters')); return; }
    if (!/[A-Za-zА-Яа-яЁё]/.test(password) || !/\d/.test(password)) {
      setError(l('Пароль должен содержать букву и цифру', 'Құпия сөз әріп пен цифрдан тұруы керек', 'Password must contain a letter and a digit'));
      return;
    }
    if (password !== confirmPassword) { setError(l('Пароли не совпадают', 'Құпия сөздер сәйкес келмейді', 'Passwords do not match')); return; }
    if (!agreeTerms) { setError(l('Необходимо принять условия использования', 'Пайдалану шарттарын қабылдау керек', 'You must accept the terms of use')); return; }
    setIsLoading(true); setError('');
    try {
      const data = await api.post<{ token: string; user: { id: string; name: string; email: string; company: string; emailVerified: boolean }; verificationCode?: string }>(
        '/api/auth/signup',
        // inviteCode (if present) tells the backend to join an existing team
        // rather than create a new one. Backend then ignores the `company` field
        // and uses the inviter's instead.
        { email, password, name, company, termsAccepted: true, inviteCode: inviteCode || undefined }
      );
      // Account created; email not yet verified. Authorize subsequent verify calls with the token
      // and stash the dev-mode code so the OTP screen can show it (no real email is sent).
      setToken(data.token);
      setDevVerificationCode(data.verificationCode || '');
      setStep('otp');
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg === 'email already registered') setError(l('Этот email уже зарегистрирован', 'Бұл email тіркелген', 'Email already registered'));
      else if (msg === 'terms must be accepted') setError(l('Необходимо принять условия использования', 'Пайдалану шарттарын қабылдау керек', 'You must accept the terms of use'));
      else if (msg === 'company required') setError(l('Введите название компании', 'Компания атауын енгізіңіз', 'Enter your company name'));
      else if (msg === 'invalid email') setError(l('Некорректный email', 'Жарамсыз email', 'Invalid email'));
      else if (msg.startsWith('password must')) setError(l('Пароль должен содержать букву и цифру, минимум 8 символов', 'Құпия сөз әріп пен цифрдан тұруы керек, кемінде 8 таңба', 'Password must contain a letter and a digit, at least 8 chars'));
      else setError(msg || l('Ошибка регистрации', 'Тіркелу қатесі', 'Signup failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpVerify = async () => {
    const code = otp.join('');
    if (code.length < 6) { setError(l('Введите все 6 цифр', 'Барлық 6 цифрды енгізіңіз', 'Enter all 6 digits')); return; }
    setIsLoading(true); setError('');
    try {
      if (otpFor === 'phone') {
        // Phone login/signup — verify code, receive token + user.
        const data = await api.post<{ token: string; user: { name: string; email: string } }>('/api/auth/phone/verify', { phone, code });
        setToken(data.token);
        window.dispatchEvent(new Event('utir:auth-changed'));
        onLogin({ name: data.user.name, email: data.user.email });
      } else {
        // Email confirmation — token already set at signup/login time.
        await api.post('/api/auth/verify-email', { code });
        window.dispatchEvent(new Event('utir:auth-changed'));
        onLogin({ name, email });
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg === 'invalid code') setError(l('Неверный код', 'Қате код', 'Invalid code'));
      else setError(msg || l('Ошибка подтверждения', 'Растау қатесі', 'Verification failed'));
    } finally {
      setIsLoading(false);
    }
  };

  // Resend depends on which flow the OTP screen serves.
  const resendCurrent = () => otpFor === 'phone' ? handlePhoneStart() : handleResendCode();

  const handleResendCode = async () => {
    setIsLoading(true); setError('');
    try {
      const data = await api.post<{ verificationCode?: string }>('/api/auth/resend-code', {});
      if (data.verificationCode) setDevVerificationCode(data.verificationCode);
      setOtpTimer(60);
      setOtp(['', '', '', '', '', '']);
    } catch (err: any) {
      setError(String(err?.message || ''));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = (_provider: string) => {
    setError(l('Социальный вход пока недоступен. Используйте email.', 'Әлеуметтік кіру қол жетімсіз. Email пайдаланыңыз.', 'Social login is not configured yet. Use email.'));
  };

  // Dev-mode reset token surfaced when no email provider is configured —
  // mirrors the OTP dev fallback so local/test users can complete the
  // flow without a real inbox. In production (Resend wired) this stays
  // undefined and the user must check their email.
  const [devResetToken, setDevResetToken] = useState<string>('');

  const handleForgotPassword = async () => {
    if (!email || !email.includes('@')) {
      setError(l('Введите корректный email', 'Дұрыс email енгізіңіз', 'Enter a valid email'));
      return;
    }
    setIsLoading(true); setError('');
    try {
      // Server always returns ok:true regardless of whether the email
      // exists in the system (anti-enumeration). The user sees "check
      // your inbox" either way — only difference is whether an email
      // actually went out. Dev mode also returns `resetToken` so the
      // local tester can click straight through.
      const r = await api.post<{ ok: boolean; emailSent?: boolean; resetToken?: string }>(
        '/api/auth/forgot-password', { email },
      );
      if (r.resetToken) setDevResetToken(r.resetToken);
      setStep('forgot-sent');
    } catch (err: any) {
      // Rate limit / network — surface the message so the user can retry.
      setError(String(err?.message || l('Не удалось отправить', 'Жіберілмеді', 'Could not send')));
    } finally {
      setIsLoading(false);
    }
  };

  // All sub-screens (otp / forgot / forgot-sent) return to the main console.
  const goBack = () => {
    setError('');
    setStep('console');
  };

  // Password strength
  const getPasswordStrength = (p: string): { level: number; label: string; color: string } => {
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    const levels = [
      { level: 0, label: '', color: '' },
      { level: 1, label: l('Слабый', 'Әлсіз', 'Weak'), color: 'bg-red-400' },
      { level: 2, label: l('Средний', 'Орташа', 'Medium'), color: 'bg-yellow-400' },
      { level: 3, label: l('Хороший', 'Жақсы', 'Good'), color: 'bg-blue-400' },
      { level: 4, label: l('Отличный', 'Тамаша', 'Excellent'), color: 'bg-green-500' },
    ];
    return levels[score];
  };

  const strength = getPasswordStrength(password);

  // Social login is hidden by default — the buttons used to throw
  // "feature unavailable" alerts which felt broken. Enable via
  // `VITE_ENABLE_SOCIAL_LOGIN=true` when Google/Apple/WhatsApp OAuth
  // is actually wired through the backend.
  const showSocial = import.meta.env.VITE_ENABLE_SOCIAL_LOGIN === 'true';

  // Social buttons config
  const socialButtons = [
    { id: 'google', label: 'Google', icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
    )},
    { id: 'apple', label: 'Apple', icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
    )},
    { id: 'whatsapp', label: 'WhatsApp', icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    )},
  ];

  // Shared frosted-glass field style for all inputs in the console.
  const fieldCls = 'w-full px-4 py-3 bg-white/55 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm text-slate-800 focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-emerald-500/40 placeholder:text-slate-400 transition-all';
  const hasValidInvite = !!invitePreview && !('error' in invitePreview);

  const renderStepContent = () => {
    switch (step) {
      /* ===== CONSOLE — единая стеклянная панель с табами Вход/Регистрация ===== */
      case 'console':
        return (
          <div>
            {/* Brand header inside the console — hidden on desktop where the
                hero panel already shows the logo (avoids a duplicate logo). */}
            <div className="flex flex-col items-center mb-6 lg:hidden">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 overflow-hidden bg-white/60 ring-1 ring-white/60 backdrop-blur-xl shadow-[0_8px_24px_-8px_rgba(15,23,42,0.18),inset_0_1px_0_0_rgba(255,255,255,0.7)]">
                <img src={profileLogo} alt="Utir Soft" className="w-full h-full object-cover" />
              </div>
              <div className="text-base text-slate-900 tracking-tight">Utir Soft</div>
              <div className="text-[11px] text-slate-500">{l('Вход и регистрация', 'Кіру және тіркелу', 'Sign in or sign up')}</div>
            </div>

            {/* Segmented tab switcher */}
            <div className="flex gap-1 p-1 mb-6 bg-white/40 ring-1 ring-white/50 rounded-2xl backdrop-blur-xl">
              {(['login', 'signup'] as const).map(tb => (
                <button
                  key={tb}
                  onClick={() => { setTab(tb); setError(''); }}
                  className={`flex-1 py-2 rounded-xl text-sm transition-all ${tab === tb ? 'bg-white/90 text-slate-900 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.25)]' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {tb === 'login' ? l('Вход', 'Кіру', 'Sign in') : l('Регистрация', 'Тіркелу', 'Sign up')}
                </button>
              ))}
            </div>

            {/* Method switch: Email / Телефон */}
            <div className="flex gap-1 p-1 mb-4 bg-white/30 ring-1 ring-white/40 rounded-2xl backdrop-blur-xl">
              {(['email', 'phone'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setAuthMethod(m); setError(''); }}
                  className={`flex-1 py-1.5 rounded-xl text-[13px] inline-flex items-center justify-center gap-1.5 transition-all ${authMethod === m ? 'bg-white/90 text-slate-900 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.2)]' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {m === 'email' ? <Mail className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                  {m === 'email' ? 'Email' : l('Телефон', 'Телефон', 'Phone')}
                </button>
              ))}
            </div>

            {authMethod === 'phone' ? (
              /* ---------- PHONE (login + signup) ---------- */
              <div className="space-y-3">
                {tab === 'signup' && (
                  <>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1.5">{l('Ваше имя', 'Атыңыз', 'Your name')}</label>
                      <input type="text" value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder={l('Ваше имя', 'Атыңыз', 'Your name')} className={fieldCls} />
                    </div>
                    {!hasValidInvite && (
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1.5">{l('Название компании', 'Компания атауы', 'Company name')}</label>
                        <input type="text" value={company} onChange={e => { setCompany(e.target.value); setError(''); }} placeholder={l('ТОО «Ваша компания»', 'ЖШС «Сіздің компания»', 'Your Company LLP')} className={fieldCls} />
                      </div>
                    )}
                  </>
                )}
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5">{l('Номер телефона', 'Телефон нөмірі', 'Phone number')}</label>
                  <div className="flex items-stretch gap-2">
                    <div className="relative flex-shrink-0">
                      <select
                        value={dialCode}
                        onChange={e => setDialCode(e.target.value)}
                        className="h-full appearance-none bg-white/55 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl pl-3 pr-8 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 cursor-pointer transition-all"
                        aria-label={l('Код страны', 'Ел коды', 'Country code')}
                      >
                        {DIAL_CODES.map(c => (
                          <option key={c.flag} value={c.code}>{c.flag} {c.code}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                    <input type="tel" inputMode="numeric" value={formatNational(phone)} onChange={e => { setPhone(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handlePhoneStart()} placeholder="700 000 00 00" autoFocus className={`${fieldCls} flex-1 tracking-wide`} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">{l('Пришлём 6-значный код в SMS', '6 санды кодты SMS-пен жібереміз', "We'll text a 6-digit code")}</p>
                </div>
                {tab === 'signup' && !hasValidInvite && (
                  <label className="flex items-start gap-2.5 cursor-pointer pt-0.5">
                    <input type="checkbox" checked={agreeTerms} onChange={e => { setAgreeTerms(e.target.checked); setError(''); }} className="w-3.5 h-3.5 rounded accent-emerald-600 mt-0.5" />
                    <span className="text-xs text-slate-600">
                      {l('Я принимаю', 'Мен қабылдаймын', 'I accept the')}{' '}
                      <a href="#/terms" className="text-slate-900 hover:underline">{l('условия', 'шарттар', 'terms')}</a>
                      {l(' и ', ' және ', ' & ')}
                      <a href="#/privacy" className="text-slate-900 hover:underline">{l('политику', 'саясат', 'policy')}</a>
                    </span>
                  </label>
                )}
                <button onClick={handlePhoneStart} disabled={isLoading} className="w-full py-3 mt-1 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{l('Получить код', 'Код алу', 'Get code')} <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            ) : tab === 'login' ? (
              /* ---------- LOGIN ---------- */
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="example@mail.kz" autoFocus className={`${fieldCls} pl-10`} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] text-slate-500">{l('Пароль', 'Құпия сөз', 'Password')}</label>
                    <button onClick={() => { setStep('forgot'); setError(''); }} className="text-[11px] text-slate-500 hover:text-slate-900 transition-colors">{l('Забыли?', 'Ұмыттыңыз ба?', 'Forgot?')}</button>
                  </div>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="••••••••" className={`${fieldCls} pr-12`} />
                    <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-slate-600">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                  <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-3.5 h-3.5 rounded accent-emerald-600" />
                  <span className="text-xs text-slate-600">{l('Запомнить меня', 'Есте сақтау', 'Remember me')}</span>
                </label>
                <button onClick={handleLogin} disabled={isLoading} className="w-full py-3 mt-1 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : l('Войти', 'Кіру', 'Log in')}
                </button>
              </div>
            ) : (
              /* ---------- SIGNUP ---------- */
              <div className="space-y-3">
                {hasValidInvite && invitePreview && !('error' in invitePreview) && (
                  <div className="p-3 rounded-2xl bg-emerald-50/80 ring-1 ring-emerald-100/60">
                    <div className="text-xs text-emerald-700 mb-0.5">{l('Приглашение от', 'Шақыру', 'Invitation from')} <b>{invitePreview.inviter}</b></div>
                    <div className="text-sm text-emerald-900">{l('Команда', 'Команда', 'Team')}: <b>{invitePreview.company || l('команда пользователя', 'пайдаланушы командасы', "inviter's team")}</b> · {invitePreview.role}</div>
                  </div>
                )}
                {invitePreview && 'error' in invitePreview && (
                  <div className="p-3 rounded-2xl bg-rose-50/80 ring-1 ring-rose-100/60 text-xs text-rose-700">
                    {invitePreview.error === 'expired' ? l('Срок приглашения истёк.', 'Шақыру мерзімі өтті.', 'Invitation expired.')
                      : invitePreview.error === 'used' ? l('Приглашение уже использовано.', 'Шақыру пайдаланылған.', 'Invitation already used.')
                      : invitePreview.error === 'network' ? l('Не удалось проверить приглашение.', 'Шақыруды тексеру мүмкін болмады.', 'Could not verify invitation.')
                      : l('Недействительный код приглашения.', 'Жарамсыз шақыру коды.', 'Invalid invitation code.')}
                    <div className="text-rose-600 mt-0.5">{l('Можно зарегистрироваться без приглашения.', 'Шақырусыз тіркелуге болады.', 'You can sign up without an invite.')}</div>
                  </div>
                )}
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5">{l('Ваше имя', 'Атыңыз', 'Your name')}</label>
                  <input type="text" value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder={l('Ваше имя', 'Атыңыз', 'Your name')} autoFocus className={fieldCls} />
                </div>
                {!hasValidInvite && (
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1.5">{l('Название компании', 'Компания атауы', 'Company name')}</label>
                    <input type="text" value={company} onChange={e => { setCompany(e.target.value); setError(''); }} placeholder={l('ТОО «Ваша компания»', 'ЖШС «Сіздің компания»', 'Your Company LLP')} className={fieldCls} />
                  </div>
                )}
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="example@mail.kz" className={`${fieldCls} pl-10`} />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5">{l('Пароль', 'Құпия сөз', 'Password')}</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }} placeholder="••••••••" className={`${fieldCls} pr-12`} />
                    <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-slate-600">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  </div>
                  {password && (
                    <div className="mt-2">
                      <div className="flex gap-1 mb-1">{[1, 2, 3, 4].map(i => <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength.level ? strength.color : 'bg-white/50'}`} />)}</div>
                      <span className="text-[10px] text-slate-400">{strength.label}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1.5">{l('Повторите пароль', 'Құпия сөзді қайталаңыз', 'Confirm password')}</label>
                  <div className="relative">
                    <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setError(''); }} placeholder="••••••••" className={`${fieldCls} pr-12`} />
                    <button onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-slate-600">{showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  </div>
                  {confirmPassword && password === confirmPassword && <div className="flex items-center gap-1 mt-1"><Check className="w-3 h-3 text-emerald-500" /><span className="text-[10px] text-emerald-500">{l('Совпадает', 'Сәйкес', 'Match')}</span></div>}
                </div>
                <label className="flex items-start gap-2.5 cursor-pointer pt-0.5">
                  <input type="checkbox" checked={agreeTerms} onChange={e => { setAgreeTerms(e.target.checked); setError(''); }} className="w-3.5 h-3.5 rounded accent-emerald-600 mt-0.5" />
                  <span className="text-xs text-slate-600">
                    {l('Я принимаю', 'Мен қабылдаймын', 'I accept the')}{' '}
                    <a href="#/terms" className="text-slate-900 hover:underline">{l('условия', 'шарттар', 'terms')}</a>
                    {l(' и ', ' және ', ' & ')}
                    <a href="#/privacy" className="text-slate-900 hover:underline">{l('политику конфиденциальности', 'құпиялылық саясаты', 'privacy policy')}</a>
                  </span>
                </label>
                <button onClick={handleSignup} disabled={isLoading} className="w-full py-3 mt-1 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{l('Создать аккаунт', 'Аккаунт жасау', 'Create account')} <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            )}

            {/* Social sign-in — Google / Facebook. Full-page redirect to the
                backend OAuth route (works once keys are added; otherwise the
                backend bounces back with a friendly "not configured" note). */}
            <div className="flex items-center gap-3 my-5">
              <div className="h-px bg-white/60 flex-1" />
              <span className="text-[10px] text-slate-400">{l('или', 'немесе', 'or')}</span>
              <div className="h-px bg-white/60 flex-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a href={`${apiBase}/api/auth/google`} className="flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-white/70 ring-1 ring-white/70 backdrop-blur-xl hover:bg-white transition-all text-sm text-slate-700 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)]">
                <svg viewBox="0 0 24 24" className="w-4 h-4"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Google
              </a>
              <a href={`${apiBase}/api/auth/facebook`} className="flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-white/70 ring-1 ring-white/70 backdrop-blur-xl hover:bg-white transition-all text-sm text-slate-700 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)]">
                <svg viewBox="0 0 24 24" className="w-4 h-4"><path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>
                Facebook
              </a>
            </div>

            {/* Client cabinet entry — refined emerald-tinted glass pill so it
                reads as a distinct client action, not a clash with the form. */}
            <div className="mt-6 pt-5 border-t border-white/50">
              <div className="text-center text-[10px] uppercase tracking-[0.14em] text-slate-400 mb-2.5">{l('Вы клиент?', 'Сіз клиентсіз бе?', 'Are you a client?')}</div>
              <button
                onClick={() => { window.location.hash = '#/cabinet'; }}
                className="group w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-sky-500/10 ring-1 ring-emerald-500/20 hover:ring-emerald-500/35 hover:from-emerald-500/15 hover:via-teal-500/15 hover:to-sky-500/15 backdrop-blur-xl transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]"
              >
                <Package className="w-4 h-4 text-emerald-600 flex-shrink-0" strokeWidth={1.75} />
                <span className="text-[13px] text-slate-700 group-hover:text-slate-900 transition-colors">{l('Отследить свой заказ', 'Тапсырысты қадағалау', 'Track your order')}</span>
                <ChevronRight className="w-4 h-4 text-emerald-500/70 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </button>
            </div>
          </div>
        );


      /* ===== OTP VERIFICATION (dev mode: code is shown on screen) ===== */
      case 'otp':
        return (
          <div className="text-center">
            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <ShieldCheck className="w-7 h-7 text-gray-900" />
            </div>
            <h2 className="text-xl text-gray-900 mb-1">{otpFor === 'phone' ? l('Подтвердите номер', 'Нөмірді растаңыз', 'Verify your phone') : l('Подтвердите email', 'Email-ді растаңыз', 'Verify your email')}</h2>
            <p className="text-sm text-slate-500 mb-1">{l('Введите 6-значный код для', 'Растау үшін 6 санды кодты енгізіңіз', 'Enter the 6-digit code for')}</p>
            <p className="text-sm text-gray-900 mb-5">{otpFor === 'phone' ? `${dialCode} ${formatNational(phone)}` : email}</p>

            {/* Dev mode banner — real email/SMS sending is OFF; surface the code right here. */}
            {devVerificationCode && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-5 text-left">
                <div className="text-[10px] uppercase tracking-wider text-amber-700 mb-1">
                  {otpFor === 'phone'
                    ? l('Демо-режим · SMS не отправляется', 'Демо-режим · SMS жіберілмейді', 'Demo mode · no SMS is sent')
                    : l('Демо-режим · email не отправляется', 'Демо-режим · email жіберілмейді', 'Demo mode · no email is sent')}
                </div>
                <div className="text-sm text-amber-900 flex items-center justify-between gap-3">
                  <span>{l('Ваш код:', 'Сіздің кодыңыз:', 'Your code:')}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setOtp(devVerificationCode.split('').slice(0, 6) as string[]);
                      otpRefs.current[5]?.focus();
                    }}
                    className="font-mono text-lg tracking-[0.3em] text-amber-900 hover:underline"
                    title={l('Подставить', 'Қою', 'Auto-fill')}
                  >
                    {devVerificationCode}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-center gap-2 mb-4" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input key={i} ref={el => { otpRefs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={e => handleOtpChange(i, e.target.value)} onKeyDown={e => handleOtpKeyDown(i, e)}
                  className={`w-12 h-14 text-center text-lg bg-gray-50 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/20 transition-all ${digit ? 'bg-gray-100 ring-1 ring-gray-200' : ''}`}
                />
              ))}
            </div>

            {otpTimer > 0 ? (
              <p className="text-xs text-slate-500 mb-6">{l('Отправить повторно через', 'Қайта жіберу', 'Resend in')} <span className="text-gray-900">{otpTimer}{l('с', 'с', 's')}</span></p>
            ) : (
              <button onClick={resendCurrent} disabled={isLoading} className="text-xs text-gray-900 hover:underline mb-6 disabled:opacity-40">{l('Отправить код повторно', 'Кодты қайта жіберу', 'Resend code')}</button>
            )}

            <button onClick={handleOtpVerify} disabled={isLoading || otp.join('').length < 6} className="w-full py-3 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{l('Подтвердить', 'Растау', 'Verify')} <Check className="w-4 h-4" /></>}
            </button>
          </div>
        );

      /* ===== FORGOT PASSWORD ===== */
      case 'forgot':
        return (
          <div>
            <button onClick={goBack} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 mb-4 transition-colors">
              <ArrowLeft className="w-4 h-4" /> {l('Назад', 'Артқа', 'Back')}
            </button>
            <h2 className="text-xl text-gray-900 mb-1">{l('Сбросить пароль', 'Құпия сөзді қалпына келтіру', 'Reset Password')}</h2>
            <p className="text-sm text-slate-500 mb-6">{l('Введите email и мы отправим ссылку', 'Email енгізіңіз, біз сілтеме жібереміз', 'Enter your email and we will send a link')}</p>

            <div className="mb-4">
              <label className="block text-[11px] text-slate-500 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleForgotPassword()} placeholder="example@mail.kz" autoFocus className="w-full pl-10 pr-4 py-3 bg-white/60 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm focus:outline-none focus:bg-white focus:ring-slate-300 placeholder:text-slate-400 transition-all" />
              </div>
            </div>

            <button onClick={handleForgotPassword} disabled={isLoading || !email} className="w-full py-3 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : l('Отправить ссылку', 'Сілтеме жіберу', 'Send reset link')}
            </button>
          </div>
        );

      /* ===== FORGOT: SENT ===== */
      case 'forgot-sent':
        return (
          <div className="text-center">
            <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="text-xl text-gray-900 mb-2">{l('Проверьте почту', 'Поштаңызды тексеріңіз', 'Check your email')}</h2>
            <p className="text-sm text-slate-500 mb-1">{l('Мы отправили ссылку для сброса на', 'Біз қалпына келтіру сілтемесін жібердік', 'We sent a reset link to')}</p>
            <p className="text-sm text-gray-900 mb-6">{email}</p>

            {/* Dev-mode banner — real email isn't configured, so we show
                the reset link inline. Hidden in production when Resend
                returns ok:true (resetToken is undefined in that case). */}
            {devResetToken && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-5 text-left">
                <div className="text-[10px] uppercase tracking-wider text-amber-700 mb-1">
                  {l('Демо-режим · email не отправляется', 'Демо-режим · email жіберілмейді', 'Demo mode · no email is sent')}
                </div>
                <div className="text-xs text-amber-900 mb-2">
                  {l('Перейдите по этой ссылке для сброса пароля:', 'Құпия сөзді қалпына келтіру үшін осы сілтемеге өтіңіз:', 'Open this link to reset your password:')}
                </div>
                <a
                  href={`#/reset-password?token=${devResetToken}`}
                  className="text-xs text-amber-900 underline break-all hover:text-amber-700"
                >
                  /#/reset-password?token={devResetToken.slice(0, 16)}…
                </a>
              </div>
            )}

            <button onClick={() => { setStep('console'); setTab('login'); setPassword(''); setError(''); setDevResetToken(''); }} className="w-full py-3 bg-emerald-600 text-white rounded-2xl text-sm hover:bg-emerald-700 shadow-[0_8px_24px_-8px_var(--accent-shadow)] ring-1 ring-white/10 transition-all">
              {l('Вернуться к входу', 'Кіруге оралу', 'Back to login')}
            </button>
            <p className="text-xs text-slate-500 mt-4">{l('Не получили? Проверьте папку спам', 'Алмадыңыз ба? Спам қалтасын тексеріңіз', "Didn't receive it? Check spam folder")}</p>
          </div>
        );

      default: return null;
    }
  };

  // Step indicator
  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #e8f3ee 0%, #e3eef5 45%, #efe9f6 100%)' }}
    >
      {/* ─── Liquid-glass ambient background ──────────────────────────
          Soft colored aurora blobs drifting behind everything so the
          frosted-glass panels actually refract color. Fixed, non-
          interactive, sits below all content. */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="aurora-a absolute -top-32 -left-24 w-[40rem] h-[40rem] rounded-full blur-[100px] opacity-70"
             style={{ background: 'radial-gradient(circle at 35% 35%, #34d399, transparent 68%)' }} />
        <div className="aurora-b absolute top-1/4 -right-28 w-[38rem] h-[38rem] rounded-full blur-[100px] opacity-60"
             style={{ background: 'radial-gradient(circle at 50% 50%, #38bdf8, transparent 68%)' }} />
        <div className="aurora-c absolute -bottom-40 left-1/3 w-[36rem] h-[36rem] rounded-full blur-[110px] opacity-55"
             style={{ background: 'radial-gradient(circle at 50% 50%, #a78bfa, transparent 68%)' }} />
      </div>

      {/* Top bar — back (on sub-screens) + language switcher */}
      <div className="flex items-center justify-between p-4 sm:p-6 flex-shrink-0 relative">
        <div>
          {step !== 'console' && (
            <button onClick={goBack} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 bg-white/50 ring-1 ring-white/60 backdrop-blur-xl px-3 py-1.5 rounded-xl transition-all">
              <ArrowLeft className="w-3.5 h-3.5" />{l('Назад', 'Артқа', 'Back')}
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-white/50 backdrop-blur-xl ring-1 ring-white/60 p-1 rounded-2xl">
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
      </div>

      {/* Centered glass console */}
      <div className="flex-1 flex items-center justify-center px-4 pb-8 relative">
        <div className={`w-full ${step === 'console'
          ? 'max-w-[400px] lg:max-w-[900px] lg:grid lg:grid-cols-[1fr_400px] lg:gap-14 lg:items-center'
          : 'max-w-[400px]'}`}>

          {/* Desktop-only hero — fills the wide canvas so the sign-in screen
              feels intentional on large monitors. Hidden below lg. */}
          {step === 'console' && (
            <div className="hidden lg:flex flex-col justify-center gap-7 pr-2">
              <div className="flex items-center gap-3.5">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/60 ring-1 ring-white/60 backdrop-blur-xl shadow-[0_8px_24px_-8px_rgba(15,23,42,0.18),inset_0_1px_0_0_rgba(255,255,255,0.7)]">
                  <img src={profileLogo} alt="Utir Soft" className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="text-2xl text-slate-900 tracking-tight font-medium">Utir Soft</div>
                  <div className="text-sm text-slate-500">{l('Платформа управления бизнесом', 'Бизнесті басқару платформасы', 'Business management platform')}</div>
                </div>
              </div>
              <h2 className="text-[28px] leading-[1.2] text-slate-900 font-medium tracking-tight max-w-md [text-wrap:balance]">
                {l('Заказы, финансы и команда — в одном месте', 'Тапсырыстар, қаржы, команда — бір жерде', 'Orders, finance & team — in one place')}
              </h2>
              <div className="flex flex-col gap-2.5 max-w-md">
                {[
                  { icon: Sparkles, t: l('AI-инструменты', 'AI-құралдар', 'AI tools'), d: l('Помощник и генерация контента', 'Көмекші және контент', 'Assistant & content') },
                  { icon: BarChart3, t: l('Финансы и аналитика', 'Қаржы және аналитика', 'Finance & analytics'), d: l('Учёт в тенге, отчёты, налоги', 'Теңгемен есеп, есептер', 'KZT accounting & reports') },
                  { icon: MessageCircle, t: l('Заказы и команда', 'Тапсырыстар және команда', 'Orders & team'), d: l('Воронка, задачи, чаты, роли', 'Воронка, тапсырма, чат', 'Pipeline, tasks, chats') },
                ].map((f, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/40 ring-1 ring-white/50 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]">
                    <span className="w-9 h-9 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center text-emerald-600 flex-shrink-0">
                      <f.icon className="w-4 h-4" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm text-slate-800 leading-tight">{f.t}</div>
                      <div className="text-xs text-slate-500 leading-tight mt-0.5">{f.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Console column */}
          <div className="w-full">
          {/* Console — liquid-glass surface: frosted, specular top-edge
              highlight + deep layered shadow. Holds tabs + active form. */}
          <div className="bg-white/40 backdrop-blur-2xl backdrop-saturate-200 border border-white/50 rounded-[2rem] p-6 sm:p-8 shadow-[0_24px_64px_-20px_rgba(15,23,42,0.30),inset_0_1px_0_0_rgba(255,255,255,0.7)]">
            {error && (
              <div className="bg-rose-100/70 text-rose-700 text-xs px-4 py-2.5 rounded-2xl ring-1 ring-rose-200/60 mb-4 flex items-center gap-2 backdrop-blur-xl">
                <div className="w-1.5 h-1.5 bg-rose-500 rounded-full flex-shrink-0" />{error}
              </div>
            )}
            {renderStepContent()}
          </div>

          {/* Legal */}
          <p className="text-center text-[10px] text-slate-400 mt-5">
            {l('Продолжая, вы соглашаетесь с ', 'Жалғастыра отырып, сіз ', 'By continuing, you agree to our ')}
            <a href="#/terms" className="underline hover:text-slate-600">{l('Условиями', 'Шарттармен', 'Terms')}</a>
            {l(' и ', ' және ', ' & ')}
            <a href="#/privacy" className="underline hover:text-slate-600">{l('Политикой конфиденциальности', 'Құпиялылық саясатымен', 'Privacy Policy')}</a>
          </p>
          </div>
        </div>
      </div>
    </div>
  );
}
