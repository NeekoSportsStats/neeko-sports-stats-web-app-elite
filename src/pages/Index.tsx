import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Crown, ArrowRight, Check, Lock, TrendingUp,
  TriangleAlert as AlertTriangle, Star, Zap, Shield, Clock, Users,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import MobileUpgradeBar from "@/components/mobile/MobileUpgradeBar";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";

// ─── Static config ────────────────────────────────────────────────────────────

const FOOTER_LINKS = [
  { label: "Policies", to: "/policies" },
  { label: "Contact",  to: "/contact" },
  { label: "About",    to: "/about" },
  { label: "FAQ",      to: "/faq" },
];

const NEEKO_FEATURES = [
  "See every trade target, trap, and captain signal",
  "Unlock full player explanations and comparison tools",
  "Use the full Start/Sit decision engine",
  "Get the complete weekly game plan before lockout",
  "Market Watch — buy/sell timing",
  "Breakout alerts and risk flags",
  "Full projections for 600+ players",
  "Updated before every round lockout",
];

const TRUST_ITEMS = [
  { icon: Clock,  text: "Updated before every round lockout" },
  { icon: Users,  text: "600+ players analysed weekly" },
  { icon: Shield, text: "Model-driven, not opinion-based" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BUY_SIGNALS    = ["STRONG_UP", "STRONG_BUY", "MUST_HAVE", "BREAKOUT", "UP", "BUY"];
const AVOID_SIGNALS  = ["STRONG_DOWN", "STRONG_SELL", "AVOID", "DO_NOT_START", "DOWN", "SELL"];

function getActionFromSignal(signal: string | null): { label: string; styles: string } {
  const s = (signal ?? "").toUpperCase();
  if (BUY_SIGNALS.includes(s))   return { label: "BUY",   styles: "bg-green-500/15 text-green-400 border border-green-500/30" };
  if (AVOID_SIGNALS.includes(s)) return { label: "AVOID", styles: "bg-red-500/15 text-red-400 border border-red-500/30" };
  return { label: "WATCH", styles: "bg-[#F5C84C]/15 text-[#F5C84C] border border-[#F5C84C]/30" };
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${(n / 1000).toFixed(1)}k`;
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function GoldDivider() {
  return (
    <div className="flex justify-center my-4">
      <div className="w-10 h-0.5 rounded-full bg-[#F5C84C]/30" />
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-center text-[11px] text-white/25 uppercase tracking-[0.18em] font-semibold mb-3">
      {children}
    </p>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-2xl md:text-4xl font-extrabold text-white text-center leading-tight mb-3">
      {children}
    </h2>
  );
}

// ─── SECTION 1 — This Week's 3 Moves ─────────────────────────────────────────

interface GamePlanPreviewProps {
  players: RankingRow[];
  loading: boolean;
}

function GamePlanPreview({ players, loading }: GamePlanPreviewProps) {
  const { mustHave, trap, captain } = useMemo(() => {
    const available = players.filter(
      p =>
        (p.manual_status ?? "").toUpperCase() !== "OUT" &&
        (p.manual_status ?? "").toUpperCase() !== "INJURED" &&
        !p.is_bye &&
        !p.is_injured &&
        p.projection != null
    );

    const byValue      = [...available].sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0));
    const byProjection = [...available].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));
    const byRisk       = [...available].sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0));

    return {
      mustHave: byValue[0] ?? null,
      captain:  byProjection[0] ?? null,
      trap:     byRisk[0] ?? null,
    };
  }, [players]);

  const cards = [
    {
      key: "must_have",
      icon: TrendingUp,
      label: "MUST BUY",
      accentColor: "#34d399",
      accentBg: "rgba(52,211,153,0.08)",
      accentBorder: "rgba(52,211,153,0.25)",
      action: "BUY",
      actionStyle: "bg-green-500/15 text-green-400 border border-green-500/30",
      player: mustHave,
    },
    {
      key: "trap",
      icon: AlertTriangle,
      label: "TRAP",
      accentColor: "#f87171",
      accentBg: "rgba(248,113,113,0.08)",
      accentBorder: "rgba(248,113,113,0.25)",
      action: "AVOID",
      actionStyle: "bg-red-500/15 text-red-400 border border-red-500/30",
      player: trap,
    },
    {
      key: "captain",
      icon: Star,
      label: "CAPTAIN",
      accentColor: "#F5C84C",
      accentBg: "rgba(245,200,76,0.08)",
      accentBorder: "rgba(245,200,76,0.25)",
      action: "START",
      actionStyle: "bg-[#F5C84C]/15 text-[#F5C84C] border border-[#F5C84C]/30",
      player: captain,
    },
  ];

  return (
    <section className="py-14 md:py-20 bg-[#070707] border-t border-white/[0.05]">
      <div className="max-w-3xl mx-auto px-4">
        <SectionLabel>This Week's Moves</SectionLabel>
        <SectionHeading>Make These 3 Moves This Week</SectionHeading>
        <GoldDivider />
        <p className="text-center text-white/50 text-sm mb-10 max-w-md mx-auto leading-relaxed">
          The model's strongest signal per category — updated before round lockout.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {cards.map(({ key, icon: Icon, label, accentColor, accentBg, accentBorder, action, actionStyle, player }) => {
            if (loading) {
              return (
                <div key={key} className="rounded-2xl bg-[#0e0e0e] border border-white/[0.07] p-6 animate-pulse">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.06]" />
                    <div className="h-3 w-20 bg-white/[0.06] rounded" />
                  </div>
                  <div className="h-5 w-32 bg-white/[0.08] rounded mb-2" />
                  <div className="h-3 w-20 bg-white/[0.05] rounded mb-5" />
                  <div className="h-14 bg-white/[0.04] rounded" />
                </div>
              );
            }

            if (!player) {
              return (
                <div
                  key={key}
                  className="rounded-2xl bg-[#0e0e0e] p-6 flex flex-col min-h-[200px]"
                  style={{ border: `1px solid ${accentBorder}` }}
                >
                  <div className="flex items-center gap-2 mb-5">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: accentBg, border: `1px solid ${accentBorder}` }}
                    >
                      <Icon size={15} style={{ color: `${accentColor}50` }} />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: `${accentColor}50` }}>
                      {label}
                    </span>
                  </div>
                  <p className="text-xs text-white/20 mt-auto">Live once round data is processed.</p>
                </div>
              );
            }

            const proj = player.projection != null ? Math.round(player.projection) : null;
            const reason = player.why ?? null;
            const truncated = reason && reason.length > 80
              ? reason.slice(0, 80).replace(/\s+\S*$/, "") + "..."
              : reason;

            return (
              <div
                key={key}
                className="rounded-2xl bg-[#0e0e0e] p-6 flex flex-col hover:scale-[1.015] transition-all duration-200 cursor-default"
                style={{ border: `1px solid ${accentBorder}`, background: `linear-gradient(160deg, ${accentBg} 0%, #0e0e0e 60%)` }}
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: accentBg, border: `1px solid ${accentBorder}` }}
                    >
                      <Icon size={15} style={{ color: accentColor }} />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: accentColor }}>
                      {label}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${actionStyle}`}>
                    {action}
                  </span>
                </div>

                <p className="text-[15px] font-bold text-white leading-tight mb-0.5">{player.player_name}</p>
                <p className="text-[11px] text-white/35 mb-4">{player.team}{player.position ? ` · ${player.position}` : ""}</p>

                {proj != null && (
                  <div
                    className="rounded-lg px-3 py-2.5 text-center mb-4"
                    style={{ background: accentBg, border: `1px solid ${accentBorder}` }}
                  >
                    <p className="text-[9px] text-white/30 uppercase tracking-wider mb-0.5">Projection</p>
                    <p className="text-base font-extrabold tabular-nums" style={{ color: accentColor }}>{proj} pts</p>
                  </div>
                )}

                {truncated && (
                  <p className="text-[11px] text-white/45 leading-snug mt-auto border-t border-white/[0.06] pt-3">
                    {truncated}
                  </p>
                )}

                <div className="mt-3 flex items-center gap-1.5">
                  <Lock size={10} className="text-white/15 shrink-0" />
                  <span className="text-[10px] text-white/20">Full breakdown — Neeko+</span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-[12px] text-white/35 mt-6">
          Premium unlocks the full weekly game plan, trade list, and captain pool.
        </p>

        <div className="mt-5 text-center">
          <Link
            to="/sports/afl/current-round"
            className="inline-flex items-center justify-center gap-2 bg-[#F5C84C] text-black font-bold text-sm px-8 py-3.5 rounded-xl hover:brightness-110 transition-all min-h-[48px] shadow-[0_0_20px_rgba(245,200,76,0.15)]"
          >
            Unlock This Week's Full Game Plan
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── SECTION 2 — Best Value Picks ────────────────────────────────────────────

interface MarketPreviewProps {
  players: RankingRow[];
  loading: boolean;
}

function MarketWatchPreview({ players, loading }: MarketPreviewProps) {
  const { bestBuy, watchClosely, biggestRisk } = useMemo(() => {
    const available = players.filter(
      p => !p.is_bye && !p.is_injured && p.price != null && p.projection != null
    );

    const buys = [...available]
      .filter(p => BUY_SIGNALS.includes((p.signal ?? "").toUpperCase()))
      .sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0));

    const watches = [...available]
      .filter(p => !BUY_SIGNALS.includes((p.signal ?? "").toUpperCase()) && !AVOID_SIGNALS.includes((p.signal ?? "").toUpperCase()))
      .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));

    const avoids = [...available]
      .filter(p => AVOID_SIGNALS.includes((p.signal ?? "").toUpperCase()))
      .sort((a, b) => (a.value_score ?? 0) - (b.value_score ?? 0));

    const watchFallback = buys[1] ?? null;

    return {
      bestBuy:      buys[0] ?? null,
      watchClosely: watches[0] ?? watchFallback,
      biggestRisk:  avoids[0] ?? null,
    };
  }, [players]);

  const cards = [
    {
      key: "buy",
      label: "Best Buy",
      sublabel: "Underpriced relative to projected output",
      accentColor: "#34d399",
      accentBg: "rgba(52,211,153,0.06)",
      accentBorder: "rgba(52,211,153,0.20)",
      badgeLabel: "BUY",
      badgeStyle: "bg-green-500/15 text-green-400 border border-green-500/30",
      player: bestBuy,
      showWhy: true,
    },
    {
      key: "watch",
      label: "Watch Closely",
      sublabel: "Strong trajectory — worth monitoring now",
      accentColor: "#F5C84C",
      accentBg: "rgba(245,200,76,0.05)",
      accentBorder: "rgba(245,200,76,0.18)",
      badgeLabel: "WATCH",
      badgeStyle: "bg-[#F5C84C]/15 text-[#F5C84C] border border-[#F5C84C]/25",
      player: watchClosely,
      showWhy: false,
    },
    {
      key: "risk",
      label: "Biggest Risk",
      sublabel: "Overpriced or trending down — avoid",
      accentColor: "#f87171",
      accentBg: "rgba(248,113,113,0.06)",
      accentBorder: "rgba(248,113,113,0.20)",
      badgeLabel: "AVOID",
      badgeStyle: "bg-red-500/15 text-red-400 border border-red-500/30",
      player: biggestRisk,
      showWhy: false,
    },
  ];

  return (
    <section className="py-12 md:py-16 bg-[#0a0a0a] border-t border-white/[0.05]">
      <div className="max-w-3xl mx-auto px-4">
        <SectionLabel>Market Watch</SectionLabel>
        <SectionHeading>Best Value Picks This Week</SectionHeading>
        <GoldDivider />
        <p className="text-center text-white/45 text-sm mb-8 max-w-md mx-auto leading-relaxed">
          Price vs projection mismatches. The model's clearest signals this round.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {cards.map(({ key, label, sublabel, accentColor, accentBg, accentBorder, badgeLabel, badgeStyle, player }) => {
            if (loading) {
              return (
                <div key={key} className="rounded-xl bg-[#0c0c0c] border border-white/[0.06] p-5 animate-pulse">
                  <div className="h-3 w-16 bg-white/[0.06] rounded mb-3" />
                  <div className="h-4 w-28 bg-white/[0.08] rounded mb-2" />
                  <div className="h-3 w-20 bg-white/[0.05] rounded mb-4" />
                  <div className="h-8 bg-white/[0.04] rounded" />
                </div>
              );
            }

            if (!player) {
              return (
                <div
                  key={key}
                  className="rounded-xl p-5 flex flex-col min-h-[160px]"
                  style={{ background: accentBg, border: `1px solid ${accentBorder}` }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: accentColor }}>{label}</p>
                  <p className="text-xs text-white/20">{sublabel}</p>
                  <p className="text-xs text-white/15 mt-auto">Live once round data is processed.</p>
                </div>
              );
            }

            const proj = player.projection != null ? Math.round(player.projection) : null;
            const valScore = player.value_score != null ? Number(player.value_score).toFixed(2) : null;
            const reason = player.why ?? null;
            const truncated = reason && reason.length > 68
              ? reason.slice(0, 68).replace(/\s+\S*$/, "") + "..."
              : reason;

            return (
              <div
                key={key}
                className="rounded-xl p-5 flex flex-col"
                style={{ background: accentBg, border: `1px solid ${accentBorder}` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accentColor }}>{label}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${badgeStyle}`}>{badgeLabel}</span>
                </div>
                <p className="text-sm font-bold text-white leading-tight truncate">{player.player_name}</p>
                <p className="text-[10px] text-white/30 mt-0.5 mb-3">{player.team}{player.position ? ` · ${player.position}` : ""}</p>

                <div className="flex items-center gap-3 pt-3 border-t border-white/[0.06]">
                  {proj != null && (
                    <div>
                      <div className="text-sm font-bold text-white tabular-nums">{proj}</div>
                      <div className="text-[9px] text-white/25">proj pts</div>
                    </div>
                  )}
                  {valScore != null && (
                    <div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: accentColor }}>{valScore}</div>
                      <div className="text-[9px] text-white/25">value</div>
                    </div>
                  )}
                  {player.price != null && (
                    <div className="ml-auto">
                      <div className="text-sm font-bold text-white/50 tabular-nums">{fmt(player.price)}</div>
                      <div className="text-[9px] text-white/25">price</div>
                    </div>
                  )}
                </div>

                {truncated && (
                  <p className="text-[10px] text-white/35 leading-snug mt-3 pt-3 border-t border-white/[0.05]">
                    {truncated}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/sports/afl/market-watch"
            className="inline-flex items-center justify-center gap-2 border border-white/15 text-white/60 hover:text-white hover:border-white/30 font-semibold text-sm px-7 py-3 rounded-xl transition-all min-h-[44px]"
          >
            View Full Market Watch
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── SECTION 3 — Biggest Value Movers ────────────────────────────────────────

interface ValueMoversProps {
  players: RankingRow[];
  loading: boolean;
}

function ValueMoversSection({ players, loading }: ValueMoversProps) {
  const movers = useMemo(() => {
    const available = players.filter(
      p => !p.is_bye && !p.is_injured && p.price != null && p.projection != null && p.value_score != null
    );

    const strong = available.filter(
      p => BUY_SIGNALS.includes((p.signal ?? "").toUpperCase()) || AVOID_SIGNALS.includes((p.signal ?? "").toUpperCase())
    );

    const pool = strong.length >= 5 ? strong : available;

    return [...pool]
      .sort((a, b) => Math.abs(b.value_score ?? 0) - Math.abs(a.value_score ?? 0))
      .slice(0, 5);
  }, [players]);

  return (
    <section className="py-12 md:py-16 bg-[#070707] border-t border-white/[0.05]">
      <div className="max-w-3xl mx-auto px-4">
        <SectionLabel>Value Engine</SectionLabel>
        <SectionHeading>Biggest Value Movers This Week</SectionHeading>
        <GoldDivider />
        <p className="text-center text-white/45 text-sm mb-8 max-w-md mx-auto leading-relaxed">
          Strongest price-vs-projection gaps. The biggest opportunities and risks this round.
        </p>

        <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
          <div className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-x-4 px-5 py-3 text-[10px] font-semibold text-white/25 uppercase tracking-widest border-b border-white/[0.06] bg-[#0a0a0a]">
            <span>Player</span>
            <span className="text-center text-[#F5C84C]/60">Value</span>
            <span className="text-center">Proj</span>
            <span className="text-right">Signal</span>
          </div>

          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-x-4 px-5 py-4 border-b border-white/[0.04] bg-[#0c0c0c] last:border-0">
                  <div className="h-4 bg-white/[0.06] rounded" />
                  <div className="h-4 bg-white/[0.06] rounded" />
                  <div className="h-4 bg-white/[0.06] rounded" />
                  <div className="h-4 bg-white/[0.06] rounded" />
                </div>
              ))
            : movers.length > 0
              ? movers.map((row, idx) => {
                  const act = getActionFromSignal(row.signal);
                  const valScore = row.value_score != null ? Number(row.value_score).toFixed(2) : "—";
                  const proj = row.projection != null ? Math.round(row.projection) : "—";
                  return (
                    <div
                      key={row.player_id ?? idx}
                      className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-x-4 px-5 py-3.5 border-b border-white/[0.04] bg-[#0c0c0c] hover:bg-[#111] transition-colors last:border-0 items-center"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate leading-tight">{row.player_name}</p>
                        <p className="text-[10px] text-white/30 leading-tight">{row.team}{row.position ? ` · ${row.position}` : ""}</p>
                      </div>
                      <span className="text-sm font-bold text-[#F5C84C] text-center tabular-nums">{valScore}</span>
                      <span className="text-sm font-semibold text-white/60 text-center tabular-nums">{proj}</span>
                      <div className="flex justify-end">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${act.styles}`}>
                          {act.label}
                        </span>
                      </div>
                    </div>
                  );
                })
              : (
                <div className="px-5 py-8 text-center text-sm text-white/25 bg-[#0c0c0c]">
                  Value data available when round data is processed.
                </div>
              )
          }

          <div className="px-5 py-3 border-t border-white/[0.05] bg-[#0a0a0a] flex items-center gap-1.5">
            <Lock size={10} className="text-white/20" />
            <span className="text-[10px] text-white/25">Full value engine and player breakdowns — Neeko+</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── SECTION 4 — Trust Block ──────────────────────────────────────────────────

function TrustBlock() {
  return (
    <section className="py-10 md:py-12 bg-[#0a0a0a] border-t border-white/[0.05]">
      <div className="max-w-3xl mx-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TRUST_ITEMS.map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0e0e0e] px-4 py-4"
            >
              <div className="w-8 h-8 rounded-lg bg-[#F5C84C]/10 border border-[#F5C84C]/20 flex items-center justify-center shrink-0">
                <Icon size={15} className="text-[#F5C84C]" />
              </div>
              <p className="text-sm font-semibold text-white/70 leading-snug">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── SECTION 5 — Pricing ──────────────────────────────────────────────────────

function PricingCTA() {
  return (
    <section className="py-14 md:py-20 bg-[#070707] border-t border-white/[0.05]">
      <div className="max-w-lg mx-auto px-4 text-center">
        <SectionLabel>Pricing</SectionLabel>
        <h2 className="text-2xl md:text-4xl font-extrabold text-white leading-tight mb-3">
          Unlock Full Access
        </h2>
        <GoldDivider />
        <p className="text-white/55 text-sm mb-2 max-w-sm mx-auto leading-relaxed">
          Free gives you the headlines. Neeko+ gives you the full weekly edge.
        </p>
        <p className="text-white/25 text-xs mb-10 max-w-sm mx-auto">
          Every insight updated before round lockout. Cancel anytime.
        </p>

        <div
          className="relative rounded-2xl p-8 mb-5 text-left"
          style={{
            border: "1px solid rgba(245,200,76,0.35)",
            background: "linear-gradient(160deg, #111 0%, #0d0d0d 100%)",
            boxShadow: "0 0 40px rgba(245,200,76,0.08)",
          }}
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="bg-[#F5C84C] text-black text-[11px] font-black px-3 py-0.5 rounded-full uppercase tracking-wide">
              Best Value
            </span>
          </div>

          <p className="text-xs font-bold uppercase tracking-widest text-[#F5C84C]/60 mb-3">Neeko+ Yearly</p>
          <div className="flex items-end gap-1.5 mb-1">
            <span className="text-4xl font-extrabold text-white">${NEEKO_PRICING.yearly.price}</span>
            <span className="text-sm text-white/35 mb-1">AUD / year</span>
          </div>
          <p className="text-xs text-[#F5C84C]/50 mb-6">
            ${NEEKO_PRICING.yearly.monthlyEquivalent}/month equivalent · Save {NEEKO_PRICING.savingsPercent}%
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-7">
            {NEEKO_FEATURES.map(f => (
              <div key={f} className="flex items-start gap-2">
                <div className="w-4 h-4 rounded-full bg-[#F5C84C]/15 border border-[#F5C84C]/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={8} className="text-[#F5C84C]" />
                </div>
                <span className="text-xs text-white/60 leading-snug">{f}</span>
              </div>
            ))}
          </div>

          <Link
            to="/neeko-plus"
            className="flex items-center justify-center gap-2 bg-[#F5C84C] text-black font-bold text-sm py-3.5 rounded-xl hover:brightness-110 transition-all min-h-[48px]"
          >
            <Crown size={14} />
            Unlock Full Access
          </Link>
        </div>

        <div className="rounded-2xl border border-white/[0.09] bg-[#0e0e0e] p-6 text-left">
          <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-3">Monthly</p>
          <div className="flex items-end gap-1.5 mb-1">
            <span className="text-3xl font-extrabold text-white">${NEEKO_PRICING.monthly.price}</span>
            <span className="text-sm text-white/35 mb-1">AUD / month</span>
          </div>
          <p className="text-xs text-white/25 mb-5">{NEEKO_PRICING.monthly.billingNote}</p>
          <Link
            to="/neeko-plus"
            className="flex items-center justify-center border border-[#F5C84C]/40 text-[#F5C84C] font-semibold text-sm py-3 rounded-xl hover:bg-[#F5C84C]/10 transition-all min-h-[44px]"
          >
            Start Monthly
          </Link>
        </div>

        <p className="text-[11px] text-white/20 mt-5">No lock-in. Cancel anytime.</p>
      </div>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Index() {
  const { isPremium } = useAuth();
  const [players, setPlayers]               = useState<RankingRow[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_rankings_safe", {
        p_user_id: null,
        p_is_bot: false,
        p_limit: 150,
      });
      if (error) {
        console.error("[LandingPlayers] fetch error:", error.message);
        setPlayersLoading(false);
        return;
      }
      setPlayers(((data ?? []) as any[]).map(mapRankingRow));
      setPlayersLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#070707] text-white pb-[80px] sm:pb-0">
      <Helmet>
        <title>Neeko Sports Stats — AI AFL Fantasy Intelligence</title>
        <meta name="description" content="Win your AFL Fantasy week in 30 seconds. Trade targets, trap warnings, and captain picks powered by real AFL data. Updated before every round lockout." />
        <link rel="canonical" href="https://neekostats.com.au/" />
        <meta property="og:title" content="Neeko Sports Stats — AI AFL Fantasy Intelligence" />
        <meta property="og:description" content="Win your AFL Fantasy week in 30 seconds. Trade targets, trap warnings, and captain picks powered by real AFL data." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/" />
        <meta property="og:site_name" content="Neeko Sports" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Neeko Sports Stats — AI AFL Fantasy Intelligence" />
        <meta name="twitter:description" content="Win your AFL Fantasy week in 30 seconds. Trade targets, trap warnings, and captain picks powered by real AFL data." />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="robots" content="index, follow" />
        <meta name="author" content="Neeko Sports" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "Neeko Sports Stats",
          "applicationCategory": "SportsApplication",
          "operatingSystem": "Web",
          "url": "https://neekostats.com.au",
          "description": "AI-powered AFL Fantasy analytics platform providing weekly player rankings, captain signals, breakout alerts, trap warnings and projection modelling for AFL Fantasy coaches.",
          "offers": {
            "@type": "Offer",
            "price": "9.99",
            "priceCurrency": "AUD",
          },
          "publisher": {
            "@type": "Organization",
            "name": "Neeko Sports Stats",
            "url": "https://neekostats.com.au",
          },
        })}</script>
      </Helmet>

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden min-h-[80vh] flex items-center">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url(/hero.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "center 65%",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.80) 55%, #070707 100%)",
          }}
        />

        <div className="relative z-10 w-full max-w-3xl mx-auto px-5 py-20 md:py-28 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#F5C84C]/35 bg-[#F5C84C]/10 text-[#F5C84C] text-[11px] font-bold uppercase tracking-widest mb-8">
            <Zap size={11} />
            AFL 2026 Season — Live Data
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.08] tracking-tight mb-5">
            Win Your AFL Fantasy<br className="hidden sm:block" /> Week in 30 Seconds
          </h1>

          <p className="text-base md:text-lg text-neutral-400 font-medium mb-10 max-w-xl mx-auto leading-relaxed">
            Trade targets, trap warnings, and captain picks powered by real AFL data.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center sm:items-center">
            <Link
              to="/sports/afl/current-round"
              className="flex items-center justify-center gap-2 bg-[#F5C84C] text-black font-bold text-sm px-8 rounded-xl hover:brightness-110 transition-all shadow-[0_4px_30px_rgba(245,200,76,0.25)] min-h-[52px] w-full sm:w-auto"
            >
              View This Week's Game Plan
              <ArrowRight size={14} />
            </Link>
            {!isPremium && (
              <Link
                to="/neeko-plus"
                className="flex items-center justify-center gap-2 border border-white/15 text-white/70 hover:text-white hover:border-white/30 font-semibold text-sm px-8 rounded-xl transition-all min-h-[52px] w-full sm:w-auto"
              >
                <Crown size={14} />
                Unlock Full Access
              </Link>
            )}
          </div>

          <p className="text-[11px] text-white/25 mt-6 tracking-wide">
            Updated before every AFL Fantasy round lockout · 600+ players ranked weekly
          </p>
        </div>
      </section>

      {/* ── SECTION 1 — 3 Key Moves ───────────────────────────────────────────── */}
      <GamePlanPreview players={players} loading={playersLoading} />

      {/* ── SECTION 2 — Best Value Picks ──────────────────────────────────────── */}
      <MarketWatchPreview players={players} loading={playersLoading} />

      {/* ── SECTION 3 — Biggest Value Movers ─────────────────────────────────── */}
      <ValueMoversSection players={players} loading={playersLoading} />

      {/* ── SECTION 4 — Trust Block ───────────────────────────────────────────── */}
      <TrustBlock />

      {/* ── SECTION 5 — Pricing ────────────────────────────────────────────────── */}
      <PricingCTA />

      {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.05] bg-[#070707] py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-white/20">© {new Date().getFullYear()} Neeko Sports Stats. All rights reserved.</p>
            <div className="flex gap-5 text-xs">
              {FOOTER_LINKS.map((l) => (
                <Link key={l.to} to={l.to} className="text-white/25 hover:text-white/60 transition-colors">
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* ── MOBILE STICKY BAR ─────────────────────────────────────────────────── */}
      {!isPremium && <MobileUpgradeBar />}
    </div>
  );
}
