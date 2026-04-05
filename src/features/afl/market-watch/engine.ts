import { MWPlayerRow, MWSignal } from "./types";

export type { MWSignal };

export type DisplaySignal = "TARGET" | "WATCH" | "AVOID";

export interface DerivedPlayer extends MWPlayerRow {
  _category: MWSignal;
  display_signal: DisplaySignal;
  value_rating_label: string;
  percentile_rank: number;
}

export interface BestTrade {
  out: DerivedPlayer;
  in: DerivedPlayer;
  trade_type: "CASH_GENERATION" | "AGGRESSIVE_UPGRADE" | "BALANCED";
  cash_generated: number;
  projection_gain: number;
  score: number;
  why: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL MARKET CLASSIFIER
//
// Single source of truth for BOTH display_signal AND value_rating_label.
// Both are derived from the same percentile_rank — there is no split-brain.
//
// Buckets (percentile of value_gap across eligible players):
//   top 20%  → TARGET  — "Elite Value" (top 10%) or "Strong Value" (top 20%)
//   mid 40%  → WATCH   — "Fair Price" or "Monitor"
//   bot 40%  → AVOID   — "Overpriced" or "Major Risk"
// ─────────────────────────────────────────────────────────────────────────────

function computePercentileRank(sortedValueGaps: number[], valueGap: number): number {
  const total = sortedValueGaps.length;
  if (total === 0) return 50;
  let below = 0;
  for (const v of sortedValueGaps) {
    if (v < valueGap) below++;
  }
  return Math.round((below / total) * 100);
}

function signalFromPercentile(pct: number): DisplaySignal {
  if (pct >= 80) return "TARGET";
  if (pct >= 40) return "WATCH";
  return "AVOID";
}

function labelFromPercentile(pct: number): string {
  if (pct >= 90) return "Elite Value";
  if (pct >= 80) return "Strong Value";
  if (pct >= 60) return "Fair Price";
  if (pct >= 40) return "Monitor";
  if (pct >= 20) return "Overpriced";
  return "Major Risk";
}

function mwSignalFromDisplay(sig: DisplaySignal): MWSignal {
  if (sig === "TARGET") return "BUY";
  if (sig === "AVOID") return "SELL";
  return "HOLD";
}

function isEligible(p: MWPlayerRow): boolean {
  if (!p.player_id || !p.player_name) return false;
  if (p.is_injured === true) return false;
  if (p.is_bye === true) return false;
  const st = (p.status ?? "").toLowerCase();
  const ms = (p.manual_status ?? "").toLowerCase();
  if (st === "injured" || st === "out" || st === "bye") return false;
  if (ms === "injured" || ms === "out" || ms === "bye") return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export function classifyPlayers(raw: MWPlayerRow[] | undefined | null): {
  buys: DerivedPlayer[];
  holds: DerivedPlayer[];
  sells: DerivedPlayer[];
} {
  if (!raw || !Array.isArray(raw)) {
    return { buys: [], holds: [], sells: [] };
  }

  const eligible = raw.filter(isEligible);
  const sortedGaps = eligible.map(p => Number(p.value_gap ?? 0)).sort((a, b) => a - b);

  const buys: DerivedPlayer[] = [];
  const holds: DerivedPlayer[] = [];
  const sells: DerivedPlayer[] = [];

  for (const p of eligible) {
    const gap = Number(p.value_gap ?? 0);
    const pct = computePercentileRank(sortedGaps, gap);
    const display_signal = signalFromPercentile(pct);
    const value_rating_label = labelFromPercentile(pct);
    const _category = mwSignalFromDisplay(display_signal);

    const derived: DerivedPlayer = {
      ...p,
      _category,
      display_signal,
      value_rating_label,
      percentile_rank: pct,
    };

    if (_category === "BUY") buys.push(derived);
    else if (_category === "SELL") sells.push(derived);
    else holds.push(derived);
  }

  return { buys, holds, sells };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRADE BUILDING LOGIC
// ─────────────────────────────────────────────────────────────────────────────

function proj(row: MWPlayerRow): number {
  return Number(row.projection ?? 0);
}

function price(row: MWPlayerRow): number {
  return Number(row.price ?? 0);
}

function tradeWhy(
  out: DerivedPlayer,
  inn: DerivedPlayer,
  cashGained: number,
  projGain: number
): string {
  if (projGain > 25) {
    return `Major scoring upgrade +${projGain.toFixed(0)} pts/rd — huge team improvement`;
  }
  if (projGain > 10) {
    return `Scoring upgrade of +${projGain.toFixed(0)} pts/rd${cashGained > 0 ? ` with $${Math.round(cashGained / 1000)}k cash back` : ""}`;
  }
  if (cashGained > 100000) {
    return `Cash generation trade — $${Math.round(cashGained / 1000)}k from downgrade, ${inn.player_name} rising`;
  }
  return `Quality upgrade — ${inn.player_name} scores ${proj(inn).toFixed(0)} pts/rd vs ${proj(out).toFixed(0)}`;
}

function tradeType(cashGenerated: number, projGain: number): BestTrade["trade_type"] {
  if (cashGenerated > 150000) return "CASH_GENERATION";
  if (projGain >= 12) return "AGGRESSIVE_UPGRADE";
  return "BALANCED";
}

export function buildBestTrades(
  sells: DerivedPlayer[] | undefined | null,
  buys: DerivedPlayer[] | undefined | null,
): BestTrade[] {
  if (!sells || !Array.isArray(sells) || sells.length === 0) return [];
  if (!buys || !Array.isArray(buys) || buys.length === 0) return [];

  const allPairs: BestTrade[] = [];

  for (const out of sells.slice(0, 15)) {
    for (const inn of buys.slice(0, 15)) {
      if (inn.player_id === out.player_id) continue;

      const cashGenerated = price(out) - price(inn);
      if (cashGenerated < -150000) continue;

      const projGain = proj(inn) - proj(out);
      if (projGain <= 3) continue;

      const score =
        projGain * 4 +
        cashGenerated / 2000 +
        (inn.value_gap ?? 0) * 2 +
        (out.value_gap ?? 0) * -1;

      allPairs.push({
        out,
        in: inn,
        trade_type: tradeType(cashGenerated, projGain),
        cash_generated: cashGenerated,
        projection_gain: projGain,
        score,
        why: tradeWhy(out, inn, cashGenerated, projGain),
      });
    }
  }

  const seenBuy = new Set<number>();
  const dedupedByBuy = allPairs
    .sort((a, b) => b.score - a.score)
    .filter(t => {
      if (seenBuy.has(t.in.player_id)) return false;
      seenBuy.add(t.in.player_id);
      return true;
    });

  const sellCount = new Map<number, number>();
  const result = dedupedByBuy.filter(t => {
    const n = sellCount.get(t.out.player_id) ?? 0;
    if (n >= 3) return false;
    sellCount.set(t.out.player_id, n + 1);
    return true;
  });

  return result.slice(0, 10);
}
