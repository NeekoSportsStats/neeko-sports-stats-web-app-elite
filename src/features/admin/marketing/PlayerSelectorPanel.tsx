import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { Search, X, ChevronDown, User } from "lucide-react";
import type { ContentPlayer } from "./GraphicTemplates";

interface AflPlayer {
  player_id: number | null;
  player_name: string;
  team: string;
  position: string | null;
  projection_final: number | null;
  ceiling_estimate: number | null;
  floor_estimate: number | null;
  captain_score: number | null;
  matchup_rating: number | null;
  upside_rating: number | null;
  consistency_score: number | null;
  risk_rating: number | null;
}

interface PlayerSearchDropdownProps {
  label: string;
  selected: ContentPlayer | null;
  onSelect: (player: ContentPlayer | null) => void;
  players: AflPlayer[];
  accentColor: string;
  placeholder?: string;
}

function PlayerSearchDropdown({
  label,
  selected,
  onSelect,
  players,
  accentColor,
  placeholder = "Search player…",
}: PlayerSearchDropdownProps) {
  const [open, setOpen]                   = useState(false);
  const [query, setQuery]                 = useState("");
  const [teamFilter, setTeamFilter]       = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const inputRef    = useRef<HTMLInputElement>(null);
  const triggerRef  = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const teams     = Array.from(new Set(players.map((p) => p.team).filter(Boolean))).sort();
  const positions = Array.from(new Set(players.map((p) => p.position).filter(Boolean))).sort() as string[];

  const filtered = players.filter((p) => {
    const matchesQuery    = query.trim() === "" || p.player_name.toLowerCase().includes(query.toLowerCase());
    const matchesTeam     = teamFilter === "" || p.team === teamFilter;
    const matchesPosition = positionFilter === "" || p.position === positionFilter;
    return matchesQuery && matchesTeam && matchesPosition;
  }).slice(0, 30);

  const reposition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropHeight = Math.min(320, spaceBelow > 200 ? spaceBelow - 12 : spaceAbove - 12);

    setDropdownStyle({
      position: "fixed",
      top:      spaceBelow > 200 ? rect.bottom + 4 : undefined,
      bottom:   spaceBelow <= 200 ? window.innerHeight - rect.top + 4 : undefined,
      left:     rect.left,
      width:    rect.width,
      maxHeight: dropHeight,
      zIndex:   9999,
    });
  }, []);

  useEffect(() => {
    if (open) {
      reposition();
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setTeamFilter("");
      setPositionFilter("");
    }
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => reposition();
    const onResize = () => reposition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const dropdownPanel = open ? createPortal(
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className="rounded-lg border border-border bg-popover shadow-2xl overflow-hidden flex flex-col"
    >
      <div className="p-2 space-y-1.5 border-b border-border/50 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-8 pr-3 py-2 rounded-md border border-border bg-background text-xs focus:outline-none focus:border-current"
            style={{ outlineColor: accentColor }}
          />
        </div>
        <div className="flex gap-1.5">
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded-md border border-border bg-background text-xs focus:outline-none"
          >
            <option value="">All Teams</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded-md border border-border bg-background text-xs focus:outline-none"
          >
            <option value="">All Positions</option>
            {positions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "thin" }}>
        {filtered.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground/50">No players found</div>
        ) : (
          filtered.map((p) => (
            <button
              key={p.player_id ?? p.player_name}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(p as ContentPlayer);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/40 transition-colors text-left"
              style={selected?.player_name === p.player_name ? { color: accentColor } : {}}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <User className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                <span className="font-medium truncate">{p.player_name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2 text-muted-foreground/60">
                <span>{p.team}</span>
                {p.position && <span className="font-mono">{p.position}</span>}
              </div>
            </button>
          ))
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="relative">
        <button
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-background text-xs font-medium transition-colors hover:bg-muted/40 text-left"
        >
          {selected ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="font-semibold truncate" style={{ color: accentColor }}>{selected.player_name}</span>
              <span className="text-muted-foreground shrink-0">{selected.team}</span>
              {selected.position && <span className="text-muted-foreground/60 shrink-0">{selected.position}</span>}
            </div>
          ) : (
            <span className="text-muted-foreground/50">{placeholder}</span>
          )}
          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            {selected && (
              <span
                className="p-0.5 rounded hover:bg-muted/60 transition-colors"
                onMouseDown={(e) => { e.stopPropagation(); onSelect(null); }}
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </div>
        </button>

        {dropdownPanel}
      </div>
    </div>
  );
}

// ─── Main exported component ─────────────────────────────────────────────────

interface PlayerSelectorPanelProps {
  playerMode: "auto" | "manual";
  onPlayerModeChange: (mode: "auto" | "manual") => void;
  manualPlayer1: ContentPlayer | null;
  manualPlayer2: ContentPlayer | null;
  onPlayer1Change: (p: ContentPlayer | null) => void;
  onPlayer2Change: (p: ContentPlayer | null) => void;
  accentColor: string;
}

export function PlayerSelectorPanel({
  playerMode,
  onPlayerModeChange,
  manualPlayer1,
  manualPlayer2,
  onPlayer1Change,
  onPlayer2Change,
  accentColor,
}: PlayerSelectorPanelProps) {
  const [allPlayers, setAllPlayers] = useState<AflPlayer[]>([]);
  const [loading, setLoading]       = useState(false);
  const fetchedRef                  = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    supabase
      .from("v_rankings_content_engine")
      .select("player_id, player_name, team, position, projection_final, ceiling_estimate, floor_estimate, captain_score, matchup_rating, upside_rating, consistency_score, risk_rating")
      .order("player_name", { ascending: true })
      .then(({ data }) => {
        setAllPlayers((data ?? []) as AflPlayer[]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-muted-foreground">Player Mode</p>
        <div className="flex gap-1 p-1 rounded-lg bg-muted/20 border border-border">
          {(["auto", "manual"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onPlayerModeChange(mode)}
              className="flex-1 py-1.5 rounded-md text-xs font-semibold transition-all capitalize"
              style={
                playerMode === mode
                  ? { background: accentColor, color: "#000" }
                  : { color: "hsl(var(--muted-foreground))" }
              }
            >
              {mode}
            </button>
          ))}
        </div>
        {playerMode === "auto" && (
          <p className="text-[10px] text-muted-foreground/50">
            Players are ranked automatically by the selected stat angle.
          </p>
        )}
      </div>

      {playerMode === "manual" && (
        <div className="space-y-3">
          {loading ? (
            <p className="text-[11px] text-muted-foreground/50 py-2 text-center">Loading players…</p>
          ) : (
            <>
              <PlayerSearchDropdown
                label="Player 1"
                selected={manualPlayer1}
                onSelect={onPlayer1Change}
                players={allPlayers}
                accentColor={accentColor}
                placeholder="Search player 1…"
              />
              <PlayerSearchDropdown
                label="Player 2"
                selected={manualPlayer2}
                onSelect={onPlayer2Change}
                players={allPlayers}
                accentColor={accentColor}
                placeholder="Search player 2 (optional)…"
              />
              {(manualPlayer1 || manualPlayer2) && (
                <div className="rounded-lg border border-border/40 bg-muted/10 p-2.5 space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wide">Selected</p>
                  {manualPlayer1 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium" style={{ color: accentColor }}>{manualPlayer1.player_name}</span>
                      <span className="text-muted-foreground/60">{manualPlayer1.team} · {manualPlayer1.position ?? "—"}</span>
                    </div>
                  )}
                  {manualPlayer2 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium" style={{ color: accentColor }}>{manualPlayer2.player_name}</span>
                      <span className="text-muted-foreground/60">{manualPlayer2.team} · {manualPlayer2.position ?? "—"}</span>
                    </div>
                  )}
                </div>
              )}
              {!manualPlayer1 && !manualPlayer2 && (
                <p className="text-[10px] text-muted-foreground/50">
                  Select players to override automatic rankings in the graphic.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
