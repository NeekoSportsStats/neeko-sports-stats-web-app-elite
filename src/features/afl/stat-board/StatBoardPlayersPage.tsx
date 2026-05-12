import { useState, useEffect, useMemo, useRef, useCallback, memo, useSyncExternalStore } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Search, X, Lock, ChevronDown, ChevronUp, Menu, Crown, LogIn, LogOut, User, Star, Shield, Users, CircleHelp as HelpCircle, FileText, Mail, TableProperties } from "lucide-react";
import { track } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";

import {
  useStatBoardMatches,
  useStatBoardPlayers,
} from "./useStatBoard";
import { useStatBoardAccess } from "./useStatBoardAccess";
import type {
  StatBoardMatch,
  StatBoardPlayer,
  StatLens,
  PositionFilter,
} from "./types";
import { defaultThreshold, thresholdsForLens } from "./types";
import { MatchSelector } from "./components/MatchSelector";
import { BoardRow, MobilePlayerCard } from "./components/BoardRow";

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
  const stat = lens === "disposals" ? "Disposal" : "Goal";
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

// ── Mobile header + drawer (mobile only, matches MobileLanding style) ─────────

const SB_DRAWER_MAIN = [
  { label: "Home",           to: "/",                       icon: Star            },
  { label: "Stats Hub",      to: "/stat-board/players",     icon: TableProperties },
  { label: "Player Stats",   to: "/stat-board/players",     icon: Users           },
  { label: "Team Stats",     to: "/stat-board/teams",       icon: Shield          },
  { label: "Match Centre",   to: "/stat-board/match-centre",icon: TableProperties },
  { label: "Fantasy Hub",    to: "/fantasy",                icon: Star            },
  { label: "Players",        to: "/sports/afl/players",     icon: Users           },
  { label: "Teams",          to: "/sports/afl/teams",       icon: Shield          },
  { label: "Neeko+",         to: "/neeko-plus",             icon: Crown, gold: true },
] as const;

const SB_DRAWER_INFO = [
  { label: "About",    to: "/about",    icon: Users      },
  { label: "FAQ",      to: "/faq",      icon: HelpCircle },
  { label: "Policies", to: "/policies", icon: FileText   },
  { label: "Contact",  to: "/contact",  icon: Mail       },
] as const;

function StatBoardDrawer({
  open, onClose, isPremium, user, authLoading, signOut,
}: {
  open: boolean;
  onClose: () => void;
  isPremium: boolean;
  user: ReturnType<typeof useAuth>["user"];
  authLoading: boolean;
  signOut: () => Promise<void>;
}) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.22s ease",
        }}
        aria-hidden="true"
      />
      <div
        role="dialog" aria-modal="true" aria-label="Navigation menu"
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0, width: 276,
          zIndex: 201, background: "#070a0e",
          borderRight: "1px solid rgba(255,255,255,0.09)",
          display: "flex", flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.26s cubic-bezier(0.22,1,0.36,1)",
          willChange: "transform",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Drawer header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "4px 12px 4px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0,
        }}>
          <Link to="/" onClick={onClose} style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
            <img src="/logo.png" alt="Neeko Sports Stats" style={{ width: 84, height: "auto", objectFit: "contain", display: "block" }} />
          </Link>
          <button
            onClick={onClose} aria-label="Close menu"
            style={{
              width: 40, height: 40, background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)", borderRadius: 9,
              color: "rgba(255,255,255,0.55)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "background 0.12s",
            }}
          >
            <X size={17} />
          </button>
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "18px 12px 12px" }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.30em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", margin: "0 0 8px 10px" }}>
            Main
          </p>
          {SB_DRAWER_MAIN.filter(l => !(l.gold && isPremium)).map(({ label, to, icon: Icon, gold }) => (
            <Link
              key={label} to={to} onClick={onClose}
              style={{
                display: "flex", alignItems: "center", gap: 13,
                padding: "13px 12px", borderRadius: 11, marginBottom: 2,
                textDecoration: "none",
                color: gold ? "#E0AE2D" : "rgba(255,255,255,0.80)",
                fontSize: 14.5, fontWeight: gold ? 800 : 600,
                background: gold ? "rgba(224,174,45,0.07)" : "transparent",
                border: gold ? "1px solid rgba(224,174,45,0.18)" : "1px solid transparent",
                transition: "background 0.12s", minHeight: 48,
              }}
            >
              <Icon size={17} style={{ color: gold ? "#E0AE2D" : "rgba(255,255,255,0.38)", flexShrink: 0 }} />
              {label}
              {gold && (
                <span style={{
                  marginLeft: "auto", fontSize: 9, fontWeight: 900,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "#E0AE2D", background: "rgba(224,174,45,0.12)",
                  border: "1px solid rgba(224,174,45,0.24)",
                  padding: "2px 7px", borderRadius: 999,
                }}>
                  Upgrade
                </span>
              )}
            </Link>
          ))}

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "14px 4px" }} />

          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.30em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", margin: "0 0 8px 10px" }}>
            Info
          </p>
          {SB_DRAWER_INFO.map(({ label, to, icon: Icon }) => (
            <Link
              key={to} to={to} onClick={onClose}
              style={{
                display: "flex", alignItems: "center", gap: 13,
                padding: "11px 12px", borderRadius: 11, marginBottom: 2,
                textDecoration: "none", color: "rgba(255,255,255,0.50)",
                fontSize: 13.5, fontWeight: 500, minHeight: 44,
                transition: "background 0.12s",
              }}
            >
              <Icon size={15} style={{ color: "rgba(255,255,255,0.28)", flexShrink: 0 }} />
              {label}
            </Link>
          ))}
        </nav>

        <div style={{
          padding: "12px 16px 16px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0, display: "flex", flexDirection: "column", gap: 8,
        }}>
          {authLoading && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "13px 16px", borderRadius: 11,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.28)", fontSize: 12.5, fontWeight: 500, minHeight: 48,
            }}>
              Checking session…
            </div>
          )}
          {!authLoading && !user && (
            <Link to="/auth" onClick={onClose} style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "13px 16px", borderRadius: 11,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.60)", fontSize: 13.5, fontWeight: 600,
              textDecoration: "none", minHeight: 48,
            }}>
              <LogIn size={15} /> Sign In
            </Link>
          )}
          {!authLoading && user && (
            <>
              <Link to="/account" onClick={onClose} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "13px 16px", borderRadius: 11,
                background: isPremium ? "rgba(224,174,45,0.08)" : "rgba(255,255,255,0.05)",
                border: isPremium ? "1px solid rgba(224,174,45,0.22)" : "1px solid rgba(255,255,255,0.10)",
                color: isPremium ? "#E0AE2D" : "rgba(255,255,255,0.75)",
                fontSize: 13.5, fontWeight: 600, textDecoration: "none", minHeight: 48,
              }}>
                {isPremium ? <Crown size={14} /> : <User size={14} />}
                Account
              </Link>
              <button
                onClick={() => { signOut(); onClose(); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "11px 16px", borderRadius: 11, background: "none",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(255,255,255,0.32)", fontSize: 12.5, fontWeight: 500,
                  cursor: "pointer", minHeight: 44, width: "100%",
                }}
              >
                <LogOut size={13} /> Sign Out
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function StatBoardMobileHeader({ onMenuOpen, isPremium }: { onMenuOpen: () => void; isPremium: boolean }) {
  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      display: "flex", alignItems: "center",
      padding: "0 14px 0 12px", height: 62,
      gap: 12,
      background: "rgba(7,10,14,0.97)",
      borderBottom: "1px solid rgba(255,255,255,0.09)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      paddingTop: "env(safe-area-inset-top, 0px)",
    }}>
      {/* Burger */}
      <button
        onClick={onMenuOpen} aria-label="Open navigation menu"
        style={{
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10, color: "rgba(255,255,255,0.80)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, width: 42, height: 42,
        }}
      >
        <Menu size={20} />
      </button>

      {/* Brand — centred */}
      <Link to="/" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", flex: 1, minWidth: 0, paddingLeft: 8 }}>
        <img src="/logo.png" alt="Neeko Sports Stats" style={{ width: 100, maxWidth: "100%", height: "auto", objectFit: "contain", display: "block" }} />
      </Link>

      {/* Neeko+ button */}
      {!isPremium ? (
        <Link to="/neeko-plus" style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "0 14px", height: 40, borderRadius: 10,
          background: "linear-gradient(160deg,#fad52a 0%,#e09600 100%)",
          color: "#130c00", fontSize: 13, fontWeight: 900,
          textDecoration: "none", letterSpacing: "0.01em", flexShrink: 0,
          boxShadow: "0 2px 10px rgba(224,174,45,0.22)",
        }}>
          <Crown size={14} /> Neeko+
        </Link>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "0 12px", height: 38, borderRadius: 10,
          background: "rgba(224,174,45,0.10)",
          border: "1px solid rgba(224,174,45,0.28)",
          color: "#E0AE2D", fontSize: 12, fontWeight: 800, flexShrink: 0,
        }}>
          <Crown size={13} /> Plus
        </div>
      )}
    </header>
  );
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const urlMatchId = searchParams.get("match_id") ? Number(searchParams.get("match_id")) : null;

  const { hasFullAccess } = useStatBoardAccess("players");
  const { user, isPremium, loading: authLoading, signOut } = useAuth();
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

  // Auto-select default match — prefer URL param match_id if present
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

  function handleLensChange(newLens: StatLens) {
    setLens(newLens);
    setSortKey("projection");
    setExpandedPlayerId(null);
    track("Stat Board Lens Change", { lens: newLens });
  }

  function handleMatchChange(match: StatBoardMatch) {
    setSelectedMatch(match);
    setExpandedPlayerId(null);
    track("Stat Board Match Change", { match_id: match.match_id, match_label: match.match_label });
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
  }, []);

  useEffect(() => {
    track("Page View", { path: "/stat-board/players" });
  }, []);

  // Premium users see all matches unlocked; is_locked is a DB hint for free users only
  const isLocked = hasFullAccess ? false : (selectedMatch?.is_locked ?? false);
  const navigate = useNavigate();

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
        <meta property="og:title" content="AFL Player Stat Board | Neeko Sports Stats" />
        <meta name="twitter:title" content="AFL Player Stat Board | Neeko Sports Stats" />
      </Helmet>

      {/* Mobile-only header + drawer */}
      {isMobile && (
        <>
          <StatBoardMobileHeader onMenuOpen={() => setDrawerOpen(true)} isPremium={isPremium} />
          <StatBoardDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            isPremium={isPremium}
            user={user}
            authLoading={authLoading}
            signOut={signOut}
          />
        </>
      )}

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
          onPositionChange={setPositionFilter}
          onSearchChange={setSearch}
          onSortChange={setSortKey}
          onSortOpenChange={setSortOpen}
        />
      )}

      <div className="min-h-dvh bg-[#0a0a0a] text-white" style={{ overflowX: "clip" }}>
        <div
          className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 min-w-0"
          style={{
            paddingBottom: "calc(5rem + env(safe-area-inset-bottom))",
            paddingTop: isMobile ? "calc(62px + 1rem)" : undefined,
          }}
        >

          {/* Page header — desktop only; mobile has the branded sticky header */}
          <div className="mb-4 sm:mb-6 hidden sm:block">
            <h1 className="text-xl font-bold tracking-tight text-white">AFL Player Stat Board</h1>
            <p className="mt-1 text-sm text-white/50 max-w-xl leading-relaxed">
              Pick a match, choose a stat, and compare every player's recent trends, hit rates and projections.
            </p>
          </div>

          {/* Match selector */}
          {matchesError ? (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Could not load matches. Please try refreshing.
            </div>
          ) : (
            <MatchSelector
              matches={matches}
              selected={selectedMatch}
              loading={matchesLoading}
              onChange={handleMatchChange}
              hasFullAccess={hasFullAccess}
            />
          )}

          {/* ── Inline controls (observed for sticky trigger) ─────────────────── */}
          <div ref={controlsRef} className="mb-3">

            {/* Mobile controls card */}
            <div className="sm:hidden rounded-2xl border border-white/[0.08] bg-[#0d0f12] overflow-hidden">

              {/* Row 1: Stat toggle */}
              <div className="flex border-b border-white/[0.06]">
                {(["disposals", "goals"] as StatLens[]).map((l, i) => (
                  <button
                    key={l}
                    onClick={() => handleLensChange(l)}
                    className={`flex-1 py-3 text-[13px] font-semibold transition-colors ${
                      i === 0 ? "border-r border-white/[0.06]" : ""
                    } ${
                      lens === l
                        ? "text-emerald-400 bg-emerald-500/[0.08]"
                        : "text-white/40"
                    }`}
                  >
                    {l === "disposals" ? "Disposals" : "Goals"}
                  </button>
                ))}
              </div>

              {/* Row 2: Position filters */}
              <div className="flex border-b border-white/[0.06] overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {POSITION_OPTIONS.map(({ key, label }, i) => (
                  <button
                    key={key}
                    onClick={() => setPositionFilter(key)}
                    className={`flex-1 py-2.5 text-[12px] font-semibold whitespace-nowrap transition-colors ${
                      i < POSITION_OPTIONS.length - 1 ? "border-r border-white/[0.06]" : ""
                    } ${
                      positionFilter === key
                        ? "text-white bg-white/[0.08]"
                        : "text-white/38"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Row 3: Search + Sort */}
              <div className="flex items-center gap-0 border-b border-white/[0.06]">
                {/* Search */}
                <div className="flex items-center flex-1 min-w-0 pl-3.5 pr-2 py-0">
                  <Search className="h-3.5 w-3.5 text-white/22 pointer-events-none shrink-0" />
                  <input
                    type="text"
                    placeholder="Search player…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent pl-2 pr-1 py-3 text-[13px] text-white placeholder:text-white/22 focus:outline-none"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="text-white/22 hover:text-white/55 shrink-0 p-1"
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {/* Divider */}
                <div className="w-px self-stretch bg-white/[0.06] shrink-0" aria-hidden />
                {/* Sort */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setSortOpen((v) => !v)}
                    className="flex items-center gap-1.5 px-3.5 py-3 text-[12px] font-medium text-white/50 whitespace-nowrap focus:outline-none"
                    aria-haspopup="listbox"
                    aria-expanded={sortOpen}
                  >
                    <span className="text-white/60">{sortButtonLabel(sortKey)}</span>
                    <ChevronDown className={`h-3 w-3 text-white/28 transition-transform ${sortOpen ? "rotate-180" : ""}`} />
                  </button>
                  {sortOpen && (
                    <SortDropdown
                      current={sortKey}
                      options={sortOptions(lens)}
                      onSelect={(k) => { setSortKey(k); setSortOpen(false); }}
                      onClose={() => setSortOpen(false)}
                    />
                  )}
                </div>
              </div>

              {/* Row 4: Viewing context */}
              {!playersLoading && selectedMatch && (
                <div className="px-3.5 py-2.5 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold text-white/20 uppercase tracking-widest shrink-0">Viewing</span>
                  <span className="text-[11px] text-white/40 truncate">{selectedMatch.match_label}</span>
                  <span className="text-white/15 text-[10px]">·</span>
                  <span className="text-[11px] text-white/30">{lens === "disposals" ? "Disposals" : "Goals"}</span>
                  {players.length > 0 && (
                    <>
                      <span className="text-white/15 text-[10px]">·</span>
                      <span className="text-[11px] text-white/25">{players.length} players</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Desktop controls — unchanged layout */}
            <div className="hidden sm:block space-y-2">
              {/* Row 1: stat toggle + position filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-0.5 rounded-lg bg-white/5 border border-white/8 p-0.5 shrink-0">
                  {(["disposals", "goals"] as StatLens[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => handleLensChange(l)}
                      className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                        lens === l
                          ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                          : "text-white/50 hover:text-white/80"
                      }`}
                    >
                      {l === "disposals" ? "Disposals" : "Goals"}
                    </button>
                  ))}
                </div>

                <div className="h-5 w-px bg-white/10 shrink-0" aria-hidden />

                <div className="flex gap-0.5 shrink-0 flex-wrap">
                  {POSITION_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setPositionFilter(key)}
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
                      onSelect={(k) => { setSortKey(k); setSortOpen(false); }}
                      onClose={() => setSortOpen(false)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Context row — desktop only (mobile uses the card row above) */}
          {!playersLoading && selectedMatch && (
            <div className="mb-3 sm:mb-5 hidden sm:flex items-center gap-1.5 flex-wrap text-[12px] text-white/48">
              <span className="text-white/30 text-[11px]">Viewing:</span>
              {[
                selectedMatch.match_label,
                lens === "disposals" ? "Disposals" : "Goals",
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

          {/* Locked banner */}
          {isLocked && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#F5C84C]/20 bg-[#F5C84C]/5 px-4 py-3.5">
              <Lock className="h-4 w-4 shrink-0 text-[#F5C84C] mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#F5C84C] leading-snug">Unlock full round</p>
                <p className="text-xs text-white/45 mt-0.5 leading-relaxed">
                  First 2 matches free. Upgrade to Neeko+ to view every match, projection, hit rate and trend.
                </p>
                <button
                  onClick={() => navigate("/neeko-plus")}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-[#F5C84C]/15 border border-[#F5C84C]/30 px-3.5 py-1.5 text-[11px] font-semibold text-[#F5C84C] hover:bg-[#F5C84C]/25 transition-colors"
                >
                  Upgrade to Neeko+
                </button>
              </div>
            </div>
          )}

          {/* Players error */}
          {playersError && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
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
              onResetPosition={() => setPositionFilter("ALL")}
              onResetSearch={() => setSearch("")}
              onResetAll={() => { setPositionFilter("ALL"); setSearch(""); }}
            />
          ) : (
            <div className="space-y-5 sm:space-y-8">
              <TeamBoard
                matchId={selectedMatch?.match_id ?? null}
                teamName={selectedMatch?.home_team_name ?? "Home"}
                opponentName={selectedMatch?.away_team_name ?? "Away"}
                players={homePlayers}
                lens={lens}
                thresholds={thresholds}
                defaultThreshold={threshold}
                isMatchLocked={isLocked}
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
            {(["disposals", "goals"] as StatLens[]).map((l) => (
              <button
                key={l}
                onClick={() => onLensChange(l)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  lens === l
                    ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                    : "text-white/45 hover:text-white/75"
                }`}
              >
                {l === "disposals" ? "Disp" : "Goals"}
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
  onResetPosition,
  onResetSearch,
  onResetAll,
}: {
  positionFilter: PositionFilter;
  search: string;
  lens: StatLens;
  onResetPosition: () => void;
  onResetSearch: () => void;
  onResetAll: () => void;
}) {
  const hasPosition = positionFilter !== "ALL";
  const hasSearch = search.trim().length > 0;
  const statLabel = lens === "disposals" ? "disposal" : "goal";

  const posLabel: Record<PositionFilter, string> = {
    ALL:  "player",
    MID:  "midfielder",
    DEF:  "defender",
    FWD:  "forward",
    RUCK: "ruck",
  };
  const pos = posLabel[positionFilter];

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

      {(hasPosition || hasSearch) && (
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
    ? `${TOP_N} of ${totalCount} shown`
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

  // ── Mobile layout — stacked cards ──
  if (isMobile) {
    return (
      <div className="w-full min-w-0">
        {teamHeader}
        <div className="flex flex-col gap-2 w-full min-w-0">
          {visiblePlayers.map((player) => (
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
        {showMoreBtn}
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
