import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { track } from "@/lib/analytics";
import { clearCheckoutIntent } from "@/pages/Auth";
import { loadReferralAttribution } from "@/lib/referralAttribution";
import type { NeekoPlan } from "@/config/neekoPricing";

const VALID_PLANS = new Set<string>(["round_pass_7d", "weekly", "season"]);

function isValidPlan(val: string | null): val is NeekoPlan {
  return val !== null && VALID_PLANS.has(val);
}

const StartCheckout = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const rawPlan = searchParams.get("plan_key") ?? searchParams.get("plan");
  const plan: NeekoPlan = isValidPlan(rawPlan) ? rawPlan : "round_pass_7d";

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      if (!supabase) {
        navigate("/neeko-plus", { replace: true });
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        navigate(`/auth?mode=signup&plan_key=${plan}`, { replace: true });
        return;
      }

      const ref = loadReferralAttribution();
      const refProps = ref ? {
        referral_source: ref.referral_source,
        campaign_type: ref.campaign_type,
        creator_slug: ref.creator_slug,
        creator_name: ref.creator_name,
        referral_code: ref.referral_code,
        referral_landing_url: ref.referral_landing_url,
        referral_first_seen_at: ref.referral_first_seen_at,
        referral_last_seen_at: ref.referral_last_seen_at,
      } : {};
      track("auth_checkout_resume", { plan_key: plan });
      track("checkout_attempted", { plan_key: plan, source_page: "/checkout", ...refProps });
      clearCheckoutIntent();

      try {
        const origin = window.location.origin;
        const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";

        const resp = await fetch(`${supabaseUrl}/functions/v1/stripe-checkout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            plan,
            success_url: `${origin}/success`,
            cancel_url: `${origin}/neeko-plus`,
          }),
        });

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          const msg = body?.error ?? `Checkout failed (${resp.status})`;
          track("checkout_error", { plan_key: plan, source_page: "/checkout", error: msg, ...refProps });
          setError(msg);
          return;
        }

        const data = await resp.json();
        if (!data.url) {
          track("checkout_error", { plan_key: plan, source_page: "/start-checkout", error: "No URL" });
          setError("No checkout URL returned");
          return;
        }

        track("checkout_session_created", { plan_key: plan, source_page: "/checkout", stripe_session_id: data.sessionId ?? undefined, ...refProps });
        track("checkout_redirected", { plan_key: plan, source_page: "/checkout", ...refProps });
        window.location.href = data.url;
      } catch (e: any) {
        const msg = e?.message ?? "Unexpected error";
        track("checkout_error", { plan_key: plan, source_page: "/start-checkout", error: msg });
        setError(msg);
      }
    })();
  }, []);

  if (error) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#080707",
        padding: 24,
        gap: 16,
      }}>
        <p style={{ color: "#ef4444", fontSize: 14, fontWeight: 600, textAlign: "center", maxWidth: 360 }}>
          {error}
        </p>
        <button
          onClick={() => navigate("/neeko-plus")}
          style={{
            padding: "10px 24px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "#F5F5F5",
            fontSize: 13, fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Back to plans
        </button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#080707",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 36, height: 36,
          border: "3px solid rgba(96,165,250,0.30)",
          borderTopColor: "#60a5fa",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          margin: "0 auto 14px",
        }} />
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Starting checkout...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default StartCheckout;
