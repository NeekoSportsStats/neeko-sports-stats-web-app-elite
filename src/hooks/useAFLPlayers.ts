import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface AFLPlayer {
  id: string;
  name: string;
  team: string;
  position: string;
  price: number | null;
  gamesPlayed: number;
  projection: number | null;
  seasonAvg: number | null;
  last3Avg: number | null;
  baseline: number | null;
  edge: number | null;
  signal: string;
  value: number | null;
  signalTag: string;
  summaryShort: string | null;
  summaryLong: string | null;
  status: string | null;
  manualStatus: string | null;
  isAvailable: boolean;
  isBye: boolean;
  byeRound: number | null;
  byeNextRound: boolean;
  neekoRating: number | null;
  valueScore: number | null;
  formScore: number | null;
  projectionConfidence: number | null;
  captainScore: number | null;
  captainRating: string | null;
  breakeven: number | null;
  matchupRating: string | null;
  consistency: number | null;
  cachedAt: string | null;
}

export interface UseAFLPlayersOptions {
  limit?: number;
  position?: string | null;
  sortBy?: "projection" | "edge" | "value" | "signal";
  filterSignal?: string | null;
  excludeSignals?: string[];
  onlyAvailable?: boolean;
}

export interface UseAFLPlayersResult {
  players: AFLPlayer[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  lastUpdated: string | null;
}

const CANONICAL_COLUMNS =
  "player_id,player_name,team,position,price,games_played," +
  "projection_final,season_avg,last_3_avg,baseline,edge,signal,value,signal_tag," +
  "summary_short,summary_long,status,manual_status,is_available," +
  "is_bye,bye_round,bye_next_round," +
  "neeko_rating,value_score,form_score,projection_confidence," +
  "captain_score,captain_rating,breakeven,matchup_rating,consistency,cached_at";

const SIGNAL_ORDER: Record<string, number> = {
  STRONG_BUY: 0,
  BUY: 1,
  HOLD: 2,
  SELL: 3,
  STRONG_SELL: 4,
};

function mapRow(r: Record<string, unknown>): AFLPlayer {
  const rawSignal = (r.signal as string) ?? "HOLD";
  const signal = rawSignal.toUpperCase().replace(/ /g, "_");
  const rawTag = (r.signal_tag as string) ?? "WATCH";

  return {
    id: String(r.player_id ?? ""),
    name: (r.player_name as string) ?? "",
    team: (r.team as string) ?? "",
    position: (r.position as string) ?? "",
    price: r.price != null ? Number(r.price) : null,
    gamesPlayed: r.games_played != null ? Number(r.games_played) : 0,
    projection: r.projection_final != null ? Number(r.projection_final) : null,
    seasonAvg: r.season_avg != null ? Number(r.season_avg) : null,
    last3Avg: r.last_3_avg != null ? Number(r.last_3_avg) : null,
    baseline: r.baseline != null ? Number(r.baseline) : null,
    edge: r.edge != null ? Number(r.edge) : null,
    signal,
    value: r.value != null ? Number(r.value) : null,
    signalTag: rawTag,
    summaryShort: (r.summary_short as string) ?? null,
    summaryLong: (r.summary_long as string) ?? null,
    status: (r.status as string) ?? null,
    manualStatus: (r.manual_status as string) ?? null,
    isAvailable: r.is_available != null ? Boolean(r.is_available) : true,
    isBye: r.is_bye != null ? Boolean(r.is_bye) : false,
    byeRound: r.bye_round != null ? Number(r.bye_round) : null,
    byeNextRound: r.bye_next_round != null ? Boolean(r.bye_next_round) : false,
    neekoRating: r.neeko_rating != null ? Number(r.neeko_rating) : null,
    valueScore: r.value_score != null ? Number(r.value_score) : null,
    formScore: r.form_score != null ? Number(r.form_score) : null,
    projectionConfidence: r.projection_confidence != null ? Number(r.projection_confidence) : null,
    captainScore: r.captain_score != null ? Number(r.captain_score) : null,
    captainRating: (r.captain_rating as string) ?? null,
    breakeven: r.breakeven != null ? Number(r.breakeven) : null,
    matchupRating: (r.matchup_rating as string) ?? null,
    consistency: r.consistency != null ? Number(r.consistency) : null,
    cachedAt: (r.cached_at as string) ?? null,
  };
}

function applySort(players: AFLPlayer[], sortBy: UseAFLPlayersOptions["sortBy"]): AFLPlayer[] {
  const copy = [...players];
  switch (sortBy) {
    case "projection":
      return copy.sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));
    case "edge":
      return copy.sort((a, b) => (b.edge ?? -999) - (a.edge ?? -999));
    case "value":
      return copy.sort((a, b) => (b.value ?? -999) - (a.value ?? -999));
    case "signal":
      return copy.sort((a, b) => {
        const ao = SIGNAL_ORDER[a.signal] ?? 2;
        const bo = SIGNAL_ORDER[b.signal] ?? 2;
        if (ao !== bo) return ao - bo;
        return (b.projection ?? 0) - (a.projection ?? 0);
      });
    default:
      return copy;
  }
}

export function useAFLPlayers(options: UseAFLPlayersOptions = {}): UseAFLPlayersResult {
  const {
    limit = 200,
    position = null,
    sortBy = "projection",
    filterSignal = null,
    excludeSignals = [],
    onlyAvailable = false,
  } = options;

  const [players, setPlayers] = useState<AFLPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("player_rankings_cache")
        .select(CANONICAL_COLUMNS)
        .limit(limit);

      if (position && position !== "ALL") {
        query = query.eq("position", position);
      }

      const { data, error: qErr } = await query;

      if (qErr) throw new Error(qErr.message);

      let rows = (data ?? []).map((r: Record<string, unknown>) => mapRow(r));

      if (filterSignal) {
        const sig = filterSignal.toUpperCase().replace(/ /g, "_");
        rows = rows.filter((p) => p.signal === sig);
      }

      if (excludeSignals.length > 0) {
        const excluded = excludeSignals.map((s) => s.toUpperCase().replace(/ /g, "_"));
        rows = rows.filter((p) => !excluded.includes(p.signal));
      }

      if (onlyAvailable) {
        rows = rows.filter((p) => p.isAvailable && !p.isBye);
      }

      rows = applySort(rows, sortBy);

      setPlayers(rows);
      if (rows.length > 0 && rows[0].cachedAt) {
        setLastUpdated(rows[0].cachedAt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load players");
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }, [limit, position, sortBy, filterSignal, excludeSignals.join(","), onlyAvailable]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { players, loading, error, refetch: fetch, lastUpdated };
}
