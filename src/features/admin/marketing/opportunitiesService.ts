import { supabase } from "@/lib/supabaseClient";

export type ContentCategory =
  | "captain"
  | "breakout"
  | "value"
  | "trap"
  | "momentum"
  | "sell";

export interface ContentOpportunity {
  player_id: number;
  player_name: string;
  team: string;
  position: string | null;
  category: ContentCategory;
  projection: number | null;
  ceiling: number | null;
  floor: number | null;
  value_score: number | null;
  captain_score: number | null;
  form_score: number | null;
  risk_rating: number | null;
  upside_pct: number | null;
  neeko_rating_scaled: number | null;
  price: number | null;
  price_change: number | null;
  price_change_pct: number | null;
  ai_recommendation: string | null;
  recommendation_color: string | null;
  summary_short: string | null;
  signal_reason: string;
}

const COLUMNS = [
  "player_id",
  "player_name",
  "team",
  "position",
  "projection_final",
  "ceiling",
  "floor",
  "value_score",
  "captain_score",
  "form_score",
  "risk_rating",
  "upside_rating",
  "upside_pct",
  "neeko_rating_scaled",
  "price",
  "price_change",
  "price_change_pct",
  "ai_recommendation",
  "recommendation_color",
  "summary_short",
  "market_watch_category",
  "is_available",
  "is_bye",
  "manual_status",
].join(",");

function availableOnly(row: Record<string, unknown>): boolean {
  if (!row.is_available) return false;
  if (row.is_bye) return false;
  const ms = (row.manual_status as string | null)?.toLowerCase();
  if (ms && ["injured", "omitted", "suspended", "inactive"].includes(ms)) return false;
  return true;
}

function buildReason(cat: ContentCategory, row: Record<string, unknown>): string {
  const proj = row.projection_final != null ? `proj ${Math.round(Number(row.projection_final))}` : null;
  const val = row.value_score != null ? `value ${Number(row.value_score).toFixed(1)}` : null;
  const form = row.form_score != null ? `form ${Math.round(Number(row.form_score))}` : null;
  const risk = row.risk_rating != null ? `risk ${Math.round(Number(row.risk_rating))}` : null;
  const cap = row.captain_score != null ? `captain score ${Math.round(Number(row.captain_score))}` : null;
  const upside = row.upside_pct != null ? `${Math.round(Number(row.upside_pct))}% upside` : null;
  const pc = row.price_change != null && Number(row.price_change) !== 0
    ? `price ${Number(row.price_change) > 0 ? "+" : ""}${(Number(row.price_change) / 1000).toFixed(0)}k`
    : null;

  const reasons: Record<ContentCategory, string> = {
    captain: [cap, proj, form].filter(Boolean).join(" · "),
    breakout: [upside, proj, form].filter(Boolean).join(" · "),
    value: [val, proj].filter(Boolean).join(" · "),
    trap: [risk, proj, val].filter(Boolean).join(" · "),
    momentum: [form, pc, proj].filter(Boolean).join(" · "),
    sell: [risk, val, proj].filter(Boolean).join(" · "),
  };
  return reasons[cat] || proj || "no data";
}

function mapRow(row: Record<string, unknown>, category: ContentCategory): ContentOpportunity {
  return {
    player_id: Number(row.player_id),
    player_name: String(row.player_name),
    team: String(row.team),
    position: (row.position as string | null) ?? null,
    category,
    projection: row.projection_final != null ? Number(row.projection_final) : null,
    ceiling: row.ceiling != null ? Number(row.ceiling) : null,
    floor: row.floor != null ? Number(row.floor) : null,
    value_score: row.value_score != null ? Number(row.value_score) : null,
    captain_score: row.captain_score != null ? Number(row.captain_score) : null,
    form_score: row.form_score != null ? Number(row.form_score) : null,
    risk_rating: row.risk_rating != null ? Number(row.risk_rating) : null,
    upside_pct: row.upside_pct != null ? Number(row.upside_pct) : (row.upside_rating != null ? Number(row.upside_rating) : null),
    neeko_rating_scaled: row.neeko_rating_scaled != null ? Number(row.neeko_rating_scaled) : null,
    price: row.price != null ? Number(row.price) : null,
    price_change: row.price_change != null ? Number(row.price_change) : null,
    price_change_pct: row.price_change_pct != null ? Number(row.price_change_pct) : null,
    ai_recommendation: (row.ai_recommendation as string | null) ?? null,
    recommendation_color: (row.recommendation_color as string | null) ?? null,
    summary_short: (row.summary_short as string | null) ?? null,
    signal_reason: buildReason(category, row),
  };
}

export async function getContentOpportunities(): Promise<ContentOpportunity[]> {
  const { data, error } = await supabase
    .schema("afl" as any)
    .from("player_rankings_cache")
    .select(COLUMNS)
    .order("neeko_rating_scaled", { ascending: false })
    .limit(500);

  if (error) throw error;
  const rows = (data as Record<string, unknown>[]).filter(availableOnly);

  const captains = rows
    .filter((r) => r.captain_score != null && Number(r.captain_score) >= 80)
    .sort((a, b) => Number(b.captain_score) - Number(a.captain_score))
    .slice(0, 10)
    .map((r) => mapRow(r, "captain"));

  const breakouts = rows
    .filter((r) => {
      const upside = Number(r.upside_pct ?? r.upside_rating ?? 0);
      const form = Number(r.form_score ?? 0);
      return upside >= 20 && form >= 85;
    })
    .sort((a, b) => Number(b.upside_pct ?? b.upside_rating ?? 0) - Number(a.upside_pct ?? a.upside_rating ?? 0))
    .slice(0, 10)
    .map((r) => mapRow(r, "breakout"));

  const values = rows
    .filter((r) => r.value_score != null && Number(r.value_score) >= 15)
    .sort((a, b) => Number(b.value_score) - Number(a.value_score))
    .slice(0, 10)
    .map((r) => mapRow(r, "value"));

  const traps = rows
    .filter((r) => {
      const risk = Number(r.risk_rating ?? 0);
      const val = Number(r.value_score ?? 99);
      return risk >= 35 && val < 10;
    })
    .sort((a, b) => Number(b.risk_rating) - Number(a.risk_rating))
    .slice(0, 10)
    .map((r) => mapRow(r, "trap"));

  const momentum = rows
    .filter((r) => {
      const form = Number(r.form_score ?? 0);
      const pc = Number(r.price_change ?? 0);
      return form >= 95 || (form >= 80 && pc > 0);
    })
    .sort((a, b) => Number(b.form_score ?? 0) - Number(a.form_score ?? 0))
    .slice(0, 10)
    .map((r) => mapRow(r, "momentum"));

  const sells = rows
    .filter((r) => r.ai_recommendation === "SELL")
    .sort((a, b) => Number(b.risk_rating ?? 0) - Number(a.risk_rating ?? 0))
    .slice(0, 10)
    .map((r) => mapRow(r, "sell"));

  return [...captains, ...breakouts, ...values, ...traps, ...momentum, ...sells];
}
