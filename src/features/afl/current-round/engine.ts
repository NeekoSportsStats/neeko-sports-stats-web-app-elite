import type { RankingRow } from "@/features/afl/rankings/components/types";

export interface CurrentRoundPlayer extends RankingRow {
  overallRank: number;
  isFeaturedPick: boolean;
}

export interface CurrentRoundResult {
  captains: CurrentRoundPlayer[];
  /** Merged: strong-action buys + budget upside picks, deduped */
  buyValuePicks: CurrentRoundPlayer[];
  /** Merged: hard-sit traps + risk/overpriced players, deduped, traps first */
  trapFadeAlerts: CurrentRoundPlayer[];
}

// ── TARGETS ──────────────────────────────────────────────────────────────────
const CAPTAIN_TARGET   = 6;
const BUY_VALUE_TARGET = 12;
const TRAP_FADE_TARGET = 10;

const BUDGET_BAND_A_MAX = 350_000;
const BUDGET_BAND_B_MAX = 650_000;

// ── ELIGIBILITY ───────────────────────────────────────────────────────────────

function isEligible(p: RankingRow): boolean {
  if (!p.player_id) return false;
  if (p.is_injured) return false;
  if (p.is_bye) return false;
  const status = (p.manual_status ?? p.status ?? "").toLowerCase();
  if (["delisted", "retired", "inactive"].includes(status)) return false;
  if ((p.games_played ?? 0) < 1) return false;
  return true;
}

function hasProjection(p: RankingRow): boolean {
  return p.projection != null && (p.projection as number) > 0;
}

function getAction(p: RankingRow): string {
  return String(p.action_canonical ?? p.signal_tag ?? p.signal ?? "").trim().toUpperCase();
}

function hasNegativeAction(p: RankingRow): boolean {
  const ac = getAction(p);
  return ["SIT", "STRONG_SIT", "HARD_SIT", "FADE", "RISK"].includes(ac);
}

function isHardSit(p: RankingRow): boolean {
  const ac = getAction(p);
  return ac === "STRONG_SIT" || ac === "HARD_SIT";
}

/**
 * Composite warning score for trap/fade sorting.
 * Higher = stronger negative signal = appears first in the section.
 * Built entirely from real fields — no invented values.
 */
function trapWarningScore(p: RankingRow): number {
  let score = 0;

  // Negative edge (projection vs breakeven gap) — strongest signal
  const edge = typeof p.edge_canonical === "number" ? p.edge_canonical : null;
  if (edge !== null && edge < 0) score += Math.abs(edge) * 2;

  // Projection below breakeven computed directly
  const proj = typeof p.projection === "number" ? p.projection : null;
  const be   = typeof p.breakeven  === "number" ? p.breakeven  : null;
  if (proj !== null && be !== null && proj < be) score += (be - proj);

  // Risk rating — higher risk = higher warning
  const rr = typeof p.risk_rating === "number" ? p.risk_rating : null;
  if (rr !== null) score += rr * 0.5;

  // Hard sits get a strong bonus to stay at the top
  if (isHardSit(p)) score += 80;
  else if (hasNegativeAction(p)) score += 40;

  // Negative decision score pushes further down
  const ds = typeof p.decision_score === "number" ? p.decision_score : null;
  if (ds !== null && ds < 0) score += Math.abs(ds) * 0.3;

  // Negative value score
  const vs = typeof p.value_score === "number" ? p.value_score : null;
  if (vs !== null && vs < 0) score += Math.abs(vs);

  // Declining trend
  const fd = typeof p.form_delta === "number" ? p.form_delta : null;
  if (fd !== null && fd < 0) score += Math.abs(fd) * 0.5;

  return score;
}

function hasStrongPositiveAction(p: RankingRow): boolean {
  const ac = getAction(p);
  return ac === "STRONG_START" || ac === "START";
}

// ── SCORING ───────────────────────────────────────────────────────────────────

function decisionScore(p: RankingRow): number {
  return p.decision_score ?? 0;
}

// ── BUDGET UPSIDE LOGIC ────────────────────────────────────────────────────────

function getBudgetUpsideScore(p: RankingRow): number | null {
  const projection = typeof p.projection === "number" ? p.projection : null;
  const price = typeof p.price === "number" ? p.price : null;
  const breakeven = typeof p.breakeven === "number" ? p.breakeven : null;
  const valueScore = typeof p.value_score === "number" ? p.value_score : null;

  if (projection === null || projection < 50) return null;
  if (price === null || price <= 0) return null;

  const value = valueScore !== null
    ? valueScore
    : (breakeven !== null ? projection - breakeven : null);

  if (value === null) return null;
  return value - (price / 1_000_000) * 8;
}

function hasRealUpside(p: RankingRow): boolean {
  const sig = (p.signal_tag ?? "").toUpperCase();
  if (["UP", "STRONG_UP", "BUY", "VALUE"].includes(sig)) return true;
  const breakeven = typeof p.breakeven === "number" ? p.breakeven : null;
  const projection = typeof p.projection === "number" ? p.projection : null;
  if (projection !== null && breakeven !== null && projection > breakeven) return true;
  const valueScore = typeof p.value_score === "number" ? p.value_score : null;
  if (valueScore !== null && valueScore > 0) return true;
  return false;
}

// ── MAIN BUILDER ──────────────────────────────────────────────────────────────

export function buildCurrentRoundPlayers(
  players: RankingRow[],
  edgeBoardIds: Set<string> = new Set()
): CurrentRoundResult {
  if (players.length === 0) {
    return { captains: [], buyValuePicks: [], trapFadeAlerts: [] };
  }

  const eligible = players.filter(isEligible);
  const eligibleWithProjection = eligible.filter(hasProjection);

  const rankMap = new Map<string, number>();
  [...players]
    .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
    .forEach((p, i) => { if (p.player_id) rankMap.set(p.player_id, i + 1); });

  function enrich(p: RankingRow): CurrentRoundPlayer {
    const id = p.player_id ?? "";
    return { ...p, overallRank: rankMap.get(id) ?? 999, isFeaturedPick: edgeBoardIds.has(id) };
  }

  const pool    = eligibleWithProjection.map(enrich);
  const poolAll = eligible.map(enrich);

  const byProjDesc     = [...pool].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));
  const byDecisionDesc = [...pool].sort((a, b) => decisionScore(b) - decisionScore(a));

  const assigned = new Set<string>();

  function assign(list: CurrentRoundPlayer[]): CurrentRoundPlayer[] {
    const out: CurrentRoundPlayer[] = [];
    for (const p of list) {
      const id = p.player_id ?? "";
      if (!assigned.has(id)) {
        assigned.add(id);
        out.push(p);
      }
    }
    return out;
  }

  function refillFrom(
    existing: CurrentRoundPlayer[],
    candidates: CurrentRoundPlayer[],
    target: number
  ): CurrentRoundPlayer[] {
    if (existing.length >= target) return existing;
    const result = [...existing];
    for (const c of candidates) {
      if (result.length >= target) break;
      const id = c.player_id ?? "";
      if (!assigned.has(id) && !result.some(r => r.player_id === id)) {
        assigned.add(id);
        result.push(c);
      }
    }
    return result;
  }

  // ── 1. CAPTAINS ────────────────────────────────────────────────────────────
  const captainCandidates = byProjDesc.filter(p => !hasNegativeAction(p));
  const captains = assign(captainCandidates.slice(0, CAPTAIN_TARGET));

  // ── 2. BUY / VALUE PICKS ───────────────────────────────────────────────────
  // Primary: strong positive action sorted by decision_score desc.
  const mustBuyPrimary = byDecisionDesc.filter(p =>
    !assigned.has(p.player_id ?? "") && hasStrongPositiveAction(p)
  );
  let buyValuePicks = assign(mustBuyPrimary.slice(0, BUY_VALUE_TARGET));

  // Fill remaining slots from budget/value players (under $650k with upside)
  if (buyValuePicks.length < BUY_VALUE_TARGET) {
    const budgetEligible = pool.filter(p =>
      !assigned.has(p.player_id ?? "") &&
      (p.price ?? 0) > 0 &&
      (p.price ?? 999_999) <= BUDGET_BAND_B_MAX &&
      !hasNegativeAction(p)
    );

    const bandA = budgetEligible
      .filter(p => (p.price ?? 999_999) <= BUDGET_BAND_A_MAX && hasRealUpside(p))
      .map(p => ({ p, score: getBudgetUpsideScore(p) }))
      .filter(({ score }) => score !== null)
      .sort((a, b) => (b.score as number) - (a.score as number))
      .map(({ p }) => p);

    const bandB = budgetEligible
      .filter(p => (p.price ?? 0) > BUDGET_BAND_A_MAX && hasRealUpside(p))
      .map(p => ({ p, score: getBudgetUpsideScore(p) }))
      .filter(({ score }) => score !== null)
      .sort((a, b) => (b.score as number) - (a.score as number))
      .map(({ p }) => p);

    // Interleave band B (mid-price) and band A (cheap) for variety
    const budgetCandidates: CurrentRoundPlayer[] = [];
    const seen = new Set<string>();
    const maxBudget = BUY_VALUE_TARGET - buyValuePicks.length;

    function addBudgetCandidate(c: CurrentRoundPlayer) {
      const id = c.player_id ?? "";
      if (!assigned.has(id) && !seen.has(id) && budgetCandidates.length < maxBudget) {
        budgetCandidates.push(c);
        seen.add(id);
      }
    }

    if (bandB.length > 0) addBudgetCandidate(bandB[0]);
    if (bandA.length > 0) addBudgetCandidate(bandA[0]);
    for (const c of bandB.slice(1)) addBudgetCandidate(c);
    for (const c of bandA.slice(1)) addBudgetCandidate(c);

    buyValuePicks = refillFrom(buyValuePicks, budgetCandidates, BUY_VALUE_TARGET);
  }

  // Last resort fill: any non-negative player by decision_score
  if (buyValuePicks.length < BUY_VALUE_TARGET) {
    const fallback = byDecisionDesc.filter(p =>
      !assigned.has(p.player_id ?? "") && !hasNegativeAction(p)
    );
    buyValuePicks = refillFrom(buyValuePicks, fallback, BUY_VALUE_TARGET);
  }

  // ── 3. TRAP / FADE ALERTS ──────────────────────────────────────────────────
  // Single unified pool: any player with a genuine negative signal,
  // sorted by composite trapWarningScore descending (strongest warning first).
  // Players already assigned to captains or buy/value picks are excluded.
  const positiveIds = new Set([...assigned]);

  // Tier 1: explicit negative actions (SIT, STRONG_SIT, HARD_SIT, FADE, RISK)
  const tier1 = poolAll.filter(p =>
    !positiveIds.has(p.player_id ?? "") && hasNegativeAction(p)
  );

  // Tier 2: no explicit negative action but has a quantifiable negative signal
  // (negative edge, projected below breakeven, or elevated risk_rating)
  const tier2 = pool.filter(p => {
    const id = p.player_id ?? "";
    if (positiveIds.has(id)) return false;
    if (hasNegativeAction(p)) return false; // already in tier 1

    const edge = typeof p.edge_canonical === "number" ? p.edge_canonical : null;
    const proj = typeof p.projection  === "number" ? p.projection  : null;
    const be   = typeof p.breakeven   === "number" ? p.breakeven   : null;
    const rr   = typeof p.risk_rating === "number" ? p.risk_rating : null;
    const vs   = typeof p.value_score === "number" ? p.value_score : null;

    const hasNegativeEdge = edge !== null && edge < -5;
    const projBelowBe     = proj !== null && be !== null && proj < be - 5;
    const highRisk        = rr !== null && rr >= 65;
    const negativeValue   = vs !== null && vs < -2;

    return hasNegativeEdge || projBelowBe || highRisk || negativeValue;
  });

  // Merge, deduplicate, score and sort — strongest warning first
  const trapCandidateMap = new Map<string, CurrentRoundPlayer>();
  for (const p of [...tier1, ...tier2]) {
    const id = p.player_id ?? "";
    if (id && !trapCandidateMap.has(id)) trapCandidateMap.set(id, p);
  }

  const trapFadeAlerts = [...trapCandidateMap.values()]
    .sort((a, b) => trapWarningScore(b) - trapWarningScore(a))
    .slice(0, TRAP_FADE_TARGET);

  return { captains, buyValuePicks, trapFadeAlerts };
}
