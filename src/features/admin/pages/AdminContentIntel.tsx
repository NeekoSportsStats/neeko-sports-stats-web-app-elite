import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RefreshCw, Copy, Check, TrendingUp, Target, Zap, FileText, TriangleAlert as AlertTriangle, ChartBar as BarChart2, Users, Sword, Lightbulb } from "lucide-react";
import { AdminPageHeader } from "@/features/admin/shared/AdminPageHeader";
import type { StatBoardPlayer, StatBoardMatch, ThresholdHitRate } from "@/features/afl/stat-board/types";
import type { StatBoardTeamRow } from "@/features/afl/stat-board/teamTypes";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { buildStatGeneratedWhy } from "@/features/afl/fantasy/utils/buildStatGeneratedWhy";

const SEASON = 2026;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContentIntelData {
  matches: StatBoardMatch[];
  disposalPlayers: StatBoardPlayer[];
  goalPlayers: StatBoardPlayer[];
  teamDisposals: StatBoardTeamRow[];
  teamGoals: StatBoardTeamRow[];
  rankings: RankingRow[];
  roundLabel: string;
  loadedAt: Date;
}

interface PostTemplate {
  id: string;
  format: "tiktok" | "instagram" | "reddit" | "twitter";
  title: string;
  hook: string;
  bullets: string[];
  cta: string;
}

type Tab = "stat-angles" | "fantasy" | "match" | "posts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRate(hits: number, games: number): string {
  return `${hits}/${games}`;
}

function fmtPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function confidenceColor(label: string | null): string {
  if (label === "HIGH") return "text-emerald-400";
  if (label === "MEDIUM") return "text-amber-400";
  return "text-zinc-400";
}

function confidenceBg(label: string | null): string {
  if (label === "HIGH") return "bg-emerald-950/40 text-emerald-400 border-emerald-500/20";
  if (label === "MEDIUM") return "bg-amber-950/40 text-amber-400 border-amber-500/20";
  return "bg-zinc-900 text-zinc-400 border-zinc-700/30";
}

function hitRateBg(rate: number): string {
  if (rate >= 0.85) return "text-emerald-400";
  if (rate >= 0.65) return "text-amber-400";
  return "text-zinc-400";
}

function actionColor(action: string | null): string {
  const a = (action ?? "").toUpperCase();
  if (a.includes("STRONG") || a.includes("SMASH")) return "text-emerald-400";
  if (a === "START") return "text-sky-400";
  if (a === "HOLD") return "text-zinc-300";
  if (a.includes("SIT")) return "text-red-400";
  return "text-zinc-400";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-0.5 leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function EmptyState({ message, detail }: { message: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <AlertTriangle className="h-5 w-5 text-amber-500 mb-2" />
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
      {detail && <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">{detail}</p>}
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
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── Disposal section ─────────────────────────────────────────────────────────

interface DisposalSectionProps {
  players: StatBoardPlayer[];
  threshold: number;
  label: string;
}

function DisposalSection({ players, threshold, label }: DisposalSectionProps) {
  const key = `${threshold}`;
  const filtered = players
    .filter(p => {
      const hr = p.all_threshold_hit_rates?.[key];
      return hr && hr.games >= 4;
    })
    .map(p => ({ p, hr: p.all_threshold_hit_rates![key] }))
    .sort((a, b) => b.hr.rate - a.hr.rate || b.hr.hits - a.hr.hits)
    .slice(0, 8);

  if (filtered.length === 0) {
    return <EmptyState message={`No ${label} data found`} detail="Requires at least 4 games of disposal data from Stat Board." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="pb-2 pr-4 font-medium">Player</th>
            <th className="pb-2 pr-4 font-medium">Team</th>
            <th className="pb-2 pr-4 font-medium">vs</th>
            <th className="pb-2 pr-3 font-medium text-right">Hit rate</th>
            <th className="pb-2 pr-3 font-medium text-right">Rate</th>
            <th className="pb-2 pr-3 font-medium text-right">L10 avg</th>
            <th className="pb-2 pr-3 font-medium text-right">Proj</th>
            <th className="pb-2 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(({ p, hr }) => {
            const reason = buildDisposalReason(p, threshold, hr);
            return (
              <tr key={p.player_id} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                <td className="py-2 pr-4">
                  <div className="font-medium text-foreground">{p.player_name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[220px] leading-snug">{reason}</div>
                </td>
                <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{p.team_name}</td>
                <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{p.opponent_team_name}</td>
                <td className={`py-2 pr-3 text-right font-mono font-semibold whitespace-nowrap ${hitRateBg(hr.rate)}`}>
                  {fmtRate(hr.hits, hr.games)}
                </td>
                <td className={`py-2 pr-3 text-right font-semibold whitespace-nowrap ${hitRateBg(hr.rate)}`}>
                  {fmtPct(hr.rate)}
                </td>
                <td className="py-2 pr-3 text-right text-muted-foreground whitespace-nowrap">
                  {p.last_10_avg != null ? p.last_10_avg.toFixed(1) : "—"}
                </td>
                <td className="py-2 pr-3 text-right text-muted-foreground whitespace-nowrap">
                  {p.projection != null ? Math.round(p.projection) : "—"}
                </td>
                <td className="py-2">
                  <span className={`text-[10px] font-semibold ${confidenceColor(p.confidence_label)}`}>
                    {p.confidence_label ?? "—"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function buildDisposalReason(p: StatBoardPlayer, threshold: number, hr: ThresholdHitRate): string {
  const avg = p.last_10_avg != null ? p.last_10_avg.toFixed(1) : null;
  const proj = p.projection != null ? Math.round(p.projection) : null;
  const pct = Math.round(hr.rate * 100);
  let s = `Cleared ${threshold}+ disposals in ${hr.hits} of last ${hr.games} recorded games`;
  if (avg) s += `, averaging ${avg} disposals`;
  if (proj) s += ` with a current projection of ${proj}`;
  s += ".";
  if (pct === 100 && hr.games >= 5) s = `Perfect hit rate — ` + s;
  return s;
}

// ─── Goals section ────────────────────────────────────────────────────────────

function GoalSection({ players, threshold }: { players: StatBoardPlayer[]; threshold: number }) {
  const key = `${threshold}`;
  const filtered = players
    .filter(p => {
      const hr = p.all_threshold_hit_rates?.[key];
      return hr && hr.games >= 4;
    })
    .map(p => ({ p, hr: p.all_threshold_hit_rates![key] }))
    .sort((a, b) => b.hr.rate - a.hr.rate || b.hr.hits - a.hr.hits)
    .slice(0, 8);

  if (filtered.length === 0) {
    return <EmptyState message={`No ${threshold}+ goal data found`} detail="Requires at least 4 games of goal data from Stat Board." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="pb-2 pr-4 font-medium">Player</th>
            <th className="pb-2 pr-4 font-medium">Team</th>
            <th className="pb-2 pr-4 font-medium">vs</th>
            <th className="pb-2 pr-3 font-medium text-right">Hit rate</th>
            <th className="pb-2 pr-3 font-medium text-right">Rate</th>
            <th className="pb-2 pr-3 font-medium text-right">L10 avg</th>
            <th className="pb-2 pr-3 font-medium text-right">Proj</th>
            <th className="pb-2 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(({ p, hr }) => {
            const reason = buildGoalReason(p, threshold, hr);
            return (
              <tr key={p.player_id} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                <td className="py-2 pr-4">
                  <div className="font-medium text-foreground">{p.player_name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[220px] leading-snug">{reason}</div>
                </td>
                <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{p.team_name}</td>
                <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{p.opponent_team_name}</td>
                <td className={`py-2 pr-3 text-right font-mono font-semibold whitespace-nowrap ${hitRateBg(hr.rate)}`}>
                  {fmtRate(hr.hits, hr.games)}
                </td>
                <td className={`py-2 pr-3 text-right font-semibold whitespace-nowrap ${hitRateBg(hr.rate)}`}>
                  {fmtPct(hr.rate)}
                </td>
                <td className="py-2 pr-3 text-right text-muted-foreground whitespace-nowrap">
                  {p.last_10_avg != null ? p.last_10_avg.toFixed(1) : "—"}
                </td>
                <td className="py-2 pr-3 text-right text-muted-foreground whitespace-nowrap">
                  {p.projection != null ? Math.round(p.projection) : "—"}
                </td>
                <td className="py-2">
                  <span className={`text-[10px] font-semibold ${confidenceColor(p.confidence_label)}`}>
                    {p.confidence_label ?? "—"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function buildGoalReason(p: StatBoardPlayer, threshold: number, hr: ThresholdHitRate): string {
  const avg = p.last_10_avg != null ? p.last_10_avg.toFixed(1) : null;
  const proj = p.projection != null ? Math.round(p.projection) : null;
  let s = `Kicked ${threshold}+ goal${threshold > 1 ? "s" : ""} in ${hr.hits} of last ${hr.games} recorded games`;
  if (avg) s += `, averaging ${avg} goals`;
  if (proj) s += ` with a current projection of ${proj}`;
  s += ".";
  return s;
}

// ─── Perfect hit rates section ────────────────────────────────────────────────

function PerfectHitRatesSection({
  disposalPlayers,
  goalPlayers,
}: {
  disposalPlayers: StatBoardPlayer[];
  goalPlayers: StatBoardPlayer[];
}) {
  type PerfectRow = {
    player_name: string;
    team_name: string;
    opponent_team_name: string;
    lens: string;
    threshold: number;
    hits: number;
    games: number;
    avg: number | null;
    proj: number | null;
    confidence_label: string | null;
  };

  const rows: PerfectRow[] = [];

  for (const threshold of [20, 25, 30]) {
    const key = `${threshold}`;
    for (const p of disposalPlayers) {
      const hr = p.all_threshold_hit_rates?.[key];
      if (hr && hr.rate === 1 && hr.games >= 5) {
        rows.push({
          player_name: p.player_name,
          team_name: p.team_name,
          opponent_team_name: p.opponent_team_name,
          lens: "disposals",
          threshold,
          hits: hr.hits,
          games: hr.games,
          avg: p.last_10_avg,
          proj: p.projection,
          confidence_label: p.confidence_label,
        });
      }
    }
  }

  for (const threshold of [1, 2]) {
    const key = `${threshold}`;
    for (const p of goalPlayers) {
      const hr = p.all_threshold_hit_rates?.[key];
      if (hr && hr.rate === 1 && hr.games >= 5) {
        rows.push({
          player_name: p.player_name,
          team_name: p.team_name,
          opponent_team_name: p.opponent_team_name,
          lens: "goals",
          threshold,
          hits: hr.hits,
          games: hr.games,
          avg: p.last_10_avg,
          proj: p.projection,
          confidence_label: p.confidence_label,
        });
      }
    }
  }

  // Deduplicate — one row per player per lens/threshold combo, sort by games desc
  const seen = new Set<string>();
  const deduped = rows.filter(r => {
    const k = `${r.player_name}-${r.lens}-${r.threshold}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => b.games - a.games);

  if (deduped.length === 0) {
    return <EmptyState message="No perfect hit rates found" detail="Perfect = 100% in 5+ games. May not be available early in the season." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="pb-2 pr-4 font-medium">Player</th>
            <th className="pb-2 pr-4 font-medium">Threshold</th>
            <th className="pb-2 pr-4 font-medium">vs</th>
            <th className="pb-2 pr-3 font-medium text-right">Games</th>
            <th className="pb-2 pr-3 font-medium text-right">L10 avg</th>
            <th className="pb-2 pr-3 font-medium text-right">Proj</th>
            <th className="pb-2 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {deduped.map((r, i) => (
            <tr key={i} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
              <td className="py-2 pr-4">
                <div className="font-medium text-foreground">{r.player_name}</div>
                <div className="text-[11px] text-muted-foreground">{r.team_name}</div>
              </td>
              <td className="py-2 pr-4">
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-500/20">
                  {r.threshold}+ {r.lens === "disposals" ? "disp" : "goals"}
                </span>
              </td>
              <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{r.opponent_team_name}</td>
              <td className="py-2 pr-3 text-right">
                <span className="text-emerald-400 font-semibold">{r.games}/{r.games}</span>
              </td>
              <td className="py-2 pr-3 text-right text-muted-foreground">{r.avg != null ? r.avg.toFixed(1) : "—"}</td>
              <td className="py-2 pr-3 text-right text-muted-foreground">{r.proj != null ? Math.round(r.proj) : "—"}</td>
              <td className="py-2">
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

// ─── Risky trends section ─────────────────────────────────────────────────────

function RiskyTrendsSection({ disposalPlayers }: { disposalPlayers: StatBoardPlayer[] }) {
  // Players where projection < 20 but have disposals lens, or high variance
  const risky = disposalPlayers
    .filter(p => {
      const proj = p.projection ?? 0;
      const avg = p.last_10_avg ?? 0;
      const stddev = p.stddev_last_10 ?? 0;
      const hr20 = p.all_threshold_hit_rates?.["20"];
      return (
        (proj > 0 && avg > 0 && Math.abs(proj - avg) > 8) ||
        (stddev > 7 && avg > 15) ||
        (hr20 && hr20.rate < 0.4 && hr20.games >= 5)
      );
    })
    .slice(0, 8);

  if (risky.length === 0) {
    return <EmptyState message="No high-risk disposal trends found" detail="Risk patterns based on projection/average divergence and score variance." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="pb-2 pr-4 font-medium">Player</th>
            <th className="pb-2 pr-4 font-medium">Team</th>
            <th className="pb-2 pr-4 font-medium">vs</th>
            <th className="pb-2 pr-3 font-medium text-right">L10 avg</th>
            <th className="pb-2 pr-3 font-medium text-right">Proj</th>
            <th className="pb-2 pr-3 font-medium text-right">Stddev</th>
            <th className="pb-2 font-medium">Risk signal</th>
          </tr>
        </thead>
        <tbody>
          {risky.map(p => {
            const reason = buildRiskyReason(p);
            return (
              <tr key={p.player_id} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                <td className="py-2 pr-4">
                  <div className="font-medium text-foreground">{p.player_name}</div>
                  <div className="text-[11px] text-amber-400/80 mt-0.5 max-w-[220px] leading-snug">{reason}</div>
                </td>
                <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{p.team_name}</td>
                <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{p.opponent_team_name}</td>
                <td className="py-2 pr-3 text-right text-muted-foreground">{p.last_10_avg != null ? p.last_10_avg.toFixed(1) : "—"}</td>
                <td className="py-2 pr-3 text-right text-amber-400">{p.projection != null ? Math.round(p.projection) : "—"}</td>
                <td className="py-2 pr-3 text-right text-muted-foreground">{p.stddev_last_10 != null ? p.stddev_last_10.toFixed(1) : "—"}</td>
                <td className="py-2">
                  <span className="text-[10px] font-semibold text-amber-400">Volatile</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function buildRiskyReason(p: StatBoardPlayer): string {
  const proj = p.projection != null ? Math.round(p.projection) : null;
  const avg = p.last_10_avg != null ? p.last_10_avg.toFixed(1) : null;
  const stddev = p.stddev_last_10 != null ? p.stddev_last_10.toFixed(1) : null;
  if (proj != null && avg != null && Math.abs(proj - Number(avg)) > 8) {
    return `Projection of ${proj} diverges significantly from L10 avg of ${avg} — volatile profile.`;
  }
  if (stddev != null && Number(stddev) > 7) {
    return `High score variance (stddev ${stddev}) — inconsistent output over last 10 games.`;
  }
  const hr20 = p.all_threshold_hit_rates?.["20"];
  if (hr20 && hr20.rate < 0.4 && avg != null) {
    return `Only cleared 20+ disposals ${hr20.hits}/${hr20.games} times despite averaging ${avg} — unreliable threshold performer.`;
  }
  return `Inconsistent output pattern — high variance risk this round.`;
}

// ─── Fantasy tab ──────────────────────────────────────────────────────────────

function FantasySection({
  rankings,
}: {
  rankings: RankingRow[];
}) {
  const available = rankings.filter(r => !r.is_injured && !r.is_bye && r.is_available !== false);

  // Top projected
  const topProj = [...available]
    .filter(r => r.projection != null)
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .slice(0, 8);

  // Best value (high value_score or big edge/breakeven gap)
  const bestValue = [...available]
    .filter(r => r.value_score != null || (r.edge_canonical != null && r.breakeven != null))
    .sort((a, b) => ((b.value_score ?? 0) - (a.value_score ?? 0)) || ((b.edge_canonical ?? 0) - (a.edge_canonical ?? 0)))
    .slice(0, 6);

  // Traps — projection below breakeven or low confidence + negative edge
  const traps = [...available]
    .filter(r => {
      const proj = r.projection ?? 0;
      const be = r.breakeven ?? 9999;
      const edge = r.edge_canonical ?? 0;
      return (proj > 0 && proj < be && edge < -5) || (r.confidence_label === "LOW" && edge < 0);
    })
    .sort((a, b) => (a.edge_canonical ?? 0) - (b.edge_canonical ?? 0))
    .slice(0, 6);

  // Captains — by captain_score
  const captains = [...available]
    .filter(r => r.captain_score != null && r.projection != null)
    .sort((a, b) => (b.captain_score ?? 0) - (a.captain_score ?? 0))
    .slice(0, 6);

  // Price movers — biggest edge_canonical (implies price movement potential)
  const priceMovers = [...available]
    .filter(r => r.edge_canonical != null && r.breakeven != null && r.price != null)
    .sort((a, b) => Math.abs(b.edge_canonical ?? 0) - Math.abs(a.edge_canonical ?? 0))
    .slice(0, 6);

  return (
    <div className="space-y-8">
      <FantasySubSection title="Top Projected Scorers" icon={TrendingUp} rows={topProj} context="ranking" />
      <FantasySubSection title="Best Value Picks" icon={Target} rows={bestValue} context="value_pick" />
      <FantasySubSection title="Captain Picks" icon={Sword} rows={captains} context="captain" />
      <FantasySubSection title="Biggest Traps" icon={AlertTriangle} rows={traps} context="trap_alert" warn />
      <FantasySubSection title="Price / Value Movers" icon={BarChart2} rows={priceMovers} context="market_watch" />
    </div>
  );
}

type RankingContext = "ranking" | "value_pick" | "captain" | "trap_alert" | "market_watch";

function FantasySubSection({
  title,
  icon: Icon,
  rows,
  context,
  warn,
}: {
  title: string;
  icon: React.ElementType;
  rows: RankingRow[];
  context: RankingContext;
  warn?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <EmptyState message={`No ${title.toLowerCase()} data available`} detail="Rankings data may not be loaded yet." />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 ${warn ? "text-amber-400" : "text-muted-foreground"}`} />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-[11px] text-muted-foreground ml-1">{rows.length} players</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="pb-2 pr-4 font-medium">Player</th>
              <th className="pb-2 pr-3 font-medium">Pos</th>
              <th className="pb-2 pr-3 font-medium text-right">Proj</th>
              <th className="pb-2 pr-3 font-medium text-right">BE</th>
              <th className="pb-2 pr-3 font-medium text-right">Edge</th>
              <th className="pb-2 pr-3 font-medium text-right">L3</th>
              <th className="pb-2 pr-4 font-medium">Signal</th>
              <th className="pb-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const why = buildStatGeneratedWhy(r, context);
              return (
                <tr key={r.player_id ?? i} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <div className="font-medium text-foreground">{r.player_name}</div>
                    <div className="text-[11px] text-muted-foreground">{r.team}</div>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.position ?? "—"}</td>
                  <td className="py-2 pr-3 text-right font-semibold text-foreground">{r.projection != null ? Math.round(r.projection) : "—"}</td>
                  <td className="py-2 pr-3 text-right text-muted-foreground">{r.breakeven != null ? Math.round(r.breakeven) : "—"}</td>
                  <td className={`py-2 pr-3 text-right font-semibold ${(r.edge_canonical ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {r.edge_canonical != null ? `${r.edge_canonical >= 0 ? "+" : ""}${Math.round(r.edge_canonical)}` : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right text-muted-foreground">{r.last_3_avg != null ? Math.round(r.last_3_avg) : "—"}</td>
                  <td className="py-2 pr-4">
                    <span className={`text-[10px] font-semibold ${actionColor(r.action_canonical)}`}>
                      {r.signal_display ?? r.action_canonical ?? "—"}
                    </span>
                  </td>
                  <td className="py-2 max-w-[200px]">
                    <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{why}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Match Angles tab ─────────────────────────────────────────────────────────

function MatchAnglesTab({ teamDisposals, teamGoals, matches }: {
  teamDisposals: StatBoardTeamRow[];
  teamGoals: StatBoardTeamRow[];
  matches: StatBoardMatch[];
}) {
  // Highest projected combined score
  const byScore = [...teamDisposals]
    .filter(t => t.projected_combined_score != null)
    .sort((a, b) => (b.projected_combined_score ?? 0) - (a.projected_combined_score ?? 0));

  // Teams conceding most disposals (to opponent)
  const byDisposalsConceded = [...teamDisposals]
    .filter(t => t.opponent_conceded_l5 != null)
    .sort((a, b) => (b.opponent_conceded_l5 ?? 0) - (a.opponent_conceded_l5 ?? 0))
    .slice(0, 6);

  // Teams conceding most goals
  const byGoalsConceded = [...teamGoals]
    .filter(t => t.opponent_conceded_l5 != null)
    .sort((a, b) => (b.opponent_conceded_l5 ?? 0) - (a.opponent_conceded_l5 ?? 0))
    .slice(0, 6);

  // Dedupe matches by match_id for environment display
  const seenMatch = new Set<number>();
  const matchEnvironments = byScore.filter(t => {
    if (seenMatch.has(t.match_id)) return false;
    seenMatch.add(t.match_id);
    return true;
  }).slice(0, 8);

  return (
    <div className="space-y-8">
      {/* Match environments */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Match Environments by Projected Score</h3>
        </div>
        {matchEnvironments.length === 0 ? (
          <EmptyState message="No projected match score data" detail="Team score projections from Stat Board required." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="pb-2 pr-4 font-medium">Match</th>
                  <th className="pb-2 pr-3 font-medium text-right">Proj combined</th>
                  <th className="pb-2 pr-3 font-medium text-right">L5 comb avg</th>
                  <th className="pb-2 font-medium">Environment</th>
                </tr>
              </thead>
              <tbody>
                {matchEnvironments.map(t => (
                  <tr key={t.match_id} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                    <td className="py-2 pr-4 font-medium text-foreground whitespace-nowrap">{t.match_label}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-foreground">
                      {t.projected_combined_score != null ? Math.round(t.projected_combined_score) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">
                      {t.recent_combined_score_avg_l5 != null ? t.recent_combined_score_avg_l5.toFixed(0) : "—"}
                    </td>
                    <td className="py-2">
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
        )}
      </div>

      {/* Teams conceding disposals */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Teams Conceding Most Disposals (L5)</h3>
          <span className="text-[11px] text-muted-foreground ml-1">Target their opponents</span>
        </div>
        {byDisposalsConceded.length === 0 ? (
          <EmptyState message="No team disposal conceded data" detail="Requires team disposals lens data from Stat Board." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="pb-2 pr-4 font-medium">Team (conceding)</th>
                  <th className="pb-2 pr-4 font-medium">vs</th>
                  <th className="pb-2 pr-3 font-medium text-right">Avg conceded L5</th>
                  <th className="pb-2 pr-3 font-medium text-right">Season avg</th>
                  <th className="pb-2 font-medium">Angle</th>
                </tr>
              </thead>
              <tbody>
                {byDisposalsConceded.map((t, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                    <td className="py-2 pr-4 font-medium text-foreground whitespace-nowrap">{t.opponent_team_name}</td>
                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{t.team_name}</td>
                    <td className={`py-2 pr-3 text-right font-semibold ${(t.opponent_conceded_l5 ?? 0) >= 380 ? "text-emerald-400" : "text-foreground"}`}>
                      {t.opponent_conceded_l5 != null ? t.opponent_conceded_l5.toFixed(0) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">
                      {t.opponent_conceded_season != null ? t.opponent_conceded_season.toFixed(0) : "—"}
                    </td>
                    <td className="py-2 text-[11px] text-sky-400">Target {t.team_name} midfielders</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Teams conceding goals */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Teams Conceding Most Goals (L5)</h3>
          <span className="text-[11px] text-muted-foreground ml-1">Forward targeting opportunity</span>
        </div>
        {byGoalsConceded.length === 0 ? (
          <EmptyState message="No team goals conceded data" detail="Requires team goals lens data from Stat Board." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="pb-2 pr-4 font-medium">Team (conceding)</th>
                  <th className="pb-2 pr-4 font-medium">vs</th>
                  <th className="pb-2 pr-3 font-medium text-right">Avg conceded L5</th>
                  <th className="pb-2 pr-3 font-medium text-right">Season avg</th>
                </tr>
              </thead>
              <tbody>
                {byGoalsConceded.map((t, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                    <td className="py-2 pr-4 font-medium text-foreground whitespace-nowrap">{t.opponent_team_name}</td>
                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{t.team_name}</td>
                    <td className={`py-2 pr-3 text-right font-semibold ${(t.opponent_conceded_l5 ?? 0) >= 10 ? "text-emerald-400" : "text-foreground"}`}>
                      {t.opponent_conceded_l5 != null ? t.opponent_conceded_l5.toFixed(1) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">
                      {t.opponent_conceded_season != null ? t.opponent_conceded_season.toFixed(1) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Post Ideas tab ───────────────────────────────────────────────────────────

function buildPostTemplates(data: ContentIntelData): PostTemplate[] {
  const posts: PostTemplate[] = [];

  // Post 1: Top disposal trend players (20+)
  const elite20 = data.disposalPlayers
    .filter(p => {
      const hr = p.all_threshold_hit_rates?.["20"];
      return hr && hr.games >= 5 && hr.rate >= 0.75;
    })
    .sort((a, b) => {
      const ra = a.all_threshold_hit_rates!["20"];
      const rb = b.all_threshold_hit_rates!["20"];
      return rb.rate - ra.rate || rb.hits - ra.hits;
    })
    .slice(0, 5);

  if (elite20.length >= 3) {
    const bullets = elite20.map(p => {
      const hr = p.all_threshold_hit_rates!["20"];
      const avg = p.last_10_avg != null ? p.last_10_avg.toFixed(1) : "—";
      return `${p.player_name} (${p.team_name}): ${fmtRate(hr.hits, hr.games)} hit rate, ${avg} avg disposals`;
    });

    posts.push({
      id: "disposal-20-trend",
      format: "tiktok",
      title: `${elite20.length} players with elite 20+ disposal trends this round`,
      hook: "These players have been automatic for 20+ disposals recently.",
      bullets,
      cta: "Check the full Stat Board at Neeko Sports Stats.",
    });

    posts.push({
      id: "disposal-20-instagram",
      format: "instagram",
      title: `20+ Disposal Machines — ${data.roundLabel}`,
      hook: "Swipe for the players who just keep delivering disposals.",
      bullets,
      cta: "Link in bio — full Stat Board and Fantasy rankings at Neeko Sports Stats.",
    });

    const redditBody = bullets.map(b => `- ${b}`).join("\n");
    posts.push({
      id: "disposal-20-reddit",
      format: "reddit",
      title: `[${data.roundLabel}] Players with strong 20+ disposal hit rates this week`,
      hook: `Here are the players who've been most consistent for 20+ disposals over their last 10 games going into ${data.roundLabel}:\n\n${redditBody}\n\nData from Neeko Sports Stats Stat Board.`,
      bullets: [],
      cta: "More thresholds and full breakdown available on the Stat Board.",
    });
  }

  // Post 2: 25+ disposal locked-in players
  const elite25 = data.disposalPlayers
    .filter(p => {
      const hr = p.all_threshold_hit_rates?.["25"];
      return hr && hr.games >= 4 && hr.rate >= 0.7;
    })
    .sort((a, b) => {
      const ra = a.all_threshold_hit_rates!["25"];
      const rb = b.all_threshold_hit_rates!["25"];
      return rb.rate - ra.rate;
    })
    .slice(0, 4);

  if (elite25.length >= 2) {
    const bullets25 = elite25.map(p => {
      const hr = p.all_threshold_hit_rates!["25"];
      const avg = p.last_10_avg != null ? p.last_10_avg.toFixed(1) : "—";
      return `${p.player_name}: ${fmtRate(hr.hits, hr.games)} for 25+, ${avg} avg`;
    });

    posts.push({
      id: "disposal-25-twitter",
      format: "twitter",
      title: `25+ disposal trend players — ${data.roundLabel}`,
      hook: `Strong disposal trend players for ${data.roundLabel}:`,
      bullets: bullets25,
      cta: "Full Stat Board @ Neeko Sports Stats",
    });
  }

  // Post 3: Goal trend players
  const goalTrend = data.goalPlayers
    .filter(p => {
      const hr = p.all_threshold_hit_rates?.["1"];
      return hr && hr.games >= 5 && hr.rate >= 0.75;
    })
    .sort((a, b) => {
      const ra = a.all_threshold_hit_rates!["1"];
      const rb = b.all_threshold_hit_rates!["1"];
      return rb.rate - ra.rate;
    })
    .slice(0, 5);

  if (goalTrend.length >= 3) {
    const goalBullets = goalTrend.map(p => {
      const hr = p.all_threshold_hit_rates!["1"];
      const avg = p.last_10_avg != null ? p.last_10_avg.toFixed(1) : "—";
      return `${p.player_name} (${p.team_name}): ${fmtRate(hr.hits, hr.games)} for 1+ goals, ${avg} avg goals`;
    });

    posts.push({
      id: "goal-trend",
      format: "tiktok",
      title: `Forward targets with strong goal-scoring trends this round`,
      hook: "These forwards have been scoring goals at a high rate recently.",
      bullets: goalBullets,
      cta: "Check their full profiles on the Neeko Sports Stats Stat Board.",
    });
  }

  // Post 4: Fantasy top picks
  const fantasyTop = data.rankings
    .filter(r => !r.is_injured && !r.is_bye && r.projection != null)
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .slice(0, 5);

  if (fantasyTop.length >= 3) {
    const fantasyBullets = fantasyTop.map(r =>
      `${r.player_name} (${r.team}): Proj ${r.projection != null ? Math.round(r.projection) : "—"}, ${r.confidence_label ?? "—"} confidence`
    );

    posts.push({
      id: "fantasy-top-proj",
      format: "instagram",
      title: `Top AFL Fantasy projections — ${data.roundLabel}`,
      hook: "Who are the model's top projected scorers this round?",
      bullets: fantasyBullets,
      cta: "Full Fantasy rankings and Stat Board at Neeko Sports Stats.",
    });

    posts.push({
      id: "fantasy-top-twitter",
      format: "twitter",
      title: `AFL Fantasy top projections — ${data.roundLabel}`,
      hook: `Top projected scores this round:`,
      bullets: fantasyBullets.slice(0, 3),
      cta: "Full rankings @ Neeko Sports Stats",
    });
  }

  return posts;
}

function PostFormatBadge({ format }: { format: PostTemplate["format"] }) {
  const cfg: Record<PostTemplate["format"], { label: string; cls: string }> = {
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
    : `${post.title}\n\n${post.hook}\n\n${post.bullets.map(b => `• ${b}`).join("\n")}\n\n${post.cta}`;

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <PostFormatBadge format={post.format} />
          <h4 className="text-sm font-semibold mt-1 leading-snug">{post.title}</h4>
        </div>
        <CopyButton text={fullText} />
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Hook</p>
          <p className="text-xs text-foreground">{post.hook}</p>
        </div>

        {post.bullets.length > 0 && (
          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Body</p>
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
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">CTA</p>
          <p className="text-xs text-foreground">{post.cta}</p>
        </div>
      </div>

      <div className="border-t border-border/40 pt-2">
        <textarea
          readOnly
          className="w-full h-20 text-xs font-mono text-muted-foreground bg-muted/10 rounded border border-border/40 p-2 resize-none focus:outline-none"
          value={fullText}
        />
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 pb-2 border-b border-border/50">{title}</h3>
      {children}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminContentIntel() {
  const [tab, setTab] = useState<Tab>("stat-angles");
  const [data, setData] = useState<ContentIntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!supabase) { setError("Supabase not initialised"); setLoading(false); return; }
    setLoading(true);
    setError(null);

    try {
      // Fetch matches first to get current round info
      const [matchesRes, rankingsRes] = await Promise.allSettled([
        supabase.rpc("get_stat_board_matches", { p_season: SEASON, p_round: null }),
        supabase.rpc("get_rankings_safe", {
          p_user_id: null,
          p_position: null,
          p_limit: 200,
          p_offset: 0,
          p_sort_key: "projection",
          p_sort_dir: "desc",
        }),
      ]);

      const matches: StatBoardMatch[] = matchesRes.status === "fulfilled"
        ? ((matchesRes.value.data as StatBoardMatch[]) ?? [])
        : [];

      const rankings: RankingRow[] = rankingsRes.status === "fulfilled"
        ? ((rankingsRes.value.data as RankingRow[]) ?? [])
        : [];

      const roundLabel = matches[0]?.round ?? "Current Round";
      const firstMatchId = matches[0]?.match_id ?? null;

      // Now fetch stat board players for disposals and goals (all matches in current round)
      // and team rows for match angles
      const [dispRes, goalRes, teamDispRes, teamGoalRes] = await Promise.allSettled([
        firstMatchId != null
          ? supabase.rpc("get_stat_board_players", {
              p_season: SEASON,
              p_round: null,
              p_match_id: firstMatchId,
              p_lens: "disposals",
              p_threshold: 20,
              p_limit: 200,
              p_offset: 0,
            })
          : Promise.resolve({ data: [], error: null }),
        firstMatchId != null
          ? supabase.rpc("get_stat_board_players", {
              p_season: SEASON,
              p_round: null,
              p_match_id: firstMatchId,
              p_lens: "goals",
              p_threshold: 1,
              p_limit: 200,
              p_offset: 0,
            })
          : Promise.resolve({ data: [], error: null }),
        supabase.rpc("get_stat_board_team_rows", {
          p_season: SEASON,
          p_round: null,
          p_match_id: null,
          p_lens: "disposals",
        }),
        supabase.rpc("get_stat_board_team_rows", {
          p_season: SEASON,
          p_round: null,
          p_match_id: null,
          p_lens: "goals",
        }),
      ]);

      // For disposals/goals, we need ALL matches in the round, not just one.
      // Fetch all matches concurrently if we have more than one.
      let allDisposalPlayers: StatBoardPlayer[] = dispRes.status === "fulfilled"
        ? ((dispRes.value.data as StatBoardPlayer[]) ?? [])
        : [];
      let allGoalPlayers: StatBoardPlayer[] = goalRes.status === "fulfilled"
        ? ((goalRes.value.data as StatBoardPlayer[]) ?? [])
        : [];

      // Fetch remaining matches
      if (matches.length > 1) {
        const remainingMatchIds = matches.slice(1).map(m => m.match_id);
        const extraFetches = await Promise.allSettled(
          remainingMatchIds.flatMap(mid => [
            supabase.rpc("get_stat_board_players", {
              p_season: SEASON, p_round: null, p_match_id: mid,
              p_lens: "disposals", p_threshold: 20, p_limit: 200, p_offset: 0,
            }),
            supabase.rpc("get_stat_board_players", {
              p_season: SEASON, p_round: null, p_match_id: mid,
              p_lens: "goals", p_threshold: 1, p_limit: 200, p_offset: 0,
            }),
          ])
        );
        for (let i = 0; i < extraFetches.length; i += 2) {
          const dRes = extraFetches[i];
          const gRes = extraFetches[i + 1];
          if (dRes.status === "fulfilled") allDisposalPlayers = allDisposalPlayers.concat((dRes.value.data as StatBoardPlayer[]) ?? []);
          if (gRes.status === "fulfilled") allGoalPlayers = allGoalPlayers.concat((gRes.value.data as StatBoardPlayer[]) ?? []);
        }
      }

      const teamDisposals: StatBoardTeamRow[] = teamDispRes.status === "fulfilled"
        ? ((teamDispRes.value.data as StatBoardTeamRow[]) ?? [])
        : [];
      const teamGoals: StatBoardTeamRow[] = teamGoalRes.status === "fulfilled"
        ? ((teamGoalRes.value.data as StatBoardTeamRow[]) ?? [])
        : [];

      setData({
        matches,
        disposalPlayers: allDisposalPlayers,
        goalPlayers: allGoalPlayers,
        teamDisposals,
        teamGoals,
        rankings,
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

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "stat-angles", label: "Stat Board Angles", icon: BarChart2 },
    { id: "fantasy",     label: "Fantasy Angles",    icon: TrendingUp },
    { id: "match",       label: "Match Angles",      icon: Zap },
    { id: "posts",       label: "Post Ideas",         icon: FileText },
  ];

  const postTemplates = data ? buildPostTemplates(data) : [];

  const totalDisposalAngles = data
    ? data.disposalPlayers.filter(p => {
        const hr = p.all_threshold_hit_rates?.["20"];
        return hr && hr.games >= 4 && hr.rate >= 0.65;
      }).length
    : 0;

  const totalFantasyAngles = data
    ? data.rankings.filter(r => !r.is_injured && !r.is_bye && r.projection != null).length
    : 0;

  return (
    <div>
      <AdminPageHeader
        icon={Lightbulb}
        title="Content Intel"
        description="Live posting angles from Stat Board, Fantasy Hub, and current-round data"
        badge="Stats only — No AI"
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          label="Current round"
          value={loading ? "Loading…" : data?.roundLabel ?? "—"}
          sub={data ? `${data.matches.length} matches` : undefined}
        />
        <SummaryCard
          label="Stat Board angles"
          value={loading ? "—" : `${totalDisposalAngles}`}
          sub="20%+ disposal hit rate players"
        />
        <SummaryCard
          label="Fantasy angles"
          value={loading ? "—" : `${totalFantasyAngles}`}
          sub="Available ranked players"
        />
        <SummaryCard
          label="Data source"
          value="Stats only"
          sub="No AI required — deterministic"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-950/10 px-4 py-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border mb-6 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading live data…</span>
        </div>
      )}

      {/* Tab content */}
      {!loading && data && (
        <>
          {/* TAB 1: Stat Board Angles */}
          {tab === "stat-angles" && (
            <div className="space-y-8">
              <Section title="A. 20+ Disposal Trends">
                <DisposalSection players={data.disposalPlayers} threshold={20} label="20+ disposal" />
              </Section>
              <Section title="B. 25+ Disposal Trends">
                <DisposalSection players={data.disposalPlayers} threshold={25} label="25+ disposal" />
              </Section>
              <Section title="C. 30+ Disposal Trends">
                <DisposalSection players={data.disposalPlayers} threshold={30} label="30+ disposal" />
              </Section>
              <Section title="D. 1+ Goal Trends">
                <GoalSection players={data.goalPlayers} threshold={1} />
              </Section>
              <Section title="E. 2+ Goal Trends">
                <GoalSection players={data.goalPlayers} threshold={2} />
              </Section>
              <Section title="F. 3+ Goal Trends">
                <GoalSection players={data.goalPlayers} threshold={3} />
              </Section>
              <Section title="G. Perfect Hit Rates (100%, 5+ games)">
                <PerfectHitRatesSection
                  disposalPlayers={data.disposalPlayers}
                  goalPlayers={data.goalPlayers}
                />
              </Section>
              <Section title="H. Risky / Volatile Profiles">
                <RiskyTrendsSection disposalPlayers={data.disposalPlayers} />
              </Section>
            </div>
          )}

          {/* TAB 2: Fantasy Angles */}
          {tab === "fantasy" && (
            data.rankings.length === 0 ? (
              <EmptyState
                message="Fantasy rankings not loaded"
                detail="get_rankings_safe RPC returned no data. Check that the rankings cache is populated."
              />
            ) : (
              <FantasySection rankings={data.rankings} />
            )
          )}

          {/* TAB 3: Match Angles */}
          {tab === "match" && (
            data.teamDisposals.length === 0 && data.teamGoals.length === 0 ? (
              <EmptyState
                message="Team match data not loaded"
                detail="get_stat_board_team_rows RPC returned no data. Stat Board team data may not be available for the current round."
              />
            ) : (
              <MatchAnglesTab
                teamDisposals={data.teamDisposals}
                teamGoals={data.teamGoals}
                matches={data.matches}
              />
            )
          )}

          {/* TAB 4: Post Ideas */}
          {tab === "posts" && (
            postTemplates.length === 0 ? (
              <EmptyState
                message="Not enough data to generate post ideas yet"
                detail="Post ideas are generated from live Stat Board data. Ensure at least 3 players have 5+ game disposal or goal trends."
              />
            ) : (
              <div className="space-y-5">
                <p className="text-xs text-muted-foreground">
                  {postTemplates.length} post template{postTemplates.length !== 1 ? "s" : ""} generated from live data. All content is stat-generated — no AI required.
                </p>
                <div className="grid gap-4 lg:grid-cols-2">
                  {postTemplates.map(post => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              </div>
            )
          )}
        </>
      )}

      {!loading && !data && !error && (
        <EmptyState message="No data loaded" detail="Click Refresh to load live data." />
      )}
    </div>
  );
}
