/**
 * Safety rules — scans post copy for banned gambling/betting language.
 */

export const BANNED_WORDS = [
  "bet", "bets", "betting",
  "odds",
  "banker",
  "lock",
  "line", "clearing the line",
  "multi",
  "best bet",
  "value bet",
  "overs", "unders",
  "bookie", "bookmaker",
  "punt", "punting",
  "wager",
  "tipster",
  "picks", "pick",
  "tip", "tips",
  "back", "backing",
  "gamble", "gambling",
  "flush",
];

export const CAUTION_WORDS: string[] = [];

export const PAGE_NUMBER_PATTERNS = [
  /slide \d+ of \d+/i,
  /\b\d+\/\d+\b(?= slides)/i,
  /page \d+/i,
  /\b\d+ of \d+\b/i,
];

export interface SafetyFlag {
  word: string;
  type: "banned" | "caution" | "page_number";
  suggestion?: string;
};

export interface SafetyResult {
  isSafe: boolean;
  flags: SafetyFlag[];
  summary: string;
}

export function checkSafety(text: string): SafetyResult {
  const flags: SafetyFlag[] = [];

  for (const word of BANNED_WORDS) {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (regex.test(text)) {
      flags.push({ word, type: "banned" });
    }
  }

  for (const word of CAUTION_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    if (regex.test(text)) {
      flags.push({
        word,
        type: "caution",
        suggestion: "Use: Match Stat Board, Player Form, Form Watch, Stat Watch",
      });
    }
  }

  for (const pattern of PAGE_NUMBER_PATTERNS) {
    if (pattern.test(text.toLowerCase())) {
      flags.push({
        word: "page number pattern",
        type: "page_number",
        suggestion: "Remove page/slide numbers from all generated content",
      });
    }
  }

  const isSafe = flags.length === 0;
  const bannedCount = flags.filter(f => f.type === "banned").length;
  const cautionCount = flags.filter(f => f.type === "caution").length;

  let summary = "Clean";
  if (bannedCount > 0) summary = `${bannedCount} banned word${bannedCount > 1 ? "s" : ""} found`;
  else if (cautionCount > 0) summary = `${cautionCount} caution word${cautionCount > 1 ? "s" : ""} found`;

  return { isSafe, flags, summary };
}

export function checkPostSafety(fields: Record<string, string>): {
  fieldResults: Record<string, SafetyResult>;
  overallSafe: boolean;
  totalFlags: number;
} {
  const fieldResults: Record<string, SafetyResult> = {};
  let totalFlags = 0;

  for (const [field, text] of Object.entries(fields)) {
    const result = checkSafety(text);
    fieldResults[field] = result;
    totalFlags += result.flags.length;
  }

  return {
    fieldResults,
    overallSafe: totalFlags === 0,
    totalFlags,
  };
}
