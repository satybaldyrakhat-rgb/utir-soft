// ─── Design tokens (Д1) ────────────────────────────────────────────
// Single source of truth for the visual language. Import these instead
// of copy-pasting Tailwind strings so the whole product stays one
// minimalist surface: one accent, one glass card, three button kinds,
// one input, one chip. Change here → changes everywhere.
//
// Accent note: src/styles/theme.css retints the `emerald-*` utility
// classes to the per-user theme colour (via !important overrides that
// read --accent-600 etc.). So we deliberately use `bg-emerald-600`
// here — it already follows the theme. `var(--accent)` is the shadcn
// neutral (light grey) and must NOT be used as a fill.

// ── Cards / surfaces ──────────────────────────────────────────────
export const CARD = 'bg-white/55 backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-white/60 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.10)] rounded-3xl';
export const CARD_HOVER = 'transition-[background,box-shadow] hover:bg-white/70 hover:shadow-[0_16px_48px_-12px_rgba(15,23,42,0.18)]';
// A lighter inset surface used inside cards (sub-panels, list rows).
export const PANEL = 'bg-white/50 ring-1 ring-white/60 rounded-2xl';

// ── Buttons (exactly three kinds) ─────────────────────────────────
// Primary = theme accent (emerald class, retinted). Ghost = quiet
// default. Danger = rose. Shadows use --accent-shadow so they tint too.
export const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs text-white bg-emerald-600 hover:bg-emerald-700 ring-1 ring-white/10 shadow-[0_8px_24px_-8px_var(--accent-shadow)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
export const BTN_GHOST = 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs text-slate-600 bg-white/60 hover:bg-white ring-1 ring-white/60 backdrop-blur-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
export const BTN_DANGER = 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs text-white bg-rose-600 hover:bg-rose-700 ring-1 ring-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
// Small variants (compact toolbars / table actions).
export const BTN_PRIMARY_SM = 'inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-[11px] text-white bg-emerald-600 hover:bg-emerald-700 ring-1 ring-white/10 transition-colors disabled:opacity-40';
export const BTN_GHOST_SM = 'inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-[11px] text-slate-600 bg-white/60 hover:bg-white ring-1 ring-white/60 transition-colors disabled:opacity-40';

// ── Inputs ────────────────────────────────────────────────────────
export const INPUT = 'w-full px-3 py-2.5 bg-white/55 backdrop-blur-xl ring-1 ring-white/60 rounded-2xl text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-shadow';

// ── Chips / tags ──────────────────────────────────────────────────
export const CHIP = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] ring-1 ring-white/60 bg-white/60 text-slate-600';
export const CHIP_ACTIVE = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] text-white bg-emerald-600 ring-1 ring-white/10 shadow-[0_4px_12px_-2px_var(--accent-shadow)]';

// ── Section heading label (uppercase micro-caption) ───────────────
export const LABEL = 'text-[10px] uppercase tracking-wider text-slate-400';

// ── Radii — only three tiers ──────────────────────────────────────
//   r3 = cards / modals · r2 = buttons / inputs / chips · r1 = small tags
export const r3 = 'rounded-3xl';
export const r2 = 'rounded-2xl';
export const r1 = 'rounded-lg';

// ── Icon defaults — lucide, hairline weight for a calmer minimalist look.
// Spread onto a lucide icon: <Icon {...ICON} className="w-4 h-4" />
export const ICON = { strokeWidth: 1.5 } as const;
