// src/pages/Account.tsx
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader as Loader2, Crown, User, LogOut, ArrowLeft, CreditCard, Shield } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { trackCTA } from "@/lib/analytics";

export default function Account() {
  const { user, loading: authLoading, signOut, isPremium, isAdmin, refreshPremiumStatus } =
    useAuth();

  // ALL hooks declared at top level — never inside conditionals
  const [profile, setProfile] = useState<any>(null);
  const [subRecord, setSubRecord] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  // Load profile
  useEffect(() => {
    if (!user) return;

    const loadProfile = async () => {
      setLoadingProfile(true);

      const { data: profileRows } = await supabase.rpc("get_my_profile_summary");
      const profileData = Array.isArray(profileRows) ? (profileRows[0] ?? null) : (profileRows ?? null);

      if (!profileData) {
        setProfile({
          id: user.id,
          email: user.email,
          created_at: user.created_at ?? new Date().toISOString(),
          subscription_status: isPremium ? "active" : "free",
        });
      } else {
        setProfile(profileData);
      }

      const { data: subRows } = await supabase.rpc("get_my_subscription_summary");
      const subData = Array.isArray(subRows) ? (subRows[0] ?? null) : (subRows ?? null);

      setSubRecord(subData ?? null);

      setLoadingProfile(false);
    };

    loadProfile();
  }, [user, isPremium]);

  // Stripe success return flow
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast({
        title: "Success!",
        description: "Your subscription is now active.",
      });
      refreshPremiumStatus();
    }
  }, [searchParams, toast, refreshPremiumStatus]);

  const handleManageSubscription = async () => {
    if (portalLoading) return;
    setPortalLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast({
          title: "Error",
          description: "You must be logged in to manage your subscription.",
          variant: "destructive",
        });
        setPortalLoading(false);
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok || !data.url) {
        throw new Error(data.error || "No portal URL returned");
      }

      window.location.assign(data.url);
    } catch (err: any) {
      console.error("Portal error:", err);
      toast({
        title: "Unable to open billing portal",
        description: err.message || "Please try again or contact support.",
        variant: "destructive",
      });
      setPortalLoading(false);
    }
  };

  // Early returns — after all hooks
  if (authLoading || loadingProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Unable to load account details.</p>
        <Button onClick={() => navigate("/auth")}>Go to login</Button>
      </div>
    );
  }

  const subscriptionActive = isPremium;

  const isRoundPass = subRecord?.plan_type === "round_pass_7d";

  const isCancelling =
    isPremium &&
    !isRoundPass &&
    (profile.cancel_at_period_end === true ||
      subRecord?.cancel_at_period_end === true);

  const getStatusBadge = (s: string) => {
    if (isRoundPass && s === "active") {
      return <Badge variant="default">ACTIVE</Badge>;
    }
    if (s === "active" && isCancelling) {
      return <Badge variant="secondary">CANCELLING</Badge>;
    }
    const variants: Record<string, any> = {
      active: "default",
      trialing: "secondary",
      past_due: "destructive",
      canceled: "destructive",
      free: "outline",
    };
    const label = s === "trialing" ? "TRIAL" : s.toUpperCase();
    return <Badge variant={variants[s] || "outline"}>{label}</Badge>;
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Button variant="ghost" onClick={() => navigate("/")} className="mb-6">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      <div className="space-y-6">
        {/* Account Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <User className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Account Information</CardTitle>
                <CardDescription>Manage your details</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <p>
              <span className="text-sm text-muted-foreground">Email</span><br />
              <span className="text-base font-medium">{profile.email}</span>
            </p>

            <p>
              <span className="text-sm text-muted-foreground">Account ID</span><br />
              <span className="text-xs font-mono">{profile.id}</span>
            </p>

            <p>
              <span className="text-sm text-muted-foreground">Member Since</span><br />
              <span className="text-base">
                {new Date(profile.created_at).toLocaleDateString()}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Crown className="h-8 w-8 text-primary" />
                <div>
                  <CardTitle>Subscription</CardTitle>
                  <CardDescription>Your Neeko+ plan</CardDescription>
                </div>
              </div>
              {getStatusBadge(subscriptionActive ? (profile.subscription_status ?? "active") : "free")}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {subscriptionActive ? (
              <>
                <p>
                  <span className="text-sm text-muted-foreground">Plan</span><br />
                  <strong>
                    {subRecord?.plan_type === "weekly"
                      ? "Neeko+ Weekly"
                      : subRecord?.plan_type === "round_pass_7d"
                        ? "Neeko+ 7-Day Round Pass"
                        : subRecord?.plan_type === "season"
                          ? "Neeko+ Season Pass"
                          : profile?.premium_expires_at
                            ? "Neeko+ Season Pass"
                            : "Neeko+"}
                  </strong>
                </p>

                {(subRecord?.current_period_end || profile.current_period_end || profile.billing_period_end || profile.premium_expires_at) && (
                  <p>
                    <span className="text-sm text-muted-foreground">
                      {subRecord?.plan_type === "round_pass_7d"
                        ? "Pass Expires"
                        : (subRecord?.plan_type === "season" || (!subRecord && profile?.premium_expires_at))
                          ? "Season Access Until"
                          : isCancelling
                            ? "Access Until"
                            : "Next Renewal"}
                    </span><br />
                    {new Date(
                      subRecord?.current_period_end ??
                      profile.current_period_end ??
                      profile.billing_period_end ??
                      profile.premium_expires_at
                    ).toLocaleDateString()}
                  </p>
                )}

                {isCancelling && (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Your subscription will not renew. You retain full access until the date above.
                  </p>
                )}

                <Separator />

                {subRecord?.plan_type === "season" || subRecord?.plan_type === "round_pass_7d" || (!subRecord && profile?.premium_expires_at) ? (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground text-center py-2">
                      {subRecord?.plan_type === "round_pass_7d"
                        ? "This pass does not renew. No recurring billing."
                        : "Season Pass is a one-time payment — no recurring billing to manage."}
                      <br />
                      <span className="text-xs">
                        {subRecord?.plan_type === "round_pass_7d"
                          ? "Purchase another pass anytime to extend your access."
                          : "Contact support if you need a refund."}
                      </span>
                    </div>
                    {subRecord?.plan_type === "round_pass_7d" && (
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          onClick={() => {
                            trackCTA({ cta_location: "account_page", cta_text: "Buy Another 7 Days", plan_key: "round_pass_7d", billing_type: "one_time", currency: "AUD" });
                            navigate("/start-checkout?plan_key=round_pass_7d");
                          }}
                          className="w-full"
                        >
                          <Crown className="h-4 w-4 mr-2" />
                          Buy Another 7 Days
                        </Button>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              trackCTA({ cta_location: "account_page", cta_text: "Upgrade to Weekly", plan_key: "weekly", billing_type: "subscription", currency: "AUD" });
                              navigate("/start-checkout?plan_key=weekly");
                            }}
                          >
                            Upgrade to Weekly
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              trackCTA({ cta_location: "account_page", cta_text: "Upgrade to Season", plan_key: "season", billing_type: "one_time", currency: "AUD" });
                              navigate("/start-checkout?plan_key=season");
                            }}
                          >
                            Upgrade to Season
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            trackCTA({ cta_location: "account_page", cta_text: "View All Plans", destination: "/neeko-plus" });
                            navigate("/neeko-plus");
                          }}
                          className="w-full text-muted-foreground"
                        >
                          View All Plans
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Button
                    type="button"
                    onClick={handleManageSubscription}
                    disabled={portalLoading}
                    variant="outline"
                    className="w-full"
                  >
                    {portalLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Opening portal…
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 mr-2" />
                        Manage Subscription
                      </>
                    )}
                  </Button>
                )}
              </>
            ) : (
              <>
                <p>You're on the free plan. Unlock Neeko+ to access all features.</p>
                <Button
                  type="button"
                  onClick={() => navigate("/start-checkout?plan_key=round_pass_7d")}
                  className="w-full"
                >
                  <Crown className="h-4 w-4 mr-2" />
                  Unlock Neeko+
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Admin Controls — only visible to admin users */}
        {isAdmin && (
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Admin Controls</CardTitle>
                  <CardDescription>Internal dashboard access</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/admin")}
                className="w-full"
              >
                <Shield className="h-4 w-4 mr-2" />
                Open Admin Dashboard
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="destructive"
              onClick={signOut}
              className="w-full"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
