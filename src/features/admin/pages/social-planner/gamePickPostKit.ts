/**
 * Game Pick Post Kit — converts a GamePick into exactly 3 SocialPost objects.
 * Admin-only. No public exposure. No betting language.
 *
 * Per-game structure (always exactly 3 posts):
 *   Post 1 — 20+ Disposals   (players from that game only, 20+ threshold)
 *   Post 2 — 1+ Goals        (players from that game only, 1+ threshold)
 *   Post 3 — Full Game Picks (combined best-line disposal + goal picks)
 *
 * If a post has insufficient quality candidates, it is generated with a
 * fallbackWarning so the planner shows it as "Needs Review" rather than hiding it.
 *
 * All enrichment (voiceover, carousel, AI prompt, platform captions, compliance,
 * quality score) is delegated to the shared enrichPost() helper from postEnrichment.ts.
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
  /** Best social angle label */
  bestAngle: string;
  /** Reason for the best angle selection */
  bestAngleReason: string;
  /** Always exactly 3 kits: [disposals, goals, combined] */
  kits: GamePickPostKit[];
  /** null — we always generate all 3 posts; use fallbackWarning on individual kits instead */
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
  // Combined
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

// ─── Post 1: 20+ Disposals ───────────────────────────────────────────────────

/**
 * Builds the 20+ Disposals post for a game.
 *
 * Uses players whose publicContentTier is 20 (i.e. they genuinely qualify at 20+
 * but not at 25+/30+). If this pool is thin, falls back to any 20+ qualifier and
 * sets a fallbackWarning.
 *
 * All players must be from the two teams in this game.
 */
function build20PlusDisposalsPost(
  game: GamePick,
  allDispPicks: GamePickPlayer[],
  matches: StatBoardMatch[],
): GamePickPostKit {
  const matchLabel = game.match_label;
  const dayLabel = gameDayLabel(game.game_date);

  // Strict: only genuine 20-tier players (not 25+/30+)
  const picks = allDispPicks
    .filter(p => p.publicContentTier === 20)
    .slice(0, 5);

  const hasEnough = picks.length >= 2;
  const hasHighTier = picks.some(p => p.tier === "High");

  const bullets = picks.map(formatPickLineShort);
  const statsShown = picks.map(formatPickLine);

  const title = `${matchLabel} — 20+ disposals`;
  const hook = `${matchLabel} disposal watch — ${dayLabel}.`;
  const caption = picks.length > 0
    ? buildPickCaption(hook, bullets, 0)
    : `${hook}\n\nInsufficient 20+ disposal candidates for this game.`;

  const hookOptions = [
    hook,
    `20+ disposal form for ${matchLabel}.`,
    `${matchLabel} — disposal trends before bounce.`,
    `Before bounce — ${picks.length} players with 20+ disposal form for ${matchLabel}.`,
    `Recent-form data — ${matchLabel} 20+ disposal watch.`,
  ];

  const suggestedVisual = picks.length > 0
    ? `${picks.length}-player stat grid — name, team, 20+ record, L5 avg, Last 5 strip. Dark. Neeko brand.`
    : "Placeholder card — insufficient 20+ disposal candidates.";

  const imageDescription = picks.length > 0
    ? `Create a dark premium AFL stat graphic for ${matchLabel} focused on 20+ disposals. ` +
      `Show ${picks.length} player cards: ${picks.slice(0, 4).map(formatPickLineForImagePrompt).join("; ")}. ` +
      `Use team colour accents. Neeko Sports Stats branding. No betting language.`
    : `Placeholder dark AFL graphic — no strong 20+ disposal candidates for ${matchLabel}. Show team names only.`;

  const onScreenText = picks.length > 0
    ? `${matchLabel}\n${picks.slice(0, 3).map(p => `${p.player_name} ${p.hitRecord} at ${p.threshold}+`).join("\n")}`
    : `${matchLabel}\n20+ Disposals Watch`;

  const fallbackWarning = !hasEnough
    ? `Not enough genuine 20+ tier candidates for this game (${picks.length} found — strict tier only, no 25+/30+ players). Mark as Needs Review.`
    : picks.some(p => p.tier === "Low") ? "Some Low-tier candidates included. Review before publishing." : null;

  const rawPost: Omit<SocialPost, "compliance" | "quality" | "timing" | "ctaLine" | "platformCaptions" | "voiceoverScript" | "carouselSlides" | "hookOptions" | "thumbnailOptions" | "aiImagePrompt" | "aiCarouselPromptPack" | "angle"> = {
    id: kitId(game.match_id, "disposals"),
    day: gameDayAbbrev(game.game_date),
    postNumber: 1,
    postTime: `${dayLabel} — pre-game`,
    type: "Carousel",
    category: "Disposal Trend",
    intent: "pre_game",
    statLens: "disposals",
    confidence: hasHighTier ? "High" : picks.length >= 2 ? "Medium" : "Low",
    title,
    content: hook,
    statsShown,
    onScreenText,
    caption,
    hashtags: gamePickHashtags("disposals", game.game_date),
    suggestedVisual,
    imageDescription,
    dataScope: `${matchLabel} disposal pool (20+ tier)`,
    targetGame: matchLabel,
    targetGameStatus: "upcoming",
    fallbackWarning,
    playerNames: picks.map(p => p.player_name),
    teamNames: [...new Set(picks.map(p => p.team_name))],
    thresholdLabel: "20+ Disposals",
    isBackup: false,
    tone: "clean_stats",
    hookOptions,
  };

  const enriched = enrichPost(rawPost as SocialPost, matches);
  return { kitType: "disposals", post: enriched, pickCount: picks.length };
}

// ─── Post 2: 1+ Goals ────────────────────────────────────────────────────────

/**
 * Builds the 1+ Goals post for a game.
 *
 * Always uses 1+ threshold (not upgraded to 2+ or 3+). Higher-threshold
 * players can still appear in the combined Post 3.
 */
function build1PlusGoalsPost(
  game: GamePick,
  allGoalPicks: GamePickPlayer[],
  matches: StatBoardMatch[],
): GamePickPostKit {
  const matchLabel = game.match_label;
  const dayLabel = gameDayLabel(game.game_date);

  // Strict: only players with genuine 1+ threshold — never 2+/3+ players
  const picks = allGoalPicks
    .filter(p => p.threshold === 1)
    .slice(0, 5);

  const hasEnough = picks.length >= 2;
  const hasHighTier = picks.some(p => p.tier === "High");

  const bullets = picks.map(formatPickLineShort);
  const statsShown = picks.map(formatPickLine);

  const title = `${matchLabel} — 1+ goals`;
  const hook = `${matchLabel} goal form watch — ${dayLabel}.`;
  const caption = picks.length > 0
    ? buildPickCaption(hook, bullets, 1)
    : `${hook}\n\nInsufficient 1+ goal candidates for this game.`;

  const hookOptions = [
    hook,
    `1+ goal form data for ${matchLabel}.`,
    `${matchLabel} — goal trends before bounce.`,
    `Before bounce — ${picks.length} players with 1+ goal form for ${matchLabel}.`,
    `Recent-form data — ${matchLabel} goal watch.`,
  ];

  const suggestedVisual = picks.length > 0
    ? `${picks.length}-player goal form grid — name, team, 1+ goal record, L5 avg, Last 5 strip. Dark. Neeko brand.`
    : "Placeholder card — insufficient 1+ goal candidates.";

  const imageDescription = picks.length > 0
    ? `Create a dark premium AFL stat graphic for ${matchLabel} focused on 1+ goals. ` +
      `Show ${picks.length} player cards: ${picks.slice(0, 4).map(formatPickLineForImagePrompt).join("; ")}. ` +
      `Use team colour accents. Neeko Sports Stats branding. No betting language.`
    : `Placeholder dark AFL graphic — no strong 1+ goal candidates for ${matchLabel}. Show team names only.`;

  const onScreenText = picks.length > 0
    ? `${matchLabel}\n${picks.slice(0, 3).map(p => `${p.player_name} ${p.hitRecord} at ${p.threshold}+ goals`).join("\n")}`
    : `${matchLabel}\n1+ Goals Watch`;

  const fallbackWarning = !hasEnough
    ? `Not enough genuine 1+ tier candidates for this game (${picks.length} found — strict 1+ only, no 2+/3+ players). Mark as Needs Review.`
    : picks.some(p => p.tier === "Low") ? "Some Low-tier candidates included. Review before publishing." : null;

  const rawPost: Omit<SocialPost, "compliance" | "quality" | "timing" | "ctaLine" | "platformCaptions" | "voiceoverScript" | "carouselSlides" | "hookOptions" | "thumbnailOptions" | "aiImagePrompt" | "aiCarouselPromptPack" | "angle"> = {
    id: kitId(game.match_id, "goals"),
    day: gameDayAbbrev(game.game_date),
    postNumber: 2,
    postTime: `${dayLabel} — pre-game`,
    type: "Carousel",
    category: "Goal Trend",
    intent: "pre_game",
    statLens: "goals",
    confidence: hasHighTier ? "High" : picks.length >= 2 ? "Medium" : "Low",
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
    targetGameStatus: "upcoming",
    fallbackWarning,
    playerNames: picks.map(p => p.player_name),
    teamNames: [...new Set(picks.map(p => p.team_name))],
    thresholdLabel: "1+ Goals",
    isBackup: false,
    tone: "clean_stats",
    hookOptions,
  };

  const enriched = enrichPost(rawPost as SocialPost, matches);
  return { kitType: "goals", post: enriched, pickCount: picks.length };
}

// ─── Post 3: Full Game Picks (combined mixed-threshold) ───────────────────────

/**
 * Builds the Full Game Picks post for a game.
 *
 * Uses best-line logic across all disposal and goal candidates:
 * - Disposals: 15+ / 20+ / 25+ / 30+ (each player at their best qualifying threshold)
 * - Goals: 1+ / 2+ / 3+
 *
 * Target: 6–8 players total, approx even mix of disposals and goals.
 * Prefers High, then Medium, then Low tier candidates.
 */
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

  // Target 3–4 of each, but flex if one side is weak
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
  const pickCount = allPicks.length;

  const hasEnough = dSlice.length >= 2 && gSlice.length >= 2;
  const hasHighTier = allPicks.some(p => p.tier === "High");

  const dispBullets = dSlice.map(formatPickLineShort);
  const goalBullets = gSlice.map(formatPickLineShort);
  const statsShown = allPicks.map(formatPickLine);

  const hook = `${matchLabel} — stat watch before bounce.`;
  const caption = [
    hook,
    "",
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
    `${pickCount} player trends across disposals and goals — ${matchLabel}.`,
    `Before bounce — ${matchLabel} stat watch.`,
  ];

  const suggestedVisual = pickCount > 0
    ? `Split stat grid for ${matchLabel} — left: ${dSlice.length} disposal picks, right: ${gSlice.length} goal picks. Dark. Neeko brand.`
    : "Placeholder card — insufficient combined candidates.";

  const imageDescription = pickCount > 0
    ? `Create a dark premium AFL stat-board graphic for ${matchLabel}. ` +
      `Split into two sections: Disposals and Goals. ` +
      `Disposals (${dSlice.length} players): ${dSlice.map(formatPickLineForImagePrompt).join("; ")}. ` +
      `Goals (${gSlice.length} players): ${gSlice.map(formatPickLineForImagePrompt).join("; ")}. ` +
      `Use green for High confidence, gold for Medium. Neeko Sports Stats branding. No betting language.`
    : `Placeholder dark AFL graphic — insufficient combined candidates for ${matchLabel}. Show team names only.`;

  const onScreenText = pickCount > 0
    ? `${matchLabel}\nDisposals: ${dSlice.map(p => p.player_name).join(", ")}\nGoals: ${gSlice.map(p => p.player_name).join(", ")}`
    : `${matchLabel}\nFull Game Picks`;

  const fallbackWarning = !hasEnough
    ? `Thin combined pool — ${dSlice.length} disposal picks, ${gSlice.length} goal picks. Review before publishing.`
    : pickCount < 6 ? `Smaller than ideal combined pool (${pickCount} players). Normal if game has limited qualifying candidates.` : null;

  const rawPost: Omit<SocialPost, "compliance" | "quality" | "timing" | "ctaLine" | "platformCaptions" | "voiceoverScript" | "carouselSlides" | "hookOptions" | "thumbnailOptions" | "aiImagePrompt" | "aiCarouselPromptPack" | "angle"> = {
    id: kitId(game.match_id, "combined"),
    day: gameDayAbbrev(game.game_date),
    postNumber: 3,
    postTime: `${dayLabel} — pre-game`,
    type: "Carousel",
    category: "Round Preview",
    intent: "pre_game",
    statLens: "disposals",
    confidence: hasHighTier ? "High" : pickCount >= 4 ? "Medium" : "Low",
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
    targetGameStatus: "upcoming",
    fallbackWarning,
    playerNames: allPicks.map(p => p.player_name),
    teamNames: [...new Set(allPicks.map(p => p.team_name))],
    thresholdLabel: "Full Game Picks",
    isBackup: false,
    tone: "clean_stats",
    hookOptions,
  };

  const enriched = enrichPost(rawPost as SocialPost, matches);
  return { kitType: "combined", post: enriched, pickCount };
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
    return {
      angle: "Limited data",
      reason: "No qualifying candidates found for this game.",
    };
  }

  const dispScore = totalDisp * 2 + highDisp * 3;
  const goalScore = totalGoal * 2 + highGoal * 3;
  const hasBothKits = totalDisp >= 2 && totalGoal >= 2;

  if (hasBothKits && dispScore + goalScore >= 10) {
    // Check if all disposal picks share the same threshold for a more specific label
    const thresholds = new Set(dispPicks.map(p => p.threshold));
    const allSameDispThr = thresholds.size === 1;
    const topDispThr = dispPicks[0]?.threshold ?? 20;
    const angleLabel = allSameDispThr && topDispThr >= 25
      ? "Full Game Picks"
      : "Mixed Stat Watch";
    return {
      angle: angleLabel,
      reason: `${totalDisp} disposal candidates (${highDisp} High), ${totalGoal} goal candidates (${highGoal} High).`,
    };
  }

  if (dispScore >= goalScore && totalDisp >= 2) {
    const topDispThr = dispPicks[0]?.threshold ?? 20;
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

/**
 * Builds a GamePickMarketingPack for a single game.
 * Always produces exactly 3 kits: [20+ Disposals, 1+ Goals, Full Game Picks].
 * Thin pools produce posts with fallbackWarning set instead of being omitted.
 */
export function buildGamePickMarketingPack(
  game: GamePick,
  matches: StatBoardMatch[],
): GamePickMarketingPack {
  // High+Medium for primary posts; Low is included as fallback with warning
  const dispPicks = game.disposal_picks;
  const goalPicks = game.goal_picks;

  const { angle, reason } = calcBestAngle(
    dispPicks.filter(p => p.tier === "High" || p.tier === "Medium"),
    goalPicks.filter(p => p.tier === "High" || p.tier === "Medium"),
  );

  const kits: GamePickPostKit[] = [
    build20PlusDisposalsPost(game, dispPicks, matches),
    build1PlusGoalsPost(game, goalPicks, matches),
    buildFullGamePicksPost(game, dispPicks, goalPicks, matches),
  ];

  return {
    game,
    bestAngle: angle,
    bestAngleReason: reason,
    kits,
    skipReason: null,
  };
}

/**
 * Builds marketing packs for all games in a round.
 */
export function buildAllGamePickMarketingPacks(
  gamePicks: GamePick[],
  matches: StatBoardMatch[],
): GamePickMarketingPack[] {
  return gamePicks.map(g => buildGamePickMarketingPack(g, matches));
}
