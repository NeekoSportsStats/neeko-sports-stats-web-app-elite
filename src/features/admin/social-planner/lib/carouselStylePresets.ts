import type { CarouselStylePreset } from "../types";

export interface CarouselStylePresetConfig {
  id: CarouselStylePreset;
  label: string;
  description: string;
  formatBlock: string;
  coverDesign: string;
  tableDesign: string;
  ctaDesign: string;
  spotlightDesign: string;
  styleLabel: string;
}

const FORMAT_DIMENSIONS = "Dimensions: 1080×1350 portrait (Instagram carousel)\nCreate each slide as a separate image";
const BRAND = "Neeko Sports Stats";

const PREMIUM_STATS_BOARD: CarouselStylePresetConfig = {
  id: "premium_stats_board",
  label: "Premium Stats Board",
  description: "Dark charcoal AFL stats-board aesthetic. Gold highlights, team colour accents, stadium atmosphere.",
  styleLabel: "STYLE PRESET: Premium Stats Board",

  formatBlock: `${FORMAT_DIMENSIONS}
Consistent premium dark AFL stats-board style across all slides
Dark charcoal / black background
Stadium lighting atmosphere
Subtle data graphics and grid texture
Gold stat highlights and dividers
Team colour accents where relevant
Bold condensed sports typography
Clean table layouts with strong contrast
Include ${BRAND} branding on every slide`,

  coverDesign: `Dark premium stadium/stat-board aesthetic.
No player photos on cover.
Team colour accents for both home and away teams.
Stadium lighting atmosphere with subtle crowd blur.
Gold headline accent.
Bold condensed title typography.
${BRAND} branding.`,

  tableDesign: `Dark charcoal premium AFL stats table.
Subtle data-grid texture and stadium lighting.
Rounded stat card container.
Compact table rows with threshold columns.
Gold dividers and accent lines.
Team colour strip on the appropriate side.
Strong contrast — ratio records as the hero stat in each cell.`,

  ctaDesign: `Minimal dark premium CTA slide.
Gold highlights and accent lines.
Bold call-to-action text.
${BRAND} branding.
No player photos.
Dark charcoal / near-black background.`,

  spotlightDesign: `High-energy AFL matchday atmosphere.
Dark navy / black base with stadium lights.
Crowd blur in background.
Team colour paint strokes or gradient.
Floating stat card in the bottom third.
Large ratio record as the hero stat.
Use green for strong/elite records — not yellow/gold.
Gold reserved for ${BRAND} branding, borders, dividers, CTA accents only.
White player name in bold condensed sports typography.
${BRAND} branding visible but clean.`,
};

const EDITORIAL_POSTER: CarouselStylePresetConfig = {
  id: "editorial_poster",
  label: "Editorial Poster",
  description: "Bold magazine/editorial sports poster aesthetic. Stronger typography, dramatic contrast, punchy composition.",
  styleLabel: "STYLE PRESET: Editorial Poster",

  formatBlock: `${FORMAT_DIMENSIONS}
Bold editorial sports poster aesthetic across all slides
Premium dark background with strong team-colour accents
Larger, more dominant headline typography hierarchy
Simplified, cleaner table layouts with more graphic composition
Dramatic high-contrast atmosphere
Modern sports media feel — minimal but punchy
Include ${BRAND} branding on every slide`,

  coverDesign: `Bold editorial sports poster composition.
Premium dark background.
Larger dominant headline — strong typographic hierarchy.
Team colours used as graphic composition elements, not just accents.
Dramatic contrast with bold editorial energy.
No player photos on cover.
Clean, punchy layout.
${BRAND} branding.`,

  tableDesign: `Editorial-style AFL stats table with bold typographic hierarchy.
Premium dark background with strong team-colour accents.
Simplified, cleaner table layout — fewer decorative elements, more impact.
Larger column headers and player name emphasis.
Ratio records displayed with editorial boldness.
Team colour used as a strong graphic composition element.
Dramatic high-contrast premium sports media feel.`,

  ctaDesign: `Bold editorial CTA slide.
Premium dark background with strong team colour accent.
Large, punchy CTA typography.
Minimal but graphic — editorial poster style.
${BRAND} branding.
No player photos.`,

  spotlightDesign: `Bold editorial sports poster composition for this player.
Premium dark background with strong team colour graphic elements.
Larger dominant player name in bold editorial typography hierarchy.
Dramatic contrast and composition.
Team colours used as graphic poster elements.
Stat card with editorial hierarchy — ratio record as the bold hero stat.
Modern sports media feel — premium but punchy.
${BRAND} branding.
Use the supplied player photo only.`,
};

const BROADCAST_GRAPHIC: CarouselStylePresetConfig = {
  id: "broadcast_graphic",
  label: "Broadcast Graphic",
  description: "TV broadcast / sports network graphic. Clear stat panels, on-air scoreboard language, sports desk structure.",
  styleLabel: "STYLE PRESET: Broadcast Graphic",

  formatBlock: `${FORMAT_DIMENSIONS}
TV broadcast / sports network graphic style across all slides
Clean on-air scoreboard feel — premium, not cheap
Strong stat panels and lower-third style layout language
Sharp borders and defined information blocks
Structured "sports desk" information architecture
Darker background with crisp coloured accent panels
Very readable for social — clear, sharp, authoritative
Include ${BRAND} branding on every slide`,

  coverDesign: `TV broadcast cover graphic — clean sports network style.
Darker background with crisp team-colour accent panels.
Sharp panel borders and structured layout language.
Lower-third style title treatment.
On-air scoreboard aesthetic — authoritative and professional.
No player photos on cover.
Strong team-colour panel accents.
${BRAND} branding in broadcast graphic style.`,

  tableDesign: `TV broadcast-style AFL stats panel.
Clean on-air scoreboard layout with sharp panel borders.
Structured information blocks — sports desk architecture.
Darker background with crisp coloured accent panels.
Clear stat columns with sharp borders.
Ratio records displayed with broadcast clarity.
Strong contrast — very readable on social.
Lower-third style table header treatment.`,

  ctaDesign: `TV broadcast CTA graphic.
Clean sports network lower-third style.
Darker background with crisp accent panel.
Sharp, authoritative CTA text treatment.
${BRAND} branding in broadcast graphic style.
No player photos.`,

  spotlightDesign: `TV broadcast / sports network player graphic.
On-air athlete profile style.
Darker background with crisp team-colour accent panels.
Sharp bordered stat panel in lower-third position.
Clean sports network typography — authoritative and readable.
Ratio record displayed with broadcast clarity as the hero stat.
Player name treatment in broadcast headline style.
${BRAND} branding in broadcast graphic style.
Use the supplied player photo only.`,
};

const MINIMAL_LUXURY: CarouselStylePresetConfig = {
  id: "minimal_luxury",
  label: "Minimal Luxury",
  description: "Premium minimalist sports aesthetic. Spacious, refined typography, elegant gold + team colour, luxury dark UI.",
  styleLabel: "STYLE PRESET: Minimal Luxury",

  formatBlock: `${FORMAT_DIMENSIONS}
Premium minimalist sports aesthetic across all slides
Clean, restrained, spacious layout
Fewer decorative elements — refined and elegant
Subtle gold and team colour use — never heavy-handed
Elegant typographic hierarchy with generous spacing
Refined dark UI feel — luxury sports brand aesthetic
Stat tables still fully readable — minimalism never sacrifices clarity
Include ${BRAND} branding on every slide`,

  coverDesign: `Premium minimalist cover.
Refined dark background — near-black.
Elegant, spacious typography with generous leading.
Subtle gold accent line or element.
Minimal team colour use — refined, not vivid.
No player photos on cover.
Restrained composition — lots of breathing room.
${BRAND} branding in refined minimal style.`,

  tableDesign: `Minimal luxury AFL stats table.
Refined dark background with generous whitespace.
Elegant typographic hierarchy — clear but not heavy.
Subtle gold dividers and accent lines — minimal use only.
Clean table rows with refined spacing.
Ratio records displayed with elegant restraint.
Minimal decorative elements — clarity through simplicity.
Subtle team colour accent only.`,

  ctaDesign: `Minimal luxury CTA slide.
Clean, spacious dark layout.
Elegant refined CTA typography.
Subtle gold accent — restrained use.
${BRAND} branding in minimal luxury style.
No player photos.
Generous negative space.`,

  spotlightDesign: `Premium minimalist player spotlight.
Refined dark background with generous negative space.
Elegant player name in refined typography hierarchy.
Subtle gold and team colour accents — never heavy.
Clean, spacious stat card in the lower third.
Ratio record as the hero stat with elegant typographic emphasis.
Restrained composition — luxury sports brand feel.
${BRAND} branding in refined minimal style.
Use the supplied player photo only.`,
};

const PRESET_REGISTRY: Record<CarouselStylePreset, CarouselStylePresetConfig> = {
  premium_stats_board: PREMIUM_STATS_BOARD,
  editorial_poster:    EDITORIAL_POSTER,
  broadcast_graphic:   BROADCAST_GRAPHIC,
  minimal_luxury:      MINIMAL_LUXURY,
};

export function getCarouselStylePresetConfig(
  preset: CarouselStylePreset | undefined | null,
): CarouselStylePresetConfig {
  return PRESET_REGISTRY[preset ?? "premium_stats_board"] ?? PREMIUM_STATS_BOARD;
}

export const ALL_CAROUSEL_STYLE_PRESETS = Object.values(PRESET_REGISTRY);
