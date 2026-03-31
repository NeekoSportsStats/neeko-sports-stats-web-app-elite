import { ReactNode, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { Lock, Crown, Loader as Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import { track } from "@/lib/analytics";

interface PremiumGateProps {
  children?: ReactNode;
  isLocked?: boolean;
  mode?: "blur" | "solid";
  blur?: boolean;
}

export function PremiumGate({ children, isLocked, mode = "solid", blur }: PremiumGateProps) {
  const { isPremium } = useAuth();
  const locked = isLocked !== undefined ? isLocked : !isPremium;

  if (!locked) return <>{children}</>;
  if (!children) return <PremiumGateCTA />;

  return (
    <div className="relative rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-center rounded-xl py-8"
        style={{
          background: "linear-gradient(180deg, rgba(245,200,76,0.08) 0%, rgba(245,200,76,0.04) 100%)",
          border: "1px solid rgba(245,200,76,0.35)",
          boxShadow: "0 0 25px rgba(245,200,76,0.18)",
        }}
      >
        <PremiumGateCTA />
      </div>
    </div>
  );
}

export function PremiumGateCTA() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col items-center gap-3 text-center px-4 py-2">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: "rgba(245,200,76,0.12)", border: "1px solid rgba(245,200,76,0.3)" }}
        >
          <Lock className="h-5 w-5 text-[#F5C84C]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-1">Neeko+ Exclusive</p>
          <p className="text-xs text-neutral-500 mb-3 max-w-[220px]">
            Unlock full AI analysis for all players, teams and matches.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-black bg-[#F5C84C] hover:bg-[#ffd95a] transition-colors text-sm"
        >
          <Crown size={13} />
          Unlock Neeko+
        </button>
      </div>

      {open && <UnlockModal onClose={() => setOpen(false)} />}
    </>
  );
}

function UnlockModal({ onClose }: { onClose: () => void }) {
  const navigate    = useNavigate();
  const { toast }   = useToast();
  const { user }    = useAuth();
  const [loading, setLoading] = useState<"monthly" | "yearly" | null>(null);

  const startCheckout = async (plan: "monthly" | "yearly") => {
    track("upgrade_click", { plan, source: "premium_gate" });

    if (!user) {
      onClose();
      navigate("/auth?redirect=checkout");
      return;
    }

    setLoading(plan);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const origin = window.location.origin;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            plan,
            success_url: `${origin}/success`,
            cancel_url:  `${origin}/neeko-plus`,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Checkout failed (${res.status})`);
      }

      const data = await res.json();
      if (!data.url) throw new Error("No checkout URL returned");

      window.location.assign(data.url);
    } catch (err: any) {
      toast({
        title: "Checkout failed",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setLoading(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[env(safe-area-inset-top)]"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 text-center"
        style={{
          background: "linear-gradient(160deg, #111 0%, #0d0d0d 100%)",
          border: "1px solid rgba(245,200,76,0.3)",
          boxShadow: "0 0 60px rgba(245,200,76,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-neutral-500 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>

        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: "rgba(245,200,76,0.12)", border: "1px solid rgba(245,200,76,0.3)" }}
        >
          <Crown className="h-6 w-6 text-[#F5C84C]" />
        </div>

        <h2 className="text-xl font-bold text-white mb-2">Unlock Neeko+</h2>
        <p className="text-sm text-neutral-400 mb-6 leading-relaxed">
          Access full rankings, AI insights and weekly edge signals.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => startCheckout("yearly")}
            disabled={loading !== null}
            className="w-full py-3 px-4 rounded-xl font-bold text-black bg-[#F5C84C] hover:bg-[#ffd95a] transition-all text-sm disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading === "yearly" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : null}
            Yearly — ${NEEKO_PRICING.yearly.price} AUD
            <span className="text-xs font-medium opacity-75">(Best Value)</span>
          </button>

          <button
            onClick={() => startCheckout("monthly")}
            disabled={loading !== null}
            className="w-full py-3 px-4 rounded-xl font-semibold text-[#F5C84C] border border-[#F5C84C]/40 hover:bg-[#F5C84C]/10 transition-all text-sm disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading === "monthly" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : null}
            Monthly — ${NEEKO_PRICING.monthly.price} AUD
          </button>
        </div>

        <p className="text-xs text-neutral-600 mt-4">
          Cancel anytime. No lock-in.
        </p>
      </div>
    </div>
  );
}
