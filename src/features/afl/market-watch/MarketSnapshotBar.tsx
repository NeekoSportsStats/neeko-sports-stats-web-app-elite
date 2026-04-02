import { memo } from "react";
import { DerivedPlayer } from "./engine";
import { formatPrice } from "@/utils/formatPrice";
import { mapMarketLabel } from "@/utils/marketLabels";

interface MarketSnapshotBarProps {
  topTarget: DerivedPlayer | null;
  topWatch: DerivedPlayer | null;
  topAvoid: DerivedPlayer | null;
}

export const MarketSnapshotBar = memo(function MarketSnapshotBar({ topTarget, topWatch, topAvoid }: MarketSnapshotBarProps) {
  const targetLabel = mapMarketLabel("BUY");
  const watchLabel = mapMarketLabel("HOLD");
  const avoidLabel = mapMarketLabel("SELL");

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <SnapshotCard
        player={topTarget}
        label={`TOP ${targetLabel.label.toUpperCase()}`}
        icon={targetLabel.icon}
        tagText="Strong Value"
        tagColor="green"
      />
      <SnapshotCard
        player={topWatch}
        label={`TOP ${watchLabel.label.toUpperCase()}`}
        icon={watchLabel.icon}
        tagText="Monitor"
        tagColor="yellow"
      />
      <SnapshotCard
        player={topAvoid}
        label={`TOP ${avoidLabel.label.toUpperCase()}`}
        icon={avoidLabel.icon}
        tagText="Overpriced"
        tagColor="red"
      />
    </div>
  );
});

interface SnapshotCardProps {
  player: DerivedPlayer | null;
  label: string;
  icon: string;
  tagText: string;
  tagColor: "green" | "yellow" | "red";
}

function SnapshotCard({ player, label, icon, tagText, tagColor }: SnapshotCardProps) {
  if (!player) {
    return (
      <div className="relative bg-white/[0.02] border border-white/10 rounded-lg p-4 overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">{icon}</span>
          <span className="text-xs font-bold text-white/40 tracking-wider">{label}</span>
        </div>
        <div className="text-white/30 text-sm">No data</div>
      </div>
    );
  }

  const glowColors = {
    green: 'shadow-[0_0_20px_rgba(34,197,94,0.15)]',
    yellow: 'shadow-[0_0_20px_rgba(245,200,76,0.15)]',
    red: 'shadow-[0_0_20px_rgba(239,68,68,0.15)]',
  };

  const borderColors = {
    green: 'border-green-500/30',
    yellow: 'border-[#F5C84C]/30',
    red: 'border-red-500/30',
  };

  const tagColors = {
    green: 'bg-green-500/10 text-green-400 border-green-500/30',
    yellow: 'bg-[#F5C84C]/10 text-[#F5C84C] border-[#F5C84C]/30',
    red: 'bg-red-500/10 text-red-400 border-red-500/30',
  };

  return (
    <div className={`relative bg-white/[0.02] border ${borderColors[tagColor]} rounded-lg p-4 overflow-hidden transition-all hover:bg-white/[0.04] ${glowColors[tagColor]}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-xs font-bold text-white/40 tracking-wider">{label}</span>
        </div>
        <span className={`px-2 py-0.5 text-[10px] font-bold border rounded ${tagColors[tagColor]}`}>
          {tagText}
        </span>
      </div>

      <div className="space-y-2">
        <div>
          <div className="text-sm font-bold text-white truncate">{player.player_name}</div>
          <div className="text-xs text-white/50">{player.team} · {player.position}</div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div>
            <div className="text-white/40 text-[10px]">Projection</div>
            <div className="font-bold text-white">{Math.round(player.projection)}</div>
          </div>
          <div className="w-px h-6 bg-white/10" />
          <div>
            <div className="text-white/40 text-[10px]">Price</div>
            <div className="font-bold text-white">{formatPrice(player.price)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
