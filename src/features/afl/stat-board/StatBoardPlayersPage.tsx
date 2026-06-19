import { useState, useEffect, useMemo, useRef, useCallback, memo, useSyncExternalStore, useDeferredValue } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Search, X, Lock, ChevronDown, ChevronUp, CircleHelp as HelpCircle, ChevronRight } from "lucide-react";
import { track, trackGateInteraction, trackLockedDataClick, trackFreeGamesCTA, trackStatBoardUpgrade } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import MobileUpgradeBar from "@/components/mobile/MobileUpgradeBar";

import {
  useStatBoardMatches,
  useStatBoardPlayers,
} from "./useStatBoard";
import { useStatBoardAccess, resolveMatchAccessMode, PREVIEW_VISIBLE_ROWS } from "./useStatBoardAccess";
import type {
  StatBoardMatch,
  StatBoardPlayer,
  StatLens,
  PositionFilter,
} from "./types";
import { defaultThreshold, thresholdsForLens, statLabel, statLabelShort } from "./types";
import { MatchSelector } from "./components/MatchSelector";
import { BoardRow, MobilePlayerCard } from "./components/BoardRow";
import { MobileMatchBottomSheet } from "./components/MobileMatchBottomSheet";

// Subscribes to window width; returns true when viewport < 768px (md breakpoint).
function subscribe(cb: () => void) {
  const mq = window.matchMedia("(max-width: 767px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getSnapshot() { return window.matchMedia("(max-width: 767px)").matches; }
function getServerSnapshot() { return false; }
function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export type SortKey = "projection" | "hit_rate" | "recent_avg" | "name" | "consistency";

function sortOptions(lens: StatLens): { key: SortKey; label: string }[] {
  const stat = statLabel(lens);
  return [
    { key: "projection",  label: `${stat} projection — high to low` },
    { key: "hit_rate",    label: `${stat} hit rate — high to low` },
    { key: "recent_avg",  label: `${stat} recent avg — high to low` },
    { key: "name",        label: "Name — A to Z" },
    { key: "consistency", label: "Consistency — best first" },
  ];
}

const CONSISTENCY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const POSITION_OPTIONS: { key: PositionFilter; label: string }[] = [
  { key: "ALL",  label: "All" },
  { key: "MID",  label: "MID" },
  { key: "DEF",  label: "DEF" },
  { key: "FWD",  label: "FWD" },
  { key: "RUCK", label: "RUCK" },
];

function hasNoData(p: StatBoardPlayer): boolean {
  const values = p.last_10_values ?? [];
  return values.length === 0 && (p.projection == null || p.projection === 0) && p.last_10_avg == null;
}

// Sorting uses fields already computed per-lens by the RPC:
// - projection, last_10_avg, hit_rate_last_10 all reflect the active stat lens.
function sortPlayers(players: StatBoardPlayer[], sortKey: SortKey): StatBoardPlayer[] {
  return [...players].sort((a, b) => {
    const aEmpty = hasNoData(a);
    const bEmpty = hasNoData(b);
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;

    switch (sortKey) {
      case "projection":
        return (b.projection ?? 0) - (a.projection ?? 0);
      case "hit_rate":
        return (b.hit_rate_last_10 ?? 0) - (a.hit_rate_last_10 ?? 0);
      case "recent_avg":
        return (Number(b.last_10_avg) || 0) - (Number(a.last_10_avg) || 0);
      case "name":
        return a.player_name.localeCompare(b.player_name);
      case "consistency":
        return (CONSISTENCY_ORDER[a.confidence_label ?? "LOW"] ?? 2) -
               (CONSISTENCY_ORDER[b.confidence_label ?? "LOW"] ?? 2);
      default:
        return 0;
    }
  });
}

function sortButtonLabel(sortKey: SortKey): string {
  switch (sortKey) {
    case "projection":  return "Projection ↓";
    case "hit_rate":    return "Hit rate ↓";
    case "recent_avg":  return "Recent avg ↓";
    case "name":        return "Name A–Z";
    case "consistency": return "Consistency ↓";
  }
}



export default function StatBoardPlayersPage() {
  const [selectedMatch, setSelectedMatch] = useState<StatBoardMatch | null>(null);
  const [lens, setLens] = useState<StatLens>("disposals");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("projection");
  const [sortOpen, setSortOpen] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState<number | null>(null);
  const [stickyVisible, setStickyVisible] = useState(false);
  const [mobileStickyVisible, setMobileStickyVisible] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const [matchSheetOpen, setMatchSheetOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const urlMatchId = searchParams.get("match_id") ? Number(searchParams.get("match_id")) : null;

  const { hasFullAccess } = useStatBoardAccess("players");
  const { user, isPremium } = useAuth();
  const isMobile = useIsMobile();

  const threshold = defaultThreshold(lens);
  const thresholds = thresholdsForLens(lens);

  const { matches, loading: matchesLoading, error: matchesError } = useStatBoardMatches();

  const { players, loading: playersLoading, error: playersError } = useStatBoardPlayers({
    matchId: selectedMatch?.match_id ?? null,
    lens,
    threshold,
    positionFilter,
    search,
  });

  const accessMode = resolveMatchAccessMode(selectedMatch, hasFullAccess);

  // Auto-select default match — prefer URL param match_id if present.
  // We defer the actual pick until after the first player-row probe so we never
  // land on a match with 0 rows when a better match is available.
  useEffect(() => {
    if (matches.length === 0 || selectedMatch !== null) return;
    if (urlMatchId !== null) {
      const fromUrl = matches.find((m) => m.match_id === urlMatchId);
      if (fromUrl) { setSelectedMatch(fromUrl); return; }
    }
    const maxWeek = Math.max(...matches.map((m) => m.week));
    const latestRound = matches.filter((m) => m.week === maxWeek);
    // Premium users: always start on match_order=1 regardless of lock status
    const defaultMatch = hasFullAccess
      ? (latestRound.find((m) => m.match_order === 1) ?? latestRound[0] ?? matches[matches.length - 1])
      : (latestRound.find((m) => m.is_free_match && m.match_order === 1) ??
         latestRound.find((m) => m.is_free_match) ??
         latestRound.find((m) => m.match_order === 1) ??
         latestRound[0] ??
         matches[matches.length - 1]);
    setSelectedMatch(defaultMatch);
  }, [matches, selectedMatch, hasFullAccess, urlMatchId]);

  // Detect whether the current round has no data yet (all games upcoming/not started).
  // When the RPC returns 0 rows and no user filters are active, this flag lets us
  // show a "data is preparing" message instead of a generic empty state.
  const isRoundDataPreparing = useMemo(() => {
    if (!selectedMatch) return false;
    const now = Date.now();
    // Consider the match "upcoming" if its game_date is in the future
    const matchDate = new Date(selectedMatch.game_date).getTime();
    return matchDate > now;
  }, [selectedMatch]);

  // Sticky controls: show when controls div scrolls above viewport.
  // On mobile the fixed header is 62px — disable the sticky bar entirely on mobile
  // to avoid a two-sticky-element conflict and the resulting scroll flicker.
  useEffect(() => {
    if (isMobile) { setStickyVisible(false); return; }
    const el = controlsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { rootMargin: "-1px 0px 0px 0px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile]);

  // Mobile sticky CTA: only show after user has scrolled past the top banner.
  useEffect(() => {
    if (!isMobile) { setMobileStickyVisible(false); return; }
    const el = bannerRef.current;
    if (!el) { setMobileStickyVisible(true); return; }
    const observer = new IntersectionObserver(
      ([entry]) => setMobileStickyVisible(!entry.isIntersecting),
      { rootMargin: "0px 0px 0px 0px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile]);

  function handleLensChange(newLens: StatLens) {
    setLens(newLens);
    setSortKey("projection");
    setExpandedPlayerId(null);
    track("stat_board_filter_used", { filter_type: "lens", value: newLens });
  }

  function handleMatchChange(match: StatBoardMatch) {
    setSelectedMatch(match);
    setExpandedPlayerId(null);
    track("Stat Board Match Change", { match_id: match.match_id, match_label: match.match_label });
  }

  function handleSortChange(k: SortKey) {
    setSortKey(k);
    track("stat_board_sort_changed", { sort_key: k, lens });
  }

  function handlePositionChange(pos: PositionFilter) {
    setPositionFilter(pos);
    track("stat_board_filter_used", { filter_type: "position", value: pos });
  }

  const { homePlayers, awayPlayers } = useMemo(() => {
    if (!selectedMatch) return { homePlayers: [], awayPlayers: [] };
    const home: StatBoardPlayer[] = [];
    const away: StatBoardPlayer[] = [];
    for (const p of players) {
      if (p.team_id === selectedMatch.home_team_id) home.push(p);
      else away.push(p);
    }
    return {
      homePlayers: sortPlayers(home, sortKey),
      awayPlayers: sortPlayers(away, sortKey),
    };
  }, [players, selectedMatch, sortKey]);

  // Stable callback — prevents TeamBoard memo from busting on every render
  const handleToggleExpand = useCallback((id: number | null) => {
    setExpandedPlayerId(id);
    if (id !== null) track("stat_board_player_expand", { player_id: id });
  }, []);

  // Debounced search tracking via useDeferredValue
  const deferredSearch = useDeferredValue(search);
  useEffect(() => {
    if (deferredSearch.trim().length >= 2) {
      track("stat_board_search_used", { query_length: deferredSearch.trim().length });
    }
  }, [deferredSearch]);

  // Premium users see all matches unlocked; is_locked is a DB hint for free users only
  // On mobile, non-free matches are shown as "preview" not hard-locked
  const isLocked = hasFullAccess ? false : (selectedMatch?.is_locked ?? false);
  const navigate = useNavigate();

  // Track gate view when a locked match is selected (desktop only — mobile shows preview)
  useEffect(() => {
    if (isLocked && !isMobile) {
      trackGateInteraction({ source: "stat_board_players", section: "locked_match_banner", action: "viewed" });
    }
  }, [isLocked, isMobile]);

  return (
    <>
      <Helmet>
        <title>AFL Player Stat Board | Hit Rates &amp; Projections</title>
        <meta
          name="description"
          content="Compare every AFL player's recent trends, hit rates and projections by match. Filter by disposals and goals."
        />
        <link rel="canonical" href="https://neekostats.com.au/stat-board/players" />
        <meta property="og:url" content="https://neekostats.com.au/stat-board/players" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="AFL Player Stat Board | Neeko Sports Stats" />
        <meta property="og:description" content="Compare every AFL player's recent trends, hit rates and projections by match. Filter by disposals and goals." />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="Neeko Sports Stats" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AFL Player Stat Board | Neeko Sports Stats" />
        <meta name="twitter:description" content="Compare every AFL player's recent trends, hit rates and projections by match. Filter by disposals and goals." />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "@id": "https://neekostats.com.au/stat-board/players",
              "url": "https://neekostats.com.au/stat-board/players",
              "name": "AFL Player Stat Board | Hit Rates & Projections",
              "description": "Compare every AFL player's recent trends, hit rates and projections by match. Filter by disposals and goals.",
              "inLanguage": "en-AU",
              "isPartOf": { "@id": "https://neekostats.com.au/" },
            },
            {
              "@type": "BreadcrumbList",
              "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://neekostats.com.au/" },
                { "@type": "ListItem", "position": 2, "name": "Stat Board", "item": "https://neekostats.com.au/stat-board" },
                { "@type": "ListItem", "position": 3, "name": "Players", "item": "https://neekostats.com.au/stat-board/players" },
              ],
            },
          ],
        })}</script>
      </Helmet>

      {/* Sticky controls bar — desktop only. On mobile the inline controls stay in-flow
          below the fixed header; no second sticky layer is needed or safe. */}
      {stickyVisible && !isMobile && (
        <StickyControlsBar
          matches={matches}
          selectedMatch={selectedMatch}
          matchesLoading={matchesLoading}
          lens={lens}
          positionFilter={positionFilter}
          search={search}
          sortKey={sortKey}
          sortOpen={sortOpen}
          hasFullAccess={hasFullAccess}
          onMatchChange={handleMatchChange}
          onLensChange={handleLensChange}
          onPositionChange={handlePositionChange}
          onSearchChange={setSearch}
          onSortChange={handleSortChange}
          onSortOpenChange={setSortOpen}
        />
      )}

      <div className="min-h-dvh bg-[#0a0a0a] text-white" style={{ overflowX: "hidden" }}>
        <div
          className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 min-w-0"
          style={{
            paddingBottom: "calc(5rem + env(safe-area-inset-bottom))",
            paddingTop: isMobile ? "calc(62px + 0.75rem)" : undefined,
            boxSizing: "border-box",
            maxWidth: "100%",
          }}
        >

          {/* Page header — compact on mobile */}
          <div className="mb-3 sm:mb-5">
            <h1 className="text-[18px] sm:text-xl font-bold tracking-tight text-white leading-tight">AFL Player Stat Board</h1>
            <p className="mt-0.5 text-[11px] sm:text-sm text-white/45 sm:max-w-xl leading-relaxed">
              <span className="sm:hidden">Pick a game, choose a stat, compare trends.</span>
              <span className="hidden sm:inline">Pick a match, choose a stat, and compare every player's recent trends, hit rates and projections.</span>
            </p>
          </div>

          {/* ── Mobile layout: match card + access banner ─────────────────── */}
          <div className="sm:hidden mb-3">
            {/* Match card with Change match button */}
            {matchesError ? (
              <div className="mb-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                Could not load matches. Please try refreshing.
              </div>
            ) : matchesLoading ? (
              <div className="mb-2 h-[60px] rounded-2xl bg-white/5 border border-white/8 animate-pulse" />
            ) : selectedMatch ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 flex items-center gap-3 min-w-0">
                {/* Access dot */}
                <div className="shrink-0">
                  {accessMode === "full" ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-400 block" />
                  ) : accessMode === "free" ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-500/70 block" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-white/22 block" />
                  )}
                </div>

                {/* Match info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-white leading-tight truncate">
                    {selectedMatch.match_label.replace(/\s+v(?:s\.?)?\s+/i, " vs ")}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-white/35 font-medium">
                      {selectedMatch.week === 0 ? "Opening Round" : `Round ${selectedMatch.week}`}
                    </span>
                    {!hasFullAccess && (
                      <span className={`text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 leading-none ${
                        accessMode === "free"
                          ? "text-emerald-500/70 bg-emerald-500/8 border border-emerald-500/15"
                          : "text-white/35 bg-white/5 border border-white/10"
                      }`}>
                        {accessMode === "free" ? "Free" : "Preview"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Change match button — min 44px tap target */}
                <button
                  onClick={() => setMatchSheetOpen(true)}
                  className="shrink-0 flex items-center gap-1 rounded-lg bg-white/8 border border-white/12 px-3 py-2 text-[11px] font-semibold text-white/70 hover:bg-white/12 hover:text-white/90 active:bg-white/15 transition-colors min-h-[44px]"
                >
                  Change
                  <ChevronRight className="h-3 w-3 text-white/40" />
                </button>
              </div>
            ) : null}

            {/* Access context banner — preview mode */}
            {!hasFullAccess && accessMode === "preview" && selectedMatch && (
              <div ref={bannerRef} className="mt-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-white/70 leading-snug">Preview — top 3 players shown</p>
                    <p className="text-[10px] text-white/35 mt-0.5 leading-snug">Full hit rates and expanded detail inside Neeko+</p>
                  </div>
                  <button
                    onClick={() => { trackStatBoardUpgrade({ source: "stat_board_players", button_text: "Start 7-Day Access — $7.99", section: "preview_banner", plan_key: "round_pass_7d", billing_type: "one_time", value: 7.99, currency: "AUD" }); window.location.href = "/neeko-plus"; }}
                    className="shrink-0 text-[10px] font-semibold text-[#60a5fa] bg-blue-500/8 border border-blue-500/18 rounded-lg px-2.5 py-1.5 hover:bg-blue-500/15 transition-colors whitespace-nowrap min-h-[36px] flex items-center"
                  >
                    Start 7-Day Access — $7.99
                  </button>
                </div>
              </div>
            )}

            {/* Access context banner — free game */}
            {!hasFullAccess && accessMode === "free" && (
              <div ref={bannerRef} className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.05] px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70 shrink-0" />
                <p className="text-[10px] text-emerald-400 font-semibold flex-1">Free Board — full stats visible</p>
                <button
                  onClick={() => { trackStatBoardUpgrade({ source: "stat_board_players", button_text: "Start 7-Day Access", section: "free_banner", plan_key: "round_pass_7d", billing_type: "one_time", value: 7.99, currency: "AUD" }); window.location.href = "/neeko-plus"; }}
                  className="shrink-0 text-[9px] font-semibold text-[#60a5fa]/80 hover:text-[#60a5fa] transition-colors whitespace-nowrap"
                >
                  Start 7-Day Access
                </button>
              </div>
            )}

            {/* Neeko+ active (no ref needed — not tracked for sticky) */}
            {hasFullAccess && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                <p className="text-[11px] font-semibold text-emerald-400">Neeko+ — every matchup unlocked</p>
              </div>
            )}
          </div>

          {/* ── Desktop: original banner + match selector ───────────────────── */}
          <div className="hidden sm:block">
            {/* Free games access banner */}
            {hasFullAccess ? (
              <div ref={bannerRef} className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                <p className="text-[11px] font-semibold text-emerald-400">Neeko+ active — every matchup unlocked</p>
              </div>
            ) : (
              <div ref={bannerRef} className="mb-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white leading-snug">2 full games free this week</p>
                    <p className="text-xs text-white/40 mt-0.5 leading-snug">Preview every other matchup. Unlock the full round with Neeko+.</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                      to="/stat-board/players"
                      onClick={() => trackFreeGamesCTA({ button_text: "View free", source: "stat_board_players", section: "top_banner" })}
                      className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/8 border border-emerald-500/18 rounded-lg px-2 py-1 hover:bg-emerald-500/15 transition-colors whitespace-nowrap"
                    >
                      View free
                    </Link>
                    <button
                      onClick={() => { trackStatBoardUpgrade({ source: "stat_board_players", button_text: "Start 7-Day Access — $7.99", section: "top_banner", plan_key: "round_pass_7d", billing_type: "one_time", value: 7.99, currency: "AUD" }); window.location.href = "/neeko-plus"; }}
                      className="text-[11px] font-semibold text-[#60a5fa] bg-blue-500/8 border border-blue-500/18 rounded-lg px-2 py-1 hover:bg-blue-500/15 transition-colors whitespace-nowrap"
                    >
                      Start 7-Day Access — $7.99
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Match selector */}
            {matchesError ? (
              <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                Could not load matches. Please try refreshing.
              </div>
            ) : (
              <div className="mb-3">
                <MatchSelector
                  matches={matches}
                  selected={selectedMatch}
                  loading={matchesLoading}
                  onChange={handleMatchChange}
                  hasFullAccess={hasFullAccess}
                />
              </div>
            )}
          </div>

          {/* ── Inline controls (observed for sticky trigger) ─────────────────── */}
          <div ref={controlsRef} className="mb-2.5" style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>

            {/* Mobile controls — compact pill style */}
            <div className="sm:hidden space-y-2" style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>

              {/* Row 1: Stat lens toggle + position pills in one scrollable row */}
              <div
                className="flex gap-1.5 overflow-x-auto"
                style={{ scrollbarWidth: "none", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}
              >
                {(["disposals", "goals", "marks", "tackles", "kicks", "fantasy"] as StatLens[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => handleLensChange(l)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors border shrink-0 ${
                      lens === l
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                        : "bg-white/[0.04] border-white/[0.08] text-white/40 hover:text-white/65"
                    }`}
                  >
                    {statLabel(l)}
                  </button>
                ))}
                <span className="text-white/15 text-[10px] self-center shrink-0">|</span>
                {POSITION_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => handlePositionChange(key)}
                    className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors border shrink-0 ${
                      positionFilter === key
                        ? "bg-white/12 border-white/20 text-white"
                        : "bg-white/[0.04] border-white/[0.08] text-white/38 hover:text-white/65"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Row 2: Search + Sort + How-to-read */}
              <div className="flex items-center gap-1.5" style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}>
                {/* Search */}
                <div className="flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] pl-2.5 pr-2 py-1.5 gap-1.5" style={{ flex: "1 1 0", minWidth: 0 }}>
                  <Search className="h-3 w-3 text-white/22 pointer-events-none shrink-0" />
                  <input
                    type="text"
                    placeholder="Search…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent text-[12px] text-white placeholder:text-white/22 focus:outline-none"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="text-white/22 hover:text-white/55 shrink-0"
                      aria-label="Clear search"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {/* Sort pill */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setSortOpen((v) => !v)}
                    className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-white/45 hover:text-white/70 focus:outline-none transition-colors"
                    aria-haspopup="listbox"
                    aria-expanded={sortOpen}
                    style={{ maxWidth: 100, overflow: "hidden" }}
                  >
                    <span className="truncate">{sortButtonLabel(sortKey)}</span>
                    <ChevronDown className={`h-3 w-3 text-white/28 transition-transform shrink-0 ${sortOpen ? "rotate-180" : ""}`} />
                  </button>
                  {sortOpen && (
                    <SortDropdown
                      current={sortKey}
                      options={sortOptions(lens)}
                      onSelect={(k) => { handleSortChange(k); setSortOpen(false); }}
                      onClose={() => setSortOpen(false)}
                    />
                  )}
                </div>
                {/* How to read */}
                <button
                  onClick={() => setHowToOpen((v) => !v)}
                  className="shrink-0 flex items-center justify-center h-7 w-7 rounded-full border border-white/[0.08] bg-white/[0.04] text-white/30 hover:text-white/60 transition-colors"
                  aria-label="How to read this"
                  aria-expanded={howToOpen}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* How to read — collapsible glossary */}
              {howToOpen && (
                <div className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5 space-y-1.5">
                  <p className="text-[10px] font-bold text-white/55 uppercase tracking-wider mb-1">How to read this</p>
                  {[
                    { term: "PROJ", def: "Projected stat for this match based on recent form and matchup" },
                    { term: "L5",   def: "Last 5 games average" },
                    { term: "20+",  def: "Season hit rate — how often the player exceeded that threshold" },
                    { term: "BYE",  def: "Bye week — no game played" },
                    { term: "DNP",  def: "Did not play — listed but did not take the field" },
                    { term: "Form", def: "Consistency label based on recent scoring variance (High / Medium / Low)" },
                  ].map(({ term, def }) => (
                    <div key={term} className="flex gap-2 items-baseline">
                      <span className="text-[9px] font-bold text-white/55 bg-white/5 border border-white/8 rounded px-1 py-0.5 shrink-0 tabular-nums">{term}</span>
                      <span className="text-[10px] text-white/38 leading-snug">{def}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Viewing context — very subtle, single line */}
              {!playersLoading && selectedMatch && (
                <div className="flex items-center gap-1 px-0.5 overflow-hidden" style={{ width: "100%", minWidth: 0 }}>
                  <span className="text-[10px] text-white/25 truncate min-w-0 flex-1">
                    {selectedMatch.match_label} · {statLabel(lens)}
                    {players.length > 0 ? ` · ${players.length} players` : ""}
                  </span>
                </div>
              )}
            </div>

            {/* Desktop controls — unchanged layout */}
            <div className="hidden sm:block space-y-2">
              {/* Row 1: stat toggle + position filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-0.5 rounded-lg bg-white/5 border border-white/8 p-0.5 shrink-0">
                  {(["disposals", "goals", "marks", "tackles", "kicks", "fantasy"] as StatLens[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => handleLensChange(l)}
                      className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                        lens === l
                          ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                          : "text-white/50 hover:text-white/80"
                      }`}
                    >
                      {statLabel(l)}
                    </button>
                  ))}
                </div>

                <div className="h-5 w-px bg-white/10 shrink-0" aria-hidden />

                <div className="flex gap-0.5 shrink-0 flex-wrap">
                  {POSITION_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => handlePositionChange(key)}
                      className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                        positionFilter === key
                          ? "bg-white/15 text-white ring-1 ring-white/25"
                          : "bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/70"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: search + sort */}
              <div className="flex items-center gap-2">
                <div className="flex items-center flex-1 min-w-0 rounded-lg bg-white/5 border border-white/8 pl-2.5 pr-2 focus-within:border-white/22 transition-colors">
                  <Search className="h-3 w-3 text-white/25 pointer-events-none shrink-0" />
                  <input
                    type="text"
                    placeholder="Search player..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent pl-1.5 pr-1 py-1.5 text-[12px] text-white placeholder:text-white/25 focus:outline-none"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="text-white/25 hover:text-white/55 shrink-0"
                      aria-label="Clear search"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="relative shrink-0">
                  <button
                    onClick={() => setSortOpen((v) => !v)}
                    className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/8 px-2.5 py-1.5 text-[12px] font-medium text-white/60 hover:text-white/80 hover:bg-white/8 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 whitespace-nowrap"
                    aria-haspopup="listbox"
                    aria-expanded={sortOpen}
                  >
                    <span className="text-white/32 text-[11px]">Sort:</span>
                    <span className="text-white/72">{sortButtonLabel(sortKey)}</span>
                    <ChevronDown className={`h-3 w-3 text-white/30 transition-transform ${sortOpen ? "rotate-180" : ""}`} />
                  </button>
                  {sortOpen && (
                    <SortDropdown
                      current={sortKey}
                      options={sortOptions(lens)}
                      onSelect={(k) => { handleSortChange(k); setSortOpen(false); }}
                      onClose={() => setSortOpen(false)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Context row — desktop only */}
          {!playersLoading && selectedMatch && (
            <div className="mb-3 sm:mb-5 hidden sm:flex items-center gap-1.5 flex-wrap text-[12px] text-white/48">
              <span className="text-white/30 text-[11px]">Viewing:</span>
              {[
                selectedMatch.match_label,
                statLabel(lens),
                players.length > 0 ? `${players.length} players` : null,
              ]
                .filter(Boolean)
                .map((part, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-white/20">·</span>}
                    <span>{part}</span>
                  </span>
                ))}
            </div>
          )}

          {/* Locked banner — desktop only (mobile uses preview mode instead) */}
          {isLocked && !isMobile && (
            <div className="mb-3 flex items-start gap-3 rounded-xl border border-[#F5C84C]/20 bg-[#F5C84C]/5 px-4 py-3">
              <Lock className="h-4 w-4 shrink-0 text-[#F5C84C] mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#F5C84C] leading-snug">This matchup is locked</p>
                <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">
                  Neeko+ unlocks the full round — every match, projection, hit rate and trend.
                </p>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => { trackStatBoardUpgrade({ source: "stat_board_players", button_text: "Start 7-Day Access — $7.99", section: "locked_banner", plan_key: "round_pass_7d", billing_type: "one_time", value: 7.99, currency: "AUD" }); window.location.href = "/neeko-plus"; }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 px-3 py-1.5 text-[11px] font-semibold text-[#60a5fa] hover:bg-blue-500/25 transition-colors"
                  >
                    Start 7-Day Access — $7.99
                  </button>
                  <Link
                    to="/stat-board/players"
                    onClick={() => trackFreeGamesCTA({ button_text: "View free games", source: "stat_board_players", section: "locked_banner" })}
                    className="text-[11px] font-semibold text-white/38 hover:text-white/65 transition-colors"
                  >
                    View free games
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Players error */}
          {playersError && (
            <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Could not load players. Please try again.
            </div>
          )}

          {/* Player board */}
          {playersLoading ? (
            <BoardSkeleton thresholdCount={thresholds.length} />
          ) : players.length === 0 && selectedMatch ? (
            <NoPlayersState
              positionFilter={positionFilter}
              search={search}
              lens={lens}
              isRoundDataPreparing={isRoundDataPreparing}
              roundLabel={selectedMatch.week === 0 ? "Opening Round" : `Round ${selectedMatch.week}`}
              onResetPosition={() => setPositionFilter("ALL")}
              onResetSearch={() => setSearch("")}
              onResetAll={() => { setPositionFilter("ALL"); setSearch(""); }}
            />
          ) : (
            <div className="space-y-8">
              <TeamBoard
                matchId={selectedMatch?.match_id ?? null}
                teamName={selectedMatch?.home_team_name ?? "Home"}
                opponentName={selectedMatch?.away_team_name ?? "Away"}
                players={homePlayers}
                lens={lens}
                thresholds={thresholds}
                defaultThreshold={threshold}
                isMatchLocked={isLocked}
                accessMode={accessMode}
                expandedPlayerId={expandedPlayerId}
                onToggleExpand={handleToggleExpand}
                searchActive={search.trim().length > 0}
              />
              <TeamBoard
                matchId={selectedMatch?.match_id ?? null}
                teamName={selectedMatch?.away_team_name ?? "Away"}
                opponentName={selectedMatch?.home_team_name ?? "Home"}
                players={awayPlayers}
                lens={lens}
                thresholds={thresholds}
                defaultThreshold={threshold}
                isMatchLocked={isLocked}
                accessMode={accessMode}
                expandedPlayerId={expandedPlayerId}
                onToggleExpand={handleToggleExpand}
                searchActive={search.trim().length > 0}
              />
            </div>
          )}

          {!matchesLoading && matches.length === 0 && !matchesError && (
            <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-10 text-center text-sm text-white/45">
              No matches available yet.
            </div>
          )}
        </div>
      </div>
      {!hasFullAccess && mobileStickyVisible && (
        <MobileUpgradeBar
          state={accessMode === "preview" ? "free" : selectedMatch?.is_locked ? "locked" : "free"}
        />
      )}
      {matchSheetOpen && (
        <MobileMatchBottomSheet
          matches={matches}
          selected={selectedMatch}
          hasFullAccess={hasFullAccess}
          onSelect={handleMatchChange}
          onClose={() => setMatchSheetOpen(false)}
        />
      )}
    </>
  );
}

// ── Sticky controls bar ───────────────────────────────────────────────────────

interface StickyControlsBarProps {
  matches: StatBoardMatch[];
  selectedMatch: StatBoardMatch | null;
  matchesLoading: boolean;
  lens: StatLens;
  positionFilter: PositionFilter;
  search: string;
  sortKey: SortKey;
  sortOpen: boolean;
  hasFullAccess: boolean;
  onMatchChange: (m: StatBoardMatch) => void;
  onLensChange: (l: StatLens) => void;
  onPositionChange: (p: PositionFilter) => void;
  onSearchChange: (s: string) => void;
  onSortChange: (k: SortKey) => void;
  onSortOpenChange: (v: boolean) => void;
}

function StickyControlsBar({
  matches,
  selectedMatch,
  matchesLoading,
  lens,
  positionFilter,
  search,
  sortKey,
  sortOpen,
  hasFullAccess,
  onMatchChange,
  onLensChange,
  onPositionChange,
  onSearchChange,
  onSortChange,
  onSortOpenChange,
}: StickyControlsBarProps) {
  return (
    <div
      className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#0a0a0a]"
      style={{ maxWidth: "100vw" }}
    >
      <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center gap-2">

        {/* Match selector (compact) */}
        <div className="shrink-0">
          <MatchSelector
            matches={matches}
            selected={selectedMatch}
            loading={matchesLoading}
            onChange={onMatchChange}
            hasFullAccess={hasFullAccess}
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Stat toggle */}
          <div className="flex gap-0.5 rounded-lg bg-white/5 border border-white/8 p-0.5">
            {(["disposals", "goals", "marks", "tackles", "kicks", "fantasy"] as StatLens[]).map((l) => (
              <button
                key={l}
                onClick={() => onLensChange(l)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  lens === l
                    ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                    : "text-white/45 hover:text-white/75"
                }`}
              >
                {statLabelShort(l)}
              </button>
            ))}
          </div>

          {/* Position filter */}
          <div className="flex gap-0.5">
            {POSITION_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => onPositionChange(key)}
                className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                  positionFilter === key
                    ? "bg-white/15 text-white ring-1 ring-white/25"
                    : "bg-white/5 text-white/38 hover:bg-white/10 hover:text-white/65"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center w-32 sm:w-40 rounded-lg bg-white/5 border border-white/8 pl-2.5 pr-2 focus-within:border-white/22 transition-colors">
            <Search className="h-3 w-3 text-white/22 pointer-events-none shrink-0" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="flex-1 min-w-0 bg-transparent pl-1.5 pr-1 py-1.5 text-[11px] text-white placeholder:text-white/22 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => onSearchChange("")}
                className="text-white/22 hover:text-white/50 shrink-0"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => onSortOpenChange(!sortOpen)}
              className="flex items-center gap-1 rounded-lg bg-white/5 border border-white/8 px-2.5 py-1.5 text-[11px] font-medium text-white/55 hover:text-white/80 hover:bg-white/8 transition-colors whitespace-nowrap"
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
            >
              {sortButtonLabel(sortKey)}
              <ChevronDown className={`h-3 w-3 text-white/28 transition-transform ${sortOpen ? "rotate-180" : ""}`} />
            </button>
            {sortOpen && (
              <SortDropdown
                current={sortKey}
                options={sortOptions(lens)}
                onSelect={(k) => { onSortChange(k); onSortOpenChange(false); }}
                onClose={() => onSortOpenChange(false)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── No-players empty state ────────────────────────────────────────────────────

function NoPlayersState({
  positionFilter,
  search,
  lens,
  isRoundDataPreparing,
  roundLabel,
  onResetPosition,
  onResetSearch,
  onResetAll,
}: {
  positionFilter: PositionFilter;
  search: string;
  lens: StatLens;
  isRoundDataPreparing: boolean;
  roundLabel: string;
  onResetPosition: () => void;
  onResetSearch: () => void;
  onResetAll: () => void;
}) {
  const hasPosition = positionFilter !== "ALL";
  const hasSearch = search.trim().length > 0;
  const statLabel = lens === "disposals" ? "disposal" : "goal";
  const hasFilters = hasPosition || hasSearch;

  const posLabel: Record<PositionFilter, string> = {
    ALL:  "player",
    MID:  "midfielder",
    DEF:  "defender",
    FWD:  "forward",
    RUCK: "ruck",
  };
  const pos = posLabel[positionFilter];

  // "Data preparing" state: no filters active, round hasn't been played yet.
  // Show a clear, informative message rather than a generic empty state.
  if (isRoundDataPreparing && !hasFilters) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-6 py-12 text-center">
        <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/5 border border-white/10 mb-4 mx-auto">
          <svg className="h-5 w-5 text-white/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
          </svg>
        </div>
        <p className="text-[15px] font-semibold text-white/75 mb-1.5">
          {roundLabel} data is being prepared
        </p>
        <p className="text-[13px] text-white/38 max-w-sm mx-auto leading-relaxed">
          Player projections and hit rates for this round are calculated once the round is confirmed.
          Check back closer to game day.
        </p>
      </div>
    );
  }

  let heading: string;
  let sub: string;

  if (hasPosition && positionFilter === "RUCK" && !hasSearch) {
    heading = "No ruck players found for this match";
    sub = "Ruck players may not have enough data for this match yet.";
  } else if (hasPosition && hasSearch) {
    heading = `No ${pos} players matching "${search.trim()}"`;
    sub = "Try broadening your search or clearing the position filter.";
  } else if (hasPosition) {
    heading = `No ${pos} players found for this match`;
    sub = `This match may not have any ${pos}s with ${statLabel} data yet.`;
  } else if (hasSearch) {
    heading = `No players matched your search`;
    sub = `No results for "${search.trim()}". Check the spelling or try a shorter name.`;
  } else {
    heading = "No players found for this match";
    sub = "Data may not be available yet for this match.";
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-6 py-10 text-center">
      <p className="text-[15px] font-semibold text-white/75 mb-1.5">{heading}</p>
      <p className="text-[13px] text-white/38 mb-6 max-w-xs mx-auto leading-relaxed">{sub}</p>

      {hasFilters && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {hasPosition && (
            <button
              onClick={onResetPosition}
              className="rounded-lg border border-white/12 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white/85 transition-colors"
            >
              Reset position
            </button>
          )}
          {hasSearch && (
            <button
              onClick={onResetSearch}
              className="rounded-lg border border-white/12 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white/85 transition-colors"
            >
              Clear search
            </button>
          )}
          {hasPosition && hasSearch && (
            <button
              onClick={onResetAll}
              className="rounded-lg border border-white/18 bg-white/8 px-3.5 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/14 hover:text-white transition-colors"
            >
              Reset all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sort dropdown ─────────────────────────────────────────────────────────────

function SortDropdown({
  current,
  options,
  onSelect,
  onClose,
}: {
  current: SortKey;
  options: { key: SortKey; label: string }[];
  onSelect: (k: SortKey) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-sort-dropdown]")) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      data-sort-dropdown
      role="listbox"
      aria-label="Sort options"
      className="absolute right-0 top-full z-50 mt-1 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[#141414] shadow-2xl overflow-hidden"
    >
      {options.map((opt) => (
        <button
          key={opt.key}
          role="option"
          aria-selected={current === opt.key}
          onClick={() => onSelect(opt.key)}
          className={`w-full text-left px-4 py-2.5 text-xs transition-colors ${
            current === opt.key
              ? "bg-white/10 text-white font-semibold"
              : "text-white/60 hover:bg-white/6 hover:text-white/90"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Team board ────────────────────────────────────────────────────────────────

const TOP_N = 8;

interface TeamBoardProps {
  matchId: number | null;
  teamName: string;
  opponentName: string;
  players: StatBoardPlayer[];
  lens: StatLens;
  thresholds: readonly number[];
  defaultThreshold: number;
  isMatchLocked: boolean;
  accessMode: import("./useStatBoardAccess").MatchAccessMode;
  expandedPlayerId: number | null;
  onToggleExpand: (id: number | null) => void;
  searchActive: boolean;
}

const TeamBoard = memo(function TeamBoard({
  matchId,
  teamName,
  opponentName,
  players,
  lens,
  thresholds,
  defaultThreshold,
  isMatchLocked,
  accessMode,
  expandedPlayerId,
  onToggleExpand,
  searchActive,
}: TeamBoardProps) {
  const [showAll, setShowAll] = useState(false);
  const isMobile = useIsMobile();

  // Reset "show all" whenever the player list identity changes (new match/filter)
  const prevPlayersRef = useRef(players);
  if (prevPlayersRef.current !== players) {
    prevPlayersRef.current = players;
    if (showAll) setShowAll(false);
  }

  // useMemo must be called unconditionally — before any early return
  const needsCap = !searchActive && players.length > TOP_N;
  const isCapped = needsCap && !showAll;
  const visiblePlayers = useMemo(
    () => (isCapped ? players.slice(0, TOP_N) : players),
    [players, isCapped]
  );

  if (players.length === 0) return null;

  const isHome: boolean | null = players[0]?.is_home ?? null;
  const totalCount = players.length;
  const hiddenCount = totalCount - TOP_N;

  const headerCount = searchActive
    ? `${totalCount} ${totalCount === 1 ? "player" : "players"} found`
    : isCapped
    ? `Top ${TOP_N} shown · ${totalCount} available`
    : `${totalCount} ${totalCount === 1 ? "player" : "players"}`;

  const showMoreBtn = needsCap && (
    <button
      onClick={() => setShowAll((v) => !v)}
      className={`
        w-full flex items-center justify-center gap-2
        ${isMobile ? "rounded-xl mt-2" : "rounded-b-2xl border-x border-b border-white/10"}
        bg-[#0d0d0d] hover:bg-white/[0.04]
        px-4 py-2.5
        text-[11px] font-medium text-white/40 hover:text-white/65
        transition-colors
      `}
      aria-expanded={showAll}
      aria-label={showAll ? "Show fewer players" : `Show all ${totalCount} players`}
    >
      {showAll ? (
        <>
          <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Show fewer players
        </>
      ) : (
        <>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Show {hiddenCount} more {hiddenCount === 1 ? "player" : "players"}
        </>
      )}
    </button>
  );

  const legend = (
    <div className="flex items-center gap-3 px-1 pt-1.5 pb-0.5" aria-label="Legend">
      <span className="flex items-center gap-1 text-[9px] text-white/22">
        <span className="inline-flex items-center justify-center h-3.5 min-w-[22px] px-0.5 rounded bg-white/4 border border-white/8 font-bold text-[7px]">BYE</span>
        bye week
      </span>
      <span className="flex items-center gap-1 text-[9px] text-white/22">
        <span className="inline-flex items-center justify-center h-3.5 min-w-[22px] px-0.5 rounded bg-white/4 border border-dashed border-white/12 font-bold text-[7px]">DNP</span>
        did not play
      </span>
    </div>
  );

  // ── Team section header — shared between mobile/desktop ──
  const teamHeader = (
    <div className="mb-2 flex items-center gap-2 flex-wrap">
      <h2 className="text-[14px] font-bold text-white tracking-tight leading-none shrink-0">
        {teamName}
      </h2>
      <span className="text-[10px] text-white/30 font-medium leading-none shrink-0">
        {headerCount}
      </span>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[9px] font-semibold text-white/32 bg-white/5 border border-white/8 rounded-full px-1.5 py-0.5 whitespace-nowrap">
          vs {opponentName}
        </span>
        {isHome === true && (
          <span className="text-[9px] font-semibold text-emerald-500/65 bg-emerald-500/8 border border-emerald-500/12 rounded-full px-1.5 py-0.5 whitespace-nowrap">
            Home
          </span>
        )}
        {isHome === false && (
          <span className="text-[9px] font-semibold text-white/28 bg-white/5 border border-white/8 rounded-full px-1.5 py-0.5 whitespace-nowrap">
            Away
          </span>
        )}
      </div>
    </div>
  );

  // ── Mobile section header — stronger hierarchy ──
  const mobileTeamHeader = (
    <div className="mb-3">
      {/* Top rule — visually separates this section from whatever came before */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-px bg-white/[0.07]" aria-hidden />
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/22 shrink-0">
          {isHome === true ? "Home" : isHome === false ? "Away" : ""}
        </span>
        <div className="flex-1 h-px bg-white/[0.07]" aria-hidden />
      </div>

      {/* Team name row */}
      <div className="flex items-end justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <h2 className="text-[18px] font-extrabold text-white tracking-tight leading-none truncate">
            {teamName}
          </h2>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="text-[11px] text-white/38 font-medium leading-none">
              vs {opponentName}
            </span>
            {isHome === true && (
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-1.5 py-0.5 leading-none whitespace-nowrap uppercase tracking-wide">
                Home
              </span>
            )}
            {isHome === false && (
              <span className="text-[9px] font-bold text-white/40 bg-white/[0.06] border border-white/10 rounded-md px-1.5 py-0.5 leading-none whitespace-nowrap uppercase tracking-wide">
                Away
              </span>
            )}
          </div>
        </div>

        <span className="text-[11px] text-white/28 font-medium shrink-0 leading-none pb-0.5">
          {headerCount}
        </span>
      </div>
    </div>
  );

  // ── Mobile layout — stacked cards ──
  if (isMobile) {
    const isPreviewBoard = accessMode === "preview" && !searchActive;
    const fullyVisiblePlayers = visiblePlayers.slice(0, isPreviewBoard ? PREVIEW_VISIBLE_ROWS : undefined);
    const previewPlayers = isPreviewBoard ? visiblePlayers.slice(PREVIEW_VISIBLE_ROWS) : [];

    return (
      <div className="w-full min-w-0">
        {mobileTeamHeader}

        {/* Fully visible players */}
        <div className="flex flex-col gap-2 w-full min-w-0">
          {fullyVisiblePlayers.map((player) => (
            <MobilePlayerCard
              key={`${matchId ?? 0}-${player.player_id}`}
              player={player}
              lens={lens}
              thresholds={thresholds}
              defaultThreshold={defaultThreshold}
              isMatchLocked={isMatchLocked}
              isExpanded={expandedPlayerId === player.player_id}
              onToggleExpand={() =>
                onToggleExpand(expandedPlayerId === player.player_id ? null : player.player_id)
              }
              matchId={matchId}
            />
          ))}
        </div>

        {/* Preview board: mid-board CTA divider + name-only cards */}
        {isPreviewBoard && previewPlayers.length > 0 && (
          <>
            <div className="my-3 rounded-xl border border-[#F5C84C]/15 bg-[#F5C84C]/[0.03] px-3 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#F5C84C]/80 leading-snug">
                  +{previewPlayers.length} more players
                </p>
                <p className="text-[10px] text-white/32 mt-0.5 leading-snug">
                  Full hit rates and expanded stats inside Neeko+
                </p>
              </div>
              <button
                onClick={() => { trackStatBoardUpgrade({ source: "stat_board_players", button_text: "Start 7-Day Access — $7.99", section: "preview_mid_board", plan_key: "round_pass_7d", billing_type: "one_time", value: 7.99, currency: "AUD" }); window.location.href = "/neeko-plus"; }}
                className="shrink-0 text-[10px] font-semibold text-[#60a5fa] bg-blue-500/10 border border-blue-500/22 rounded-lg px-2.5 py-1.5 hover:bg-blue-500/16 transition-colors whitespace-nowrap min-h-[36px] flex items-center"
              >
                Start 7-Day Access — $7.99
              </button>
            </div>

            <div className="flex flex-col gap-1.5 w-full min-w-0">
              {previewPlayers.map((player) => (
                <MobilePlayerCard
                  key={`${matchId ?? 0}-${player.player_id}`}
                  player={player}
                  lens={lens}
                  thresholds={thresholds}
                  defaultThreshold={defaultThreshold}
                  isMatchLocked={isMatchLocked}
                  isExpanded={false}
                  onToggleExpand={() => {}}
                  matchId={matchId}
                  previewMode
                />
              ))}
            </div>
          </>
        )}

        {!isPreviewBoard && showMoreBtn}
        {legend}
      </div>
    );
  }

  // ── Desktop layout — horizontally scrollable table ──
  return (
    <div>
      {teamHeader}

      {/* Horizontally scrollable table */}
      <div className="overflow-x-auto rounded-t-2xl border border-white/10 bg-[#0d0d0d]">
        <table className="w-full border-collapse text-left" style={{ minWidth: "640px" }}>
          <thead>
            <tr className="border-b border-white/10 bg-[#0f0f0f]">
              <th className="pl-4 pr-2 py-2.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
                Player
              </th>
              <th className="px-2 py-2.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-center whitespace-nowrap">
                Recent
              </th>
              <th className="px-2 py-2.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-right whitespace-nowrap">
                Recent Avg
              </th>
              <th className="px-2 py-2.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-right whitespace-nowrap">
                Proj
              </th>
              {thresholds.map((t) => (
                <th
                  key={t}
                  className="px-2 py-2.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-center whitespace-nowrap"
                >
                  {t}+ Hit
                </th>
              ))}
              <th className="px-2 py-2.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider text-center whitespace-nowrap">
                Consistency
              </th>
              <th className="pr-3 pl-1 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody>
            {visiblePlayers.map((player) => (
              <BoardRow
                key={`${matchId ?? 0}-${player.player_id}`}
                player={player}
                lens={lens}
                thresholds={thresholds}
                defaultThreshold={defaultThreshold}
                isMatchLocked={isMatchLocked}
                isExpanded={expandedPlayerId === player.player_id}
                onToggleExpand={() =>
                  onToggleExpand(expandedPlayerId === player.player_id ? null : player.player_id)
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom expand/collapse control — only when cap applies */}
      {showMoreBtn}

      {/* When no cap, round bottom of table normally */}
      {!needsCap && <div className="h-px" />}

      {/* BYE/DNP legend — below show-more, quiet footnote */}
      {legend}
    </div>
  );
});

// ── Loading skeleton ──────────────────────────────────────────────────────────

function BoardSkeleton({ thresholdCount }: { thresholdCount: number }) {
  const isMobile = useIsMobile();
  const colCount = 4 + thresholdCount + 2;

  if (isMobile) {
    return (
      <div className="space-y-5">
        {[0, 1].map((g) => (
          <div key={g}>
            <div className="h-4 w-32 rounded-lg bg-white/6 mb-3 animate-pulse" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="h-3 w-28 rounded bg-white/6 animate-pulse mb-1" />
                      <div className="h-2 w-16 rounded bg-white/4 animate-pulse" />
                    </div>
                    <div className="h-5 w-8 rounded bg-white/5 animate-pulse" />
                  </div>
                  <div className="flex gap-1 mb-2">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <div key={j} className="h-[18px] w-[18px] rounded bg-white/4 animate-pulse" />
                    ))}
                  </div>
                  <div className="flex gap-0 border border-white/8 rounded-lg overflow-hidden">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className="flex-1 px-2 py-1.5 border-r border-white/8 last:border-r-0">
                        <div className="h-1.5 w-4 rounded bg-white/5 animate-pulse mb-1 mx-auto" />
                        <div className="h-3 w-6 rounded bg-white/4 animate-pulse mx-auto" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {[0, 1].map((g) => (
        <div key={g}>
          <div className="h-4 w-32 rounded-lg bg-white/6 mb-3 animate-pulse" />
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0d0d0d]">
            <table className="w-full border-collapse" style={{ minWidth: "640px" }}>
              <thead>
                <tr className="border-b border-white/10 bg-[#0f0f0f]">
                  {Array.from({ length: colCount }).map((_, i) => (
                    <th key={i} className="px-3 py-2.5">
                      <div className="h-2.5 w-10 rounded bg-white/8 animate-pulse" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.06] last:border-b-0">
                    <td className="pl-4 pr-2 py-3">
                      <div className="h-3 w-28 rounded bg-white/6 animate-pulse mb-1" />
                      <div className="h-2 w-16 rounded bg-white/4 animate-pulse" />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex gap-0.5 justify-center">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <div key={j} className="h-5 w-4 rounded bg-white/4 animate-pulse" />
                        ))}
                      </div>
                    </td>
                    {Array.from({ length: colCount - 2 }).map((_, j) => (
                      <td key={j} className="px-2 py-3">
                        <div className="h-3 w-10 rounded bg-white/5 animate-pulse mx-auto" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
