import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, ChartBar as BarChart2, Target, Zap, TrendingUp, Star, Database, Clock, TriangleAlert as AlertTriangle, Zap as ZapIcon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import MobileUpgradeBar from "@/components/mobile/MobileUpgradeBar";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import LandingTrust from "@/features/afl/landing/LandingTrust";
import LandingPricing from "@/features/afl/landing/LandingPricing";
import LandingFinalCTA from "@/features/afl/landing/LandingFinalCTA";
import MobileLanding from "@/features/afl/landing/MobileLanding";
import { classifyPlayers } from "@/features/afl/market-watch/engine";
import type { MWPlayerRow } from "@/features/afl/market-watch/types";
import { getCaptainScore, isCaptainEligible } from "@/features/afl/shared/data/captainScoring";
import type { StatBoardPlayer, StatBoardMatch } from "@/features/afl/stat-board/types";

// ── Design tokens ────────────────────────────────────────────────────────────
const DARK = "#05070A";
const GOLD = "#F4C542";

// ── Stat Board live preview ───────────────────────────────────────────────────

function StatBoardPreviewRow({ player }: { player: StatBoardPlayer }) {
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
      gridTemplateColumns: "1fr 72px 72px 64px",
      gap: 8,
      alignItems: "center",
      padding: "9px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      {/* Player name + team */}
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#f0f0f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {player.player_name}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 10, color: "rgba(255,255,255,0.48)", fontWeight: 500, letterSpacing: "0.03em" }}>
          {player.team_name}
          {player.position_group && (
            <span style={{ marginLeft: 6, background: "rgba(255,255,255,0.09)", padding: "1px 5px", borderRadius: 3, color: "rgba(255,255,255,0.55)" }}>
              {player.position_group}
            </span>
          )}
        </p>
      </div>

      {/* Projection */}
      <div style={{ textAlign: "right" }}>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#f5f5f5", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {proj != null ? proj : "—"}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 9, color: "rgba(255,255,255,0.38)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Proj</p>
      </div>

      {/* Hit rate */}
      <div style={{ textAlign: "right" }}>
        {hitFrac ? (
          <>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#f0f0f0", fontVariantNumeric: "tabular-nums" }}>{hitFrac}</p>
            {hitPct != null && (
              <p style={{ margin: "2px 0 0", fontSize: 10, color: hitPct >= 70 ? "#4ade80" : hitPct >= 50 ? "#fcd34d" : "rgba(255,255,255,0.42)", fontWeight: 600 }}>
                {hitPct}%
              </p>
            )}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.30)" }}>—</p>
        )}
        <p style={{ margin: "2px 0 0", fontSize: 9, color: "rgba(255,255,255,0.38)", letterSpacing: "0.05em", textTransform: "uppercase" }}>20+</p>
      </div>

      {/* Consistency */}
      <div style={{ textAlign: "right" }}>
        {player.confidence_label ? (
          <span style={{
            display: "inline-block",
            fontSize: 9, fontWeight: 700,
            color: confColor,
            background: `${confColor}18`,
            border: `1px solid ${confColor}35`,
            padding: "2px 6px",
            borderRadius: 999,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}>
            {player.confidence_label}
          </span>
        ) : (
          <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 11 }}>—</span>
        )}
      </div>
    </div>
  );
}

function StatBoardPreview() {
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
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{ height: 52, background: "linear-gradient(90deg,rgba(255,255,255,0.03) 25%,rgba(255,255,255,0.06) 50%,rgba(255,255,255,0.03) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite", borderBottom: "1px solid rgba(255,255,255,0.04)" }} />
        ))}
      </div>
    );
  }

  if (players.length === 0) return null;

  return (
    <div style={{ borderRadius: 12, border: "1px solid rgba(224,174,45,0.22)", overflow: "hidden", background: "rgba(6,8,12,0.92)", backdropFilter: "blur(12px)", boxShadow: "0 0 0 1px rgba(224,174,45,0.06) inset, 0 12px 48px rgba(0,0,0,0.65), 0 0 32px rgba(224,174,45,0.06)" }}>
      {/* Table header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 72px 72px 64px",
        gap: 8,
        padding: "8px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.04)",
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.10em" }}>
          {match?.match_label ?? "Player"}
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.10em", textAlign: "right" }}>Proj</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.10em", textAlign: "right" }}>Hit rate</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.10em", textAlign: "right" }}>Form</span>
      </div>
      {players.map(p => (
        <StatBoardPreviewRow key={p.player_id} player={p} />
      ))}
      {/* CTA footer */}
      <Link
        to="/stat-board/players"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "10px 14px",
          fontSize: 12, fontWeight: 700,
          color: "rgba(255,255,255,0.62)",
          textDecoration: "none",
          background: "rgba(255,255,255,0.04)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          transition: "color 0.15s ease, background 0.15s ease",
          letterSpacing: "0.04em",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#f0f0f0"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.62)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
      >
        Open full Stat Board <ChevronRight size={12} />
      </Link>
    </div>
  );
}

// ── Fantasy edge cards (kept from existing homepage) ──────────────────────────

const CARD_ACCENTS = [
  { color: "#22c55e", dim: "#14532d", label: "#4ade80" },
  { color: "#f87171", dim: "#7f1d1d", label: "#fca5a5" },
  { color: "#E0AE2D", dim: "#78480f", label: "#fcd34d" },
  { color: "#E8855A", dim: "#7a3318", label: "#f4a87a" },
];

type CardProps = {
  label: string;
  icon: React.ReactNode;
  accentIdx: number;
  playerName: string;
  team: string;
  position?: string | null;
  projection?: number | null;
  seasonAvg?: number | null;
  confidenceLabel?: string | null;
  reason: string;
  ctaLabel: string;
  ctaTo: string;
  badge?: string;
  compact?: boolean;
};

function EdgeCard(p: CardProps) {
  const [hovered, setHovered] = useState(false);
  const accent = CARD_ACCENTS[p.accentIdx] ?? CARD_ACCENTS[0];
  const pts = p.projection != null ? Math.round(p.projection) : null;
  const avg = p.seasonAvg != null ? Math.round(p.seasonAvg) : null;
  const vsAvgDiff = pts != null && avg != null ? pts - avg : null;
  const vsAvgStr = vsAvgDiff != null
    ? (vsAvgDiff >= 0 ? `+${vsAvgDiff}` : `${vsAvgDiff}`) + " vs avg"
    : null;
  const pad = p.compact ? "14px" : "18px";
  const projSize = p.compact ? 38 : 50;

  return (
    <Link to={p.ctaTo} style={{ textDecoration: "none", display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          flex: 1, display: "flex", flexDirection: "column",
          background: "rgba(10, 12, 16, 0.85)",
          backdropFilter: "blur(12px)",
          border: `1px solid ${hovered ? accent.color + "38" : "rgba(255,255,255,0.06)"}`,
          borderRadius: 12, overflow: "hidden",
          boxShadow: hovered
            ? `0 16px 40px rgba(0,0,0,0.60), 0 0 0 1px ${accent.color}28, 0 0 24px ${accent.color}10`
            : "0 4px 16px rgba(0,0,0,0.35)",
          transform: hovered ? "translateY(-3px) translateZ(0)" : "translateY(0) translateZ(0)",
          transition: "transform 0.20s ease, box-shadow 0.20s ease, border-color 0.18s ease",
          willChange: "transform",
        }}
      >
        <div style={{ height: 2, background: accent.color, opacity: hovered ? 0.9 : 0.65, flexShrink: 0, transition: "opacity 0.18s ease" }} />
        <div style={{ padding: `8px ${pad} 7px`, display: "flex", alignItems: "center", gap: 7, borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <span style={{ color: accent.label, display: "flex", alignItems: "center", flexShrink: 0, opacity: 0.9 }}>{p.icon}</span>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.24em", textTransform: "uppercase", color: accent.label, opacity: 0.85, flex: 1 }}>{p.label}</span>
          {p.position && (
            <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.07)", padding: "2px 6px", borderRadius: 4, letterSpacing: "0.06em", flexShrink: 0 }}>
              {p.position}
            </span>
          )}
          {p.badge && (
            <span style={{ fontSize: 9, fontWeight: 900, background: accent.color, color: "#000", padding: "2px 7px", borderRadius: 4, letterSpacing: "0.04em", flexShrink: 0, opacity: 0.9 }}>
              {p.badge}
            </span>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: "#4ade80", flexShrink: 0 }}>
            <span className="live-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            LIVE
          </span>
        </div>
        <div style={{ padding: `10px ${pad} 0`, flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#ececec", lineHeight: 1.15, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.playerName}</p>
          <p style={{ margin: "3px 0 0", fontSize: 10, color: "rgba(255,255,255,0.42)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.team}</p>
        </div>
        <div style={{ padding: `8px ${pad} 0`, flexShrink: 0 }}>
          {pts != null ? (
            <>
              <span style={{ display: "block", fontSize: projSize, fontWeight: 800, color: accent.color, lineHeight: 0.90, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>{pts}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5 }}>
                <span style={{ fontSize: 8.5, color: "rgba(255,255,255,0.35)", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>Projected pts</span>
                {vsAvgStr != null && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: vsAvgDiff! >= 0 ? "#4ade80" : "#f87171", background: vsAvgDiff! >= 0 ? "rgba(74,222,128,0.10)" : "rgba(248,113,113,0.10)", padding: "1px 6px", borderRadius: 4, letterSpacing: "0.04em" }}>
                    {vsAvgStr}
                  </span>
                )}
              </div>
            </>
          ) : (
            <span style={{ fontSize: 28, color: "rgba(255,255,255,0.18)", fontWeight: 700 }}>—</span>
          )}
        </div>
        {p.confidenceLabel && (
          <div style={{ padding: `5px ${pad} 0`, flexShrink: 0 }}>
            <span style={{
              fontSize: 9, fontWeight: 700,
              color: p.confidenceLabel === "High" ? "#4ade80" : p.confidenceLabel === "Medium" ? "#fcd34d" : "rgba(255,255,255,0.50)",
              background: p.confidenceLabel === "High" ? "rgba(34,197,94,0.10)" : p.confidenceLabel === "Medium" ? "rgba(244,197,66,0.10)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${p.confidenceLabel === "High" ? "rgba(34,197,94,0.24)" : p.confidenceLabel === "Medium" ? "rgba(244,197,66,0.24)" : "rgba(255,255,255,0.10)"}`,
              padding: "2px 9px", borderRadius: 999, letterSpacing: "0.08em", textTransform: "uppercase" as const,
            }}>
              {p.confidenceLabel} Confidence
            </span>
          </div>
        )}
        <div style={{ margin: `8px ${pad} 0`, height: 1, background: "rgba(255,255,255,0.05)", flexShrink: 0 }} />
        <div style={{ padding: `7px ${pad} 0`, flex: 1, display: "flex", alignItems: "flex-start" }}>
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.50)", fontWeight: 400, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: p.compact ? 2 : 3, WebkitBoxOrient: "vertical" } as React.CSSProperties}>
            {p.reason}
          </p>
        </div>
        <div style={{ padding: `10px ${pad} ${p.compact ? "12px" : "16px"}`, flexShrink: 0 }}>
          <div style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: hovered ? `${accent.color}18` : "rgba(255,255,255,0.04)", border: `1px solid ${hovered ? accent.color + "40" : "rgba(255,255,255,0.09)"}`, color: hovered ? accent.label : "rgba(255,255,255,0.60)", fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", borderRadius: 8, transition: "all 0.18s ease" }}>
            {p.ctaLabel} <ChevronRight size={10} strokeWidth={2.5} />
          </div>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="skeleton-shimmer" style={{ height: "100%", minHeight: 320, borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)" }} />
  );
}

// ── RankingRow → MWPlayerRow ─────────────────────────────────────────────────
function rankingToMW(r: RankingRow): MWPlayerRow {
  const acRaw = (r.action_canonical ?? "").toLowerCase();
  const displaySignal: "TARGET" | "WATCH" | "AVOID" =
    acRaw === "start" || acRaw === "smash_start" || acRaw === "strong_start" ? "TARGET"
    : acRaw === "sit" || acRaw === "hard_sit" ? "AVOID"
    : "WATCH";
  return {
    player_id: Number(r.player_id ?? 0), player_name: r.player_name,
    team: r.team ?? "", team_name: r.team_name ?? r.team ?? "",
    position: r.position ?? "", price: r.price ?? 0,
    prev_price: r.prev_price ?? null, price_change: r.price_change ?? null,
    price_change_pct: r.price_change_pct ?? null, projection: r.projection ?? null,
    season_avg: r.season_avg ?? null, last_3_avg: r.last_3_avg ?? null,
    last_5_avg: null, games_played: r.games_played ?? null,
    breakeven: r.breakeven ?? null, edge: r.edge ?? r.edge_canonical ?? null,
    value_score: r.value_score ?? null, signal: r.signal ?? null,
    signal_tag: r.signal_tag ?? null, signal_display: r.signal_display ?? null,
    category: r.category ?? null, action: r.action ?? r.action_canonical ?? null,
    action_canonical: r.action_canonical ?? null, action_display: r.action_display ?? null,
    confidence_label: r.confidence_label ?? null, value_band: r.value_band ?? null,
    decision_score: r.decision_score ?? null, action_reason_1: r.action_reason_1 ?? null,
    action_reason_2: r.action_reason_2 ?? null, why: r.why ?? null,
    why_long: r.why_long ?? null, matchup_label: r.matchup_label ?? null,
    matchup_rating: null, matchup_multiplier: r.matchup_multiplier ?? null,
    consistency: r.consistency ?? null, neeko_rating: r.neeko_rating ?? null,
    status: r.status ?? null, manual_status: r.manual_status ?? null,
    is_bye: r.is_bye ?? false, is_injured: r.is_injured ?? false,
    cached_at: r.cached_at ?? null, display_signal: displaySignal,
    access_tier: r.access_tier ?? "locked",
  };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Index() {
  const { isPremium } = useAuth();
  const [players, setPlayers] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [currentRound, setCurrentRound] = useState<number | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".scroll-reveal");
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const delay = el.dataset.revealDelay ?? "0";
            setTimeout(() => el.classList.add("revealed"), Number(delay));
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.10, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    (async () => {
      const [rankingsRes, roundRes] = await Promise.all([
        supabase.rpc("get_rankings_safe", { p_user_id: null, p_is_bot: false, p_limit: 200 }),
        supabase.rpc("get_latest_completed_round"),
      ]);
      if (rankingsRes.data) setPlayers((rankingsRes.data as Record<string, unknown>[]).map(mapRankingRow));
      if (roundRes.data != null) {
        const safeRound = roundRes.data > 0 ? roundRes.data : 6;
        setCurrentRound(safeRound);
      }
      setLoading(false);
    })();
  }, []);

  const { mustBuyP, trapP, captainP, breakoutP, topRows } = useMemo(() => {
    const allWithProjection = players.filter(p => p.projection != null && !p.is_injured && !p.is_bye);
    const byProjectionDesc = [...allWithProjection].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));

    const mustBuyP =
      allWithProjection.filter(p => (p.action_canonical ?? "").toUpperCase() === "SMASH_START")
        .sort((a, b) => ((b as any).decision_score ?? 0) - ((a as any).decision_score ?? 0))[0]
      ?? allWithProjection.filter(p => (p.action_canonical ?? "").toUpperCase() === "START")
        .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))[0]
      ?? byProjectionDesc[0] ?? null;

    const trapP =
      allWithProjection.filter(p => {
        const ac = (p.action_canonical ?? "").toUpperCase();
        return ac === "HARD_SIT" || ac === "SIT";
      }).filter(p => p.player_id !== mustBuyP?.player_id)
        .sort((a, b) => (a.projection ?? 0) - (b.projection ?? 0))[0]
      ?? byProjectionDesc[byProjectionDesc.length - 1] ?? null;

    const usedIds1 = new Set([mustBuyP?.player_id, trapP?.player_id].filter(Boolean));
    const captainP =
      allWithProjection.filter(p => !usedIds1.has(p.player_id) && isCaptainEligible(p))
        .sort((a, b) => (b.captain_score ?? getCaptainScore(b)) - (a.captain_score ?? getCaptainScore(a)))[0]
      ?? byProjectionDesc.filter(p => !usedIds1.has(p.player_id))[0]
      ?? byProjectionDesc[0] ?? null;

    const usedIds2 = new Set([mustBuyP?.player_id, trapP?.player_id, captainP?.player_id].filter(Boolean));
    const breakoutP =
      allWithProjection.filter(p => !usedIds2.has(p.player_id) && (p.category_canonical ?? "").toUpperCase() === "TARGET")
        .sort((a, b) => ((b as any).decision_score ?? 0) - ((a as any).decision_score ?? 0))[0]
      ?? byProjectionDesc.filter(p => !usedIds2.has(p.player_id))[0]
      ?? byProjectionDesc[3] ?? null;

    const topRows = players.filter(p => p.projection != null)
      .sort((a, b) => (b.neeko_rating ?? b.projection ?? 0) - (a.neeko_rating ?? a.projection ?? 0))
      .slice(0, 12);

    return { mustBuyP, trapP, captainP, breakoutP, topRows };
  }, [players]);

  const mwData = useMemo(() => {
    if (!players.length) return { buys: [], holds: [], sells: [] };
    const classified = classifyPlayers(players.map(rankingToMW));
    return { buys: classified.buys.slice(0, 5), holds: classified.holds.slice(0, 5), sells: classified.sells.slice(0, 5) };
  }, [players]);

  function confidenceOf(p: RankingRow | null): string | null {
    if (!p) return null;
    const up = (p.confidence_label ?? "").toUpperCase();
    if (up === "HIGH") return "High";
    if (up === "MEDIUM") return "Medium";
    return up ? "Low" : null;
  }

  const trapFallback = trapP ?? captainP;
  const breakoutFallback = breakoutP ?? captainP;
  const allHeroReady = !loading && players.length > 0 && mustBuyP && captainP;
  const showSkeleton = loading || !allHeroReady;

  const fantasyCards: CardProps[] = allHeroReady ? [
    {
      label: "Must Buy", icon: <TrendingUp size={11} />, accentIdx: 0,
      playerName: mustBuyP!.player_name, team: mustBuyP!.team ?? "", position: mustBuyP!.position,
      projection: mustBuyP!.projection, seasonAvg: mustBuyP!.last_5_avg ?? mustBuyP!.season_avg ?? null,
      confidenceLabel: confidenceOf(mustBuyP),
      reason: "Projected well above price — one of the best value plays this week.",
      ctaLabel: "View Must Buys", ctaTo: "/fantasy",
    },
    {
      label: "Trap Alert", icon: <AlertTriangle size={11} />, accentIdx: 1,
      playerName: trapFallback!.player_name, team: trapFallback!.team ?? "", position: trapFallback!.position,
      projection: trapFallback!.projection, seasonAvg: trapFallback!.last_5_avg ?? trapFallback!.season_avg ?? null,
      confidenceLabel: confidenceOf(trapFallback),
      reason: "High risk of underperforming this week based on recent form and matchup.",
      ctaLabel: "See Trap Alerts", ctaTo: "/fantasy",
    },
    {
      label: "Captain Pick", icon: <Star size={11} />, badge: "C", accentIdx: 2,
      playerName: captainP!.player_name, team: captainP!.team ?? "", position: captainP!.position,
      projection: captainP!.projection, seasonAvg: captainP!.last_5_avg ?? captainP!.season_avg ?? null,
      confidenceLabel: confidenceOf(captainP),
      reason: "Top projected scorer this round — strong captain consideration.",
      ctaLabel: "View Captains", ctaTo: "/fantasy",
    },
    {
      label: "Value Pick", icon: <ZapIcon size={11} />, accentIdx: 3,
      playerName: breakoutFallback!.player_name, team: breakoutFallback!.team ?? "", position: breakoutFallback!.position,
      projection: breakoutFallback!.projection, seasonAvg: breakoutFallback!.last_5_avg ?? breakoutFallback!.season_avg ?? null,
      confidenceLabel: confidenceOf(breakoutFallback),
      reason: "Projecting above recent averages — potential value pick this round.",
      ctaLabel: "Open Fantasy Hub", ctaTo: "/fantasy",
    },
  ] : [];

  const mobileCards = fantasyCards.map(c => ({
    label: c.label, color: CARD_ACCENTS[c.accentIdx].color,
    playerName: c.playerName, team: c.team, position: c.position,
    projection: c.projection, seasonAvg: c.seasonAvg ?? null,
    confidenceLabel: c.confidenceLabel ?? null,
    reason: c.reason, ctaLabel: c.ctaLabel, ctaTo: c.ctaTo,
  }));

  const trustItems = [
    { icon: <Zap size={12} />,      text: "Updated before every round lockout" },
    { icon: <Database size={12} />, text: "600+ players tracked weekly" },
    { icon: <Clock size={12} />,    text: "Plan your round in 30 seconds" },
  ];

  const helmet = (
    <Helmet>
      <title>AFL Player Stat Trends, Hit Rates &amp; Projections | Neeko Sports Stats</title>
      <meta name="description" content="View AFL player stat trends, hit rates and projections by match. Explore disposals, goals and fantasy insights with Neeko Sports Stats." />
      <link rel="canonical" href="https://neekostats.com.au/" />
      <meta property="og:title" content="AFL Player Stat Trends, Hit Rates & Projections | Neeko Sports Stats" />
      <meta property="og:description" content="View AFL player stat trends, hit rates and projections by match. Explore disposals, goals and fantasy insights." />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://neekostats.com.au/" />
      <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="robots" content="index, follow" />
    </Helmet>
  );

  if (isMobile) {
    return (
      <div style={{ background: "#0a0908", overflowX: "hidden" }}>
        {helmet}
        <MobileLanding isPremium={isPremium} />
      </div>
    );
  }

  return (
    <div style={{ background: DARK, overflowX: "hidden" }}>
      {helmet}

      {/* ════════════════════════════════════════════════════
          HERO — stat board first
      ════════════════════════════════════════════════════ */}
      <section style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {/* Background image */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "url('/images/Fantasy_sports_war_room_setup.png')",
          backgroundSize: "cover", backgroundPosition: "center 30%",
          filter: "brightness(0.88) contrast(1.05)", zIndex: 0,
        }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.28) 40%, rgba(0,0,0,0.50) 75%, #0B0F14 100%)", zIndex: 1 }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 65% 55% at 50% 48%, rgba(0,0,0,0.32) 0%, transparent 100%)", zIndex: 2, pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 45% at 50% 42%, rgba(34,197,94,0.06), transparent 70%)", zIndex: 3, pointerEvents: "none" }} />

        {/* Hero content */}
        <div style={{
          position: "relative", zIndex: 20,
          width: "100%", maxWidth: 860,
          padding: "0 clamp(20px, 5vw, 40px)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 48,
          alignItems: "center",
        }}>
          {/* Left: copy */}
          <div>
            <p className="hero-eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.40em", textTransform: "uppercase", color: "#22c55e", marginBottom: 18, textShadow: "0 0 24px rgba(34,197,94,0.30)" }}>
              AFL Stat Board
            </p>
            <h1 className="hero-h1" style={{ margin: "0 0 20px", fontSize: "clamp(28px, 3.2vw, 52px)", fontWeight: 900, lineHeight: 1.08, letterSpacing: "-0.03em", color: "#f5f5f5", textShadow: "0 2px 12px rgba(0,0,0,0.55)" }}>
              Find AFL players most likely to{" "}
              <span style={{ color: "#22c55e", textShadow: "0 0 28px rgba(34,197,94,0.35)" }}>
                hit key stats
              </span>{" "}
              this round.
            </h1>
            <p className="hero-sub" style={{ margin: "0 0 32px", fontSize: "clamp(13px, 1.05vw, 16px)", color: "rgba(255,255,255,0.78)", lineHeight: 1.65, fontWeight: 500, textShadow: "0 2px 8px rgba(0,0,0,0.40)" }}>
              Pick a match, choose a stat, and view recent form, hit rates, projections and trends in seconds.
            </p>
            <div className="hero-ctas" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link
                to="/stat-board/players"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "linear-gradient(160deg, #22c55e 0%, #16a34a 100%)",
                  color: "#f0fff4", fontWeight: 800,
                  fontSize: "clamp(13px, 0.95vw, 15px)",
                  padding: "13px 26px", borderRadius: 9,
                  textDecoration: "none", letterSpacing: "0.01em", whiteSpace: "nowrap",
                  boxShadow: "0 8px 26px rgba(34,197,94,0.32), 0 4px 12px rgba(0,0,0,0.5)",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 32px rgba(34,197,94,0.42), 0 4px 12px rgba(0,0,0,0.5)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 26px rgba(34,197,94,0.32), 0 4px 12px rgba(0,0,0,0.5)"; }}
              >
                Open Stat Board <ArrowRight size={15} />
              </Link>
              <Link
                to="/stat-board/teams"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "rgba(255,255,255,0.06)", backdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.72)", fontWeight: 600,
                  fontSize: "clamp(13px, 0.95vw, 15px)",
                  padding: "13px 26px", borderRadius: 9,
                  textDecoration: "none", whiteSpace: "nowrap",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.10)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
              >
                Team Stats
              </Link>
            </div>
            {/* Trust row */}
            <div className="hero-trust" style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 28 }}>
              {trustItems.map(({ icon, text }) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.60)", fontWeight: 600, whiteSpace: "nowrap" }}>
                  <span style={{ color: "rgba(34,197,94,0.80)" }}>{icon}</span>
                  {text}
                </div>
              ))}
            </div>
          </div>

          {/* Right: live preview */}
          <div className="hero-preview">
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <p style={{ margin: "0 0 3px", fontSize: 10, fontWeight: 800, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(224,174,45,0.75)" }}>
                Live Stat Board Preview
              </p>
              <p style={{ margin: 0, fontSize: 9.5, fontWeight: 500, letterSpacing: "0.12em", color: "rgba(255,255,255,0.38)", textTransform: "uppercase" }}>
                Disposals · 20+ threshold · current round
              </p>
            </div>
            <StatBoardPreview />
          </div>
        </div>

        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 200, background: "linear-gradient(to bottom, transparent 0%, #05070A 100%)", zIndex: 15, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: 0.30 }}>
          <div style={{ width: 1, height: 32, background: "linear-gradient(to bottom, rgba(34,197,94,0.8), transparent)" }} />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════
          HOW IT WORKS
      ════════════════════════════════════════════════════ */}
      <section className="scroll-reveal" style={{ background: "#05070A", padding: "clamp(28px, 3.5vw, 48px) clamp(20px, 5vw, 40px)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <p style={{ margin: "0 0 6px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em", textTransform: "uppercase", color: "rgba(34,197,94,0.75)" }}>How it works</p>
            <h2 style={{ margin: 0, fontSize: "clamp(18px, 1.8vw, 26px)", fontWeight: 900, color: "#f4f4f4", letterSpacing: "-0.02em" }}>
              Three steps to every player trend
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }} className="how-grid">
            {[
              { num: "01", icon: <BarChart2 size={20} />, title: "Pick a match", copy: "Choose any fixture from the current round." },
              { num: "02", icon: <Target size={20} />, title: "Choose a stat", copy: "Start with disposals or goals, then set your threshold." },
              { num: "03", icon: <Zap size={20} />, title: "See the trend", copy: "View last 10, hit rate, projection and consistency." },
            ].map(({ num, icon, title, copy }) => (
              <div key={num} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "16px 15px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 9, fontWeight: 900, color: "rgba(34,197,94,0.60)", letterSpacing: "0.14em" }}>{num}</span>
                  <span style={{ color: "#22c55e", opacity: 0.75 }}>{icon}</span>
                </div>
                <p style={{ margin: "0 0 5px", fontSize: 13.5, fontWeight: 700, color: "#e8e8e8" }}>{title}</p>
                <p style={{ margin: 0, fontSize: 12.5, color: "rgba(255,255,255,0.52)", lineHeight: 1.55 }}>{copy}</p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <Link
              to="/stat-board/players"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#4ade80", textDecoration: "none", border: "1px solid rgba(34,197,94,0.28)", padding: "9px 18px", borderRadius: 9, background: "rgba(34,197,94,0.07)", transition: "all 0.15s ease" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.13)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.07)"; }}
            >
              Open Stat Board <ArrowRight size={14} />
            </Link>
            <Link
              to="/stat-board/teams"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.48)", textDecoration: "none", border: "1px solid rgba(255,255,255,0.10)", padding: "9px 16px", borderRadius: 9, background: "rgba(255,255,255,0.04)", transition: "all 0.15s ease" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.75)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.48)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
            >
              Team Stats
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════
          STAT LENSES
      ════════════════════════════════════════════════════ */}
      <section className="scroll-reveal" style={{ background: "#060809", padding: "clamp(24px, 3vw, 40px) clamp(20px, 5vw, 40px)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <p style={{ margin: "0 0 6px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)" }}>Stat lenses</p>
            <h2 style={{ margin: 0, fontSize: "clamp(18px, 1.8vw, 26px)", fontWeight: 900, color: "#f4f4f4", letterSpacing: "-0.02em" }}>
              Start with the stats people check first.
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              {
                icon: <BarChart2 size={22} />, title: "Disposals", color: "#22c55e",
                copy: "Track disposal trends using last 10 games, rolling averages and projections.",
                pills: ["15+", "20+", "25+", "30+"],
              },
              {
                icon: <Target size={22} />, title: "Goals", color: "#f59e0b",
                copy: "Track goal-scoring trends using recent form, hit rates and projections.",
                pills: ["1+", "2+", "3+", "4+"],
              },
            ].map(({ icon, title, color, copy, pills }) => (
              <div key={title} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}22`, borderRadius: 12, padding: "18px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}15`, border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
                    {icon}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#ececec" }}>{title}</p>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#4ade80", background: "rgba(34,197,94,0.10)", padding: "1px 7px", borderRadius: 999, letterSpacing: "0.08em" }}>Available now</span>
                  </div>
                </div>
                <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "rgba(255,255,255,0.52)", lineHeight: 1.6 }}>{copy}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {pills.map(pill => (
                    <span key={pill} style={{
                      fontSize: 10, fontWeight: 700,
                      color: color === "#22c55e" ? "rgba(74,222,128,0.82)" : "rgba(253,211,77,0.82)",
                      background: color === "#22c55e" ? "rgba(34,197,94,0.09)" : "rgba(245,158,11,0.09)",
                      border: `1px solid ${color === "#22c55e" ? "rgba(34,197,94,0.20)" : "rgba(245,158,11,0.20)"}`,
                      padding: "2px 8px", borderRadius: 5,
                      letterSpacing: "0.03em",
                    }}>{pill}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════
          FANTASY HUB — secondary
      ════════════════════════════════════════════════════ */}
      <section className="scroll-reveal" style={{
        background: "#05070A",
        backgroundImage: "radial-gradient(circle at 50% 0%, rgba(255,180,50,0.03), transparent 55%)",
        padding: "clamp(28px, 3.5vw, 48px) clamp(20px, 5vw, 40px)",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 20, textAlign: "center" }}>
            <p style={{ margin: "0 0 5px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em", textTransform: "uppercase", color: "rgba(244,197,66,0.65)" }}>
              Fantasy Hub{currentRound != null ? ` — Round ${currentRound}` : ""}
            </p>
            <h2 style={{ margin: "0 0 7px", fontSize: "clamp(16px, 1.6vw, 22px)", fontWeight: 800, color: "#e8e8e8", letterSpacing: "-0.02em" }}>
              Want fantasy-specific calls?
            </h2>
            <p style={{ margin: "0 0 12px", fontSize: "clamp(11px, 0.78vw, 13px)", color: "rgba(255,255,255,0.45)", fontWeight: 500, lineHeight: 1.5, maxWidth: 440, marginLeft: "auto", marginRight: "auto" }}>
              Must Buys, Trap Alerts, Captain Picks and Rankings — in the Fantasy Hub.
            </p>
            <Link
              to="/fantasy"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: "rgba(244,197,66,0.80)", textDecoration: "none", whiteSpace: "nowrap", border: "1px solid rgba(244,197,66,0.22)", padding: "7px 15px", borderRadius: 8, background: "rgba(244,197,66,0.06)", letterSpacing: "0.03em", transition: "all 0.15s ease" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(244,197,66,0.11)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(244,197,66,0.06)"; }}
            >
              Open Fantasy Hub <ChevronRight size={12} />
            </Link>
          </div>

          <div className="edge-cards-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, alignItems: "stretch" }}>
            {showSkeleton
              ? [0,1,2,3].map(i => <div key={i} style={{ minHeight: 240 }}><SkeletonCard /></div>)
              : fantasyCards.map(c => (
                  <div key={c.label} className="edge-card-enter" style={{ opacity: 0, display: "flex", flexDirection: "column" }}>
                    <EdgeCard {...c} compact />
                  </div>
                ))
            }
          </div>
        </div>
      </section>

      <div className="scroll-reveal" data-reveal-delay="0"><LandingTrust /></div>
      <div className="scroll-reveal" data-reveal-delay="0"><LandingPricing /></div>
      <div className="scroll-reveal" data-reveal-delay="0"><LandingFinalCTA /></div>

      {!isPremium && <MobileUpgradeBar />}

      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .live-dot { animation: livePulse 1.8s ease-in-out infinite; }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes heroFadeUp { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: translateY(0); } }
        .edge-card-enter { animation: fadeUp 0.32s ease forwards; }
        .edge-card-enter:nth-child(1) { animation-delay: 0.04s; }
        .edge-card-enter:nth-child(2) { animation-delay: 0.10s; }
        .edge-card-enter:nth-child(3) { animation-delay: 0.16s; }
        .edge-card-enter:nth-child(4) { animation-delay: 0.22s; }
        .hero-eyebrow { opacity: 0; animation: heroFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.10s forwards; }
        .hero-h1 { opacity: 0; animation: heroFadeUp 0.60s cubic-bezier(0.22,1,0.36,1) 0.22s forwards; }
        .hero-sub { opacity: 0; animation: heroFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.34s forwards; }
        .hero-ctas { opacity: 0; animation: heroFadeUp 0.50s cubic-bezier(0.22,1,0.36,1) 0.46s forwards; }
        .hero-trust { opacity: 0; animation: heroFadeUp 0.45s cubic-bezier(0.22,1,0.36,1) 0.56s forwards; }
        .hero-preview { opacity: 0; animation: heroFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.38s forwards; }
        .scroll-reveal { opacity: 0; transform: translateY(10px); transition: opacity 0.30s cubic-bezier(0.22,1,0.36,1), transform 0.30s cubic-bezier(0.22,1,0.36,1); will-change: transform; }
        .scroll-reveal.revealed { opacity: 1; transform: translateY(0); }
        .skeleton-shimmer { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%); background-size: 200% 100%; animation: shimmer 1.2s ease-in-out infinite; }
        @media (max-width: 900px) {
          .hero-ctas { flex-direction: column !important; align-items: stretch !important; max-width: 360px; }
          .hero-ctas a { justify-content: center; }
          .edge-cards-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .how-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .hero-preview { display: none !important; }
        }
      `}</style>
    </div>
  );
}
