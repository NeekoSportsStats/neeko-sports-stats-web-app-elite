import { memo } from "react";
import { DerivedPlayer } from "./engine";
import { formatPrice } from "@/utils/formatPrice";
import { cleanAiText } from "@/utils/cleanAiText";

interface MarketSnapshotBarProps {
  topTarget: DerivedPlayer | null;
  topWatch: DerivedPlayer | null;
  topAvoid: DerivedPlayer | null;
}

export const MarketSnapshotBar = memo(function MarketSnapshotBar({ topTarget, topWatch, topAvoid }: MarketSnapshotBarProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <SnapshotCard
        player={topTarget}
        heading="Best Trade Target"
        emptyText="No targets this round"
        variant="target"
      />
      <SnapshotCard
        player={topWatch}
        heading="Monitor This Week"
        emptyText="No watch players found"
        variant="watch"
      />
      <SnapshotCard
        player={topAvoid}
        heading="Overpriced Risk"
        emptyText="No overpriced players"
        variant="avoid"
      />
    </div>
  );
});

interface SnapshotCardProps {
  player: DerivedPlayer | null;
  heading: string;
  emptyText: string;
  variant: "target" | "watch" | "avoid";
}

const variantStyles = {
  target: {
    border: "border-green-500/30",
    glow: "shadow-[0_0_24px_rgba(34,197,94,0.12)]",
    hoverGlow: "hover:shadow-[0_0_32px_rgba(34,197,94,0.20)]",
    headingColor: "text-green-400",
    tagBg: "bg-green-500/10 text-green-400 border-green-500/30",
    icon: "🔥",
    headingLabel: "TARGET",
    dot: "bg-green-500",
  },
  watch: {
    border: "border-[#F5C84C]/20",
    glow: "shadow-[0_0_24px_rgba(245,200,76,0.08)]",
    hoverGlow: "hover:shadow-[0_0_32px_rgba(245,200,76,0.15)]",
    headingColor: "text-[#F5C84C]",
    tagBg: "bg-[#F5C84C]/10 text-[#F5C84C] border-[#F5C84C]/30",
    icon: "👁",
    headingLabel: "WATCH",
    dot: "bg-[#F5C84C]",
  },
  avoid: {
    border: "border-orange-500/20",
    glow: "shadow-[0_0_24px_rgba(249,115,22,0.08)]",
    hoverGlow: "hover:shadow-[0_0_32px_rgba(249,115,22,0.14)]",
    headingColor: "text-orange-400",
    tagBg: "bg-orange-500/10 text-orange-400 border-orange-500/25",
    icon: "⚠️",
    headingLabel: "AVOID",
    dot: "bg-orange-500",
  },
};

function SnapshotCard({ player, heading, emptyText, variant }: SnapshotCardProps) {
  const styles = variantStyles[variant];

  if (!player) {
    return (
      <div className={`relative bg-white/[0.02] border ${styles.border} rounded-xl p-4 overflow-hidden`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">{styles.icon}</span>
          <span className="text-[10px] font-bold text-white/40 tracking-widest uppercase">{styles.headingLabel}</span>
        </div>
        <div className="text-sm font-semibold text-white/70 mb-1">{heading}</div>
        <div className="text-white/30 text-xs mt-2">{emptyText}</div>
      </div>
    );
  }

  const aiWhy = player.why ? cleanAiText(player.why) : null;

  const truncatedWhy = aiWhy && aiWhy.length > 70
    ? aiWhy.slice(0, 70).replace(/\s+\S*$/, "") + "..."
    : aiWhy;

  return (
    <div
      className={`relative bg-white/[0.02] border ${styles.border} rounded-xl p-4 overflow-hidden transition-all duration-200 ${styles.glow} ${styles.hoverGlow} hover:-translate-y-0.5 hover:bg-white/[0.04] cursor-pointer`}
    >
      {/* Top label row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{styles.icon}</span>
          <span className="text-[10px] font-bold text-white/40 tracking-widest uppercase">{styles.headingLabel}</span>
        </div>
        <span className={`px-2 py-0.5 text-[10px] font-bold border rounded-md ${styles.tagBg}`}>
          {player.value_rating_label}
        </span>
      </div>

      {/* Card heading */}
      <div className={`text-sm font-bold ${styles.headingColor} mb-2 leading-tight`}>
        {heading}
      </div>

      {/* Player info */}
      <div className="mb-3">
        <div className="text-base font-bold text-white leading-tight truncate">{player.player_name}</div>
        <div className="text-xs text-white/45 mt-0.5">{player.team} · {player.position}</div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs mb-3">
        <div>
          <div className="text-white/35 text-[10px] mb-0.5">Projection</div>
          <div className="font-bold text-white tabular-nums">{Math.round(player.projection)}</div>
        </div>
        <div className="w-px h-6 bg-white/10" />
        <div>
          <div className="text-white/35 text-[10px] mb-0.5">Price</div>
          <div className="font-bold text-white tabular-nums">{formatPrice(player.price)}</div>
        </div>
      </div>

      {/* AI WHY */}
      {truncatedWhy && (
        <div className="text-[11px] text-white/40 leading-relaxed border-t border-white/[0.06] pt-2">
          {truncatedWhy}
        </div>
      )}
    </div>
  );
}
