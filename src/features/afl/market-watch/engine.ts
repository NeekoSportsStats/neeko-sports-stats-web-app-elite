import { MWPlayerRow } from "./types";
import { normalizeAction } from "@/utils/marketAction";

// ────────────────────────────────────────────────────────────────────────────
// SIMPLIFIED 3-CATEGORY SYSTEM
// Single source of truth: ai_recommendation from player_rankings_cache
// ────────────────────────────────────────────────────────────────────────────

export type SimpleCategory = "BUY" | "HOLD" | "SELL";

export interface DerivedPlayer extends MWPlayerRow {
  _category: SimpleCategory;
  _delta: number;
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

function delta(row: MWPlayerRow): number {
  return Number(row.projection ?? 0) - Number(row.breakeven ?? 0);
}

function proj(row: MWPlayerRow): number {
  return Number(row.projection ?? 0);
}

function price(row: MWPlayerRow): number {
  return Number(row.price ?? 0);
}

function tag(row: MWPlayerRow, category: SimpleCategory): DerivedPlayer {
  return { ...row, _category: category, _delta: delta(row) };
}

// ────────────────────────────────────────────────────────────────────────────
// CORE CLASSIFICATION ENGINE — MAPS AI_RECOMMENDATION TO 3 CATEGORIES
// ────────────────────────────────────────────────────────────────────────────

export function classifyPlayers(raw: MWPlayerRow[] | undefined | null): {
  buys: DerivedPlayer[];
  holds: DerivedPlayer[];
  sells: DerivedPlayer[];
} {
  if (!raw || !Array.isArray(raw)) {
    return {
      buys: [],
      holds: [],
      sells: [],
    };
  }

  // ── STEP 1: GLOBAL FILTER ────────────────────────────────────────────────
  const filtered = raw.filter(p => {
    // Exclude injured/bye players
    if (p.is_injured === true) return false;
    if (p.is_bye === true) return false;
    if (p.status === 'injured') return false;
    if (p.status === 'bye') return false;
    if (p.manual_status === 'injured') return false;
    if (p.manual_status === 'bye') return false;

    // Must have valid data
    if (!p.player_id) return false;
    if (!p.player_name) return false;
    if (!p.category) return false;

    return true;
  });

  // ── STEP 2: MAP CATEGORY TO 3 CATEGORIES ────────────────────────────────
  const buys: DerivedPlayer[] = [];
  const holds: DerivedPlayer[] = [];
  const sells: DerivedPlayer[] = [];

  console.log("[MW ENGINE - INPUT]", {
    total: filtered.length,
    sample: filtered.slice(0, 5).map(p => ({ name: p.player_name, category: p.category, action: p.action })),
    categoriesFound: [...new Set(filtered.map(p => p.category))]
  });

  for (const p of filtered) {
    // Use normalizeAction to handle both old (TARGET/WATCH/AVOID) and new (BUY/HOLD/SELL) values
    const normalizedAction = normalizeAction(p.action || p.category);

    if (normalizedAction === 'BUY') {
      buys.push(tag(p, 'BUY'));
    }
    else if (normalizedAction === 'SELL') {
      sells.push(tag(p, 'SELL'));
    }
    else {
      // Default to HOLD for null or HOLD action
      holds.push(tag(p, 'HOLD'));
    }
  }

  console.log("[MW ENGINE - OUTPUT]", {
    BUY: buys.length,
    HOLD: holds.length,
    SELL: sells.length,
    sampleBuy: buys.slice(0, 3).map(p => ({ name: p.player_name, action: p.action })),
    sampleSell: sells.slice(0, 3).map(p => ({ name: p.player_name, action: p.action }))
  });

  // ── STEP 3: SORT WITHIN EACH CATEGORY ────────────────────────────────────

  // BUY: Best value first (highest value_score)
  buys.sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0));

  // HOLD: Closest to neutral value first (value_score nearest to 0, then by projection)
  holds.sort((a, b) => {
    const aAbsValue = Math.abs(a.value_score ?? 0);
    const bAbsValue = Math.abs(b.value_score ?? 0);
    if (Math.abs(aAbsValue - bAbsValue) > 0.5) {
      return aAbsValue - bAbsValue;
    }
    return (b.projection ?? 0) - (a.projection ?? 0);
  });

  // SELL: Worst value first (lowest/most negative value_score)
  sells.sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0));

  // ── STEP 4: DEBUG LOGGING ─────────────────────────────────────────────────

  console.log("[MW ENGINE - 3 CATEGORIES]", {
    total: raw.length,
    filtered: filtered.length,
    categories: {
      BUY: buys.length,
      HOLD: holds.length,
      SELL: sells.length,
    },
    topBuy: buys[0]?.player_name,
    topHold: holds[0]?.player_name,
    topSell: sells[0]?.player_name,
  });

  return { buys, holds, sells };
}

// ────────────────────────────────────────────────────────────────────────────
// TRADE BUILDING LOGIC (Simplified for 3-category system)
// ────────────────────────────────────────────────────────────────────────────

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

function tradeType(
  cashGenerated: number,
  projGain: number,
): BestTrade["trade_type"] {
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

  // Build trades: SELL players OUT, BUY players IN
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
        (inn.value_score ?? 0) * 2 +
        (out.value_score ?? 0) * -1;

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

  // Deduplicate: each buy player appears at most once
  const seenBuy = new Set<number>();
  const dedupedByBuy = allPairs
    .sort((a, b) => b.score - a.score)
    .filter(t => {
      if (seenBuy.has(t.in.player_id)) return false;
      seenBuy.add(t.in.player_id);
      return true;
    });

  // Each sell player appears at most 3 times
  const sellCount = new Map<number, number>();
  const result = dedupedByBuy.filter(t => {
    const n = sellCount.get(t.out.player_id) ?? 0;
    if (n >= 3) return false;
    sellCount.set(t.out.player_id, n + 1);
    return true;
  });

  return result.slice(0, 10);
}
