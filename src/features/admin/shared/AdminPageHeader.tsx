import type { ElementType } from "react";
import { RefreshCw } from "lucide-react";

interface AdminPageHeaderProps {
  icon?: ElementType;
  title: string;
  description?: string;
  badge?: string;
  badgeVariant?: "default" | "warn" | "error" | "ok";
  actions?: React.ReactNode;
  loading?: boolean;
  lastUpdated?: string | null;
}

export function AdminPageHeader({
  icon: Icon,
  title,
  description,
  badge,
  badgeVariant = "default",
  actions,
  loading,
  lastUpdated,
}: AdminPageHeaderProps) {
  const badgeCls =
    badgeVariant === "ok"
      ? "bg-emerald-950/50 text-emerald-400 border-emerald-500/30"
      : badgeVariant === "warn"
        ? "bg-amber-950/50 text-amber-400 border-amber-500/30"
        : badgeVariant === "error"
          ? "bg-red-950/50 text-red-400 border-red-500/30"
          : "bg-muted/50 text-muted-foreground border-border/50";

  return (
    <div className="flex items-start justify-between gap-4 mb-6 pb-4 border-b border-border/40">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted/40 border border-border/50 shrink-0 mt-0.5">
          {Icon && <Icon className="h-4.5 w-4.5 text-foreground/80" style={{ width: "18px", height: "18px" }} />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[18px] font-bold tracking-tight text-foreground leading-tight">{title}</h1>
            {badge && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${badgeCls}`}>
                {badge}
              </span>
            )}
            {loading && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground/50" />
            )}
          </div>
          {description && (
            <p className="text-[13px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
          )}
          {lastUpdated && (
            <p className="text-[11px] text-muted-foreground/50 mt-1">Updated {lastUpdated}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}

export function AdminTabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; icon?: ElementType }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 border-b border-border/40 mb-5 -mx-1 px-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`relative flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium whitespace-nowrap transition-colors ${
            active === id
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
          {label}
          {active === id && (
            <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t bg-foreground" />
          )}
        </button>
      ))}
    </div>
  );
}

export function AdminEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
      {Icon && (
        <div className="w-10 h-10 rounded-full bg-muted/40 border border-border/40 flex items-center justify-center mb-1">
          <Icon className="h-5 w-5 text-muted-foreground/50" />
        </div>
      )}
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground/50 max-w-xs leading-relaxed">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function AdminLoadingState({ label = "Loading data…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-8 h-8 rounded-full bg-muted/30 border border-border/40 flex items-center justify-center">
        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/50" />
      </div>
      <p className="text-xs text-muted-foreground/50">{label}</p>
    </div>
  );
}

export function AdminStatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
      {children}
    </div>
  );
}

export function AdminStatTile({
  label,
  value,
  sub,
  variant = "default",
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  variant?: "default" | "ok" | "warn" | "error";
  onClick?: () => void;
}) {
  const borderCls =
    variant === "ok"
      ? "border-emerald-900/40 bg-emerald-950/10"
      : variant === "warn"
        ? "border-amber-900/40 bg-amber-950/10"
        : variant === "error"
          ? "border-red-900/40 bg-red-950/10"
          : "border-border/60 bg-card";

  const dotCls =
    variant === "ok" ? "bg-emerald-500"
    : variant === "warn" ? "bg-amber-500"
    : variant === "error" ? "bg-red-500 animate-pulse"
    : "bg-muted-foreground/30";

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      className={`rounded-lg border px-3.5 py-3 text-left transition-opacity ${onClick ? "hover:opacity-80 cursor-pointer" : ""} ${borderCls}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wide font-medium">{label}</p>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`} />
      </div>
      <p className="text-[22px] font-bold tabular-nums leading-none text-foreground">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground/60 mt-1 truncate">{sub}</p>}
    </Tag>
  );
}
