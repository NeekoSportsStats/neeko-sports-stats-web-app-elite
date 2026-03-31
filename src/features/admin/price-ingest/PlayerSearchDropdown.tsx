import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Search, X, CirclePlus as PlusCircle } from "lucide-react";
import type { PlayerOption } from "./types";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

interface Props {
  players: PlayerOption[];
  value: number | null;
  manualInputName?: string | null;
  onChange: (id: number | null, name: string | null, isManualInput?: boolean) => void;
  placeholder?: string;
}

export function PlayerSearchDropdown({
  players,
  value,
  manualInputName,
  onChange,
  placeholder = "Search player…",
}: Props) {
  const selected = useMemo(
    () => players.find(p => p.player_id === value) ?? null,
    [players, value]
  );

  const displayName = selected?.player_name ?? manualInputName ?? "";
  const [query, setQuery] = useState(displayName);
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 80);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery(selected?.player_name ?? manualInputName ?? "");
    }
  }, [open, selected, manualInputName]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return players.slice(0, 30);
    return players.filter(p => p.player_name.toLowerCase().includes(q)).slice(0, 50);
  }, [players, debouncedQuery]);

  const showUseOption = useMemo(() => {
    const q = debouncedQuery.trim();
    if (!q || q.length < 2) return false;
    const exactMatch = players.some(p => p.player_name.toLowerCase() === q.toLowerCase());
    return !exactMatch;
  }, [debouncedQuery, players]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      onChange(null, null);
      setOpen(true);
    },
    [onChange]
  );

  function handleFocus() {
    setOpen(true);
    if (selected || manualInputName) setQuery("");
  }

  const handleSelect = useCallback(
    (p: PlayerOption) => {
      onChange(p.player_id, p.player_name, false);
      setQuery(p.player_name);
      setOpen(false);
    },
    [onChange]
  );

  function handleUseCustom(e: React.MouseEvent) {
    e.preventDefault();
    const name = debouncedQuery.trim();
    if (!name) return;
    onChange(null, name, true);
    setQuery(name);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null, null);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  const isManualInput = value === null && !!manualInputName;
  const hasValue = value !== null || isManualInput;

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative" title={isManualInput ? "Player not found in database — will not be inserted until mapped" : undefined}>
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          className={`w-full pl-7 pr-7 py-1.5 border rounded-md text-xs bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors ${
            value !== null
              ? "border-emerald-500/50 bg-emerald-950/10"
              : isManualInput
              ? "border-amber-500/50 bg-amber-950/10 text-amber-300"
              : "border-border"
          }`}
        />
        {(query || hasValue) && (
          <button
            onMouseDown={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {open && (filtered.length > 0 || showUseOption) && (
        <div className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.map(p => (
            <button
              key={p.player_id}
              onMouseDown={() => handleSelect(p)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 flex items-center gap-2 transition-colors"
            >
              <span className="font-medium flex-1 truncate">{p.player_name}</span>
              {p.position_group && (
                <span className="text-[10px] text-muted-foreground shrink-0">{p.position_group}</span>
              )}
            </button>
          ))}

          {showUseOption && (
            <button
              onMouseDown={handleUseCustom}
              className="w-full text-left px-3 py-2 text-xs hover:bg-amber-950/30 flex items-center gap-2 transition-colors border-t border-border/50 text-amber-400"
            >
              <PlusCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate">
                Use: <strong>&ldquo;{debouncedQuery.trim()}&rdquo;</strong>
              </span>
              <span className="text-[10px] text-amber-500/70 shrink-0 italic">pending</span>
            </button>
          )}
        </div>
      )}

      {open && debouncedQuery.trim() && filtered.length === 0 && !showUseOption && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg px-3 py-2.5 text-xs text-muted-foreground">
          No players found for &ldquo;{debouncedQuery.trim()}&rdquo;
        </div>
      )}
    </div>
  );
}
