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
import { replaceTokens, gameLabel } from "./tokenEngine";
import { buildCarouselSlides } from "./carouselBuilder";
import { generateCoverPrompt, generateOpenFreeGameCoverPrompt } from "./promptGenerator";
import { selectPlayersForSlot } from "./playerSelector";
import { generateHashtags } from "./hashtagGenerator";
import { checkSafety } from "./safetyRules";

const DEFAULT_PLATFORM: Platform = "instagram";
const CTA = "See the full board at neekostatistics.com.au";

function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function buildPost(
  slot: ScheduleSlot,
  settings: PlannerSettings,
  allPlayers: AFLPlayerStat[],
  games: AFLGame[],
  usedHookIds: Set<string> = new Set(),
  usedCaptionIds: Set<string> = new Set()
): SocialPost {
  // Use currentRound/currentSeason (not round/season — those don't exist on PlannerSettings)
  const round = settings.currentRound;
  const season = settings.currentSeason;

  const game = games.find(g => g.id === slot.gameId);
  const visibilityMode: ContentVisibilityMode | undefined =
    slot.contentType === "match_stat_board" ? (slot.visibilityMode ?? "preview_blurred") : undefined;

  const tokens: TokenMap = {
    round,
    game:     game ? gameLabel(game.homeTeam, game.awayTeam) : undefined,
    homeTeam: game?.homeTeam ?? slot.homeTeam,
    awayTeam: game?.awayTeam ?? slot.awayTeam,
    cta:      CTA,
  };

  const hookCategory = contentTypeToHookCategory(slot.contentType, visibilityMode);
  const hook = pickHook(hookCategory, usedHookIds);
  const caption = pickCaption(hookCategory as CaptionCategory, usedCaptionIds);

  const selectedPlayers = selectPlayersForSlot(slot, allPlayers, settings);

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

  const hookText    = replaceTokens(hook.template, tokens);
  const captionText = replaceTokens(caption.template, tokens);
  const shortCaption = `${hookText}\n\n${CTA}`;
  const title       = buildTitle(slot, tokens, game);
  const hashtags    = generateHashtags(slot.contentType, game, selectedPlayers);
  const carouselSlides = buildCarouselSlides(slot, selectedPlayers, tokens, settings);

  const imagePrompt = visibilityMode === "open_free_game"
    ? generateOpenFreeGameCoverPrompt(slot.homeTeam ?? "", slot.awayTeam ?? "")
    : generateCoverPrompt(slot.contentType, game ?? undefined, selectedPlayers);

  const safetyResult = checkSafety(`${hookText} ${captionText}`);
  const warnings = safetyResult.flags.map(f =>
    f.type === "banned"
      ? `Banned word: "${f.word}"`
      : f.suggestion ?? `Caution: "${f.word}"`
  );

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
  const usedHookIds = new Set<string>();
  const usedCaptionIds = new Set<string>();
  const posts: SocialPost[] = [];

  for (const slot of slots) {
    const post = buildPost(slot, settings, allPlayers, games, usedHookIds, usedCaptionIds);
    if (post.usedHookId) usedHookIds.add(post.usedHookId);
    if (post.usedCaptionId) usedCaptionIds.add(post.usedCaptionId);
    posts.push(post);
  }

  return posts;
}

function buildTitle(slot: ScheduleSlot, tokens: TokenMap, game?: AFLGame): string {
  const round = tokens.round ?? "";
  switch (slot.contentType) {
    case "match_stat_board": {
      const base = game ? `${game.homeTeam} v ${game.awayTeam} — R${round}` : `Round ${round} Match Board`;
      if (slot.visibilityMode === "open_free_game") return `${base} [Free Board]`;
      if (slot.visibilityMode === "preview_blurred") return `${base} [Preview]`;
      return base;
    }
    case "player_spotlight":
      return tokens.player ? `${tokens.player} — Form Watch` : "Player Spotlight";
    case "player_spotlight_duo":
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
