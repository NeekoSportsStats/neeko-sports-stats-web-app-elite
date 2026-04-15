import type { RankingRow } from "@/features/afl/rankings/components/types";

export function getCaptainScore(row: RankingRow): number {
  const projection = row.projection ?? 0;
  const ceiling = row.ceiling_estimate ?? projection;
  const form = row.last_3_avg ?? row.last_5_avg ?? 0;
  return projection * 0.6 + ceiling * 0.3 + form * 0.1;
}

export function getCaptainConfidence(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 130) return "HIGH";
  if (score >= 115) return "MEDIUM";
  return "LOW";
}

export function isCaptainEligible(p: RankingRow): boolean {
  if (!p.player_id || !p.player_name) return false;
  if (p.is_injured === true || p.is_bye === true) return false;
  const st = (p.status ?? "").toUpperCase();
  const ms = (p.manual_status ?? "").toUpperCase();
  if (st === "OUT" || st === "INJURED" || st === "OMITTED") return false;
  if (ms === "OUT" || ms === "INJURED" || ms === "OMITTED") return false;
  if ((p.projection ?? 0) <= 80) return false;
  if ((p.games_played ?? 0) < 1) return false;
  return true;
}
