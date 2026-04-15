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

export function buildConfidenceMap(
  players: Array<{ confidence_score_100?: number | null }>
): (score: number | null | undefined) => ConfidenceLabel | null {
  const scores = players
    .map(p => p.confidence_score_100)
    .filter((s): s is number => s != null && !isNaN(s))
    .sort((a, b) => b - a);

  if (scores.length === 0) return () => null;

  const rankMap = new Map<number, number>();
  scores.forEach((s, i) => {
    if (!rankMap.has(s)) rankMap.set(s, i);
  });

  return (score: number | null | undefined): ConfidenceLabel | null => {
    if (score == null || isNaN(score)) return null;
    const idx = rankMap.get(score) ?? scores.length;
    const pct = idx / scores.length;
    if (pct <= 0.2) return "HIGH";
    if (pct <= 0.6) return "MEDIUM";
    return "LOW";
  };
}

export function applyDecisionFields<T extends RankingRow>(rows: T[]): T[] {
  const confMap = buildConfidenceMap(rows);
  return rows.map(row => {
    const action = getAction(row.decision_score);
    const signal = getSignal(action);
    const confidence = confMap(row.confidence_score_100);
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
