/**
 * copyAllStats — generates a plain-text export of all game pick stats for the
 * Admin Social Planner Game & Players tab.
 *
 * Designed for mobile Safari → ChatGPT workflow. Generates from in-memory
 * structured data, NOT DOM scraping. Includes ALL players regardless of
 * current UI filter state.
 *
 * Clipboard API is used first; a hidden-textarea fallback supports iOS Safari.
 */
import type { GamePick, GamePickPlayer } from "./gamePicksEngine";
import { adminSocialPlanner } from "@/config/disposalThresholds";

// ─── Text generation ──────────────────────────────────────────────────────────

function formatDisposalLines(picks: GamePickPlayer[]): string {
  if (picks.length === 0) return "  (no qualifying disposal picks)";

  const thresholds = adminSocialPlanner;
  const lines: string[] = [];

  for (const p of picks) {
    const header = `  ${p.player_name} (${p.team_name}) — L5: ${
      p.l5_avg !== null ? p.l5_avg.toFixed(1) : "—"
    } | Ssn: ${
      p.season_avg !== null ? p.season_avg.toFixed(1) : "—"
    } | ${p.hitRecord} (${p.hitPct}) [${p.tier}]`;

    const thresholdParts: string[] = [];
    for (const t of thresholds) {
      const entry = p.allThresholdHitRates?.[String(t)];
      if (!entry || entry.games === 0) {
        thresholdParts.push(`${t}+=—`);
        continue;
      }
      const rate = entry.rate > 1 ? entry.rate / 100 : entry.rate;
      const pct = Math.round(rate * 100);
      thresholdParts.push(`${t}+=${entry.hits}/${entry.games} (${pct}%)`);
    }

    const thresholdLine = `    Lines: ${thresholdParts.join("; ")}`;
    const selectionLine = `    selected=${p.publicContentTier !== null ? `yes (${p.publicContentTier}+ tier)` : "no"} | display_tier=${p.tier}`;

    lines.push(header, thresholdLine, selectionLine);
    if (p.adminWarnings.length > 0) {
      lines.push(`    WARN: ${p.adminWarnings.join(" | ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatGoalLines(picks: GamePickPlayer[]): string {
  if (picks.length === 0) return "  (no qualifying goal picks)";

  const lines: string[] = [];

  for (const p of picks) {
    const header = `  ${p.player_name} (${p.team_name}) — ${p.threshold}+ goals: ${p.hitRecord} (${p.hitPct}) [${p.tier}]`;
    const meta = `    L5: ${
      p.l5_avg !== null ? p.l5_avg.toFixed(1) : "—"
    } | Ssn: ${
      p.season_avg !== null ? p.season_avg.toFixed(1) : "—"
    } | selected=${p.publicContentTier !== null ? "yes" : "no"} | display_tier=${p.tier}`;

    lines.push(header, meta);
    if (p.adminWarnings.length > 0) {
      lines.push(`    WARN: ${p.adminWarnings.join(" | ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatGameBlock(game: GamePick): string {
  const sections: string[] = [
    `## ${game.match_label}`,
    `   Date: ${game.game_date} | Venue: ${game.venue} | Week: ${game.week} | Round: ${game.round}`,
    `   Teams: ${game.home_team_name} vs ${game.away_team_name}`,
    "",
    "### DISPOSALS",
    formatDisposalLines(game.disposal_picks),
    "",
    "### GOALS",
    formatGoalLines(game.goal_picks),
    "",
    "### GOALS (1+ pool)",
    formatGoalLines(game.goal_picks_1plus),
  ];

  return sections.join("\n");
}

/**
 * Builds the full plain-text export from all game picks.
 * Includes every player in every game — no UI filter state applied.
 */
export function buildCopyAllStatsText(gamePicks: GamePick[], roundLabel: string): string {
  const header = [
    "NEEKO SOCIAL PLANNER EXPORT v1",
    `Round: ${roundLabel}`,
    `Games: ${gamePicks.length}`,
    `Exported: ${new Date().toISOString()}`,
    "─".repeat(60),
  ].join("\n");

  if (gamePicks.length === 0) {
    return `${header}\n\n(no game data loaded)`;
  }

  const blocks = gamePicks.map(formatGameBlock).join("\n\n" + "─".repeat(60) + "\n\n");

  return `${header}\n\n${blocks}`;
}

// ─── Clipboard helpers ────────────────────────────────────────────────────────

/**
 * Copies text to clipboard. Tries Clipboard API first; falls back to a
 * hidden textarea execCommand approach for iOS Safari compatibility.
 *
 * Restores focus to the previously focused element after the operation.
 *
 * @returns true if copy succeeded, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  // Clipboard API — preferred, async, available in most modern browsers
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      previouslyFocused?.focus?.();
      return true;
    } catch {
      // Fall through to textarea fallback
    }
  }

  // iOS Safari textarea fallback
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
    textarea.setAttribute("readonly", "");
    document.body.appendChild(textarea);

    // iOS Safari: select range rather than setSelectionRange
    textarea.focus({ preventScroll: true });
    if (typeof textarea.setSelectionRange === "function") {
      textarea.setSelectionRange(0, text.length);
    } else {
      textarea.select();
    }

    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    previouslyFocused?.focus?.();
    return success;
  } catch {
    return false;
  }
}
