/**
 * Serialise SocialPost ↔ social_content_posts DB row.
 */
import type {
  SocialPost, AFLGame, AFLPlayerStat,
  ContentType, DayOfWeek, Platform, PostStatus,
  CarouselSlide, ConfidenceTier, PlayerAvailabilityStatus,
  ReferenceScreenshot,
} from "../types";

// ─── UUID validation ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// ─── DB row type (matches social_content_posts columns) ──────────────────────

export interface DbPost {
  id: string;
  client_post_key: string | null;
  round: number | null;
  season: number | null;
  date: string;
  scheduled_at: string | null;
  day_of_week: string;
  content_type: string;
  game_id: string | null;
  game_key: string | null;
  home_team: string | null;
  away_team: string | null;
  title: string;
  hook: string;
  caption: string;
  short_caption: string;
  hashtags: string[];
  image_prompt: string;
  carousel_slides: unknown;
  selected_players: unknown;
  warnings: string[];
  status: string;
  platform: string;
  used_hook_id: string | null;
  used_caption_id: string | null;
  prompt_mode: string | null;
  full_carousel_prompt: string | null;
  carousel_prompt_package: string | null;
  full_slide_text_package: string | null;
  background_prompt_package: string | null;
  reference_screenshots: unknown;
  match_board_rows: unknown;
  match_board_data_version: string | null;
  match_board_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── DB game row type ─────────────────────────────────────────────────────────

export interface DbGame {
  id: string;
  round: number;
  season: number;
  start_time: string;
  date: string;
  day_of_week: string;
  home_team: string;
  away_team: string;
  venue: string;
  status: string;
  is_thursday_game: boolean;
  is_friday_game: boolean;
  is_saturday_game: boolean;
  is_sunday_game: boolean;
}

// ─── DB player stat row ───────────────────────────────────────────────────────

export interface DbPlayerStat {
  id: string;
  player_id: string;
  player_name: string;
  team: string;
  stat_type: string;
  threshold: number;
  threshold_label: string;
  games_met: number;
  games_played: number;
  record_label: string;
  percent: number;
  l5_avg: number;
  projection: number;
  last_five: number[];
  confidence_tier: string;
  include_in_free_post: boolean;
  // Canonical player status from player_rankings_cache
  player_status: string | null;
  manual_status: string | null;
  is_available: boolean | null;
  all_threshold_hit_rates: Record<string, { hits: number; games: number; rate: number }> | null;
}

// ─── Converters ───────────────────────────────────────────────────────────────

export function dbGameToAFLGame(row: DbGame): AFLGame {
  const day = normaliseDayOfWeek(row.day_of_week);
  return {
    id: row.id,
    round: row.round,
    season: row.season,
    startTime: row.start_time,
    date: row.date,
    dayOfWeek: day,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    venue: row.venue,
    status: row.status as AFLGame["status"],
    isThursdayGame: row.is_thursday_game,
    isFridayGame: row.is_friday_game,
    isSaturdayGame: row.is_saturday_game,
    isSundayGame: row.is_sunday_game,
  };
}

export function dbStatToAFLPlayerStat(row: DbPlayerStat): AFLPlayerStat {
  const availabilityStatus = resolveAvailabilityStatus(row.player_status, row.is_available);
  console.debug("[dbStatToAFLPlayerStat]", row.player_name, row.stat_type, row.threshold_label, {
    player_status: row.player_status,
    manual_status: row.manual_status,
    is_available: row.is_available,
    resolved: availabilityStatus,
    last_five: row.last_five,
    l5_avg: row.l5_avg,
    record_label: row.record_label,
  });
  return {
    id: row.id,
    playerId: row.player_id,
    playerName: row.player_name,
    team: row.team,
    opponent: "",
    gameId: "",
    statType: row.stat_type as AFLPlayerStat["statType"],
    threshold: row.threshold,
    thresholdLabel: row.threshold_label,
    gamesMet: row.games_met,
    gamesPlayed: row.games_played,
    recordLabel: row.record_label,
    percent: Number(row.percent),
    l5Avg: Number(row.l5_avg),
    projection: Number(row.projection),
    lastFive: row.last_five ?? [],
    source: "supabase",
    confidenceTier: row.confidence_tier as ConfidenceTier,
    includeInFreePost: row.include_in_free_post,
    availabilityStatus,
    availabilityReason: row.manual_status ?? null,
    expectedToPlay: row.is_available ?? true,
    allThresholdHitRates: row.all_threshold_hit_rates ?? null,
  };
}

export function postToDb(post: SocialPost): Omit<Partial<DbPost>, "id"> & { game_key: string | null } {
  return {
    // Never send id — let Supabase generate via gen_random_uuid()
    client_post_key: post.clientPostKey ?? post.id,
    round: post.round,
    season: post.season,
    date: post.date,
    scheduled_at: post.scheduledAt ?? null,
    day_of_week: post.dayOfWeek,
    content_type: post.contentType,
    // game_id is text column — store whatever string we have (may be non-uuid external IDs)
    game_id: post.gameId ? String(post.gameId) : null,
    game_key: post.gameId ?? null,
    home_team: post.homeTeam ?? null,
    away_team: post.awayTeam ?? null,
    title: post.title,
    hook: post.hook,
    caption: post.caption,
    short_caption: post.shortCaption,
    hashtags: post.hashtags,
    image_prompt: post.imagePrompt,
    carousel_slides: post.carouselSlides,
    selected_players: post.selectedPlayers,
    warnings: post.warnings,
    status: post.status,
    platform: post.platform,
    used_hook_id: post.usedHookId ?? null,
    used_caption_id: post.usedCaptionId ?? null,
    prompt_mode: post.promptMode ?? null,
    full_carousel_prompt: post.fullCarouselPrompt ?? null,
    carousel_prompt_package: post.carouselPromptPackage ?? null,
    full_slide_text_package: post.fullSlideTextPackage ?? null,
    background_prompt_package: post.backgroundPromptPackage ?? null,
    reference_screenshots: post.referenceScreenshots ?? [],
    match_board_rows: post.matchBoardRows ?? null,
    match_board_data_version: post.match_board_data_version ?? null,
    match_board_refreshed_at: post.match_board_refreshed_at ?? null,
  };
}

export function dbToPost(row: DbPost): SocialPost {
  return {
    id: row.id,
    clientPostKey: row.client_post_key ?? undefined,
    round: row.round ?? 1,
    season: row.season ?? 2026,
    date: row.date ?? "",
    scheduledAt: row.scheduled_at ?? undefined,
    dayOfWeek: (row.day_of_week as DayOfWeek) ?? "Mon",
    contentType: (row.content_type as ContentType) ?? "player_spotlight",
    gameId: row.game_id ?? undefined,
    homeTeam: row.home_team ?? undefined,
    awayTeam: row.away_team ?? undefined,
    title: row.title,
    hook: row.hook,
    caption: row.caption,
    shortCaption: row.short_caption,
    hashtags: row.hashtags ?? [],
    imagePrompt: row.image_prompt,
    carouselSlides: (row.carousel_slides as CarouselSlide[]) ?? [],
    selectedPlayers: (row.selected_players as AFLPlayerStat[]) ?? [],
    warnings: row.warnings ?? [],
    status: (row.status as PostStatus) ?? "draft",
    platform: (row.platform as Platform) ?? "instagram",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    usedHookId: row.used_hook_id ?? undefined,
    usedCaptionId: row.used_caption_id ?? undefined,
    promptMode: (row.prompt_mode as SocialPost["promptMode"]) ?? undefined,
    fullCarouselPrompt: row.full_carousel_prompt ?? undefined,
    carouselPromptPackage: row.carousel_prompt_package ?? undefined,
    fullSlideTextPackage: row.full_slide_text_package ?? undefined,
    backgroundPromptPackage: row.background_prompt_package ?? undefined,
    referenceScreenshots: (row.reference_screenshots as ReferenceScreenshot[]) ?? [],
    matchBoardRows: (row.match_board_rows as SocialPost["matchBoardRows"]) ?? undefined,
    match_board_data_version: row.match_board_data_version ?? undefined,
    match_board_refreshed_at: row.match_board_refreshed_at ?? undefined,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseDayOfWeek(raw: string): DayOfWeek {
  const map: Record<string, DayOfWeek> = {
    Mon: "Mon", Tue: "Tue", Wed: "Wed",
    Thu: "Thu", Fri: "Fri", Sat: "Sat", Sun: "Sun",
  };
  return map[raw] ?? "Mon";
}

/** Map canonical rankings-cache status values to PlayerAvailabilityStatus */
function resolveAvailabilityStatus(
  playerStatus: string | null,
  isAvailable: boolean | null,
): PlayerAvailabilityStatus {
  if (!playerStatus) {
    return isAvailable === false ? "unknown" : "available";
  }
  const s = playerStatus.toUpperCase();
  if (s === "OUT" || s === "INJURED") return "injured";
  if (s === "SUSPENDED") return "suspended";
  if (s === "TEST") return "test";
  if (s === "MANAGED") return "managed";
  if (s === "OMITTED") return "omitted";
  if (s === "DOUBTFUL") return "doubtful";
  if (s === "INACTIVE") return "inactive";
  if (s === "AVAILABLE") return "available";
  return "unknown";
}
