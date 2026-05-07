import { useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
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
const POLL_MAX_ATTEMPTS = 15;
const REDIRECT_DELAY_MS = 1500;
const REDIRECT_DESTINATION = "/fantasy/rankings";

export default function Success() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const navigate = useNavigate();

  const { loading, isPremium, refreshPremiumStatus, user } = useAuth();
  const refreshTriggeredRef = useRef(false);
  const hasRedirectedRef = useRef(false);
  const pollCountRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const [polling, setPolling] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const triggerRedirect = () => {
    if (hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;
    setRedirecting(true);
    redirectTimerRef.current = setTimeout(() => {
      navigate(REDIRECT_DESTINATION, { replace: true });
    }, REDIRECT_DELAY_MS);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (loading) {
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

    track("subscription_started", { session_id: sessionId ?? undefined });
    track("checkout_success", { session_id: sessionId ?? undefined });

    const startPolling = async () => {
      setPolling(true);

      await supabase.auth.refreshSession().catch(() => {});
      await refreshPremiumStatus().catch(() => {});

      const poll = async () => {
        if (pollCountRef.current >= POLL_MAX_ATTEMPTS) {
          setPolling(false);
          return;
        }
        pollCountRef.current += 1;
        await refreshPremiumStatus().catch(() => {});

        const { data } = await supabase.rpc("get_access_state").catch(() => ({ data: null }));
        if (data?.is_premium === true) {
          setPolling(false);
          triggerRedirect();
          return;
        }

        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      };

      pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    startPolling();

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [loading, authTimedOut, user, refreshPremiumStatus, sessionId]);

  useEffect(() => {
    if (isPremium) {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        setPolling(false);
      }
      triggerRedirect();
    }
  }, [isPremium]);

  if (loading && !authTimedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-background to-background">
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-background to-background">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-3xl font-bold">Payment Successful!</CardTitle>
          <CardDescription className="text-lg">Welcome to Neeko+ Premium</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">
                {isPremium ? "Your Premium Access is Active" : "Activating your Premium Access..."}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              You now have unlimited access to all AI-powered insights, advanced analytics, and
              premium features.
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

          {sessionId && (
            <p className="text-xs text-center text-muted-foreground pt-4">
              Session ID: {sessionId.slice(0, 20)}...
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
