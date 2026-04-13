import { Link } from "react-router-dom";
import { Crown } from "lucide-react";

export default function MobileUpgradeBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden">
      <div
        className="flex items-center justify-between px-4 py-3.5 bg-[#0d0d0d] border-t border-white/[0.08]"
        style={{ boxShadow: "0 -8px 32px rgba(0,0,0,0.7)" }}
      >
        <div className="flex flex-col min-w-0 mr-3">
          <div className="flex items-center gap-1.5">
            <Crown size={11} className="text-[#F5C84C] shrink-0" />
            <span className="text-sm font-bold text-white leading-tight">Unlock Full Edge</span>
          </div>
          <p className="text-[11px] text-white/40 mt-0.5 leading-tight">
            600+ players · projections · trade signals
          </p>
        </div>

        <Link
          to="/neeko-plus"
          className="flex items-center gap-1.5 bg-[#F5C84C] text-black font-bold text-sm px-5 py-2.5 rounded-xl hover:brightness-110 active:scale-95 transition-all shrink-0 min-h-[44px]"
        >
          $5.99/wk
        </Link>
      </div>
    </div>
  );
}
