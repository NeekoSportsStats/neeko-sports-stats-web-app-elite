import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Search, ChevronDown, Lock, Crown, Users, Shield } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { playerToSlug } from "@/lib/slugs";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import { PlayerStatusPill } from "@/features/afl/rankings/components/PlayerStatusPill";
import { signalFromField, formatEdgeSignalLabel, getEdgeSignalColor } from "@/utils/aflEdgeSignal";
import type { RankingRow } from "@/features/afl/rankings/components/types";

// ─── Team directory data ────────────────────────────────────────────────────

interface TeamEntry {
  // Display name shown on the card
  displayName: string;
  // Canonical DB name used to match against row.team_name / row.team
  dbName: string;
  slug: string;
  color: string;
}

const AFL_TEAMS: TeamEntry[] = [
  { displayName: "Adelaide Crows",           dbName: "Adelaide Crows",                slug: "adelaide-crows",            color: "#002B5C" },
  { displayName: "Brisbane Lions",           dbName: "Brisbane Lions",                slug: "brisbane-lions",            color: "#7C1C3B" },
  { displayName: "Carlton Blues",            dbName: "Carlton Blues",                 slug: "carlton-blues",             color: "#001489" },
  { displayName: "Collingwood Magpies",      dbName: "Collingwood Magpies",           slug: "collingwood-magpies",       color: "#2a2a2a" },
  { displayName: "Essendon Bombers",         dbName: "Essendon Bombers",              slug: "essendon-bombers",          color: "#CC0000" },
  { displayName: "Fremantle Dockers",        dbName: "Fremantle Dockers",             slug: "fremantle-dockers",         color: "#2F0066" },
  { displayName: "Geelong Cats",             dbName: "Geelong Cats",                  slug: "geelong-cats",              color: "#1C3D7C" },
  { displayName: "Gold Coast Suns",          dbName: "Gold Coast Suns",               slug: "gold-coast-suns",           color: "#D4782A" },
  { displayName: "GWS Giants",               dbName: "Greater Western Sydney Giants", slug: "gws-giants",                color: "#F15A22" },
  { displayName: "Hawthorn Hawks",           dbName: "Hawthorn Hawks",                slug: "hawthorn-hawks",            color: "#4D2004" },
  { displayName: "Melbourne Demons",         dbName: "Melbourne Demons",              slug: "melbourne-demons",          color: "#0C2340" },
  { displayName: "North Melbourne Kangaroos",dbName: "North Melbourne Kangaroos",     slug: "north-melbourne-kangaroos", color: "#0057B8" },
  { displayName: "Port Adelaide Power",      dbName: "Port Adelaide Power",           slug: "port-adelaide-power",       color: "#008A8F" },
  { displayName: "Richmond Tigers",          dbName: "Richmond Tigers",               slug: "richmond-tigers",           color: "#897000" },
  { displayName: "St Kilda Saints",          dbName: "St Kilda Saints",               slug: "st-kilda-saints",           color: "#ED1B2E" },
  { displayName: "Sydney Swans",             dbName: "Sydney Swans",                  slug: "sydney-swans",              color: "#E1251B" },
  { displayName: "West Coast Eagles",        dbName: "West Coast Eagles",             slug: "west-coast-eagles",         color: "#003087" },
  { displayName: "Western Bulldogs",         dbName: "Western Bulldogs",              slug: "western-bulldogs",          color: "#00205B" },
];

// ─── Position filter options ────────────────────────────────────────────────

const POSITIONS = [
  { code: "", label: "All Positions" },
  { code: "DEF", label: "Defenders" },
  { code: "MID", label: "Midfielders" },
  { code: "FWD", label: "Forwards" },
  { code: "RUC", label: "Rucks" },
];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// ─── Format helpers ─────────────────────────────────────────────────────────

function fmt(val: number | null | undefined, decimals = 0): string {
  if (val == null) return "—";
  return val.toFixed(decimals);
}

function fmtPrice(val: number | null | undefined): string {
  if (val == null || val === 0) return "—";
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(3)}M`;
  return `$${Math.floor(val / 1000)}K`;
}

function firstLetter(name: string): string {
  return (name?.[0] ?? "#").toUpperCase();
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function TeamCard({ team, playerCount }: { team: TeamEntry; playerCount?: number }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={`/sports/afl/teams/${team.slug}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "7px 11px",
        borderRadius: 7,
        background: hovered
          ? `linear-gradient(135deg, ${team.color}20 0%, rgba(255,255,255,0.03) 100%)`
          : "rgba(255,255,255,0.025)",
        border: hovered
          ? `1px solid ${team.color}44`
          : "1px solid rgba(255,255,255,0.055)",
        textDecoration: "none",
        transition: "all 0.14s ease",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: team.color,
            flexShrink: 0,
            opacity: hovered ? 1 : 0.75,
            transition: "opacity 0.14s ease",
          }}
        />
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: hovered ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.52)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          letterSpacing: "0.01em",
          transition: "color 0.14s ease",
        }}>
          {team.displayName}
        </span>
      </div>
      {playerCount != null && (
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          color: "rgba(255,255,255,0.20)",
          flexShrink: 0,
          letterSpacing: "0.02em",
        }}>
          {playerCount}
        </span>
      )}
    </Link>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AFLPlayersPage() {
  const { user, isPremium } = useAuth();

  const [rows, setRows]             = useState<RankingRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [search, setSearch]         = useState("");
  const [position, setPosition]     = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [sortBy, setSortBy]         = useState<"player_name" | "projection" | "price">("player_name");
  const [sortDir, setSortDir]       = useState<"asc" | "desc">("asc");

  const searchRef  = useRef<HTMLInputElement>(null);
  const letterRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const userId = user?.id ?? null;

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const { data, error: fetchErr } = await supabase.rpc("get_rankings_safe", {
        p_user_id: userId,
        p_is_bot: false,
        p_limit: 700,
      } as any);

      if (fetchErr) {
        setError("Failed to load players. Please try again.");
        setLoading(false);
        return;
      }

      const normalized = ((data as any[]) ?? []).map(mapRankingRow);
      setRows(normalized);
      setLoading(false);
    }
    load();
  }, [userId, isPremium]);

  const filtered = useMemo(() => {
    let out = rows;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(r => r.player_name.toLowerCase().includes(q));
    }

    if (position) {
      out = out.filter(r => r.position === position);
    }

    if (teamFilter) {
      out = out.filter(r => {
        const t = r.team_name ?? r.team ?? "";
        return t === teamFilter;
      });
    }

    out = [...out].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";

      if (sortBy === "player_name") {
        av = a.player_name ?? "";
        bv = b.player_name ?? "";
      } else if (sortBy === "projection") {
        av = a.projection ?? -Infinity;
        bv = b.projection ?? -Infinity;
      } else if (sortBy === "price") {
        av = a.price ?? -Infinity;
        bv = b.price ?? -Infinity;
      }

      let cmp = 0;
      if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv);
      } else {
        cmp = (av as number) < (bv as number) ? -1 : (av as number) > (bv as number) ? 1 : 0;
      }

      return sortDir === "asc" ? cmp : -cmp;
    });

    return out;
  }, [rows, search, position, teamFilter, sortBy, sortDir]);

  // A-Z nav is only active when showing the full unfiltered name-sorted list
  const isAlphaView = !search.trim() && !position && !teamFilter && sortBy === "player_name" && sortDir === "asc";

  // Letters that have at least one player in the current filtered set
  const availableLetters = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    filtered.forEach(r => set.add(firstLetter(r.player_name)));
    return set;
  }, [filtered]);

  const handleSort = useCallback((col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir(col === "player_name" ? "asc" : "desc");
    }
  }, [sortBy]);

  const handleLetterClick = useCallback((letter: string) => {
    const el = letterRefs.current[letter];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const totalCount = rows.length;

  // Count players per team from real loaded data
  const teamCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    rows.forEach(r => {
      const name = r.team_name ?? r.team ?? "";
      if (name) counts[name] = (counts[name] ?? 0) + 1;
    });
    return counts;
  }, [rows]);

  const pageUrl         = "https://neekostats.com.au/sports/afl/players";
  const pageTitle       = "AFL Fantasy Player Directory 2026 | Neeko Sports";
  const pageDescription = "Search every 2026 AFL Fantasy player by name, team or position. View basic player info for free, or unlock projections, signals and AI analysis with Neeko+.";

  const breadcrumbJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home",                       "item": "https://neekostats.com.au" },
      { "@type": "ListItem", "position": 2, "name": "AFL Fantasy Player Directory","item": pageUrl },
    ],
  });

  // Build grouped rows for alpha view — each entry is either a letter header or a player row
  type TableItem =
    | { kind: "header"; letter: string }
    | { kind: "player"; row: RankingRow; idx: number };

  const tableItems = useMemo<TableItem[]>(() => {
    if (!isAlphaView) {
      return filtered.map((row, idx) => ({ kind: "player", row, idx }));
    }
    const items: TableItem[] = [];
    let lastLetter = "";
    filtered.forEach((row, idx) => {
      const letter = firstLetter(row.player_name);
      if (letter !== lastLetter) {
        items.push({ kind: "header", letter });
        lastLetter = letter;
      }
      items.push({ kind: "player", row, idx });
    });
    return items;
  }, [filtered, isAlphaView]);

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={pageUrl} />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="Neeko Sports Stats" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
        <script type="application/ld+json">{breadcrumbJsonLd}</script>
      </Helmet>

      <div style={{
        minHeight: "100vh",
        background: "#080808",
        padding: "clamp(14px, 3vw, 40px) clamp(12px, 3vw, 28px)",
        maxWidth: 1080,
        width: "100%",
        margin: "0 auto",
        overflowX: "hidden",
        boxSizing: "border-box",
      }}>

        {/* ── Page header ───────────────────────────────────────────────── */}
        <div style={{ marginBottom: "clamp(14px, 3vw, 28px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Users size={14} style={{ color: "rgba(255,255,255,0.30)" }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.42em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)" }}>
              AFL Fantasy 2026
            </span>
          </div>
          <h1 style={{
            fontSize: "clamp(1.3rem, 3vw, 2.1rem)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            color: "#F5F5F5",
            margin: 0,
            lineHeight: 1.1,
          }}>
            AFL Fantasy Player Directory
          </h1>
          <p className="plyr-desc-hide" style={{
            marginTop: 7,
            fontSize: 13,
            color: "rgba(255,255,255,0.38)",
            lineHeight: 1.5,
            maxWidth: 580,
          }}>
            Search every 2026 AFL Fantasy player by name, team or position. View basic player info for free, or unlock projections, signals and AI analysis with Neeko+.
          </p>
        </div>

        {/* ── Teams grid ────────────────────────────────────────────────── */}
        <section style={{ marginBottom: "clamp(14px, 3vw, 28px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <Shield size={11} style={{ color: "rgba(255,255,255,0.22)" }} />
            <h2 style={{ margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.36em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)" }}>
              Browse by Team
            </h2>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: 4,
            width: "100%",
            boxSizing: "border-box",
          }}>
            {AFL_TEAMS.map(team => (
              <TeamCard
                key={team.slug}
                team={team}
                playerCount={loading ? undefined : teamCounts[team.dbName]}
              />
            ))}
          </div>
        </section>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginBottom: "clamp(14px, 3vw, 28px)" }} />

        {/* ── Player directory header ────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Users size={13} style={{ color: "rgba(255,255,255,0.30)" }} />
          <h2 style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(255,255,255,0.30)" }}>
            Player Directory
          </h2>
          {!loading && (
            <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.22)", fontWeight: 500 }}>
              {filtered.length} of {totalCount} players
            </span>
          )}
        </div>

        {/* ── Filters row ───────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, alignItems: "center" }}>
          {/* Search — full width on mobile */}
          <div style={{ position: "relative", flex: "1 1 160px", minWidth: 0, maxWidth: 320 }}>
            <Search size={12} style={{
              position: "absolute", left: 10, top: "50%",
              transform: "translateY(-50%)", color: "rgba(255,255,255,0.30)", pointerEvents: "none",
            }} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search players..."
              style={{
                width: "100%", paddingLeft: 29, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 8, fontSize: 12.5, color: "#fff", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Position filter */}
          <div style={{ position: "relative", flexShrink: 0, minWidth: 0 }}>
            <select
              value={position}
              onChange={e => setPosition(e.target.value)}
              style={{
                appearance: "none", WebkitAppearance: "none",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 8, color: position ? "#fff" : "rgba(255,255,255,0.45)",
                fontSize: 12, fontWeight: 600, padding: "7px 26px 7px 10px", cursor: "pointer", outline: "none",
                maxWidth: 140, minWidth: 0, boxSizing: "border-box",
              }}
            >
              {POSITIONS.map(p => (
                <option key={p.code} value={p.code} style={{ background: "#111", color: "#fff" }}>{p.label}</option>
              ))}
            </select>
            <ChevronDown size={11} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
          </div>

          {/* Team filter */}
          <div style={{ position: "relative", flexShrink: 0, minWidth: 0 }}>
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              style={{
                appearance: "none", WebkitAppearance: "none",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 8, color: teamFilter ? "#fff" : "rgba(255,255,255,0.45)",
                fontSize: 12, fontWeight: 600, padding: "7px 26px 7px 10px", cursor: "pointer",
                outline: "none", maxWidth: 120, minWidth: 0, boxSizing: "border-box",
              }}
            >
              <option value="" style={{ background: "#111", color: "#fff" }}>All Teams</option>
              {AFL_TEAMS.map(t => (
                <option key={t.slug} value={t.dbName} style={{ background: "#111", color: "#fff" }}>{t.displayName}</option>
              ))}
            </select>
            <ChevronDown size={11} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
          </div>

          {/* Clear filters */}
          {(search || position || teamFilter) && (
            <button
              onClick={() => { setSearch(""); setPosition(""); setTeamFilter(""); }}
              style={{
                background: "none", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8,
                color: "rgba(255,255,255,0.40)", fontSize: 11.5, fontWeight: 600,
                padding: "7px 10px", cursor: "pointer", flexShrink: 0,
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* ── A–Z navigation bar ───────────────────────────────────────────── */}
        {!loading && isAlphaView && (
          <div style={{
            overflowX: "auto",
            WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
            scrollbarWidth: "none",
            marginBottom: 10,
            paddingBottom: 2,
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
          }}>
            <div style={{
              display: "flex",
              gap: 2,
              minWidth: "max-content",
              padding: "4px 0",
            }}>
              {ALPHABET.map(letter => {
                const active = availableLetters.has(letter);
                return (
                  <button
                    key={letter}
                    onClick={() => active && handleLetterClick(letter)}
                    disabled={!active}
                    style={{
                      width: 25,
                      height: 25,
                      borderRadius: 6,
                      border: active
                        ? "1px solid rgba(255,255,255,0.12)"
                        : "1px solid rgba(255,255,255,0.04)",
                      background: active ? "rgba(255,255,255,0.06)" : "transparent",
                      color: active ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.15)",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      cursor: active ? "pointer" : "default",
                      transition: "all 0.12s ease",
                      flexShrink: 0,
                      lineHeight: 1,
                      padding: 0,
                    }}
                    onMouseEnter={e => {
                      if (!active) return;
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,200,76,0.12)";
                      (e.currentTarget as HTMLButtonElement).style.color = "#F5C84C";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(245,200,76,0.30)";
                    }}
                    onMouseLeave={e => {
                      if (!active) return;
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
                      (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.65)";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.12)";
                    }}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Freemium banner (free users) ─────────────────────────────── */}
        {!isPremium && !loading && totalCount > 0 && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px",
            borderRadius: 8, background: "rgba(245,200,76,0.06)", border: "1px solid rgba(245,200,76,0.18)",
            marginBottom: 10,
          }}>
            <Crown size={12} style={{ color: "#F5C84C", flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.50)", lineHeight: 1.4 }}>
              Showing 2026 season averages.{" "}
              <Link to="/neeko-plus" style={{ color: "#F5C84C", textDecoration: "none", fontWeight: 700 }}>
                Upgrade to Neeko+
              </Link>{" "}
              to unlock round projections, signals and AI analysis for all {totalCount}+ players.
            </p>
          </div>
        )}

        {/* ── Error state ────────────────────────────────────────────────── */}
        {error && (
          <div style={{ padding: "20px 0", textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* ── Loading skeleton ───────────────────────────────────────────── */}
        {loading && (
          <div style={{ overflow: "hidden", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    {[90, 60, 30, 44, 36, 50].map((w, j) => (
                      <td key={j} style={{ padding: "12px 12px" }}>
                        <div style={{ width: w, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.06)", animation: "pulse 1.5s ease-in-out infinite" }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Player table ───────────────────────────────────────────────── */}
        {!loading && !error && (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", width: "100%", boxSizing: "border-box" }}>
            <style>{`
              /* ── Mobile: convert table rows to flex layout ── */
              @media (max-width: 539px) {
                /* Hide table structure so rows can be flex */
                .plyr-table { display: block !important; width: 100% !important; }
                .plyr-table thead { display: none !important; }
                .plyr-table tbody { display: block !important; width: 100% !important; }
                .plyr-table colgroup { display: none !important; }

                /* Letter-header rows stay block/full-width */
                .plyr-letter-row { display: block !important; width: 100% !important; }
                .plyr-letter-cell { display: block !important; width: 100% !important; box-sizing: border-box !important; }

                /* Player rows become flex */
                .plyr-player-row {
                  display: flex !important;
                  align-items: center !important;
                  width: 100% !important;
                  box-sizing: border-box !important;
                  padding: 8px 12px !important;
                  gap: 8px !important;
                }
                /* Left: player name block — takes all remaining space */
                .plyr-td-player {
                  display: block !important;
                  flex: 1 1 0% !important;
                  min-width: 0 !important;
                  padding: 0 !important;
                }
                /* Right: stats cluster — shrinks to content, never wraps */
                .plyr-td-stats {
                  display: flex !important;
                  align-items: center !important;
                  gap: 10px !important;
                  flex-shrink: 0 !important;
                  padding: 0 !important;
                }
                /* Hide desktop-only cells on mobile */
                .plyr-col-team, .plyr-col-pos { display: none !important; }

                /* CTA row */
                .plyr-cta-row { display: block !important; width: 100% !important; }
                .plyr-cta-cell { display: block !important; width: 100% !important; box-sizing: border-box !important; }

                /* Empty state */
                .plyr-empty-row { display: block !important; width: 100% !important; }
                .plyr-empty-cell { display: block !important; width: 100% !important; box-sizing: border-box !important; }
              }
              /* ── Desktop: mobile-only helpers hidden ── */
              @media (min-width: 540px) {
                .plyr-mobile-sub { display: none; }
              }

              /* ── Tablet (540–767px): hide team, keep pos ── */
              @media (min-width: 540px) and (max-width: 767px) {
                .plyr-col-team { display: none !important; }
              }
            `}</style>
            {/*
              tableLayout: fixed + explicit col widths give each column stable, non-collapsing width.
              min-width on the table prevents the player column from being squeezed below a readable size.
              The outer div has overflow-x: auto so the table can scroll horizontally on narrow viewports
              instead of compressing all columns together.

              Column sizing:
                PLAYER  — minmax equivalent: fills remaining space, min 220px
                TEAM    — 160px (fits longest team name "North Melbourne Kangaroos" truncated)
                POS     — 52px  (3-char code, centered)
                PRICE   — 90px  (e.g. "$1.042M", right-aligned)
                PROJ    — 72px  (2–3 digit number, centered)
                SIGNAL  — 96px  (label text like "MUST START", right-aligned)
            */}
            <table className="plyr-table" style={{ width: "100%", minWidth: 620, borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                {/* PLAYER — absorbs all remaining space after fixed columns */}
                <col style={{ width: "auto", minWidth: 220 }} />
                {/* TEAM — wide enough for long names with ellipsis */}
                <col className="plyr-col-team" style={{ width: 160 }} />
                {/* POS */}
                <col className="plyr-col-pos" style={{ width: 52 }} />
                {/* PRICE */}
                <col style={{ width: 90 }} />
                {/* PROJ / AVG */}
                <col style={{ width: 72 }} />
                {/* SIGNAL */}
                <col style={{ width: 96 }} />
              </colgroup>
              {/* Sticky header — hidden on mobile via CSS */}
              <thead>
                <tr style={{ background: "rgba(18,18,18,1)", borderBottom: "1px solid rgba(255,255,255,0.08)", position: "sticky", top: 0, zIndex: 2 }}>
                  <SortTh
                    label="Player"
                    col="player_name"
                    current={sortBy}
                    dir={sortDir}
                    onClick={handleSort}
                    style={{ textAlign: "left", paddingLeft: 12 }}
                  />
                  <th style={{ ...thStyle, overflow: "hidden" }} className="plyr-col-team">Team</th>
                  <th style={{ ...thStyle, textAlign: "center" }} className="plyr-col-pos">Pos</th>
                  <SortTh label="Price" col="price" current={sortBy} dir={sortDir} onClick={handleSort} style={{ textAlign: "right", paddingRight: 12 }} />
                  {isPremium ? (
                    <SortTh label="Proj." col="projection" current={sortBy} dir={sortDir} onClick={handleSort} style={{ textAlign: "right", paddingRight: 12 }} />
                  ) : (
                    <th style={{ ...thStyle, textAlign: "right", paddingRight: 12 }}>Avg</th>
                  )}
                  <th style={{ ...thStyle, textAlign: "right", paddingRight: 14 }}>
                    {isPremium ? "Signal" : (
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                        Signal <Lock size={10} style={{ color: "rgba(245,200,76,0.55)" }} />
                      </span>
                    )}
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 && (
                  <tr className="plyr-empty-row">
                    <td colSpan={6} className="plyr-empty-cell" style={{ padding: "32px 16px", textAlign: "center", color: "rgba(255,255,255,0.28)", fontSize: 13 }}>
                      No players match your filters.
                    </td>
                  </tr>
                )}

                {tableItems.map((item) => {
                  if (item.kind === "header") {
                    return (
                      <tr
                        key={`header-${item.letter}`}
                        className="plyr-letter-row"
                        ref={el => { letterRefs.current[item.letter] = el; }}
                        style={{ background: "rgba(255,255,255,0.02)" }}
                      >
                        <td
                          colSpan={6}
                          className="plyr-letter-cell"
                          style={{
                            padding: "5px 12px 4px",
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing: "0.12em",
                            color: "rgba(255,255,255,0.30)",
                            textTransform: "uppercase",
                            borderTop: "1px solid rgba(255,255,255,0.06)",
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}
                        >
                          {item.letter}
                        </td>
                      </tr>
                    );
                  }

                  const { row, idx } = item;
                  const slug      = playerToSlug(row.player_name, row.team_name ?? row.team);
                  const teamShort = AFL_TEAMS.find(t => t.dbName === (row.team_name ?? row.team))?.displayName
                                 ?? (row.team_name ?? row.team ?? "—");
                  const teamMini  = (row.team_name ?? row.team ?? "").split(" ")[0] || teamShort;

                  const signalVal   = isPremium ? signalFromField(row.signal ?? null) : null;
                  const signalColor = isPremium && signalVal ? getEdgeSignalColor(signalVal) : "transparent";
                  const signalLabel = isPremium && signalVal ? formatEdgeSignalLabel(signalVal) : null;

                  return (
                    <tr
                      key={row.player_id ?? `row-${idx}`}
                      className="plyr-player-row"
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        transition: "background 0.12s ease",
                        cursor: "pointer",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* LEFT: Player name + sub-line */}
                      <td className="plyr-td-player" style={{ padding: "7px 8px 7px 12px", overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
                          <Link
                            to={`/sports/afl/players/${slug}`}
                            style={{
                              fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.88)",
                              textDecoration: "none", overflow: "hidden",
                              textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "0.005em",
                              flexShrink: 1, minWidth: 0,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
                            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.88)")}
                          >
                            {row.player_name}
                          </Link>
                          <PlayerStatusPill row={row} showUpcomingBye />
                        </div>
                        <div
                          className="plyr-mobile-sub"
                          style={{ marginTop: 2, fontSize: 10.5, color: "rgba(255,255,255,0.32)", fontWeight: 500 }}
                        >
                          {teamMini}{row.position ? ` · ${row.position}` : ""}
                        </div>
                      </td>

                      {/* Team — desktop only; ellipsis on overflow */}
                      <td
                        className="plyr-col-team"
                        style={{ padding: "7px 8px", overflow: "hidden", maxWidth: 160 }}
                      >
                        <span style={{
                          fontSize: 11.5, color: "rgba(255,255,255,0.40)", fontWeight: 500,
                          display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {teamShort}
                        </span>
                      </td>

                      {/* Position — centered, fixed width */}
                      <td className="plyr-col-pos" style={{ padding: "7px 4px", textAlign: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "rgba(255,255,255,0.38)" }}>
                          {row.position ?? "—"}
                        </span>
                      </td>

                      {/* Price — right-aligned, no wrap */}
                      <td className="plyr-td-stats" style={{ padding: "7px 12px 7px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.62)" }}>
                          {fmtPrice(row.price)}
                        </span>
                      </td>

                      {/* Avg / Proj — right-aligned, no wrap */}
                      {isPremium ? (
                        <td className="plyr-td-stats" style={{ padding: "7px 12px 7px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <span style={{
                            fontSize: 13, fontWeight: 700,
                            color: row.projection != null ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.25)",
                          }}>
                            {fmt(row.projection)}
                          </span>
                        </td>
                      ) : (
                        <td className="plyr-td-stats" style={{ padding: "7px 12px 7px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {row.season_avg != null ? (
                            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.68)" }}>
                              {fmt(row.season_avg)}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.22)" }}>—</span>
                          )}
                        </td>
                      )}

                      {/* Signal — right-aligned, no wrap */}
                      <td className="plyr-td-stats" style={{ padding: "7px 14px 7px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {isPremium ? (
                          signalLabel && row.signal != null ? (
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", color: signalColor }}>
                              {signalLabel}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.18)" }}>—</span>
                          )
                        ) : (
                          <Link
                            to="/neeko-plus"
                            title="Unlock signals with Neeko+"
                            style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 4,
                              fontSize: 10, fontWeight: 600, color: "rgba(245,200,76,0.45)",
                              textDecoration: "none", letterSpacing: "0.02em",
                            }}
                          >
                            <Lock size={9} style={{ flexShrink: 0 }} />
                            Neeko+
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* Upgrade CTA row */}
                {!isPremium && (
                  <tr className="plyr-cta-row" style={{ background: "rgba(245,200,76,0.03)" }}>
                    <td colSpan={6} className="plyr-cta-cell" style={{ padding: "14px", textAlign: "center" }}>
                      <Link
                        to="/neeko-plus"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 7,
                          fontSize: 12, fontWeight: 700, color: "#F5C84C", textDecoration: "none",
                          padding: "9px 18px", borderRadius: 8,
                          background: "rgba(245,200,76,0.10)", border: "1px solid rgba(245,200,76,0.22)",
                        }}
                      >
                        <Crown size={13} /> Unlock projections, signals &amp; AI with Neeko+
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Position quick links ──────────────────────────────────────── */}
        {!loading && (
          <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[
              { label: "Defenders", slug: "def" },
              { label: "Midfielders", slug: "mid" },
              { label: "Forwards", slug: "fwd" },
              { label: "Rucks", slug: "ruck" },
            ].map(pos => (
              <Link
                key={pos.slug}
                to={`/sports/afl/positions/${pos.slug}`}
                style={{
                  fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.35)",
                  textDecoration: "none", padding: "6px 12px", borderRadius: 7,
                  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)",
                  transition: "all 0.15s ease", letterSpacing: "0.02em",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.72)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.16)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.35)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
                }}
              >
                All {pos.label} →
              </Link>
            ))}
          </div>
        )}
      </div>

      <style>{`
        input::placeholder { color: rgba(255,255,255,0.28); }
        input:focus { border-color: rgba(255,255,255,0.22) !important; }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.3; }
        }
        @media (max-width: 539px) {
          .plyr-desc-hide { display: none; }
        }
      `}</style>
    </>
  );
}

// ─── Sort column header ──────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.28)",
  textAlign: "left",
  whiteSpace: "nowrap",
};

function SortTh({
  label, col, current, dir, onClick, style: extraStyle,
}: {
  label: string;
  col: "player_name" | "projection" | "price";
  current: string;
  dir: "asc" | "desc";
  onClick: (col: "player_name" | "projection" | "price") => void;
  style?: React.CSSProperties;
}) {
  const active = current === col;
  return (
    <th
      onClick={() => onClick(col)}
      style={{
        ...thStyle,
        cursor: "pointer",
        userSelect: "none",
        color: active ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.28)",
        ...extraStyle,
      }}
    >
      {label}
      {active && (
        <span style={{ marginLeft: 4, fontSize: 9 }}>
          {dir === "asc" ? "↑" : "↓"}
        </span>
      )}
    </th>
  );
}
