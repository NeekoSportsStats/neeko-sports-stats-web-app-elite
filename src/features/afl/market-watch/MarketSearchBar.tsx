import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Lock, X } from "lucide-react";
import { track } from "@/lib/analytics";
import { DerivedPlayer } from "./engine";

interface MarketSearchBarProps {
  players: DerivedPlayer[];
  isPremium: boolean;
  onSelect: (player: DerivedPlayer | null) => void;
  selectedPlayerId: number | null;
}

function formatPrice(price: number): string {
  if (price >= 1000000) return `$${(price / 1000000).toFixed(2)}m`;
  if (price >= 1000) return `$${Math.round(price / 1000)}k`;
  return `$${price}`;
}

export function MarketSearchBar({ players, isPremium, onSelect, selectedPlayerId }: MarketSearchBarProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showLockedMsg, setShowLockedMsg] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setShowLockedMsg(false);
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const results = useCallback((): DerivedPlayer[] => {
    if (!debouncedQuery || debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    return players
      .filter(p =>
        p.player_name?.toLowerCase().includes(q) ||
        p.team?.toLowerCase().includes(q) ||
        p.position?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [debouncedQuery, players])();

  function handleFocus() {
    setFocused(true);
    if (!isPremium) {
      setShowLockedMsg(true);
      track("search_locked_click");
    } else if (debouncedQuery.length >= 2) {
      setShowDropdown(true);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!isPremium) return;
    setQuery(e.target.value);
    setShowDropdown(e.target.value.length >= 2);
    if (e.target.value === "") onSelect(null);
  }

  function handleSelect(player: DerivedPlayer) {
    setQuery(player.player_name);
    setShowDropdown(false);
    setFocused(false);
    onSelect(player);
    track("search_used", { player_name: player.player_name });
  }

  function handleClear() {
    setQuery("");
    setDebouncedQuery("");
    setShowDropdown(false);
    onSelect(null);
    inputRef.current?.focus();
  }

  const categoryColor = (cat: string) => {
    if (cat === "BUY") return "text-green-400";
    if (cat === "SELL") return "text-red-400";
    return "text-[#F5C84C]";
  };

  const categoryLabel = (cat: string) => {
    if (cat === "BUY") return "Target";
    if (cat === "SELL") return "Avoid";
    return "Watch";
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div
        className={`relative flex items-center rounded-xl border transition-all duration-200 ${
          focused
            ? isPremium
              ? "border-white/30 bg-white/[0.06] shadow-[0_0_0_3px_rgba(255,255,255,0.05)]"
              : "border-white/20 bg-white/[0.04] shadow-[0_0_0_3px_rgba(255,255,255,0.03)]"
            : "border-white/[0.08] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.03]"
        }`}
      >
        <Search className="absolute left-3 w-4 h-4 text-white/40 pointer-events-none shrink-0" />

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder={isPremium ? "Search players, teams, positions..." : "Search players (Neeko+)"}
          readOnly={!isPremium}
          className={`w-full bg-transparent pl-9 pr-${query ? "16" : "10"} py-2.5 text-sm text-white placeholder:text-white/30 outline-none cursor-${isPremium ? "text" : "pointer"}`}
        />

        <div className="absolute right-3 flex items-center gap-1.5">
          {query && isPremium && (
            <button
              onClick={handleClear}
              className="p-0.5 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-white/40" />
            </button>
          )}
          {!isPremium && (
            <Lock className="w-3.5 h-3.5 text-white/30" />
          )}
        </div>
      </div>

      {/* Locked message for free users */}
      {showLockedMsg && !isPremium && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50">
          <div className="bg-[#161616] border border-white/[0.08] rounded-xl p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="w-4 h-4 text-white/50" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white mb-1">Search is a Neeko+ feature</p>
                <p className="text-xs text-white/50 leading-relaxed mb-3">
                  Search and filter any player in the market. Find specific targets instantly.
                </p>
                <a
                  href="/billing"
                  onClick={() => track("search_locked_upgrade_click")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-white text-black hover:bg-white/90 transition-colors"
                >
                  Unlock Neeko+
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search results dropdown */}
      {showDropdown && isPremium && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50">
          <div className="bg-[#161616] border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl">
            {results.map((player, i) => (
              <button
                key={player.player_id}
                onClick={() => handleSelect(player)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.05] transition-colors ${
                  i < results.length - 1 ? "border-b border-white/[0.04]" : ""
                } ${selectedPlayerId === player.player_id ? "bg-white/[0.06]" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{player.player_name}</p>
                  <p className="text-xs text-white/40 truncate">{player.team} · {player.position}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xs font-bold ${categoryColor(player._category)}`}>
                    {categoryLabel(player._category)}
                  </p>
                  <p className="text-xs text-white/40">{formatPrice(player.price ?? 0)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {showDropdown && isPremium && debouncedQuery.length >= 2 && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50">
          <div className="bg-[#161616] border border-white/[0.08] rounded-xl px-4 py-3 shadow-2xl">
            <p className="text-sm text-white/40">No players found for "{debouncedQuery}"</p>
          </div>
        </div>
      )}
    </div>
  );
}
