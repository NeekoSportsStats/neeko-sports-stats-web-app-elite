export interface MarketActionLabel {
  label: string;
  icon: string;
  color: string;
  bg: string;
  description: string;
}

export function mapMarketLabel(action: string): MarketActionLabel {
  switch (action?.toUpperCase()) {
    case "BUY":
      return {
        label: "Target",
        icon: "🔥",
        color: "text-green-400",
        bg: "bg-green-500/10",
        description: "High value opportunity"
      };
    case "HOLD":
      return {
        label: "Watch",
        icon: "👁",
        color: "text-yellow-400",
        bg: "bg-yellow-500/10",
        description: "Monitor closely"
      };
    case "SELL":
      return {
        label: "Avoid",
        icon: "⚠",
        color: "text-red-400",
        bg: "bg-red-500/10",
        description: "Overpriced risk"
      };
    default:
      return {
        label: action || "Unknown",
        icon: "",
        color: "text-gray-400",
        bg: "bg-gray-500/10",
        description: ""
      };
  }
}

export function getMarketActionBadge(action: string) {
  const mapped = mapMarketLabel(action);
  return `${mapped.icon} ${mapped.label}`;
}

export function getMarketActionColor(action: string): string {
  const mapped = mapMarketLabel(action);
  return mapped.color;
}

export function getMarketActionBg(action: string): string {
  const mapped = mapMarketLabel(action);
  return mapped.bg;
}
