import { Menu, X, Globe, Check, ChevronDown } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import logoImg from "../imports/utirrsoft2.png";
import { useLang } from "../i18n/LanguageContext";
import type { Lang } from "../i18n/translations";

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
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:border-slate-300 transition-colors"
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
  const { t } = useLang();

  const navLinks = [
    { href: "#features", label: t.nav.features },
    { href: "#solutions", label: t.nav.solutions },
    { href: "#pricing", label: t.nav.pricing },
    { href: "#cases", label: t.nav.cases },
    { href: "#faq", label: t.nav.help },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-8">
        <a href="#" className="flex items-center">
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
          <a
            href="#/login"
            className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            {t.nav.login}
          </a>
          <a
            href="#/signup"
            className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 transition-colors"
          >
            {t.nav.tryFree}
          </a>
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
        <div className="md:hidden border-t border-slate-100 bg-white px-6 py-6 space-y-5">
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
          <div className="flex flex-col gap-2 pt-4 border-t border-slate-100">
            <a
              href="#/login"
              className="w-full text-center py-2.5 text-slate-700 border border-slate-200 rounded-full"
            >
              {t.nav.login}
            </a>
            <a
              href="#/signup"
              className="w-full text-center py-2.5 text-white bg-slate-900 rounded-full"
            >
              {t.nav.tryFree}
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
