import { TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, Info } from "lucide-react";
import type { SafetyResult } from "../lib/safetyRules";

interface SafetyCheckPanelProps {
  hookResult: SafetyResult;
  captionResult: SafetyResult;
  shortCaptionResult: SafetyResult;
}

export function SafetyCheckPanel({
  hookResult,
  captionResult,
  shortCaptionResult,
}: SafetyCheckPanelProps) {
  const allSafe =
    hookResult.isSafe && captionResult.isSafe && shortCaptionResult.isSafe;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        {allSafe ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-400" />
        )}
        <span className="text-xs font-semibold text-zinc-300">
          Safety Check — {allSafe ? "All Clear" : "Flags Found"}
        </span>
      </div>

      <div className="space-y-2">
        <SafetyRow label="Hook" result={hookResult} />
        <SafetyRow label="Caption" result={captionResult} />
        <SafetyRow label="Short Caption" result={shortCaptionResult} />
      </div>

      {!allSafe && (
        <p className="text-[11px] text-amber-400/80">
          Fix flagged words before marking this post as ready.
        </p>
      )}
    </div>
  );
}

function SafetyRow({ label, result }: { label: string; result: SafetyResult }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[11px] text-zinc-500 w-24 shrink-0">{label}</span>
      <div className="flex-1">
        {result.isSafe ? (
          <span className="text-[11px] text-emerald-400">Clean</span>
        ) : (
          <div className="space-y-1">
            {result.flags.map((flag, i) => (
              <div key={i} className="text-[11px]">
                <span className={flag.type === "banned" ? "text-red-400" : "text-amber-400"}>
                  {flag.type === "banned" ? "Banned" : "Caution"}: &quot;{flag.word}&quot;
                </span>
                {flag.suggestion && (
                  <span className="text-zinc-500 ml-1">— {flag.suggestion}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
