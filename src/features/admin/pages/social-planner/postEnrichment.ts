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
  AiCarouselPromptPack,
  PostAngle,
  ScoreLabel,
  UrgencyLevel,
} from "./types";

// ─── Safe array helper ────────────────────────────────────────────────────────

/** Returns the value if it's a non-null array, otherwise []. Prevents .join() on undefined. */
function safeArr<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

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
  { re: /\b(win|lose|losing)\s+(the\s+)?(bet|wager|multi|parlay|market|money)\b/gi, reason: "win/lose outcome framing (betting context)" },
  { re: /\b(tip|tips|tipping)\b/gi,            reason: "tipping language" },
  { re: /\b(best|top)\s+(pick|play|bet)\b/gi,  reason: "pick/play/bet framing" },
  { re: /\bshould\s+(hit|get|score|kick)\b/gi, reason: "predictive 'should' language" },
];

export function checkCompliance(post: SocialPost): ComplianceResult {
  const scanText = [post.content, post.caption, safeArr(post.statsShown).join(" ")].join(" ");
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

/**
 * Scores a post 0–100 across multiple independent dimensions.
 * A post cannot score 100 unless it genuinely excels on all axes.
 *
 * Breakdown (max points per dimension):
 *   Data confidence     25 pts — High/Medium/Fallback
 *   Player pool depth   20 pts — 5+ players with real data
 *   Threshold realism   15 pts — using stats against appropriate threshold
 *   Game timing/intent  15 pts — specific upcoming game is most valuable
 *   Data freshness      15 pts — no fallback warning, completed data preferred
 *   Format/compliance   10 pts — Carousel > video > image; no compliance flags
 *
 * This means a Fallback post with only 2 players and no upcoming game maxes at ~45.
 */
export function scorePost(post: SocialPost): PostQuality {
  let score = 0;
  const reasons: string[] = [];
  const deductions: string[] = [];

  // ── Data confidence (25 pts) ────────────────────────────────────────────────
  if (post.confidence === "High") {
    score += 25;
    reasons.push("high-confidence data");
  } else if (post.confidence === "Medium") {
    score += 14;
    reasons.push("medium-confidence data");
  } else {
    score += 3;
    deductions.push("fallback data — low confidence");
  }

  // ── Player pool depth (20 pts) ──────────────────────────────────────────────
  const n = post.playerNames.length;
  if (n >= 5)       { score += 20; reasons.push("5+ named players"); }
  else if (n >= 4)  { score += 15; }
  else if (n === 3) { score += 10; deductions.push("only 3 players"); }
  else if (n === 2) { score += 5;  deductions.push("only 2 players"); }
  else if (n === 1) { score += 2;  deductions.push("single-player post"); }
  else              {              deductions.push("no named players"); }

  // ── Threshold realism (15 pts) ──────────────────────────────────────────────
  // Check that the threshold label and stat lens are consistent and meaningful.
  // Team-total, mixed and evergreen posts get partial credit.
  if (post.statLens === "disposals" || post.statLens === "goals") {
    const hasRealThreshold =
      post.thresholdLabel.match(/\d+\+/) ||
      post.thresholdLabel.includes("Form Risers");
    if (hasRealThreshold) {
      score += 15;
      reasons.push("real threshold stat line");
    } else {
      score += 7;
    }
  } else if (post.statLens === "team-total" || post.statLens === "tackles" || post.statLens === "mixed") {
    score += 10;
    reasons.push("team/tackle/mixed stat line");
  } else {
    score += 5;
  }

  // ── Game timing / intent (15 pts) ───────────────────────────────────────────
  if (post.intent === "pre_game" && post.targetGame) {
    score += 15; reasons.push("pre-game with specific match");
  } else if (post.intent === "same_day_preview" && post.targetGame) {
    score += 13; reasons.push("same-day preview");
  } else if (post.intent === "recap" && post.targetGameStatus === "completed") {
    score += 12; reasons.push("completed game recap");
  } else if (post.intent === "cross_game_preview") {
    score += 8;
  } else if (post.intent === "evergreen_backup") {
    score += 4;
    deductions.push("evergreen/backup intent");
  } else {
    score += 6;
  }

  // ── Data freshness (15 pts) ─────────────────────────────────────────────────
  if (!post.fallbackWarning) {
    score += 15; reasons.push("no fallback warnings");
  } else if (post.fallbackWarning.toLowerCase().includes("low") || post.fallbackWarning.toLowerCase().includes("insufficient")) {
    score += 4;
    deductions.push("fallback warning: " + post.fallbackWarning.slice(0, 60));
  } else {
    score += 8;
    deductions.push("minor fallback");
  }

  // ── Format + compliance (10 pts) ────────────────────────────────────────────
  if (post.type === "Carousel")     score += 6;
  else if (post.type === "Short video") score += 5;
  else                              score += 4; // Image

  // Compliance bonus (if already computed — only gives 0–4 bonus)
  if (post.compliance?.status === "Clean") {
    score += 4; reasons.push("clean compliance");
  } else if (post.compliance?.status === "Needs review") {
    deductions.push("compliance flag");
  }

  score = Math.min(100, score);

  // ── Penalty: proof/recap with no completed data ─────────────────────────────
  if (
    (post.category === "Proof Post" || post.intent === "recap") &&
    post.targetGameStatus !== "completed" &&
    post.fallbackWarning
  ) {
    score = Math.max(0, score - 20);
    deductions.push("proof/recap label without completed data");
  }

  // ── Penalty: weak pool (< 2 players) with fallback ─────────────────────────
  if (post.playerNames.length < 2 && post.fallbackWarning) {
    score = Math.max(0, score - 10);
  }

  score = Math.min(100, score);

  const label: ScoreLabel =
    score >= 80 ? "Premium" :
    score >= 60 ? "Strong"  :
    score >= 40 ? "Good"    : "Review";

  const useRecommendation: "Use" | "Use with caution" | "Do not use" =
    (post.compliance?.status === "Do not use") ? "Do not use" :
    (post.fallbackWarning && post.playerNames.length < 2) ? "Do not use" :
    score < 40 ? "Use with caution" :
    "Use";

  const allReasons = [...reasons, ...deductions.map(d => `[!] ${d}`)];
  const useReason =
    useRecommendation === "Do not use"
      ? "Insufficient player data or compliance failure."
      : useRecommendation === "Use with caution"
      ? `Low score (${score}) — ${deductions[0] ?? "check data quality"}.`
      : reasons.slice(0, 3).join(", ") + ".";

  return {
    score,
    label,
    reason: allReasons.slice(0, 5).join("; "),
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
  const hashtags = safeArr(post.hashtags);
  const topHashtags = hashtags.slice(0, 4).join(" ");
  const allHashtags = hashtags.join(" ");

  // TikTok: punchy, ≤150 chars hook + 2–3 hashtags + CTA
  const tiktokHook = firstNWords(post.content, 18);
  const tiktok = `${tiktokHook}\n\n${topHashtags}\n\n${ctaLine} Link in bio.`;

  // Instagram: full caption + all hashtags
  const instagram = `${post.caption}\n\n${allHashtags}\n\n${ctaLine} Link in bio.`;

  // Facebook: no hashtags, conversational close
  const fbBullets = safeArr(post.statsShown).slice(0, 5).map(b => `• ${b}`).join("\n");
  const facebook = `${post.content}\n\n${fbBullets}\n\n${ctaLine}\n\nWhat do you think? Drop a comment.`;

  return { tiktok, instagram, facebook };
}

// ─── Voiceover script ─────────────────────────────────────────────────────────

/**
 * Converts a stat bullet like "Player — 7/10 at 30+, L5 avg 34.8"
 * into natural voiceover language appropriate to the stat family.
 * Disposals: "has cleared 30-plus disposals in 7 of their last 10"
 * Goals:     "has kicked 1+ goal in 7 of their last 10"
 */
function toVoiceoverLine(bullet: string, statLens: string): string {
  const dashIdx = bullet.indexOf(" — ");
  const statPart = dashIdx >= 0 ? bullet.slice(dashIdx + 3) : bullet;

  const recordMatch = statPart.match(/(\d+)\/(\d+)\s+at\s+(\d+)\+/);
  const l5Match = statPart.match(/L5 avg\s+([\d.]+)/);

  if (recordMatch) {
    const [, hits, sample, threshold] = recordMatch;
    const thresholdNum = parseInt(threshold, 10);
    const l5Text = l5Match ? `, with an L5 average of ${l5Match[1]}` : "";

    if (statLens === "goals") {
      const goalDesc = thresholdNum === 1 ? "1+ goal" : `${threshold}+ goals`;
      return `has kicked ${goalDesc} in ${hits} of their last ${sample}${l5Text}`;
    }

    const thresholdText = `${threshold}-plus disposals`;
    return `has cleared ${thresholdText} in ${hits} of their last ${sample}${l5Text}`;
  }

  return statPart.replace(/[()]/g, "").replace(/—/g, "-").trim();
}

export function buildVoiceoverScript(post: SocialPost): string {
  const intro = buildVoiceoverIntro(post);
  const outro = `Full data on Neeko Sports Stats — link in bio.`;

  // Full Game Picks: sectioned disposal + goal script
  if (post.thresholdLabel === "Full Game Picks" || post.category === "Round Preview") {
    const dispLines: string[] = [];
    const goalLines: string[] = [];
    for (const s of safeArr(post.statsShown).slice(0, 8)) {
      const dashIdx = s.indexOf(" — ");
      const playerName = dashIdx >= 0 ? s.slice(0, dashIdx).trim() : "";
      // Classify by stat family: goal lines contain "at 1+", "at 2+", "at 3+" goals pattern
      const isGoal = /at\s+\d+\+\s+goal/i.test(s) || (post.statLens === "goals");
      const voiceoverStat = toVoiceoverLine(s, isGoal ? "goals" : "disposals");
      const line = playerName ? `${playerName} ${voiceoverStat}.` : `${voiceoverStat}.`;
      if (isGoal) goalLines.push(line);
      else dispLines.push(line);
    }
    const parts: string[] = [intro];
    if (dispLines.length > 0) {
      parts.push("On the disposal side —");
      dispLines.forEach((l, i) => parts.push(`${ordinal(i + 1)}, ${l}`));
    }
    if (goalLines.length > 0) {
      parts.push("On the goal side —");
      goalLines.forEach((l, i) => parts.push(`${ordinal(i + 1)}, ${l}`));
    }
    parts.push(outro);
    return parts.join(" ");
  }

  const statsLines = safeArr(post.statsShown).slice(0, 5).map((s, i) => {
    const dashIdx = s.indexOf(" — ");
    const playerName = dashIdx >= 0 ? s.slice(0, dashIdx).replace(/\(.*?\)/g, "").trim() : "";
    const voiceoverStat = toVoiceoverLine(s, post.statLens ?? "disposals");
    const line = playerName ? `${playerName} ${voiceoverStat}.` : `${voiceoverStat}.`;
    return `${ordinal(i + 1)}, ${line}`;
  });
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
  safeArr(post.statsShown).slice(0, 6).forEach((statLine, i) => {
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

// ─── AI carousel prompt pack ──────────────────────────────────────────────────

const GLOBAL_STYLE =
  "GLOBAL STYLE: Dark zinc/charcoal background. Clean white sans-serif typography. " +
  "AFL aesthetic. Gold and neon-green stat number accents. " +
  "Professional data-dashboard quality. Neeko Sports Stats branding — logo top centre. " +
  "No betting logos. No gambling imagery. No bookmaker branding. No odds text.";

function aiFormat(post: SocialPost): string {
  if (post.type === "Carousel") return "1080x1350 Instagram carousel slide";
  if (post.type === "Short video") return "1080x1920 TikTok/Reels vertical frame";
  return "1080x1080 square social media graphic";
}

function buildCoverPrompt(post: SocialPost, format: string): string {
  return (
    `SLIDE 1 — COVER: ${format}. ` +
    `Neeko Sports Stats branding. ` +
    `Headline: "${post.title}". ` +
    `Post angle: ${post.angle ?? post.thresholdLabel}. ` +
    `Stat lens: ${post.statLens}. ` +
    `Round label: ${post.dataScope}. ` +
    `${post.imageDescription} ` +
    `No betting language.`
  );
}

function buildStatSlidePrompt(statLine: string, slideNum: number, post: SocialPost, format: string): string {
  const dashIdx = statLine.indexOf(" — ");
  const playerName = dashIdx >= 0 ? statLine.slice(0, dashIdx).trim() : `Player ${slideNum}`;
  const statDetail = dashIdx >= 0 ? statLine.slice(dashIdx + 3) : statLine;

  // Extract team from post.teamNames if only one team, else leave generic
  const teamHint = post.teamNames.length === 1 ? ` (${post.teamNames[0]})` : "";

  // Use per-player threshold from the stat line (e.g. "at 25+"), not the post-level label.
  // This ensures mixed-threshold carousels show each player's correct threshold.
  const thresholdLabel = statDetail.match(/at\s+(\d+\+(?:\s+goals?)?)/i)?.[1] ?? post.thresholdLabel;

  return (
    `SLIDE ${slideNum} — PLAYER: ${format}. ` +
    `Player name: ${playerName}${teamHint}. ` +
    `Stat line: ${statDetail}. ` +
    `Threshold: ${thresholdLabel}. ` +
    `Show hit record, percentage, L5 avg, and Last 5 strip. ` +
    `Confidence badge. Team colour accent. Gold highlight on key stat number. ` +
    `No betting language.`
  );
}

function buildEndPrompt(format: string): string {
  return (
    `FINAL SLIDE — CTA: ${format}. ` +
    `Minimal design. Neeko Sports Stats logo centred. ` +
    `Headline: "See the full board". ` +
    `URL: NeekoSportsStats.com.au. ` +
    `Subtext: "Link in bio". ` +
    `No gambling language.`
  );
}

export function buildAiCarouselPromptPack(post: SocialPost): AiCarouselPromptPack {
  const format = aiFormat(post);
  const coverPrompt = buildCoverPrompt(post, format);
  const slidePrompts = safeArr(post.statsShown).slice(0, 6).map((s, i) =>
    buildStatSlidePrompt(s, i + 2, post, format),
  );
  const endPrompt = buildEndPrompt(format);

  const allSlides = [
    coverPrompt,
    ...slidePrompts,
    endPrompt,
    GLOBAL_STYLE,
  ];
  const combinedPrompt = allSlides.join("\n\n");

  return { format, coverPrompt, slidePrompts, endPrompt, combinedPrompt };
}

export function buildAiImagePrompt(post: SocialPost): string {
  const format = aiFormat(post);
  const styleNote =
    "dark zinc/charcoal background, clean white sans-serif typography, AFL aesthetic, " +
    "gold and neon-green stat number accents, professional data-dashboard quality, " +
    "no betting logos, no gambling imagery, no bookmaker branding, no odds";
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
  const aiCarouselPromptPack = buildAiCarouselPromptPack(post);
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
    aiCarouselPromptPack,
    angle,
  };
}
