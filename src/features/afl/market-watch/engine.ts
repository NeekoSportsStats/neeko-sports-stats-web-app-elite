import { MWPlayerRow } from "./types";

export type SignalTier = "SMASH_START" | "STRONG_START" | "START" | "HOLD" | "SIT" | "HARD_SIT";
export type DisplaySignal = "TARGET" | "WATCH" | "AVOID";
export type MWSignal = "START" | "HOLD" | "SIT";

export interface DerivedPlayer extends MWPlayerRow {
  _category: MWSignal;
  _tier: SignalTier;
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
  const raw =
    p.action_canonical ??
    p.signal_tag ??
    p.signal ??
    p.category ??
    null;
  const canonical = (raw ?? "").toUpperCase();

  if (
    canonical === "SMASH_START" ||
    canonical === "STRONG_START" ||
    canonical === "START" ||
    canonical === "TARGET" ||
    canonical === "STRONG_UP" ||
    canonical === "UP"
  ) return "TARGET";

  if (
    canonical === "HARD_SIT" ||
    canonical === "SIT" ||
    canonical === "AVOID" ||
    canonical === "DOWN" ||
    canonical === "STRONG_DOWN"
  ) return "AVOID";

  return "WATCH";
}

function mwSignalFromDisplay(sig: DisplaySignal): MWSignal {
  if (sig === "TARGET") return "START";
  if (sig === "AVOID") return "SIT";
  return "HOLD";
}

function tierFromSignal(p: MWPlayerRow): SignalTier {
  const raw = (p.action_canonical ?? p.signal_tag ?? p.signal ?? "HOLD").toUpperCase();
  if (raw === "SMASH_START" || raw === "STRONG_UP") return "SMASH_START";
  if (raw === "STRONG_START")                       return "STRONG_START";
  if (raw === "START" || raw === "UP")              return "START";
  if (raw === "HARD_SIT" || raw === "STRONG_DOWN")  return "HARD_SIT";
  if (raw === "SIT" || raw === "DOWN")              return "SIT";
  return "HOLD";
}

function isEligible(p: MWPlayerRow): boolean {
  if (!p.player_id || !p.player_name) return false;
  if (p.is_bye === true) return false;
  if (p.is_injured === true) return false;
  const st = (p.status ?? "").toUpperCase();
  const ms = (p.manual_status ?? "").toUpperCase();
  if (st === "INJURED" || st === "OUT" || st === "OMITTED") return false;
  if (ms === "INJURED" || ms === "OUT" || ms === "OMITTED") return false;
  const gp = p.games_played ?? 0;
  const hasHistory = p.last_5_avg != null || p.last_3_avg != null;
  if (gp < 2 && !hasHistory) return false;
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
    const _tier = tierFromSignal(p);

    const derived: DerivedPlayer = {
      ...p,
      _category,
      _tier,
      display_signal,
    };

    if (_category === "START") buys.push(derived);
    else if (_category === "SIT") sells.push(derived);
    else holds.push(derived);
  }

  const tierPriority: Record<SignalTier, number> = {
    SMASH_START: 0,
    STRONG_START: 1,
    START: 2,
    HOLD: 3,
    SIT: 4,
    HARD_SIT: 5,
  };

  function effectiveMWValue(p: DerivedPlayer): number {
    if (p.decision_score != null) return p.decision_score;
    if (p.value_score != null) return p.value_score;
    if (p.projection != null && p.breakeven != null) return p.projection - p.breakeven;
    return 0;
  }

  const byTierThenEdge = (a: DerivedPlayer, b: DerivedPlayer) => {
    const tDiff = tierPriority[a._tier] - tierPriority[b._tier];
    if (tDiff !== 0) return tDiff;
    return effectiveMWValue(b) - effectiveMWValue(a);
  };

  return {
    buys: buys.sort(byTierThenEdge),
    holds: holds.sort(byTierThenEdge),
    sells: sells.sort(byTierThenEdge),
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
        (inn.decision_score ?? inn.value_score ?? 0) * 20 +
        (out.decision_score ?? out.value_score ?? 0) * -10;

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
