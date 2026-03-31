/*
  # Fix 4 + 6 — Declare canonical projection source and document the pipeline

  Adds documentation comments to identify the canonical projection view and
  explain the full 8-step pipeline for future developers and auditors.
*/

COMMENT ON VIEW afl.v_neeko_player_projection_final IS
'CANONICAL PROJECTION SOURCE — this view produces the final Neeko projection_final
used across rankings, AI insights, start/sit, edge board, and all admin tools.

Neeko Projection Pipeline (8 steps):

1. NORMALISE HISTORY (v_neeko_player_recent_games)
   Each historical game score is divided by the opponent matchup multiplier
   so all rolling averages are measured in opponent-adjusted units.
   normalised_score = raw_fantasy_pts / matchup_multiplier[opponent, position]

2. ROLLING AVERAGES (v_neeko_player_projection — rolling CTE)
   Computed on normalised scores over the last 15 games:
   - avg_last_5, avg_last_10, avg_last_15
   - weighted_recent_avg (exponential decay: row1=1.0, row2=0.9 ... rows11-15=0.15)
   - floor_estimate (p10 of raw pts), ceiling_estimate (p90 of raw pts)
   - volatility_last_15 (stddev_pop of normalised scores)

3. ROLLING BLEND (projections CTE)
   rolling_projection = 0.40*avg_last_5 + 0.30*weighted_recent + 0.20*avg_last_15 + 0.10*season_avg

4. SEASON-CONTEXT GATING (blended CTE)
   Gates how much of the 2026 rolling data is trusted vs the 2025 baseline:
   0 games  → baseline_avg_2025 only
   1-5 games  → 70% rolling + 30% baseline
   6-10 games → 85% rolling + 15% baseline
   11+ games  → rolling only
   Output column: final_projection

5. TREND + MATCHUP + CEILING BONUS (v_neeko_player_projection_final — staged CTE)
   trend_3_vs_10     = avg_last_3 - avg_last_10 (form direction signal)
   matchup_delta_pos = (matchup_multiplier_next_opponent - 1.0) * final_projection * 0.40
   upside_bonus      = IF trend > 0: (ceiling - final_projection) * 0.08 ELSE 0
   projection_raw    = final_projection + trend*0.18 + matchup_delta + upside_bonus

6. REGRESSION TO POSITION MEAN (regressed CTE)
   projection_intermediate = projection_raw * 0.92 + position_avg_pts * 0.08
   Prevents extreme outliers by anchoring 8% to the positional average.

7. CONSISTENCY MULTIPLIER (final_calc CTE)
   consistency_score = PERCENT_RANK() OVER (ORDER BY volatility_last_15 DESC) * 100
   High consistency_score = low volatility = stable player.
   multiplier = CLAMP(1 + (consistency_score - 50) / 400, 0.875, 1.125)
   Range: -12.5% for most volatile, +12.5% for most consistent.

8. OUTPUT
   projection_final = projection_intermediate * consistency_multiplier
   This is the canonical column consumed by all frontend views and RPCs.';


COMMENT ON VIEW afl.v_neeko_player_projection IS
'CORE PROJECTION ENGINE — computes rolling averages, season-context gating, and
final_projection for all players. Consumed exclusively by v_neeko_player_projection_final.
Do not query this view directly in frontend code — use v_neeko_player_projection_final
or the public.v_rankings_* layer above it.';


COMMENT ON VIEW public.v_rankings_canonical IS
'CANONICAL RANKINGS VIEW — the final public-facing rankings view consumed by
get_rankings_free() and get_rankings_premium() RPCs. Adds AI text overlays
(ai_summary, ai_recommendation) to the ranked player data.
Source chain: v_neeko_player_projection_final → v_player_detail_premium →
v_rankings_premium → v_rankings_master → v_rankings_with_value → v_rankings_canonical.';


COMMENT ON VIEW public.v_rankings_with_value IS
'Extends v_rankings_master with price, value_score, and unified percentile-rank
value tiers. Value tiers use PERCENT_RANK() over value_score for consistency
across all consumers (rankings page, admin tools, marketing dashboards).
Tiers: ELITE VALUE (top 10%), GOOD VALUE (next 20%), FAIR VALUE (next 30%), POOR VALUE (bottom 40%).';
