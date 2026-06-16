import { useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { track, trackGoogleAdsPurchase } from "@/lib/analytics";
import { loadReferralAttribution } from "@/lib/referralAttribution";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CircleCheck as CheckCircle2, Crown, ArrowRight, Loader as Loader2, Chrome as Home } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 10;
const REDIRECT_DELAY_MS = 1500;
const REDIRECT_DESTINATION = "/fantasy/rankings";

export default function Success() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const navigate = useNavigate();

  const { loading, isPremium, refreshPremiumStatus, user } = useAuth();
  const isMountedRef = useRef(true);
  const refreshTriggeredRef = useRef(false);
  const hasRedirectedRef = useRef(false);
  const pollCountRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const [polling, setPolling] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  const triggerRedirect = () => {
    if (hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;
    if (isMountedRef.current) setRedirecting(true);
    redirectTimerRef.current = setTimeout(() => {
      navigate(REDIRECT_DESTINATION, { replace: true });
    }, REDIRECT_DELAY_MS);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (loading && isMountedRef.current) {
        setAuthTimedOut(true);
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    const authReady = !loading || authTimedOut;
    if (!authReady) return;
    if (!user) return;
    if (refreshTriggeredRef.current) return;

    refreshTriggeredRef.current = true;

    const dedupeKey = sessionId ? `neeko_conversion_fired_${sessionId}` : null;
    const alreadyFired = dedupeKey ? localStorage.getItem(dedupeKey) === "1" : false;
    if (!alreadyFired) {
      if (dedupeKey) localStorage.setItem(dedupeKey, "1");
      const ref = loadReferralAttribution();
      const refProps = ref ? { referral_source: ref.referral_source, creator_slug: ref.creator_slug, creator_name: ref.creator_name } : {};
      track("subscription_activated", { session_id: sessionId ?? undefined, ...refProps });
      const planParam = new URLSearchParams(window.location.search).get("plan");
      const conversionValue = planParam === "weekly"
        ? NEEKO_PRICING.weekly.price
        : planParam === "round_pass_7d"
          ? NEEKO_PRICING.round_pass_7d.price
          : NEEKO_PRICING.season.price;
      trackGoogleAdsPurchase({
        transactionId: sessionId ?? crypto.randomUUID(),
        value: conversionValue,
        currency: "AUD",
        plan: planParam ?? "season",
      });
    }

    const startPolling = async () => {
      if (!isMountedRef.current) return;
      setPolling(true);

      const poll = async () => {
        if (!isMountedRef.current) return;
        if (pollCountRef.current >= POLL_MAX_ATTEMPTS) {
          if (isMountedRef.current) setPolling(false);
          return;
        }
        pollCountRef.current += 1;

        try {
          await refreshPremiumStatus();
        } catch (_) {}

        try {
          const { data } = await supabase.rpc("get_access_state");
          if (data?.is_premium === true) {
            if (isMountedRef.current) setPolling(false);
            triggerRedirect();
            return;
          }
        } catch (_) {}

        if (isMountedRef.current) {
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    startPolling();
  }, [loading, authTimedOut, user, refreshPremiumStatus, sessionId]);

  useEffect(() => {
    if (isPremium) {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        if (isMountedRef.current) setPolling(false);
      }
      triggerRedirect();
    }
  }, [isPremium]);

  const planParam = new URLSearchParams(window.location.search).get("plan");
  const planLabel = planParam === "round_pass_7d"
    ? "7-Day Round Pass"
    : planParam === "weekly"
      ? "Neeko+ Weekly"
      : "Neeko+ Season Pass";
  const planSubtext = planParam === "round_pass_7d"
    ? "7 days of full premium access — every match, projection, and insight."
    : "You now have unlimited access to all AI-powered insights, advanced analytics, and premium features.";

  if (loading && !authTimedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0a0a0a" }}>
        <Card className="max-w-2xl w-full">
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <p className="text-lg text-muted-foreground">Loading your account...</p>
              <p className="text-sm text-muted-foreground">Verifying your subscription</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0a0a0a" }}>
        <Card className="max-w-2xl w-full">
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-lg font-semibold">Payment successful!</p>
              <p className="text-sm text-muted-foreground">Please sign in to access your premium features.</p>
              <Button asChild>
                <a href="/auth">Sign In</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0a0a0a" }}>
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-3xl font-bold">Payment Successful!</CardTitle>
          <CardDescription className="text-lg">Welcome to {planLabel}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">
                {isPremium ? `Your ${planLabel} is Active` : `Activating your ${planLabel}...`}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {planSubtext}
            </p>
          </div>

          {redirecting ? (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
              <p className="text-sm text-green-900 dark:text-green-100 font-medium">
                Neeko+ Activated — taking you to premium insights...
              </p>
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-green-600 dark:text-green-400 shrink-0" />
                <p className="text-xs text-green-700 dark:text-green-300">Redirecting you now...</p>
              </div>
            </div>
          ) : isPremium ? (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-2">
              <p className="text-sm text-green-900 dark:text-green-100 font-medium">
                Premium access activated successfully
              </p>
              {user?.email && (
                <p className="text-xs text-green-700 dark:text-green-300">
                  Receipt sent to {user.email}
                </p>
              )}
            </div>
          ) : polling ? (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
                <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                  Access activating...
                </p>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Your payment is processing. Premium features will unlock shortly.
              </p>
            </div>
          ) : pollCountRef.current >= POLL_MAX_ATTEMPTS ? (
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
              <p className="text-sm text-amber-900 dark:text-amber-100 font-medium">
                Payment received — finalizing activation
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Your payment is processing. Access will unlock shortly. Please refresh this page in 30 seconds to check your premium status.
              </p>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
                className="w-full border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900"
              >
                Refresh Now
              </Button>
            </div>
          ) : (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                Payment received — preparing your premium access...
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button asChild className="flex-1">
              <a href="/fantasy/rankings">
                <ArrowRight className="mr-2 h-4 w-4" />
                Start Exploring
              </a>
            </Button>

            <Button asChild variant="outline" className="flex-1">
              <a href="/">
                <Home className="mr-2 h-4 w-4" />
                Go Home
              </a>
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
