import { DerivedPlayer, BestTrade } from "./engine";
import { TopMoves } from "./TopMoves";
import { StrategyGroups } from "./StrategyGroups";
import { DeepDive } from "./DeepDive";

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
  const heroTrade = (allTrades && allTrades.length > 0) ? allTrades[0] : null;
  const topValue = (cashCows && cashCows.length > 0) ? cashCows[0] : null;
  const topUpgrade = (upgrades && upgrades.length > 0) ? upgrades[0] : null;

  return (
    <div className="space-y-16">
      <TopMoves
        heroTrade={heroTrade}
        topValue={topValue}
        topUpgrade={topUpgrade}
      />

      <StrategyGroups
        sells={sells}
        traps={traps}
        buys={buys}
        cashCows={cashCows}
        upgrades={upgrades}
      />

      <DeepDive
        sells={sells}
        buys={buys}
        upgrades={upgrades}
        cashCows={cashCows}
        traps={traps}
      />
    </div>
  );
}
