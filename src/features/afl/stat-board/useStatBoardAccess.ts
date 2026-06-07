import { useAuth } from "@/lib/auth";
import type { StatBoardMatch } from "./types";

export function useStatBoardAccess(page: "players" | "teams" | "match-centre") {
  const { isPremium, isAdmin, loading } = useAuth();
  const hasFullAccess = isPremium || isAdmin;

  if (import.meta.env.DEV) {
    console.log("[Access] stat board premium:", { isPremium, isAdmin, hasFullAccess, page });
  }

  return { hasFullAccess, isPremium, isAdmin, loading };
}

/**
 * Resolves the access mode for a single match given the current user's access level.
 *
 * - "full"    — Neeko+ or admin; everything unlocked
 * - "free"    — free user on a free match; full board visible
 * - "preview" — free user on a non-free match; top 3 visible, rows 4–8 name-only/blurred
 */
export type MatchAccessMode = "full" | "free" | "preview";

export function resolveMatchAccessMode(
  match: StatBoardMatch | null,
  hasFullAccess: boolean,
): MatchAccessMode {
  if (hasFullAccess) return "full";
  if (!match) return "free";
  if (match.is_free_match) return "free";
  return "preview";
}

/** Number of fully-visible rows per team in preview mode */
export const PREVIEW_VISIBLE_ROWS = 3;
