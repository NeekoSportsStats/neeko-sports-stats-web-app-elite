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

function tag(row: MWPlayerRow): DerivedPlayer {
  const cat = row.category as DerivedCategory;
  return { ...row, _derived_category: cat, _delta: delta(row) };
}

// Deduplicate by player_id — keep highest trade_score entry
function dedupeByPlayerId(players: DerivedPlayer[]): DerivedPlayer[] {
  const map = new Map<number, DerivedPlayer>();
  for (const p of players) {
    const existing = map.get(p.player_id);
    if (!existing || (p.trade_score ?? 0) > (existing.trade_score ?? 0)) {
      map.set(p.player_id, p);
    }
  }
  return Array.from(map.values());
}

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

  // Deduplicate raw input first — SQL should already be clean but safeguard here
  const seen = new Set<number>();
  const uniqueRaw = raw.filter(r => {
    if (seen.has(r.player_id)) return false;
    seen.add(r.player_id);
    return true;
  });

  const tagged = uniqueRaw.map(tag);

  // Each category filters by DB-assigned category only — trust the SQL classification
  // No extra value_score / EPC filters that could over-restrict results

  const cashCows = dedupeByPlayerId(
    tagged
      .filter(r => r.category === "cash_cow")
      .sort((a, b) => (b.expected_price_change ?? 0) - (a.expected_price_change ?? 0))
  ).slice(0, 12);

  const buyBeforeRise = dedupeByPlayerId(
    tagged
      .filter(r => r.category === "buy_before_rise")
      .sort((a, b) => (b.expected_price_change ?? 0) - (a.expected_price_change ?? 0))
  ).slice(0, 12);

  const upgrades = dedupeByPlayerId(
    tagged
      .filter(r => r.category === "upgrade_target")
      .sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0))
  ).slice(0, 12);

  // Sells: trust DB category — no extra value_score filter
  const sells = dedupeByPlayerId(
    tagged
      .filter(r => r.category === "sell_before_drop")
      .sort((a, b) => (a.expected_price_change ?? 0) - (b.expected_price_change ?? 0))
  ).slice(0, 12);

  const traps = dedupeByPlayerId(
    tagged
      .filter(r => r.category === "fade_trap")
      .sort((a, b) => (a.expected_price_change ?? 0) - (b.expected_price_change ?? 0))
  ).slice(0, 10);

  // ── Fallback logic — never return empty categories ──────────────────────────

  const allTagged = dedupeByPlayerId(tagged);

  const cashCowsFinal = cashCows.length >= 5 ? cashCows : (() => {
    const fallback = allTagged
      .filter(r => r.category !== "sell_before_drop")
      .filter(r => !cashCows.find(c => c.player_id === r.player_id))
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
      .slice(0, 12 - cashCows.length);
    return [...cashCows, ...fallback].slice(0, 12);
  })();

  const buyBeforeRiseFinal = buyBeforeRise.length >= 5 ? buyBeforeRise : (() => {
    const cowIds = new Set(cashCowsFinal.map(r => r.player_id));
    const fallback = allTagged
      .filter(r => r.category === "monitor" && delta(r) > 0)
      .filter(r => !cowIds.has(r.player_id))
      .sort((a, b) => delta(b) - delta(a))
      .slice(0, 12 - buyBeforeRise.length);
    return [...buyBeforeRise, ...fallback].slice(0, 12);
  })();

  const upgradesFinal = upgrades.length >= 5 ? upgrades : (() => {
    const existIds = new Set(upgrades.map(r => r.player_id));
    const fallback = allTagged
      .filter(r => r.category !== "sell_before_drop" && r.category !== "fade_trap")
      .filter(r => !existIds.has(r.player_id))
      .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
      .slice(0, 12 - upgrades.length);
    return [...upgrades, ...fallback].slice(0, 12);
  })();

  const sellsFinal = sells.length >= 5 ? sells : (() => {
    const existIds = new Set(sells.map(r => r.player_id));
    const fallback = allTagged
      .filter(r => delta(r) < -5)
      .filter(r => !existIds.has(r.player_id))
      .sort((a, b) => delta(a) - delta(b))
      .slice(0, 12 - sells.length);
    return [...sells, ...fallback].slice(0, 12);
  })();

  const trapsFinal = traps.length >= 4 ? traps : (() => {
    const existIds = new Set(traps.map(r => r.player_id));
    const fallback = allTagged
      .filter(r => (r.price ?? 0) >= 500000 && delta(r) < 0)
      .filter(r => !existIds.has(r.player_id))
      .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
      .slice(0, 10 - traps.length);
    return [...traps, ...fallback].slice(0, 10);
  })();

  return {
    buyBeforeRise: buyBeforeRiseFinal,
    cashCows: cashCowsFinal,
    upgrades: upgradesFinal,
    sells: sellsFinal,
    traps: trapsFinal,
  };
}

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

  // Deduplicate: each buy player appears at most once (best trade for that buy target wins)
  const seenBuy = new Set<number>();
  const dedupedByBuy = allPairs
    .sort((a, b) => b.score - a.score)
    .filter(t => {
      if (seenBuy.has(t.in.player_id)) return false;
      seenBuy.add(t.in.player_id);
      return true;
    });

  // Each sell player appears at most 3 times to allow variety
  const sellCount = new Map<number, number>();
  const result = dedupedByBuy.filter(t => {
    const n = sellCount.get(t.out.player_id) ?? 0;
    if (n >= 3) return false;
    sellCount.set(t.out.player_id, n + 1);
    return true;
  });

  return result.slice(0, 10);
}
