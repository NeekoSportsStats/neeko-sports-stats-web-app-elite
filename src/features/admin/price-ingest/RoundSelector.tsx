import { useState } from "react";
import { Lock, Clock as Unlock, ChevronDown, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PriceRound } from "./types";

const CURRENT_SEASON = 2026;
const MAX_ROUNDS = 24;

function buildRoundOptions(): { label: string; value: number }[] {
  const opts = [{ label: "Opening Round", value: 0 }];
  for (let i = 1; i <= MAX_ROUNDS; i++) {
    opts.push({ label: `Round ${i}`, value: i });
  }
  return opts;
}

const ROUND_OPTIONS = buildRoundOptions();

interface RoundSelectorProps {
  selectedRound: number;
  season: number;
  rounds: PriceRound[];
  loading: boolean;
  onRoundChange: (round: number) => void;
  onToggleLock: (round: number, locked: boolean) => Promise<void>;
  onRefresh: () => void;
}

export function RoundSelector({
  selectedRound,
  season,
  rounds,
  loading,
  onRoundChange,
  onToggleLock,
  onRefresh,
}: RoundSelectorProps) {
  const [lockConfirm, setLockConfirm] = useState<number | null>(null);
  const [toggling, setToggling] = useState(false);

  const roundMeta = rounds.find(r => r.round === selectedRound && r.season === season);
  const isLocked = roundMeta?.is_locked ?? false;
  const playerCount = roundMeta?.player_count ?? 0;
  const hasData = playerCount > 0;

  async function handleToggleLock() {
    if (!isLocked) {
      // Locking — do it directly
      setToggling(true);
      await onToggleLock(selectedRound, true);
      setToggling(false);
    } else {
      // Unlocking — require confirmation
      if (lockConfirm !== selectedRound) {
        setLockConfirm(selectedRound);
        return;
      }
      setToggling(true);
      await onToggleLock(selectedRound, false);
      setToggling(false);
      setLockConfirm(null);
    }
  }

  function cancelConfirm() {
    setLockConfirm(null);
  }

  const selectedOption = ROUND_OPTIONS.find(o => o.value === selectedRound);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Price Round
          </span>
          {isLocked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
              <Lock className="h-2.5 w-2.5" />LOCKED
            </span>
          )}
          {!isLocked && hasData && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              {playerCount} players
            </span>
          )}
          {!isLocked && !hasData && selectedRound >= 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/25">
              <Plus className="h-2.5 w-2.5" />New round
            </span>
          )}
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh round list"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative min-w-[180px]">
          <select
            value={selectedRound}
            onChange={e => onRoundChange(Number(e.target.value))}
            className="w-full appearance-none border border-border rounded-md pl-3 pr-8 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            {ROUND_OPTIONS.map(opt => {
              const meta = rounds.find(r => r.round === opt.value && r.season === season);
              const suffix = meta ? ` (${meta.player_count}${meta.is_locked ? " 🔒" : ""})` : "";
              return (
                <option key={opt.value} value={opt.value}>
                  {opt.label}{suffix}
                </option>
              );
            })}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>

        {lockConfirm === selectedRound ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-400">Confirm unlock?</span>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs"
              onClick={handleToggleLock}
              disabled={toggling}
            >
              {toggling ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3 mr-1" />}
              Unlock
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={cancelConfirm}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className={`h-8 text-xs ${isLocked ? "border-red-500/40 text-red-400 hover:bg-red-950/20" : "border-border text-muted-foreground hover:text-foreground"}`}
            onClick={handleToggleLock}
            disabled={toggling}
          >
            {toggling ? (
              <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
            ) : isLocked ? (
              <Lock className="h-3 w-3 mr-1.5" />
            ) : (
              <Unlock className="h-3 w-3 mr-1.5" />
            )}
            {isLocked ? "Locked" : "Lock Round"}
          </Button>
        )}
      </div>

      {hasData && !isLocked && (
        <p className="text-[11px] text-amber-400/80">
          Committing will overwrite all {playerCount} existing prices for {selectedOption?.label ?? `Round ${selectedRound}`}.
        </p>
      )}

      {isLocked && (
        <p className="text-[11px] text-red-400/80">
          This round is locked. Unlock it to commit new prices.
        </p>
      )}
    </div>
  );
}
