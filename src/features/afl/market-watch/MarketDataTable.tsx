import { useState, useMemo, memo } from "react";
import React from "react";
import { DerivedPlayer } from "./engine";
import { formatPrice } from "@/utils/formatPrice";
import { ChevronDown, ChevronUp, Lock } from "lucide-react";
import { cleanAiText } from "@/utils/cleanAiText";
import { generateSmartWhy } from "./helpers";
import { getActionDisplayStyles, getValueBandStyles } from "@/features/afl/rankings/components/helpers";

type SortField = "signal" | "value" | "projection" | "player" | "price";
type SortDirection = "asc" | "desc";

const SORT_TABS: { label: string; field: SortField }[] = [
  { label: "Signal", field: "signal" },
  { label: "Value", field: "value" },
  { label: "Projection", field: "projection" },
];

interface MarketDataTableProps {
  players: DerivedPlayer[];
  onPlayerClick: (player: DerivedPlayer) => void;
  isPremium: boolean;
}

export function MarketDataTable({ players, onPlayerClick, isPremium }: MarketDataTableProps) {
  const [sortField, setSortField] = useState<SortField>("value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleTabSort = (field: SortField) => {
    if (!isPremium) return;
    if (sortField === field) {
      setSortDirection(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleColumnSort = (field: SortField) => {
    if (!isPremium) return;
    if (sortField === field) {
      setSortDirection(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedPlayers = useMemo(() => {
    const bucketOrder: Record<string, number> = {
      SMASH_START: 0, START: 1, HOLD: 2, SIT: 3, HARD_SIT: 4,
    };

    return [...players].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case "signal": {
          const aSignal = (a.action_canonical ?? a.signal_tag ?? "HOLD").toUpperCase();
          const bSignal = (b.action_canonical ?? b.signal_tag ?? "HOLD").toUpperCase();
          aVal = bucketOrder[aSignal] ?? 3;
          bVal = bucketOrder[bSignal] ?? 3;
          if (aVal !== bVal) return (aVal as number) - (bVal as number);
          return (b.decision_score ?? b.value_score ?? 0) - (a.decision_score ?? a.value_score ?? 0);
        }
        case "value":
          aVal = a.decision_score ?? a.value_score ?? -999;
          bVal = b.decision_score ?? b.value_score ?? -999;
          break;
        case "projection":
          aVal = a.projection || 0;
          bVal = b.projection || 0;
          break;
        case "player":
          aVal = a.player_name;
          bVal = b.player_name;
          break;
        case "price":
          aVal = a.price || 0;
          bVal = b.price || 0;
          break;
      }

      if (sortField === "signal") return 0;

      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [players, sortField, sortDirection]);

  const freeLimit = 10;

  const visiblePlayers = useMemo(() =>
    isPremium ? sortedPlayers : sortedPlayers.slice(0, freeLimit),
    [sortedPlayers, isPremium]
  );

  const blurredPlayers = useMemo(() =>
    !isPremium && sortedPlayers.length > freeLimit
      ? sortedPlayers.slice(freeLimit, freeLimit + 5)
      : [],
    [sortedPlayers, isPremium]
  );

  const getGroupLabel = (index: number, total: number): string | null => {
    if (!isPremium) return null;
    const top = Math.min(10, Math.ceil(total * 0.2));
    const mid = Math.ceil(total * 0.6);
    if (index === 0) return "Top Targets";
    if (index === top) return "Solid Options";
    if (index === mid) return "Risk / Avoid";
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Sort toggle tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest mr-1">Sort:</span>
        {SORT_TABS.map(tab => {
          const isLocked = !isPremium;
          const isActive = sortField === tab.field;

          return (
            <button
              key={tab.field}
              onClick={() => handleTabSort(tab.field)}
              disabled={isLocked}
              title={isLocked ? "Sorting is a Neeko+ feature" : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all duration-150 ${
                isLocked
                  ? "opacity-40 cursor-not-allowed bg-white/[0.02] border-white/[0.06] text-white/30"
                  : isActive
                  ? "bg-white/10 border-white/25 text-white"
                  : "bg-white/[0.02] border-white/[0.08] text-white/40 hover:bg-white/[0.05] hover:text-white/60"
              }`}
            >
              {tab.label}
              {isLocked ? (
                <Lock className="w-3 h-3" />
              ) : (
                isActive && (
                  <span className="opacity-60">
                    {sortDirection === "asc" ? "↑" : "↓"}
                  </span>
                )
              )}
            </button>
          );
        })}
        {!isPremium && (
          <a
            href="/billing"
            className="text-[10px] text-white/25 hover:text-white/50 underline underline-offset-2 transition-colors ml-1"
          >
            Unlock sorting
          </a>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: "34%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-white/[0.12] bg-white/[0.01]">
              <SortableHeader
                label="Player"
                field="player"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleColumnSort}
                isPremium={isPremium}
              />
              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-white/35 uppercase tracking-wider whitespace-nowrap">
                Pos / Team
              </th>
              <SortableHeader
                label="Proj"
                field="projection"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleColumnSort}
                centered
                isPremium={isPremium}
              />
              <SortableHeader
                label="Price"
                field="price"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleColumnSort}
                isPremium={isPremium}
              />
              <SortableHeader
                label="Value"
                field="value"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleColumnSort}
                isPremium={isPremium}
              />
              <SortableHeader
                label="Signal"
                field="signal"
                currentField={sortField}
                direction={sortDirection}
                onSort={handleColumnSort}
                isPremium={isPremium}
              />
            </tr>
          </thead>
          <tbody>
            {visiblePlayers.map((player, index) => {
              const groupLabel = getGroupLabel(index, visiblePlayers.length);
              return (
                <React.Fragment key={player.player_id}>
                  {groupLabel && (
                    <tr>
                      <td colSpan={6} className="px-5 pt-5 pb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                            {groupLabel === "Top Targets" ? "Top Targets" : groupLabel === "Solid Options" ? "Solid Options" : "Risk / Avoid"}
                          </span>
                          <div className="flex-1 h-px bg-white/[0.06]" />
                        </div>
                      </td>
                    </tr>
                  )}
                  <PlayerRow
                    player={player}
                    onClick={() => onPlayerClick(player)}
                    isEven={index % 2 === 0}
                    isPremium={isPremium}
                  />
                </React.Fragment>
              );
            })}

            {blurredPlayers.map((player, index) => (
              <PlayerRow
                key={player.player_id}
                player={player}
                onClick={() => {}}
                isEven={(visiblePlayers.length + index) % 2 === 0}
                isBlurred
                isPremium={false}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-2">
        {visiblePlayers.map((player, index) => {
          const groupLabel = getGroupLabel(index, visiblePlayers.length);
          return (
            <React.Fragment key={player.player_id}>
              {groupLabel && (
                <div className="flex items-center gap-2 pt-3 pb-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                    {groupLabel}
                  </span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
              )}
              <MobilePlayerCard
                player={player}
                onClick={() => onPlayerClick(player)}
                isPremium={isPremium}
              />
            </React.Fragment>
          );
        })}

        {blurredPlayers.map((player) => (
          <MobilePlayerCard
            key={player.player_id}
            player={player}
            onClick={() => {}}
            isBlurred
            isPremium={false}
          />
        ))}
      </div>

      {/* Premium Gate */}
      {!isPremium && players.length > freeLimit && (
        <div className="relative mt-2 p-10 border border-white/10 rounded-xl bg-gradient-to-b from-white/[0.02] to-white/[0.05] text-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-[#F5C84C]/[0.04] via-transparent to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-xl font-bold text-white mb-2">
              Unlock the full trade board
            </h3>
            <p className="text-white/60 mb-1 text-sm max-w-sm mx-auto">
              Deeper player analysis, all value signals, and filters — with Neeko+
            </p>
            <p className="text-xs text-white/35 mb-6 mt-1.5">
              Updated weekly — edges disappear fast
            </p>
            <a
              href="/neeko-plus"
              className="inline-block px-8 py-3 bg-[#F5C84C] text-black font-bold rounded-lg hover:bg-[#F5C84C]/90 transition-all shadow-lg shadow-[#F5C84C]/20 text-sm"
            >
              Unlock 600+ Players
            </a>
          </div>
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
  muted?: boolean;
  isPremium?: boolean;
}

function SortableHeader({ label, field, currentField, direction, onSort, centered = false, muted = false, isPremium = true }: SortableHeaderProps) {
  const isActive = currentField === field;
  const isLocked = !isPremium;

  return (
    <th
      className={`px-4 py-2.5 ${centered ? "text-center" : "text-left"} text-[10px] font-bold uppercase tracking-wider select-none transition-colors ${
        isLocked
          ? "cursor-not-allowed opacity-40 text-white/25"
          : muted
          ? "cursor-pointer text-white/20 hover:text-white/35"
          : "cursor-pointer text-white/35 hover:text-white/50"
      }`}
      onClick={() => !isLocked && onSort(field)}
      title={isLocked ? "Sorting is a Neeko+ feature" : undefined}
    >
      <div className={`flex items-center gap-1 ${centered ? "justify-center" : ""}`}>
        <span>{label}</span>
        {isLocked ? (
          <Lock className="w-2.5 h-2.5" />
        ) : isActive ? (
          direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : null}
      </div>
    </th>
  );
}

interface PlayerRowProps {
  player: DerivedPlayer;
  onClick: () => void;
  isEven: boolean;
  isBlurred?: boolean;
  isPremium: boolean;
}

const PlayerRow = memo(function PlayerRow({ player, onClick, isEven, isBlurred = false, isPremium }: PlayerRowProps) {
  const signalStrength = useMemo(() => getSignalStrength(player), [player.action_canonical, player.action_display, player.signal_tag]);

  const smartWhy = useMemo(() => generateSmartWhy(player), [
    player.edge,
    player.projection,
    player.breakeven,
    player.value_score,
    player.action_canonical,
  ]);
  const truncatedWhy = useMemo(() => truncateWhy(smartWhy, 80), [smartWhy]);

  return (
    <tr
      onClick={isBlurred ? undefined : onClick}
      className={`transition-all duration-150 hover:bg-white/[0.05] hover:-translate-y-px border-b border-white/[0.03] ${isEven ? "bg-white/[0.01]" : ""} ${isBlurred ? "blur-sm pointer-events-none cursor-default" : "cursor-pointer"}`}
    >
      <td className="px-4 py-3">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="font-bold text-white text-sm leading-tight truncate">{player.player_name}</div>
            {(player.manual_status === "OUT" || (!player.manual_status && player.status === "OUT")) ? (
              <span className="rounded bg-red-500/10 px-1 py-0.5 text-[8px] font-bold text-red-400 uppercase tracking-wide border border-red-500/25">OUT</span>
            ) : (player.manual_status === "INJURED" || (!player.manual_status && player.status === "INJURED")) ? (
              <span className="rounded bg-red-500/10 px-1 py-0.5 text-[8px] font-bold text-red-400 uppercase tracking-wide border border-red-500/25">INJ</span>
            ) : (player.manual_status === "TEST" || (!player.manual_status && player.status === "TEST")) ? (
              <span className="rounded bg-orange-500/10 px-1 py-0.5 text-[8px] font-bold text-orange-400 uppercase tracking-wide border border-orange-500/25">TEST</span>
            ) : player.is_bye ? (
              <span className="rounded bg-[#F5C84C]/10 px-1 py-0.5 text-[8px] font-bold text-[#F5C84C] uppercase tracking-wide border border-[#F5C84C]/25">BYE</span>
            ) : null}
          </div>
          <div className="text-[11px] text-white/35 leading-snug">
            {formatWhyText(truncatedWhy)}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="text-xs font-medium text-white/55">{player.position}</div>
        <div className="text-[10px] text-white/30">{player.team}</div>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-lg font-bold tabular-nums text-white/80">
          {Math.round(player.projection || 0)}
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-medium text-white/70 tabular-nums whitespace-nowrap">
        {formatPrice(player.price || 0)}
      </td>
      <td className="px-4 py-3">
        <ValueBandCell player={player} />
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <div className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold border rounded-md ${signalStrength.bg} ${signalStrength.text} ${signalStrength.border}`}>
            <span>{signalStrength.icon}</span>
            <span>{signalStrength.label}</span>
          </div>
          {player.confidence_label && (
            <ConfidencePill label={player.confidence_label} />
          )}
        </div>
      </td>
    </tr>
  );
});

interface MobilePlayerCardProps {
  player: DerivedPlayer;
  onClick: () => void;
  isBlurred?: boolean;
  isPremium: boolean;
}

const MobilePlayerCard = memo(function MobilePlayerCard({ player, onClick, isBlurred = false, isPremium }: MobilePlayerCardProps) {
  const signalStrength = useMemo(() => getSignalStrength(player), [player.action_canonical, player.action_display, player.signal_tag]);

  const smartWhy = useMemo(() => generateSmartWhy(player), [
    player.edge,
    player.projection,
    player.breakeven,
    player.value_score,
    player.action_canonical,
  ]);
  const truncatedWhy = useMemo(() => truncateWhy(smartWhy, 60), [smartWhy]);

  return (
    <div
      onClick={isBlurred ? undefined : onClick}
      className={`p-4 bg-white/[0.02] border border-white/[0.08] rounded-xl hover:bg-white/[0.04] hover:-translate-y-px transition-all duration-150 ${isBlurred ? "blur-sm cursor-default pointer-events-none" : "cursor-pointer"}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <div className="font-bold text-white text-sm truncate">{player.player_name}</div>
            {(player.manual_status === "OUT" || (!player.manual_status && player.status === "OUT")) ? (
              <span className="rounded bg-red-500/10 px-1 py-0.5 text-[8px] font-bold text-red-400 uppercase tracking-wide border border-red-500/25 shrink-0">OUT</span>
            ) : (player.manual_status === "INJURED" || (!player.manual_status && player.status === "INJURED")) ? (
              <span className="rounded bg-red-500/10 px-1 py-0.5 text-[8px] font-bold text-red-400 uppercase tracking-wide border border-red-500/25 shrink-0">INJ</span>
            ) : (player.manual_status === "TEST" || (!player.manual_status && player.status === "TEST")) ? (
              <span className="rounded bg-orange-500/10 px-1 py-0.5 text-[8px] font-bold text-orange-400 uppercase tracking-wide border border-orange-500/25 shrink-0">TEST</span>
            ) : player.is_bye ? (
              <span className="rounded bg-[#F5C84C]/10 px-1 py-0.5 text-[8px] font-bold text-[#F5C84C] uppercase tracking-wide border border-[#F5C84C]/25 shrink-0">BYE</span>
            ) : null}
          </div>
          <div className="text-xs text-white/45">{player.team} · {player.position}</div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold border rounded-md shrink-0 ${signalStrength.bg} ${signalStrength.text} ${signalStrength.border}`}>
          <span>{signalStrength.icon}</span>
          <span className="hidden sm:inline">{signalStrength.label}</span>
        </div>
      </div>

      <div className="text-[11px] text-white/40 leading-tight mb-3">
        {formatWhyText(truncatedWhy)}
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div>
          <div className="text-white/35 text-[10px] mb-0.5">Proj</div>
          <div className="font-bold text-white/80">{Math.round(player.projection || 0)}</div>
        </div>
        <div>
          <div className="text-white/35 text-[10px] mb-0.5">Price</div>
          <div className="font-bold text-white/80 text-[11px]">{formatPrice(player.price || 0)}</div>
        </div>
        <div>
          <div className="text-white/35 text-[10px] mb-0.5">Value</div>
          <ValueBandCell player={player} compact />
        </div>
        <div>
          <div className="text-white/35 text-[10px] mb-0.5">Conf</div>
          {player.confidence_label
            ? <ConfidencePill label={player.confidence_label} />
            : <span className="text-white/25 text-[10px]">—</span>}
        </div>
      </div>
    </div>
  );
});

function getSignalStrength(player: DerivedPlayer) {
  const rawSignal = (player.action_canonical ?? player.signal_tag ?? "HOLD").toUpperCase();
  const displayLabel = player.action_display;

  switch (rawSignal) {
    case "SMASH_START":
      return { icon: "🔥", label: displayLabel ?? "Smash Start", bg: "bg-emerald-500/20", text: "text-emerald-300", border: "border-emerald-500/40" };
    case "START":
      return { icon: "✅", label: displayLabel ?? "Start", bg: "bg-green-500/[0.12]", text: "text-green-400", border: "border-green-500/25" };
    case "HARD_SIT":
      return { icon: "🚫", label: displayLabel ?? "Hard Sit", bg: "bg-red-500/[0.15]", text: "text-red-400", border: "border-red-500/35" };
    case "SIT":
      return { icon: "⚠️", label: displayLabel ?? "Sit", bg: "bg-orange-500/[0.10]", text: "text-orange-400", border: "border-orange-500/25" };
    default:
      return { icon: "👁", label: displayLabel ?? "Hold", bg: "bg-[#F5C84C]/[0.08]", text: "text-[#F5C84C]", border: "border-[#F5C84C]/25" };
  }
}

function ConfidencePill({ label }: { label: string }) {
  const up = label.toUpperCase();
  if (up === "HIGH") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded px-1.5 py-0.5 leading-none whitespace-nowrap">
        <span className="w-1 h-1 rounded-full bg-emerald-400 shrink-0" />
        High conf
      </span>
    );
  }
  if (up === "MEDIUM") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-[#F5C84C] bg-[#F5C84C]/10 border border-[#F5C84C]/25 rounded px-1.5 py-0.5 leading-none whitespace-nowrap">
        <span className="w-1 h-1 rounded-full bg-[#F5C84C] shrink-0" />
        Med conf
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-white/35 bg-white/[0.04] border border-white/10 rounded px-1.5 py-0.5 leading-none whitespace-nowrap">
      <span className="w-1 h-1 rounded-full bg-white/25 shrink-0" />
      Low conf
    </span>
  );
}

function ValueBandCell({ player, compact = false }: { player: DerivedPlayer; compact?: boolean }) {
  const band = player.value_band;
  if (band) {
    const cls = getValueBandStyles(band);
    return (
      <span className={`inline-block rounded border px-1.5 py-0.5 ${compact ? "text-[10px]" : "text-[11px]"} font-semibold ${cls}`}>
        {band}
      </span>
    );
  }
  const v = player.decision_score ?? player.value_score;
  if (v == null) return <span className="text-white/25 text-xs">—</span>;
  const n = Number(v);
  const sign = n > 0 ? "+" : "";
  const color = n >= 0.5 ? "text-green-400" : n >= 0 ? "text-[#F5C84C]" : n >= -0.5 ? "text-white/50" : "text-red-400";
  return (
    <span className={`${compact ? "text-[11px]" : "text-xs"} font-semibold tabular-nums ${color}`}>
      {sign}{n.toFixed(2)}
    </span>
  );
}

function truncateWhy(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.slice(0, lastSpace) + "..." : truncated + "...";
}

function formatWhyText(text: string): React.ReactNode {
  const numberRegex = /(\+?\-?\d+)/g;
  const parts = text.split(numberRegex);
  return parts.map((part, i) => {
    if (numberRegex.test(part)) {
      return <strong key={i} className="text-white/70">{part}</strong>;
    }
    return part;
  });
}
