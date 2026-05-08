import { normalisePosition } from "./helpers";
import type { RankingRow } from "./types";

export function mapRankingRow(r: Record<string, unknown>): RankingRow {
  const projection = r.projection != null ? Number(r.projection) : null;
  const breakeven  = r.breakeven != null ? Number(r.breakeven) : null;
  const season_avg = r.season_avg != null ? Number(r.season_avg) : null;
  const last_5_avg = r.last_5_avg != null ? Number(r.last_5_avg) : null;
  const last_3_avg = r.last_3_avg != null ? Number(r.last_3_avg) : null;

  // value_score: use DB value; fall back to projection - breakeven if both present
  const rawValueScore = r.value_score != null ? Number(r.value_score) : null;
  const value_score =
    rawValueScore !== null
      ? rawValueScore
      : projection !== null && breakeven !== null
        ? projection - breakeven
        : null;

  // trend_score: use DB value; fall back to form_delta, then last_3 - season_avg
  const rawTrendScore = r.trend_score != null ? Number(r.trend_score) : null;
  const rawFormDelta  = r.form_delta != null ? Number(r.form_delta) : null;
  const computedFormDelta =
    rawFormDelta !== null
      ? rawFormDelta
      : last_3_avg !== null && season_avg !== null && season_avg !== 0
        ? last_3_avg - season_avg
        : last_3_avg !== null && last_5_avg !== null && last_5_avg !== 0
          ? last_3_avg - last_5_avg
          : null;
  const trend_score = rawTrendScore !== null ? rawTrendScore : computedFormDelta;

  if (process.env.NODE_ENV !== "production" && projection === null && r.player_name) {
    console.warn("[mapRankingRow] MISSING PROJECTION", r.player_name, r);
  }

  return {
    player_id:               (r.player_id as string) ?? null,
    player_name:             (r.player_name as string) ?? "",
    team:                    (r.team as string) ?? "",
    team_name:               (r.team_name as string) ?? null,
    position:                normalisePosition((r.position ?? r.player_position) as string | null),
    position_group:          (r.position_group as string) ?? null,

    projection,
    ceiling_estimate:        r.ceiling_estimate != null ? Number(r.ceiling_estimate) : null,
    floor_estimate:          r.floor_estimate != null ? Number(r.floor_estimate) : null,
    form_score:              r.form_score != null ? Number(r.form_score) : null,
    projection_confidence:   r.projection_confidence != null ? Number(r.projection_confidence) : null,
    captain_score:           r.captain_score != null ? Number(r.captain_score) : null,
    captain_rating:          (r.captain_rating as string) ?? null,
    neeko_rating:            r.neeko_rating_scaled != null ? Number(r.neeko_rating_scaled) : (r.neeko_rating != null ? Number(r.neeko_rating) : null),
    neeko_rating_scaled:     r.neeko_rating_scaled != null ? Number(r.neeko_rating_scaled) : null,
    upside_pct:              r.upside_pct != null ? Number(r.upside_pct) : null,
    upside_rating:           r.upside_rating != null ? Number(r.upside_rating) : null,
    risk_rating:             r.risk_rating != null ? Number(r.risk_rating) : null,
    matchup_rating:          (r.matchup_label as string) ?? null,
    matchup_label:           (r.matchup_label as string) ?? null,
    matchup_multiplier:      r.matchup_multiplier != null ? Number(r.matchup_multiplier) : null,

    price:                   r.price != null ? Number(r.price) : null,
    prev_price:              r.prev_price != null ? Number(r.prev_price) : null,
    price_change:            r.price_change != null ? Number(r.price_change) : null,
    price_change_pct:        r.price_change_pct != null ? Number(r.price_change_pct) : null,

    season_avg,
    last_3_avg,
    last_5_avg,
    games_played:            r.games_played != null ? Number(r.games_played) : null,

    breakeven,
    edge_canonical:          r.edge_canonical != null ? Number(r.edge_canonical) : (r.edge != null ? Number(r.edge) : null),
    action_canonical:        (r.action_canonical as string) ?? (r.action as string) ?? (r.signal_tag as string) ?? (r.signal as string) ?? null,
    category_canonical:      (r.category_canonical as string) ?? (r.category as string) ?? null,
    confidence_label:        (r.confidence_label as string) ?? (
      r.confidence_score_100 != null
        ? Number(r.confidence_score_100) >= 67 ? "HIGH"
          : Number(r.confidence_score_100) >= 50 ? "MEDIUM"
          : "LOW"
        : r.projection_confidence != null
          ? Number(r.projection_confidence) >= 68 ? "HIGH"
            : Number(r.projection_confidence) >= 50 ? "MEDIUM"
            : "LOW"
          : null
    ),
    edge:                    r.edge != null ? Number(r.edge) : null,
    value_score,
    signal:                  (r.signal as string) ?? null,
    signal_display:          (r.signal_display as string) ?? null,
    category:                (r.category as string) ?? null,
    action:                  (r.action as string) ?? (r.signal_tag as string) ?? (r.signal as string) ?? null,

    why:                     (r.why as string) ?? null,
    why_long:                (r.why_long as string) ?? null,

    trend_signal:            (r.trend_signal as string) ?? null,
    trend_score,
    form_delta:              computedFormDelta,
    form_label:              (r.form_label as string) ?? null,

    status:                  (r.status as string) ?? null,
    manual_status:           (r.manual_status as string) ?? null,
    is_available:            r.is_available != null ? Boolean(r.is_available) : null,
    bye_round:               r.bye_round != null ? Number(r.bye_round) : null,
    is_bye:                  r.is_bye != null ? Boolean(r.is_bye) : null,
    bye_next_round:          r.bye_next_round != null ? Boolean(r.bye_next_round) : null,
    is_injured:              r.is_injured != null ? Boolean(r.is_injured) : (
      (['injured', 'out', 'omitted'].includes((r.status as string ?? '').toLowerCase()) ||
       ['injured', 'out', 'omitted'].includes((r.manual_status as string ?? '').toLowerCase()))
        ? true : false
    ),

    consistency:             r.consistency != null ? Number(r.consistency) : null,
    consistency_tier:        (r.consistency_tier as string) ?? null,
    recommendation_color:    (r.recommendation_color as string) ?? null,
    recommendation_strength: (r.recommendation_strength as string) ?? null,
    total_count:             r.total_count != null ? Number(r.total_count) : null,
    ai_updated_at:           (r.ai_updated_at as string) ?? null,
    cached_at:               (r.cached_at as string) ?? null,

    access_tier:             (r.access_tier as "premium" | "free" | "locked") ?? "locked",
    signal_tag:              (r.signal_tag as string) ?? null,

    action_display:          (r.action_display as string) ?? null,
    decision_score:          r.decision_score != null ? Number(r.decision_score) : null,
    confidence_score_100:    r.confidence_score_100 != null ? Number(r.confidence_score_100) : null,
    confidence_percentile:   r.confidence_percentile != null ? Number(r.confidence_percentile) : null,
    value_band:              (r.value_band as string) ?? null,
    action_reason_1:         (r.action_reason_1 as string) ?? null,
    action_reason_2:         (r.action_reason_2 as string) ?? null,
    confidence_reason_1:     (r.confidence_reason_1 as string) ?? null,
    confidence_reason_2:     (r.confidence_reason_2 as string) ?? null,
  };
}
