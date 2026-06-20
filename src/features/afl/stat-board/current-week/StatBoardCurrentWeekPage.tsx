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

// ─── Secondary nav ────────────────────────────────────────────────────────────

function SecondaryNav() {
  return (
    <nav
      className="flex gap-1 overflow-x-auto no-scrollbar"
      style={{ paddingInline: "var(--page-px)", paddingTop: 10, paddingBottom: 4 }}
      aria-label="Stat Board sections"
    >
      <span
        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold border bg-white/[0.08] border-white/20 text-white cursor-default"
        aria-current="page"
      >
        Matchup Compare
      </span>
      <Link
        to="/stat-board/players"
        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium border bg-white/[0.02] border-white/[0.08] text-white/50 hover:bg-white/[0.05] hover:text-white/75 hover:border-white/15 transition-colors"
      >
        Player Board
      </Link>
    </nav>
  );
}

// ─── Locked match overlay ─────────────────────────────────────────────────────

function LockedMatchBanner({ match }: { match: StatBoardMatch }) {
  return (
    <div
      className="mx-auto text-center py-12 px-6 flex flex-col items-center gap-4"
      style={{ maxWidth: 400 }}
      role="status"
      aria-label="This game requires Neeko+ access"
    >
      <div className="w-12 h-12 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
        <Lock size={18} className="text-amber-400/70" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-white/80">
        {match.home_team_name} vs {match.away_team_name}
      </p>
      <p className="text-[12px] text-white/40 leading-relaxed max-w-[280px]">
        This game requires a Neeko+ subscription to view full player data.
      </p>
      <Link
        to="/neeko-plus"
        onClick={() => track("current_week_upgrade_click", { source: "locked_banner" })}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[12px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 hover:bg-amber-400/15 hover:border-amber-400/30 transition-colors"
      >
        Unlock with Neeko+ <ArrowRight size={12} aria-hidden="true" />
      </Link>
    </div>
  );
}

// ─── Team section header ──────────────────────────────────────────────────────

function TeamHeader({
  teamName,
  playerCount,
  sort,
  onSortChange,
}: {
  teamName: string;
  playerCount: number;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
}) {
  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "hit_rate",   label: "Hit rate" },
    { key: "l5_avg",     label: "L5 avg" },
    { key: "projection", label: "Projection" },
    { key: "name",       label: "A–Z" },
  ];

  return (
    <div
      className="flex items-center justify-between gap-3 py-2"
      style={{ paddingInline: "var(--page-px)" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="h-1.5 w-1.5 rounded-full bg-white/25 flex-shrink-0" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-white/70 truncate">{teamName}</span>
        <span className="text-[10px] text-white/25 flex-shrink-0">{playerCount} players</span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[9px] font-medium text-white/30 hidden sm:inline">Sort:</span>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/60 rounded-md px-2 py-1 focus:outline-none focus:border-white/20 focus:text-white/80 transition-colors appearance-none cursor-pointer"
          aria-label={`Sort ${teamName} players`}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key} style={{ background: "#0d1117" }}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
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
  sort,
  onSortChange,
}: {
  teamName: string;
  players: import("./currentWeekTypes").ComparePlayer[];
  thresholds: readonly number[];
  selectedLine: number;
  onSelectLine: (line: number) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (scrollLeft: number) => void;
  onPlayerClick?: (playerName: string) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
}) {
  return (
    <section aria-label={`${teamName} player comparison`} className="min-w-0">
      <TeamHeader
        teamName={teamName}
        playerCount={players.length}
        sort={sort}
        onSortChange={onSortChange}
      />
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
      style={{ paddingInline: "var(--page-px)" }}
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
      style={{ paddingInline: "var(--page-px)" }}
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

  // Per-team independent sort state (desktop only; shared sort from URL is the initial value)
  const homeSort = sort;
  const awaySort = sort;

  const thresholds = getThresholdsForMode(stat, mode);
  const selectedLine = resolveSelectedLine(line, stat, mode);

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

  const documentTitle =
    typeof week === "number"
      ? `AFL Matchup Compare — Round ${week} | Neeko's Sports Stats`
      : "AFL Matchup Compare — Current Round | Neeko's Sports Stats";

  return (
    <>
      <Helmet>
        <title>{documentTitle}</title>
        <meta name="description" content="Compare AFL players head-to-head by stat and threshold for the current round. Filter by team, position and line." />
        <link rel="canonical" href="https://neekostats.com.au/stat-board/current-week" />
        <meta property="og:title" content="AFL Matchup Compare | Stat Board" />
        <meta property="og:description" content="Compare AFL players head-to-head by stat and threshold for the current round." />
      </Helmet>

      {/*
        CSS custom property for consistent horizontal padding.
        --page-px is the gutter on both sides; --page-max-w caps the content area.
      */}
      <style>{`
        :root {
          --page-px: clamp(16px, 3vw, 40px);
          --page-max-w: 1560px;
        }
      `}</style>

      <main
        data-testid="matchup-compare-page"
        style={{
          minHeight: "100dvh",
          background: "#05070A",
          color: "#fff",
          maxWidth: "var(--page-max-w)",
          marginInline: "auto",
          width: "100%",
        }}
      >

        {/* ── Page header ── two-column at desktop ─────────────────────── */}
        <div
          className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"
          style={{
            paddingInline: "var(--page-px)",
            paddingTop: "clamp(20px,3vw,36px)",
            paddingBottom: 6,
          }}
        >
          {/* Left: title block */}
          <div>
            <p
              style={{
                fontSize: 9.5,
                fontWeight: 900,
                letterSpacing: "0.44em",
                textTransform: "uppercase",
                color: "rgba(34,197,94,0.65)",
                margin: "0 0 6px",
              }}
            >
              AFL Stat Board
            </p>
            <h1
              data-testid="page-heading"
              style={{
                fontSize: "clamp(1.25rem,2.5vw,1.75rem)",
                fontWeight: 900,
                letterSpacing: "-0.03em",
                color: "#F5F5F5",
                lineHeight: 1.2,
                margin: "0 0 3px",
              }}
            >
              Matchup Compare{week ? ` — Round ${week}` : ""}
            </h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", margin: 0 }}>
              Pick a game · choose a stat · compare players
            </p>
          </div>

          {/* Right: segmented nav (hidden on mobile — SecondaryNav below handles it) */}
          <nav
            className="hidden md:flex gap-1 flex-shrink-0"
            aria-label="Stat Board sections"
          >
            <span
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border bg-white/[0.08] border-white/20 text-white cursor-default"
              aria-current="page"
            >
              Matchup Compare
            </span>
            <Link
              to="/stat-board/players"
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium border bg-white/[0.02] border-white/[0.08] text-white/50 hover:bg-white/[0.05] hover:text-white/75 hover:border-white/15 transition-colors"
            >
              Player Board
            </Link>
          </nav>
        </div>

        {/* Mobile-only secondary nav */}
        <div className="md:hidden">
          <SecondaryNav />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "8px 0 0" }} />

        {/* ── Game selector ────────────────────────────────────────────── */}
        <div style={{ paddingTop: 12 }}>
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

        {/* ── Controls ─────────────────────────────────────────────────── */}
        <div style={{ paddingTop: 12, paddingBottom: 6 }}>
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

        {/* ── Content area ─────────────────────────────────────────────── */}
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
          <div
            data-testid="loading-state"
            className="flex flex-col xl:grid xl:grid-cols-2 gap-6"
            style={{ paddingBottom: "clamp(24px,4vw,48px)" }}
          >
            <div>
              <div style={{ paddingInline: "var(--page-px)", paddingBottom: 6 }}>
                <div className="text-[10px] text-white/25 animate-pulse">Loading…</div>
              </div>
              <TableSkeleton />
            </div>
            <div>
              <div style={{ height: 26 }} />
              <TableSkeleton />
            </div>
          </div>
        ) : selectedMatch ? (
          /*
           * ≥1280px: side-by-side grid (2 cols).
           * <1280px: stacked single column.
           */
          <div
            data-testid="teams-container"
            data-mode={mode}
            className="flex flex-col xl:grid xl:grid-cols-2 gap-0 xl:gap-6"
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
              sort={homeSort}
              onSortChange={(s) => {
                pushState({ sort: s as SortKey });
                track("current_week_sort_selected", { sort: s });
              }}
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
              sort={awaySort}
              onSortChange={(s) => {
                pushState({ sort: s as SortKey });
                track("current_week_sort_selected", { sort: s });
              }}
            />
          </div>
        ) : null}
      </main>
    </>
  );
}
