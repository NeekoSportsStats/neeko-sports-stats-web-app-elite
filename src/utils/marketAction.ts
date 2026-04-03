/**
 * Normalize market action/category values to canonical backend values
 * Handles both old (TARGET/WATCH/AVOID) and new (BUY/HOLD/SELL) values
 */
export function normalizeAction(action?: string | null): "BUY" | "HOLD" | "SELL" | null {
  if (!action) return null;

  const normalized = action.toUpperCase().trim();

  // BUY / TARGET / STRONG_BUY variants
  if (["BUY", "TARGET", "STRONG_BUY"].includes(normalized)) return "BUY";

  // HOLD / WATCH variants
  if (["HOLD", "WATCH"].includes(normalized)) return "HOLD";

  // SELL / AVOID / STRONG_SELL variants
  if (["SELL", "AVOID", "STRONG_SELL"].includes(normalized)) return "SELL";

  return null;
}

/**
 * Check if an action matches a specific type
 */
export function isActionType(action?: string | null, type: "BUY" | "HOLD" | "SELL"): boolean {
  return normalizeAction(action) === type;
}
