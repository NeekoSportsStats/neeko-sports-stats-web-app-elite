import React from "react";

export type FantasyVerdict = "ELITE" | "STRONG" | "RELIABLE" | "NEUTRAL" | "VOLATILE" | "RISKY" | "AVOID";

const VERDICT_STYLES: Record<FantasyVerdict, { bg: string; text: string; border: string }> = {
  ELITE:    { bg: "bg-yellow-500/20",  text: "text-yellow-300",  border: "border-yellow-400/50" },
  STRONG:   { bg: "bg-emerald-500/20", text: "text-emerald-300", border: "border-emerald-400/50" },
  RELIABLE: { bg: "bg-teal-500/20",    text: "text-teal-300",    border: "border-teal-400/50" },
  NEUTRAL:  { bg: "bg-neutral-500/20", text: "text-neutral-300", border: "border-neutral-500/50" },
  VOLATILE: { bg: "bg-orange-500/20",  text: "text-orange-300",  border: "border-orange-400/50" },
  RISKY:    { bg: "bg-red-500/20",     text: "text-red-300",     border: "border-red-400/50" },
  AVOID:    { bg: "bg-red-900/30",     text: "text-red-400",     border: "border-red-700/60" },
};

interface FantasyVerdictBadgeProps {
  verdict: string | null | undefined;
  size?: "sm" | "md";
}

export default function FantasyVerdictBadge({ verdict, size = "md" }: FantasyVerdictBadgeProps) {
  if (!verdict) return null;

  const key = verdict.toUpperCase() as FantasyVerdict;
  const styles = VERDICT_STYLES[key] ?? VERDICT_STYLES.NEUTRAL;

  const sizeClass = size === "sm"
    ? "px-2 py-0.5 text-[10px] tracking-[0.14em]"
    : "px-3 py-1 text-xs tracking-[0.16em]";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold uppercase ${sizeClass} ${styles.bg} ${styles.text} ${styles.border}`}
    >
      {key}
    </span>
  );
}
