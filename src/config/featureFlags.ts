/**
 * Feature Flags Configuration
 *
 * Central location for feature toggles that can be easily enabled/disabled
 */

export const FEATURE_FLAGS = {
  /**
   * Teams & Positions Pages
   *
   * When disabled: Pages remain accessible via direct URL for SEO but are hidden from UX
   * When enabled: Pages appear in navigation and internal linking
   *
   * Default: false (SEO-only mode)
   */
  TEAMS_PAGES_ENABLED: false,
  POSITIONS_PAGES_ENABLED: false,
} as const;

/**
 * Helper function to check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[feature] === true;
}
