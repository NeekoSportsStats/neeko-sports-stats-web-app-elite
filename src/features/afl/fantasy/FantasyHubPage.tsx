import { useMemo, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  TrendingUp, TrendingDown, Crown, Zap, ShieldAlert,
  Star, DollarSign, Lock, ArrowRight, ChevronRight,
  TriangleAlert as AlertTriangle, Flame,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import { applyDecisionFields } from "@/lib/decisionEngine";
import { buildCurrentRoundPlayers, type CurrentRoundPlayer } from "@/features/afl/current-round/engine";
import {
  fmt, fmtPrice, fmtUpdatedAt, getValueBandColor,
} from "@/features/afl/rankings/components/helpers";
import { getCaptainScore } from "@/features/afl/shared/data/captainScoring";
import type { RankingRow } from "@/features/afl/rankings/components/types";

// ── Data hook ─────────────────────────────────────────────────────────────────

interface FantasyHubData {
  roundLabel: string | null;
  updatedAt: string | null;
  captains: CurrentRoundPlayer[];
  mustBuys: CurrentRoundPlayer[];
  traps: CurrentRoundPlayer[];
  valueWatch: CurrentRoundPlayer[];
  topRankings: CurrentRoundPlayer[];
  loading: boolean;
  error: string | null;
  isPremium: boolean;
}

function useFantasyHubData(): FantasyHubData {
  const { user, isPremium } = useAuth();
  const [rawRows, setRawRows] = useState<RankingRow[]>([]);
  const [roundLabel, setRoundLabel] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

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

        if (rankingsRes.error) throw rankingsRes.error;

        const rows: RankingRow[] = (rankingsRes.data ?? [])
          .map(mapRankingRow)
          .map(applyDecisionFields);

        setRawRows(rows);

        if (roundRes.data && Array.isArray(roundRes.data) && roundRes.data.length > 0) {
          const d = roundRes.data[0] as { round_label?: string; updated_at?: string };
          setRoundLabel(d.round_label ?? null);
          setUpdatedAt(d.updated_at ?? null);
        }
      } catch (err: unknown) {
        if (!cancelled) setError("Could not load fantasy data. Please try again.");
        console.error("[FantasyHub] load error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user?.id, isPremium]);

  const derived = useMemo(() => {
    if (rawRows.length === 0) {
      return { captains: [], mustBuys: [], traps: [], valueWatch: [], topRankings: [] };
    }

    const { captains, mustBuys, traps } = buildCurrentRoundPlayers(rawRows);

    // Value Watch: positive value_score, not already in must buys, sorted by value_score desc
    const mustBuyIds = new Set(mustBuys.map(p => p.player_id));
    const valueWatch = rawRows
      .filter(p =>
        p.player_id &&
        !mustBuyIds.has(p.player_id) &&
        (p.value_score ?? 0) > 0 &&
        (p.projection ?? 0) > 50 &&
        !p.is_injured && !p.is_bye
      )
      .map(p => ({ ...p, overallRank: 999, isFeaturedPick: false }) as CurrentRoundPlayer)
      .sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0))
      .slice(0, isPremium ? 8 : 3);

    // Top Rankings: sorted by projection desc
    const topRankings = rawRows
      .filter(p => (p.projection ?? 0) > 0 && !p.is_injured && !p.is_bye)
      .map((p, i) => ({ ...p, overallRank: i + 1, isFeaturedPick: false }) as CurrentRoundPlayer)
      .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
      .slice(0, isPremium ? 8 : 4);

    return {
      captains: captains.slice(0, isPremium ? 5 : 2),
      mustBuys: mustBuys.slice(0, isPremium ? 6 : 2),
      traps: traps.slice(0, isPremium ? 5 : 2),
      valueWatch,
      topRankings,
    };
  }, [rawRows, isPremium]);

  return {
    roundLabel,
    updatedAt,
    ...derived,
    loading,
    error,
    isPremium,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeEdgeScore(p: CurrentRoundPlayer): number | null {
  if (typeof p.edge_canonical === "number") return p.edge_canonical;
  const proj = p.projection ?? null;
  const be   = p.breakeven ?? null;
  if (proj !== null && be !== null) return proj - be;
  return p.value_score ?? p.decision_score ?? null;
}

function getCaptainTier(p: CurrentRoundPlayer): "Lock" | "Safe" | "POD" {
  const cs = p.captain_score ?? getCaptainScore(p);
  const proj = p.projection ?? 0;
  if (cs >= 120 || proj >= 115) return "Lock";
  if (cs >= 95  || proj >= 100) return "Safe";
  return "POD";
}

function fmtEdge(v: number | null): string {
  if (v == null) return "—";
  return v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({
  icon, title, subtitle, linkTo, linkLabel,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  linkTo?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-center gap-2.5">
        <div className="shrink-0">{icon}</div>
        <div>
          <h2 className="text-sm font-bold text-white leading-tight">{title}</h2>
          {subtitle && <p className="text-[11px] text-white/40 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {linkTo && (
        <Link
          to={linkTo}
          className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-white/40 hover:text-white/70 transition-colors"
        >
          {linkLabel ?? "Full view"}
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function PlayerRow({
  player,
  badge,
  stat,
  statLabel,
  secondaryText,
}: {
  player: CurrentRoundPlayer;
  badge?: React.ReactNode;
  stat?: string;
  statLabel?: string;
  secondaryText?: string;
}) {
  const position = player.position_group ?? player.position ?? null;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] font-semibold text-white truncate">{player.player_name}</span>
          {position && (
            <span className="text-[9px] font-bold text-white/35 bg-white/6 rounded px-1 py-0.5 tracking-wide shrink-0">
              {position}
            </span>
          )}
          {badge}
        </div>
        <p className="text-[11px] text-white/35 mt-0.5 truncate">
          {player.team_name ?? player.team}
          {secondaryText && <span className="ml-1.5 text-white/25">{secondaryText}</span>}
        </p>
      </div>
      {stat != null && (
        <div className="shrink-0 text-right">
          <div className="text-[14px] font-bold text-white tabular-nums">{stat}</div>
          {statLabel && <div className="text-[10px] text-white/35">{statLabel}</div>}
        </div>
      )}
    </div>
  );
}

function LockedSection({ message, linkTo }: { message: string; linkTo?: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-6 text-center">
      <Lock className="h-5 w-5 text-[#F5C84C]/50" />
      <p className="text-xs text-white/40 max-w-[220px]">{message}</p>
      <Link
        to={linkTo ?? "/neeko-plus"}
        className="text-[11px] font-semibold text-[#F5C84C]/80 hover:text-[#F5C84C] transition-colors flex items-center gap-1"
      >
        Unlock Neeko+ <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-4 ${className}`}>
      {children}
    </div>
  );
}

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-9 rounded-lg bg-white/5 animate-pulse" />
      ))}
    </div>
  );
}

// ── Intel bar ─────────────────────────────────────────────────────────────────

function IntelBar({
  roundLabel, updatedAt, mustBuys, traps, captains,
}: {
  roundLabel: string | null;
  updatedAt: string | null;
  mustBuys: CurrentRoundPlayer[];
  traps: CurrentRoundPlayer[];
  captains: CurrentRoundPlayer[];
}) {
  const topCaptain = captains[0];
  const topBuy     = mustBuys[0];
  const topTrap    = traps[0];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 mb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-[#F5C84C]" />
          <span className="text-xs font-bold text-white/80 tracking-wide">
            {roundLabel ? `This Week's Intel — ${roundLabel}` : "This Week's Fantasy Intel"}
          </span>
        </div>
        {updatedAt && (
          <span className="text-[10px] text-white/30">
            Updated {fmtUpdatedAt(updatedAt)}
          </span>
        )}
      </div>

      {/* 3 callout tiles */}
      <div className="grid grid-cols-3 gap-2">
        <IntelTile
          icon={<Crown className="h-3 w-3 text-[#F5C84C]" />}
          label="Captain Lock"
          value={topCaptain?.player_name?.split(" ").pop() ?? "—"}
          sub={topCaptain ? fmt(topCaptain.projection, 0) + " proj" : "—"}
          color="text-[#F5C84C]"
        />
        <IntelTile
          icon={<TrendingUp className="h-3 w-3 text-emerald-400" />}
          label="Must Buy"
          value={topBuy?.player_name?.split(" ").pop() ?? "—"}
          sub={topBuy ? fmtPrice(topBuy.price) : "—"}
          color="text-emerald-400"
        />
        <IntelTile
          icon={<AlertTriangle className="h-3 w-3 text-red-400" />}
          label="Trap Alert"
          value={topTrap?.player_name?.split(" ").pop() ?? "—"}
          sub={topTrap ? fmtEdge(computeEdgeScore(topTrap)) + " edge" : "—"}
          color="text-red-400"
        />
      </div>
    </div>
  );
}

function IntelTile({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/8 px-2.5 py-2.5">
      <div className="flex items-center gap-1 mb-1.5">
        {icon}
        <span className="text-[9px] text-white/35 font-medium tracking-wide uppercase">{label}</span>
      </div>
      <div className={`text-[13px] font-bold leading-tight ${color} truncate`}>{value}</div>
      <div className="text-[10px] text-white/35 mt-0.5">{sub}</div>
    </div>
  );
}

// ── Captain tier badge ────────────────────────────────────────────────────────

function CaptainTierBadge({ tier }: { tier: "Lock" | "Safe" | "POD" }) {
  const styles =
    tier === "Lock" ? "border-[#F5C84C]/40 bg-[#F5C84C]/12 text-[#F5C84C]" :
    tier === "Safe" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                     "border-sky-400/30 bg-sky-500/10 text-sky-400";
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wide border rounded px-1.5 py-0.5 leading-none shrink-0 ${styles}`}>
      {tier}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FantasyHubPage() {
  const data = useFantasyHubData();

  useEffect(() => {
    track("Page View", { path: "/fantasy" });
  }, []);

  return (
    <>
      <Helmet>
        <title>AFL Fantasy Hub | Neeko Sports Fantasy Decisions</title>
        <meta
          name="description"
          content="AFL Fantasy Hub — must buys, trap alerts, captain picks, value watch and rankings in one decision-focused page."
        />
      </Helmet>

      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <div className="mx-auto max-w-2xl px-4 pt-6 pb-20">

          {/* ── Page title ── */}
          <div className="mb-5">
            <div className="inline-flex items-center gap-2 mb-3 rounded-full bg-white/6 border border-white/10 px-3 py-1.5">
              <Star className="h-3.5 w-3.5 text-[#F5C84C]" />
              <span className="text-xs font-semibold text-white/60 tracking-wide">Fantasy Hub</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white leading-tight">
              AFL Fantasy Decisions
            </h1>
            <p className="mt-1.5 text-sm text-white/45 leading-relaxed">
              Must buys, trap alerts, captain picks and value — in one place.
            </p>
          </div>

          {/* ── Error ── */}
          {data.error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {data.error}
            </div>
          )}

          {/* ── This Week's Intel ── */}
          {data.loading ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-4 mb-5 h-28 animate-pulse" />
          ) : (
            <IntelBar
              roundLabel={data.roundLabel}
              updatedAt={data.updatedAt}
              mustBuys={data.mustBuys}
              traps={data.traps}
              captains={data.captains}
            />
          )}

          {/* ── 2-column grid on md+ ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* ── Must Buys ── */}
            <Section>
              <SectionHeader
                icon={<TrendingUp className="h-4 w-4 text-emerald-400" />}
                title="Must Buys"
                subtitle="Strong action signal, top decision score"
                linkTo="/sports/afl/current-round"
                linkLabel="Full view"
              />
              {data.loading ? (
                <SkeletonRows count={3} />
              ) : data.mustBuys.length === 0 ? (
                <p className="text-xs text-white/35 py-4 text-center">No data yet this round.</p>
              ) : (
                <div>
                  {data.mustBuys.map(p => {
                    const edge = computeEdgeScore(p);
                    return (
                      <PlayerRow
                        key={p.player_id}
                        player={p}
                        badge={
                          <span className="text-[9px] font-bold border border-emerald-500/40 bg-emerald-500/12 text-emerald-400 rounded px-1.5 py-0.5 shrink-0 leading-none">
                            BUY
                          </span>
                        }
                        stat={fmtPrice(p.price)}
                        statLabel={edge != null ? `${fmtEdge(edge)} edge` : fmt(p.projection, 0) + " proj"}
                      />
                    );
                  })}
                  {!data.isPremium && (
                    <LockedSection
                      message="See all 6 Must Buy picks with Neeko+"
                    />
                  )}
                </div>
              )}
            </Section>

            {/* ── Trap Alerts ── */}
            <Section>
              <SectionHeader
                icon={<AlertTriangle className="h-4 w-4 text-red-400" />}
                title="Trap Alerts"
                subtitle="High risk or overpriced — avoid this round"
                linkTo="/sports/afl/current-round"
                linkLabel="Full view"
              />
              {data.loading ? (
                <SkeletonRows count={3} />
              ) : data.traps.length === 0 ? (
                <p className="text-xs text-white/35 py-4 text-center">No data yet this round.</p>
              ) : (
                <div>
                  {data.traps.map(p => {
                    const edge = computeEdgeScore(p);
                    return (
                      <PlayerRow
                        key={p.player_id}
                        player={p}
                        badge={
                          <span className="text-[9px] font-bold border border-red-500/40 bg-red-500/12 text-red-400 rounded px-1.5 py-0.5 shrink-0 leading-none">
                            AVOID
                          </span>
                        }
                        stat={edge != null ? fmtEdge(edge) : "—"}
                        statLabel="edge"
                        secondaryText={fmtPrice(p.price)}
                      />
                    );
                  })}
                  {!data.isPremium && (
                    <LockedSection
                      message="See all trap alerts with Neeko+"
                    />
                  )}
                </div>
              )}
            </Section>

            {/* ── Captain Picks ── */}
            <Section>
              <SectionHeader
                icon={<Crown className="h-4 w-4 text-[#F5C84C]" />}
                title="Captain Picks"
                subtitle="Highest confidence doubling options"
                linkTo="/sports/afl/captains"
                linkLabel="Full view"
              />
              {data.loading ? (
                <SkeletonRows count={3} />
              ) : data.captains.length === 0 ? (
                <p className="text-xs text-white/35 py-4 text-center">No data yet this round.</p>
              ) : (
                <div>
                  {data.captains.map(p => (
                    <PlayerRow
                      key={p.player_id}
                      player={p}
                      badge={<CaptainTierBadge tier={getCaptainTier(p)} />}
                      stat={fmt(p.projection, 0)}
                      statLabel="proj"
                      secondaryText={p.matchup_label ? `vs ${p.matchup_label}` : undefined}
                    />
                  ))}
                  {!data.isPremium && (
                    <LockedSection
                      message="See all 5 captain picks with Neeko+"
                    />
                  )}
                </div>
              )}
            </Section>

            {/* ── Value Watch ── */}
            <Section>
              <SectionHeader
                icon={<DollarSign className="h-4 w-4 text-sky-400" />}
                title="Value Watch"
                subtitle="Underpriced relative to projection"
                linkTo="/sports/afl/market-watch"
                linkLabel="Market Watch"
              />
              {data.loading ? (
                <SkeletonRows count={3} />
              ) : data.valueWatch.length === 0 ? (
                <p className="text-xs text-white/35 py-4 text-center">No value data this round.</p>
              ) : (
                <div>
                  {data.valueWatch.map(p => (
                    <PlayerRow
                      key={p.player_id}
                      player={p}
                      badge={
                        p.value_band ? (
                          <span className={`text-[9px] font-semibold rounded px-1.5 py-0.5 shrink-0 leading-none ${getValueBandColor(p.value_band)}`}>
                            {p.value_band}
                          </span>
                        ) : undefined
                      }
                      stat={fmtPrice(p.price)}
                      statLabel={fmt(p.value_score, 1) + " val"}
                    />
                  ))}
                  {!data.isPremium && (
                    <LockedSection
                      message="See all value picks with Neeko+"
                    />
                  )}
                </div>
              )}
            </Section>

            {/* ── Rankings Preview ── */}
            <Section className="md:col-span-2">
              <SectionHeader
                icon={<Flame className="h-4 w-4 text-orange-400" />}
                title="Rankings Preview"
                subtitle="Top projected players this round"
                linkTo="/sports/afl/rankings"
                linkLabel="Full Rankings"
              />
              {data.loading ? (
                <SkeletonRows count={5} />
              ) : data.topRankings.length === 0 ? (
                <p className="text-xs text-white/35 py-4 text-center">No rankings data yet.</p>
              ) : (
                <div className="md:grid md:grid-cols-2 md:gap-x-6">
                  {data.topRankings.map((p, i) => (
                    <div
                      key={p.player_id}
                      className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0"
                    >
                      <span className="shrink-0 w-5 text-[11px] font-bold text-white/25 tabular-nums text-center">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[13px] font-semibold text-white truncate">{p.player_name}</span>
                          {(p.position_group ?? p.position) && (
                            <span className="text-[9px] font-bold text-white/35 bg-white/6 rounded px-1 py-0.5 shrink-0">
                              {p.position_group ?? p.position}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/35 mt-0.5">{p.team_name ?? p.team}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[14px] font-bold text-white tabular-nums">{fmt(p.projection, 0)}</div>
                        <div className="text-[10px] text-white/35">proj</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!data.isPremium && !data.loading && (
                <div className="mt-3 pt-3 border-t border-white/6 text-center">
                  <p className="text-xs text-white/35 mb-2">See 300+ players ranked with Neeko+</p>
                  <Link
                    to="/neeko-plus"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F5C84C]/80 hover:text-[#F5C84C] transition-colors"
                  >
                    <Crown className="h-3.5 w-3.5" />
                    Unlock Neeko+
                  </Link>
                </div>
              )}
            </Section>

          </div>

          {/* ── Deep dive links ── */}
          <div className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-4">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">More tools</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { label: "Current Round", to: "/sports/afl/current-round", icon: <TrendingUp className="h-3.5 w-3.5" /> },
                { label: "Market Watch", to: "/sports/afl/market-watch", icon: <DollarSign className="h-3.5 w-3.5" /> },
                { label: "Edge Board", to: "/sports/afl/edge-board", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
                { label: "Captains", to: "/sports/afl/captains", icon: <Crown className="h-3.5 w-3.5" /> },
                { label: "Rankings", to: "/sports/afl/rankings", icon: <Star className="h-3.5 w-3.5" /> },
                { label: "Start / Sit", to: "/sports/afl/start-sit", icon: <TrendingDown className="h-3.5 w-3.5" /> },
              ].map(({ label, to, icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-xs font-medium text-white/55 hover:text-white/80 hover:border-white/14 hover:bg-white/[0.05] transition-colors"
                >
                  <span className="text-white/35">{icon}</span>
                  {label}
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
