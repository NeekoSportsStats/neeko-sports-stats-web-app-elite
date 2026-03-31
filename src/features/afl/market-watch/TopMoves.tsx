import { ArrowRight, TrendingUp, Zap, DollarSign } from "lucide-react";
import { DerivedPlayer, BestTrade } from "./engine";
import { fmtPrice } from "./helpers";

interface TopMovesProps {
  heroTrade: BestTrade | null;
  topValue: DerivedPlayer | null;
  topUpgrade: DerivedPlayer | null;
}

export function TopMoves({ heroTrade, topValue, topUpgrade }: TopMovesProps) {
  if (!heroTrade && !topValue && !topUpgrade) return null;

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Top Moves This Week</h2>
        <p className="text-white/50">High-confidence decisions from our AI engine</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {heroTrade && (
          <TopTradeCard trade={heroTrade} />
        )}

        {topValue && (
          <TopPlayerCard
            player={topValue}
            title="Best Value Pick"
            icon={<DollarSign className="w-5 h-5" />}
            showGoldAccent={true}
          />
        )}

        {topUpgrade && (
          <TopPlayerCard
            player={topUpgrade}
            title="Premium Upgrade"
            icon={<Zap className="w-5 h-5" />}
            showGoldAccent={false}
          />
        )}
      </div>
    </div>
  );
}

function TopTradeCard({ trade }: { trade: BestTrade }) {
  return (
    <div className="bg-white/[0.03] border border-[#F5C84C]/20 rounded-xl p-6 shadow-lg shadow-[#F5C84C]/5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-lg bg-[#F5C84C]/10 flex items-center justify-center">
          <ArrowRight className="w-5 h-5 text-[#F5C84C]" />
        </div>
        <div>
          <div className="text-xs font-bold text-[#F5C84C] uppercase tracking-wider">Top Trade</div>
          <div className="text-sm text-white/40 mt-0.5">{trade.trade_type.replace(/_/g, ' ')}</div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="text-xs text-white/40 mb-1.5">Sell</div>
            <div className="font-bold text-white text-base">{trade.out.player_name}</div>
            <div className="text-sm text-white/50 mt-1">{fmtPrice(trade.out.price ?? 0)}</div>
          </div>
          <ArrowRight className="w-5 h-5 text-white/20 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-xs text-white/40 mb-1.5">Buy</div>
            <div className="font-bold text-white text-base">{trade.in.player_name}</div>
            <div className="text-sm text-white/50 mt-1">{fmtPrice(trade.in.price ?? 0)}</div>
          </div>
        </div>

        <div className="pt-4 border-t border-white/5">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-white/40 text-xs mb-1">Points Gain</div>
              <div className="font-semibold text-green-400">+{trade.projection_gain.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-white/40 text-xs mb-1">Cash</div>
              <div className={`font-semibold ${trade.cash_generated > 0 ? 'text-green-400' : 'text-white/50'}`}>
                {trade.cash_generated > 0 ? '+' : ''}{fmtPrice(trade.cash_generated)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TopPlayerCardProps {
  player: DerivedPlayer;
  title: string;
  icon: React.ReactNode;
  showGoldAccent: boolean;
}

function TopPlayerCard({ player, title, icon, showGoldAccent }: TopPlayerCardProps) {
  const accentColor = showGoldAccent ? "text-[#F5C84C]" : "text-white/60";
  const borderClass = showGoldAccent ? "border-[#F5C84C]/15" : "border-white/5";
  const shadowClass = showGoldAccent ? "shadow-lg shadow-[#F5C84C]/5" : "";

  return (
    <div className={`bg-white/[0.02] border ${borderClass} rounded-xl p-6 ${shadowClass}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-lg bg-white/[0.03] flex items-center justify-center">
          <div className={accentColor}>{icon}</div>
        </div>
        <div>
          <div className={`text-xs font-bold ${accentColor} uppercase tracking-wider`}>{title}</div>
          <div className="text-sm text-white/40 mt-0.5">{player.position}</div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="font-bold text-lg text-white mb-1">{player.player_name}</div>
          <div className="text-sm text-white/40">{player.team}</div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
          <div>
            <div className="text-xs text-white/40 mb-1.5">Price</div>
            <div className="font-semibold text-white">{fmtPrice(player.price ?? 0)}</div>
          </div>
          <div>
            <div className="text-xs text-white/40 mb-1.5">Projection</div>
            <div className="font-semibold text-white">{player.projection?.toFixed(0) ?? "—"}</div>
          </div>
        </div>

        {player.value_tag && (
          <div className="pt-2">
            <ValueBadge tag={player.value_tag} />
          </div>
        )}
      </div>
    </div>
  );
}

function ValueBadge({ tag }: { tag: string }) {
  const labels: Record<string, { text: string; cls: string }> = {
    "elite_value": { text: "Elite Value", cls: "text-[#F5C84C] bg-[#F5C84C]/10" },
    "strong_value": { text: "Strong Value", cls: "text-green-400 bg-green-400/10" },
    "fair_value": { text: "Fair", cls: "text-white/50 bg-white/5" },
  };

  const badge = labels[tag] || { text: tag, cls: "text-white/40 bg-white/5" };

  return (
    <div className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${badge.cls}`}>
      {badge.text}
    </div>
  );
}
