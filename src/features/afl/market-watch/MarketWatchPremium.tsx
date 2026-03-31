import { DerivedPlayer, BestTrade } from "./engine";
import { TrendingUp, TrendingDown, Zap } from "lucide-react";

interface MarketWatchPremiumProps {
  sells: DerivedPlayer[];
  buys: DerivedPlayer[];
  upgrades: DerivedPlayer[];
  cashCows: DerivedPlayer[];
  traps: DerivedPlayer[];
  allTrades: BestTrade[];
}

export function MarketWatchPremium({
  sells,
  buys,
  upgrades,
  cashCows,
  traps,
  allTrades,
}: MarketWatchPremiumProps) {
  const topTrade = allTrades[0];
  const topValue = cashCows[0];
  const topUpgrade = upgrades[0];

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {topTrade && (
          <HeroCard
            title="Top Trade"
            player={topTrade.out}
            type="sell"
            subtitle={`Out: ${topTrade.out.player_name}`}
          />
        )}
        {topValue && (
          <HeroCard
            title="Best Value"
            player={topValue}
            type="value"
            subtitle={`${topValue.projection.toFixed(0)} avg @ $${(topValue.price / 1000).toFixed(0)}k`}
          />
        )}
        {topUpgrade && (
          <HeroCard
            title="Premium Pick"
            player={topUpgrade}
            type="buy"
            subtitle={`${topUpgrade.projection.toFixed(0)} proj`}
          />
        )}
      </div>

      <SignalStrip sells={sells.slice(0, 2)} buys={buys.slice(0, 2)} value={cashCows.slice(0, 2)} />

      <Section title="Sell Risks" players={sells.slice(0, 6)} type="sell" />
      <Section title="Buy Opportunities" players={buys.slice(0, 6)} type="buy" />
      <Section title="Premium Upgrades" players={upgrades.slice(0, 6)} type="upgrade" />
    </div>
  );
}

function HeroCard({ title, player, type, subtitle }: { title: string; player: DerivedPlayer; type: string; subtitle: string }) {
  const bgColor = type === "sell" ? "bg-red-500/10" : type === "buy" ? "bg-emerald-500/10" : "bg-amber-500/10";
  const borderColor = type === "sell" ? "border-red-500/20" : type === "buy" ? "border-emerald-500/20" : "border-amber-500/20";

  return (
    <div className={`${bgColor} ${borderColor} border rounded-lg p-6`}>
      <div className="text-white/60 text-sm mb-2">{title}</div>
      <div className="text-xl font-bold text-white mb-1">{player.player_name}</div>
      <div className="text-white/50 text-sm">{subtitle}</div>
    </div>
  );
}

function SignalStrip({ sells, buys, value }: { sells: DerivedPlayer[]; buys: DerivedPlayer[]; value: DerivedPlayer[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <SignalBlock title="Must Sell" players={sells} icon={TrendingDown} color="red" />
      <SignalBlock title="Buy Now" players={buys} icon={TrendingUp} color="green" />
      <SignalBlock title="Best Value" players={value} icon={Zap} color="amber" />
    </div>
  );
}

function SignalBlock({ title, players, icon: Icon, color }: { title: string; players: DerivedPlayer[]; icon: any; color: string }) {
  const colorClass = color === "red" ? "text-red-400" : color === "green" ? "text-emerald-400" : "text-amber-400";

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`w-5 h-5 ${colorClass}`} />
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
      <div className="space-y-2">
        {players.map((p) => (
          <div key={p.player_id} className="flex items-center justify-between text-sm">
            <span className="text-white/80">{p.player_name}</span>
            <span className="text-white/50">{p.projection.toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, players, type }: { title: string; players: DerivedPlayer[]; type: string }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-4">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {players.map((p) => (
          <PlayerCard key={p.player_id} player={p} type={type} />
        ))}
      </div>
    </div>
  );
}

function PlayerCard({ player, type }: { player: DerivedPlayer; type: string }) {
  const changeColor = (player.expected_price_change ?? 0) >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4 hover:border-white/20 transition-colors">
      <div className="text-white font-semibold mb-1">{player.player_name}</div>
      <div className="text-white/50 text-sm mb-3">{player.position} • {player.team}</div>
      <div className="flex items-center justify-between text-sm">
        <div>
          <div className="text-white/40 text-xs">Price</div>
          <div className="text-white">${(player.price / 1000).toFixed(0)}k</div>
        </div>
        <div>
          <div className="text-white/40 text-xs">Projection</div>
          <div className="text-white">{player.projection.toFixed(0)}</div>
        </div>
        <div>
          <div className="text-white/40 text-xs">Change</div>
          <div className={changeColor}>{(player.expected_price_change ?? 0) > 0 ? "+" : ""}{(player.expected_price_change ?? 0).toFixed(0)}</div>
        </div>
      </div>
    </div>
  );
}
