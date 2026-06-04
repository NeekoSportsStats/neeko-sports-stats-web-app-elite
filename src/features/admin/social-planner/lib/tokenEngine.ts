/**
 * Token replacement engine.
 * Replaces [token] placeholders in hook/caption templates with real values.
 * Missing tokens are replaced with empty string and trailing broken phrases
 * are cleaned up so output never contains " 's", "  ", or dangling punctuation.
 */
import type { TokenMap } from "../types";

/** Returns true if any [token] placeholder remains unresolved in the text. */
export function hasUnresolvedTokens(text: string): boolean {
  return /\[[a-zA-Z0-9_]+\]/.test(text);
}

/** Returns true if the text has a broken possessive from a missing player token. */
export function hasBrokenPossessive(text: string): boolean {
  return /\bat\s+'s|look\s+at\s+'s|:\s*\./i.test(text);
}

/**
 * Returns the set of token keys (e.g. "player", "team") required by a template.
 * Used by smart template selection to filter out templates needing unavailable data.
 */
export function getRequiredTokens(template: string): Set<string> {
  const found = new Set<string>();
  const matches = template.matchAll(/\[([a-zA-Z0-9_]+)\]/g);
  for (const m of matches) {
    found.add(m[1]);
  }
  return found;
}

/** CTA variants — rotated per post. */
export const CTA_VARIANTS = [
  "See the full board at neekostatistics.com.au",
  "Full board at neekostatistics.com.au",
  "The complete board lives at neekostatistics.com.au",
  "Find the full stat board at neekostatistics.com.au",
  "More data inside — neekostatistics.com.au",
];

let _ctaIndex = 0;

/** Returns the next CTA variant in rotation. */
export function nextCta(): string {
  const cta = CTA_VARIANTS[_ctaIndex % CTA_VARIANTS.length];
  _ctaIndex++;
  return cta;
}

/** Resets the CTA rotation counter (call at the start of each week's generation). */
export function resetCtaRotation(): void {
  _ctaIndex = 0;
}

export function replaceTokens(template: string, tokens: TokenMap): string {
  let result = template;
  const map: Record<string, string> = {
    "[round]":        String(tokens.round ?? ""),
    "[game]":         tokens.game ?? "",
    "[homeTeam]":     tokens.homeTeam ?? "",
    "[awayTeam]":     tokens.awayTeam ?? "",
    "[player]":       tokens.player ?? "",
    "[team]":         tokens.team ?? "",
    "[record]":       tokens.record ?? "",
    "[threshold]":    tokens.threshold ?? "",
    "[l5Avg]":        String(tokens.l5Avg ?? ""),
    "[lastFive]":     tokens.lastFive ?? "",
    "[statType]":     tokens.statType ?? "",
    "[contentTitle]": tokens.contentTitle ?? "",
    "[cta]":          tokens.cta ?? "See the full board at neekostatistics.com.au",
  };
  for (const [key, value] of Object.entries(map)) {
    result = result.replaceAll(key, value);
  }

  // Strip any remaining unresolved [token] placeholders
  result = result.replace(/\[[^\]]+\]/g, "");

  // Clean up artefacts from missing tokens:
  // " 's " → "'s " (possessive with missing player name)
  result = result.replace(/ 's\b/g, "'s");
  // Multiple consecutive spaces → single space
  result = result.replace(/  +/g, " ");
  // Dangling "at ." or "for ." etc. (token was last word before punctuation)
  result = result.replace(/\b(at|for|by|of|in|to|with|and)\s*\./gi, ".");
  // Dangling "·" or "-" with surrounding spaces from empty token slots
  result = result.replace(/\s+[·\-]\s+[·\-]\s+/g, " · ");
  result = result.replace(/\s{2,}/g, " ");
  // Lines that are entirely whitespace after replacement
  result = result.split("\n").map(l => l.trim()).filter(Boolean).join("\n");

  return result.trim();
}

export function gameLabel(homeTeam: string, awayTeam: string): string {
  return `${homeTeam} v ${awayTeam}`;
}

export function formatLastFive(values: number[]): string {
  return values.slice(0, 5).join(" · ");
}
