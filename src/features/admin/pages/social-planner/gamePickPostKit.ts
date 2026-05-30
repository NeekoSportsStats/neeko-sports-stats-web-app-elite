/**
 * Game Pick Post Kit — converts a GamePick into exactly 3 SocialPost objects.
 * Admin-only. No public exposure. No betting language.
 *
 * Per-game structure (always exactly 3 posts):
 *   Post 1 — Disposal Watch (strict 20+ OR Mixed Disposal Watch if thin pool)
 *   Post 2 — 1+ Goals       (strict 1+ tier)
 *   Post 3 — Full Game Picks (combined best-line disposal + goal picks)
 *
 * Part 6 fix: If fewer than 4 true 20+ players, fill with 25+/30+ players
 *   and rename post to "Disposal Watch" / "Mixed Disposal Watch".
 *   Each player keeps their true threshold.
 *
 * Part 8 fix: All generated fields use the exact same selected player array.
 *   ${picks.length}-player grid, never hardcoded "5-player".
 *
 * Part 9 fix: AI carousel prompts generate the full carousel structure:
 *   SLIDE 1 COVER + one slide per player + FINAL CTA + GLOBAL STYLE.
 *   Player slides use each player's true threshold, not the post-level label.
 */
import type { GamePick, GamePickPlayer } from "./gamePicksEngine";
import type { SocialPost, DayOfWeek } from "./types";
import { enrichPost } from "./postEnrichment";
import type { StatBoardMatch } from "@/features/afl/stat-board/types";

// ─── Kit type ─────────────────────────────────────────────────────────────────

export type GamePickKitType = "disposals" | "goals" | "combined";

export interface GamePickPostKit {
  kitType: GamePickKitType;
  post: SocialPost;
  pickCount: number;
}

export interface GamePickMarketingPack {
  game: GamePick;
  bestAngle: string;
  bestAngleReason: string;
  /** Always exactly 3 kits: [disposals, goals, combined] */
  kits: GamePickPostKit[];
  skipReason: string | null;
}

// ─── ID helper ────────────────────────────────────────────────────────────────

function kitId(matchId: number, type: GamePickKitType): string {
  return `gp-kit-${matchId}-${type}`;
}

// ─── Stat formatters ──────────────────────────────────────────────────────────

/** Public line: "Jack Sinclair — 9/10 (90%) at 25+, L5 avg 27.8" */
function formatPickLineShort(p: GamePickPlayer): string {
  const hasRecord = p.hitRecord !== "—";
  const record = hasRecord
    ? `${p.hitRecord} (${Math.round(p.hitRate * 100)}%) at ${p.threshold}+`
    : `${p.threshold}+`;
  const l5 = p.l5_avg !== null ? `, L5 avg ${p.l5_avg.toFixed(1)}` : "";
  return `${p.player_name} — ${record}${l5}`;
}

/** Expanded line including Last 5 strip */
function formatPickLine(p: GamePickPlayer): string {
  const record = p.hitRecord !== "—" ? `${p.hitRecord} at ${p.threshold}+` : `${p.threshold}+`;
  const l5 = p.l5_avg !== null ? `, L5 avg ${p.l5_avg.toFixed(1)}` : "";
  const l5strip = p.last_5_strip ? `, Last 5: ${p.last_5_strip}` : "";
  return `${p.player_name} — ${record}${l5}${l5strip}`;
}

/** Image prompt line including team and Last 5 */
function formatPickLineForImagePrompt(p: GamePickPlayer): string {
  const record = p.hitRecord !== "—" ? `${p.hitRecord} at ${p.threshold}+` : `${p.threshold}+`;
  const l5 = p.l5_avg !== null ? `, L5 avg ${p.l5_avg.toFixed(1)}` : "";
  const strip = p.last_5_strip ? ` | Last 5: ${p.last_5_strip}` : "";
  return `${p.player_name} (${p.team_name}): ${record}${l5}${strip}`;
}

// ─── Hashtag helper ───────────────────────────────────────────────────────────

export function gamePickHashtags(kitType: GamePickKitType, gameDate: string): string[] {
  const base = ["#AFL", "#AFLStats", "#NeekoSportsStats"];
  const day = new Date(gameDate).getDay();
  const dayTag =
    day === 4 ? "#ThursdayFooty" :
    day === 5 ? "#FridayFooty" :
    day === 6 ? "#SaturdayFooty" :
    day === 0 ? "#SundayFooty" : null;

  if (kitType === "disposals") {
    const tags = [...base, "#Disposals", "#PlayerStats"];
    if (dayTag) tags.push(dayTag);
    return tags;
  }
  if (kitType === "goals") {
    const tags = [...base, "#AFLGoals", "#FootyStats"];
    if (dayTag) tags.push(dayTag);
    return tags;
  }
  const tags = [...base, "#FootyStats", "#PlayerStats"];
  if (dayTag) tags.push(dayTag);
  return tags;
}

// ─── Day helpers ──────────────────────────────────────────────────────────────

const DOW_ABBREV: DayOfWeek[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function gameDayAbbrev(gameDate: string): DayOfWeek {
  return DOW_ABBREV[new Date(gameDate).getDay()];
}

function gameDayLabel(gameDate: string): string {
  return DOW_FULL[new Date(gameDate).getDay()] ?? "Game day";
}

// ─── Caption builder ──────────────────────────────────────────────────────────

const SIGN_OFFS = [
  "See the data. Make your own call.",
  "Stats over gut feel.",
  "Numbers over guesswork.",
  "Player form laid out clearly.",
  "Full board at Neeko Sports Stats.",
];

function signOff(idx: number): string {
  return SIGN_OFFS[idx % SIGN_OFFS.length];
}

function buildPickCaption(hook: string, bullets: string[], signOffIdx = 0): string {
  return [hook, "", ...bullets.map(b => `• ${b}`), "", signOff(signOffIdx)].join("\n");
}

// ─── Disposal post label helper ───────────────────────────────────────────────

/**
 * Determines the disposal post label based on which tiers are present.
 * Returns: { title, thresholdLabel, isMixed, contentNote }
 */
function resolveDisposalPostLabel(
  matchLabel: string,
  picks: GamePickPlayer[],
): { title: string; thresholdLabel: string; isMixed: boolean; contentNote: string } {
  if (picks.length === 0) {
    return {
      title: `${matchLabel} — disposal watch`,
      thresholdLabel: "Disposal Watch",
      isMixed: false,
      contentNote: "No qualifying disposal candidates.",
    };
  }

  const tiers = new Set(picks.map(p => p.publicContentTier ?? p.threshold));
  const has20Only = picks.every(p => (p.publicContentTier ?? p.threshold) === 20);

  if (has20Only && picks.length >= 3) {
    return {
      title: `${matchLabel} — 20+ disposals`,
      thresholdLabel: "20+ Disposals",
      isMixed: false,
      contentNote: "20+ disposal form watch.",
    };
  }

  // Mixed: title becomes "disposal watch"
  const tierList = [...tiers].sort((a, b) => (b ?? 0) - (a ?? 0)).filter(Boolean);
  const tierDesc = tierList.map(t => `${t}+`).join("/");
  return {
    title: `${matchLabel} — disposal watch`,
    thresholdLabel: "Mixed Disposal Watch",
    isMixed: true,
    contentNote: `Disposal watch across ${tierDesc} profiles.`,
  };
}

// ─── Post 1: Disposal Watch (20+ strict OR Mixed) ────────────────────────────

/**
 * Builds the disposal post for a game.
 *
 * Strict: only genuine 20-tier players (not 25+/30+) if 4+ available.
 * Mixed: if fewer than 4 true 20+, fill from 25+/30+ tier until 4–5 players.
 * Only add 15+ as last resort if still below 4 after adding higher tiers.
 * Renames post to "Disposal Watch" / "Mixed Disposal Watch" when mixed.
 * Each player keeps their true threshold (Part 6).
 */
function buildDisposalPost(
  game: GamePick,
  allDispPicks: GamePickPlayer[],
  matches: StatBoardMatch[],
): GamePickPostKit {
  const matchLabel = game.match_label;
  const dayLabel = gameDayLabel(game.game_date);

  // Try strict 20+ first
  const strict20 = allDispPicks.filter(p => p.publicContentTier === 20);
  const higher = allDispPicks.filter(p => p.publicContentTier === 25 || p.publicContentTier === 30);
  const lower15 = allDispPicks.filter(p => p.publicContentTier === 15);

  let picks: GamePickPlayer[];
  let isMixed = false;

  if (strict20.length >= 4) {
    // Enough strict 20+ players
    picks = strict20.slice(0, 5);
    isMixed = false;
  } else {
    // Fill from higher tiers
    picks = [...strict20];
    for (const p of higher) {
      if (picks.length >= 5) break;
      picks.push(p);
    }
    isMixed = picks.some(p => (p.publicContentTier ?? 0) !== 20);

    // Last resort: add 15+ if still fewer than 4
    if (picks.length < 4) {
      for (const p of lower15) {
        if (picks.length >= 4) break;
        picks.push(p);
      }
      if (picks.some(p => (p.publicContentTier ?? 0) === 15)) isMixed = true;
    }
    picks = picks.slice(0, 5);
  }

  const hasEnough = picks.length >= 2;
  const hasHighTier = picks.some(p => p.tier === "High");
  const { title, thresholdLabel, contentNote } = resolveDisposalPostLabel(matchLabel, picks);

  const bullets = picks.map(formatPickLineShort);
  const statsShown = picks.map(formatPickLine);
  const playerNames = picks.map(p => p.player_name);
  const teamNames = [...new Set(picks.map(p => p.team_name))];
  const n = picks.length;

  // Hook uses "disposal watch" for mixed posts, "20+ disposals" for strict
  const hook = isMixed
    ? `${matchLabel} disposal watch — ${dayLabel}.`
    : `${matchLabel} — 20+ disposal form — ${dayLabel}.`;

  const caption = picks.length > 0
    ? buildPickCaption(hook, bullets, 0)
    : `${hook}\n\nInsufficient disposal candidates for this game.`;

  const hookOptions = [
    hook,
    isMixed
      ? `Disposal trends for ${matchLabel} — mixed threshold profiles.`
      : `20+ disposal form for ${matchLabel}.`,
    `${matchLabel} — disposal trends before bounce.`,
    `Before bounce — ${n} players with strong disposal form for ${matchLabel}.`,
    `Recent-form data — ${matchLabel} ${isMixed ? "disposal watch" : "20+ disposal watch"}.`,
  ];

  // Image description uses exact player count (Part 8)
  const suggestedVisual = n > 0
    ? `${n}-player stat grid — name, team, ${isMixed ? "true" : "20+"} disposal record, L5 avg, Last 5 strip. Dark. Neeko brand.`
    : "Placeholder card — insufficient disposal candidates.";

  const imageDescription = n > 0
    ? `Create a dark premium AFL stat graphic for ${matchLabel} focused on ${isMixed ? "disposal trends" : "20+ disposals"}. ` +
      `Show ${n} player cards: ${picks.slice(0, n).map(formatPickLineForImagePrompt).join("; ")}. ` +
      `Each player's true disposal threshold shown. Use team colour accents. Neeko Sports Stats branding. No betting language.`
    : `Placeholder dark AFL graphic — no strong disposal candidates for ${matchLabel}. Show team names only.`;

  const onScreenText = n > 0
    ? `${matchLabel}\n${picks.slice(0, 3).map(p => `${p.player_name} ${p.hitRecord} at ${p.threshold}+`).join("\n")}`
    : `${matchLabel}\nDisposal Watch`;

  const fallbackWarning = !hasEnough
    ? `Not enough disposal candidates for this game (${n} found). Mark as Needs Review.`
    : isMixed && picks.some(p => p.tier === "Low") ? "Some Low-tier candidates included. Review before publishing." :
      isMixed ? null : picks.some(p => p.tier === "Low") ? "Some Low-tier candidates included. Review before publishing." : null;

  const rawPost = {
    id: kitId(game.match_id, "disposals"),
    day: gameDayAbbrev(game.game_date),
    postNumber: 1 as const,
    postTime: `${dayLabel} — pre-game`,
    type: "Carousel" as const,
    category: "Disposal Trend" as const,
    intent: "pre_game" as const,
    statLens: "disposals" as const,
    confidence: hasHighTier ? "High" as const : picks.length >= 2 ? "Medium" as const : "Fallback" as const,
    title,
    content: hook,
    statsShown,
    onScreenText,
    caption,
    hashtags: gamePickHashtags("disposals", game.game_date),
    suggestedVisual,
    imageDescription,
    dataScope: `${matchLabel} disposal pool (${isMixed ? "mixed" : "20+"} tier)`,
    targetGame: matchLabel,
    targetGameStatus: "upcoming" as const,
    fallbackWarning,
    playerNames,
    teamNames,
    thresholdLabel,
    isBackup: false,
    tone: "clean_stats" as const,
    hookOptions,
    isMixedDisposalWatch: isMixed,
    playerThresholds: Object.fromEntries(picks.map(p => [p.player_name, p.threshold])),
  };

  const enriched = enrichPost(rawPost as SocialPost, matches);
  return { kitType: "disposals", post: enriched, pickCount: n };
}

// ─── Post 2: 1+ Goals ────────────────────────────────────────────────────────

function build1PlusGoalsPost(
  game: GamePick,
  allGoalPicks: GamePickPlayer[],
  matches: StatBoardMatch[],
): GamePickPostKit {
  const matchLabel = game.match_label;
  const dayLabel = gameDayLabel(game.game_date);

  const picks = allGoalPicks
    .filter(p => p.threshold === 1)
    .slice(0, 5);

  const hasEnough = picks.length >= 2;
  const hasHighTier = picks.some(p => p.tier === "High");
  const n = picks.length;

  const bullets = picks.map(formatPickLineShort);
  const statsShown = picks.map(formatPickLine);

  const title = `${matchLabel} — 1+ goals`;
  const hook = `${matchLabel} goal form watch — ${dayLabel}.`;
  const caption = n > 0
    ? buildPickCaption(hook, bullets, 1)
    : `${hook}\n\nInsufficient 1+ goal candidates for this game.`;

  const hookOptions = [
    hook,
    `1+ goal form data for ${matchLabel}.`,
    `${matchLabel} — goal trends before bounce.`,
    `Before bounce — ${n} players with 1+ goal form for ${matchLabel}.`,
    `Recent-form data — ${matchLabel} goal watch.`,
  ];

  const suggestedVisual = n > 0
    ? `${n}-player goal form grid — name, team, 1+ goal record, L5 avg, Last 5 strip. Dark. Neeko brand.`
    : "Placeholder card — insufficient 1+ goal candidates.";

  const imageDescription = n > 0
    ? `Create a dark premium AFL stat graphic for ${matchLabel} focused on 1+ goals. ` +
      `Show ${n} player cards: ${picks.map(formatPickLineForImagePrompt).join("; ")}. ` +
      `Use team colour accents. Neeko Sports Stats branding. No betting language.`
    : `Placeholder dark AFL graphic — no strong 1+ goal candidates for ${matchLabel}. Show team names only.`;

  const onScreenText = n > 0
    ? `${matchLabel}\n${picks.slice(0, 3).map(p => `${p.player_name} ${p.hitRecord} at ${p.threshold}+ goals`).join("\n")}`
    : `${matchLabel}\n1+ Goals Watch`;

  const fallbackWarning = !hasEnough
    ? `Not enough genuine 1+ tier candidates for this game (${n} found). Mark as Needs Review.`
    : picks.some(p => p.tier === "Low") ? "Some Low-tier candidates included. Review before publishing." : null;

  const rawPost = {
    id: kitId(game.match_id, "goals"),
    day: gameDayAbbrev(game.game_date),
    postNumber: 2 as const,
    postTime: `${dayLabel} — pre-game`,
    type: "Carousel" as const,
    category: "Goal Trend" as const,
    intent: "pre_game" as const,
    statLens: "goals" as const,
    confidence: hasHighTier ? "High" as const : n >= 2 ? "Medium" as const : "Fallback" as const,
    title,
    content: hook,
    statsShown,
    onScreenText,
    caption,
    hashtags: gamePickHashtags("goals", game.game_date),
    suggestedVisual,
    imageDescription,
    dataScope: `${matchLabel} goal pool (1+ tier)`,
    targetGame: matchLabel,
    targetGameStatus: "upcoming" as const,
    fallbackWarning,
    playerNames: picks.map(p => p.player_name),
    teamNames: [...new Set(picks.map(p => p.team_name))],
    thresholdLabel: "1+ Goals",
    isBackup: false,
    tone: "clean_stats" as const,
    hookOptions,
  };

  const enriched = enrichPost(rawPost as SocialPost, matches);
  return { kitType: "goals", post: enriched, pickCount: n };
}

// ─── Post 3: Full Game Picks (combined mixed-threshold) ───────────────────────

function buildFullGamePicksPost(
  game: GamePick,
  allDispPicks: GamePickPlayer[],
  allGoalPicks: GamePickPlayer[],
  matches: StatBoardMatch[],
): GamePickPostKit {
  const matchLabel = game.match_label;
  const dayLabel = gameDayLabel(game.game_date);

  const dispCandidates = allDispPicks.slice(0, 5);
  const goalCandidates = allGoalPicks.slice(0, 5);

  let dSlice: GamePickPlayer[];
  let gSlice: GamePickPlayer[];

  if (dispCandidates.length >= 4 && goalCandidates.length >= 4) {
    dSlice = dispCandidates.slice(0, 4);
    gSlice = goalCandidates.slice(0, 4);
  } else if (dispCandidates.length >= 4 && goalCandidates.length < 4) {
    gSlice = goalCandidates.slice(0, Math.max(2, goalCandidates.length));
    const dMax = Math.min(5, 8 - gSlice.length);
    dSlice = dispCandidates.slice(0, dMax);
  } else if (goalCandidates.length >= 4 && dispCandidates.length < 4) {
    dSlice = dispCandidates.slice(0, Math.max(2, dispCandidates.length));
    const gMax = Math.min(5, 8 - dSlice.length);
    gSlice = goalCandidates.slice(0, gMax);
  } else {
    dSlice = dispCandidates.slice(0, Math.min(dispCandidates.length, 4));
    gSlice = goalCandidates.slice(0, Math.min(goalCandidates.length, 4));
  }

  const allPicks = [...dSlice, ...gSlice];
  const n = allPicks.length;

  const hasEnough = dSlice.length >= 2 && gSlice.length >= 2;
  const hasHighTier = allPicks.some(p => p.tier === "High");

  const dispBullets = dSlice.map(formatPickLineShort);
  const goalBullets = gSlice.map(formatPickLineShort);
  const statsShown = allPicks.map(formatPickLine);

  const hook = `${matchLabel} — stat watch before bounce.`;
  const caption = [
    hook, "",
    "Disposals:",
    ...dispBullets.map(b => `• ${b}`),
    "",
    "Goals:",
    ...goalBullets.map(b => `• ${b}`),
    "",
    signOff(2),
  ].join("\n");

  const title = `${matchLabel} — full game picks`;

  const hookOptions = [
    hook,
    `${matchLabel} — disposals and goals to watch ${dayLabel.toLowerCase()}.`,
    `Both disposal and goal form data before bounce for ${matchLabel}.`,
    `${n} player trends across disposals and goals — ${matchLabel}.`,
    `Before bounce — ${matchLabel} stat watch.`,
  ];

  // Part 8: use exact player count in visual
  const suggestedVisual = n > 0
    ? `Split stat grid for ${matchLabel} — left: ${dSlice.length} disposal picks, right: ${gSlice.length} goal picks. Dark. Neeko brand.`
    : "Placeholder card — insufficient combined candidates.";

  // Part 8: list all players in image description
  const imageDescription = n > 0
    ? `Create a dark premium AFL stat-board graphic for ${matchLabel}. ` +
      `Split into two sections: Disposals (${dSlice.length} players) and Goals (${gSlice.length} players). ` +
      `Disposals: ${dSlice.map(formatPickLineForImagePrompt).join("; ")}. ` +
      `Goals: ${gSlice.map(formatPickLineForImagePrompt).join("; ")}. ` +
      `Use green for High confidence, gold for Medium. Each player shows their true disposal threshold. Neeko Sports Stats branding. No betting language.`
    : `Placeholder dark AFL graphic — insufficient combined candidates for ${matchLabel}. Show team names only.`;

  const onScreenText = n > 0
    ? `${matchLabel}\nDisposals: ${dSlice.map(p => p.player_name).join(", ")}\nGoals: ${gSlice.map(p => p.player_name).join(", ")}`
    : `${matchLabel}\nFull Game Picks`;

  const fallbackWarning = !hasEnough
    ? `Thin combined pool — ${dSlice.length} disposal picks, ${gSlice.length} goal picks. Review before publishing.`
    : n < 6 ? `Smaller than ideal combined pool (${n} players). Normal if game has limited qualifying candidates.` : null;

  const rawPost = {
    id: kitId(game.match_id, "combined"),
    day: gameDayAbbrev(game.game_date),
    postNumber: 3 as const,
    postTime: `${dayLabel} — pre-game`,
    type: "Carousel" as const,
    category: "Round Preview" as const,
    intent: "pre_game" as const,
    statLens: "disposals" as const,
    confidence: hasHighTier ? "High" as const : n >= 4 ? "Medium" as const : "Fallback" as const,
    title,
    content: hook,
    statsShown,
    onScreenText,
    caption,
    hashtags: gamePickHashtags("combined", game.game_date),
    suggestedVisual,
    imageDescription,
    dataScope: `${matchLabel} combined disposal + goal pool`,
    targetGame: matchLabel,
    targetGameStatus: "upcoming" as const,
    fallbackWarning,
    playerNames: allPicks.map(p => p.player_name),
    teamNames: [...new Set(allPicks.map(p => p.team_name))],
    thresholdLabel: "Full Game Picks",
    isBackup: false,
    tone: "clean_stats" as const,
    hookOptions,
  };

  const enriched = enrichPost(rawPost as SocialPost, matches);
  return { kitType: "combined", post: enriched, pickCount: n };
}

// ─── Best angle calculator ────────────────────────────────────────────────────

function calcBestAngle(
  dispPicks: GamePickPlayer[],
  goalPicks: GamePickPlayer[],
): { angle: string; reason: string } {
  const highDisp = dispPicks.filter(p => p.tier === "High").length;
  const highGoal = goalPicks.filter(p => p.tier === "High").length;
  const totalDisp = dispPicks.length;
  const totalGoal = goalPicks.length;

  if (totalDisp === 0 && totalGoal === 0) {
    return { angle: "Limited data", reason: "No qualifying candidates found for this game." };
  }

  const dispScore = totalDisp * 2 + highDisp * 3;
  const goalScore = totalGoal * 2 + highGoal * 3;
  const hasBothKits = totalDisp >= 2 && totalGoal >= 2;

  if (hasBothKits && dispScore + goalScore >= 10) {
    return {
      angle: "Mixed Stat Watch",
      reason: `${totalDisp} disposal candidates (${highDisp} High), ${totalGoal} goal candidates (${highGoal} High).`,
    };
  }

  if (dispScore >= goalScore && totalDisp >= 2) {
    const topDispThr = dispPicks[0]?.publicContentTier ?? dispPicks[0]?.threshold ?? 20;
    return {
      angle: `${topDispThr}+ Disposal Watch`,
      reason: `${totalDisp} disposal candidates (${highDisp} High). Disposal pool is the stronger angle.`,
    };
  }

  if (totalGoal >= 2) {
    const topGoalThr = goalPicks[0]?.threshold ?? 1;
    return {
      angle: `${topGoalThr}+ Goal Form Watch`,
      reason: `${totalGoal} goal candidates (${highGoal} High). Goal pool is the stronger angle.`,
    };
  }

  return {
    angle: "Weak — small candidate pool",
    reason: `Only ${totalDisp} disposal and ${totalGoal} goal candidates. Posts may need review.`,
  };
}

// ─── Main pack builder ────────────────────────────────────────────────────────

export function buildGamePickMarketingPack(
  game: GamePick,
  matches: StatBoardMatch[],
): GamePickMarketingPack {
  const dispPicks = game.disposal_picks;
  const goalPicks = game.goal_picks;

  const { angle, reason } = calcBestAngle(
    dispPicks.filter(p => p.tier === "High" || p.tier === "Medium"),
    goalPicks.filter(p => p.tier === "High" || p.tier === "Medium"),
  );

  const kits: GamePickPostKit[] = [
    buildDisposalPost(game, dispPicks, matches),
    build1PlusGoalsPost(game, goalPicks, matches),
    buildFullGamePicksPost(game, dispPicks, goalPicks, matches),
  ];

  return { game, bestAngle: angle, bestAngleReason: reason, kits, skipReason: null };
}

export function buildAllGamePickMarketingPacks(
  gamePicks: GamePick[],
  matches: StatBoardMatch[],
): GamePickMarketingPack[] {
  return gamePicks.map(g => buildGamePickMarketingPack(g, matches));
}
