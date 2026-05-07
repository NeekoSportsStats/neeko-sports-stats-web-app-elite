import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  TrendingUp, Crown, DollarSign, TriangleAlert as AlertTriangle,
  ArrowRight, ChevronRight, Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import { applyDecisionFields } from "@/lib/decisionEngine";
import { buildCurrentRoundPlayers, type CurrentRoundPlayer } from "@/features/afl/current-round/engine";
import { fmt, fmtPrice } from "@/features/afl/rankings/components/helpers";
import { getCaptainScore } from "@/features/afl/shared/data/captainScoring";
import type { RankingRow } from "@/features/afl/rankings/components/types";

// ── Live preview data ──────────────────────────────────────────────────────────

interface PreviewData {
  mustBuy: CurrentRoundPlayer | null;
  trap: CurrentRoundPlayer | null;
  captain: CurrentRoundPlayer | null;
  valuePick: CurrentRoundPlayer | null;
  roundLabel: string | null;
  loading: boolean;
}

function usePreviewData(): PreviewData {
  const { user, isPremium, loading: authLoading } = useAuth();
  const [rawRows, setRawRows] = useState<RankingRow[]>([]);
  const [roundLabel, setRoundLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        const rows: RankingRow[] = (rankingsRes.data ?? []).map(mapRankingRow).map(applyDecisionFields);
        setRawRows(rows);
        if (roundRes.data && Array.isArray(roundRes.data) && roundRes.data.length > 0) {
          const d = roundRes.data[0] as { round_label?: string };
          setRoundLabel(d.round_label ?? null);
        }
      } catch {
        // preview strip shows empty state on error
      } finally {
        if (!cancelled) setLoading(false);
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

    return {
      mustBuy:   mustBuys[0]  ?? null,
      trap:      traps[0]     ?? null,
      captain:   captains[0]  ?? null,
      valuePick,
    };
  }, [rawRows]);

  return { ...derived, roundLabel, loading };
}

// ── Tool cards config ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    key: "current-week",
    title: "Current Week",
    copy: "Must buys, trap alerts, captain picks and start/sit calls for this round.",
    href: "/fantasy/current-week",
    icon: Zap,
    iconColor: "text-emerald-400",
    accentBg:  "bg-emerald-500/[0.08]",
    accentBorder: "border-emerald-500/20",
    hoverBorder: "hover:border-emerald-500/30",
    ctaLabel: "Open Current Week",
  },
  {
    key: "rankings",
    title: "Rankings",
    copy: "Full player rankings with projections, form, confidence and value.",
    href: "/fantasy/rankings",
    icon: TrendingUp,
    iconColor: "text-sky-400",
    accentBg:  "bg-sky-500/[0.08]",
    accentBorder: "border-sky-500/20",
    hoverBorder: "hover:border-sky-500/25",
    ctaLabel: "View Rankings",
  },
  {
    key: "market-watch",
    title: "Market Watch",
    copy: "Find underpriced players, overpriced players and trade targets.",
    href: "/fantasy/market-watch",
    icon: DollarSign,
    iconColor: "text-amber-400",
    accentBg:  "bg-amber-500/[0.08]",
    accentBorder: "border-amber-500/20",
    hoverBorder: "hover:border-amber-500/25",
    ctaLabel: "Open Market Watch",
  },
] as const;

// ── Preview tile ───────────────────────────────────────────────────────────────

interface PreviewTileProps {
  icon: React.ReactNode;
  label: string;
  playerName: string | null;
  stat: string | null;
  loading: boolean;
}

function PreviewTile({ icon, label, playerName, stat, loading }: PreviewTileProps) {
  return (
    <div className="flex-1 min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="shrink-0">{icon}</span>
        <span className="text-[9.5px] font-[700] uppercase tracking-[0.12em] text-white/28 truncate leading-none">
          {label}
        </span>
      </div>
      {loading ? (
        <div className="h-3.5 w-16 rounded bg-white/[0.05] animate-pulse" />
      ) : playerName ? (
        <>
          <div className="text-[13px] font-[700] text-white/88 leading-tight truncate">
            {playerName.split(" ").slice(-1)[0]}
          </div>
          {stat && <div className="text-[10px] text-white/35 mt-0.5 leading-none tabular-nums">{stat}</div>}
        </>
      ) : (
        <div className="text-[11px] text-white/22">—</div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function FantasyHubPage() {
  const preview = usePreviewData();

  const trapEdge = preview.trap
    ? (() => {
        const e = preview.trap.edge_canonical ??
          ((preview.trap.projection ?? 0) - (preview.trap.breakeven ?? 0));
        return typeof e === "number" && !isNaN(e)
          ? `${e > 0 ? "+" : ""}${Math.round(e)} edge`
          : null;
      })()
    : null;

  const captainStat = preview.captain
    ? `${fmt(preview.captain.projection, 0)} proj`
    : null;

  const valuePickStat = preview.valuePick
    ? (preview.valuePick.value_score != null
        ? `${fmt(preview.valuePick.value_score, 1)} val`
        : fmtPrice(preview.valuePick.price))
    : null;

  // suppress unused-var lint: getCaptainScore is imported for side effects / available to callers
  void getCaptainScore;

  return (
    <>
      <Helmet>
        <title>AFL Fantasy Hub | Neeko Sports Stats</title>
        <meta
          name="description"
          content="AFL Fantasy Hub — must buys, trap alerts, captain picks and rankings in one decision-focused place."
        />
        <link rel="canonical" href="https://neekostats.com.au/fantasy" />
        <meta property="og:url" content="https://neekostats.com.au/fantasy" />
        <meta property="og:title" content="AFL Fantasy Hub | Neeko Sports Stats" />
        <meta name="twitter:title" content="AFL Fantasy Hub | Neeko Sports Stats" />
      </Helmet>

      <div className="min-h-screen bg-[#05070A] text-white overflow-x-hidden">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-8 sm:pt-12 pb-16 sm:pb-24">

          {/* ── Hero ─────────────────────────────────────────────────────── */}
          <div className="mb-8 sm:mb-10">
            <p className="text-[9px] font-[900] tracking-[0.46em] uppercase text-emerald-500/60 mb-3">
              Fantasy Hub
            </p>
            <h1 className="text-[clamp(1.6rem,5vw,2.25rem)] font-[900] tracking-tight text-[#F5F5F5] leading-[1.18] mb-3">
              AFL Fantasy Hub
            </h1>
            <p className="text-[clamp(13px,2vw,15px)] text-white/48 leading-[1.7] max-w-[480px] mb-5">
              Make faster fantasy decisions with projections, form, value and weekly calls.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Link
                to="/fantasy/current-week"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/[0.12] border border-emerald-500/30 px-4 py-2.5 text-[13px] font-[700] text-emerald-400 hover:bg-emerald-500/[0.20] hover:border-emerald-500/50 transition-colors leading-none"
              >
                <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Open Current Week
              </Link>
              <Link
                to="/fantasy/rankings"
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 py-2.5 text-[13px] font-[600] text-white/65 hover:text-white/88 hover:border-white/[0.18] hover:bg-white/[0.07] transition-colors leading-none"
              >
                View Rankings
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden />
              </Link>
            </div>
          </div>

          {/* ── Three tool cards ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7">
            {TOOLS.map(({ key, title, copy, href, icon: Icon, iconColor, accentBg, accentBorder, hoverBorder, ctaLabel }) => (
              <Link
                key={key}
                to={href}
                className={`group rounded-2xl border border-white/[0.09] bg-white/[0.025] px-4 py-4 flex flex-col gap-3 transition-colors ${hoverBorder} hover:bg-white/[0.04]`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`flex items-center justify-center h-8 w-8 rounded-xl ${accentBg} border ${accentBorder} shrink-0 ${iconColor}`}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </div>
                  <span className="text-[14px] font-[800] text-white/90 leading-tight">{title}</span>
                </div>
                <p className="text-[12px] text-white/45 leading-[1.65] flex-1">
                  {copy}
                </p>
                <div className={`flex items-center gap-1 text-[12px] font-[600] ${iconColor} opacity-70 group-hover:opacity-100 transition-opacity`}>
                  {ctaLabel}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </div>
              </Link>
            ))}
          </div>

          {/* ── Live preview strip ────────────────────────────────────────── */}
          <div>
            <p className="text-[9.5px] font-[700] uppercase tracking-[0.18em] text-white/22 mb-2.5 leading-none">
              {preview.roundLabel ? `This round · ${preview.roundLabel}` : "This round"}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <PreviewTile
                icon={<TrendingUp className="h-3 w-3 text-emerald-400" />}
                label="Must Buy"
                playerName={preview.mustBuy?.player_name ?? null}
                stat={preview.mustBuy ? fmtPrice(preview.mustBuy.price) : null}
                loading={preview.loading}
              />
              <PreviewTile
                icon={<AlertTriangle className="h-3 w-3 text-red-400" />}
                label="Top Trap"
                playerName={preview.trap?.player_name ?? null}
                stat={trapEdge}
                loading={preview.loading}
              />
              <PreviewTile
                icon={<Crown className="h-3 w-3 text-[#F5C84C]" />}
                label="Captain"
                playerName={preview.captain?.player_name ?? null}
                stat={captainStat}
                loading={preview.loading}
              />
              <PreviewTile
                icon={<DollarSign className="h-3 w-3 text-sky-400" />}
                label="Value Pick"
                playerName={preview.valuePick?.player_name ?? null}
                stat={valuePickStat}
                loading={preview.loading}
              />
            </div>
            <p className="text-[10px] text-white/18 mt-2 leading-snug">
              Live data · Updates each round
            </p>
          </div>

        </div>
      </div>
    </>
  );
}
