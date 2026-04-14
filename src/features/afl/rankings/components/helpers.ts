import { RankingRow, RankingsTab, SortKey, PositionFilter } from "./types";
import { cleanAiText } from "../../../../utils/cleanAiText";
import { signalFromField, formatEdgeSignalLabel, getEdgeSignalStyles, getEdgeSignalColor } from "../../../../utils/aflEdgeSignal";
export { formatEdgeSignalLabel, getEdgeSignalStyles, getEdgeSignalColor };

// ─── Recommendation label guardrails ─────────────────────────────────────────
// Captain-tier labels require minimum projection and confidence thresholds.
// Below these, use value-oriented labels instead.
export const CAPTAIN_MIN_PROJECTION = 85;
export const CAPTAIN_MIN_CONFIDENCE = 55;
export const VALUE_TAB_LABELS: Record<string, string> = {
  "Elite Captain": "Upgrade Target",
  "Strong Captain": "Best Cash Saver",
  "Captain Option": "Speculative Value",
};

const TREND_LABEL_MAP: Record<string, string> = {
  STRONG_UP:    "Elite Upside",
  UP:           "Rising",
  STABLE:       "Stable",
  DOWN:         "Falling",
  STRONG_DOWN:  "Major Drop",
};

export function getTrendLabel(trendSignal: string | null): string {
  if (!trendSignal) return "—";
  return TREND_LABEL_MAP[trendSignal.toUpperCase()] ?? trendSignal;
}

export function getTrendStyles(trendSignal: string | null): string {
  if (!trendSignal) return "text-white/30 border-white/10 bg-white/5";
  const s = trendSignal.toUpperCase();
  if (s === "STRONG_UP")   return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  if (s === "UP")          return "text-green-400 border-green-500/25 bg-green-500/8";
  if (s === "STABLE")      return "text-white/55 border-white/10 bg-white/5";
  if (s === "DOWN")        return "text-orange-400 border-orange-500/25 bg-orange-500/10";
  if (s === "STRONG_DOWN") return "text-red-400 border-red-500/30 bg-red-500/10";
  return "text-white/40 border-white/10 bg-white/5";
}

export function getDisplayRecommendation(row: RankingRow, _tab: RankingsTab): string | null {
  return getDisplayTrend(row);
}

export function getDisplayTrend(row: RankingRow): string | null {
  if (row.trend_signal) return row.trend_signal;
  const sig = (row.signal_tag ?? row.action ?? row.signal ?? "").toUpperCase();
  if (sig === "STRONG_START") return "STRONG_UP";
  if (sig === "START")        return "UP";
  if (sig === "HOLD")         return "STABLE";
  if (sig === "SIT")          return "DOWN";
  if (sig === "STRONG_SIT")   return "STRONG_DOWN";
  return null;
}

export function getTrendWhyText(row: RankingRow): string {
  const ts = row.trend_score;
  if (ts == null) return row.projection != null ? "Projection available — trend data updating." : "Data updating.";
  if (ts >= 12) return "Model projects well above baseline — strong breakout signal.";
  if (ts >= 5)  return "Projecting above baseline — positive forward outlook.";
  if (ts >= -3) return "Projection aligned with baseline — steady performer.";
  if (ts >= -10) return "Projecting below baseline — possible regression this round.";
  return "Model projects well below baseline — high regression risk.";
}

// ─── Form helpers (backward-looking: recent vs season average) ────────────────

export function getFormLabel(formLabel: string | null): string {
  if (!formLabel) return "—";
  return formLabel;
}

export function getFormStyles(formLabel: string | null): string {
  if (!formLabel) return "text-white/30 border-white/10 bg-white/5";
  const s = formLabel.toUpperCase().replace(/ /g, "_");
  if (s === "HOT")                            return "text-orange-300 border-orange-500/30 bg-orange-500/10";
  if (s === "RISING" || s === "IN_FORM" || s === "IN FORM") return "text-green-400 border-green-500/25 bg-green-500/8";
  if (s === "NEUTRAL" || s === "STABLE" || s === "NORMAL")  return "text-white/45 border-white/10 bg-white/5";
  if (s === "DROPPING" || s === "COLD")       return "text-sky-400 border-sky-500/25 bg-sky-500/8";
  if (s === "ICE_COLD" || s === "ICE COLD")   return "text-sky-300 border-sky-400/30 bg-sky-500/10";
  return "text-white/40 border-white/10 bg-white/5";
}

export function deriveEdgeConfidence(edge: number | null): "HIGH" | "HIGH_NEG" | "MEDIUM" | "LOW" {
  if (edge == null) return "LOW";
  if (edge >= 20)  return "HIGH";
  if (edge <= -20) return "HIGH_NEG";
  if (Math.abs(edge) >= 10) return "MEDIUM";
  return "LOW";
}

export function getEdgeConfidenceStyles(conf: "HIGH" | "HIGH_NEG" | "MEDIUM" | "LOW"): string {
  if (conf === "HIGH")     return "text-emerald-400 border-emerald-500/25 bg-emerald-500/8";
  if (conf === "HIGH_NEG") return "text-red-400 border-red-500/25 bg-red-500/8";
  if (conf === "MEDIUM")   return "text-[#F5C84C] border-[#F5C84C]/20 bg-[#F5C84C]/8";
  return "text-white/30 border-white/10 bg-white/5";
}

export function getTrendAction(trendSignal: string | null): string | null {
  if (!trendSignal) return null;
  const s = trendSignal.toUpperCase();
  if (s === "STRONG_UP" || s === "UP") return "START";
  if (s === "STABLE") return "HOLD";
  if (s === "DOWN" || s === "STRONG_DOWN") return "SIT";
  return null;
}

export function getTrendActionStyles(trendSignal: string | null): string {
  const action = getTrendAction(trendSignal);
  if (!action) return "text-white/30 border-white/10 bg-white/5";
  if (action === "START") return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  if (action === "HOLD")  return "text-white/55 border-white/15 bg-white/5";
  if (action === "SIT")   return "text-orange-400 border-orange-500/25 bg-orange-500/10";
  return "text-white/30 border-white/10 bg-white/5";
}

// ─── Matchup display helper ───────────────────────────────────────────────────
// DB stores matchup_rating as a decimal multiplier string e.g. "1.023", "0.912", "1.0"
// We convert to a signed percentage label: +2.3%, -8.8%, Neutral

export function fmtMatchup(v: string | number | null): string {
  if (v == null) return "—";

  if (typeof v === "string") {
    const u = v.trim().toUpperCase();
    if (u === "ELITE") return "Elite";
    if (u === "FAVOURABLE") return "Favourable";
    if (u === "NEUTRAL") return "Neutral";
    if (u === "TOUGH") return "Tough";
    if (u === "DIFFICULT") return "Difficult";
    if (u === "BRUTAL") return "Brutal";
    if (u === "—" || u === "") return "—";
  }

  const num = Number(v);
  if (isNaN(num)) return String(v);

  if (num >= 0.8 && num <= 1.2) {
    const pct = (num - 1) * 100;
    if (Math.abs(pct) < 0.5) return "Neutral";
    return `${pct > 0 ? "+" : ""}${Math.round(pct)}%`;
  }

  return Math.round(num).toString();
}

// ─── Position normalisation ───────────────────────────────────────────────────

const POSITION_MAP: Record<string, PositionFilter> = {
  DEF: "DEF", DEFENDER: "DEF",
  MID: "MID", MIDFIELDER: "MID",
  FWD: "FWD", FORWARD: "FWD",
  RUC: "RUC", RUCK: "RUC",
};

export function normalisePosition(raw: string | null): string | null {
  if (!raw) return null;
  return POSITION_MAP[raw.trim().toUpperCase()] ?? raw;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function fmt(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return n.toFixed(decimals);
}

export function fmtInt(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return Math.round(n).toString();
}

export function fmtPrice(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";

  if (n >= 1_000_000) {
    // >= 1M → 1.126M (3 decimal places)
    return `$${(n / 1_000_000).toFixed(3)}M`;
  }

  // < 1M → 853K (no decimals)
  return `$${Math.floor(n / 1000)}K`;
}

export function fmtPriceChange(change: number | null | undefined): string {
  if (change == null || change === 0) return "";
  const n = Number(change);
  if (isNaN(n)) return "";

  const abs = Math.abs(n);
  let formatted: string;

  if (abs >= 1_000_000) {
    formatted = `${(abs / 1_000_000).toFixed(3)}M`;
  } else {
    formatted = `${Math.floor(abs / 1000)}K`;
  }

  return `${n > 0 ? "+" : "-"}$${formatted}`;
}

export function fmtValueScore(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return n.toFixed(2);
}

export function getValueScoreLabel(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  if (n >= 1.2)  return "Elite Value";
  if (n >= 1.05) return "Strong Value";
  if (n >= 0.95) return "Fair Value";
  return "Poor Value";
}

export function fmtUpdatedAt(ts: string | null): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleString("en-AU", { timeZone: "Australia/Melbourne", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
}

// ─── Color helpers ─────────────────────────────────────────────────────────────

export function getFormColor(v: number | null): string {
  if (v == null) return "text-white/30";
  if (v >= 85) return "text-green-400";
  if (v >= 70) return "text-emerald-400";
  if (v >= 55) return "text-white/60";
  if (v >= 40) return "text-orange-400";
  return "text-red-400";
}

export function getFormScoreColor(v: number | null): string {
  if (v == null) return "text-white/30";
  if (v > 80) return "text-green-400";
  if (v >= 60) return "text-white/60";
  return "text-red-400";
}

export function getMatchupColor(v: number | string | null): string {
  if (v == null) return "text-white/30";
  if (typeof v === "string") {
    const u = v.toUpperCase();
    if (u.includes("ELITE")) return "text-green-400";
    if (u === "FAVOURABLE") return "text-emerald-400";
    if (u === "NEUTRAL") return "text-white/50";
    if (u === "DIFFICULT") return "text-orange-400";
    if (u === "TOUGH") return "text-orange-400";
    if (u === "BRUTAL") return "text-red-400";
    return "text-white/40";
  }
  if (v >= 85) return "text-green-400";
  if (v >= 70) return "text-emerald-400";
  if (v >= 55) return "text-white/60";
  if (v >= 40) return "text-orange-400";
  return "text-red-400";
}

export function getUpsideColor(v: number | null): string {
  if (v == null) return "text-white/30";
  if (v >= 30) return "text-green-400";
  if (v >= 20) return "text-emerald-400";
  if (v >= 10) return "text-yellow-400";
  return "text-white/50";
}

export function getRiskColor(v: number | null): string {
  if (v == null) return "text-white/30";
  if (v <= 25) return "text-green-400";
  if (v <= 40) return "text-emerald-400";
  if (v <= 60) return "text-orange-400";
  return "text-red-400";
}

export function getConfidenceColor(v: number | null): string {
  if (v == null) return "text-white/30";
  if (v >= 80) return "text-green-400";
  if (v >= 70) return "text-emerald-400";
  if (v >= 60) return "text-yellow-400";
  if (v >= 50) return "text-orange-400";
  return "text-red-400";
}

export function getConfidenceLabel(v: number | null): string {
  if (v == null) return "—";
  if (v >= 86) return "Elite Safety";
  if (v >= 78) return "Strong";
  if (v >= 70) return "Solid";
  if (v >= 62) return "Moderate Risk";
  return "Volatile";
}

export function getConfidenceLabelColor(v: number | null): string {
  if (v == null) return "text-white/25 border-white/10 bg-white/5";
  if (v >= 86) return "text-green-400 border-green-500/30 bg-green-500/10";
  if (v >= 78) return "text-emerald-400 border-emerald-500/25 bg-emerald-500/8";
  if (v >= 70) return "text-yellow-400 border-yellow-500/25 bg-yellow-500/8";
  if (v >= 62) return "text-orange-400 border-orange-500/25 bg-orange-500/8";
  return "text-red-400 border-red-500/25 bg-red-500/8";
}

/**
 * Pass-through display confidence from the model pipeline.
 * projection_confidence in the DB already has real variance (35–95) driven
 * by the projection engine. Display it directly — no remapping, no clamping.
 * Normalises 0–1 fractional values to 0–100 for legacy DB rows only.
 */
export function normaliseConfidence(
  rawConf: number | null,
  _consistencyScore: number | null,
  _riskRating: number | null,
  _rank: number,
): number | null {
  if (rawConf == null) return null;
  const conf = rawConf <= 1 ? Math.round(rawConf * 100) : Math.round(rawConf);
  return Math.max(0, Math.min(100, conf));
}

export function getValueScoreColor(v: number | null): string {
  if (v == null) return "text-white/30";
  if (v >= 1.2)  return "text-green-400";
  if (v >= 1.05) return "text-[#F5C84C]";
  if (v >= 0.95) return "text-white/50";
  return "text-red-400";
}

export function getConsistencyBadge(score: number | null) {
  if (score == null) return { label: "—", className: "text-white/30" };
  if (score >= 75) return { label: "Elite", className: "text-green-400" };
  if (score >= 60) return { label: "Reliable", className: "text-yellow-400" };
  if (score >= 40) return { label: "Volatile", className: "text-orange-400" };
  return { label: "High Risk", className: "text-red-400" };
}

export function getCaptainStyle(rating: string | null) {
  if (!rating) return { text: "text-white/30", bg: "bg-white/5", border: "border-white/10", icon: "" };
  if (rating === "Elite Captain") return { text: "text-yellow-200", bg: "bg-yellow-400/10", border: "border-yellow-400/40", icon: "👑" };
  if (rating === "Strong Captain") return { text: "text-emerald-300", bg: "bg-emerald-400/10", border: "border-emerald-400/30", icon: "⭐" };
  if (rating === "Captain Option") return { text: "text-white/70", bg: "bg-white/5", border: "border-white/10", icon: "✔" };
  return { text: "text-orange-300", bg: "bg-orange-400/10", border: "border-orange-400/30", icon: "⚠" };
}

export function getValueTagStyle(tag: string | null | undefined) {
  if (!tag) return { text: "text-white/30", bg: "bg-white/5", border: "border-white/10" };
  const t = tag.toUpperCase();
  if (t.includes("ELITE")) return { text: "text-green-300", bg: "bg-green-500/10", border: "border-green-500/30" };
  if (t.includes("STRONG")) return { text: "text-[#F5C84C]", bg: "bg-[#F5C84C]/10", border: "border-[#F5C84C]/30" };
  if (t.includes("GOOD")) return { text: "text-[#F5C84C]", bg: "bg-[#F5C84C]/10", border: "border-[#F5C84C]/30" };
  if (t.includes("SOLID") || t.includes("FAIR") || t.includes("AVERAGE")) return { text: "text-white/50", bg: "bg-white/5", border: "border-white/10" };
  if (t.includes("LOW")) return { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" };
  if (t.includes("OVERPRICED") || t.includes("TRAP") || t.includes("SELL")) return { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" };
  return { text: "text-white/40", bg: "bg-white/5", border: "border-white/10" };
}

export function getNeekoRatingBadge(rating: number | null) {
  if (rating == null) return { label: "—", text: "text-white/30", bg: "bg-transparent", border: "border-transparent", glow: "" };
  if (rating >= 90) return { label: "ELITE",  text: "text-yellow-400", bg: "bg-yellow-400/15", border: "border-yellow-400/40", glow: "drop-shadow(0 0 6px rgba(250,204,21,0.55))" };
  if (rating >= 75) return { label: "STRONG", text: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30",  glow: "drop-shadow(0 0 5px rgba(74,222,128,0.45))" };
  if (rating >= 60) return { label: "SOLID",  text: "text-white/70",   bg: "bg-white/5",   border: "border-white/10",   glow: "" };
  if (rating >= 45) return { label: "WATCH",  text: "text-gray-300",   bg: "bg-white/5",       border: "border-white/15",      glow: "" };
  return                   { label: "RISK",   text: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30",    glow: "" };
}

export function getRiskBadge(risk: number | null) {
  if (risk == null) return { label: "—", text: "text-white/30", bg: "bg-transparent", border: "border-transparent" };
  if (risk >= 75) return { label: "EXTREME", text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" };
  if (risk >= 55) return { label: "HIGH RISK", text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" };
  if (risk >= 38) return { label: "ELEVATED", text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" };
  if (risk >= 22) return { label: "MODERATE", text: "text-gray-300", bg: "bg-white/5", border: "border-white/15" };
  return { label: "LOW RISK", text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30" };
}

// ─── Stale AI text detector ──────────────────────────────────────────────────

export function isAITextStale(
  text: string | null | undefined,
  row: { projection?: number | null; ceiling_estimate?: number | null; floor_estimate?: number | null }
): boolean {
  if (!text) return false;
  const nums = [...text.matchAll(/\b(\d{2,3}(?:\.\d)?)\b/g)].map((m) => parseFloat(m[1]));
  if (!nums.length) return false;
  const fields = [row.projection, row.ceiling_estimate, row.floor_estimate].filter((v) => v != null) as number[];
  if (!fields.length) return false;
  let mismatches = 0;
  for (const n of nums) {
    if (n < 50 || n > 250) continue;
    const isClose = fields.some((f) => Math.abs(f - n) <= 5);
    if (!isClose) mismatches++;
  }
  return mismatches >= 2;
}

// ─── AI tone sharpener ────────────────────────────────────────────────────────

const AI_REPLACEMENTS: [RegExp, string][] = [
  [/poised for a strong opening round/gi, "Strong start expected."],
  [/may perform well/gi, "Strong output likely."],
  [/suggest that while he can/gi, "Ceiling is real, but"],
  [/should perform well/gi, "Strong play expected."],
  [/could be a strong option/gi, "Solid captain option."],
  [/is likely to have a good game/gi, "Good game expected."],
  [/presents as a strong captain option/gi, "Elite captain option."],
  [/is a strong captain option/gi, "Elite captain option."],
  [/could see reduced/gi, "Risk of reduced"],
  [/value appears overpriced/gi, "Value overpriced."],
  [/the matchup limits/gi, "Matchup limits ceiling."],
  [/high floor with moderate upside/gi, "High floor. Moderate upside."],
  [/presents solid value/gi, "Solid value."],
  [/is well-positioned/gi, "Well positioned."],
  [/boasts an elite projection tier/gi, "Top-tier projection."],
  [/boasts (a|an) (elite|strong|solid)/gi, "Has $2"],
  [/is considered a strong/gi, "Strong"],
  [/it is worth noting that/gi, "Note:"],
  [/it should be noted that/gi, "Note:"],
  [/given his (?:recent\s+)?(?:form|performances?)/gi, "Given recent form,"],
  [/making him a (?:reliable|valuable|worthwhile) (?:asset|option|pick)/gi, "solid fantasy pick."],
  [/in your fantasy (?:team|lineup|squad)/gi, "this week."],
  [/fantasy (?:team|lineup|squad) this round/gi, "this week."],
  [/at a price of \$[\d,]+/gi, "at current price."],
];

const HIGH_RISK_CONTRADICTIONS: RegExp[] = [
  /minimal (?:bust\s*)?risk/gi,
  /safe (?:fantasy\s*)?option/gi,
  /low[- ]risk/gi,
  /stable floor/gi,
  /reliable pick/gi,
  /minimal downside/gi,
  /low bust risk/gi,
];

const LOW_CONFIDENCE_CONTRADICTIONS: RegExp[] = [
  /guaranteed (?:scorer|points|output)/gi,
  /near[- ]certain/gi,
  /certainty this round/gi,
  /will definitely/gi,
  /lock in/gi,
];

export function sharpenAIText(
  text: string | null | undefined,
  context?: { riskRating?: number | null; confidence?: number | null }
): string | null {
  if (!text) return null;

  let out = cleanAiText(text);

  if (out.startsWith("{") || out.startsWith("[")) {
    try {
      const parsed = JSON.parse(out) as Record<string, string>;
      out = parsed.analysis ?? parsed.summary_long ?? parsed.summary_short ?? out;
    } catch {
      // not valid JSON — leave as-is
    }
  }

  for (const [pattern, replacement] of AI_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }

  if (context?.riskRating != null && context.riskRating >= 60) {
    for (const pattern of HIGH_RISK_CONTRADICTIONS) {
      out = out.replace(pattern, "elevated risk");
    }
  }

  if (context?.confidence != null && context.confidence < 60) {
    for (const pattern of LOW_CONFIDENCE_CONTRADICTIONS) {
      out = out.replace(pattern, "uncertain projection");
    }
  }

  return out;
}

// ─── Recommendation pill colour resolver ──────────────────────────────────────
// Maps DB colour names / labels to accessible hex values for pill display.
// START → teal, CAPTAIN → gold, HOLD → slate, SIT → amber

const REC_COLOR_MAP: Record<string, string> = {
  // By recommendation_color field (DB value)
  green:  "#10b981",
  teal:   "#14b8a6",
  gold:   "#F5C84C",
  yellow: "#64748b",
  amber:  "#f59e0b",
  orange: "#f59e0b",
  red:    "#ef4444",
  slate:  "#64748b",
  grey:   "#64748b",
  gray:   "#64748b",
  blue:   "#3b82f6",
  white:  "rgba(255,255,255,0.55)",
};

const REC_LABEL_COLOR_MAP: Record<string, string> = {
  START:         "#14b8a6",
  "STRONG START": "#4ade80",
  CAPTAIN:       "#F5C84C",
  "ELITE CAPTAIN":  "#F5C84C",
  "STRONG CAPTAIN": "#F5C84C",
  "CAPTAIN OPTION": "#e2b93b",
  HOLD:          "#64748b",
  SIT:           "#f59e0b",
  "STRONG SIT":  "#f87171",
  "UPGRADE TARGET":    "#10b981",
  "BEST CASH SAVER":   "#14b8a6",
  "SPECULATIVE VALUE": "#94a3b8",
  "STRONG OPTION":     "#10b981",
  "BENCH WATCH":       "#f59e0b",
  // Normalised internal enum (used by getEdgeSignalStyles pipeline)
  "STRONG_BUY":  "#4ade80",
  "STRONG_SELL": "#f87171",
};

export function resolveRecommendationColor(
  color: string | null,
  label: string | null,
): string {
  const c = (color ?? "").toLowerCase().trim();
  const l = (label ?? "").toUpperCase().trim();

  if (c && REC_COLOR_MAP[c]) return REC_COLOR_MAP[c];
  if (l && REC_LABEL_COLOR_MAP[l]) return REC_LABEL_COLOR_MAP[l];
  if (c && c.startsWith("#")) return c;
  return "rgba(255,255,255,0.35)";
}

// ─── KPI tile computation ─────────────────────────────────────────────────────

export function computeKpiTiles(rows: RankingRow[]) {
  const captainRows = rows
    .filter((r) => r.captain_rating === "Elite Captain" || r.captain_rating === "Strong Captain")
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .slice(0, 5);
  const captainAvgProj = captainRows.length
    ? captainRows.reduce((s, r) => s + (r.projection ?? 0), 0) / captainRows.length
    : null;

  const valueUpgrades = rows.filter((r) => (r.value_score ?? 0) >= 1.05).length;
  const trapAlerts = rows.filter((r) =>
    (r.risk_rating ?? 0) >= 65 ||
    (r.projection_confidence ?? 100) < 50
  ).length;
  const highConfidence = rows.filter((r) => (r.projection_confidence ?? 0) >= 65).length;

  return { captainAvgProj, valueUpgrades, trapAlerts, highConfidence };
}

// ─── Tab constants ─────────────────────────────────────────────────────────────

export const TAB_SORT_KEY: Record<RankingsTab, string> = {
  best: "best",
  value: "value",
  projection: "projection",
};

export const TAB_DEFAULT_SORT: Record<RankingsTab, SortKey> = {
  best: "projection",
  value: "value_score",
  projection: "projection",
};

export const TAB_DESCRIPTIONS: Record<RankingsTab, string> = {
  best: "Most fantasy rankings sort by projection alone. Neeko Rating weighs projection, matchup, volatility and AI verdict to surface real decision advantage.",
  value: "Most underpriced players based on price vs projected score — sorted by Value Score",
  projection: "Highest projected fantasy scorers this round — sorted by Projection",
};

// ─── Gating constants ──────────────────────────────────────────────────────────

// FREEMIUM GATING: 8 players visible for free users, 50 initial for premium
export const FREE_FULL_ROWS = 8;         // Fully accessible players for free users
export const FREE_PARTIAL_ROWS = 4;      // Kept for compatibility
export const PREMIUM_INITIAL_ROWS = 50; // Initial visible rows for premium users

export function getFreeTier(idx: number): "full" | "partial" | "locked" {
  if (idx < FREE_FULL_ROWS) return "full";
  return "locked";
}

export function formatActionLabel(action: string | null): string {
  if (!action) return "—";
  return action
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getActionStyles(action: string | null): string {
  if (!action) return "";
  return getEdgeSignalStyles(action);
}

export function fmtEdge(edge: number | null | undefined): string {
  if (edge == null) return "—";
  return edge > 0 ? `+${edge.toFixed(1)}` : edge.toFixed(1);
}

export function getEdgeColor(edge: number | null | undefined): string {
  if (edge == null) return "text-white/40";
  if (edge >= 15) return "text-emerald-400";
  if (edge >= 5) return "text-emerald-300/80";
  if (edge > -5) return "text-white/55";
  if (edge > -15) return "text-orange-300/80";
  return "text-red-400";
}

// ─── Action display helpers (canonical Phase 7 redesign) ──────────────────────
// Maps `action_display` text labels from the DB (Strong Start / Start / Hold / Sit / Hard Sit)
// to Tailwind badge style strings.

export function getActionDisplayStyles(actionDisplay: string | null): string {
  if (!actionDisplay) return "text-white/30 border-white/10 bg-white/5";
  const s = actionDisplay.toLowerCase();
  if (s === "strong start") return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  if (s === "start")        return "text-green-400 border-green-500/25 bg-green-500/8";
  if (s === "hold")         return "text-white/55 border-white/15 bg-white/5";
  if (s === "sit")          return "text-orange-400 border-orange-500/25 bg-orange-500/10";
  if (s === "hard sit")     return "text-red-400 border-red-500/30 bg-red-500/10";
  return "text-white/40 border-white/10 bg-white/5";
}

export function getActionDisplayColor(actionDisplay: string | null): string {
  if (!actionDisplay) return "text-white/30";
  const s = actionDisplay.toLowerCase();
  if (s === "strong start") return "text-emerald-300";
  if (s === "start")        return "text-green-400";
  if (s === "hold")         return "text-white/55";
  if (s === "sit")          return "text-orange-400";
  if (s === "hard sit")     return "text-red-400";
  return "text-white/40";
}

// ─── Value band helpers (canonical Phase 7 redesign) ─────────────────────────
// Maps `value_band` text labels from the DB (Elite Value / Strong Value / Fair Value / Thin Value / Poor Value)
// to Tailwind badge style strings.

export function getValueBandStyles(valueBand: string | null): string {
  if (!valueBand) return "text-white/30 border-white/10 bg-white/5";
  const s = valueBand.toLowerCase();
  if (s === "elite value")  return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  if (s === "strong value") return "text-green-400 border-green-500/25 bg-green-500/8";
  if (s === "fair value")   return "text-white/55 border-white/15 bg-white/5";
  if (s === "thin value")   return "text-orange-400 border-orange-500/25 bg-orange-500/10";
  if (s === "poor value")   return "text-red-400 border-red-500/30 bg-red-500/10";
  return "text-white/40 border-white/10 bg-white/5";
}

export function getValueBandColor(valueBand: string | null): string {
  if (!valueBand) return "text-white/30";
  const s = valueBand.toLowerCase();
  if (s === "elite value")  return "text-emerald-300";
  if (s === "strong value") return "text-green-400";
  if (s === "fair value")   return "text-white/55";
  if (s === "thin value")   return "text-orange-400";
  if (s === "poor value")   return "text-red-400";
  return "text-white/40";
}

// ─── Canonical confidence label helpers (Phase 7 redesign) ───────────────────
// Maps `confidence_label` string from the DB (HIGH / MEDIUM / LOW) to display styles.
// Replaces the old numeric-based getConfidenceLabel() for canonical DB-driven label.

export function getCanonicalConfidenceStyles(label: string | null): string {
  if (!label) return "text-white/25 border-white/10 bg-white/5";
  const s = label.toUpperCase();
  if (s === "HIGH")   return "text-emerald-400 border-emerald-500/25 bg-emerald-500/8";
  if (s === "MEDIUM") return "text-[#F5C84C] border-[#F5C84C]/25 bg-[#F5C84C]/8";
  if (s === "LOW")    return "text-white/40 border-white/15 bg-white/5";
  return "text-white/30 border-white/10 bg-white/5";
}

export function getCanonicalConfidenceColor(label: string | null): string {
  if (!label) return "text-white/25";
  const s = label.toUpperCase();
  if (s === "HIGH")   return "text-emerald-400";
  if (s === "MEDIUM") return "text-[#F5C84C]";
  if (s === "LOW")    return "text-white/40";
  return "text-white/30";
}

export function formatCanonicalConfidenceLabel(label: string | null): string {
  if (!label) return "—";
  const s = label.toUpperCase();
  if (s === "HIGH")   return "High";
  if (s === "MEDIUM") return "Medium";
  if (s === "LOW")    return "Low";
  return label;
}

// ─── Relative confidence label assignment ─────────────────────────────────────
// Uses percentile rank across the dataset so labels are always meaningful.
// TOP 20% → HIGH, NEXT 40% → MEDIUM, BOTTOM 40% → LOW
// Falls back to null (hidden) when confidence_score_100 is missing.

export function applyRelativeConfidenceLabels<T extends { confidence_score_100?: number | null; confidence_label?: string | null }>(rows: T[]): T[] {
  const scores = rows.map((r) => r.confidence_score_100 ?? null);
  const validScores = scores.filter((s): s is number => s != null);

  if (validScores.length === 0) return rows;

  const sorted = [...validScores].sort((a, b) => b - a);

  return rows.map((row) => {
    const score = row.confidence_score_100 ?? null;
    if (score == null) return { ...row, confidence_label: null };

    const index = sorted.indexOf(score);
    const percentile = index / sorted.length;

    const label = percentile <= 0.2 ? "HIGH" : percentile <= 0.6 ? "MEDIUM" : "LOW";
    return { ...row, confidence_label: label };
  });
}

// ─── Decision score display helper ───────────────────────────────────────────

export function fmtDecisionScore(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

export function getDecisionScoreColor(v: number | null | undefined): string {
  if (v == null) return "text-white/30";
  if (v >= 0.80)  return "text-emerald-300";
  if (v >= 0.38)  return "text-green-400";
  if (v > -0.35)  return "text-white/55";
  if (v > -0.90)  return "text-orange-400";
  return "text-red-400";
}

