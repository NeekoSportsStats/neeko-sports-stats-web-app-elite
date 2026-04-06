import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowRight, RotateCcw, Zap, Share2, Check, ChevronDown } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { StartSitSelector } from "./StartSitSelector";
import { StartSitResult } from "./StartSitResult";
import { StartSitSocialProof } from "./StartSitSocialProof";
import type { QuickFillPlayer } from "./StartSitSocialProof";
import { GameContextSelector, loadGameContext, type GameContext } from "./GameContextSelector";
import { OpponentInput, loadOpponentModel, deriveOpponentState, getMargin, type OpponentModel } from "./OpponentInput";
import type { WinProbabilityData } from "./WinProbabilityPanel";
import { getAflRoundLabel } from "@/features/afl/shared/data/getAflRoundLabel";
import { ErrorState } from "@/components/ui/ErrorState";

const CURRENT_SEASON = 2026;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface PlayerOption {
  player_id: string | number;
  player_name: string;
  team: string | null;
  position: string | null;
  projection_final: number | null;
  signal_canonical: string | null;
}

interface CompareResult {
  winner_player_id: string;
  winner_name: string;
  confidence: number;
  ai_summary: string | null;
  model_edge: string | null;
  is_cached: boolean;
  playerA: PlayerOption;
  playerB: PlayerOption;
  short_summary?: string | null;
  long_summary?: string | null;
  start_conditions?: string[] | null;
  sit_conditions?: string[] | null;
  play_style?: "safe" | "upside" | "balanced" | null;
  decision_context?: "close" | "lean" | "clear" | "strong" | null;
  meta?: {
    is_close_call?: boolean;
    confidence_percent?: number;
    probability_gap?: number;
  } | null;
  win_probability?: WinProbabilityData | null;
}

function SEOGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left group hover:bg-white/[0.02] transition-colors"
        aria-expanded={open}
      >
        <div>
          <p className="text-sm font-semibold text-white/60 group-hover:text-white/75 transition-colors">
            AFL Start / Sit Guide
          </p>
          <p className="text-[11px] text-white/28 mt-0.5">How the model works and how to use it</p>
        </div>
        <ChevronDown
          size={14}
          className={`text-white/20 group-hover:text-white/40 transition-all duration-300 shrink-0 ml-3 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          open ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
        }`}
        aria-hidden={!open}
      >
        <div className="px-5 pb-5 space-y-5 border-t border-white/[0.05]">
          <div className="pt-4">
            <h2 className="text-base font-semibold text-white mb-3">
              How to Use the AFL Fantasy Start / Sit Tool
            </h2>
            <p className="text-sm text-white/55 leading-relaxed">
              The Start / Sit tool helps you resolve the hardest AFL Fantasy decision each week — which player
              to put in your starting lineup. Select any two players from your squad, add optional matchup
              context, and Neeko's model returns a data-driven verdict with confidence score, projected
              output, and a plain-English explanation of why one player edges the other.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white/80 mb-2">What the verdict considers</h3>
            <ul className="space-y-2 text-sm text-white/50 leading-relaxed">
              <li>
                <strong className="text-white/70">Projected score</strong> — Each player's Neeko projection
                for the round, adjusted for form, role, and venue.
              </li>
              <li>
                <strong className="text-white/70">Matchup difficulty</strong> — How the opposing team
                concedes to the player's position historically.
              </li>
              <li>
                <strong className="text-white/70">Consistency score</strong> — How reliable the player is
                across recent rounds (ceiling vs floor trade-off).
              </li>
              <li>
                <strong className="text-white/70">Price value</strong> — Whether starting them aligns with
                their current fantasy price and breakeven needs.
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white/80 mb-2">When to use it</h3>
            <p className="text-sm text-white/50 leading-relaxed">
              Best used after you've locked in your trades and need to finalise your lineup. For broader trade
              decisions check the{" "}
              <a
                href="/sports/afl/market-watch"
                className="text-white/70 underline underline-offset-2 hover:text-white transition-colors"
              >
                Market Watch
              </a>{" "}
              for price movement targets, or the{" "}
              <a
                href="/sports/afl/edge-board"
                className="text-white/70 underline underline-offset-2 hover:text-white transition-colors"
              >
                Edge Board
              </a>{" "}
              for this round's captain lock and trap picks.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StartSitPage() {
  const { isPremium, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [playerA, setPlayerA] = useState<PlayerOption | null>(null);
  const [playerB, setPlayerB] = useState<PlayerOption | null>(null);
  const [round, setRound] = useState<number>(1);
  const [roundLoading, setRoundLoading] = useState(true);
  const [topPlayers, setTopPlayers] = useState<PlayerOption[]>([]);

  const [gameContext, setGameContext] = useState<GameContext>(() => loadGameContext());
  const [showContext, setShowContext] = useState(false);

  const [opponentModel, setOpponentModel] = useState<OpponentModel>(() => loadOpponentModel());

  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const compareButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { track("start_sit_view"); }, []);

  useEffect(() => {
    supabase
      .rpc("get_latest_completed_round", { p_season: 2026 })
      .then(({ data }) => {
        const activeRound = typeof data === "number" && data >= 0 ? data : 0;
        setRound(activeRound);
      })
      .catch(() => setRound(0))
      .finally(() => setRoundLoading(false));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    supabase
      .from("v_player_rankings_cache")
      .select("player_id, player_name, team, position, projection_final, signal_canonical")
      .not("player_id", "is", null)
      .order("projection_final", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          return;
        }
        if (data) setTopPlayers(data as PlayerOption[]);
      });
  }, [authLoading, isPremium]);

  useEffect(() => {
    const pA = searchParams.get("playerA");
    const pB = searchParams.get("playerB");
    if (!pA && !pB) return;
    if (authLoading) return;

    async function prefillFromUrl() {
      const ids = [pA, pB].filter(Boolean) as string[];
      if (ids.length === 0) return;

      const { data, error } = await supabase
        .from("v_player_rankings_cache")
        .select("player_id, player_name, team, position, projection_final, signal_canonical")
        .in("player_name", ids.map((n) => n.replace(/-/g, " ")));

      if (error) {
        console.error(error);
        return;
      }
      if (!data) return;
      const [found1, found2] = data as PlayerOption[];
      if (found1) setPlayerA(found1);
      if (found2) setPlayerB(found2);
    }

    prefillFromUrl();
  }, [searchParams, authLoading, isPremium]);

  const handlePlayerAChange = useCallback((p: PlayerOption | null) => {
    setPlayerA(p);
    setResult(null);
    setError(null);
  }, []);

  const handlePlayerBChange = useCallback((p: PlayerOption | null) => {
    setPlayerB(p);
    setResult(null);
    setError(null);
  }, []);

  const handleFillBoth = useCallback((a: QuickFillPlayer, b: QuickFillPlayer) => {
    setPlayerA(a as PlayerOption);
    setPlayerB(b as PlayerOption);
    setResult(null);
    setError(null);
  }, []);

  const handleScrollToCompare = useCallback(() => {
    setTimeout(() => {
      compareButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, []);

  async function runCompare(pA: PlayerOption, pB: PlayerOption) {
    track("start_sit_generate", {
      player_a: pA.player_name,
      player_b: pB.player_name,
    });

    setComparing(true);
    setResult(null);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const authHeader = session?.access_token
        ? `Bearer ${session.access_token}`
        : `Bearer ${ANON_KEY}`;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-start-sit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          season: CURRENT_SEASON,
          round_number: round ?? 0,
          playerAId: pA.player_id,
          playerBId: pB.player_id,
          context: {
            match_state: gameContext.matchState,
            play_style: gameContext.playStyle,
            timing: gameContext.timing,
            opponent_margin: getMargin(opponentModel),
            opponent_state: deriveOpponentState(opponentModel),
          },
        }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        setError(json.error ?? "Unable to generate comparison. Please try again.");
        return;
      }

      const resultPlayerA: PlayerOption = json.playerA ?? pA;
      const resultPlayerB: PlayerOption = json.playerB ?? pB;

      setResult({
        winner_player_id: String(json.winner_player_id),
        winner_name: json.winner_name,
        confidence: typeof json.confidence === "number" ? json.confidence : 60,
        ai_summary: json.ai_summary ?? null,
        model_edge: json.model_edge ?? null,
        is_cached: json.is_cached ?? false,
        playerA: resultPlayerA,
        playerB: resultPlayerB,
        short_summary: json.short_summary ?? null,
        long_summary: json.long_summary ?? null,
        start_conditions: Array.isArray(json.start_conditions) ? json.start_conditions : null,
        sit_conditions: Array.isArray(json.sit_conditions) ? json.sit_conditions : null,
        play_style: json.play_style ?? null,
        decision_context: json.decision_context ?? null,
        meta: json.meta ?? null,
        win_probability: json.win_probability ?? null,
      });

      const sessionId = typeof crypto !== "undefined" ? (crypto.randomUUID?.() ?? null) : null;
      supabase.rpc("record_start_sit_decision", {
        p_player_a_id:      String(pA.player_id),
        p_player_b_id:      String(pB.player_id),
        p_player_a_name:    pA.player_name,
        p_player_b_name:    pB.player_name,
        p_winner_player_id: String(json.winner_player_id),
        p_session_id:       sessionId,
      }).then(() => {});
    } catch {
      setError("Unable to generate comparison. Please try again.");
    } finally {
      setComparing(false);
    }
  }

  async function handleCompare() {
    if (!playerA || !playerB) return;
    await runCompare(playerA, playerB);
  }

  const handleMatchupSelect = useCallback(async (a: QuickFillPlayer, b: QuickFillPlayer) => {
    const pA = a as PlayerOption;
    const pB = b as PlayerOption;
    setPlayerA(pA);
    setPlayerB(pB);
    setResult(null);
    setError(null);
    setTimeout(() => {
      compareButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    await runCompare(pA, pB);
  }, [round, gameContext, opponentModel]);

  function reset() {
    setPlayerA(null);
    setPlayerB(null);
    setResult(null);
    setError(null);
  }

  function handleShare() {
    if (!playerA || !playerB || !result) return;
    const url = new URL(window.location.href);
    url.searchParams.set("playerA", playerA.player_name.replace(/\s+/g, "-"));
    url.searchParams.set("playerB", playerB.player_name.replace(/\s+/g, "-"));
    const winnerProj = result.playerA && String(result.winner_player_id) === String(result.playerA.player_id)
      ? result.playerA.projection_final
      : result.playerB?.projection_final;
    const edgeLabel = result.confidence >= 80 ? "Strong Edge" : result.confidence >= 68 ? "Clear Edge" : "Lean Edge";
    const oppState = deriveOpponentState(opponentModel);
    const oppMargin = getMargin(opponentModel);
    const contextSuffix =
      oppState === "chasing" || oppState === "chasing_heavy"
        ? ` — chasing by ${Math.abs(oppMargin ?? 0)}, need ceiling`
        : oppState === "leading" || oppState === "leading_strong"
        ? ` — up by ${Math.abs(oppMargin ?? 0)}, playing safe`
        : gameContext.matchState !== "close"
        ? ` — ${gameContext.matchState} match`
        : "";
    const wp = result.win_probability;
    const wpLine = wp?.enabled && wp.option_a && wp.option_b
      ? (() => {
          const recId = wp.matchup_recommendation === "start_a" ? wp.option_a.player_id : wp.matchup_recommendation === "start_b" ? wp.option_b.player_id : null;
          const recOpt = recId === wp.option_a.player_id ? wp.option_a : recId === wp.option_b.player_id ? wp.option_b : null;
          return recOpt ? `Win odds: ${recOpt.player_name.split(" ").pop()} gives ${recOpt.win_probability}% win chance` : null;
        })()
      : null;
    const shareText = [
      `START: ${result.winner_name} (${winnerProj != null ? Math.round(winnerProj) + " proj" : "—"})${contextSuffix}`,
      `${edgeLabel} — ${result.confidence}% model confidence`,
      wpLine,
      `Neeko Start/Sit: ${url.toString()}`,
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(shareText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const canCompare = !!playerA && !!playerB && !comparing;
  const showSocialProof = !result && !comparing;

  return (
    <>
      <Helmet>
        <title>AFL Fantasy Start / Sit Tool 2026 | AI Player Comparison | Neeko</title>
        <meta name="description" content="Compare two AFL Fantasy players and get an instant AI-powered start or sit verdict with confidence scores, projections, and matchup context." />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://neekostats.com.au/sports/afl/start-sit" />
        <meta property="og:title" content="AFL Fantasy Start / Sit Tool 2026 | AI Player Comparison | Neeko" />
        <meta property="og:description" content="Compare two AFL Fantasy players and get an instant AI-powered start or sit verdict with confidence scores, projections, and matchup context." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/sports/afl/start-sit" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta property="og:site_name" content="Neeko Sports" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AFL Fantasy Start / Sit Tool 2026 | AI Player Comparison | Neeko" />
        <meta name="twitter:description" content="Compare two AFL Fantasy players and get an instant AI-powered start or sit verdict with confidence scores, projections, and matchup context." />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": "AFL Fantasy Start / Sit Tool 2026 | AI Player Comparison",
          "description": "Compare two AFL Fantasy players and get an instant AI-powered start or sit verdict with confidence scores, projections, and matchup context.",
          "url": "https://neekostats.com.au/sports/afl/start-sit",
          "publisher": { "@type": "Organization", "name": "Neeko Sports", "url": "https://neekostats.com.au" },
          "breadcrumb": {
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://neekostats.com.au" },
              { "@type": "ListItem", "position": 2, "name": "AFL Fantasy", "item": "https://neekostats.com.au/sports/afl" },
              { "@type": "ListItem", "position": 3, "name": "Start / Sit", "item": "https://neekostats.com.au/sports/afl/start-sit" }
            ]
          }
        })}</script>
      </Helmet>
      <div className="min-h-screen bg-[#070707] text-white">
        <div className="max-w-2xl mx-auto px-4 py-8 pb-28">

          {/* Header */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={16} className="text-[#F5C84C]" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#F5C84C]/60">
                AFL Fantasy
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-white">AFL Fantasy Start / Sit Tool</h1>
            <p className="text-sm text-white/40 mt-1">
              Compare two players and get an AI verdict on who to start this round.
            </p>
          </div>

          {/* Player selectors */}
          <div className="grid gap-3 sm:grid-cols-2 mb-4">
            <StartSitSelector
              label="Player A"
              value={playerA}
              excludeId={playerB?.player_id}
              onChange={handlePlayerAChange}
            />
            <StartSitSelector
              label="Player B"
              value={playerB}
              excludeId={playerA?.player_id}
              onChange={handlePlayerBChange}
            />
          </div>

          {/* Combined matchup context expander */}
          <div className="mb-4">
            <button
              onClick={() => setShowContext((v) => !v)}
              className="flex items-center gap-1.5 text-[10px] font-semibold text-white/28 hover:text-white/45 transition-colors group"
            >
              <span className={`transition-transform duration-200 text-white/20 ${showContext ? "rotate-90" : ""}`}>▶</span>
              Add matchup context
              <span className="text-white/16 font-normal ml-0.5">— optional, personalises advice</span>
            </button>
            {showContext && (
              <div className="mt-3 space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
                <GameContextSelector value={gameContext} onChange={setGameContext} />
                <div className="border-t border-white/[0.05] pt-3">
                  <OpponentInput value={opponentModel} onChange={setOpponentModel} />
                </div>
              </div>
            )}
          </div>

          {/* Action row */}
          <div className="flex items-center gap-3">
            <button
              ref={compareButtonRef}
              onClick={handleCompare}
              disabled={!canCompare}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3.5 font-bold text-sm transition-all
                ${canCompare
                  ? "bg-[#F5C84C] text-black hover:brightness-110 active:scale-[0.98]"
                  : "bg-white/[0.06] text-white/25 cursor-not-allowed"
                }`}
            >
              {comparing ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                  Analysing...
                </>
              ) : (
                <>
                  <ArrowRight size={14} />
                  Compare Players
                </>
              )}
            </button>

            {result && playerA && playerB && (
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-4 py-3.5 rounded-xl border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-all text-sm"
                title="Copy share link"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Share2 size={13} />}
                {copied ? "Copied" : "Share"}
              </button>
            )}

            {(result || playerA || playerB) && (
              <button
                onClick={reset}
                className="flex items-center gap-1.5 px-4 py-3.5 rounded-xl border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-all text-sm"
              >
                <RotateCcw size={13} />
                Reset
              </button>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className="mt-4">
              <ErrorState
                variant="inline"
                message={error}
                onRetry={canCompare ? handleCompare : undefined}
                retryLabel="Retry"
              />
            </div>
          )}

          {/* Loading skeleton while fetching */}
          {comparing && (
            <div className="mt-6 space-y-3 animate-pulse">
              <div className="h-44 rounded-2xl bg-white/[0.04]" />
              <div className="h-24 rounded-xl bg-white/[0.04]" />
              <div className="h-32 rounded-xl bg-white/[0.04]" />
              <div className="h-20 rounded-xl bg-white/[0.04]" />
            </div>
          )}

          {/* Result */}
          {!comparing && result && !authLoading && (
            <StartSitResult
              playerA={result.playerA}
              playerB={result.playerB}
              winnerPlayerId={result.winner_player_id}
              confidence={result.confidence}
              aiSummary={result.ai_summary}
              modelEdge={result.model_edge}
              isPremium={isPremium}
              onUpgrade={isPremium ? () => {} : () => navigate("/neeko-plus")}
              onReset={reset}
              shortSummary={result.short_summary}
              longSummary={result.long_summary}
              startConditions={result.start_conditions}
              sitConditions={result.sit_conditions}
              playStyle={result.play_style}
              decisionContext={result.decision_context}
              isCloseCall={result.meta?.is_close_call ?? false}
              gameContext={gameContext}
              opponentModel={opponentModel}
              winProbability={result.win_probability}
            />
          )}
          {!comparing && result && authLoading && (
            <div className="mt-6 space-y-3 animate-pulse">
              <div className="h-36 rounded-2xl bg-white/[0.04]" />
              <div className="h-28 rounded-xl bg-white/[0.04]" />
              <div className="h-24 rounded-xl bg-white/[0.04]" />
            </div>
          )}

          {/* Social proof — only shown when no result is displayed */}
          {showSocialProof && (
            <StartSitSocialProof
              players={topPlayers}
              onFillBoth={handleFillBoth}
              onMatchupSelect={handleMatchupSelect}
              onScrollToCompare={handleScrollToCompare}
            />
          )}

          {/* SEO Guide — collapsible, always in DOM */}
          <SEOGuide />
        </div>
      </div>
    </>
  );
}
