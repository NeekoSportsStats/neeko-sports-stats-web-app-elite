import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Shield, Users, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { TEAM_SLUGS } from "@/lib/slugs";
import { getTeamAccentColour } from "@/config/aflTeamColours";

// ─── Team registry (derived from canonical slug map — no duplication) ─────────

interface TeamMeta {
  displayName: string;
  abbr: string;
  slug: string;
  dbName: string;
  color: string;
}

const ABBR_MAP: Record<string, string> = {
  "Adelaide Crows":                "ADEL",
  "Brisbane Lions":                "BL",
  "Carlton Blues":                 "CARL",
  "Collingwood Magpies":           "COLL",
  "Essendon Bombers":              "ESS",
  "Fremantle Dockers":             "FRE",
  "Geelong Cats":                  "GEEL",
  "Gold Coast Suns":               "GCS",
  "Greater Western Sydney Giants": "GWS",
  "Hawthorn Hawks":                "HAW",
  "Melbourne Demons":              "MELB",
  "North Melbourne Kangaroos":     "NMK",
  "Port Adelaide Power":           "PORT",
  "Richmond Tigers":               "RICH",
  "St Kilda Saints":               "STK",
  "Sydney Swans":                  "SYD",
  "West Coast Eagles":             "WCE",
  "Western Bulldogs":              "WB",
};

// Display-friendly short names for cards (avoids "Greater Western Sydney Giants" overflowing)
const DISPLAY_NAME_MAP: Record<string, string> = {
  "Greater Western Sydney Giants": "GWS Giants",
  "North Melbourne Kangaroos":     "North Melbourne Kangaroos",
};

function buildTeamList(): TeamMeta[] {
  return Object.entries(TEAM_SLUGS)
    .map(([dbName, slug]) => {
      const displayName = DISPLAY_NAME_MAP[dbName] ?? dbName;
      const firstWord   = dbName.split(" ")[0];
      const color       = getTeamAccentColour(firstWord) ?? getTeamAccentColour(dbName) ?? "#444";
      return {
        displayName,
        abbr: ABBR_MAP[dbName] ?? slug.split("-")[0].toUpperCase().slice(0, 4),
        slug,
        dbName,
        color: color === "#1A1A1A" ? "#3a3a3a" : color, // Collingwood: lighten slightly for strip
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

const AFL_TEAMS: TeamMeta[] = buildTeamList();

// ─── Stats helpers ────────────────────────────────────────────────────────────

interface TeamStats { total: number; byPosition: Partial<Record<string, number>> }

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

  // Safe accent — Richmond yellow is too low-contrast for text, use a muted version
  const accentText = team.color === "#FFD200" ? "#C9A800" : team.color;

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
          ? `1px solid ${team.color}80`
          : "1px solid rgba(255,255,255,0.08)",
        background: hovered
          ? `linear-gradient(140deg, ${team.color}22 0%, rgba(255,255,255,0.03) 100%)`
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
      <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>

        {/* Top row — name + abbr badge */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{
              margin: 0,
              fontSize: 12.5,
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
                margin: "2px 0 0",
                fontSize: 10.5,
                color: "rgba(255,255,255,0.30)",
                fontWeight: 500,
              }}>
                {stats!.total} players
              </p>
            )}
          </div>
          <span style={{
            flexShrink: 0,
            fontSize: 8.5,
            fontWeight: 800,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: hovered ? "rgba(255,255,255,0.50)" : "rgba(255,255,255,0.22)",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 4,
            padding: "2px 5px",
            transition: "color 0.18s ease",
            marginTop: 1,
            whiteSpace: "nowrap",
          }}>
            {team.abbr}
          </span>
        </div>

        {/* Position breakdown — grid of 2 cols on mobile, wrap on desktop */}
        {posCounts.length > 0 && (
          <div className="tdir-pos-grid" style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {posCounts.map(({ pos, n }) => (
              <span key={pos} style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}>
                <span style={{
                  fontSize: 8.5,
                  fontWeight: 800,
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.35)",
                }}>
                  {pos}
                </span>
                <span style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.58)",
                }}>
                  {n}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* CTA row — hidden on mobile */}
        <div className="tdir-cta-row" style={{
          marginTop: "auto",
          display: "flex",
          alignItems: "center",
          gap: 4,
          paddingTop: 2,
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: hovered ? `${accentText}ff` : "rgba(255,255,255,0.42)",
            letterSpacing: "0.01em",
            transition: "color 0.18s ease",
          }}>
            View team
          </span>
          <ArrowRight
            size={10}
            style={{
              color: hovered ? `${accentText}ee` : "rgba(255,255,255,0.32)",
              transition: "color 0.18s ease, transform 0.18s ease",
              transform: hovered ? "translateX(3px)" : "translateX(0)",
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
      <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 12, width: "72%", borderRadius: 4, background: "rgba(255,255,255,0.08)", animation: "nbpulse 1.5s ease-in-out infinite" }} />
            <div style={{ height: 9, width: "30%", borderRadius: 3, background: "rgba(255,255,255,0.05)", marginTop: 4, animation: "nbpulse 1.5s ease-in-out infinite" }} />
          </div>
          <div style={{ height: 18, width: 32, borderRadius: 4, background: "rgba(255,255,255,0.05)", animation: "nbpulse 1.5s ease-in-out infinite" }} />
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {[30, 30, 28, 30].map((w, i) => (
            <div key={i} style={{ height: 19, width: w, borderRadius: 4, background: "rgba(255,255,255,0.05)", animation: "nbpulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
        <div className="tdir-cta-row" style={{ height: 10, width: 55, borderRadius: 3, background: "rgba(255,255,255,0.04)", animation: "nbpulse 1.5s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AFLTeamsDirectoryPage() {
  const [rows, setRows]       = useState<RankingRow[]>([]);
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
  const pageTitle = "AFL Fantasy Team Directory | Neeko Sports Stats";
  const pageDesc  = "Browse every AFL Fantasy team, view team rosters and jump into player breakdowns, projections and fantasy signals with Neeko Sports Stats.";

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
        <meta property="og:site_name" content="Neeko Sports Stats" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDesc} />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home",                                                item: "https://neekostats.com.au" },
            { "@type": "ListItem", position: 2, name: "AFL Fantasy Team Directory | Neeko Sports Stats",     item: pageUrl },
          ],
        })}</script>
      </Helmet>

      <div style={{
        minHeight: "100vh",
        background: "#080808",
        padding: "clamp(14px, 3vw, 40px) clamp(12px, 3vw, 28px)",
        maxWidth: 1120,
        width: "100%",
        margin: "0 auto",
        overflowX: "hidden",
        boxSizing: "border-box",
      }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: "clamp(16px, 3vw, 32px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <Shield size={12} style={{ color: "rgba(255,255,255,0.22)" }} />
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.44em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            }}>
              AFL Fantasy 2026
            </span>
          </div>
          <h1 style={{
            fontSize: "clamp(1.3rem, 3vw, 2rem)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            color: "#F0F0F0",
            margin: 0,
            lineHeight: 1.1,
          }}>
            AFL Fantasy Team Directory
          </h1>
          <p className="tdir-desc-hide" style={{
            marginTop: 8,
            fontSize: 13,
            color: "rgba(255,255,255,0.36)",
            lineHeight: 1.55,
            maxWidth: 560,
          }}>
            Browse every AFL team, view roster counts and jump into team pages for player breakdowns, projections and fantasy signals.
          </p>
          {!loading && rows.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <Users size={11} style={{ color: "rgba(255,255,255,0.20)" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.24)", fontWeight: 500 }}>
                {rows.length} players tracked across {AFL_TEAMS.length} teams
              </span>
            </div>
          )}
        </div>

        {/* ── Grid ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 8,
          width: "100%",
          boxSizing: "border-box",
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

      </div>

      <style>{`
        @keyframes nbpulse {
          0%, 100% { opacity: 0.65; }
          50%       { opacity: 0.30; }
        }
        @media (max-width: 539px) {
          .tdir-desc-hide { display: none !important; }
          .tdir-cta-row { display: none !important; }
        }
      `}</style>
    </>
  );
}
