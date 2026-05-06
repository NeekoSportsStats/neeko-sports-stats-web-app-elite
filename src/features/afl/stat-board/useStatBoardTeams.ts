import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type {
  StatBoardTeamMatch,
  StatBoardTeamRow,
  StatBoardTeamGameLog,
  StatBoardTeamTopContributor,
  TeamStatLens,
} from "./teamTypes";

const SEASON = 2026;

// ── Team Matches ──────────────────────────────────────────────────────────────

export function useStatBoardTeamMatches() {
  const [matches, setMatches] = useState<StatBoardTeamMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setError("Supabase not initialised"); setLoading(false); return; }

    supabase
      .rpc("get_stat_board_team_matches", { p_season: SEASON, p_round: null })
      .then(({ data, error: err }) => {
        if (err) {
          console.error("[StatBoard] get_stat_board_team_matches error:", err);
          setError(err.message);
        } else {
          setMatches((data as StatBoardTeamMatch[]) ?? []);
        }
        setLoading(false);
      });
  }, []);

  return { matches, loading, error };
}

// ── Team Rows ─────────────────────────────────────────────────────────────────

interface UseStatBoardTeamRowsOptions {
  // null = all matches in the round; number = specific match only
  matchId: number | null;
  lens: TeamStatLens;
}

export function useStatBoardTeamRows({ matchId, lens }: UseStatBoardTeamRowsOptions) {
  const [rows, setRows] = useState<StatBoardTeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!supabase) { setError("Supabase not initialised"); setLoading(false); return; }
    setLoading(true);
    setError(null);

    // matchId=null → pass null to get all teams for the current round
    const { data, error: err } = await supabase.rpc("get_stat_board_team_rows", {
      p_season:   SEASON,
      p_round:    null,
      p_match_id: matchId,   // null = whole round
      p_lens:     lens,
      p_limit:    36,
      p_offset:   0,
    });

    if (err) {
      console.error("[StatBoard] get_stat_board_team_rows error:", err);
      setError(err.message);
      setRows([]);
    } else {
      setRows((data as StatBoardTeamRow[]) ?? []);
    }
    setLoading(false);
  }, [matchId, lens]);

  useEffect(() => { fetch(); }, [fetch]);

  return { rows, loading, error, refetch: fetch };
}

// ── Team Game Log ─────────────────────────────────────────────────────────────

export function useStatBoardTeamGameLog(teamId: number | null) {
  const [log, setLog] = useState<StatBoardTeamGameLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (id: number) => {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase.rpc("get_stat_board_team_game_log", {
      p_team_id: id,
      p_season: SEASON,
      p_limit: 12,
    });

    if (err) {
      console.error("[StatBoard] get_stat_board_team_game_log error:", err);
      setError(err.message);
      setLog([]);
    } else {
      setLog((data as StatBoardTeamGameLog[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (teamId !== null) fetch(teamId);
    else { setLog([]); setLoading(false); }
  }, [teamId, fetch]);

  return { log, loading, error };
}

// ── Team Top Contributors ─────────────────────────────────────────────────────

export function useStatBoardTeamTopContributors(teamId: number | null, lens: TeamStatLens) {
  const [contributors, setContributors] = useState<StatBoardTeamTopContributor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (id: number) => {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase.rpc("get_stat_board_team_top_contributors", {
      p_team_id: id,
      p_season: SEASON,
      p_lens: lens,
      p_limit: 8,
    });

    if (err) {
      console.error("[StatBoard] get_stat_board_team_top_contributors error:", err);
      setError(err.message);
      setContributors([]);
    } else {
      setContributors((data as StatBoardTeamTopContributor[]) ?? []);
    }
    setLoading(false);
  }, [lens]);

  useEffect(() => {
    if (teamId !== null) fetch(teamId);
    else { setContributors([]); setLoading(false); }
  }, [teamId, lens, fetch]);

  return { contributors, loading, error };
}
