import { Link } from "react-router-dom";
import { Crown } from "lucide-react";

export default function MobileUpgradeBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden">
      <div
        className="flex items-center justify-between px-5 py-4 bg-[#0d0d0d] border-t border-white/[0.08]"
        style={{ boxShadow: "0 -8px 24px rgba(0,0,0,0.6)" }}
      >
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <Crown size={12} className="text-[#F5C84C] shrink-0" />
            <span className="text-sm font-bold text-white">Neeko+</span>
            <span className="text-sm text-white/50 font-medium">$9.99 / month</span>
          </div>
          <p className="text-[11px] text-white/30 mt-0.5 leading-none">
            Best value for serious AFL Fantasy coaches
          </p>
          <p className="text-[10px] text-white/20 mt-0.5 leading-none">Cancel anytime</p>
        </div>

        <Link
          to="/neeko-plus"
          className="flex items-center gap-1.5 bg-[#F5C84C] text-black font-bold text-sm px-5 py-2.5 rounded-xl hover:brightness-110 transition-all shrink-0 min-h-[44px]"
        >
          Unlock
        </Link>
      </div>
    </div>
  );
}
