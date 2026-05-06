import { useAuth } from "@/lib/auth";

export function useStatBoardAccess(page: "players" | "teams") {
  const { isPremium, isAdmin, loading } = useAuth();
  const hasFullAccess = isPremium || isAdmin;

  if (import.meta.env.DEV) {
    console.log("[Access] stat board premium:", { isPremium, isAdmin, hasFullAccess, page });
  }

  return { hasFullAccess, isPremium, isAdmin, loading };
}
