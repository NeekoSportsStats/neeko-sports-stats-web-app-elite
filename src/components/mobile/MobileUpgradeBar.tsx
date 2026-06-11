import { useState } from "react";
import { Link } from "react-router-dom";
import { Crown, X } from "lucide-react";
import { trackMobileStickyCTA } from "@/lib/analytics";

interface Props {
  state?: "free" | "locked";
}

export default function MobileUpgradeBar({ state }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const isLocked = state === "locked";
  const isFree   = state === "free";

  const heading = isLocked
    ? "Locked matchup"
    : isFree
    ? "2 games free this week"
    : "Unlock Full Edge";

  const subtext = isLocked
    ? "Upgrade to unlock every match"
    : isFree
    ? "Upgrade to unlock the full round"
    : "600+ players · projections · trade signals";

  const ctaLabel = isLocked || isFree ? "Start 7-Day Access — $9.99" : "Start 7-Day Access";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden">
      <div
        className="flex items-center gap-2 px-3 py-2.5 bg-[#0d0d0d] border-t border-white/[0.08]"
        style={{ boxShadow: "0 -8px 32px rgba(0,0,0,0.7)", paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
      >
        {/* Dismiss */}
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss upgrade prompt"
          className="shrink-0 flex items-center justify-center h-7 w-7 rounded-full text-white/22 hover:text-white/50 hover:bg-white/[0.06] transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <Crown size={10} className="text-[#F5C84C] shrink-0" />
            <span className="text-[12px] font-bold text-white leading-tight">{heading}</span>
          </div>
          <p className="text-[10px] text-white/35 leading-tight">
            {subtext}
          </p>
        </div>

        <Link
          to="/neeko-plus"
          onClick={() =>
            trackMobileStickyCTA({
              button_text: ctaLabel,
              state: isLocked ? "locked" : "free",
            })
          }
          className="flex items-center gap-1.5 bg-[#F5C84C] text-black font-bold text-[12px] px-4 py-2 rounded-xl hover:brightness-110 active:scale-95 transition-all shrink-0 min-h-[40px]"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
