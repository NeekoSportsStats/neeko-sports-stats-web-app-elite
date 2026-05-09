/**
 * Deterministic "Why this call" reason engine.
 *
 * Builds short, stat-backed explanations from numeric/label fields only.
 * Never reads: why, why_long, summary_short, summary_long, ai_summary,
 * recommendation_long, action_reason_1, action_reason_2.
 */

export type WhyContext =
  | "ranking"
  | "must_buy"
  | "trap_alert"
  | "captain"
  | "value_pick"
  | "market_watch"
  | "current_week"
  | "generic";

export interface StatWhyPlayer {
  player_name?: string | null;
  projection?: number | null;
  projection_final?: number | null;
  breakeven?: number | null;
  edge?: number | null;
  edge_canonical?: number | null;
  value_score?: number | null;
  trend_score?: number | null;
  form_delta?: number | null;
  form_label?: string | null;
  season_avg?: number | null;
  last_3_avg?: number | null;
  last_5_avg?: number | null;
  confidence_label?: string | null;
  risk_rating?: number | null;
  action_canonical?: string | null;
  signal_tag?: string | null;
  captain_score?: number | null;
  price?: number | null;
  price_change?: number | null;
  // trend/signal helpers
  trend_signal?: string | null;
  action_display?: string | null;
  action?: string | null;
}

// ─── Locked-row message ────────────────────────────────────────────────────────

export const LOCKED_WHY_TEXT =
  "Unlock Neeko+ to view the full stat reason and player profile.";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function proj(p: StatWhyPlayer): number | null {
  const v = p.projection_final ?? p.projection;
  return v != null ? Math.round(Number(v)) : null;
}

function edge(p: StatWhyPlayer): number | null {
  const v = p.edge_canonical ?? p.edge;
  return v != null ? Math.round(Number(v)) : null;
}

function be(p: StatWhyPlayer): number | null {
  return p.breakeven != null ? Math.round(Number(p.breakeven)) : null;
}

function l3(p: StatWhyPlayer): number | null {
  return p.last_3_avg != null ? Math.round(Number(p.last_3_avg)) : null;
}

function l5(p: StatWhyPlayer): number | null {
  return p.last_5_avg != null ? Math.round(Number(p.last_5_avg)) : null;
}

function avg(p: StatWhyPlayer): number | null {
  return p.season_avg != null ? Math.round(Number(p.season_avg)) : null;
}

function vs(p: StatWhyPlayer): number | null {
  return p.value_score != null ? Number(p.value_score) : null;
}

function ts(p: StatWhyPlayer): number | null {
  return p.trend_score != null ? Number(p.trend_score) : null;
}

function fd(p: StatWhyPlayer): number | null {
  return p.form_delta != null ? Number(p.form_delta) : null;
}

function conf(p: StatWhyPlayer): string {
  return (p.confidence_label ?? "").toUpperCase();
}

function action(p: StatWhyPlayer): string {
  return (
    p.action_canonical ??
    p.signal_tag ??
    p.action_display ??
    p.action ??
    ""
  ).toUpperCase();
}

function edgeSign(v: number): string {
  return v >= 0 ? `+${v}` : `${v}`;
}

// ─── Context builders ──────────────────────────────────────────────────────────

function buildRanking(p: StatWhyPlayer, act: string): string {
  const pr = proj(p);
  const eg = edge(p);
  const be_ = be(p);
  const l3_ = l3(p);
  const avg_ = avg(p);
  const ts_ = ts(p);
  const fd_ = fd(p);
  const vs_ = vs(p);

  if (act === "STRONG_START" || act === "SMASH_START") {
    if (pr != null && eg != null && eg >= 10) {
      return `Projects ${pr} with a ${edgeSign(eg)} edge over breakeven — strong output expected this round. ${l3_ != null ? `Recent form of ${l3_} supports the case.` : "Form and trend signals align positively."}`;
    }
    if (pr != null && l3_ != null && l3_ >= pr * 0.85) {
      return `Projects ${pr} this round, backed by recent form of ${l3_}. ${vs_ != null && vs_ > 0 ? `Value score of ${vs_.toFixed(1)} adds further appeal.` : "Model rates this as a strong start candidate."}`;
    }
    if (pr != null) {
      return `Projects ${pr} — model rates this as a strong start this round. ${ts_ != null && ts_ > 0 ? `Trend score of +${ts_.toFixed(0)} supports positive momentum.` : "Confidence and signal point upward."}`;
    }
    return "Strong positive edge across projection, trend and value signals. Model rates this as a top-start candidate this round.";
  }

  if (act === "START") {
    if (pr != null && be_ != null) {
      const gap = pr - be_;
      return `Projects ${pr} against a breakeven of ${be_} — ${gap >= 0 ? `a ${gap}-point buffer` : `${Math.abs(gap)} points short of breakeven`}. ${l3_ != null ? `Last 3 avg of ${l3_} supports the projection.` : "Form signals are broadly supportive."}`;
    }
    if (pr != null && avg_ != null) {
      return `Projects ${pr} — ${pr >= avg_ ? "at or above" : "slightly below"} the season average of ${avg_}. ${fd_ != null ? `Form delta of ${fd_ >= 0 ? "+" : ""}${fd_.toFixed(0)} points to ${fd_ >= 0 ? "improving" : "mixed"} output.` : "Model rates this as a viable start."}`;
    }
    if (pr != null) return `Projects ${pr} this round. ${ts_ != null ? `Trend score of ${edgeSign(ts_.toFixed(0) as unknown as number)} indicates ${ts_ >= 0 ? "positive" : "cautious"} momentum.` : "Model rates this as a start-able option."}`;
    return "Model rates this player as a start option this round based on available signals.";
  }

  if (act === "HOLD") {
    if (pr != null && be_ != null) {
      const gap = pr - be_;
      return `Projects ${pr} against a breakeven of ${be_} (${gap >= 0 ? `+${gap}` : gap} gap) — profile is balanced this round. ${vs_ != null ? `Value score of ${vs_.toFixed(1)} shows a ${vs_ >= 0 ? "slight positive" : "slight negative"}.` : "Mixed signals suggest monitoring before committing."}`;
    }
    if (pr != null && avg_ != null) {
      return `Projects ${pr} against a season average of ${avg_} — ${Math.abs(pr - avg_) <= 5 ? "broadly in line" : pr > avg_ ? "above average" : "below average"}. ${ts_ != null ? `Trend score of ${edgeSign(Math.round(ts_))} suggests ${ts_ >= 0 ? "stable to improving" : "some softening"} form.` : "Hold recommended while signals clarify."}`;
    }
    return "Balanced profile with no dominant signal this round. Trend and value sit in neutral territory — hold and monitor.";
  }

  if (act === "SIT" || act === "HARD_SIT") {
    if (pr != null && be_ != null && pr < be_) {
      return `Projects ${pr} against a breakeven of ${be_} — ${be_ - pr} points short. ${eg != null && eg < 0 ? `Edge of ${eg} flags downside risk.` : "Downside risk is elevated this round."}`;
    }
    if (eg != null && eg < -10) {
      return `Edge of ${eg} flags meaningful underperformance risk. ${pr != null ? `Projection of ${pr} sits well below baseline expectations.` : "Model suggests sitting this round."}`;
    }
    if (ts_ != null && ts_ <= -8) {
      return `Trend score of ${ts_.toFixed(0)} points to declining output momentum. ${pr != null && avg_ != null ? `Projects ${pr} against a season average of ${avg_} — consider alternatives.` : "Form and trend signals both point downward."}`;
    }
    if (pr != null && avg_ != null && pr < avg_ - 5) {
      return `Projects ${pr} below the season average of ${avg_} — regression risk this round. ${p.risk_rating != null && p.risk_rating >= 60 ? `Risk rating of ${Math.round(p.risk_rating)} adds further caution.` : "Model flags this as a sit candidate."}`;
    }
    return "Negative edge across projection, trend or value signals this round. Model suggests sitting or seeking alternatives.";
  }

  // fallback
  if (pr != null && ts_ != null) {
    const sign = ts_ >= 0 ? "+" : "";
    return `Projects ${pr} with a trend of ${sign}${ts_.toFixed(0)} versus average. Monitor matchup and conditions before deciding.`;
  }
  if (pr != null) return `Projects ${pr} this round — neutral signal, monitor before committing.`;
  return "Insufficient data to generate a stat reason for this player this round.";
}

function buildCaptain(p: StatWhyPlayer): string {
  const pr = proj(p);
  const cs = p.captain_score != null ? Number(p.captain_score) : null;
  const l3_ = l3(p);
  const l5_ = l5(p);
  const c = conf(p);
  const eg = edge(p);

  if (pr != null && cs != null && cs >= 8) {
    return `Projects ${pr} with a captain score of ${cs.toFixed(0)} — top-end ceiling candidate this round. ${l3_ != null ? `Last 3 avg of ${l3_} supports consistent output.` : c === "HIGH" ? "High model confidence backs this selection." : "Model rates this as a strong captain play."}`;
  }
  if (pr != null && c === "HIGH") {
    return `Projects ${pr} with high model confidence — well-suited for captaincy this round. ${eg != null && eg >= 10 ? `Edge of ${edgeSign(eg)} over breakeven strengthens the case.` : l3_ != null ? `Recent form of ${l3_} supports the selection.` : "Confidence and projection both point upward."}`;
  }
  if (pr != null && l3_ != null && l3_ >= pr * 0.9) {
    return `Projects ${pr} backed by a last-3 average of ${l3_} — consistent output supports captaincy consideration. ${l5_ != null ? `Five-game average of ${l5_} reinforces the profile.` : "Form signals are broadly positive."}`;
  }
  if (pr != null) {
    return `Projects ${pr} this round — a viable captain option. ${cs != null ? `Captain score of ${cs.toFixed(0)} supports the selection.` : c !== "" ? `${c.charAt(0) + c.slice(1).toLowerCase()} confidence in the projection.` : "Monitor for final confirmation."}`;
  }
  return "Captain score and recent form both support this selection. Projection and confidence signals are broadly positive.";
}

function buildTrapAlert(p: StatWhyPlayer): string {
  const pr = proj(p);
  const be_ = be(p);
  const eg = edge(p);
  const ts_ = ts(p);
  const fd_ = fd(p);
  const risk = p.risk_rating != null ? Math.round(Number(p.risk_rating)) : null;
  const c = conf(p);

  if (eg != null && eg < -10) {
    return `Edge of ${eg} flags significant underperformance risk — this player projects well below breakeven. ${risk != null ? `Risk rating of ${risk} compounds the concern.` : "Downside risk is elevated this round."}`;
  }
  if (pr != null && be_ != null && pr < be_) {
    return `Projects ${pr} against a breakeven of ${be_} — ${be_ - pr} points short, pointing to potential price decline. ${fd_ != null && fd_ < 0 ? `Form delta of ${fd_.toFixed(0)} adds further concern.` : "Suggest monitoring or avoiding this round."}`;
  }
  if (risk != null && risk >= 70) {
    return `Risk rating of ${risk} flags elevated volatility this round. ${c === "LOW" ? "Low model confidence compounds the concern." : ts_ != null && ts_ < 0 ? `Trend score of ${ts_.toFixed(0)} supports a cautious stance.` : "Downside exposure is above average."}`;
  }
  if (ts_ != null && ts_ <= -8) {
    return `Trend score of ${ts_.toFixed(0)} points to declining output momentum — form is softening. ${pr != null ? `Projects ${pr} this round — below expectations.` : "Consider alternatives this week."}`;
  }
  if (fd_ != null && fd_ < -5) {
    return `Form delta of ${fd_.toFixed(0)} flags a sustained dip in scoring output. ${pr != null && be_ != null ? `Projection of ${pr} sits ${pr < be_ ? "below" : "near"} the breakeven of ${be_}.` : "Proceed with caution this round."}`;
  }
  return "Negative edge, declining trend or elevated risk flags this player as a potential trap this round. Consider alternatives.";
}

function buildValuePick(p: StatWhyPlayer): string {
  const pr = proj(p);
  const be_ = be(p);
  const eg = edge(p);
  const vs_ = vs(p);
  const l3_ = l3(p);
  const prc = p.price != null ? Number(p.price) : null;
  const pc = p.price_change != null ? Number(p.price_change) : null;

  if (vs_ != null && vs_ >= 2 && pr != null) {
    return `Value score of ${vs_.toFixed(1)} suggests this player is underpriced relative to projected output of ${pr}. ${eg != null && eg >= 5 ? `Edge of ${edgeSign(eg)} over breakeven reinforces the case.` : l3_ != null ? `Last 3 avg of ${l3_} adds form support.` : "Model rates this as a strong value opportunity."}`;
  }
  if (pr != null && be_ != null && pr > be_) {
    const gap = pr - be_;
    return `Projects ${pr} against a breakeven of ${be_} — a ${gap}-point buffer. ${prc != null ? `Priced at $${Math.round(prc / 1000)}K, this represents solid value at current pricing.` : vs_ != null ? `Value score of ${vs_.toFixed(1)} confirms the pricing edge.` : "Model rates this as value at current price."}`;
  }
  if (pc != null && pc < -10000 && pr != null) {
    return `Price has dropped, lowering the breakeven requirement. ${pr != null && be_ != null ? `Projects ${pr} against a new breakeven of ${be_} — ${pr > be_ ? "projection clears the bar." : "monitor for further price movement."}` : "Projects ${pr} — lower price improves the value case."}`;
  }
  if (eg != null && eg >= 5) {
    return `Edge of ${edgeSign(eg)} over breakeven suggests value relative to current price. ${vs_ != null ? `Value score of ${vs_.toFixed(1)} supports the assessment.` : pr != null ? `Projects ${pr} this round.` : "Model rates this as a value option."}`;
  }
  return "Projection sits above or near breakeven at current pricing — value profile is broadly positive this round.";
}

function buildMustBuy(p: StatWhyPlayer): string {
  const pr = proj(p);
  const eg = edge(p);
  const vs_ = vs(p);
  const l3_ = l3(p);
  const ts_ = ts(p);
  const be_ = be(p);

  if (pr != null && eg != null && eg >= 15) {
    return `Projects ${pr} with a ${edgeSign(eg)}-point edge over breakeven — one of the strongest value positions this round. ${l3_ != null ? `Last 3 avg of ${l3_} confirms consistent form.` : "Projection, value and trend all point upward."}`;
  }
  if (vs_ != null && vs_ >= 3 && pr != null) {
    return `Value score of ${vs_.toFixed(1)} combined with a projection of ${pr} points to a strong output profile. ${ts_ != null && ts_ > 0 ? `Trend score of +${ts_.toFixed(0)} further supports the case.` : be_ != null ? `Projects ${pr} against a breakeven of ${be_}.` : "Model flags this as a top-value option this round."}`;
  }
  if (pr != null && l3_ != null && ts_ != null && ts_ > 5) {
    return `Projects ${pr} with a trend score of +${ts_.toFixed(0)} — form is building. ${l3_ != null ? `Last 3 avg of ${l3_} supports continued output.` : "Model rates this as a strong week to target."}`;
  }
  return buildRanking(p, "STRONG_START");
}

function buildMarketWatch(p: StatWhyPlayer): string {
  const pr = proj(p);
  const eg = edge(p);
  const be_ = be(p);
  const vs_ = vs(p);
  const act = action(p);
  const ts_ = ts(p);
  const pc = p.price_change != null ? Number(p.price_change) : null;

  if (act === "STRONG_START" || act === "SMASH_START") {
    if (pr != null && eg != null) {
      return `Projects ${pr} with a ${edgeSign(eg)}-point edge — strong signal this round.`;
    }
    return `Strong positive edge across projection and trend signals.`;
  }
  if (act === "START") {
    if (pr != null && be_ != null) {
      return `Projects ${pr} against breakeven of ${be_} — ${pr > be_ ? "clears the bar" : "near breakeven"}. ${vs_ != null ? `Value score: ${vs_.toFixed(1)}.` : ""}`.trim();
    }
    if (pr != null) return `Projects ${pr} — model rates this as a start option. ${ts_ != null ? `Trend: ${ts_ >= 0 ? "+" : ""}${ts_.toFixed(0)}.` : ""}`.trim();
    return "Positive edge and trend signals support a start this round.";
  }
  if (act === "SIT" || act === "HARD_SIT") {
    if (eg != null && eg < 0) {
      return `Edge of ${eg} flags underperformance risk. ${be_ != null && pr != null ? `Projects ${pr} vs breakeven of ${be_}.` : "Downside risk elevated."}`.trim();
    }
    return "Negative signal — projection sits below or near breakeven this round.";
  }
  if (pc != null && Math.abs(pc) >= 10000) {
    const dir = pc > 0 ? "rising" : "falling";
    return `Price is ${dir} — ${vs_ != null ? `value score of ${vs_.toFixed(1)} relative to projection of ${pr ?? "—"}.` : `projection of ${pr ?? "—"} against breakeven of ${be_ ?? "—"}.`}`.trim();
  }
  // Neutral / hold
  if (pr != null && eg != null) {
    return `Projects ${pr} with edge of ${edgeSign(eg)}. ${vs_ != null ? `Value score: ${vs_.toFixed(1)}.` : "Monitor before committing."}`.trim();
  }
  return `Projects ${pr ?? "—"} — neutral signal, monitor matchup and conditions.`;
}

function buildCurrentWeek(p: StatWhyPlayer): string {
  return buildRanking(p, action(p) || "HOLD");
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function buildStatGeneratedWhy(
  player: StatWhyPlayer,
  context: WhyContext
): string {
  const act = action(player);

  switch (context) {
    case "captain":      return buildCaptain(player);
    case "trap_alert":   return buildTrapAlert(player);
    case "value_pick":   return buildValuePick(player);
    case "must_buy":     return buildMustBuy(player);
    case "market_watch": return buildMarketWatch(player);
    case "current_week": return buildCurrentWeek(player);
    case "ranking":      return buildRanking(player, act || "HOLD");
    case "generic":
    default:             return buildRanking(player, act || "HOLD");
  }
}
