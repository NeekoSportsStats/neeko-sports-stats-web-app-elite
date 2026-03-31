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
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Top Moves This Week</h2>
        <p className="text-white/60">High-confidence decisions from our AI engine</p>
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
            iconColor="text-[#F5C84C]"
            bgColor="bg-[#F5C84C]/5"
            borderColor="border-[#F5C84C]/20"
          />
        )}

        {topUpgrade && (
          <TopPlayerCard
            player={topUpgrade}
            title="Top Upgrade"
            icon={<Zap className="w-5 h-5" />}
            iconColor="text-blue-400"
            bgColor="bg-blue-400/5"
            borderColor="border-blue-400/20"
          />
        )}
      </div>
    </div>
  );
}

function TopTradeCard({ trade }: { trade: BestTrade }) {
  return (
    <div className="bg-gradient-to-br from-[#F5C84C]/10 via-white/[0.02] to-white/[0.02] border border-[#F5C84C]/30 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-10 h-10 rounded-lg bg-[#F5C84C]/10 border border-[#F5C84C]/30 flex items-center justify-center">
          <ArrowRight className="w-5 h-5 text-[#F5C84C]" />
        </div>
        <div>
          <div className="text-xs font-semibold text-[#F5C84C] uppercase tracking-wide">Top Trade</div>
          <div className="text-sm text-white/50">{trade.trade_type.replace(/_/g, ' ')}</div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs text-white/40 mb-1">Sell</div>
            <div className="font-bold text-white">{trade.out.player_name}</div>
            <div className="text-sm text-white/50">{fmtPrice(trade.out.price ?? 0)}</div>
          </div>
          <ArrowRight className="w-5 h-5 text-white/30 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-xs text-white/40 mb-1">Buy</div>
            <div className="font-bold text-white">{trade.in.player_name}</div>
            <div className="text-sm text-white/50">{fmtPrice(trade.in.price ?? 0)}</div>
          </div>
        </div>

        <div className="pt-4 border-t border-white/10">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-white/40">Points Gain</div>
              <div className="font-semibold text-green-400">+{trade.projection_gain.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-white/40">Cash</div>
              <div className={`font-semibold ${trade.cash_generated > 0 ? 'text-green-400' : 'text-white/60'}`}>
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
  iconColor: string;
  bgColor: string;
  borderColor: string;
}

function TopPlayerCard({ player, title, icon, iconColor, bgColor, borderColor }: TopPlayerCardProps) {
  return (
    <div className={`${bgColor} border ${borderColor} rounded-xl p-6`}>
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-10 h-10 rounded-lg ${bgColor} border ${borderColor} flex items-center justify-center`}>
          <div className={iconColor}>{icon}</div>
        </div>
        <div>
          <div className={`text-xs font-semibold ${iconColor} uppercase tracking-wide`}>{title}</div>
          <div className="text-sm text-white/50">{player.position}</div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="font-bold text-xl text-white mb-1">{player.player_name}</div>
          <div className="text-sm text-white/50">{player.team}</div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10">
          <div>
            <div className="text-xs text-white/40 mb-1">Price</div>
            <div className="font-semibold text-white">{fmtPrice(player.price ?? 0)}</div>
          </div>
          <div>
            <div className="text-xs text-white/40 mb-1">Projection</div>
            <div className="font-semibold text-blue-400">{player.projection?.toFixed(0) ?? "—"}</div>
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
    "elite_value": { text: "Elite Value", cls: "text-[#F5C84C] bg-[#F5C84C]/20 border-[#F5C84C]/30" },
    "strong_value": { text: "Strong Value", cls: "text-green-400 bg-green-400/20 border-green-400/30" },
    "fair_value": { text: "Fair", cls: "text-white/50 bg-white/10 border-white/20" },
  };

  const badge = labels[tag] || { text: tag, cls: "text-white/40 bg-white/10 border-white/20" };

  return (
    <div className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border ${badge.cls}`}>
      {badge.text}
    </div>
  );
}
