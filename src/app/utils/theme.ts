// ─── Per-user accent theme (Telegram-style) ───────────────────────
// Each teammate picks their own accent color in Settings → Основные.
// Stored in localStorage so it persists across reloads on the same
// browser. Applied via the `data-theme="<id>"` attribute on <html>;
// the actual colour overrides live in src/styles/theme.css and target
// the Tailwind classes we use for primary actions (bg-emerald-600,
// text-emerald-700, ring-emerald-*, shadow rgba(5,150,105,*)).
//
// `swatch` is the dot rendered in the picker — it's a single solid
// colour, not the gradient applied to active buttons.

export type ThemeId =
  | 'emerald'   // Default — matches Utir Soft logo
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'rose'
  | 'orange'
  | 'slate'
  | 'black';

export interface ThemeDef {
  id: ThemeId;
  swatch: string;     // hex for the colour-dot in the picker
  label: { ru: string; kz: string; eng: string };
}

// Order matters — first item is shown leftmost in the picker. Black is
// the platform default; the brand emerald sits right after so users can
// easily switch back to it.
export const THEMES: ThemeDef[] = [
  { id: 'black',   swatch: '#0f172a', label: { ru: 'Чёрный (по умолчанию)', kz: 'Қара (әдепкі)',    eng: 'Black (default)' } },
  { id: 'emerald', swatch: '#10b981', label: { ru: 'Изумруд (бренд)',       kz: 'Зүмірет (бренд)',  eng: 'Emerald (brand)' } },
  { id: 'teal',    swatch: '#14b8a6', label: { ru: 'Бирюзовый',             kz: 'Көгілдір',         eng: 'Teal' } },
  { id: 'cyan',    swatch: '#06b6d4', label: { ru: 'Голубой',               kz: 'Көк-жасыл',        eng: 'Cyan' } },
  { id: 'sky',     swatch: '#0ea5e9', label: { ru: 'Небесный',              kz: 'Аспан',            eng: 'Sky' } },
  { id: 'blue',    swatch: '#2563eb', label: { ru: 'Синий',                 kz: 'Көк',              eng: 'Blue' } },
  { id: 'indigo',  swatch: '#4f46e5', label: { ru: 'Индиго',                kz: 'Индиго',           eng: 'Indigo' } },
  { id: 'violet',  swatch: '#8b5cf6', label: { ru: 'Фиолетовый',            kz: 'Күлгін',           eng: 'Violet' } },
  { id: 'rose',    swatch: '#f43f5e', label: { ru: 'Розовый',               kz: 'Қызғылт',          eng: 'Rose' } },
  { id: 'orange',  swatch: '#f97316', label: { ru: 'Оранжевый',             kz: 'Қызғылт сары',     eng: 'Orange' } },
  { id: 'slate',   swatch: '#475569', label: { ru: 'Графитовый',            kz: 'Графит',           eng: 'Slate' } },
];

const STORAGE_KEY = 'utir_user_theme';

export function loadTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && THEMES.some(t => t.id === saved)) return saved as ThemeId;
  } catch { /* localStorage blocked */ }
  return 'black';
}

export function saveTheme(id: ThemeId) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
  applyTheme(id);
}

// Writes the data-theme attribute so the CSS rules in theme.css take
// effect. Called once on app boot and on every picker change.
export function applyTheme(id: ThemeId) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', id);
}

// ─── Light / Dark mode (orthogonal to the accent colour) ──────────
// `accent` (above) tints buttons & badges; `mode` flips the whole
// surface palette between light and dark. They're independent — any
// accent works in either mode. Dark overrides live in theme.css under
// the `.dark` class on <html>. 'system' follows the OS preference and
// keeps tracking it live via matchMedia.

export type ColorMode = 'light' | 'dark' | 'system';

const MODE_KEY = 'utir_user_mode';

export function loadMode(): ColorMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch { /* localStorage blocked */ }
  return 'light';
}

export function saveMode(mode: ColorMode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  applyMode(mode);
}

// True when the OS currently asks for a dark UI.
function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && !!window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Toggles the `.dark` class on <html>. For 'system' we resolve to the
// OS value now and (re)attach a live listener so the app re-themes if
// the user flips their OS appearance while the tab is open.
let mqlListenerAttached = false;
export function applyMode(mode: ColorMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark = mode === 'dark' || (mode === 'system' && systemPrefersDark());
  root.classList.toggle('dark', isDark);

  if (mode === 'system' && typeof window !== 'undefined' && window.matchMedia && !mqlListenerAttached) {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (loadMode() === 'system') root.classList.toggle('dark', mql.matches); };
    // addEventListener is the modern API; older Safari needs addListener.
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else if ((mql as any).addListener) (mql as any).addListener(onChange);
    mqlListenerAttached = true;
  }
}
