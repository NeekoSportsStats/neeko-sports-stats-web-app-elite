import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { DerivedPlayer } from "./engine";
import { fmtPrice } from "./helpers";

interface DeepDiveProps {
  sells: DerivedPlayer[];
  buys: DerivedPlayer[];
  upgrades: DerivedPlayer[];
  cashCows: DerivedPlayer[];
  traps: DerivedPlayer[];
}

export function DeepDive({ sells, buys, upgrades, cashCows, traps }: DeepDiveProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const totalPlayers =
    (sells?.length ?? 0) +
    (buys?.length ?? 0) +
    (upgrades?.length ?? 0) +
    (cashCows?.length ?? 0) +
    (traps?.length ?? 0);

  if (totalPlayers === 0) return null;

  return (
    <div className="border border-white/5 rounded-xl overflow-hidden bg-white/[0.01]">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="text-left">
          <div className="font-semibold text-white mb-1">Full Market Analysis</div>
          <div className="text-sm text-white/40">
            View all {totalPlayers} player signals and detailed breakdowns
          </div>
        </div>
        <div className="flex-shrink-0">
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-white/30" />
          ) : (
            <ChevronDown className="w-5 h-5 text-white/30" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-6 pb-6 space-y-10 border-t border-white/5">
          <CategoryTable title="Must Sell" players={sells} accentColor="text-red-400" />
          <CategoryTable title="Buy Before Rise" players={buys} accentColor="text-green-400" />
          <CategoryTable title="Upgrade Targets" players={upgrades} accentColor="text-white/60" />
          <CategoryTable title="Cash Cows" players={cashCows} accentColor="text-[#F5C84C]" />
          <CategoryTable title="Traps" players={traps} accentColor="text-orange-400" />
        </div>
      )}
    </div>
  );
}

interface CategoryTableProps {
  title: string;
  players: DerivedPlayer[];
  accentColor: string;
}

function CategoryTable({ title, players, accentColor }: CategoryTableProps) {
  if (!players || players.length === 0) return null;

  return (
    <div className="pt-6 first:pt-6">
      <h4 className={`text-base font-bold mb-4 ${accentColor}`}>{title}</h4>

      <div className="overflow-x-auto -mx-6 px-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left py-3 px-3 text-white/30 font-medium text-xs">#</th>
              <th className="text-left py-3 px-3 text-white/30 font-medium text-xs">Player</th>
              <th className="text-left py-3 px-3 text-white/30 font-medium text-xs">Position</th>
              <th className="text-right py-3 px-3 text-white/30 font-medium text-xs">Price</th>
              <th className="text-right py-3 px-3 text-white/30 font-medium text-xs">Projection</th>
              <th className="text-right py-3 px-3 text-white/30 font-medium text-xs">Change</th>
              <th className="text-left py-3 px-3 text-white/30 font-medium text-xs">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, idx) => (
              <tr key={idx} className="border-b border-white/[0.03] hover:bg-white/[0.01] transition-colors">
                <td className="py-3 px-3 text-white/20 font-medium text-xs">{idx + 1}</td>
                <td className="py-3 px-3 font-semibold text-white">{player.player_name}</td>
                <td className="py-3 px-3 text-white/50">{player.position}</td>
                <td className="py-3 px-3 text-right text-white">{fmtPrice(player.price ?? 0)}</td>
                <td className="py-3 px-3 text-right text-white font-medium">
                  {player.projection?.toFixed(0) ?? "—"}
                </td>
                <td className={`py-3 px-3 text-right font-medium ${
                  (player.expected_price_change ?? 0) > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {player.expected_price_change !== undefined
                    ? `${player.expected_price_change > 0 ? '+' : ''}${fmtPrice(player.expected_price_change)}`
                    : "—"}
                </td>
                <td className="py-3 px-3">
                  <ConfidenceBadge confidence={player.projection_confidence ?? 0} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const label = confidence >= 0.7 ? "High" : confidence >= 0.5 ? "Med" : "Low";
  const cls = confidence >= 0.7
    ? "text-green-400 bg-green-400/10"
    : confidence >= 0.5
    ? "text-[#F5C84C] bg-[#F5C84C]/10"
    : "text-orange-400 bg-orange-400/10";

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
