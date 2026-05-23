/**
 * Post enrichment — pure functions that augment a raw SocialPost.
 * No React. No Supabase. No side effects.
 */
import type {
  SocialPost,
  PostQuality,
  PostTiming,
  ComplianceResult,
  PlatformCaptions,
  CarouselSlide,
  PostAngle,
  ScoreLabel,
  UrgencyLevel,
} from "./types";

// ─── CTA rotation pool ────────────────────────────────────────────────────────

const CTA_POOL = [
  "See the full board before bounce.",
  "Use the stats. Make your own call.",
  "Full stat board live now.",
  "Check every player trend in one place.",
  "Numbers over guesswork.",
  "Stats over gut feel.",
  "All player trends in one board.",
  "The data is there — you decide.",
  "Full board at NeekoSportsStats.com.au.",
  "See where every player sits before the game.",
];

export function pickCta(post: SocialPost): string {
  // Deterministic rotation based on post ID numeric suffix
  const n = parseInt(post.id.replace(/\D/g, "").slice(-2) || "0", 10);
  return CTA_POOL[n % CTA_POOL.length];
}

// ─── Compliance checker ───────────────────────────────────────────────────────

const BANNED_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bbet(s|ting|ted)?\b/gi,             reason: "contains 'bet'" },
  { re: /\bodds\b/gi,                          reason: "contains 'odds'" },
  { re: /\bgamble?\b|\bwager\b/gi,             reason: "gambling language" },
  { re: /\b(same.?game.?multi|SGM)\b/gi,       reason: "SGM/multi language" },
  { re: /\bbanker\b|\block\b\s+pick/gi,        reason: "lock/banker pick language" },
  { re: /\bsure.?thing\b|\bguarantee\b/gi,     reason: "certainty language" },
  { re: /\bcash.?out\b|\bpayout\b/gi,          reason: "cashout/payout language" },
  { re: /\bpunt(ing)?\b/gi,                    reason: "punt language" },
  { re: /\b(win|lose|losing)\b/gi,             reason: "win/lose outcome framing" },
  { re: /\b(tip|tips|tipping)\b/gi,            reason: "tipping language" },
  { re: /\b(best|top)\s+(pick|play|bet)\b/gi,  reason: "pick/play/bet framing" },
  { re: /\bshould\s+(hit|get|score|kick)\b/gi, reason: "predictive 'should' language" },
];

export function checkCompliance(post: SocialPost): ComplianceResult {
  const scanText = [post.content, post.caption, post.statsShown.join(" ")].join(" ");
  const flags: string[] = [];
  for (const { re, reason } of BANNED_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(scanText)) flags.push(reason);
  }
  const status =
    flags.length === 0 ? "Clean" :
    flags.length <= 2  ? "Needs review" :
    "Do not use";
  return { status, flags };
}

// ─── Post quality score ───────────────────────────────────────────────────────

export function scorePost(post: SocialPost): PostQuality {
  let score = 0;
  const reasons: string[] = [];

  // Confidence (30 pts)
  if (post.confidence === "High")          { score += 30; reasons.push("high confidence data"); }
  else if (post.confidence === "Medium")   { score += 18; reasons.push("medium confidence data"); }
  else                                     { score += 5;  reasons.push("fallback data only"); }

  // Player pool depth (20 pts)
  const n = post.playerNames.length;
  if (n >= 5)      { score += 20; reasons.push("5+ players"); }
  else if (n >= 4) { score += 16; }
  else if (n >= 3) { score += 12; reasons.push("only 3 players — consider expanding"); }
  else if (n >= 2) { score += 7;  reasons.push("only 2 players — minimal pool"); }
  else if (n === 1){ score += 3;  reasons.push("single-player post"); }
  else             {              reasons.push("no named players"); }

  // Game specificity (20 pts)
  if (post.targetGameStatus === "upcoming" && post.targetGame) {
    score += 20; reasons.push("specific upcoming game");
  } else if (post.targetGameStatus === "completed") {
    score += 15; reasons.push("completed game data");
  } else if (post.targetGameStatus === "any") {
    score += 8;
  }

  // No fallback warning (15 pts)
  if (!post.fallbackWarning) {
    score += 15; reasons.push("no fallback warnings");
  } else {
    reasons.push("has fallback warning");
  }

  // Post type bonus (10 pts)
  if (post.type === "Carousel")     score += 10;
  else if (post.type === "Short video") score += 8;
  else                              score += 6;

  // Intent bonus (5 pts)
  if (post.intent === "pre_game" || post.intent === "same_day_preview") {
    score += 5; reasons.push("time-sensitive pre-game");
  } else if (post.intent === "recap") {
    score += 4;
  } else {
    score += 2;
  }

  score = Math.min(100, score);

  const label: ScoreLabel =
    score >= 85 ? "Premium" :
    score >= 65 ? "Strong"  :
    score >= 45 ? "Good"    : "Review";

  const useRecommendation =
    post.fallbackWarning && post.playerNames.length < 2 ? "Do not use" :
    score < 45 ? "Use with caution" :
    "Use";

  const useReason =
    useRecommendation === "Do not use"
      ? "Insufficient player data or fallback warning active."
      : useRecommendation === "Use with caution"
      ? "Low score — consider checking player availability or data freshness."
      : reasons.slice(0, 3).join(", ") + ".";

  return {
    score,
    label,
    reason: reasons.slice(0, 4).join("; "),
    useRecommendation,
    useReason,
  };
}

// ─── Timing metadata ──────────────────────────────────────────────────────────

export function buildTiming(post: SocialPost, matches: { game_date: string }[]): import("./types").PostTiming {
  const now = Date.now();
  const upcomingMs = matches
    .map(m => new Date(m.game_date).getTime())
    .filter(t => t > now)
    .sort((a, b) => a - b);

  const firstGameMs = upcomingMs[0] ?? null;
  let countdownText: string | null = null;
  let urgency: UrgencyLevel = "None";
  let recommendedWindowText = "Any time";
  let recommendedTimingReason = "No time-sensitive constraint.";

  if (firstGameMs) {
    const diffMs = firstGameMs - now;
    const diffH = Math.floor(diffMs / 3600000);
    const diffM = Math.floor((diffMs % 3600000) / 60000);

    if (diffMs <= 0) {
      countdownText = "Game has started";
      urgency = "Stale";
      recommendedWindowText = "Missed window";
      recommendedTimingReason = "Game already underway — preview posts no longer appropriate.";
    } else if (diffH < 1) {
      countdownText = `${diffM}m until bounce`;
      urgency = "High";
      recommendedWindowText = "Post now";
      recommendedTimingReason = "Less than 1 hour to bounce — post immediately.";
    } else if (diffH < 2) {
      countdownText = `${diffH}h ${diffM}m until bounce`;
      urgency = "High";
      recommendedWindowText = "Post in next 30–60 minutes";
      recommendedTimingReason = "Within 2 hours of bounce — high-urgency window.";
    } else if (diffH < 6) {
      countdownText = `${diffH}h ${diffM}m until bounce`;
      urgency = "Medium";
      recommendedWindowText = `Post 60–90 min before bounce (~${new Date(firstGameMs - 5400000).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })})`;
      recommendedTimingReason = "Same-day game — ideal to post 60–90 min before first bounce.";
    } else {
      countdownText = `${diffH}h until first game`;
      urgency = "Low";
      recommendedWindowText = "Morning of game day or eve";
      recommendedTimingReason = "Next game is more than 6 hours away.";
    }
  } else if (post.intent === "recap" || post.intent === "cross_game_preview") {
    urgency = "Low";
    recommendedWindowText = "Evening browsing window (7–9 PM)";
    recommendedTimingReason = "Evergreen/cross-game content — post during peak engagement window.";
  }

  return { countdownText, urgency, recommendedWindowText, recommendedTimingReason };
}

// ─── Platform captions ────────────────────────────────────────────────────────

function firstNWords(text: string, n: number): string {
  const words = text.split(/\s+/);
  if (words.length <= n) return text;
  return words.slice(0, n).join(" ") + "…";
}

export function buildPlatformCaptions(post: SocialPost, ctaLine: string): PlatformCaptions {
  const topHashtags = post.hashtags.slice(0, 4).join(" ");
  const allHashtags = post.hashtags.join(" ");

  // TikTok: punchy, ≤150 chars hook + 2–3 hashtags + CTA
  const tiktokHook = firstNWords(post.content, 18);
  const tiktok = `${tiktokHook}\n\n${topHashtags}\n\n${ctaLine} Link in bio.`;

  // Instagram: full caption + all hashtags
  const instragram = `${post.caption}\n\n${allHashtags}\n\n${ctaLine} Link in bio.`;

  // Facebook: no hashtags, conversational close
  const fbBullets = post.statsShown.slice(0, 5).map(b => `• ${b}`).join("\n");
  const facebook = `${post.content}\n\n${fbBullets}\n\n${ctaLine}\n\nWhat do you think? Drop a comment.`;

  return { tiktok, instagram: instragram, facebook };
}

// ─── Voiceover script ─────────────────────────────────────────────────────────

export function buildVoiceoverScript(post: SocialPost): string {
  const intro = buildVoiceoverIntro(post);
  const statsLines = post.statsShown.slice(0, 5).map((s, i) => {
    const clean = s.replace(/[()]/g, "").replace(/—/g, "-").trim();
    return `${ordinal(i + 1)}, ${clean}.`;
  });
  const outro = `Full data on Neeko Sports Stats — link in bio.`;
  return [intro, ...statsLines, outro].join(" ");
}

function buildVoiceoverIntro(post: SocialPost): string {
  const n = post.playerNames.length;
  if (post.statLens === "goals") {
    return `Here ${n === 1 ? "is" : `are ${n}`} AFL ${n === 1 ? "player" : "players"} to watch for goals this week.`;
  }
  if (post.intent === "recap") {
    return `Here's how the ${post.thresholdLabel.toLowerCase()} numbers held up from the weekend.`;
  }
  return `Here ${n === 1 ? "is" : `are ${n}`} AFL ${post.thresholdLabel.toLowerCase()} trends to watch.`;
}

function ordinal(n: number): string {
  const s = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"];
  return s[n - 1] ?? `${n}.`;
}

// ─── Hook options ─────────────────────────────────────────────────────────────

export function buildHookOptions(post: SocialPost): string[] {
  const base = post.content;
  const thr = post.thresholdLabel;
  const n = post.playerNames.length;
  const day = post.day;

  const hooks = [
    base,
    `${n} AFL ${thr.toLowerCase()} trends worth watching${day === "Sat" || day === "Sun" ? " this weekend" : " this round"}.`,
    `The form numbers are there — these ${n} players have been clearing the line.`,
    `Before bounce, these are the names on the ${thr.toLowerCase()} board.`,
    `Recent-form data only. No opinion, no guesswork — just the AFL numbers.`,
  ];
  return [...new Set(hooks)].slice(0, 5);
}

// ─── Carousel slides ──────────────────────────────────────────────────────────

export function buildCarouselSlides(post: SocialPost): CarouselSlide[] {
  if (post.type !== "Carousel" && post.type !== "Short video") {
    // Single cover slide for non-carousel posts
    return [{
      slideNumber: 1,
      headline: post.title,
      body: post.content,
      visualNote: post.suggestedVisual,
    }];
  }

  const slides: CarouselSlide[] = [];

  // Title / cover slide
  slides.push({
    slideNumber: 1,
    headline: post.title,
    body: post.content.length > 100 ? post.content.slice(0, 97) + "…" : post.content,
    visualNote: `Cover card. ${post.suggestedVisual}. Neeko logo top centre.`,
  });

  // One slide per stat line
  post.statsShown.slice(0, 6).forEach((statLine, i) => {
    // Try to pull player name from start of stat line
    const namePart = statLine.split(" —")[0].split(" (")[0].trim();
    const bodyPart = statLine.includes(" — ") ? statLine.split(" — ").slice(1).join(" — ") : statLine;
    slides.push({
      slideNumber: i + 2,
      headline: namePart || `Player ${i + 1}`,
      body: bodyPart.length > 120 ? bodyPart.slice(0, 117) + "…" : bodyPart,
      visualNote: `Stat card. Team colours accent. ${post.thresholdLabel} highlighted in gold.`,
    });
  });

  // CTA slide
  slides.push({
    slideNumber: slides.length + 1,
    headline: "See the full board",
    body: "NeekoSportsStats.com.au",
    visualNote: "CTA card. Minimal. Neeko logo centred. Link in bio reminder.",
  });

  return slides;
}

// ─── Thumbnail options ────────────────────────────────────────────────────────

export function buildThumbnailOptions(post: SocialPost): string[] {
  const thr = post.thresholdLabel;
  const dayMap: Record<string, string> = {
    Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
    Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
  };
  const day = dayMap[post.day] ?? post.day;
  return [
    `${thr} watch — ${day}`,
    `${post.playerNames.length} AFL trends before bounce`,
    `Before bounce: ${thr.toLowerCase()}`,
    `${day} AFL stat watch`,
    post.title,
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);
}

// ─── AI image prompt ──────────────────────────────────────────────────────────

export function buildAiImagePrompt(post: SocialPost): string {
  const format = post.type === "Carousel"
    ? "1080x1350 Instagram carousel cover slide"
    : post.type === "Short video"
    ? "1080x1920 TikTok/Reels vertical frame"
    : "1080x1080 square social media graphic";
  const styleNote = "dark zinc/charcoal background, clean white sans-serif typography, AFL aesthetic, gold and neon-green stat number accents, professional data-dashboard quality, no betting logos, no gambling imagery, no bookmaker branding, no odds";
  return `Create a premium AFL sports analytics social media graphic for Neeko Sports Stats. Format: ${format}. Description: ${post.imageDescription} Style: ${styleNote}.`;
}

// ─── Angle classifier ────────────────────────────────────────────────────────

export function classifyAngle(post: SocialPost): PostAngle {
  if (post.category === "Education") return "Education";
  if (post.isBackup && post.intent === "evergreen_backup") return "Evergreen";
  if (post.category === "Proof Post" || post.intent === "recap") return "Proof recap";
  if (post.category === "Goal Trend") return "Goal trend";
  if (post.category === "Team Total" || post.category === "Matchup Angle") return "Team stat edge";
  if (post.category === "Form Mover") return post.isBackup ? "Evergreen" : "Player spotlight";
  if (post.category === "Round Preview" || post.category === "Round Wrap") return "Match preview";
  if (post.statLens === "fantasy") return "Fantasy watch";
  return "Disposal form";
}

// ─── Master enrichment entry point ───────────────────────────────────────────

/**
 * Enriches a SocialPost with all computed fields.
 * Called inside makePost — no call-site changes needed.
 */
export function enrichPost(
  post: SocialPost,
  matches: { game_date: string }[],
): SocialPost {
  const compliance = checkCompliance(post);
  const quality = scorePost(post);
  const timing = buildTiming(post, matches);
  const ctaLine = pickCta(post);
  const platformCaptions = buildPlatformCaptions(post, ctaLine);
  const voiceoverScript = buildVoiceoverScript(post);
  const carouselSlides = buildCarouselSlides(post);
  const hookOptions = buildHookOptions(post);
  const thumbnailOptions = buildThumbnailOptions(post);
  const aiImagePrompt = buildAiImagePrompt(post);
  const angle = classifyAngle(post);

  return {
    ...post,
    compliance,
    quality,
    timing,
    ctaLine,
    platformCaptions,
    voiceoverScript,
    carouselSlides,
    hookOptions,
    thumbnailOptions,
    aiImagePrompt,
    angle,
  };
}
