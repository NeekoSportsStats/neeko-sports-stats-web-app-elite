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

import type { SocialPost, CarouselSlide, StatBoardRow, ContentVisibilityMode, PlayerAvailabilityStatus, SpotlightSelection, ScreenshotRefMode } from "../types";
import { EXCLUDED_STATUSES, WARNING_STATUSES } from "../types";

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
RECORD CELL COLOUR RULES (use ratios as the main text — e.g. 11/11, 9/10, 7/12):
- 90%+ hit rate with 8+ games: emerald green (NOT gold, NOT yellow)
- 75–89% with 8+ games: green
- 60–74%: amber/orange (not Neeko brand gold)
- 50–59%: orange
- under 50%: muted red
- fewer than 6 games: blue/teal small-sample style — even if ratio is perfect (e.g. 4/4)
- missing data: grey dash, no colour

IMPORTANT:
- Do NOT use gold or yellow for 100% records.
- Gold is reserved for Neeko Sports Stats branding, headings, dividers and CTA accents only.
- Keep colours premium and subtle — not a traffic-light board.
- For rows marked name_only: show player name, hide stat cells with a soft blur / dark glass overlay. Do NOT reveal coloured stat cells.
- For rows marked blurred: fully obscure the row with a soft blur / dark glass overlay.
- Do NOT use lock icons, padlock icons, or the words "locked" or "unlock".
- Use a soft blur or dark glass overlay for hidden stats, with a CTA strip: "See the full board at Neeko Sports Stats"`.trim();

// ─── Screenshot reference blocks ─────────────────────────────────────────────

const SCREENSHOT_EXCLUSIONS = `Do NOT recreate:
- Safari address bar or browser chrome
- Phone status bar (time, battery, signal icons)
- Bottom Safari toolbar or browser controls
- Site navigation header
- Exact screenshot crop
- Any mobile browser UI element`;

const SCREENSHOT_EXTRACT_BASE = `Extract the visual language:
- Dark premium charcoal/black mobile UI
- Rounded stat cards
- Recent game score strip
- Hit-rate table with threshold rows
- Ratio records like 12/12, 9/12, 7/12
- L5 avg and projection cards
- Green/amber/red record-strength colouring
- Subtle premium black/charcoal background
- Clean sports analytics layout`;

const SCREENSHOT_REF_PREFIX = `Use the attached Neeko Sports Stats mobile board screenshots as visual style references only.`;

function buildScreenshotReferenceBlock(
  mode: "how_to_read" | "match_board" | "player_spotlight" | "product_education" | "general"
): string {
  switch (mode) {
    case "how_to_read":
      return `REFERENCE IMAGES:
${SCREENSHOT_REF_PREFIX}

${SCREENSHOT_EXTRACT_BASE}
- Expanded player detail area
- Dark rounded player cards
- Subtitle text areas below stats

${SCREENSHOT_EXCLUSIONS}

Create clean Instagram carousel graphics inspired by the product UI, not literal screenshots.`;

    case "match_board":
      return `REFERENCE IMAGES:
${SCREENSHOT_REF_PREFIX} Use for table card style only.

Extract:
- Rounded dark stat cards
- Compact rows with threshold columns
- Ratio records as the hero stat
- Colour-coded stat cells (green, amber/orange, muted red, grey dash, blue/teal)
- Green for elite/strong records
- Amber/orange for middle records
- Muted red for lower records
- Grey dash for missing data
- Teal/blue for small samples

${SCREENSHOT_EXCLUSIONS}

Do not make the generated carousel look like a phone screenshot. It should look like a polished Instagram stat-board graphic inspired by the app.`;

    case "player_spotlight":
      return `REFERENCE IMAGES:
${SCREENSHOT_REF_PREFIX} Use as supporting design reference for the stat card area only.

Extract for the stat card section only:
- Dark rounded stat card
- Ratio as the hero stat
- L5 avg display
- Last 5 strip
- Clean green/amber/red stat colouring

The player spotlight should be a premium player graphic using the supplied player photo.
Do not recreate the app as a screenshot. The photo and stadium atmosphere are primary.

${SCREENSHOT_EXCLUSIONS}`;

    case "product_education":
      return `REFERENCE IMAGES:
${SCREENSHOT_REF_PREFIX}

${SCREENSHOT_EXTRACT_BASE}

Use these visual ideas to create clean, educational Instagram carousel graphics.
Do not recreate the phone browser chrome.
Inspired by the product UI — not a literal screenshot.

${SCREENSHOT_EXCLUSIONS}`;

    default:
      return `REFERENCE IMAGES:
${SCREENSHOT_REF_PREFIX}

${SCREENSHOT_EXTRACT_BASE}

${SCREENSHOT_EXCLUSIONS}`;
  }
}

/** Determines whether to inject a screenshot reference block for this post + mode */
function shouldInjectScreenshotRef(
  post: SocialPost,
  refMode: ScreenshotRefMode | undefined,
): boolean {
  if (!refMode || refMode === "off") return false;
  if (!post.referenceScreenshots || post.referenceScreenshots.length === 0) return false;
  const ct = post.contentType;
  if (refMode === "product_education_only") {
    return ct === "product_education";
  }
  // all_board_style
  return (
    ct === "match_stat_board" ||
    ct === "product_education" ||
    ct === "player_spotlight" ||
    ct === "player_spotlight_duo"
  );
}

/** Builds the REFERENCE IMAGES block appropriate for this post type */
function buildPostScreenshotRef(post: SocialPost): string {
  const ct = post.contentType;
  if (ct === "product_education") return buildScreenshotReferenceBlock("product_education");
  if (ct === "match_stat_board") return buildScreenshotReferenceBlock("match_board");
  if (ct === "player_spotlight" || ct === "player_spotlight_duo") return buildScreenshotReferenceBlock("player_spotlight");
  return buildScreenshotReferenceBlock("general");
}



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
      return null as unknown as string;
    case "blurred":
      return "(row obscured — soft blur/dark glass overlay)";
    case "name_only":
      return `${row.playerName} | [stat cells hidden — soft blur overlay]`;
    default:
      return isDisposal ? formatDisposalRow(row) : formatGoalRow(row);
  }
}

function formatRowForText(row: StatBoardRow, isDisposal: boolean): string | null {
  const mode = row.displayMode ?? (row.blurred ? "blurred" : "visible");
  if (mode === "hidden") return null;
  if (mode === "blurred") return `[BLURRED] ${row.playerName} | row obscured`;
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
    return `Visibility: OPEN FREE GAME — show all ${totalRows} rows clearly. No blur. No hidden rows.`;
  }
  const visible = visibleRows ?? 3;
  const hiddenCount = Math.max(0, totalRows - visible);
  return [
    `Visibility: PREVIEW BOARD`,
    `Show the top ${visible} rows fully (player name + all stat cells visible).`,
    `Rows ${visible + 1}–${totalRows} (${hiddenCount} rows): apply a soft blur / dark glass overlay over stat cells. Do NOT show readable stats or reveal coloured cells.`,
    `Do NOT use lock icons, padlock icons, or the words "locked" or "unlock".`,
    ctaOverlayText
      ? `Place a CTA strip over the blurred area: "${ctaOverlayText}"`
      : `Place a CTA strip over the blurred area: "See the full board at Neeko Sports Stats"`,
  ].join("\n");
}

// ─── Per-slide prompt builders ────────────────────────────────────────────────

function buildCoverSlideSection(post: SocialPost, slide: CarouselSlide): string {
  const isOpen = post.visibilityMode === "open_free_game";
  const boardLabel = slide.designNotes ?? (isOpen ? "Free Game Board" : "Match Stat Board");
  return `SLIDE 1 — COVER
Text:
${slide.title}
${slide.subtitle ?? `Round ${post.round}`}
${boardLabel}
Disposal + Goal Form
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
  // Prefer rich selectedSpotlight data; fall back to legacy slide.rows
  const sel = post.selectedSpotlight?.[0];
  if (sel) {
    return buildSpotlightPromptFromSelection(sel, post, slideNum);
  }

  const row = slide.rows?.[0];
  if (!row) {
    return `SLIDE ${slideNum} — PLAYER SPOTLIGHT
WARNING: No player selected. Select a player before generating the full player spotlight prompt.`;
  }

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

/** Build the full Player Spotlight image prompt from rich SpotlightSelection data */
function buildSpotlightPromptFromSelection(
  sel: SpotlightSelection,
  post: SocialPost,
  slideNum = 1
): string {
  const statTypeWord = sel.statType === "goals" ? "goals" : "disposals";
  const last5 = sel.lastFive.length > 0
    ? sel.lastFive.join(" · ")
    : "Last 5 data unavailable";
  const matchCtx = sel.gameLabel || `${post.homeTeam ?? "Home"} v ${post.awayTeam ?? "Away"}`;

  return `SLIDE ${slideNum} — PLAYER SPOTLIGHT: ${sel.playerName}

Create a premium AFL Player Spotlight graphic for ${BRAND}.

Use the supplied player photo only.

Text on image:
${sel.playerName}
${sel.recordLabel}
at ${sel.thresholdLabel} ${statTypeWord}
L5 avg ${sel.l5Avg.toFixed(1)}
Last 5: ${last5}

Match context:
${matchCtx}
Round ${post.round}
AFL ${post.season}

Design:
High-energy AFL matchday atmosphere.
Dark navy / black base.
Stadium lights.
Crowd blur.
Team colour accents for ${sel.team}.
Floating stat card in the bottom third.
Large ratio record as the hero stat.
Use green for strong/elite records, not yellow/gold.
Use Neeko gold only for branding, borders, dividers and CTA accents.
White player name.
Bold condensed sports typography.
${BRAND} branding visible but clean.

Important:
- Use the supplied player photo only.
- Do not invent a different player.
- No page numbers.
- No "slide 1 of 1".
- No gambling language.
- No odds.
- No bookmaker branding.
- No tipster phrasing.
- Do not include words like bet, odds, banker, lock, picks, target, line, clearing the line, multi, overs, unders.
- Use the ratio record as the main stat, not the percentage.
- Format: 1080x1350 portrait.`;
}

/** Public builder — called by the Refresh AI Prompt button */
export function buildSpotlightImagePrompt(post: SocialPost): string {
  const sel = post.selectedSpotlight?.[0];
  if (!sel) return "";
  return buildSpotlightPromptFromSelection(sel, post);
}

function buildGenericSlideSection(slideNum: number, slide: CarouselSlide): string {
  const designNotes = slide.designNotes ? `\nDesign notes: ${slide.designNotes}` : "";
  const slideTextBlock = slide.slideText ? `\nSlide text:\n${slide.slideText}` : "";
  return `SLIDE ${slideNum} — ${slide.title.toUpperCase()}
${slide.subtitle ? `Subtitle: ${slide.subtitle}\n` : ""}${slideTextBlock}Design:
Dark premium AFL stats style. ${BRAND} branding.${designNotes}`.trim();
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

export function buildFullCarouselPrompt(post: SocialPost, screenshotRefMode?: ScreenshotRefMode): string {
  const isMatchBoard = post.contentType === "match_stat_board";
  const isProductEd = post.contentType === "product_education";
  const hasData = post.selectedPlayers.length > 0;
  const dataWarning = isMatchBoard && !hasData
    ? "\n⚠️ WARNING: Player stat rows are missing. Full carousel prompt cannot include table data.\nDATA MISSING — regenerate after player stats load.\n"
    : "";

  const screenshotBlock = shouldInjectScreenshotRef(post, screenshotRefMode)
    ? `\n${buildPostScreenshotRef(post)}\n`
    : "";

  const productEdBlock = isProductEd ? `
PRODUCT EDUCATION STYLE GUIDE:
These slides should look like clean, educational Instagram graphics inspired by the Neeko Sports Stats product UI.
Use dark premium charcoal backgrounds, rounded stat card elements, and the app's visual language.
Do NOT use gambling language. No lock icons. No page numbers.
` : "";

  const intro = `Create a premium AFL Instagram carousel for ${BRAND}.

${CAROUSEL_STYLE}

${SAFETY_RULES}
${dataWarning}${productEdBlock}${screenshotBlock}
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

export function buildSlidePromptPackage(post: SocialPost, screenshotRefMode?: ScreenshotRefMode): string {
  const screenshotBlock = shouldInjectScreenshotRef(post, screenshotRefMode)
    ? `\n${buildPostScreenshotRef(post)}\n`
    : "";

  const header = `PROMPT PACKAGE — ${post.title}
${post.homeTeam && post.awayTeam ? `${post.homeTeam} v ${post.awayTeam} | ` : ""}Round ${post.round} · ${post.season}
Visibility: ${post.visibilityMode?.replace(/_/g, " ") ?? "standard"}

Each prompt below is for a single slide. Use them separately with your image generator.

${SAFETY_RULES}
${screenshotBlock}`;

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
Display mode labels: [VISIBLE] full stats shown | [NAME ONLY] name visible, stat cells blurred | [BLURRED] row fully obscured | rows marked hidden excluded
COLOUR RULES: Green for elite/strong records. Amber/orange for middle. Muted red for low. Grey dash for missing. Blue/teal for small samples (<6 games). Gold reserved for branding only.
`;

  const slideSections = post.carouselSlides.map((slide, i) => {
    const slideNum = i + 1;
    const lines: string[] = [`SLIDE ${slideNum} — ${slide.title.toUpperCase()}`];
    if (slide.subtitle) lines.push(slide.subtitle);

    // Cover slide: emit board label + sub-labels
    if (slide.slideType === "cover" && post.contentType === "match_stat_board") {
      const isOpen = post.visibilityMode === "open_free_game";
      const boardLabel = slide.designNotes ?? (isOpen ? "Free Game Board" : "Match Stat Board");
      lines.push(boardLabel);
      lines.push("Disposal + Goal Form");
      lines.push(`AFL ${post.season}`);
    }

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

export function buildFullPostPackage(post: SocialPost, screenshotRefMode?: ScreenshotRefMode): string {
  const safetyLine = post.warnings.length === 0
    ? "SAFETY: Clean — no issues found."
    : `SAFETY: ${post.warnings.length} issue(s) — review before posting.\n${post.warnings.map(w => `  • ${w}`).join("\n")}`;

  // Build availability warning block
  const unavailablePlayers = post.selectedPlayers.filter(p => {
    const status = p.manualAvailabilityOverride ?? p.availabilityStatus;
    if (!status || status === "available") return false;
    return EXCLUDED_STATUSES.has(status as PlayerAvailabilityStatus) || WARNING_STATUSES.has(status as PlayerAvailabilityStatus);
  });
  const availabilityWarningBlock = unavailablePlayers.length === 0 ? "" : [
    "AVAILABILITY WARNINGS:",
    ...unavailablePlayers.map(p => {
      const status = p.manualAvailabilityOverride ?? p.availabilityStatus ?? "unknown";
      const override = p.manualAvailabilityOverride ? " [admin override]" : "";
      const reason = p.availabilityReason ? ` — ${p.availabilityReason}` : "";
      return `  • ${p.playerName} (${p.team}): ${status}${reason}${override}`;
    }),
    "",
  ].join("\n");

  const colourRules = [
    "COLOUR RULES:",
    "- Ratios are the main display (e.g. 11/11, 9/10, 7/12). Do not replace with percentages.",
    "- 90%+ with 8+ games: emerald green.",
    "- 75–89% with 8+ games: green.",
    "- 60–74%: amber/orange.",
    "- 50–59%: orange.",
    "- Under 50%: muted red.",
    "- Fewer than 6 games (any ratio): blue/teal small-sample style.",
    "- Missing data: grey dash.",
    "- Do NOT use gold or yellow for 100% records — gold is for Neeko branding and CTA accents only.",
    "- Do NOT use lock icons, padlock icons, or the words locked/unlock.",
    "- Hidden stat cells: soft blur / dark glass overlay.",
    "- CTA strip text: \"See the full board at Neeko Sports Stats\"",
  ].join("\n");

  const hasScreenshotRef = shouldInjectScreenshotRef(post, screenshotRefMode);
  const screenshotSection = hasScreenshotRef
    ? ["─".repeat(60), "", buildPostScreenshotRef(post), "", "─".repeat(60), ""]
    : [];

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
    colourRules,
    "",
    ...(availabilityWarningBlock ? [availabilityWarningBlock, "─".repeat(60), ""] : []),
    ...screenshotSection,
    "─".repeat(60),
    "",
    buildFullSlideTextPackage(post),
    "",
    "─".repeat(60),
    "",
    buildFullCarouselPrompt(post, screenshotRefMode),
    "",
    "─".repeat(60),
    "",
    "SLIDE-BY-SLIDE PROMPTS:",
    buildSlidePromptPackage(post, screenshotRefMode),
    "",
    "─".repeat(60),
    "",
    safetyLine,
  ].join("\n");
}

// ─── Public: Spotlight Full Package ──────────────────────────────────────────

export function buildSpotlightFullPackage(post: SocialPost, screenshotRefMode?: ScreenshotRefMode): string {
  const sel = post.selectedSpotlight?.[0];
  const safetyLine = post.warnings.length === 0
    ? "SAFETY: Clean — no issues found."
    : `SAFETY: ${post.warnings.length} issue(s) — review before posting.\n${post.warnings.map(w => `  • ${w}`).join("\n")}`;

  const hasScreenshotRef = shouldInjectScreenshotRef(post, screenshotRefMode);
  const screenshotSection = hasScreenshotRef
    ? ["─".repeat(60), "", buildScreenshotReferenceBlock("player_spotlight"), "", "─".repeat(60), ""]
    : [];

  if (!sel) {
    return [
      `POST TITLE:`,
      post.title,
      "",
      "SELECTED STAT:",
      "No player selected — choose a player in the Game & Players tab.",
      "",
      `HOOK:`,
      post.hook || "(empty)",
      "",
      `CAPTION:`,
      post.caption || "(empty)",
      "",
      `IMAGE PROMPT:`,
      "(empty — select a player and refresh AI prompt)",
      "",
      safetyLine,
    ].join("\n");
  }

  const statTypeWord = sel.statType === "goals" ? "goals" : "disposals";
  const last5 = sel.lastFive.length > 0 ? sel.lastFive.join(" · ") : "unavailable";

  return [
    `POST TITLE:`,
    post.title,
    "",
    `SELECTED STAT:`,
    sel.playerName,
    `${sel.recordLabel} at ${sel.thresholdLabel} ${statTypeWord}`,
    `L5 avg ${sel.l5Avg.toFixed(1)}`,
    `Last 5: ${last5}`,
    "",
    `HOOK:`,
    post.hook || "(empty)",
    "",
    `CAPTION:`,
    post.caption || "(empty)",
    "",
    ...screenshotSection,
    `IMAGE PROMPT:`,
    post.imagePrompt || "(empty — refresh AI prompt)",
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
