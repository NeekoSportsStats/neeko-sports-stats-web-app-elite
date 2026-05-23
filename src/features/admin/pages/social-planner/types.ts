/**
 * Social Post Planner — shared types.
 * Admin-only. No public exposure.
 */
import type { StatBoardPlayer, StatBoardMatch } from "@/features/afl/stat-board/types";
import type { StatBoardTeamRow } from "@/features/afl/stat-board/teamTypes";

// ─── Re-export for consumers ──────────────────────────────────────────────────

export type { StatBoardPlayer, StatBoardMatch, StatBoardTeamRow };

// ─── CIData subset ────────────────────────────────────────────────────────────

export interface CIDataSubset {
  currentRound: number;
  roundLabel: string;
  matches: StatBoardMatch[];
  disposalPlayers: StatBoardPlayer[];
  goalPlayers: StatBoardPlayer[];
  teamDisposals: StatBoardTeamRow[];
  teamGoals: StatBoardTeamRow[];
  teamScore: StatBoardTeamRow[];
  loadedAt: Date;
  /** Player IDs to exclude from post candidate pools (injured/unavailable/suspended). */
  unavailablePlayerIds?: Set<number>;
}

// ─── Enum-style union types ───────────────────────────────────────────────────

export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type PostType = "Image" | "Carousel" | "Short video";

export type PostIntent =
  | "recap"
  | "same_day_preview"
  | "cross_game_preview"
  | "pre_game"
  | "evergreen_backup";

export type PostCategory =
  | "Disposal Trend"
  | "Goal Trend"
  | "Tackle Trend"
  | "Form Mover"
  | "Team Total"
  | "Matchup Angle"
  | "Round Preview"
  | "Round Wrap"
  | "Proof Post"
  | "Education";

export type CopyTone = "clean_stats" | "punchier_social" | "short_caption";

export type StatLens = "disposals" | "goals" | "tackles" | "fantasy" | "team-total";

export type ConfidenceLevel = "High" | "Medium" | "Fallback";

export type PostAngle =
  | "Disposal form"
  | "Goal trend"
  | "Player spotlight"
  | "Match preview"
  | "Team stat edge"
  | "Fantasy watch"
  | "Proof recap"
  | "Education"
  | "Evergreen";

export type PostStatus =
  | "todo"
  | "drafted"
  | "image_needed"
  | "image_created"
  | "scheduled"
  | "posted_tiktok"
  | "posted_instagram"
  | "posted_facebook"
  | "skipped"
  | "do_not_use";

export type ScoreLabel = "Premium" | "Strong" | "Good" | "Review";

export type UrgencyLevel = "High" | "Medium" | "Low" | "Stale" | "None";

export type ComplianceStatus = "Clean" | "Needs review" | "Do not use";

// ─── Platform captions ────────────────────────────────────────────────────────

export interface PlatformCaptions {
  tiktok: string;
  instagram: string;
  facebook: string;
}

// ─── Carousel slide ───────────────────────────────────────────────────────────

export interface CarouselSlide {
  slideNumber: number;
  headline: string;
  body: string;
  visualNote: string;
}

// ─── Compliance result ────────────────────────────────────────────────────────

export interface ComplianceResult {
  status: ComplianceStatus;
  flags: string[];
}

// ─── Timing metadata ─────────────────────────────────────────────────────────

export interface PostTiming {
  countdownText: string | null;
  urgency: UrgencyLevel;
  recommendedWindowText: string;
  recommendedTimingReason: string;
}

// ─── Post quality ─────────────────────────────────────────────────────────────

export interface PostQuality {
  score: number;
  label: ScoreLabel;
  reason: string;
  useRecommendation: "Use" | "Use with caution" | "Do not use";
  useReason: string;
}

// ─── Social post ─────────────────────────────────────────────────────────────

export interface SocialPost {
  id: string;
  day: DayOfWeek;
  postNumber: 1 | 2 | 3;
  postTime: string;
  type: PostType;
  category: PostCategory;
  intent: PostIntent;
  statLens: StatLens;
  confidence: ConfidenceLevel;
  angle: PostAngle;
  title: string;
  content: string;
  statsShown: string[];
  onScreenText: string;
  caption: string;
  hashtags: string[];
  suggestedVisual: string;
  imageDescription: string;
  aiImagePrompt: string;
  platformCaptions: PlatformCaptions;
  voiceoverScript: string;
  carouselSlides: CarouselSlide[];
  hookOptions: string[];
  thumbnailOptions: string[];
  ctaLine: string;
  compliance: ComplianceResult;
  quality: PostQuality;
  timing: PostTiming;
  dataScope: string;
  targetGame: string | null;
  targetGameStatus: "upcoming" | "completed" | "any" | null;
  fallbackWarning: string | null;
  playerNames: string[];
  teamNames: string[];
  thresholdLabel: string;
  isBackup: boolean;
  tone: CopyTone;
}
