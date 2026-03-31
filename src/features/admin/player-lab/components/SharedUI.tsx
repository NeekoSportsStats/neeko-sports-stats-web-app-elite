import type { SortDir } from "../types";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { AdminInfoTooltip } from "@/features/admin/shared/AdminExplain";

export function fmtNum(n: number | null | undefined, dec = 1) {
  if (n == null) return "—";
  return n.toFixed(dec);
}

export function fmtPrice(n: number | null | undefined) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    // >= 1M → 1.126M (3 decimal places)
    return `${sign}$${(abs / 1_000_000).toFixed(3)}M`;
  }
  // < 1M → 853K (no decimals)
  return `${sign}$${Math.floor(abs / 1000)}K`;
}

export function pct(n: number | null | undefined) {
  if (n == null) return "—";
  return (n * 100).toFixed(0) + "%";
}

export function pctDirect(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toFixed(1) + "%";
}

export function RecoBadge({ color, short }: { color: string; short: string }) {
  const cls =
    color === "green"  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" :
    color === "red"    ? "bg-red-500/15 text-red-400 border-red-500/25" :
    color === "yellow" ? "bg-amber-500/15 text-amber-400 border-amber-500/25" :
                         "bg-muted/40 text-muted-foreground border-border/40";
  return (
    <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${cls}`}>
      {short || "—"}
    </span>
  );
}

export function SortIcon({ col, activeCol, dir }: { col: string; activeCol: string; dir: SortDir }) {
  if (col !== activeCol) return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />;
  return dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
}

export function ConfidenceBadge({ label }: { label: string }) {
  const cls =
    label === "LOCK"     ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
    label === "STRONG"   ? "bg-sky-500/20 text-sky-300 border-sky-500/30" :
    label === "SOLID"    ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
    label === "RISKY"    ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
    label === "VOLATILE" ? "bg-red-500/20 text-red-300 border-red-500/30" :
                           "bg-muted/30 text-muted-foreground border-border/30";
  return (
    <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>
      {label || "—"}
    </span>
  );
}

export function ThSortable({
  col, label, explain, activeCol, dir, onSort,
}: {
  col: string; label: string; explain?: string; activeCol: string; dir: SortDir; onSort: (col: string) => void;
}) {
  return (
    <th className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
      <button onClick={() => onSort(col)} className="flex items-center gap-1 hover:text-foreground transition-colors">
        <span>{label}</span>
        {explain && <AdminInfoTooltip text={explain} />}
        <SortIcon col={col} activeCol={activeCol} dir={dir} />
      </button>
    </th>
  );
}

export function DataWarningBanner({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 text-xs text-amber-400">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}
