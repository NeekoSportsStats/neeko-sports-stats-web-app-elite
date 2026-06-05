/**
 * Post generator — builds SocialPost objects from schedule slots + player data.
 */
import type {
  SocialPost, ContentType, ContentVisibilityMode, Platform, AFLGame, AFLPlayerStat,
  PlannerSettings, TokenMap,
} from "../types";
import type { ScheduleSlot } from "./scheduleEngine";
import { pickHook, type HookCategory } from "./hookLibrary";
import { pickCaption, type CaptionCategory } from "./captionLibrary";
import { replaceTokens, gameLabel, nextCta, resetCtaRotation } from "./tokenEngine";
import { buildCarouselSlides } from "./carouselBuilder";
import { generateCoverPrompt, generateOpenFreeGameCoverPrompt } from "./promptGenerator";
import { selectPlayersForSlot } from "./playerSelector";
import { generateHashtags } from "./hashtagGenerator";
import { checkSafety } from "./safetyRules";

const DEFAULT_PLATFORM: Platform = "instagram";

function generateId(): string {
  return crypto.randomUUID();
}

/** Builds the set of token keys that are actually available for a given slot/players. */
function buildAvailableTokens(
  slot: ScheduleSlot,
  players: AFLPlayerStat[],
  game?: AFLGame
): Set<string> {
  const available = new Set<string>(["round", "season", "cta"]);
  if (game || slot.homeTeam) { available.add("game"); available.add("homeTeam"); available.add("awayTeam"); }
  if (players.length > 0) {
    available.add("player");
    available.add("team");
    available.add("record");
    available.add("threshold");
    available.add("l5Avg");
    available.add("statType");
    if (players[0].lastFive.length > 0) available.add("lastFive");
    if (players[0].projection != null) available.add("projection");
  }
  return available;
}

export function buildPost(
  slot: ScheduleSlot,
  settings: PlannerSettings,
  allPlayers: AFLPlayerStat[],
  games: AFLGame[],
  usedHookIds: Set<string> = new Set(),
  usedCaptionIds: Set<string> = new Set()
): SocialPost {
  const round = settings.currentRound;
  const season = settings.currentSeason;

  const game = games.find(g => g.id === slot.gameId);
  const visibilityMode: ContentVisibilityMode | undefined =
    slot.contentType === "match_stat_board" ? (slot.visibilityMode ?? "preview_blurred") : undefined;

  const cta = nextCta();

  const tokens: TokenMap = {
    round,
    game:     game ? gameLabel(game.homeTeam, game.awayTeam) : undefined,
    homeTeam: game?.homeTeam ?? slot.homeTeam,
    awayTeam: game?.awayTeam ?? slot.awayTeam,
    cta,
  };

  const hookCategory = contentTypeToHookCategory(slot.contentType, visibilityMode);

  const selectedPlayers = selectPlayersForSlot(slot, allPlayers, settings);

  if (slot.contentType === "match_stat_board") {
    const homeDisp = allPlayers.filter(p => p.team === slot.homeTeam && p.statType === "disposals").length;
    const awayDisp = allPlayers.filter(p => p.team === slot.awayTeam && p.statType === "disposals").length;
    const homeGoal = allPlayers.filter(p => p.team === slot.homeTeam && p.statType === "goals").length;
    const awayGoal = allPlayers.filter(p => p.team === slot.awayTeam && p.statType === "goals").length;
    console.log(`[PostGenerator] match_stat_board ${slot.homeTeam} v ${slot.awayTeam}`, {
      totalPlayers: allPlayers.length,
      homeDisp, awayDisp, homeGoal, awayGoal,
      selected: selectedPlayers.length,
    });
  }

  const needsPlayers = slot.contentType === "player_spotlight" || slot.contentType === "player_spotlight_duo";
  const needsGame = slot.contentType === "match_stat_board";

  // Fallback warnings for missing required data
  const noPlayersWarning = needsPlayers && selectedPlayers.length === 0
    ? "Select a player before marking this post ready."
    : null;
  const noGameWarning = needsGame && !game && !slot.homeTeam
    ? "Select a game before marking this post ready."
    : null;

  if (selectedPlayers.length > 0) {
    const p = selectedPlayers[0];
    tokens.player    = p.playerName;
    tokens.team      = p.team;
    tokens.record    = p.recordLabel;
    tokens.threshold = p.thresholdLabel;
    tokens.l5Avg     = p.l5Avg.toFixed(1);
    tokens.lastFive  = p.lastFive.join(" · ");
    tokens.statType  = p.statType;
  }

  const availableTokens = buildAvailableTokens(slot, selectedPlayers, game);

  // Use product category if we needed players but have none
  const effectiveHookCategory = noPlayersWarning ? ("product" as HookCategory) : hookCategory;
  const hook    = pickHook(effectiveHookCategory, usedHookIds, availableTokens);
  const caption = pickCaption(effectiveHookCategory as CaptionCategory, usedCaptionIds, availableTokens);
  const hookText    = replaceTokens(hook.template, tokens);
  const captionText = replaceTokens(caption.template, tokens);
  const shortCaption = `${hookText}\n\n${cta}`;
  const title       = buildTitle(slot, tokens, game, noPlayersWarning != null, noGameWarning != null);
  const hashtags    = generateHashtags(slot.contentType, game, selectedPlayers);
  const carouselSlides = buildCarouselSlides(slot, selectedPlayers, tokens, settings);

  const imagePrompt = visibilityMode === "open_free_game"
    ? generateOpenFreeGameCoverPrompt(slot.homeTeam ?? "", slot.awayTeam ?? "")
    : generateCoverPrompt(slot.contentType, game ?? undefined, selectedPlayers);

  const safetyResult = checkSafety(`${hookText} ${captionText}`);
  const warnings = [
    ...(noPlayersWarning ? [noPlayersWarning] : []),
    ...(noGameWarning ? [noGameWarning] : []),
    ...safetyResult.flags.map(f =>
      f.type === "banned"
        ? `Banned word: "${f.word}"`
        : f.suggestion ?? `Caution: "${f.word}"`
    ),
  ];

  const visibilityBadge = visibilityMode === "open_free_game"
    ? "Free Game Board"
    : visibilityMode === "preview_blurred"
    ? "Preview"
    : undefined;

  const now = new Date().toISOString();

  return {
    id: generateId(),
    round,
    season,
    date: slot.date,
    dayOfWeek: slot.day,
    contentType: slot.contentType,
    gameId: slot.gameId,
    homeTeam: slot.homeTeam,
    awayTeam: slot.awayTeam,
    title,
    hook: hookText,
    caption: captionText,
    shortCaption,
    hashtags,
    imagePrompt,
    carouselSlides,
    status: "draft",
    platform: DEFAULT_PLATFORM,
    warnings,
    selectedPlayers,
    visibilityMode,
    visibilityBadge,
    createdAt: now,
    updatedAt: now,
    usedHookId: hook.id,
    usedCaptionId: caption.id,
  };
}

export function buildWeekPosts(
  slots: ScheduleSlot[],
  settings: PlannerSettings,
  allPlayers: AFLPlayerStat[],
  games: AFLGame[]
): SocialPost[] {
  resetCtaRotation();
  const usedHookIds = new Set<string>();
  const usedCaptionIds = new Set<string>();
  const posts: SocialPost[] = [];

  console.group("[PostGenerator] buildWeekPosts");
  console.log("games", games.length, games[0]);
  console.log("players", allPlayers.length, allPlayers[0]);
  console.log("slots", slots.length, slots.map(s => `${s.day}/${s.contentType}/${s.homeTeam ?? ""}v${s.awayTeam ?? ""}`));
  console.groupEnd();

  for (const slot of slots) {
    const post = buildPost(slot, settings, allPlayers, games, usedHookIds, usedCaptionIds);
    if (post.usedHookId) usedHookIds.add(post.usedHookId);
    if (post.usedCaptionId) usedCaptionIds.add(post.usedCaptionId);
    posts.push(post);
  }

  return posts;
}

function buildTitle(
  slot: ScheduleSlot,
  tokens: TokenMap,
  game?: AFLGame,
  missingPlayers?: boolean,
  missingGame?: boolean
): string {
  const round = tokens.round ?? "";
  switch (slot.contentType) {
    case "match_stat_board": {
      if (missingGame) return "Game selection required";
      const base = game ? `${game.homeTeam} v ${game.awayTeam} — R${round}` : `Round ${round} Match Board`;
      if (slot.visibilityMode === "open_free_game") return `${base} [Free Board]`;
      if (slot.visibilityMode === "preview_blurred") return `${base} [Preview]`;
      return base;
    }
    case "player_spotlight":
      if (missingPlayers) return "Player selection required";
      return tokens.player ? `${tokens.player} — Form Watch` : "Player Spotlight";
    case "player_spotlight_duo":
      if (missingPlayers) return "Player selection required";
      return "Player Duo Spotlight";
    case "round_review":
      return `Round ${round} Review`;
    case "round_ahead_watch":
      return `Round ${round} Form Watch`;
    case "product_education":
      return "How to Read the Board";
    case "story_extra":
      return "Story Extra";
  }
}

function contentTypeToHookCategory(
  ct: ContentType,
  visibilityMode?: ContentVisibilityMode
): HookCategory {
  if (ct === "match_stat_board") {
    if (visibilityMode === "open_free_game") return "free_game_board";
    if (visibilityMode === "preview_blurred") return "preview_game";
    return "match_board";
  }
  const map: Record<ContentType, HookCategory> = {
    match_stat_board:     "match_board",
    player_spotlight:     "player_spotlight",
    player_spotlight_duo: "player_spotlight",
    round_review:         "round_review",
    round_ahead_watch:    "round_ahead",
    product_education:    "product",
    story_extra:          "match_board",
  };
  return map[ct];
}
