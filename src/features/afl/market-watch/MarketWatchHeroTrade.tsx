import { ArrowRight, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { BestTrade } from "./engine";
import { fmtPrice, fmtPriceChange } from "./helpers";

interface MarketWatchHeroTradeProps {
  trade: BestTrade;
}

export function MarketWatchHeroTrade({ trade }: MarketWatchHeroTradeProps) {
  const netCash = Math.abs(trade.cash_generated);
  const projectionGain = trade.projection_gain;

  const whyPoints = [
    heroWhyItWorks(trade),
    nextStepLine(trade),
    enablesLine(trade),
  ].filter(Boolean).slice(0, 3);

  return (
    <div className="relative">
      <div className="absolute -inset-[1px] bg-gradient-to-br from-[#F5C84C]/20 via-sky-400/10 to-green-400/10 rounded-xl blur-sm"></div>
      <div className="relative bg-[#0D0D0D] border border-white/10 rounded-xl p-8 md:p-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-2 h-2 rounded-full bg-[#F5C84C] animate-pulse"></div>
          <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider">
            Your Move This Week
          </h2>
        </div>

        <div className="grid md:grid-cols-[1fr_auto_1fr] gap-8 items-center mb-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-5 h-5 text-red-400" />
              <span className="text-sm font-medium text-red-400 uppercase tracking-wide">
                Sell
              </span>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-white mb-1">
                {trade.out.player_name}
              </div>
              <div className="flex items-center gap-3 text-white/50">
                <span>{trade.out.team}</span>
                <span>•</span>
                <span>{trade.out.position}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 pt-2">
              <div>
                <div className="text-xs text-white/40 mb-1">Price</div>
                <div className="text-lg font-semibold text-white">
                  {fmtPrice(trade.out.price ?? 0)}
                </div>
              </div>
              {trade.out.expected_price_change !== undefined && (
                <div>
                  <div className="text-xs text-white/40 mb-1">Change</div>
                  <div className={`text-lg font-semibold ${
                    trade.out.expected_price_change < 0 ? "text-red-400" : "text-green-400"
                  }`}>
                    {fmtPriceChange(trade.out.expected_price_change)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <ArrowRight className="w-6 h-6 text-[#F5C84C]" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <span className="text-sm font-medium text-green-400 uppercase tracking-wide">
                Buy
              </span>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-white mb-1">
                {trade.in.player_name}
              </div>
              <div className="flex items-center gap-3 text-white/50">
                <span>{trade.in.team}</span>
                <span>•</span>
                <span>{trade.in.position}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 pt-2">
              <div>
                <div className="text-xs text-white/40 mb-1">Price</div>
                <div className="text-lg font-semibold text-white">
                  {fmtPrice(trade.in.price ?? 0)}
                </div>
              </div>
              {trade.in.expected_price_change !== undefined && (
                <div>
                  <div className="text-xs text-white/40 mb-1">Change</div>
                  <div className={`text-lg font-semibold ${
                    trade.in.expected_price_change > 0 ? "text-green-400" : "text-red-400"
                  }`}>
                    {fmtPriceChange(trade.in.expected_price_change)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-8 pt-6 border-t border-white/10">
          <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-[#F5C84C]" />
              <span className="text-xs text-white/50 uppercase tracking-wide">
                Net Cash
              </span>
            </div>
            <div className={`text-2xl font-bold ${
              trade.cash_generated > 0 ? "text-green-400" : "text-red-400"
            }`}>
              {trade.cash_generated > 0 ? "+" : ""}{fmtPrice(netCash)}
            </div>
          </div>

          <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <span className="text-xs text-white/50 uppercase tracking-wide">
                Projection Gain
              </span>
            </div>
            <div className="text-2xl font-bold text-sky-400">
              +{projectionGain.toFixed(0)} pts
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-6 border-t border-white/10">
          <div className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3">
            Why This Works
          </div>
          {whyPoints.map((point, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#F5C84C] flex-shrink-0"></div>
              <div className="text-white/80 leading-relaxed">{point}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function heroWhyItWorks(trade: BestTrade): string {
  if (trade.trade_type === "AGGRESSIVE_UPGRADE") {
    if (trade.projection_gain > 30) return `Turns a declining scorer into an elite weekly performer — ${trade.projection_gain.toFixed(0)} extra pts per round`;
    if (trade.projection_gain > 15) return `Lifts your scoring floor materially — ${trade.in.player_name} consistently outscores ${trade.out.player_name}`;
    return `Scoring upgrade at a fair entry price — ${trade.in.player_name} projects ahead this week`;
  }
  if (trade.trade_type === "CASH_GENERATION") {
    const cashStr = fmtPrice(Math.abs(trade.cash_generated));
    return `Converts a falling asset into ${cashStr} in freed budget — ${trade.out.player_name}'s price is moving against you`;
  }
  if (trade.in_type === "buy_before_rise") {
    return `Buys ${trade.in.player_name} before the price rise lands — every round you wait costs more`;
  }
  return `Neutral trade that removes downside risk from ${trade.out.player_name} while preserving scoring floor`;
}

function nextStepLine(trade: BestTrade): string {
  if (trade.trade_type === "AGGRESSIVE_UPGRADE") {
    if (trade.projection_gain > 25) return "Locks in elite scoring lift — holds value all season";
    return "Points upgrade — your team scoring improves immediately";
  }
  if (trade.trade_type === "CASH_GENERATION") {
    if (trade.cash_generated > 300000) return "Builds double-upgrade bank — two moves available next round";
    return "Frees budget for a premium move in the next 1–2 rounds";
  }
  if (trade.in_type === "buy_before_rise") return "Ride the price rise — sell higher after 2–3 rounds of growth";
  return "Removes your main downside risk while keeping scoring floor stable";
}

function enablesLine(trade: BestTrade): string {
  if (trade.cash_generated > 400000) return "Builds major upgrade bank — two moves available next round";
  if (trade.cash_generated > 200000) return "Unlocks upgrade to premium scorer next round";
  if (trade.cash_generated > 100000) return "Builds cash buffer — opens mid-tier upgrade window";
  if (trade.projection_gain > 25)    return "Locks in elite scoring lift — holds long-term value";
  if (trade.projection_gain > 10)    return "Points upgrade move — team scoring improves immediately";
  if (trade.trade_type === "CASH_GENERATION")  return "Builds cash for double upgrade in coming rounds";
  if (trade.in_type === "buy_before_rise")      return "Rides price rise — sell higher after a few rounds";
  return "Maintains flexibility — stay neutral while others overpay";
}
