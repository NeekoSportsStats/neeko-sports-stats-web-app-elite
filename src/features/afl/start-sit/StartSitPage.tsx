import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowRight, RotateCcw, Zap, Share2, Check } from "lucide-react";
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

const CURRENT_SEASON = 2026;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface PlayerOption {
  player_id: string | number;
  player_name: string;
  team: string | null;
  position: string | null;
  projection_final: number | null;
  ceiling: number | null;
  floor: number | null;
  ceiling_estimate?: number | null;
  floor_estimate?: number | null;
  projection_confidence: number | null;
  risk_rating: number | null;
  neeko_rating: number | null;
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

  // Load the current round on mount
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

  // Pre-fetch top players so social proof quick-fill cards have real IDs
  // Use free-tier view for non-premium users to avoid exposing premium data
  useEffect(() => {
    if (authLoading) return;
    const viewName = isPremium ? "v_rankings_master" : "v_rankings_free";
    supabase
      .from(viewName)
      .select("player_id, player_name, team, position, projection_final, ceiling, floor, projection_confidence, risk_rating, neeko_rating")
      .not("player_id", "is", null)
      .order("neeko_rating", { ascending: false })
      .limit(isPremium ? 400 : 100)
      .then(({ data }) => {
        if (data) setTopPlayers(data as PlayerOption[]);
      });
  }, [authLoading, isPremium]);

  // Pre-fill from URL params (share link support)
  useEffect(() => {
    const pA = searchParams.get("playerA");
    const pB = searchParams.get("playerB");
    if (!pA && !pB) return;
    if (authLoading) return;

    async function prefillFromUrl() {
      const ids = [pA, pB].filter(Boolean) as string[];
      if (ids.length === 0) return;

      const viewName = isPremium ? "v_rankings_master" : "v_rankings_free";
      const { data } = await supabase
        .from(viewName)
        .select("player_id, player_name, team, position, projection_final, ceiling, floor, projection_confidence, risk_rating, neeko_rating")
        .in("player_name", ids.map((n) => n.replace(/-/g, " ")));

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

  async function handleCompare() {
    if (!playerA || !playerB) return;

    track("start_sit_generate", {
      player_a: playerA.player_name,
      player_b: playerB.player_name,
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
          playerAId: playerA.player_id,
          playerBId: playerB.player_id,
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

      const resultPlayerA: PlayerOption = json.playerA ?? playerA;
      const resultPlayerB: PlayerOption = json.playerB ?? playerB;

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

      supabase.from("start_sit_decisions").insert({
        player_a_id:      playerA.player_id,
        player_a_name:    playerA.player_name,
        player_b_id:      playerB.player_id,
        player_b_name:    playerB.player_name,
        winner_player_id: String(json.winner_player_id),
        session_id:       typeof crypto !== "undefined" ? crypto.randomUUID?.() ?? null : null,
      }).then(() => {});
    } catch {
      setError("Unable to generate comparison. Please try again.");
    } finally {
      setComparing(false);
    }
  }

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
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="AFL Fantasy Start / Sit Tool 2026 | AI Player Comparison | Neeko" />
        <meta name="twitter:description" content="Compare two AFL Fantasy players and get an instant AI-powered start or sit verdict with confidence scores, projections, and matchup context." />
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
          <h1 className="text-2xl font-extrabold text-white">Start / Sit</h1>
          <p className="text-sm text-white/40 mt-1">
            Compare two players and get a verdict on who to start this round.
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
          <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
            <p className="text-sm text-red-400 leading-snug">{error}</p>
            <button
              onClick={handleCompare}
              disabled={!canCompare}
              className="shrink-0 text-xs text-red-400/70 hover:text-red-400 underline underline-offset-2 transition-colors disabled:opacity-40"
            >
              Retry
            </button>
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

        {/* Result — wait for auth to resolve before rendering so premium state is certain */}
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
            onScrollToCompare={handleScrollToCompare}
          />
        )}
      </div>
    </div>
    </>
  );
}
