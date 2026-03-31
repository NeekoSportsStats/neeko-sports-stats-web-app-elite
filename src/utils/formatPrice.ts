/**
 * Format fantasy price values consistently across the app
 *
 * Rules:
 * - >= 1,000,000 → 1.126M (3 decimal places)
 * - < 1,000,000 → 853K (no decimals)
 * - null/undefined → "-"
 *
 * @param value - Price value in dollars (e.g., 1126000)
 * @returns Formatted price string (e.g., "1.126M" or "853K")
 */
export function formatPrice(value: number | null | undefined): string {
  if (!value || value === 0) return "-";

  if (value >= 1_000_000) {
    // Format with 3 decimal places for millions
    return `${(value / 1_000_000).toFixed(3)}M`;
  }

  // Format as thousands (no decimals)
  return `${Math.floor(value / 1000)}K`;
}

/**
 * Format price change values (can be negative)
 *
 * @param value - Price change value
 * @returns Formatted price change with +/- sign
 */
export function formatPriceChange(value: number | null | undefined): string {
  if (!value || value === 0) return "-";

  const formatted = formatPrice(Math.abs(value));
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}
