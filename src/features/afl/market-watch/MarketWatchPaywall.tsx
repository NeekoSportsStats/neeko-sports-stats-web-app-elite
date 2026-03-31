import { Lock, Crown, Zap, Target, TrendingUp, CircleCheck as CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { track } from "@/lib/analytics";

export function MarketWatchPaywall() {
  const navigate = useNavigate();

  const handleUnlock = () => {
    track("market_watch_paywall_unlock_click");
    navigate("/neeko-plus");
  };

  return (
    <div className="relative my-16">
      <div className="absolute -inset-[2px] bg-gradient-to-br from-[#F5C84C] via-[#F5C84C]/50 to-sky-400 rounded-xl blur-md opacity-20"></div>
      <div className="relative bg-gradient-to-br from-[#0F1419] to-[#0A0F1A] border-2 border-[#F5C84C]/30 rounded-xl overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>

        <div className="relative p-8 md:p-12">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#F5C84C] to-[#F5C84C]/60 flex items-center justify-center">
              <Lock className="w-8 h-8 text-[#0A0F1A]" />
            </div>
          </div>

          <div className="text-center mb-8">
            <div className="inline-block mb-4">
              <span className="px-4 py-1.5 bg-[#F5C84C]/10 border border-[#F5C84C]/30 rounded-full text-[#F5C84C] text-sm font-bold">
                You're seeing 3 of 40 signals
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
              Unlock Full Trade Engine
            </h2>
            <p className="text-lg text-white/60 max-w-2xl mx-auto">
              AI-powered trade signals updated weekly before lockout
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-8 max-w-3xl mx-auto">
            <FeatureItem
              icon={<TrendingUp className="w-5 h-5" />}
              text="10+ sell signals with price drop forecasts"
            />
            <FeatureItem
              icon={<Target className="w-5 h-5" />}
              text="10+ value targets before price rises"
            />
            <FeatureItem
              icon={<Zap className="w-5 h-5" />}
              text="10+ upgrade plays with projection gains"
            />
            <FeatureItem
              icon={<Crown className="w-5 h-5" />}
              text="AI explanations for every move"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={handleUnlock}
              className="group relative w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-[#F5C84C] to-[#F5C84C]/80 text-[#0A0F1A] font-bold rounded-lg hover:from-[#F5C84C]/90 hover:to-[#F5C84C]/70 transition-all transform hover:scale-105 shadow-lg shadow-[#F5C84C]/20"
            >
              <div className="flex items-center justify-center gap-2">
                <Crown className="w-5 h-5" />
                <span className="text-lg">Unlock My Trade Plan</span>
              </div>
            </button>

            <button
              onClick={handleUnlock}
              className="text-white/60 hover:text-white text-sm underline underline-offset-4 transition-colors"
            >
              Preview how it works
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 text-center">
            <p className="text-xs text-[#F5C84C]/60 font-medium">
              Updated weekly before lockout
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FeatureItemProps {
  icon: React.ReactNode;
  text: string;
}

function FeatureItem({ icon, text }: FeatureItemProps) {
  return (
    <div className="flex items-start gap-3 p-4 bg-white/[0.03] border border-white/10 rounded-lg">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#F5C84C]/10 border border-[#F5C84C]/20 flex items-center justify-center text-[#F5C84C]">
        {icon}
      </div>
      <div className="flex-1 pt-1">
        <p className="text-white/90 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
