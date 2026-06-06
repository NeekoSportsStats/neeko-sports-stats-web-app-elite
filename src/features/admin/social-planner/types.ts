/**
 * AFL Content Command Centre — shared types.
 * Admin-only. No public exposure.
 */

export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

// ─── Player Availability ──────────────────────────────────────────────────────

export type PlayerAvailabilityStatus =
  | "available"
  | "injured"
  | "suspended"
  | "omitted"
  | "managed"
  | "test"
  | "doubtful"
  | "inactive"
  | "unknown";

/** Statuses that should be excluded from auto-selection by default */
export const EXCLUDED_STATUSES: Set<PlayerAvailabilityStatus> = new Set([
  "injured", "suspended", "omitted", "managed", "inactive",
]);

/** Statuses that are allowed but warrant a warning */
export const WARNING_STATUSES: Set<PlayerAvailabilityStatus> = new Set([
  "test", "doubtful", "unknown",
]);

export interface PlayerAvailabilityRecord {
  id?: string;
  season: number;
  round: number;
  playerId?: string | null;
  playerName: string;
  team?: string | null;
  status: PlayerAvailabilityStatus;
  reason?: string | null;
  expectedToPlay: boolean;
  source: string;
  updatedAt?: string;
}

export type AvailabilityFilterMode = "strict" | "balanced" | "manual";

export type ContentType =
  | "match_stat_board"
  | "player_spotlight"
  | "player_spotlight_duo"
  | "round_review"
  | "round_ahead_watch"
  | "product_education"
  | "story_extra";

export type PostStatus = "draft" | "ready" | "scheduled" | "posted" | "archived";

export type Platform = "instagram" | "facebook" | "tiktok" | "threads" | "x";

export type ConfidenceTier = "elite" | "strong" | "watch" | "thin_sample";

/** How a match stat board post is surfaced to followers */
export type ContentVisibilityMode = "open_free_game" | "preview_blurred" | "manual";

/** How free game slots are selected each round */
export type FreeGameSelectionMode = "thu_fri" | "first_two" | "manual";

/** How many posts per day on weekends */
export type WeekendPostingMode = "one_per_game" | "two_max" | "stories_overflow";

export type SlideType =
  | "cover"
  | "home_disposals"
  | "away_disposals"
  | "home_goals"
  | "away_goals"
  | "player_spotlight"
  | "cta";

export type StyleMode =
  | "clean"
  | "premium"
  | "direct"
  | "educational"
  | "product_led"
  | "game_day"
  | "short_form";

export type CarouselStylePreset =
  | "premium_stats_board"
  | "editorial_poster"
  | "broadcast_graphic"
  | "minimal_luxury";

export const CAROUSEL_STYLE_PRESET_LABELS: Record<CarouselStylePreset, string> = {
  premium_stats_board: "Premium Stats Board",
  editorial_poster:    "Editorial Poster",
  broadcast_graphic:   "Broadcast Graphic",
  minimal_luxury:      "Minimal Luxury",
};

// ─── AFL Game ─────────────────────────────────────────────────────────────────

export interface AFLGame {
  id: string;
  round: number;
  season: number;
  startTime: string;       // ISO timestamp
  date: string;            // "YYYY-MM-DD"
  dayOfWeek: DayOfWeek;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  status: "scheduled" | "live" | "completed";
  isThursdayGame: boolean;
  isFridayGame: boolean;
  isSaturdayGame: boolean;
  isSundayGame: boolean;
}

// ─── Player Stat ──────────────────────────────────────────────────────────────

export interface AFLPlayerStat {
  id: string;
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  gameId: string;
  statType: "disposals" | "goals";
  threshold: number;
  thresholdLabel: string;        // e.g. "20+", "2+"
  gamesMet: number;
  gamesPlayed: number;
  recordLabel: string;           // e.g. "12/12", "9/10"
  percent: number;               // 0–100
  l5Avg: number;
  projection?: number;
  lastFive: number[];
  source: string;
  confidenceTier: ConfidenceTier;
  includeInFreePost: boolean;
  // Availability
  availabilityStatus?: PlayerAvailabilityStatus;
  availabilityReason?: string | null;
  expectedToPlay?: boolean;
  manualAvailabilityOverride?: PlayerAvailabilityStatus | null;
}

// ─── Carousel ─────────────────────────────────────────────────────────────────

export interface StatBoardRow {
  playerName: string;
  l5Avg: number;
  projection?: number;
  threshold15?: string;   // ratio like "12/12" or "—"
  threshold20?: string;
  threshold25?: string;
  threshold30?: string;
  threshold1Goal?: string;
  threshold2Goals?: string;
  threshold3Goals?: string;
  note?: string;
  blurred?: boolean;      // legacy compat — prefer displayMode
  displayMode?: "visible" | "name_only" | "blurred" | "hidden";
  /** Percentage per threshold for colour grading (0–100) */
  thresholdPercent?: number;
  gamesPlayedForGrade?: number;
}

export interface CarouselSlide {
  id: string;
  slideType: SlideType;
  title: string;
  subtitle?: string;
  rows?: StatBoardRow[];
  imagePrompt?: string;
  backgroundPrompt?: string;
  slideText?: string;
  designNotes?: string;
  // Visibility mode fields (match_stat_board only)
  visibilityMode?: ContentVisibilityMode;
  visibleRowCount?: number;
  blurredRowCount?: number;
  ctaOverlayText?: string;
  showFreeGameBadge?: boolean;
  showPreviewBadge?: boolean;
}

// ─── Social Post ──────────────────────────────────────────────────────────────

/** Selected player+stat for a spotlight post — richer than bare AFLPlayerStat */
export interface SpotlightSelection {
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  gameId: string;
  gameLabel: string;
  statType: "disposals" | "goals";
  threshold: number;
  thresholdLabel: string;
  recordLabel: string;
  l5Avg: number;
  lastFive: number[];
  projection?: number;
  availabilityStatus?: PlayerAvailabilityStatus;
  availabilityReason?: string | null;
}

export interface SocialPost {
  id: string;             // UUID once saved; crypto.randomUUID() in-memory before save
  clientPostKey?: string; // Original in-memory key preserved for stable React keys
  round: number;
  season: number;
  date: string;
  scheduledAt?: string;
  dayOfWeek: DayOfWeek;
  contentType: ContentType;
  gameId?: string;
  homeTeam?: string;
  awayTeam?: string;
  title: string;
  hook: string;
  caption: string;
  shortCaption: string;
  hashtags: string[];
  imagePrompt: string;
  carouselSlides: CarouselSlide[];
  status: PostStatus;
  platform: Platform;
  warnings: string[];
  selectedPlayers: AFLPlayerStat[];
  createdAt: string;
  updatedAt: string;
  // Player spotlight selection (player_spotlight / player_spotlight_duo)
  selectedSpotlight?: SpotlightSelection[];
  /** True when selectedSpotlight changed and imagePrompt has not been rebuilt */
  spotlightPromptStale?: boolean;
  // Visibility mode (match_stat_board only)
  visibilityMode?: ContentVisibilityMode;
  visibilityBadge?: string;
  // Prompt packages
  promptMode?: "full_graphic" | "background_only" | "template_export";
  fullCarouselPrompt?: string;
  carouselPromptPackage?: string;
  fullSlideTextPackage?: string;
  backgroundPromptPackage?: string;
  // UI-only: track which template IDs were used for dedup
  usedHookId?: string;
  usedCaptionId?: string;
  /** Aggregated admin-editable rows for match stat boards (keyed by section) */
  matchBoardRows?: {
    homeDisposals: import("./lib/rowAggregator").MatchBoardPlayerRow[];
    awayDisposals: import("./lib/rowAggregator").MatchBoardPlayerRow[];
    homeGoals:     import("./lib/rowAggregator").MatchBoardPlayerRow[];
    awayGoals:     import("./lib/rowAggregator").MatchBoardPlayerRow[];
  };
  /** Reference screenshots selected for this post's AI prompts */
  referenceScreenshots?: ReferenceScreenshot[];
  /** True for match boards that belong to the current round but fall on a planning day (Mon/Tue/Wed) */
  isRoundOverflow?: boolean;
  /** True for round_review posts where the final game of the round has not yet been completed */
  roundReviewPending?: boolean;
  /** Aggregation version stamp — "match_board_aggregated_v2" = post-fix path */
  match_board_data_version?: string;
  /** ISO timestamp of last manual/auto refresh of matchBoardRows */
  match_board_refreshed_at?: string;
  /** Visual style preset for AI carousel prompt generation */
  carouselStylePreset?: CarouselStylePreset;
}

// ─── Planner Settings ─────────────────────────────────────────────────────────

export interface PlannerSettings {
  defaultDailyPosts: number;           // 2
  weekendExtraPosts: boolean;          // true = auto-add game boards on Sat/Sun
  maxDisposalRowsPerTeam: number;      // 5
  maxGoalRowsPerTeam: number;          // 4
  showProjections: boolean;            // false
  showPercentages: boolean;            // false (show ratios as hero)
  ctaRequired: boolean;                // true
  styleMode: StyleMode;
  currentRound: number;
  currentSeason: number;
  // Free game / preview blurred system
  freeGamesPerRound: number;           // 2 — how many games get open_free_game treatment
  freeGameSelectionMode: FreeGameSelectionMode; // "thu_fri" = Thu/Fri games, "first_two", "manual"
  thuFriMaxRows: number;               // 10 — max player rows for open free game boards
  satSunVisibleRows: number;           // 3 — visible rows before blur on weekend boards
  satSunTotalRows: number;             // 8 — total rows including blurred ones
  weekendPostingMode: WeekendPostingMode; // "one_per_game" = one post per game, no forced fill
  ctaOverlayText: string;              // text on the blur overlay CTA
  showFreeGameBadge: boolean;          // show "Free Game Board" badge on cover
  showPreviewBadge: boolean;           // show "Preview — full board at Neeko" badge
  // Availability filtering
  availabilityFilterMode: AvailabilityFilterMode; // "balanced" default
  excludeInjured: boolean;             // true
  excludeSuspended: boolean;           // true
  excludeOmitted: boolean;             // true
  excludeManaged: boolean;             // true
  excludeInactive: boolean;            // true
  excludeDoubtfulFromAuto: boolean;    // true — doubtful not auto-selected
  allowManualAvailabilityOverride: boolean; // true — admin can manually include
  showUnknownAvailabilityWarning: boolean;  // true
  screenshotRefMode: ScreenshotRefMode;     // "product_education_only" default
}

export const DEFAULT_SETTINGS: PlannerSettings = {
  defaultDailyPosts: 2,
  weekendExtraPosts: true,
  maxDisposalRowsPerTeam: 5,
  maxGoalRowsPerTeam: 4,
  showProjections: false,
  showPercentages: false,
  ctaRequired: true,
  styleMode: "clean",
  currentRound: 1,
  currentSeason: 2026,
  freeGamesPerRound: 2,
  freeGameSelectionMode: "thu_fri",
  thuFriMaxRows: 10,
  satSunVisibleRows: 3,
  satSunTotalRows: 8,
  weekendPostingMode: "one_per_game",
  ctaOverlayText: "See the full board at neekostats.com.au",
  showFreeGameBadge: true,
  showPreviewBadge: true,
  // Availability filtering defaults
  availabilityFilterMode: "balanced",
  excludeInjured: true,
  excludeSuspended: true,
  excludeOmitted: true,
  excludeManaged: true,
  excludeInactive: true,
  excludeDoubtfulFromAuto: true,
  allowManualAvailabilityOverride: true,
  showUnknownAvailabilityWarning: true,
  screenshotRefMode: "product_education_only",
};

// ─── Reference Screenshots ────────────────────────────────────────────────────

export type ScreenshotTag =
  | "mobile_stat_board"
  | "player_card"
  | "hit_rate_table"
  | "recent_form_strip"
  | "product_education"
  | "match_board"
  | "player_spotlight";

export interface ReferenceScreenshot {
  id: string;
  url: string;
  label?: string;
  tags: ScreenshotTag[];
  uploadedAt: string;
}

/** Controls when screenshot style reference language is injected into prompts */
export type ScreenshotRefMode = "off" | "product_education_only" | "all_board_style";

// ─── Token map ────────────────────────────────────────────────────────────────

export interface TokenMap {
  round?: string | number;
  game?: string;
  homeTeam?: string;
  awayTeam?: string;
  player?: string;
  team?: string;
  record?: string;
  threshold?: string;
  l5Avg?: string | number;
  lastFive?: string;
  statType?: string;
  contentTitle?: string;
  cta?: string;
}
