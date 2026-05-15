import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, ArrowLeft, Check, Loader2, Mail, ShieldCheck, ArrowRight, Sparkles, BarChart3, MessageCircle, Package } from 'lucide-react';
import profileLogo from '../../imports/utirsoft.png';
import { api, setToken } from '../utils/api';

interface AuthProps {
  onLogin: (user: { name: string; email: string; avatar?: string; teamRole?: string }) => void;
  language: 'kz' | 'ru' | 'eng';
  onLanguageChange: (lang: 'kz' | 'ru' | 'eng') => void;
}

type AuthStep = 'welcome' | 'login-email' | 'login-password' | 'signup-email' | 'signup-name' | 'signup-password' | 'otp' | 'forgot' | 'forgot-sent';

export function Auth({ onLogin, language, onLanguageChange }: AuthProps) {
  const [step, setStep] = useState<AuthStep>('welcome');
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
      // Jump straight into the signup flow so the user doesn't see the welcome screen.
      setStep('signup-email');
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

  const handleEmailContinue = (mode: 'login' | 'signup') => {
    if (!email || !email.includes('@')) { setError(l('Введите корректный email', 'Дұрыс email енгізіңіз', 'Enter a valid email')); return; }
    simulateLoading(() => {
      if (mode === 'login') setStep('login-password');
      else setStep('signup-name');
    });
  };

  const handleLogin = async () => {
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

  const handleSignupNameContinue = () => {
    if (!name.trim()) { setError(l('Введите имя', 'Атыңызды енгізіңіз', 'Enter your name')); return; }
    // Invited users skip the company step — they inherit the inviter's company.
    const hasValidInvite = invitePreview && !('error' in invitePreview);
    if (!hasValidInvite && !company.trim()) {
      setError(l('Введите название компании', 'Компания атауын енгізіңіз', 'Enter your company name'));
      return;
    }
    simulateLoading(() => setStep('signup-password'), 300);
  };

  // Dev-mode verification code received from the signup/resend response.
  // Displayed on the OTP screen so the tester doesn't need a real inbox.
  const [devVerificationCode, setDevVerificationCode] = useState<string>('');

  const handleSignup = async () => {
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
      await api.post('/api/auth/verify-email', { code });
      // Verified — finalise the session.
      window.dispatchEvent(new Event('utir:auth-changed'));
      onLogin({ name, email });
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg === 'invalid code') setError(l('Неверный код', 'Қате код', 'Invalid code'));
      else setError(msg || l('Ошибка подтверждения', 'Растау қатесі', 'Verification failed'));
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleForgotPassword = () => {
    if (!email) { setError(l('Введите email', 'Email енгізіңіз', 'Enter email')); return; }
    simulateLoading(() => setStep('forgot-sent'));
  };

  const goBack = () => {
    setError('');
    if (step === 'login-password' || step === 'signup-name') setStep(step === 'login-password' ? 'login-email' : 'signup-email');
    else if (step === 'signup-password') setStep('signup-name');
    else if (step === 'otp') setStep('signup-password');
    else if (step === 'forgot' || step === 'forgot-sent') setStep('login-email');
    else setStep('welcome');
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

  const features = [
    { icon: Sparkles, label: l('AI Дизайн интерьера', 'AI Интерьер дизайны', 'AI Interior Design'), desc: l('Генерация дизайна за минуту', 'Бір минутта дизайн жасау', 'Generate designs in a minute') },
    { icon: BarChart3, label: l('Финансовый модуль', 'Қаржы модулі', 'Finance Module'), desc: l('Учёт в тенге, налоги КЗ', 'Теңгемен есеп, ҚЗ салықтары', 'KZT accounting, KZ taxes') },
    { icon: MessageCircle, label: l('Омниканальные чаты', 'Омниканал чаттар', 'Omnichannel Chats'), desc: l('WhatsApp, Instagram, Telegram', 'WhatsApp, Instagram, Telegram', 'WhatsApp, Instagram, Telegram') },
    { icon: Package, label: l('Производство и склад', 'Өндіріс және қойма', 'Production & Warehouse'), desc: l('Полный контроль производства', 'Өндірісті толық бақылау', 'Full production control') },
  ];

  const renderStepContent = () => {
    switch (step) {
      /* ===== WELCOME ===== */
      case 'welcome':
        return (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-5 shadow-sm overflow-hidden bg-white border border-gray-100">
              <img src={profileLogo} alt="Utir Soft" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl text-gray-900 mb-1 text-center">{l('Добро пожаловать', 'Қош келдіңіз', 'Welcome')}</h1>
            <p className="text-sm text-gray-400 mb-8 text-center max-w-[280px]">
              {l('CRM-платформа для мебельного бизнеса Казахстана', 'Қазақстан жиһаз бизнесіне арналған CRM-платформа', 'CRM platform for furniture business in Kazakhstan')}
            </p>

            <div className="w-full space-y-2.5 mb-6">
              <button onClick={() => { setStep('login-email'); setError(''); }} className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 transition-all">
                {l('Войти', 'Кіру', 'Log in')}
              </button>
              <button onClick={() => { setStep('signup-email'); setError(''); }} className="w-full py-3 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-all">
                {l('Создать аккаунт', 'Аккаунт жасау', 'Sign up')}
              </button>
            </div>

            <div className="w-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px bg-gray-100 flex-1" />
                <span className="text-[10px] text-gray-400">{l('или продолжить с', 'немесе жалғастыру', 'or continue with')}</span>
                <div className="h-px bg-gray-100 flex-1" />
              </div>
              <div className="flex gap-2">
                {socialButtons.map(sb => (
                  <button key={sb.id} onClick={() => handleSocialLogin(sb.id)} disabled={isLoading} className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-100 rounded-xl text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-200 transition-all disabled:opacity-50">
                    {sb.icon}
                    <span className="hidden sm:inline">{sb.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => { window.location.hash = '#/cabinet'; }}
              className="mt-6 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-amber-700 bg-amber-50 border border-amber-100 hover:bg-amber-100 transition-colors"
            >
              <Package className="w-3 h-3" />
              {l('Я клиент — войти в кабинет', 'Мен клиентпін — кабинетке кіру', "I'm a client — open cabinet")}
            </button>
          </div>
        );

      /* ===== LOGIN: EMAIL ===== */
      case 'login-email':
        return (
          <div>
            <h2 className="text-xl text-gray-900 mb-1">{l('Войти в аккаунт', 'Аккаунтқа кіру', 'Log in to your account')}</h2>
            <p className="text-sm text-gray-400 mb-6">{l('Введите email для продолжения', 'Жалғастыру үшін email енгізіңіз', 'Enter your email to continue')}</p>

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                  <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleEmailContinue('login')} placeholder="name@company.kz" autoFocus className="w-full pl-10 pr-4 py-3 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
                </div>
              </div>
            </div>

            <button onClick={() => handleEmailContinue('login')} disabled={isLoading || !email} className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 transition-all disabled:opacity-40 flex items-center justify-center gap-2 mb-4">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{l('Продолжить', 'Жалғастыру', 'Continue')} <ArrowRight className="w-4 h-4" /></>}
            </button>

            <div className="flex items-center gap-3 mb-4"><div className="h-px bg-gray-100 flex-1" /><span className="text-[10px] text-gray-400">{l('или', 'немесе', 'or')}</span><div className="h-px bg-gray-100 flex-1" /></div>

            <div className="space-y-2">
              {socialButtons.map(sb => (
                <button key={sb.id} onClick={() => handleSocialLogin(sb.id)} disabled={isLoading} className="w-full flex items-center justify-center gap-3 py-2.5 border border-gray-100 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50">
                  {sb.icon}
                  <span>{l('Войти через', 'Арқылы кіру', 'Continue with')} {sb.label}</span>
                </button>
              ))}
            </div>

            <p className="text-center text-xs text-gray-400 mt-6">
              {l('Нет аккаунта?', 'Аккаунт жоқ па?', "Don't have an account?")} <button onClick={() => { setStep('signup-email'); setError(''); }} className="text-gray-900 hover:underline">{l('Создать', 'Жасау', 'Sign up')}</button>
            </p>
          </div>
        );

      /* ===== LOGIN: PASSWORD ===== */
      case 'login-password':
        return (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-sm text-gray-600">{email[0]?.toUpperCase()}</div>
              <div><p className="text-sm text-gray-900">{email}</p><button onClick={goBack} className="text-[10px] text-gray-400 hover:text-gray-600">{l('Изменить', 'Өзгерту', 'Change')}</button></div>
            </div>

            <h2 className="text-xl text-gray-900 mb-1">{l('Введите пароль', 'Құпия сөзді енгізіңіз', 'Enter your password')}</h2>
            <p className="text-sm text-gray-400 mb-6">{l('Для входа в Utir Soft', 'Utir Soft-қа кіру үшін', 'To log in to Utir Soft')}</p>

            <div className="space-y-4 mb-2">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1.5">{l('Пароль', 'Құпия сөз', 'Password')}</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="••••••••" autoFocus className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 pr-12" />
                  <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-gray-600">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mb-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-3.5 h-3.5 rounded accent-gray-900" />
                <span className="text-xs text-gray-500">{l('Запомнить меня', 'Есте сақтау', 'Remember me')}</span>
              </label>
              <button onClick={() => { setStep('forgot'); setError(''); }} className="text-xs text-gray-400 hover:text-gray-900 transition-colors">{l('Забыли пароль?', 'Құпия сөзді ұмыттыңыз ба?', 'Forgot password?')}</button>
            </div>

            <button onClick={handleLogin} disabled={isLoading || !password} className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : l('Войти', 'Кіру', 'Log in')}
            </button>
          </div>
        );

      /* ===== SIGNUP: EMAIL ===== */
      case 'signup-email':
        return (
          <div>
            <h2 className="text-xl text-gray-900 mb-1">{l('Создать аккаунт', 'Аккаунт жасау', 'Create your account')}</h2>
            <p className="text-sm text-gray-400 mb-6">{l('Начните управлять бизнесом эффективно', 'Бизнесті тиімді басқара бастаңыз', 'Start managing your business efficiently')}</p>

            {/* Invitation banner */}
            {invitePreview && !('error' in invitePreview) && (
              <div className="mb-5 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="text-xs text-emerald-700 mb-0.5">
                  {l('Приглашение от', 'Шақыру', 'Invitation from')} <b>{invitePreview.inviter}</b>
                </div>
                <div className="text-sm text-emerald-900">
                  {invitePreview.company ? (
                    <>
                      {l('Вы присоединяетесь к команде', 'Командаға қосыласыз', 'You are joining team')}{' '}
                      <b>{invitePreview.company}</b>
                    </>
                  ) : (
                    // Inviter never filled in a company name — fall back to "their team".
                    <>{l('Вы присоединяетесь к команде', 'Командаға қосыласыз', 'You are joining the team')}</>
                  )}
                  {' · '}
                  <span className="text-xs">{l('Роль', 'Рөл', 'Role')}: {invitePreview.role}</span>
                </div>
              </div>
            )}
            {invitePreview && 'error' in invitePreview && (
              <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-100">
                <div className="text-sm text-red-700">
                  {invitePreview.error === 'expired'
                    ? l('Срок действия приглашения истёк.', 'Шақырудың мерзімі өтті.', 'This invitation has expired.')
                    : invitePreview.error === 'used'
                    ? l('Это приглашение уже использовано.', 'Бұл шақыру пайдаланылған.', 'This invitation was already used.')
                    : invitePreview.error === 'network'
                    ? l('Не удалось проверить код приглашения (нет связи с сервером). Попробуйте обновить страницу или открыть ссылку позже.',
                        'Шақыру кодын тексеру мүмкін болмады (сервермен байланыс жоқ). Бетті жаңартып көріңіз немесе кейінірек ашыңыз.',
                        'Could not verify the invitation (server unreachable). Try refreshing or opening the link again later.')
                    : l('Недействительный код приглашения.', 'Жарамсыз шақыру коды.', 'Invalid invitation code.')}
                </div>
                <div className="text-xs text-red-600 mt-1">
                  {l('Можно зарегистрироваться без приглашения как обычный пользователь.', 'Шақырусыз жалпы пайдаланушы ретінде тіркелуге болады.', 'You can still sign up as a regular user.')}
                </div>
              </div>
            )}

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                  <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleEmailContinue('signup')} placeholder="name@company.kz" autoFocus className="w-full pl-10 pr-4 py-3 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
                </div>
              </div>
            </div>

            <button onClick={() => handleEmailContinue('signup')} disabled={isLoading || !email} className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 transition-all disabled:opacity-40 flex items-center justify-center gap-2 mb-4">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{l('Продолжить', 'Жалғастыру', 'Continue')} <ArrowRight className="w-4 h-4" /></>}
            </button>

            <div className="flex items-center gap-3 mb-4"><div className="h-px bg-gray-100 flex-1" /><span className="text-[10px] text-gray-400">{l('или', 'немесе', 'or')}</span><div className="h-px bg-gray-100 flex-1" /></div>

            <div className="space-y-2">
              {socialButtons.map(sb => (
                <button key={sb.id} onClick={() => handleSocialLogin(sb.id)} disabled={isLoading} className="w-full flex items-center justify-center gap-3 py-2.5 border border-gray-100 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50">
                  {sb.icon}
                  <span>{l('Продолжить через', 'Арқылы жалғастыру', 'Continue with')} {sb.label}</span>
                </button>
              ))}
            </div>

            <p className="text-center text-xs text-gray-400 mt-6">
              {l('Уже есть аккаунт?', 'Аккаунт бар ма?', 'Already have an account?')} <button onClick={() => { setStep('login-email'); setError(''); }} className="text-gray-900 hover:underline">{l('Войти', 'Кіру', 'Log in')}</button>
            </p>
          </div>
        );

      /* ===== SIGNUP: NAME + COMPANY (both required) ===== */
      case 'signup-name':
        return (
          <div>
            <h2 className="text-xl text-gray-900 mb-1">{l('Расскажите о себе', 'Өзіңіз туралы айтыңыз', 'Tell us about yourself')}</h2>
            <p className="text-sm text-gray-400 mb-6">{l('Мы персонализируем CRM под ваш бизнес', 'CRM-ді бизнесіңізге бейімдейміз', 'We will personalize the CRM for your business')}</p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1.5">
                  {l('Ваше имя', 'Атыңыз', 'Your Name')} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleSignupNameContinue()}
                  autoFocus
                  className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                />
              </div>
              {invitePreview && !('error' in invitePreview) ? (
                /* Invited user — company is inherited from the team, show read-only. */
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1.5">
                    {l('Команда', 'Команда', 'Team')}
                  </label>
                  <div className="w-full px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-900">
                    {invitePreview.company || l('Команда пользователя', 'Пайдаланушы командасы', "Inviter's team")}
                    <span className="text-xs text-emerald-600 ml-2">· {invitePreview.role}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1.5">
                    {l('Название компании', 'Компания атауы', 'Company Name')} <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={e => { setCompany(e.target.value); setError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleSignupNameContinue()}
                    className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  />
                </div>
              )}
            </div>

            <button onClick={handleSignupNameContinue} disabled={isLoading || !name.trim() || (!(invitePreview && !('error' in invitePreview)) && !company.trim())} className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{l('Продолжить', 'Жалғастыру', 'Continue')} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        );

      /* ===== SIGNUP: PASSWORD ===== */
      case 'signup-password':
        return (
          <div>
            <h2 className="text-xl text-gray-900 mb-1">{l('Создайте пароль', 'Құпия сөз жасаңыз', 'Create a password')}</h2>
            <p className="text-sm text-gray-400 mb-6">{l('Минимум 8 символов', 'Кемінде 8 таңба', 'Minimum 8 characters')}</p>

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1.5">{l('Пароль', 'Құпия сөз', 'Password')}</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }} placeholder="••••••••" autoFocus className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 pr-12" />
                  <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-gray-600">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                </div>
                {/* Strength */}
                {password && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">{[1, 2, 3, 4].map(i => <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength.level ? strength.color : 'bg-gray-100'}`} />)}</div>
                    <span className="text-[10px] text-gray-400">{strength.label}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1.5">{l('Повторите пароль', 'Құпия сөзді қайталаңыз', 'Confirm Password')}</label>
                <div className="relative">
                  <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setError(''); }} placeholder="••••••••" className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 pr-12" />
                  <button onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-gray-600">{showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                </div>
                {confirmPassword && password === confirmPassword && <div className="flex items-center gap-1 mt-1"><Check className="w-3 h-3 text-green-500" /><span className="text-[10px] text-green-500">{l('Совпадает', 'Сәйкес', 'Match')}</span></div>}
              </div>
            </div>

            <label className="flex items-start gap-2.5 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={e => { setAgreeTerms(e.target.checked); setError(''); }}
                className="w-3.5 h-3.5 rounded accent-gray-900 mt-0.5"
              />
              <span className="text-xs text-gray-500">
                {l('Я принимаю', 'Мен қабылдаймын', 'I accept the')}{' '}
                <a href="#/terms" target="_blank" rel="noreferrer" className="text-gray-900 hover:underline">
                  {l('условия использования', 'пайдалану шарттары', 'terms of use')}
                </a>{' '}
                {l('и', 'және', 'and')}{' '}
                <a href="#/privacy" target="_blank" rel="noreferrer" className="text-gray-900 hover:underline">
                  {l('политику конфиденциальности', 'құпиялылық саясаты', 'privacy policy')}
                </a>
                <span className="text-red-400 ml-0.5">*</span>
              </span>
            </label>

            <button onClick={handleSignup} disabled={isLoading || !password || !confirmPassword || !agreeTerms} className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{l('Создать аккаунт', 'Аккаунт жасау', 'Create account')} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        );

      /* ===== OTP VERIFICATION (dev mode: code is shown on screen) ===== */
      case 'otp':
        return (
          <div className="text-center">
            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <ShieldCheck className="w-7 h-7 text-gray-900" />
            </div>
            <h2 className="text-xl text-gray-900 mb-1">{l('Подтвердите email', 'Email-ді растаңыз', 'Verify your email')}</h2>
            <p className="text-sm text-gray-400 mb-1">{l('Введите 6-значный код для', 'Растау үшін 6 санды кодты енгізіңіз', 'Enter the 6-digit code for')}</p>
            <p className="text-sm text-gray-900 mb-5">{email}</p>

            {/* Dev mode banner — real email sending is OFF; surface the code right here. */}
            {devVerificationCode && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-5 text-left">
                <div className="text-[10px] uppercase tracking-wider text-amber-700 mb-1">
                  {l('Демо-режим · email не отправляется', 'Демо-режим · email жіберілмейді', 'Demo mode · no email is sent')}
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
              <p className="text-xs text-gray-400 mb-6">{l('Отправить повторно через', 'Қайта жіберу', 'Resend in')} <span className="text-gray-900">{otpTimer}{l('с', 'с', 's')}</span></p>
            ) : (
              <button onClick={handleResendCode} disabled={isLoading} className="text-xs text-gray-900 hover:underline mb-6 disabled:opacity-40">{l('Отправить код повторно', 'Кодты қайта жіберу', 'Resend code')}</button>
            )}

            <button onClick={handleOtpVerify} disabled={isLoading || otp.join('').length < 6} className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{l('Подтвердить', 'Растау', 'Verify')} <Check className="w-4 h-4" /></>}
            </button>
          </div>
        );

      /* ===== FORGOT PASSWORD ===== */
      case 'forgot':
        return (
          <div>
            <h2 className="text-xl text-gray-900 mb-1">{l('Сбросить пароль', 'Құпия сөзді қалпына келтіру', 'Reset Password')}</h2>
            <p className="text-sm text-gray-400 mb-6">{l('Введите email и мы отправим ссылку', 'Email енгізіңіз, біз сілтеме жібереміз', 'Enter your email and we will send a link')}</p>

            <div className="mb-4">
              <label className="block text-[11px] text-gray-400 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleForgotPassword()} placeholder="name@company.kz" autoFocus className="w-full pl-10 pr-4 py-3 bg-gray-50 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
              </div>
            </div>

            <button onClick={handleForgotPassword} disabled={isLoading || !email} className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
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
            <p className="text-sm text-gray-400 mb-1">{l('Мы отправили ссылку для сброса на', 'Біз қалпына келтіру сілтемесін жібердік', 'We sent a reset link to')}</p>
            <p className="text-sm text-gray-900 mb-6">{email}</p>

            <button onClick={() => { setStep('login-email'); setPassword(''); setError(''); }} className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-800 transition-all">
              {l('Вернуться к входу', 'Кіруге оралу', 'Back to login')}
            </button>
            <p className="text-xs text-gray-400 mt-4">{l('Не получили? Проверьте папку спам', 'Алмадыңыз ба? Спам қалтасын тексеріңіз', "Didn't receive it? Check spam folder")}</p>
          </div>
        );

      default: return null;
    }
  };

  // Step indicator
  const signupSteps = ['signup-email', 'signup-name', 'signup-password', 'otp'];
  const currentSignupStep = signupSteps.indexOf(step);
  const isSignupFlow = currentSignupStep >= 0;

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left side - Features (desktop only) */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] bg-gray-50 flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-md flex items-center justify-center overflow-hidden shadow-sm bg-white border border-gray-100">
              <img src={profileLogo} alt="Utir Soft" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-sm text-gray-900">Utir Soft</div>
              <div className="text-[10px] text-gray-400">{l('Платформа управления', 'Басқару платформасы', 'Management Platform')}</div>
            </div>
          </div>

          <h2 className="text-3xl text-gray-900 mb-3 max-w-md leading-tight">
            {l('Управляйте мебельным бизнесом в одной платформе', 'Жиһаз бизнесін бір платформада басқарыңыз', 'Manage your furniture business in one platform')}
          </h2>
          <p className="text-sm text-gray-400 mb-12 max-w-sm">
            {l('От первой заявки до установки — полный контроль производства, финансов и клиентов', 'Бірінші өтінімнен орнатуға дейін — өндірісті, қаржыны және клиенттерді толық бақылау', 'From the first lead to installation — full control of production, finance and clients')}
          </p>

          <div className="space-y-4">
            {features.map((f, i) => (
              <div key={i} className="flex items-start gap-4 p-4 bg-white rounded-2xl border border-gray-100 hover:shadow-sm transition-all">
                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <f.icon className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-900 mb-0.5">{f.label}</div>
                  <div className="text-xs text-gray-400">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 text-[10px] text-gray-400">
          <span>© 2026 Utir Soft</span>
          <span>•</span>
          <span>{l('Сделано в Казахстане 🇰🇿', 'Қазақстанда жасалған 🇰🇿', 'Made in Kazakhstan 🇰🇿')}</span>
        </div>
      </div>

      {/* Right side - Auth Form */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="flex items-center justify-between p-4 sm:p-6 flex-shrink-0">
          <div>
            {step !== 'welcome' && (
              <button onClick={goBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-900 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />{l('Назад', 'Артқа', 'Back')}
              </button>
            )}
          </div>
          {/* Language switcher */}
          <div className="flex gap-0.5 bg-gray-50 p-0.5 rounded-lg">
            {(['kz', 'ru', 'eng'] as const).map(lang => (
              <button key={lang} onClick={() => onLanguageChange(lang)} className={`px-2.5 py-1 rounded text-[10px] transition-all ${language === lang ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Form container */}
        <div className="flex-1 flex items-center justify-center px-4 sm:px-8">
          <div className="w-full max-w-[380px]">
            {/* Mobile logo (only on welcome) */}
            {step === 'welcome' && (
              <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-md flex items-center justify-center overflow-hidden bg-white border border-gray-100 shadow-sm">
                  <img src={profileLogo} alt="Utir Soft" className="w-full h-full object-cover" />
                </div>
                <span className="text-sm font-medium text-gray-900">Utir Soft</span>
              </div>
            )}

            {/* Signup step indicator */}
            {isSignupFlow && (
              <div className="flex items-center gap-1 mb-6">
                {signupSteps.map((s, i) => (
                  <div key={s} className={`h-1 flex-1 rounded-full transition-all ${i <= currentSignupStep ? 'bg-gray-900' : 'bg-gray-100'}`} />
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-50 text-red-600 text-xs px-4 py-2.5 rounded-xl mb-4 flex items-center gap-2">
                <div className="w-1 h-1 bg-red-500 rounded-full flex-shrink-0" />{error}
              </div>
            )}

            {renderStepContent()}
          </div>
        </div>

        {/* Bottom */}
        <div className="p-4 sm:p-6 flex-shrink-0">
          <p className="text-center text-[10px] text-gray-300">
            {l('Нажимая "Продолжить", вы соглашаетесь с условиями использования', 'Жалғастыруды басу арқылы сіз пайдалану шарттарымен келісесіз', 'By clicking "Continue", you agree to our terms of use')}
          </p>
        </div>
      </div>
    </div>
  );
}
