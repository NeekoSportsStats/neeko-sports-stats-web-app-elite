import { TrendingDown, TrendingUp, Zap } from "lucide-react";
import { DerivedPlayer } from "./engine";
import { fmtPrice } from "./helpers";

interface StrategyGroupsProps {
  sells: DerivedPlayer[];
  traps: DerivedPlayer[];
  buys: DerivedPlayer[];
  cashCows: DerivedPlayer[];
  upgrades: DerivedPlayer[];
}

export function StrategyGroups({ sells, traps, buys, cashCows, upgrades }: StrategyGroupsProps) {
  const sellRisks = [...(sells ?? []), ...(traps ?? [])].slice(0, 5);
  const buyOpportunities = [...(buys ?? []), ...(cashCows ?? [])].slice(0, 5);
  const upgradeTargets = (upgrades ?? []).slice(0, 4);

  return (
    <div className="space-y-10">
      <StrategyGroup
        title="Sell Risks"
        subtitle="Avoid value loss"
        icon={<TrendingDown className="w-5 h-5" />}
        players={sellRisks}
        accentColor="red"
      />

      <StrategyGroup
        title="Buy Opportunities"
        subtitle="Value plays rising"
        icon={<TrendingUp className="w-5 h-5" />}
        players={buyOpportunities}
        accentColor="green"
      />

      <StrategyGroup
        title="Premium Upgrades"
        subtitle="Lock in scoring"
        icon={<Zap className="w-5 h-5" />}
        players={upgradeTargets}
        accentColor="blue"
      />
    </div>
  );
}

interface StrategyGroupProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  players: DerivedPlayer[];
  accentColor: "red" | "green" | "blue";
}

function StrategyGroup({ title, subtitle, icon, players, accentColor }: StrategyGroupProps) {
  if (!players || players.length === 0) return null;

  const colorClasses = {
    red: {
      icon: "text-red-400",
      bg: "bg-red-400/5",
      border: "border-red-400/20",
    },
    green: {
      icon: "text-green-400",
      bg: "bg-green-400/5",
      border: "border-green-400/20",
    },
    blue: {
      icon: "text-blue-400",
      bg: "bg-blue-400/5",
      border: "border-blue-400/20",
    },
  }[accentColor];

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-10 h-10 rounded-lg ${colorClasses.bg} border ${colorClasses.border} flex items-center justify-center`}>
          <div className={colorClasses.icon}>{icon}</div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="text-sm text-white/50">{subtitle}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {players.map((player, i) => (
          <CompactPlayerCard key={i} player={player} accentColor={accentColor} />
        ))}
      </div>
    </div>
  );
}

function CompactPlayerCard({ player, accentColor }: { player: DerivedPlayer; accentColor: "red" | "green" | "blue" }) {
  const changeColor = (player.expected_price_change ?? 0) > 0 ? "text-green-400" : "text-red-400";

  const borderColor = {
    red: "border-red-400/15",
    green: "border-green-400/15",
    blue: "border-blue-400/15",
  }[accentColor];

  return (
    <div className={`bg-white/[0.02] border ${borderColor} rounded-lg p-3 hover:bg-white/[0.04] transition-colors`}>
      <div className="mb-3">
        <div className="font-semibold text-white text-sm mb-1 truncate">{player.player_name}</div>
        <div className="text-xs text-white/40">{player.position}</div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/40">Price</span>
          <span className="font-medium text-white">{fmtPrice(player.price ?? 0)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/40">Proj</span>
          <span className="font-medium text-blue-400">{player.projection?.toFixed(0) ?? "—"}</span>
        </div>
        {player.expected_price_change !== undefined && player.expected_price_change !== 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/40">Change</span>
            <span className={`font-medium ${changeColor}`}>
              {player.expected_price_change > 0 ? '+' : ''}{fmtPrice(player.expected_price_change)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
