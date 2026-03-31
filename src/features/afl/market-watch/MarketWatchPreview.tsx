import { TrendingDown, TrendingUp, Target } from "lucide-react";
import { DerivedPlayer } from "./engine";
import { fmtPrice } from "./helpers";

interface MarketWatchPreviewProps {
  sells: DerivedPlayer[];
  buys: DerivedPlayer[];
  value: DerivedPlayer[];
}

export function MarketWatchPreview({ sells, buys, value }: MarketWatchPreviewProps) {
  const topSells = (sells ?? []).slice(0, 2);
  const topBuys = (buys ?? []).slice(0, 2);
  const topValue = (value ?? []).slice(0, 2);

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
    ? "border-red-400/20"
    : accentColor === "green"
    ? "border-green-400/20"
    : "border-[#F5C84C]/20";

  const bgColor = accentColor === "red"
    ? "bg-red-400/[0.03]"
    : accentColor === "green"
    ? "bg-green-400/[0.03]"
    : "bg-[#F5C84C]/[0.03]";

  return (
    <div className={`border ${borderColor} ${bgColor} rounded-lg p-5`}>
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
          {title}
        </h3>
      </div>

      <div className="space-y-3">
        {(!players || players.length === 0) && (
          <div className="text-sm text-white/40 italic">No signals this week</div>
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
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-white/40 flex-shrink-0">
              #{rank}
            </span>
            <div className="font-semibold text-white truncate">
              {player.player_name}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span>{player.team}</span>
            <span>•</span>
            <span>{player.position}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
        <div>
          <div className="text-xs text-white/40 mb-1">Price</div>
          <div className="text-sm font-semibold text-white">
            {fmtPrice(player.price ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-xs text-white/40 mb-1">Projection</div>
          <div className="text-sm font-semibold text-sky-400">
            {player.projection?.toFixed(0) ?? "—"}
          </div>
        </div>
      </div>

      {player.category && (
        <div className="mt-2">
          <CategoryBadge category={player.category} />
        </div>
      )}
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const labels: Record<string, { text: string; cls: string }> = {
    sell_before_drop: { text: "SELL", cls: "text-red-400 bg-red-400/10 border-red-400/20" },
    buy_before_rise: { text: "BUY", cls: "text-green-400 bg-green-400/10 border-green-400/20" },
    upgrade_target: { text: "VALUE", cls: "text-[#F5C84C] bg-[#F5C84C]/10 border-[#F5C84C]/20" },
    cash_cow: { text: "CASH", cls: "text-sky-400 bg-sky-400/10 border-sky-400/20" },
    fade_trap: { text: "TRAP", cls: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
  };

  const badge = labels[category] || { text: category.toUpperCase(), cls: "text-white/40 bg-white/5 border-white/10" };

  return (
    <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold border ${badge.cls}`}>
      {badge.text}
    </div>
  );
}
