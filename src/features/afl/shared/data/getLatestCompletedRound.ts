import { supabase } from "@/integrations/supabase/client";

export async function getLatestCompletedRound(season: number): Promise<number> {
  const { data, error } = await supabase
    .rpc("get_latest_completed_round", { p_season: season });

  if (error) {
    throw new Error(`Failed to fetch latest completed round: ${error.message}`);
  }

  if (!data || !data[0]) {
    throw new Error(
      `No completed round found for season ${season}. Please ensure the afl.latest_completed_round table is populated.`
    );
  }

  return data[0].round_number;
}
