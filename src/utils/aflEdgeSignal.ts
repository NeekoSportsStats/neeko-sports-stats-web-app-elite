export type EdgeSignal = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

function normalise(s: string | null | undefined): string {
  if (!s) return "HOLD";
  return s.toUpperCase().replace(/ /g, "_").replace(/STRONG BUY/g, "STRONG_BUY").replace(/STRONG SELL/g, "STRONG_SELL");
}

export function signalFromField(signal: string | null | undefined): EdgeSignal {
  const s = normalise(signal);
  if (s === "STRONG_BUY" || s === "BUY" || s === "HOLD" || s === "SELL" || s === "STRONG_SELL")
    return s as EdgeSignal;
  return "HOLD";
}

export function computeEdgeSignal(
  projection: number | null | undefined,
  baseline: number | null | undefined,
): EdgeSignal {
  if (projection == null || baseline == null) return "HOLD";
  const edge = projection - baseline;
  if (edge >= 9)  return "STRONG_BUY";
  if (edge >= -3) return "BUY";
  if (projection >= 95 && edge >= -30) return "HOLD";
  if (edge >= -19) return "HOLD";
  if (edge >= -30) return "SELL";
  return "STRONG_SELL";
}

export function formatEdgeSignalLabel(signal: EdgeSignal | string | null): string {
  const s = normalise(signal);
  switch (s) {
    case "STRONG_BUY":  return "Strong Buy";
    case "BUY":         return "Buy";
    case "HOLD":        return "Hold";
    case "SELL":        return "Sell";
    case "STRONG_SELL": return "Strong Sell";
    default:            return s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
}

export function getEdgeSignalStyles(signal: EdgeSignal | string | null): string {
  const s = normalise(signal);
  switch (s) {
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
  const s = normalise(signal);
  switch (s) {
    case "STRONG_BUY":  return "#4ade80";
    case "BUY":         return "#86efac";
    case "HOLD":        return "#fde047";
    case "SELL":        return "#fca5a5";
    case "STRONG_SELL": return "#f87171";
    default:            return "#9ca3af";
  }
}

export function formatValueScore(value: number | null): string {
  if (value == null) return "—";
  if (value > 0) return `+${value.toFixed(1)}`;
  return value.toFixed(1);
}
