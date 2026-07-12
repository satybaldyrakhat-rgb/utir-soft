// ─── Meta Marketing API — расход и результаты по креативам ───────────
// Тянет insights на уровне объявления (ad) из рекламного аккаунта, чтобы
// показать ROI по каждому креативу: расход × заявки × продажи из Meta.
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

export interface CreativeRow {
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  roas: number | null;                 // revenue / spend (null если расхода нет)
  verdict: 'profit' | 'even' | 'loss' | 'nodata';
}

// Суммирует значения нужных action_type из массива actions/action_values.
function sumActions(arr: any[] | undefined, types: string[]): number {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((s, a) => (types.includes(a.action_type) ? s + (Number(a.value) || 0) : s), 0);
}

const LEAD_TYPES = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];
const PURCHASE_TYPES = ['purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_conversion.purchase'];

// Чистый парсер ответа Graph API (тестируется отдельно от сети).
export function parseCreativeInsights(json: any): CreativeRow[] {
  const rows: any[] = Array.isArray(json?.data) ? json.data : [];
  return rows.map(r => {
    const spend = Number(r.spend) || 0;
    const leads = sumActions(r.actions, LEAD_TYPES);
    const purchases = sumActions(r.actions, PURCHASE_TYPES);
    const revenue = sumActions(r.action_values, PURCHASE_TYPES);
    const roas = spend > 0 ? revenue / spend : null;
    let verdict: CreativeRow['verdict'];
    if (spend === 0) verdict = 'nodata';
    else if (roas! >= 1.2) verdict = 'profit';
    else if (roas! >= 1) verdict = 'even';
    else verdict = 'loss';
    return {
      adId: String(r.ad_id || ''),
      adName: String(r.ad_name || r.ad_id || '—'),
      spend, impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0,
      leads, purchases, revenue, roas, verdict,
    };
  }).sort((a, b) => b.spend - a.spend);
}

export interface MetaAdsConfig { adAccountId: string; accessToken: string; }

// Живой запрос insights по объявлениям. datePreset: last_7d / last_30d / ...
export async function fetchCreativeInsights(cfg: MetaAdsConfig, datePreset = 'last_30d'): Promise<{ ok: boolean; creatives: CreativeRow[]; error?: string }> {
  const acct = cfg.adAccountId.startsWith('act_') ? cfg.adAccountId : `act_${cfg.adAccountId}`;
  const fields = 'ad_id,ad_name,spend,impressions,clicks,actions,action_values';
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(acct)}/insights?level=ad&fields=${fields}&date_preset=${encodeURIComponent(datePreset)}&limit=200&access_token=${encodeURIComponent(cfg.accessToken)}`;
  try {
    const resp = await fetch(url);
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok || json?.error) return { ok: false, creatives: [], error: json?.error?.message || `HTTP ${resp.status}` };
    return { ok: true, creatives: parseCreativeInsights(json) };
  } catch (e: any) {
    return { ok: false, creatives: [], error: String(e?.message || e) };
  }
}
