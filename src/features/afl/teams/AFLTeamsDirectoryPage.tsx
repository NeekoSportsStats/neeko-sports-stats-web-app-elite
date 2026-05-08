import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Shield, Users, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import type { RankingRow } from "@/features/afl/rankings/components/types";

// ─── Team registry ────────────────────────────────────────────────────────────

interface TeamMeta {
  displayName: string;
  abbr: string;
  dbName: string;
  slug: string;
  color: string;
}

const AFL_TEAMS: TeamMeta[] = [
  { displayName: "Adelaide Crows",            abbr: "ADEL", dbName: "Adelaide Crows",                slug: "adelaide-crows",            color: "#002B5C" },
  { displayName: "Brisbane Lions",            abbr: "BL",   dbName: "Brisbane Lions",                slug: "brisbane-lions",            color: "#7C1C3B" },
  { displayName: "Carlton Blues",             abbr: "CARL", dbName: "Carlton Blues",                 slug: "carlton-blues",             color: "#1a2e6e" },
  { displayName: "Collingwood Magpies",       abbr: "COLL", dbName: "Collingwood Magpies",           slug: "collingwood-magpies",       color: "#3a3a3a" },
  { displayName: "Essendon Bombers",          abbr: "ESS",  dbName: "Essendon Bombers",              slug: "essendon-bombers",          color: "#CC0000" },
  { displayName: "Fremantle Dockers",         abbr: "FRE",  dbName: "Fremantle Dockers",             slug: "fremantle-dockers",         color: "#4a2080" },
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

// ─── Stats helpers ────────────────────────────────────────────────────────────

interface TeamStats {
  total: number;
  byPosition: Partial<Record<string, number>>;
}

const POS_ORDER = ["DEF", "MID", "RUC", "FWD"] as const;

function computeTeamStats(rows: RankingRow[]): Record<string, TeamStats> {
  const out: Record<string, TeamStats> = {};
  for (const r of rows) {
    const key = r.team_name ?? r.team ?? "";
    if (!key) continue;
    if (!out[key]) out[key] = { total: 0, byPosition: {} };
    out[key].total++;
    const pos = r.position ?? "";
    if (pos) out[key].byPosition[pos] = (out[key].byPosition[pos] ?? 0) + 1;
  }
  return out;
}

// ─── Team card ────────────────────────────────────────────────────────────────

function TeamCard({ team, stats }: { team: TeamMeta; stats?: TeamStats }) {
  const [hovered, setHovered] = useState(false);

  const posCounts = POS_ORDER
    .map(pos => ({ pos, n: stats?.byPosition[pos] ?? 0 }))
    .filter(({ n }) => n > 0);

  const hasCount = stats != null && stats.total > 0;

  return (
    <Link
      to={`/sports/afl/teams/${team.slug}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: 10,
        border: hovered
          ? `1px solid ${team.color}55`
          : "1px solid rgba(255,255,255,0.07)",
        background: hovered
          ? `linear-gradient(140deg, ${team.color}18 0%, rgba(255,255,255,0.02) 100%)`
          : "rgba(255,255,255,0.03)",
        textDecoration: "none",
        transition: "border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease",
        boxShadow: hovered ? `0 4px 24px ${team.color}22` : "none",
        cursor: "pointer",
      }}
    >
      {/* Colour strip */}
      <div style={{
        height: 3,
        background: team.color,
        opacity: hovered ? 0.85 : 0.45,
        transition: "opacity 0.18s ease",
        flexShrink: 0,
      }} />

      {/* Card body */}
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>

        {/* Top row — name + abbr badge */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{
              margin: 0,
              fontSize: 13.5,
              fontWeight: 700,
              color: hovered ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.76)",
              letterSpacing: "-0.01em",
              lineHeight: 1.25,
              transition: "color 0.18s ease",
              wordBreak: "break-word",
            }}>
              {team.displayName}
            </p>
            {hasCount && (
              <p style={{
                margin: "4px 0 0",
                fontSize: 11,
                color: "rgba(255,255,255,0.30)",
                fontWeight: 500,
              }}>
                {stats!.total} players
              </p>
            )}
          </div>
          <span style={{
            flexShrink: 0,
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: hovered ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.22)",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 5,
            padding: "3px 7px",
            transition: "color 0.18s ease",
            marginTop: 1,
          }}>
            {team.abbr}
          </span>
        </div>

        {/* Position breakdown */}
        {posCounts.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {posCounts.map(({ pos, n }) => (
              <span key={pos} style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 5,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}>
                <span style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.38)",
                }}>
                  {pos}
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.60)",
                }}>
                  {n}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* CTA row */}
        <div style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          gap: 4,
          paddingTop: posCounts.length > 0 ? 4 : 0,
        }}>
          <span style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: hovered ? `${team.color === "#3a3a3a" ? "#aaa" : team.color}cc` : "rgba(255,255,255,0.22)",
            letterSpacing: "0.01em",
            transition: "color 0.18s ease",
          }}>
            View team
          </span>
          <ArrowRight
            size={11}
            style={{
              color: hovered ? `${team.color === "#3a3a3a" ? "#aaa" : team.color}bb` : "rgba(255,255,255,0.16)",
              transition: "color 0.18s ease, transform 0.18s ease",
              transform: hovered ? "translateX(2px)" : "translateX(0)",
            }}
          />
        </div>
      </div>
    </Link>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.06)",
      background: "rgba(255,255,255,0.02)",
      overflow: "hidden",
    }}>
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)" }} />
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 13, width: "72%", borderRadius: 4, background: "rgba(255,255,255,0.08)", animation: "nbpulse 1.5s ease-in-out infinite" }} />
            <div style={{ height: 10, width: "30%", borderRadius: 3, background: "rgba(255,255,255,0.05)", marginTop: 6, animation: "nbpulse 1.5s ease-in-out infinite" }} />
          </div>
          <div style={{ height: 20, width: 38, borderRadius: 5, background: "rgba(255,255,255,0.05)", animation: "nbpulse 1.5s ease-in-out infinite" }} />
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {[34, 34, 32, 34].map((w, i) => (
            <div key={i} style={{ height: 22, width: w, borderRadius: 5, background: "rgba(255,255,255,0.05)", animation: "nbpulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
        <div style={{ height: 11, width: 60, borderRadius: 3, background: "rgba(255,255,255,0.04)", animation: "nbpulse 1.5s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AFLTeamsDirectoryPage() {
  const [rows, setRows]     = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_rankings_safe", {
        p_user_id: null,
        p_is_bot: false,
        p_limit: 700,
      } as any);
      setRows(((data as any[]) ?? []).map(mapRankingRow));
      setLoading(false);
    })();
  }, []);

  const teamStats = useMemo(() => computeTeamStats(rows), [rows]);

  const pageUrl   = "https://neekostats.com.au/sports/afl/teams";
  const pageTitle = "AFL Fantasy Team Directory 2026 | Neeko Sports";
  const pageDesc  = "Browse every AFL team, view roster counts and jump into team pages for player breakdowns, projections and fantasy signals.";

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
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home",                      item: "https://neekostats.com.au" },
            { "@type": "ListItem", position: 2, name: "AFL Fantasy Team Directory", item: pageUrl },
          ],
        })}</script>
      </Helmet>

      <div style={{
        minHeight: "100vh",
        background: "#080808",
        padding: "clamp(20px, 3vw, 40px) clamp(12px, 3vw, 28px)",
        maxWidth: 1120,
        margin: "0 auto",
      }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <Shield size={13} style={{ color: "rgba(255,255,255,0.22)" }} />
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.44em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            }}>
              AFL Fantasy 2026
            </span>
          </div>
          <h1 style={{
            fontSize: "clamp(1.45rem, 3vw, 2rem)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            color: "#F0F0F0",
            margin: 0,
            lineHeight: 1.1,
          }}>
            AFL Fantasy Team Directory
          </h1>
          <p style={{
            marginTop: 9,
            fontSize: 13.5,
            color: "rgba(255,255,255,0.36)",
            lineHeight: 1.55,
            maxWidth: 560,
          }}>
            Browse every AFL team, view roster counts and jump into team pages for player breakdowns, projections and fantasy signals.
          </p>
          {!loading && rows.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 5 }}>
              <Users size={11} style={{ color: "rgba(255,255,255,0.20)" }} />
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.24)", fontWeight: 500 }}>
                {rows.length} players tracked across {AFL_TEAMS.length} teams
              </span>
            </div>
          )}
        </div>

        {/* ── Grid ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
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

        {/* ── Footer links ── */}
        {!loading && (
          <div style={{ marginTop: 44, paddingTop: 22, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{
              margin: "0 0 11px",
              fontSize: 10, fontWeight: 800, letterSpacing: "0.40em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.18)",
            }}>
              Browse by Position
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {[
                { label: "Defenders",   slug: "def"  },
                { label: "Midfielders", slug: "mid"  },
                { label: "Forwards",    slug: "fwd"  },
                { label: "Rucks",       slug: "ruck" },
              ].map(({ label, slug }) => (
                <FooterLink key={slug} to={`/sports/afl/positions/${slug}`} label={`All ${label}`} />
              ))}
              <FooterLink to="/sports/afl/players" label="Player Directory" />
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes nbpulse {
          0%, 100% { opacity: 0.65; }
          50%       { opacity: 0.30; }
        }
      `}</style>
    </>
  );
}

function FooterLink({ to, label }: { to: string; label: string }) {
  const [hov, setHov] = useState(false);
  return (
    <Link
      to={to}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontSize: 12, fontWeight: 600,
        color: hov ? "rgba(255,255,255,0.68)" : "rgba(255,255,255,0.28)",
        textDecoration: "none",
        padding: "7px 13px",
        borderRadius: 7,
        border: hov ? "1px solid rgba(255,255,255,0.13)" : "1px solid rgba(255,255,255,0.07)",
        background: hov ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
        transition: "all 0.15s ease",
        letterSpacing: "0.01em",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {label}
      <ArrowRight size={10} style={{ opacity: hov ? 0.7 : 0.35, transition: "opacity 0.15s ease" }} />
    </Link>
  );
}
