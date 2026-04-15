import type { RankingRow } from "@/features/afl/rankings/components/types";

export type ActionLabel = "SMASH_START" | "START" | "HOLD" | "SIT" | "HARD_SIT";
export type SignalLabel = "STRONG_UP" | "UP" | "STABLE" | "DOWN" | "STRONG_DOWN";
export type ConfidenceLabel = "HIGH" | "MEDIUM" | "LOW";

export function getAction(score: number | null | undefined): ActionLabel {
  const s = score ?? 0;
  if (s >= 0.80)  return "SMASH_START";
  if (s >= 0.38)  return "START";
  if (s > -0.35)  return "HOLD";
  if (s > -0.90)  return "SIT";
  return "HARD_SIT";
}

export function getSignal(action: ActionLabel): SignalLabel {
  switch (action) {
    case "SMASH_START": return "STRONG_UP";
    case "START":       return "UP";
    case "HOLD":        return "STABLE";
    case "SIT":         return "DOWN";
    case "HARD_SIT":    return "STRONG_DOWN";
  }
}

export function confidenceLabelFromScore(score: number | null | undefined): ConfidenceLabel | null {
  if (score == null || isNaN(score)) return null;
  if (score >= 72) return "HIGH";
  if (score >= 52) return "MEDIUM";
  return "LOW";
}

export function applyDecisionFields<T extends RankingRow>(rows: T[]): T[] {
  return rows.map(row => {
    const confidence = row.confidence_label ?? confidenceLabelFromScore(row.confidence_score_100);
    const action = (row.action_canonical ?? row.action ?? null) as ActionLabel | null;
    const signal = (row.signal_tag ?? row.signal ?? null) as SignalLabel | null;
    return {
      ...row,
      action_canonical: action,
      confidence_label: confidence,
      signal_tag: signal,
    };
  });
}

export function hasPositiveAction(p: { action_canonical?: string | null; decision_score?: number | null }): boolean {
  const ac = (p.action_canonical ?? "").toUpperCase();
  return ac === "SMASH_START" || ac === "START";
}

export function hasNegativeAction(p: { action_canonical?: string | null; decision_score?: number | null }): boolean {
  const ac = (p.action_canonical ?? "").toUpperCase();
  return ac === "SIT" || ac === "HARD_SIT";
}

export function isHardSitAction(p: { action_canonical?: string | null }): boolean {
  return (p.action_canonical ?? "").toUpperCase() === "HARD_SIT";
}
