import { useState, useEffect, useCallback, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Crown, Shield, Zap, RefreshCw, Lock, ChevronDown, ChevronRight, Star, TriangleAlert as AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { fmt, fmtPrice } from "@/features/afl/rankings/components/helpers";
import { PlayerDetailModal, UpgradeModal } from "@/features/afl/rankings/components/RankingsModals";
import type { RowTier } from "@/features/afl/rankings/components/types";
import { applyDecisionFields } from "@/lib/decisionEngine";

// ─── CACHE ───────────────────────────────────────────────────────────────────

const _STALE_MS = 60_000;
const _CACHE_VERSION = "v1-captains";
const _cache: {
  data: RankingRow[] | null;
  ts: number;
  userId: string | null;
  tier: string | null;
  version: string;
} = { data: null, ts: 0, userId: null, tier: null, version: "" };

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function normPos(pos: string | null | undefined): string {
  if (!pos) return "";
  const p = pos.toUpperCase().trim();
  if (p === "MIDFIELDER") return "MID";
  if (p === "FORWARD") return "FWD";
  if (p === "DEFENDER") return "DEF";
  if (p === "RUCK") return "RUC";
  return p;
}

function captainTierLabel(rating: string | null): string {
  if (!rating) return "Captain Option";
  return rating;
}

function makePlaceholderRow(rank: number): RankingRow {
  return {
    player_id: `locked-${rank}`,
    player_name: "Locked",
    team: "",
    position: null,
    projection: null,
    ceiling_estimate: null,
    floor_estimate: null,
    form_score: null,
    projection_confidence: null,
    captain_score: null,
    captain_rating: null,
    neeko_rating: null,
    neeko_rating_scaled: null,
    upside_pct: null,
    upside_rating: null,
    risk_rating: null,
    matchup_rating: null,
    matchup_label: null,
    matchup_multiplier: null,
    price: null,
    prev_price: null,
    price_change: null,
    price_change_pct: null,
    season_avg: null,
    last_3_avg: null,
    last_5_avg: null,
    games_played: null,
    breakeven: null,
    edge_canonical: null,
    action_canonical: null,
    category_canonical: null,
    confidence_label: null,
    why: null,
    why_long: null,
    trend_signal: null,
    trend_score: null,
    form_delta: null,
    form_label: null,
    status: null,
    manual_status: null,
    is_available: null,
    bye_round: null,
    is_bye: null,
    bye_next_round: null,
    is_injured: null,
    consistency: null,
    consistency_tier: null,
    recommendation_color: null,
    recommendation_strength: null,
    total_count: null,
    ai_updated_at: null,
    access_tier: "locked",
  };
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function PosBadge({ pos }: { pos: string }) {
  const map: Record<string, string> = {
    DEF: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    MID: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    RUC: "border-orange-500/30 bg-orange-500/10 text-orange-400",
    FWD: "border-red-500/30 bg-red-500/10 text-red-400",
  };
  const cls = map[pos] ?? "border-white/15 bg-white/05 text-white/40";
  return (
    <span className={`inline-flex text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none ${cls}`}>
      {pos}
    </span>
  );
}

function RatingPill({ rating }: { rating: string | null }) {
  if (!rating) return null;
  if (rating === "Elite Captain") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-yellow-400/40 bg-yellow-400/10 text-yellow-300 leading-none">
        <Crown className="w-2.5 h-2.5" />
        Elite Captain
      </span>
    );
  }
  if (rating === "Strong Captain") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 leading-none">
        <Star className="w-2.5 h-2.5" />
        Strong Captain
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-white/15 bg-white/05 text-white/50 leading-none">
      <Crown className="w-2.5 h-2.5" />
      Captain Option
    </span>
  );
}

function ConfidenceBadge({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  const up = label.toUpperCase();
  const color = up === "HIGH" ? "#4ade80" : up === "MEDIUM" ? "#F5C84C" : "#fb923c";
  const borderColor = up === "HIGH" ? "rgba(74,222,128,0.25)" : up === "MEDIUM" ? "rgba(245,200,76,0.25)" : "rgba(251,146,60,0.25)";
  const bgColor = up === "HIGH" ? "rgba(74,222,128,0.08)" : up === "MEDIUM" ? "rgba(245,200,76,0.08)" : "rgba(251,146,60,0.08)";
  const displayLabel = up === "HIGH" ? "High Conf" : up === "MEDIUM" ? "Med Conf" : "Low Conf";
  return (
    <span
      className="inline-flex text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border leading-none"
      style={{ color, borderColor, background: bgColor }}
    >
      {displayLabel}
    </span>
  );
}

// ─── CAPTAIN CARD ─────────────────────────────────────────────────────────────

function CaptainCard({
  player,
  rank,
  locked,
  onOpen,
}: {
  player: RankingRow;
  rank: number;
  locked?: boolean;
  onOpen: () => void;
}) {
  const pos = normPos(player.position);
  const conf = player.confidence_label;
  const rating = player.captain_rating ?? null;
  const why = player.why ?? null;
  const matchup = player.matchup_label ?? null;
  const proj = player.projection;

  if (locked) {
    return (
      <div className="rounded-xl border border-white/[0.07] p-4 select-none" style={{ background: "#0d0d0d" }}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
            <Lock className="w-3.5 h-3.5 text-white/20" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-3 w-28 rounded bg-white/[0.06]" />
            <div className="h-2.5 w-20 rounded bg-white/[0.04]" />
            <div className="h-2 w-36 rounded bg-white/[0.03]" />
          </div>
          <div className="text-right">
            <div className="h-6 w-12 rounded bg-white/[0.05]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-xl border p-4 transition-all duration-150 hover:border-white/15 hover:bg-white/[0.02] group"
      style={{ background: "#0d0d0d", borderColor: "rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-start gap-3">
        {/* Rank bubble */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold tabular-nums"
          style={{ background: "rgba(245,200,76,0.10)", color: "#F5C84C", border: "1px solid rgba(245,200,76,0.25)" }}
        >
          {rank}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-sm font-bold text-white leading-tight">{player.player_name}</span>
            {pos && <PosBadge pos={pos} />}
            <RatingPill rating={rating} />
          </div>

          <div className="text-[11px] text-white/35 mb-2">
            {player.team}
            {player.price ? ` · ${fmtPrice(player.price)}` : ""}
            {matchup ? (
              <span className="ml-1 text-white/25">vs {matchup}</span>
            ) : null}
          </div>

          {/* Confidence badge */}
          {conf && <ConfidenceBadge label={conf} />}

          {/* Short reason */}
          {why && (
            <p className="text-[11px] text-white/35 mt-2 leading-relaxed line-clamp-2">{why}</p>
          )}
        </div>

        {/* Projection */}
        <div className="text-right shrink-0 pl-2">
          <div className="text-xl font-bold text-white tabular-nums leading-none">{fmt(proj, 0)}</div>
          <div className="text-[9px] text-white/25 mt-0.5">pts proj</div>
          {player.captain_score != null && (
            <div className="text-[10px] font-semibold mt-1.5" style={{ color: "#F5C84C" }}>
              {fmt(player.captain_score, 0)} cap
            </div>
          )}
          <ChevronRight className="w-3 h-3 text-white/15 group-hover:text-white/35 transition-colors mt-1 ml-auto" />
        </div>
      </div>
    </button>
  );
}

// ─── SECTION ──────────────────────────────────────────────────────────────────

function Section({
  icon,
  label,
  sublabel,
  accentColor,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}30`, color: accentColor }}
        >
          {icon}
        </div>
        <div>
          <h2 className="text-base font-bold text-white leading-tight">{label}</h2>
          <p className="text-[11px] text-white/35 mt-0.5">{sublabel}</p>
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// ─── COLLAPSIBLE SEO ─────────────────────────────────────────────────────────

function CollapsibleSEO() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/[0.06] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-[12px] text-white/40 font-medium">About Captain Picks</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-white/25 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className="border-t border-white/[0.05] overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? "500px" : "0px", opacity: open ? 1 : 0 }}
      >
        <div className="px-4 pb-5 pt-3 space-y-3">
          <p className="text-[12px] text-white/40 leading-relaxed">
            Neeko's captain model ranks players by projected ceiling score, consistency, and matchup advantage. Players in LOCK are the highest-confidence doubling options this round.
          </p>
          <ul className="space-y-2 text-[12px] text-white/35 leading-relaxed">
            <li><strong className="text-white/55">LOCK</strong> — Elite captain confidence. Highest projection, consistent scorer, good matchup.</li>
            <li><strong className="text-white/55">SAFE</strong> — Reliable doubling option with strong projection and stable form.</li>
            <li><strong className="text-white/55">POD</strong> — Differential pick. Lower ownership, upside potential this week.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── LOCK CTA ─────────────────────────────────────────────────────────────────

function LockCTA({ onUpgrade, hiddenCount }: { onUpgrade: () => void; hiddenCount: number }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 px-4">
      <button
        onClick={onUpgrade}
        className="flex items-center gap-2 text-[12px] font-bold border rounded-xl px-4 py-2.5 transition-all duration-200 hover:-translate-y-0.5"
        style={{
          color: "#F5C84C",
          borderColor: "rgba(245,200,76,0.30)",
          background: "rgba(245,200,76,0.06)",
        }}
      >
        <Crown className="w-3.5 h-3.5" />
        Unlock {hiddenCount} more picks — Neeko+
      </button>
      <p className="text-[10px] text-white/25">Full SAFE + POD picks, confidence scores &amp; AI insights</p>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function AFLCaptainsPage() {
  const { isPremium, user, loading: authLoading } = useAuth();
  const [players, setPlayers] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<{ row: RankingRow; rank: number; tier: RowTier } | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const fetchData = useCallback(
    async (force = false) => {
      const userId = user?.id ?? null;
      const tier = isPremium ? "premium" : "free";
      const now = Date.now();
      if (
        !force &&
        _cache.data &&
        _cache.userId === userId &&
        _cache.tier === tier &&
        _cache.version === _CACHE_VERSION &&
        now - _cache.ts < _STALE_MS
      ) {
        setPlayers(_cache.data);
        setLoading(false);
        return;
      }

      if (force) setRefreshing(true);
      else setLoading(true);
      setFetchError(null);

      try {
        const { data, error } = await supabase.rpc("get_rankings_safe", {
          p_user_id: userId,
          p_is_bot: false,
          p_limit: isPremium ? 300 : 100,
        });
        if (error) throw error;
        if (data) {
          const rows = applyDecisionFields((data as Record<string, unknown>[]).map(mapRankingRow));
          _cache.data = rows;
          _cache.ts = Date.now();
          _cache.userId = userId;
          _cache.tier = tier;
          _cache.version = _CACHE_VERSION;
          setPlayers(rows);
        }
      } catch (err) {
        console.error("Captains fetch error:", err);
        setFetchError("Failed to load captain data. Please refresh.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isPremium, user]
  );

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [fetchData, authLoading]);

  useEffect(() => {
    track("captains_page_view");
  }, []);

  // ── BUILD CAPTAIN TIERS ────────────────────────────────────────────────────
  const { locks, safes, pods, riskyCaptains } = useMemo(() => {
    if (players.length === 0) return { locks: [], safes: [], pods: [], riskyCaptains: [] };

    const eligible = players.filter(
      p => !p.is_injured && !p.is_bye && (p.projection ?? 0) > 0 && p.player_id
    );

    // Sort by decision_score desc as primary signal
    const byDecision = [...eligible].sort(
      (a, b) => (b.decision_score ?? 0) - (a.decision_score ?? 0)
    );

    // LOCK: top 1 by decision_score
    const locks = byDecision.slice(0, 1);

    // SAFE: next 3 by decision_score
    const safes = byDecision.slice(1, 4);

    // POD: next 3 by ceiling_estimate (differential upside) falling back to decision_score
    const usedIds = new Set([...locks, ...safes].map(p => p.player_id));
    const pods = [...eligible]
      .filter(p => !usedIds.has(p.player_id))
      .sort((a, b) => (b.ceiling_estimate ?? b.decision_score ?? 0) - (a.ceiling_estimate ?? a.decision_score ?? 0))
      .slice(0, 3);

    // RISKY CAPTAIN: high projection but low confidence
    const allUsed = new Set([...locks, ...safes, ...pods].map(p => p.player_id));
    const riskyCaptains = eligible
      .filter(p => !allUsed.has(p.player_id))
      .filter(p => (p.projection ?? 0) >= 90 && p.confidence_label === "LOW")
      .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
      .slice(0, 2);

    return { locks, safes, pods, riskyCaptains };
  }, [players]);

  function openPlayer(p: RankingRow, rank: number) {
    setSelectedPlayer({ row: p, rank, tier: isPremium ? "premium" : "full" });
    track("captains_player_click", { player_name: p.player_name });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="text-white/30 text-sm animate-pulse">Loading captain picks...</div>
      </div>
    );
  }

  const pageTitle = "AFL Fantasy Captain Picks — Lock, Safe & POD Options | Neeko Sports";

  // Free shows: 1 lock only
  const freeLockCount = 1;
  const showSafe = isPremium;
  const showPod = isPremium;
  const locksToShow = isPremium ? locks : locks.slice(0, freeLockCount);
  const lockedLockCount = isPremium ? 0 : Math.max(0, locks.length - freeLockCount);
  const totalHidden = isPremium ? 0 : safes.length + pods.length + lockedLockCount;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content="AFL Fantasy captain picks this round — LOCK, SAFE and POD options ranked by Neeko's projection model, confidence, and matchup data." />
        <link rel="canonical" href="https://neekostats.com.au/sports/afl/captains" />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:url" content="https://neekostats.com.au/sports/afl/captains" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
      </Helmet>

      <div className="min-h-screen bg-[#070707] text-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">

          {/* ── HEADER ────────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] uppercase tracking-widest text-white/25 font-semibold">AFL Fantasy</span>
                <span className="h-px w-6 bg-white/[0.06]" />
                <span className="text-[10px] uppercase tracking-wider text-[#F5C84C] font-semibold">Captains</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">Captain Picks</h1>
              <p className="text-sm text-white/40 mt-1">High-confidence doubling options — curated, not ranked</p>
            </div>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors disabled:opacity-40 shrink-0 mt-1"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-white/40 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* ── ERROR ─────────────────────────────────────────────────────── */}
          {fetchError && (
            <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/20 bg-red-500/05">
              {fetchError}
            </div>
          )}

          {/* ── LOCK ──────────────────────────────────────────────────────── */}
          <Section
            icon={<Crown className="w-4 h-4" />}
            label="LOCK"
            sublabel="Start here. Highest projection, proven consistency."
            accentColor="#F5C84C"
          >
            {locksToShow.length === 0 ? (
              <div className="text-center text-white/25 text-sm py-8">No captain picks available for this round.</div>
            ) : (
              locksToShow.map((p, i) => (
                <CaptainCard
                  key={p.player_id}
                  player={p}
                  rank={i + 1}
                  onOpen={() => openPlayer(p, i + 1)}
                />
              ))
            )}
            {!isPremium && lockedLockCount > 0 && (
              <>
                {Array.from({ length: lockedLockCount }).map((_, i) => (
                  <CaptainCard
                    key={`locked-lock-${i}`}
                    player={makePlaceholderRow(freeLockCount + i + 1)}
                    rank={freeLockCount + i + 1}
                    locked
                    onOpen={() => {}}
                  />
                ))}
              </>
            )}
          </Section>

          {/* ── SAFE / LOCK CTA ───────────────────────────────────────────── */}
          {showSafe && safes.length > 0 ? (
            <Section
              icon={<Shield className="w-4 h-4" />}
              label="SAFE"
              sublabel="Reliable options if your lock is injured or benched."
              accentColor="#60a5fa"
            >
              {safes.map((p, i) => (
                <CaptainCard
                  key={p.player_id}
                  player={p}
                  rank={i + 1}
                  onOpen={() => openPlayer(p, i + 1)}
                />
              ))}
            </Section>
          ) : !isPremium ? (
            <div
              className="rounded-2xl border overflow-hidden"
              style={{ borderColor: "rgba(255,255,255,0.07)", background: "#0d0d0d" }}
            >
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-blue-400/60" />
                <span className="text-[12px] font-bold uppercase tracking-wider text-white/40">SAFE</span>
              </div>
              {Array.from({ length: 2 }).map((_, i) => (
                <CaptainCard
                  key={`locked-safe-${i}`}
                  player={makePlaceholderRow(i + 1)}
                  rank={i + 1}
                  locked
                  onOpen={() => {}}
                />
              ))}
              <LockCTA onUpgrade={() => setShowUpgradeModal(true)} hiddenCount={totalHidden} />
            </div>
          ) : null}

          {/* ── POD ───────────────────────────────────────────────────────── */}
          {showPod && pods.length > 0 && (
            <Section
              icon={<Zap className="w-4 h-4" />}
              label="POD"
              sublabel="Differential. Low ownership, high upside this round."
              accentColor="#a78bfa"
            >
              {pods.map((p, i) => (
                <CaptainCard
                  key={p.player_id}
                  player={p}
                  rank={i + 1}
                  onOpen={() => openPlayer(p, i + 1)}
                />
              ))}
            </Section>
          )}

          {/* ── RISKY CAPTAIN ─────────────────────────────────────────────── */}
          {isPremium && riskyCaptains.length > 0 && (
            <Section
              icon={<AlertTriangle className="w-4 h-4" />}
              label="Risky Captain"
              sublabel="High projection but low confidence — proceed with caution."
              accentColor="#fb923c"
            >
              {riskyCaptains.map((p, i) => (
                <CaptainCard
                  key={p.player_id}
                  player={p}
                  rank={i + 1}
                  onOpen={() => openPlayer(p, i + 1)}
                />
              ))}
            </Section>
          )}

          {/* ── LOCK CTA (if free and no safe/pod rendered) ───────────────── */}
          {!isPremium && showSafe && (
            <LockCTA onUpgrade={() => setShowUpgradeModal(true)} hiddenCount={totalHidden} />
          )}

          {/* ── SEO ───────────────────────────────────────────────────────── */}
          <CollapsibleSEO />

        </div>
      </div>

      {selectedPlayer && (
        <PlayerDetailModal
          row={selectedPlayer.row}
          rank={selectedPlayer.rank}
          isPremium={isPremium}
          isUnlocked={true}
          tier={selectedPlayer.tier}
          isFreeTop5={false}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
      {showUpgradeModal && (
        <UpgradeModal onClose={() => setShowUpgradeModal(false)} />
      )}
    </>
  );
}
