import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Shield, Users, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import type { RankingRow } from "@/features/afl/rankings/components/types";

// ─── Team registry ────────────────────────────────────────────────────────────

interface TeamMeta {
  displayName: string;
  abbr: string;
  // Canonical DB name to match against row.team_name / row.team
  dbName: string;
  slug: string;
  color: string;
}

const AFL_TEAMS: TeamMeta[] = [
  { displayName: "Adelaide Crows",            abbr: "ADEL", dbName: "Adelaide Crows",                slug: "adelaide-crows",            color: "#002B5C" },
  { displayName: "Brisbane Lions",            abbr: "BL",   dbName: "Brisbane Lions",                slug: "brisbane-lions",            color: "#7C1C3B" },
  { displayName: "Carlton Blues",             abbr: "CARL", dbName: "Carlton Blues",                 slug: "carlton-blues",             color: "#001489" },
  { displayName: "Collingwood Magpies",       abbr: "COLL", dbName: "Collingwood Magpies",           slug: "collingwood-magpies",       color: "#2a2a2a" },
  { displayName: "Essendon Bombers",          abbr: "ESS",  dbName: "Essendon Bombers",              slug: "essendon-bombers",          color: "#CC0000" },
  { displayName: "Fremantle Dockers",         abbr: "FRE",  dbName: "Fremantle Dockers",             slug: "fremantle-dockers",         color: "#2F0066" },
  { displayName: "Geelong Cats",              abbr: "GEEL", dbName: "Geelong Cats",                  slug: "geelong-cats",              color: "#1C3D7C" },
  { displayName: "Gold Coast Suns",           abbr: "GC",   dbName: "Gold Coast Suns",               slug: "gold-coast-suns",           color: "#D4782A" },
  { displayName: "GWS Giants",                abbr: "GWS",  dbName: "Greater Western Sydney Giants", slug: "gws-giants",                color: "#F15A22" },
  { displayName: "Hawthorn Hawks",            abbr: "HAW",  dbName: "Hawthorn Hawks",                slug: "hawthorn-hawks",            color: "#4D2004" },
  { displayName: "Melbourne Demons",          abbr: "MELB", dbName: "Melbourne Demons",              slug: "melbourne-demons",          color: "#0C2340" },
  { displayName: "North Melbourne Kangaroos", abbr: "NM",   dbName: "North Melbourne Kangaroos",     slug: "north-melbourne-kangaroos", color: "#0057B8" },
  { displayName: "Port Adelaide Power",       abbr: "PORT", dbName: "Port Adelaide Power",           slug: "port-adelaide-power",       color: "#008A8F" },
  { displayName: "Richmond Tigers",           abbr: "RICH", dbName: "Richmond Tigers",               slug: "richmond-tigers",           color: "#897000" },
  { displayName: "St Kilda Saints",           abbr: "STK",  dbName: "St Kilda Saints",               slug: "st-kilda-saints",           color: "#ED1B2E" },
  { displayName: "Sydney Swans",              abbr: "SYD",  dbName: "Sydney Swans",                  slug: "sydney-swans",              color: "#E1251B" },
  { displayName: "West Coast Eagles",         abbr: "WCE",  dbName: "West Coast Eagles",             slug: "west-coast-eagles",         color: "#003087" },
  { displayName: "Western Bulldogs",          abbr: "WB",   dbName: "Western Bulldogs",              slug: "western-bulldogs",          color: "#00205B" },
];

// ─── Per-team computed stats ──────────────────────────────────────────────────

interface TeamStats {
  total: number;
  byPosition: Record<string, number>;
}

function computeTeamStats(rows: RankingRow[]): Record<string, TeamStats> {
  const out: Record<string, TeamStats> = {};
  for (const r of rows) {
    const key = r.team_name ?? r.team ?? "";
    if (!key) continue;
    if (!out[key]) out[key] = { total: 0, byPosition: {} };
    out[key].total++;
    const pos = r.position ?? "Other";
    out[key].byPosition[pos] = (out[key].byPosition[pos] ?? 0) + 1;
  }
  return out;
}

const POSITIONS_ORDER = ["DEF", "MID", "RUC", "FWD"];

// ─── Team card ────────────────────────────────────────────────────────────────

function TeamCard({ team, stats }: { team: TeamMeta; stats?: TeamStats }) {
  const [hovered, setHovered] = useState(false);

  const positionChips = POSITIONS_ORDER
    .filter(pos => (stats?.byPosition[pos] ?? 0) > 0)
    .map(pos => ({ pos, count: stats!.byPosition[pos] }));

  return (
    <Link
      to={`/sports/afl/teams/${team.slug}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "16px 18px",
        borderRadius: 10,
        background: hovered
          ? `linear-gradient(135deg, ${team.color}22 0%, rgba(255,255,255,0.04) 100%)`
          : "rgba(255,255,255,0.03)",
        border: hovered
          ? `1px solid ${team.color}50`
          : "1px solid rgba(255,255,255,0.07)",
        textDecoration: "none",
        transition: "all 0.15s ease",
        minWidth: 0,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: team.color,
            flexShrink: 0,
            opacity: hovered ? 1 : 0.80,
            transition: "opacity 0.15s ease",
          }} />
          <div style={{ minWidth: 0 }}>
            <p style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              color: hovered ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.78)",
              letterSpacing: "0.005em",
              lineHeight: 1.2,
              transition: "color 0.15s ease",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {team.displayName}
            </p>
            <p style={{
              margin: "2px 0 0",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.10em",
              color: "rgba(255,255,255,0.22)",
              textTransform: "uppercase",
            }}>
              {team.abbr}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {stats != null && (
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(255,255,255,0.35)",
              letterSpacing: "0.02em",
            }}>
              {stats.total}
            </span>
          )}
          <ChevronRight
            size={12}
            style={{
              color: hovered ? `${team.color}cc` : "rgba(255,255,255,0.18)",
              transition: "color 0.15s ease",
            }}
          />
        </div>
      </div>

      {/* Position breakdown */}
      {positionChips.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {positionChips.map(({ pos, count }) => (
            <span
              key={pos}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "2px 7px",
                borderRadius: 4,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.07)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: "rgba(255,255,255,0.38)",
                textTransform: "uppercase",
              }}
            >
              {pos}
              <span style={{ color: "rgba(255,255,255,0.22)", fontWeight: 500 }}>{count}</span>
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

// ─── Loading skeleton card ────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      padding: "16px 18px",
      borderRadius: 10,
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.06)",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: "70%", height: 11, borderRadius: 4, background: "rgba(255,255,255,0.08)", animation: "pulse 1.5s ease-in-out infinite" }} />
          <div style={{ width: "30%", height: 8, borderRadius: 3, background: "rgba(255,255,255,0.05)", marginTop: 4, animation: "pulse 1.5s ease-in-out infinite" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        {[32, 28, 28, 28].map((w, i) => (
          <div key={i} style={{ width: w, height: 18, borderRadius: 4, background: "rgba(255,255,255,0.05)", animation: "pulse 1.5s ease-in-out infinite" }} />
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AFLTeamsDirectoryPage() {
  const [rows, setRows]   = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Use the same public-safe RPC as the players page — no auth needed for team counts
      const { data } = await supabase.rpc("get_rankings_safe", {
        p_user_id: null,
        p_is_bot: false,
        p_limit: 700,
      } as any);
      const normalized = ((data as any[]) ?? []).map(mapRankingRow);
      setRows(normalized);
      setLoading(false);
    }
    load();
  }, []);

  const teamStats = useMemo(() => computeTeamStats(rows), [rows]);

  const pageUrl   = "https://neekostats.com.au/sports/afl/teams";
  const pageTitle = "AFL Fantasy Team Directory 2026 | Neeko Sports";
  const pageDesc  = "Browse every AFL team, view roster counts and jump into team pages for player breakdowns, projections and fantasy signals.";

  const breadcrumbJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home",                      item: "https://neekostats.com.au" },
      { "@type": "ListItem", position: 2, name: "AFL Fantasy Team Directory", item: pageUrl },
    ],
  });

  const totalPlayers = rows.length;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDesc} />
        <link rel="canonical" href={pageUrl} />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:site_name" content="Neeko Sports" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDesc} />
        <script type="application/ld+json">{breadcrumbJsonLd}</script>
      </Helmet>

      <div style={{
        minHeight: "100vh",
        background: "#080808",
        padding: "clamp(20px, 3vw, 40px) clamp(12px, 3vw, 28px)",
        maxWidth: 1080,
        margin: "0 auto",
      }}>

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Shield size={15} style={{ color: "rgba(255,255,255,0.28)" }} />
            <span style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: "0.42em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.26)",
            }}>
              AFL Fantasy 2026
            </span>
          </div>
          <h1 style={{
            fontSize: "clamp(1.5rem, 3vw, 2.1rem)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            color: "#F5F5F5",
            margin: 0,
            lineHeight: 1.1,
          }}>
            AFL Fantasy Team Directory
          </h1>
          <p style={{
            marginTop: 8,
            fontSize: 13.5,
            color: "rgba(255,255,255,0.38)",
            lineHeight: 1.5,
            maxWidth: 580,
          }}>
            Browse every AFL team, view roster counts and jump into team pages for player breakdowns, projections and fantasy signals.
          </p>

          {!loading && totalPlayers > 0 && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <Users size={12} style={{ color: "rgba(255,255,255,0.22)" }} />
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.28)", fontWeight: 500 }}>
                {totalPlayers} players across {AFL_TEAMS.length} teams
              </span>
            </div>
          )}
        </div>

        {/* ── Teams grid ──────────────────────────────────────────────── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 10,
        }}>
          {loading
            ? AFL_TEAMS.map(t => <SkeletonCard key={t.slug} />)
            : AFL_TEAMS.map(team => (
                <TeamCard
                  key={team.slug}
                  team={team}
                  stats={teamStats[team.dbName]}
                />
              ))
          }
        </div>

        {/* ── Footer quick links ──────────────────────────────────────── */}
        {!loading && (
          <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ margin: "0 0 12px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.36em", textTransform: "uppercase", color: "rgba(255,255,255,0.20)" }}>
              Browse by Position
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
                    fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.32)",
                    textDecoration: "none", padding: "7px 14px", borderRadius: 7,
                    border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.025)",
                    transition: "all 0.15s ease", letterSpacing: "0.02em",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.70)";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.14)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.32)";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)";
                  }}
                >
                  All {pos.label} →
                </Link>
              ))}
              <Link
                to="/sports/afl/players"
                style={{
                  fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.32)",
                  textDecoration: "none", padding: "7px 14px", borderRadius: 7,
                  border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.025)",
                  transition: "all 0.15s ease", letterSpacing: "0.02em",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.70)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.14)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.32)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)";
                }}
              >
                Player Directory →
              </Link>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </>
  );
}
