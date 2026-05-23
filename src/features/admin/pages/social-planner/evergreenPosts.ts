/**
 * Evergreen AFL content posts — round-independent educational and platform posts.
 * No game data required. No player names. No injury risk.
 */
import type { SocialPost, CIDataSubset } from "./types";
import { enrichPost } from "./postEnrichment";

// ─── Counter ─────────────────────────────────────────────────────────────────
// Uses a separate range to avoid collision with the weekly plan counter.
let _evCounter = 900;
function evId(): string {
  return `spp-ev-${++_evCounter}`;
}

// ─── Evergreen post builder ───────────────────────────────────────────────────

function ev(args: {
  title: string;
  content: string;
  statsShown: string[];
  onScreenText: string;
  caption: string;
  suggestedVisual: string;
  imageDescription: string;
  thresholdLabel: string;
}): Omit<SocialPost, "compliance" | "quality" | "timing" | "ctaLine" | "platformCaptions" | "voiceoverScript" | "carouselSlides" | "hookOptions" | "thumbnailOptions" | "aiImagePrompt" | "angle"> {
  return {
    id: evId(),
    day: "Mon",
    postNumber: 1,
    postTime: "7:00 PM",
    type: "Image",
    category: "Education",
    intent: "evergreen_backup",
    statLens: "disposals",
    confidence: "High",
    angle: "Education",
    title: args.title,
    content: args.content,
    statsShown: args.statsShown,
    onScreenText: args.onScreenText,
    caption: args.caption,
    hashtags: ["#AFL", "#AFLStats", "#FootyStats", "#AFL2026", "#NeekoSportsStats", "#FantasyAFL"],
    suggestedVisual: args.suggestedVisual,
    imageDescription: args.imageDescription,
    aiImagePrompt: "",
    platformCaptions: { tiktok: "", instagram: "", facebook: "" },
    voiceoverScript: "",
    carouselSlides: [],
    hookOptions: [],
    thumbnailOptions: [],
    ctaLine: "",
    compliance: { status: "Clean", flags: [] },
    quality: { score: 75, label: "Strong", reason: "evergreen", useRecommendation: "Use", useReason: "Evergreen content — no game-day risk." },
    timing: { countdownText: null, urgency: "None", recommendedWindowText: "Evening 7–9 PM", recommendedTimingReason: "Evergreen — post during peak browsing window." },
    dataScope: "Evergreen — no game data required",
    targetGame: null,
    targetGameStatus: "any",
    fallbackWarning: null,
    playerNames: [],
    teamNames: [],
    thresholdLabel: args.thresholdLabel,
    isBackup: true,
    tone: "clean_stats",
  };
}

// ─── Evergreen post pool ──────────────────────────────────────────────────────

export function buildEvergreenPool(data: CIDataSubset): SocialPost[] {
  _evCounter = 900;
  const posts: Array<ReturnType<typeof ev>> = [];

  posts.push(ev({
    title: "What does a 20+ disposal hit rate mean?",
    content: "A 20+ hit rate tells you how often a player clears 20 disposals in a game — not whether they will, but how consistently they have.",
    statsShown: [
      "If a player has an 80% hit rate at 20+, they cleared 20 disposals in 8 of their last 10 games.",
      "That does not mean they will in round 12. It means the trend is strong and consistent.",
      "Neeko tracks hit rates back to last season so you can see if the form is real or a recent blip.",
    ],
    onScreenText: "80% at 20+ = 8/10 games",
    caption: "A 20+ hit rate tells you how often a player clears 20 disposals in a game — not whether they will, but how consistently they have.\n\n• 80% hit rate = 8 of last 10 games above 20 disposals.\n• That is recent form evidence, not a prediction.\n• Track it on the Neeko Stat Board.\n\nSee the data. Make your own call.",
    suggestedVisual: "Explainer graphic — pie chart style, 8 green segments and 2 grey segments, labelled 80% hit rate",
    imageDescription: "Static explainer image. Title: 'What is a 20+ disposal hit rate?'. Visual: 10-game grid with 8 green ticks and 2 red crosses. Text: '80% = 8 of last 10 games'. Dark background, clean layout, educational tone. No betting language.",
    thresholdLabel: "Education",
  }));

  posts.push(ev({
    title: "L5 average vs season average — which matters more?",
    content: "Season average gives you the full picture. L5 (last 5 games) average tells you what a player is doing right now. Both matter for different reasons.",
    statsShown: [
      "Season average: baseline across all games this year.",
      "L5 average: the last 5 games — measures current form momentum.",
      "If L5 is clearly above season average, the player is trending upward.",
      "If L5 is below season average, the player may be running into a form dip.",
    ],
    onScreenText: "L5 avg = current form. Season avg = baseline.",
    caption: "Season average gives you the full picture. L5 average tells you what a player is doing right now.\n\n• Season avg = baseline across all games this year.\n• L5 avg = last 5 games — current form window.\n• If L5 is well above season avg, the player is trending up.\n\nSee the data. Make your own call.",
    suggestedVisual: "Two-bar comparison — season average (muted) vs L5 average (bright), with up-arrow trend line",
    imageDescription: "Static educational image. Title: 'L5 Average vs Season Average'. Visual: two horizontal bars side by side for a placeholder player — season average in grey, L5 average in green with up-arrow. Labels explaining each metric. Dark background. No betting language.",
    thresholdLabel: "Education",
  }));

  posts.push(ev({
    title: "How to use the Neeko AFL Stat Board in 30 seconds",
    content: "Three steps to find the AFL disposal trends that actually matter before each round.",
    statsShown: [
      "Step 1: Select the round and filter by stat type (disposals, goals, tackles).",
      "Step 2: Check the hit rate column — look for players consistently above your chosen line.",
      "Step 3: Compare L5 average to season average to spot rising form.",
    ],
    onScreenText: "Stat Board in 3 steps",
    caption: "Three steps to find AFL stat trends before each round.\n\n• Step 1: Select round, pick stat type.\n• Step 2: Hit rate column — consistent performers above a line.\n• Step 3: L5 vs season avg — spotting rising form.\n\nFull board at NeekoSportsStats.com.au. No sign-up required.",
    suggestedVisual: "3-step how-to graphic with numbered panels, each showing a stat board screenshot placeholder",
    imageDescription: "Carousel or static image. Title: 'Neeko Stat Board in 3 Steps'. Three numbered panel layout: Panel 1 — select round. Panel 2 — check hit rate. Panel 3 — compare L5 vs season. Dark background, clean instructional design. No betting language.",
    thresholdLabel: "Education",
  }));

  posts.push(ev({
    title: "Why recent form matters more than season average",
    content: "A player averaging 24 disposals across the season might be averaging 30 in their last 5. Which number do you want to know?",
    statsShown: [
      "Season averages include the good games, the bad games, and the games after injuries.",
      "Recent form (L5) captures what the player is doing right now.",
      "Early-season averages can drag down a player's number even when they are flying.",
    ],
    onScreenText: "Recent form > full-season average",
    caption: "A player averaging 24 for the season might be averaging 30 in their last 5. Which number matters more?\n\n• Season averages include injury-return games and early form.\n• L5 average shows current momentum.\n• Neeko shows both so you can decide.\n\nSee the data. Make your own call.",
    suggestedVisual: "Before/after graphic — player with low season avg vs high L5 avg highlighted",
    imageDescription: "Static image. Split layout: left side 'Season average' shown lower, right side 'L5 average' shown higher with upward arrow. Title: 'Which number actually matters?'. Dark background, educational. No player names. No betting language.",
    thresholdLabel: "Education",
  }));

  posts.push(ev({
    title: "What is AFL fantasy scoring?",
    content: "AFL Fantasy assigns points based on stats — disposals, marks, tackles, goals, and more. Understanding the formula helps you track the right players.",
    statsShown: [
      "Kicks: 3 pts. Handballs: 2 pts. Marks: 3 pts.",
      "Tackles: 4 pts. Goals: 6 pts. Frees for: 1 pt.",
      "High fantasy scorers tend to have high disposals AND tackle counts.",
    ],
    onScreenText: "AFL Fantasy: how points are scored",
    caption: "AFL Fantasy points are not random — they follow a formula.\n\n• Kicks: 3 pts. Handballs: 2 pts. Marks: 3 pts.\n• Tackles: 4 pts. Goals: 6 pts.\n• High scorers = volume players with tackles.\n\nTrack fantasy trends on Neeko Sports Stats.",
    suggestedVisual: "Fantasy scoring formula breakdown graphic — icons for each stat type with their point values",
    imageDescription: "Static image. Title: 'AFL Fantasy Scoring Formula'. Grid layout with stat icons (disposal, mark, tackle, goal) and their point values. Clean dashboard aesthetic, dark background, gold and green accents. No betting language.",
    thresholdLabel: "Education",
  }));

  posts.push(ev({
    title: "The difference between 25+ and 30+ disposal benchmarks",
    content: "25+ and 30+ disposal benchmarks are not interchangeable. They measure completely different tiers of player output.",
    statsShown: [
      "A player clearing 25+ disposals performs above the league average most weeks.",
      "A player clearing 30+ disposals is in elite territory — only a handful can do this consistently.",
      "25+ hit rate > 70% is meaningful. 30+ hit rate > 50% is exceptional.",
    ],
    onScreenText: "25+ vs 30+ — two very different lines",
    caption: "The 25+ and 30+ disposal lines are not the same.\n\n• 25+ = above league average. Most mid-fielders can reach it on a good day.\n• 30+ = elite territory. Only a handful of players consistently clear this.\n• Hit rate context: 70% at 25+ is strong. 50% at 30+ is exceptional.\n\nSee the data. Make your own call.",
    suggestedVisual: "Side-by-side benchmark comparison — two stat cards, one for 25+ and one for 30+, showing what each means",
    imageDescription: "Static image. Two side-by-side panels. Left: '25+ Disposals' with a typical hit rate example. Right: '30+ Disposals' with an elite hit rate example. Title: 'Two Different Benchmarks'. Dark background, gold text for 30+ to signal elite status. No betting language.",
    thresholdLabel: "Education",
  }));

  posts.push(ev({
    title: "Stop jumping between stat sites",
    content: "Every AFL stat you need for your round prep is on one board. Disposals, goals, tackles, hit rates, projections, recent form — all in one place.",
    statsShown: [
      "Track hit rates by threshold (15+, 20+, 25+, 30+) for every player.",
      "Compare L5 and season averages side by side.",
      "Filter by position, team, or upcoming game.",
    ],
    onScreenText: "One board. All the AFL stats.",
    caption: "Every AFL stat you need is on one board.\n\n• Disposals hit rates by threshold.\n• L5 vs season averages.\n• Goals, tackles, marks — all tracked.\n• Filter by player, position, or team.\n\nFull stat board at NeekoSportsStats.com.au. No sign-up required.",
    suggestedVisual: "Hero image — single dashboard view of the Neeko Stat Board showing multiple player rows",
    imageDescription: "Static image. Title: 'One AFL stat board. Every number you need.' Shows a mock stat board table with player rows, columns for L5 avg, hit rate, season avg. Dark background, professional dashboard aesthetic. No betting language. Neeko logo top right.",
    thresholdLabel: "Platform",
  }));

  posts.push(ev({
    title: "AFL stats for smarter footy conversations",
    content: "You do not need to guess who has been the most consistent fantasy player this season. The data is right there.",
    statsShown: [
      "Every current-round player tracked with at least 5 games of history.",
      "Hit rates back-calculated from full game logs.",
      "Team trends tracked for scoring, disposals, and goals against.",
    ],
    onScreenText: "Back the numbers, not the narrative",
    caption: "You do not need to guess who is in form. The data is there.\n\n• Every player tracked with L5 and season averages.\n• Hit rates calculated from actual game logs.\n• Team scoring and disposal trends included.\n\nNeekoSportsStats.com.au — AFL data made easier to read.",
    suggestedVisual: "Minimal brand graphic — Neeko logo on dark background, tagline 'AFL data made clearer'",
    imageDescription: "Clean brand post. Neeko Sports Stats logo centred on dark background. Tagline beneath: 'AFL stats made easier to read'. Minimal, premium look. No player names. No betting language.",
    thresholdLabel: "Platform",
  }));

  // Enrich all posts with empty matches (evergreen = no game dependency)
  return posts.map(p => enrichPost(p as SocialPost, []));
}
