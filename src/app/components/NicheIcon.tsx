// Renders a niche's minimalist line icon (lucide) — the web-UI replacement
// for the old emoji. Pass either a resolved niche config or an id; the id
// form falls back to furniture via getNiche(). Keeps every call site a
// one-liner instead of pulling the component out of the config by hand.

import { getNiche, type NicheConfig } from '../utils/niches';

export function NicheIcon({
  niche,
  id,
  className = 'w-4 h-4',
  strokeWidth = 1.5,
}: {
  niche?: NicheConfig;
  id?: string | null;
  className?: string;
  strokeWidth?: number;
}) {
  const cfg = niche || getNiche(id);
  const Icon = cfg.lucide;
  return <Icon className={className} strokeWidth={strokeWidth} />;
}
