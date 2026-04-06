import { MWPlayerRow, MWSignal } from "./types";

export type { MWSignal };

export type DisplaySignal = "TARGET" | "WATCH" | "AVOID";

export interface DerivedPlayer extends MWPlayerRow {
  _category: MWSignal;
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

function displaySignalFromCategory(p: MWPlayerRow): DisplaySignal {
  const raw = (p.category ?? "").toLowerCase();
  if (raw === "target") return "TARGET";
  if (raw === "avoid") return "AVOID";
  return "WATCH";
}

function mwSignalFromDisplay(sig: DisplaySignal): MWSignal {
  if (sig === "TARGET") return "BUY";
  if (sig === "AVOID") return "SELL";
  return "HOLD";
}

function isEligible(p: MWPlayerRow): boolean {
  if (!p.player_id || !p.player_name) return false;
  if (p.is_bye === true) return false;
  const st = (p.status ?? "").toLowerCase();
  const ms = (p.manual_status ?? "").toLowerCase();
  if (st === "injured" || st === "out" || st === "bye") return false;
  if (ms === "injured" || ms === "out" || ms === "bye") return false;
  return true;
}

export function classifyPlayers(raw: MWPlayerRow[] | undefined | null): {
  buys: DerivedPlayer[];
  holds: DerivedPlayer[];
  sells: DerivedPlayer[];
} {
  if (!raw || !Array.isArray(raw)) {
    return { buys: [], holds: [], sells: [] };
  }

  const eligible = raw.filter(isEligible);

  const buys: DerivedPlayer[] = [];
  const holds: DerivedPlayer[] = [];
  const sells: DerivedPlayer[] = [];

  for (const p of eligible) {
    const display_signal = displaySignalFromCategory(p);
    const _category = mwSignalFromDisplay(display_signal);

    const derived: DerivedPlayer = {
      ...p,
      _category,
      display_signal,
    };

    if (_category === "BUY") buys.push(derived);
    else if (_category === "SELL") sells.push(derived);
    else holds.push(derived);
  }

  const byVal = (a: DerivedPlayer, b: DerivedPlayer) =>
    (b.value_score ?? 0) - (a.value_score ?? 0);

  return {
    buys: buys.sort(byVal),
    holds: holds.sort(byVal),
    sells: sells.sort(byVal),
  };
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
  return `Quality upgrade — ${inn.player_name} scores ${(inn.projection ?? 0).toFixed(0)} pts/rd vs ${(out.projection ?? 0).toFixed(0)}`;
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

      const cashGenerated = (out.price ?? 0) - (inn.price ?? 0);
      if (cashGenerated < -150000) continue;

      const projGain = (inn.projection ?? 0) - (out.projection ?? 0);
      if (projGain <= 3) continue;

      const score =
        projGain * 4 +
        cashGenerated / 2000 +
        (inn.edge ?? 0) * 2 +
        (out.edge ?? 0) * -1;

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
