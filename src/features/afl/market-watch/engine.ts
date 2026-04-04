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

    // Must have valid identity data
    if (!p.player_id) return false;
    if (!p.player_name) return false;

    return true;
  });

  // ── STEP 2: MAP TO 3 CATEGORIES FROM SINGLE SOURCE OF TRUTH ─────────────
  // action field comes from market_watch_snapshot_players.action which is
  // now always set to ai_recommendation from afl.player_rankings_cache.
  // ai_recommendation field is the direct cache value (joined in view).
  // Priority: ai_recommendation > action > value_score fallback
  const buys: DerivedPlayer[] = [];
  const holds: DerivedPlayer[] = [];
  const sells: DerivedPlayer[] = [];

  for (const p of filtered) {
    // ai_recommendation is the canonical source — simplified 3-tier mapping:
    // STRONG_BUY / BUY → BUY
    // HOLD → HOLD
    // SELL / STRONG_SELL → SELL (always — no value_score override)
    const canonical = (p.ai_recommendation ?? '').toUpperCase();

    const normalized: SimpleCategory | null =
      canonical === 'STRONG_BUY' || canonical === 'BUY' ? 'BUY'
      : canonical === 'STRONG_SELL' || canonical === 'SELL' ? 'SELL'
      : canonical === 'HOLD' ? 'HOLD'
      : null;

    // Fallback to action field (normalised) if ai_recommendation missing
    const actionFallback = normalized ?? normalizeAction(p.action || p.category);

    if (actionFallback === 'BUY') {
      buys.push(tag(p, 'BUY'));
    } else if (actionFallback === 'SELL') {
      sells.push(tag(p, 'SELL'));
    } else {
      holds.push(tag(p, 'HOLD'));
    }
  }

  // ── STEP 3: PRESERVE BACKEND ORDER ───────────────────────────────────────
  // Backend returns players sorted by value_score DESC, projection DESC.
  // Do NOT re-sort within buckets — respect the backend ordering.


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
