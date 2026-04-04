/**
 * Normalize market action/category values to canonical backend values
 * Handles both old (TARGET/WATCH/AVOID) and new (BUY/HOLD/SELL) values
 */
export function normalizeAction(action?: string | null): "BUY" | "HOLD" | "SELL" | null {
  if (!action) return null;

  const normalized = action.toUpperCase().trim();

  // BUY / TARGET variants
  if (["BUY", "TARGET"].includes(normalized)) return "BUY";

  // HOLD / WATCH variants
  if (["HOLD", "WATCH"].includes(normalized)) return "HOLD";

  // SELL / AVOID variants
  if (["SELL", "AVOID"].includes(normalized)) return "SELL";

  return null;
}

/**
 * Check if an action matches a specific type
 */
export function isActionType(action?: string | null, type: "BUY" | "HOLD" | "SELL"): boolean {
  return normalizeAction(action) === type;
}
