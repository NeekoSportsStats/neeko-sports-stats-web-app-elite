import { Link } from "react-router-dom";
import { useRef, useState, useCallback, useEffect } from "react";
import { ArrowRight, ChevronRight, ChartBar as BarChart2Icon, Target, Zap, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { StatBoardPlayer, StatBoardMatch } from "@/features/afl/stat-board/types";

interface Props {
  isPremium: boolean;
}

// ── Live Stat Board preview (same data as desktop) ────────────────────────────

function MobileStatBoardPreviewRow({ player }: { player: StatBoardPlayer }) {
  const hitData = player.all_threshold_hit_rates?.["20"] ?? player.all_threshold_hit_rates?.["1"];
  const hitPct = hitData ? hitData.rate : player.hit_rate_last_10 != null ? Math.round(player.hit_rate_last_10 * 100) : null;
  const hitFrac = hitData ? `${hitData.hits}/${hitData.games}` : null;
  const proj = player.projection;

  const confColor =
    player.confidence_label === "HIGH" ? "#4ade80"
    : player.confidence_label === "MEDIUM" ? "#fcd34d"
    : "rgba(255,255,255,0.42)";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 58px 58px 52px",
      gap: 6,
      alignItems: "center",
      padding: "9px 12px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: "#f0f0f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {player.player_name}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 9.5, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
          {player.team_name}
          {player.position_group && (
            <span style={{ marginLeft: 5, background: "rgba(255,255,255,0.09)", padding: "1px 4px", borderRadius: 3, color: "rgba(255,255,255,0.52)" }}>
              {player.position_group}
            </span>
          )}
        </p>
      </div>

      <div style={{ textAlign: "right" }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#f5f5f5", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {proj != null ? proj : "—"}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 8.5, color: "rgba(255,255,255,0.35)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Proj</p>
      </div>

      <div style={{ textAlign: "right" }}>
        {hitFrac ? (
          <>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#f0f0f0", fontVariantNumeric: "tabular-nums" }}>{hitFrac}</p>
            {hitPct != null && (
              <p style={{ margin: "2px 0 0", fontSize: 9.5, color: hitPct >= 70 ? "#4ade80" : hitPct >= 50 ? "#fcd34d" : "rgba(255,255,255,0.42)", fontWeight: 600 }}>
                {hitPct}%
              </p>
            )}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.28)" }}>—</p>
        )}
        <p style={{ margin: "2px 0 0", fontSize: 8.5, color: "rgba(255,255,255,0.35)", letterSpacing: "0.04em", textTransform: "uppercase" }}>20+</p>
      </div>

      <div style={{ textAlign: "right" }}>
        {player.confidence_label ? (
          <span style={{
            display: "inline-block",
            fontSize: 8.5, fontWeight: 700,
            color: confColor,
            background: `${confColor}18`,
            border: `1px solid ${confColor}35`,
            padding: "2px 5px",
            borderRadius: 999,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}>
            {player.confidence_label}
          </span>
        ) : (
          <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 10 }}>—</span>
        )}
      </div>
    </div>
  );
}

function MobileStatBoardPreview() {
  const [players, setPlayers] = useState<StatBoardPlayer[]>([]);
  const [match, setMatch] = useState<StatBoardMatch | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    (async () => {
      const { data: matchData } = await supabase.rpc("get_stat_board_matches", { p_season: 2026, p_round: null });
      const matches = (matchData as StatBoardMatch[] | null) ?? [];
      const freeMatch = matches.find((m) => m.is_free_match) ?? matches[0] ?? null;
      if (!freeMatch) { setLoading(false); return; }
      setMatch(freeMatch);

      const { data: playerData } = await supabase.rpc("get_stat_board_players", {
        p_season: 2026,
        p_round: null,
        p_match_id: freeMatch.match_id,
        p_lens: "disposals",
        p_threshold: 20,
        p_limit: 6,
        p_offset: 0,
      });
      const rows = (playerData as StatBoardPlayer[] | null) ?? [];
      setPlayers(rows.filter(p => p.projection != null).slice(0, 5));
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ height: 50, background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.04)" }} />
        ))}
      </div>
    );
  }

  if (players.length === 0) return null;

  return (
    <div style={{
      borderRadius: 12,
      border: "1px solid rgba(34,197,94,0.22)",
      overflow: "hidden",
      background: "rgba(6,8,12,0.92)",
    }}>
      {/* Table header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 58px 58px 52px",
        gap: 6,
        padding: "7px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.04)",
      }}>
        <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {match?.match_label ?? "Player"}
        </span>
        <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "right" }}>Proj</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "right" }}>Hit rate</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "right" }}>Form</span>
      </div>
      {players.map(p => (
        <MobileStatBoardPreviewRow key={p.player_id} player={p} />
      ))}
      <Link
        to="/stat-board/players"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          padding: "10px 12px",
          fontSize: 11.5, fontWeight: 700,
          color: "rgba(255,255,255,0.58)",
          textDecoration: "none",
          background: "rgba(255,255,255,0.04)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        Open full Stat Board <ChevronRight size={11} />
      </Link>
    </div>
  );
}

// ── How it works cards ────────────────────────────────────────────────────────

const HOW_STEPS = [
  { num: "01", icon: <BarChart2Icon size={14} />, title: "Pick a match", copy: "Choose any fixture from the current round." },
  { num: "02", icon: <Target size={14} />, title: "Choose a stat", copy: "Disposals, goals — set your threshold." },
  { num: "03", icon: <Zap size={14} />, title: "See the trend", copy: "Last 10, hit rate, projection and form." },
] as const;

const TRUST_ITEMS = [
  "Updated before every round lockout",
  "600+ players tracked weekly",
  "Disposals, goals and more",
  "Plan your round in 30 seconds",
];

// ── Sticky dot indicators for preview ────────────────────────────────────────

function SectionDivider({ from, to }: { from: string; to: string }) {
  return (
    <div style={{
      position: "relative",
      height: 24,
      background: `linear-gradient(to bottom, ${from}, ${to})`,
      pointerEvents: "none",
    }} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MobileLanding({ isPremium }: Props) {
  const [activeSection, setActiveSection] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const NAV_SECTIONS = [
    { label: "Stat Board", id: "section-preview" },
    { label: "How it Works", id: "section-how" },
    { label: "Stats Available", id: "section-stats" },
    { label: "Why It Works", id: "section-trust" },
  ] as const;

  useEffect(() => {
    const sectionIds = NAV_SECTIONS.map(s => s.id);
    const observers: IntersectionObserver[] = [];

    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach(o => o.disconnect());
  }, []);

  return (
    <div style={{ background: "#0a0908", overflowX: "hidden", paddingBottom: isPremium ? 0 : 0 }}>

      {/* ─── HERO ─── */}
      <section style={{
        position: "relative",
        background: "linear-gradient(160deg, #080c0a 0%, #060806 100%)",
        padding: "28px 16px 0",
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)", width: 320, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,197,94,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(34,197,94,0.70)", marginBottom: 8 }}>
            AFL Stat Board
          </p>
          <h1 style={{
            fontSize: "clamp(1.55rem, 7vw, 1.9rem)",
            fontWeight: 900, lineHeight: 1.10, letterSpacing: "-0.028em",
            color: "#ffffff", marginBottom: 10,
          }}>
            Find AFL players most likely to{" "}
            <span style={{ color: "#22c55e" }}>hit key stats</span>{" "}
            this round.
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", lineHeight: 1.55, maxWidth: 310, margin: "0 auto 20px" }}>
            Pick a match, choose a stat, and view recent form, hit rates, projections and trends in seconds.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
            <Link to="/stat-board/players" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "linear-gradient(160deg, #22c55e 0%, #16a34a 100%)",
              color: "#f0fff4", fontWeight: 900, fontSize: 15,
              padding: "14px 20px", borderRadius: 10, textDecoration: "none",
              boxShadow: "0 4px 24px rgba(34,197,94,0.28)",
              minHeight: 50, letterSpacing: "0.01em",
            }}>
              Open Stat Board <ArrowRight size={15} />
            </Link>
            <Link to="/stat-board/match-centre" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.72)", fontWeight: 700, fontSize: 13.5,
              padding: "12px 20px", borderRadius: 10, textDecoration: "none", minHeight: 44,
            }}>
              Match Centre
            </Link>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", paddingBottom: 20 }}>
            {["Updated weekly", "Real AFL data", "30-sec picks"].map(t => (
              <span key={t} style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: "rgba(34,197,94,0.55)", fontSize: 8 }}>•</span> {t}
              </span>
            ))}
          </div>
        </div>

        {/* Live preview label */}
        <div style={{ position: "relative", zIndex: 2, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
            <span className="live-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block", flexShrink: 0 }} />
            <p style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(34,197,94,0.65)", margin: 0 }}>
              Live Stat Board Preview
            </p>
          </div>
          <p style={{ textAlign: "center", fontSize: 9, color: "rgba(255,255,255,0.30)", marginBottom: 12, letterSpacing: "0.10em", textTransform: "uppercase" }}>
            Disposals · 20+ threshold · current round
          </p>
          <MobileStatBoardPreview />
          <div style={{ height: 20 }} />
        </div>
      </section>

      {/* ─── SECTION BREAK: hero → nav ─── */}
      <SectionDivider from="#060806" to="#0c0b09" />

      {/* ─── STICKY SECTION NAV ─── */}
      <div style={{
        background: "#0c0b09",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        overflowX: "auto", scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
        position: "sticky", top: 0, zIndex: 90,
      }}>
        <div style={{ display: "flex", gap: 6, padding: "10px 16px", minWidth: "max-content" }}>
          {NAV_SECTIONS.map(({ label, id }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "7px 13px", borderRadius: 999,
                  fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                  minHeight: 34,
                  background: isActive ? "rgba(34,197,94,0.10)" : "rgba(255,255,255,0.04)",
                  border: isActive ? "1px solid rgba(34,197,94,0.28)" : "1px solid rgba(255,255,255,0.07)",
                  color: isActive ? "#4ade80" : "rgba(255,255,255,0.42)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  outline: "none",
                }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <SectionDivider from="#0c0b09" to="#0a0908" />

      {/* ─── LIVE PREVIEW SECTION ─── */}
      <section id="section-preview" style={{ background: "#0a0908", padding: "28px 16px 36px" }}>
        <div style={{ marginBottom: 20, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span className="live-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "#22c55e", margin: 0, opacity: 0.75 }}>Live data</p>
          </div>
          <h2 style={{ fontSize: "1.35rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F0F0F0", lineHeight: 1.15, margin: 0 }}>
            Player Stat Board
          </h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", marginTop: 6, lineHeight: 1.5 }}>
            Hit rates, projections and form — updated every round
          </p>
        </div>
        <MobileStatBoardPreview />
        <div style={{ marginTop: 14 }}>
          <Link to="/stat-board/players" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            background: "linear-gradient(160deg, #22c55e 0%, #16a34a 100%)",
            color: "#f0fff4", fontWeight: 900, fontSize: 14,
            padding: "14px 20px", borderRadius: 10, textDecoration: "none",
            boxShadow: "0 4px 18px rgba(34,197,94,0.25)", minHeight: 50,
          }}>
            Open Stat Board <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      <SectionDivider from="#0a0908" to="#0f0e0c" />

      {/* ─── HOW IT WORKS ─── */}
      <section id="section-how" style={{ background: "#0f0e0c", padding: "28px 16px 36px" }}>
        <div style={{ marginBottom: 22, textAlign: "center" }}>
          <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(34,197,94,0.55)", marginBottom: 8 }}>How it works</p>
          <h2 style={{ fontSize: "1.35rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F0F0F0", lineHeight: 1.15 }}>
            Three steps to every player trend
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {HOW_STEPS.map(({ num, icon, title, copy }) => (
            <div key={num} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 14, padding: "15px 14px",
              display: "flex", gap: 14, alignItems: "flex-start",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: "linear-gradient(to right, transparent, rgba(34,197,94,0.30), transparent)" }} />
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "rgba(34,197,94,0.10)", border: "1.5px solid rgba(34,197,94,0.22)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#22c55e", flexShrink: 0,
              }}>
                {icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "#E8E8E8", letterSpacing: "-0.01em" }}>{title}</h3>
                  <span style={{ fontSize: 17, fontWeight: 900, color: "rgba(34,197,94,0.15)", letterSpacing: "-0.04em", lineHeight: 1, flexShrink: 0 }}>{num}</span>
                </div>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 1.5 }}>{copy}</p>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <Link to="/stat-board/players" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontSize: 13, fontWeight: 700, color: "#4ade80",
            textDecoration: "none",
            border: "1px solid rgba(34,197,94,0.24)",
            padding: "11px 20px", borderRadius: 10,
            background: "rgba(34,197,94,0.07)", minHeight: 44,
          }}>
            Open Stat Board <ArrowRight size={13} />
          </Link>
        </div>
      </section>

      <SectionDivider from="#0f0e0c" to="#0a0908" />

      {/* ─── STAT LENSES ─── */}
      <section id="section-stats" style={{ background: "#0a0908", padding: "28px 16px 36px" }}>
        <div style={{ marginBottom: 20, textAlign: "center" }}>
          <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>Stat lenses</p>
          <h2 style={{ fontSize: "1.35rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F0F0F0", lineHeight: 1.15 }}>
            Start with the stats people check first.
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            {
              icon: <BarChart2Icon size={18} />, title: "Disposals", color: "#22c55e",
              copy: "Track disposal trends using last 10 games, rolling averages and projections.",
              pills: ["15+", "20+", "25+", "30+"],
            },
            {
              icon: <Target size={18} />, title: "Goals", color: "#f59e0b",
              copy: "Track goal-scoring trends using recent form, hit rates and projections.",
              pills: ["1+", "2+", "3+", "4+"],
            },
            {
              icon: <BarChart2Icon size={18} />, title: "Match Centre", color: "#60a5fa",
              copy: "Scan every game by projected total, margin, scoring environment and matchup context.",
              pills: ["Projected total", "Margin", "Trend"],
            },
          ].map(({ icon, title, color, copy, pills }) => (
            <div key={title} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}22`, borderRadius: 12, padding: "16px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}14`, border: `1px solid ${color}26`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
                  {icon}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#ececec" }}>{title}</p>
                  <span style={{ fontSize: 8.5, fontWeight: 700, color: "#4ade80", background: "rgba(34,197,94,0.09)", padding: "1px 7px", borderRadius: 999, letterSpacing: "0.07em" }}>Available now</span>
                </div>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "rgba(255,255,255,0.48)", lineHeight: 1.6 }}>{copy}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {pills.map(pill => (
                  <span key={pill} style={{
                    fontSize: 10, fontWeight: 700,
                    color: color === "#22c55e" ? "rgba(74,222,128,0.82)" : color === "#f59e0b" ? "rgba(253,211,77,0.82)" : "rgba(147,197,253,0.82)",
                    background: color === "#22c55e" ? "rgba(34,197,94,0.09)" : color === "#f59e0b" ? "rgba(245,158,11,0.09)" : "rgba(96,165,250,0.09)",
                    border: `1px solid ${color === "#22c55e" ? "rgba(34,197,94,0.20)" : color === "#f59e0b" ? "rgba(245,158,11,0.20)" : "rgba(96,165,250,0.20)"}`,
                    padding: "2px 8px", borderRadius: 5,
                    letterSpacing: "0.03em",
                  }}>{pill}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <Link to="/stat-board/match-centre" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.55)",
            textDecoration: "none",
            border: "1px solid rgba(255,255,255,0.10)",
            padding: "11px 20px", borderRadius: 10,
            background: "rgba(255,255,255,0.04)", minHeight: 44,
          }}>
            View Match Centre <ChevronRight size={13} />
          </Link>
        </div>
      </section>

      <SectionDivider from="#0a0908" to="#0f0e0c" />

      {/* ─── TRUST BLOCK ─── */}
      <section id="section-trust" style={{ background: "#0f0e0c", padding: "28px 16px 36px" }}>
        <div style={{ marginBottom: 18, textAlign: "center" }}>
          <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(34,197,94,0.55)", marginBottom: 8 }}>Why it works</p>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F0F0F0", lineHeight: 1.2 }}>
            Built for serious AFL fans
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {TRUST_ITEMS.map(item => (
            <div key={item} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 14px",
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%",
                background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.22)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Check size={10} style={{ color: "#22C55E" }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.58)" }}>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <SectionDivider from="#0f0e0c" to="#060806" />

      {/* ─── FINAL CTA ─── */}
      <section style={{
        background: "linear-gradient(180deg, #060806 0%, #030503 100%)",
        padding: "36px 16px 52px",
      }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "1.65rem", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.08, marginBottom: 10 }}>
            Ready to check the stats?
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, marginBottom: 24, maxWidth: 280, margin: "0 auto 24px" }}>
            Open the Stat Board — pick a match, choose a stat, see who is most likely to deliver.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Link to="/stat-board/players" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "linear-gradient(160deg, #22c55e 0%, #16a34a 100%)",
              color: "#f0fff4", fontWeight: 900, fontSize: 16,
              padding: "17px 20px", borderRadius: 12, textDecoration: "none",
              boxShadow: "0 6px 32px rgba(34,197,94,0.28)", minHeight: 56,
            }}>
              Open Stat Board <ArrowRight size={16} />
            </Link>
            <Link to="/stat-board/match-centre" style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, color: "rgba(255,255,255,0.38)", textDecoration: "none",
              padding: "12px", minHeight: 44,
            }}>
              View Match Centre
            </Link>
          </div>
        </div>
      </section>

      <style>{`
        .mobile-nav-scroll::-webkit-scrollbar { display: none; }
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .live-dot { animation: livePulse 1.8s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
