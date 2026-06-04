/**
 * Token replacement engine.
 * Replaces [token] placeholders in hook/caption templates with real values.
 * Missing tokens are replaced with empty string and trailing broken phrases
 * are cleaned up so output never contains " 's", "  ", or dangling punctuation.
 */
import type { TokenMap } from "../types";

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

  // Clean up artefacts from missing tokens:
  // " 's " → "'s " (possessive with missing player name)
  result = result.replace(/ 's\b/g, "'s");
  // Multiple consecutive spaces → single space
  result = result.replace(/  +/g, " ");
  // Dangling "at ." or "for ." etc. (token was last word before punctuation)
  result = result.replace(/\b(at|for|by|of|in|to|with|and)\s*\./gi, ".");
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
