/**
 * Carousel builder — assembles CarouselSlide arrays for each content type.
 * Supports open_free_game (full board) and preview_blurred (top N visible, rest blurred).
 */
import type {
  CarouselSlide, SlideType, AFLPlayerStat, PlannerSettings, StatBoardRow, TokenMap,
  ContentVisibilityMode,
} from "../types";
import type { ScheduleSlot } from "./scheduleEngine";
import { formatRatio } from "./statFormatter";
import {
  generateSlidePrompt, generateCoverPrompt,
  generateOpenFreeGameCoverPrompt, generateOpenFreeGameTablePrompt,
  generatePreviewBlurredTablePrompt,
} from "./promptGenerator";
import { gameLabel } from "./tokenEngine";
import { aggregateToRows, rowsToStatBoardRows } from "./rowAggregator";
import type { MatchBoardPlayerRow } from "./rowAggregator";

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
  const visibilityMode: ContentVisibilityMode = slot.visibilityMode ?? "preview_blurred";
  const isOpen = visibilityMode === "open_free_game";
  const slides: CarouselSlide[] = [];
  const game = tokens.game ?? `${slot.homeTeam} v ${slot.awayTeam}`;

  // Cover
  const boardLabel = isOpen ? "Free Game Board" : "Match Stat Board";
  const coverSubtitle = `Round ${tokens.round}`;

  const coverImagePrompt = isOpen
    ? generateOpenFreeGameCoverPrompt(slot.homeTeam ?? "", slot.awayTeam ?? "")
    : generateCoverPrompt("match_stat_board", {
        homeTeam: slot.homeTeam ?? "",
        awayTeam: slot.awayTeam ?? "",
      } as any);

  slides.push({
    id: makeId("cover", 0),
    slideType: "cover",
    title: game,
    subtitle: coverSubtitle,
    designNotes: boardLabel,
    imagePrompt: coverImagePrompt,
    visibilityMode,
    showFreeGameBadge: isOpen && settings.showFreeGameBadge,
    showPreviewBadge: false,
  });

  // Always emit all 4 table slides — rows: [] when no players found
  const sections: Array<{
    key: string;
    slideType: CarouselSlide["slideType"];
    team: string | undefined;
    statType: "disposals" | "goals";
    titleSuffix: string;
    subtitle: string;
    label: string;
    index: number;
  }> = [
    { key: "home_disposals", slideType: "home_disposals", team: slot.homeTeam, statType: "disposals", titleSuffix: "Disposals", subtitle: "Recent threshold records", label: "Home Disposals", index: 1 },
    { key: "away_disposals", slideType: "away_disposals", team: slot.awayTeam, statType: "disposals", titleSuffix: "Disposals", subtitle: "Recent threshold records", label: "Away Disposals", index: 2 },
    { key: "home_goals",     slideType: "home_goals",     team: slot.homeTeam, statType: "goals",     titleSuffix: "Goals",     subtitle: "Recent scoring records",    label: "Home Goals",     index: 3 },
    { key: "away_goals",     slideType: "away_goals",     team: slot.awayTeam, statType: "goals",     titleSuffix: "Goals",     subtitle: "Recent scoring records",    label: "Away Goals",     index: 4 },
  ];

  for (const section of sections) {
    // Aggregate all threshold rows for this team+statType into one row per player,
    // then convert to StatBoardRows. This ensures all threshold columns are filled.
    const aggregated = aggregateToRows(players, section.team ?? "", section.statType);
    const rowLimit = isOpen ? settings.thuFriMaxRows : settings.satSunTotalRows;
    const visibleLimit = isOpen ? settings.thuFriMaxRows : settings.satSunVisibleRows;
    const selectedRows = aggregated.slice(0, rowLimit).map((row, i) => ({
      ...row,
      selected: true,
      displayMode: (isOpen || i < visibleLimit ? "visible" : "name_only") as import("./rowAggregator").RowDisplayMode,
      sortOrder: i,
    }));
    const rows: StatBoardRow[] = rowsToStatBoardRows(selectedRows);
    slides.push({
      id: makeId(section.key, section.index),
      slideType: section.slideType,
      title: `${section.team ?? "TBD"} — ${section.titleSuffix}`,
      subtitle: section.subtitle,
      rows,
      imagePrompt: isOpen
        ? generateOpenFreeGameTablePrompt(section.label, slot.homeTeam, slot.awayTeam)
        : generatePreviewBlurredTablePrompt(section.label, slot.homeTeam, slot.awayTeam),
      visibilityMode,
      visibleRowCount: rows.filter(r => !r.blurred).length,
      blurredRowCount: rows.filter(r => r.blurred).length,
      ctaOverlayText: !isOpen ? settings.ctaOverlayText : undefined,
    });
  }

  // CTA
  slides.push({
    id: makeId("cta", slides.length),
    slideType: "cta",
    title: "See the Full Board",
    subtitle: "neekostats.com.au",
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

  slides.push({
    id: makeId("cover", 0),
    slideType: "cover",
    title: count === 1
      ? (tokens.player ?? "Player Spotlight")
      : "Player Duo Spotlight",
    subtitle: `Round ${tokens.round} Form`,
    imagePrompt: generateCoverPrompt("player_spotlight"),
  });

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

  slides.push({
    id: makeId("cta", slides.length),
    slideType: "cta",
    title: "See the Full Board",
    subtitle: "neekostats.com.au",
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
    subtitle: "neekostats.com.au",
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
      designNotes: "Premium dark board style. Simplified app-card elements in the background. Inspired by Neeko Sports Stats mobile UI — dark rounded cards, subtle green accents, charcoal premium layout.",
    },
    {
      id: makeId("player_spotlight", 1),
      slideType: "player_spotlight",
      title: "Ratios Beat Percentages",
      subtitle: "12/12 tells you more than 100%",
      slideText: "11 hits from 12 games\n11/12",
      designNotes: "Show a large example stat card: 11/12 — 11 hits from 12 games. Use green as strong record colour. Inspired by app stat card: dark rounded card, ratio as hero stat. No player photo needed.",
    },
    {
      id: makeId("player_spotlight", 2),
      slideType: "player_spotlight",
      title: "Recent Form (L5 Avg)",
      subtitle: "Last 5 games — your current form indicator",
      slideText: "Last 5: 17 · 31 · 31 · 35 · 23\nL5 Avg 27.4",
      designNotes: "Show a recent-form strip inspired by the app: 17 · 31 · 31 · 35 · 23. Then show L5 Avg 27.4. Use the app-style recent game score strip visual — dark rounded card, subtle spacing between values.",
    },
    {
      id: makeId("player_spotlight", 3),
      slideType: "player_spotlight",
      title: "Disposal Thresholds",
      subtitle: "How often do they hit each level?",
      slideText: "15+ | 20+ | 25+ | 30+",
      designNotes: "Show a simplified table inspired by the app: columns 15+ | 20+ | 25+ | 30+ with example ratio records. Dark table card. Green for strong records, amber for middle, muted red for lower. No player photos.",
    },
    {
      id: makeId("player_spotlight", 4),
      slideType: "player_spotlight",
      title: "Goal Thresholds",
      subtitle: "How often do they kick at each level?",
      slideText: "1+ | 2+ | 3+",
      designNotes: "Show a simplified table inspired by the app: columns 1+ | 2+ | 3+ with example ratio records. Same dark card style, same colour rules as disposal thresholds slide.",
    },
    {
      id: makeId("player_spotlight", 5),
      slideType: "player_spotlight",
      title: "Colour Guide",
      subtitle: "What the record colours mean",
      slideText: "Green = strong record\nAmber/orange = middle\nMuted red = low\nBlue/teal = small sample\nGrey dash = no data",
      designNotes: "Show the app-inspired record colour legend. Use colour swatches next to labels. Dark premium background. No gambling language. No lock icons.",
    },
    {
      id: makeId("player_spotlight", 6),
      slideType: "player_spotlight",
      title: "Free vs Preview Board",
      subtitle: "What you see depends on the game",
      slideText: "Free Board = more rows visible\nPreview Board = top rows visible, extra rows name-only",
      designNotes: "Show two simplified board examples side by side or stacked: Free Board (more rows clearly visible) and Preview Board (top rows visible, lower rows soft blurred/name-only). Dark premium style. No lock icons. Use soft blur overlay — not padlock.",
    },
    {
      id: makeId("cta", 7),
      slideType: "cta",
      title: "See the Full Board at Neeko",
      subtitle: "neekostats.com.au",
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
      subtitle: "neekostats.com.au",
    },
  ];
}

/**
 * Rebuild only the 4 stat table slides of a match board from aggregated admin rows.
 * Replaces slides at indices 1–4 (home_disposals, away_disposals, home_goals, away_goals)
 * while preserving cover (index 0) and CTA (last slide).
 */
export function rebuildMatchBoardSlidesFromRows(
  existingSlides: CarouselSlide[],
  matchBoardRows: {
    homeDisposals: MatchBoardPlayerRow[];
    awayDisposals: MatchBoardPlayerRow[];
    homeGoals:     MatchBoardPlayerRow[];
    awayGoals:     MatchBoardPlayerRow[];
  },
  ctaOverlayText?: string
): CarouselSlide[] {
  const cover = existingSlides[0];
  const cta   = existingSlides[existingSlides.length - 1];
  const isOpen = cover?.visibilityMode === "open_free_game";

  const sectionMap: Array<{
    key: keyof typeof matchBoardRows;
    slideType: CarouselSlide["slideType"];
    subtitle: string;
    index: number;
  }> = [
    { key: "homeDisposals", slideType: "home_disposals", subtitle: "Recent threshold records", index: 1 },
    { key: "awayDisposals", slideType: "away_disposals", subtitle: "Recent threshold records", index: 2 },
    { key: "homeGoals",     slideType: "home_goals",     subtitle: "Recent scoring records",   index: 3 },
    { key: "awayGoals",     slideType: "away_goals",     subtitle: "Recent scoring records",   index: 4 },
  ];

  const tableSlides = sectionMap.map(({ key, slideType, subtitle, index }) => {
    const existingSlide = existingSlides.find(s => s.slideType === slideType) ?? existingSlides[index];
    const rows: StatBoardRow[] = rowsToStatBoardRows(matchBoardRows[key]);
    const visibleCount = rows.filter(r => r.displayMode === "visible" || (!r.displayMode && !r.blurred)).length;
    const blurredCount = rows.filter(r => r.blurred || r.displayMode === "blurred").length;
    return {
      ...(existingSlide ?? {}),
      id: existingSlide?.id ?? makeId(key, index),
      slideType,
      title: existingSlide?.title ?? slideType,
      subtitle: existingSlide?.subtitle ?? subtitle,
      rows,
      visibilityMode: cover?.visibilityMode,
      visibleRowCount: visibleCount,
      blurredRowCount: blurredCount,
      ctaOverlayText: !isOpen ? ctaOverlayText : undefined,
    } as CarouselSlide;
  });

  return [cover, ...tableSlides, cta].filter(Boolean) as CarouselSlide[];
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
