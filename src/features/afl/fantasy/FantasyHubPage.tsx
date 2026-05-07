import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Zap, TrendingUp, DollarSign, TriangleAlert as AlertTriangle, Crown, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import { applyDecisionFields } from "@/lib/decisionEngine";
import { buildCurrentRoundPlayers, type CurrentRoundPlayer } from "@/features/afl/current-round/engine";
import { fmt, fmtPrice } from "@/features/afl/rankings/components/helpers";
import type { RankingRow } from "@/features/afl/rankings/components/types";

// ── Nav cards ─────────────────────────────────────────────────────────────────

interface NavCard {
  icon: React.ReactNode;
  title: string;
  copy: string;
  href: string;
}

const NAV_CARDS: NavCard[] = [
  {
    icon: <Zap size={18} />,
    title: "Current Week",
    copy: "Must buys, captain picks, trap alerts and weekly fantasy calls.",
    href: "/fantasy/current-week",
  },
  {
    icon: <TrendingUp size={18} />,
    title: "Rankings",
    copy: "Full player rankings by projection, form, confidence and value.",
    href: "/fantasy/rankings",
  },
  {
    icon: <DollarSign size={18} />,
    title: "Market Watch",
    copy: "Find underpriced targets, overpriced risks and trade value.",
    href: "/fantasy/market-watch",
  },
];

// ── Preview data hook ─────────────────────────────────────────────────────────

interface PreviewState {
  mustBuy: CurrentRoundPlayer | null;
  trap: CurrentRoundPlayer | null;
  captain: CurrentRoundPlayer | null;
  valuePick: CurrentRoundPlayer | null;
  roundLabel: string | null;
  loaded: boolean;
}

function usePreview(): PreviewState {
  const { user, isPremium, loading: authLoading } = useAuth();
  const [rawRows, setRawRows] = useState<RankingRow[]>([]);
  const [roundLabel, setRoundLabel] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    async function load() {
      try {
        const [rankingsRes, roundRes] = await Promise.all([
          supabase.rpc("get_rankings_safe", {
            p_user_id: user?.id ?? null,
            p_is_bot: false,
            p_limit: isPremium ? 300 : 60,
          }),
          supabase.rpc("get_rankings_updated_at"),
        ]);
        if (cancelled) return;
        const rows: RankingRow[] = applyDecisionFields((rankingsRes.data ?? []).map(mapRankingRow));
        setRawRows(rows);
        if (roundRes.data && Array.isArray(roundRes.data) && roundRes.data.length > 0) {
          const d = roundRes.data[0] as { round_label?: string };
          setRoundLabel(d.round_label ?? null);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id, isPremium, authLoading]);

  const derived = useMemo(() => {
    if (rawRows.length === 0) return { mustBuy: null, trap: null, captain: null, valuePick: null };
    const { captains, mustBuys, traps } = buildCurrentRoundPlayers(rawRows);
    const mustBuyIds = new Set(mustBuys.map(p => p.player_id));
    const valuePick = rawRows
      .filter(p =>
        p.player_id && !mustBuyIds.has(p.player_id) &&
        (p.value_score ?? 0) > 0 && (p.projection ?? 0) > 50 &&
        !p.is_injured && !p.is_bye
      )
      .map(p => ({ ...p, overallRank: 999, isFeaturedPick: false }) as CurrentRoundPlayer)
      .sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0))[0] ?? null;
    return { mustBuy: mustBuys[0] ?? null, trap: traps[0] ?? null, captain: captains[0] ?? null, valuePick };
  }, [rawRows]);

  return { ...derived, roundLabel, loaded };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FantasyHubPage() {
  const preview = usePreview();

  const showPreview = preview.loaded && (
    preview.mustBuy != null ||
    preview.trap != null ||
    preview.captain != null ||
    preview.valuePick != null
  );

  const trapStat = preview.trap
    ? (() => {
        const e = (preview.trap.projection ?? 0) - (preview.trap.breakeven ?? 0);
        return !isNaN(e) ? `${e > 0 ? "+" : ""}${Math.round(e)} edge` : null;
      })()
    : null;

  const captainStat = preview.captain ? `${fmt(preview.captain.projection, 0)} proj` : null;
  const valuePickStat = preview.valuePick
    ? (preview.valuePick.value_score != null
        ? `${fmt(preview.valuePick.value_score, 1)} val`
        : fmtPrice(preview.valuePick.price))
    : null;

  const [primaryHovered, setPrimaryHovered] = useState(false);

  return (
    <>
      <Helmet>
        <title>AFL Fantasy Hub | Neeko Sports Stats</title>
        <meta name="description" content="AFL Fantasy Hub — must buys, trap alerts, captain picks and rankings in one decision-focused place." />
        <link rel="canonical" href="https://neekostats.com.au/fantasy" />
        <meta property="og:url" content="https://neekostats.com.au/fantasy" />
        <meta property="og:title" content="AFL Fantasy Hub | Neeko Sports Stats" />
        <meta name="twitter:title" content="AFL Fantasy Hub | Neeko Sports Stats" />
      </Helmet>

      <div style={{ minHeight: "100vh", background: "#05070A", color: "#fff" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "clamp(36px,4.5vw,60px) clamp(16px,4vw,32px) clamp(40px,5vw,72px)" }}>

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <div style={{ marginBottom: "clamp(28px,3.5vw,40px)" }}>
            <p style={{
              fontSize: 9.5, fontWeight: 900, letterSpacing: "0.44em",
              textTransform: "uppercase",
              color: "rgba(34,197,94,0.65)",
              margin: "0 0 10px",
            }}>
              Fantasy Hub
            </p>
            <h1 style={{
              fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
              fontWeight: 900, letterSpacing: "-0.03em",
              color: "#F5F5F5", lineHeight: 1.2,
              margin: "0 0 10px",
            }}>
              AFL Fantasy Hub
            </h1>
            <p style={{
              fontSize: "clamp(13px, 1vw, 14.5px)",
              color: "rgba(255,255,255,0.55)",
              lineHeight: 1.6,
              margin: "0 0 6px",
              maxWidth: 440,
            }}>
              Make faster fantasy decisions each round.
            </p>
            <p style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.40)",
              lineHeight: 1.55,
              margin: "0 0 20px",
              maxWidth: 440,
            }}>
              Use Current Week for weekly calls, Rankings for the full player list, or Market Watch to find the best trade targets.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <Link
                to="/fantasy/current-week"
                onMouseEnter={() => setPrimaryHovered(true)}
                onMouseLeave={() => setPrimaryHovered(false)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "11px 20px",
                  borderRadius: 10,
                  background: primaryHovered ? "rgba(34,197,94,0.18)" : "rgba(34,197,94,0.12)",
                  border: `1px solid ${primaryHovered ? "rgba(34,197,94,0.45)" : "rgba(34,197,94,0.28)"}`,
                  color: primaryHovered ? "#4ade80" : "rgba(74,222,128,0.88)",
                  fontSize: 13, fontWeight: 800,
                  textDecoration: "none",
                  letterSpacing: "0.01em",
                  transition: "all 0.15s ease",
                }}
              >
                Open Current Week <ArrowRight size={13} />
              </Link>
              <Link
                to="/fantasy/rankings"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "11px 20px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 13, fontWeight: 700,
                  textDecoration: "none",
                  letterSpacing: "0.01em",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)";
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.80)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)";
                }}
              >
                View Rankings <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          {/* ── Nav cards ─────────────────────────────────────────────────── */}
          <div style={{ marginBottom: "clamp(22px,3vw,32px)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {NAV_CARDS.map((card) => <NavTile key={card.title} card={card} />)}
            </div>
          </div>

          {/* ── Live preview strip — only shown when real data exists ──────── */}
          {showPreview && (
            <div style={{
              padding: "16px 18px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.02)",
            }}>
              <p style={{
                fontSize: 9.5, fontWeight: 700,
                letterSpacing: "0.18em", textTransform: "uppercase",
                color: "rgba(255,255,255,0.28)",
                margin: "0 0 12px",
                lineHeight: 1,
              }}>
                {preview.roundLabel ? `This round · ${preview.roundLabel}` : "This round"}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                {preview.mustBuy && (
                  <PreviewCell
                    icon={<TrendingUp size={11} style={{ color: "#4ade80" }} />}
                    label="Must Buy"
                    name={preview.mustBuy.player_name}
                    stat={fmtPrice(preview.mustBuy.price)}
                  />
                )}
                {preview.trap && (
                  <PreviewCell
                    icon={<AlertTriangle size={11} style={{ color: "#f87171" }} />}
                    label="Top Trap"
                    name={preview.trap.player_name}
                    stat={trapStat}
                  />
                )}
                {preview.captain && (
                  <PreviewCell
                    icon={<Crown size={11} style={{ color: "#F5C84C" }} />}
                    label="Captain"
                    name={preview.captain.player_name}
                    stat={captainStat}
                  />
                )}
                {preview.valuePick && (
                  <PreviewCell
                    icon={<DollarSign size={11} style={{ color: "#38bdf8" }} />}
                    label="Value Pick"
                    name={preview.valuePick.player_name}
                    stat={valuePickStat}
                  />
                )}
              </div>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", margin: "10px 0 0", lineHeight: 1.4 }}>
                Live data · Updates each round
              </p>
            </div>
          )}

          {/* ── How it works strip ────────────────────────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6,
            padding: "12px 16px",
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 10,
            fontSize: 12, color: "rgba(255,255,255,0.42)",
            lineHeight: 1.4,
            marginTop: showPreview ? 10 : 0,
          }}>
            <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.60)" }}>How it works:</span>
            {["Pick a tool", "Get the data you need", "Make better trades this round"].map((step, i, arr) => (
              <span key={step} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>{step}</span>
                {i < arr.length - 1 && <span style={{ color: "rgba(255,255,255,0.22)" }}>→</span>}
              </span>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}

// ── Nav tile ──────────────────────────────────────────────────────────────────

function NavTile({ card }: { card: NavCard }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link to={card.href} style={{ textDecoration: "none" }} aria-label={`Open ${card.title}`}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex", alignItems: "flex-start", gap: 14,
          padding: "16px 18px",
          borderRadius: 14,
          border: `1px solid ${hovered ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)"}`,
          background: hovered ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.025)",
          transition: "all 0.15s ease",
          cursor: "pointer",
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: "rgba(34,197,94,0.10)",
          border: "1px solid rgba(34,197,94,0.20)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#4ade80",
        }}>
          {card.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 13.5, fontWeight: 700,
              color: "#ECECEC",
              letterSpacing: "-0.01em",
            }}>
              {card.title}
            </span>
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
          </div>
          <p style={{
            margin: 0, fontSize: 12.5,
            color: "rgba(255,255,255,0.48)",
            lineHeight: 1.5,
          }}>
            {card.copy}
          </p>
        </div>
        <div style={{ flexShrink: 0, alignSelf: "center" }}>
          <ArrowRight size={15} style={{
            color: hovered ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.28)",
            transition: "color 0.15s",
          }} />
        </div>
      </div>
    </Link>
  );
}

// ── Preview cell ──────────────────────────────────────────────────────────────

function PreviewCell({ icon, label, name, stat }: {
  icon: React.ReactNode;
  label: string;
  name: string;
  stat: string | null;
}) {
  return (
    <div style={{
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.07)",
      background: "rgba(255,255,255,0.025)",
      padding: "10px 12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
        {icon}
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.10em",
          textTransform: "uppercase", color: "rgba(255,255,255,0.28)",
          lineHeight: 1,
        }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.88)", lineHeight: 1.2, marginBottom: stat ? 3 : 0 }}>
        {name.split(" ").slice(-1)[0]}
      </div>
      {stat && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {stat}
        </div>
      )}
    </div>
  );
}
