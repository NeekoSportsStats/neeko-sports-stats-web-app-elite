/**
 * Post generator — builds SocialPost objects from schedule slots + player data.
 */
import type {
  SocialPost, ContentType, Platform, AFLGame, AFLPlayerStat,
  PlannerSettings, TokenMap,
} from "../types";
import type { ScheduleSlot } from "./scheduleEngine";
import { pickHook } from "./hookLibrary";
import { pickCaption } from "./captionLibrary";
import { replaceTokens, gameLabel } from "./tokenEngine";
import { buildCarouselSlides } from "./carouselBuilder";
import { generateCoverPrompt } from "./promptGenerator";
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
  const { round, season } = settings;
  const game = games.find(g => g.id === slot.gameId);

  const tokens: TokenMap = {
    round,
    game:     game ? gameLabel(game.homeTeam, game.awayTeam) : undefined,
    homeTeam: game?.homeTeam,
    awayTeam: game?.awayTeam,
    cta:      CTA,
  };

  const hookCategory = contentTypeToHookCategory(slot.contentType);
  const hook = pickHook(hookCategory, usedHookIds);
  const caption = pickCaption(hookCategory, usedCaptionIds);

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
  const imagePrompt = generateCoverPrompt(slot.contentType, game, selectedPlayers);

  const safetyResult = checkSafety(`${hookText} ${captionText}`);
  const warnings = safetyResult.flags.map(f =>
    f.type === "banned"
      ? `Banned word: "${f.word}"`
      : f.suggestion ?? `Caution: "${f.word}"`
  );

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
    case "match_stat_board":
      return game ? `${game.homeTeam} v ${game.awayTeam} — R${round}` : `Round ${round} Match Board`;
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

function contentTypeToHookCategory(ct: ContentType): Parameters<typeof pickHook>[0] {
  const map: Record<ContentType, Parameters<typeof pickHook>[0]> = {
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
