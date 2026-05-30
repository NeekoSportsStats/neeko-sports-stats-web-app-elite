/**
 * AI Creative Prompt Pack — Feature 34
 * Generates image, carousel, video, and hook prompts from existing SocialPost data.
 *
 * Admin-only. Pure functions. No Supabase. No React. No side effects.
 * Does NOT change post-generation logic, thresholds, or player selection.
 */
import type { SocialPost } from "./types";

// ─── Creative asset types ─────────────────────────────────────────────────────

export type CreativeAssetRole =
  | "logo"
  | "player_reference"
  | "game_action_reference"
  | "style_reference"
  | "background_reference";

export interface CreativeAsset {
  fileName: string;
  role: CreativeAssetRole;
}

export const CREATIVE_ASSET_ROLE_LABELS: Record<CreativeAssetRole, string> = {
  logo:                  "Logo",
  player_reference:      "Player reference",
  game_action_reference: "Game/action reference",
  style_reference:       "Style reference",
  background_reference:  "Background reference",
};

// ─── Output types ─────────────────────────────────────────────────────────────

export interface ImagePromptItem {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

export interface CarouselPromptItem {
  slideIndex: number;
  slideLabel: string;
  prompt: string;
}

export interface CarouselPromptPack {
  id: string;
  label: string;
  format: string;
  slides: CarouselPromptItem[];
  combinedPrompt: string;
}

export interface VideoPromptItem {
  id: string;
  durationLabel: string;
  durationSeconds: number;
  creativeType: string;
  prompt: string;
}

export interface AiCreativePromptPack {
  postId: string;
  postTitle: string;
  imagePrompts: ImagePromptItem[];
  carouselPromptPacks: CarouselPromptPack[];
  videoPrompts: VideoPromptItem[];
  hookVariations: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeArr<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

function assetInstructions(assets: CreativeAsset[]): string {
  if (assets.length === 0) return "";
  return assets
    .map(a => {
      switch (a.role) {
        case "logo":
          return `Use the uploaded logo file "${a.fileName}" — place in the top-centre or top-right corner at appropriate scale.`;
        case "player_reference":
          return `Use the uploaded image "${a.fileName}" as the player likeness/identity reference for the hero player.`;
        case "game_action_reference":
          return `Use the uploaded image "${a.fileName}" as the action/composition reference for the background or scene.`;
        case "style_reference":
          return `Use the uploaded image "${a.fileName}" as a visual style reference — match the layout, colour treatment, and typography feel.`;
        case "background_reference":
          return `Use the uploaded image "${a.fileName}" as the background/environment reference.`;
        default:
          return `Reference asset: "${a.fileName}".`;
      }
    })
    .join(" ");
}

function brandingLine(assets: CreativeAsset[]): string {
  const hasLogo = assets.some(a => a.role === "logo");
  if (hasLogo) return "Include Neeko Sports Stats branding using the uploaded logo.";
  return `Include "Neeko Sports Stats" as subtle but visible text branding — place at the top-centre or bottom in a clean sans-serif font. Do not use a placeholder logo.`;
}

function complianceLine(): string {
  return "NO gambling language. NO odds. NO bookmaker branding. NO tipster phrasing. Do not include 'bet', 'odds', 'clearing the line', 'banker', or similar betting-adjacent copy.";
}

function formatLine(): string {
  return "Output formats: primary 1080x1350 (Instagram portrait), also usable as 1080x1080 (square) and 1080x1920 (story/reel cover) by extending the canvas vertically.";
}

function postContext(post: SocialPost): {
  players: string;
  teams: string;
  threshold: string;
  statsBlock: string;
  tone: string;
} {
  const players = safeArr(post.playerNames).join(", ") || "featured AFL players";
  const teams = safeArr(post.teamNames).join(" vs ") || "the featured teams";
  const threshold = post.thresholdLabel || "key AFL stat threshold";
  const statsBlock = safeArr(post.statsShown).slice(0, 6).join(" | ") || post.title;
  const tone =
    post.statLens === "goals"
      ? "high-energy goal-scoring"
      : post.statLens === "disposals"
      ? "clean, stat-driven disposal"
      : "premium AFL fantasy";
  return { players, teams, threshold, statsBlock, tone };
}

// ─── Image prompts ────────────────────────────────────────────────────────────

export function buildImagePrompts(
  post: SocialPost,
  assets: CreativeAsset[],
): ImagePromptItem[] {
  const { players, teams, threshold, statsBlock, tone } = postContext(post);
  const branding = brandingLine(assets);
  const compliance = complianceLine();
  const fmt = formatLine();
  const assetNotes = assetInstructions(assets);

  const prompts: ImagePromptItem[] = [];

  // A — Premium stat-list graphic
  prompts.push({
    id: `${post.id}-img-a`,
    label: "A — Premium stat-list graphic",
    description: "Structured list of players and their stats on a dark premium card layout.",
    prompt: [
      `Create a premium AFL stats graphic in a dark editorial style.`,
      `Theme: ${threshold} — ${tone} content.`,
      `Players featured: ${players}. Teams: ${teams}.`,
      `Key stats to display on-graphic: ${statsBlock}.`,
      `Layout: vertical stat list — player name on the left, stat figure on the right, team accent colour bar beside each row.`,
      `Typography: bold clean sans-serif for stats, lighter weight for player names.`,
      `Colour palette: dark charcoal (#1a1a1a) background, white primary text, amber or gold stat figures, subtle team colour accents.`,
      `Top section: large heading — "${post.title}" or the main threshold (e.g. "${threshold}").`,
      `Bottom section: clean CTA text — "Full board at Neeko Sports Stats."`,
      branding,
      assetNotes,
      compliance,
      fmt,
    ].filter(Boolean).join(" "),
  });

  // B — Single player hero feature
  const heroPlayer = safeArr(post.playerNames)[0] ?? "the featured player";
  prompts.push({
    id: `${post.id}-img-b`,
    label: "B — Single player hero feature",
    description: `Hero graphic centred on ${heroPlayer} with bold stat overlay.`,
    prompt: [
      `Create a single-player hero AFL graphic.`,
      `Hero player: ${heroPlayer}.`,
      `Background: dynamic midfield or ground-level stadium atmosphere — blurred action blur in the background, player cutout or silhouette centred.`,
      `Foreground stat overlay: large bold figure for ${safeArr(post.statsShown)[0] ?? threshold}.`,
      `Secondary text: player name in large tracking-wide caps. Team name below in smaller text.`,
      `Colour treatment: cinematic dark vignette edges, the player's team primary colour as an accent glow or stripe.`,
      `Bottom strip: "${post.title}" headline. Neeko Sports Stats branding.`,
      assetNotes,
      branding,
      compliance,
      fmt,
    ].filter(Boolean).join(" "),
  });

  // C — Matchday action graphic
  prompts.push({
    id: `${post.id}-img-c`,
    label: "C — Matchday action graphic",
    description: "High-energy action shot composition with stat cards overlaid.",
    prompt: [
      `Create a matchday action-style AFL graphic.`,
      `Mood: high-energy, match-day atmosphere. Stadium lights, crowd blur in background.`,
      `Teams: ${teams}.`,
      `Players featured: ${players}.`,
      `Overlay design: floating stat card(s) in the bottom third — each showing player name + stat (e.g. "${safeArr(post.statsShown)[0] ?? threshold}").`,
      `Colour scheme: vibrant, saturated — deep navy or black base, electric accent colours matching the teams.`,
      `Typography: heavy condensed font for stats, wide tracking for player names.`,
      `Top left: "${post.title}" in white bold text. Bottom right: Neeko Sports Stats branding.`,
      assetNotes,
      branding,
      compliance,
      fmt,
    ].filter(Boolean).join(" "),
  });

  // D — Team-vs-team stat graphic
  prompts.push({
    id: `${post.id}-img-d`,
    label: "D — Team-vs-team matchup graphic",
    description: "Split-panel matchup card showing both teams and key stat context.",
    prompt: [
      `Create a team-vs-team AFL matchup stat graphic.`,
      `Teams: ${teams}. Split the canvas vertically — one team colour on each side.`,
      `Centre divider: "VS" text or a sharp diagonal split.`,
      `Stat block for each side: show relevant players and their key stat (${threshold}).`,
      `Stats to feature: ${statsBlock}.`,
      `Typography: bold caps team names at the top of each panel. Clean stat figures in large font below.`,
      `Colour: each panel uses the respective team's primary/secondary colours. Dark saturation for premium feel.`,
      `Bottom full-width strip: "Neeko Sports Stats" branding and the main headline: "${post.title}".`,
      assetNotes,
      branding,
      compliance,
      fmt,
    ].filter(Boolean).join(" "),
  });

  // E — Bold headline / poster graphic
  prompts.push({
    id: `${post.id}-img-e`,
    label: "E — Bold headline poster graphic",
    description: "Poster-style typographic graphic — large headline, minimal clutter.",
    prompt: [
      `Create a bold poster-style AFL stat graphic — typographic focus, minimal imagery.`,
      `Main headline: "${post.title}".`,
      `Sub-headline: "${threshold}" — featuring ${players}.`,
      `Key stat callout (large centred figure): ${safeArr(post.statsShown)[0] ?? threshold}.`,
      `Design style: editorial magazine / sports media poster. Stark contrast. Heavy black background. White and gold text.`,
      `One large accent element: a diagonal colour stripe or geometric cut in the team's primary colour.`,
      `Bottom strip: "See the full board at Neeko Sports Stats."`,
      `Typography hierarchy: massive headline (80pt+), medium sub-text, small body stat lines.`,
      assetNotes,
      branding,
      compliance,
      fmt,
    ].filter(Boolean).join(" "),
  });

  // F — Premium editorial / dark card
  prompts.push({
    id: `${post.id}-img-f`,
    label: "F — Premium dark editorial card",
    description: "Sophisticated dark editorial layout — magazine quality, subtle gradients.",
    prompt: [
      `Create a premium dark editorial AFL stats card — high-end magazine quality.`,
      `Theme: ${tone} analytics content.`,
      `Players: ${players}. Teams: ${teams}.`,
      `Layout: two-column structure — left column player names and team details, right column stat figures in large amber/gold type.`,
      `Background: very dark charcoal or near-black gradient. Subtle noise texture overlay for depth.`,
      `Accent: thin gold horizontal rules between stat rows. Gold or amber stat numbers.`,
      `Top bar: the main threshold or title — "${threshold}" — in spaced uppercase letters.`,
      `Bottom: a clean CTA strip — "Full board at Neeko Sports Stats." with the branding mark.`,
      assetNotes,
      branding,
      compliance,
      fmt,
    ].filter(Boolean).join(" "),
  });

  return prompts;
}

// ─── Carousel prompt packs ────────────────────────────────────────────────────

export function buildCarouselPromptPacks(
  post: SocialPost,
  assets: CreativeAsset[],
): CarouselPromptPack[] {
  const { players, teams, threshold, statsBlock } = postContext(post);
  const branding = brandingLine(assets);
  const assetNotes = assetInstructions(assets);
  const compliance = complianceLine();
  const fmtNote = "Format: 1080x1350 (portrait carousel) — each slide is a separate image.";
  const playerList = safeArr(post.playerNames);
  const statList = safeArr(post.statsShown);

  const buildCombined = (slides: CarouselPromptItem[]): string =>
    slides.map((s, i) => `--- SLIDE ${i + 1}: ${s.slideLabel.toUpperCase()} ---\n${s.prompt}`).join("\n\n");

  const packs: CarouselPromptPack[] = [];

  // Pack 1 — Stat-card carousel
  {
    const slides: CarouselPromptItem[] = [];

    slides.push({
      slideIndex: 1,
      slideLabel: "Cover slide",
      prompt: [
        `Slide 1 of ${playerList.length + 2} — Cover slide.`,
        `Bold headline: "${post.title}".`,
        `Sub-text: "${threshold}" — AFL ${new Date().getFullYear()}.`,
        `Dark background with strong contrast. The headline takes up most of the slide.`,
        `Accent: a vivid colour stripe or gradient strip in the team(s) colours.`,
        branding,
        assetNotes,
        compliance,
        fmtNote,
      ].filter(Boolean).join(" "),
    });

    playerList.slice(0, 5).forEach((player, i) => {
      const stat = statList[i] ?? `${threshold} hit rate`;
      slides.push({
        slideIndex: i + 2,
        slideLabel: `Player ${i + 1} — ${player}`,
        prompt: [
          `Slide ${i + 2} of ${playerList.length + 2} — Player stat card.`,
          `Player: ${player}.`,
          `Stat to feature: ${stat}.`,
          `Layout: player name large at top, stat figure massive in centre, hit rate / context stat below in smaller text.`,
          `Style: clean dark card, team accent colour strip on left edge.`,
          `No extraneous text. No betting language.`,
          fmtNote,
        ].filter(Boolean).join(" "),
      });
    });

    slides.push({
      slideIndex: slides.length + 1,
      slideLabel: "CTA slide",
      prompt: [
        `Final slide — CTA.`,
        `Text: "See the full board at Neeko Sports Stats."`,
        `Design: minimalist. Dark background. Centred text in large clean sans-serif.`,
        `Include Neeko Sports Stats branding clearly.`,
        `Optional QR or "Link in bio" direction text at the bottom.`,
        branding,
        compliance,
        fmtNote,
      ].filter(Boolean).join(" "),
    });

    packs.push({
      id: `${post.id}-carousel-1`,
      label: "Carousel Pack 1 — Stat card series",
      format: "1080x1350 portrait carousel",
      slides,
      combinedPrompt: buildCombined(slides),
    });
  }

  // Pack 2 — Editorial / cleaner layout
  {
    const slides: CarouselPromptItem[] = [];

    slides.push({
      slideIndex: 1,
      slideLabel: "Cover slide — editorial",
      prompt: [
        `Slide 1 — Editorial cover.`,
        `Headline: "${threshold} Watch — ${teams}".`,
        `Sub: "AFL ${new Date().getFullYear()} · ${players.split(", ").length > 3 ? players.split(", ").slice(0, 3).join(", ") + " & more" : players}".`,
        `Style: premium editorial — gold rule lines, sophisticated serif or tall condensed headline font.`,
        `Background: very dark charcoal with subtle diagonal texture.`,
        branding,
        assetNotes,
        compliance,
        fmtNote,
      ].filter(Boolean).join(" "),
    });

    if (statList.length > 0) {
      slides.push({
        slideIndex: 2,
        slideLabel: "Stats overview slide",
        prompt: [
          `Slide 2 — Full stats overview.`,
          `Display all key stats in a clean list: ${statList.slice(0, 5).join(" | ")}.`,
          `Typography: two-column layout — left: player names, right: stat figures.`,
          `Each row separated by a fine horizontal rule. Gold or amber stat values.`,
          `Background: same dark charcoal as cover.`,
          compliance,
          fmtNote,
        ].filter(Boolean).join(" "),
      });
    }

    slides.push({
      slideIndex: slides.length + 1,
      slideLabel: "Context / why this matters",
      prompt: [
        `Slide — Context.`,
        `Headline: "Why this matters this week."`,
        `Body copy area: 2–3 short bullet points summarising the stat trend (theme: ${post.title}).`,
        `Keep text minimal — use large spacing and white typography on dark background.`,
        `Clean editorial design — no clutter.`,
        compliance,
        fmtNote,
      ].filter(Boolean).join(" "),
    });

    slides.push({
      slideIndex: slides.length + 1,
      slideLabel: "CTA slide — editorial",
      prompt: [
        `Final slide — Editorial CTA.`,
        `Text: "Full board at Neeko Sports Stats."`,
        `Minimal design — centred large typography. Thin gold rule above the CTA.`,
        branding,
        compliance,
        fmtNote,
      ].filter(Boolean).join(" "),
    });

    packs.push({
      id: `${post.id}-carousel-2`,
      label: "Carousel Pack 2 — Editorial clean layout",
      format: "1080x1350 portrait carousel",
      slides,
      combinedPrompt: buildCombined(slides),
    });
  }

  return packs;
}

// ─── Video prompts ────────────────────────────────────────────────────────────

export function buildVideoPrompts(
  post: SocialPost,
  assets: CreativeAsset[],
): VideoPromptItem[] {
  const { players, teams, threshold, statsBlock, tone } = postContext(post);
  const assetNotes = assetInstructions(assets);
  const compliance = complianceLine();
  const voiceover = post.voiceoverScript
    ? `Voiceover script: "${post.voiceoverScript.slice(0, 200)}${post.voiceoverScript.length > 200 ? "…" : ""}"`
    : `Voiceover direction: upbeat, confident sports analyst tone. No scripted gambling references.`;
  const ctaEnd = `Final frame: "Full board at Neeko Sports Stats." — hold for 2 seconds. Branding visible.`;

  const videos: VideoPromptItem[] = [];

  // 7-second quick punch
  videos.push({
    id: `${post.id}-vid-7s`,
    durationLabel: "7 seconds",
    durationSeconds: 7,
    creativeType: "Quick stat punch",
    prompt: [
      `Create a 7-second short-form video prompt for a social reel.`,
      `Style: quick stat punch — fast cuts, bold on-screen text, no dead time.`,
      `Duration: 7 seconds total.`,
      ``,
      `SCENE STRUCTURE:`,
      `0–1s: HOOK — bold text slam cut: "${safeArr(post.statsShown)[0] ?? threshold}". High-energy music beat drop.`,
      `1–4s: STAT CARDS — rapid sequence showing ${players.split(", ").slice(0, 3).join(", ")} with their key stats. Each player name + figure on screen for ~1 second.`,
      `4–6s: SUMMARY — full stat list or "${threshold}" overlay on a dark premium card.`,
      `6–7s: CTA — "Full board at Neeko Sports Stats." Hard cut to brand endcard.`,
      ``,
      `On-screen text: large, bold, white on dark. Stat figures in gold/amber.`,
      `Music: high-energy sports background — drums, tempo 120–140 BPM.`,
      `Aspect ratio: 9:16 vertical (1080x1920) for TikTok/Reels/Stories.`,
      voiceover,
      assetNotes,
      compliance,
    ].filter(Boolean).join("\n"),
  });

  // 15-second reel
  videos.push({
    id: `${post.id}-vid-15s`,
    durationLabel: "15 seconds",
    durationSeconds: 15,
    creativeType: "Short reel",
    prompt: [
      `Create a 15-second short-form video prompt for TikTok/Instagram Reels.`,
      `Style: short reel — stat reveal format with player callouts.`,
      `Duration: 15 seconds total.`,
      `Teams: ${teams}. Players: ${players}. Theme: ${threshold}.`,
      ``,
      `SCENE STRUCTURE:`,
      `0–2s: HOOK — "Did you know ${safeArr(post.playerNames)[0] ?? "this player"} has hit ${threshold} in X of their last 5?" Bold text over dark background. Beat drop.`,
      `2–5s: PLAYER 1 CALLOUT — player name slam in. Stat figure animates up. Hit rate badge appears.`,
      safeArr(post.playerNames).length > 1
        ? `5–8s: PLAYER 2 CALLOUT — same treatment for ${safeArr(post.playerNames)[1]}.`
        : `5–8s: SUPPORTING STAT — show season average vs last 5 comparison for the player.`,
      safeArr(post.playerNames).length > 2
        ? `8–11s: PLAYER 3 (or more) — ${safeArr(post.playerNames).slice(2, 4).join(" & ")} rapid stat callouts.`
        : `8–11s: CONTEXT — brief text card: "Week ${new Date().toLocaleDateString("en-AU")} stat trend."`,
      `11–13s: FULL STAT BOARD — all players listed at once on a premium dark card.`,
      `13–15s: CTA — "See the full board at Neeko Sports Stats."`,
      ``,
      `Captions: auto-caption style. Bold white text. Stat figures in amber.`,
      `Music: mid-energy sports tempo, 110–125 BPM.`,
      `Aspect ratio: 9:16 (1080x1920).`,
      voiceover,
      assetNotes,
      compliance,
    ].filter(Boolean).join("\n"),
  });

  // 30-second explainer
  videos.push({
    id: `${post.id}-vid-30s`,
    durationLabel: "30 seconds",
    durationSeconds: 30,
    creativeType: "Matchup preview / explainer",
    prompt: [
      `Create a 30-second video prompt for an AFL stat explainer reel.`,
      `Style: structured matchup preview — analytical, premium, engaging.`,
      `Duration: 30 seconds.`,
      `Teams: ${teams}. Players: ${players}. Threshold: ${threshold}.`,
      ``,
      `SCENE STRUCTURE:`,
      `0–3s: OPENING HOOK — graphic title card: "${post.title}". Voiceover: "Here are the players who have consistently hit ${threshold} this season."`,
      `3–8s: CONTEXT — short animated stat board showing the trend. On-screen text: "${statsBlock}".`,
      `8–15s: PLAYER SEGMENT — introduce top 2–3 players one at a time. Each gets their name, stat figure, hit rate, and L5 average on screen. Brief voiceover commentary per player.`,
      `15–22s: WIDER POOL — remaining players in a list format. Voiceover: "These players are also in the mix this week."`,
      `22–27s: SUMMARY — full stat board back on screen. Voiceover: "Keep an eye on these players this week."`,
      `27–30s: CTA — "Full AFL stat board at Neeko Sports Stats. Link in bio." Branding endcard.`,
      ``,
      `Visual style: clean dark stats aesthetic. Animated text reveals. No clutter.`,
      `Music: measured tempo, 95–110 BPM. Builds from soft to medium energy.`,
      `Aspect ratio: 9:16 (1080x1920) primary, also 16:9 (1920x1080) for YouTube Shorts.`,
      voiceover,
      assetNotes,
      compliance,
    ].filter(Boolean).join("\n"),
  });

  // 60-second premium format
  videos.push({
    id: `${post.id}-vid-60s`,
    durationLabel: "60 seconds",
    durationSeconds: 60,
    creativeType: "Premium long-form explainer",
    prompt: [
      `Create a 60-second premium AFL content video prompt.`,
      `Style: long-form explainer — professional presenter-style analytics breakdown.`,
      `Duration: 60 seconds.`,
      `Teams: ${teams}. Players: ${players}. Theme: ${threshold}.`,
      ``,
      `SCENE STRUCTURE:`,
      `0–5s: OPENING — cinematic title card: "${post.title}". Dramatic music intro. Voiceover: "Welcome to Neeko Sports Stats."`,
      `5–10s: ROUND CONTEXT — short text card showing the current round, games featured, and stat focus (${threshold}).`,
      `10–20s: TOP PLAYER DEEP DIVE — ${safeArr(post.playerNames)[0] ?? "the top player"} gets a full 10-second feature: name, position, recent form chart, hit rate, L5 average, projection. Voiceover gives brief analytical context.`,
      safeArr(post.playerNames).length > 1
        ? `20–35s: SUPPORTING PLAYERS — each of the remaining players (${safeArr(post.playerNames).slice(1, 4).join(", ")}) gets a 3–5 second callout with their key stat and hit rate.`
        : `20–35s: TREND ANALYSIS — compare this week's stat trend to season average. Animated chart or bar comparison.`,
      `35–45s: FULL STAT BOARD — bring all players onto screen in a premium list layout. Voiceover reads through key names and figures.`,
      `45–52s: WHY IT MATTERS — brief editorial comment on why these stats are relevant to AFL fantasy decisions. No gambling language.`,
      `52–58s: CTA SEGMENT — "See the full AFL stats board at Neeko Sports Stats. Updated weekly. Link in bio."`,
      `58–60s: BRANDING ENDCARD — Neeko Sports Stats logo, clean outro.`,
      ``,
      `Visual style: high production value. Animated stat reveals. Dynamic typography. Team colour accents.`,
      `Voiceover: confident, analytical, neutral. No tipping language.`,
      `Music: builds through video — soft intro, medium energy for player segments, strong finish.`,
      `Aspect ratio: 9:16 (1080x1920) primary. Provide guidance for 16:9 crop as secondary.`,
      assetNotes,
      compliance,
    ].filter(Boolean).join("\n"),
  });

  return videos;
}

// ─── Hook variations ──────────────────────────────────────────────────────────

export function buildHookVariations(post: SocialPost): string[] {
  const { players, threshold } = postContext(post);
  const firstPlayer = safeArr(post.playerNames)[0] ?? "this player";
  const firstStat = safeArr(post.statsShown)[0] ?? `${threshold}`;

  return [
    `"${firstPlayer} has hit ${threshold} in their last 3 games. Here's why it matters."`,
    `"${threshold} in AFL — these players are running hot right now."`,
    `"Before you make any AFL fantasy decisions — check these numbers."`,
    `"${firstStat} — and they're not alone. Full list below."`,
    `"AFL stats you actually need this week. Not opinions. Data."`,
    `"This week's ${threshold} watch — ${players.split(", ").slice(0, 3).join(", ")} all in the mix."`,
    `"People sleep on ${threshold} data. These numbers are hard to ignore."`,
    `"If you follow AFL stats, you need to see this week's ${threshold} board."`,
  ];
}

// ─── Master builder ───────────────────────────────────────────────────────────

export function buildAiCreativePromptPack(
  post: SocialPost,
  assets: CreativeAsset[] = [],
): AiCreativePromptPack {
  return {
    postId: post.id,
    postTitle: post.title,
    imagePrompts: buildImagePrompts(post, assets),
    carouselPromptPacks: buildCarouselPromptPacks(post, assets),
    videoPrompts: buildVideoPrompts(post, assets),
    hookVariations: buildHookVariations(post),
  };
}

// ─── Copy text builders ───────────────────────────────────────────────────────

export function copyAllImagePrompts(pack: AiCreativePromptPack): string {
  return pack.imagePrompts
    .map(p => `=== ${p.label.toUpperCase()} ===\n${p.prompt}`)
    .join("\n\n");
}

export function copyAllCarouselPrompts(pack: AiCreativePromptPack): string {
  return pack.carouselPromptPacks
    .map(cp => `=== ${cp.label.toUpperCase()} (${cp.format}) ===\n${cp.combinedPrompt}`)
    .join("\n\n");
}

export function copyAllVideoPrompts(pack: AiCreativePromptPack): string {
  return pack.videoPrompts
    .map(v => `=== ${v.durationLabel.toUpperCase()} — ${v.creativeType.toUpperCase()} ===\n${v.prompt}`)
    .join("\n\n");
}

export function copyHooksOnly(pack: AiCreativePromptPack): string {
  return pack.hookVariations.map((h, i) => `${i + 1}. ${h}`).join("\n");
}

export function copyFullPack(pack: AiCreativePromptPack): string {
  const sections: string[] = [];
  sections.push(`╔══ AI CREATIVE PROMPT PACK ══╗`);
  sections.push(`Post: ${pack.postTitle}`);
  sections.push(`Generated: ${new Date().toLocaleString("en-AU")}`);
  sections.push(``);
  sections.push(`${"─".repeat(50)}`);
  sections.push(`IMAGE PROMPTS`);
  sections.push(`${"─".repeat(50)}`);
  sections.push(copyAllImagePrompts(pack));
  sections.push(``);
  sections.push(`${"─".repeat(50)}`);
  sections.push(`CAROUSEL PROMPT PACKS`);
  sections.push(`${"─".repeat(50)}`);
  sections.push(copyAllCarouselPrompts(pack));
  sections.push(``);
  sections.push(`${"─".repeat(50)}`);
  sections.push(`VIDEO PROMPTS`);
  sections.push(`${"─".repeat(50)}`);
  sections.push(copyAllVideoPrompts(pack));
  sections.push(``);
  sections.push(`${"─".repeat(50)}`);
  sections.push(`HOOK VARIATIONS`);
  sections.push(`${"─".repeat(50)}`);
  sections.push(copyHooksOnly(pack));
  return sections.join("\n");
}
