import type { GameContext } from "./GameContextSelector";

interface ContextInsightProps {
  context: GameContext;
  isCloseCall: boolean;
  winnerName: string;
  loserName: string;
}

function getMatchStateInsight(matchState: GameContext["matchState"], winnerName: string, loserName: string): string {
  const wLast = winnerName.split(" ").pop() ?? winnerName;
  const lLast = loserName.split(" ").pop() ?? loserName;
  if (matchState === "chasing") {
    return `You need upside — this shifts value toward ceiling outcomes. ${lLast}'s ceiling may become more relevant despite the model leaning ${wLast}.`;
  }
  if (matchState === "leading") {
    return `You should prioritise floor — avoid volatility. ${wLast}'s safer floor profile is even more valuable when protecting a lead.`;
  }
  return `Balanced matchup — the model's base recommendation applies cleanly to your situation.`;
}

function getTimingInsight(timing: GameContext["timing"]): string {
  if (timing === "late") return "Late-round decisions should minimise variance unless you're chasing. Prioritise the model's floor protection edge.";
  if (timing === "early") return "Early round — projection stability matters most. The model's confidence score is your key signal here.";
  return "Mid-round timing gives you flexibility. Trust the composite model edge.";
}

function getPlayStyleInsight(playStyle: GameContext["playStyle"], winnerName: string): string {
  const wLast = winnerName.split(" ").pop() ?? winnerName;
  if (playStyle === "upside") return `Chasing ceiling — assess whether ${wLast}'s upside justifies the pick over a potentially higher-ceiling alternative.`;
  if (playStyle === "safe") return `Safe play mode — ${wLast}'s floor protection and model confidence are the right metrics to anchor this decision.`;
  return `Balanced approach — the model's composite score is the right lens here.`;
}

export function ContextInsight({ context, isCloseCall, winnerName, loserName }: ContextInsightProps) {
  const matchInsight = getMatchStateInsight(context.matchState, winnerName, loserName);
  const timingInsight = getTimingInsight(context.timing);
  const styleInsight = getPlayStyleInsight(context.playStyle, winnerName);

  const primaryInsight = context.matchState !== "close" ? matchInsight
    : context.timing !== "mid" ? timingInsight
    : styleInsight;

  const secondaryInsight = context.timing === "late" && context.matchState !== "close"
    ? timingInsight
    : context.playStyle !== "balanced" && context.matchState !== "close"
    ? styleInsight
    : null;

  const isNonDefault = context.matchState !== "close" || context.playStyle !== "balanced" || context.timing !== "mid";

  if (!isNonDefault && !isCloseCall) return null;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <div className="px-4 sm:px-5 pt-3.5 pb-3.5">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">Context Mode</span>
          </div>
          <div className="flex items-center gap-1">
            <ContextPill value={context.matchState} map={{ leading: "Leading", close: "Close", chasing: "Chasing" }} />
            <span className="text-white/15 text-[9px]">·</span>
            <ContextPill value={context.playStyle} map={{ safe: "Safe", balanced: "Balanced", upside: "Upside" }} />
            <span className="text-white/15 text-[9px]">·</span>
            <ContextPill value={context.timing} map={{ early: "Early Round", mid: "Mid Round", late: "Late Round" }} />
          </div>
        </div>

        {isCloseCall && isNonDefault && (
          <p className="text-xs text-amber-400/65 font-semibold mb-2 leading-snug">
            This decision heavily depends on your matchup situation.
          </p>
        )}

        <p className="text-xs text-white/45 leading-relaxed">{primaryInsight}</p>
        {secondaryInsight && (
          <p className="text-xs text-white/28 leading-relaxed mt-1.5">{secondaryInsight}</p>
        )}
      </div>
    </div>
  );
}

function ContextPill({ value, map }: { value: string; map: Record<string, string> }) {
  return (
    <span className="text-[9px] font-semibold text-[#F5C84C]/55 bg-[#F5C84C]/[0.06] border border-[#F5C84C]/12 px-1.5 py-0.5 rounded-md">
      {map[value] ?? value}
    </span>
  );
}
