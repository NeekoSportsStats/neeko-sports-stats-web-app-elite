import { Lock } from "lucide-react";

export default function PremiumLock() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#F5C84C]/10 border border-[#F5C84C]/25 text-[9px] font-bold text-[#F5C84C]/70 uppercase tracking-wide shrink-0">
      <Lock size={8} className="text-[#F5C84C]/60" />
      Neeko+
    </span>
  );
}
