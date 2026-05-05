import { useState, useRef, useEffect } from "react";
import { ChevronDown, Lock, Calendar } from "lucide-react";
import type { StatBoardMatch } from "../types";

interface Props {
  matches: StatBoardMatch[];
  selected: StatBoardMatch | null;
  loading: boolean;
  onChange: (match: StatBoardMatch) => void;
}

export function MatchSelector({ matches, selected, loading, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (loading) {
    return (
      <div className="mb-3 h-12 rounded-xl bg-white/5 border border-white/10 animate-pulse" />
    );
  }

  if (matches.length === 0) return null;

  return (
    <div ref={ref} className="relative mb-3">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-left transition-colors hover:bg-white/8 hover:border-white/20 focus:outline-none"
      >
        <Calendar className="h-4 w-4 shrink-0 text-white/40" />
        <span className="flex-1 min-w-0">
          {selected ? (
            <span className="text-sm font-medium text-white truncate">{selected.match_label}</span>
          ) : (
            <span className="text-sm text-white/40">Select match</span>
          )}
        </span>
        {selected?.is_locked && (
          <Lock className="h-3.5 w-3.5 shrink-0 text-[#F5C84C]/70" />
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-white/10 bg-[#141414] shadow-2xl overflow-hidden">
          <div className="max-h-72 overflow-y-auto">
            {matches.map((match) => (
              <MatchOption
                key={match.match_id}
                match={match}
                isSelected={selected?.match_id === match.match_id}
                onClick={() => {
                  onChange(match);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchOption({
  match,
  isSelected,
  onClick,
}: {
  match: StatBoardMatch;
  isSelected: boolean;
  onClick: () => void;
}) {
  const date = match.game_date
    ? new Date(match.game_date).toLocaleDateString("en-AU", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
        isSelected
          ? "bg-white/10 text-white"
          : "text-white/70 hover:bg-white/6 hover:text-white"
      }`}
    >
      {/* Order badge */}
      <span
        className={`shrink-0 h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
          match.is_free_match
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-white/8 text-white/30"
        }`}
      >
        {match.match_order}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{match.match_label}</span>
          {match.is_free_match && (
            <span className="shrink-0 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 rounded px-1 py-0.5">
              FREE
            </span>
          )}
        </div>
        {date && <p className="text-xs text-white/35 mt-0.5">{date}</p>}
      </div>

      {match.is_locked && (
        <Lock className="h-3.5 w-3.5 shrink-0 text-[#F5C84C]/60" />
      )}
    </button>
  );
}
