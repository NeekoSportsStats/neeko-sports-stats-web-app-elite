import { useState } from "react";
import { Crown, X, Loader } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import { track } from "@/lib/analytics";

interface Props {
  onClose: () => void;
}

export function UpgradeModal({ onClose }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState<"monthly" | "yearly" | null>(null);

  const startCheckout = async (plan: "monthly" | "yearly") => {
    track("upgrade_click", { plan, source: "market_watch" });
    if (!user) { onClose(); navigate("/auth?redirect=checkout"); return; }
    setLoading(plan);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");
      const origin = window.location.origin;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ plan, success_url: `${origin}/success`, cancel_url: `${origin}/neeko-plus` }),
        }
      );
      if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err?.error || `Checkout failed (${res.status})`); }
      const data = await res.json();
      if (!data.url) throw new Error("No checkout URL returned");
      window.location.assign(data.url);
    } catch (err: any) {
      toast({ title: "Checkout failed", description: err.message || "Something went wrong.", variant: "destructive" });
      setLoading(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[env(safe-area-inset-top)]"
      style={{ background: "rgba(0,0,0,0.80)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 text-center"
        style={{
          background: "linear-gradient(160deg, #111 0%, #0d0d0d 100%)",
          border: "1px solid rgba(245,200,76,0.3)",
          boxShadow: "0 0 60px rgba(245,200,76,0.12)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-neutral-500 hover:text-white transition-colors">
          <X size={18} />
        </button>
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: "rgba(245,200,76,0.12)", border: "1px solid rgba(245,200,76,0.3)" }}
        >
          <Crown className="h-6 w-6 text-[#F5C84C]" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Unlock Market Watch</h2>
        <p className="text-sm text-neutral-400 mb-6 leading-relaxed">
          See every buy target, sell candidate, cash cow and trap. Full AI trade intelligence.
        </p>
        <div className="space-y-3">
          <button
            onClick={() => startCheckout("yearly")}
            disabled={loading !== null}
            className="w-full py-3 px-4 rounded-xl font-bold text-black bg-[#F5C84C] hover:bg-[#ffd95a] transition-all text-sm disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading === "yearly" ? <Loader size={14} className="animate-spin" /> : null}
            Yearly — ${NEEKO_PRICING.yearly.price} AUD
            <span className="text-xs font-medium opacity-75">(Best Value)</span>
          </button>
          <button
            onClick={() => startCheckout("monthly")}
            disabled={loading !== null}
            className="w-full py-3 px-4 rounded-xl font-semibold text-[#F5C84C] border border-[#F5C84C]/40 hover:bg-[#F5C84C]/10 transition-all text-sm disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading === "monthly" ? <Loader size={14} className="animate-spin" /> : null}
            Monthly — ${NEEKO_PRICING.monthly.price} AUD
          </button>
        </div>
        <p className="text-xs text-neutral-600 mt-4">Cancel anytime. No lock-in.</p>
      </div>
    </div>
  );
}
