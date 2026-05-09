import { Crown, TrendingUp } from "lucide-react";

export interface WinProbabilityOption {
  player_id: string;
  player_name: string;
  win_probability: number;
  lose_probability: number;
}

export interface WinProbabilityData {
  enabled: boolean;
  user_projected_score?: number | null;
  opponent_projected_score?: number | null;
  current_margin?: number | null;
  option_a?: WinProbabilityOption | null;
  option_b?: WinProbabilityOption | null;
  delta?: number | null;
  matchup_recommendation?: "start_a" | "start_b" | "neutral" | null;
  matchup_context_label?: "protect_lead" | "chase_upside" | "coin_flip" | "small_edge" | null;
  summary?: string | null;
}

function getEdgeStrength(delta: number): "strong" | "meaningful" | "small" {
  const abs = Math.abs(delta);
  if (abs > 7) return "strong";
  if (abs >= 3) return "meaningful";
  return "small";
}

function getContextLabel(label: WinProbabilityData["matchup_context_label"]): string {
  switch (label) {
    case "protect_lead": return "Protecting Lead";
    case "chase_upside": return "Chasing Upside";
    case "coin_flip": return "Coin Flip";
    case "small_edge": return "Small Edge";
    default: return "Matchup Context";
  }
}

function getContextColor(label: WinProbabilityData["matchup_context_label"]): string {
  switch (label) {
    case "protect_lead": return "text-emerald-400 bg-emerald-400/[0.08] border-emerald-400/15";
    case "chase_upside": return "text-red-400 bg-red-400/[0.06] border-red-400/15";
    case "coin_flip": return "text-[#F5C84C] bg-[#F5C84C]/[0.07] border-[#F5C84C]/15";
    case "small_edge": return "text-sky-400 bg-sky-400/[0.07] border-sky-400/15";
    default: return "text-white/40 bg-white/[0.04] border-white/[0.08]";
  }
}

function ProbabilityBar({
  probability,
  isRecommended,
  isWinner,
}: {
  probability: number;
  isRecommended: boolean;
  isWinner: boolean;
}) {
  const barColor = isRecommended
    ? "bg-gradient-to-r from-emerald-500/60 to-emerald-400"
    : isWinner
    ? "bg-gradient-to-r from-[#F5C84C]/50 to-[#F5C84C]/70"
    : "bg-white/[0.12]";

  return (
    <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
        style={{ width: `${probability}%` }}
      />
    </div>
  );
}

interface WinProbabilityPanelProps {
  data: WinProbabilityData;
  winnerPlayerId: string;
  isPremium: boolean;
  onUpgrade: () => void;
  isCloseCall?: boolean;
}

export function WinProbabilityPanel({
  data,
  winnerPlayerId,
  isPremium,
  onUpgrade,
  isCloseCall = false,
}: WinProbabilityPanelProps) {
  if (!data.enabled) return null;

  const { option_a, option_b, delta, matchup_recommendation, matchup_context_label, summary } = data;
  if (!option_a || !option_b) return null;

  const margin = data.current_margin ?? null;
  const absMargin = margin != null ? Math.abs(margin) : null;
  const isChasing = margin != null && margin < 0;
  const isLeading = margin != null && margin > 0;

  const recA = matchup_recommendation === "start_a";
  const recB = matchup_recommendation === "start_b";
  const isNeutral = matchup_recommendation === "neutral" || matchup_recommendation == null;

  const neutralWinnerIsA = String(winnerPlayerId) === String(option_a.player_id);

  const matchupDiffersFromNeutral = !isNeutral && (
    (neutralWinnerIsA && recB) || (!neutralWinnerIsA && recA)
  );

  const edgeStrength = delta != null ? getEdgeStrength(delta) : "small";
  const absDelta = delta != null ? Math.abs(delta) : null;

  const ctxColor = getContextColor(matchup_context_label);
  const ctxLabel = getContextLabel(matchup_context_label);

  const recommendedOption = recA ? option_a : recB ? option_b : null;
  const otherOption = recA ? option_b : recB ? option_a : null;

  return (
    <div className="rounded-xl border border-white/[0.09] bg-[#0b0b0b] overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={11} className="text-[#F5C84C]/55 shrink-0" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/22">
            Win Probability Engine
          </p>
        </div>
        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${ctxColor}`}>
          {ctxLabel}
        </span>
      </div>

      <div className="px-4 sm:px-5 py-4 space-y-4">
        {/* Matchup margin row */}
        {margin != null && (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-white/22">Your score:</span>
              <span className="font-bold text-white/55 tabular-nums">{data.user_projected_score}</span>
            </div>
            <span className="text-white/15">·</span>
            <div className="flex items-center gap-1.5">
              <span className="text-white/22">Opponent:</span>
              <span className="font-bold text-white/55 tabular-nums">{data.opponent_projected_score}</span>
            </div>
            <span className="text-white/15">·</span>
            <span className={`font-bold tabular-nums ${isChasing ? "text-red-400" : isLeading ? "text-emerald-400" : "text-white/40"}`}>
              {isChasing ? `${margin}` : isLeading ? `+${margin}` : "0"}
            </span>
          </div>
        )}

        {/* Free user teaser */}
        {!isPremium && (
          <div className="space-y-3">
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-3 text-center">
              <p className="text-xs text-white/40 leading-snug mb-0.5">
                {absDelta != null && absDelta >= 3
                  ? `One option improves your win chance by ${absDelta}%`
                  : "Win odds computed for both players"}
              </p>
              <div className="flex items-center justify-center gap-3 mt-2.5">
                {[option_a, option_b].map((opt) => (
                  <div key={opt.player_id} className="flex items-center gap-1.5">
                    <span className="text-[11px] text-white/30">{opt.player_name.split(" ").pop()}</span>
                    <span className="text-sm font-extrabold text-white/15 blur-[5px] select-none tabular-nums">
                      XX%
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#F5C84C]/[0.04] border border-[#F5C84C]/12">
              <p className="text-xs text-white/38 mb-2.5 leading-snug">
                {isCloseCall && isChasing
                  ? "This is a close call AND you're chasing — win odds may separate the right play."
                  : isChasing
                  ? `You're trailing by ${absMargin} pts. See which play actually improves your win odds.`
                  : isLeading
                  ? `You're up by ${absMargin} pts. See which play best protects your lead.`
                  : "See which choice gives you the best chance to win your matchup."}
              </p>
              <button
                onClick={onUpgrade}
                className="flex items-center gap-1.5 text-[10px] font-bold text-[#F5C84C]/70 bg-[#F5C84C]/[0.09] border border-[#F5C84C]/15 px-2.5 py-1 rounded-lg hover:bg-[#F5C84C]/[0.14] transition-all"
              >
                <Crown size={8} />
                {isCloseCall ? "See your true win path" : "Unlock matchup win odds"}
              </button>
            </div>
          </div>
        )}

        {/* Premium view */}
        {isPremium && (
          <div className="space-y-4">
            {/* Win probability comparison */}
            <div className="space-y-3">
              {[option_a, option_b].map((opt) => {
                const isOptRec = (opt.player_id === option_a.player_id && recA) ||
                  (opt.player_id === option_b.player_id && recB);
                const isOptNeutralWinner = String(opt.player_id) === String(winnerPlayerId);
                return (
                  <div key={opt.player_id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-white/65 truncate">{opt.player_name}</span>
                        {isOptRec && (
                          <span className="text-[8px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/[0.1] border border-emerald-400/20 px-1.5 py-0.5 rounded-full shrink-0">
                            Matchup Pick
                          </span>
                        )}
                        {!isOptRec && isOptNeutralWinner && !isNeutral && (
                          <span className="text-[8px] font-bold uppercase tracking-wider text-white/25 bg-white/[0.04] border border-white/[0.07] px-1.5 py-0.5 rounded-full shrink-0">
                            Model Pick
                          </span>
                        )}
                      </div>
                      <span className={`text-sm font-extrabold tabular-nums shrink-0 ${isOptRec ? "text-emerald-400" : "text-white/45"}`}>
                        {opt.win_probability}%
                      </span>
                    </div>
                    <ProbabilityBar
                      probability={opt.win_probability}
                      isRecommended={isOptRec}
                      isWinner={isOptNeutralWinner}
                    />
                    <p className="text-[10px] text-white/22 tabular-nums">
                      {opt.win_probability}% win · {opt.lose_probability}% lose
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Delta callout */}
            {absDelta != null && absDelta >= 1 && recommendedOption && (
              <div className={`rounded-lg px-3 py-2.5 border flex items-center gap-2 ${
                edgeStrength === "strong" ? "bg-emerald-400/[0.05] border-emerald-400/15"
                : edgeStrength === "meaningful" ? "bg-[#F5C84C]/[0.04] border-[#F5C84C]/12"
                : "bg-white/[0.025] border-white/[0.07]"
              }`}>
                <TrendingUp size={10} className={
                  edgeStrength === "strong" ? "text-emerald-400 shrink-0"
                  : edgeStrength === "meaningful" ? "text-[#F5C84C] shrink-0"
                  : "text-white/30 shrink-0"
                } />
                <p className={`text-xs font-bold ${
                  edgeStrength === "strong" ? "text-emerald-400/80"
                  : edgeStrength === "meaningful" ? "text-[#F5C84C]/70"
                  : "text-white/40"
                }`}>
                  +{absDelta}% better win chance with {recommendedOption.player_name.split(" ").pop()}
                </p>
              </div>
            )}

            {absDelta != null && absDelta < 3 && (
              <p className="text-[11px] text-white/25 text-center">
                Win odds are nearly identical — model verdict is your best guide.
              </p>
            )}

            {/* Neutral vs matchup divergence banner */}
            {matchupDiffersFromNeutral && recommendedOption && otherOption && (
              <div className="rounded-lg border border-[#F5C84C]/15 bg-[#F5C84C]/[0.03] px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-white/30">
                  <span className="font-semibold text-white/40">Model verdict:</span>
                  <span>{neutralWinnerIsA ? option_a.player_name : option_b.player_name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-[#F5C84C]/60">Matchup play:</span>
                  <span className="text-[#F5C84C]/80 font-bold">{recommendedOption.player_name}</span>
                </div>
                <p className="text-[10px] text-white/28 leading-snug pt-0.5">
                  {neutralWinnerIsA
                    ? `${option_a.player_name.split(" ").pop()} is the stronger neutral play. ${option_b.player_name.split(" ").pop()} is the better choice if maximising win odds from behind is your priority.`
                    : `${option_b.player_name.split(" ").pop()} is the stronger neutral play. ${option_a.player_name.split(" ").pop()} is the better choice if maximising win odds from behind is your priority.`}
                </p>
              </div>
            )}

            {/* AI summary */}
            {summary && (
              <p className="text-xs text-white/40 leading-relaxed border-t border-white/[0.05] pt-3">
                {summary}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
