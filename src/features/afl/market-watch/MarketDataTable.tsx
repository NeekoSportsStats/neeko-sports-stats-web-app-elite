import { useState } from "react";
import { DerivedPlayer } from "./engine";
import { formatPrice } from "@/utils/formatPrice";
import { ChevronDown, ChevronUp } from "lucide-react";

type SortField = "player" | "projection" | "breakeven" | "price" | "value" | "signal";
type SortDirection = "asc" | "desc";

interface MarketDataTableProps {
  players: DerivedPlayer[];
  onPlayerClick: (player: DerivedPlayer) => void;
  isPremium: boolean;
}

export function MarketDataTable({ players, onPlayerClick, isPremium }: MarketDataTableProps) {
  const [sortField, setSortField] = useState<SortField>("value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedPlayers = [...players].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    switch (sortField) {
      case "player":
        aVal = a.player_name;
        bVal = b.player_name;
        break;
      case "projection":
        aVal = a.projection || 0;
        bVal = b.projection || 0;
        break;
      case "breakeven":
        aVal = a.breakeven || 0;
        bVal = b.breakeven || 0;
        break;
      case "price":
        aVal = a.price || 0;
        bVal = b.price || 0;
        break;
      case "value":
        aVal = a.value_score || 0;
        bVal = b.value_score || 0;
        break;
      case "signal":
        aVal = a.category || "";
        bVal = b.category || "";
        break;
    }

    const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    return sortDirection === "asc" ? comparison : -comparison;
  });

  const visiblePlayers = isPremium ? sortedPlayers : sortedPlayers.slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <SortableHeader
                label="Player"
                field="player"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <th className="px-4 py-3 text-left text-[10px] font-bold text-white/40 uppercase tracking-wider">
                Pos
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-white/40 uppercase tracking-wider">
                Team
              </th>
              <SortableHeader
                label="Projection"
                field="projection"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Breakeven"
                field="breakeven"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Price"
                field="price"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Edge"
                field="value"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Signal"
                field="signal"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
            </tr>
          </thead>
          <tbody>
            {visiblePlayers.map((player, index) => (
              <PlayerRow
                key={player.player_id}
                player={player}
                onClick={() => onPlayerClick(player)}
                isEven={index % 2 === 0}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-2">
        {visiblePlayers.map((player) => (
          <MobilePlayerCard
            key={player.player_id}
            player={player}
            onClick={() => onPlayerClick(player)}
          />
        ))}
      </div>

      {/* Premium Gate */}
      {!isPremium && players.length > 10 && (
        <div className="mt-6 p-8 border border-white/10 rounded-lg bg-white/[0.02] text-center">
          <div className="inline-block px-3 py-1 bg-[#F5C84C]/20 border border-[#F5C84C]/40 rounded-full text-xs font-bold text-[#F5C84C] mb-3">
            PREMIUM
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            {players.length - 10} More Players Available
          </h3>
          <p className="text-white/60 mb-4">
            Unlock full Market Watch with Rankings AI access
          </p>
          <a
            href="/neeko-plus"
            className="inline-block px-6 py-3 bg-[#F5C84C] text-black font-bold rounded-lg hover:bg-[#F5C84C]/90 transition-all"
          >
            Upgrade to Premium
          </a>
        </div>
      )}
    </div>
  );
}

interface SortableHeaderProps {
  label: string;
  field: SortField;
  currentField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
}

function SortableHeader({ label, field, currentField, direction, onSort }: SortableHeaderProps) {
  const isActive = currentField === field;

  return (
    <th
      className="px-4 py-3 text-left text-[10px] font-bold text-white/40 uppercase tracking-wider cursor-pointer hover:text-white/60 transition-colors select-none"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {isActive && (
          direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        )}
      </div>
    </th>
  );
}

interface PlayerRowProps {
  player: DerivedPlayer;
  onClick: () => void;
  isEven: boolean;
}

function PlayerRow({ player, onClick, isEven }: PlayerRowProps) {
  const delta = (player.projection || 0) - (player.breakeven || 0);
  const deltaColor = delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-white/60";

  const signalConfig = {
    TARGET: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30", label: "TARGET" },
    WATCH: { bg: "bg-[#F5C84C]/10", text: "text-[#F5C84C]", border: "border-[#F5C84C]/30", label: "WATCH" },
    AVOID: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30", label: "AVOID" },
  };

  const config = signalConfig[player.category as keyof typeof signalConfig] || signalConfig.WATCH;

  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer transition-all hover:bg-white/[0.04] ${isEven ? 'bg-white/[0.01]' : ''}`}
    >
      <td className="px-4 py-3">
        <div className="font-bold text-white text-sm">{player.player_name}</div>
      </td>
      <td className="px-4 py-3 text-xs text-white/60">{player.position}</td>
      <td className="px-4 py-3 text-xs text-white/60">{player.team}</td>
      <td className="px-4 py-3">
        <span className={`text-lg font-bold ${deltaColor}`}>
          {Math.round(player.projection || 0)}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-white/80">
        {Math.round(player.breakeven || 0)}
      </td>
      <td className="px-4 py-3 text-sm text-white/80">
        {formatPrice(player.price || 0)}
      </td>
      <td className="px-4 py-3">
        <span className={`text-sm font-bold ${delta > 5 ? 'text-green-400' : delta < -5 ? 'text-red-400' : 'text-white/60'}`}>
          {delta > 0 ? '+' : ''}{Math.round(delta)}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block px-2 py-1 text-[10px] font-bold border rounded ${config.bg} ${config.text} ${config.border}`}>
          {config.label}
        </span>
      </td>
    </tr>
  );
}

interface MobilePlayerCardProps {
  player: DerivedPlayer;
  onClick: () => void;
}

function MobilePlayerCard({ player, onClick }: MobilePlayerCardProps) {
  const delta = (player.projection || 0) - (player.breakeven || 0);
  const deltaColor = delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-white/60";

  const signalConfig = {
    TARGET: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30", label: "TARGET" },
    WATCH: { bg: "bg-[#F5C84C]/10", text: "text-[#F5C84C]", border: "border-[#F5C84C]/30", label: "WATCH" },
    AVOID: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30", label: "AVOID" },
  };

  const config = signalConfig[player.category as keyof typeof signalConfig] || signalConfig.WATCH;

  return (
    <div
      onClick={onClick}
      className="p-4 bg-white/[0.02] border border-white/10 rounded-lg hover:bg-white/[0.04] transition-all cursor-pointer"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-bold text-white text-sm">{player.player_name}</div>
          <div className="text-xs text-white/50">{player.team} · {player.position}</div>
        </div>
        <span className={`px-2 py-1 text-[10px] font-bold border rounded ${config.bg} ${config.text} ${config.border}`}>
          {config.label}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3 text-xs">
        <div>
          <div className="text-white/40 text-[10px] mb-1">Proj</div>
          <div className={`font-bold ${deltaColor}`}>{Math.round(player.projection || 0)}</div>
        </div>
        <div>
          <div className="text-white/40 text-[10px] mb-1">BE</div>
          <div className="font-bold text-white/80">{Math.round(player.breakeven || 0)}</div>
        </div>
        <div>
          <div className="text-white/40 text-[10px] mb-1">Price</div>
          <div className="font-bold text-white/80">{formatPrice(player.price || 0)}</div>
        </div>
        <div>
          <div className="text-white/40 text-[10px] mb-1">Edge</div>
          <div className={`font-bold ${delta > 5 ? 'text-green-400' : delta < -5 ? 'text-red-400' : 'text-white/60'}`}>
            {delta > 0 ? '+' : ''}{Math.round(delta)}
          </div>
        </div>
      </div>
    </div>
  );
}
