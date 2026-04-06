export interface NormalizedPlayer {
  id: number;
  player_id: number;
  player_name: string;
  name: string;
  team: string;
  team_name: string;
  position: string;
  position_group: string | null;

  price: number;
  prev_price: number | null;
  price_change: number | null;
  price_change_pct: number | null;

  projection: number | null;
  breakeven: number | null;
  edge: number | null;
  value_score: number | null;

  season_avg: number | null;
  last_3_avg: number | null;
  last_5_avg: number | null;

  signal: string | null;
  category: string | null;
  action: string | null;

  why: string | null;
  why_long: string | null;

  games_played: number | null;
  status: string | null;
  manual_status: string | null;
  is_bye: boolean;
  is_available: boolean | null;
  bye_round: number | null;
  bye_next_round: boolean | null;

  access_tier: "premium" | "free" | "locked";
  cached_at: string | null;
}

export function normalizePlayer(r: Record<string, unknown>): NormalizedPlayer {
  const pid = Number(r.player_id ?? 0);
  return {
    id: pid,
    player_id: pid,
    player_name: String(r.player_name ?? ""),
    name: String(r.player_name ?? ""),
    team: String(r.team ?? r.team_name ?? ""),
    team_name: String(r.team_name ?? r.team ?? ""),
    position: String(r.player_position ?? r.position ?? ""),
    position_group: r.position_group != null ? String(r.position_group) : null,

    price: Number(r.price ?? 0),
    prev_price: r.prev_price != null ? Number(r.prev_price) : null,
    price_change: r.price_change != null ? Number(r.price_change) : null,
    price_change_pct: r.price_change_pct != null ? Number(r.price_change_pct) : null,

    projection: r.projection_final != null ? Number(r.projection_final) : null,
    breakeven: r.breakeven_canonical != null ? Number(r.breakeven_canonical) : null,
    edge: r.edge_canonical != null ? Number(r.edge_canonical) : null,
    value_score: r.value_score_canonical != null ? Number(r.value_score_canonical) : null,

    season_avg: r.season_avg != null ? Number(r.season_avg) : null,
    last_3_avg: r.last_3_avg != null ? Number(r.last_3_avg) : null,
    last_5_avg: r.last_5_avg != null ? Number(r.last_5_avg) : null,

    signal: r.signal_canonical != null ? String(r.signal_canonical) : null,
    category: r.category_canonical != null ? String(r.category_canonical) : null,
    action: r.action_canonical != null ? String(r.action_canonical) : null,

    why: r.summary_short != null ? String(r.summary_short) : null,
    why_long: r.summary_long != null ? String(r.summary_long) : null,

    games_played: r.games_played != null ? Number(r.games_played) : null,
    status: r.status != null ? String(r.status) : null,
    manual_status: r.manual_status != null ? String(r.manual_status) : null,
    is_bye: r.is_bye === true,
    is_available: r.is_available != null ? Boolean(r.is_available) : null,
    bye_round: r.bye_round != null ? Number(r.bye_round) : null,
    bye_next_round: r.bye_next_round != null ? Boolean(r.bye_next_round) : null,

    access_tier: (r.access_tier === "premium" || r.access_tier === "free") ? r.access_tier : "locked",
    cached_at: r.cached_at != null ? String(r.cached_at) : null,
  };
}
