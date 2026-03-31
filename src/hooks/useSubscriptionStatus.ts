import { useAuth } from "@/lib/auth";

export type SubscriptionStatus = "active" | "trialing" | "canceled" | "past_due" | "free" | "loading";

export function useSubscriptionStatus() {
  const { user, loading, isPremium, refreshPremiumStatus } = useAuth();

  const status: SubscriptionStatus = loading
    ? "loading"
    : !user
    ? "free"
    : isPremium
    ? "active"
    : "free";

  const isActive = isPremium;

  return {
    status,
    isActive,
    isPremium,
    subscriptionData: null,
    refresh: refreshPremiumStatus,
  };
}
