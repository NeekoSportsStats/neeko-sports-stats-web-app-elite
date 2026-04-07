import { normalisePosition } from "./helpers";
import type { RankingRow } from "./types";

export function mapRankingRow(r: Record<string, unknown>): RankingRow {
  const projection = r.projection != null ? Number(r.projection) : null;

  return {
    player_id:               (r.player_id as string) ?? null,
    player_name:             (r.player_name as string) ?? "",
    team:                    (r.team as string) ?? "",
    team_name:               (r.team_name as string) ?? null,
    position:                normalisePosition((r.player_position) as string | null),
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

    season_avg:              r.season_avg != null ? Number(r.season_avg) : null,
    last_3_avg:              r.last_3_avg != null ? Number(r.last_3_avg) : null,
    last_5_avg:              r.last_5_avg != null ? Number(r.last_5_avg) : null,
    games_played:            r.games_played != null ? Number(r.games_played) : null,

    breakeven:               r.breakeven != null ? Number(r.breakeven) : null,
    edge:                    r.edge != null ? Number(r.edge) : null,
    value_score:             r.value_score != null ? Number(r.value_score) : null,
    signal:                  (r.signal as string) ?? null,
    signal_display:          (r.signal_display as string) ?? null,
    category:                (r.category as string) ?? null,
    action:                  (r.action_canonical as string) ?? (r.signal_tag as string) ?? (r.signal as string) ?? null,

    why:                     (r.why as string) ?? null,
    why_long:                (r.why_long as string) ?? null,

    trend_signal:            (r.trend_signal as string) ?? null,
    trend_score:             r.trend_score != null ? Number(r.trend_score) : null,
    form_delta:              r.form_delta != null ? Number(r.form_delta) : null,
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
  };
}
