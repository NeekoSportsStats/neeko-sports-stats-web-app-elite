import { Link } from "react-router-dom";
import { Crown } from "lucide-react";
import { trackMobileStickyCTA } from "@/lib/analytics";

interface Props {
  state?: "free" | "locked";
}

export default function MobileUpgradeBar({ state }: Props) {
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

  const ctaLabel = isLocked || isFree ? "Unlock full round" : "$5.99/wk";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden">
      <div
        className="flex items-center justify-between px-4 py-3.5 bg-[#0d0d0d] border-t border-white/[0.08]"
        style={{ boxShadow: "0 -8px 32px rgba(0,0,0,0.7)" }}
      >
        <div className="flex flex-col min-w-0 mr-3">
          <div className="flex items-center gap-1.5">
            <Crown size={11} className="text-[#F5C84C] shrink-0" />
            <span className="text-sm font-bold text-white leading-tight">{heading}</span>
          </div>
          <p className="text-[11px] text-white/40 mt-0.5 leading-tight">
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
          className="flex items-center gap-1.5 bg-[#F5C84C] text-black font-bold text-sm px-5 py-2.5 rounded-xl hover:brightness-110 active:scale-95 transition-all shrink-0 min-h-[44px]"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
