import { supabase } from "@/lib/supabaseClient";
import type {
  MatchSummary,
  MatchQuarter,
  MatchPlayerStats,
  MatchScatterPoint,
  MomentumPoint,
  MatchTimeline,
  TimelineEvent,
  TimelineScoring,
  TimelineMargin,
} from "../types";

export type QuarterScoreRow = {
  match_id: string;
  quarter: number;
  home_qtr_points: number;
  away_qtr_points: number;
  home_points: number;
  away_points: number;
  quarter_margin?: number;
  quarter_winner?: string;
};

// ⚠️ CONTRACT LOCK:
// afl.match_center_games_base schema:
// - match_id, season, round_number, round_label, round_instance
// - home_team_vendor, away_team_vendor (NOT home_team/away_team)
// - home_score, away_score, home_goals, home_behinds, away_goals, away_behinds
// - venue, status, match_datetime, updated_at
//
// Date handling: match_datetime is the primary match date source, with updated_at as fallback.
// Convert to YYYY-MM-DD for grouping/display.
// Ordering: round_number + match_id in query, then by date locally for display.
export async function fetchMatches(season: number, maxRound?: number): Promise<MatchSummary[]> {
  let query = supabase
    .schema("afl")
    .from("match_center_games_base")
    .select(`
      match_id,
      season,
      round_number,
      round_label,
      round_instance,
      home_team_vendor,
      away_team_vendor,
      home_score,
      away_score,
      home_goals,
      home_behinds,
      away_goals,
      away_behinds,
      venue,
      status,
      match_datetime,
      updated_at
    `)
    .eq("season", 2025)
    .order("round_number", { ascending: true })
    .order("match_id", { ascending: true });

  if (maxRound !== undefined) {
    query = query.lte("round_number", maxRound);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[fetchMatches]", error);
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data.map((row): MatchSummary => {
    const matchDatetime = row.match_datetime ? new Date(row.match_datetime) : null;
    const fallbackDate = row.updated_at ? new Date(row.updated_at) : null;
    const sourceDate = matchDatetime || fallbackDate;
    const matchDate = sourceDate ? sourceDate.toISOString().split('T')[0] : undefined;

    return {
      match_id: String(row.match_id ?? ""),
      season: row.season ?? season,
      round_number: row.round_number ?? 0,
      round_label: row.round_label ?? `R${row.round_number ?? 0}`,
      round_instance: row.round_instance ?? undefined,
      home_team_vendor: String(row.home_team_vendor ?? "Home"),
      away_team_vendor: String(row.away_team_vendor ?? "Away"),
      home_score: row.home_score ?? null,
      away_score: row.away_score ?? null,
      home_goals: row.home_goals ?? null,
      home_behinds: row.home_behinds ?? null,
      away_goals: row.away_goals ?? null,
      away_behinds: row.away_behinds ?? null,
      venue: row.venue ?? undefined,
      status: row.status ?? "Scheduled",
      updated_at: row.updated_at ?? undefined,
      date: matchDate,
    };
  });
}

export async function fetchMatchPlayerStats(params: {
  match_id: string;
}): Promise<MatchPlayerStats[]> {
  if (!params.match_id) {
    console.debug("[fetchMatchPlayerStats] No match_id provided");
    return [];
  }

  const { data, error } = await supabase
    .schema("afl")
    .from("v_player_match_stats_2025")
    .select(`
      match_id,
      round_instance,
      player,
      player_team,
      opponent_team,
      position,
      disposals,
      kicks,
      handballs,
      marks,
      tackles,
      goals,
      behinds,
      hitouts,
      time_on_ground,
      fantasy_points
    `)
    .eq("match_id", params.match_id)
    .order("fantasy_points", { ascending: false });

  if (error) {
    console.debug("[fetchMatchPlayerStats]", error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  return data.map((row): MatchPlayerStats => ({
    match_id: String(row.match_id ?? params.match_id),
    round_instance: Number(row.round_instance ?? 0),
    player: String(row.player ?? "Unknown"),
    player_team: String(row.player_team ?? ""),
    opponent_team: String(row.opponent_team ?? ""),
    position: String(row.position ?? ""),
    disposals: Number(row.disposals ?? 0),
    kicks: Number(row.kicks ?? 0),
    handballs: Number(row.handballs ?? 0),
    marks: Number(row.marks ?? 0),
    tackles: Number(row.tackles ?? 0),
    goals: Number(row.goals ?? 0),
    behinds: Number(row.behinds ?? 0),
    hitouts: Number(row.hitouts ?? 0),
    time_on_ground: Number(row.time_on_ground ?? 0),
    fantasy_points: Number(row.fantasy_points ?? 0),
  }));
}

export async function fetchMatchScatterData(params: {
  match_id: string;
}): Promise<MatchScatterPoint[]> {
  if (!params.match_id) {
    console.debug("[fetchMatchScatterData] No match_id provided");
    return [];
  }

  const { data, error } = await supabase
    .schema("afl")
    .from("v_match_scatter_2025")
    .select(`
      match_id,
      round_instance,
      player,
      player_team,
      opponent_team,
      disposals,
      fantasy_points,
      avg_disposals,
      avg_fantasy,
      x_disposals_vs_avg,
      y_fantasy_vs_avg
    `)
    .eq("match_id", params.match_id);

  if (error) {
    console.debug("[fetchMatchScatterData]", error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  return data.map((row): MatchScatterPoint => ({
    match_id: String(row.match_id ?? params.match_id),
    round_instance: Number(row.round_instance ?? 0),
    player: String(row.player ?? "Unknown"),
    player_team: String(row.player_team ?? ""),
    opponent_team: String(row.opponent_team ?? ""),
    disposals: Number(row.disposals ?? 0),
    fantasy_points: Number(row.fantasy_points ?? 0),
    avg_disposals: Number(row.avg_disposals ?? 0),
    avg_fantasy: Number(row.avg_fantasy ?? 0),
    x_disposals_vs_avg: Number(row.x_disposals_vs_avg ?? 0),
    y_fantasy_vs_avg: Number(row.y_fantasy_vs_avg ?? 0),
  }));
}

export async function fetchMatchMomentum(matchId: string): Promise<MomentumPoint[]> {
  const { data, error } = await supabase
    .schema("afl")
    .from("v_match_team_momentum_2025")
    .select("match_id, season, quarter, minute, momentum")
    .eq("match_id", matchId)
    .order("quarter", { ascending: true })
    .order("minute", { ascending: true });

  if (error) {
    console.warn("[fetchMatchMomentum] Query failed:", error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  return data.map((row): MomentumPoint => ({
    match_id: String(row.match_id ?? matchId),
    season: Number(row.season ?? 2025),
    quarter: Number(row.quarter ?? 1),
    minute: Number(row.minute ?? 0),
    momentum: Number(row.momentum ?? 0),
  }));
}

export async function fetchMatchOverlayTimeline(params: {
  match_id: string;
}): Promise<MatchTimeline> {
  const empty: MatchTimeline = { events: [], scoring: [], margin: [] };

  if (!params.match_id) {
    console.debug("[fetchMatchOverlayTimeline] No match_id provided");
    return empty;
  }

  const [eventsResult, scoringResult, marginResult] = await Promise.all([
    supabase
      .schema("afl")
      .from("v_match_events_2025")
      .select("match_id, team_vendor_id, player_vendor_id, quarter, minute, event_type")
      .eq("match_id", params.match_id)
      .then(({ data, error }) => {
        if (error) {
          console.debug("[fetchMatchOverlayTimeline] events query failed:", error.message);
          return [] as TimelineEvent[];
        }
        return (data ?? []).map((r): TimelineEvent => ({
          match_id: String(r.match_id ?? params.match_id),
          team_vendor_id: String(r.team_vendor_id ?? ""),
          player_vendor_id: String(r.player_vendor_id ?? ""),
          quarter: Number(r.quarter ?? 0),
          minute: Number(r.minute ?? 0),
          event_type: String(r.event_type ?? ""),
        }));
      }),
    supabase
      .schema("afl")
      .from("v_match_event_scoring_2025")
      .select("match_id, team_vendor_id, quarter, minute, event_type, points")
      .eq("match_id", params.match_id)
      .then(({ data, error }) => {
        if (error) {
          console.debug("[fetchMatchOverlayTimeline] scoring query failed:", error.message);
          return [] as TimelineScoring[];
        }
        return (data ?? []).map((r): TimelineScoring => ({
          match_id: String(r.match_id ?? params.match_id),
          team_vendor_id: String(r.team_vendor_id ?? ""),
          quarter: Number(r.quarter ?? 0),
          minute: Number(r.minute ?? 0),
          event_type: String(r.event_type ?? ""),
          points: Number(r.points ?? 0),
        }));
      }),
    supabase
      .schema("afl")
      .from("v_match_event_margin_2025")
      .select("match_id, minute, margin_delta")
      .eq("match_id", params.match_id)
      .order("minute", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.debug("[fetchMatchOverlayTimeline] margin query failed:", error.message);
          return [] as TimelineMargin[];
        }
        return (data ?? []).map((r): TimelineMargin => ({
          match_id: String(r.match_id ?? params.match_id),
          quarter: 0,
          minute: Number(r.minute ?? 0),
          margin_delta: Number(r.margin_delta ?? 0),
        }));
      }),
  ]);

  return {
    events: eventsResult,
    scoring: scoringResult,
    margin: marginResult,
  };
}

export async function fetchQuarterSummary(params: {
  match_id: string;
}): Promise<QuarterScoreRow[]> {
  if (!params.match_id) return [];

  const { data, error } = await supabase
    .schema("afl")
    .from("v_match_quarter_momentum_2025")
    .select("match_id, quarter, home_points, away_points, home_qtr_points, away_qtr_points, quarter_margin, quarter_winner")
    .eq("match_id", params.match_id)
    .order("quarter", { ascending: true });

  if (error) {
    console.warn("[fetchQuarterSummary] Error:", error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  return data.map((row): QuarterScoreRow => ({
    match_id: String(row.match_id ?? params.match_id),
    quarter: Number(row.quarter ?? 0),
    home_qtr_points: Number(row.home_qtr_points ?? 0),
    away_qtr_points: Number(row.away_qtr_points ?? 0),
    home_points: Number(row.home_points ?? 0),
    away_points: Number(row.away_points ?? 0),
    quarter_margin: row.quarter_margin != null ? Number(row.quarter_margin) : undefined,
    quarter_winner: row.quarter_winner ? String(row.quarter_winner) : undefined,
  }));
}

export async function fetchRoundQuarterScores(matchIds: string[]): Promise<QuarterScoreRow[]> {
  if (matchIds.length === 0) return [];

  const { data, error } = await supabase
    .schema("afl")
    .from("v_match_quarter_momentum_2025")
    .select("match_id, quarter, home_points, away_points, home_qtr_points, away_qtr_points, quarter_margin, quarter_winner")
    .in("match_id", matchIds)
    .order("match_id", { ascending: true })
    .order("quarter", { ascending: true });

  if (error) {
    console.warn("[fetchRoundQuarterScores] Error:", error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  return data.map((row): QuarterScoreRow => ({
    match_id: String(row.match_id ?? ""),
    quarter: Number(row.quarter ?? 0),
    home_qtr_points: Number(row.home_qtr_points ?? 0),
    away_qtr_points: Number(row.away_qtr_points ?? 0),
    home_points: Number(row.home_points ?? 0),
    away_points: Number(row.away_points ?? 0),
    quarter_margin: row.quarter_margin != null ? Number(row.quarter_margin) : undefined,
    quarter_winner: row.quarter_winner ? String(row.quarter_winner) : undefined,
  }));
}

export async function fetchMatchQuarters(matchId: string): Promise<MatchQuarter[]> {
  if (!matchId) return [];

  const { data, error } = await supabase
    .schema("afl")
    .from("v_match_quarters_2025")
    .select("quarter, home_goals, home_behinds, home_points, away_goals, away_behinds, away_points")
    .eq("match_id", matchId)
    .order("quarter", { ascending: true });

  if (error) {
    console.debug("[fetchMatchQuarters] Error:", error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  return data.map((row): MatchQuarter => ({
    quarter: Number(row.quarter ?? 0),
    home_goals: row.home_goals != null ? Number(row.home_goals) : null,
    home_behinds: row.home_behinds != null ? Number(row.home_behinds) : null,
    home_points: row.home_points != null ? Number(row.home_points) : null,
    away_goals: row.away_goals != null ? Number(row.away_goals) : null,
    away_behinds: row.away_behinds != null ? Number(row.away_behinds) : null,
    away_points: row.away_points != null ? Number(row.away_points) : null,
  }));
}
