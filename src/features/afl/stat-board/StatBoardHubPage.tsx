import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Users, ChartBar as BarChart2, Swords, ArrowRight, Lock, CircleCheck as CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { StatBoardMatch, StatBoardPlayer } from "./types";

const SEASON = 2026;

// ── Confidence colours ──────────────────────────────────────────────────────

function confidenceStyle(label: string | null) {
  if (label === "HIGH") return { color: "#4ade80", bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.22)" };
  if (label === "MEDIUM") return { color: "#fbbf24", bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.22)" };
  return { color: "rgba(255,255,255,0.38)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.12)" };
}

// ── Mini live preview ───────────────────────────────────────────────────────

function LivePreview() {
  const [players, setPlayers] = useState<StatBoardPlayer[]>([]);
  const [matchLabel, setMatchLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    supabase
      .rpc("get_stat_board_matches", { p_season: SEASON, p_round: null })
      .then(({ data: matchData }) => {
        const matches = (matchData as StatBoardMatch[]) ?? [];
        const freeMatch = matches.find((m) => m.is_free_match) ?? matches[0] ?? null;
        if (!freeMatch) { setLoading(false); return; }

        setMatchLabel(freeMatch.match_label);

        return supabase.rpc("get_stat_board_players", {
          p_season: SEASON,
          p_round: null,
          p_match_id: freeMatch.match_id,
          p_lens: "disposals",
          p_threshold: 20,
          p_limit: 5,
          p_offset: 0,
        });
      })
      .then((res) => {
        if (res) {
          setPlayers((res.data as StatBoardPlayer[]) ?? []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{
        background: "rgba(6,8,12,0.92)",
        border: "1px solid rgba(224,174,45,0.22)",
        borderRadius: 16,
        padding: "20px 20px 16px",
        boxShadow: "0 0 0 1px rgba(224,174,45,0.06) inset, 0 12px 48px rgba(0,0,0,0.65), 0 0 32px rgba(224,174,45,0.06)",
      }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{
            height: 36, borderRadius: 6, marginBottom: 8,
            background: "linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.4s ease-in-out infinite",
          }} />
        ))}
        <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div style={{
        background: "rgba(6,8,12,0.92)",
        border: "1px solid rgba(224,174,45,0.22)",
        borderRadius: 16,
        padding: "32px 20px",
        boxShadow: "0 0 0 1px rgba(224,174,45,0.06) inset, 0 12px 48px rgba(0,0,0,0.65), 0 0 32px rgba(224,174,45,0.06)",
        textAlign: "center",
      }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>
          Player data will appear here once the round begins.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: "rgba(6,8,12,0.92)",
      border: "1px solid rgba(224,174,45,0.22)",
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: "0 0 0 1px rgba(224,174,45,0.06) inset, 0 12px 48px rgba(0,0,0,0.65), 0 0 32px rgba(224,174,45,0.06)",
    }}>
      {/* Preview header */}
      <div style={{
        padding: "12px 16px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}>
        <div>
          <p style={{ margin: "0 0 2px", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(224,174,45,0.75)" }}>
            Live Stat Board Preview
          </p>
          <p style={{ margin: 0, fontSize: 9, fontWeight: 500, letterSpacing: "0.10em", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>
            {matchLabel ? `${matchLabel} · Disposals · 20+ threshold` : "Disposals · 20+ threshold · current round"}
          </p>
        </div>
        <div style={{
          fontSize: 9.5, fontWeight: 700,
          color: "rgba(34,197,94,0.75)",
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.16)",
          borderRadius: 5,
          padding: "2px 8px",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}>
          Free match
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 56px 56px 70px",
        padding: "6px 16px",
        gap: 4,
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        {["Player", "Proj", "Hit/10", "Confidence"].map(h => (
          <span key={h} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)" }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      {players.map((p, i) => {
        const conf = confidenceStyle(p.confidence_label);
        const hitRate = p.hit_rate_last_10 != null ? Math.round(p.hit_rate_last_10 * 100) : null;
        return (
          <div key={p.player_id} style={{
            display: "grid",
            gridTemplateColumns: "1fr 56px 56px 70px",
            padding: "9px 16px",
            gap: 4,
            alignItems: "center",
            borderBottom: i < players.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)",
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: "#f0f0f0", lineHeight: 1.2 }}>{p.player_name}</p>
              <p style={{ margin: 0, fontSize: 10.5, color: "rgba(255,255,255,0.42)" }}>{p.team_name}</p>
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#E0AE2D", letterSpacing: "-0.01em" }}>
              {p.projection != null ? p.projection : "—"}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: hitRate != null && hitRate >= 60 ? "#4ade80" : hitRate != null && hitRate >= 40 ? "#fcd34d" : "rgba(255,255,255,0.48)" }}>
              {hitRate != null ? `${hitRate}%` : "—"}
            </span>
            <span style={{
              fontSize: 9.5, fontWeight: 800, letterSpacing: "0.05em",
              color: conf.color,
              background: conf.bg,
              border: `1px solid ${conf.border}`,
              borderRadius: 5,
              padding: "2px 6px",
              textTransform: "uppercase",
              display: "inline-block",
              whiteSpace: "nowrap",
            }}>
              {p.confidence_label ?? "—"}
            </span>
          </div>
        );
      })}

      {/* Footer CTA */}
      <Link
        to="/stat-board/players"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "11px 16px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
          color: "rgba(255,255,255,0.60)",
          fontSize: 12, fontWeight: 700,
          textDecoration: "none",
          letterSpacing: "0.02em",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
          (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.88)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)";
          (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.60)";
        }}
      >
        Open full Stat Board <ArrowRight size={12} />
      </Link>
    </div>
  );
}

// ── How it works ────────────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  { num: "1", text: "Pick a match from the current round." },
  { num: "2", text: "Choose disposals or goals as your stat lens." },
  { num: "3", text: "See last 10, hit rate, projection and confidence for every player." },
];

// ── Mode cards ──────────────────────────────────────────────────────────────

interface ModeCard {
  icon: React.ReactNode;
  title: string;
  status: "available" | "coming-soon";
  copy: string;
  href?: string;
}

const MODES: ModeCard[] = [
  {
    icon: <Users size={18} />,
    title: "Player Stats",
    status: "available",
    copy: "Filter by match, stat lens and threshold. View hit rates, projections and last-10 trends for every player.",
    href: "/stat-board/players",
  },
  {
    icon: <BarChart2 size={18} />,
    title: "Team Stats",
    status: "coming-soon",
    copy: "Team totals, scoring trends and match stat projections by position group.",
  },
  {
    icon: <Swords size={18} />,
    title: "Match Centre",
    status: "coming-soon",
    copy: "Game-by-game summaries, team comparisons and top performer stat trends.",
  },
];

// ── Main component ───────────────────────────────────────────────────────────

export default function StatBoardHubPage() {
  const [heroHovered, setHeroHovered] = useState(false);

  return (
    <>
      <Helmet>
        <title>AFL Stat Board | Neeko Sports Stats</title>
        <meta name="description" content="Explore AFL player stat trends, hit rates and projections by upcoming match." />
      </Helmet>

      <div style={{ minHeight: "100vh", background: "#05070A", color: "#fff" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "clamp(32px,4vw,56px) clamp(16px,4vw,32px) clamp(40px,5vw,72px)" }}>

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <div style={{ marginBottom: "clamp(28px,3.5vw,44px)" }}>
            <p style={{
              fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
              textTransform: "uppercase",
              color: "rgba(34,197,94,0.65)",
              margin: "0 0 10px",
            }}>
              Stat Board
            </p>
            <h1 style={{
              fontSize: "clamp(1.7rem, 3.2vw, 2.4rem)",
              fontWeight: 900, letterSpacing: "-0.03em",
              color: "#F5F5F5", lineHeight: 1.15,
              margin: "0 0 12px",
            }}>
              Choose how you want<br />to read the round.
            </h1>
            <p style={{
              fontSize: "clamp(13px, 1vw, 15px)",
              color: "rgba(255,255,255,0.50)",
              maxWidth: 460,
              lineHeight: 1.6,
              margin: "0 0 20px",
            }}>
              Start with Player Stats to explore AFL hit rates, projections and trends by match.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Link
                to="/stat-board/players"
                onMouseEnter={() => setHeroHovered(true)}
                onMouseLeave={() => setHeroHovered(false)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "12px 22px",
                  borderRadius: 10,
                  background: heroHovered
                    ? "linear-gradient(160deg, #fad52a 0%, #e09600 100%)"
                    : "linear-gradient(160deg, #f0c81a 0%, #d08800 100%)",
                  color: "#130c00",
                  fontSize: 13.5, fontWeight: 900,
                  textDecoration: "none",
                  letterSpacing: "0.01em",
                  boxShadow: heroHovered
                    ? "0 6px 28px rgba(224,174,45,0.40)"
                    : "0 4px 18px rgba(224,174,45,0.22)",
                  transition: "all 0.15s ease",
                }}
              >
                Open Player Stat Board <ArrowRight size={14} />
              </Link>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", margin: 0 }}>
                Disposals and goals available now.
              </p>
            </div>
          </div>

          {/* ── Live preview ──────────────────────────────────────────────── */}
          <div style={{ marginBottom: "clamp(28px,3.5vw,44px)" }}>
            <LivePreview />
          </div>

          {/* ── Mode cards ────────────────────────────────────────────────── */}
          <div style={{ marginBottom: "clamp(28px,3.5vw,44px)" }}>
            <p style={{
              fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.35)",
              margin: "0 0 14px",
            }}>
              Views
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {MODES.map((mode) => <ModeTile key={mode.title} mode={mode} />)}
            </div>
          </div>

          {/* ── How it works ──────────────────────────────────────────────── */}
          <div style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 14,
            padding: "18px 20px",
          }}>
            <p style={{
              fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.32)",
              margin: "0 0 14px",
            }}>
              How it works
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {HOW_IT_WORKS.map(({ num, text }) => (
                <div key={num} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: "rgba(34,197,94,0.08)",
                    border: "1px solid rgba(34,197,94,0.20)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 10, fontWeight: 900, color: "rgba(34,197,94,0.75)",
                    marginTop: 1,
                  }}>
                    {num}
                  </div>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", lineHeight: 1.5, margin: 0 }}>
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

// ── Mode tile ────────────────────────────────────────────────────────────────

function ModeTile({ mode }: { mode: ModeCard }) {
  const [hovered, setHovered] = useState(false);
  const isAvailable = mode.status === "available";

  const inner = (
    <div
      onMouseEnter={() => isAvailable && setHovered(true)}
      onMouseLeave={() => isAvailable && setHovered(false)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 14,
        padding: "16px 18px",
        borderRadius: 14,
        border: isAvailable
          ? `1px solid ${hovered ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)"}`
          : "1px solid rgba(255,255,255,0.06)",
        background: isAvailable
          ? (hovered ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.025)")
          : "rgba(255,255,255,0.015)",
        opacity: isAvailable ? 1 : 0.55,
        transition: "all 0.15s ease",
        cursor: isAvailable ? "pointer" : "default",
      }}
    >
      {/* Icon */}
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: isAvailable ? "rgba(34,197,94,0.10)" : "rgba(255,255,255,0.05)",
        border: isAvailable ? "1px solid rgba(34,197,94,0.20)" : "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: isAvailable ? "#4ade80" : "rgba(255,255,255,0.25)",
      }}>
        {mode.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: isAvailable ? "#ECECEC" : "rgba(255,255,255,0.45)", letterSpacing: "-0.01em" }}>
            {mode.title}
          </span>
          {isAvailable ? (
            <span style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "rgba(34,197,94,0.80)",
              background: "rgba(34,197,94,0.10)",
              border: "1px solid rgba(34,197,94,0.20)",
              borderRadius: 5, padding: "2px 7px",
            }}>
              Available
            </span>
          ) : (
            <span style={{
              fontSize: 9.5, fontWeight: 600, letterSpacing: "0.04em",
              color: "rgba(255,255,255,0.28)",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 5, padding: "2px 7px",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}>
              <Lock size={8} /> Coming soon
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: isAvailable ? "rgba(255,255,255,0.48)" : "rgba(255,255,255,0.28)", lineHeight: 1.5 }}>
          {mode.copy}
        </p>
      </div>

      {/* Arrow */}
      <div style={{ flexShrink: 0, alignSelf: "center" }}>
        <ArrowRight size={15} style={{ color: isAvailable ? (hovered ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.28)") : "rgba(255,255,255,0.10)", transition: "color 0.15s" }} />
      </div>
    </div>
  );

  if (isAvailable && mode.href) {
    return (
      <Link to={mode.href} style={{ textDecoration: "none" }} aria-label={`Open ${mode.title}`}>
        {inner}
      </Link>
    );
  }

  return <div aria-label={`${mode.title} — coming soon`}>{inner}</div>;
}
