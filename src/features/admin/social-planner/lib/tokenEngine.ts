/**
 * Token replacement engine.
 * Replaces [token] placeholders in hook/caption templates with real values.
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
    "[cta]":          tokens.cta ?? "See the full board at Neeko Sports Stats",
  };
  for (const [key, value] of Object.entries(map)) {
    result = result.replaceAll(key, value);
  }
  return result.trim();
}

export function gameLabel(homeTeam: string, awayTeam: string): string {
  return `${homeTeam} v ${awayTeam}`;
}

export function formatLastFive(values: number[]): string {
  return values.slice(0, 5).join(" · ");
}
