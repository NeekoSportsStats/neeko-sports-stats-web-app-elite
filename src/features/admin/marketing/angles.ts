import type { StatAngle, MarketingPlayer } from "./types";

const fmt = (n: number | null, suffix = "") =>
  n != null ? `${Math.round(Number(n))}${suffix}` : "—";
const fmtDec = (n: number | null, dp = 1, suffix = "") =>
  n != null ? `${Number(n).toFixed(dp)}${suffix}` : "—";
const fmtPrice = (n: number | null) =>
  n != null ? `$${(Number(n) / 1000).toFixed(0)}k` : "—";

export const STAT_ANGLES: StatAngle[] = [
  {
    id: "top_projections",
    label: "Top Projections",
    description: "Highest projected fantasy scores this round",
    orderBy: "projection_final",
    orderDir: "desc",
    keyStatLabel: "Projection",
    keyStatFn: (p) => fmt(p.projection_final, " pts"),
  },
  {
    id: "breakout_players",
    label: "Breakout Players",
    description: "High upside players primed for a big score",
    orderBy: "upside_rating",
    orderDir: "desc",
    keyStatLabel: "Upside",
    keyStatFn: (p) => fmtDec(p.upside_rating, 1, " / 10"),
    filterFn: (p) => (p.upside_rating ?? 0) >= 6,
  },
  {
    id: "underpriced",
    label: "Underpriced Players",
    description: "Best value relative to price",
    orderBy: "value_score",
    orderDir: "desc",
    keyStatLabel: "Value Score",
    keyStatFn: (p) => `${fmtDec(p.value_score, 1)} (${fmtPrice(p.price)})`,
    filterFn: (p) => p.price != null && p.price > 0,
  },
  {
    id: "highest_ceilings",
    label: "Highest Ceilings",
    description: "Players with the highest scoring ceilings",
    orderBy: "ceiling_estimate",
    orderDir: "desc",
    keyStatLabel: "Ceiling",
    keyStatFn: (p) => fmt(p.ceiling_estimate, " pts"),
  },
  {
    id: "safe_floor",
    label: "Safe Floor Players",
    description: "Most reliable minimum scores — low bust risk",
    orderBy: "floor_estimate",
    orderDir: "desc",
    keyStatLabel: "Floor",
    keyStatFn: (p) => fmt(p.floor_estimate, " pts"),
  },
  {
    id: "captain_picks",
    label: "Captain Picks",
    description: "Top captain selections by Neeko captain model",
    orderBy: "captain_score",
    orderDir: "desc",
    keyStatLabel: "Captain Score",
    keyStatFn: (p) => fmt(p.captain_score),
  },
  {
    id: "most_consistent",
    label: "Most Consistent",
    description: "Players who deliver steady scores every week",
    orderBy: "consistency_score",
    orderDir: "desc",
    keyStatLabel: "Consistency",
    keyStatFn: (p) => fmtDec(p.consistency_score, 0, "%"),
  },
  {
    id: "high_risk_reward",
    label: "High Risk / High Reward",
    description: "Boom-or-bust players with massive upside",
    orderBy: "risk_rating",
    orderDir: "desc",
    keyStatLabel: "Risk",
    keyStatFn: (p) =>
      `${fmtDec(p.risk_rating, 0)} risk | Ceil ${fmt(p.ceiling_estimate)}`,
  },
  {
    id: "best_value",
    label: "Best Value Picks",
    description: "Top scoring value across all price ranges",
    orderBy: "value_score",
    orderDir: "desc",
    keyStatLabel: "Value",
    keyStatFn: (p) => `${fmtDec(p.value_score, 1)} @ ${fmtPrice(p.price)}`,
  },
  {
    id: "form_players",
    label: "Form Players (Hot Streak)",
    description: "Players on fire — best recent form rating",
    orderBy: "form_rating",
    orderDir: "desc",
    keyStatLabel: "Form Rating",
    keyStatFn: (p) => fmtDec(p.form_rating, 0, " / 100"),
  },
  {
    id: "projection_risers",
    label: "Biggest Projection Risers",
    description: "Highest confidence projection with strong upside",
    orderBy: "projection_confidence",
    orderDir: "desc",
    keyStatLabel: "Confidence",
    keyStatFn: (p) =>
      `${fmtDec(p.projection_confidence, 0, "%")} conf | Proj ${fmt(p.projection_final)}`,
    filterFn: (p) => (p.projection_final ?? 0) > 80,
  },
  {
    id: "differential_picks",
    label: "Differential Picks",
    description: "Under-owned high-upside players to separate your team",
    orderBy: "upside_rating",
    orderDir: "desc",
    keyStatLabel: "Upside",
    keyStatFn: (p) => `${fmtDec(p.upside_rating, 1)} upside | ${fmtPrice(p.price)}`,
    filterFn: (p) =>
      (p.upside_rating ?? 0) >= 5 &&
      (p.risk_rating ?? 0) < 50 &&
      (p.price ?? 0) < 700000,
  },
  {
    id: "best_matchups",
    label: "Best Matchups",
    description: "Players with the best draw this round",
    orderBy: "matchup_rating",
    orderDir: "desc",
    keyStatLabel: "Matchup",
    keyStatFn: (p) => `${fmtDec(p.matchup_rating, 0)} / 100`,
  },
  {
    id: "worst_matchups",
    label: "Worst Matchups",
    description: "Players facing the toughest matchup this round — avoid",
    orderBy: "matchup_rating",
    orderDir: "asc",
    keyStatLabel: "Matchup",
    keyStatFn: (p) => `${fmtDec(p.matchup_rating, 0)} / 100 (tough)`,
  },
  {
    id: "rookie_watch",
    label: "Rookie Watch",
    description: "Cheapest players with emerging projections",
    orderBy: "value_score",
    orderDir: "desc",
    keyStatLabel: "Value @ Price",
    keyStatFn: (p) => `${fmtDec(p.value_score, 1)} @ ${fmtPrice(p.price)}`,
    filterFn: (p) => (p.price ?? 999999) < 350000,
  },
  {
    id: "trade_targets",
    label: "Trade Targets",
    description: "Players worth trading in — strong form + value combo",
    orderBy: "form_rating",
    orderDir: "desc",
    keyStatLabel: "Form + Value",
    keyStatFn: (p) =>
      `Form ${fmtDec(p.form_rating, 0)} | Val ${fmtDec(p.value_score, 1)}`,
    filterFn: (p) => (p.form_rating ?? 0) >= 60 && (p.value_score ?? 0) >= 5,
  },
  {
    id: "avoid_players",
    label: "Avoid Players",
    description: "High risk, poor form, tough matchup — leave on the bench",
    orderBy: "risk_rating",
    orderDir: "desc",
    keyStatLabel: "Risk + Matchup",
    keyStatFn: (p) =>
      `Risk ${fmtDec(p.risk_rating, 0)} | Matchup ${fmtDec(p.matchup_rating, 0)}`,
    filterFn: (p) =>
      (p.risk_rating ?? 0) >= 40 && (p.matchup_rating ?? 100) <= 40,
  },
  {
    id: "mid_priced_breakouts",
    label: "Mid-Priced Breakouts",
    description: "Premium upside at a mid-range price",
    orderBy: "upside_rating",
    orderDir: "desc",
    keyStatLabel: "Upside @ Price",
    keyStatFn: (p) => `${fmtDec(p.upside_rating, 1)} upside | ${fmtPrice(p.price)}`,
    filterFn: (p) =>
      (p.price ?? 0) >= 400000 &&
      (p.price ?? 999999) <= 700000 &&
      (p.upside_rating ?? 0) >= 5,
  },
  {
    id: "pod_picks",
    label: "POD Picks",
    description: "Point of difference selections — high ceiling, lower owned",
    orderBy: "ceiling_estimate",
    orderDir: "desc",
    keyStatLabel: "Ceiling",
    keyStatFn: (p) =>
      `Ceil ${fmt(p.ceiling_estimate)} | Risk ${fmtDec(p.risk_rating, 0)}`,
    filterFn: (p) =>
      (p.ceiling_estimate ?? 0) >= 110 && (p.price ?? 999999) < 750000,
  },
  {
    id: "fantasy_sleepers",
    label: "Fantasy Sleepers",
    description: "Under-the-radar players with elite projection confidence",
    orderBy: "projection_confidence",
    orderDir: "desc",
    keyStatLabel: "Confidence + Proj",
    keyStatFn: (p) =>
      `${fmtDec(p.projection_confidence, 0, "%")} conf | ${fmt(p.projection_final)} proj`,
    filterFn: (p) =>
      (p.projection_confidence ?? 0) >= 60 &&
      (p.projection_final ?? 0) >= 85 &&
      (p.price ?? 999999) < 700000,
  },
];
