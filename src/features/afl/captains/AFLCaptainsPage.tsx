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
import { getCaptainScore, getCaptainConfidence, isCaptainEligible } from "@/features/afl/shared/data/captainScoring";

// ─── CACHE ───────────────────────────────────────────────────────────────────

const _STALE_MS = 60_000;
const _CACHE_VERSION = "v2-captains";
const _cache: {
  data: RankingRow[] | null;
  ts: number;
  userId: string | null;
  tier: string | null;
  version: string;
} = { data: null, ts: 0, userId: null, tier: null, version: "" };

const FREE_CAPTAIN_LIMIT = 2;

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
  onOpen,
}: {
  player: RankingRow;
  rank: number;
  onOpen: () => void;
}) {
  const pos = normPos(player.position);
  const conf = player.confidence_label;
  const rating = player.captain_rating ?? null;
  const why = player.why ?? null;
  const matchup = player.matchup_label ?? null;
  const proj = player.projection;
  const capScore = player.captain_score ?? getCaptainScore(player);
  const capConf = getCaptainConfidence(capScore);
  const displayConf = conf ?? capConf;

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-xl border p-4 transition-all duration-150 hover:border-white/15 hover:bg-white/[0.02] group"
      style={{ background: "#0d0d0d", borderColor: "rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold tabular-nums"
          style={{ background: "rgba(245,200,76,0.10)", color: "#F5C84C", border: "1px solid rgba(245,200,76,0.25)" }}
        >
          {rank}
        </div>

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

          <ConfidenceBadge label={displayConf} />

          {why && (
            <p className="text-[11px] text-white/35 mt-2 leading-relaxed line-clamp-2">{why}</p>
          )}
        </div>

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

// ─── FREE LOCK CTA ────────────────────────────────────────────────────────────

function FreeLockCTA({ onUpgrade, hiddenCount }: { onUpgrade: () => void; hiddenCount: number }) {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "rgba(245,200,76,0.15)", background: "rgba(245,200,76,0.03)" }}
    >
      <div className="px-5 py-5 flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-1.5 text-[11px] text-white/40 font-medium">
          <Lock className="w-3 h-3 text-white/30" />
          {hiddenCount} more captain options hidden
        </div>
        <button
          onClick={onUpgrade}
          className="flex items-center gap-2 text-[13px] font-bold border rounded-xl px-5 py-2.5 transition-all duration-200 hover:-translate-y-0.5"
          style={{
            color: "#F5C84C",
            borderColor: "rgba(245,200,76,0.30)",
            background: "rgba(245,200,76,0.08)",
          }}
        >
          <Crown className="w-3.5 h-3.5" />
          Unlock full captain strategy
        </button>
        <p className="text-[10px] text-white/25">Full SAFE + POD picks, confidence scores &amp; AI insights</p>
      </div>
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
  const { allCaptains, locks, safes, pods, riskyCaptains } = useMemo(() => {
    if (players.length === 0) return { allCaptains: [], locks: [], safes: [], pods: [], riskyCaptains: [] };

    const eligible = players.filter(isCaptainEligible);

    // Sort ALL eligible players by backend captain_score when available, fallback to computed
    const byScore = [...eligible].sort((a, b) => {
      const aScore = a.captain_score ?? getCaptainScore(a);
      const bScore = b.captain_score ?? getCaptainScore(b);
      return bScore - aScore;
    });

    // LOCK: top 2 by captain score
    const locks = byScore.slice(0, 2);

    // SAFE: next 3 by captain score
    const safes = byScore.slice(2, 5);

    // POD: high ceiling differential picks not already in locks/safes
    const usedIds = new Set([...locks, ...safes].map(p => p.player_id));
    const pods = [...eligible]
      .filter(p => !usedIds.has(p.player_id))
      .sort((a, b) => (b.ceiling_estimate ?? b.projection ?? 0) - (a.ceiling_estimate ?? a.projection ?? 0))
      .slice(0, 3);

    // RISKY: captain-eligible but with explicit negative signal (SIT/HARD_SIT) or very low captain_score
    const allUsed = new Set([...locks, ...safes, ...pods].map(p => p.player_id));
    const riskyCaptains = eligible
      .filter(p => !allUsed.has(p.player_id))
      .filter(p => {
        const ac = (p.action_canonical ?? "").toUpperCase();
        const capScore = p.captain_score ?? getCaptainScore(p);
        const isExplicitRisk = ac === "SIT" || ac === "HARD_SIT";
        const isLowCapScore = capScore < 70;
        return isExplicitRisk || isLowCapScore;
      })
      .sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0))
      .slice(0, 2);

    // allCaptains: flat ranked list used for free tier (FILTER → SORT → SLICE)
    const allCaptains = byScore;

    return { allCaptains, locks, safes, pods, riskyCaptains };
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

  // Free: show exactly 2 real captains, then locked CTA
  const freeCaptains = allCaptains.slice(0, FREE_CAPTAIN_LIMIT);
  const totalHidden = Math.max(0, allCaptains.length - FREE_CAPTAIN_LIMIT);

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content="AFL Fantasy captain picks this round — LOCK, SAFE and POD options ranked by Neeko's projection model, confidence, and matchup data." />
        <link rel="canonical" href="https://neekostats.com.au/fantasy/captains" />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content="AFL Fantasy captain picks this round — LOCK, SAFE and POD options ranked by Neeko's projection model, confidence, and matchup data." />
        <meta property="og:url" content="https://neekostats.com.au/fantasy/captains" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta property="og:site_name" content="Neeko Sports Stats" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content="AFL Fantasy captain picks this round — LOCK, SAFE and POD options ranked by Neeko's projection model, confidence, and matchup data." />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
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

          {/* ── FREE TIER: exactly 2 captains + locked CTA ────────────────── */}
          {!isPremium && (
            <Section
              icon={<Crown className="w-4 h-4" />}
              label="Captain Picks"
              sublabel="Top picks ranked by projection, ceiling, and consistency."
              accentColor="#F5C84C"
            >
              {freeCaptains.length === 0 ? (
                <div className="text-center text-white/25 text-sm py-8">No captain picks available for this round.</div>
              ) : (
                freeCaptains.map((p, i) => (
                  <CaptainCard
                    key={p.player_id}
                    player={p}
                    rank={i + 1}
                    onOpen={() => openPlayer(p, i + 1)}
                  />
                ))
              )}
              {totalHidden > 0 && (
                <FreeLockCTA
                  onUpgrade={() => setShowUpgradeModal(true)}
                  hiddenCount={totalHidden}
                />
              )}
            </Section>
          )}

          {/* ── PREMIUM TIER: full LOCK / SAFE / POD / RISKY layout ───────── */}
          {isPremium && (
            <>
              {/* LOCK */}
              <Section
                icon={<Crown className="w-4 h-4" />}
                label="LOCK"
                sublabel="Start here. Highest projection, proven consistency."
                accentColor="#F5C84C"
              >
                {locks.length === 0 ? (
                  <div className="text-center text-white/25 text-sm py-8">No captain picks available for this round.</div>
                ) : (
                  locks.map((p, i) => (
                    <CaptainCard
                      key={p.player_id}
                      player={p}
                      rank={i + 1}
                      onOpen={() => openPlayer(p, i + 1)}
                    />
                  ))
                )}
              </Section>

              {/* SAFE */}
              {safes.length > 0 && (
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
              )}

              {/* POD */}
              {pods.length > 0 && (
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

              {/* RISKY CAPTAIN */}
              {riskyCaptains.length > 0 && (
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
            </>
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
