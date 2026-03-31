import type { OpponentModel, OpponentState } from "./OpponentInput";
import { deriveOpponentState, getMargin } from "./OpponentInput";

interface MatchupStatusProps {
  model: OpponentModel;
  isCloseCall: boolean;
  winnerName: string;
  loserName: string;
  isPremium: boolean;
  onUpgrade: () => void;
}

function getStatusContent(
  state: OpponentState,
  margin: number | null,
  winnerName: string,
): { headline: string; subline: string; accent: string; bg: string; border: string } {
  const abs = margin != null ? Math.abs(margin) : 0;
  const wLast = winnerName.split(" ").pop() ?? winnerName;

  switch (state) {
    case "leading_strong":
      return {
        headline: `You are projected to WIN by ${abs} points`,
        subline: `Protect the lead — ${wLast}'s floor is your priority here.`,
        accent: "text-emerald-400",
        bg: "bg-emerald-400/[0.04]",
        border: "border-emerald-400/20",
      };
    case "leading":
      return {
        headline: `You are projected to WIN by ${abs} points`,
        subline: `Safer plays protect your lead. Avoid unnecessary variance.`,
        accent: "text-emerald-400",
        bg: "bg-emerald-400/[0.04]",
        border: "border-emerald-400/15",
      };
    case "coin_flip":
      return {
        headline: `This matchup is extremely close`,
        subline: `Every point matters — the model's composite edge is your best guide.`,
        accent: "text-[#F5C84C]",
        bg: "bg-[#F5C84C]/[0.04]",
        border: "border-[#F5C84C]/15",
      };
    case "chasing":
      return {
        headline: `You are projected to LOSE by ${abs} points`,
        subline: `You need upside to close the gap. Ceiling becomes more valuable.`,
        accent: "text-red-400",
        bg: "bg-red-400/[0.04]",
        border: "border-red-400/15",
      };
    case "chasing_heavy":
      return {
        headline: `You are projected to LOSE by ${abs} points`,
        subline: `You need a big swing — ceiling plays take priority over safe floors.`,
        accent: "text-red-400",
        bg: "bg-red-400/[0.05]",
        border: "border-red-400/20",
      };
    default:
      return {
        headline: "",
        subline: "",
        accent: "text-white/40",
        bg: "bg-white/[0.02]",
        border: "border-white/[0.07]",
      };
  }
}

function DecisionShiftBanner({
  state,
  isCloseCall,
  winnerName,
  loserName,
  margin,
  isPremium,
  onUpgrade,
}: {
  state: OpponentState;
  isCloseCall: boolean;
  winnerName: string;
  loserName: string;
  margin: number | null;
  isPremium: boolean;
  onUpgrade: () => void;
}) {
  const abs = margin != null ? Math.abs(margin) : 0;
  const wLast = winnerName.split(" ").pop() ?? winnerName;
  const lLast = loserName.split(" ").pop() ?? loserName;

  if (state === "neutral") return null;

  const isChasing = state === "chasing" || state === "chasing_heavy";
  const isLeading = state === "leading" || state === "leading_strong";

  let primary = "";
  let secondary = "";

  if (isCloseCall && (isChasing || isLeading)) {
    primary = "This is a razor-thin decision AND matchup-dependent.";
    secondary = isChasing
      ? `Trailing by ${abs} pts — ${lLast}'s ceiling may be more valuable in this situation despite the model leaning ${wLast}.`
      : `Leading by ${abs} pts — ${wLast}'s floor protection makes the model's verdict even stronger.`;
  } else if (isChasing) {
    primary = "This decision shifts toward upside.";
    secondary = `Chasing by ${abs} pts — ${lLast}'s ceiling becomes more relevant despite the model preferring ${wLast}.`;
  } else if (isLeading) {
    primary = "This decision should prioritise safety.";
    secondary = `Leading by ${abs} pts — ${wLast}'s floor and consistency are even more valuable here.`;
  } else {
    primary = "Coin-flip matchup — every point counts.";
    secondary = `Stick with the model's composite edge: ${wLast}.`;
  }

  const bannerColor = isChasing ? "border-red-400/20 bg-red-400/[0.04]" : isLeading ? "border-emerald-400/15 bg-emerald-400/[0.03]" : "border-[#F5C84C]/15 bg-[#F5C84C]/[0.03]";
  const textColor = isChasing ? "text-red-400/75" : isLeading ? "text-emerald-400/75" : "text-[#F5C84C]/70";

  return (
    <div className={`rounded-xl border ${bannerColor} px-4 py-3`}>
      <p className={`text-xs font-bold ${textColor} mb-0.5`}>{primary}</p>
      <p className="text-xs text-white/35 leading-snug">{secondary}</p>
      {!isPremium && (isChasing || isCloseCall) && (
        <button
          onClick={onUpgrade}
          className="mt-2.5 text-[10px] font-bold text-[#F5C84C]/65 hover:text-[#F5C84C]/85 transition-colors underline underline-offset-2"
        >
          {isCloseCall && isChasing
            ? "See the exact path to winning this matchup"
            : isChasing
            ? "Don't lose this matchup on the wrong call"
            : "See how this decision affects your win chances"}
        </button>
      )}
    </div>
  );
}

export function MatchupStatus({ model, isCloseCall, winnerName, loserName, isPremium, onUpgrade }: MatchupStatusProps) {
  const state = deriveOpponentState(model);
  const margin = getMargin(model);

  if (state === "neutral") return null;

  const { headline, subline, accent, bg, border } = getStatusContent(state, margin, winnerName);

  return (
    <div className="space-y-2">
      <div className={`rounded-xl border ${border} ${bg} px-4 py-3`}>
        <p className={`text-xs font-bold ${accent} leading-snug`}>{headline}</p>
        <p className="text-xs text-white/35 mt-0.5 leading-snug">{subline}</p>
      </div>

      <DecisionShiftBanner
        state={state}
        isCloseCall={isCloseCall}
        winnerName={winnerName}
        loserName={loserName}
        margin={margin}
        isPremium={isPremium}
        onUpgrade={onUpgrade}
      />
    </div>
  );
}

export { deriveOpponentState, getMargin };
