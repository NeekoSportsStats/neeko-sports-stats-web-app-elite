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
  const goalSuffix = p.statFamily === "goals" ? ` ${pluralizeGoal(p.threshold)}` : "";
  const record = hasRecord
    ? `${p.hitRecord} (${Math.round(p.hitRate * 100)}%) at ${p.threshold}+${goalSuffix}`
    : `${p.threshold}+${goalSuffix}`;
  const l5 = p.l5_avg !== null ? `, L5 avg ${p.l5_avg.toFixed(1)}` : "";
  return `${p.player_name} — ${record}${l5}`;
}

/** Expanded line including Last 5 strip */
function formatPickLine(p: GamePickPlayer): string {
  const goalSuffix = p.statFamily === "goals" ? ` ${pluralizeGoal(p.threshold)}` : "";
  const record = p.hitRecord !== "—" ? `${p.hitRecord} at ${p.threshold}+${goalSuffix}` : `${p.threshold}+${goalSuffix}`;
  const l5 = p.l5_avg !== null ? `, L5 avg ${p.l5_avg.toFixed(1)}` : "";
  const l5strip = p.last_5_strip ? `, Last 5: ${p.last_5_strip}` : "";
  return `${p.player_name} — ${record}${l5}${l5strip}`;
}

/** Image prompt line including team and Last 5 */
function formatPickLineForImagePrompt(p: GamePickPlayer): string {
  const goalSuffix = p.statFamily === "goals" ? ` ${pluralizeGoal(p.threshold)}` : "";
  const record = p.hitRecord !== "—" ? `${p.hitRecord} at ${p.threshold}+${goalSuffix}` : `${p.threshold}+${goalSuffix}`;
  const l5 = p.l5_avg !== null ? `, L5 avg ${p.l5_avg.toFixed(1)}` : "";
  const strip = p.last_5_strip ? ` | Last 5: ${p.last_5_strip}` : "";
  return `${p.player_name} (${p.team_name}): ${record}${l5}${strip}`;
}

/** Returns "goal" or "goals" depending on threshold. */
function pluralizeGoal(threshold: number): string {
  return threshold === 1 ? "goal" : "goals";
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

// ─── Post 1: Disposal post — strict 20+ or fallback ─────────────────────────

/**
 * Disposal post cascade for a single game.
 *
 * Tier 1 (normal): strict 20+ players ≥ 4 → "20+ Disposals" post.
 * Tier 2 (fallback): strict 20+ count 2–3 → "Disposal Watch" (top up with 25+/30+ players).
 * Tier 3 (thin): strict 20+ count 1 → "Disposal Watch" if 25+/30+ players exist, else "Player Spotlight".
 * Tier 4 (empty): strict 20+ count 0 → "Disposal Watch" from 25+/30+ only, or "Do Not Post".
 *
 * STRICT RULES:
 * - "20+ Disposals" posts: only publicContentTier === 20 players.
 * - "Disposal Watch" posts: each player keeps their TRUE threshold. No player is mis-labelled.
 * - Never weaken a strict threshold pool globally.
 */
function buildDisposalPost(
  game: GamePick,
  allDispPicks: GamePickPlayer[],
  matches: StatBoardMatch[],
): GamePickPostKit {
  const matchLabel = game.match_label;
  const dayLabel = gameDayLabel(game.game_date);

  // Strict 20+ pool — publicContentTier === 20 means the player qualifies at 20+
  // but NOT at 25+/30+ (those are excluded by the content tier logic in statLineEngine).
  const strict20 = allDispPicks.filter(p => p.publicContentTier === 20);
  // Higher-line pool — 25+/30+ players (by their true qualifying tier)
  const higher = allDispPicks.filter(p => p.publicContentTier === 25 || p.publicContentTier === 30);

  if (strict20.length >= 4) {
    return buildStrict20PlusPost(game, strict20.slice(0, 5), matchLabel, dayLabel, matches);
  }

  if (strict20.length >= 2) {
    // Fill up to 5 total using higher-line players
    const topHigher = higher.slice(0, Math.min(higher.length, 5 - strict20.length));
    const mixedPicks = [...strict20, ...topHigher];
    return buildDisposalWatchPost(game, mixedPicks, matchLabel, dayLabel, matches, strict20.length);
  }

  if (strict20.length === 1) {
    if (higher.length >= 2) {
      // Combine the one 20+ player with up to 4 higher-line players
      const topHigher = higher.slice(0, Math.min(higher.length, 4));
      const mixedPicks = [...strict20, ...topHigher];
      return buildDisposalWatchPost(game, mixedPicks, matchLabel, dayLabel, matches, 1);
    }
    // Only one 20+ player and no higher-line support — Player Spotlight
    return buildPlayerSpotlightPost(game, strict20[0], matchLabel, dayLabel, matches);
  }

  // Zero strict 20+ players
  if (higher.length >= 3) {
    return buildDisposalWatchPost(game, higher.slice(0, 5), matchLabel, dayLabel, matches, 0);
  }

  // Truly empty pool
  return buildEmptyDisposalPost(game, matchLabel, dayLabel, matches);
}

// ─── Strict 20+ Disposals post ────────────────────────────────────────────────

function buildStrict20PlusPost(
  game: GamePick,
  picks: GamePickPlayer[],
  matchLabel: string,
  dayLabel: string,
  matches: StatBoardMatch[],
): GamePickPostKit {
  const hasHighTier = picks.some(p => p.tier === "High");
  const bullets = picks.map(formatPickLineShort);
  const statsShown = picks.map(formatPickLine);
  const title = `${matchLabel} — 20+ disposals`;
  const hook = `${matchLabel} disposal watch — ${dayLabel}.`;
  const caption = buildPickCaption(hook, bullets, 0);
  const hookOptions = [
    hook,
    `20+ disposal form for ${matchLabel}.`,
    `${matchLabel} — disposal trends before bounce.`,
    `${picks.length} players with 20+ disposal form for ${matchLabel}.`,
    `Recent-form data — ${matchLabel} 20+ disposal watch.`,
  ];
  const suggestedVisual = `${picks.length}-player stat grid — name, team, 20+ record, L5 avg, Last 5 strip. Dark. Neeko brand.`;
  const imageDescription =
    `Create a dark premium AFL stat graphic for ${matchLabel} focused on 20+ disposals. ` +
    `Show ${picks.length} player cards: ${picks.map(formatPickLineForImagePrompt).join("; ")}. ` +
    `All players shown at 20+ threshold. Use team colour accents. Neeko Sports Stats branding. No betting language.`;
  const onScreenText = `${matchLabel}\n${picks.slice(0, 3).map(p => `${p.player_name} ${p.hitRecord} at 20+`).join("\n")}`;
  const fallbackWarning = picks.some(p => p.tier === "Low")
    ? "Some Low-tier candidates included. Review before publishing."
    : null;
  const rawPost = buildDisposalRawPost({
    game, matchLabel, dayLabel, picks, title, hook, caption, hookOptions,
    suggestedVisual, imageDescription, onScreenText, fallbackWarning,
    thresholdLabel: "20+ Disposals",
    confidence: hasHighTier ? "High" : "Medium",
    dataScope: `${matchLabel} disposal pool (strict 20+ tier)`,
  });
  return { kitType: "disposals", post: enrichPost(rawPost as SocialPost, matches), pickCount: picks.length };
}

// ─── Disposal Watch post (mixed thresholds) ───────────────────────────────────

function buildDisposalWatchPost(
  game: GamePick,
  picks: GamePickPlayer[],
  matchLabel: string,
  dayLabel: string,
  matches: StatBoardMatch[],
  strict20Count: number,
): GamePickPostKit {
  const hasHighTier = picks.some(p => p.tier === "High");
  const bullets = picks.map(formatPickLineShort);
  const statsShown = picks.map(formatPickLine);
  const title = `${matchLabel} — disposal watch`;
  const hook = `${matchLabel} disposal trends before bounce — ${dayLabel}.`;
  // Caption notes that thresholds are mixed — each player shows their true threshold
  const captionHeader = [
    hook,
    "",
    "A mix of disposal profiles — each player shown at their actual threshold.",
  ];
  const captionBody = bullets.map(b => `• ${b}`);
  const caption = [...captionHeader, ...captionBody, "", signOff(0)].join("\n");
  const hookOptions = [
    hook,
    `Disposal trends before bounce — ${matchLabel}.`,
    `${picks.length} players with disposal form for ${matchLabel}.`,
    `Each player shown with their actual threshold — ${matchLabel}.`,
    `Before bounce — ${matchLabel} disposal form.`,
  ];
  const suggestedVisual = `${picks.length}-player disposal watch grid — name, team, actual threshold+, record, L5 avg. Mixed thresholds clearly labelled. Dark. Neeko brand.`;
  const imageDescription =
    `Create a dark premium AFL stat graphic for ${matchLabel} titled "Disposal Watch". ` +
    `Show ${picks.length} player cards: ${picks.map(formatPickLineForImagePrompt).join("; ")}. ` +
    `Each player is shown at their actual threshold (20+, 25+, or 30+). Do NOT show all players as 20+. ` +
    `Use team colour accents. Neeko Sports Stats branding. No betting language.`;
  const onScreenText = `${matchLabel}\nDisposal Watch\n${picks.slice(0, 3).map(p => `${p.player_name} ${p.hitRecord} at ${p.threshold}+`).join("\n")}`;

  const needsReview = picks.length < 4;
  const thinNote = strict20Count <= 1
    ? `Only ${strict20Count} strict 20+ player${strict20Count === 1 ? "" : "s"} — filled with higher-line (25+/30+) candidates.`
    : `Only ${strict20Count} strict 20+ players — supplemented with higher-threshold candidates.`;
  const fallbackWarning = needsReview
    ? `${thinNote} Needs Review — ${picks.length} total players found.`
    : thinNote;

  const rawPost = buildDisposalRawPost({
    game, matchLabel, dayLabel, picks, title, hook, caption, hookOptions,
    suggestedVisual, imageDescription, onScreenText, fallbackWarning,
    thresholdLabel: "Disposal Watch",
    confidence: hasHighTier ? "High" : picks.length >= 3 ? "Medium" : "Low",
    dataScope: `${matchLabel} disposal pool (mixed thresholds)`,
  });
  return { kitType: "disposals", post: enrichPost(rawPost as SocialPost, matches), pickCount: picks.length };
}

// ─── Player Spotlight post (single player) ────────────────────────────────────

function buildPlayerSpotlightPost(
  game: GamePick,
  pick: GamePickPlayer,
  matchLabel: string,
  dayLabel: string,
  matches: StatBoardMatch[],
): GamePickPostKit {
  const statsShown = [formatPickLine(pick)];
  const title = `${matchLabel} — ${pick.player_name} disposal spotlight`;
  const hook = `One stat before bounce — ${matchLabel}, ${dayLabel}.`;
  const caption = [
    hook,
    "",
    `• ${formatPickLineShort(pick)}`,
    "",
    signOff(0),
  ].join("\n");
  const hookOptions = [
    hook,
    `${pick.player_name} — disposal spotlight for ${matchLabel}.`,
    `One stat before bounce — ${matchLabel}.`,
    `${matchLabel} — single-player disposal stat to watch.`,
    `Before bounce — ${pick.player_name} disposal form.`,
  ];
  const suggestedVisual = `Single-player stat card — ${pick.player_name}, ${pick.team_name}, ${pick.threshold}+ disposal record. Dark. Neeko brand.`;
  const imageDescription =
    `Create a dark premium AFL single-player stat card for ${matchLabel}. ` +
    `One player: ${formatPickLineForImagePrompt(pick)}. ` +
    `Threshold: ${pick.threshold}+. Show hit record, L5 avg, Last 5 strip. ` +
    `This is a spotlight card — NOT a 5-player grid. Neeko Sports Stats branding. No betting language.`;
  const onScreenText = `${matchLabel}\nOne Stat Before Bounce\n${pick.player_name} ${pick.hitRecord} at ${pick.threshold}+`;
  const fallbackWarning = `Single-player disposal spotlight — Organic Only / Needs Review. Not suitable as a standard paid carousel ad.`;
  const rawPost = buildDisposalRawPost({
    game, matchLabel, dayLabel, picks: [pick], title, hook, caption, hookOptions,
    suggestedVisual, imageDescription, onScreenText, fallbackWarning,
    thresholdLabel: "Player Spotlight",
    confidence: "Low",
    dataScope: `${matchLabel} single-player spotlight`,
  });
  return { kitType: "disposals", post: enrichPost(rawPost as SocialPost, matches), pickCount: 1 };
}

// ─── Empty disposal post ─────────────────────────────────────────────────────

function buildEmptyDisposalPost(
  game: GamePick,
  matchLabel: string,
  dayLabel: string,
  matches: StatBoardMatch[],
): GamePickPostKit {
  const hook = `${matchLabel} — disposal watch — ${dayLabel}.`;
  const rawPost = buildDisposalRawPost({
    game, matchLabel, dayLabel, picks: [], title: `${matchLabel} — disposal watch`,
    hook, caption: `${hook}\n\nNo qualifying disposal candidates for this game.`,
    hookOptions: [hook],
    suggestedVisual: "Placeholder card — no qualifying disposal candidates.",
    imageDescription: `Placeholder dark AFL graphic — no qualifying disposal candidates for ${matchLabel}. Show team names only.`,
    onScreenText: `${matchLabel}\nNo qualifying disposal candidates`,
    fallbackWarning: "Do Not Post — no qualifying disposal candidates found for this game.",
    thresholdLabel: "Disposal Watch",
    confidence: "Low",
    dataScope: `${matchLabel} disposal pool (empty)`,
  });
  return { kitType: "disposals", post: enrichPost(rawPost as SocialPost, matches), pickCount: 0 };
}

// ─── Shared rawPost builder for all disposal post types ──────────────────────

interface DisposalRawPostArgs {
  game: GamePick;
  matchLabel: string;
  dayLabel: string;
  picks: GamePickPlayer[];
  title: string;
  hook: string;
  caption: string;
  hookOptions: string[];
  suggestedVisual: string;
  imageDescription: string;
  onScreenText: string;
  fallbackWarning: string | null;
  thresholdLabel: string;
  confidence: "High" | "Medium" | "Low";
  dataScope: string;
}

function buildDisposalRawPost(args: DisposalRawPostArgs): Omit<SocialPost, "compliance" | "quality" | "timing" | "ctaLine" | "platformCaptions" | "voiceoverScript" | "carouselSlides" | "hookOptions" | "thumbnailOptions" | "aiImagePrompt" | "aiCarouselPromptPack" | "angle"> {
  const { game, matchLabel, dayLabel, picks } = args;
  return {
    id: kitId(game.match_id, "disposals"),
    day: gameDayAbbrev(game.game_date),
    postNumber: 1,
    postTime: `${dayLabel} — pre-game`,
    type: "Carousel",
    category: "Disposal Trend",
    intent: "pre_game",
    statLens: "disposals",
    confidence: args.confidence,
    title: args.title,
    content: args.hook,
    statsShown: picks.map(formatPickLine),
    onScreenText: args.onScreenText,
    caption: args.caption,
    hashtags: gamePickHashtags("disposals", game.game_date),
    suggestedVisual: args.suggestedVisual,
    imageDescription: args.imageDescription,
    dataScope: args.dataScope,
    targetGame: matchLabel,
    targetGameStatus: "upcoming",
    fallbackWarning: args.fallbackWarning,
    playerNames: picks.map(p => p.player_name),
    teamNames: [...new Set(picks.map(p => p.team_name))],
    thresholdLabel: args.thresholdLabel,
    isBackup: false,
    tone: "clean_stats",
    hookOptions: args.hookOptions,
  };
}

// ─── Recent Form Hits post ────────────────────────────────────────────────────

/**
 * Builds a "Recent Form Hits" post for games with thin strict-threshold pools.
 *
 * Uses players with strong Last 5 form even if they don't qualify for the strict
 * consistency tier. L10 hit rate may be as low as 65–70% if L5 form is strong.
 *
 * NEVER calls players "most consistent" or "locks".
 * Copy always clarifies this is RECENT FORM ONLY.
 */
export function buildRecentFormHitsPost(
  game: GamePick,
  allDispPicks: GamePickPlayer[],
  matches: StatBoardMatch[],
): GamePickPostKit {
  const matchLabel = game.match_label;
  const dayLabel = gameDayLabel(game.game_date);

  // Recent form candidates: include Medium and Low tier (not just High+Medium)
  // but require at least moderate L5 form. Sorted by consistency_score descending.
  const candidates = allDispPicks
    .filter(p => p.hitRate >= 0.65 && (p.l5_avg ?? 0) >= 18)
    .slice(0, 5);

  const hasAnyCandidates = candidates.length > 0;
  const statsShown = candidates.map(formatPickLine);
  const bullets = candidates.map(formatPickLineShort);

  const title = `${matchLabel} — recent form watch`;
  const hook = `Recent form only — ${matchLabel}, ${dayLabel}.`;
  const captionBody = hasAnyCandidates
    ? [
        hook,
        "",
        "Last 5 form — these players have been reaching the mark recently.",
        "",
        ...bullets.map(b => `• ${b}`),
        "",
        signOff(3),
      ]
    : [`${hook}\n\nNo recent form candidates found for this game.`];
  const caption = captionBody.join("\n");
  const hookOptions = [
    hook,
    `Recent form to watch — ${matchLabel}.`,
    `These players have been hitting the stat in recent games — ${matchLabel}.`,
    `Last 5 form data — ${matchLabel} disposal watch.`,
    `Before bounce — recent form hits for ${matchLabel}.`,
  ];
  const suggestedVisual = candidates.length > 0
    ? `${candidates.length}-player recent form grid — L5 strip prominent. Labelled "Recent Form Only". Dark. Neeko brand.`
    : "Placeholder — no recent form candidates.";
  const imageDescription = candidates.length > 0
    ? `Create a dark AFL stat graphic for ${matchLabel} titled "Recent Form Hits" or "Last 5 Form Watch". ` +
      `Show ${candidates.length} player cards: ${candidates.map(formatPickLineForImagePrompt).join("; ")}. ` +
      `Make Last 5 strip the prominent stat. Label clearly as "Recent form — not season average". ` +
      `Neeko Sports Stats branding. No betting language.`
    : `Placeholder dark AFL graphic — no recent form candidates for ${matchLabel}.`;
  const onScreenText = candidates.length > 0
    ? `${matchLabel}\nRecent Form Watch\n${candidates.slice(0, 3).map(p => `${p.player_name} ${p.hitRecord}`).join("\n")}`
    : `${matchLabel}\nRecent Form Watch`;

  const reviewNote = candidates.some(p => p.hitRate < 0.70)
    ? "Some players have L10 hit rate < 70% — included for strong L5 form only. Needs Review."
    : null;
  const fallbackWarning = [
    "Recent form only — not season consistency. Organic / low-risk use only.",
    reviewNote,
  ].filter(Boolean).join(" ");

  const rawPost: Omit<SocialPost, "compliance" | "quality" | "timing" | "ctaLine" | "platformCaptions" | "voiceoverScript" | "carouselSlides" | "hookOptions" | "thumbnailOptions" | "aiImagePrompt" | "aiCarouselPromptPack" | "angle"> = {
    id: `${kitId(game.match_id, "disposals")}-rfh`,
    day: gameDayAbbrev(game.game_date),
    postNumber: 1,
    postTime: `${dayLabel} — pre-game`,
    type: "Carousel",
    category: "Disposal Trend",
    intent: "pre_game",
    statLens: "disposals",
    confidence: candidates.length >= 3 ? "Medium" : "Low",
    title,
    content: hook,
    statsShown,
    onScreenText,
    caption,
    hashtags: gamePickHashtags("disposals", game.game_date),
    suggestedVisual,
    imageDescription,
    dataScope: `${matchLabel} recent form pool (L5 form watch)`,
    targetGame: matchLabel,
    targetGameStatus: "upcoming",
    fallbackWarning,
    playerNames: candidates.map(p => p.player_name),
    teamNames: [...new Set(candidates.map(p => p.team_name))],
    thresholdLabel: "Recent Form Hits",
    isBackup: false,
    tone: "clean_stats",
    hookOptions,
  };

  return { kitType: "disposals", post: enrichPost(rawPost as SocialPost, matches), pickCount: candidates.length };
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
      `Show ${picks.length} player cards: ${picks.map(formatPickLineForImagePrompt).join("; ")}. ` +
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

  // Duplicate player handling: if the same player appears in both dSlice and gSlice,
  // keep only their stronger line (higher consistency_score). Label them as dual-stat
  // in adminWarnings if both lines were strong enough to qualify.
  const dPlayerIds = new Set(dSlice.map(p => p.player_id));
  const dualStatNames: string[] = [];

  gSlice = gSlice.filter(g => {
    if (!dPlayerIds.has(g.player_id)) return true;
    const dMatch = dSlice.find(d => d.player_id === g.player_id);
    if (!dMatch) return true;
    // Both lines qualify — keep the stronger one only, flag as dual-stat
    dualStatNames.push(g.player_name);
    return g.consistency_score > dMatch.consistency_score; // keep goal line only if it's strictly stronger
  });
  // If goal line was kept (stronger), remove the disposal line
  const dualIdsKeptAsGoal = new Set(gSlice.filter(g => dualStatNames.includes(g.player_name)).map(g => g.player_id));
  dSlice = dSlice.filter(d => !dualIdsKeptAsGoal.has(d.player_id));

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

  const fallbackWarning: string | null = (() => {
    const parts: string[] = [];
    if (!hasEnough) {
      parts.push(`Thin combined pool — ${dSlice.length} disposal picks, ${gSlice.length} goal picks. Review before publishing.`);
    } else if (pickCount < 6) {
      parts.push(`Smaller than ideal combined pool (${pickCount} players). Normal if game has limited qualifying candidates.`);
    }
    if (dualStatNames.length > 0) {
      parts.push(`Dual-stat player${dualStatNames.length > 1 ? "s" : ""} detected — kept stronger line only: ${dualStatNames.join(", ")}.`);
    }
    return parts.length > 0 ? parts.join(" ") : null;
  })();

  const rawPost: Omit<SocialPost, "compliance" | "quality" | "timing" | "ctaLine" | "platformCaptions" | "voiceoverScript" | "carouselSlides" | "hookOptions" | "thumbnailOptions" | "aiImagePrompt" | "aiCarouselPromptPack" | "angle"> = {
    id: kitId(game.match_id, "combined"),
    day: gameDayAbbrev(game.game_date),
    postNumber: 3,
    postTime: `${dayLabel} — pre-game`,
    type: "Carousel",
    category: "Round Preview",
    intent: "pre_game",
    statLens: "mixed",
    confidence: hasHighTier ? "High" : pickCount >= 4 ? "Medium" : "Low",
    title,
    content: hook,
    statsShown,
    onScreenText,
    caption,
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
    buildDisposalPost(game, dispPicks, matches),
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
