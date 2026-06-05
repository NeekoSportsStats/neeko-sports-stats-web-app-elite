/**
 * Carousel prompt builder — generates full carousel prompts, slide-by-slide prompt packages,
 * background-only prompts, and slide text packages for the AFL Content Command Centre.
 *
 * Rules enforced in every generated prompt:
 * - No page numbers, no "slide X of Y"
 * - No player photos on cover slides
 * - No gambling language (bet, odds, picks, lock, line, banker, multi, overs, unders)
 * - No tipster phrasing
 * - No bookmaker branding
 */

import type { SocialPost, CarouselSlide, StatBoardRow, ContentVisibilityMode } from "../types";

export type PromptMode = "full_graphic" | "background_only" | "template_export";

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAND = "Neeko Sports Stats";
const CTA_URL = "neekostats.com.au";
const SAFETY_RULES = `
IMPORTANT RESTRICTIONS:
- No page numbers. No "slide 1 of 6", no "1/6", no numbering on images.
- No player photos on cover slide.
- No gambling language.
- No odds, no bookmaker branding, no tipster phrasing.
- Do not include words: bet, odds, banker, lock, picks, target, line, clearing the line, multi, overs, unders.
- Use ratios like 12/12, 9/10, 7/12 as the main stat format.
- Do not use percentages as the main visual stat unless included as secondary text.`.trim();

const CAROUSEL_STYLE = `
FORMAT & DESIGN:
- Dimensions: 1080×1350 portrait (Instagram carousel)
- Create each slide as a separate image
- Consistent premium dark AFL stats-board style across all slides
- Dark charcoal / black background
- Stadium lighting atmosphere
- Subtle data graphics and grid texture
- Gold stat highlights
- Team colour accents where relevant
- Bold condensed sports typography
- Clean table layouts with strong contrast
- Include ${BRAND} branding on every slide`.trim();

// ─── Colour grade rules ───────────────────────────────────────────────────────

const COLOUR_GRADE_RULES = `
COLOUR CODING FOR THRESHOLD CELLS (use subtle tints, not solid blocks):
- 90%+ hit rate with 6+ games: gold/amber highlight (elite form)
- 75–89% with 6+ games: green tint (strong form)
- 60–74%: amber/yellow tint (solid)
- 50–59%: orange tint (watch)
- Under 50%: muted red/dark (low)
- Under 6 games played: blue-grey outline or muted border only (thin sample — do NOT colour as green even if 100%)
- Missing data (—): grey dash, no colour
Use ratio text (e.g. 9/11) as the main visible stat — colour is secondary visual cue only.`.trim();

// ─── Row formatters ───────────────────────────────────────────────────────────

function formatDisposalRow(row: StatBoardRow): string {
  const d15 = row.threshold15 ?? "—";
  const d20 = row.threshold20 ?? "—";
  const d25 = row.threshold25 ?? "—";
  const d30 = row.threshold30 ?? "—";
  return `${row.playerName} | L5 avg ${row.l5Avg.toFixed(1)} | 15+: ${d15} | 20+: ${d20} | 25+: ${d25} | 30+: ${d30}`;
}

function formatGoalRow(row: StatBoardRow): string {
  const g1 = row.threshold1Goal ?? "—";
  const g2 = row.threshold2Goals ?? "—";
  const g3 = row.threshold3Goals ?? "—";
  return `${row.playerName} | L5 avg ${row.l5Avg.toFixed(1)} | 1+: ${g1} | 2+: ${g2} | 3+: ${g3}`;
}

function formatRow(row: StatBoardRow, isDisposal: boolean): string {
  const mode = row.displayMode ?? (row.blurred ? "blurred" : "visible");
  switch (mode) {
    case "hidden":
      return null as unknown as string; // caller filters nulls
    case "blurred":
      return "(row hidden — upgrade to unlock)";
    case "name_only":
      return `${row.playerName} | [stats hidden — preview only]`;
    default:
      return isDisposal ? formatDisposalRow(row) : formatGoalRow(row);
  }
}

function formatRowForText(row: StatBoardRow, isDisposal: boolean): string | null {
  const mode = row.displayMode ?? (row.blurred ? "blurred" : "visible");
  if (mode === "hidden") return null;
  if (mode === "blurred") return `[BLURRED] ${row.playerName} | stats hidden`;
  if (mode === "name_only") return `[NAME ONLY] ${row.playerName} | stats hidden`;
  return isDisposal ? formatDisposalRow(row) : formatGoalRow(row);
}

function isDisposalSlide(slideType: CarouselSlide["slideType"]): boolean {
  return slideType === "home_disposals" || slideType === "away_disposals";
}

// ─── Visibility instructions ──────────────────────────────────────────────────

function visibilityInstructions(
  mode: ContentVisibilityMode | undefined,
  ctaOverlayText: string | undefined,
  totalRows: number,
  visibleRows: number | undefined
): string {
  if (mode === "open_free_game") {
    return `Visibility: OPEN FREE GAME — show all ${totalRows} rows clearly. No blur. No lock language. No covered rows.`;
  }
  const visible = visibleRows ?? 3;
  const blurredCount = Math.max(0, totalRows - visible);
  return [
    `Visibility: PREVIEW BLURRED`,
    `Show only the top ${visible} rows clearly.`,
    `Rows ${visible + 1}–${totalRows} (${blurredCount} rows) must be blurred, faded, or covered.`,
    `Blurred rows must NOT reveal readable player names or records.`,
    ctaOverlayText
      ? `Place CTA overlay over the blurred rows: "${ctaOverlayText}"`
      : `Place CTA overlay over the blurred rows: "See the full board at ${CTA_URL}"`,
  ].join("\n");
}

// ─── Per-slide prompt builders ────────────────────────────────────────────────

function buildCoverSlideSection(post: SocialPost, slide: CarouselSlide): string {
  const isOpen = post.visibilityMode === "open_free_game";
  const boardLabel = isOpen ? "Free Game Board" : "Preview Board";
  return `SLIDE 1 — COVER
Text:
${slide.title}
${slide.subtitle ?? `Round ${post.round} ${boardLabel}`}
AFL ${post.season}

Design:
No player photos on cover.
Team colour accents for ${post.homeTeam ?? "home team"} and ${post.awayTeam ?? "away team"}.
Dark premium stadium/stat-board style.
${BRAND} branding.`;
}

function buildTableSlideSection(
  slideNum: number,
  slide: CarouselSlide,
  post: SocialPost
): string {
  const isDisposal = isDisposalSlide(slide.slideType);
  const rows = slide.rows ?? [];
  const visibleRows = rows.filter(r => {
    const mode = r.displayMode ?? (r.blurred ? "blurred" : "visible");
    return mode === "visible";
  });
  const nameOnlyRows = rows.filter(r => r.displayMode === "name_only");
  const blurredRows = rows.filter(r => r.blurred || r.displayMode === "blurred");
  const hiddenRows = rows.filter(r => r.displayMode === "hidden");
  const shownRows = rows.filter(r => r.displayMode !== "hidden");
  const totalRows = shownRows.length;
  const hasData = rows.length > 0;

  const colHeader = isDisposal
    ? "Player | L5 Avg | 15+ | 20+ | 25+ | 30+"
    : "Player | L5 Avg | 1+ | 2+ | 3+";

  const rowLines = hasData
    ? shownRows
        .map((r, i) => {
          const line = formatRow(r, isDisposal);
          if (line == null) return null;
          return `${i + 1}. ${line}`;
        })
        .filter(Boolean)
        .join("\n")
    : "DATA MISSING — no rows available for this slide";

  const modeSummary: string[] = [];
  if (nameOnlyRows.length > 0) modeSummary.push(`${nameOnlyRows.length} name-only row(s): show player name, hide all stats`);
  if (blurredRows.length > 0) modeSummary.push(`${blurredRows.length} blurred row(s): fully obscure`);
  if (hiddenRows.length > 0) modeSummary.push(`${hiddenRows.length} row(s) excluded entirely`);
  const modeNote = modeSummary.length > 0 ? `\nDisplay modes: ${modeSummary.join("; ")}` : "";

  const visInstructions = hasData
    ? visibilityInstructions(
        slide.visibilityMode ?? post.visibilityMode,
        slide.ctaOverlayText,
        totalRows,
        slide.visibleRowCount
      )
    : "DATA MISSING — regenerate after player stats load.";

  return `SLIDE ${slideNum} — ${slide.title.toUpperCase()}
Table columns:
${colHeader}

Rows:
${rowLines}${modeNote}

${visInstructions}

${COLOUR_GRADE_RULES}`;
}

function buildCTASlideSection(slideNum: number, slide: CarouselSlide): string {
  return `SLIDE ${slideNum} — CTA
Text:
See the full board at ${BRAND}.
${CTA_URL}
Link in bio.

Design:
Minimal dark premium CTA slide.
Gold highlights.
${BRAND} branding.
No player photos.`;
}

function buildPlayerSpotlightSlideSection(
  slideNum: number,
  slide: CarouselSlide,
  post: SocialPost
): string {
  const row = slide.rows?.[0];
  if (!row) {
    return `SLIDE ${slideNum} — PLAYER SPOTLIGHT
WARNING: No player selected. Select a player before generating the full player spotlight prompt.`;
  }
  const isDisposal = slide.title.toLowerCase().includes("disposal") ||
    (row.threshold15 != null || row.threshold20 != null);
  return `SLIDE ${slideNum} — PLAYER SPOTLIGHT: ${slide.title}
Text:
${row.playerName}
${slide.subtitle ?? ""}
L5 avg: ${row.l5Avg.toFixed(1)}

Design:
Use supplied player photo only (do not invent a different player).
High-energy matchday atmosphere, stadium lights, crowd blur.
Team colour paint strokes. Floating stat card in bottom third.
Gold main record. White player name. Dark navy/black base.
${BRAND} branding.`;
}

function buildGenericSlideSection(slideNum: number, slide: CarouselSlide): string {
  return `SLIDE ${slideNum} — ${slide.title.toUpperCase()}
${slide.subtitle ? `Subtitle: ${slide.subtitle}\n` : ""}Design:
Dark premium AFL stats style. ${BRAND} branding.
${slide.designNotes ?? ""}`.trim();
}

// ─── Background-only prompt builder per slide ─────────────────────────────────

function buildBackgroundSlidePrompt(slideNum: number, slide: CarouselSlide): string {
  const isTable = slide.slideType.includes("disposals") || slide.slideType.includes("goals");
  const isCover = slide.slideType === "cover";

  let design = "";
  if (isCover) {
    design = `Dark premium stadium/stat-board background.
Plenty of clean space for title text overlay.
Abstract team colour accents (no specific team logos).
Stadium lighting atmosphere. No readable text.`;
  } else if (isTable) {
    design = `Dark charcoal background.
Subtle data-grid texture.
Team accent strip on the left.
Clean central table area — lots of space for text rows to be added by template.
Gold accent elements. No readable text.`;
  } else {
    design = `Dark minimal background. Gold accents. Clean space for text overlay.`;
  }

  return `BACKGROUND ONLY — SLIDE ${slideNum} (${slide.title})
BACKGROUND ONLY — the app/template will add all text, tables, and stats on top.

Create a premium AFL stats graphic background only.
Dimensions: 1080×1350 portrait.

${design}

IMPORTANT:
- No text of any kind
- No player names
- No stat numbers or records
- No page numbers
- No logos (${BRAND} branding added separately by the app)
- No player photos
- Plenty of clean space for text overlays`;
}

// ─── Public: Full Carousel Prompt ────────────────────────────────────────────

export function buildFullCarouselPrompt(post: SocialPost): string {
  const isMatchBoard = post.contentType === "match_stat_board";
  const hasData = post.selectedPlayers.length > 0;
  const dataWarning = isMatchBoard && !hasData
    ? "\n⚠️ WARNING: Player stat rows are missing. Full carousel prompt cannot include table data.\nDATA MISSING — regenerate after player stats load.\n"
    : "";

  const intro = `Create a premium AFL Instagram carousel for ${BRAND}.

${CAROUSEL_STYLE}

${SAFETY_RULES}
${dataWarning}
---`;

  const slideSections: string[] = [];
  let slideNum = 1;

  for (const slide of post.carouselSlides) {
    let section = "";
    switch (slide.slideType) {
      case "cover":
        if (isMatchBoard) {
          section = buildCoverSlideSection(post, slide);
        } else {
          section = buildGenericSlideSection(slideNum, slide);
        }
        break;
      case "home_disposals":
      case "away_disposals":
      case "home_goals":
      case "away_goals":
        section = buildTableSlideSection(slideNum, slide, post);
        break;
      case "player_spotlight":
        section = buildPlayerSpotlightSlideSection(slideNum, slide, post);
        break;
      case "cta":
        section = buildCTASlideSection(slideNum, slide);
        break;
      default:
        section = buildGenericSlideSection(slideNum, slide);
    }
    slideSections.push(section);
    slideNum++;
  }

  if (slideSections.length === 0) {
    return `${intro}\n\nNo slides generated. Regenerate the post first.`;
  }

  return `${intro}\n\n${slideSections.join("\n\n---\n\n")}`;
}

// ─── Public: Slide-by-Slide Prompt Package ────────────────────────────────────

export function buildSlidePromptPackage(post: SocialPost): string {
  const header = `PROMPT PACKAGE — ${post.title}
${post.homeTeam && post.awayTeam ? `${post.homeTeam} v ${post.awayTeam} | ` : ""}Round ${post.round} · ${post.season}
Visibility: ${post.visibilityMode?.replace(/_/g, " ") ?? "standard"}

Each prompt below is for a single slide. Use them separately with your image generator.

${SAFETY_RULES}
`;

  const slideSections: string[] = [];
  let slideNum = 1;

  for (const slide of post.carouselSlides) {
    let section = "";
    switch (slide.slideType) {
      case "cover":
        section = post.contentType === "match_stat_board"
          ? buildCoverSlideSection(post, slide)
          : buildGenericSlideSection(slideNum, slide);
        break;
      case "home_disposals":
      case "away_disposals":
      case "home_goals":
      case "away_goals":
        section = buildTableSlideSection(slideNum, slide, post);
        break;
      case "player_spotlight":
        section = buildPlayerSpotlightSlideSection(slideNum, slide, post);
        break;
      case "cta":
        section = buildCTASlideSection(slideNum, slide);
        break;
      default:
        section = buildGenericSlideSection(slideNum, slide);
    }

    slideSections.push(`SLIDE ${slideNum} PROMPT:\n${section}`);
    slideNum++;
  }

  return header + slideSections.join("\n\n" + "─".repeat(60) + "\n\n");
}

// ─── Public: Background-Only Prompt Package ───────────────────────────────────

export function buildBackgroundPromptPackage(post: SocialPost): string {
  const header = `BACKGROUND PROMPT PACKAGE — ${post.title}
${post.homeTeam && post.awayTeam ? `${post.homeTeam} v ${post.awayTeam} | ` : ""}Round ${post.round} · ${post.season}

BACKGROUND ONLY — these prompts generate clean backgrounds.
The app/template will add all text, tables, and stats on top.

Use these when building graphics with Canva, Figma, or a custom template system.
`;

  const sections = post.carouselSlides.map((slide, i) =>
    buildBackgroundSlidePrompt(i + 1, slide)
  );

  return header + sections.join("\n\n" + "─".repeat(60) + "\n\n");
}

// ─── Public: Full Slide Text Package ─────────────────────────────────────────

export function buildFullSlideTextPackage(post: SocialPost): string {
  const header = `FULL SLIDE TEXT — ${post.title}
${post.homeTeam && post.awayTeam ? `${post.homeTeam} v ${post.awayTeam}` : ""} | Round ${post.round} · ${post.season}
Visibility: ${post.visibilityMode?.replace(/_/g, " ") ?? "standard"}

This is the exact text content for each slide (not an image prompt).
Display mode labels: [VISIBLE] full stats shown | [NAME ONLY] name visible, stats hidden | [BLURRED] row obscured | rows marked [hidden] excluded
`;

  const slideSections = post.carouselSlides.map((slide, i) => {
    const slideNum = i + 1;
    const lines: string[] = [`SLIDE ${slideNum} — ${slide.title.toUpperCase()}`];
    if (slide.subtitle) lines.push(slide.subtitle);

    const rows = slide.rows ?? [];
    if (rows.length > 0) {
      const isDisposal = isDisposalSlide(slide.slideType);
      if (isDisposal) {
        lines.push("Player | L5 Avg | 15+ | 20+ | 25+ | 30+");
      } else {
        lines.push("Player | L5 Avg | 1+ | 2+ | 3+");
      }
      for (const row of rows) {
        const formatted = formatRowForText(row, isDisposal);
        if (formatted != null) lines.push(formatted);
      }
    }

    if (slide.ctaOverlayText) {
      lines.push("");
      lines.push(`CTA Overlay: ${slide.ctaOverlayText}`);
    }

    if (slide.slideType === "cta") {
      lines.push(`See the full board at ${BRAND}.`);
      lines.push(CTA_URL);
      lines.push("Link in bio.");
    }

    return lines.join("\n");
  });

  return header + slideSections.join("\n\n" + "─".repeat(40) + "\n\n");
}

// ─── Public: Full Post Package ────────────────────────────────────────────────

export function buildFullPostPackage(post: SocialPost): string {
  const safetyLine = post.warnings.length === 0
    ? "SAFETY: Clean — no issues found."
    : `SAFETY: ${post.warnings.length} issue(s) — review before posting.\n${post.warnings.map(w => `  • ${w}`).join("\n")}`;

  return [
    `POST TITLE:`,
    post.title,
    "",
    `HOOK:`,
    post.hook || "(empty)",
    "",
    `CAPTION:`,
    post.caption || "(empty)",
    "",
    `SHORT CAPTION:`,
    post.shortCaption || "(empty)",
    "",
    `HASHTAGS:`,
    post.hashtags.join(" ") || "(none)",
    "",
    buildFullSlideTextPackage(post),
    "",
    "─".repeat(60),
    "",
    buildFullCarouselPrompt(post),
    "",
    "─".repeat(60),
    "",
    "SLIDE-BY-SLIDE PROMPTS:",
    buildSlidePromptPackage(post),
    "",
    "─".repeat(60),
    "",
    safetyLine,
  ].join("\n");
}

// ─── Public: data health check ────────────────────────────────────────────────

export interface PromptHealth {
  isComplete: boolean;
  missingData: string[];
  slideCount: number;
  playerRowCount: number;
  hasAllRequiredSlides: boolean;
}

export function checkPromptHealth(post: SocialPost): PromptHealth {
  const missingData: string[] = [];
  const isMatchBoard = post.contentType === "match_stat_board";

  if (isMatchBoard) {
    const slideTypes = post.carouselSlides.map(s => s.slideType);
    const expectedTypes = ["cover", "home_disposals", "away_disposals", "home_goals", "away_goals", "cta"];
    const missingSlides = expectedTypes.filter(t => !slideTypes.includes(t as CarouselSlide["slideType"]));
    if (missingSlides.length > 0) {
      missingData.push(`Missing slides: ${missingSlides.join(", ")}`);
    }
    if (post.selectedPlayers.length === 0) {
      missingData.push("Player stat rows are missing. Full carousel prompt cannot include table data.");
    }
  }

  if (!post.hook || post.hook.includes("{")) {
    missingData.push("Hook contains unresolved tokens");
  }
  if (!post.caption || post.caption.includes("{")) {
    missingData.push("Caption contains unresolved tokens");
  }

  const expectedSlideCount = isMatchBoard ? 6 : 0;
  const hasAllRequired = !isMatchBoard || post.carouselSlides.length >= 6;

  return {
    isComplete: missingData.length === 0,
    missingData,
    slideCount: post.carouselSlides.length,
    playerRowCount: post.selectedPlayers.length,
    hasAllRequiredSlides: hasAllRequired,
  };
}
