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
    // Use statList as the canonical per-player source so mixed-stat posts (Full Game
    // Picks) get the correct stat label per slide, and no player is capped out.
    const totalSlides = statList.length + 2; // cover + N player slides + CTA

    slides.push({
      slideIndex: 1,
      slideLabel: "Cover slide",
      prompt: [
        `Slide 1 of ${totalSlides} — Cover slide.`,
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

    // No cap: iterate every stat line so Full Game Picks (8 players) gets all slides
    statList.forEach((stat, i) => {
      const dashIdx = stat.indexOf(" — ");
      const player = dashIdx >= 0 ? stat.slice(0, dashIdx).trim() : (playerList[i] ?? `Player ${i + 1}`);
      // Detect goal vs disposal family per slide for correct visual note
      const isGoal = /\d\+\s*goal|goals?\s+at/.test(stat.toLowerCase()) || /\bgoal\b/.test(stat.toLowerCase());
      const accentNote = isGoal ? "Goal number in gold." : "Disposal count in gold.";
      slides.push({
        slideIndex: i + 2,
        slideLabel: `Player ${i + 1} — ${player}`,
        prompt: [
          `Slide ${i + 2} of ${totalSlides} — Player stat card.`,
          `Player: ${player}.`,
          `Stat to feature: ${stat}.`,
          `Layout: player name large at top, stat figure massive in centre, hit rate / context stat below in smaller text.`,
          `Style: clean dark card, team accent colour strip on left edge. ${accentNote}`,
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

// ─── Feature 7: Structured hook variations ───────────────────────────────────

export type HookStyle =
  | "direct"
  | "curiosity"
  | "stat_driven"
  | "challenge"
  | "punchy"
  | "tiktok_short"
  | "on_screen"
  | "cta_style"
  | "question"
  | "data_angle";

export type HookPlatform = "tiktok" | "instagram" | "facebook" | "on_screen" | "video" | "general";

export interface HookItem {
  style: HookStyle;
  platform: HookPlatform;
  label: string;
  text: string;
}

export interface HookRecommendedUse {
  bestTikTok: string;
  bestInstagram: string;
  bestFacebook: string;
  bestOnScreen: string;
  bestVideoOpener: string;
  bestCaptionOpener: string;
  bestShort: string;
  tiktokSubject: string;
}

export interface PostHookPack {
  postId: string;
  postTitle: string;
  tiktokSubjectLine: string;
  tiktokHooks: HookItem[];
  instagramHooks: HookItem[];
  facebookHooks: HookItem[];
  onScreenHooks: HookItem[];
  videoOpeners: HookItem[];
  /** All hooks combined for backwards compat */
  hooks: HookItem[];
  recommended: HookRecommendedUse;
}

function lensContext(post: SocialPost): {
  lens: string;
  statVerb: string;
  statNoun: string;
  actionNoun: string;
  statAdjective: string;
} {
  switch (post.statLens) {
    case "goals":
      return {
        lens: "goals",
        statVerb: "kicking goals",
        statNoun: "goals",
        actionNoun: "scoring",
        statAdjective: "goal-scoring",
      };
    case "tackles":
      return {
        lens: "tackles",
        statVerb: "laying tackles",
        statNoun: "tackles",
        actionNoun: "tackling",
        statAdjective: "tackle",
      };
    case "marks":
      return {
        lens: "marks",
        statVerb: "taking marks",
        statNoun: "marks",
        actionNoun: "marking",
        statAdjective: "marking",
      };
    case "hitouts":
      return {
        lens: "hitouts",
        statVerb: "winning hitouts",
        statNoun: "hitouts",
        actionNoun: "ruck work",
        statAdjective: "hitout",
      };
    default:
      return {
        lens: "disposals",
        statVerb: "moving the ball",
        statNoun: "disposals",
        actionNoun: "ball use",
        statAdjective: "disposal",
      };
  }
}

/** Strips banned gambling/tipping language from hook text. Returns cleaned text. */
function cleanHookText(text: string): string {
  return text
    .replace(/\b(bet|odds|tip|lock|banker|guaranteed|clear the line|clearing the line|lock in)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Build a concise TikTok subject/title line — max 55 chars, post-specific, no betting language. */
export function buildTikTokSubjectLine(post: SocialPost): string {
  const firstPlayer = safeArr(post.playerNames)[0] ?? "";
  const { threshold } = postContext(post);
  const isGoals = post.statLens === "goals";
  const isMixed = post.statLens === "mixed" || post.category === "Round Preview";
  const isTeamTotal = post.category === "Team Total";
  const isProof = post.category === "Proof Post";
  const teams = safeArr(post.teamNames);

  let subject: string;
  if (isProof) {
    subject = firstPlayer
      ? `${firstPlayer} hit the target — data recap`
      : `AFL stat prediction recap`;
  } else if (isTeamTotal && teams.length >= 2) {
    subject = `${teams[0]} vs ${teams[1]} stat breakdown`;
  } else if (isMixed && teams.length >= 2) {
    subject = `${teams[0]} vs ${teams[1]} full game picks`;
  } else if (isGoals && firstPlayer) {
    subject = `${firstPlayer} goal form — ${threshold}`;
  } else if (firstPlayer) {
    subject = `${firstPlayer} — ${threshold}`;
  } else {
    subject = post.title.slice(0, 55);
  }

  return cleanHookText(subject).slice(0, 55);
}

export function buildPostHookPack(post: SocialPost): PostHookPack {
  const { players, threshold } = postContext(post);
  const allPlayers = safeArr(post.playerNames);
  const firstPlayer = allPlayers[0] ?? "this player";
  const secondPlayer = allPlayers[1] ?? "";
  const thirdPlayer = allPlayers[2] ?? "";
  const playerList3 = allPlayers.slice(0, 3).join(", ");
  const playerCount = allPlayers.length;
  const { statNoun, statVerb, actionNoun, statAdjective } = lensContext(post);
  const isGoals = post.statLens === "goals";
  const isFormMover = post.category === "Form Mover";
  const isTeamTotal = post.category === "Team Total";
  const isMatchup = post.category === "Matchup Angle";
  const isProof = post.category === "Proof Post";
  const isMixed = post.statLens === "mixed" || post.category === "Round Preview";
  const teams = safeArr(post.teamNames);
  const twoTeams = teams.length >= 2;
  const game = post.targetGame ?? (twoTeams ? `${teams[0]} vs ${teams[1]}` : "this week's match");
  const tiktokSubjectLine = buildTikTokSubjectLine(post);

  // ─── Helpers for per-stat-family language ─────────────────────────────────

  function thresholdPhrase(): string {
    if (isGoals) return `${threshold} in recent weeks`;
    if (isMixed) return `their key stat thresholds`;
    return `${threshold}`;
  }

  function statAction(): string {
    if (isGoals) return `${statVerb}`;
    return `notching ${threshold}`;
  }

  // ─── TikTok Hooks (5) ─────────────────────────────────────────────────────

  const tiktokHooks: HookItem[] = [];

  // TikTok 1 — ultra-short scroll-stopper
  tiktokHooks.push({
    style: "tiktok_short",
    platform: "tiktok",
    label: "TikTok 1 — Scroll-stopper",
    text: cleanHookText(
      isGoals
        ? `${firstPlayer}. ${threshold}. It keeps happening.`
        : isFormMover
        ? `${firstPlayer}'s form has shifted. Here's the proof.`
        : isMixed
        ? `${game} — full picks breakdown.`
        : `${threshold}. ${playerCount > 1 ? `${playerCount} players` : firstPlayer}. This week.`
    ),
  });

  // TikTok 2 — stat-led
  tiktokHooks.push({
    style: "stat_driven",
    platform: "tiktok",
    label: "TikTok 2 — Stat-led",
    text: cleanHookText(
      isGoals
        ? `${firstPlayer} has hit ${threshold} in ${playerCount > 1 ? "multiple games" : "recent games"}. ${secondPlayer ? `${secondPlayer} too.` : "The form is real."}`
        : isTeamTotal && twoTeams
        ? `${teams[0]} vs ${teams[1]} — ${statNoun} gap is bigger than expected.`
        : `${threshold} — ${playerCount > 2 ? `${playerCount} players` : playerList3} all in form right now.`
    ),
  });

  // TikTok 3 — curiosity
  tiktokHooks.push({
    style: "curiosity",
    platform: "tiktok",
    label: "TikTok 3 — Curiosity",
    text: cleanHookText(
      isGoals
        ? `Who's actually ${statVerb} consistently this season? Not who you think.`
        : isFormMover
        ? `Something is changing with ${firstPlayer}'s numbers. Worth knowing about.`
        : isMixed
        ? `Full ${game} breakdown — who's actually in form and who isn't?`
        : `Who's quietly running the best ${statAdjective} form in AFL right now?`
    ),
  });

  // TikTok 4 — question
  tiktokHooks.push({
    style: "question",
    platform: "tiktok",
    label: "TikTok 4 — Question",
    text: cleanHookText(
      isGoals
        ? `Can ${firstPlayer} keep hitting ${threshold} this round?${secondPlayer ? ` What about ${secondPlayer}?` : ""}`
        : isTeamTotal && twoTeams
        ? `Which team wins the ${statNoun} battle — ${teams[0]} or ${teams[1]}?`
        : isMatchup
        ? `How does ${game} look from a stat angle? The numbers are interesting.`
        : `Which AFL players have been most consistent with ${threshold} this season?`
    ),
  });

  // TikTok 5 — data angle
  tiktokHooks.push({
    style: "data_angle",
    platform: "tiktok",
    label: "TikTok 5 — Data angle",
    text: cleanHookText(
      isProof
        ? `Called it last week. Here's the stat line that came through.`
        : isGoals
        ? `AFL goal data from the last 5 weeks. ${firstPlayer} is near the top.`
        : isMixed
        ? `Stat board for ${game}. Disposals, goals, form — all here.`
        : `AFL ${statAdjective} form data — here's who's been most consistent.`
    ),
  });

  // ─── Instagram Hooks (5) ──────────────────────────────────────────────────

  const instagramHooks: HookItem[] = [];

  // Instagram 1 — direct caption opener
  instagramHooks.push({
    style: "direct",
    platform: "instagram",
    label: "Instagram 1 — Direct",
    text: cleanHookText(
      isGoals
        ? `${playerList3} — all hitting ${threshold} consistently this season.`
        : isFormMover
        ? `${firstPlayer} is trending up. The numbers back it this week.`
        : isTeamTotal && twoTeams
        ? `${teams[0]} vs ${teams[1]} — here's the ${statNoun} breakdown for this match.`
        : `${playerList3 || "These players"} are all clearing ${threshold} right now.`
    ),
  });

  // Instagram 2 — curiosity caption
  instagramHooks.push({
    style: "curiosity",
    platform: "instagram",
    label: "Instagram 2 — Curiosity",
    text: cleanHookText(
      isGoals
        ? `Who's actually been ${statVerb} week after week? ${firstPlayer}${secondPlayer ? ` and ${secondPlayer}` : ""} might surprise you.`
        : isMatchup
        ? `You've heard the talk about ${game}. Here's what the actual data says.`
        : `Not many people are tracking ${threshold} this season. Here's why it matters.`
    ),
  });

  // Instagram 3 — stat-driven
  instagramHooks.push({
    style: "stat_driven",
    platform: "instagram",
    label: "Instagram 3 — Stat-driven",
    text: cleanHookText(
      isGoals
        ? `${firstPlayer} has cleared ${threshold} in recent games. That's a form line worth noting.`
        : isTeamTotal
        ? `Total ${statNoun} per game — this is how ${twoTeams ? `${teams[0]} and ${teams[1]}` : "the teams"} actually compare.`
        : `${threshold} hit rate over the last 5 games — ${playerList3 || "these players"} are the names holding up.`
    ),
  });

  // Instagram 4 — challenge
  instagramHooks.push({
    style: "challenge",
    platform: "instagram",
    label: "Instagram 4 — Challenge",
    text: cleanHookText(
      isGoals
        ? `Before you finalise your AFL picks this round — have you checked the ${statNoun} form?`
        : isTeamTotal && twoTeams
        ? `${teams[0]} or ${teams[1]}? The ${statNoun} data might change your read.`
        : `Think you know who's in form? Check the last 5 ${statNoun} averages first.`
    ),
  });

  // Instagram 5 — player-led
  instagramHooks.push({
    style: "punchy",
    platform: "instagram",
    label: "Instagram 5 — Player-led",
    text: cleanHookText(
      isProof
        ? `Flagged ${firstPlayer} last week. The stat line followed.`
        : isMixed
        ? `${game}: ${playerCount} players with strong form profiles heading in.`
        : secondPlayer
        ? `${firstPlayer} and ${secondPlayer} are both showing up in the ${statAdjective} data this week.`
        : `${firstPlayer} is one of the stronger ${statAdjective} profiles heading into this round.`
    ),
  });

  // ─── Facebook Hooks (5) ───────────────────────────────────────────────────

  const facebookHooks: HookItem[] = [];

  // Facebook 1 — longer, conversational
  facebookHooks.push({
    style: "direct",
    platform: "facebook",
    label: "Facebook 1 — Conversational",
    text: cleanHookText(
      isGoals
        ? `Looking at the AFL ${statNoun} form this week — ${playerList3 || "a few players"} have been particularly consistent hitting ${threshold}. Worth knowing about heading into the round.`
        : isFormMover
        ? `${firstPlayer}'s recent form has been worth tracking. The ${statNoun} numbers have been moving in the right direction over the past few weeks.`
        : isMixed
        ? `${game} full picks breakdown — here's how the stats stack up for ${playerCount} players across disposals and goals.`
        : `The ${statAdjective} form data is in for this week. ${playerList3 || "A few players"} stand out at ${threshold}.`
    ),
  });

  // Facebook 2 — educational
  facebookHooks.push({
    style: "data_angle",
    platform: "facebook",
    label: "Facebook 2 — Educational",
    text: cleanHookText(
      isGoals
        ? `AFL ${statNoun} form is one of the more consistent indicators week-to-week. Here's who's been hitting ${threshold} in recent games.`
        : isTeamTotal && twoTeams
        ? `Team ${statNoun} averages don't always tell the full story. Here's how ${teams[0]} and ${teams[1]} actually compare in ${game}.`
        : `Tracking ${threshold} across the season — here's what the data shows about which players have been the most consistent.`
    ),
  });

  // Facebook 3 — community engagement
  facebookHooks.push({
    style: "question",
    platform: "facebook",
    label: "Facebook 3 — Engagement question",
    text: cleanHookText(
      isGoals
        ? `Who do you think has the best ${statNoun} form in AFL right now? Our data has ${firstPlayer}${secondPlayer ? ` and ${secondPlayer}` : ""} near the top.`
        : isMatchup
        ? `${game} — which players stand out to you from a fantasy perspective? Here's what the stat board looks like.`
        : `Who's been the most consistent AFL player at ${threshold} this season? Drop your picks below — we've got the data breakdown.`
    ),
  });

  // Facebook 4 — proof/credibility
  facebookHooks.push({
    style: "stat_driven",
    platform: "facebook",
    label: "Facebook 4 — Credibility",
    text: cleanHookText(
      isProof
        ? `We flagged ${firstPlayer} last week based on the stat trends. Here's how the numbers played out.`
        : isGoals
        ? `${firstPlayer} has cleared ${threshold} in their last several appearances. Here's the full breakdown of who's been consistent.`
        : `Here's the ${threshold} hit rate breakdown — ${playerList3 || "these players"} are the most reliable over the last 5 weeks.`
    ),
  });

  // Facebook 5 — CTA-style
  facebookHooks.push({
    style: "cta_style",
    platform: "facebook",
    label: "Facebook 5 — CTA",
    text: cleanHookText(
      `Full AFL ${statAdjective} stat board at Neeko Sports Stats — updated weekly. ${playerList3 ? `${playerList3} and more tracked.` : "All players tracked."} Link in bio.`
    ),
  });

  // ─── On-screen text hooks (5) ─────────────────────────────────────────────

  const onScreenHooks: HookItem[] = [];

  onScreenHooks.push({
    style: "on_screen",
    platform: "on_screen",
    label: "On-screen 1 — Headline stat",
    text: cleanHookText(
      isGoals
        ? `${threshold} — ${playerCount} players in form`
        : isTeamTotal && twoTeams
        ? `${teams[0]} vs ${teams[1]} — ${statNoun} breakdown`
        : `${threshold} — who's hitting it`
    ),
  });

  onScreenHooks.push({
    style: "on_screen",
    platform: "on_screen",
    label: "On-screen 2 — Player stat",
    text: cleanHookText(
      firstPlayer
        ? `${firstPlayer} — ${isGoals ? thresholdPhrase() : `${threshold} form`}`
        : `AFL ${statAdjective} form — current season`
    ),
  });

  onScreenHooks.push({
    style: "on_screen",
    platform: "on_screen",
    label: "On-screen 3 — Multi-player",
    text: cleanHookText(
      playerCount >= 3
        ? `${allPlayers.slice(0, 3).join(" · ")} — all in form`
        : playerCount >= 2
        ? `${firstPlayer} · ${secondPlayer} — ${statAdjective} form`
        : `${firstPlayer} — ${statAdjective} form this season`
    ),
  });

  onScreenHooks.push({
    style: "on_screen",
    platform: "on_screen",
    label: "On-screen 4 — Curiosity",
    text: cleanHookText(
      isGoals
        ? `Most consistent ${statNoun} scorers this season`
        : isMixed
        ? `${game} — full stat board`
        : `Who's clearing ${threshold}?`
    ),
  });

  onScreenHooks.push({
    style: "on_screen",
    platform: "on_screen",
    label: "On-screen 5 — CTA",
    text: cleanHookText(`Full board @ Neeko Sports Stats`),
  });

  // ─── Video openers (5) ────────────────────────────────────────────────────

  const videoOpeners: HookItem[] = [];

  videoOpeners.push({
    style: "punchy",
    platform: "video",
    label: "Video opener 1 — Punchy",
    text: cleanHookText(
      isGoals
        ? `${threshold}. ${firstPlayer} keeps hitting it.`
        : isMixed
        ? `${game}. Full picks. Let's go.`
        : `${threshold}. Here are the players who keep showing up.`
    ),
  });

  videoOpeners.push({
    style: "question",
    platform: "video",
    label: "Video opener 2 — Question",
    text: cleanHookText(
      isGoals
        ? `Who's been the most reliable ${statAdjective} performer in AFL this season? Here's what the data actually says.`
        : isMatchup
        ? `What does the data say about ${game}? Here's the full stat breakdown.`
        : `Which AFL players have been most consistent at ${threshold}? Stay with me.`
    ),
  });

  videoOpeners.push({
    style: "stat_driven",
    platform: "video",
    label: "Video opener 3 — Stat-led",
    text: cleanHookText(
      isGoals
        ? `${firstPlayer} has cleared ${threshold} in recent games. ${secondPlayer ? `${secondPlayer} too.` : "The form is consistent."} Here's the full board.`
        : isTeamTotal && twoTeams
        ? `${teams[0]} averages ${statNoun} against ${teams[1]}. Here's the breakdown.`
        : `${threshold} — ${playerList3 || "these players"} all in form. Here's the breakdown.`
    ),
  });

  videoOpeners.push({
    style: "curiosity",
    platform: "video",
    label: "Video opener 4 — Curiosity",
    text: cleanHookText(
      isFormMover
        ? `Something is happening with ${firstPlayer}'s numbers. It started a few weeks ago and it's still going.`
        : isMixed
        ? `${game} has some interesting stat stories heading in. Here's what you need to know.`
        : `Not everyone is tracking ${statAdjective} form this closely. Here's what the data has been showing.`
    ),
  });

  videoOpeners.push({
    style: "direct",
    platform: "video",
    label: "Video opener 5 — Direct",
    text: cleanHookText(
      isProof
        ? `We had ${firstPlayer} flagged last week. Here's how the numbers played out.`
        : isGoals
        ? `Here are the AFL players hitting ${threshold} most consistently right now — ${playerList3 || "let's look at the data"}.`
        : `Here's the ${threshold} form board for this round — ${playerCount} players worth knowing about.`
    ),
  });

  // ─── Combine all hooks ────────────────────────────────────────────────────

  const allHooks: HookItem[] = [
    ...tiktokHooks,
    ...instagramHooks,
    ...facebookHooks,
    ...onScreenHooks,
    ...videoOpeners,
  ];

  // ─── Recommended picks ────────────────────────────────────────────────────

  const recommended: HookRecommendedUse = {
    tiktokSubject: tiktokSubjectLine,
    bestTikTok: tiktokHooks[0].text,
    bestInstagram: instagramHooks[1].text, // curiosity hook works best for IG captions
    bestFacebook: facebookHooks[0].text,   // conversational works best for FB
    bestOnScreen: onScreenHooks[0].text,
    bestVideoOpener: videoOpeners[0].text,
    bestCaptionOpener: instagramHooks[2].text, // stat-driven for caption body
    bestShort: tiktokHooks[0].text,        // shortest TikTok hook = best short
  };

  return {
    postId: post.id,
    postTitle: post.title,
    tiktokSubjectLine,
    tiktokHooks,
    instagramHooks,
    facebookHooks,
    onScreenHooks,
    videoOpeners,
    hooks: allHooks,
    recommended,
  };
}

/** Legacy adapter — keeps hookVariations in AiCreativePromptPack working */
export function buildHookVariations(post: SocialPost): string[] {
  const pack = buildPostHookPack(post);
  // Return a representative subset: first hook from each platform group
  return [
    pack.tiktokHooks[0]?.text ?? "",
    pack.instagramHooks[0]?.text ?? "",
    pack.facebookHooks[0]?.text ?? "",
    pack.onScreenHooks[0]?.text ?? "",
    pack.videoOpeners[0]?.text ?? "",
  ].filter(Boolean);
}

export function copyAllHooks(hookPack: PostHookPack): string {
  const sections: string[] = [];
  sections.push(`=== HOOKS — ${hookPack.postTitle} ===`);
  sections.push(`TikTok Subject Line: ${hookPack.tiktokSubjectLine}`);
  sections.push(``);

  sections.push(`--- TIKTOK HOOKS ---`);
  sections.push(hookPack.tiktokHooks.map(h => `${h.label}:\n${h.text}`).join("\n\n"));
  sections.push(``);

  sections.push(`--- INSTAGRAM HOOKS ---`);
  sections.push(hookPack.instagramHooks.map(h => `${h.label}:\n${h.text}`).join("\n\n"));
  sections.push(``);

  sections.push(`--- FACEBOOK HOOKS ---`);
  sections.push(hookPack.facebookHooks.map(h => `${h.label}:\n${h.text}`).join("\n\n"));
  sections.push(``);

  sections.push(`--- ON-SCREEN TEXT ---`);
  sections.push(hookPack.onScreenHooks.map(h => `${h.label}:\n${h.text}`).join("\n\n"));
  sections.push(``);

  sections.push(`--- VIDEO OPENERS ---`);
  sections.push(hookPack.videoOpeners.map(h => `${h.label}:\n${h.text}`).join("\n\n"));
  sections.push(``);

  sections.push(`--- RECOMMENDED ---`);
  sections.push(`TikTok Subject: ${hookPack.recommended.tiktokSubject}`);
  sections.push(`Best TikTok hook: ${hookPack.recommended.bestTikTok}`);
  sections.push(`Best Instagram hook: ${hookPack.recommended.bestInstagram}`);
  sections.push(`Best Facebook hook: ${hookPack.recommended.bestFacebook}`);
  sections.push(`Best on-screen: ${hookPack.recommended.bestOnScreen}`);
  sections.push(`Best video opener: ${hookPack.recommended.bestVideoOpener}`);
  sections.push(`Best caption opener: ${hookPack.recommended.bestCaptionOpener}`);
  sections.push(`Best short hook: ${hookPack.recommended.bestShort}`);

  return sections.join("\n");
}

export function copyPlatformHooks(hookPack: PostHookPack, platform: HookPlatform): string {
  const groups: Record<HookPlatform, HookItem[]> = {
    tiktok: hookPack.tiktokHooks,
    instagram: hookPack.instagramHooks,
    facebook: hookPack.facebookHooks,
    on_screen: hookPack.onScreenHooks,
    video: hookPack.videoOpeners,
    general: hookPack.hooks,
  };
  const items = groups[platform] ?? [];
  return items.map(h => `${h.label}:\n${h.text}`).join("\n\n");
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
