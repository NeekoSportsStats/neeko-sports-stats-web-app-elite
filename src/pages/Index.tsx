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
        <>
          <style>{`
            .hero-outer {
              width: 100%;
              display: flex;
              justify-content: center;
              overflow: hidden;
              background: #1a1008;
            }
            .hero-inner {
              width: 1200px;
              height: 720px;
              position: relative;
              flex-shrink: 0;
              transform-origin: top center;
            }
            @media (max-width: 1300px) {
              .hero-outer { height: calc(720px * 0.92); }
              .hero-inner { transform: scale(0.92); }
            }
            @media (max-width: 1150px) {
              .hero-outer { height: calc(720px * 0.84); }
              .hero-inner { transform: scale(0.84); }
            }
            @media (max-width: 1000px) {
              .hero-outer { height: calc(720px * 0.74); }
              .hero-inner { transform: scale(0.74); }
            }
            @media (max-width: 860px) {
              .hero-outer { height: calc(720px * 0.64); }
              .hero-inner { transform: scale(0.64); }
            }
          `}</style>

          <section className="hero-outer">
            <div className="hero-inner">
              {/* Background fills the locked inner frame */}
              <div style={{ position: "absolute", inset: 0, backgroundImage: "url('/hero/image.png')", backgroundSize: "cover", backgroundRepeat: "no-repeat", backgroundPosition: "center 38%", zIndex: 0 }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.28) 35%, rgba(0,0,0,0.12) 56%, rgba(0,0,0,0.74) 100%)", zIndex: 1, pointerEvents: "none" }} />
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.30) 100%)", zIndex: 2, pointerEvents: "none" }} />

              {/* Headline block — absolutely positioned, pixel-perfect */}
              <div style={{ position: "absolute", top: 110, left: "50%", transform: "translateX(-50%)", width: 700, textAlign: "center", zIndex: 20 }}>
                <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(245,196,81,0.70)", marginBottom: 10, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
                  AFL Fantasy Intelligence
                </p>
                <h1 style={{ margin: 0, fontSize: "2.65rem", fontWeight: 900, lineHeight: 1.08, letterSpacing: "-0.025em", color: "#f5f5f5", textShadow: "0 2px 4px rgba(0,0,0,0.70), 0 8px 22px rgba(0,0,0,0.50)" }}>
                  Stop Guessing. <span style={{ color: C.gold }}>Start Winning</span>
                  <br />Your AFL Fantasy Week.
                </h1>
                <p style={{ marginTop: 14, fontSize: 14.5, color: "rgba(255,255,255,0.90)", lineHeight: 1.6, textShadow: "0 1px 6px rgba(0,0,0,0.90)" }}>
                  Trades, captains, and traps — powered by 600+ player projections updated every round.
                </p>

                {/* CTA row */}
                <div style={{ display: "flex", gap: 11, justifyContent: "center", marginTop: 22 }}>
                  <Link to="/auth" style={{ display: "flex", alignItems: "center", gap: 7, background: "linear-gradient(to bottom, #fad52a, #d09800)", color: "#1a1000", fontWeight: 800, fontSize: 13, padding: "12px 24px", borderRadius: 7, textDecoration: "none", border: "1px solid rgba(0,0,0,0.20)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.42), 0 2px 0 rgba(0,0,0,0.32), 0 6px 16px rgba(0,0,0,0.30)", letterSpacing: "0.01em", whiteSpace: "nowrap" }}>
                    Unlock This Week's Game Plan <ArrowRight size={13} />
                  </Link>
                  <Link to="/sports/afl/current-round" style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.24)", color: "#ffffff", fontWeight: 700, fontSize: 13, padding: "12px 24px", borderRadius: 7, textDecoration: "none", letterSpacing: "0.01em", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 12px rgba(0,0,0,0.30)", whiteSpace: "nowrap" }}>
                    View Free Picks
                  </Link>
                </div>

                {/* Trust strip */}
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 24, marginTop: 14 }}>
                  {trustBar.map(({ icon, text }) => (
                    <div key={text} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "rgba(255,255,255,0.75)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      <span style={{ color: "rgba(244,197,66,0.90)" }}>{icon}</span>{text}
                    </div>
                  ))}
                </div>
              </div>

              {/* Cards row — absolutely positioned, pixel-perfect */}
              <div style={{ position: "absolute", bottom: 90, left: "50%", transform: "translateX(-50%)", width: 980, display: "flex", gap: 18, justifyContent: "space-between", zIndex: 20 }}>
                {showSkeleton
                  ? [0,1,2,3].map(i => (
                    <div key={i} style={{ flex: "0 0 230px", width: 230 }}>
                      <SkeletonCard />
                    </div>
                  ))
                  : cards.map((c) => (
                    <div key={c.label} style={{ flex: "0 0 230px", width: 230 }}>
                      <WhiteboardCard {...c} />
                    </div>
                  ))
                }
              </div>

              {/* Nav pills — absolutely positioned at bottom */}
              <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 20, width: 980 }}>
                <HeroNavPills />
              </div>
            </div>
          </section>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          GOLD TRANSITION BAND — hero → content bridge
      ══════════════════════════════════════════════════════ */}
      <div style={{ width: "100%", height: 3, background: "linear-gradient(to right, transparent 0%, rgba(224,174,45,0.18) 15%, rgba(224,174,45,0.55) 40%, rgba(224,174,45,0.55) 60%, rgba(224,174,45,0.18) 85%, transparent 100%)" }} />
      <div style={{ width: "100%", height: 72, background: "linear-gradient(to bottom, #1A1411 0%, #0d0b09 100%)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(224,174,45,0.07) 0%, transparent 70%)" }} />
      </div>

      {/* ══════════════════════════════════════════════════════
          SECTION 1 — DOMINATE SECTION
      ══════════════════════════════════════════════════════ */}
      <section style={{ background: "linear-gradient(180deg, #0d0b09 0%, #110e0b 60%, #1A1411 100%)", padding: "0 clamp(16px, 5vw, 40px) 96px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {/* Section header */}
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.42em", textTransform: "uppercase", color: "rgba(224,174,45,0.65)", marginBottom: 14 }}>Your Weekly Game Plan</p>
            <h2 style={{ fontSize: "clamp(1.8rem, 3.2vw, 2.6rem)", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.1, marginBottom: 16 }}>
              Dominate Your AFL Fantasy<br />
              <span style={{ color: "#E0AE2D" }}>This Round</span>
            </h2>
            <p style={{ fontSize: 15, color: "#A0A0A0", maxWidth: 520, margin: "0 auto", lineHeight: 1.65 }}>
              Every tool you need — trades, captains, traps, and rankings — built from 630+ player projections and updated before every lockout.
            </p>
          </div>

          {/* Nav pills row */}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 60 }}>
            {[
              { label: "Rankings", icon: <BarChart3 size={15} />, to: "/sports/afl/rankings", color: "#1a6028" },
              { label: "Market Watch", icon: <TrendingUp size={15} />, to: "/sports/afl/market-watch", color: "#0d4278" },
              { label: "Trap Alerts", icon: <AlertTriangle size={15} />, to: "/sports/afl/current-round", color: "#881818" },
              { label: "Captains", icon: <Star size={15} />, to: "/sports/afl/captains", color: "#7a4800" },
            ].map(({ label, icon, to, color }) => (
              <Link key={to} to={to} style={{ textDecoration: "none" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 999, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(224,174,45,0.18)", color: "#E0AE2D", fontSize: 13, fontWeight: 700, letterSpacing: "0.01em", boxShadow: "0 0 0 0 rgba(224,174,45,0)", transition: "all 0.18s ease", whiteSpace: "nowrap" }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = "rgba(224,174,45,0.10)"; el.style.borderColor = "rgba(224,174,45,0.40)"; el.style.boxShadow = "0 0 16px rgba(224,174,45,0.12)"; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = "rgba(255,255,255,0.04)"; el.style.borderColor = "rgba(224,174,45,0.18)"; el.style.boxShadow = "none"; }}
                >
                  <span style={{ color }}>{icon}</span>
                  {label}
                </div>
              </Link>
            ))}
          </div>

          {/* 3 feature cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
            {[
              {
                num: "01",
                title: "Find Your Must-Buy Targets",
                desc: "See which players are projecting above their price point — value engine signals updated every round before lockout.",
                cta: "View Rankings",
                to: "/sports/afl/rankings",
                color: "#E0AE2D",
              },
              {
                num: "02",
                title: "Spot Traps Before Lockout",
                desc: "Players flagged as overpriced or underperforming — avoid costly mistakes with data-driven trap alerts each week.",
                cta: "Open Market Watch",
                to: "/sports/afl/market-watch",
                color: "#EF4444",
              },
              {
                num: "03",
                title: "Lock In Your Captain Pick",
                desc: "Confidence-scored captain recommendations backed by projection data, matchup difficulty, and recent form.",
                cta: "View Captains",
                to: "/sports/afl/captains",
                color: "#22C55E",
              },
            ].map(({ num, title, desc, cta, to, color }) => (
              <Link key={num} to={to} style={{ textDecoration: "none" }}>
                <div style={{ background: "rgba(255,255,255,0.028)", backdropFilter: "blur(8px)", border: `1px solid rgba(224,174,45,0.14)`, borderRadius: 14, padding: "28px 26px 24px", position: "relative", overflow: "hidden", transition: "all 0.22s ease", cursor: "pointer", height: "100%", boxSizing: "border-box" }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = "rgba(255,255,255,0.05)"; el.style.borderColor = "rgba(224,174,45,0.32)"; el.style.boxShadow = "0 8px 40px rgba(0,0,0,0.40), 0 0 0 1px rgba(224,174,45,0.12) inset"; el.style.transform = "translateY(-3px)"; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = "rgba(255,255,255,0.028)"; el.style.borderColor = "rgba(224,174,45,0.14)"; el.style.boxShadow = "none"; el.style.transform = "none"; }}
                >
                  <div style={{ position: "absolute", top: -30, right: -20, fontSize: 72, fontWeight: 900, color: "rgba(224,174,45,0.045)", lineHeight: 1, letterSpacing: "-0.04em", userSelect: "none", pointerEvents: "none" }}>{num}</div>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right, transparent, ${color}60, transparent)`, borderRadius: "14px 14px 0 0" }} />
                  <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.30em", textTransform: "uppercase", color: "rgba(224,174,45,0.55)", marginBottom: 14 }}>{num}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: "#F5F5F5", lineHeight: 1.25, marginBottom: 12, letterSpacing: "-0.02em" }}>{title}</h3>
                  <p style={{ fontSize: 13.5, color: "#808080", lineHeight: 1.65, marginBottom: 22 }}>{desc}</p>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: "#E0AE2D" }}>
                    {cta} <ChevronRight size={13} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 2 — RANKINGS PREVIEW (dark, real data)
      ══════════════════════════════════════════════════════ */}
      <section style={{ background: "#0d0b09", padding: "88px clamp(16px, 5vw, 40px)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.42em", textTransform: "uppercase", color: "rgba(224,174,45,0.65)", marginBottom: 14 }}>Live Data</p>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.3rem)", fontWeight: 900, letterSpacing: "-0.025em", color: "#F5F5F5", lineHeight: 1.12, marginBottom: 14 }}>
              This Week's Top Rankings
            </h2>
            <p style={{ fontSize: 14, color: "#6A6A6A", maxWidth: 480, margin: "0 auto" }}>
              Ranked by the same canonical engine — updated before every round lockout.
            </p>
          </div>

          <div style={{ background: "rgba(255,255,255,0.025)", borderRadius: 14, border: "1px solid rgba(224,174,45,0.12)", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.50)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(224,174,45,0.04)" }}>
              <span style={{ width: 28, fontSize: 9.5, fontWeight: 800, color: "#525252", textAlign: "right", flexShrink: 0, letterSpacing: "0.08em", textTransform: "uppercase" }}>#</span>
              <span style={{ flex: 1, fontSize: 9.5, fontWeight: 800, color: "#525252", letterSpacing: "0.08em", textTransform: "uppercase" }}>Player</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: "#525252", letterSpacing: "0.08em", textTransform: "uppercase" }}>Signal</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: "#525252", letterSpacing: "0.08em", textTransform: "uppercase", minWidth: 42, textAlign: "right" }}>Proj</span>
            </div>

            <div style={{ padding: "0 22px" }}>
              {loading ? (
                Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ width: 28, height: 12, background: "rgba(255,255,255,0.05)", borderRadius: 3 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 13, background: "rgba(255,255,255,0.07)", borderRadius: 3, width: "52%" }} />
                      <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 3, width: "32%", marginTop: 5 }} />
                    </div>
                    <div style={{ width: 52, height: 20, background: "rgba(255,255,255,0.05)", borderRadius: 12 }} />
                    <div style={{ width: 38, height: 13, background: "rgba(255,255,255,0.05)", borderRadius: 3 }} />
                  </div>
                ))
              ) : topRows.length === 0 ? (
                <p style={{ padding: "32px 0", textAlign: "center", color: "#525252", fontSize: 13 }}>Rankings data unavailable.</p>
              ) : (
                topRows.map((player, i) => (
                  <RankRow key={player.player_id ?? i} rank={i + 1} player={player} locked={i >= FREE_PREVIEW} />
                ))
              )}
            </div>

            {!loading && topRows.length > FREE_PREVIEW && (
              <div style={{ padding: "20px 22px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, background: "rgba(224,174,45,0.03)" }}>
                <p style={{ fontSize: 12.5, color: "#525252", textAlign: "center" }}>
                  Showing {FREE_PREVIEW} of {topRows[0].total_count ?? topRows.length}+ players
                </p>
                <Link to="/sports/afl/rankings" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#E0AE2D", color: "#1a0e00", fontWeight: 800, fontSize: 13, padding: "10px 24px", borderRadius: 7, textDecoration: "none", boxShadow: "0 4px 18px rgba(224,174,45,0.28)" }}>
                  Unlock Full Rankings <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 3 — MARKET WATCH (dark, real data)
      ══════════════════════════════════════════════════════ */}
      <section style={{ background: "linear-gradient(180deg, #0d0b09 0%, #1A1411 100%)", padding: "88px clamp(16px, 5vw, 40px)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.42em", textTransform: "uppercase", color: "rgba(224,174,45,0.65)", marginBottom: 14 }}>Trade Intelligence</p>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.3rem)", fontWeight: 900, letterSpacing: "-0.025em", color: "#F5F5F5", lineHeight: 1.12, marginBottom: 14 }}>
              Market Watch
            </h2>
            <p style={{ fontSize: 14, color: "#6A6A6A", maxWidth: 480, margin: "0 auto" }}>
              Real-time trade signals — classified into three categories before every round.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
            {/* Target Buys */}
            {[
              { key: "buys", label: "Target Buys", color: "#22C55E", borderColor: "rgba(34,197,94,0.22)", count: mwBuys.length, players: mwBuys.slice(0, 4), emptyMsg: "No targets this round", cta: "View All Targets", dotColor: "#22C55E" },
              { key: "holds", label: "Watch List", color: "#E0AE2D", borderColor: "rgba(224,174,45,0.22)", count: mwHolds.length, players: [...mwHolds].sort((a,b) => (b.projection??0)-(a.projection??0)).slice(0,4), emptyMsg: "No watch list data", cta: "View Watch List", dotColor: "#E0AE2D" },
              { key: "sells", label: "Trap Alerts", color: "#EF4444", borderColor: "rgba(239,68,68,0.22)", count: mwSells.length, players: mwSells.slice(0, 4), emptyMsg: "No traps flagged", cta: "View All Traps", dotColor: "#EF4444" },
            ].map(({ key, label, color, borderColor, count, players, emptyMsg, cta, dotColor }) => (
              <div key={key} style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${borderColor}`, borderRadius: 14, padding: "24px", overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right, transparent, ${color}55, transparent)` }} />
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 22 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, boxShadow: `0 0 8px ${dotColor}60`, flexShrink: 0 }} />
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: "#F5F5F5", letterSpacing: "0.01em" }}>{label}</h3>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#525252", fontWeight: 600 }}>{loading ? "—" : `${count} players`}</span>
                </div>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", alignItems: "center" }}>
                      <div style={{ flex: 1 }}><div style={{ height: 13, background: "rgba(255,255,255,0.07)", borderRadius: 3, width: "60%", marginBottom: 5 }} /><div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 3, width: "40%" }} /></div>
                      <div style={{ width: 36, height: 13, background: "rgba(255,255,255,0.05)", borderRadius: 3 }} />
                    </div>
                  ))
                ) : players.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#525252", padding: "16px 0", textAlign: "center" }}>{emptyMsg}</p>
                ) : (
                  players.map((p) => {
                    const priceK = p.price != null ? `$${Math.round(p.price / 1000)}k` : null;
                    const chgK = p.price_change != null ? `${p.price_change > 0 ? "+" : ""}${Math.round(p.price_change / 1000)}k` : null;
                    const up2 = (p.price_change ?? 0) > 0;
                    return (
                      <div key={p.player_id} style={{ padding: "11px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13.5, fontWeight: 700, color: "#EAEAEA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.player_name}</p>
                          <p style={{ fontSize: 11, color: "#525252", marginTop: 2 }}>{p.position ?? ""}{p.position ? " · " : ""}{p.team}</p>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          {priceK && <p style={{ fontSize: 12, fontWeight: 700, color: "#A0A0A0" }}>{priceK}</p>}
                          {chgK && <p style={{ fontSize: 11, fontWeight: 700, color: up2 ? "#22C55E" : "#EF4444", marginTop: 1 }}>{chgK}</p>}
                        </div>
                      </div>
                    );
                  })
                )}
                <Link to="/sports/afl/market-watch" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 16, color, fontWeight: 700, fontSize: 12.5, textDecoration: "none", opacity: 0.9 }}>
                  {cta} <ChevronRight size={13} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 4 — VALUE + PRICING (dark, embedded)
      ══════════════════════════════════════════════════════ */}
      <section style={{ background: "#0d0b09", padding: "96px clamp(16px, 5vw, 40px) 96px", position: "relative", overflow: "hidden" }}>
        {/* Ambient glow */}
        <div style={{ position: "absolute", top: "30%", left: "50%", transform: "translate(-50%, -50%)", width: 700, height: 400, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(224,174,45,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>

            {/* Left — value bullets */}
            <div>
              <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.42em", textTransform: "uppercase", color: "rgba(224,174,45,0.65)", marginBottom: 18 }}>Why Neeko+</p>
              <h2 style={{ fontSize: "clamp(1.7rem, 2.8vw, 2.4rem)", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.15, marginBottom: 32 }}>
                Everything You Need to<br />
                <span style={{ color: "#E0AE2D" }}>Win Every Round</span>
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {[
                  { icon: <Database size={16} />, title: "630+ Player Projections", desc: "Full AFL roster coverage — updated before every round lockout." },
                  { icon: <TrendingUp size={16} />, title: "Live Price Intelligence", desc: "Track breakevens, spot price rises early, and avoid costly traps." },
                  { icon: <Star size={16} />, title: "Captain & Start/Sit Decisions", desc: "Confidence-scored picks backed by matchup data and form trends." },
                  { icon: <Zap size={16} />, title: "30-Second Weekly Workflow", desc: "Rankings, edge board, and market signals — all in one clean system." },
                ].map(({ icon, title, desc }) => (
                  <div key={title} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(224,174,45,0.10)", border: "1px solid rgba(224,174,45,0.20)", display: "flex", alignItems: "center", justifyContent: "center", color: "#E0AE2D", flexShrink: 0, marginTop: 1 }}>
                      {icon}
                    </div>
                    <div>
                      <p style={{ fontSize: 14.5, fontWeight: 800, color: "#F5F5F5", marginBottom: 4, letterSpacing: "-0.01em" }}>{title}</p>
                      <p style={{ fontSize: 13, color: "#6A6A6A", lineHeight: 1.6 }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — pricing card embedded in dark bg */}
            <div>
              {/* Annual plan — premium highlighted */}
              <div style={{ background: "linear-gradient(160deg, #1c1507 0%, #110e04 100%)", border: "1.5px solid rgba(224,174,45,0.35)", borderRadius: 16, padding: "36px 32px", boxShadow: "0 24px 72px rgba(0,0,0,0.60), 0 0 0 1px rgba(224,174,45,0.08) inset", position: "relative", overflow: "hidden", marginBottom: 16 }}>
                <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(224,174,45,0.09) 0%, transparent 70%)", pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(to right, transparent, rgba(224,174,45,0.70), transparent)" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <p style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.30em", textTransform: "uppercase", color: "#E0AE2D" }}>Neeko+</p>
                  <span style={{ fontSize: 8.5, fontWeight: 900, background: "#E0AE2D", color: "#1a0900", padding: "4px 10px", borderRadius: 5, letterSpacing: "0.08em" }}>BEST VALUE</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 44, fontWeight: 900, color: "#F5F5F5", lineHeight: 1 }}>${NEEKO_PRICING.yearly.monthlyEquivalent}</span>
                  <span style={{ fontSize: 14, color: "#525252" }}>/month</span>
                </div>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", marginBottom: 28 }}>
                  Billed ${NEEKO_PRICING.yearly.price}/year · Save {NEEKO_PRICING.savingsPercent}% vs monthly
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 30 }}>
                  {[
                    "Full rankings — 630+ players",
                    "Must Buys & Trap Alerts",
                    "Captain picks with confidence scores",
                    "Market Watch & price tracking",
                    "Start/Sit AI decisions",
                    "Updated every round, before lockout",
                  ].map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Check size={13} style={{ color: "#E0AE2D", flexShrink: 0 }} />
                      <span style={{ fontSize: 13.5, color: "rgba(255,255,255,0.65)" }}>{f}</span>
                    </div>
                  ))}
                </div>
                <Link to="/neeko-plus" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "linear-gradient(to bottom, #f0c030, #c8960a)", color: "#1a0900", fontWeight: 900, fontSize: 15, padding: "14px 20px", borderRadius: 8, textDecoration: "none", boxShadow: "0 6px 24px rgba(224,174,45,0.38), inset 0 1px 0 rgba(255,255,255,0.28)", letterSpacing: "0.02em" }}>
                  <Crown size={15} /> Unlock Full Access
                </Link>
              </div>

              {/* Monthly + Free — compact row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { label: "Monthly", price: NEEKO_PRICING.monthly.price, sub: "per month · cancel anytime", cta: "Start Monthly", to: "/neeko-plus" },
                  { label: "Free Plan", price: 0, sub: "preview access · no card needed", cta: "Get Started Free", to: "/auth" },
                ].map(({ label, price, sub, cta, to }) => (
                  <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "20px 18px" }}>
                    <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.24em", textTransform: "uppercase", color: "#525252", marginBottom: 10 }}>{label}</p>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
                      <span style={{ fontSize: 28, fontWeight: 900, color: "#F5F5F5" }}>${price}</span>
                      <span style={{ fontSize: 11, color: "#525252" }}>/mo</span>
                    </div>
                    <p style={{ fontSize: 10, color: "#404040", marginBottom: 16, lineHeight: 1.5 }}>{sub}</p>
                    <Link to={to} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)", fontWeight: 700, fontSize: 12, padding: "9px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none", letterSpacing: "0.03em" }}>
                      {cta}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer style={{ background: "#080604", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "22px clamp(16px, 4vw, 32px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.12)" }}>© {new Date().getFullYear()} Neeko Sports Stats</p>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            {[{ l: "Policies", t: "/policies" }, { l: "Contact", t: "/contact" }, { l: "About", t: "/about" }, { l: "FAQ", t: "/faq" }].map(x => (
              <Link key={x.t} to={x.t}
                style={{ fontSize: 11, color: "rgba(255,255,255,0.14)", textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.14)"; }}
              >{x.l}</Link>
            ))}
          </div>
        </div>
      </footer>

      {!isPremium && <MobileUpgradeBar />}
    </div>
  );
}
