import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface TeamIntelligence {
  summary: string | null;
  fantasy_verdict: string | null;
  updated_at: string | null;
  prompt_version: string | null;
}

const SEASON = 2026;

export function useTeamIntelligence(teamName: string | null) {
  const [intelligence, setIntelligence] = useState<TeamIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamName || !supabase) {
      setIntelligence(null);
      return;
    }
    setLoading(true);
    setError(null);

    supabase
      .rpc("get_team_ai_summary", { p_team: teamName, p_season: SEASON })
      .maybeSingle()
      .then(({ data: row, error: err }) => {
        if (err) {
          setError(err.message);
          setIntelligence(null);
        } else if (row) {
          const r = row as Record<string, unknown>;
          setIntelligence({
            summary: (r.summary as string | null) ?? null,
            fantasy_verdict: (r.fantasy_verdict as string | null) ?? null,
            updated_at: (r.updated_at as string | null) ?? null,
            prompt_version: (r.prompt_version as string | null) ?? null,
          });
        } else {
          setIntelligence(null);
        }
        setLoading(false);
      });
  }, [teamName]);

  return { intelligence, loading, error };
}
