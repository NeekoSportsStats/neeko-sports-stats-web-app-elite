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

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (!data) {
        setProfile({
          id: user.id,
          email: user.email,
          created_at: user.created_at ?? new Date().toISOString(),
          subscription_status: isPremium ? "active" : "free",
        });
      } else {
        setProfile(data);
      }

      const { data: customer } = await supabase
        .from("stripe_customers")
        .select("customer_id")
        .or(`profile_id.eq.${user.id},user_id.eq.${user.id}`)
        .maybeSingle();

      if (customer?.customer_id) {
        const { data: sub } = await supabase
          .from("stripe_subscriptions")
          .select("*")
          .eq("customer_id", customer.customer_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        setSubRecord(sub ?? null);
      }

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

  const isCancelling =
    isPremium &&
    (profile.cancel_at_period_end === true ||
      subRecord?.cancel_at_period_end === true);

  const getStatusBadge = (s: string) => {
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
                    {subRecord?.plan_interval === "year" || subRecord?.interval === "year"
                      ? "Neeko+ Yearly"
                      : "Neeko+ Monthly"}
                  </strong>
                </p>

                {(subRecord?.current_period_end || profile.current_period_end || profile.billing_period_end || profile.premium_expires_at) && (
                  <p>
                    <span className="text-sm text-muted-foreground">
                      {isCancelling ? "Access Until" : "Next Billing Date"}
                    </span><br />
                    {subRecord?.current_period_end
                      ? new Date(
                          typeof subRecord.current_period_end === "number"
                            ? subRecord.current_period_end * 1000
                            : subRecord.current_period_end
                        ).toLocaleDateString()
                      : new Date(
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
              </>
            ) : (
              <>
                <p>You're on the free plan. Unlock Neeko+ to access all features.</p>
                <Button
                  type="button"
                  onClick={() => navigate("/neeko-plus")}
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
