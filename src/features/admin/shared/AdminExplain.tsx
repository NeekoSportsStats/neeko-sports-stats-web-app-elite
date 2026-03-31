import { useState } from "react";
import { Info, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function AdminInfoTooltip({ text, side = "top" }: { text: string; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors ml-1 shrink-0">
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[280px] text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AdminSectionIntro({
  title,
  description,
  detail,
}: {
  title?: string;
  description: string;
  detail?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3 mb-5">
      {title && <p className="text-xs font-semibold text-foreground mb-0.5">{title}</p>}
      <p className="text-xs text-muted-foreground">{description}</p>
      {detail && (
        <>
          {expanded && (
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed border-t border-border/40 pt-2">{detail}</p>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Less" : "More info"}
          </button>
        </>
      )}
    </div>
  );
}

export function AdminActionExplain({
  what,
  which,
  duration,
  risk,
  when,
}: {
  what: string;
  which?: string;
  duration?: string;
  risk?: "low" | "medium" | "high";
  when?: string;
}) {
  const [open, setOpen] = useState(false);
  const riskColor = risk === "high" ? "text-red-400" : risk === "medium" ? "text-amber-400" : "text-emerald-400";
  const riskLabel = risk === "high" ? "High risk" : risk === "medium" ? "Medium risk" : "Low risk";
  return (
    <div className="mt-1 mb-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Info className="h-3 w-3 shrink-0" />
        What does this do?
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 space-y-1.5 text-[11px] text-muted-foreground">
          <p><span className="text-foreground font-medium">What:</span> {what}</p>
          {which && <p><span className="text-foreground font-medium">Tables/functions:</span> {which}</p>}
          {duration && <p><span className="text-foreground font-medium">Expected time:</span> {duration}</p>}
          {risk && <p><span className={`font-medium ${riskColor}`}>{riskLabel}:</span> {risk === "high" ? "This modifies production data — confirm before running." : risk === "medium" ? "Minor side effects possible — safe to retry." : "Safe to run anytime."}</p>}
          {when && <p><span className="text-foreground font-medium">When to use:</span> {when}</p>}
        </div>
      )}
    </div>
  );
}

export function AdminMetricExplain({ label, value, explain, highlight }: {
  label: string;
  value: React.ReactNode;
  explain: string;
  highlight?: "good" | "warn" | "bad" | "neutral";
}) {
  const valColor = highlight === "good" ? "text-emerald-400" : highlight === "warn" ? "text-amber-400" : highlight === "bad" ? "text-red-400" : "";
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="flex items-center text-xs text-muted-foreground">
        {label}
        <AdminInfoTooltip text={explain} />
      </span>
      <span className={`text-xs font-semibold tabular-nums ${valColor}`}>{value}</span>
    </div>
  );
}
