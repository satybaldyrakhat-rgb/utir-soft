// Unified brand-logo component. Renders SVG icons downloaded from
// Simple Icons (CC0) → public/logos/{slug}.svg. SVGs are inlined via
// Vite's ?raw import so we can recolor them with the parent's CSS
// `color` (we pre-processed the files to use fill="currentColor").
//
// Usage:
//   <BrandLogo id="openai" size={24} />                  // default brand colour
//   <BrandLogo id="openai" size={24} color="#fff" />     // override colour
//   <BrandLogo id="openai" size={24} mono />             // ignore brand colour, inherit current
//
// One source of truth, one style. Local KZ brands (Kaspi, Halyk, 1С) are
// not on Simple Icons — they keep their hand-drawn SVG components in
// PlatformLogos.tsx; this component falls back to <PlatformIcon /> when
// it doesn't know the id, so admins still see something rather than blank.

// Vite glob-imports every svg in /public/logos as a raw string. The
// `eager: true` option means everything bundles at build time — no
// runtime fetch, no flash of missing icon.
const SVG_MODULES = import.meta.glob('../../assets/logos/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Map integration id → svg slug. Most slugs match directly; a few are
// aliased so the call sites stay readable («openai», not «open-ai»).
const SLUG_MAP: Record<string, string> = {
  openai:            'openai',
  anthropic:         'anthropic',
  'google-gemini':   'googlegemini',
  gemini:            'googlegemini',
  deepseek:          'deepseek',
  telegram:          'telegram',
  'telegram-bot':    'telegram',
  whatsapp:          'whatsapp',
  'whatsapp-business': 'whatsapp',
  instagram:         'instagram',
  'instagram-direct': 'instagram',
  tiktok:            'tiktok',
  zapier:            'zapier',
  'zapier-webhooks': 'zapier',
  n8n:               'n8n',
  make:              'make',
  slack:             'slack',
  notion:            'notion',
  stripe:            'stripe',
  google:            'google',
  'google-workspace':'google',
  googlecalendar:    'googlecalendar',
  googledrive:       'googledrive',
  googlemeet:        'googlemeet',
};

// Brand colours from each company's marketing site / Wikipedia
// (matches the simpleicons.org reference). The whole point of a brand
// logo is recognition — keeping these accurate makes Telegram blue,
// WhatsApp green, etc. immediately scannable on the page.
const BRAND_COLOR: Record<string, string> = {
  openai:            '#10A37F',
  anthropic:         '#D97757',  // Anthropic warm orange
  googlegemini:      '#8E75B2',  // Gemini purple (their primary brand colour)
  deepseek:          '#4D6BFE',
  telegram:          '#2AABEE',
  whatsapp:          '#25D366',
  instagram:         '#E4405F',  // Instagram pink (gradient flattened)
  tiktok:            '#000000',
  zapier:            '#FF4F00',
  n8n:               '#EA4B71',
  make:              '#6D00CC',
  slack:             '#4A154B',
  notion:            '#000000',
  stripe:            '#635BFF',
  google:            '#4285F4',
  googlecalendar:    '#4285F4',
  googledrive:       '#0F9D58',
  googlemeet:        '#00897B',
};

interface Props {
  /** Integration id or slug. See SLUG_MAP for the supported set. */
  id: string;
  /** Pixel size — applied as both width and height. Default 20. */
  size?: number;
  /** Hex colour. Overrides the brand colour. */
  color?: string;
  /** If true, ignore the brand colour and inherit the parent's text colour. */
  mono?: boolean;
  /** Extra Tailwind classes for the wrapper span. */
  className?: string;
  /** Optional accessible label (otherwise the slug is used). */
  label?: string;
}

export function BrandLogo({ id, size = 20, color, mono, className = '', label }: Props) {
  const slug = SLUG_MAP[id] || id;
  // Vite's import.meta.glob keys are absolute paths starting with /public.
  const svg = SVG_MODULES[`../../assets/logos/${slug}.svg`];
  if (!svg) {
    // Unknown id — render a neutral placeholder rather than nothing so the
    // layout doesn't collapse and devs can spot missing logos in dev.
    return (
      <span
        className={`inline-flex items-center justify-center bg-gray-100 text-gray-400 rounded ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(8, size * 0.35) }}
        title={label || id}
      >
        ?
      </span>
    );
  }
  const finalColor = mono ? undefined : (color || BRAND_COLOR[slug] || 'currentColor');
  return (
    <span
      className={`inline-block ${className}`}
      style={{ width: size, height: size, color: finalColor, lineHeight: 0 }}
      title={label || slug}
      // SVGs are CC0 from Simple Icons; we pre-injected fill="currentColor"
      // on every <path>, so setting `color` above tints the whole glyph.
      dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', `<svg width="${size}" height="${size}" `) }}
    />
  );
}

// True when we have a real SVG for this id (lets callers decide to fall
// back to PlatformLogos for KZ-local brands like Kaspi / Halyk / 1С).
export function hasBrandLogo(id: string): boolean {
  const slug = SLUG_MAP[id] || id;
  return !!SVG_MODULES[`../../assets/logos/${slug}.svg`];
}
