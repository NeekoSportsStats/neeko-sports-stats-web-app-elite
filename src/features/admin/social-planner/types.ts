/**
 * AFL Content Command Centre — shared types.
 * Admin-only. No public exposure.
 */

export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

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
};

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
