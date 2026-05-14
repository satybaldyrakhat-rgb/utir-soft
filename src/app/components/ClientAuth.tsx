import { useState, useRef, useEffect } from 'react';
import { Phone, ArrowRight, ArrowLeft, Loader2, ShieldCheck, MessageCircle, Package, Truck, Star } from 'lucide-react';
import profileLogo from '../../imports/utirsoft.png';
import { useDataStore } from '../utils/dataStore';

const CLIENT_AUTH_KEY = 'utir_client_session';

export type ClientSession = { name: string; phone: string };

export function readClientSession(): ClientSession | null {
  try {
    const raw = localStorage.getItem(CLIENT_AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeClientSession(s: ClientSession) {
  localStorage.setItem(CLIENT_AUTH_KEY, JSON.stringify(s));
}

export function clearClientSession() {
  localStorage.removeItem(CLIENT_AUTH_KEY);
}

const normalizePhone = (p: string) => p.replace(/\D/g, '').replace(/^8/, '7');

export function ClientAuth({ onAuth }: { onAuth: (s: ClientSession) => void }) {
  const store = useDataStore();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(60);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step === 'otp' && timer > 0) {
      const t = setTimeout(() => setTimer(timer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [step, timer]);

  useEffect(() => {
    if (step === 'otp') otpRefs.current[0]?.focus();
  }, [step]);

  const formatPhone = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, 11);
    if (!d) return '';
    let r = '+7';
    if (d.length > 1) r += ` (${d.slice(1, 4)}`;
    if (d.length >= 4) r += `)`;
    if (d.length > 4) r += ` ${d.slice(4, 7)}`;
    if (d.length > 7) r += `-${d.slice(7, 9)}`;
    if (d.length > 9) r += `-${d.slice(9, 11)}`;
    return r;
  };

  const handlePhoneSubmit = () => {
    const normalized = normalizePhone(phone);
    if (normalized.length !== 11) { setError('Введите полный номер телефона'); return; }
    setError('');
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep('otp');
      setTimer(60);
    }, 600);
  };

  const handleOtpChange = (i: number, v: string) => {
    if (v.length > 1) v = v[v.length - 1];
    if (!/^\d*$/.test(v)) return;
    const next = [...otp];
    next[i] = v;
    setOtp(next);
    setError('');
    if (v && i < 3) otpRefs.current[i + 1]?.focus();
    if (next.every(c => c)) verifyOtp(next.join(''));
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  const verifyOtp = (code: string) => {
    setLoading(true);
    setError('');
    setTimeout(() => {
      setLoading(false);
      if (code === '0000') {
        setError('Неверный код. Попробуйте 1234 (демо)');
        setOtp(['', '', '', '']);
        otpRefs.current[0]?.focus();
        return;
      }
      const normalized = normalizePhone(phone);
      const match = store.deals.find(d => normalizePhone(d.phone || '') === normalized);
      const session: ClientSession = {
        name: match?.customerName || 'Дмитрий Волков',
        phone: '+' + normalized,
      };
      writeClientSession(session);
      onAuth(session);
    }, 700);
  };

  return (
    <div
      className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr] relative overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at 0% 0%, #d1fae5 0%, transparent 45%), radial-gradient(circle at 100% 100%, #ccfbf1 0%, transparent 40%), radial-gradient(circle at 80% 10%, #ecfdf5 0%, transparent 50%), #f8fafc',
      }}
    >
      <div className="pointer-events-none fixed -top-32 -left-20 w-96 h-96 rounded-full bg-emerald-300/30 blur-3xl" />
      <div className="pointer-events-none fixed top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full bg-teal-300/20 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-32 left-1/3 w-96 h-96 rounded-full bg-emerald-200/30 blur-3xl" />

      {/* Left brand panel */}
      <div
        className="hidden lg:flex relative overflow-hidden text-white p-12 flex-col justify-between"
        style={{ background: 'linear-gradient(135deg, #059669 0%, #0d9488 50%, #047857 100%)' }}
      >
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/15 blur-3xl" />
        <div className="absolute -bottom-40 -left-32 w-[28rem] h-[28rem] rounded-full bg-white/10 blur-3xl" />
        <div className="absolute top-1/3 right-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-xl border border-white/30 flex items-center justify-center overflow-hidden">
              <img src={profileLogo} alt="" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/70">Utir Soft</div>
              <div className="text-sm text-white">Кабинет клиента</div>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <div className="text-[40px] leading-[1.05] mb-4">
            Следите за заказом<br />из любой точки мира
          </div>
          <p className="text-white/80 text-sm leading-relaxed mb-10">
            Прямой контакт с мастерами, AR-визуализация, бонусы Kaspi и сопровождение 24/7. Всё в одном кабинете.
          </p>
          <div className="space-y-3">
            {[
              { Icon: Package, t: 'Реальный статус ваших заказов', s: 'Каждый этап от замера до установки' },
              { Icon: Truck, t: 'Живая карта курьера и бригады', s: 'Карта 2GIS с обновлением каждые 5 сек' },
              { Icon: Star, t: 'Бонусы и приоритетная сборка', s: 'VIP-программа и скидки до 30%' },
            ].map(({ Icon, t, s }) => (
              <div key={t} className="flex items-start gap-3 bg-white/15 backdrop-blur-xl rounded-2xl px-4 py-3 border border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
                <div className="w-9 h-9 rounded-xl bg-white/25 backdrop-blur border border-white/30 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm">{t}</div>
                  <div className="text-[11px] text-white/70 mt-0.5">{s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-[11px] text-white/60">
          © 2026 Utir Soft · Алматы, Казахстан
        </div>
      </div>

      {/* Right form panel */}
      <div className="relative flex items-center justify-center p-6 lg:p-12 min-h-screen">
        <div className="w-full max-w-sm bg-white/60 backdrop-blur-xl border border-white/60 rounded-3xl shadow-[0_8px_32px_rgba(15,118,110,0.08)] p-7 lg:p-8">
          <button
            onClick={() => { window.location.hash = ''; }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-900 mb-8 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> На главную
          </button>

          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-emerald-50/70 backdrop-blur border border-white/60">
              <img src={profileLogo} alt="" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400">Utir Soft</div>
              <div className="text-sm text-gray-900">Кабинет клиента</div>
            </div>
          </div>

          {step === 'phone' && (
            <>
              <div className="mb-8">
                <h1 className="text-gray-900 mb-2">Войти в кабинет</h1>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Введите номер, указанный при заказе. Мы отправим SMS с кодом — пароль не нужен.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1.5 ml-1">Телефон</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-gray-300 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => { setPhone(formatPhone(e.target.value)); setError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handlePhoneSubmit()}
                      placeholder="+7 (___) ___-__-__"
                      autoFocus
                      className="w-full pl-11 pr-4 py-3.5 bg-white/70 backdrop-blur border border-white/70 rounded-2xl text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 focus:bg-white/90 transition-all"
                    />
                  </div>
                  {error && <div className="text-xs text-rose-600 mt-2 ml-1">{error}</div>}
                </div>

                <button
                  onClick={handlePhoneSubmit}
                  disabled={loading || !phone}
                  className="w-full py-3.5 text-white rounded-2xl text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-[0_6px_20px_rgba(16,185,129,0.35)] hover:shadow-[0_8px_28px_rgba(16,185,129,0.45)]"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)' }}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Получить код <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>

              <div className="flex items-center gap-3 my-6">
                <div className="h-px bg-gray-100 flex-1" />
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">или</span>
                <div className="h-px bg-gray-100 flex-1" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={handlePhoneSubmit} className="flex items-center justify-center gap-2 py-3 bg-white/60 backdrop-blur border border-white/70 rounded-2xl text-xs text-gray-700 hover:border-emerald-200 hover:bg-emerald-50/60 transition-all">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-500" /> WhatsApp
                </button>
                <button onClick={handlePhoneSubmit} className="flex items-center justify-center gap-2 py-3 bg-white/60 backdrop-blur border border-white/70 rounded-2xl text-xs text-gray-700 hover:border-teal-200 hover:bg-teal-50/60 transition-all">
                  <MessageCircle className="w-3.5 h-3.5 text-teal-500" /> Telegram
                </button>
              </div>

              <p className="text-[10px] text-gray-400 text-center leading-relaxed mt-8">
                Продолжая, вы соглашаетесь с <span className="text-gray-700 underline cursor-pointer">условиями</span> и <span className="text-gray-700 underline cursor-pointer">политикой конфиденциальности</span>
              </p>
            </>
          )}

          {step === 'otp' && (
            <>
              <button
                onClick={() => { setStep('phone'); setOtp(['', '', '', '']); setError(''); }}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-900 mb-6 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Изменить номер
              </button>

              <div className="mb-8">
                <div className="w-11 h-11 rounded-2xl bg-emerald-50/70 backdrop-blur border border-white/60 flex items-center justify-center mb-4">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <h1 className="text-gray-900 mb-2">Код подтверждения</h1>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Отправили SMS на <span className="text-gray-900">{phone}</span>.<br />
                  Демо-код: <span className="text-emerald-600">1234</span>
                </p>
              </div>

              <div className="flex gap-2.5 justify-between mb-5">
                {otp.map((c, i) => (
                  <input
                    key={i}
                    ref={el => { otpRefs.current[i] = el; }}
                    value={c}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    maxLength={1}
                    inputMode="numeric"
                    className="w-full aspect-square text-center text-xl bg-white/70 backdrop-blur border border-white/70 rounded-2xl focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 focus:bg-white/90 transition-all"
                  />
                ))}
              </div>

              {error && <div className="text-xs text-rose-600 text-center mb-3">{error}</div>}
              {loading && <div className="flex justify-center mb-3"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>}

              <div className="text-center">
                {timer > 0 ? (
                  <span className="text-xs text-gray-400">Отправить код повторно через <span className="text-gray-700 tabular-nums">{timer}с</span></span>
                ) : (
                  <button onClick={() => setTimer(60)} className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors">
                    Отправить код повторно
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
