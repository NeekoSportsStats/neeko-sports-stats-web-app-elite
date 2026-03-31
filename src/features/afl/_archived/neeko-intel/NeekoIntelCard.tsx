import { Lock, Zap, TriangleAlert as AlertTriangle, TrendingUp, TrendingDown, Shield, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Badge helpers ────────────────────────────────────────────────────────────

interface BadgeProps {
  label: string;
  color?: "gold" | "green" | "blue" | "orange" | "red" | "gray";
  icon?: React.ReactNode;
}

function Badge({ label, color = "gray", icon }: BadgeProps) {
  const styles: Record<string, string> = {
    gold:   "text-[#F5C84C] bg-[#F5C84C]/10 border-[#F5C84C]/30",
    green:  "text-green-400 bg-green-400/10 border-green-400/25",
    blue:   "text-sky-400 bg-sky-400/10 border-sky-400/25",
    orange: "text-orange-400 bg-orange-400/10 border-orange-400/25",
    red:    "text-red-400 bg-red-400/10 border-red-400/25",
    gray:   "text-white/40 bg-white/5 border-white/10",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap ${styles[color]}`}
    >
      {icon}
      {label}
    </span>
  );
}

// ─── Matchup Difficulty Badge ─────────────────────────────────────────────────

export function MatchupBadge({ value }: { value: string | null }) {
  if (!value) return null;
  const map: Record<string, { color: BadgeProps["color"]; label: string }> = {
    "VERY EASY": { color: "green",  label: "Very Easy" },
    "EASY":      { color: "green",  label: "Easy" },
    "NEUTRAL":   { color: "gray",   label: "Neutral" },
    "HARD":      { color: "orange", label: "Hard" },
    "VERY HARD": { color: "red",    label: "Very Hard" },
  };
  const cfg = map[value] ?? { color: "gray", label: value };
  return <Badge label={cfg.label} color={cfg.color} />;
}

// ─── Volatility Badge ─────────────────────────────────────────────────────────

export function VolatilityBadge({ value }: { value: string | null }) {
  if (!value) return null;
  const map: Record<string, BadgeProps["color"]> = {
    Extreme: "red",
    Volatile: "orange",
    Normal: "blue",
    Safe: "green",
    EXTREME: "red",
    HIGH:    "orange",
    MEDIUM:  "blue",
    LOW:     "gray",
  };
  return <Badge label={value} color={map[value] ?? "gray"} />;
}

// ─── Captain Tier Badge ───────────────────────────────────────────────────────

export function CaptainTierBadge({ value }: { value: string | null }) {
  if (!value) return null;
  const map: Record<string, BadgeProps["color"]> = {
    ELITE:  "gold",
    STRONG: "green",
    SAFE:   "blue",
    RISKY:  "red",
  };
  return <Badge label={value} color={map[value] ?? "gray"} />;
}

// ─── Breakout Badge ───────────────────────────────────────────────────────────

export function BreakoutBadge({ flag }: { flag: boolean | null }) {
  if (!flag) return null;
  return <Badge label="Breakout" color="gold" icon={<Zap size={8} />} />;
}

// ─── Avoid Badge ─────────────────────────────────────────────────────────────

export function AvoidBadge({ flag }: { flag: boolean | null }) {
  if (!flag) return null;
  return <Badge label="Avoid" color="red" icon={<AlertTriangle size={8} />} />;
}

// ─── Trend Badge ─────────────────────────────────────────────────────────────

export function TrendBadge({ value }: { value: string | null }) {
  if (!value || value === "STABLE") return null;
  const map: Record<string, { cls: string; up: boolean }> = {
    SURGING:  { cls: "text-green-400 bg-green-400/10 border-green-400/25",  up: true },
    RISING:   { cls: "text-sky-400 bg-sky-400/10 border-sky-400/25",        up: true },
    FADING:   { cls: "text-orange-400 bg-orange-400/10 border-orange-400/25", up: false },
    CRASHING: { cls: "text-red-400 bg-red-400/10 border-red-400/25",        up: false },
  };
  const cfg = map[value] ?? { cls: "text-white/40 bg-white/5 border-white/10", up: true };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap ${cfg.cls}`}>
      {cfg.up ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
      {value}
    </span>
  );
}

// ─── Role Signal Badge ────────────────────────────────────────────────────────

export function RoleSignalBadge({ value }: { value: string | null }) {
  if (!value) return null;
  const map: Record<string, string> = {
    "MID BOOST": "text-[#F5C84C] bg-[#F5C84C]/10 border-[#F5C84C]/30",
    "ROLE LOSS": "text-red-400 bg-red-400/10 border-red-400/25",
    "TOG DROP":  "text-orange-400 bg-orange-400/10 border-orange-400/25",
    "DEF SHIFT": "text-sky-400 bg-sky-400/10 border-sky-400/25",
    "FWD SHIFT": "text-green-400 bg-green-400/10 border-green-400/25",
  };
  const cls = map[value] ?? "text-white/40 bg-white/5 border-white/10";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap ${cls}`}>
      <Shield size={8} />{value}
    </span>
  );
}

// ─── Neeko Score Badge ────────────────────────────────────────────────────────

export function NeekoScoreBadge({ value }: { value: number | null }) {
  if (value == null) return null;
  let cls: string;
  if (value >= 80)      cls = "text-[#F5C84C] bg-[#F5C84C]/15 border-[#F5C84C]/40";
  else if (value >= 65) cls = "text-green-400 bg-green-400/10 border-green-400/30";
  else if (value >= 50) cls = "text-sky-400 bg-sky-400/10 border-sky-400/25";
  else if (value >= 35) cls = "text-orange-400 bg-orange-400/10 border-orange-400/25";
  else                  cls = "text-red-400 bg-red-400/10 border-red-400/25";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide whitespace-nowrap ${cls}`}>
      N {value}
    </span>
  );
}

// ─── Ceiling / Bust Probability Chips ─────────────────────────────────────────

export function CeilingBustChips({
  ceiling,
  bust,
}: {
  ceiling: number | null;
  bust: number | null;
}) {
  if (ceiling == null && bust == null) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {ceiling != null && (
        <span className="inline-flex items-center gap-1 rounded-full border border-green-400/25 bg-green-400/8 px-2 py-0.5 text-[9px] font-bold text-green-400 whitespace-nowrap">
          C {Math.round(ceiling)}%
        </span>
      )}
      {bust != null && (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-400/25 bg-red-400/8 px-2 py-0.5 text-[9px] font-bold text-red-400 whitespace-nowrap">
          B {Math.round(bust)}%
        </span>
      )}
    </span>
  );
}

// ─── Matchup Tier Badge ───────────────────────────────────────────────────────

export function MatchupTierBadge({ value }: { value: string | null }) {
  if (!value) return null;
  const map: Record<string, BadgeProps["color"]> = {
    Elite:   "green",
    Good:    "blue",
    Neutral: "gray",
    Hard:    "orange",
    Avoid:   "red",
  };
  return <Badge label={`Matchup: ${value}`} color={map[value] ?? "gray"} />;
}

// ─── Trend Tag Badge ──────────────────────────────────────────────────────────

export function TrendTagBadge({ value }: { value: string | null }) {
  if (!value || value === "Stable") return null;
  const map: Record<string, { color: BadgeProps["color"]; up: boolean }> = {
    Rising:  { color: "green",  up: true },
    Falling: { color: "orange", up: false },
  };
  const cfg = map[value] ?? { color: "gray", up: true };
  return (
    <Badge
      label={value}
      color={cfg.color}
      icon={cfg.up ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
    />
  );
}

// ─── Neeko Tier Badge ─────────────────────────────────────────────────────────

export function NeekoTierBadge({ value }: { value: string | null }) {
  if (!value) return null;
  const map: Record<string, BadgeProps["color"]> = {
    Generational: "gold",
    Elite:        "gold",
    Strong:       "green",
    Solid:        "blue",
    Risky:        "orange",
    Avoid:        "red",
  };
  return <Badge label={value} color={map[value] ?? "gray"} />;
}

// ─── Confidence Tier Badge ────────────────────────────────────────────────────

export function ConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) return null;
  let label: string;
  let color: BadgeProps["color"];
  if (value >= 75) { label = "High Confidence"; color = "green"; }
  else if (value >= 60) { label = "Strong";         color = "blue"; }
  else if (value >= 50) { label = "Moderate";        color = "orange"; }
  else                  { label = "Low Confidence";  color = "red"; }
  return <Badge label={label} color={color} />;
}

// ─── Main Card Props ──────────────────────────────────────────────────────────

export interface NeekoIntelCardProps {
  playerName: string;
  team: string;
  position?: string | null;
  projection: number | null;
  confidence?: number | null;
  label?: string | null;
  color?: string | null;
  reason?: string | null;
  captainRating?: string | null;
  captainScore?: number | null;
  locked: boolean;
  rank?: number;
  onClick?: () => void;
  matchupDifficulty?: string | null;
  volatilityLevel?: string | null;
  captainTier?: string | null;
  breakoutFlag?: boolean | null;
  avoidFlag?: boolean | null;
  trendLabel?: string | null;
  roleSignal?: string | null;
  nextOpponent?: string | null;
  nextRound?: number | null;
  // Phase 4
  neekoScore?: number | null;
  ceilingPct?: number | null;
  bustPct?: number | null;
  matchupTier?: string | null;
  trendTag?: string | null;
  // Phase 4.5
  neekoTier?: string | null;
  volatilityTag?: string | null;
  trendStrength?: number | null;
}

function fmt(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  return Number(v).toFixed(decimals);
}

function fmtInt(v: number | null): string {
  if (v == null) return "—";
  return Math.round(Number(v)).toString();
}

// ─── Neeko Score Dominant (large left-anchor display) ────────────────────────

function NeekoScoreDominant({ value }: { value: number }) {
  let cls: string;
  if (value >= 80)      cls = "text-[#F5C84C]";
  else if (value >= 65) cls = "text-emerald-400";
  else if (value >= 50) cls = "text-sky-400";
  else if (value >= 35) cls = "text-orange-400";
  else                  cls = "text-red-400";
  return (
    <div className={`text-4xl font-black tabular-nums leading-none ${cls}`}>
      {value}
    </div>
  );
}

// ─── Trend Strength Display ───────────────────────────────────────────────────

function TrendStrengthDisplay({
  value,
  trendTag,
}: {
  value: number | null;
  trendTag?: string | null;
}) {
  if (value == null) return null;
  const isPositive = value > 0;
  const isNeutral = value === 0;
  const sign = isPositive ? "+" : "";
  const cls = isNeutral
    ? "text-white/40"
    : isPositive
    ? "text-green-400"
    : "text-orange-400";
  const tag = trendTag ?? (isPositive ? "Rising" : value < 0 ? "Falling" : "Stable");
  return (
    <div>
      <div className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">Trend</div>
      <div className={`text-sm font-semibold tabular-nums flex items-center gap-1 ${cls}`}>
        {isPositive ? <TrendingUp size={12} /> : !isNeutral ? <TrendingDown size={12} /> : null}
        {tag} ({sign}{value})
      </div>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function NeekoIntelCard({
  playerName,
  team,
  position,
  projection,
  confidence,
  label,
  color,
  reason,
  captainRating,
  captainScore,
  locked,
  rank,
  onClick,
  matchupDifficulty,
  volatilityLevel,
  captainTier,
  breakoutFlag,
  avoidFlag,
  trendLabel,
  roleSignal,
  nextOpponent,
  nextRound,
  neekoScore,
  ceilingPct,
  bustPct,
  matchupTier,
  trendTag,
  neekoTier,
  volatilityTag,
  trendStrength,
}: NeekoIntelCardProps) {
  const isElite = label === "ELITE CAPTAIN" || label === "CAPTAIN LOCK";

  const hasBadgeRow =
    matchupDifficulty || volatilityLevel || captainTier || breakoutFlag || avoidFlag ||
    confidence != null || trendLabel || roleSignal || matchupTier || trendTag ||
    ceilingPct != null || bustPct != null || volatilityTag;

  return (
    <div
      onClick={locked ? undefined : onClick}
      className={`relative rounded-xl border p-4 transition-all duration-150 ${
        isElite
          ? "bg-[#120E00] border-[#F5C84C]/30"
          : "bg-[#111111] border-white/10"
      } ${locked ? "opacity-50 blur-sm select-none pointer-events-none" : onClick ? "cursor-pointer hover:bg-white/[0.04] hover:border-white/20" : ""}`}
    >
      {/* ── Top Row ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {rank != null && (
            <span className="shrink-0 text-white/25 text-xs tabular-nums w-5 text-center">{rank}</span>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-white text-sm leading-tight truncate">{playerName}</div>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className="text-[11px] text-white/40">
                {team}{position ? ` · ${position}` : ""}
                {nextOpponent && (
                  <span className="ml-1.5 text-white/25">
                    · {nextRound != null ? `R${nextRound} ` : ""}vs {nextOpponent}
                  </span>
                )}
              </span>
              {neekoTier && <NeekoTierBadge value={neekoTier} />}
            </div>
          </div>
        </div>

        {label && (
          <div
            className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap"
            style={
              isElite
                ? {
                    color: "#F5C84C",
                    background: "linear-gradient(90deg, #3A2A00, #5A4200, #3A2A00)",
                    border: "1px solid #F5C84C",
                  }
                : color
                ? {
                    color,
                    backgroundColor: `${color}22`,
                    border: `1px solid ${color}66`,
                  }
                : {
                    color: "rgba(255,255,255,0.4)",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }
            }
          >
            {label}
          </div>
        )}
      </div>

      {/* ── Stats Row ── */}
      <div className="flex items-end gap-5 mt-3">
        {/* Neeko Score — dominant left anchor */}
        {neekoScore != null && (
          <div>
            <div className="flex items-center gap-1 text-[10px] text-white/35 uppercase tracking-wider mb-1">
              Neeko Score
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info size={9} className="text-white/25 cursor-default shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px] text-center text-[11px] bg-[#1a1a1a] border-white/10 text-white/80">
                    Neeko Score is a 0–100 rating based on projection, matchup, ceiling and risk.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <NeekoScoreDominant value={neekoScore} />
          </div>
        )}

        <div>
          <div className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">Projection</div>
          <div className="text-white/80 font-bold text-xl tabular-nums leading-none">{fmt(projection)}</div>
        </div>

        {trendStrength != null && (
          <TrendStrengthDisplay value={trendStrength} trendTag={trendTag} />
        )}

        {confidence != null && (
          <div>
            <div className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">Conf.</div>
            <div
              className={`text-sm font-semibold tabular-nums ${
                confidence >= 75
                  ? "text-green-400"
                  : confidence >= 60
                  ? "text-sky-400"
                  : confidence >= 50
                  ? "text-orange-400"
                  : "text-red-400"
              }`}
            >
              {fmtInt(confidence)}%
            </div>
          </div>
        )}

        {captainScore != null && (
          <div>
            <div className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">C Score</div>
            <div className="text-sm font-semibold text-yellow-300 tabular-nums">{fmtInt(captainScore)}</div>
          </div>
        )}

        {captainRating && !captainScore && (
          <div>
            <div className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">Rating</div>
            <div className="text-sm font-semibold text-yellow-300">{captainRating}</div>
          </div>
        )}
      </div>

      {/* ── Intelligence Badge Row ── */}
      {hasBadgeRow && (
        <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-white/[0.06]">
          {trendTag && !trendStrength && <TrendTagBadge value={trendTag} />}
          {trendLabel && <TrendBadge value={trendLabel} />}
          {roleSignal && <RoleSignalBadge value={roleSignal} />}
          {matchupTier && <MatchupTierBadge value={matchupTier} />}
          {matchupDifficulty && !matchupTier && <MatchupBadge value={matchupDifficulty} />}
          {(ceilingPct != null || bustPct != null) && (
            <CeilingBustChips ceiling={ceilingPct} bust={bustPct} />
          )}
          {volatilityTag && <VolatilityBadge value={volatilityTag} />}
          {confidence != null && <ConfidenceBadge value={confidence} />}
          {volatilityLevel && !volatilityTag && <VolatilityBadge value={volatilityLevel} />}
          {captainTier && <CaptainTierBadge value={captainTier} />}
          {breakoutFlag && <BreakoutBadge flag={breakoutFlag} />}
          {avoidFlag && <AvoidBadge flag={avoidFlag} />}
        </div>
      )}

      {/* ── AI Reason ── */}
      {reason && (
        <p className="mt-3 text-[11px] text-white/50 leading-relaxed border-t border-white/5 pt-3 line-clamp-2">
          {reason}
        </p>
      )}
    </div>
  );
}

// ─── Locked Card ─────────────────────────────────────────────────────────────

export function NeekoIntelCardLocked() {
  return (
    <div className="relative rounded-xl border border-white/10 bg-[#111111] p-4 flex items-center justify-between gap-3">
      <div className="flex-1">
        <div className="h-3 w-28 rounded bg-white/10 animate-pulse mb-2" />
        <div className="h-2.5 w-16 rounded bg-white/5 animate-pulse" />
        <div className="h-6 w-20 rounded bg-white/5 animate-pulse mt-3" />
      </div>
      <a
        href="/neeko-plus"
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 flex items-center gap-1.5 bg-[#F5C84C]/15 text-[#F5C84C] text-xs font-semibold px-3 py-2 rounded-lg hover:bg-[#F5C84C]/25 transition-colors border border-[#F5C84C]/20"
      >
        <Lock size={11} />
        Unlock Neeko+
      </a>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function NeekoIntelSkeletonCard() {
  return (
    <div className="rounded-xl border border-white/5 bg-[#111111] p-4 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-3.5 w-32 rounded bg-white/10" />
          <div className="h-2.5 w-20 rounded bg-white/5" />
        </div>
        <div className="h-6 w-24 rounded-full bg-white/10" />
      </div>
      <div className="h-7 w-16 rounded bg-white/10" />
      <div className="flex gap-1.5">
        <div className="h-5 w-20 rounded-full bg-white/5" />
        <div className="h-5 w-16 rounded-full bg-white/5" />
        <div className="h-5 w-14 rounded-full bg-white/5" />
      </div>
      <div className="h-2.5 w-full rounded bg-white/5" />
    </div>
  );
}
