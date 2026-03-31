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
    <div className="space-y-12">
      <StrategyGroup
        title="Sell Risks"
        subtitle="Avoid value loss"
        icon={<TrendingDown className="w-5 h-5" />}
        iconColor="text-red-400"
        players={sellRisks}
      />

      <StrategyGroup
        title="Buy Opportunities"
        subtitle="Value plays rising"
        icon={<TrendingUp className="w-5 h-5" />}
        iconColor="text-green-400"
        players={buyOpportunities}
      />

      <StrategyGroup
        title="Premium Upgrades"
        subtitle="Lock in scoring"
        icon={<Zap className="w-5 h-5" />}
        iconColor="text-white/60"
        players={upgradeTargets}
      />
    </div>
  );
}

interface StrategyGroupProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconColor: string;
  players: DerivedPlayer[];
}

function StrategyGroup({ title, subtitle, icon, iconColor, players }: StrategyGroupProps) {
  if (!players || players.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-white/[0.03] flex items-center justify-center">
          <div className={iconColor}>{icon}</div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="text-sm text-white/40">{subtitle}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {players.map((player, i) => (
          <CompactPlayerCard key={i} player={player} />
        ))}
      </div>
    </div>
  );
}

function CompactPlayerCard({ player }: { player: DerivedPlayer }) {
  const changeColor = (player.expected_price_change ?? 0) > 0 ? "text-green-400" : "text-red-400";

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 hover:bg-white/[0.03] hover:border-white/10 transition-all">
      <div className="mb-3">
        <div className="font-semibold text-white text-sm mb-0.5 truncate">{player.player_name}</div>
        <div className="text-xs text-white/40">{player.position}</div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/40">Price</span>
          <span className="font-medium text-white">{fmtPrice(player.price ?? 0)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/40">Proj</span>
          <span className="font-medium text-white">{player.projection?.toFixed(0) ?? "—"}</span>
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
