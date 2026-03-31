interface SignalStripProps {
  sellCount: number;
  buyCount: number;
  valueCount: number;
  upgradeCount: number;
}

export function MarketWatchSignalStrip({ sellCount, buyCount, valueCount, upgradeCount }: SignalStripProps) {
  return (
    <div className="flex items-center justify-center gap-3 flex-wrap">
      <SignalPill label="Must Sell" count={sellCount} color="red" />
      <SignalPill label="Buy Now" count={buyCount} color="green" />
      <SignalPill label="Best Value" count={valueCount} color="gold" />
      <SignalPill label="Upgrades" count={upgradeCount} color="purple" />
    </div>
  );
}

interface SignalPillProps {
  label: string;
  count: number;
  color: "red" | "green" | "gold" | "purple";
}

function SignalPill({ label, count, color }: SignalPillProps) {
  const config = {
    red: {
      bg: "bg-red-500/10 hover:bg-red-500/20",
      border: "border-red-500/30 hover:border-red-500/50",
      text: "text-red-400",
      glow: "hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]",
    },
    green: {
      bg: "bg-green-500/10 hover:bg-green-500/20",
      border: "border-green-500/30 hover:border-green-500/50",
      text: "text-green-400",
      glow: "hover:shadow-[0_0_20px_rgba(34,197,94,0.2)]",
    },
    gold: {
      bg: "bg-[#F5C84C]/10 hover:bg-[#F5C84C]/20",
      border: "border-[#F5C84C]/30 hover:border-[#F5C84C]/50",
      text: "text-[#F5C84C]",
      glow: "hover:shadow-[0_0_20px_rgba(245,200,76,0.2)]",
    },
    purple: {
      bg: "bg-purple-500/10 hover:bg-purple-500/20",
      border: "border-purple-500/30 hover:border-purple-500/50",
      text: "text-purple-400",
      glow: "hover:shadow-[0_0_20px_rgba(168,85,247,0.2)]",
    },
  }[color];

  return (
    <button
      className={`
        ${config.bg} ${config.border} ${config.glow}
        px-5 py-2.5 rounded-full border
        transition-all duration-200
        hover:scale-105
        group
      `}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
          {label}:
        </span>
        <span className={`text-sm font-bold ${config.text} tabular-nums`}>
          {count}
        </span>
      </div>
    </button>
  );
}
