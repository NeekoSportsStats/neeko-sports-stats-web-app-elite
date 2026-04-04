import { useState, useMemo, memo } from "react";
import { DerivedPlayer } from "./engine";
import { formatPrice } from "@/utils/formatPrice";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cleanAiText } from "@/utils/cleanAiText";
import { generateSmartWhy, getValueRankLabel, getValueRankColor, calculateValueRank } from "./helpers";
import { mapMarketLabel } from "@/utils/marketLabels";
import { signalFromField } from "@/utils/aflEdgeSignal";

type SortField = "player" | "projection" | "breakeven" | "price" | "value_gap" | "signal";
type SortDirection = "asc" | "desc";

interface MarketDataTableProps {
  players: DerivedPlayer[];
  onPlayerClick: (player: DerivedPlayer) => void;
  isPremium: boolean;
}

export function MarketDataTable({ players, onPlayerClick, isPremium }: MarketDataTableProps) {
  const [sortField, setSortField] = useState<SortField>("value_gap");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const allPlayers = players;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // MEMOIZE: Sort computation (expensive for 200+ players)
  const sortedPlayers = useMemo(() => {
    const sorted = [...players].sort((a, b) => {
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
        case "value_gap":
          aVal = a.value_gap ?? 0;
          bVal = b.value_gap ?? 0;
          break;
        case "signal":
          aVal = a.category || "";
          bVal = b.category || "";
          break;
      }

      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [players, sortField, sortDirection]);

  const freeLimit = 15;

  // MEMOIZE: Player slicing
  const visiblePlayers = useMemo(() =>
    isPremium ? sortedPlayers : sortedPlayers.slice(0, freeLimit),
    [sortedPlayers, isPremium, freeLimit]
  );

  const blurredPlayers = useMemo(() =>
    !isPremium && sortedPlayers.length > freeLimit
      ? sortedPlayers.slice(freeLimit, freeLimit + 5)
      : [],
    [sortedPlayers, isPremium, freeLimit]
  );

  return (
    <div className="space-y-4">
      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.12] bg-white/[0.01]">
              <SortableHeader
                label="Player"
                field="player"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <th className="px-5 py-2.5 text-left text-[10px] font-bold text-white/35 uppercase tracking-wider">
                Pos
              </th>
              <SortableHeader
                label="Projection"
                field="projection"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleSort}
                centered
              />
              <SortableHeader
                label="Breakeven"
                field="breakeven"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleSort}
                centered
              />
              <SortableHeader
                label="Price"
                field="price"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Value Gap"
                field="value_gap"
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
                allPlayers={allPlayers}
              />
            ))}

            {/* Blurred rows for free users */}
            {blurredPlayers.map((player, index) => (
              <PlayerRow
                key={player.player_id}
                player={player}
                onClick={() => {}}
                isEven={(visiblePlayers.length + index) % 2 === 0}
                isBlurred
                allPlayers={allPlayers}
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
            allPlayers={allPlayers}
          />
        ))}

        {blurredPlayers.map((player) => (
          <MobilePlayerCard
            key={player.player_id}
            player={player}
            onClick={() => {}}
            isBlurred
            allPlayers={allPlayers}
          />
        ))}
      </div>

      {/* Premium Gate - CONVERSION LAYER */}
      {!isPremium && players.length > freeLimit && (
        <div className="relative mt-6 p-10 border border-white/10 rounded-lg bg-gradient-to-b from-white/[0.02] to-white/[0.06] text-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-[#F5C84C]/5 via-transparent to-transparent" />
          <div className="relative z-10">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-2xl font-bold text-white mb-2">
              You're seeing a limited preview
            </h3>
            <p className="text-white/70 mb-1 text-base">
              Unlock 600+ players with real value edges before price changes
            </p>
            <p className="text-xs text-white/40 mb-6 mt-2">
              Updated weekly — edges disappear fast
            </p>
            <a
              href="/neeko-plus"
              className="inline-block px-8 py-3.5 bg-[#F5C84C] text-black font-bold rounded-lg hover:bg-[#F5C84C]/90 transition-all shadow-lg shadow-[#F5C84C]/20 text-base"
            >
              Unlock Neeko+
            </a>
          </div>
        </div>
      )}

      {/* Table Footer CTA - FREE USERS */}
      {!isPremium && (
        <div className="mt-6 p-6 border border-white/10 rounded-lg bg-white/[0.02] text-center">
          <p className="text-sm text-white/60 mb-3">
            Find every undervalued player — see the full market
          </p>
          <a
            href="/neeko-plus"
            className="inline-block px-6 py-2.5 bg-white/10 border border-white/20 text-white font-medium rounded-lg hover:bg-white/20 transition-all text-sm"
          >
            Unlock Full Market
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
  centered?: boolean;
}

function SortableHeader({ label, field, currentField, direction, onSort, centered = false }: SortableHeaderProps) {
  const isActive = currentField === field;

  return (
    <th
      className={`px-5 py-2.5 ${centered ? 'text-center' : 'text-left'} text-[10px] font-bold text-white/35 uppercase tracking-wider cursor-pointer hover:text-white/50 transition-colors select-none`}
      onClick={() => onSort(field)}
    >
      <div className={`flex items-center gap-1 ${centered ? 'justify-center' : ''}`}>
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
  isBlurred?: boolean;
  allPlayers: DerivedPlayer[];
}

// MEMOIZE: PlayerRow component to prevent unnecessary re-renders
const PlayerRow = memo(function PlayerRow({ player, onClick, isEven, isBlurred = false, allPlayers }: PlayerRowProps) {
  // PRECOMPUTE: Calculate expensive values once
  const delta = useMemo(() => (player.projection || 0) - (player.breakeven || 0), [player.projection, player.breakeven]);
  const deltaColor = delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-white/60";

  const signalStrength = useMemo(() => getSignalStrength(player), [player.signal, player._category, player.category]);

  const smartWhy = useMemo(() => generateSmartWhy(player), [
    player.summary_short,
    player.recommendation_short,
    player.value_gap,
  ]);
  const truncatedWhy = useMemo(() => truncateWhy(smartWhy, 80), [smartWhy]);

  const { percentile, rankLabel, rankColor } = useMemo(() => {
    const { percentile } = calculateValueRank(allPlayers, player);
    return {
      percentile,
      rankLabel: getValueRankLabel(percentile),
      rankColor: getValueRankColor(percentile),
    };
  }, [allPlayers.length, player.value_gap]);

  return (
    <tr
      onClick={isBlurred ? undefined : onClick}
      className={`${isBlurred ? 'cursor-default' : 'cursor-pointer'} transition-all hover:bg-white/[0.04] border-b border-white/[0.03] ${isEven ? 'bg-white/[0.01]' : ''} ${isBlurred ? 'blur-sm pointer-events-none' : ''}`}
    >
      <td className="px-5 py-2.5">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="font-bold text-white text-sm leading-tight">{player.player_name}</div>
            {(player.manual_status === "OUT" || (!player.manual_status && player.status === "OUT")) ? (
              <span className="rounded bg-red-500/10 px-1 py-0.5 text-[8px] font-bold text-red-400 uppercase tracking-wide border border-red-500/25">OUT</span>
            ) : (player.manual_status === "INJURED" || (!player.manual_status && player.status === "INJURED")) ? (
              <span className="rounded bg-orange-500/10 px-1 py-0.5 text-[8px] font-bold text-orange-400 uppercase tracking-wide border border-orange-500/25">INJ</span>
            ) : player.is_bye ? (
              <span className="rounded bg-white/[0.08] px-1 py-0.5 text-[8px] font-bold text-white/35 uppercase tracking-wide border border-white/10">BYE</span>
            ) : null}
          </div>
          <div className="text-[11px] text-white/40 leading-snug">
            {formatWhyText(truncatedWhy)}
          </div>
        </div>
      </td>
      <td className="px-5 py-2.5">
        <div className="text-xs font-medium text-white/50">{player.position}</div>
        <div className="text-[10px] text-white/30">{player.team}</div>
      </td>
      <td className="px-5 py-2.5 text-center">
        <span className={`text-lg font-bold tabular-nums ${deltaColor}`}>
          {Math.round(player.projection || 0)}
        </span>
      </td>
      <td className="px-5 py-2.5 text-center text-sm font-medium text-white/70 tabular-nums">
        {Math.round(player.breakeven || 0)}
      </td>
      <td className="px-5 py-2.5 text-sm font-medium text-white/70 tabular-nums">
        {formatPrice(player.price || 0)}
      </td>
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-base font-bold tabular-nums ${delta > 5 ? 'text-green-400' : delta < -5 ? 'text-red-400' : 'text-white/60'}`}>
            {delta > 0 ? '+' : ''}{Math.round(delta)}
          </span>
          <span className={`text-[9px] font-medium opacity-60 ${rankColor}`}>
            {rankLabel}
          </span>
        </div>
      </td>
      <td className="px-5 py-2.5">
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold border rounded ${signalStrength.bg} ${signalStrength.text} ${signalStrength.border}`}>
          <span>{signalStrength.icon}</span>
          <span>{signalStrength.label}</span>
        </div>
      </td>
    </tr>
  );
});

interface MobilePlayerCardProps {
  player: DerivedPlayer;
  onClick: () => void;
  isBlurred?: boolean;
  allPlayers: DerivedPlayer[];
}

// MEMOIZE: MobilePlayerCard component
const MobilePlayerCard = memo(function MobilePlayerCard({ player, onClick, isBlurred = false, allPlayers }: MobilePlayerCardProps) {
  // PRECOMPUTE: Calculate expensive values once
  const delta = useMemo(() => (player.projection || 0) - (player.breakeven || 0), [player.projection, player.breakeven]);
  const deltaColor = delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-white/60";

  const signalStrength = useMemo(() => getSignalStrength(player), [player.signal, player._category, player.category]);

  const smartWhy = useMemo(() => generateSmartWhy(player), [
    player.summary_short,
    player.recommendation_short,
    player.value_gap,
  ]);
  const truncatedWhy = useMemo(() => truncateWhy(smartWhy, 60), [smartWhy]);

  return (
    <div
      onClick={isBlurred ? undefined : onClick}
      className={`p-4 bg-white/[0.02] border border-white/10 rounded-lg hover:bg-white/[0.04] transition-all ${isBlurred ? 'blur-sm cursor-default pointer-events-none' : 'cursor-pointer'}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="font-bold text-white text-sm mb-0.5">{player.player_name}</div>
          <div className="text-xs text-white/50">{player.team} · {player.position}</div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold border rounded ${signalStrength.bg} ${signalStrength.text} ${signalStrength.border}`}>
          <span>{signalStrength.icon}</span>
          <span className="hidden sm:inline">{signalStrength.label}</span>
        </div>
      </div>

      <div className="text-xs text-white/50 leading-tight mb-3">
        {formatWhyText(truncatedWhy)}
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
          <div className="font-bold text-white/80 text-[11px]">{formatPrice(player.price || 0)}</div>
        </div>
        <div>
          <div className="text-white/40 text-[10px] mb-1">Gap</div>
          <div className={`font-bold ${delta > 5 ? 'text-green-400' : delta < -5 ? 'text-red-400' : 'text-white/60'}`}>
            {delta > 0 ? '+' : ''}{Math.round(delta)}
          </div>
        </div>
      </div>
    </div>
  );
});

function getSignalStrength(player: DerivedPlayer) {
  const canonicalSignal = signalFromField(player.signal);
  const category = player._category?.toUpperCase() || player.category?.toUpperCase() || "HOLD";
  const baseLabel = mapMarketLabel(category);

  if (canonicalSignal === "STRONG_BUY") {
    return {
      icon: "🔥",
      label: "Strong Buy",
      bg: "bg-green-500/20",
      text: "text-green-400",
      border: "border-green-500/40",
    };
  }

  if (canonicalSignal === "BUY") {
    return {
      icon: baseLabel.icon,
      label: "Buy",
      bg: baseLabel.bg,
      text: baseLabel.color,
      border: "border-green-500/30",
    };
  }

  if (canonicalSignal === "STRONG_SELL") {
    return {
      icon: "❌",
      label: "Strong Sell",
      bg: "bg-red-500/20",
      text: "text-red-400",
      border: "border-red-500/40",
    };
  }

  if (canonicalSignal === "SELL") {
    return {
      icon: baseLabel.icon,
      label: "Sell",
      bg: baseLabel.bg,
      text: baseLabel.color,
      border: "border-red-500/30",
    };
  }

  return {
    icon: baseLabel.icon,
    label: "Hold",
    bg: "bg-[#F5C84C]/10",
    text: "text-[#F5C84C]",
    border: "border-[#F5C84C]/30",
  };
}

function truncateWhy(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.slice(0, lastSpace) + '...' : truncated + '...';
}

function formatWhyText(text: string): React.ReactNode {
  const numberRegex = /(\+?\-?\d+)/g;
  const parts = text.split(numberRegex);

  return parts.map((part, i) => {
    if (numberRegex.test(part)) {
      return <strong key={i} className="text-white/80">{part}</strong>;
    }
    return part;
  });
}
