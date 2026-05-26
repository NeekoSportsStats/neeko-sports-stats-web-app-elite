/**
 * Game Pick Post Kit — converts a GamePick into ready-to-use SocialPost objects.
 * Admin-only. No public exposure. No betting language.
 *
 * Each GamePick can produce up to three post kits:
 *   1. Disposals kit  (≥3 valid disposal picks required)
 *   2. Goals kit      (≥2 valid goal picks required)
 *   3. Combined kit   (≥4 total picks across both lenses required)
 *
 * All enrichment (voiceover, carousel, AI prompt, platform captions, compliance,
 * quality score) is delegated to the shared enrichPost() helper from postEnrichment.ts,
 * so Game Picks produce identical output shape and quality signals as day posts.
 */
import type { GamePick, GamePickPlayer } from "./gamePicksEngine";
import type { SocialPost } from "./types";
import { enrichPost } from "./postEnrichment";
import type { StatBoardMatch } from "@/features/afl/stat-board/types";

// ─── Thresholds ───────────────────────────────────────────────────────────────

const MIN_DISPOSAL_PICKS = 3;
const MIN_GOAL_PICKS = 2;
const MIN_COMBINED_PICKS = 4;

// ─── Kit type ─────────────────────────────────────────────────────────────────

export type GamePickKitType = "disposals" | "goals" | "combined";

export interface GamePickPostKit {
  kitType: GamePickKitType;
  post: SocialPost;
  pickCount: number;
}

export interface GamePickMarketingPack {
  game: GamePick;
  /** Best social angle label, e.g. "25+ disposal watch" */
  bestAngle: string;
  /** Reason for the best angle selection */
  bestAngleReason: string;
  kits: GamePickPostKit[];
  /** Skip recommendation when no strong candidates exist */
  skipReason: string | null;
}

// ─── ID counter (scoped to this module) ──────────────────────────────────────

let _kitCounter = 0;
function kitId(matchId: number, type: GamePickKitType): string {
  return `gp-kit-${matchId}-${type}-${++_kitCounter}`;
}

// ─── Stat formatting ──────────────────────────────────────────────────────────

/**
 * Public-safe stat line: "Jack Sinclair — 9/10 at 25+, L5 avg 27.8"
 * Uses actual hit record denominator — not forced "last 10".
 */
function formatPickLine(p: GamePickPlayer): string {
  const record = p.hitRecord !== "—" ? `${p.hitRecord} at ${p.threshold}+` : `${p.threshold}+`;
  const l5 = p.l5_avg !== null ? `, L5 avg ${p.l5_avg.toFixed(1)}` : "";
  const l5strip = p.last_5_strip ? `, Last 5: ${p.last_5_strip}` : "";
  return `${p.player_name} — ${record}${l5}${l5strip}`;
}

/** Short line for captions (no Last 5 strip): "Jack Sinclair — 9/10 at 25+, L5 avg 27.8" */
function formatPickLineShort(p: GamePickPlayer): string {
  const record = p.hitRecord !== "—" ? `${p.hitRecord} at ${p.threshold}+` : `${p.threshold}+`;
  const l5 = p.l5_avg !== null ? `, L5 avg ${p.l5_avg.toFixed(1)}` : "";
  return `${p.player_name} — ${record}${l5}`;
}

/** Image prompt line (for AI image generation): include l5 strip */
function formatPickLineForImagePrompt(p: GamePickPlayer): string {
  const record = p.hitRecord !== "—" ? `${p.hitRecord} at ${p.threshold}+` : `${p.threshold}+`;
  const l5 = p.l5_avg !== null ? `, L5 avg ${p.l5_avg.toFixed(1)}` : "";
  const strip = p.last_5_strip ? ` | Last 5: ${p.last_5_strip}` : "";
  return `${p.player_name} (${p.team_name}): ${record}${l5}${strip}`;
}

// ─── Hashtag helper ───────────────────────────────────────────────────────────

function gamePickHashtags(kitType: GamePickKitType, gameDate: string): string[] {
  const base = ["#AFL", "#AFLStats", "#NeekoSportsStats"];
  const day = new Date(gameDate).getDay(); // 0=Sun, 4=Thu, 5=Sat, 6=Sun
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

// ─── Disposal kit builder ─────────────────────────────────────────────────────

function buildDisposalsKit(
  game: GamePick,
  picks: GamePickPlayer[],
  matches: StatBoardMatch[],
): GamePickPostKit {
  const matchLabel = game.match_label;
  const bullets = picks.slice(0, 6).map(formatPickLineShort);
  const statsShown = picks.slice(0, 6).map(formatPickLine);
  const topThr = picks[0]?.threshold ?? 20;
  const title = `${matchLabel} — disposal watch`;
  const hook = `${matchLabel} disposal trends before bounce.`;
  const caption = buildPickCaption(hook, bullets, 0);
  const pickCount = picks.length;

  const hookOptions = [
    hook,
    `These are the disposal profiles that stand out for ${matchLabel}.`,
    `Before bounce, here are the numbers on the board for ${matchLabel}.`,
    `${pickCount} disposal trends worth watching for ${matchLabel}.`,
    `Recent-form data only — ${matchLabel} disposal watch.`,
  ];

  const suggestedVisual =
    `${pickCount}-player disposal stat grid — name, team, ${topThr}+ record, L5 avg, Last 5 strip. Neeko brand.`;

  const imageDescription =
    `Dark AFL stats graphic for ${matchLabel}. ` +
    `${pickCount} disposal player cards: ${picks.slice(0, 3).map(formatPickLineForImagePrompt).join("; ")}. ` +
    `Green/gold accents for strong records. Neeko Sports Stats logo.`;

  const onScreenText =
    `${matchLabel}\n${picks.slice(0, 3).map(p => `${p.player_name} ${p.hitRecord} at ${p.threshold}+`).join("\n")}`;

  const playerNames = picks.map(p => p.player_name);
  const teamNames = [...new Set(picks.map(p => p.team_name))];

  const hasHighTier = picks.some(p => p.tier === "High");

  const rawPost: Omit<SocialPost, "compliance" | "quality" | "timing" | "ctaLine" | "platformCaptions" | "voiceoverScript" | "carouselSlides" | "hookOptions" | "thumbnailOptions" | "aiImagePrompt" | "angle"> = {
    id: kitId(game.match_id, "disposals"),
    day: "Sat",
    postNumber: 1,
    postTime: "game day",
    type: "Carousel",
    category: "Disposal Trend",
    intent: "pre_game",
    statLens: "disposals",
    confidence: hasHighTier ? "High" : "Medium",
    title,
    content: hook,
    statsShown,
    onScreenText,
    caption,
    hashtags: gamePickHashtags("disposals", game.game_date),
    suggestedVisual,
    imageDescription,
    dataScope: `${matchLabel} disposal pool`,
    targetGame: matchLabel,
    targetGameStatus: "upcoming",
    fallbackWarning: pickCount < MIN_DISPOSAL_PICKS ? "Small disposal pool — fewer than 3 strong candidates." : null,
    playerNames,
    teamNames,
    thresholdLabel: `${topThr}+ Disposals`,
    isBackup: false,
    tone: "clean_stats",
    hookOptions,
  };

  const enriched = enrichPost(rawPost as SocialPost, matches);
  return { kitType: "disposals", post: enriched, pickCount };
}

// ─── Goals kit builder ────────────────────────────────────────────────────────

function buildGoalsKit(
  game: GamePick,
  picks: GamePickPlayer[],
  matches: StatBoardMatch[],
): GamePickPostKit {
  const matchLabel = game.match_label;
  const bullets = picks.slice(0, 5).map(formatPickLineShort);
  const statsShown = picks.slice(0, 5).map(formatPickLine);
  const topThr = picks[0]?.threshold ?? 1;
  const title = `${matchLabel} — goal form watch`;
  const hook = `${matchLabel} goal form trends before bounce.`;
  const caption = buildPickCaption(hook, bullets, 1);
  const pickCount = picks.length;

  const hookOptions = [
    hook,
    `Goal form data for ${matchLabel} — the profiles that stand out.`,
    `${pickCount} goal trend players to watch in ${matchLabel}.`,
    `Before bounce: ${matchLabel} goal form numbers.`,
    `Recent-form data only — ${matchLabel} goal watch.`,
  ];

  const suggestedVisual =
    `${pickCount}-player goal form grid — name, team, goal record, L5 avg. Neeko brand.`;

  const imageDescription =
    `Dark AFL stats graphic for ${matchLabel} goal form. ` +
    `${pickCount} goal player cards: ${picks.slice(0, 3).map(formatPickLineForImagePrompt).join("; ")}. ` +
    `Gold/amber accents for goal records. Neeko Sports Stats logo.`;

  const onScreenText =
    `${matchLabel}\n${picks.slice(0, 3).map(p => `${p.player_name} ${p.hitRecord} at ${p.threshold}+ goals`).join("\n")}`;

  const playerNames = picks.map(p => p.player_name);
  const teamNames = [...new Set(picks.map(p => p.team_name))];

  const hasHighTier = picks.some(p => p.tier === "High");

  const rawPost: Omit<SocialPost, "compliance" | "quality" | "timing" | "ctaLine" | "platformCaptions" | "voiceoverScript" | "carouselSlides" | "hookOptions" | "thumbnailOptions" | "aiImagePrompt" | "angle"> = {
    id: kitId(game.match_id, "goals"),
    day: "Sat",
    postNumber: 2,
    postTime: "game day",
    type: "Carousel",
    category: "Goal Trend",
    intent: "pre_game",
    statLens: "goals",
    confidence: hasHighTier ? "High" : "Medium",
    title,
    content: hook,
    statsShown,
    onScreenText,
    caption,
    hashtags: gamePickHashtags("goals", game.game_date),
    suggestedVisual,
    imageDescription,
    dataScope: `${matchLabel} goal pool`,
    targetGame: matchLabel,
    targetGameStatus: "upcoming",
    fallbackWarning: pickCount < MIN_GOAL_PICKS ? "Small goal pool — fewer than 2 strong candidates." : null,
    playerNames,
    teamNames,
    thresholdLabel: `${topThr}+ Goals`,
    isBackup: false,
    tone: "clean_stats",
    hookOptions,
  };

  const enriched = enrichPost(rawPost as SocialPost, matches);
  return { kitType: "goals", post: enriched, pickCount };
}

// ─── Combined kit builder ─────────────────────────────────────────────────────

function buildCombinedKit(
  game: GamePick,
  dispPicks: GamePickPlayer[],
  goalPicks: GamePickPlayer[],
  matches: StatBoardMatch[],
): GamePickPostKit {
  const matchLabel = game.match_label;
  const dSlice = dispPicks.slice(0, 3);
  const gSlice = goalPicks.slice(0, 3);
  const allPicks = [...dSlice, ...gSlice];
  const pickCount = allPicks.length;

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

  const title = `${matchLabel} — stat watch`;

  const hookOptions = [
    hook,
    `${matchLabel} — disposals and goals to watch tonight.`,
    `Both disposal and goal form data before bounce for ${matchLabel}.`,
    `${pickCount} player trends across disposals and goals — ${matchLabel}.`,
    `Before bounce — ${matchLabel} stat watch.`,
  ];

  const topDispThr = dispPicks[0]?.threshold ?? 20;

  const suggestedVisual =
    `Split stat grid for ${matchLabel} — left side: ${dSlice.length} disposal picks, right side: ${gSlice.length} goal picks. Neeko brand.`;

  const imageDescription =
    `Dark AFL stats graphic for ${matchLabel} stat watch. ` +
    `Split into two sections. Disposals: ${dSlice.map(formatPickLineForImagePrompt).join("; ")}. ` +
    `Goals: ${gSlice.map(formatPickLineForImagePrompt).join("; ")}. ` +
    `Green accents for disposal records, amber for goals. Neeko Sports Stats logo.`;

  const onScreenText =
    `${matchLabel}\nDisposals: ${dSlice.map(p => p.player_name).join(", ")}\nGoals: ${gSlice.map(p => p.player_name).join(", ")}`;

  const playerNames = allPicks.map(p => p.player_name);
  const teamNames = [...new Set(allPicks.map(p => p.team_name))];

  const hasHighTier = allPicks.some(p => p.tier === "High");

  const rawPost: Omit<SocialPost, "compliance" | "quality" | "timing" | "ctaLine" | "platformCaptions" | "voiceoverScript" | "carouselSlides" | "hookOptions" | "thumbnailOptions" | "aiImagePrompt" | "angle"> = {
    id: kitId(game.match_id, "combined"),
    day: "Sat",
    postNumber: 3,
    postTime: "game day",
    type: "Carousel",
    category: "Round Preview",
    intent: "pre_game",
    statLens: "disposals",
    confidence: hasHighTier ? "High" : "Medium",
    title,
    content: hook,
    statsShown,
    onScreenText,
    caption,
    hashtags: gamePickHashtags("combined", game.game_date),
    suggestedVisual,
    imageDescription,
    dataScope: `${matchLabel} combined pool`,
    targetGame: matchLabel,
    targetGameStatus: "upcoming",
    fallbackWarning: pickCount < MIN_COMBINED_PICKS ? "Combined pool under 4 players — consider disposals or goals kit only." : null,
    playerNames,
    teamNames,
    thresholdLabel: `${topDispThr}+ + Goals Watch`,
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
      angle: "Skip — not enough strong candidates",
      reason: "No High or Medium tier players found for this game.",
    };
  }

  const dispScore = totalDisp * 2 + highDisp * 3;
  const goalScore = totalGoal * 2 + highGoal * 3;
  const hasBothKits = totalDisp >= MIN_DISPOSAL_PICKS && totalGoal >= MIN_GOAL_PICKS;

  if (hasBothKits && dispScore + goalScore >= 14) {
    const topDispThr = dispPicks[0]?.threshold ?? 20;
    return {
      angle: `Combined stat watch (${topDispThr}+ disposals + goals)`,
      reason: `${totalDisp} disposal candidates (${highDisp} High), ${totalGoal} goal candidates (${highGoal} High). Strong combined pool.`,
    };
  }

  if (dispScore >= goalScore && totalDisp >= MIN_DISPOSAL_PICKS) {
    const topDispThr = dispPicks[0]?.threshold ?? 20;
    return {
      angle: `${topDispThr}+ disposal watch`,
      reason: `${totalDisp} disposal candidates (${highDisp} High tier). Disposal pool stronger than goals (${totalGoal} goal candidates).`,
    };
  }

  if (totalGoal >= MIN_GOAL_PICKS) {
    const topGoalThr = goalPicks[0]?.threshold ?? 1;
    return {
      angle: `${topGoalThr}+ goal form watch`,
      reason: `${totalGoal} goal candidates (${highGoal} High tier). Goal pool is the stronger angle for this game.`,
    };
  }

  if (totalDisp >= 1 || totalGoal >= 1) {
    return {
      angle: "Weak — small candidate pool",
      reason: `Only ${totalDisp} disposal and ${totalGoal} goal candidates. Not enough for a strong post kit.`,
    };
  }

  return {
    angle: "Skip — not enough strong candidates",
    reason: "No qualifying candidates for this game.",
  };
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Builds a GamePickMarketingPack for a single game.
 * Only generates kits when enough valid candidates exist.
 */
export function buildGamePickMarketingPack(
  game: GamePick,
  matches: StatBoardMatch[],
): GamePickMarketingPack {
  // Use only High+Medium tier picks for kits (Low is never used for public posts)
  const dispPicks = game.disposal_picks.filter(p => p.tier === "High" || p.tier === "Medium");
  const goalPicks = game.goal_picks.filter(p => p.tier === "High" || p.tier === "Medium");

  const { angle, reason } = calcBestAngle(dispPicks, goalPicks);

  const kits: GamePickPostKit[] = [];

  if (dispPicks.length >= MIN_DISPOSAL_PICKS) {
    kits.push(buildDisposalsKit(game, dispPicks, matches));
  }

  if (goalPicks.length >= MIN_GOAL_PICKS) {
    kits.push(buildGoalsKit(game, goalPicks, matches));
  }

  const totalPicks = dispPicks.length + goalPicks.length;
  if (totalPicks >= MIN_COMBINED_PICKS && dispPicks.length >= 2 && goalPicks.length >= 2) {
    kits.push(buildCombinedKit(game, dispPicks, goalPicks, matches));
  }

  const skipReason =
    kits.length === 0
      ? `Not enough strong candidates. (${dispPicks.length} disposal, ${goalPicks.length} goal)`
      : null;

  return {
    game,
    bestAngle: angle,
    bestAngleReason: reason,
    kits,
    skipReason,
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
