import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Top3Player {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  projection: number;
  ceiling: number;
  value_score: number;
}

interface PostRow {
  id: string;
  weekly_plan_id: string;
  day_key: string;
  slot_key: string;
  player_id: number | null;
  player_name: string | null;
  player2_id: number | null;
  player2_name: string | null;
  team: string | null;
  category: string;
  content_type: string;
  angle: string | null;
  status: string;
  locked: boolean;
  top3_players: Top3Player[] | null;
}

interface PlayerCache {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  projection_final: number;
  ceiling: number;
  floor: number;
  price: number;
  prev_price: number;
  price_change: number;
  value_score: number;
  best_value_score: number;
  rank: number;
  form_score: number;
  consistency: number;
  captain_score: number;
  risk_rating: number;
  upside_pct: number;
  matchup_label: string;
  signal: string;
  recommendation_short: string;
  market_watch_category: string;
  games_played: number;
  player_status: string | null;
  manual_status: string | null;
}

// ── GUARANTEED PLATFORM STRUCTURE ─────────────────────────────────────────────

interface PlatformVariants {
  tiktok: {
    hook: string;
    caption: string;
    hashtags: string[];
    cta: string;
  };
  instagram: {
    hook: string;
    caption: string;
    hashtags: string[];
    carousel: string[];
  };
  reddit: {
    title: string;
    body: string;
  };
}

function buildEmptyPlatforms(playerName: string, category: string, team: string): PlatformVariants {
  return {
    tiktok: {
      hook: `${category} alert: ${playerName} is your edge this round.`,
      caption: `${playerName} (${team}) is this week's ${category} pick. Data backs it — full breakdown at Neeko Sports.`,
      hashtags: ["#AFLFantasy", "#NeekoSports", "#AFL", "#FantasyTips", "#FantasyFootball"],
      cta: "Full breakdown — link in bio.",
    },
    instagram: {
      hook: `${playerName} is your ${category} edge this week.`,
      caption: `${playerName} (${team}) — ${category} pick of the week.\n\nFull analysis at Neeko Sports — link in bio.`,
      hashtags: ["#AFLFantasy", "#NeekoSports", "#AFL", "#FantasyFootball", "#AFLFantasyTips"],
      carousel: [
        `${playerName} — ${category.toUpperCase()}`,
        "Data analysis",
        "Full breakdown at Neeko Sports",
        "Link in bio",
      ],
    },
    reddit: {
      title: `[Data] ${playerName} flagged as ${category} pick by Neeko model this round`,
      body: `Neeko model has flagged ${playerName} (${team}) as a ${category} pick this round. Projection looking solid. Worth a look before lockout — anyone else seeing this in their data?`,
    },
  };
}

function buildEmptyTop3Platforms(players: Top3Player[]): PlatformVariants {
  const names = players.map(p => p.player_name).join(", ");
  return {
    tiktok: {
      hook: `Top 3 picks this round — the data doesn't lie.`,
      caption: `My top 3 AFL Fantasy picks this round: ${names}. Full breakdown at Neeko Sports.`,
      hashtags: ["#AFLFantasy", "#NeekoSports", "#AFL", "#FantasyTips", "#FantasyFootball"],
      cta: "Full breakdown — link in bio.",
    },
    instagram: {
      hook: `Top 3 picks this round — ranked by the data.`,
      caption: `My top 3 AFL Fantasy picks this round:\n#1 ${players[0]?.player_name ?? ""}\n#2 ${players[1]?.player_name ?? ""}\n#3 ${players[2]?.player_name ?? ""}\n\nFull analysis at Neeko Sports — link in bio.`,
      hashtags: ["#AFLFantasy", "#NeekoSports", "#AFL", "#FantasyFootball", "#AFLFantasyTips"],
      carousel: [
        `Top 3 Picks This Round`,
        `#1 ${players[0]?.player_name ?? ""} — Proj: ${Math.round(players[0]?.projection ?? 0)}pts`,
        `#2 ${players[1]?.player_name ?? ""} — Proj: ${Math.round(players[1]?.projection ?? 0)}pts`,
        `#3 ${players[2]?.player_name ?? ""} — Full breakdown at Neeko Sports`,
      ],
    },
    reddit: {
      title: `[Data] Top 3 AFL Fantasy picks this round — Neeko model rankings`,
      body: `Neeko model has ranked the top 3 AFL Fantasy picks this round: ${names}. Projections look strong across all three. Anyone else got these in their squad?`,
    },
  };
}

function normalisePlatformVariants(
  raw: Record<string, unknown>,
  playerName: string,
  category: string,
  team: string,
): PlatformVariants {
  const voice = typeof raw.voice_script === "string" ? raw.voice_script : "";
  const caption = typeof raw.caption_script === "string" ? raw.caption_script : "";
  const fallback = buildEmptyPlatforms(playerName, category, team);

  const rv = raw.platform_variants;
  const v = (rv && typeof rv === "object" && !Array.isArray(rv))
    ? rv as Record<string, unknown>
    : {};

  // ── TikTok ──────────────────────────────────────────────────────────────
  const rawTk = v.tiktok;
  let tiktok: PlatformVariants["tiktok"];
  if (rawTk && typeof rawTk === "object" && !Array.isArray(rawTk)) {
    const tk = rawTk as Record<string, unknown>;
    tiktok = {
      hook: (typeof tk.hook === "string" && tk.hook.trim()) ? tk.hook.trim()
        : voice.split(".")[0]?.trim() || fallback.tiktok.hook,
      caption: (typeof tk.caption === "string" && tk.caption.trim()) ? tk.caption.trim()
        : voice.slice(0, 150) || fallback.tiktok.caption,
      hashtags: Array.isArray(tk.hashtags) && tk.hashtags.length > 0
        ? (tk.hashtags as unknown[]).map(String)
        : fallback.tiktok.hashtags,
      cta: (typeof tk.cta === "string" && tk.cta.trim()) ? tk.cta.trim()
        : fallback.tiktok.cta,
    };
  } else if (typeof rawTk === "string" && rawTk.trim()) {
    tiktok = { ...fallback.tiktok, caption: rawTk.trim() };
  } else {
    tiktok = {
      hook: voice.split(".")[0]?.trim() || fallback.tiktok.hook,
      caption: voice.slice(0, 150) || fallback.tiktok.caption,
      hashtags: fallback.tiktok.hashtags,
      cta: fallback.tiktok.cta,
    };
  }

  // ── Instagram ────────────────────────────────────────────────────────────
  const rawIg = v.instagram;
  let instagram: PlatformVariants["instagram"];
  if (rawIg && typeof rawIg === "object" && !Array.isArray(rawIg)) {
    const ig = rawIg as Record<string, unknown>;
    let carousel: string[] = [];
    if (Array.isArray(ig.carousel)) {
      carousel = (ig.carousel as unknown[]).map(String).filter(Boolean);
    } else if (Array.isArray(ig.carousel_text)) {
      carousel = (ig.carousel_text as unknown[]).map(String).filter(Boolean);
    } else if (typeof ig.carousel_text === "string" && ig.carousel_text.trim()) {
      carousel = ig.carousel_text.split("|").map((s: string) => s.trim()).filter(Boolean);
    }
    if (carousel.length === 0) carousel = fallback.instagram.carousel;

    instagram = {
      hook: (typeof ig.hook === "string" && ig.hook.trim()) ? ig.hook.trim()
        : caption.split("\n")[0]?.trim() || fallback.instagram.hook,
      caption: (typeof ig.caption === "string" && ig.caption.trim()) ? ig.caption.trim()
        : caption.slice(0, 200) || fallback.instagram.caption,
      hashtags: Array.isArray(ig.hashtags) && ig.hashtags.length > 0
        ? (ig.hashtags as unknown[]).map(String)
        : fallback.instagram.hashtags,
      carousel,
    };
  } else if (typeof rawIg === "string" && rawIg.trim()) {
    instagram = { ...fallback.instagram, caption: rawIg.trim() };
  } else {
    instagram = {
      hook: caption.split("\n")[0]?.trim() || fallback.instagram.hook,
      caption: caption.slice(0, 200) || fallback.instagram.caption,
      hashtags: fallback.instagram.hashtags,
      carousel: fallback.instagram.carousel,
    };
  }

  // ── Reddit ───────────────────────────────────────────────────────────────
  const rawRd = v.reddit;
  let reddit: PlatformVariants["reddit"];
  if (rawRd && typeof rawRd === "object" && !Array.isArray(rawRd)) {
    const rd = rawRd as Record<string, unknown>;
    reddit = {
      title: (typeof rd.title === "string" && rd.title.trim()) ? rd.title.trim()
        : fallback.reddit.title,
      body: (typeof rd.body === "string" && rd.body.trim()) ? rd.body.trim()
        : `Data-driven analysis: ${voice.slice(0, 300)} Worth considering before lockout — what's everyone else seeing?`,
    };
  } else if (typeof rawRd === "string" && rawRd.trim()) {
    reddit = { title: fallback.reddit.title, body: rawRd.trim() };
  } else {
    reddit = {
      title: fallback.reddit.title,
      body: `Data-driven analysis: ${voice.slice(0, 300)} Worth considering before lockout — what's everyone else seeing?`,
    };
  }

  return { tiktok, instagram, reddit };
}

// ── STRATEGY BUILDER ──────────────────────────────────────────────────────────

interface StrategyObject {
  goal: string;
  angle: string;
  audience: string;
  timing: string;
  funnel_stage: string;
  cta_type: string;
  why_it_works: string;
}

const CATEGORY_STRATEGY: Record<string, Omit<StrategyObject, "timing" | "why_it_works">> = {
  Value:        { goal: "conversion",  angle: "opportunity", audience: "casual → serious", funnel_stage: "middle", cta_type: "medium" },
  Breakout:     { goal: "conversion",  angle: "opportunity", audience: "serious",          funnel_stage: "middle", cta_type: "medium" },
  Trap:         { goal: "engagement",  angle: "fear",        audience: "casual",           funnel_stage: "top",    cta_type: "soft"   },
  Top3:         { goal: "authority",   angle: "proof",       audience: "all",              funnel_stage: "middle", cta_type: "medium" },
  Proof:        { goal: "conversion",  angle: "proof",       audience: "serious → hardcore", funnel_stage: "bottom", cta_type: "hard" },
  Captain:      { goal: "conversion",  angle: "opportunity", audience: "serious",          funnel_stage: "middle", cta_type: "medium" },
  H2H:          { goal: "engagement",  angle: "debate",      audience: "casual",           funnel_stage: "top",    cta_type: "soft"   },
  Injury:       { goal: "engagement",  angle: "fear",        audience: "all",              funnel_stage: "top",    cta_type: "soft"   },
  Conversation: { goal: "engagement",  angle: "debate",      audience: "casual",           funnel_stage: "top",    cta_type: "soft"   },
  Engagement:   { goal: "engagement",  angle: "debate",      audience: "casual",           funnel_stage: "top",    cta_type: "soft"   },
};

const DAY_TIMING: Record<string, string> = {
  monday:    "6pm — early decisions",
  tuesday:   "7pm — research window",
  wednesday: "8pm — deeper analysis",
  thursday:  "6pm — pre-lockout",
  friday:    "5pm — final decisions",
  saturday:  "11am — game day",
  sunday:    "10am — last chance",
};

const WHY_IT_WORKS_TEMPLATES: Record<string, string[]> = {
  Value:        [
    "Targets players hunting price-rise opportunities before the market moves.",
    "Casual fans feel like they're getting insider edge before lockout.",
    "Triggers action by making the audience feel they'll miss out if they wait.",
  ],
  Breakout:     [
    "Leverages the urgency of rising prices — act now or pay more later.",
    "Appeals to serious players who want to buy before the crowd catches on.",
    "Creates a clear window of opportunity that drives immediate decisions.",
  ],
  Trap:         [
    "Warns casual players of a costly mistake before it's too late.",
    "Fear of wasting trades drives engagement and comments.",
    "Positions Neeko as the protector — the edge that saves trades.",
  ],
  Top3:         [
    "Definitive ranked lists drive saves and return visits for reference.",
    "Builds authority by making clear, data-backed decisions the audience can trust.",
    "Works across all fan levels — everyone wants the top picks before game day.",
  ],
  Proof:        [
    "Real projected vs actual scores build the strongest credibility signal.",
    "Hardcore users respond to proof — it drives upgrades and referrals.",
    "Showing accuracy converts fence-sitters into paying subscribers.",
  ],
  Captain:      [
    "Captain decisions are the highest-stakes weekly choice — decisive content wins.",
    "Serious players want validation from data before locking their captain.",
    "Clear conviction drives saves and profile visits ahead of lockout.",
  ],
  H2H:          [
    "Forces the audience to pick a side — every comment is an engagement win.",
    "Debate format drives algorithm reach through comment volume.",
    "The controversy keeps users coming back to defend their pick.",
  ],
  Injury:       [
    "Breaking news framing triggers immediate action from anxious fantasy owners.",
    "Replacement content is searched and shared rapidly after injury news drops.",
    "Positions Neeko as the go-to source for urgent, timely fantasy intelligence.",
  ],
  Conversation: [
    "Open questions are the lowest-friction way to drive comments at scale.",
    "Community-style posts build audience trust and brand affinity over time.",
    "Polls keep the algorithm fed while the audience does the work.",
  ],
  Engagement:   [
    "Controversy-first format maximises reach through algorithm-boosting comment volume.",
    "Easy-to-answer polls pull in casual users who wouldn't engage with data posts.",
    "Community debate format builds long-term audience loyalty.",
  ],
};

function buildStrategy(category: string, dayKey: string, playerName: string): StrategyObject {
  const base = CATEGORY_STRATEGY[category] ?? CATEGORY_STRATEGY.Value;
  const timing = DAY_TIMING[dayKey?.toLowerCase() ?? ""] ?? "Optimal posting window for AFL Fantasy cycle";
  const whyTemplates = WHY_IT_WORKS_TEMPLATES[category] ?? WHY_IT_WORKS_TEMPLATES.Value;
  const why = whyTemplates[Math.floor(Math.abs(playerName.charCodeAt(0) ?? 0) % whyTemplates.length)];
  return { ...base, timing, why_it_works: why };
}

function isPlatformEmpty(platforms: PlatformVariants): boolean {
  const { tiktok, instagram, reddit } = platforms;
  return (
    !tiktok.hook.trim() ||
    !tiktok.caption.trim() ||
    !instagram.hook.trim() ||
    !instagram.caption.trim() ||
    !reddit.title.trim() ||
    !reddit.body.trim()
  );
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are an elite AFL Fantasy strategist, performance marketer, and creative director for Neeko Sports. You produce PREMIUM content — not templates, not patterns, not filler.

CORE PHILOSOPHY:
- Every post must have a UNIQUE ANGLE derived directly from that player's specific data — projection, value_score, ceiling, floor, matchup_label, risk_rating.
- Every claim must be backed by a real number from the player data provided. No generic takes.
- Every post must feel like INSIDER KNOWLEDGE — sharp, confident, already-decided analyst voice.
- Every post creates URGENCY, FEAR OF MISSING OUT, or CONTROVERSY.
- Content type must match the story — not follow a fixed rotation.
- No two posts should feel structurally identical.
- NEVER use: "might", "could", "perhaps", "possibly", "worth watching", "interesting", "solid pick", "good option", "one to watch".

CONTENT TYPES:
- "Short-form Video" — face/voiceover, 15-30s, opinion-led, one strong take
- "Graphic Post" — static image, bold visual, 1-3 data points, strong headline
- "Screen Recording" — live Neeko UI walkthrough, proof-driven, credibility builder
- "Hybrid Video" — screen recording + talking head overlay, data + personality
- "Comparison Post" — player A vs player B, data table visual, clear winner verdict
- "Narrative Post" — storytelling arc, "here's how this happened" format
- "Callout Post" — directly challenges a mainstream opinion, controversy-first
- "Educational Breakdown" — explains a concept, builds authority
- "H2H Post" — two players head-to-head debate, force the audience to pick a side
- "Top 3 Post" — ranked top 3 picks for a game day or position
- "Injury Alert Post" — player is injured, here are the 3 best replacement options
- "Conversation Post" — open question, poll, or debate starter

HOOK RULES — NON-NEGOTIABLE:
- FORBIDDEN: "Here's why...", "Did you know...", "This player is...", "Check out..."
- REQUIRED: tension, a belief being challenged, a mistake being called out, or specific numbers.
- Each hook must be under 20 words and could stand alone as a social post.

H2H POST RULES:
- Force the audience to choose between two players. No sitting on the fence.
- Voice script: Name both players, give one key stat each, then ask "Who are you picking?"
- Caption: Bold opinion line, two stats per player, CTA: "Drop your pick below 👇"
- Visual: Split-screen graphic. Left = Player A (green). Right = Player B (amber/blue). VS in the centre.

TOP 3 POST RULES:
- Ranked list: #1, #2, #3. Each entry has one clear data justification.
- No more than one player from the same team.
- Voice: "My top 3 [position/day] picks this round — and the data backs every single one."
- Visual: Stacked rank cards. Gold/Silver/Bronze. Player name + one key stat per row.
- The voice_script MUST follow this exact format:
  "Top 3 Picks This Week 👇

  #1 {player_name}
  Projection: {X}pts
  Ceiling: {X}pts
  Why: {one sentence data-driven reason}

  #2 {player_name}
  Projection: {X}pts
  Ceiling: {X}pts
  Why: {one sentence data-driven reason}

  #3 {player_name}
  Projection: {X}pts
  Ceiling: {X}pts
  Why: {one sentence data-driven reason}

  {Closing CTA line — e.g. 'Full breakdown at Neeko Sports — link in bio.'}"

INJURY ALERT POST RULES:
- CRITICAL: ONLY generate an Injury post if the player data explicitly states player_status = "OUT". NEVER invent, assume, or imply an injury if the status is not confirmed in the data provided.
- Urgent tone — breaking news style.
- Voice: "BREAKING — [Player] is OUT this round. Three replacement options: ..."
- Visual: Red "BREAKING" banner. Injured player name with cross. Three replacement rows in green.
- DO NOT use phrases like "may be injured", "could miss", "is a concern", or any speculative injury language. Only state confirmed OUT status.

CONVERSATION POST RULES:
- Single sharp question or poll. No player data required.
- Voice: Short (20-35 words). Ask clearly. "Drop your answer below."
- Visual: Bold text post. One question as hero. Simple clean background.

PROOF POST RULES:
- Must use ACTUAL past performance data from the AI INTEL section — real projected score vs real actual score.
- The gap between projected and actual MUST be stated explicitly (e.g. "2pts off", "0.5pts off").
- Voice MUST follow this exact format: "We projected [Player] at [projected]pts last round — they scored [actual]pts. That's [gap]pts off. The model works."
- Do NOT use vague language like "close to" or "near the projection" — use exact numbers only.
- Visual: Scoreboard or split graphic — projected score left, actual score right, gap in the middle. Green tick overlay. Neeko Sports logo bottom-right.
- Hook must include the actual score number. E.g. "We said 93pts. He scored 94. That's the model."

VOICE SCRIPT RULES (non-Top3):
- 55-80 words. Hook → Setup → Data pivot → Strong take → CTA (Neeko Sports link in bio).
- Use "..." for natural pauses. Use "—" for hard emphasis breaks.
- Sound like a sharp analyst who has ALREADY made the decision.
- NEVER use: "might", "could", "perhaps", "possibly", "worth watching", "interesting".
- Reference SPECIFIC numbers from the player data provided.

CAPTION RULES:
- 3-4 punchy lines. Line 1: Bold opinion. Lines 2-3: Two specific data points. Final line: CTA + 3-4 hashtags.

VISUAL PLAN RULES — THIS IS THE MOST IMPORTANT FIELD:
- Describe REAL imagery and footage — not abstract design concepts.
- NEVER use: "graphic design", "player image", "clean layout", "generic background".
- For Video/Short-form Video/Hybrid Video: Scene-by-scene with REAL footage types per scene. Specify: what real clip is playing (goal, tackle, clearance, celebration), exact text overlay, timing, transition style.
- For Graphic Post/Callout Post: Specify exact image type (in-game action shot, media day portrait, broadcast still), what the player is doing, composition (close-up/mid-shot), overlay elements (projection, price, rank badge), colour treatment.
- For Screen Recording: Step-by-step Neeko UI walkthrough — which page, what to scroll to, what to highlight.
- For Comparison Post/H2H Post: Split-screen with real action shots of each player, stat rows, clear winner verdict overlay.
- For Top 3 Post: Three rows, each with in-game action shot of the respective player, gold/silver/bronze rank badge, projection overlay.
- For Injury Alert Post: Red BREAKING banner, injured player reference, three replacement rows each with a real moment description.
- Category visual rules: VALUE — consistency gameplay + stat overlay. BREAKOUT — explosive highlight moment (goal, big score, burst). TRAP — neutral/poor performance clip with warning overlay. PROOF — scoreboard overlay or real past game reference. CAPTAIN — decisive match moment, high-intensity action.
- Colour logic: GREEN (#00C853) = value/buy/captain. RED (#D32F2F) = trap/sell/injury. AMBER (#FF8F00) = risk/neutral. GOLD (#FFD700) for #1 rank.
- Must be a single detailed STRING specific enough that an editor can execute without guessing.

IMAGE PROMPT RULES (ai_image_prompt field):
- Describe a REAL-WORLD image type — not an abstract graphic.
- MANDATORY: specify one image type from: "real in-game action shot", "player media day portrait", "match broadcast still", "celebration moment", "training session shot".
- Structure: "Image type: [type]. Player: [player name] ([team]), [exact action — e.g. kicking inside 50, handballing through traffic, celebrating goal with teammates]. Source style: [AFL broadcast / Getty-style sports photography / Fox Footy broadcast frame]. Shot: [close-up / mid-shot / wide]. Composition: [player position in frame], background [crowd/stadium/bench]. Overlay: [projection Xpts], [$price], [rank badge if relevant], headline text '[MAX 5 WORDS]'. Colour treatment: dark #0D0D0D vignette, team primary accent, #00C853 stat highlights. Brand: Neeko Sports logo bottom-right, white."
- Player name and team must appear.
- Under 120 words. Every field filled. No vague descriptors.

VIDEO PROMPT RULES (ai_video_prompt field):
- Describe REAL footage types per scene — not motion graphics alone.
- MANDATORY: every scene must reference a real AFL footage type (highlight clip, broadcast angle, slow-motion replay, goal celebration, midfield contest).
- Four mandatory scenes:
  Scene 1 (0-3s): Hook — fast highlight clip of player (specify: what play — goal / clearance / big score game), headline text overlay slams in, hard cut beat.
  Scene 2 (3-10s): Context — broadcast gameplay clip OR stat overlay animation on dark background, specific numbers count up (projection, price, value score).
  Scene 3 (10-16s): Insight — second gameplay moment of player OR slow-motion replay of key play, supporting stat or AI verdict text fades in.
  Scene 4 (16-22s): CTA — Neeko Sports logo pulses in green #00C853, bold white CTA text, simple motion, fade to black.
- Specify: footage type per scene, exact text overlay words, transition style between scenes.
- Neeko branding throughout: dark background, green #00C853 accent, bold white typography.
- Under 180 words. Scene timings must total 18-25 seconds.

CREATIVE STYLE — assign one per post from this exact list:
- pov_stadium: first-person stadium perspective, creates immersion
- screen_proof: shows live Neeko UI, data-proof credibility post
- data_graphic: bold numbers-first graphic, analytical authority
- debate_post: split-screen or VS format, forces audience to pick a side
- reaction_take: quick face-to-camera or animated reaction, casual and relatable
- comparison_reveal: side-by-side data comparison, data picks a winner
- countdown_urgency: countdown or deadline visual, creates FOMO
- narrative_arc: story progression, before/after or trending arc visual

CONVERSION SCORE — assign X.X out of 10:
- Strong hook (tension/controversy/numbers): +2
- Clear angle/edge (unique insight): +2
- Includes specific proof/data (real numbers): +2
- Strong CTA (clear next action): +2
- Emotional trigger (FOMO, fear, pride, identity): +2

PLATFORM VARIANTS — CRITICAL REQUIREMENTS:
- ALL THREE platforms (tiktok, instagram, reddit) MUST be populated.
- NEVER leave any field empty or as a placeholder.
- tiktok.hook: under 10 words, immediate tension or curiosity
- tiktok.caption: 1-2 punchy lines with numbers
- tiktok.hashtags: exactly 5 hashtags including #AFLFantasy and #NeekoSports
- tiktok.cta: single action, e.g. "Full breakdown — link in bio."
- instagram.hook: bold opinion or surprising stat, under 15 words
- instagram.caption: 2-3 lines, bold claim + data points
- instagram.hashtags: exactly 6 hashtags including #AFLFantasy and #NeekoSports
- instagram.carousel: array of 4 slide texts ["Slide 1 headline", "Slide 2 stat", "Slide 3 verdict", "Slide 4 CTA"]
- reddit.title: r/AFLFantasy post title — data-led, no promotional language
- reddit.body: 3-5 sentences, genuine community post tone, ends with a question

OUTPUT: Valid JSON only. No markdown. No extra text.`;
}

function buildUserPrompt(
  post: PostRow,
  player: PlayerCache | null,
  player2: PlayerCache | null,
  aiSummary: string,
): string {
  const priceStr = player ? `$${Math.round((player.price ?? 0) / 1000)}k` : "unknown";
  const priceChange = player && player.price_change !== 0
    ? ` (${player.price_change > 0 ? "+" : ""}$${Math.round(player.price_change / 1000)}k this week)`
    : "";

  const injuryStatusLine = player?.player_status === "OUT"
    ? `Player Status: OUT (CONFIRMED INJURED — this is a real confirmed injury)`
    : player?.manual_status === "OUT"
    ? `Player Status: OUT (CONFIRMED INJURED — manually confirmed)`
    : `Player Status: ${player?.player_status ?? "ACTIVE"}`;

  const playerInfo = player
    ? `Player: ${player.player_name} (${player.team}, ${player.position})
${injuryStatusLine}
Rank: #${player.rank}
Projection: ${Math.round(player.projection_final)}pts
Ceiling: ${Math.round(player.ceiling)}pts
Floor: ${Math.round(player.floor)}pts
Price: ${priceStr}${priceChange}
Value Score: ${Number(player.value_score).toFixed(1)}
Best Value Score: ${Number(player.best_value_score ?? 0).toFixed(1)}
Form Score: ${Math.round(player.form_score)}
Consistency: ${Math.round(player.consistency)}%
Captain Score: ${Math.round(player.captain_score)}
Risk Rating: ${Number(player.risk_rating).toFixed(1)}
Upside: ${Number(player.upside_pct).toFixed(1)}%
Matchup: ${player.matchup_label ?? "n/a"}
Signal: ${player.signal ?? "n/a"}
Market Category: ${player.market_watch_category ?? "n/a"}
Games Played: ${player.games_played}
AI Short Take: ${player.recommendation_short ?? "n/a"}`
    : `Player: ${post.player_name ?? ""} (${post.team ?? ""})
No additional stats available.`;

  const player2Info = player2
    ? `\nSECOND PLAYER (for H2H):
Player: ${player2.player_name} (${player2.team}, ${player2.position})
Rank: #${player2.rank}
Projection: ${Math.round(player2.projection_final)}pts
Price: $${Math.round((player2.price ?? 0) / 1000)}k
Value Score: ${Number(player2.value_score).toFixed(1)}
Captain Score: ${Math.round(player2.captain_score)}
Consistency: ${Math.round(player2.consistency)}%`
    : "";

  const aiSummarySection = aiSummary ? `\nAI INTEL FOR ${post.player_name ?? ""}:\n${aiSummary.slice(0, 600)}` : "";

  const categoryInstructions: Record<string, string> = {
    Value: "This is a VALUE post. The player's value_score and best_value_score show they are underpriced for their projected output. Reference their exact price, projection, and value_score in the content. Make the audience feel they are getting insider edge before the market adjusts.",
    Breakout: "This is a BREAKOUT post. Reference the player's upside_pct and ceiling to show explosive scoring potential. The price has not caught up yet. Make the audience feel urgency — act before the price rises and the window closes.",
    Trap: "This is a TRAP post. The player's risk_rating is high and value_score is low — they are overpriced for their projected output. Reference their exact price and risk_rating. Warn the audience before they make a costly mistake.",
    Captain: "This is a CAPTAIN post. This player has the highest captain_score and projection in the pool. The data is decisive — reference their projection, ceiling, and consistency. Lock them in.",
    Proof: "This is a PROOF post. The model called this. Show the actual score vs the projected score — the gap must be ≤5pts. Voice script MUST say: 'We projected [Player] at [projected]pts last round — they scored [actual]pts. That's [gap]pts off. The model works.' Build credibility with real numbers. No waffle.",
    H2H: "This is a HEAD-TO-HEAD debate post. Force the audience to choose between the two players. No neutral answer allowed. Every element drives comments.",
    Injury: "This is an INJURY ALERT post. The player data confirms this player's status is OUT. Do NOT list them as a pick. Create urgency: who replaces them? Give 3 clear replacement options with projections and prices. Urgent breaking-news tone. CRITICAL: ONLY use the injury status explicitly confirmed in the player data. NEVER invent, assume, or speculate about injuries not stated in the data.",
    Conversation: "This is a CONVERSATION post. Ask a sharp question or run a poll. No player stats needed. Drive comment engagement above all else.",
    Engagement: "This is an ENGAGEMENT post. Ask a sharp question, run a poll, or spark a debate. Pick a controversial topic in AFL Fantasy. Drive comments above all else.",
  };

  const instruction = categoryInstructions[post.category] ?? categoryInstructions.Value;

  return `Generate ONE AFL Fantasy content post for Neeko Sports.

CATEGORY: ${post.category}
CONTENT TYPE: ${post.content_type}
ANGLE: ${post.angle ?? "hidden_edge"}
DAY: ${post.day_key} (slot ${post.slot_key})

${instruction}

PLAYER DATA:
${playerInfo}${player2Info}${aiSummarySection}

---

CRITICAL: The platform_variants field MUST be fully populated for all three platforms.
Every field in tiktok, instagram, and reddit must contain real content — no empty strings, no placeholders.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "post_type": "${post.content_type}",
  "category": "${post.category}",
  "content_angle": "${post.angle ?? "hidden_edge"}",
  "angle_label": "Value Edge",
  "creative_style": "data_graphic",
  "player_name": "${player?.player_name ?? post.player_name ?? ""}",
  "player_id": ${post.player_id ?? 0},
  "team": "${player?.team ?? post.team ?? ""}",
  "player2_name": ${post.player2_name ? `"${post.player2_name}"` : "null"},
  "player2_id": ${post.player2_id ?? "null"},
  "hooks": ["hook 1 under 20 words", "hook 2 under 20 words", "hook 3 under 20 words"],
  "voice_script": "55-80 word voice script with specific numbers",
  "caption_script": "3-4 line caption with specific numbers and hashtags",
  "visual_plan": "Detailed production brief scene-by-scene or layout brief",
  "ai_image_prompt": "Image type: real in-game action shot. Player: [player name] ([team]), [exact action — e.g. kicking inside 50 during AFL match, handballing through traffic]. Source style: AFL broadcast / Getty-style sports photography. Shot: mid-shot. Composition: player hero centre-frame, stadium crowd background blur. Overlay: projection [X]pts, $[price]k, headline '[MAX 5 WORDS]'. Colour treatment: dark #0D0D0D vignette, team primary accent, #00C853 stat highlights. Brand: Neeko Sports logo bottom-right, white.",
  "ai_video_prompt": "Scene 1 (0-3s): Fast highlight clip — [player name] [specific play e.g. kicking a goal / winning clearance], headline text '[HOOK]' slams in bold white, hard cut. Scene 2 (3-10s): Broadcast gameplay clip of player in action, stats count up — projection [X]pts, $[price]k, value score — dark background overlay. Scene 3 (10-16s): Slow-motion replay of key play OR second gameplay moment, AI verdict text fades in. Scene 4 (16-22s): Neeko Sports logo pulses in green #00C853, bold white CTA 'Full breakdown — link in bio', fade to black.",
  "strategy_json": {
    "goal": "primary goal of this post",
    "trigger": "psychological trigger being used",
    "expected_behaviour": "save/share/comment/click",
    "best_posting_time": "day and time recommendation",
    "cta": "primary call to action"
  },
  "platform_variants": {
    "tiktok": {
      "hook": "Under 10 words — real tension or specific number",
      "caption": "1-2 punchy lines with actual numbers from the data",
      "hashtags": ["#AFLFantasy", "#NeekoSports", "#AFL", "#FantasyTips", "#AFLRound1"],
      "cta": "Full breakdown — link in bio."
    },
    "instagram": {
      "hook": "Bold opinion or surprising stat, under 15 words",
      "caption": "Line 1: bold claim.\nLine 2: first data point.\nLine 3: second data point.",
      "hashtags": ["#AFLFantasy", "#NeekoSports", "#AFL", "#FantasyFootball", "#AFLFantasyTips", "#AFLRound1"],
      "carousel": ["Slide 1: Player name + category headline", "Slide 2: Key stat", "Slide 3: Verdict", "Slide 4: Link in bio"]
    },
    "reddit": {
      "title": "r/AFLFantasy data-led title — no marketing language",
      "body": "3-5 sentences. Open with data finding. Genuine community tone. End with a question to drive discussion."
    }
  },
  "ctas": [
    "Direct conversion CTA",
    "Engagement-first CTA",
    "FOMO-driven CTA"
  ],
  "conversion_score": 7.5,
  "confidence_label": "HIGH",
  "hook_score": 8.0,
  "hook_type": "Data-first"
}

angle_label must be one of: "Contrarian", "Value Edge", "Fear", "Proof", "Debate", "Breakout", "Captain Lock"
creative_style must be one of: pov_stadium, screen_proof, data_graphic, debate_post, reaction_take, comparison_reveal, countdown_urgency, narrative_arc
confidence_label must be one of: HIGH, MEDIUM, LOW
hook_type must be one of: Controversy, Fear, Data-first, Contrarian, Challenge, Identity, Narrative
conversion_score must be a number 1.0 to 10.0
hook_score must be a number 1.0 to 10.0

Generate the complete post. No blanks, no placeholders, no generic filler. ALL platform_variants fields must be real content.`;
}

function buildTop3UserPrompt(post: PostRow, players: Top3Player[]): string {
  const p1 = players[0];
  const p2 = players[1];
  const p3 = players[2];

  const formatPlayer = (rank: number, p: Top3Player) =>
    `#${rank} ${p.player_name} (${p.team}, ${p.position})
  Projection: ${Math.round(p.projection)}pts
  Ceiling: ${Math.round(p.ceiling)}pts
  Value Score: ${Number(p.value_score).toFixed(1)}`;

  return `Generate ONE AFL Fantasy TOP 3 content post for Neeko Sports.

CATEGORY: Top3
CONTENT TYPE: ${post.content_type}
DAY: ${post.day_key} (slot ${post.slot_key})

This is a TOP 3 post. Present three ranked AFL Fantasy picks with data justification.
Make it feel definitive — the audience should save and share this.

TOP 3 PLAYERS (ranked by Neeko model — do NOT change the order):
${formatPlayer(1, p1)}

${formatPlayer(2, p2)}

${formatPlayer(3, p3)}

---

MANDATORY: The voice_script MUST follow this EXACT format (no exceptions):
"Top 3 Picks This Week 👇

#1 ${p1.player_name}
Projection: ${Math.round(p1.projection)}pts
Ceiling: ${Math.round(p1.ceiling)}pts
Why: [one sentence — specific data-driven reason]

#2 ${p2.player_name}
Projection: ${Math.round(p2.projection)}pts
Ceiling: ${Math.round(p2.ceiling)}pts
Why: [one sentence — specific data-driven reason]

#3 ${p3.player_name}
Projection: ${Math.round(p3.projection)}pts
Ceiling: ${Math.round(p3.ceiling)}pts
Why: [one sentence — specific data-driven reason]

[Closing CTA line — e.g. 'Full breakdown at Neeko Sports — link in bio.']"

Platform variants must feature all 3 players by name. Carousel slides must cover all 3 ranked picks.

CRITICAL: The platform_variants field MUST be fully populated for all three platforms.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "post_type": "${post.content_type}",
  "category": "Top3",
  "content_angle": "top3_ranked",
  "angle_label": "Value Edge",
  "creative_style": "data_graphic",
  "player_name": "${p1.player_name}",
  "player_id": ${p1.player_id},
  "team": "${p1.team}",
  "player2_name": null,
  "player2_id": null,
  "hooks": [
    "hook featuring all 3 player names under 20 words",
    "second hook with a bold take under 20 words",
    "third hook creating FOMO under 20 words"
  ],
  "voice_script": "EXACT FORMAT AS SPECIFIED ABOVE — must include #1 #2 #3 headers with Projection, Ceiling, Why per player",
  "caption_script": "Multi-line caption naming all 3 players with their projections and CTA",
  "visual_plan": "Stack layout — dark #0D0D0D background. Row 1: GOLD badge #1 + ${p1.player_name} (${p1.team}) + ${Math.round(p1.projection)}pts projection. Row 2: SILVER badge #2 + ${p2.player_name} (${p2.team}) + ${Math.round(p2.projection)}pts projection. Row 3: BRONZE badge #3 + ${p3.player_name} (${p3.team}) + ${Math.round(p3.projection)}pts projection. Header: 'TOP 3 PICKS THIS ROUND' in bold white. Green #00C853 accent dividers. Neeko Sports logo bottom-right.",
  "ai_image_prompt": "Image type: match broadcast stills composite. Players: #1 ${p1.player_name} (${p1.team}) — in-game action shot; #2 ${p2.player_name} (${p2.team}) — broadcast still; #3 ${p3.player_name} (${p3.team}) — gameplay moment. Source style: AFL broadcast / Getty-style sports photography. Shot: three stacked mid-shots in ranked layout. Composition: gold/silver/bronze rank badge left, player hero centre, stat right — dark #0D0D0D background. Overlay: #1 projection ${Math.round(p1.projection)}pts, #2 ${Math.round(p2.projection)}pts, #3 ${Math.round(p3.projection)}pts, headline 'TOP 3 THIS ROUND'. Colour treatment: dark #0D0D0D vignette, #FFD700 gold / #C0C0C0 silver / #CD7F32 bronze accents, #00C853 stat highlights. Brand: Neeko Sports logo bottom-right, white.",
  "ai_video_prompt": "Scene 1 (0-3s): Fast highlight clip — ${p1.player_name} explosive play (goal / clearance / disposal), headline 'TOP 3 PICKS THIS ROUND' slams in bold white with gold flash, hard cut. Scene 2 (3-12s): Broadcast gameplay clips reveal ranked picks one by one — #1 ${p1.player_name} clip + ${Math.round(p1.projection)}pts count-up, #2 ${p2.player_name} clip + ${Math.round(p2.projection)}pts, #3 ${p3.player_name} clip + ${Math.round(p3.projection)}pts, each with gold/silver/bronze badge slide-in. Scene 3 (12-18s): All 3 players shown together via in-game stills, projection totals locked in, 'Save this before lockout' text fades in. Scene 4 (18-22s): Neeko Sports logo pulses in green #00C853, bold white CTA 'Full breakdown — link in bio', fade to black.",
  "strategy_json": {
    "goal": "Drive saves and profile visits via definitive weekly ranked list",
    "trigger": "FOMO and authority",
    "expected_behaviour": "save",
    "best_posting_time": "Friday morning 7am-9am",
    "cta": "Full breakdown at Neeko Sports — link in bio"
  },
  "platform_variants": {
    "tiktok": {
      "hook": "Under 10 words naming at least one player or a bold take",
      "caption": "1-2 lines naming all 3 players with projections",
      "hashtags": ["#AFLFantasy", "#NeekoSports", "#AFL", "#FantasyTips", "#FantasyFootball"],
      "cta": "Full breakdown — link in bio."
    },
    "instagram": {
      "hook": "Bold ranking statement under 15 words",
      "caption": "Multi-line caption with #1 #2 #3 each on own line with projection",
      "hashtags": ["#AFLFantasy", "#NeekoSports", "#AFL", "#FantasyFootball", "#AFLFantasyTips", "#AFLRound1"],
      "carousel": [
        "Slide 1: TOP 3 PICKS THIS ROUND — Save This",
        "Slide 2: #1 ${p1.player_name} — ${Math.round(p1.projection)}pts projected",
        "Slide 3: #2 ${p2.player_name} — ${Math.round(p2.projection)}pts projected | #3 ${p3.player_name} — ${Math.round(p3.projection)}pts projected",
        "Slide 4: Full analysis at Neeko Sports — link in bio"
      ]
    },
    "reddit": {
      "title": "[Data] My top 3 AFL Fantasy picks this round based on Neeko projections",
      "body": "3-5 sentences featuring all 3 players by name with their projections. Genuine community tone. End with a question about who others are picking."
    }
  },
  "ctas": [
    "Full breakdown at Neeko Sports — link in bio.",
    "Who are you picking? Drop your top 3 below 👇",
    "Save this before lockout. Full rankings — Neeko Sports."
  ],
  "conversion_score": 8.5,
  "confidence_label": "HIGH",
  "hook_score": 8.0,
  "hook_type": "Data-first"
}

angle_label must be one of: "Contrarian", "Value Edge", "Fear", "Proof", "Debate", "Breakout", "Captain Lock"
creative_style must be one of: pov_stadium, screen_proof, data_graphic, debate_post, reaction_take, comparison_reveal, countdown_urgency, narrative_arc
confidence_label must be one of: HIGH, MEDIUM, LOW
hook_type must be one of: Controversy, Fear, Data-first, Contrarian, Challenge, Identity, Narrative
conversion_score must be a number 1.0 to 10.0
hook_score must be a number 1.0 to 10.0

REMINDER: voice_script MUST follow the exact #1/#2/#3 format with Projection, Ceiling, Why per player. No exceptions.`;
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);

  try {
    console.log("[generate-content-post] Calling OpenAI...");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        temperature: 0.88,
        max_tokens: 3500,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenAI");

    return JSON.parse(content);
  } finally {
    clearTimeout(timeoutId);
  }
}

function ensureString(val: unknown): string {
  if (typeof val === "string") return val;
  if (val === null || val === undefined) return "";
  return String(val);
}

function normaliseGeneratedPost(
  raw: Record<string, unknown>,
  playerName: string,
  category: string,
  team: string,
  dayKey = "",
): Record<string, unknown> {
  const hooks: string[] = Array.isArray(raw.hooks)
    ? (raw.hooks as unknown[]).map(h => ensureString(h)).filter(Boolean)
    : [`${category} alert: ${playerName} is your edge this round.`, `Everyone's sleeping on ${playerName}.`, `${playerName} — the data is clear.`];

  const rawCtas = Array.isArray(raw.ctas)
    ? (raw.ctas as unknown[]).map(c => ensureString(c)).filter(Boolean)
    : [];
  const ctas = rawCtas.length >= 3 ? rawCtas.slice(0, 3) : [
    "Get the full analysis at Neeko Sports — link in bio.",
    "Drop your take below 👇",
    "Save this before the price changes. Full rankings — Neeko Sports.",
  ];

  const validConfidence = ["HIGH", "MEDIUM", "LOW"];
  const rawConf = ensureString(raw.confidence_label ?? raw.confidence ?? "");
  const confidence_label = validConfidence.includes(rawConf) ? rawConf : "MEDIUM";

  const validAngleLabels = ["Contrarian", "Value Edge", "Fear", "Proof", "Debate", "Breakout", "Captain Lock"];
  const rawAngleLabel = ensureString(raw.angle_label ?? "");
  const angle_label = validAngleLabels.includes(rawAngleLabel) ? rawAngleLabel : "Value Edge";

  const validCreativeStyles = ["pov_stadium", "screen_proof", "data_graphic", "debate_post", "reaction_take", "comparison_reveal", "countdown_urgency", "narrative_arc"];
  const rawStyle = ensureString(raw.creative_style ?? "");
  const creative_style = validCreativeStyles.includes(rawStyle) ? rawStyle : "data_graphic";

  const validHookTypes = ["Controversy", "Fear", "Data-first", "Contrarian", "Challenge", "Identity", "Narrative"];
  const rawHookType = ensureString(raw.hook_type ?? "");
  const hook_type = validHookTypes.includes(rawHookType) ? rawHookType : "Data-first";

  const convScore = Number(raw.conversion_score ?? 0);
  const conversion_score = convScore >= 1 && convScore <= 10 ? Math.round(convScore * 10) / 10 : 6.5;

  const hookScoreRaw = Number(raw.hook_score ?? 0);
  const hook_score = hookScoreRaw >= 1 && hookScoreRaw <= 10 ? Math.round(hookScoreRaw * 10) / 10 : 6.5;

  const strategyJson = buildStrategy(category, dayKey, playerName);

  const platformVariants = normalisePlatformVariants(raw, playerName, category, team);

  return {
    hooks,
    voice_script: ensureString(raw.voice_script ?? raw.full_script ?? ""),
    caption_script: ensureString(raw.caption_script ?? raw.caption ?? ""),
    visual_plan: ensureString(raw.visual_plan ?? ""),
    ai_image_prompt: ensureString(raw.ai_image_prompt ?? raw.image_prompt ?? ""),
    ai_video_prompt: ensureString(raw.ai_video_prompt ?? raw.video_prompt ?? ""),
    creative_style,
    angle_label,
    confidence_label,
    hook_score,
    hook_type,
    conversion_score,
    strategy_json: strategyJson,
    platform_variants: platformVariants,
    ctas,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${serviceKey}` } },
      db: { schema: "public" },
    });

    const aflDb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${serviceKey}` } },
      db: { schema: "afl" },
    });

    const aiDb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${serviceKey}` } },
      db: { schema: "ai" },
    });

    const body = await req.json().catch(() => ({}));
    const postId = body?.post_id;

    if (!postId) {
      return new Response(
        JSON.stringify({ error: "post_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[generate-content-post] Generating post ${postId}`);

    const { data: postRow, error: postError } = await db
      .from("weekly_content_posts")
      .select("*")
      .eq("id", postId)
      .maybeSingle();

    if (postError || !postRow) {
      return new Response(
        JSON.stringify({ error: `Post not found: ${postError?.message ?? "no row"}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (postRow.locked) {
      return new Response(
        JSON.stringify({ error: "Post is locked", post: postRow }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await db
      .from("weekly_content_posts")
      .update({ status: "generating", error_message: null, updated_at: new Date().toISOString() })
      .eq("id", postId);

    const typedPost = postRow as PostRow;

    // SECTION 6: Guard — category must exist
    if (!typedPost.category || typedPost.category.trim() === "") {
      console.error(`[generate-content-post] Post ${postId} has no category — cannot generate`);
      await db
        .from("weekly_content_posts")
        .update({ status: "error", error_message: "Missing category — invalid post input", updated_at: new Date().toISOString() })
        .eq("id", postId);
      return new Response(
        JSON.stringify({ error: "Missing category — invalid post input", post_id: postId }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // SECTION 4: Debug logging
    console.log(`[generate-content-post] Creating post:`, {
      post_id: postId,
      category: typedPost.category,
      player_id: typedPost.player_id,
      player_name: typedPost.player_name,
    });

    const isTop3 = typedPost.category === "Top3";
    const top3Players = isTop3 && Array.isArray(typedPost.top3_players) && (typedPost.top3_players as Top3Player[]).length >= 3
      ? typedPost.top3_players as Top3Player[]
      : null;

    if (isTop3 && !top3Players) {
      console.error(`[generate-content-post] Top3 post ${postId} has invalid top3_players (null or < 3 entries) — cannot generate`);
      await db
        .from("weekly_content_posts")
        .update({ status: "error", error_message: "Top3 post missing valid top3_players array (need >= 3 players)", updated_at: new Date().toISOString() })
        .eq("id", postId);
      return new Response(
        JSON.stringify({ error: "Top3 post missing valid top3_players array", post_id: postId }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const category = typedPost.category;

    // SECTION 3 & 5: Unified contentPayload — single source of truth, never TBD/Unknown
    // If player_name is missing, we cannot generate meaningful content — abort with error
    if (!isTop3 && (!typedPost.player_name || typedPost.player_name.trim() === "" || typedPost.player_name === "TBD")) {
      console.error(`[generate-content-post] Post ${postId} has no valid player_name — cannot generate`);
      await db
        .from("weekly_content_posts")
        .update({ status: "error", error_message: "No valid player assigned to this post", updated_at: new Date().toISOString() })
        .eq("id", postId);
      return new Response(
        JSON.stringify({ error: "No valid player assigned to this post", post_id: postId }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const playerName = typedPost.player_name ?? "";
    const team = typedPost.team ?? "";

    const apiKey = Deno.env.get("OPENAI_API_KEY");

    // ── Top3 path ─────────────────────────────────────────────────────────────
    if (isTop3 && top3Players) {
      console.log(`[generate-content-post] Top3 path for post ${postId} — ${top3Players.map(p => p.player_name).join(", ")}`);

      if (!apiKey) {
        const fallbackPlatforms = buildEmptyTop3Platforms(top3Players);
        const p1 = top3Players[0];
        const p2 = top3Players[1];
        const p3 = top3Players[2];
        const fallback = {
          hooks: [
            `Top 3 picks this round — ${p1.player_name}, ${p2.player_name}, ${p3.player_name}.`,
            `The data has spoken — my top 3 AFL Fantasy picks.`,
            `${p1.player_name} is my #1 pick this round. Here's why.`,
          ],
          voice_script: `Top 3 Picks This Week 👇\n\n#1 ${p1.player_name}\nProjection: ${Math.round(p1.projection)}pts\nCeiling: ${Math.round(p1.ceiling)}pts\nWhy: Top projection in the pool with strong value score.\n\n#2 ${p2.player_name}\nProjection: ${Math.round(p2.projection)}pts\nCeiling: ${Math.round(p2.ceiling)}pts\nWhy: High ceiling upside with favourable matchup.\n\n#3 ${p3.player_name}\nProjection: ${Math.round(p3.projection)}pts\nCeiling: ${Math.round(p3.ceiling)}pts\nWhy: Consistent performer with value backing. Full breakdown at Neeko Sports — link in bio.`,
          caption_script: `Top 3 AFL Fantasy picks this round:\n#1 ${p1.player_name} — ${Math.round(p1.projection)}pts\n#2 ${p2.player_name} — ${Math.round(p2.projection)}pts\n#3 ${p3.player_name} — ${Math.round(p3.projection)}pts\n\nFull analysis at Neeko Sports — link in bio.\n\n#AFLFantasy #NeekoSports #AFL`,
          visual_plan: `Stack layout — dark #0D0D0D background. Row 1: GOLD badge #1 + ${p1.player_name} (${p1.team}) + ${Math.round(p1.projection)}pts projection. Row 2: SILVER badge #2 + ${p2.player_name} (${p2.team}) + ${Math.round(p2.projection)}pts projection. Row 3: BRONZE badge #3 + ${p3.player_name} (${p3.team}) + ${Math.round(p3.projection)}pts projection. Header: 'TOP 3 PICKS THIS ROUND'. Neeko Sports logo bottom-right.`,
          ai_image_prompt: `Style: ESPN Fox Sports graphic. Top 3 AFL Fantasy rank cards stacked on dark #0D0D0D. Row 1 GOLD: ${p1.player_name} ${Math.round(p1.projection)}pts. Row 2 SILVER: ${p2.player_name} ${Math.round(p2.projection)}pts. Row 3 BRONZE: ${p3.player_name} ${Math.round(p3.projection)}pts. Text overlay: 'TOP 3 THIS ROUND'. Neeko Sports logo bottom-right.`,
          ai_video_prompt: `Scene 1 (0-4s): 'TOP 3 PICKS' slams in gold flash. Scene 2 (4-16s): Cards reveal — #1 ${p1.player_name}, #2 ${p2.player_name}, #3 ${p3.player_name} count-up. Scene 3 (16-22s): All 3 cards green flash, Neeko logo, 'link in bio'.`,
          creative_style: "data_graphic",
          angle_label: "Value Edge",
          confidence_label: "HIGH",
          hook_score: 7.5,
          hook_type: "Data-first",
          conversion_score: 8.0,
          strategy_json: {
            goal: "Drive saves and profile visits",
            trigger: "Authority and FOMO",
            expected_behaviour: "save",
            best_posting_time: "Friday 7am-9am",
            cta: "Full breakdown at Neeko Sports — link in bio",
          },
          platform_variants: fallbackPlatforms,
          ctas: [
            "Full breakdown at Neeko Sports — link in bio.",
            "Who are you picking? Drop below 👇",
            "Save this before lockout.",
          ],
        };

        await db
          .from("weekly_content_posts")
          .update({ ...fallback, status: "ready", updated_at: new Date().toISOString() })
          .eq("id", postId);

        const { data: updatedPost } = await db
          .from("weekly_content_posts")
          .select("*")
          .eq("id", postId)
          .maybeSingle();

        console.log(`[generate-content-post] Top3 fallback (no API key) generated for post ${postId}`);
        return new Response(
          JSON.stringify({ post: updatedPost }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildTop3UserPrompt(typedPost, top3Players);

      let rawResult: Record<string, unknown>;
      let normalised: Record<string, unknown>;

      try {
        rawResult = await callOpenAI(systemPrompt, userPrompt);
        normalised = normaliseGeneratedPost(rawResult, top3Players[0].player_name, "Top3", top3Players[0].team, typedPost.day_key);

        const platforms = normalised.platform_variants as PlatformVariants;
        if (isPlatformEmpty(platforms)) {
          console.warn(`[generate-content-post] Top3 platform fields empty for ${postId}, retrying...`);
          try {
            const retryResult = await callOpenAI(systemPrompt, userPrompt);
            const retryNormalised = normaliseGeneratedPost(retryResult, top3Players[0].player_name, "Top3", top3Players[0].team, typedPost.day_key);
            const retryPlatforms = retryNormalised.platform_variants as PlatformVariants;
            if (!isPlatformEmpty(retryPlatforms)) {
              normalised = retryNormalised;
            } else {
              normalised = { ...retryNormalised, platform_variants: buildEmptyTop3Platforms(top3Players) };
            }
          } catch (_retryErr) {
            normalised = { ...normalised, platform_variants: buildEmptyTop3Platforms(top3Players) };
          }
        }
      } catch (genErr) {
        const errMsg = genErr instanceof Error ? genErr.message : String(genErr);
        console.error(`[generate-content-post] Top3 generation failed for ${postId}:`, errMsg);
        await db
          .from("weekly_content_posts")
          .update({ status: "error", error_message: errMsg.slice(0, 500), updated_at: new Date().toISOString() })
          .eq("id", postId);
        return new Response(
          JSON.stringify({ error: "Top3 generation failed", post_id: postId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await db
        .from("weekly_content_posts")
        .update({ ...normalised, status: "ready", updated_at: new Date().toISOString() })
        .eq("id", postId);

      const { data: updatedPost } = await db
        .from("weekly_content_posts")
        .select("*")
        .eq("id", postId)
        .maybeSingle();

      console.log(`[generate-content-post] Top3 success for post ${postId}`);
      return new Response(
        JSON.stringify({ post: updatedPost }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Standard single-player path ───────────────────────────────────────────
    let playerData: PlayerCache | null = null;
    if (typedPost.player_id) {
      const { data: pd } = await aflDb
        .from("player_rankings_cache")
        .select("*")
        .eq("player_id", typedPost.player_id)
        .maybeSingle();
      playerData = pd ?? null;
    }

    let player2Data: PlayerCache | null = null;
    if (typedPost.player2_id) {
      const { data: pd2 } = await aflDb
        .from("player_rankings_cache")
        .select("*")
        .eq("player_id", typedPost.player2_id)
        .maybeSingle();
      player2Data = pd2 ?? null;
    }

    // ── Injury guard — reject if no confirmed injury status ───────────────────
    if (typedPost.category === "Injury") {
      const confirmedOut =
        playerData?.player_status === "OUT" ||
        playerData?.manual_status === "OUT";
      if (!confirmedOut) {
        const reason = playerData
          ? `player_status="${playerData.player_status ?? "null"}", manual_status="${playerData.manual_status ?? "null"}"`
          : "no player data found in cache";
        console.error(`[generate-content-post] Injury guard: post ${postId} rejected — ${reason}`);
        await db
          .from("weekly_content_posts")
          .update({
            status: "error",
            error_message: `Injury post blocked: ${post.player_name ?? "player"} has no confirmed OUT status. Select a genuinely injured player before generating.`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", postId);
        return new Response(
          JSON.stringify({
            error: "Injury post blocked — no confirmed injury",
            detail: reason,
            post_id: postId,
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.log(`[generate-content-post] Injury guard passed for ${postId} — player_status=${playerData?.player_status}`);
    }

    let aiSummary: string = "No AI analysis available yet.";
    if (typedPost.player_id) {
      const { data: aiRow } = await aiDb
        .from("player_ai_analysis")
        .select("summary_long, summary_short, recommendation")
        .eq("player_id", typedPost.player_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (aiRow) {
        const parts = [aiRow.summary_long, aiRow.summary_short, aiRow.recommendation].filter(Boolean);
        if (parts.length > 0) aiSummary = parts.join("\n");
      }
    }

    // ── No API key — use structured fallback ─────────────────────────────────
    if (!apiKey) {
      const fallbackPlatforms = buildEmptyPlatforms(playerName, category, team);
      const fallback = {
        hooks: [
          `${playerName} is undervalued right now — the data proves it.`,
          `Everyone's sleeping on ${playerName} this round.`,
          `${category} alert: ${playerName} is your edge this week.`,
        ],
        voice_script: `${playerName} is one of the most interesting ${category} options this round. The data backs it up — and Neeko Sports has the full breakdown. Link in bio.`,
        caption_script: `${category} pick of the week: ${playerName} (${team}).\n\nCheck the full analysis at Neeko Sports — link in bio.\n\n#AFLFantasy #NeekoSports #AFL`,
        visual_plan: `Scene 1 (0-3s): Bold text overlay "${playerName}" on dark background with green (#00C853) accent. Scene 2 (3-8s): Stats reveal — projection, value score, price. Scene 3 (8-15s): CTA — "Full analysis at Neeko Sports". Neeko logo bottom right.`,
        ai_image_prompt: `Style: ESPN sports editorial. Subject: ${playerName} (${team}), explosive action pose, team jersey. Camera: low angle. Lighting: dramatic stadium rim light. Composition: hero centre. Background: stadium crowd blur. Text overlay: "${playerName.split(" ")[1] ?? playerName} — ${category.toUpperCase()}". Stats bar: [price, projectionpts]. Colour palette: dark #0D0D0D, team primary, #00C853. Mood: urgent. Brand: Neeko Sports logo bottom-right.`,
        ai_video_prompt: `Scene 1 (0-4s): Text "${playerName}" slams in on dark background, green #00C853 flash, fast zoom. Scene 2 (4-14s): Stats count up — projection, price, value score — player graphic slides in from right. Scene 3 (14-20s): CTA end card — Neeko Sports logo pulses green, "Link in bio" in bold white. Fade to black.`,
        creative_style: "data_graphic",
        angle_label: "Value Edge",
        confidence_label: "MEDIUM",
        hook_score: 6.5,
        hook_type: "Data-first",
        conversion_score: 6.5,
        strategy_json: {
          goal: "Drive profile visits and saves",
          trigger: "FOMO",
          expected_behaviour: "save",
          best_posting_time: "8am-9am weekday",
          cta: "Link in bio",
        },
        platform_variants: fallbackPlatforms,
        ctas: [
          "Get the full analysis at Neeko Sports — link in bio.",
          "Drop your take below 👇",
          "Save this before the price changes. Full rankings — Neeko Sports.",
        ],
      };

      await db
        .from("weekly_content_posts")
        .update({ ...fallback, status: "ready", updated_at: new Date().toISOString() })
        .eq("id", postId);

      const { data: updatedPost } = await db
        .from("weekly_content_posts")
        .select("*")
        .eq("id", postId)
        .maybeSingle();

      console.log(`[generate-content-post] Fallback (no API key) generated for post ${postId}`);
      return new Response(
        JSON.stringify({ post: updatedPost }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── OpenAI generation with retry ─────────────────────────────────────────
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(typedPost, playerData, player2Data, aiSummary);

    let rawResult: Record<string, unknown>;
    let normalised: Record<string, unknown>;

    try {
      rawResult = await callOpenAI(systemPrompt, userPrompt);
      normalised = normaliseGeneratedPost(rawResult, playerName, category, team, typedPost.day_key);

      // ── Retry if platforms are empty ───────────────────────────────────────
      const platforms = normalised.platform_variants as PlatformVariants;
      if (isPlatformEmpty(platforms)) {
        console.warn(`[generate-content-post] Platform fields empty for ${postId}, retrying...`);
        try {
          const retryResult = await callOpenAI(systemPrompt, userPrompt);
          const retryNormalised = normaliseGeneratedPost(retryResult, playerName, category, team, typedPost.day_key);
          const retryPlatforms = retryNormalised.platform_variants as PlatformVariants;

          if (!isPlatformEmpty(retryPlatforms)) {
            normalised = retryNormalised;
            console.log(`[generate-content-post] Retry succeeded for ${postId}`);
          } else {
            const filled = buildEmptyPlatforms(playerName, category, team);
            const merged: PlatformVariants = {
              tiktok: {
                hook: retryPlatforms.tiktok.hook || filled.tiktok.hook,
                caption: retryPlatforms.tiktok.caption || filled.tiktok.caption,
                hashtags: retryPlatforms.tiktok.hashtags.length > 0 ? retryPlatforms.tiktok.hashtags : filled.tiktok.hashtags,
                cta: retryPlatforms.tiktok.cta || filled.tiktok.cta,
              },
              instagram: {
                hook: retryPlatforms.instagram.hook || filled.instagram.hook,
                caption: retryPlatforms.instagram.caption || filled.instagram.caption,
                hashtags: retryPlatforms.instagram.hashtags.length > 0 ? retryPlatforms.instagram.hashtags : filled.instagram.hashtags,
                carousel: retryPlatforms.instagram.carousel.length > 0 ? retryPlatforms.instagram.carousel : filled.instagram.carousel,
              },
              reddit: {
                title: retryPlatforms.reddit.title || filled.reddit.title,
                body: retryPlatforms.reddit.body || filled.reddit.body,
              },
            };
            normalised = { ...retryNormalised, platform_variants: merged };
            console.warn(`[generate-content-post] Used merged fallback platforms for ${postId}`);
          }
        } catch (retryErr) {
          console.error(`[generate-content-post] Retry failed for ${postId}:`, retryErr);
          const filled = buildEmptyPlatforms(playerName, category, team);
          normalised = { ...normalised, platform_variants: filled };
        }
      }
    } catch (genErr) {
      const errMsg = genErr instanceof Error ? genErr.message : String(genErr);
      console.error(`[generate-content-post] Generation failed for ${postId}:`, errMsg);

      try {
        console.log(`[generate-content-post] Attempting recovery generation for ${postId}...`);
        const recoveryResult = await callOpenAI(systemPrompt, userPrompt);
        normalised = normaliseGeneratedPost(recoveryResult, playerName, category, team, typedPost.day_key);
        console.log(`[generate-content-post] Recovery succeeded for ${postId}`);
      } catch (_recoveryErr) {
        await db
          .from("weekly_content_posts")
          .update({
            status: "error",
            error_message: errMsg.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", postId);

        return new Response(
          JSON.stringify({ error: "Generation failed after retry", post_id: postId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    await db
      .from("weekly_content_posts")
      .update({
        ...normalised,
        status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);

    const { data: updatedPost } = await db
      .from("weekly_content_posts")
      .select("*")
      .eq("id", postId)
      .maybeSingle();

    console.log(`[generate-content-post] Success for post ${postId}`);
    return new Response(
      JSON.stringify({ post: updatedPost }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[generate-content-post] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: "Request failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
