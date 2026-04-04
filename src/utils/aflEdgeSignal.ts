export type EdgeSignal = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

export function computeEdgeSignal(
  projection: number | null | undefined,
  breakeven: number | null | undefined,
): EdgeSignal {
  if (projection == null || breakeven == null) return "HOLD";
  const edge = projection - breakeven;
  if (edge >= 15) return "STRONG_BUY";
  if (edge >= 6) return "BUY";
  if (edge >= -5) return "HOLD";
  if (edge >= -15) return "SELL";
  return "STRONG_SELL";
}

export function formatEdgeSignalLabel(signal: EdgeSignal | string | null): string {
  if (!signal) return "Hold";
  switch (signal.toUpperCase()) {
    case "STRONG_BUY":  return "Strong Buy";
    case "BUY":         return "Buy";
    case "HOLD":        return "Hold";
    case "SELL":        return "Sell";
    case "STRONG_SELL": return "Strong Sell";
    default:            return signal.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
}

export function getEdgeSignalStyles(signal: EdgeSignal | string | null): string {
  if (!signal) return "bg-white/5 text-white/50 border border-white/10";
  switch (signal.toUpperCase()) {
    case "STRONG_BUY":
      return "bg-green-500/15 text-green-400 border border-green-500/30";
    case "BUY":
      return "bg-green-400/10 text-green-300 border border-green-400/20";
    case "HOLD":
      return "bg-yellow-400/10 text-yellow-300 border border-yellow-400/20";
    case "SELL":
      return "bg-red-400/10 text-red-300 border border-red-400/20";
    case "STRONG_SELL":
      return "bg-red-500/20 text-red-400 border border-red-500/30";
    default:
      return "bg-white/5 text-white/50 border border-white/10";
  }
}

export function getEdgeSignalColor(signal: EdgeSignal | string | null): string {
  if (!signal) return "#9ca3af";
  switch (signal.toUpperCase()) {
    case "STRONG_BUY":  return "#4ade80";
    case "BUY":         return "#86efac";
    case "HOLD":        return "#fde047";
    case "SELL":        return "#fca5a5";
    case "STRONG_SELL": return "#f87171";
    default:            return "#9ca3af";
  }
}
