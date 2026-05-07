import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { TeamStatLens } from "./teamTypes";
import type {
  MatchCentreRow,
  MatchCentreFixture,
  MatchCentreSortMode,
} from "./matchCentreTypes";

const SEASON = 2026;
const FREE_MATCH_LIMIT = 2;

export function useMatchCentreData() {
  const { isPremium, isAdmin } = useAuth();
  const hasFullAccess = isPremium || isAdmin;

  const [lens, setLens] = useState<TeamStatLens>("score");
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<MatchCentreSortMode>("fixture_order");
  const [rows, setRows] = useState<MatchCentreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .rpc("get_stat_board_match_centre_rows", {
        p_season: SEASON,
        p_round: null,
        p_lens: lens,
        p_limit: 200,
        p_offset: 0,
      })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) {
          setError(rpcError.message);
          setRows([]);
        } else {
          setRows((data ?? []) as MatchCentreRow[]);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [lens]);

  // Group flat rows into fixture pairs and apply premium override
  const fixtures: MatchCentreFixture[] = useMemo(() => {
    const fixtureMap = new Map<number, MatchCentreFixture>();

    for (const row of rows) {
      if (!fixtureMap.has(row.match_id)) {
        const isLocked = hasFullAccess ? false : row.is_locked;
        fixtureMap.set(row.match_id, {
          matchId: row.match_id,
          week: row.week,
          roundLabel: row.round_label,
          gameDate: row.game_date,
          venue: row.venue,
          matchLabel: row.match_label,
          fixtureOrder: row.fixture_order,
          homeTeamId: row.home_team_id,
          homeTeamName: row.home_team_name,
          awayTeamId: row.away_team_id,
          awayTeamName: row.away_team_name,
          isFreePreview: row.fixture_order <= FREE_MATCH_LIMIT,
          isLocked,
          lockReason: isLocked ? "Unlock full round" : null,
          homeRow: null,
          awayRow: null,
        });
      }

      const fixture = fixtureMap.get(row.match_id)!;
      const resolvedRow: MatchCentreRow = hasFullAccess
        ? { ...row, is_locked: false, is_premium_unlocked: true, is_free_preview: true }
        : row;

      if (row.is_home) {
        fixture.homeRow = resolvedRow;
      } else {
        fixture.awayRow = resolvedRow;
      }
    }

    const fixtureList = Array.from(fixtureMap.values());

    if (sortMode === "fixture_order") {
      fixtureList.sort((a, b) => a.fixtureOrder - b.fixtureOrder);
    } else if (sortMode === "projection_desc") {
      fixtureList.sort((a, b) => {
        const aMax = Math.max(a.homeRow?.projection ?? 0, a.awayRow?.projection ?? 0);
        const bMax = Math.max(b.homeRow?.projection ?? 0, b.awayRow?.projection ?? 0);
        return bMax - aMax;
      });
    } else if (sortMode === "avg_l5_desc") {
      fixtureList.sort((a, b) => {
        const aMax = Math.max(a.homeRow?.recent_avg_l5 ?? 0, a.awayRow?.recent_avg_l5 ?? 0);
        const bMax = Math.max(b.homeRow?.recent_avg_l5 ?? 0, b.awayRow?.recent_avg_l5 ?? 0);
        return bMax - aMax;
      });
    }

    return fixtureList;
  }, [rows, hasFullAccess, sortMode]);

  // Derived single-fixture view when a match filter is active
  const filteredFixtures = useMemo(() => {
    if (selectedMatchId === null) return fixtures;
    return fixtures.filter((f) => f.matchId === selectedMatchId);
  }, [fixtures, selectedMatchId]);

  const roundLabel = rows[0]?.round_label ?? null;
  const week = rows[0]?.week ?? null;

  return {
    // Data
    fixtures: filteredFixtures,
    allFixtures: fixtures,
    roundLabel,
    week,
    // State
    lens,
    setLens,
    selectedMatchId,
    setSelectedMatchId,
    sortMode,
    setSortMode,
    // Access
    hasFullAccess,
    isPremium,
    isAdmin,
    // Loading
    loading,
    error,
  };
}
