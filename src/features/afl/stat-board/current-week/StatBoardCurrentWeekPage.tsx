import { useRef, useCallback, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, ArrowRight } from "lucide-react";
import { track } from "@/lib/analytics";
import { playerToSlug } from "@/lib/slugs";

import { parseUrlState, buildUrlParams, getThresholdsForMode, resolveSelectedLine } from "./currentWeekUtils";
import { useCurrentWeekCompare } from "./useCurrentWeekCompare";
import { CurrentWeekGameSelector } from "./CurrentWeekGameSelector";
import { CurrentWeekControls } from "./CurrentWeekControls";
import { MatchupComparisonTable } from "./MatchupComparisonTable";
import type { StatBoardMatch } from "../types";
import type { StatLens, PositionFilter } from "../types";
import type { CompareMode, SortKey } from "./currentWeekTypes";

// ─── Scroll-sync helpers ──────────────────────────────────────────────────────

type SyncableRef = React.RefObject<HTMLDivElement | null> & { sync?: (left: number) => void };

function useSyncedScroll(): [SyncableRef, SyncableRef] {
  const homeRef = useRef<HTMLDivElement | null>(null) as SyncableRef;
  const awayRef = useRef<HTMLDivElement | null>(null) as SyncableRef;

  const handleHomeScroll = useCallback((scrollLeft: number) => {
    awayRef.sync?.(scrollLeft);
  }, []);

  const handleAwayScroll = useCallback((scrollLeft: number) => {
    homeRef.sync?.(scrollLeft);
  }, []);

  // Attach the handlers to the refs so tables can call them
  homeRef._onScroll = handleHomeScroll;
  awayRef._onScroll = handleAwayScroll;

  return [homeRef, awayRef];
}

// ─── Secondary nav ────────────────────────────────────────────────────────────

function SecondaryNav() {
  return (
    <div
      className="flex gap-1 overflow-x-auto no-scrollbar"
      style={{ paddingInline: "clamp(12px,3vw,20px)", paddingTop: 10, paddingBottom: 4 }}
      role="navigation"
      aria-label="Stat Board sections"
    >
      <span
        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold border bg-white/[0.08] border-white/20 text-white cursor-default"
        aria-current="page"
      >
        Current Week
      </span>
      <Link
        to="/stat-board/players"
        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium border bg-white/[0.02] border-white/[0.08] text-white/50 hover:bg-white/[0.05] hover:text-white/75 hover:border-white/15 transition-colors"
      >
        Player Board
      </Link>
    </div>
  );
}

// ─── Locked match overlay ─────────────────────────────────────────────────────

function LockedMatchBanner({ match }: { match: StatBoardMatch }) {
  return (
    <div
      className="mx-auto text-center py-10 px-6 flex flex-col items-center gap-3"
      style={{ maxWidth: 360 }}
      role="status"
      aria-label="This game requires Neeko+ access"
    >
      <div className="w-10 h-10 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
        <Lock size={16} className="text-amber-400/70" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-white/80">
        {match.home_team_name} vs {match.away_team_name}
      </p>
      <p className="text-[12px] text-white/40 leading-relaxed">
        This game requires a Neeko+ subscription to view full player data.
      </p>
      <Link
        to="/neeko-plus"
        onClick={() => track("current_week_upgrade_click", { source: "locked_banner" })}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 hover:bg-amber-400/15 hover:border-amber-400/30 transition-colors"
      >
        Unlock with Neeko+ <ArrowRight size={11} aria-hidden="true" />
      </Link>
    </div>
  );
}

// ─── Team section ─────────────────────────────────────────────────────────────

function TeamSection({
  teamName,
  players,
  thresholds,
  selectedLine,
  onSelectLine,
  scrollRef,
  onScroll,
  onPlayerClick,
}: {
  teamName: string;
  players: import("./currentWeekTypes").ComparePlayer[];
  thresholds: readonly number[];
  selectedLine: number;
  onSelectLine: (line: number) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (scrollLeft: number) => void;
  onPlayerClick?: (playerName: string) => void;
}) {
  return (
    <section aria-label={`${teamName} player comparison`}>
      <div
        className="flex items-center gap-2 py-2"
        style={{ paddingInline: "clamp(12px,3vw,20px)" }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-white/25 flex-shrink-0" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-white/60 truncate">{teamName}</span>
        <span className="text-[10px] text-white/25">{players.length} players</span>
      </div>
      <MatchupComparisonTable
        players={players}
        thresholds={thresholds}
        selectedLine={selectedLine}
        onSelectLine={onSelectLine}
        externalScrollRef={scrollRef}
        onScroll={onScroll}
        onPlayerClick={onPlayerClick}
        teamLabel={teamName}
      />
    </section>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div
      className="flex flex-col gap-px"
      style={{ paddingInline: "clamp(12px,3vw,20px)" }}
      aria-busy="true"
      aria-label="Loading player data"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse bg-white/[0.04] rounded"
          style={{ height: 32 }}
        />
      ))}
    </div>
  );
}

// ─── Line picker (Fine Lines mode) ────────────────────────────────────────────

function LinePicker({
  thresholds,
  selectedLine,
  onSelect,
}: {
  thresholds: readonly number[];
  selectedLine: number;
  onSelect: (line: number) => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
      style={{ paddingInline: "clamp(12px,3vw,20px)" }}
      role="group"
      aria-label="Select comparison line"
    >
      <span className="text-[10px] font-semibold text-white/40 flex-shrink-0">Line:</span>
      {thresholds.map((t) => (
        <button
          key={t}
          onClick={() => onSelect(t)}
          aria-pressed={t === selectedLine}
          aria-label={`Select ${t}+ line`}
          className={[
            "flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold border transition-all duration-100",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
            t === selectedLine
              ? "bg-white/[0.10] border-white/25 text-white"
              : "bg-transparent border-white/[0.08] text-white/35 hover:border-white/20 hover:text-white/60",
          ].join(" ")}
        >
          {t}+
        </button>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StatBoardCurrentWeekPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlState = parseUrlState(searchParams);
  const { matchId: urlMatchId, stat, mode, line, position, sort, search } = urlState;

  const thresholds = getThresholdsForMode(stat, mode);
  const selectedLine = resolveSelectedLine(line, stat, mode);

  // Track page open
  useEffect(() => {
    track("current_week_opened", { stat, mode });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushState = useCallback((patch: Partial<typeof urlState>) => {
    const next = buildUrlParams({ ...urlState, ...patch });
    navigate({ search: next.toString() }, { replace: true });
  }, [urlState, navigate]);

  const {
    matches,
    matchesLoading,
    selectedMatch,
    setSelectedMatch,
    hasFullAccess,
    accessLoading,
    isLocked,
    homePlayers,
    awayPlayers,
    playersLoading,
    error,
  } = useCurrentWeekCompare({
    urlMatchId,
    lens: stat,
    line: selectedLine,
    positionFilter: position,
    search,
    sort,
  });

  // Two separate scroll refs — tables sync each other via callbacks
  const homeScrollRef = useRef<HTMLDivElement | null>(null);
  const awayScrollRef = useRef<HTMLDivElement | null>(null);
  const suppressHomeSync = useRef(false);
  const suppressAwaySync = useRef(false);

  const handleHomeScroll = useCallback((scrollLeft: number) => {
    const away = awayScrollRef.current;
    if (!away || suppressHomeSync.current) return;
    suppressAwaySync.current = true;
    away.scrollLeft = scrollLeft;
    requestAnimationFrame(() => { suppressAwaySync.current = false; });
  }, []);

  const handleAwayScroll = useCallback((scrollLeft: number) => {
    const home = homeScrollRef.current;
    if (!home || suppressAwaySync.current) return;
    suppressHomeSync.current = true;
    home.scrollLeft = scrollLeft;
    requestAnimationFrame(() => { suppressHomeSync.current = false; });
  }, []);

  const handlePlayerClick = useCallback((playerName: string) => {
    const slug = playerToSlug(playerName);
    const params = new URLSearchParams();
    if (selectedMatch) params.set("match_id", String(selectedMatch.match_id));
    params.set("stat", stat);
    params.set("source", "current-week");
    track("current_week_player_opened", { slug, stat, mode, line: selectedLine });
    navigate(`/sports/afl/players/${slug}?${params.toString()}`);
  }, [selectedMatch, stat, mode, selectedLine, navigate]);

  const week = matches[0]?.week;

  return (
    <>
      <Helmet>
        <title>Current Week Comparison | AFL Stat Board | Neeko</title>
        <meta name="description" content="Compare AFL players head-to-head by stat and threshold for the current round. Filter by team, position and line." />
        <link rel="canonical" href="https://neekostats.com.au/stat-board/current-week" />
        <meta property="og:title" content="Current Week Comparison | AFL Stat Board" />
        <meta property="og:description" content="Compare AFL players head-to-head by stat and threshold for the current round." />
      </Helmet>

      <main style={{ minHeight: "100dvh", background: "#05070A", color: "#fff" }}>

        {/* Page header */}
        <div style={{ paddingInline: "clamp(12px,3vw,20px)", paddingTop: "clamp(20px,3vw,32px)", paddingBottom: 6 }}>
          <p style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em", textTransform: "uppercase", color: "rgba(34,197,94,0.65)", margin: "0 0 6px" }}>
            Stat Board
          </p>
          <h1 style={{ fontSize: "clamp(1.25rem,2.5vw,1.6rem)", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.2, margin: "0 0 2px" }}>
            Current Week{week ? ` — Round ${week}` : ""}
          </h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", margin: 0 }}>
            Pick a game · choose a stat · compare players
          </p>
        </div>

        {/* Secondary nav */}
        <SecondaryNav />

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "8px 0 0" }} />

        {/* Game selector */}
        <div style={{ paddingTop: 10 }}>
          <CurrentWeekGameSelector
            matches={matches}
            selected={selectedMatch}
            loading={matchesLoading || accessLoading}
            hasFullAccess={hasFullAccess}
            onChange={(m) => {
              setSelectedMatch(m);
              pushState({ matchId: m.match_id });
              track("current_week_game_selected", { match_id: m.match_id });
            }}
            onLockedClick={(m) => {
              track("current_week_locked_match_clicked", { match_id: m.match_id });
            }}
          />
        </div>

        {/* Controls */}
        <div style={{ paddingTop: 10, paddingBottom: 6 }}>
          <CurrentWeekControls
            stat={stat}
            mode={mode}
            position={position}
            sort={sort}
            search={search}
            onStatChange={(s) => {
              pushState({ stat: s as StatLens, line: null });
              track("current_week_stat_selected", { stat: s });
            }}
            onModeChange={(m) => {
              pushState({ mode: m as CompareMode, line: null });
              track("current_week_mode_selected", { mode: m });
            }}
            onPositionChange={(p) => { pushState({ position: p as PositionFilter }); }}
            onSortChange={(s) => {
              pushState({ sort: s as SortKey });
              track("current_week_sort_selected", { sort: s });
            }}
            onSearchChange={(s) => pushState({ search: s })}
          />
        </div>

        {/* Fine Lines picker */}
        {mode === "fine" && (
          <div style={{ paddingBottom: 8 }}>
            <LinePicker
              thresholds={thresholds}
              selectedLine={selectedLine}
              onSelect={(l) => {
                pushState({ line: l });
                track("current_week_line_selected", { line: l, stat, mode });
              }}
            />
          </div>
        )}

        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginBottom: 8 }} />

        {/* Content */}
        {isLocked && selectedMatch ? (
          <LockedMatchBanner match={selectedMatch} />
        ) : !selectedMatch && !matchesLoading ? (
          <div
            className="text-center py-12 text-[12px] text-white/30"
            role="status"
          >
            No games available this week.
          </div>
        ) : error ? (
          <div
            className="text-center py-12 text-[12px] text-red-400/60"
            role="alert"
          >
            Failed to load player data.
          </div>
        ) : playersLoading ? (
          <>
            <div style={{ paddingInline: "clamp(12px,3vw,20px)", paddingBottom: 6 }}>
              <div className="text-[10px] text-white/25 animate-pulse">Loading…</div>
            </div>
            <TableSkeleton />
            <div style={{ height: 16 }} />
            <TableSkeleton />
          </>
        ) : selectedMatch ? (
          <div
            className="flex flex-col gap-4"
            style={{ paddingBottom: "clamp(24px,4vw,48px)" }}
          >
            <TeamSection
              teamName={selectedMatch.home_team_name}
              players={homePlayers}
              thresholds={thresholds}
              selectedLine={selectedLine}
              onSelectLine={(l) => {
                pushState({ line: l });
                track("current_week_line_selected", { line: l, stat, mode });
              }}
              scrollRef={homeScrollRef}
              onScroll={handleHomeScroll}
              onPlayerClick={handlePlayerClick}
            />
            <TeamSection
              teamName={selectedMatch.away_team_name}
              players={awayPlayers}
              thresholds={thresholds}
              selectedLine={selectedLine}
              onSelectLine={(l) => {
                pushState({ line: l });
                track("current_week_line_selected", { line: l, stat, mode });
              }}
              scrollRef={awayScrollRef}
              onScroll={handleAwayScroll}
              onPlayerClick={handlePlayerClick}
            />
          </div>
        ) : null}
      </main>
    </>
  );
}
