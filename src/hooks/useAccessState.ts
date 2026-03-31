import { useAuth } from "@/lib/auth";

export interface AccessState {
  isPremium: boolean;
  isAuthenticated: boolean;
  loading: boolean;
}

export function useAccessState(): AccessState {
  const { user, loading, isPremium } = useAuth();
  return {
    isPremium,
    isAuthenticated: !!user,
    loading,
  };
}
