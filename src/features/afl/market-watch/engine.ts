import { MWPlayerRow, MWSignal } from "./types";
import { signalFromField } from "@/utils/aflEdgeSignal";

export type { MWSignal };

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

function tag(row: MWPlayerRow, category: MWSignal): DerivedPlayer {
  return { ...row, _category: category };
}

function proj(row: MWPlayerRow): number {
  return Number(row.projection ?? 0);
}

function price(row: MWPlayerRow): number {
  return Number(row.price ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE CLASSIFICATION ENGINE
// Uses canonical 5-level signal from DB as single source of truth.
// STRONG_BUY/BUY → buys, HOLD → holds, SELL/STRONG_SELL → sells
// Falls back to signal_tag (TARGET/WATCH/AVOID) if canonical signal is missing.
// ─────────────────────────────────────────────────────────────────────────────

export function classifyPlayers(raw: MWPlayerRow[] | undefined | null): {
  buys: DerivedPlayer[];
  holds: DerivedPlayer[];
  sells: DerivedPlayer[];
} {
  if (!raw || !Array.isArray(raw)) {
    return { buys: [], holds: [], sells: [] };
  }

  const filtered = raw.filter(p => {
    if (!p.player_id || !p.player_name) return false;
    if (p.is_injured === true) return false;
    if (p.is_bye === true) return false;
    const st = (p.status ?? '').toLowerCase();
    const ms = (p.manual_status ?? '').toLowerCase();
    if (st === 'injured' || st === 'out' || st === 'bye') return false;
    if (ms === 'injured' || ms === 'out' || ms === 'bye') return false;
    return true;
  });

  const buys: DerivedPlayer[] = [];
  const holds: DerivedPlayer[] = [];
  const sells: DerivedPlayer[] = [];

  for (const p of filtered) {
    if (p.signal != null) {
      const canonicalSignal = signalFromField(p.signal);
      if (canonicalSignal === 'STRONG_BUY' || canonicalSignal === 'BUY') {
        buys.push(tag(p, 'BUY'));
      } else if (canonicalSignal === 'SELL' || canonicalSignal === 'STRONG_SELL') {
        sells.push(tag(p, 'SELL'));
      } else {
        holds.push(tag(p, 'HOLD'));
      }
    } else {
      const fallback = p.signal_tag ?? (p.category ?? 'HOLD').toUpperCase();
      if (fallback === 'TARGET' || fallback === 'BUY')      buys.push(tag(p, 'BUY'));
      else if (fallback === 'AVOID' || fallback === 'SELL') sells.push(tag(p, 'SELL'));
      else                                                   holds.push(tag(p, 'HOLD'));
    }
  }

  return { buys, holds, sells };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRADE BUILDING LOGIC
// ─────────────────────────────────────────────────────────────────────────────

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
