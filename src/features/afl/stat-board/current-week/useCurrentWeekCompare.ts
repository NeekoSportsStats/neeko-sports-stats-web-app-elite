import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { StatBoardPlayer, StatLens, PositionFilter, StatBoardMatch } from "../types";
import { defaultThreshold } from "../types";
import { useStatBoardMatches } from "../useStatBoard";
import { useStatBoardAccess } from "../useStatBoardAccess";
import {
  selectDefaultMatch,
  buildComparePlayer,
  sortComparePlayers,
  isVisiblePlayerName,
} from "./currentWeekUtils";
import type { SortKey, ComparePlayer } from "./currentWeekTypes";

const SEASON = 2026;
const PLAYER_LIMIT = 300;

// ─── Current Week player fetch ────────────────────────────────────────────────

function useCurrentWeekPlayers({
  matchId,
  lens,
  positionFilter,
  search,
}: {
  matchId: number | null;
  lens: StatLens;
  positionFilter: PositionFilter;
  search: string;
}) {
  const [players, setPlayers] = useState<StatBoardPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!supabase || matchId === null) {
      setPlayers([]);
      return;
    }
    setLoading(true);
    setError(null);

    const params: Record<string, unknown> = {
      p_season: SEASON,
      p_round: null,
      p_match_id: matchId,
      p_lens: lens,
      p_threshold: defaultThreshold(lens),
      p_limit: PLAYER_LIMIT,
      p_offset: 0,
    };
    if (positionFilter !== "ALL") {
      params.p_position_group = positionFilter === "RUCK" ? "RUC" : positionFilter;
    }
    if (search.trim()) {
      params.p_search = search.trim();
    }

    const { data, error: err } = await supabase.rpc("get_stat_board_players", params);
    if (err) {
      console.error("[CurrentWeek] get_stat_board_players error:", err);
      setError(err.message);
      setPlayers([]);
    } else {
      setPlayers((data as StatBoardPlayer[]) ?? []);
    }
    setLoading(false);
  }, [matchId, lens, positionFilter, search]);

  useEffect(() => { fetch(); }, [fetch]);

  return { players, loading, error, refetch: fetch };
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useCurrentWeekCompare({
  urlMatchId,
  lens,
  line,
  positionFilter,
  search,
  sort,
}: {
  urlMatchId: number | null;
  lens: StatLens;
  line: number | null;
  positionFilter: PositionFilter;
  search: string;
  sort: SortKey;
}) {
  const { hasFullAccess, loading: accessLoading } = useStatBoardAccess("players");
  const { matches, loading: matchesLoading } = useStatBoardMatches();
  const [selectedMatch, setSelectedMatch] = useState<StatBoardMatch | null>(null);

  // Auto-select default match when matches load or access changes
  useEffect(() => {
    if (matchesLoading || accessLoading) return;
    if (!matches.length) return;
    setSelectedMatch((prev) => {
      if (prev) return prev; // keep manual selection
      return selectDefaultMatch(matches, hasFullAccess, urlMatchId);
    });
  }, [matches, matchesLoading, accessLoading, hasFullAccess, urlMatchId]);

  // When urlMatchId changes (navigated), re-select
  useEffect(() => {
    if (!urlMatchId) return;
    const found = matches.find((m) => m.match_id === urlMatchId);
    if (found) setSelectedMatch(found);
  }, [urlMatchId, matches]);

  const isLocked = selectedMatch
    ? !hasFullAccess && !selectedMatch.is_free_match
    : false;

  const { players, loading: playersLoading, error } = useCurrentWeekPlayers({
    matchId: isLocked ? null : (selectedMatch?.match_id ?? null),
    lens,
    positionFilter,
    search,
  });

  const resolvedLine = line ?? 0;

  const comparePlayers = useMemo<ComparePlayer[]>(() => {
    if (!resolvedLine) return [];
    return players.map((p) => buildComparePlayer(p, resolvedLine));
  }, [players, resolvedLine]);

  const homePlayers = useMemo<ComparePlayer[]>(() => {
    if (!selectedMatch) return [];
    const home = comparePlayers.filter(
      (cp) => cp.player.team_id === selectedMatch.home_team_id && isVisiblePlayerName(cp.player.player_name),
    );
    return sortComparePlayers(home, sort);
  }, [comparePlayers, selectedMatch, sort]);

  const awayPlayers = useMemo<ComparePlayer[]>(() => {
    if (!selectedMatch) return [];
    const away = comparePlayers.filter(
      (cp) => cp.player.team_id === selectedMatch.away_team_id && isVisiblePlayerName(cp.player.player_name),
    );
    return sortComparePlayers(away, sort);
  }, [comparePlayers, selectedMatch, sort]);

  return {
    matches,
    matchesLoading,
    selectedMatch,
    setSelectedMatch,
    hasFullAccess,
    accessLoading,
    isLocked,
    homePlayers,
    awayPlayers,
    playersLoading,
    error,
  };
}
