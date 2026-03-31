import { MWCategory } from "./types";

export function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(3).replace(/\.?0+$/, "")}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${sign}$${abs}`;
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
  if (p === "DEF") return "bg-blue-400/15 text-blue-300 border-blue-400/20";
  if (p === "MID") return "bg-[#F5C84C]/15 text-[#F5C84C] border-[#F5C84C]/20";
  if (p === "FWD") return "bg-orange-400/15 text-orange-300 border-orange-400/20";
  if (p === "RUC") return "bg-teal-400/15 text-teal-300 border-teal-400/20";
  return "bg-white/5 text-white/40 border-white/10";
}

export function fmtPriceChange(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  const abs = Math.abs(n);
  let formatted: string;
  if (abs >= 1_000_000) {
    formatted = `$${(abs / 1_000_000).toFixed(3).replace(/\.?0+$/, "")}M`;
  } else if (abs >= 1_000) {
    formatted = `$${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  } else {
    formatted = `$${abs.toFixed(0)}`;
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
