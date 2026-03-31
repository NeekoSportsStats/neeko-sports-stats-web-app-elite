import { supabase } from "@/integrations/supabase/client";
import type { StatKey } from "@/lib/stats/types";

export type TrendLabel = "Trending Up" | "Stable" | "Trending Down";

export interface FormStabilityRow {
  season: number;
  player_id: string;
  player_name: string;
  stat_type: string;
  games_used: number;
  recent_avg: number;
  season_avg: number;
  trend_diff: number;
  stability_score: number;
  stability_band: string;
  trend_label: TrendLabel;
  variance: number;
  confidence_label: string;
}

export interface FormStabilityGridData {
  rows: FormStabilityRow[];
  season: number;
  stat: StatKey;
}

export async function getFormStabilityGridData(params: {
  season: number;
  stat: StatKey;
}): Promise<FormStabilityGridData> {
  const { season, stat } = params;

  try {
    const { data, error } = await supabase
      .from("form_stability_grid_final")
      .select(`
        season,
        player_id,
        player_name,
        stat_type,
        games_used,
        recent_avg,
        season_avg,
        trend_diff,
        stability_score,
        stability_band,
        trend_label,
        variance,
        confidence_label
      `)
      .eq("season", 2025)
      .eq("stat_type", stat)
      .order("trend_diff", { ascending: false });

    if (error) {
      console.error("Error fetching form stability grid:", error);
      throw new Error(`Failed to fetch form stability data: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return {
        rows: [],
        season,
        stat,
      };
    }

    const rows: FormStabilityRow[] = data.map((row: any) => ({
      season: row.season,
      player_id: row.player_id,
      player_name: row.player_name,
      stat_type: row.stat_type,
      games_used: row.games_used,
      recent_avg: row.recent_avg,
      season_avg: row.season_avg,
      trend_diff: row.trend_diff,
      stability_score: row.stability_score,
      stability_band: row.stability_band,
      trend_label: row.trend_label as TrendLabel,
      variance: row.variance,
      confidence_label: row.confidence_label,
    }));

    return {
      rows,
      season,
      stat,
    };
  } catch (error) {
    console.error("Error in getFormStabilityGridData:", error);
    throw error;
  }
}
