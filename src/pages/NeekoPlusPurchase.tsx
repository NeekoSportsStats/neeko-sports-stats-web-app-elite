import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Sparkles, Loader as Loader2, ArrowLeft, TrendingUp, Target, Zap, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { NEEKO_PRICING } from "@/config/neekoPricing";
type Plan = "monthly" | "yearly";

const features = [
  "Full Rankings table — all players",
  "Full AI player breakdowns",
  "Captain Edge board",
  "Breakout alerts",
  "Trap warnings",
  "Player vs Player comparison",
  "Advanced projections and value metrics",
];

const trustFeatures = [
  {
    icon: TrendingUp,
    title: "Data-driven edge",
    description:
      "Advanced AFL trend modelling designed to surface momentum shifts before they appear in fantasy scores.",
  },
  {
    icon: Target,
    title: "Fantasy-first analysis",
    description:
      "Every metric is tuned for fantasy relevance, including hit-rate thresholds, volatility bands, and ceiling projections.",
  },
  {
    icon: Zap,
    title: "Built weekly, not retrospectively",
    description:
      "Neeko+ is designed around upcoming matchups — not post-game summaries.",
  },
  {
    icon: Users,
    title: "Trusted by growing community",
    description:
      "Used weekly by a growing base of fantasy-focused users preparing lineups, trades, and match decisions.",
  },
];

const NeekoPlusPurchase = () => {
  const [selectedPlan, setSelectedPlan] = useState<Plan>("yearly");
  const [loading, setLoading] = useState(false);
  const { user, isPremium } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    track("view_pricing_page", { source: "neeko_plus" });
  }, []);

  useEffect(() => {
    if (isPremium) {
      console.log("User already premium");
    }
  }, [isPremium]);

  const handleSubscribe = async (plan: Plan) => {
    if (isPremium) {
      toast({
        title: "Already subscribed",
        description: "You already have an active Neeko+ membership.",
      });
      navigate("/account");
      return;
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast({
          title: "Please log in first",
          description: "You need to be logged in to subscribe.",
          variant: "destructive",
        });
        navigate("/auth?redirect=checkout");
        return;
      }

      track("start_checkout", { plan, source: "neeko_plus_page" });

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
        const errorBody = await res.json().catch(() => null);
        throw new Error(errorBody?.message || errorBody?.error || `Checkout request failed (${res.status})`);
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
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-4xl py-8 md:py-12 px-4">
      <Button
        variant="ghost"
        className="mb-6 flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft className="h-5 w-5" />
        Back
      </Button>

      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Crown className="h-10 w-10 text-primary" />
          <h1 className="text-5xl font-extrabold">Neeko+</h1>
        </div>
        <p className="text-xl text-muted-foreground">
          Unlock premium sports analytics and AI insights
        </p>
      </div>

      <div className="relative mb-10 md:mb-16">
        <div className="absolute inset-0 -z-10 blur-[140px] opacity-70 bg-[radial-gradient(circle_at_center,rgba(255,200,60,0.55),rgba(255,170,30,0.35),rgba(255,140,0,0.15),transparent)]" />

        <div className="grid md:grid-cols-2 gap-5 mb-6">
          <PlanCard
            plan="monthly"
            selected={selectedPlan === "monthly"}
            onSelect={() => setSelectedPlan("monthly")}
            isPremium={isPremium}
            loading={loading}
            onSubscribe={handleSubscribe}
          />
          <PlanCard
            plan="yearly"
            selected={selectedPlan === "yearly"}
            onSelect={() => setSelectedPlan("yearly")}
            isPremium={isPremium}
            loading={loading}
            onSubscribe={handleSubscribe}
          />
        </div>

        <Card className="border-primary/20 bg-black/30 backdrop-blur-sm rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Everything included in Neeko+
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-y-3 gap-x-6">
              {features.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-20">
        <h2 className="text-3xl font-bold mb-2 text-center">
          Why serious fantasy players use Neeko+
        </h2>
        <p className="text-muted-foreground text-center mb-10">
          Built for decision-makers who want clarity, not noise.
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {trustFeatures.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <Card
                key={idx}
                className="p-6 bg-black/40 border-primary/20 hover:border-primary/40 transition-all"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </Card>
            );
          })}
        </div>

        <p className="text-center mt-8 text-xs text-muted-foreground">
          No hype. No betting tips. Just structured insight.
        </p>
      </div>
    </div>
  );
};

interface PlanCardProps {
  plan: Plan;
  selected: boolean;
  onSelect: () => void;
  isPremium: boolean;
  loading: boolean;
  onSubscribe: (plan: Plan) => void;
}

function PlanCard({ plan, selected, onSelect, isPremium, loading, onSubscribe }: PlanCardProps) {
  const handleSelect = () => {
    track("plan_selected", { plan });
    onSelect();
  };
  const isYearly = plan === "yearly";

  return (
    <Card
      onClick={handleSelect}
      className={`relative cursor-pointer border-2 rounded-2xl bg-black/40 backdrop-blur-sm transition-all hover:-translate-y-0.5 ${
        selected ? "border-primary shadow-[0_0_30px_rgba(245,200,76,0.25)]" : "border-primary/20 hover:border-primary/40"
      }`}
    >
      {isYearly && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <Badge className="bg-primary text-black font-bold px-3 py-0.5 text-xs">
            Best Value — Save {NEEKO_PRICING.savingsPercent}%
          </Badge>
        </div>
      )}

      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-4 w-4 text-primary" />
          {isYearly ? NEEKO_PRICING.yearly.label : NEEKO_PRICING.monthly.label}
        </CardTitle>
        <CardDescription>
          {isYearly ? NEEKO_PRICING.yearly.billingNote : NEEKO_PRICING.monthly.billingNote}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex items-end gap-1.5 mb-1">
          <span className="text-4xl font-extrabold text-white">
            ${isYearly ? NEEKO_PRICING.yearly.price : NEEKO_PRICING.monthly.price}
          </span>
          <span className="text-muted-foreground mb-1 text-sm">
            AUD / {isYearly ? "year" : "month"}
          </span>
        </div>
        {isYearly && (
          <p className="text-xs text-primary/80 font-medium">
            Equivalent to ${NEEKO_PRICING.yearly.monthlyEquivalent}/month
          </p>
        )}
      </CardContent>

      <CardFooter>
        {isPremium ? (
          <Button variant="outline" className="w-full" disabled>
            Current Plan
          </Button>
        ) : (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onSubscribe(plan);
            }}
            disabled={loading}
            className={`w-full font-bold transition-all hover:-translate-y-0.5 ${
              selected ? "bg-primary text-black hover:bg-primary/90" : ""
            }`}
            variant={selected ? "default" : "outline"}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing…
              </>
            ) : (
              `Start ${isYearly ? "Yearly" : "Monthly"}`
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export default NeekoPlusPurchase;
