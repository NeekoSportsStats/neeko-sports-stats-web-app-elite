import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader as Loader2, CreditCard, Calendar, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";


interface Subscription {
  id: string;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  plan_name?: string;
  amount?: number;
}

const Billing = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  useEffect(() => {
    if (user) {
      loadSubscription();
    }
  }, [user]);

  const loadSubscription = async () => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .or(`profile_id.eq.${user?.id},user_id.eq.${user?.id}`)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSubscription({
          id: data.id,
          status: data.status,
          current_period_end: data.current_period_end ?? "",
          cancel_at_period_end: data.cancel_at_period_end ?? false,
          plan_name: data.plan_type === "weekly" ? "Neeko+ Weekly" : "Neeko+ Season Pass",
          amount: data.plan_type === "weekly" ? 599 : 5900,
        });
      } else {
        setSubscription(null);
      }
    } catch (error: any) {
      console.error("Error loading subscription:", error);
      toast({
        title: "Error loading subscription",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleManageBilling = async () => {
    if (portalLoading) return;
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please log in to manage billing",
          variant: "destructive",
        });
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
        throw new Error(data.error || "Failed to create portal session");
      }

      window.location.assign(data.url);
    } catch (error: any) {
      console.error("Error creating portal session:", error);
      toast({
        title: "Error",
        description: error.message || "Unable to access billing portal",
        variant: "destructive",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container max-w-4xl py-12 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Billing & Subscription</h1>
        <p className="text-muted-foreground">
          Manage your subscription and billing information
        </p>
      </div>

      {subscription ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Current Subscription
              </CardTitle>
              <CardDescription>Your active subscription details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status:</span>
                <Badge
                  variant={
                    subscription.status === "active"
                      ? "default"
                      : subscription.status === "canceled"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {subscription.status}
                </Badge>
              </div>

              {subscription.plan_name && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Plan:</span>
                  <span className="text-sm">{subscription.plan_name}</span>
                </div>
              )}

              {subscription.amount && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Amount:
                  </span>
                  <span className="text-sm">
                    ${(subscription.amount / 100).toFixed(2)}
                    {subscription.amount === 5900 ? " (season)" : "/wk"}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Renewal Date:
                </span>
                <span className="text-sm">
                  {new Date(subscription.current_period_end).toLocaleDateString()}
                </span>
              </div>

              {subscription.cancel_at_period_end && (
                <div className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                  Your subscription will cancel at the end of the current period.
                </div>
              )}

              <div className="pt-4">
                <Button
                  type="button"
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  className="w-full"
                >
                  {portalLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Opening portal…
                    </>
                  ) : (
                    "Manage Billing"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Active Subscription</CardTitle>
            <CardDescription>
              You don't have an active subscription at the moment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Subscribe to Neeko+ to unlock premium features and advanced analytics.
            </p>
            <Button type="button" onClick={() => navigate("/neeko-plus")} className="w-full">
              Unlock Neeko+
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Billing;
