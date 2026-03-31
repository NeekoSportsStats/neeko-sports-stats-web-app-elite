import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { FREE_PLAYER_IDS_BY_TEAM } from "@/config/freePlayers";

export interface PlayerProjectionItem {
  player_id: number;
  player_name: string;
  team: string;
  final_projection: number | null;
}

interface PlayerSelectorDropdownProps {
  teamName: string;
  players: PlayerProjectionItem[];
  isPremium: boolean;
  loading: boolean;
  onSelect: (player: PlayerProjectionItem) => void;
}

export default function PlayerSelectorDropdown({
  teamName,
  players,
  isPremium,
  loading,
  onSelect,
}: PlayerSelectorDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const freeIds = FREE_PLAYER_IDS_BY_TEAM[teamName] ?? [];

  const sorted = [...players].sort((a, b) => {
    const aFree = freeIds.includes(a.player_id);
    const bFree = freeIds.includes(b.player_id);
    if (aFree !== bFree) return Number(bFree) - Number(aFree);
    return (b.final_projection ?? 0) - (a.final_projection ?? 0);
  });

  const freePlayers = sorted.filter((p) => freeIds.includes(p.player_id));
  const lockedPlayers = sorted.filter((p) => !freeIds.includes(p.player_id));

  function handleSelect(player: PlayerProjectionItem) {
    onSelect(player);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-150 bg-[#0B0B0B] ${
          open
            ? "border-[#F5C84C]/40 text-white"
            : "border-white/10 text-white/70 hover:border-[#F5C84C]/40 hover:text-white"
        }`}
      >
        <span>Select Player</span>
        <ChevronDown
          className={`h-4 w-4 text-neutral-400 transition-transform duration-200 flex-shrink-0 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 w-full mt-1.5 z-50 rounded-xl border border-[#F5C84C]/20 bg-[#0B0B0B] overflow-hidden"
          style={{
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.6), 0 24px 48px -8px rgba(0,0,0,0.9), 0 0 0 1px rgba(245,200,76,0.08)",
          }}
        >
          {loading ? (
            <div className="px-4 py-5 text-center text-xs text-neutral-500 animate-pulse">
              Loading players...
            </div>
          ) : players.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-neutral-500">
              No players found
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto overscroll-contain">
              {freePlayers.map((player) => (
                <button
                  key={player.player_id}
                  onClick={() => handleSelect(player)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.04] transition-colors duration-100 border-l-2 border-transparent hover:border-[#F5C84C]/40"
                >
                  <span className="text-sm font-semibold text-white truncate pr-2">
                    {player.player_name}
                  </span>
                  {player.final_projection != null && (
                    <span className="text-xs text-[#F5C84C] font-medium flex-shrink-0">
                      {Number(player.final_projection).toFixed(0)} proj.
                    </span>
                  )}
                </button>
              ))}

              {lockedPlayers.length > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1.5 border-t border-white/[0.06]">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                      Neeko+ Required
                    </span>
                  </div>
                  {lockedPlayers.map((player) =>
                    isPremium ? (
                      <button
                        key={player.player_id}
                        onClick={() => handleSelect(player)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.04] transition-colors duration-100 border-l-2 border-transparent hover:border-[#F5C84C]/40"
                      >
                        <span className="text-sm font-semibold text-white truncate pr-2">
                          {player.player_name}
                        </span>
                        {player.final_projection != null && (
                          <span className="text-xs text-[#F5C84C] font-medium flex-shrink-0">
                            {Number(player.final_projection).toFixed(0)} proj.
                          </span>
                        )}
                      </button>
                    ) : (
                      <div
                        key={player.player_id}
                        className="w-full flex items-center justify-between px-4 py-2.5 select-none"
                      >
                        <span className="text-sm text-white/30 truncate pr-2">
                          {player.player_name}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#F5C84C]/50 font-medium flex-shrink-0">
                          <Lock className="h-3 w-3" />
                          Neeko+
                        </span>
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
