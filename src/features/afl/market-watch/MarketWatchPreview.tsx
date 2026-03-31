import { TrendingDown, TrendingUp, Target } from "lucide-react";
import { DerivedPlayer } from "./engine";
import { fmtPrice } from "./helpers";

interface MarketWatchPreviewProps {
  sells: DerivedPlayer[];
  buys: DerivedPlayer[];
  value: DerivedPlayer[];
}

export function MarketWatchPreview({ sells, buys, value }: MarketWatchPreviewProps) {
  // FREE LIMIT: Show top 8 players per category for free users
  const FREE_LIMIT = 8;
  const topSells = (sells ?? []).slice(0, FREE_LIMIT);
  const topBuys = (buys ?? []).slice(0, FREE_LIMIT);
  const topValue = (value ?? []).slice(0, FREE_LIMIT);

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <PreviewSection
        title="Must Sell"
        icon={<TrendingDown className="w-5 h-5 text-red-400" />}
        players={topSells}
        accentColor="red"
      />
      <PreviewSection
        title="Buy Now"
        icon={<TrendingUp className="w-5 h-5 text-green-400" />}
        players={topBuys}
        accentColor="green"
      />
      <PreviewSection
        title="Best Value"
        icon={<Target className="w-5 h-5 text-[#F5C84C]" />}
        players={topValue}
        accentColor="gold"
      />
    </div>
  );
}

interface PreviewSectionProps {
  title: string;
  icon: React.ReactNode;
  players: DerivedPlayer[];
  accentColor: "red" | "green" | "gold";
}

function PreviewSection({ title, icon, players, accentColor }: PreviewSectionProps) {
  const borderColor = accentColor === "red"
    ? "border-red-400/10"
    : accentColor === "green"
    ? "border-green-400/10"
    : "border-[#F5C84C]/10";

  return (
    <div className={`border ${borderColor} bg-white/[0.01] rounded-lg p-5`}>
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          {title}
        </h3>
      </div>

      <div className="space-y-3">
        {(!players || players.length === 0) && (
          <div className="text-sm text-white/30 italic">No signals this week</div>
        )}
        {players && players.map((player, i) => (
          <PreviewCard key={i} player={player} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}

interface PreviewCardProps {
  player: DerivedPlayer;
  rank: number;
}

function PreviewCard({ player, rank }: PreviewCardProps) {
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 hover:bg-white/[0.03] hover:border-white/10 transition-all">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-white/30 flex-shrink-0">
              #{rank}
            </span>
            <div className="font-semibold text-white truncate text-sm">
              {player.player_name}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/40">
            <span>{player.position}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
        <div>
          <div className="text-xs text-white/40 mb-0.5">Price</div>
          <div className="text-sm font-semibold text-white">
            {fmtPrice(player.price ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-xs text-white/40 mb-0.5">Projection</div>
          <div className="text-sm font-semibold text-white">
            {player.projection?.toFixed(0) ?? "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
