/**
 * Carousel builder — assembles CarouselSlide arrays for each content type.
 */
import type {
  CarouselSlide, SlideType, AFLPlayerStat, PlannerSettings, StatBoardRow, TokenMap,
} from "../types";
import type { ScheduleSlot } from "./scheduleEngine";
import { formatRatio } from "./statFormatter";
import { generateSlidePrompt, generateCoverPrompt } from "./promptGenerator";
import { gameLabel } from "./tokenEngine";

function makeId(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

export function buildCarouselSlides(
  slot: ScheduleSlot,
  players: AFLPlayerStat[],
  tokens: TokenMap,
  settings: PlannerSettings
): CarouselSlide[] {
  switch (slot.contentType) {
    case "match_stat_board":
      return buildMatchBoardSlides(slot, players, tokens, settings);
    case "player_spotlight":
      return buildSpotlightSlides(players, tokens, 1);
    case "player_spotlight_duo":
      return buildSpotlightSlides(players, tokens, 2);
    case "round_review":
    case "round_ahead_watch":
      return buildRoundSlides(slot.contentType, players, tokens);
    case "product_education":
      return buildProductSlides(tokens);
    case "story_extra":
      return buildStorySlides(tokens);
  }
}

function buildMatchBoardSlides(
  slot: ScheduleSlot,
  players: AFLPlayerStat[],
  tokens: TokenMap,
  settings: PlannerSettings
): CarouselSlide[] {
  const slides: CarouselSlide[] = [];
  const game = tokens.game ?? `${slot.homeTeam} v ${slot.awayTeam}`;

  // Cover
  slides.push({
    id: makeId("cover", 0),
    slideType: "cover",
    title: game,
    subtitle: `Round ${tokens.round} Stat Board`,
    imagePrompt: generateCoverPrompt("match_stat_board", {
      homeTeam: slot.homeTeam ?? "",
      awayTeam: slot.awayTeam ?? "",
    } as any),
  });

  // Home disposals
  const homeDisposals = players.filter(
    p => p.statType === "disposals" && p.team === slot.homeTeam
  );
  if (homeDisposals.length > 0) {
    slides.push({
      id: makeId("home_disposals", 1),
      slideType: "home_disposals",
      title: `${slot.homeTeam} — Disposals`,
      subtitle: "Recent threshold records",
      rows: buildStatRows(homeDisposals),
      imagePrompt: generateSlidePrompt("Home Disposals", slot.homeTeam, slot.awayTeam),
    });
  }

  // Away disposals
  const awayDisposals = players.filter(
    p => p.statType === "disposals" && p.team === slot.awayTeam
  );
  if (awayDisposals.length > 0) {
    slides.push({
      id: makeId("away_disposals", 2),
      slideType: "away_disposals",
      title: `${slot.awayTeam} — Disposals`,
      subtitle: "Recent threshold records",
      rows: buildStatRows(awayDisposals),
      imagePrompt: generateSlidePrompt("Away Disposals", slot.homeTeam, slot.awayTeam),
    });
  }

  // Home goals
  const homeGoals = players.filter(
    p => p.statType === "goals" && p.team === slot.homeTeam
  );
  if (homeGoals.length > 0) {
    slides.push({
      id: makeId("home_goals", 3),
      slideType: "home_goals",
      title: `${slot.homeTeam} — Goals`,
      subtitle: "Recent scoring records",
      rows: buildStatRows(homeGoals),
      imagePrompt: generateSlidePrompt("Home Goals", slot.homeTeam, slot.awayTeam),
    });
  }

  // Away goals
  const awayGoals = players.filter(
    p => p.statType === "goals" && p.team === slot.awayTeam
  );
  if (awayGoals.length > 0) {
    slides.push({
      id: makeId("away_goals", 4),
      slideType: "away_goals",
      title: `${slot.awayTeam} — Goals`,
      subtitle: "Recent scoring records",
      rows: buildStatRows(awayGoals),
      imagePrompt: generateSlidePrompt("Away Goals", slot.homeTeam, slot.awayTeam),
    });
  }

  // CTA
  slides.push({
    id: makeId("cta", slides.length),
    slideType: "cta",
    title: "See the Full Board",
    subtitle: "neekostatistics.com.au",
    designNotes: "Brand CTA slide. Dark background, logo, URL.",
  });

  return slides;
}

function buildSpotlightSlides(
  players: AFLPlayerStat[],
  tokens: TokenMap,
  count: number
): CarouselSlide[] {
  const slides: CarouselSlide[] = [];

  // Cover
  slides.push({
    id: makeId("cover", 0),
    slideType: "cover",
    title: count === 1
      ? (tokens.player ?? "Player Spotlight")
      : "Player Duo Spotlight",
    subtitle: `Round ${tokens.round} Form`,
    imagePrompt: generateCoverPrompt("player_spotlight"),
  });

  // One slide per featured player
  players.slice(0, count).forEach((p, i) => {
    slides.push({
      id: makeId("player_spotlight", i + 1),
      slideType: "player_spotlight",
      title: p.playerName,
      subtitle: `${p.team} — ${p.thresholdLabel} ${p.statType}`,
      rows: [buildStatRow(p)],
      imagePrompt: `Clean dark stat card for ${p.playerName}. No real player photo.`,
    });
  });

  // CTA
  slides.push({
    id: makeId("cta", slides.length),
    slideType: "cta",
    title: "See the Full Board",
    subtitle: "neekostatistics.com.au",
  });

  return slides;
}

function buildRoundSlides(
  contentType: "round_review" | "round_ahead_watch",
  players: AFLPlayerStat[],
  tokens: TokenMap
): CarouselSlide[] {
  const isReview = contentType === "round_review";

  const slides: CarouselSlide[] = [
    {
      id: makeId("cover", 0),
      slideType: "cover",
      title: isReview ? `Round ${tokens.round} Review` : `Round ${tokens.round} Form Watch`,
      subtitle: isReview ? "Player form recap" : "Heading into the round",
      imagePrompt: generateCoverPrompt(contentType),
    },
  ];

  players.slice(0, 5).forEach((p, i) => {
    slides.push({
      id: makeId("player_spotlight", i + 1),
      slideType: "player_spotlight",
      title: p.playerName,
      subtitle: `${p.team} · ${p.thresholdLabel} ${p.statType}: ${p.recordLabel}`,
      rows: [buildStatRow(p)],
    });
  });

  slides.push({
    id: makeId("cta", slides.length),
    slideType: "cta",
    title: "See the Full Board",
    subtitle: "neekostatistics.com.au",
  });

  return slides;
}

function buildProductSlides(tokens: TokenMap): CarouselSlide[] {
  return [
    {
      id: makeId("cover", 0),
      slideType: "cover",
      title: "How to Read the Board",
      subtitle: "AFL stat research made simple",
      imagePrompt: generateCoverPrompt("product_education"),
    },
    {
      id: makeId("player_spotlight", 1),
      slideType: "player_spotlight",
      title: "Ratios Beat Percentages",
      subtitle: "12/12 tells you more than 100%",
      designNotes: "Show 12/12 vs 5/5 comparison. Both 100% but different sample.",
    },
    {
      id: makeId("player_spotlight", 2),
      slideType: "player_spotlight",
      title: "L5 Average",
      subtitle: "Last 5 games — current form indicator",
    },
    {
      id: makeId("cta", 3),
      slideType: "cta",
      title: "Full Board at Neeko",
      subtitle: "neekostatistics.com.au",
    },
  ];
}

function buildStorySlides(tokens: TokenMap): CarouselSlide[] {
  return [
    {
      id: makeId("cover", 0),
      slideType: "cover",
      title: "Story Extra",
      subtitle: `Round ${tokens.round}`,
      imagePrompt: generateCoverPrompt("story_extra"),
    },
    {
      id: makeId("cta", 1),
      slideType: "cta",
      title: "Full Board at Neeko",
      subtitle: "neekostatistics.com.au",
    },
  ];
}

function buildStatRows(players: AFLPlayerStat[]): StatBoardRow[] {
  return players.map(buildStatRow);
}

function buildStatRow(p: AFLPlayerStat): StatBoardRow {
  if (p.statType === "disposals") {
    return {
      playerName: p.playerName,
      l5Avg: p.l5Avg,
      projection: p.projection,
      threshold15: p.threshold === 15 ? p.recordLabel : undefined,
      threshold20: p.threshold === 20 ? p.recordLabel : undefined,
      threshold25: p.threshold === 25 ? p.recordLabel : undefined,
      threshold30: p.threshold === 30 ? p.recordLabel : undefined,
    };
  } else {
    return {
      playerName: p.playerName,
      l5Avg: p.l5Avg,
      projection: p.projection,
      threshold1Goal: p.threshold === 1 ? p.recordLabel : undefined,
      threshold2Goals: p.threshold === 2 ? p.recordLabel : undefined,
      threshold3Goals: p.threshold === 3 ? p.recordLabel : undefined,
    };
  }
}
