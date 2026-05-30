/**
 * Post Enrichment — admin-only.
 *
 * Takes a partially-built SocialPost (from gamePickPostKit or weekly builders)
 * and fills: angle, aiImagePrompt, aiCarouselPromptPack, carouselSlides,
 * platformCaptions, voiceoverScript, thumbnailOptions, ctaLine, compliance,
 * quality, timing.
 *
 * Part 9 fix: aiCarouselPromptPack generates the full carousel:
 *   SLIDE 1 COVER + one prompt per player in statsShown + FINAL CTA + GLOBAL STYLE.
 *   Per-player prompts use each player's true threshold from playerThresholds map.
 *
 * Part 10 fix: voiceover and hook language for mixed posts uses
 *   "disposal trends to watch" — never "20+ disposals" for mixed posts.
 *   Goal watchlist-tier posts say "watchlist" not "consistent performers".
 *
 * Part 12 fix: carouselSlides are always structured CarouselSlide objects —
 *   never raw objects rendered directly as React children.
 */
import type {
  SocialPost,
  AiCarouselPromptPack,
  CarouselSlide,
  ComplianceResult,
  PostQuality,
  PostTiming,
  PlatformCaptions,
  PostAngle,
} from "./types";
import type { StatBoardMatch } from "@/features/afl/stat-board/types";

// ─── Angle resolver ───────────────────────────────────────────────────────────

function resolveAngle(post: Partial<SocialPost>): PostAngle {
  const lens = post.statLens;
  const isMixed = post.isMixedDisposalWatch;
  if (lens === "disposals") return isMixed ? "Player spotlight" : "Disposal form";
  if (lens === "goals") return "Goal trend";
  if (lens === "team-total") return "Team stat edge";
  if (lens === "fantasy") return "Fantasy watch";
  return "Match preview";
}

// ─── AI image prompt ──────────────────────────────────────────────────────────

function buildAiImagePrompt(post: Partial<SocialPost>): string {
  const names = (post.playerNames ?? []).slice(0, 5).join(", ");
  const label = post.thresholdLabel ?? "Stats";
  const game = post.targetGame ?? "AFL";
  return (
    `Dark premium AFL stat graphic. ${game}. Topic: ${label}. ` +
    `Players: ${names || "—"}. ` +
    `Clean grid layout, team colour accents, white stat text, ` +
    `Neeko Sports Stats logo bottom-right. No betting language. No odds.`
  );
}

// ─── AI carousel prompt pack (Part 9) ────────────────────────────────────────

/**
 * Generates a full carousel prompt pack:
 *   coverPrompt   — SLIDE 1 cover card
 *   slidePrompts  — one prompt per player (uses each player's TRUE threshold)
 *   endPrompt     — final CTA slide
 *   combinedPrompt — single unified brief for multi-slide tools
 *
 * Never produces a single-slide pack. Even thin posts get cover + at least one
 * player slide + CTA.
 */
function buildAiCarouselPromptPack(post: Partial<SocialPost>): AiCarouselPromptPack {
  const game = post.targetGame ?? "AFL";
  const label = post.thresholdLabel ?? "Stats";
  const isMixed = post.isMixedDisposalWatch ?? false;
  const playerNames = post.playerNames ?? [];
  const statsShown = post.statsShown ?? [];
  const playerThresholds = post.playerThresholds ?? {};

  // Resolve display label for cover — mixed posts must NOT say "20+ Disposals"
  const coverLabel = isMixed ? "Disposal Watch" : label;

  const coverPrompt =
    `SLIDE 1 — COVER CARD: Dark premium background, bold headline: "${game} — ${coverLabel}". ` +
    `Subtext: "Player form data". Neeko Sports Stats logo. No stats yet — this is the hook.`;

  // One slide per player in statsShown
  const slidePrompts = statsShown.map((statLine, i) => {
    const playerName = playerNames[i] ?? `Player ${i + 1}`;
    // Use the per-player threshold if available, else fall back to post-level label
    const thr = playerThresholds[playerName];
    const thrLabel = thr != null ? `${thr}+` : (isMixed ? "disposals" : label);
    return (
      `SLIDE ${i + 2} — PLAYER CARD: "${playerName}" — ${thrLabel}. ` +
      `Stat line: "${statLine}". ` +
      `Dark card, name prominent, stat line below, hit rate badge, team accent colour. ` +
      `No betting language. Clean, data-driven.`
    );
  });

  const endPrompt =
    `SLIDE ${statsShown.length + 2} — CTA CARD: "Follow Neeko Sports Stats for weekly AFL data." ` +
    `Dark background, clean branding. No stats. Call to action only.`;

  const globalStyle =
    `GLOBAL STYLE (apply to all slides): Dark background (#111 or #0d0d0d), ` +
    `white text, team-specific accent colours, Neeko Sports Stats branding. ` +
    `No gambling language. No odds. No "bet" or "tip" terminology. ` +
    `Consistent font — bold for headlines, regular for stats. ` +
    `Slide aspect ratio: 1:1 (Instagram) or 9:16 (TikTok / Stories).`;

  const combinedPrompt = [
    `Create a ${statsShown.length + 2}-slide carousel for ${game} — ${coverLabel}.`,
    "",
    coverPrompt,
    ...slidePrompts,
    endPrompt,
    "",
    globalStyle,
  ].join("\n");

  return {
    format: `${statsShown.length + 2}-slide carousel`,
    coverPrompt,
    slidePrompts,
    endPrompt,
    combinedPrompt,
  };
}

// ─── Carousel slides (Part 12) ────────────────────────────────────────────────

/**
 * Builds structured CarouselSlide objects — never raw untyped objects.
 * React consumers MUST use slide.headline, slide.body, slide.visualNote — NOT {slide}.
 */
function buildCarouselSlides(post: Partial<SocialPost>): CarouselSlide[] {
  const game = post.targetGame ?? "AFL";
  const label = post.thresholdLabel ?? "Stats";
  const isMixed = post.isMixedDisposalWatch ?? false;
  const coverLabel = isMixed ? "Disposal Watch" : label;
  const playerNames = post.playerNames ?? [];
  const statsShown = post.statsShown ?? [];
  const playerThresholds = post.playerThresholds ?? {};

  const slides: CarouselSlide[] = [];

  // Slide 1 — Cover
  slides.push({
    slideNumber: 1,
    headline: `${game} — ${coverLabel}`,
    body: "Player form data — see the stats, make your own call.",
    visualNote: "Dark background, bold headline, Neeko Sports Stats logo. No stats yet.",
  });

  // One slide per player
  statsShown.forEach((statLine, i) => {
    const playerName = playerNames[i] ?? `Player ${i + 1}`;
    const thr = playerThresholds[playerName];
    const thrLabel = thr != null ? `${thr}+` : (isMixed ? "disposals" : label);
    slides.push({
      slideNumber: i + 2,
      headline: `${playerName} — ${thrLabel}`,
      body: statLine,
      visualNote: `Player card with name prominent, stat line, hit rate badge, team accent colour.`,
    });
  });

  // Final CTA
  slides.push({
    slideNumber: statsShown.length + 2,
    headline: "Follow Neeko Sports Stats",
    body: "Weekly AFL data. No hype. See the data. Make your own call.",
    visualNote: "Dark CTA card. Neeko branding. No stats.",
  });

  return slides;
}

// ─── Platform captions ────────────────────────────────────────────────────────

function buildPlatformCaptions(post: Partial<SocialPost>): PlatformCaptions {
  const base = post.caption ?? "";
  const hashtags = (post.hashtags ?? []).join(" ");
  const game = post.targetGame ?? "AFL";
  const label = post.thresholdLabel ?? "stats";
  const isMixed = post.isMixedDisposalWatch ?? false;

  const watchLabel = isMixed ? "disposal watch" : label.toLowerCase();

  const tiktok =
    `${base}\n\n${hashtags} #AFLTikTok #FootyData`.trim();

  const instagram =
    `${base}\n\n${hashtags}`.trim();

  const facebook =
    `${game} — ${watchLabel} data for this week. ` +
    `Scroll through each player's recent form before the game.\n\n` +
    `${base}`.trim();

  return { tiktok, instagram, facebook };
}

// ─── Voiceover script (Part 10) ───────────────────────────────────────────────

/**
 * For mixed posts: uses "disposal trends to watch" — never "20+ disposals".
 * For goal watchlist posts (post.confidence === "Medium" on goals): uses "watchlist".
 * Never uses betting language.
 */
function buildVoiceoverScript(post: Partial<SocialPost>): string {
  const game = post.targetGame ?? "this match";
  const lens = post.statLens;
  const isMixed = post.isMixedDisposalWatch ?? false;
  const playerNames = post.playerNames ?? [];
  const n = playerNames.length;

  const intro = `${game} — let's look at the data before bounce.`;

  if (lens === "disposals") {
    // Part 10: mixed posts use "disposal trends" not "20+ disposals"
    const topicLabel = isMixed ? "disposal trends to watch" : "20+ disposal form";
    const middle = n > 0
      ? `Here are the ${n} players with strong ${topicLabel}: ${playerNames.slice(0, 3).join(", ")}${n > 3 ? ` and ${n - 3} more` : ""}.`
      : `We have limited disposal candidates for this game.`;
    return `${intro} ${middle} See the full data card. Numbers over guesswork.`;
  }

  if (lens === "goals") {
    // Part 10: watchlist-tier goal posts say "watchlist" not "consistent performers"
    const isWatchlist = post.confidence === "Medium" || (post.thresholdLabel ?? "").toLowerCase().includes("watch");
    const topicLabel = isWatchlist ? "players to watch for goals" : "players with strong 1+ goal form";
    const middle = n > 0
      ? `${n} ${topicLabel}: ${playerNames.slice(0, 3).join(", ")}${n > 3 ? ` and more` : ""}.`
      : `Limited goal candidates for this game.`;
    return `${intro} ${middle} See the full stat breakdown. No hype — just data.`;
  }

  if (lens === "team-total") {
    return `${intro} Team scoring data for ${game}. Season averages and recent form. Stats over gut feel.`;
  }

  // Combined / fallback
  const middle = n > 0
    ? `${n} players with strong recent form: ${playerNames.slice(0, 3).join(", ")}${n > 3 ? ` and more` : ""}.`
    : `Limited data available for this game.`;
  return `${intro} ${middle} Full stat board at Neeko Sports Stats.`;
}

// ─── Thumbnail options ────────────────────────────────────────────────────────

function buildThumbnailOptions(post: Partial<SocialPost>): string[] {
  const game = post.targetGame ?? "AFL";
  const label = post.thresholdLabel ?? "Stats";
  const isMixed = post.isMixedDisposalWatch ?? false;
  const coverLabel = isMixed ? "Disposal Watch" : label;
  const topPlayer = (post.playerNames ?? [])[0] ?? "Top Pick";

  return [
    `"${game}" bold top — "${coverLabel}" bold centre — dark background`,
    `Player spotlight: "${topPlayer}" with stat badge — team colours`,
    `"${coverLabel}" minimal text on dark — clean and modern`,
    `Split screen: both teams, "Player Form Data" label`,
    `Neeko Sports Stats logo card — "${game}" text only — curiosity hook`,
  ];
}

// ─── CTA line ─────────────────────────────────────────────────────────────────

function buildCtaLine(post: Partial<SocialPost>): string {
  const lens = post.statLens;
  if (lens === "disposals") return "Follow for weekly AFL disposal form data.";
  if (lens === "goals") return "Follow for weekly AFL goal trend data.";
  if (lens === "team-total") return "Follow for team scoring data every round.";
  return "Follow Neeko Sports Stats — AFL data every round.";
}

// ─── Compliance check ─────────────────────────────────────────────────────────

const BETTING_TERMS = [
  "bet", "wager", "odds", "tip", "tip of", "punter", "bookmaker",
  "market", "line", "value", "arb", "bankroll", "win/loss",
];

function buildCompliance(post: Partial<SocialPost>): ComplianceResult {
  const textToCheck = [
    post.caption ?? "",
    post.content ?? "",
    post.title ?? "",
    post.voiceoverScript ?? "",
    ...(post.statsShown ?? []),
  ].join(" ").toLowerCase();

  const flags: string[] = [];
  for (const term of BETTING_TERMS) {
    if (textToCheck.includes(term)) {
      flags.push(`Potential betting term: "${term}"`);
    }
  }

  // Mixed post flagged if it says "20+" in the title but isMixed is true
  if (post.isMixedDisposalWatch && (post.title ?? "").includes("20+")) {
    flags.push(`Mixed post title contains "20+" — should say "Disposal Watch" or "Mixed Disposal Watch"`);
  }

  return {
    status: flags.length > 0 ? "Needs review" : "Clean",
    flags,
  };
}

// ─── Quality score ────────────────────────────────────────────────────────────

function buildQuality(post: Partial<SocialPost>): PostQuality {
  const n = (post.playerNames ?? []).length;
  const confidence = post.confidence ?? "Fallback";
  const hasHighTier = confidence === "High";
  const isFallback = confidence === "Fallback";

  let score = 50;
  if (hasHighTier) score += 20;
  if (n >= 4) score += 15;
  else if (n >= 2) score += 5;
  if (n === 0) score -= 30;
  if (isFallback) score -= 15;
  score = Math.max(0, Math.min(100, score));

  const label =
    score >= 75 ? "Premium" :
    score >= 55 ? "Strong" :
    score >= 35 ? "Good" :
    "Review";

  const reason =
    n === 0 ? "No qualifying players — fallback content only." :
    hasHighTier ? `${n} players, High-tier confidence. Strong post.` :
    `${n} players, ${confidence} confidence.`;

  const useRecommendation =
    score >= 55 ? "Use" :
    score >= 35 ? "Use with caution" :
    "Do not use";

  const useReason =
    score >= 55 ? "Sufficient data quality for publishing." :
    score >= 35 ? "Review before publishing — thin or low-confidence data." :
    "Insufficient data — do not publish.";

  return { score, label, reason, useRecommendation, useReason };
}

// ─── Timing ───────────────────────────────────────────────────────────────────

function buildTiming(
  post: Partial<SocialPost>,
  matches: StatBoardMatch[],
): PostTiming {
  const game = post.targetGame;
  const match = game
    ? matches.find(m => m.match_label === game || m.match_label?.includes(game))
    : null;

  const now = new Date();
  let countdownText: string | null = null;
  let urgency: "High" | "Medium" | "Low" | "Stale" | "None" = "None";
  let recommendedWindowText = "Publish within 24h of game.";
  let recommendedTimingReason = "Pre-game content performs best within 2 hours of bounce.";

  if (match?.game_date) {
    const gameTime = new Date(match.game_date);
    const diffMs = gameTime.getTime() - now.getTime();
    const diffH = diffMs / (1000 * 60 * 60);

    if (diffH < 0) {
      urgency = "Stale";
      countdownText = "Game has passed.";
      recommendedWindowText = "Game already played.";
      recommendedTimingReason = "Post-game recap still has value for 48h after bounce.";
    } else if (diffH <= 2) {
      urgency = "High";
      countdownText = `< ${Math.ceil(diffH * 60)} min to bounce`;
      recommendedWindowText = "Publish immediately.";
      recommendedTimingReason = "Within 2h of bounce — peak engagement window.";
    } else if (diffH <= 24) {
      urgency = "High";
      countdownText = `${Math.floor(diffH)}h to bounce`;
      recommendedWindowText = "Publish today, before bounce.";
      recommendedTimingReason = "Same-day pre-game. High engagement expected.";
    } else if (diffH <= 72) {
      urgency = "Medium";
      countdownText = `${Math.ceil(diffH / 24)}d to game`;
      recommendedWindowText = "Publish 1–2 days before game.";
      recommendedTimingReason = "Preview window — build anticipation.";
    } else {
      urgency = "Low";
      countdownText = `${Math.ceil(diffH / 24)}d to game`;
      recommendedWindowText = "Schedule for closer to game day.";
      recommendedTimingReason = "Too early for pre-game content — hold.";
    }
  }

  return { countdownText, urgency, recommendedWindowText, recommendedTimingReason };
}

// ─── Main enrichment function ─────────────────────────────────────────────────

/**
 * Fills all computed fields on a partially-built SocialPost.
 * Input post should already have: id, day, postNumber, type, category, intent,
 * statLens, confidence, title, content, statsShown, onScreenText, caption,
 * hashtags, suggestedVisual, imageDescription, dataScope, targetGame,
 * targetGameStatus, fallbackWarning, playerNames, teamNames, thresholdLabel,
 * isBackup, tone, hookOptions.
 */
export function enrichPost(post: SocialPost, matches: StatBoardMatch[]): SocialPost {
  const angle = resolveAngle(post);
  const aiImagePrompt = buildAiImagePrompt(post);
  const aiCarouselPromptPack = buildAiCarouselPromptPack(post);
  const carouselSlides = buildCarouselSlides(post);
  const platformCaptions = buildPlatformCaptions(post);
  const voiceoverScript = buildVoiceoverScript(post);
  const thumbnailOptions = post.thumbnailOptions?.length
    ? post.thumbnailOptions
    : buildThumbnailOptions(post);
  const ctaLine = buildCtaLine(post);
  const timing = buildTiming(post, matches);
  const quality = buildQuality(post);

  // Build compliance after voiceover is set (so we can check it)
  const withVoice = { ...post, voiceoverScript };
  const compliance = buildCompliance(withVoice);

  return {
    ...post,
    angle,
    aiImagePrompt,
    aiCarouselPromptPack,
    carouselSlides,
    platformCaptions,
    voiceoverScript,
    thumbnailOptions,
    ctaLine,
    timing,
    quality,
    compliance,
    hookOptions: post.hookOptions ?? [],
  };
}
