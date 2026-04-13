import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Crown, ArrowRight, Check, TrendingUp, TriangleAlert as AlertTriangle, Star, ChartBar as BarChart3, ChevronRight, Zap, Database, Clock, Target, ShieldAlert, Users, ListOrdered, Swords, GitCompare, CalendarDays } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import MobileUpgradeBar from "@/components/mobile/MobileUpgradeBar";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import { classifyPlayers } from "@/features/afl/market-watch/engine";
import type { MWPlayerRow } from "@/features/afl/market-watch/types";

// ── Hero nav pills ─────────────────────────────────────────────────────────────
const NAV_PILLS = [
  { label: "Current Week", icon: <CalendarDays size={14} />, to: "/sports/afl/current-round", primary: true },
  { label: "Market Watch", icon: <TrendingUp size={14} />,   to: "/sports/afl/market-watch" },
  { label: "Captains",     icon: <Star size={14} />,          to: "/sports/afl/captains" },
  { label: "Rankings",     icon: <BarChart3 size={14} />,     to: "/sports/afl/rankings" },
] as const;

function HeroNavPills({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      width: "100%",
      overflowX: "auto",
      scrollbarWidth: "none",
      msOverflowStyle: "none",
      WebkitOverflowScrolling: "touch",
      ...style,
    }}>
      <div style={{
        display: "flex",
        gap: 10,
        justifyContent: "center",
        padding: "2px 16px",
        minWidth: "max-content",
        margin: "0 auto",
      }}>
        {NAV_PILLS.map(({ label, icon, to, primary }) => (
          <Link
            key={to}
            to={to}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 16px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "background 0.15s, border-color 0.15s",
              background: primary ? "rgba(244,197,66,0.14)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${primary ? "rgba(244,197,66,0.32)" : "rgba(255,255,255,0.08)"}`,
              color: primary ? "#F4C542" : "#EAEAEA",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.background = primary ? "rgba(244,197,66,0.22)" : "rgba(255,255,255,0.12)";
              el.style.borderColor = primary ? "rgba(244,197,66,0.45)" : "rgba(255,255,255,0.15)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.background = primary ? "rgba(244,197,66,0.14)" : "rgba(255,255,255,0.06)";
              el.style.borderColor = primary ? "rgba(244,197,66,0.32)" : "rgba(255,255,255,0.08)";
            }}
          >
            <span style={{ opacity: 0.7, display: "flex", alignItems: "center" }}>{icon}</span>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bgDark:    "#0B0F14",
  bgLight:   "#F5F5F3",
  bgSection: "#11161C",
  textPrim:  "#EAEAEA",
  textSec:   "#9CA3AF",
  textDark:  "#1A1A1A",
  gold:      "#F4C542",
  green:     "#22C55E",
  red:       "#EF4444",
  border:    "rgba(255,255,255,0.08)",
};

// ── Whiteboard card (hero) ─────────────────────────────────────────────────────
const CARD_ROTATIONS = [-1.8, 1.4, -1.2, 1.6];
const STICKY_PAPERS: Record<number, { bg: string; lines: string; headerBorder: string }> = {
  0: { bg: "#edf5eb", lines: "rgba(30,100,44,0.06)",   headerBorder: "rgba(30,100,44,0.18)" },
  1: { bg: "#f7eded", lines: "rgba(130,30,30,0.06)",   headerBorder: "rgba(130,30,30,0.18)" },
  2: { bg: "#f7f3e4", lines: "rgba(140,110,0,0.06)",   headerBorder: "rgba(140,110,0,0.18)" },
  3: { bg: "#eaeff8", lines: "rgba(20,70,148,0.06)",   headerBorder: "rgba(20,70,148,0.18)" },
};

type CardProps = {
  label: string;
  icon: React.ReactNode;
  color: string;
  playerName: string;
  team: string;
  position?: string | null;
  projection?: number | null;
  priceChange?: number | null;
  bullets: string[];
  ctaLabel: string;
  ctaTo: string;
  badge?: string;
  index?: number;
};

function PlayerAvatar({ name, color }: { name: string; color: string }) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{
      width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
      background: `${color}1a`, border: `1.5px solid ${color}38`,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", position: "relative",
    }}>
      <div style={{ position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)", width: 22, height: 26, background: `${color}28`, borderRadius: "50% 50% 0 0" }} />
      <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", width: 14, height: 14, borderRadius: "50%", background: `${color}44` }} />
      <span style={{ position: "relative", zIndex: 1, fontSize: 9, fontWeight: 900, color, letterSpacing: "-0.02em", marginTop: 9 }}>{initials}</span>
    </div>
  );
}

function StickyPin({ color }: { color: string }) {
  return (
    <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>
      <div style={{ width: 13, height: 13, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.6) 0%, ${color} 50%, rgba(0,0,0,0.25) 100%)`, border: "1px solid rgba(0,0,0,0.22)" }} />
      <div style={{ width: 2, height: 7, background: "linear-gradient(to bottom, rgba(110,90,70,0.9), rgba(50,40,30,0.55))", marginTop: -1 }} />
    </div>
  );
}

function WhiteboardCard(p: CardProps) {
  const [hovered, setHovered] = useState(false);
  const pts = p.projection != null ? Math.round(p.projection) : null;
  const up  = (p.priceChange ?? 0) > 0;
  const priceStr = p.priceChange != null ? `${up ? "+" : ""}${Math.round(p.priceChange / 1000)}k` : null;
  const rotation = CARD_ROTATIONS[p.index ?? 0] ?? -1.8;
  const paper    = STICKY_PAPERS[p.index ?? 0] ?? STICKY_PAPERS[0];

  return (
    <Link to={p.ctaTo} style={{ textDecoration: "none", display: "block", paddingTop: 14 }}>
      <div style={{ position: "relative" }}>
        <StickyPin color={p.color} />
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            background: paper.bg,
            backgroundImage: `repeating-linear-gradient(transparent, transparent 17px, ${paper.lines} 17px, ${paper.lines} 18px)`,
            borderRadius: 2, border: "1px solid rgba(0,0,0,0.10)",
            boxShadow: hovered
              ? "0 2px 4px rgba(0,0,0,0.22), 0 10px 24px rgba(0,0,0,0.26), 0 20px 44px rgba(0,0,0,0.18)"
              : "0 1px 3px rgba(0,0,0,0.16), 0 5px 14px rgba(0,0,0,0.20), 0 12px 28px rgba(0,0,0,0.16)",
            transform: hovered ? `rotate(${rotation}deg) translateY(-7px) scale(1.025)` : `rotate(${rotation}deg) translateY(0)`,
            transition: "all 0.22s ease", overflow: "visible", position: "relative",
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: "linear-gradient(to bottom, rgba(255,255,255,0.55), transparent)", borderRadius: "2px 2px 0 0", pointerEvents: "none" }} />

          {/* Header */}
          <div style={{ borderBottom: `1px solid ${paper.headerBorder}`, padding: "7px 10px 6px", display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: p.color, display: "flex", alignItems: "center", flexShrink: 0 }}>{p.icon}</span>
            <span style={{ fontSize: 7.5, fontWeight: 900, letterSpacing: "0.24em", textTransform: "uppercase", color: p.color, flex: 1 }}>{p.label}</span>
            {p.position && (
              <span style={{ fontSize: 7, fontWeight: 800, textTransform: "uppercase", background: `${p.color}16`, color: p.color, padding: "1px 4px", borderRadius: 3, border: `1px solid ${p.color}25` }}>{p.position}</span>
            )}
            {p.badge && (
              <span style={{ fontSize: 7, fontWeight: 900, textTransform: "uppercase", background: p.color, color: "#fff", padding: "1px 5px", borderRadius: 3 }}>{p.badge}</span>
            )}
          </div>

          {/* Player */}
          <div style={{ padding: "8px 10px 2px", display: "flex", alignItems: "center", gap: 7 }}>
            <PlayerAvatar name={p.playerName} color={p.color} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11.5, fontWeight: 800, color: "#1c1208", lineHeight: 1.2, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.playerName}</p>
              <p style={{ fontSize: 8, color: "#857060", marginTop: 1, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.team}</p>
            </div>
          </div>

          {/* Score */}
          <div style={{ padding: "1px 10px 4px", display: "flex", alignItems: "baseline", gap: 4 }}>
            {pts != null ? (
              <>
                <span style={{ fontSize: 26, fontWeight: 900, color: p.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{pts}</span>
                <span style={{ fontSize: 8.5, color: "#a08060", fontWeight: 700 }}>pts</span>
                {priceStr && (
                  <span style={{ fontSize: 7.5, fontWeight: 800, color: up ? "#1a5e22" : "#7a1818", background: up ? "#d8eed8" : "#f2dada", padding: "1px 4px", borderRadius: 3, marginLeft: 2, border: up ? "1px solid #b4d8b4" : "1px solid #e0b8b8" }}>
                    {up ? "▲" : "▼"}{priceStr}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: 13, color: "#bbb", fontWeight: 700 }}>—</span>
            )}
          </div>

          {/* Bullets */}
          {p.bullets.length > 0 && (
            <div style={{ padding: "2px 10px 7px", display: "flex", flexDirection: "column", gap: 3.5 }}>
              {p.bullets.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: `${p.color}50`, flexShrink: 0, marginTop: 4, border: `1px solid ${p.color}30` }} />
                  <span style={{ fontSize: 7.5, color: "#4a3828", fontWeight: 600, lineHeight: 1.45 }}>{b}</span>
                </div>
              ))}
            </div>
          )}

          {/* CTA */}
          <div style={{ padding: "0 9px 10px" }}>
            <div style={{ background: `linear-gradient(to bottom, ${p.color}ee, ${p.color})`, color: "#fff", fontSize: 7.5, fontWeight: 800, textAlign: "center", padding: "6px 8px", borderRadius: 4, letterSpacing: "0.07em", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 6px rgba(0,0,0,0.28)", display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
              {p.ctaLabel} <ChevronRight size={7} />
            </div>
          </div>

          <div style={{ position: "absolute", bottom: -2, right: 6, width: "38%", height: 5, boxShadow: "4px 5px 9px rgba(0,0,0,0.20)", borderRadius: "0 0 50% 50%", transform: "rotate(1.5deg)", pointerEvents: "none" }} />
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return <div style={{ height: 220, borderRadius: 4, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.08)" }} />;
}

// ── Rankings preview row ───────────────────────────────────────────────────────
function RankRow({ rank, player, locked }: { rank: number; player: RankingRow; locked: boolean }) {
  const category = (player.category ?? "").toLowerCase();
  const isBuySignal   = category === "target";
  const isAvoidSignal = category === "avoid";
  const pillColor = isBuySignal ? C.gold : isAvoidSignal ? C.red : C.textSec;
  const pillBg    = isBuySignal ? "rgba(244,197,66,0.12)" : isAvoidSignal ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)";
  const label = isBuySignal ? "Target" : isAvoidSignal ? "Avoid" : "Watch";

  if (locked) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}`, filter: "blur(3.5px)", userSelect: "none", pointerEvents: "none" }}>
        <span style={{ width: 28, fontSize: 12, fontWeight: 700, color: C.textSec, textAlign: "right", flexShrink: 0 }}>{rank}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ height: 13, background: "rgba(255,255,255,0.08)", borderRadius: 3, width: "60%" }} />
          <div style={{ height: 10, background: "rgba(255,255,255,0.05)", borderRadius: 3, width: "40%", marginTop: 4 }} />
        </div>
        <div style={{ width: 40, height: 20, background: "rgba(255,255,255,0.06)", borderRadius: 12 }} />
        <div style={{ width: 36, height: 13, background: "rgba(255,255,255,0.06)", borderRadius: 3 }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ width: 28, fontSize: 12, fontWeight: 700, color: C.textSec, textAlign: "right", flexShrink: 0 }}>#{rank}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: C.textPrim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player.player_name}</p>
        <p style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{player.position ?? ""} · {player.team}</p>
      </div>
      <span style={{ fontSize: 12, background: pillBg, color: pillColor, padding: "3px 10px", borderRadius: 999, border: `1px solid ${pillColor}28`, flexShrink: 0, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: C.textPrim, flexShrink: 0, fontVariantNumeric: "tabular-nums", minWidth: 38, textAlign: "right" }}>
        {player.projection != null ? Math.round(player.projection) : "—"}
        <span style={{ fontSize: 10, color: C.textSec, fontWeight: 500 }}> pts</span>
      </span>
    </div>
  );
}

// ── Market Watch card ──────────────────────────────────────────────────────────
function MWCard({ player, categoryColor }: { player: RankingRow; categoryColor: string }) {
  const priceK  = player.price != null ? `$${Math.round(player.price / 1000)}k` : null;
  const changeK = player.price_change != null ? `${player.price_change > 0 ? "+" : ""}${Math.round(player.price_change / 1000)}k` : null;
  const up = (player.price_change ?? 0) > 0;

  return (
    <div style={{ padding: "12px 0", borderBottom: `1px solid rgba(0,0,0,0.07)`, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: C.textDark, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player.player_name}</p>
        <p style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{player.position ?? ""} · {player.team}</p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        {priceK  && <p style={{ fontSize: 12.5, fontWeight: 700, color: C.textDark }}>{priceK}</p>}
        {changeK && <p style={{ fontSize: 11, fontWeight: 700, color: up ? "#16a34a" : "#dc2626", marginTop: 2 }}>{changeK}</p>}
      </div>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: categoryColor, flexShrink: 0 }} />
    </div>
  );
}

// ── Helpers — all classification delegated to canonical engine ─────────────────
function toMWRow(r: RankingRow): MWPlayerRow {
  const rawSignal = r.action ?? r.signal_tag ?? r.signal ?? null;
  return {
    ...r,
    player_id:      Number(r.player_id) || 0,
    is_bye:         r.is_bye ?? false,
    is_injured:     r.is_injured ?? false,
    display_signal: (rawSignal as MWPlayerRow["display_signal"]) ?? "WATCH",
    access_tier:    r.access_tier ?? "locked",
    team_name:      r.team_name ?? r.team ?? "",
    games_played:   r.games_played ?? null,
    cached_at:      r.cached_at ?? null,
    price:          r.price ?? 0,
  };
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Index() {
  const { isPremium } = useAuth();
  const [players, setPlayers] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_rankings_safe", {
        p_user_id: null, p_is_bot: false, p_limit: 200,
      });
      if (!error && data) setPlayers((data as Record<string, unknown>[]).map(mapRankingRow));
      setLoading(false);
    })();
  }, []);

  // ── All classification via canonical engine ────────────────────────────────
  const { mustBuyP, trapP, captainP, valueP, topRows, mwBuys, mwHolds, mwSells } = useMemo(() => {
    const mwInput: MWPlayerRow[] = players.map(toMWRow);
    const { buys, holds, sells } = classifyPlayers(mwInput);

    // Players eligible for hero selection: in engine buy or hold buckets, with a projection
    const playable = [...buys, ...holds].filter(p => p.projection != null);

    // Hero card selections
    const buysSorted = buys.filter(p => p.projection != null).sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0));
    const sellsSorted = sells.filter(p => p.projection != null).sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0));
    const byCap = [...playable].sort((a, b) => (b.captain_score ?? b.projection ?? 0) - (a.captain_score ?? a.projection ?? 0));

    const mustBuyP = buysSorted[0] ?? null;
    const trapP    = sellsSorted[0] ?? null;
    const captainP = byCap.find(p => p.player_id !== mustBuyP?.player_id) ?? null;
    const valueP   = buysSorted.find(p => p.player_id !== mustBuyP?.player_id) ?? null;

    // Rankings preview — top 12 sorted by neeko_rating
    const topRows = players
      .filter(p => p.projection != null)
      .sort((a, b) => (b.neeko_rating ?? b.projection ?? 0) - (a.neeko_rating ?? a.projection ?? 0))
      .slice(0, 12);

    return { mustBuyP, trapP, captainP, valueP, topRows, mwBuys: buys, mwHolds: holds, mwSells: sells };
  }, [players]);

  // ── Hero card bullet derivation — only from real fields ───────────────────
  function mustBuyBullets(): string[] {
    if (!mustBuyP) return [];
    const bullets: string[] = [];
    if (mustBuyP.price_change != null && mustBuyP.price_change > 0) {
      bullets.push(`+${Math.round(mustBuyP.price_change / 1000)}k above breakeven — price rise likely`);
    } else if (mustBuyP.season_avg != null && mustBuyP.projection != null && mustBuyP.projection > mustBuyP.season_avg) {
      bullets.push(`${Math.round(mustBuyP.projection - mustBuyP.season_avg)}pts above season avg — in form`);
    }
    const also = mwBuys.find(p => p.player_id !== mustBuyP.player_id);
    if (also) bullets.push(`Also consider: ${also.player_name}`);
    return bullets;
  }

  function trapBullets(): string[] {
    if (!trapP) return [];
    const bullets: string[] = [];
    if (trapP.breakeven != null && trapP.projection != null && trapP.projection < trapP.breakeven) {
      bullets.push(`Scoring below breakeven — price drop risk`);
    }
    const also = mwSells.find(p => p.player_id !== trapP.player_id);
    if (also) bullets.push(`Also flagged: ${also.player_name}`);
    return bullets;
  }

  function captainBullets(): string[] {
    if (!captainP) return [];
    const bullets: string[] = [];
    if (captainP.captain_rating) bullets.push(`${captainP.captain_rating} — top ranked captain`);
    const also = mwBuys.find(p => p.player_id !== captainP.player_id && p.player_id !== mustBuyP?.player_id);
    if (also) bullets.push(`Alt: ${also.player_name}`);
    return bullets;
  }

  function valueBullets(): string[] {
    if (!valueP) return [];
    const bullets: string[] = [];
    if (valueP.price != null && valueP.price > 0) {
      bullets.push(`Priced at $${Math.round(valueP.price / 1000)}k — strong value for projection`);
    }
    if (valueP.value_score != null && valueP.value_score > 0) {
      bullets.push(`Value score: ${valueP.value_score.toFixed(1)} — above-market edge`);
    }
    return bullets;
  }

  const FREE_PREVIEW = 5;

  const trustBar = [
    { icon: <Zap size={11} />,      text: "Updated before every round lockout" },
    { icon: <Database size={11} />, text: "Built from real AFL Fantasy data" },
    { icon: <Clock size={11} />,    text: "Takes 30 seconds to plan your week" },
  ];

  const allHeroReady = mustBuyP && trapP && captainP && valueP;

  const cards: CardProps[] = !loading && allHeroReady ? [
    {
      label: "Must Buy", icon: <TrendingUp size={9} />,
      color: "#1a6028",
      playerName: mustBuyP.player_name, team: mustBuyP.team ?? "", position: mustBuyP.position,
      projection: mustBuyP.projection, priceChange: mustBuyP.price_change,
      bullets: mustBuyBullets(),
      ctaLabel: "View Must Buys", ctaTo: "/sports/afl/current-round", index: 0,
    },
    {
      label: "Trap Alert", icon: <AlertTriangle size={9} />,
      color: "#881818",
      playerName: trapP.player_name, team: trapP.team ?? "", position: trapP.position,
      projection: trapP.projection, priceChange: trapP.price_change,
      bullets: trapBullets(),
      ctaLabel: "View Trap Alerts", ctaTo: "/sports/afl/current-round", index: 1,
    },
    {
      label: "Captain Pick", icon: <Star size={9} />, badge: "C",
      color: "#7a4800",
      playerName: captainP.player_name, team: captainP.team ?? "", position: captainP.position,
      projection: captainP.projection, priceChange: captainP.price_change,
      bullets: captainBullets(),
      ctaLabel: "View Captains", ctaTo: "/sports/afl/captains", index: 2,
    },
    {
      label: "Best Value", icon: <BarChart3 size={9} />,
      color: "#0d4278",
      playerName: valueP.player_name, team: valueP.team ?? "", position: valueP.position,
      projection: valueP.projection, priceChange: valueP.price_change,
      bullets: valueBullets(),
      ctaLabel: "Open Market Watch", ctaTo: "/sports/afl/market-watch", index: 3,
    },
  ] : [];

  const showSkeleton = loading || (!loading && !allHeroReady);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bgDark, overflowX: "hidden" }}>
      <Helmet>
        <title>Neeko Sports Stats — AFL Fantasy Coach's Desk</title>
        <meta name="description" content="Stop guessing. Win your AFL Fantasy week in 30 seconds. Trade targets, trap warnings, and captain picks powered by 600+ player projections — updated before every lockout." />
        <link rel="canonical" href="https://neekostats.com.au/" />
        <meta property="og:title" content="Neeko Sports Stats — AFL Fantasy Coach's Desk" />
        <meta property="og:description" content="Stop guessing. Win your AFL Fantasy week with trade targets, captain picks, and trap alerts powered by real AFL data." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="robots" content="index, follow" />
      </Helmet>

      {/* ══════════════════════════════════════════════════════
          SECTION 0 — HERO
      ══════════════════════════════════════════════════════ */}
      {isMobile ? (
        <section style={{
          position: "relative",
          backgroundImage: "url('/hero/image.png')",
          backgroundSize: "cover",
          backgroundPosition: "center 20%",
          backgroundRepeat: "no-repeat",
          paddingBottom: 48,
          minHeight: 450,
        }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1 }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "30%", background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(10,10,10,0.92) 70%, #0a0a0a 100%)", zIndex: 2 }} />

          <div style={{ position: "relative", zIndex: 10, padding: "12px 20px 24px", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.025em", color: "#ffffff", textShadow: "0 2px 20px rgba(0,0,0,0.9)", marginBottom: 8 }}>
              Stop Guessing.<br />
              <span style={{ color: C.gold }}>Start Winning</span> Your<br />
              AFL Fantasy Week.
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.90)", marginBottom: 20, lineHeight: 1.6, maxWidth: 320, margin: "0 auto 20px", textShadow: "0 1px 6px rgba(0,0,0,0.90)" }}>
              Trades, captains, and traps — powered by 600+ player projections updated every round.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, alignItems: "center", marginBottom: 28 }}>
              <Link to="/auth" style={{ display: "flex", alignItems: "center", gap: 7, background: C.gold, color: "#1a0e00", fontWeight: 800, fontSize: 14, padding: "12px 28px", borderRadius: 6, textDecoration: "none", letterSpacing: "0.02em", boxShadow: "0 4px 18px rgba(245,196,81,0.38)" }}>
                Unlock This Week's Game Plan <ArrowRight size={14} />
              </Link>
              {!isPremium && (
                <Link to="/sports/afl/current-round" style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)", fontWeight: 700, fontSize: 13, padding: "11px 24px", borderRadius: 6, textDecoration: "none", border: "1px solid rgba(255,255,255,0.20)", letterSpacing: "0.02em" }}>
                  View Free Picks
                </Link>
              )}
            </div>
          </div>

          <div style={{ position: "relative", zIndex: 10, padding: "0 16px 0" }}>
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(245,196,81,0.6)", marginBottom: 3 }}>This Week's Game Plan</p>
              <p style={{ fontSize: 9, color: "rgba(255,255,255,0.30)", fontWeight: 600, letterSpacing: "0.04em" }}>Updated Today · Data from 600+ players</p>
            </div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7, alignItems: "center" }}>
              {trustBar.map(({ icon, text }) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>
                  <span style={{ color: "rgba(245,196,81,0.90)" }}>{icon}</span>{text}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginTop: 16 }}>
              {showSkeleton
                ? [0,1,2,3].map(i => <SkeletonCard key={i} />)
                : cards.map(c => <WhiteboardCard key={c.label} {...c} />)
              }
            </div>

            <HeroNavPills style={{ marginTop: 22 }} />
          </div>
        </section>
      ) : (
        <section style={{ position: "relative", width: "100%", height: 800, overflow: "hidden", background: "#1a1008" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "url('/hero/image.png')", backgroundSize: "cover", backgroundRepeat: "no-repeat", backgroundPosition: "center 38%", zIndex: 0 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0.30) 32%, rgba(0,0,0,0.10) 55%, rgba(0,0,0,0.68) 100%)", zIndex: 1, pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.32) 100%)", zIndex: 2, pointerEvents: "none" }} />

          <div style={{ position: "relative", zIndex: 20, width: "100%", maxWidth: 900, margin: "0 auto", textAlign: "center", paddingTop: 128 }}>
            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(245,196,81,0.70)", marginBottom: 10, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
              AFL Fantasy Intelligence
            </p>
            <h1 style={{ margin: 0, fontSize: "clamp(1.98rem, 3.24vw, 2.79rem)", fontWeight: 900, lineHeight: 1.08, letterSpacing: "-0.025em", color: "#f5f5f5", textShadow: "0 2px 4px rgba(0,0,0,0.70), 0 8px 22px rgba(0,0,0,0.50)" }}>
              Stop Guessing. <span style={{ color: C.gold }}>Start Winning</span>
              <br />Your AFL Fantasy Week.
            </h1>
            <p style={{ marginTop: 9, fontSize: 14.4, color: "rgba(255,255,255,0.90)", lineHeight: 1.6, textShadow: "0 1px 6px rgba(0,0,0,0.90)", maxWidth: 504, margin: "9px auto 0" }}>
              Trades, captains, and traps — powered by 600+ player projections updated every round.
            </p>

            <div style={{ display: "flex", gap: 10.8, justifyContent: "center", marginTop: 12.6 }}>
              <Link to="/auth" style={{ display: "flex", alignItems: "center", gap: 7.2, background: "linear-gradient(to bottom, #fad52a, #d09800)", color: "#1a1000", fontWeight: 800, fontSize: 12.6, padding: "11.7px 23.4px", borderRadius: 6.3, textDecoration: "none", border: "1px solid rgba(0,0,0,0.20)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.42), 0 2px 0 rgba(0,0,0,0.32), 0 6px 16px rgba(0,0,0,0.30)", letterSpacing: "0.01em" }}>
                Unlock This Week's Game Plan <ArrowRight size={12.6} />
              </Link>
              <Link to="/sports/afl/current-round" style={{ display: "flex", alignItems: "center", gap: 7.2, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.24)", color: "#ffffff", fontWeight: 700, fontSize: 12.6, padding: "11.7px 23.4px", borderRadius: 6.3, textDecoration: "none", letterSpacing: "0.01em", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 12px rgba(0,0,0,0.30)" }}>
                View Free Picks
              </Link>
            </div>

            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 28, marginTop: 12 }}>
              {trustBar.map(({ icon, text }) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>
                  <span style={{ color: "rgba(244,197,66,0.90)" }}>{icon}</span>{text}
                </div>
              ))}
            </div>

            {/* Cards grid */}
            <div style={{ marginTop: 24, maxWidth: 1020, marginLeft: "auto", marginRight: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, width: "100%", alignItems: "end" }}>
                {showSkeleton
                  ? [0,1,2,3].map(i => <SkeletonCard key={i} />)
                  : cards.map((c) => (
                    <div key={c.label} style={{ display: "flex", flexDirection: "column" }}>
                      <WhiteboardCard {...c} />
                    </div>
                  ))
                }
              </div>

              <HeroNavPills style={{ marginTop: 24 }} />
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
          SECTION 1 — HOW NEEKO HELPS YOU WIN (light bg)
      ══════════════════════════════════════════════════════ */}
      <section style={{ background: C.bgLight, padding: "80px clamp(16px, 5vw, 40px)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.30em", textTransform: "uppercase", color: "#6B7280", marginBottom: 12 }}>Your Weekly Workflow</p>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 900, letterSpacing: "-0.025em", color: C.textDark, lineHeight: 1.15, marginBottom: 0 }}>
              How Neeko Helps You Win This Week
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            {[
              {
                icon: <Target size={22} />,
                title: "Find the right plays",
                desc: "See top projections, captain options, and must-buy players before lockout. No guessing — every pick backed by the data.",
                color: "#1a6028",
                to: "/sports/afl/rankings",
              },
              {
                icon: <TrendingUp size={22} />,
                title: "Trade with confidence",
                desc: "Spot undervalued players early and avoid overpriced traps. Our value engine tracks price momentum every round.",
                color: "#0d4278",
                to: "/sports/afl/market-watch",
              },
              {
                icon: <ListOrdered size={22} />,
                title: "Make faster decisions",
                desc: "Rankings, market watch, and player tools in one weekly workflow. Less time researching, more time winning.",
                color: "#7a4800",
                to: "/sports/afl/current-round",
              },
            ].map(({ icon, title, desc, color, to }) => (
              <Link key={title} to={to} style={{ textDecoration: "none" }}>
                <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "28px 24px", border: "1px solid rgba(0,0,0,0.05)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", transition: "all 0.2s ease", cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px rgba(0,0,0,0.10)`; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; (e.currentTarget as HTMLElement).style.transform = "none"; }}
                >
                  <div style={{ width: 46, height: 46, borderRadius: 10, background: `${color}12`, border: `1px solid ${color}20`, display: "flex", alignItems: "center", justifyContent: "center", color, marginBottom: 18 }}>
                    {icon}
                  </div>
                  <h3 style={{ fontSize: 16.5, fontWeight: 800, color: C.textDark, marginBottom: 10, letterSpacing: "-0.015em" }}>{title}</h3>
                  <p style={{ fontSize: 13.5, color: "#4B5563", lineHeight: 1.65 }}>{desc}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 16, color, fontWeight: 700, fontSize: 12.5 }}>
                    Explore <ChevronRight size={13} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 2 — RANKINGS PREVIEW (dark bg, real data)
      ══════════════════════════════════════════════════════ */}
      <section style={{ background: C.bgSection, padding: "80px clamp(16px, 5vw, 40px)" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.30em", textTransform: "uppercase", color: C.gold, marginBottom: 12, opacity: 0.8 }}>Live Data</p>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 900, letterSpacing: "-0.025em", color: C.textPrim, lineHeight: 1.15, marginBottom: 12 }}>
              This Week's Top Rankings
            </h2>
            <p style={{ fontSize: 14, color: C.textSec, maxWidth: 480, margin: "0 auto" }}>
              Ranked by the same canonical engine used by every Neeko subscriber — updated before every round lockout.
            </p>
          </div>

          {/* Table */}
          <div style={{ background: "#0B0F14", borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.03)" }}>
              <span style={{ width: 28, fontSize: 10, fontWeight: 700, color: C.textSec, textAlign: "right", flexShrink: 0, letterSpacing: "0.06em", textTransform: "uppercase" }}>#</span>
              <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: C.textSec, letterSpacing: "0.06em", textTransform: "uppercase" }}>Player</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.textSec, letterSpacing: "0.06em", textTransform: "uppercase" }}>Signal</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.textSec, letterSpacing: "0.06em", textTransform: "uppercase", minWidth: 38, textAlign: "right" }}>Proj</span>
            </div>

            <div style={{ padding: "0 20px" }}>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ width: 28, height: 13, background: "rgba(255,255,255,0.06)", borderRadius: 3 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 13, background: "rgba(255,255,255,0.08)", borderRadius: 3, width: "55%" }} />
                      <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 3, width: "35%", marginTop: 5 }} />
                    </div>
                    <div style={{ width: 50, height: 20, background: "rgba(255,255,255,0.06)", borderRadius: 12 }} />
                    <div style={{ width: 36, height: 13, background: "rgba(255,255,255,0.06)", borderRadius: 3 }} />
                  </div>
                ))
              ) : topRows.length === 0 ? (
                <p style={{ padding: "32px 0", textAlign: "center", color: C.textSec, fontSize: 13 }}>Rankings data unavailable.</p>
              ) : (
                topRows.map((player, i) => (
                  <RankRow key={player.player_id ?? i} rank={i + 1} player={player} locked={i >= FREE_PREVIEW} />
                ))
              )}
            </div>

            {/* Locked row overlay CTA */}
            {!loading && topRows.length > FREE_PREVIEW && (
              <div style={{ padding: "18px 20px", background: "linear-gradient(to bottom, rgba(11,15,20,0) 0%, #0B0F14 60%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <p style={{ fontSize: 12.5, color: C.textSec, textAlign: "center" }}>
                  Showing {FREE_PREVIEW} of {topRows[0].total_count ?? topRows.length}+ players
                </p>
                <Link to="/sports/afl/rankings" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.gold, color: "#1a1000", fontWeight: 800, fontSize: 13, padding: "10px 22px", borderRadius: 6, textDecoration: "none", letterSpacing: "0.02em" }}>
                  Unlock Full Rankings <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 3 — MARKET WATCH / TRADE VALUE (light bg, real data)
      ══════════════════════════════════════════════════════ */}
      <section style={{ background: C.bgLight, padding: "80px clamp(16px, 5vw, 40px)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.30em", textTransform: "uppercase", color: "#6B7280", marginBottom: 12 }}>Trade Intelligence</p>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 900, letterSpacing: "-0.025em", color: C.textDark, lineHeight: 1.15, marginBottom: 12 }}>
              Market Watch
            </h2>
            <p style={{ fontSize: 14, color: "#4B5563", maxWidth: 480, margin: "0 auto" }}>
              Real-time trade signals from the same value engine powering Market Watch — classified into three clear categories.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            {/* Target Buys */}
            <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "24px", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a" }} />
                <h3 style={{ fontSize: 14, fontWeight: 800, color: C.textDark, letterSpacing: "0.01em" }}>Target Buys</h3>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#6B7280" }}>{loading ? "—" : `${mwBuys.length} players`}</span>
              </div>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, padding: "12px 0", borderBottom: "1px solid rgba(0,0,0,0.06)", alignItems: "center" }}>
                    <div style={{ flex: 1 }}><div style={{ height: 13, background: "#f3f4f6", borderRadius: 3, width: "60%", marginBottom: 5 }} /><div style={{ height: 10, background: "#f3f4f6", borderRadius: 3, width: "40%" }} /></div>
                    <div style={{ width: 36, height: 13, background: "#f3f4f6", borderRadius: 3 }} />
                  </div>
                ))
              ) : mwBuys.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9CA3AF", padding: "16px 0", textAlign: "center" }}>No targets this round</p>
              ) : (
                mwBuys.slice(0, 4).map((p) => <MWCard key={p.player_id} player={p as unknown as RankingRow} categoryColor="#16a34a" />)
              )}
              <Link to="/sports/afl/market-watch" style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 16, color: "#16a34a", fontWeight: 700, fontSize: 12.5, textDecoration: "none" }}>
                View All Targets <ChevronRight size={13} />
              </Link>
            </div>

            {/* Watch List — from engine holds bucket */}
            <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "24px", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#d97706" }} />
                <h3 style={{ fontSize: 14, fontWeight: 800, color: C.textDark, letterSpacing: "0.01em" }}>Watch List</h3>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#6B7280" }}>{loading ? "—" : `${mwHolds.length} players`}</span>
              </div>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, padding: "12px 0", borderBottom: "1px solid rgba(0,0,0,0.06)", alignItems: "center" }}>
                    <div style={{ flex: 1 }}><div style={{ height: 13, background: "#f3f4f6", borderRadius: 3, width: "60%", marginBottom: 5 }} /><div style={{ height: 10, background: "#f3f4f6", borderRadius: 3, width: "40%" }} /></div>
                    <div style={{ width: 36, height: 13, background: "#f3f4f6", borderRadius: 3 }} />
                  </div>
                ))
              ) : mwHolds.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9CA3AF", padding: "16px 0", textAlign: "center" }}>No watch list data</p>
              ) : (
                mwHolds
                  .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
                  .slice(0, 4)
                  .map((p) => <MWCard key={p.player_id} player={p as unknown as RankingRow} categoryColor="#d97706" />)
              )}
              <Link to="/sports/afl/market-watch" style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 16, color: "#d97706", fontWeight: 700, fontSize: 12.5, textDecoration: "none" }}>
                View Watch List <ChevronRight size={13} />
              </Link>
            </div>

            {/* Traps */}
            <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "24px", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.red }} />
                <h3 style={{ fontSize: 14, fontWeight: 800, color: C.textDark, letterSpacing: "0.01em" }}>Traps</h3>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#6B7280" }}>{loading ? "—" : `${mwSells.length} players`}</span>
              </div>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, padding: "12px 0", borderBottom: "1px solid rgba(0,0,0,0.06)", alignItems: "center" }}>
                    <div style={{ flex: 1 }}><div style={{ height: 13, background: "#f3f4f6", borderRadius: 3, width: "60%", marginBottom: 5 }} /><div style={{ height: 10, background: "#f3f4f6", borderRadius: 3, width: "40%" }} /></div>
                    <div style={{ width: 36, height: 13, background: "#f3f4f6", borderRadius: 3 }} />
                  </div>
                ))
              ) : mwSells.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9CA3AF", padding: "16px 0", textAlign: "center" }}>No traps flagged this round</p>
              ) : (
                mwSells.slice(0, 4).map((p) => <MWCard key={p.player_id} player={p as unknown as RankingRow} categoryColor={C.red} />)
              )}
              <Link to="/sports/afl/market-watch" style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 16, color: C.red, fontWeight: 700, fontSize: 12.5, textDecoration: "none" }}>
                View All Traps <ChevronRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 4 — EVERYTHING IN NEEKO+ (dark bg)
      ══════════════════════════════════════════════════════ */}
      <section style={{ background: C.bgSection, padding: "80px clamp(16px, 5vw, 40px)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.30em", textTransform: "uppercase", color: C.gold, marginBottom: 12, opacity: 0.8 }}>Neeko+</p>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 900, letterSpacing: "-0.025em", color: C.textPrim, lineHeight: 1.15, marginBottom: 12 }}>
              Everything Included in Neeko+
            </h2>
            <p style={{ fontSize: 14, color: C.textSec, maxWidth: 480, margin: "0 auto" }}>
              One subscription. Every tool you need to win your AFL Fantasy league.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {[
              { icon: <ListOrdered size={20} />, title: "Full Rankings", desc: "600+ players ranked weekly by projection, value, and form. Every position, every round.", to: "/sports/afl/rankings", color: "#1a6028" },
              { icon: <TrendingUp size={20} />, title: "Market Watch", desc: "Trade signals, price changes, and breakeven tracking — all in one clean view.", to: "/sports/afl/market-watch", color: "#0d4278" },
              { icon: <Zap size={20} />, title: "Edge Board", desc: "Must-have, breakout, and avoid lists generated from the ranking engine each round.", to: "/sports/afl/current-round", color: "#7a4800" },
              { icon: <GitCompare size={20} />, title: "Start / Sit", desc: "Head-to-head AI decisions for your toughest selection dilemmas.", to: "/sports/afl/start-sit", color: "#881818" },
              { icon: <Star size={20} />, title: "Captain Picks", desc: "Data-backed captain recommendations with confidence scores and matchup context.", to: "/sports/afl/captains", color: "#0d4278" },
              { icon: <Users size={20} />, title: "Player Profiles", desc: "Deep dive on any player — projection history, scores, matchups, and AI summary.", to: "/sports/afl/rankings", color: "#1a6028" },
            ].map(({ icon, title, desc, to, color }) => (
              <Link key={title} to={to} style={{ textDecoration: "none" }}>
                <div style={{ background: C.bgDark, borderRadius: 10, padding: "22px 20px", border: `1px solid ${C.border}`, display: "flex", gap: 14, alignItems: "flex-start", transition: "all 0.18s ease" }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = `${color}35`; el.style.background = "#0f141a"; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.border; el.style.background = C.bgDark; }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 8, background: `${color}18`, border: `1px solid ${color}25`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
                    {icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <h3 style={{ fontSize: 14.5, fontWeight: 800, color: C.textPrim }}>{title}</h3>
                      <ChevronRight size={14} style={{ color: C.textSec, flexShrink: 0 }} />
                    </div>
                    <p style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 5 — WHY NEEKO WINS (light bg, editorial)
      ══════════════════════════════════════════════════════ */}
      <section style={{ background: C.bgLight, padding: "80px clamp(16px, 5vw, 40px)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 900, letterSpacing: "-0.025em", color: C.textDark, lineHeight: 1.15, marginBottom: 12 }}>
              Why Neeko Coaches Win
            </h2>
            <p style={{ fontSize: 14, color: "#4B5563", maxWidth: 400, margin: "0 auto" }}>
              The difference between guessing and knowing — every round.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* Typical Coaches */}
            <div style={{ background: "#fff5f5", borderRadius: 12, padding: "28px 24px", border: "1px solid rgba(239,68,68,0.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
                <ShieldAlert size={16} style={{ color: C.red }} />
                <h3 style={{ fontSize: 14, fontWeight: 800, color: "#b91c1c" }}>Typical Coaches</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  "Chase last week's top score",
                  "Trade on hype and Reddit threads",
                  "Pick captains by gut feel",
                  "Ignore matchup difficulty",
                  "Discover traps after lockout",
                ].map(t => (
                  <div key={t} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(239,68,68,0.40)", flexShrink: 0, marginTop: 5 }} />
                    <span style={{ fontSize: 13.5, color: "#6B7280", lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Neeko Coaches */}
            <div style={{ background: "#f0fdf4", borderRadius: 12, padding: "28px 24px", border: "1px solid rgba(34,197,94,0.15)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
                <Star size={16} style={{ color: "#16a34a" }} />
                <h3 style={{ fontSize: 14, fontWeight: 800, color: "#15803d" }}>Neeko Coaches</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  "Projection-based decisions, every round",
                  "Value-driven trades before price rises",
                  "Data-backed captains with confidence scores",
                  "Matchup-aware picks from the engine",
                  "Trap alerts before lockout, every week",
                ].map(t => (
                  <div key={t} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <Check size={14} style={{ color: "#16a34a", flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.5, fontWeight: 500 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 6 — FINAL CTA / PRICING (dark bg)
      ══════════════════════════════════════════════════════ */}
      <section style={{ background: C.bgDark, padding: "80px clamp(16px, 5vw, 40px) 64px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 900, letterSpacing: "-0.025em", color: C.textPrim, lineHeight: 1.15, marginBottom: 14 }}>
              Start Winning With Neeko+
            </h2>
            <p style={{ fontSize: 14, color: C.textSec, maxWidth: 440, margin: "0 auto" }}>
              Join AFL Fantasy coaches who plan every round with data, not guesswork.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, alignItems: "start", maxWidth: 860, margin: "0 auto" }}>
            {/* Free */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "28px 24px" }}>
              <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.26em", textTransform: "uppercase", color: C.textSec, marginBottom: 14 }}>Free Plan</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 22 }}>
                <span style={{ fontSize: 38, fontWeight: 900, color: C.textPrim }}>$0</span>
                <span style={{ fontSize: 13, color: C.textSec }}>/month</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 24 }}>
                {["Top player rankings preview", "Must Buy snapshot each round", "Round summary overview"].map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Check size={12} style={{ color: C.green, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>{f}</span>
                  </div>
                ))}
              </div>
              <Link to="/auth" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.55)", fontWeight: 700, fontSize: 13, padding: "10px 16px", borderRadius: 6, border: `1px solid ${C.border}`, textDecoration: "none", letterSpacing: "0.03em" }}>
                Get Started Free
              </Link>
            </div>

            {/* Premium — highlighted */}
            <div style={{ background: "linear-gradient(160deg, #1a1206 0%, #120d04 100%)", border: "1.5px solid rgba(244,197,66,0.30)", borderRadius: 12, padding: "28px 24px", boxShadow: "0 10px 44px rgba(244,197,66,0.08)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(244,197,66,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.26em", textTransform: "uppercase", color: C.gold }}>Neeko+</p>
                <span style={{ fontSize: 8.5, fontWeight: 800, background: C.gold, color: "#1a0e00", padding: "3px 8px", borderRadius: 4, letterSpacing: "0.08em" }}>BEST VALUE</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 38, fontWeight: 900, color: C.textPrim }}>${NEEKO_PRICING.yearly.monthlyEquivalent}</span>
                <span style={{ fontSize: 13, color: C.textSec }}>/month</span>
              </div>
              <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.25)", marginBottom: 22 }}>
                Billed ${NEEKO_PRICING.yearly.price}/year · Save {NEEKO_PRICING.savingsPercent}% vs monthly
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 24 }}>
                {[
                  "Full rankings — 600+ players",
                  "Must Buys & Trap Alerts",
                  "Captain picks with confidence scores",
                  "Market Watch & price change tracking",
                  "Start/Sit AI decisions",
                  "Updated before every round lockout",
                ].map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Check size={12} style={{ color: C.gold, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.60)" }}>{f}</span>
                  </div>
                ))}
              </div>
              <Link to="/neeko-plus" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: C.gold, color: "#1a0e00", fontWeight: 800, fontSize: 14, padding: "12px 16px", borderRadius: 6, textDecoration: "none", boxShadow: "0 4px 18px rgba(244,197,66,0.30), inset 0 1px 0 rgba(255,255,255,0.26)", letterSpacing: "0.03em" }}>
                <Crown size={13} /> Unlock Full Access
              </Link>
            </div>

            {/* Monthly option */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "28px 24px" }}>
              <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.26em", textTransform: "uppercase", color: C.textSec, marginBottom: 14 }}>Monthly Plan</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 22 }}>
                <span style={{ fontSize: 38, fontWeight: 900, color: C.textPrim }}>${NEEKO_PRICING.monthly.price}</span>
                <span style={{ fontSize: 13, color: C.textSec }}>/month</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 24 }}>
                {[
                  "Everything in Neeko+",
                  "Cancel anytime",
                  "No annual commitment",
                ].map(f => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Check size={12} style={{ color: C.green, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>{f}</span>
                  </div>
                ))}
              </div>
              <Link to="/neeko-plus" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.55)", fontWeight: 700, fontSize: 13, padding: "10px 16px", borderRadius: 6, border: `1px solid ${C.border}`, textDecoration: "none", letterSpacing: "0.03em" }}>
                Start Monthly
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer style={{ background: "#07090d", borderTop: `1px solid ${C.border}`, padding: "20px clamp(16px, 4vw, 32px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.14)" }}>© {new Date().getFullYear()} Neeko Sports Stats</p>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            {[{ l: "Policies", t: "/policies" }, { l: "Contact", t: "/contact" }, { l: "About", t: "/about" }, { l: "FAQ", t: "/faq" }].map(x => (
              <Link key={x.t} to={x.t}
                style={{ fontSize: 11, color: "rgba(255,255,255,0.16)", textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.48)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.16)"; }}
              >{x.l}</Link>
            ))}
          </div>
        </div>
      </footer>

      {!isPremium && <MobileUpgradeBar />}
    </div>
  );
}
