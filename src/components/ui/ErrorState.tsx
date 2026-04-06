import { TriangleAlert as AlertTriangle, RefreshCw, WifiOff } from "lucide-react";

interface ErrorStateProps {
  message?: string;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  variant?: "page" | "inline" | "card";
  icon?: "warning" | "offline";
}

export function ErrorState({
  message = "Something went wrong",
  detail,
  onRetry,
  retryLabel = "Try again",
  retrying = false,
  variant = "card",
  icon = "warning",
}: ErrorStateProps) {
  const Icon = icon === "offline" ? WifiOff : AlertTriangle;

  if (variant === "page") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <Icon size={22} className="text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">{message}</h3>
          {detail && <p className="text-sm text-white/40 mb-5 leading-relaxed">{detail}</p>}
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={retrying}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/8 hover:bg-white/12 border border-white/10 hover:border-white/20 text-white/80 hover:text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={14} className={retrying ? "animate-spin" : ""} />
              {retrying ? "Retrying..." : retryLabel}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-red-500/8 border border-red-500/15 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon size={15} className="text-red-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-red-300 font-medium leading-snug">{message}</p>
            {detail && <p className="text-xs text-red-400/60 mt-0.5 leading-snug truncate">{detail}</p>}
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 hover:text-red-200 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={11} className={retrying ? "animate-spin" : ""} />
            {retrying ? "Retrying..." : retryLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/8 px-6 py-10 flex flex-col items-center text-center">
      <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-3">
        <Icon size={18} className="text-red-400" />
      </div>
      <p className="text-sm font-medium text-white/70 mb-1">{message}</p>
      {detail && <p className="text-xs text-white/35 mb-4 leading-relaxed max-w-[240px]">{detail}</p>}
      {!detail && onRetry && <div className="mb-4" />}
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/6 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white/80 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={12} className={retrying ? "animate-spin" : ""} />
          {retrying ? "Retrying..." : retryLabel}
        </button>
      )}
    </div>
  );
}
