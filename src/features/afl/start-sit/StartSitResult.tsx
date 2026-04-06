import { useState, useEffect } from "react";
import { cleanAiText } from "@/utils/cleanAiText";
import { Crown, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Share2, Check, RotateCcw, Sparkles, Shield, Zap, ChartBar as BarChart2, TriangleAlert as AlertTriangle } from "lucide-react";
import { OutcomeDistributionChart } from "./OutcomeDistributionChart";
import type { GameContext } from "./GameContextSelector";
import { MatchupStatus } from "./MatchupStatus";
import { deriveOpponentState, getMargin, type OpponentModel } from "./OpponentInput";
import { WinProbabilityPanel, type WinProbabilityData } from "./WinProbabilityPanel";

interface PlayerData {
  player_id: string;
  player_name: string;
  team: string | null;
  position: string | null;
  projection_final: number | null;
  ceiling_estimate: number | null;
  floor_estimate: number | null;
  projection_confidence: number | null;
  risk_rating: number | null;
  neeko_rating: number | null;
}

interface StartSitResultProps {
  playerA: PlayerData;
  playerB: PlayerData;
  winnerPlayerId: string;
  confidence: number;
  aiSummary: string | null;
  modelEdge: string | null;
  isPremium: boolean;
  onUpgrade: () => void;
  onReset?: () => void;
  shortSummary?: string | null;
  longSummary?: string | null;
  startConditions?: string[] | null;
  sitConditions?: string[] | null;
  playStyle?: "safe" | "upside" | "balanced" | null;
  decisionContext?: "close" | "lean" | "clear" | "strong" | null;
  isCloseCall?: boolean;
  gameContext?: GameContext;
  opponentModel?: OpponentModel;
  winProbability?: WinProbabilityData | null;
}

function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  return String(Math.round(v));
}

function getEdgeLabel(confidence: number): {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  barColor: string;
} {
  if (confidence >= 80) return {
    label: "Strong Edge",
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/[0.07]",
    borderColor: "border-emerald-400/20",
    barColor: "bg-gradient-to-r from-emerald-500/50 to-emerald-400",
  };
  if (confidence >= 58) return {
    label: "Clear Edge",
    color: "text-[#F5C84C]",
    bgColor: "bg-[#F5C84C]/[0.07]",
    borderColor: "border-[#F5C84C]/20",
    barColor: "bg-gradient-to-r from-[#F5C84C]/50 to-[#F5C84C]",
  };
  return {
    label: "Lean Edge",
    color: "text-sky-400",
    bgColor: "bg-sky-400/[0.06]",
    borderColor: "border-sky-400/15",
    barColor: "bg-gradient-to-r from-sky-500/50 to-sky-400",
  };
}

function getPlayStyleMeta(style: "safe" | "upside" | "balanced" | null | undefined): {
  label: string;
  color: string;
  bgColor: string;
  type: "shield" | "zap" | "bar";
} {
  if (style === "safe") return { label: "Safe Play", color: "text-emerald-400", bgColor: "bg-emerald-400/[0.08]", type: "shield" };
  if (style === "upside") return { label: "Upside Play", color: "text-[#F5C84C]", bgColor: "bg-[#F5C84C]/[0.08]", type: "zap" };
  return { label: "Balanced Play", color: "text-sky-400", bgColor: "bg-sky-400/[0.08]", type: "bar" };
}

function PlayStyleIcon({ type, className }: { type: "shield" | "zap" | "bar"; className?: string }) {
  if (type === "shield") return <Shield size={10} className={className} />;
  if (type === "zap") return <Zap size={10} className={className} />;
  return <BarChart2 size={10} className={className} />;
}

function buildDecisionContextCopy(
  winner: PlayerData,
  loser: PlayerData,
  confidence: number,
  playStyle: "safe" | "upside" | "balanced" | null | undefined,
  isCloseCall: boolean,
): string {
  const wLast = winner.player_name.split(" ").pop() ?? winner.player_name;
  const lLast = loser.player_name.split(" ").pop() ?? loser.player_name;
  const projDiff = Math.round(Math.abs((winner.projection ?? 0) - (loser.projection ?? 0)));
  const floorDiff = (winner.floor_estimate ?? 0) - (loser.floor_estimate ?? 0);
  const ceilDiff = (winner.ceiling_estimate ?? 0) - (loser.ceiling_estimate ?? 0);

  if (isCloseCall) {
    return `Model detected a slight edge, but this is a high-variance decision.`;
  }
  if (confidence >= 80) {
    if (playStyle === "safe" || floorDiff > 5) {
      return `${wLast} carries a reliable projection edge (+${projDiff} pts) with a stronger floor. The model rates this as a clear reliability edge over ${lLast}.`;
    }
    if (playStyle === "upside" || ceilDiff > 5) {
      return `${wLast} projects higher (+${projDiff} pts) with better ceiling potential. Strong upside edge over ${lLast} this round.`;
    }
    return `${wLast} has a strong composite edge — projection, floor, and Neeko rating all point the same way over ${lLast}.`;
  }
  if (confidence >= 65) {
    if (floorDiff > 5) {
      return `${wLast} holds a reliability edge — safer floor with a +${projDiff} pt projection advantage over ${lLast}.`;
    }
    if (ceilDiff > 5) {
      return `${wLast} offers the better upside edge this round — ceiling and projection both favour the start call over ${lLast}.`;
    }
    return `Meaningful edge to ${wLast} — +${projDiff} pts projected with a stronger composite model signal.`;
  }
  return `Slight lean to ${wLast} on composite metrics. The gap is small — matchup and role context can influence this call.`;
}

function buildFallbackReasons(winner: PlayerData, loser: PlayerData, aiSummary: string | null): string[] {
  const reasons: string[] = [];

  const projDiff = (winner.projection ?? 0) - (loser.projection ?? 0);
  if (projDiff > 0) {
    const qual = projDiff >= 10 ? "Higher" : "Slight";
    reasons.push(`${qual} projection edge — ${Math.round(winner.projection ?? 0)} vs ${Math.round(loser.projection ?? 0)} pts`);
  }

  const floorDiff = (winner.floor_estimate ?? 0) - (loser.floor_estimate ?? 0);
  if (floorDiff > 3) {
    reasons.push(`Safer floor — ${Math.round(winner.floor_estimate ?? 0)} vs ${Math.round(loser.floor_estimate ?? 0)} (lower bust risk)`);
  }

  const ceilDiff = (winner.ceiling_estimate ?? 0) - (loser.ceiling_estimate ?? 0);
  if (ceilDiff > 3) {
    reasons.push(`Higher ceiling — ${Math.round(winner.ceiling_estimate ?? 0)} vs ${Math.round(loser.ceiling_estimate ?? 0)}`);
  }

  const nDiff = (winner.neeko_rating ?? 0) - (loser.neeko_rating ?? 0);
  if (nDiff > 0.5) {
    reasons.push(`Stronger Neeko Rating — ${(winner.neeko_rating ?? 0).toFixed(1)} vs ${(loser.neeko_rating ?? 0).toFixed(1)}`);
  }

  if (reasons.length === 0) {
    const wLast = winner.player_name.split(" ").pop() ?? winner.player_name;
    const lLast = loser.player_name.split(" ").pop() ?? loser.player_name;
    reasons.push(`${wLast} edges ${lLast} on composite model metrics this round`);
  }

  if (aiSummary && reasons.length < 4) {
    const sentences = aiSummary
      .split(/\n|(?<=\.)\s+/)
      .map((s) => s.replace(/^[-•*]\s*/, "").trim())
      .filter((s) => s.length > 25 && s.length < 200);
    for (const s of sentences) {
      if (reasons.length >= 4) break;
      const lower = s.toLowerCase();
      if (!reasons.some((r) => r.toLowerCase().startsWith(lower.slice(0, 12)))) {
        reasons.push(s);
      }
    }
  }

  return reasons.slice(0, 3);
}

function MetricCompareRow({
  label,
  aVal,
  bVal,
  aRaw,
  bRaw,
  aIsWinner,
  lowerIsBetter = false,
}: {
  label: string;
  aVal: string;
  bVal: string;
  aRaw: number;
  bRaw: number;
  aIsWinner: boolean;
  lowerIsBetter?: boolean;
}) {
  const aWins = lowerIsBetter ? aRaw < bRaw : aRaw > bRaw;
  const bWins = lowerIsBetter ? bRaw < aRaw : bRaw > aRaw;
  const absMax = Math.max(Math.abs(aRaw), Math.abs(bRaw), 1);
  const pctA = (Math.abs(aRaw) / absMax) * 100;
  const pctB = (Math.abs(bRaw) / absMax) * 100;

  return (
    <div className="grid grid-cols-[1fr_80px_1fr] items-center gap-2 py-2.5 border-b border-white/[0.04] last:border-0">
      <div className="flex flex-col items-end gap-1">
        <span className={`text-sm font-bold tabular-nums ${aWins ? "text-white" : "text-white/30"}`}>{aVal}</span>
        <div className="w-full h-1 rounded-full bg-white/[0.05] overflow-hidden flex justify-end">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${aWins ? (aIsWinner ? "bg-[#F5C84C]" : "bg-white/35") : "bg-white/[0.08]"}`}
            style={{ width: `${pctA}%` }}
          />
        </div>
      </div>
      <p className="text-[9px] uppercase tracking-widest text-white/20 text-center leading-none px-1">{label}</p>
      <div className="flex flex-col items-start gap-1">
        <span className={`text-sm font-bold tabular-nums ${bWins ? "text-white" : "text-white/30"}`}>{bVal}</span>
        <div className="w-full h-1 rounded-full bg-white/[0.05] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${bWins ? (!aIsWinner ? "bg-[#F5C84C]" : "bg-white/35") : "bg-white/[0.08]"}`}
            style={{ width: `${pctB}%` }}
          />
        </div>
      </div>
    </div>
  );
}

type TabKey = "overview" | "scenarios" | "model";

export function StartSitResult({
  playerA,
  playerB,
  winnerPlayerId,
  confidence,
  aiSummary,
  isPremium,
  onUpgrade,
  onReset,
  shortSummary,
  longSummary,
  startConditions,
  sitConditions,
  playStyle,
  decisionContext,
  isCloseCall = false,
  gameContext,
  opponentModel,
  winProbability,
}: StartSitResultProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [aiExpanded, setAiExpanded] = useState(false);
  const [distOpen, setDistOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActiveTab("overview");
    setAiExpanded(false);
    setDistOpen(false);
    setCopied(false);
  }, [winnerPlayerId]);

  const winnerIsA = String(winnerPlayerId) === String(playerA.player_id);
  const winner = winnerIsA ? playerA : playerB;
  const loser = winnerIsA ? playerB : playerA;

  const edge = getEdgeLabel(confidence);
  const psm = getPlayStyleMeta(playStyle);
  const ctx = decisionContext ?? (confidence >= 80 ? "strong" : confidence >= 65 ? "clear" : confidence >= 55 ? "lean" : "close");
  const ctxLabel = ctx === "strong" ? "Clear model preference" : ctx === "clear" ? "Meaningful gap" : ctx === "lean" ? "Slight lean" : "Very close call";

  const oppState = opponentModel ? deriveOpponentState(opponentModel) : "neutral";
  const oppMargin = opponentModel ? getMargin(opponentModel) : null;
  const oppIsChasing = oppState === "chasing" || oppState === "chasing_heavy";
  const oppIsLeading = oppState === "leading" || oppState === "leading_strong";
  const oppActive = oppState !== "neutral";

  const displaySummary = cleanAiText(shortSummary ?? aiSummary ?? null) || null;
  const fullSummary = cleanAiText(longSummary ?? aiSummary ?? null) || null;

  const reasons = buildFallbackReasons(winner, loser, aiSummary);

  const hasStartConds = startConditions && startConditions.length > 0;
  const hasSitConds = sitConditions && sitConditions.length > 0;

  const rawStartList = hasStartConds ? startConditions! : [
    "This leans toward consistency outcomes",
    "The model prefers the higher-projected option here",
    "A safer, risk-adjusted approach favours this pick",
  ];
  const rawSitList = hasSitConds ? sitConditions! : [
    "This leans toward ceiling outcomes over floor",
    "Higher variance is acceptable in your matchup",
    "A high-risk, high-reward swing play suits your situation",
  ];

  function reorderByContext(list: string[], prefer: "ceiling" | "floor" | "none"): string[] {
    if (prefer === "none") return list;
    const keywords = prefer === "ceiling"
      ? ["ceiling", "upside", "breakout", "big", "swing"]
      : ["floor", "safe", "reliable", "consistent", "protect"];
    const matches = list.filter((s) => keywords.some((k) => s.toLowerCase().includes(k)));
    const rest = list.filter((s) => !keywords.some((k) => s.toLowerCase().includes(k)));
    return [...matches, ...rest];
  }

  const contextPrefer: "ceiling" | "floor" | "none" =
    oppIsChasing ? "ceiling"
    : oppIsLeading ? "floor"
    : gameContext?.matchState === "chasing" || gameContext?.playStyle === "upside" ? "ceiling"
    : gameContext?.matchState === "leading" || gameContext?.playStyle === "safe" ? "floor"
    : "none";

  const startList = reorderByContext(rawStartList, contextPrefer);
  const sitList = reorderByContext(rawSitList, contextPrefer === "ceiling" ? "ceiling" : contextPrefer === "floor" ? "floor" : "none");

  const wLast = winner.player_name.split(" ").pop() ?? winner.player_name;
  const lLast = loser.player_name.split(" ").pop() ?? loser.player_name;

  const decisionContextCopy = buildDecisionContextCopy(winner, loser, confidence, playStyle, isCloseCall);

  const winnerProj = winner.projection != null ? Math.round(winner.projection) : null;
  const loserProj = loser.projection != null ? Math.round(loser.projection) : null;

  function handleCopyShare() {
    const edgeStr = isCloseCall
      ? `CLOSE CALL (${confidence}%). Small edges decide this.`
      : `${edge.label} — ${confidence}% confidence`;
    const shareText = [
      `START: ${winner.player_name}${winner.projection != null ? " (" + Math.round(winner.projection) + " pts projected)" : ""}`,
      `SIT: ${loser.player_name}${loser.projection != null ? " (" + Math.round(loser.projection) + " pts projected)" : ""}`,
      `${edgeStr}`,
      `neekostats.com.au/sports/afl/start-sit`,
    ].join("\n");
    navigator.clipboard.writeText(shareText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "scenarios", label: "Scenarios" },
    { key: "model", label: "Model" },
  ];

  const hasMatchupContext = oppActive || (gameContext && gameContext.matchState !== "close") || isCloseCall;

  return (
    <div className="space-y-3 mt-6 animate-in fade-in duration-300">

      {/* ─── RESULT HERO V4 ─── */}
      <div className={`rounded-2xl overflow-hidden border bg-[#0d0d0d] ${isCloseCall ? "border-amber-400/25" : "border-white/[0.08]"}`}>
        {/* Top bar — edge label + confidence */}
        <div className={`px-4 sm:px-5 py-2 flex items-center justify-between ${isCloseCall ? "bg-amber-400/[0.04] border-b border-amber-400/15" : `${edge.bgColor} border-b ${edge.borderColor}`}`}>
          <div className="flex items-center gap-2">
            {isCloseCall ? (
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={9} className="text-amber-400/75" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/75">Close Call</span>
              </div>
            ) : (
              <span className={`text-[10px] font-bold uppercase tracking-widest ${edge.color}`}>{edge.label}</span>
            )}
            {!isCloseCall && (
              <div className={`flex items-center gap-1 ${psm.bgColor} px-2 py-0.5 rounded-full`}>
                <PlayStyleIcon type={psm.type} className={`${psm.color} opacity-70`} />
                <span className={`text-[9px] font-bold uppercase tracking-wider ${psm.color} opacity-70`}>{psm.label}</span>
              </div>
            )}
          </div>
          <span className={`text-[10px] font-semibold tabular-nums opacity-55 ${isCloseCall ? "text-amber-400" : edge.color}`}>
            {confidence}%
          </span>
        </div>

        {/* Two-col player display */}
        <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
          <div className="px-4 pt-5 pb-4 sm:px-5">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400/65">Start</span>
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-white leading-tight">{winner.player_name}</p>
            {(winner.team || winner.position) && (
              <p className="text-[11px] text-white/28 mt-0.5">{[winner.team, winner.position].filter(Boolean).join(" · ")}</p>
            )}
            {winner.projection != null && (
              <div className="mt-2.5 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-[#F5C84C] tabular-nums leading-none">{Math.round(winner.projection)}</span>
                <span className="text-[10px] text-[#F5C84C]/40 font-semibold">proj</span>
              </div>
            )}
          </div>

          <div className="px-4 pt-5 pb-4 sm:px-5 opacity-38">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-red-400/65">Sit</span>
            </div>
            <p className="text-lg sm:text-xl font-extrabold text-white/55 leading-tight">{loser.player_name}</p>
            {(loser.team || loser.position) && (
              <p className="text-[11px] text-white/20 mt-0.5">{[loser.team, loser.position].filter(Boolean).join(" · ")}</p>
            )}
            {loser.projection != null && (
              <div className="mt-2.5 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-white/25 tabular-nums leading-none">{Math.round(loser.projection)}</span>
                <span className="text-[10px] text-white/15 font-semibold">proj</span>
              </div>
            )}
          </div>
        </div>

        {/* Confidence bar + one supporting line */}
        <div className={`border-t px-4 sm:px-5 py-3 ${isCloseCall ? "border-amber-400/10" : "border-white/[0.05]"}`}>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="flex-1 h-1 rounded-full bg-white/[0.05] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${isCloseCall ? "bg-gradient-to-r from-amber-500/50 to-amber-400" : edge.barColor}`}
                style={{ width: `${confidence}%` }}
              />
            </div>
            <span className={`shrink-0 text-[9px] font-medium opacity-50 ${isCloseCall ? "text-amber-400" : edge.color}`}>{ctxLabel}</span>
          </div>
          {!isPremium && isCloseCall && (
            <p className="text-[10px] text-amber-400/40 leading-snug mb-1">
              This decision flips in 35–45% of simulations.
            </p>
          )}
          {!isPremium && !isCloseCall && confidence < 70 && (
            <p className="text-[10px] text-white/25 leading-snug mb-1">
              This decision flips in 35–45% of simulations.
            </p>
          )}
          {isCloseCall ? (
            <p className="text-[10px] text-white/25 leading-snug">
              Small differences in matchup context or role can flip this decision.
            </p>
          ) : oppActive && oppIsChasing ? (
            <p className="text-[10px] text-white/25 leading-snug">
              {wLast} brings the better ceiling — important when chasing.
            </p>
          ) : oppActive && oppIsLeading ? (
            <p className="text-[10px] text-white/25 leading-snug">
              {wLast} offers the safer floor — good for protecting a lead.
            </p>
          ) : (
            <p className={`text-[10px] font-medium leading-tight ${edge.color} opacity-42`}>
              {edge.label} · {psm.label}
            </p>
          )}
        </div>
      </div>

      {/* ─── EARLY CONVERSION TRIGGER (free only) ─── */}
      {!isPremium && (
        <div className={`rounded-xl border overflow-hidden ${isCloseCall ? "border-amber-400/20 bg-amber-400/[0.03]" : "border-[#F5C84C]/12 bg-[#F5C84C]/[0.025]"}`}>
          <div className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-xs font-bold mb-1 ${isCloseCall ? "text-amber-400/80" : "text-white/60"}`}>
                  {isCloseCall ? "Stop guessing this decision" : "See who actually wins"}
                </p>
                <ul className="space-y-0.5 mb-3">
                  {[
                    "Win probability for your matchup",
                    "Full risk profile + scenario engine",
                    "Advanced model: Neeko rating + confidence",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-1.5">
                      <span className={`h-1 w-1 rounded-full shrink-0 ${isCloseCall ? "bg-amber-400/35" : "bg-[#F5C84C]/30"}`} />
                      <span className="text-[11px] text-white/32">{item}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={onUpgrade}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-[#F5C84C]/75 bg-[#F5C84C]/[0.1] border border-[#F5C84C]/18 px-3 py-1.5 rounded-lg hover:bg-[#F5C84C]/[0.16] transition-all"
                >
                  <Crown size={9} />
                  {isCloseCall ? "Stop guessing this decision" : "See who actually wins"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TABS ─── */}
      <div className="flex gap-1 bg-white/[0.025] rounded-xl p-1 border border-white/[0.05]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${
              activeTab === tab.key
                ? "bg-white/[0.07] text-white/75"
                : "text-white/25 hover:text-white/42"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── TAB: OVERVIEW ─── */}
      {activeTab === "overview" && (
        <div className="space-y-3">

          {/* Decision Context */}
          {hasMatchupContext && (
            <div className={`rounded-xl border px-4 py-3 ${
              isCloseCall
                ? "border-amber-400/18 bg-amber-400/[0.03]"
                : oppIsChasing
                ? "border-red-400/12 bg-red-400/[0.025]"
                : oppIsLeading
                ? "border-emerald-400/12 bg-emerald-400/[0.025]"
                : "border-white/[0.06] bg-white/[0.012]"
            }`}>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5 text-white/20">Decision Context</p>
              <p className={`text-xs leading-snug ${isCloseCall ? "text-amber-400/65 font-medium" : "text-white/48"}`}>
                {decisionContextCopy}
              </p>
              {oppActive && oppMargin != null && (
                <p className="text-[11px] text-white/35 mt-1.5 leading-snug">
                  {oppIsChasing
                    ? `Matchup: trailing by ${Math.abs(oppMargin)} pts — upside edge becomes more relevant.`
                    : oppIsLeading
                    ? `Matchup: up by ${Math.abs(oppMargin)} pts — floor protection is the priority.`
                    : `Matchup: scores level — stick with the model composite edge.`}
                </p>
              )}
              {!oppActive && gameContext && gameContext.matchState !== "close" && (
                <p className="text-[11px] text-white/30 mt-1.5 leading-snug">
                  {gameContext.matchState === "leading"
                    ? `Game context: playing safe — ${wLast}'s floor profile suits.`
                    : `Game context: chasing — ${wLast}'s upside edge is more relevant here.`}
                </p>
              )}
              {oppActive && isPremium && (
                <div className="mt-2.5">
                  <MatchupStatus
                    model={opponentModel!}
                    isCloseCall={isCloseCall}
                    winnerName={winner.player_name}
                    loserName={loser.player_name}
                    isPremium={isPremium}
                    onUpgrade={onUpgrade}
                  />
                </div>
              )}
            </div>
          )}

          {/* Why This Pick — V4: single line for free, full bullets for premium */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] overflow-hidden">
            <div className="px-4 sm:px-5 pt-4 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/18 mb-3">Why {wLast}</p>
              {isPremium ? (
                <ul className="space-y-2">
                  {reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-[#F5C84C]/35 shrink-0" />
                      <span className="text-sm text-white/55 leading-snug">{r}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-white/38 leading-snug">
                  Edge detected in projection and matchup factors.
                </p>
              )}
            </div>
          </div>

          {/* AI Insight — 1 sentence free / expandable premium */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] overflow-hidden">
            <div className="px-4 sm:px-5 pt-4 pb-4">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles size={10} className="text-[#F5C84C]/50 shrink-0" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/18">AI Insight</p>
                </div>
                {!isPremium && (
                  <span className="text-[9px] font-bold text-[#F5C84C]/45 uppercase tracking-wider">Neeko+</span>
                )}
              </div>

              {isPremium ? (
                <div>
                  {fullSummary ? (
                    <>
                      <p className="text-xs text-white/52 leading-relaxed">
                        {aiExpanded ? fullSummary : fullSummary.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ")}
                      </p>
                      {fullSummary.split(/(?<=[.!?])\s+/).length > 2 && (
                        <button
                          onClick={() => setAiExpanded((v) => !v)}
                          className="mt-2 flex items-center gap-1 text-[10px] text-white/28 hover:text-white/48 transition-colors"
                        >
                          {aiExpanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                          {aiExpanded ? "Show less" : "Read full analysis"}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-white/20 italic">Full AI reasoning available after this comparison.</p>
                  )}
                </div>
              ) : (
                <div>
                  {displaySummary ? (
                    <p className="text-xs text-white/42 leading-relaxed">
                      {displaySummary.split(/(?<=[.!?])\s+/).slice(0, 1).join(" ")}
                    </p>
                  ) : (
                    <p className="text-xs text-white/20 italic">AI insight ready.</p>
                  )}
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <span className="text-[11px] text-white/25 leading-snug">
                      {isCloseCall ? "See who actually wins this matchup" : "Full AI reasoning"}
                    </span>
                    <button
                      onClick={onUpgrade}
                      className="flex items-center gap-1 text-[10px] font-bold text-[#F5C84C]/70 bg-[#F5C84C]/[0.08] border border-[#F5C84C]/15 px-2.5 py-1 rounded-lg hover:bg-[#F5C84C]/[0.14] transition-all whitespace-nowrap shrink-0"
                    >
                      <Crown size={8} />
                      {isCloseCall ? "See the full model" : "Unlock reasoning"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Comparison metrics — V4: free sees "Projection: X vs Y" only, premium sees all 4 bars */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] overflow-hidden">
            {isPremium ? (
              <>
                <div className="grid grid-cols-[1fr_80px_1fr] items-center px-4 sm:px-5 py-2 border-b border-white/[0.05] gap-2">
                  <p className={`text-[11px] font-bold text-right truncate ${winnerIsA ? "text-[#F5C84C]" : "text-white/22"}`}>
                    {playerA.player_name.split(" ").pop()}
                  </p>
                  <span className="text-[9px] uppercase tracking-widest text-white/12 text-center">vs</span>
                  <p className={`text-[11px] font-bold truncate ${!winnerIsA ? "text-[#F5C84C]" : "text-white/22"}`}>
                    {playerB.player_name.split(" ").pop()}
                  </p>
                </div>
                <div className="px-4 sm:px-5">
                  <MetricCompareRow
                    label="Proj"
                    aVal={fmt(playerA.projection)}
                    bVal={fmt(playerB.projection)}
                    aRaw={playerA.projection ?? 0}
                    bRaw={playerB.projection ?? 0}
                    aIsWinner={winnerIsA}
                  />
                  <MetricCompareRow
                    label="Ceil"
                    aVal={fmt(playerA.ceiling_estimate)}
                    bVal={fmt(playerB.ceiling_estimate)}
                    aRaw={playerA.ceiling_estimate ?? 0}
                    bRaw={playerB.ceiling_estimate ?? 0}
                    aIsWinner={winnerIsA}
                  />
                  <MetricCompareRow
                    label="Floor"
                    aVal={fmt(playerA.floor_estimate)}
                    bVal={fmt(playerB.floor_estimate)}
                    aRaw={playerA.floor_estimate ?? 0}
                    bRaw={playerB.floor_estimate ?? 0}
                    aIsWinner={winnerIsA}
                  />
                  <MetricCompareRow
                    label="Neeko"
                    aVal={(playerA.neeko_rating ?? 0).toFixed(1)}
                    bVal={(playerB.neeko_rating ?? 0).toFixed(1)}
                    aRaw={playerA.neeko_rating ?? 0}
                    bRaw={playerB.neeko_rating ?? 0}
                    aIsWinner={winnerIsA}
                  />
                </div>
              </>
            ) : (
              <div className="px-4 sm:px-5 py-3.5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/18">Projection</p>
                  <p className="text-xs font-bold text-white/45 tabular-nums">
                    {winnerProj != null && loserProj != null
                      ? `${winnerProj} vs ${loserProj}`
                      : winnerProj != null
                      ? `${winnerProj} pts`
                      : "—"}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: "Ceiling", hint: "unlock to see" },
                    { label: "Floor", hint: "unlock to see" },
                    { label: "Neeko Rating", hint: "unlock to see" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between py-0.5">
                      <span className="text-[11px] text-white/22">{row.label}</span>
                      <span className="text-[11px] text-white/12 blur-[3px] select-none tabular-nums">XX / XX</span>
                    </div>
                  ))}
                </div>
                {winnerProj != null && loserProj != null && Math.abs(winnerProj - loserProj) < 15 && (
                  <p className="text-[10px] text-amber-400/38 mt-2 leading-snug">
                    Small projection gaps are highly volatile.
                  </p>
                )}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ─── TAB: SCENARIOS ─── */}
      {activeTab === "scenarios" && (
        <div className="space-y-3">

          {/* Start If / Sit If V4 */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] overflow-hidden">
            <div className="px-4 sm:px-5 pt-4 pb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/18">Start If / Sit If</p>
                {isCloseCall && (
                  <span className="text-[9px] font-bold text-amber-400/55 uppercase tracking-wider">Flip scenarios</span>
                )}
              </div>

              {/* Context strip — inline */}
              {(oppActive || (gameContext && gameContext.matchState !== "close")) && (
                <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                  <span className={`text-[10px] font-semibold ${oppIsChasing ? "text-red-400/60" : oppIsLeading ? "text-emerald-400/60" : "text-white/35"}`}>
                    {oppIsChasing
                      ? `Chasing ${Math.abs(oppMargin ?? 0)} pts — ceiling matters more`
                      : oppIsLeading
                      ? `Up ${Math.abs(oppMargin ?? 0)} pts — floor protection priority`
                      : gameContext?.matchState === "chasing"
                      ? "Game: chasing — upside priority"
                      : "Game: leading — floor priority"}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {/* Start side */}
                <div className="rounded-lg border border-emerald-400/10 bg-emerald-400/[0.025] p-3">
                  <p className="text-[10px] font-bold text-emerald-400/55 uppercase tracking-wider mb-2.5">Start {wLast} if:</p>
                  <ul className="space-y-1.5">
                    {isPremium ? (
                      startList.map((c, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-[4px] h-1 w-1 rounded-full bg-emerald-400/28 shrink-0" />
                          <span className="text-[11px] text-white/45 leading-snug">{c}</span>
                        </li>
                      ))
                    ) : (
                      <>
                        <li className="flex items-start gap-1.5">
                          <span className="mt-[4px] h-1 w-1 rounded-full bg-emerald-400/28 shrink-0" />
                          <span className="text-[11px] text-white/45 leading-snug">{startList[0]}</span>
                        </li>
                        {startList.length > 1 && (
                          <li className="flex items-start gap-1.5 opacity-30 pointer-events-none select-none" aria-hidden>
                            <span className="mt-[4px] h-1 w-1 rounded-full bg-emerald-400/12 shrink-0" />
                            <span className="text-[11px] text-white/40 leading-snug blur-[3px]">
                              {startList[1]}
                            </span>
                          </li>
                        )}
                      </>
                    )}
                  </ul>
                </div>

                {/* Sit side */}
                <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] p-3">
                  <p className="text-[10px] font-bold text-white/25 uppercase tracking-wider mb-2.5">Consider {lLast} if:</p>
                  {isPremium ? (
                    <ul className="space-y-1.5">
                      {sitList.map((c, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-[4px] h-1 w-1 rounded-full bg-white/12 shrink-0" />
                          <span className="text-[11px] text-white/30 leading-snug">{c}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-white/28 leading-snug">
                      {sitList[0] ?? `Only if you need maximum ceiling from ${lLast} this week.`}
                    </p>
                  )}
                </div>
              </div>

              {!isPremium && (
                <div className="mt-3 flex items-center justify-between gap-3 pt-2.5 border-t border-white/[0.04]">
                  <span className="text-[11px] text-white/25">See full scenario engine</span>
                  <button
                    onClick={onUpgrade}
                    className="flex items-center gap-1 text-[10px] font-bold text-[#F5C84C]/70 bg-[#F5C84C]/[0.08] border border-[#F5C84C]/15 px-2.5 py-1 rounded-lg hover:bg-[#F5C84C]/[0.14] transition-all whitespace-nowrap shrink-0"
                  >
                    <Crown size={8} />
                    {isCloseCall ? "See what flips this" : "Unlock all scenarios"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Win Probability Engine */}
          {winProbability?.enabled && (
            <WinProbabilityPanel
              data={winProbability}
              winnerPlayerId={winnerPlayerId}
              isPremium={isPremium}
              onUpgrade={onUpgrade}
              isCloseCall={isCloseCall}
            />
          )}

          {/* Empty state if no win probability */}
          {!winProbability?.enabled && (
            <p className="text-[11px] text-white/22 text-center py-2 leading-snug">
              Add matchup scores above to unlock win probability analysis.
            </p>
          )}
        </div>
      )}

      {/* ─── TAB: MODEL ─── */}
      {activeTab === "model" && (
        <div className="space-y-3">

          {/* V4: Hard lock for free — single upgrade card */}
          {!isPremium ? (
            <div className="rounded-xl border border-[#F5C84C]/12 bg-[#F5C84C]/[0.025] px-5 py-5">
              <div className="flex items-center gap-2 mb-3">
                <Crown size={13} className="text-[#F5C84C]/55 shrink-0" />
                <p className="text-sm font-bold text-white/60">Advanced Model (Neeko+)</p>
              </div>
              <ul className="space-y-2 mb-4">
                {[
                  "Win probability for your weekly matchup",
                  "Risk profile + volatility scoring",
                  "Score distribution: bust floor, safe range, ceiling",
                  "Confidence breakdown by model component",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-[#F5C84C]/28 shrink-0" />
                    <span className="text-[11px] text-white/35 leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={onUpgrade}
                className="w-full flex items-center justify-center gap-2 bg-[#F5C84C] text-black font-bold py-3 rounded-xl hover:brightness-108 active:scale-[0.99] transition-all text-sm"
              >
                <Crown size={13} />
                Unlock the full decision model
              </button>
            </div>
          ) : (
            <>
              {/* Confidence & Risk — premium only */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.012] overflow-hidden">
                <div className="grid grid-cols-[1fr_80px_1fr] items-center px-4 sm:px-5 py-2 border-b border-white/[0.05] gap-2">
                  <p className={`text-[11px] font-bold text-right truncate ${winnerIsA ? "text-[#F5C84C]" : "text-white/22"}`}>
                    {playerA.player_name.split(" ").pop()}
                  </p>
                  <span className="text-[9px] uppercase tracking-widest text-white/12 text-center">vs</span>
                  <p className={`text-[11px] font-bold truncate ${!winnerIsA ? "text-[#F5C84C]" : "text-white/22"}`}>
                    {playerB.player_name.split(" ").pop()}
                  </p>
                </div>
                <div className="px-4 sm:px-5">
                  <MetricCompareRow
                    label="Confidence"
                    aVal={`${fmt(playerA.projection_confidence)}%`}
                    bVal={`${fmt(playerB.projection_confidence)}%`}
                    aRaw={playerA.projection_confidence ?? 0}
                    bRaw={playerB.projection_confidence ?? 0}
                    aIsWinner={winnerIsA}
                  />
                  <MetricCompareRow
                    label="Risk"
                    aVal={fmt(playerA.risk_rating)}
                    bVal={fmt(playerB.risk_rating)}
                    aRaw={playerA.risk_rating ?? 0}
                    bRaw={playerB.risk_rating ?? 0}
                    aIsWinner={winnerIsA}
                    lowerIsBetter
                  />
                </div>
              </div>

              {/* Outcome Distribution — premium expandable */}
              <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                <button
                  onClick={() => setDistOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-4 sm:px-5 py-3.5 bg-white/[0.012] hover:bg-white/[0.022] transition-colors"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-white/25">
                    Outcome Distribution
                  </span>
                  {distOpen
                    ? <ChevronUp size={12} className="text-white/18" />
                    : <ChevronDown size={12} className="text-white/18" />}
                </button>
                {distOpen && (
                  <div className="border-t border-white/[0.05]">
                    <OutcomeDistributionChart
                      playerA={playerA}
                      playerB={playerB}
                      winnerPlayerId={winnerPlayerId}
                      isPremium={isPremium}
                      onUpgrade={onUpgrade}
                      embedded
                    />
                  </div>
                )}
              </div>

              {/* Model Detail — premium */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] px-4 py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/18 mb-3">Model Detail</p>
                {[
                  {
                    label: "Risk Rating",
                    aVal: fmt(playerA.risk_rating),
                    bVal: fmt(playerB.risk_rating),
                    aWins: (playerA.risk_rating ?? 99) <= (playerB.risk_rating ?? 99),
                  },
                  {
                    label: "Confidence %",
                    aVal: `${fmt(playerA.projection_confidence)}%`,
                    bVal: `${fmt(playerB.projection_confidence)}%`,
                    aWins: (playerA.projection_confidence ?? 0) >= (playerB.projection_confidence ?? 0),
                  },
                ].map(({ label, aVal, bVal, aWins }) => (
                  <div key={label} className="grid grid-cols-[1fr_80px_1fr] items-center gap-2 py-2.5 border-b border-white/[0.04] last:border-0">
                    <span className={`text-sm font-bold tabular-nums text-right ${aWins ? "text-white" : "text-white/25"}`}>{aVal}</span>
                    <span className="text-[9px] uppercase tracking-widest text-white/18 text-center">{label}</span>
                    <span className={`text-sm font-bold tabular-nums ${!aWins ? "text-white" : "text-white/25"}`}>{bVal}</span>
                  </div>
                ))}
                <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center gap-2">
                  {(winner.projection ?? 0) > (loser.projection ?? 0) ? (
                    <TrendingUp size={10} className="text-emerald-400 shrink-0" />
                  ) : (
                    <TrendingDown size={10} className="text-red-400 shrink-0" />
                  )}
                  <span className="text-[10px] text-white/22">
                    {wLast} is the more reliable composite play this round
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── SHARE UTILITY ROW ─── */}
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-2">
        <p className={`text-[11px] font-semibold truncate ${edge.color} opacity-45`}>
          {winner.player_name.split(" ").pop()} · {edge.label} · {confidence}%
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopyShare}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
              copied
                ? "border-emerald-400/25 text-emerald-400/70 bg-emerald-400/[0.05]"
                : "border-white/08 text-white/28 hover:text-white/48 hover:border-white/15"
            }`}
          >
            {copied ? <Check size={10} /> : <Share2 size={10} />}
            {copied ? "Copied" : "Share"}
          </button>
          {onReset && (
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/08 text-[11px] font-semibold text-white/25 hover:text-white/45 hover:border-white/15 transition-all"
            >
              <RotateCcw size={10} />
              Reset
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
