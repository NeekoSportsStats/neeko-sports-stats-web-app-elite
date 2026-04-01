import { MWCategory } from "./types";

export function fmtPrice(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";

  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    // >= 1M → 1.126M (3 decimal places, no trailing zeros)
    return `${sign}$${(abs / 1_000_000).toFixed(3)}M`;
  }

  // < 1M → 853K (no decimals)
  return `${sign}$${Math.floor(abs / 1000)}K`;
}

export function fmtNum(v: number | null | undefined, decimals = 0): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return n.toFixed(decimals);
}

export function signalColor(signal: string | null): string {
  if (signal === "BUY")  return "text-green-400 bg-green-400/10 border-green-400/25";
  if (signal === "SELL") return "text-red-400 bg-red-400/10 border-red-400/25";
  return "text-white/40 bg-white/5 border-white/10";
}

export function momentumColor(v: number | null): string {
  if (v == null) return "text-white/40";
  if (v > 15)  return "text-green-400";
  if (v > 0)   return "text-green-300";
  if (v > -15) return "text-yellow-400";
  return "text-red-400";
}

export function riskColor(v: number | null): string {
  if (v == null) return "text-white/40";
  if (v >= 70) return "text-red-400";
  if (v >= 50) return "text-yellow-400";
  return "text-green-400";
}

export function positionBadge(pos: string | null): string {
  const p = pos?.toUpperCase() ?? "";
  if (p === "DEF") return "bg-white/[0.08] text-white/70 border-white/10";
  if (p === "MID") return "bg-[#F5C84C]/15 text-[#F5C84C] border-[#F5C84C]/20";
  if (p === "FWD") return "bg-orange-400/15 text-orange-300 border-orange-400/20";
  if (p === "RUC") return "bg-teal-400/15 text-teal-300 border-teal-400/20";
  return "bg-white/5 text-white/40 border-white/10";
}

export function fmtPriceChange(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";

  const abs = Math.abs(n);
  let formatted: string;

  if (abs >= 1_000_000) {
    formatted = `$${(abs / 1_000_000).toFixed(3)}M`;
  } else {
    formatted = `$${Math.floor(abs / 1000)}K`;
  }

  return n >= 0 ? `+${formatted}` : `-${formatted}`;
}

export function priceChangeColor(v: number | null): string {
  if (v == null) return "text-white/40";
  if (v > 5000)  return "text-green-400";
  if (v > 0)     return "text-green-300";
  if (v > -5000) return "text-yellow-400";
  return "text-red-400";
}

export function categoryLabel(cat: MWCategory): string {
  switch (cat) {
    case "buy_before_rise":  return "BUY";
    case "upgrade_target":   return "UPGRADE";
    case "sell_before_drop": return "SELL";
    case "cash_cow":         return "CASH COW";
    case "fade_trap":        return "TRAP";
    case "monitor":          return "MONITOR";
    default:                 return "SIGNAL";
  }
}

export function categoryColor(cat: MWCategory): string {
  switch (cat) {
    case "buy_before_rise":  return "text-green-400 bg-green-400/10 border-green-400/25";
    case "upgrade_target":   return "text-sky-400 bg-sky-400/10 border-sky-400/25";
    case "sell_before_drop": return "text-red-400 bg-red-400/10 border-red-400/25";
    case "cash_cow":         return "text-[#F5C84C] bg-[#F5C84C]/10 border-[#F5C84C]/25";
    case "fade_trap":        return "text-orange-400 bg-orange-400/10 border-orange-400/25";
    case "monitor":          return "text-white/50 bg-white/5 border-white/10";
    default:                 return "text-white/40 bg-white/5 border-white/10";
  }
}

export function verdictLabel(cat: MWCategory, score: number, expChange: number): string {
  switch (cat) {
    case "buy_before_rise":
      if (score >= 85) return "Strong Buy";
      if (score >= 70) return "Value Buy";
      return "Buy Signal";
    case "upgrade_target":
      if (score >= 85) return "Elite Upgrade";
      return "Upgrade Target";
    case "sell_before_drop":
      return "Sell Now";
    case "cash_cow":
      if (expChange > 30000) return "Fast Cash Growth";
      return "Cash Growth";
    case "fade_trap":
      return "Trap Alert";
    case "monitor":
      return "Monitor";
    default:
      return "Signal";
  }
}

export function verdictColor(cat: MWCategory, score: number): string {
  switch (cat) {
    case "buy_before_rise":
      if (score >= 85) return "text-green-300 bg-green-400/15 border-green-400/35";
      return "text-green-400 bg-green-400/10 border-green-400/25";
    case "upgrade_target":
      if (score >= 85) return "text-sky-300 bg-sky-400/15 border-sky-400/35";
      return "text-sky-400 bg-sky-400/10 border-sky-400/25";
    case "sell_before_drop":
      return "text-red-300 bg-red-400/15 border-red-400/35";
    case "cash_cow":
      return "text-[#F5C84C] bg-[#F5C84C]/15 border-[#F5C84C]/35";
    case "fade_trap":
      return "text-orange-300 bg-orange-400/15 border-orange-400/35";
    case "monitor":
      return "text-white/50 bg-white/5 border-white/10";
    default:
      return "text-white/40 bg-white/5 border-white/10";
  }
}

export function tradeScoreBadge(v: number): string {
  if (v >= 80) return "text-green-400 bg-green-400/10 border-green-400/25";
  if (v >= 60) return "text-[#F5C84C] bg-[#F5C84C]/10 border-[#F5C84C]/25";
  if (v >= 40) return "text-white/60 bg-white/5 border-white/10";
  return "text-orange-400 bg-orange-400/10 border-orange-400/25";
}

export function confidenceBadge(v: number): string {
  if (v >= 80) return "text-green-400 bg-green-400/10 border-green-400/25";
  if (v >= 60) return "text-[#F5C84C] bg-[#F5C84C]/10 border-[#F5C84C]/25";
  return "text-orange-400 bg-orange-400/10 border-orange-400/25";
}

export function confidenceLabel(v: number): string {
  if (v >= 80) return "High confidence";
  if (v >= 60) return "Strong";
  return "Moderate";
}

export function actionMicrocopy(category: string, edgePts?: number | null, expChange?: number | null, risk?: number | null): string {
  const edge = Number(edgePts ?? 0);
  const change = Number(expChange ?? 0);
  const riskV = Number(risk ?? 0);

  if (category === "buy_before_rise") {
    if (edge > 20) return "Underpriced relative to projection";
    return "Buy signal — price rising, get in now";
  }
  if (category === "upgrade_target") {
    return "Quality scorer — upgrade for points output";
  }
  if (category === "sell_before_drop") {
    if (change < -10000) return "Overpriced — sell before value drops";
    return "Sell window open — value declining";
  }
  if (category === "cash_cow") {
    if (change > 20000) return "Generating fast price rise";
    return "Cash Growth Target — scoring above breakeven";
  }
  if (category === "fade_trap") {
    if (riskV > 70) return "Premium cost not justified by projection";
    return "High-risk premium player to avoid";
  }
  if (category === "monitor") return "Monitor — watch this round";
  return "Signal detected";
}

export function tradeScoreExplanation(): string {
  return "Trade Score 0–100: percentile rank across all players. 80+ = elite value, 60–79 = strong, 40–59 = neutral, below 40 = avoid.";
}

export function tradeVerdict(ptsDelta: number, priceDelta: number, riskDelta: number, scoreDelta: number): string {
  if (ptsDelta > 10 && priceDelta > 20000 && scoreDelta > 0) return "Recommended upgrade";
  if (ptsDelta > 5 && priceDelta < -30000) return "Scoring upgrade, but cash risk";
  if (ptsDelta < 0 && priceDelta > 30000) return "Safer cash move with smaller points gain";
  if (ptsDelta < -5 && priceDelta < 0) return "Not worth the trade this round";
  if (ptsDelta > 10) return "Strong points upgrade";
  if (priceDelta > 30000) return "Value trade — cash upside";
  return "Marginal trade — assess your team needs";
}

export const FREE_VISIBLE = 3;

export function calculateValueRank(players: any[], currentPlayer: any): { rank: number; percentile: number } {
  const validPlayers = players
    .filter(p => p.projection && p.breakeven)
    .sort((a, b) => {
      const deltaA = (a.projection || 0) - (a.breakeven || 0);
      const deltaB = (b.projection || 0) - (b.breakeven || 0);
      return deltaB - deltaA;
    });

  const rank = validPlayers.findIndex(p => p.player_id === currentPlayer.player_id) + 1;
  const percentile = rank > 0 ? Math.round((1 - (rank / validPlayers.length)) * 100) : 0;

  return { rank, percentile };
}

export function getTrendIndicator(player: any): { label: string; icon: string; color: string } {
  const last3 = player.last3_avg || 0;
  const last5 = player.last5_avg || 0;
  const projection = player.projection || 0;

  if (!last3 || !last5) {
    return { label: "Stable Form", icon: "➡️", color: "text-white/60" };
  }

  const delta = projection - last3;
  const trendStrength = (delta / last3) * 100;

  if (trendStrength > 10) {
    return { label: "Rising Form", icon: "📈", color: "text-green-400" };
  }

  if (trendStrength < -10) {
    return { label: "Dropping Output", icon: "📉", color: "text-red-400" };
  }

  return { label: "Stable Form", icon: "➡️", color: "text-white/60" };
}

export function getValueRankLabel(percentile: number): string {
  if (percentile >= 90) return "Top 10%";
  if (percentile >= 75) return "Top 25%";
  if (percentile >= 50) return "Above avg";
  if (percentile >= 25) return "Below avg";
  return "Bottom 25%";
}

export function getValueRankColor(percentile: number): string {
  if (percentile >= 75) return "text-green-400";
  if (percentile >= 50) return "text-white/60";
  return "text-red-400";
}

export function getUrgencyMessage(player: any, delta: number): string | null {
  const category = player.category?.toUpperCase() || "WATCH";
  const projectedPriceChange = player.expected_price_change || 0;

  if (category === "TARGET" || category === "BUY" || category === "BUY_BEFORE_RISE") {
    if (delta > 15 && projectedPriceChange > 50000) {
      return "Likely price rise next round";
    }
    if (delta > 10) {
      return "Opportunity window: Short-term";
    }
    if (player.breakout_flag) {
      return "Breakout candidate — act quickly";
    }
  }

  if (category === "AVOID" || category === "SELL" || category === "SELL_BEFORE_DROP") {
    if (projectedPriceChange < -50000) {
      return "Expected price drop — exit recommended";
    }
    if (delta < -10) {
      return "Value deteriorating — consider exit";
    }
  }

  return null;
}

export function generateSmartWhy(player: any): string {
  const delta = Math.round((player.projection || 0) - (player.breakeven || 0));
  const projection = Math.round(player.projection || 0);
  const breakeven = Math.round(player.breakeven || 0);

  const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;

  const roleContext = getRoleContext(delta, projection, breakeven);

  return `${deltaStr} value gap with ${projection} projection — ${roleContext}`;
}

function getRoleContext(delta: number, projection: number, breakeven: number): string {
  if (delta > 15) {
    return "priced well below role expectation";
  }

  if (delta > 8) {
    return "priced below role expectation";
  }

  if (delta > 0) {
    return "slight discount to role output";
  }

  if (delta < -15) {
    return "significantly overpriced for role";
  }

  if (delta < -8) {
    return "priced above role expectation";
  }

  return "priced at role expectation";
}

export function getConfidenceTooltip(): string {
  return "Based on projection stability, role certainty, and matchup";
}
