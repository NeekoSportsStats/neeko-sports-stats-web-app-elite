import { TrendingDown, TrendingUp, Zap, DollarSign, ShieldAlert } from "lucide-react";
import { DerivedPlayer } from "./engine";
import { fmtPrice, fmtPriceChange } from "./helpers";

interface MarketWatchPremiumProps {
  sells: DerivedPlayer[];
  buys: DerivedPlayer[];
  upgrades: DerivedPlayer[];
  cashCows: DerivedPlayer[];
  traps: DerivedPlayer[];
}

export function MarketWatchPremium({
  sells,
  buys,
  upgrades,
  cashCows,
  traps,
}: MarketWatchPremiumProps) {
  return (
    <div className="space-y-12">
      <CategorySection
        title="Must Sell"
        subtitle="Price falling — act now before you lose value"
        icon={<TrendingDown className="w-5 h-5 text-red-400" />}
        players={sells}
        accentColor="red"
      />

      <CategorySection
        title="Early Value"
        subtitle="Buy before price rise — maximize value on these picks"
        icon={<TrendingUp className="w-5 h-5 text-green-400" />}
        players={buys}
        accentColor="green"
      />

      <CategorySection
        title="Upgrade Targets"
        subtitle="Premium scorers at fair prices — lock in points"
        icon={<Zap className="w-5 h-5 text-sky-400" />}
        players={upgrades}
        accentColor="sky"
      />

      <CategorySection
        title="Cash Cows"
        subtitle="Budget scorers rising in value — bank for future upgrades"
        icon={<DollarSign className="w-5 h-5 text-[#F5C84C]" />}
        players={cashCows}
        accentColor="gold"
      />

      <CategorySection
        title="Traps"
        subtitle="Avoid these — overpriced or declining value"
        icon={<ShieldAlert className="w-5 h-5 text-orange-400" />}
        players={traps}
        accentColor="orange"
      />
    </div>
  );
}

interface CategorySectionProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  players: DerivedPlayer[];
  accentColor: "red" | "green" | "sky" | "gold" | "orange";
}

function CategorySection({
  title,
  subtitle,
  icon,
  players,
  accentColor,
}: CategorySectionProps) {
  const borderColor = {
    red: "border-red-400/20",
    green: "border-green-400/20",
    sky: "border-sky-400/20",
    gold: "border-[#F5C84C]/20",
    orange: "border-orange-400/20",
  }[accentColor];

  if (players.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="flex items-start gap-3 mb-5">
        <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-white/[0.03] border border-white/10 flex items-center justify-center">
          {icon}
        </div>
        <div className="flex-1 pt-1">
          <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
          <p className="text-sm text-white/50">{subtitle}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {players.slice(0, 12).map((player, i) => (
          <PlayerCard key={i} player={player} rank={i + 1} borderColor={borderColor} />
        ))}
      </div>
    </div>
  );
}

interface PlayerCardProps {
  player: DerivedPlayer;
  rank: number;
  borderColor: string;
}

function PlayerCard({ player, rank, borderColor }: PlayerCardProps) {
  const confidence = player.projection_confidence ?? 0;
  const confidenceLabel = confidence >= 0.7 ? "HIGH" : confidence >= 0.5 ? "MED" : "LOW";
  const confidenceCls = confidence >= 0.7
    ? "text-green-400 bg-green-400/10 border-green-400/20"
    : confidence >= 0.5
    ? "text-[#F5C84C] bg-[#F5C84C]/10 border-[#F5C84C]/20"
    : "text-orange-400 bg-orange-400/10 border-orange-400/20";

  return (
    <div className={`bg-white/[0.02] border ${borderColor} rounded-lg p-4 hover:bg-white/[0.04] transition-colors`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-white/30">#{rank}</span>
            <div className="font-semibold text-white truncate">{player.player_name}</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span>{player.team}</span>
            <span>•</span>
            <span>{player.position}</span>
          </div>
        </div>

        <div className={`px-2 py-1 rounded text-xs font-semibold border ${confidenceCls}`}>
          {confidenceLabel}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pb-3 border-b border-white/10">
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
        <div>
          <div className="text-xs text-white/40 mb-1">Change</div>
          <div className={`text-sm font-semibold ${
            (player.expected_price_change ?? 0) > 0 ? "text-green-400" : "text-red-400"
          }`}>
            {player.expected_price_change !== undefined
              ? fmtPriceChange(player.expected_price_change)
              : "—"}
          </div>
        </div>
      </div>

      {player.value_tag && (
        <div className="mt-3">
          <ValueTag tag={player.value_tag} />
        </div>
      )}
    </div>
  );
}

function ValueTag({ tag }: { tag: string }) {
  const labels: Record<string, { text: string; cls: string }> = {
    "elite_value": { text: "Elite Value", cls: "text-[#F5C84C] bg-[#F5C84C]/10 border-[#F5C84C]/25" },
    "strong_value": { text: "Strong Value", cls: "text-green-400 bg-green-400/10 border-green-400/25" },
    "fair_value": { text: "Fair", cls: "text-white/50 bg-white/5 border-white/10" },
    "slight_premium": { text: "Slight Premium", cls: "text-orange-300 bg-orange-400/10 border-orange-400/20" },
    "overpriced": { text: "Overpriced", cls: "text-red-400 bg-red-400/10 border-red-400/20" },
  };

  const badge = labels[tag] || { text: tag, cls: "text-white/40 bg-white/5 border-white/10" };

  return (
    <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${badge.cls}`}>
      {badge.text}
    </div>
  );
}
