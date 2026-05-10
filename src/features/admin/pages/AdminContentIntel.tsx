import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RefreshCw, Copy, Check, TrendingUp, Target, Zap, FileText, TriangleAlert as AlertTriangle, Users, Sword, Lightbulb, Filter, ChevronDown, ChevronUp, ChartBar as BarChart, ArrowUpRight } from "lucide-react";
import { AdminPageHeader } from "@/features/admin/shared/AdminPageHeader";
import type { StatBoardPlayer, StatBoardMatch, ThresholdHitRate } from "@/features/afl/stat-board/types";
import type { StatBoardTeamRow } from "@/features/afl/stat-board/teamTypes";
import type { RankingRow } from "@/features/afl/rankings/components/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

type StatFamily =
  | "disposals" | "goals" | "fantasy" | "tackles" | "marks"
  | "clearances" | "inside50s" | "rebounds50s" | "hitouts";

type HitProfile =
  | "all" | "perfect" | "missed-once" | "missed-twice"
  | "at-least-80" | "at-least-70" | "trending-up" | "fade";

type SampleWindow = "last5" | "last8" | "last10" | "season";
type MinSample = 3 | 5 | 8;
type SortBy = "hitrate" | "projection" | "l5avg" | "l10avg" | "seasonavg" | "confidence" | "diff";

type AngleTag =
  | "Safe" | "High Confidence" | "Volatile Upside" | "Fade"
  | "Matchup Attack" | "Captain" | "Value" | "Market Check"
  | "Team Concession" | "Current Round" | "Consistency";

type PostFormat = "tiktok" | "instagram" | "reddit" | "twitter";

interface PostTemplate {
  id: string;
  format: PostFormat;
  angleTag: AngleTag;
  title: string;
  hook: string;
  bullets: string[];
  cta: string;
}

interface ContentIntelData {
  matches: StatBoardMatch[];
  disposalPlayers: StatBoardPlayer[];
  goalPlayers: StatBoardPlayer[];
  teamDisposals: StatBoardTeamRow[];
  teamGoals: StatBoardTeamRow[];
  rankings: RankingRow[];
  currentRound: number;
  roundLabel: string;
  loadedAt: Date;
}

type MainTab = "mining" | "fantasy" | "match" | "posts";

// ─── Stat family config ─────────────────────────────────────────────────────────

interface StatFamilyConfig {
  label: string;
  thresholds: number[];
  defaultThreshold: number;
  unit: string;
  dataKey: "disposalPlayers" | "goalPlayers";
  rpcLens: "disposals" | "goals";
  hasLiveData: boolean;
}

const STAT_FAMILIES: Record<StatFamily, StatFamilyConfig> = {
  disposals:   { label: "Disposals",       thresholds: [10, 15, 20, 25, 30], defaultThreshold: 20, unit: "disp",  dataKey: "disposalPlayers", rpcLens: "disposals", hasLiveData: true },
  goals:       { label: "Goals",           thresholds: [1, 2, 3, 4, 5],      defaultThreshold: 1,  unit: "goals", dataKey: "goalPlayers",     rpcLens: "goals",     hasLiveData: true },
  fantasy:     { label: "Fantasy Score",   thresholds: [60, 70, 80, 90, 100, 110, 120], defaultThreshold: 80, unit: "pts", dataKey: "disposalPlayers", rpcLens: "disposals", hasLiveData: false },
  tackles:     { label: "Tackles",         thresholds: [3, 5, 7, 10],        defaultThreshold: 5,  unit: "tck",  dataKey: "disposalPlayers", rpcLens: "disposals", hasLiveData: false },
  marks:       { label: "Marks",           thresholds: [5, 7, 10],           defaultThreshold: 5,  unit: "mrk",  dataKey: "disposalPlayers", rpcLens: "disposals", hasLiveData: false },
  clearances:  { label: "Clearances",      thresholds: [3, 5, 7, 10],        defaultThreshold: 5,  unit: "clr",  dataKey: "disposalPlayers", rpcLens: "disposals", hasLiveData: false },
  inside50s:   { label: "Inside 50s",      thresholds: [3, 5, 7, 10],        defaultThreshold: 5,  unit: "i50",  dataKey: "disposalPlayers", rpcLens: "disposals", hasLiveData: false },
  rebounds50s: { label: "Rebounds 50s",    thresholds: [2, 4, 6, 8],         defaultThreshold: 4,  unit: "r50",  dataKey: "disposalPlayers", rpcLens: "disposals", hasLiveData: false },
  hitouts:     { label: "Hitouts",         thresholds: [20, 30, 40, 50],     defaultThreshold: 30, unit: "hit",  dataKey: "disposalPlayers", rpcLens: "disposals", hasLiveData: false },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtRate(hits: number, games: number): string {
  return `${hits}/${games}`;
}

// Rate from RPC is already 0–100 (integer), not 0.0–1.0
function rateToFraction(rate: number): number {
  return rate > 1 ? rate / 100 : rate;
}

function fmtPct(rate: number): string {
  const fraction = rateToFraction(rate);
  return `${Math.round(fraction * 100)}%`;
}

function hitRateBg(rate: number): string {
  const f = rateToFraction(rate);
  if (f >= 0.85) return "text-emerald-400";
  if (f >= 0.65) return "text-amber-400";
  return "text-zinc-400";
}

function confidenceColor(label: string | null): string {
  if (label === "HIGH") return "text-emerald-400";
  if (label === "MEDIUM") return "text-amber-400";
  return "text-zinc-400";
}

function buildAngleTagCls(tag: AngleTag): string {
  switch (tag) {
    case "Safe":           return "bg-emerald-950/60 text-emerald-400 border-emerald-500/30";
    case "High Confidence":return "bg-emerald-950/40 text-emerald-300 border-emerald-600/30";
    case "Volatile Upside":return "bg-amber-950/60 text-amber-400 border-amber-500/30";
    case "Fade":           return "bg-red-950/60 text-red-400 border-red-500/30";
    case "Matchup Attack": return "bg-sky-950/60 text-sky-400 border-sky-500/30";
    case "Captain":        return "bg-yellow-950/60 text-yellow-400 border-yellow-500/30";
    case "Value":          return "bg-teal-950/60 text-teal-400 border-teal-500/30";
    case "Market Check":   return "bg-zinc-900 text-zinc-400 border-zinc-600/30";
    case "Team Concession":return "bg-orange-950/60 text-orange-400 border-orange-500/30";
    case "Current Round":  return "bg-blue-950/60 text-blue-400 border-blue-500/30";
    case "Consistency":    return "bg-violet-950/60 text-violet-400 border-violet-500/30";
  }
}

// ─── Small shared components ───────────────────────────────────────────────────

function EmptyState({ message, detail }: { message: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <AlertTriangle className="h-4 w-4 text-amber-500 mb-2" />
      <p className="text-xs font-medium text-muted-foreground">{message}</p>
      {detail && <p className="text-[11px] text-muted-foreground/60 mt-1 max-w-xs">{detail}</p>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function SummaryCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 leading-tight ${accent ?? ""}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/40">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        {count != null && (
          <span className="text-[10px] text-muted-foreground bg-muted/40 border border-border/40 rounded px-1.5 py-0.5 font-mono">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Player mining table ────────────────────────────────────────────────────────

interface MiningRow {
  player_name: string;
  team_name: string;
  opponent_team_name: string;
  hits: number;
  games: number;
  rate: number; // 0–100
  l5avg: number | null;
  l10avg: number | null;
  seasonAvg: number | null;
  projection: number | null;
  confidence_label: string | null;
  reason: string;
}

function buildMiningReason(
  family: StatFamily, threshold: number, hits: number, games: number,
  rate: number, l10avg: number | null, proj: number | null,
): string {
  const familyCfg = STAT_FAMILIES[family];
  const frac = rateToFraction(rate);
  const pct = Math.round(frac * 100);
  const threshStr = `${threshold}+ ${familyCfg.label.toLowerCase()}`;
  const avg10 = l10avg != null ? l10avg.toFixed(1) : null;
  const projStr = proj != null ? Math.round(proj) : null;

  let s = `${hits}/${games} games above ${threshStr} threshold`;
  if (avg10) s += `, L10 avg ${avg10}`;
  if (projStr) s += `, projected ${projStr}`;
  if (pct === 100 && games >= 5) s = `Perfect hit rate (${games}/${games}) — ` + s;
  else if (pct >= 90) s = `Near-perfect hit rate — ` + s;
  return s;
}

function getMiningRows(
  players: StatBoardPlayer[],
  threshold: number,
  profile: HitProfile,
  minSample: MinSample,
  sortBy: SortBy,
  family: StatFamily,
): MiningRow[] {
  const key = `${threshold}`;
  const rows: MiningRow[] = [];

  for (const p of players) {
    const hr: ThresholdHitRate | undefined = p.all_threshold_hit_rates?.[key];
    if (!hr || hr.games < minSample) continue;

    const frac = rateToFraction(hr.rate);
    const misses = hr.games - hr.hits;

    let include = false;
    switch (profile) {
      case "all":        include = true; break;
      case "perfect":    include = frac === 1.0; break;
      case "missed-once":  include = misses === 1; break;
      case "missed-twice": include = misses === 2; break;
      case "at-least-80": include = frac >= 0.80; break;
      case "at-least-70": include = frac >= 0.70; break;
      case "trending-up":  {
        const l5 = p.last_5_avg ?? 0;
        const l10 = p.last_10_avg ?? 0;
        include = l5 > threshold && l5 > l10;
        break;
      }
      case "fade": include = frac < 0.40 && hr.games >= 5; break;
    }

    if (!include) continue;

    rows.push({
      player_name: p.player_name,
      team_name: p.team_name,
      opponent_team_name: p.opponent_team_name,
      hits: hr.hits,
      games: hr.games,
      rate: hr.rate,
      l5avg: p.last_5_avg,
      l10avg: p.last_10_avg,
      seasonAvg: p.season_avg,
      projection: p.projection,
      confidence_label: p.confidence_label,
      reason: buildMiningReason(family, threshold, hr.hits, hr.games, hr.rate, p.last_10_avg, p.projection),
    });
  }

  rows.sort((a, b) => {
    switch (sortBy) {
      case "hitrate":    return rateToFraction(b.rate) - rateToFraction(a.rate) || b.hits - a.hits;
      case "projection": return (b.projection ?? 0) - (a.projection ?? 0);
      case "l5avg":      return (b.l5avg ?? 0) - (a.l5avg ?? 0);
      case "l10avg":     return (b.l10avg ?? 0) - (a.l10avg ?? 0);
      case "seasonavg":  return (b.seasonAvg ?? 0) - (a.seasonAvg ?? 0);
      case "confidence": {
        const w = (l: string | null) => l === "HIGH" ? 3 : l === "MEDIUM" ? 2 : 1;
        return w(b.confidence_label) - w(a.confidence_label);
      }
      case "diff": {
        const da = (a.projection ?? 0) - threshold;
        const db = (b.projection ?? 0) - threshold;
        return db - da;
      }
      default: return 0;
    }
  });

  return rows;
}

function MiningTable({ rows, threshold, family, profile }: {
  rows: MiningRow[];
  threshold: number;
  family: StatFamily;
  profile: HitProfile;
}) {
  const cfg = STAT_FAMILIES[family];
  const isFade = profile === "fade";

  if (rows.length === 0) {
    return (
      <EmptyState
        message={`No players match this filter (${threshold}+ ${cfg.label.toLowerCase()}, ${profile})`}
        detail="Try adjusting the threshold, profile, or minimum sample."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="pb-1.5 pr-3 font-medium">Player</th>
            <th className="pb-1.5 pr-3 font-medium">Team</th>
            <th className="pb-1.5 pr-3 font-medium">vs</th>
            <th className="pb-1.5 pr-3 font-medium text-right">Record</th>
            <th className="pb-1.5 pr-3 font-medium text-right">Rate</th>
            <th className="pb-1.5 pr-3 font-medium text-right">L5 avg</th>
            <th className="pb-1.5 pr-3 font-medium text-right">L10 avg</th>
            <th className="pb-1.5 pr-3 font-medium text-right">Ssn avg</th>
            <th className="pb-1.5 pr-3 font-medium text-right">Proj</th>
            <th className="pb-1.5 font-medium">Conf</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
              <td className="py-1.5 pr-3">
                <div className="font-medium text-foreground whitespace-nowrap">{r.player_name}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5 max-w-[200px] leading-snug">{r.reason}</div>
              </td>
              <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{r.team_name}</td>
              <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{r.opponent_team_name}</td>
              <td className={`py-1.5 pr-3 text-right font-mono font-semibold whitespace-nowrap ${isFade ? "text-red-400" : hitRateBg(r.rate)}`}>
                {fmtRate(r.hits, r.games)}
              </td>
              <td className={`py-1.5 pr-3 text-right font-semibold whitespace-nowrap ${isFade ? "text-red-400" : hitRateBg(r.rate)}`}>
                {fmtPct(r.rate)}
              </td>
              <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.l5avg != null ? r.l5avg.toFixed(1) : "—"}</td>
              <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.l10avg != null ? r.l10avg.toFixed(1) : "—"}</td>
              <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.seasonAvg != null ? r.seasonAvg.toFixed(1) : "—"}</td>
              <td className="py-1.5 pr-3 text-right text-muted-foreground">{r.projection != null ? Math.round(r.projection) : "—"}</td>
              <td className="py-1.5">
                <span className={`text-[10px] font-semibold ${confidenceColor(r.confidence_label)}`}>
                  {r.confidence_label ?? "—"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Content Mining Tab ─────────────────────────────────────────────────────────

interface MiningFilters {
  family: StatFamily;
  threshold: number;
  profile: HitProfile;
  window: SampleWindow;
  minSample: MinSample;
  sortBy: SortBy;
}

const PRESET_CHIPS: Array<{ label: string; family: StatFamily; threshold: number; profile: HitProfile }> = [
  { label: "20+ Disp",   family: "disposals", threshold: 20, profile: "all" },
  { label: "25+ Disp",   family: "disposals", threshold: 25, profile: "all" },
  { label: "30+ Disp",   family: "disposals", threshold: 30, profile: "all" },
  { label: "2+ Goals",   family: "goals",     threshold: 2,  profile: "all" },
  { label: "Perfect 20+", family: "disposals", threshold: 20, profile: "perfect" },
  { label: "Perfect 1G+", family: "goals",     threshold: 1,  profile: "perfect" },
  { label: "Fade Angles", family: "disposals", threshold: 20, profile: "fade" },
  { label: "Missed Once", family: "disposals", threshold: 20, profile: "missed-once" },
];

function ContentMiningTab({ data }: { data: ContentIntelData }) {
  const [filters, setFilters] = useState<MiningFilters>({
    family: "disposals",
    threshold: 20,
    profile: "all",
    window: "last10",
    minSample: 3,
    sortBy: "hitrate",
  });
  const [showFilters, setShowFilters] = useState(true);

  function update<K extends keyof MiningFilters>(key: K, val: MiningFilters[K]) {
    setFilters(prev => ({ ...prev, [key]: val }));
  }

  function applyPreset(p: typeof PRESET_CHIPS[0]) {
    const cfg = STAT_FAMILIES[p.family];
    setFilters(prev => ({
      ...prev,
      family: p.family,
      threshold: p.threshold,
      profile: p.profile,
      minSample: 3,
    }));
    // Ensure threshold is valid for family
    if (!cfg.thresholds.includes(p.threshold)) {
      update("threshold", cfg.defaultThreshold);
    }
  }

  const cfg = STAT_FAMILIES[filters.family];

  // Get source players
  const sourcePlayers = filters.family === "goals" ? data.goalPlayers : data.disposalPlayers;

  // Make sure threshold is valid for family
  const safeThreshold = cfg.thresholds.includes(filters.threshold)
    ? filters.threshold
    : cfg.defaultThreshold;

  // Build sections
  const eliteRows   = cfg.hasLiveData ? getMiningRows(sourcePlayers, safeThreshold, "perfect",     filters.minSample, filters.sortBy, filters.family) : [];
  const missedOnce  = cfg.hasLiveData ? getMiningRows(sourcePlayers, safeThreshold, "missed-once", filters.minSample, filters.sortBy, filters.family) : [];
  const missedTwice = cfg.hasLiveData ? getMiningRows(sourcePlayers, safeThreshold, "missed-twice",filters.minSample, filters.sortBy, filters.family) : [];
  const fadeRows    = cfg.hasLiveData ? getMiningRows(sourcePlayers, safeThreshold, "fade",        filters.minSample, filters.sortBy, filters.family) : [];
  const allRows     = cfg.hasLiveData ? getMiningRows(sourcePlayers, safeThreshold, filters.profile, filters.minSample, filters.sortBy, filters.family) : [];

  const familyLabel = `${safeThreshold}+ ${cfg.label.toLowerCase()}`;

  return (
    <div className="space-y-5">
      {/* Preset chips */}
      <div className="flex flex-wrap gap-1.5">
        {PRESET_CHIPS.map(chip => (
          <button
            key={chip.label}
            onClick={() => applyPreset(chip)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
              filters.family === chip.family && filters.threshold === chip.threshold && filters.profile === chip.profile
                ? "bg-foreground/10 text-foreground border-border"
                : "text-muted-foreground border-border/40 hover:text-foreground hover:border-border"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="rounded-lg border border-border/60 bg-muted/5">
        <button
          onClick={() => setShowFilters(s => !s)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5" />
            Filters — {familyLabel}, {filters.profile}, min {filters.minSample} games, sort by {filters.sortBy}
          </span>
          {showFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showFilters && (
          <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-t border-border/40 pt-3">
            {/* Stat family */}
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Stat Family</label>
              <select
                value={filters.family}
                onChange={e => {
                  const newFamily = e.target.value as StatFamily;
                  const newCfg = STAT_FAMILIES[newFamily];
                  update("family", newFamily);
                  if (!newCfg.thresholds.includes(filters.threshold)) {
                    update("threshold", newCfg.defaultThreshold);
                  }
                }}
                className="w-full text-xs bg-background border border-border/60 rounded px-2 py-1.5 text-foreground focus:outline-none"
              >
                {(Object.entries(STAT_FAMILIES) as [StatFamily, StatFamilyConfig][])
                  .map(([key, c]) => (
                    <option key={key} value={key} disabled={!c.hasLiveData}>
                      {c.label}{!c.hasLiveData ? " (coming)" : ""}
                    </option>
                  ))}
              </select>
            </div>

            {/* Threshold */}
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Threshold</label>
              <select
                value={safeThreshold}
                onChange={e => update("threshold", Number(e.target.value))}
                className="w-full text-xs bg-background border border-border/60 rounded px-2 py-1.5 text-foreground focus:outline-none"
              >
                {cfg.thresholds.map(t => (
                  <option key={t} value={t}>{t}+ {cfg.unit}</option>
                ))}
              </select>
            </div>

            {/* Hit profile */}
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Hit Profile</label>
              <select
                value={filters.profile}
                onChange={e => update("profile", e.target.value as HitProfile)}
                className="w-full text-xs bg-background border border-border/60 rounded px-2 py-1.5 text-foreground focus:outline-none"
              >
                <option value="all">All</option>
                <option value="perfect">Perfect (0 misses)</option>
                <option value="missed-once">Missed Once</option>
                <option value="missed-twice">Missed Twice</option>
                <option value="at-least-80">At Least 80%</option>
                <option value="at-least-70">At Least 70%</option>
                <option value="trending-up">Trending Up</option>
                <option value="fade">Fade / Under Angles</option>
              </select>
            </div>

            {/* Min sample */}
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Min Sample</label>
              <select
                value={filters.minSample}
                onChange={e => update("minSample", Number(e.target.value) as MinSample)}
                className="w-full text-xs bg-background border border-border/60 rounded px-2 py-1.5 text-foreground focus:outline-none"
              >
                <option value={3}>3+ games</option>
                <option value={5}>5+ games</option>
                <option value={8}>8+ games</option>
              </select>
            </div>

            {/* Sort by */}
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Sort By</label>
              <select
                value={filters.sortBy}
                onChange={e => update("sortBy", e.target.value as SortBy)}
                className="w-full text-xs bg-background border border-border/60 rounded px-2 py-1.5 text-foreground focus:outline-none"
              >
                <option value="hitrate">Hit Rate</option>
                <option value="projection">Projection</option>
                <option value="l5avg">L5 Avg</option>
                <option value="l10avg">L10 Avg</option>
                <option value="seasonavg">Season Avg</option>
                <option value="confidence">Confidence</option>
                <option value="diff">Diff vs Threshold</option>
              </select>
            </div>

            {/* Reset */}
            <div className="flex items-end">
              <button
                onClick={() => setFilters({ family: "disposals", threshold: 20, profile: "all", window: "last10", minSample: 3, sortBy: "hitrate" })}
                className="text-[11px] text-muted-foreground hover:text-foreground border border-border/40 rounded px-2 py-1.5 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* No live data warning */}
      {!cfg.hasLiveData && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3 text-xs text-amber-400">
          Live hit-rate data for {cfg.label} is not yet available in the Stat Board RPC. Use Disposals or Goals for live mining.
        </div>
      )}

      {/* Results — custom profile view */}
      {cfg.hasLiveData && (
        <>
          {filters.profile === "all" ? (
            // Show grouped sections when profile = all
            <div className="space-y-8">
              <Section title="Elite Hitters (Perfect / No Misses)" count={eliteRows.length}>
                <MiningTable rows={eliteRows} threshold={safeThreshold} family={filters.family} profile="perfect" />
              </Section>
              <Section title="Missed Once" count={missedOnce.length}>
                <MiningTable rows={missedOnce} threshold={safeThreshold} family={filters.family} profile="missed-once" />
              </Section>
              <Section title="Missed Twice" count={missedTwice.length}>
                <MiningTable rows={missedTwice} threshold={safeThreshold} family={filters.family} profile="missed-twice" />
              </Section>
              <Section title="Fade / Under Angles (Frequently Misses)" count={fadeRows.length}>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Players frequently missing this threshold — useful for fade / unders / market-check content. Data only, not advice.
                </p>
                <MiningTable rows={fadeRows} threshold={safeThreshold} family={filters.family} profile="fade" />
              </Section>
            </div>
          ) : (
            // Show filtered single section
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-medium text-foreground">
                  {allRows.length} players — {familyLabel} / {filters.profile}
                </span>
                {allRows.length > 0 && (
                  <CopyButton text={allRows.map(r =>
                    `${r.player_name} (${r.team_name} vs ${r.opponent_team_name}): ${fmtRate(r.hits, r.games)} [${fmtPct(r.rate)}] — ${r.reason}`
                  ).join("\n")} />
                )}
              </div>
              <MiningTable rows={allRows} threshold={safeThreshold} family={filters.family} profile={filters.profile} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Fantasy tab ────────────────────────────────────────────────────────────────

function FantasyTab({ rankings }: { rankings: RankingRow[] }) {
  const available = rankings.filter(r =>
    !r.is_injured && !r.is_bye && r.is_available !== false
  );

  if (available.length === 0) {
    return (
      <EmptyState
        message="No available rankings data"
        detail="Rankings may still be loading, or all players are on bye/injured. Check that the rankings cache is populated."
      />
    );
  }

  const topProj = [...available]
    .filter(r => r.projection != null)
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .slice(0, 10);

  const bestValue = [...available]
    .filter(r => r.value_score != null && (r.value_score) > 10)
    .sort((a, b) => ((b.value_score ?? 0) - (a.value_score ?? 0)))
    .slice(0, 8);

  const captains = [...available]
    .filter(r => r.captain_score != null && r.projection != null)
    .sort((a, b) => (b.captain_score ?? 0) - (a.captain_score ?? 0))
    .slice(0, 8);

  const traps = [...available]
    .filter(r => {
      const proj = r.projection ?? 0;
      const be = r.breakeven ?? 9999;
      const edge = r.edge ?? 0;
      return proj > 0 && proj < be && edge < -5;
    })
    .sort((a, b) => (a.edge ?? 0) - (b.edge ?? 0))
    .slice(0, 8);

  const priceMovers = [...available]
    .filter(r => r.edge != null && r.breakeven != null && r.price != null)
    .sort((a, b) => Math.abs(b.edge ?? 0) - Math.abs(a.edge ?? 0))
    .slice(0, 8);

  const highConfidence = [...available]
    .filter(r => r.confidence_label === "HIGH" && r.projection != null)
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <FantasySubSection title="Top Projected Scorers" icon={TrendingUp} rows={topProj} />
      <FantasySubSection title="High Confidence Picks" icon={BarChart} rows={highConfidence} />
      <FantasySubSection title="Best Value Picks" icon={Target} rows={bestValue} />
      <FantasySubSection title="Captain Picks" icon={Sword} rows={captains} />
      <FantasySubSection title="Biggest Price Movers" icon={ArrowUpRight} rows={priceMovers} />
      <FantasySubSection title="Trap / Fade Alerts" icon={AlertTriangle} rows={traps} warn />
    </div>
  );
}

function FantasySubSection({
  title, icon: Icon, rows, warn,
}: {
  title: string; icon: React.ElementType; rows: RankingRow[]; warn?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-[13px] font-semibold">{title}</h3>
        </div>
        <EmptyState message={`No ${title.toLowerCase()} data`} detail="May require more data in rankings cache." />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/40">
        <Icon className={`h-3.5 w-3.5 ${warn ? "text-amber-400" : "text-muted-foreground"}`} />
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <span className="text-[10px] text-muted-foreground bg-muted/40 border border-border/40 rounded px-1.5 py-0.5">{rows.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="pb-1.5 pr-3 font-medium">Player</th>
              <th className="pb-1.5 pr-2 font-medium">Pos</th>
              <th className="pb-1.5 pr-2 font-medium text-right">Proj</th>
              <th className="pb-1.5 pr-2 font-medium text-right">BE</th>
              <th className="pb-1.5 pr-2 font-medium text-right">Edge</th>
              <th className="pb-1.5 pr-2 font-medium text-right">L5</th>
              <th className="pb-1.5 pr-2 font-medium text-right">Ssn</th>
              <th className="pb-1.5 pr-3 font-medium">Signal</th>
              <th className="pb-1.5 font-medium">Conf</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.player_id ?? i} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  <div className="font-medium text-foreground">{r.player_name}</div>
                  <div className="text-[10px] text-muted-foreground">{r.team}</div>
                </td>
                <td className="py-1.5 pr-2 text-muted-foreground">{r.position ?? "—"}</td>
                <td className="py-1.5 pr-2 text-right font-semibold text-foreground">{r.projection != null ? Math.round(r.projection) : "—"}</td>
                <td className="py-1.5 pr-2 text-right text-muted-foreground">{r.breakeven != null ? Math.round(r.breakeven) : "—"}</td>
                <td className={`py-1.5 pr-2 text-right font-semibold ${(r.edge ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {r.edge != null ? `${r.edge >= 0 ? "+" : ""}${Math.round(r.edge)}` : "—"}
                </td>
                <td className="py-1.5 pr-2 text-right text-muted-foreground">{r.last_5_avg != null ? Math.round(r.last_5_avg) : "—"}</td>
                <td className="py-1.5 pr-2 text-right text-muted-foreground">{r.season_avg != null ? Math.round(r.season_avg) : "—"}</td>
                <td className="py-1.5 pr-3">
                  <span className="text-[10px] font-semibold text-sky-400">{r.signal_display ?? r.signal ?? "—"}</span>
                </td>
                <td className="py-1.5">
                  <span className={`text-[10px] font-semibold ${confidenceColor(r.confidence_label)}`}>
                    {r.confidence_label ?? "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Match Angles tab ─────────────────────────────────────────────────────────

function MatchAnglesTab({ teamDisposals, teamGoals }: {
  teamDisposals: StatBoardTeamRow[];
  teamGoals: StatBoardTeamRow[];
}) {
  const byScore = [...teamDisposals]
    .filter(t => t.projected_combined_score != null)
    .sort((a, b) => (b.projected_combined_score ?? 0) - (a.projected_combined_score ?? 0));

  const seenMatch = new Set<number>();
  const matchEnvs = byScore.filter(t => {
    if (seenMatch.has(t.match_id)) return false;
    seenMatch.add(t.match_id);
    return true;
  }).slice(0, 9);

  const byDisposalsConceded = [...teamDisposals]
    .filter(t => t.opponent_conceded_l5 != null)
    .sort((a, b) => (b.opponent_conceded_l5 ?? 0) - (a.opponent_conceded_l5 ?? 0))
    .slice(0, 8);

  const byGoalsConceded = [...teamGoals]
    .filter(t => t.opponent_conceded_l5 != null)
    .sort((a, b) => (b.opponent_conceded_l5 ?? 0) - (a.opponent_conceded_l5 ?? 0))
    .slice(0, 8);

  const hasAnyData = teamDisposals.length > 0 || teamGoals.length > 0;

  if (!hasAnyData) {
    return (
      <EmptyState
        message="No team match data loaded"
        detail="get_stat_board_team_rows returned no data. Team match data may not be available for this round yet."
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Match environments — only show if data exists */}
      {matchEnvs.length > 0 ? (
        <Section title="Match Environments by Projected Score">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="pb-1.5 pr-4 font-medium">Match</th>
                  <th className="pb-1.5 pr-3 font-medium text-right">Proj combined</th>
                  <th className="pb-1.5 pr-3 font-medium text-right">L5 comb avg</th>
                  <th className="pb-1.5 font-medium">Environment</th>
                </tr>
              </thead>
              <tbody>
                {matchEnvs.map(t => (
                  <tr key={t.match_id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                    <td className="py-1.5 pr-4 font-medium text-foreground whitespace-nowrap">{t.match_label}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold text-foreground">
                      {t.projected_combined_score != null ? Math.round(t.projected_combined_score) : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-muted-foreground">
                      {t.recent_combined_score_avg_l5 != null ? t.recent_combined_score_avg_l5.toFixed(0) : "—"}
                    </td>
                    <td className="py-1.5">
                      <span className={`text-[11px] font-medium ${
                        (t.projected_combined_score ?? 0) >= 180 ? "text-emerald-400"
                        : (t.projected_combined_score ?? 0) >= 150 ? "text-amber-400"
                        : "text-zinc-400"
                      }`}>
                        {t.scoring_environment_label ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : (
        <Section title="Match Environments by Projected Score">
          <div className="rounded-lg border border-border/40 bg-muted/5 px-4 py-3 text-[11px] text-muted-foreground">
            Projected match score data not available for this round. Disposal concession data below is still usable.
          </div>
        </Section>
      )}

      {/* Teams conceding disposals */}
      <Section title="Teams Conceding Most Disposals (L5)" count={byDisposalsConceded.length}>
        <p className="text-[11px] text-muted-foreground mb-3">Target players from the opposing team.</p>
        {byDisposalsConceded.length === 0 ? (
          <EmptyState message="No disposal conceded data available" detail="Requires team disposals data for current round." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="pb-1.5 pr-4 font-medium">Team (conceding)</th>
                  <th className="pb-1.5 pr-4 font-medium">vs (attack)</th>
                  <th className="pb-1.5 pr-3 font-medium text-right">L5 conceded avg</th>
                  <th className="pb-1.5 pr-3 font-medium text-right">Season avg</th>
                  <th className="pb-1.5 font-medium">Angle</th>
                </tr>
              </thead>
              <tbody>
                {byDisposalsConceded.map((t, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                    <td className="py-1.5 pr-4 font-medium text-foreground whitespace-nowrap">{t.opponent_team_name}</td>
                    <td className="py-1.5 pr-4 text-muted-foreground whitespace-nowrap">{t.team_name}</td>
                    <td className={`py-1.5 pr-3 text-right font-semibold ${(t.opponent_conceded_l5 ?? 0) >= 380 ? "text-emerald-400" : "text-foreground"}`}>
                      {t.opponent_conceded_l5 != null ? t.opponent_conceded_l5.toFixed(0) : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-muted-foreground">
                      {t.opponent_conceded_season != null ? t.opponent_conceded_season.toFixed(0) : "—"}
                    </td>
                    <td className="py-1.5 text-[11px] text-sky-400">Target {t.team_name} mids</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Teams conceding goals */}
      <Section title="Teams Conceding Most Goals (L5)" count={byGoalsConceded.length}>
        <p className="text-[11px] text-muted-foreground mb-3">Forward targeting opportunity.</p>
        {byGoalsConceded.length === 0 ? (
          <EmptyState message="No goals conceded data available" detail="Requires team goals data for current round." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="pb-1.5 pr-4 font-medium">Team (conceding)</th>
                  <th className="pb-1.5 pr-4 font-medium">vs (attack)</th>
                  <th className="pb-1.5 pr-3 font-medium text-right">L5 conceded avg</th>
                  <th className="pb-1.5 pr-3 font-medium text-right">Season avg</th>
                </tr>
              </thead>
              <tbody>
                {byGoalsConceded.map((t, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                    <td className="py-1.5 pr-4 font-medium text-foreground whitespace-nowrap">{t.opponent_team_name}</td>
                    <td className="py-1.5 pr-4 text-muted-foreground whitespace-nowrap">{t.team_name}</td>
                    <td className={`py-1.5 pr-3 text-right font-semibold ${(t.opponent_conceded_l5 ?? 0) >= 10 ? "text-emerald-400" : "text-foreground"}`}>
                      {t.opponent_conceded_l5 != null ? t.opponent_conceded_l5.toFixed(1) : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-muted-foreground">
                      {t.opponent_conceded_season != null ? t.opponent_conceded_season.toFixed(1) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Post Ideas tab ────────────────────────────────────────────────────────────

function AngleTagBadge({ tag }: { tag: AngleTag }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold border ${buildAngleTagCls(tag)}`}>
      {tag}
    </span>
  );
}

function PostFormatBadge({ format }: { format: PostFormat }) {
  const cfg: Record<PostFormat, { label: string; cls: string }> = {
    tiktok:    { label: "TikTok / Reel", cls: "bg-pink-950/40 text-pink-400 border-pink-500/20" },
    instagram: { label: "Instagram",     cls: "bg-amber-950/40 text-amber-400 border-amber-500/20" },
    reddit:    { label: "Reddit",        cls: "bg-orange-950/40 text-orange-400 border-orange-500/20" },
    twitter:   { label: "X / Twitter",   cls: "bg-sky-950/40 text-sky-400 border-sky-500/20" },
  };
  const { label, cls } = cfg[format];
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold border ${cls}`}>{label}</span>
  );
}

function PostCard({ post }: { post: PostTemplate }) {
  const fullText = post.format === "reddit"
    ? `${post.title}\n\n${post.hook}\n\n${post.cta}`
    : `${post.hook}\n\n${post.bullets.map(b => `• ${b}`).join("\n")}\n\n${post.cta}`;

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <AngleTagBadge tag={post.angleTag} />
            <PostFormatBadge format={post.format} />
          </div>
          <h4 className="text-sm font-semibold leading-snug">{post.title}</h4>
        </div>
        <CopyButton text={fullText} />
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Hook</p>
          <p className="text-xs text-foreground">{post.hook}</p>
        </div>
        {post.bullets.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Body</p>
            <ul className="space-y-0.5">
              {post.bullets.map((b, i) => (
                <li key={i} className="text-xs text-foreground flex gap-1.5">
                  <span className="text-muted-foreground shrink-0">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">CTA</p>
          <p className="text-xs text-foreground">{post.cta}</p>
        </div>
      </div>

      <div className="border-t border-border/40 pt-2">
        <textarea
          readOnly
          className="w-full h-16 text-xs font-mono text-muted-foreground bg-muted/10 rounded border border-border/40 p-2 resize-none focus:outline-none"
          value={fullText}
        />
      </div>
    </div>
  );
}

function buildPostTemplates(data: ContentIntelData): PostTemplate[] {
  const posts: PostTemplate[] = [];
  const rl = data.roundLabel;

  // Helper: get disposal players with threshold hit rate
  function dispPlayers(threshold: number, minRate: number, minGames: number) {
    return data.disposalPlayers
      .filter(p => {
        const hr = p.all_threshold_hit_rates?.[`${threshold}`];
        return hr && hr.games >= minGames && rateToFraction(hr.rate) >= minRate;
      })
      .sort((a, b) => {
        const ra = rateToFraction(a.all_threshold_hit_rates![`${threshold}`].rate);
        const rb = rateToFraction(b.all_threshold_hit_rates![`${threshold}`].rate);
        return rb - ra;
      });
  }

  function goalPlayers(threshold: number, minRate: number, minGames: number) {
    return data.goalPlayers
      .filter(p => {
        const hr = p.all_threshold_hit_rates?.[`${threshold}`];
        return hr && hr.games >= minGames && rateToFraction(hr.rate) >= minRate;
      })
      .sort((a, b) => {
        const ra = rateToFraction(a.all_threshold_hit_rates![`${threshold}`].rate);
        const rb = rateToFraction(b.all_threshold_hit_rates![`${threshold}`].rate);
        return rb - ra;
      });
  }

  // ── Disposals posts ────────────────────────────────────────────────────────

  const elite20 = dispPlayers(20, 0.75, 5).slice(0, 5);
  if (elite20.length >= 3) {
    const bullets = elite20.map(p => {
      const hr = p.all_threshold_hit_rates!["20"];
      return `${p.player_name} (${p.team_name} vs ${p.opponent_team_name}): ${fmtRate(hr.hits, hr.games)} [${fmtPct(hr.rate)}], L10 avg ${p.last_10_avg?.toFixed(1) ?? "—"}`;
    });
    posts.push({
      id: "disp-20-tiktok", format: "tiktok", angleTag: "Safe",
      title: `${elite20.length} players locked in for 20+ disposals — ${rl}`,
      hook: "These midfielders have been automatic for 20+ disposals. Here's who to target.",
      bullets, cta: "Full Stat Board at Neeko Sports Stats.",
    });
    posts.push({
      id: "disp-20-instagram", format: "instagram", angleTag: "Safe",
      title: `20+ Disposal Machines — ${rl}`,
      hook: "Swipe for the players hitting 20+ disposals most consistently right now.",
      bullets, cta: "Full breakdown at Neeko Sports Stats — link in bio.",
    });
    const redditBody = bullets.map(b => `- ${b}`).join("\n");
    posts.push({
      id: "disp-20-reddit", format: "reddit", angleTag: "Safe",
      title: `[${rl}] Players with strong 20+ disposal hit rates`,
      hook: `Going into ${rl}, here are the players most consistently hitting 20+ disposals over their recent games:\n\n${redditBody}\n\nData from Neeko Sports Stats Stat Board.`,
      bullets: [], cta: "More thresholds and full breakdown on the Stat Board.",
    });
  }

  const elite25 = dispPlayers(25, 0.70, 4).slice(0, 4);
  if (elite25.length >= 2) {
    const bullets = elite25.map(p => {
      const hr = p.all_threshold_hit_rates!["25"];
      return `${p.player_name}: ${fmtRate(hr.hits, hr.games)} for 25+ [${fmtPct(hr.rate)}]`;
    });
    posts.push({
      id: "disp-25-twitter", format: "twitter", angleTag: "High Confidence",
      title: `25+ disposal trend players — ${rl}`,
      hook: `Strong 25+ disposal hit rates going into ${rl}:`,
      bullets, cta: "Full Stat Board @ Neeko Sports Stats",
    });
    posts.push({
      id: "disp-25-instagram", format: "instagram", angleTag: "High Confidence",
      title: `25+ Disposal Elites — ${rl}`,
      hook: "Who's been a machine for 25+ disposals? These names keep delivering.",
      bullets, cta: "Check the full breakdown at Neeko Sports Stats.",
    });
  }

  const elite30 = dispPlayers(30, 0.55, 4).slice(0, 4);
  if (elite30.length >= 2) {
    const bullets = elite30.map(p => {
      const hr = p.all_threshold_hit_rates!["30"];
      return `${p.player_name} (${p.team_name}): ${fmtRate(hr.hits, hr.games)} for 30+ [${fmtPct(hr.rate)}]`;
    });
    posts.push({
      id: "disp-30-twitter", format: "twitter", angleTag: "Volatile Upside",
      title: `Players hitting 30+ disposals at high rates — ${rl}`,
      hook: `If you're targeting elite disposal volume, these names deserve attention:`,
      bullets, cta: "Full data at Neeko Sports Stats",
    });
  }

  // ── Goals posts ─────────────────────────────────────────────────────────────

  const g1 = goalPlayers(1, 0.75, 5).slice(0, 6);
  if (g1.length >= 3) {
    const bullets = g1.map(p => {
      const hr = p.all_threshold_hit_rates!["1"];
      return `${p.player_name} (${p.team_name} vs ${p.opponent_team_name}): ${fmtRate(hr.hits, hr.games)} for 1+ goals [${fmtPct(hr.rate)}]`;
    });
    posts.push({
      id: "goals-1-tiktok", format: "tiktok", angleTag: "Safe",
      title: `Forwards with consistent goal-scoring trends — ${rl}`,
      hook: "These forwards have been kicking goals at a high rate recently. Here's the shortlist.",
      bullets, cta: "Full Stat Board at Neeko Sports Stats.",
    });
    posts.push({
      id: "goals-1-twitter", format: "twitter", angleTag: "Safe",
      title: `1+ goal trend forwards — ${rl}`,
      hook: `Forwards with strong 1+ goal hit rates this week:`,
      bullets: bullets.slice(0, 4), cta: "Full data @ Neeko Sports Stats",
    });
  }

  const g2 = goalPlayers(2, 0.55, 4).slice(0, 5);
  if (g2.length >= 2) {
    const bullets = g2.map(p => {
      const hr = p.all_threshold_hit_rates!["2"];
      return `${p.player_name} (${p.team_name}): ${fmtRate(hr.hits, hr.games)} for 2+ goals [${fmtPct(hr.rate)}]`;
    });
    posts.push({
      id: "goals-2-instagram", format: "instagram", angleTag: "High Confidence",
      title: `2+ Goal Trend Forwards — ${rl}`,
      hook: "Who's been a consistent multiple-goal scorer? Swipe for the data.",
      bullets, cta: "Full Stat Board at Neeko Sports Stats — link in bio.",
    });
    posts.push({
      id: "goals-2-reddit", format: "reddit", angleTag: "High Confidence",
      title: `[${rl}] Players with strong 2+ goal hit rates`,
      hook: `Here are the forwards consistently hitting 2+ goals going into ${rl}:\n\n${bullets.map(b => `- ${b}`).join("\n")}\n\nData from Neeko Sports Stats.`,
      bullets: [], cta: "More breakdowns at Neeko Sports Stats.",
    });
  }

  const g3 = goalPlayers(3, 0.40, 4).slice(0, 4);
  if (g3.length >= 2) {
    const bullets = g3.map(p => {
      const hr = p.all_threshold_hit_rates!["3"];
      return `${p.player_name}: ${fmtRate(hr.hits, hr.games)} for 3+ [${fmtPct(hr.rate)}]`;
    });
    posts.push({
      id: "goals-3-twitter", format: "twitter", angleTag: "Volatile Upside",
      title: `3+ goal bag merchants — ${rl}`,
      hook: `Forwards who've been bagging 3+ goals recently:`,
      bullets, cta: "More data at Neeko Sports Stats",
    });
  }

  // ── Fantasy posts ────────────────────────────────────────────────────────────

  const fantasyTop = data.rankings
    .filter(r => !r.is_injured && !r.is_bye && r.projection != null && r.confidence_label === "HIGH")
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .slice(0, 6);

  if (fantasyTop.length >= 3) {
    const bullets = fantasyTop.map(r =>
      `${r.player_name} (${r.team}): Proj ${Math.round(r.projection!)} — ${r.signal_display ?? r.signal ?? "START"}`
    );
    posts.push({
      id: "fantasy-top-instagram", format: "instagram", angleTag: "High Confidence",
      title: `AFL Fantasy top projections — ${rl}`,
      hook: "Who are the model's top projected scorers this round? Here are the high-confidence picks.",
      bullets, cta: "Full Fantasy rankings at Neeko Sports Stats — link in bio.",
    });
    posts.push({
      id: "fantasy-top-twitter", format: "twitter", angleTag: "High Confidence",
      title: `AFL Fantasy high-confidence projections — ${rl}`,
      hook: `Top projected scores going into ${rl}:`,
      bullets: bullets.slice(0, 4), cta: "Full rankings @ Neeko Sports Stats",
    });
    posts.push({
      id: "fantasy-top-tiktok", format: "tiktok", angleTag: "High Confidence",
      title: `Fantasy beast mode picks — ${rl}`,
      hook: "These AFL Fantasy players are the model's highest confidence picks this round.",
      bullets, cta: "Check projections and rankings at Neeko Sports Stats.",
    });
  }

  // ── Captain posts ───────────────────────────────────────────────────────────

  const captains = data.rankings
    .filter(r => !r.is_injured && !r.is_bye && r.captain_score != null && r.projection != null)
    .sort((a, b) => (b.captain_score ?? 0) - (a.captain_score ?? 0))
    .slice(0, 5);

  if (captains.length >= 3) {
    const bullets = captains.map(r =>
      `${r.player_name} (${r.team}): ${r.captain_rating ?? "Strong"} captain, proj ${Math.round(r.projection!)}`
    );
    posts.push({
      id: "captain-tiktok", format: "tiktok", angleTag: "Captain",
      title: `AFL Fantasy captain picks — ${rl}`,
      hook: "The model's top captain options going into this round. Lock one in.",
      bullets, cta: "Full captain analysis at Neeko Sports Stats.",
    });
    posts.push({
      id: "captain-reddit", format: "reddit", angleTag: "Captain",
      title: `[${rl}] AFL Fantasy captain rankings`,
      hook: `Here are the model's top-rated captain options for ${rl}:\n\n${bullets.map(b => `- ${b}`).join("\n")}\n\nBased on projection, ceiling, and consistency scores from Neeko Sports Stats.`,
      bullets: [], cta: "Full captain breakdown at Neeko Sports Stats.",
    });
  }

  // ── Value posts ──────────────────────────────────────────────────────────────

  const valuePicksRaw = data.rankings
    .filter(r => !r.is_injured && !r.is_bye && r.value_score != null && (r.value_score) > 15)
    .sort((a, b) => ((b.value_score ?? 0) - (a.value_score ?? 0)))
    .slice(0, 5);

  if (valuePicksRaw.length >= 2) {
    const bullets = valuePicksRaw.map(r =>
      `${r.player_name} (${r.team}): Proj ${Math.round(r.projection ?? 0)}, BE ${Math.round(r.breakeven ?? 0)}, +${Math.round(r.value_score!)} edge`
    );
    posts.push({
      id: "value-twitter", format: "twitter", angleTag: "Value",
      title: `Best value picks — ${rl}`,
      hook: `Players whose projection beats their breakeven by the widest margin:`,
      bullets, cta: "Full value rankings @ Neeko Sports Stats",
    });
    posts.push({
      id: "value-instagram", format: "instagram", angleTag: "Value",
      title: `AFL Fantasy Value Angles — ${rl}`,
      hook: "Projection well above breakeven? These are the value plays the model likes this week.",
      bullets, cta: "Full value analysis at Neeko Sports Stats — link in bio.",
    });
  }

  // ── Trap / fade posts ────────────────────────────────────────────────────────

  const traps = data.rankings
    .filter(r => {
      const proj = r.projection ?? 0;
      const be = r.breakeven ?? 9999;
      return proj > 0 && proj < be;
    })
    .sort((a, b) => ((a.edge ?? 0) - (b.edge ?? 0)))
    .slice(0, 5);

  if (traps.length >= 2) {
    const bullets = traps.map(r =>
      `${r.player_name} (${r.team}): Proj ${Math.round(r.projection ?? 0)} vs BE ${Math.round(r.breakeven ?? 0)} — negative edge`
    );
    posts.push({
      id: "trap-twitter", format: "twitter", angleTag: "Fade",
      title: `AFL Fantasy trap check — ${rl}`,
      hook: "Players the model has flagged as potential traps (proj below breakeven) — worth checking ownership:",
      bullets: bullets.slice(0, 4), cta: "Full trap analysis @ Neeko Sports Stats",
    });
    posts.push({
      id: "trap-instagram", format: "instagram", angleTag: "Fade",
      title: `Market Check — Traps to Monitor — ${rl}`,
      hook: "These players have projection below their breakeven. Worth checking before locking in.",
      bullets, cta: "Full rankings and trap signals at Neeko Sports Stats.",
    });
  }

  // ── Disposal fade angles ────────────────────────────────────────────────────

  const dispFade = data.disposalPlayers
    .filter(p => {
      const hr = p.all_threshold_hit_rates?.["20"];
      return hr && rateToFraction(hr.rate) < 0.40 && hr.games >= 5 && (p.last_10_avg ?? 0) > 15;
    })
    .sort((a, b) => rateToFraction(a.all_threshold_hit_rates!["20"].rate) - rateToFraction(b.all_threshold_hit_rates!["20"].rate))
    .slice(0, 4);

  if (dispFade.length >= 2) {
    const bullets = dispFade.map(p => {
      const hr = p.all_threshold_hit_rates!["20"];
      return `${p.player_name} (${p.team_name}): Only ${fmtPct(hr.rate)} for 20+ disposals over ${hr.games} games despite ${p.last_10_avg?.toFixed(1)} avg`;
    });
    posts.push({
      id: "disp-fade-twitter", format: "twitter", angleTag: "Fade",
      title: `Disposal fade angles — ${rl}`,
      hook: "Players with low hit rates at the 20+ disposal threshold — worth monitoring for unders content:",
      bullets, cta: "Full Stat Board data @ Neeko Sports Stats",
    });
  }

  // ── Matchup attack posts ─────────────────────────────────────────────────────

  const dispConcedTeams = [...data.teamDisposals]
    .filter(t => t.opponent_conceded_l5 != null)
    .sort((a, b) => (b.opponent_conceded_l5 ?? 0) - (a.opponent_conceded_l5 ?? 0))
    .slice(0, 3);

  if (dispConcedTeams.length >= 1) {
    const bullets = dispConcedTeams.map(t =>
      `${t.team_name} face ${t.opponent_team_name} — ${t.opponent_team_name} conceding ${t.opponent_conceded_l5?.toFixed(0)} avg disposals L5`
    );
    posts.push({
      id: "matchup-disp-reddit", format: "reddit", angleTag: "Matchup Attack",
      title: `[${rl}] Teams conceding most disposals — target their midfielders`,
      hook: `Going into ${rl}, here are the teams conceding the most disposals to opponents over their last 5 games:\n\n${bullets.map(b => `- ${b}`).join("\n")}\n\nData from Neeko Sports Stats.`,
      bullets: [], cta: "Full match angles at Neeko Sports Stats.",
    });
    posts.push({
      id: "matchup-disp-twitter", format: "twitter", angleTag: "Matchup Attack",
      title: `Disposal matchup attacks — ${rl}`,
      hook: "Teams conceding big disposal numbers — target their opponents' midfielders:",
      bullets, cta: "Full matchup analysis @ Neeko Sports Stats",
    });
  }

  const goalConcedTeams = [...data.teamGoals]
    .filter(t => t.opponent_conceded_l5 != null)
    .sort((a, b) => (b.opponent_conceded_l5 ?? 0) - (a.opponent_conceded_l5 ?? 0))
    .slice(0, 3);

  if (goalConcedTeams.length >= 1) {
    const bullets = goalConcedTeams.map(t =>
      `${t.team_name} face ${t.opponent_team_name} — ${t.opponent_team_name} conceding ${t.opponent_conceded_l5?.toFixed(1)} goals/game L5`
    );
    posts.push({
      id: "matchup-goals-instagram", format: "instagram", angleTag: "Team Concession",
      title: `Goal concession matchup angles — ${rl}`,
      hook: "These teams are leaking goals. Target their opponents' forwards.",
      bullets, cta: "Full match angles at Neeko Sports Stats — link in bio.",
    });
  }

  // ── Consistency posts ────────────────────────────────────────────────────────

  const perfectDisp = data.disposalPlayers
    .filter(p => {
      const hr = p.all_threshold_hit_rates?.["20"];
      return hr && rateToFraction(hr.rate) === 1.0 && hr.games >= 6;
    })
    .sort((a, b) => (b.all_threshold_hit_rates!["20"].games) - (a.all_threshold_hit_rates!["20"].games))
    .slice(0, 5);

  if (perfectDisp.length >= 2) {
    const bullets = perfectDisp.map(p => {
      const hr = p.all_threshold_hit_rates!["20"];
      return `${p.player_name} (${p.team_name}): ${hr.games}/${hr.games} — perfect record, ${p.last_10_avg?.toFixed(1)} avg`;
    });
    posts.push({
      id: "consistency-tiktok", format: "tiktok", angleTag: "Consistency",
      title: `Perfect 20+ disposal records this season — ${rl}`,
      hook: "These players have not missed 20 disposals once in their recorded games this season.",
      bullets, cta: "Full Stat Board at Neeko Sports Stats.",
    });
    posts.push({
      id: "consistency-reddit", format: "reddit", angleTag: "Consistency",
      title: `[${rl}] Players with perfect 20+ disposal hit rates this season`,
      hook: `The most consistent disposal performers right now — zero misses:\n\n${bullets.map(b => `- ${b}`).join("\n")}\n\nData from Neeko Sports Stats.`,
      bullets: [], cta: "Full consistency breakdown at Neeko Sports Stats.",
    });
  }

  // ── Current round spotlight post ─────────────────────────────────────────────

  if (data.matches.length > 0) {
    const roundMatchLabels = data.matches.slice(0, 5).map(m => m.match_label);
    posts.push({
      id: "round-spotlight-twitter", format: "twitter", angleTag: "Current Round",
      title: `${rl} — Round ${data.currentRound} matchups and angles`,
      hook: `${rl} kicks off with ${data.matches.length} games. Matches to watch:`,
      bullets: roundMatchLabels, cta: "Full Stat Board and fantasy rankings @ Neeko Sports Stats",
    });
    posts.push({
      id: "round-spotlight-tiktok", format: "tiktok", angleTag: "Current Round",
      title: `Round ${data.currentRound} AFL Fantasy preview`,
      hook: `Round ${data.currentRound} is here — here's your quick guide to the must-watch matchups and top fantasy targets.`,
      bullets: roundMatchLabels.slice(0, 4), cta: "Full round preview at Neeko Sports Stats.",
    });
  }

  // ── Market check ────────────────────────────────────────────────────────────

  const marketChecks = data.rankings
    .filter(r => !r.is_injured && !r.is_bye && r.price != null && r.prev_price != null)
    .filter(r => Math.abs((r.price_change ?? 0)) > 30000)
    .sort((a, b) => Math.abs(b.price_change ?? 0) - Math.abs(a.price_change ?? 0))
    .slice(0, 5);

  if (marketChecks.length >= 2) {
    const bullets = marketChecks.map(r =>
      `${r.player_name} (${r.team}): ${(r.price_change ?? 0) > 0 ? "↑" : "↓"} $${Math.abs(Math.round((r.price_change ?? 0) / 1000))}k — now $${Math.round((r.price ?? 0) / 1000)}k`
    );
    posts.push({
      id: "market-check-twitter", format: "twitter", angleTag: "Market Check",
      title: `AFL Fantasy price movers — ${rl}`,
      hook: `Biggest price changes going into ${rl}:`,
      bullets, cta: "Full price and value tracking @ Neeko Sports Stats",
    });
  }

  return posts;
}

type PostAngleFilter = "all" | AngleTag;

function PostIdeasTab({ data }: { data: ContentIntelData }) {
  const [angleFilter, setAngleFilter] = useState<PostAngleFilter>("all");
  const allPosts = buildPostTemplates(data);
  const tags = Array.from(new Set(allPosts.map(p => p.angleTag)));

  const filtered = angleFilter === "all"
    ? allPosts
    : allPosts.filter(p => p.angleTag === angleFilter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {allPosts.length} post packs generated from live data. No AI — all stat-generated.
        </p>
        <span className="text-[11px] text-muted-foreground">Showing {filtered.length}</span>
      </div>

      {/* Angle tag filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setAngleFilter("all")}
          className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${angleFilter === "all" ? "bg-foreground/10 text-foreground border-border" : "text-muted-foreground border-border/40 hover:text-foreground"}`}
        >
          All ({allPosts.length})
        </button>
        {tags.map(tag => {
          const count = allPosts.filter(p => p.angleTag === tag).length;
          return (
            <button
              key={tag}
              onClick={() => setAngleFilter(tag)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                angleFilter === tag
                  ? `${buildAngleTagCls(tag)}`
                  : "text-muted-foreground border-border/40 hover:text-foreground"
              }`}
            >
              {tag} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          message="Not enough data to generate posts in this category"
          detail="Stat Board data must include at least 3 players with 5+ game trends."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map(post => <PostCard key={post.id} post={post} />)}
        </div>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export default function AdminContentIntel() {
  const [tab, setTab] = useState<MainTab>("mining");
  const [data, setData] = useState<ContentIntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!supabase) { setError("Supabase not initialised"); setLoading(false); return; }
    setLoading(true);
    setError(null);

    try {
      // Step 1: Get current round matches
      const matchesRes = await supabase.rpc("get_stat_board_matches", {
        p_season: 2026,
        p_round: null,
      });
      const matches: StatBoardMatch[] = (matchesRes.data as StatBoardMatch[]) ?? [];
      const currentRound = matches[0]?.week ?? 0;
      const roundLabel = currentRound > 0 ? `Round ${currentRound}` : "Current Round";

      // Step 2: Fetch all data for current round concurrently
      const [dispRes, goalRes, rankingsRes, teamDispRes, teamGoalRes] = await Promise.allSettled([
        supabase.rpc("get_stat_board_players", {
          p_season: 2026,
          p_round: currentRound > 0 ? currentRound : null,
          p_match_id: null,
          p_lens: "disposals",
          p_threshold: 20,
          p_position_group: null,
          p_team_id: null,
          p_search: null,
          p_limit: 500,
          p_offset: 0,
        }),
        supabase.rpc("get_stat_board_players", {
          p_season: 2026,
          p_round: currentRound > 0 ? currentRound : null,
          p_match_id: null,
          p_lens: "goals",
          p_threshold: 1,
          p_position_group: null,
          p_team_id: null,
          p_search: null,
          p_limit: 500,
          p_offset: 0,
        }),
        supabase.rpc("get_rankings_safe", {
          p_user_id: null,
          p_is_bot: false,
          p_limit: 500,
        }),
        supabase.rpc("get_stat_board_team_rows", {
          p_season: 2026,
          p_round: currentRound > 0 ? currentRound : null,
          p_match_id: null,
          p_lens: "disposals",
        }),
        supabase.rpc("get_stat_board_team_rows", {
          p_season: 2026,
          p_round: currentRound > 0 ? currentRound : null,
          p_match_id: null,
          p_lens: "goals",
        }),
      ]);

      const disposalPlayers: StatBoardPlayer[] = dispRes.status === "fulfilled"
        ? ((dispRes.value.data as StatBoardPlayer[]) ?? []) : [];
      const goalPlayers: StatBoardPlayer[] = goalRes.status === "fulfilled"
        ? ((goalRes.value.data as StatBoardPlayer[]) ?? []) : [];
      const rankings: RankingRow[] = rankingsRes.status === "fulfilled"
        ? ((rankingsRes.value.data as RankingRow[]) ?? []) : [];
      const teamDisposals: StatBoardTeamRow[] = teamDispRes.status === "fulfilled"
        ? ((teamDispRes.value.data as StatBoardTeamRow[]) ?? []) : [];
      const teamGoals: StatBoardTeamRow[] = teamGoalRes.status === "fulfilled"
        ? ((teamGoalRes.value.data as StatBoardTeamRow[]) ?? []) : [];

      // Diagnostics
      const errs: string[] = [];
      if (dispRes.status === "rejected") errs.push(`Disposal players: ${dispRes.reason}`);
      if (goalRes.status === "rejected") errs.push(`Goal players: ${goalRes.reason}`);
      if (rankingsRes.status === "rejected") errs.push(`Rankings: ${rankingsRes.reason}`);
      if (errs.length > 0) console.warn("[ContentIntel] Partial fetch errors:", errs);

      setData({
        matches,
        disposalPlayers,
        goalPlayers,
        teamDisposals,
        teamGoals,
        rankings,
        currentRound,
        roundLabel,
        loadedAt: new Date(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetchAll();
  }, [fetchAll]);

  const TABS: { id: MainTab; label: string; icon: React.ElementType }[] = [
    { id: "mining",  label: "Content Mining",  icon: Filter },
    { id: "fantasy", label: "Fantasy Angles",  icon: TrendingUp },
    { id: "match",   label: "Match Angles",    icon: Zap },
    { id: "posts",   label: "Post Ideas",      icon: FileText },
  ];

  const miningTotal = data
    ? data.disposalPlayers.filter(p => {
        const hr = p.all_threshold_hit_rates?.["20"];
        return hr && hr.games >= 3 && rateToFraction(hr.rate) >= 0.65;
      }).length
    : 0;

  const fantasyTotal = data
    ? data.rankings.filter(r => !r.is_injured && !r.is_bye && r.projection != null).length
    : 0;

  return (
    <div>
      <AdminPageHeader
        icon={Lightbulb}
        title="Content Intel"
        description="Content mining tool — live AFL stat angles, fantasy signals, and post generation. Stats only, no AI."
        badge="Stats Only — No AI"
        loading={loading}
        actions={
          <button
            onClick={fetchAll}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-muted-foreground hover:text-foreground border border-border/50 hover:border-border transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <SummaryCard
          label="Current Round"
          value={loading ? "Loading…" : data?.currentRound ? `Round ${data.currentRound}` : "—"}
          sub={data ? `${data.matches.length} matches` : undefined}
          accent={data?.currentRound ? "text-sky-400" : undefined}
        />
        <SummaryCard
          label="Disposal players"
          value={loading ? "—" : `${data?.disposalPlayers.length ?? 0}`}
          sub="With hit-rate data"
        />
        <SummaryCard
          label="Mining angles"
          value={loading ? "—" : `${miningTotal}`}
          sub="65%+ hit rate, 20+ disp"
        />
        <SummaryCard
          label="Fantasy picks"
          value={loading ? "—" : `${fantasyTotal}`}
          sub="Available ranked players"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-950/10 px-4 py-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-0.5 border-b border-border/40 mb-5 overflow-x-auto -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`relative flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium whitespace-nowrap transition-colors ${
              tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
            {tab === id && <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t bg-foreground" />}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading live data…</span>
        </div>
      )}

      {!loading && data && (
        <>
          {tab === "mining"  && <ContentMiningTab data={data} />}
          {tab === "fantasy" && <FantasyTab rankings={data.rankings} />}
          {tab === "match"   && <MatchAnglesTab teamDisposals={data.teamDisposals} teamGoals={data.teamGoals} />}
          {tab === "posts"   && <PostIdeasTab data={data} />}
        </>
      )}

      {!loading && !data && !error && (
        <EmptyState message="No data loaded" detail="Click Refresh to load live data." />
      )}
    </div>
  );
}
