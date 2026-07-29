import { Menu, X, Globe, Check, ChevronDown, LogOut, Settings as SettingsIcon, LayoutGrid } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import logoImg from "../imports/utirrsoft2.png";
import { useLang } from "../i18n/LanguageContext";
import type { Lang } from "../i18n/translations";
import { api, getToken, setToken } from "../../utils/api";

interface AuthUser { name?: string; email?: string; teamRole?: string }

// Следим за состоянием входа: есть токен → тянем /api/auth/me. Реагируем на
// событие utir:auth-changed (логин/логаут из приложения).
function useAuthUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () => {
      if (!getToken()) { if (alive) setUser(null); return; }
      api.get<{ user: AuthUser }>("/api/auth/me")
        .then(r => { if (alive) setUser(r?.user || null); })
        .catch(() => { if (alive) setUser(null); });
    };
    check();
    window.addEventListener("utir:auth-changed", check);
    return () => { alive = false; window.removeEventListener("utir:auth-changed", check); };
  }, []);
  return user;
}

// Меню профиля вошедшего пользователя (вместо «Войти/Регистрация»).
function ProfileMenu({ user, lang }: { user: AuthUser; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const L = (ru: string, kz: string, eng: string) => lang === "KZ" ? kz : lang === "ENG" ? eng : ru;

  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const displayName = user.name || user.email || "";
  const initials = displayName.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  const openApp = () => { window.location.hash = ""; };
  const openSettings = () => {
    window.location.hash = "";
    setTimeout(() => window.dispatchEvent(new CustomEvent("app:navigate", { detail: { page: "settings" } })), 60);
  };
  const openBilling = () => {
    window.location.hash = "";
    setTimeout(() => window.dispatchEvent(new CustomEvent("app:navigate", { detail: { page: "subscription" } })), 60);
  };
  const logout = () => { setToken(null); window.dispatchEvent(new Event("utir:auth-changed")); window.location.hash = ""; };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 rounded-full ring-1 ring-white/60 bg-white/60 backdrop-blur-xl pl-1.5 pr-3 py-1.5 hover:bg-white/80 transition-colors"
      >
        <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium text-white" style={{ background: "linear-gradient(135deg,#58c084,#3f9f6b)" }}>{initials}</span>
        <span className="max-w-[120px] truncate text-sm text-slate-700">{displayName}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)] overflow-hidden z-50"
          >
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-sm text-slate-900 truncate">{displayName}</div>
              {user.email && <div className="text-xs text-slate-400 truncate">{user.email}</div>}
            </div>
            <button onClick={openApp} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <LayoutGrid size={16} className="text-slate-400" /> {L("Открыть приложение", "Қосымшаны ашу", "Open app")}
            </button>
            <button onClick={openBilling} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <SettingsIcon size={16} className="text-slate-400" /> {L("Оплата и подписка", "Төлем және жазылым", "Billing")}
            </button>
            <button onClick={openSettings} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <SettingsIcon size={16} className="text-slate-400" /> {L("Настройки", "Баптаулар", "Settings")}
            </button>
            <div className="border-t border-slate-100">
              <button onClick={logout} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50">
                <LogOut size={16} /> {L("Выйти", "Шығу", "Log out")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const languages: { code: Lang; label: string; native: string }[] = [
  { code: "RU", label: "RU", native: "Русский" },
  { code: "KZ", label: "KZ", native: "Қазақша" },
  { code: "ENG", label: "EN", native: "English" },
];

function LangSwitcher() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = languages.find((l) => l.code === lang) ?? languages[0];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full ring-1 ring-white/60 bg-white/60 backdrop-blur-xl px-3 py-1.5 text-xs text-slate-700 hover:bg-white/80 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Globe size={14} className="text-slate-500" />
        <span className="tracking-wide">{current.label}</span>
        <ChevronDown size={12} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-44 rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)] overflow-hidden z-50"
            role="listbox"
          >
            {languages.map((l) => {
              const active = l.code === lang;
              return (
                <button
                  key={l.code}
                  onClick={() => {
                    setLang(l.code);
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={active}
                  className={`flex w-full items-center justify-between px-3.5 py-2.5 text-sm transition-colors ${
                    active ? "bg-emerald-50/60 text-slate-900" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-[11px] tracking-wider text-slate-400 w-5">{l.label}</span>
                    <span>{l.native}</span>
                  </span>
                  {active && <Check size={14} className="text-[#58c084]" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const { t, lang } = useLang();
  const user = useAuthUser();

  const navLinks = [
    { href: "#features", label: t.nav.features },
    { href: "#solutions", label: t.nav.solutions },
    { href: "#pricing", label: t.nav.pricing },
    { href: "#cases", label: t.nav.cases },
    { href: "#faq", label: t.nav.help },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/40 bg-white/55 backdrop-blur-2xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-8">
        <a href="#/" className="flex items-center">
          <img src={logoImg} alt="UTIR soft" className="h-9 w-auto object-contain rounded-lg" />
        </a>

        <nav className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <LangSwitcher />
          {user ? (
            <ProfileMenu user={user} lang={lang} />
          ) : (
            <>
              <a
                href="#/login"
                className="inline-flex items-center rounded-full px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-900/5 transition-colors"
              >
                {t.nav.login}
              </a>
              <a
                href="#/signup"
                className="inline-flex items-center rounded-full bg-[#58c084] px-4 py-2 text-sm font-medium text-white shadow-[0_6px_18px_-8px_rgba(88,192,132,0.8)] hover:bg-[#47a66f] transition-colors"
              >
                {t.nav.tryFree}
              </a>
            </>
          )}
        </div>

        <button
          className="md:hidden p-2 text-slate-700"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-white/40 bg-white/70 backdrop-blur-2xl px-6 py-6 space-y-5">
          <nav className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-slate-700"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <LangSwitcher />
          <div className="flex flex-col gap-2 pt-4 border-t border-white/50">
            {user ? (
              <>
                <div className="text-sm text-slate-900 px-1">{user.name || user.email}</div>
                <button
                  onClick={() => { window.location.hash = ""; }}
                  className="w-full inline-flex items-center justify-center py-2.5 text-sm font-medium text-white bg-[#58c084] hover:bg-[#47a66f] rounded-full transition-colors"
                >
                  {lang === "KZ" ? "Қосымшаны ашу" : lang === "ENG" ? "Open app" : "Открыть приложение"}
                </button>
                <button
                  onClick={() => { window.location.hash = ""; setTimeout(() => window.dispatchEvent(new CustomEvent("app:navigate", { detail: { page: "subscription" } })), 60); }}
                  className="w-full inline-flex items-center justify-center py-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 rounded-full"
                >
                  {lang === "KZ" ? "Төлем және жазылым" : lang === "ENG" ? "Billing" : "Оплата и подписка"}
                </button>
                <button
                  onClick={() => { setToken(null); window.dispatchEvent(new Event("utir:auth-changed")); window.location.hash = ""; }}
                  className="w-full inline-flex items-center justify-center py-2.5 text-sm font-medium text-rose-600 ring-1 ring-rose-200 rounded-full"
                >
                  {lang === "KZ" ? "Шығу" : lang === "ENG" ? "Log out" : "Выйти"}
                </button>
              </>
            ) : (
              <>
                <a
                  href="#/login"
                  className="w-full inline-flex items-center justify-center py-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 rounded-full"
                >
                  {t.nav.login}
                </a>
                <a
                  href="#/signup"
                  className="w-full inline-flex items-center justify-center py-2.5 text-sm font-medium text-white bg-[#58c084] hover:bg-[#47a66f] rounded-full transition-colors"
                >
                  {t.nav.tryFree}
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
