const SNAKE_REPLACEMENTS: [RegExp, string][] = [
  [/value_score/g, "value score"],
  [/projection_final/g, "projection"],
  [/form_score/g, "form"],
  [/risk_score/g, "risk"],
  [/confidence_level/g, "confidence"],
  [/recommendation_why/g, "recommendation"],
  [/summary_long/g, "analysis"],
  [/summary_short/g, "summary"],
  [/ai_summary/g, "analysis"],
  [/neeko_rating/g, "Neeko rating"],
  [/captain_rating/g, "captain rating"],
  [/breakout_probability/g, "breakout probability"],
  [/upside_rating/g, "upside"],
  [/floor_estimate/g, "floor"],
  [/ceiling_estimate/g, "ceiling"],
];

export function cleanAiText(text: string | null | undefined): string {
  if (!text) return "";

  let out = text.trim();

  for (const [pattern, replacement] of SNAKE_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }

  out = out.replace(/_/g, " ");
  out = out.replace(/\s+/g, " ").trim();
  out = out.replace(/^./, (c) => c.toUpperCase());

  return out;
}

export function truncateSmart(text: string, maxLength = 140): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;

  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "...";
}
