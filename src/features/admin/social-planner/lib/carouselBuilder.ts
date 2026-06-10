/**
 * Carousel builder — assembles CarouselSlide arrays for each content type.
 * Supports open_free_game (full board) and preview_blurred (top N visible, rest blurred).
 */
import type {
  CarouselSlide, SlideType, AFLPlayerStat, PlannerSettings, StatBoardRow, TokenMap,
  ContentVisibilityMode, SocialPost, EducationPattern,
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
  settings: PlannerSettings,
  educationPost?: Pick<SocialPost, "educationTopic" | "teachingObjective" | "keyConcepts" | "educationPattern" | "educationVisualDirection" | "educationCopyTone" | "educationSlideCount" | "productArea" | "targetAudience" | "educationCta">
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
      return buildProductSlides(tokens, educationPost);
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

function buildProductSlides(
  tokens: TokenMap,
  ed?: Pick<SocialPost, "educationTopic" | "teachingObjective" | "keyConcepts" | "educationPattern" | "educationVisualDirection" | "educationCopyTone" | "educationSlideCount" | "productArea" | "targetAudience" | "educationCta"> | null
): CarouselSlide[] {
  const topic = ed?.educationTopic || "How to Read the Board";
  const objective = ed?.teachingObjective || "AFL stat research made simple";
  const pattern = ed?.educationPattern ?? "feature_walkthrough";
  const visualDir = ed?.educationVisualDirection ?? "app_card";
  const concepts = ed?.keyConcepts ?? [];

  const coverDesignNote = buildCoverDesignNote(visualDir);

  const slides: CarouselSlide[] = [
    {
      id: makeId("cover", 0),
      slideType: "cover",
      title: topic,
      subtitle: objective,
      imagePrompt: generateCoverPrompt("product_education"),
      designNotes: coverDesignNote,
    },
  ];

  // Select slide set based on pattern — fall back to default "How to Read the Board" set
  const contentSlides = buildEducationContentSlides(pattern, concepts);
  slides.push(...contentSlides);

  slides.push({
    id: makeId("cta", slides.length),
    slideType: "cta",
    title: ed?.educationCta || "See the Full Board at Neeko",
    subtitle: "neekostats.com.au",
  });

  return slides;
}

function buildCoverDesignNote(visualDir: SocialPost["educationVisualDirection"]): string {
  switch (visualDir) {
    case "typographic_poster":
      return "Typographic poster style. Bold condensed headline. Minimal dark background. No data cards.";
    case "screenshot_led":
      return "Screenshot-led design. Use attached app screenshots as dominant visual. Overlay headline text cleanly.";
    case "feature_callout":
      return "Feature callout style. Highlight one UI element or stat card in focus. Dark background, spotlight treatment.";
    case "clean_premium_promo":
      return "Clean premium promo. Minimal. Premium dark charcoal. Subtle green accent. Brand-forward.";
    case "dark_board_infographic":
      return "Dark board infographic style. Grid/data texture. Charcoal background. Green/amber data accents. Stat card motifs.";
    default:
      return "Premium dark board style. App-card elements in background. Inspired by Neeko Sports Stats mobile UI — dark rounded cards, subtle green accents, charcoal premium layout.";
  }
}

function buildEducationContentSlides(
  pattern: EducationPattern,
  extraConcepts: string[]
): CarouselSlide[] {
  switch (pattern) {
    case "beginner_explainer":
      return [
        {
          id: makeId("education_slide", 1),
          slideType: "education_slide",
          title: "What Are Hit Rates?",
          subtitle: "The core idea behind every stat on the board",
          slideText: "A hit rate tells you how often a player has reached a stat threshold across their recent games.\n12/12 = hit every game this season\n9/12 = hit 9 out of 12",
          designNotes: "Educational explainer. Show a simple ratio example: 12/12. Dark stat card inspired by the app. No player photo needed.",
        },
        {
          id: makeId("education_slide", 2),
          slideType: "education_slide",
          title: "Reading a Threshold Row",
          subtitle: "Columns: 15+ | 20+ | 25+ | 30+ disposals",
          slideText: "Each column = a threshold level\nRatio tells you how often they've reached it\nMore columns = higher bar",
          designNotes: "Show a simplified threshold table row. Dark rounded card, columns for 15+/20+/25+/30+. App-inspired layout.",
        },
        {
          id: makeId("education_slide", 3),
          slideType: "education_slide",
          title: "What the Colours Mean",
          subtitle: "Colour codes the strength of each record",
          slideText: "Green = strong record\nAmber/orange = middle\nMuted red = lower record\nBlue/teal = small sample\nGrey dash = no data",
          designNotes: "Colour legend. Use colour swatches next to each label. Dark premium background.",
        },
        {
          id: makeId("education_slide", 4),
          slideType: "education_slide",
          title: "L5 Avg — Recent Form",
          subtitle: "Last 5 games average — your current form signal",
          slideText: "L5 Avg shows the player's average across their last 5 games.\nUseful for spotting form rises or drops.",
          designNotes: "Show the L5 Avg stat card from the app. Recent-form strip. Dark rounded card.",
        },
      ];

    case "power_user_tips":
      return [
        {
          id: makeId("education_slide", 1),
          slideType: "education_slide",
          title: "Filter by Confidence Tier",
          subtitle: "Not all records are equal",
          slideText: "Thin sample (under 6 games) shows in blue/teal\nUse this to spot risky picks\nElite records: 8+ games, 90%+ hit rate",
          designNotes: "Side-by-side example: blue/teal small-sample card vs green elite card. App-inspired stat cards.",
        },
        {
          id: makeId("education_slide", 2),
          slideType: "education_slide",
          title: "Season vs Recent Form",
          subtitle: "When to trust season records vs L5",
          slideText: "Season record = full picture\nL5 Avg = recent momentum\nLook for both pointing the same direction",
          designNotes: "Two-column comparison. Season stat card on left, L5 form strip on right. Dark premium layout.",
        },
        {
          id: makeId("education_slide", 3),
          slideType: "education_slide",
          title: "Free Board vs Preview Board",
          subtitle: "What each visibility mode shows",
          slideText: "Free Board = all rows clearly visible\nPreview Board = top rows visible, extra rows name-only or blurred",
          designNotes: "Two board examples side by side. One fully visible, one with name-only + soft blur rows. No lock icons.",
        },
        {
          id: makeId("education_slide", 4),
          slideType: "education_slide",
          title: "Goal Thresholds",
          subtitle: "1+ | 2+ | 3+ — the kicking records",
          slideText: "Same ratio system, lower threshold numbers\nMost forwards hit 1+ regularly\n2+ and 3+ separate the elite goal kickers",
          designNotes: "Goal threshold table. Columns 1+/2+/3+. Dark rounded card. App-inspired layout.",
        },
      ];

    case "problem_solution":
      return [
        {
          id: makeId("education_slide", 1),
          slideType: "education_slide",
          title: "The Problem with Percentages",
          subtitle: "87% doesn't tell you the whole story",
          slideText: "7/8 (87%) = strong record over 8 games\n7/14 (50%) = weak record but same percentage\nRatios show you both the hit rate AND the sample size.",
          designNotes: "Comparison of two ratio cards — same percentage, different sample size. Clear contrast. App-style dark stat cards.",
        },
        {
          id: makeId("education_slide", 2),
          slideType: "education_slide",
          title: "The Solution: Ratios",
          subtitle: "12/12 beats 100% every time",
          slideText: "Ratios show:\n→ How many times they hit the threshold\n→ How many chances they had\n→ The full picture at a glance",
          designNotes: "Large hero ratio card: 12/12. Emerald green. Dark background. Simple and impactful.",
        },
        {
          id: makeId("education_slide", 3),
          slideType: "education_slide",
          title: "Small Sample Warning",
          subtitle: "Blue/teal = fewer than 6 games",
          slideText: "When a player has under 6 games of data, their record shows in blue/teal.\nHigh ratio, but small sample — proceed with caution.",
          designNotes: "Blue/teal stat card example. 4/4 small sample vs 11/12 large sample comparison. App-inspired cards.",
        },
      ];

    case "ui_spotlight":
      return [
        {
          id: makeId("education_slide", 1),
          slideType: "education_slide",
          title: "The Stat Board",
          subtitle: "Your match research hub",
          slideText: "Each match gets its own stat board\nDisposal rows + Goal rows\nSorted by hit rate strength",
          designNotes: "Show the main stat board UI. Use attached screenshot as style reference. Overlay clean labels.",
        },
        {
          id: makeId("education_slide", 2),
          slideType: "education_slide",
          title: "Player Detail",
          subtitle: "Drill into any player for deeper stats",
          slideText: "Tap any player row to expand\nSee their full threshold history\nL5 Avg + season record side by side",
          designNotes: "Show the expanded player detail area. Dark rounded player card. Inspired by app UI.",
        },
        {
          id: makeId("education_slide", 3),
          slideType: "education_slide",
          title: "Recent Form Strip",
          subtitle: "Last 5 game scores at a glance",
          slideText: "17 · 31 · 31 · 35 · 23\nThe strip shows their last 5 actual disposal/goal counts\nEasy to spot a hot or cold streak",
          designNotes: "Recent form strip visual. Show 5 values in a row, app-style. Dark card, subtle spacing.",
        },
      ];

    case "single_image_poster":
      return [
        {
          id: makeId("education_slide", 1),
          slideType: "education_slide",
          title: "One Board. Every Match.",
          subtitle: "Disposal + Goal form for every AFL game",
          slideText: "Neeko Sports Stats gives you threshold hit rates for every player in every match.\nFree to access. Updated every round.",
          designNotes: "Single-image poster. Bold typographic statement. Dark premium background. Brand logo prominent. neekostats.com.au as sub-text.",
        },
      ];

    case "promo_education_hybrid":
      return [
        {
          id: makeId("education_slide", 1),
          slideType: "education_slide",
          title: "What Is a Hit Rate?",
          subtitle: "The stat that powers the Neeko board",
          slideText: "12/12 = hit their disposal threshold in all 12 games this season\n9/10 = hit it in 9 of their last 10\nYou can see this for every player, every match.",
          designNotes: "Stat card explainer. Large ratio as hero stat. Branded dark card.",
        },
        {
          id: makeId("education_slide", 2),
          slideType: "education_slide",
          title: "See It Live",
          subtitle: "Free for every game — at neekostats.com.au",
          slideText: "Disposal boards. Goal boards.\nFree games every round.\nFull board access available.",
          designNotes: "Product CTA slide. Show simplified stat board. Brand colours. Prominent neekostats.com.au.",
        },
      ];

    // feature_walkthrough (default)
    default:
      return [
        {
          id: makeId("education_slide", 1),
          slideType: "education_slide",
          title: "Ratios Beat Percentages",
          subtitle: "12/12 tells you more than 100%",
          slideText: "11 hits from 12 games\n11/12",
          designNotes: "Show a large example stat card: 11/12 — 11 hits from 12 games. Use green as strong record colour. Inspired by app stat card: dark rounded card, ratio as hero stat. No player photo needed.",
        },
        {
          id: makeId("education_slide", 2),
          slideType: "education_slide",
          title: "Recent Form (L5 Avg)",
          subtitle: "Last 5 games — your current form indicator",
          slideText: "Last 5: 17 · 31 · 31 · 35 · 23\nL5 Avg 27.4",
          designNotes: "Show a recent-form strip inspired by the app: 17 · 31 · 31 · 35 · 23. Then show L5 Avg 27.4. Use the app-style recent game score strip visual — dark rounded card, subtle spacing between values.",
        },
        {
          id: makeId("education_slide", 3),
          slideType: "education_slide",
          title: "Disposal Thresholds",
          subtitle: "How often do they hit each level?",
          slideText: "15+ | 20+ | 25+ | 30+",
          designNotes: "Show a simplified table inspired by the app: columns 15+ | 20+ | 25+ | 30+ with example ratio records. Dark table card. Green for strong records, amber for middle, muted red for lower. No player photos.",
        },
        {
          id: makeId("education_slide", 4),
          slideType: "education_slide",
          title: "Goal Thresholds",
          subtitle: "How often do they kick at each level?",
          slideText: "1+ | 2+ | 3+",
          designNotes: "Show a simplified table inspired by the app: columns 1+ | 2+ | 3+ with example ratio records. Same dark card style, same colour rules as disposal thresholds slide.",
        },
        {
          id: makeId("education_slide", 5),
          slideType: "education_slide",
          title: "Colour Guide",
          subtitle: "What the record colours mean",
          slideText: "Green = strong record\nAmber/orange = middle\nMuted red = low\nBlue/teal = small sample\nGrey dash = no data",
          designNotes: "Show the app-inspired record colour legend. Use colour swatches next to labels. Dark premium background. No gambling language. No lock icons.",
        },
        {
          id: makeId("education_slide", 6),
          slideType: "education_slide",
          title: "Free vs Preview Board",
          subtitle: "What you see depends on the game",
          slideText: "Free Board = more rows visible\nPreview Board = top rows visible, extra rows name-only",
          designNotes: "Show two simplified board examples side by side or stacked: Free Board (more rows clearly visible) and Preview Board (top rows visible, lower rows soft blurred/name-only). Dark premium style. No lock icons. Use soft blur overlay — not padlock.",
        },
      ];
  }
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
