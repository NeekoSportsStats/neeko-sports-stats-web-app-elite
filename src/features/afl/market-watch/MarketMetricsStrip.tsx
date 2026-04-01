import { DerivedPlayer } from "./engine";
import { formatPrice } from "@/utils/formatPrice";
import { TrendingUp, Users, DollarSign, Activity } from "lucide-react";

interface MarketMetricsStripProps {
  players: DerivedPlayer[];
}

export function MarketMetricsStrip({ players }: MarketMetricsStripProps) {
  if (players.length === 0) return null;

  const totalPlayers = players.length;
  const avgProjection = players.reduce((sum, p) => sum + (p.projection || 0), 0) / totalPlayers;
  const avgPrice = players.reduce((sum, p) => sum + (p.price || 0), 0) / totalPlayers;

  const firstPrice = players[0]?.price || 0;
  const priceChange = ((avgPrice - firstPrice) / firstPrice) * 100;
  const trendDirection = priceChange >= 0 ? "up" : "down";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-white/[0.02] border border-white/10 rounded-lg">
      <MetricItem
        icon={<Users className="w-4 h-4" />}
        label="Total Players"
        value={totalPlayers.toString()}
      />
      <MetricItem
        icon={<Activity className="w-4 h-4" />}
        label="Avg Projection"
        value={Math.round(avgProjection).toString()}
      />
      <MetricItem
        icon={<DollarSign className="w-4 h-4" />}
        label="Avg Price"
        value={formatPrice(avgPrice)}
      />
      <MetricItem
        icon={<TrendingUp className="w-4 h-4" />}
        label="Market Trend"
        value={`${trendDirection === "up" ? "+" : ""}${priceChange.toFixed(1)}%`}
        valueColor={trendDirection === "up" ? "text-green-400" : "text-red-400"}
      />
    </div>
  );
}

interface MetricItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}

function MetricItem({ icon, label, value, valueColor = "text-white" }: MetricItemProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-white/40">{icon}</div>
      <div>
        <div className="text-[10px] text-white/40 uppercase tracking-wider">{label}</div>
        <div className={`text-sm font-bold ${valueColor}`}>{value}</div>
      </div>
    </div>
  );
}
