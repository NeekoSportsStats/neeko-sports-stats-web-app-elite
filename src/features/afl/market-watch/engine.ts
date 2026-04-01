import { MWPlayerRow } from "./types";

export type DerivedCategory =
  | "buy_before_rise"
  | "cash_cow"
  | "upgrade_target"
  | "sell_before_drop"
  | "fade_trap"
  | "monitor"
  | string;

export interface DerivedPlayer extends MWPlayerRow {
  _derived_category: DerivedCategory;
  _delta: number;
}

export interface BestTrade {
  out: DerivedPlayer;
  in: DerivedPlayer;
  in_type: "upgrade" | "cash_cow" | "buy_before_rise";
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

function tag(row: MWPlayerRow, category: DerivedCategory): DerivedPlayer {
  return { ...row, _derived_category: category, _delta: delta(row) };
}

// ────────────────────────────────────────────────────────────────────────────
// CORE CLASSIFICATION ENGINE — SINGLE SOURCE OF TRUTH
// ────────────────────────────────────────────────────────────────────────────

export function classifyPlayers(raw: MWPlayerRow[] | undefined | null): {
  buyBeforeRise: DerivedPlayer[];
  cashCows: DerivedPlayer[];
  upgrades: DerivedPlayer[];
  sells: DerivedPlayer[];
  traps: DerivedPlayer[];
} {
  if (!raw || !Array.isArray(raw)) {
    return {
      buyBeforeRise: [],
      cashCows: [],
      upgrades: [],
      sells: [],
      traps: [],
    };
  }

  // ── STEP 1: GLOBAL FILTER — Apply BEFORE any logic ──────────────────────
  const filtered = raw.filter(p => {
    // Exclude injured/bye players globally
    if (p.is_injured === true) return false;
    if (p.is_bye === true) return false;
    if (p.status === 'injured') return false;
    if (p.status === 'bye') return false;
    if (p.manual_status === 'injured') return false;
    if (p.manual_status === 'bye') return false;

    // Must have valid data
    if (!p.player_id) return false;
    if (!p.player_name) return false;

    return true;
  });

  console.log("[MW ENGINE - FILTER]", {
    total: raw.length,
    afterFilter: filtered.length,
    removed: raw.length - filtered.length,
  });

  // ── STEP 2: UNIQUE ASSIGNMENT TRACKER ────────────────────────────────────
  const assigned = new Set<number>();

  function assign(players: MWPlayerRow[], condition: (p: MWPlayerRow) => boolean, category: DerivedCategory): DerivedPlayer[] {
    const result: DerivedPlayer[] = [];

    for (const p of players) {
      // Skip if already assigned to another category
      if (assigned.has(p.player_id)) continue;

      // Check condition
      if (!condition(p)) continue;

      // Assign to this category
      assigned.add(p.player_id);
      result.push(tag(p, category));
    }

    return result;
  }

  // ── STEP 3: CATEGORY ASSIGNMENT (Priority Order) ────────────────────────

  // PRIORITY 1: MUST SELL — Strong sell signals
  const sells = assign(
    filtered,
    p => {
      const rec = p.ai_recommendation;
      const value = p.value_score ?? 0;
      const d = delta(p);

      // AI says SELL or AVOID
      if (rec === 'SELL' || rec === 'AVOID') return true;

      // Terrible value score
      if (value <= -4.5) return true;

      // Massive delta deficit
      if (d <= -15) return true;

      return false;
    },
    'sell_before_drop'
  );

  // PRIORITY 2: BUY NOW — Strong buy signals
  const buys = assign(
    filtered,
    p => {
      const rec = p.ai_recommendation;
      const value = p.value_score ?? 0;
      const projection = p.projection ?? 0;

      // AI says BUY or STRONG_BUY
      if (rec === 'BUY' || rec === 'STRONG_BUY') return true;

      // High projection + great value
      if (projection >= 90 && value >= 5) return true;

      // Elite value score alone
      if (value >= 7) return true;

      return false;
    },
    'buy_before_rise'
  );

  // PRIORITY 3: BEST VALUE — Positive value, strong projection
  const values = assign(
    filtered,
    p => {
      const value = p.value_score ?? 0;
      const projection = p.projection ?? 0;

      // Strong positive value
      if (value >= 3.5 && projection >= 70) return true;

      return false;
    },
    'cash_cow'
  );

  // PRIORITY 4: UPGRADES — Moderate value, decent projection
  const upgrades = assign(
    filtered,
    p => {
      const value = p.value_score ?? 0;
      const projection = p.projection ?? 0;

      // Decent projection with some value
      if (projection >= 85 && value >= 0) return true;

      // Good projection even with slight negative value
      if (projection >= 95 && value >= -2) return true;

      return false;
    },
    'upgrade_target'
  );

  // PRIORITY 5: TRAPS — Expensive + poor value (optional category)
  const traps = assign(
    filtered,
    p => {
      const priceVal = p.price ?? 0;
      const value = p.value_score ?? 0;
      const projection = p.projection ?? 0;

      // Premium price but terrible value
      if (priceVal >= 550000 && value < -3) return true;

      // Expensive but weak projection
      if (priceVal >= 500000 && projection < 70) return true;

      return false;
    },
    'fade_trap'
  );

  // ── STEP 4: SORT EACH CATEGORY (Aligned with DB) ──────────────────────────

  buys.sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0)); // Best value first
  sells.sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0)); // Worst value first
  values.sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0)); // Best value first (Zorko > Gawn)
  upgrades.sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0)); // Highest projection first
  traps.sort((a, b) => (b.price ?? 0) - (a.price ?? 0)); // Most expensive first

  // ── STEP 5: DEBUG LOGGING ────────────────────────────────────────────────

  console.log("[MW ENGINE - CLASSIFY]", {
    uniqueAssigned: assigned.size,
    categories: {
      sells: sells.length,
      buys: buys.length,
      values: values.length,
      upgrades: upgrades.length,
      traps: traps.length,
    },
    topSell: sells[0]?.player_name,
    topBuy: buys[0]?.player_name,
    topValue: values[0]?.player_name,
  });

  // ── STEP 6: RETURN RESULTS ───────────────────────────────────────────────

  return {
    buyBeforeRise: buys,
    cashCows: values,
    upgrades: upgrades,
    sells: sells,
    traps: traps,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// TRADE BUILDING LOGIC
// ────────────────────────────────────────────────────────────────────────────

function tradeWhy(
  out: DerivedPlayer,
  inn: DerivedPlayer,
  inType: "upgrade" | "cash_cow" | "buy_before_rise",
  cashGained: number,
  projGain: number
): string {
  if (inType === "upgrade") {
    if (projGain > 25)
      return `Major scoring upgrade +${projGain.toFixed(0)} pts/rd — huge team improvement`;
    if (projGain > 10)
      return `Scoring upgrade of +${projGain.toFixed(0)} pts/rd${cashGained > 0 ? ` with $${Math.round(cashGained / 1000)}k cash back` : ""}`;
    return `Quality upgrade — ${inn.player_name} scores ${proj(inn).toFixed(0)} pts/rd vs ${proj(out).toFixed(0)}`;
  }
  if (inType === "buy_before_rise") {
    if (cashGained > 100000)
      return `Price rise play — $${Math.round(cashGained / 1000)}k cash back + ${inn.player_name} rising`;
    return `Buy before rise — ${inn.player_name} beats breakeven by ${(inn._delta ?? 0).toFixed(0)} pts`;
  }
  if (cashGained > 200000)
    return `Generate $${Math.round(cashGained / 1000)}k cash — ${inn.player_name} rising fast`;
  if (cashGained > 100000)
    return `Cash generation trade — $${Math.round(cashGained / 1000)}k from downgrade, ${inn.player_name} priced to rise`;
  return `Tactical downgrade — bank cash while ${inn.player_name} generates price growth`;
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
  upgrades: DerivedPlayer[] | undefined | null,
  cashCows?: DerivedPlayer[] | undefined | null,
  buyBeforeRise?: DerivedPlayer[] | undefined | null,
): BestTrade[] {
  if (!sells || !Array.isArray(sells) || sells.length === 0) return [];
  if (!upgrades || !Array.isArray(upgrades)) return [];

  const allPairs: BestTrade[] = [];
  const buys = (buyBeforeRise && Array.isArray(buyBeforeRise)) ? buyBeforeRise : [];
  const cows = (cashCows && Array.isArray(cashCows)) ? cashCows : [];

  for (const out of sells.slice(0, 15)) {
    for (const inn of upgrades.slice(0, 15)) {
      if (inn.player_id === out.player_id) continue;
      const cashGenerated = price(out) - price(inn);
      if (cashGenerated < -150000) continue;
      const projGain = proj(inn) - proj(out);
      if (projGain <= 3) continue;
      const score =
        projGain * 4
        + cashGenerated / 2000
        + (inn.value_score ?? 0) * 2
        + (out.value_score ?? 0) * -1;
      allPairs.push({
        out,
        in: inn,
        in_type: "upgrade",
        trade_type: tradeType(cashGenerated, projGain),
        cash_generated: cashGenerated,
        projection_gain: projGain,
        score,
        why: tradeWhy(out, inn, "upgrade", cashGenerated, projGain),
      });
    }

    for (const inn of buys.slice(0, 15)) {
      if (inn.player_id === out.player_id) continue;
      const cashGenerated = price(out) - price(inn);
      if (cashGenerated < -150000) continue;
      const projGain = proj(inn) - proj(out);
      if (projGain <= 3) continue;
      const score =
        projGain * 4
        + cashGenerated / 2000
        + (inn.value_score ?? 0) * 2
        + (out.value_score ?? 0) * -1;
      allPairs.push({
        out,
        in: inn,
        in_type: "buy_before_rise",
        trade_type: tradeType(cashGenerated, projGain),
        cash_generated: cashGenerated,
        projection_gain: projGain,
        score,
        why: tradeWhy(out, inn, "buy_before_rise", cashGenerated, projGain),
      });
    }

    for (const inn of cows.slice(0, 10)) {
      if (inn.player_id === out.player_id) continue;
      const cashGenerated = price(out) - price(inn);
      if (cashGenerated < 50000) continue;
      const projGain = proj(inn) - proj(out);
      const score =
        projGain * 4
        + cashGenerated / 2000
        + (inn.value_score ?? 0) * 2
        + (out.value_score ?? 0) * -1;
      allPairs.push({
        out,
        in: inn,
        in_type: "cash_cow",
        trade_type: tradeType(cashGenerated, projGain),
        cash_generated: cashGenerated,
        projection_gain: projGain,
        score,
        why: tradeWhy(out, inn, "cash_cow", cashGenerated, projGain),
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
