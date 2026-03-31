import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai@4";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STORAGE_BUCKET   = "content-assets";
const IMAGE_CATEGORIES = ["stadium", "crowd", "field", "abstract", "players", "lights"] as const;
const VIDEO_CATEGORIES = ["stadium", "crowd", "field", "abstract", "players", "lights"] as const;
type ImageCategory = typeof IMAGE_CATEGORIES[number];
type VideoCategory = typeof VIDEO_CATEGORIES[number];

// ─── Target counts (fill-to-target mode) ─────────────────────────────────────

const IMAGE_COUNTS: Record<ImageCategory, number> = {
  stadium: 30, crowd: 30, field: 30, abstract: 30, players: 30, lights: 30,
};
const VIDEO_COUNTS: Record<VideoCategory, number> = {
  stadium: 5, crowd: 4, field: 3, abstract: 4, players: 4, lights: 4,
};

// ─── Batch5 mode: always generate exactly this many new images per category ───
const BATCH5_COUNT = 5;

// ─── Safety limits ────────────────────────────────────────────────────────────

const MAX_GENERATION = 200;
const BATCH_SIZE     = 4;
const BATCH_DELAY_MS = 500;

// ─── AFL STADIUM MASTER PROMPT — no goalposts, real venue references ──────────

const AFL_STADIUM_GLOBAL_BASE = [
  "Ultra realistic Australian Rules Football stadium",
  "Oval shaped AFL field with centre circle and centre square markings clearly visible",
  "Massive Australian football stadium filled with spectators",
  "Photorealistic lighting, ultra detailed turf, realistic crowd",
  "Broadcast quality sports photography",
  "Goal posts are NOT visible in the frame — camera angle excludes both ends of the field",
  "photorealistic, ultra detailed, 8k sports photography, broadcast camera quality, realistic stadium lighting, cinematic sports lighting, realistic grass texture, high detail crowd",
].join(". ");

const AFL_NEGATIVE = [
  "no goalposts", "no goal posts", "no posts", "no rugby goalposts", "no soccer goals",
  "no American football markings", "no rectangular field",
  "no soccer field", "no rectangular pitch", "no goal nets",
  "no rugby posts", "no NFL field", "no text", "no watermarks", "no logos",
].join(", ");

// ─── 30 unique AFL stadium scene prompts — no goalposts, real venue references ─

const AFL_STADIUM_SCENES = [
  // 1 — MCG midfield broadcast
  "Ultra realistic AFL stadium similar to the Melbourne Cricket Ground. Massive multi-tier grandstand bowl. Camera from the grandstand looking across the centre circle and centre square. Golden afternoon lighting. Packed spectators. Goal ends completely out of frame. Midfield focus only.",
  // 2 — Marvel Stadium night game
  "Ultra realistic AFL stadium similar to Marvel Stadium with a modern retractable roof structure. Night match under bright floodlights. Camera looking across the midfield oval area. Packed crowd visible under glowing roof structure. Goal ends not visible. Photorealistic broadcast sports photography.",
  // 3 — Optus Stadium aerial midfield
  "Ultra realistic AFL stadium inspired by Optus Stadium in Perth. High aerial drone view showing the oval stadium bowl from above. Centre circle and centre square visible in the midfield. Sunset lighting reflecting off the modern stadium architecture. Goal ends not in frame. 8k photorealistic.",
  // 4 — Adelaide Oval sunset midfield
  "Ultra realistic AFL stadium similar to Adelaide Oval with recognisable heritage scoreboard architecture. Golden sunset lighting across the centre square. Camera positioned from the wing looking across midfield. Packed crowd atmosphere. Goal posts not visible in frame.",
  // 5 — Gabba rainy night
  "Ultra realistic AFL stadium inspired by the Gabba in Brisbane. Rain falling under bright stadium floodlights. Wet reflective turf around the centre circle. Crowd under stadium roof. Camera looking across the midfield. Goal ends not visible in frame.",
  // 6 — Sydney Cricket Ground broadcast
  "Ultra realistic AFL stadium similar to the Sydney Cricket Ground. Camera from grandstand looking toward midfield. Historic colonial-era stadium architecture with modern seating. Large oval field with centre circle visible. Camera angle excludes both goal ends.",
  // 7 — GMHBA Stadium close midfield
  "Ultra realistic AFL stadium similar to GMHBA Stadium in Geelong with a close intimate oval atmosphere. Camera near boundary line looking across midfield. Packed crowd cheering. Detailed turf and stadium seating. Goal ends outside frame.",
  // 8 — MCG grand final atmosphere
  "Ultra realistic MCG-scale AFL stadium completely packed for a grand final. Broadcast camera angle from high grandstand. Confetti falling across the stadium bowl. Centre field brightly lit. Camera frame captures only midfield, not the goal ends.",
  // 9 — Marvel Stadium roof interior
  "Ultra realistic modern oval stadium similar to Marvel Stadium from inside. Dramatic roof structure framing the sky above the oval. Camera angle shows midfield and the grandstand structure. Floodlit night atmosphere. No goal ends visible.",
  // 10 — Optus Stadium blue dusk
  "Ultra realistic Optus Stadium-inspired AFL venue at blue dusk. Stadium lights illuminating the oval. Deep blue sky above the modern architecture. Camera framed on midfield and the grandstand bowl. Goal ends excluded from frame.",
  // 11 — Adelaide Oval overcast morning
  "Ultra realistic Adelaide Oval-inspired AFL stadium on an overcast grey morning. Camera from the riverbank grandstand side. Soft diffused light across the oval. Heritage scoreboard architecture visible in background. Centre circle and midfield in focus. No goalposts in frame.",
  // 12 — Gabba afternoon broadcast
  "Ultra realistic Gabba-inspired AFL stadium in afternoon sunlight. Broadcast camera positioned high in the grandstand looking across the oval. Tropical blue sky above. Fully packed crowd. Midfield in focus. Goal ends outside camera frame.",
  // 13 — SCG historic atmosphere
  "Ultra realistic SCG-inspired AFL stadium with historic sandstone grandstand architecture. Camera from the Members Stand looking across the midfield. Heritage and modern architecture side by side. Afternoon light across the turf. No goal posts in frame.",
  // 14 — MCG rainy night match
  "Ultra realistic MCG-inspired AFL stadium in heavy rain at night. Floodlights blazing across wet turf. Raindrops catching stadium light. Camera from mid-grandstand looking across midfield. Crowd under stadium roof. Goal ends not visible.",
  // 15 — Marvel Stadium crowd energy
  "Ultra realistic Marvel Stadium-inspired oval stadium with electric crowd energy. Camera from behind the boundary fence looking across midfield. Fans on their feet cheering. Modern stadium architecture all around. Goal ends outside frame.",
  // 16 — Optus Stadium golden afternoon
  "Ultra realistic Optus Stadium-inspired AFL venue in golden afternoon light. Camera from the wing grandstand looking across the oval centre circle. Highly detailed turf with AFL markings. Swan River visible beyond the stadium in the background. No goalposts in frame.",
  // 17 — Adelaide Oval twilight
  "Ultra realistic Adelaide Oval-inspired AFL stadium at twilight. Stadium lights beginning to activate against a deep orange sky. Camera positioned from the Cathedral End grandstand looking toward midfield. No goal ends visible in frame.",
  // 18 — Gabba fog
  "Ultra realistic Gabba-inspired AFL stadium with early morning fog rolling across the oval. Camera from the Clem Jones Stand looking across midfield. Grass glistening with dew. Soft atmospheric light. Goal ends outside frame.",
  // 19 — MCG empty training
  "Ultra realistic MCG-inspired AFL stadium empty during a morning training session. Camera from ground level near the centre circle. Highly detailed turf. Empty grandstands in the background. No goalposts visible.",
  // 20 — Marvel Stadium matchday warmup
  "Ultra realistic Marvel Stadium-inspired AFL stadium with players warming up on the oval. Camera from the elevated grandstand looking across midfield. Stadium beginning to fill with spectators. Roof structure visible above. Goal ends not in frame.",
  // 21 — SCG sunset broadcast
  "Ultra realistic SCG-inspired AFL stadium in golden sunset light. Broadcast camera angle from the Doug Walters Stand looking toward the centre circle. Long shadows from the grandstand across the turf. Goal ends outside frame.",
  // 22 — Optus Stadium fireworks night
  "Ultra realistic Optus Stadium-inspired AFL stadium at night with fireworks exploding above the venue. Camera looking across the midfield from the grandstand. Floodlit oval below the bursting fireworks. Goal ends not visible.",
  // 23 — Adelaide Oval stormy atmosphere
  "Ultra realistic Adelaide Oval-inspired AFL stadium with dramatic storm clouds building above. Wind whipping banners in the crowd. Floodlights beginning to activate against the dark sky. Camera focused on midfield. No goalposts in frame.",
  // 24 — Gabba electric crowd
  "Ultra realistic Gabba-inspired AFL stadium with an electric sold-out crowd atmosphere. Camera from the upper grandstand. Fans waving team colours across the packed bowl. Night match under floodlights. Midfield visible below. No goal ends in frame.",
  // 25 — MCG aerial oval overview
  "Ultra realistic MCG-inspired AFL stadium from a high aerial perspective. Oval turf below with AFL markings clearly visible. Massive multi-tier grandstands surrounding the oval. Camera captures midfield area only, both goal ends outside frame.",
  // 26 — Marvel Stadium corporate rooftop
  "Ultra realistic Marvel Stadium-inspired AFL stadium from the elevated club deck looking down across the oval. Corporate crowd watching. Modern stadium architecture. Night match atmosphere. Midfield in focus. No goal ends visible.",
  // 27 — SCG heritage mix
  "Ultra realistic SCG-inspired AFL stadium showing the contrast between heritage sandstone stands and modern facilities. Afternoon match. Camera looking across centre square. Classic atmosphere. No goalposts in frame.",
  // 28 — Optus Stadium drone midfield
  "Ultra realistic Optus Stadium-inspired AFL stadium from drone camera height above midfield. Oval field visible below with AFL markings. Modern architectural grandstands. Camera excludes both goal ends.",
  // 29 — Adelaide Oval River Torrens view
  "Ultra realistic Adelaide Oval-inspired AFL stadium with the River Torrens and park lands visible beyond the open ends of the ground. Camera from the Riverbank Stand looking across midfield. Afternoon sun. Heritage scoreboard architecture. No goalposts in frame.",
  // 30 — MCG night broadcast wide
  "Ultra realistic MCG-inspired AFL stadium in a wide broadcast shot from the highest grandstand tier. Entire stadium bowl visible under full floodlights. Packed 90000 seat crowd. Midfield and centre circle visible. Both goal ends deliberately outside frame.",
];

const CROWD_STATES = [
  "massive AFL crowd cheering inside stadium",
  "fans waving team colours at AFL match",
  "packed stadium stands night match",
  "AFL crowd celebration moment stadium erupting",
  "stadium roar moment during AFL match",
  "sea of fans waving scarves in unison",
  "50000 fans packed AFL stadium",
];

const FIELD_SCENES = [
  "empty AFL oval field night under stadium lights",
  "perfect grass AFL oval broadcast camera angle",
  "centre field AFL stadium overhead broadcast view",
  "low fog over stadium grass AFL oval",
  "clean professional AFL oval field lighting",
  "AFL oval centre circle close-up stadium background",
];

const PLAYER_ACTIONS = [
  "Australian Rules Football player kicking ball mid action stadium crowd background",
  "AFL midfielder handball action sports photography stadium lights",
  "AFL ruck contest centre bounce dramatic lighting stadium crowd",
  "AFL mark contest high jump football catch silhouette stadium background",
  "AFL player running through stadium lights dynamic motion",
  "AFL player silhouette celebrating goal arms raised stadium crowd roaring",
  "Australian football player leaping for spectacular mark crowd background",
  "AFL player handpass in traffic stadium crowd backdrop",
];

const ABSTRACT_STYLES = [
  "sports broadcast graphic background gold and navy dynamic diagonal streaks",
  "dynamic stadium lighting abstract sports theme dark background cinematic glow",
  "professional sports graphic background broadcast style dark dramatic atmosphere",
  "dark blue and gold sports broadcast template background premium digital aesthetic",
  "cinematic sports graphics abstract motion blur dark field textures",
  "dark sports broadcast background stadium lighting glow subtle turf textures stats overlay style",
  "abstract sports data visualisation glowing geometric lines dynamic motion broadcast aesthetic",
];

const VIDEO_SCENES = [
  "cinematic aerial shot flying into massive AFL stadium at night bright stadium lights cheering crowd loopable broadcast",
  "slow motion tunnel entrance walk onto AFL oval field under stadium lights cinematic broadcast intro loopable",
  "crowd stadium wave moment during AFL match night game packed stands slow motion broadcast loopable",
  "broadcast camera sweeping across packed AFL stadium cinematic sports coverage loopable",
  "stadium lights turning on before AFL night match dramatic floodlight activation broadcast quality loopable",
  "golden sunset AFL stadium wide aerial shot cinematic broadcast loopable",
  "crowd cheering slow motion stadium atmosphere AFL match broadcast close-up cinematic loopable",
  "centre bounce moment AFL match dramatic stadium lighting broadcast angle cinematic loopable",
  "rain falling over AFL stadium during match wet field glistening cinematic atmosphere loopable",
  "foggy stadium lights glowing over AFL oval misty night atmosphere broadcast style loopable",
];

const LIGHTING = [
  "cinematic LED floodlights",
  "golden sunset glow",
  "bright daylight broadcast lighting",
  "deep blue dusk with stadium glow",
  "dramatic overhead stadium floodlights",
];

const WEATHER = [
  "clear sky",
  "light rain",
  "misty evening",
  "dramatic storm clouds",
  "overcast grey sky",
];

const LIGHTS_SCENES = [
  "Massive AFL stadium floodlights blazing at full power. Camera looking up at the towering light towers from field level. Intense white LED beams cutting through the dark night sky. Photorealistic stadium lighting photography, no text, no logos",
  "Night match under full stadium floodlights. Camera positioned at ground level on the oval looking upward at the ring of bright lights surrounding the stadium bowl. Deep blue sky beyond. Broadcast quality, no text",
  "Close-up of stadium light tower structure with multiple LED flood panels. Industrial sports lighting architecture. Dark night sky background. Ultra detailed metallic structure with intense blazing light beams, no text, no logos",
  "Aerial view of a large oval AFL stadium at night with all floodlights operating. Oval field glowing vivid green below. Rings of white stadium lights visible from above. Cinematic drone photography, no text",
  "Pre-match stadium lights gradually activating in sequence. One by one the tall light towers switch on dramatically. Dark crowd silhouetted below. Dramatic atmosphere, cinematic sports photography, no text, no logos",
  "Single massive AFL floodlight tower photographed from directly below looking straight up. Blinding LED panels radiating intense white light against a pure black night sky. Ultra realistic, no text",
  "Stadium lights reflecting across wet oval turf after rain. Vivid green grass glistening. Multiple light pools overlapping across the field. Atmospheric night match scene, broadcast quality, no text",
  "Wide stadium bowl night shot. Every floodlight tower illuminated with full power. Crowd visible under the warm glow. Oval field perfectly lit. MCG-scale atmosphere. Photorealistic, no text, no logos",
  "Bokeh blur shot of AFL stadium floodlights in the background with the oval turf in sharp focus in the foreground. Dreamy cinematic depth of field. Warm light glowing above, no text",
  "Two tall AFL floodlight towers framing the shot on either side. Intense beams overlapping in the centre above the field. Dramatic symmetrical sports architecture photography at night, no text, no logos",
  "Silhouette of stadium light tower against a vivid sunset sky. Orange and gold sky behind the industrial structure. Long exposure blur on the lights starting to activate. Cinematic atmosphere, no text",
  "Stadium lights casting dramatic overlapping shadows across the oval grass. High contrast shadow and light patterns on the turf. Artistic sports photography perspective, no text, no logos",
  "Inside view of floodlight housing unit. Multiple LED panels up close. Industrial sports lighting technology photography. Dark background. Ultra sharp metallic detail, no text",
  "Night stadium exterior long exposure photograph. Light trails from cars outside. Stadium glowing from within with full floodlights blazing. Architectural sports venue photography, no text",
  "AFL stadium lights switching on just before a night match. Crowd in silhouette watching the lights activate. Dramatic moment. Atmospheric sports event photography, no text, no logos",
];

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
}
function pick<T>(arr: T[], rng: () => number): T { return arr[Math.floor(rng() * arr.length)]; }

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildImagePrompt(category: ImageCategory, seed: number, i: number): string {
  const rng    = seededRng(seed + i * 7919);
  const light  = pick(LIGHTING, rng);
  const wx     = pick(WEATHER, rng);

  switch (category) {
    case "stadium": {
      const sceneIndex = i % AFL_STADIUM_SCENES.length;
      const scene = AFL_STADIUM_SCENES[sceneIndex];
      return `${AFL_STADIUM_GLOBAL_BASE}. Scene: ${scene}. ${AFL_NEGATIVE}`;
    }
    case "crowd":
      return `${pick(CROWD_STATES, rng)}, AFL stadium, ${light}, ${wx}, dramatic broadcast sports photography, no text, no logos`;
    case "field":
      return `${pick(FIELD_SCENES, rng)}, ${light}, ${wx}, broadcast quality photography, no players, no text`;
    case "abstract":
      return `${pick(ABSTRACT_STYLES, rng)}, ${light}, no text, no logos`;
    case "players":
      return `${pick(PLAYER_ACTIONS, rng)}, ${light}, ${wx}, dramatic sports photography style, no text, no logos`;
    case "lights": {
      const sceneIndex = i % LIGHTS_SCENES.length;
      return LIGHTS_SCENES[sceneIndex];
    }
  }
}

function buildVideoPrompt(_category: VideoCategory, seed: number, i: number): string {
  const rng = seededRng(seed + i * 3571);
  return pick(VIDEO_SCENES, rng);
}

function promptHash(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

// ─── SSE ──────────────────────────────────────────────────────────────────────

function sseEvent(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

// ─── Delay ────────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function countExisting(
  adminClient: ReturnType<typeof createClient>,
  category: string,
  isVideo: boolean,
): Promise<number> {
  const { count } = await adminClient
    .from("ai_media_library")
    .select("*", { count: "exact", head: true })
    .eq("category", category)
    .eq("media_type", isVideo ? "video" : "image")
    .eq("source", "ai_generated")
    .eq("is_active", true);

  return count ?? 0;
}

async function isPathDeleted(
  adminClient: ReturnType<typeof createClient>,
  filePath: string,
): Promise<boolean> {
  const { data } = await adminClient
    .from("media_deleted_files")
    .select("id")
    .eq("file_path", filePath)
    .maybeSingle();
  return data !== null;
}

async function getDeletedPathsForCategory(
  adminClient: ReturnType<typeof createClient>,
  category: string,
  isVideo: boolean,
): Promise<Set<string>> {
  const { data } = await adminClient
    .from("media_deleted_files")
    .select("file_path")
    .eq("category", category)
    .eq("media_type", isVideo ? "video" : "image");
  return new Set((data ?? []).map((r: { file_path: string }) => r.file_path));
}

async function updateJob(
  adminClient: ReturnType<typeof createClient>,
  jobId: string,
  patch: Record<string, unknown>,
) {
  await adminClient.from("media_generation_jobs").update(patch).eq("id", jobId);
}

// ─── Generate images for one category ────────────────────────────────────────

async function generateImages(
  category: ImageCategory,
  targetCount: number,
  seed: number,
  openai: OpenAI,
  adminClient: ReturnType<typeof createClient>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  packId: string,
  jobId: string,
  generationCounter: { total: number },
  categoryProgress: Record<string, { generated: number; failed: number; target: number }>,
  forcedCount?: number,
): Promise<{ generated: number; failed: number; skipped: number }> {
  let generated = 0;
  let failed    = 0;

  const existingCount = await countExisting(adminClient, category, false);

  // In forced mode (batch5) always generate exactly forcedCount new images,
  // ignoring whether the fill-to-target quota has been reached.
  const remaining = forcedCount ?? Math.max(0, targetCount - existingCount);
  const displayTarget = forcedCount ? existingCount + forcedCount : targetCount;

  if (!forcedCount && existingCount >= targetCount) {
    await writer.write(sseEvent({
      phase: "images", category,
      message: `Skipping ${category} — already have ${existingCount}/${targetCount}`,
      generated: 0, total: targetCount, failed: 0, skipped: existingCount,
    }));
    return { generated: 0, failed: 0, skipped: existingCount };
  }

  categoryProgress[category] = { generated: existingCount, failed: 0, target: displayTarget };

  await writer.write(sseEvent({
    phase: "images", category,
    message: `Generating ${category} images — ${existingCount} existing, generating ${remaining} more`,
    generated: existingCount, total: displayTarget, failed: 0,
  }));

  let batchCount = 0;
  for (let i = 0; i < remaining; i++) {
    if (generationCounter.total >= MAX_GENERATION) {
      await writer.write(sseEvent({
        phase: "images", category,
        message: `Generation limit reached (${MAX_GENERATION}). Stopping.`,
        generated, total: remaining, failed,
      }));
      break;
    }

    try {
      const ts     = Date.now();
      const prompt = buildImagePrompt(category, seed, existingCount + i);
      const hash   = promptHash(prompt);

      const resp = await openai.images.generate({
        model: "dall-e-3", prompt, n: 1, size: "1792x1024", quality: "standard",
      });
      const imageUrl = resp.data?.[0]?.url;
      if (!imageUrl) throw new Error("No image URL returned");

      const buf         = await (await fetch(imageUrl)).arrayBuffer();
      const rand        = Math.random().toString(36).slice(2, 6);
      const filename    = `${category}-${ts}-${rand}.png`;
      const storagePath = `images/ai-generated/${category}/${filename}`;

      // Guard: skip if this exact path was manually deleted
      if (await isPathDeleted(adminClient, storagePath)) {
        await writer.write(sseEvent({
          phase: "images", category,
          message: `Skipping ${filename} — marked as deleted`,
          generated: existingCount + generated, total: displayTarget, failed,
        }));
        continue;
      }

      const { error: upErr } = await adminClient.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buf, { contentType: "image/png", upsert: true });
      if (upErr) throw new Error(upErr.message);

      const { data: urlData } = adminClient.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData?.publicUrl ?? "";

      await adminClient.from("ai_media_library").upsert({
        asset_id:      `ai-cat-${category}-${packId}-${existingCount + i}`,
        label:         `AI ${category.charAt(0).toUpperCase() + category.slice(1)} ${existingCount + i + 1}`,
        url:           publicUrl, thumbnail_url: publicUrl,
        media_type:    "image", category, sport: "AFL", source: "ai_generated",
        pack_id:       packId, is_active: true, sort_order: existingCount + i,
        metadata:      JSON.stringify({ prompt, prompt_hash: hash, seed, pack_index: existingCount + i, generated_at: new Date(ts).toISOString() }),
      }, { onConflict: "asset_id" });

      generated++;
      generationCounter.total++;
      batchCount++;
      categoryProgress[category].generated = existingCount + generated;

      await writer.write(sseEvent({
        phase: "images", category,
        message: `Generating ${category} images ${existingCount + generated} / ${displayTarget}`,
        generated: existingCount + generated, total: displayTarget, failed,
      }));

      await updateJob(adminClient, jobId, {
        generated_count: generationCounter.total,
        category_progress: categoryProgress,
      });

      if (batchCount >= BATCH_SIZE) {
        batchCount = 0;
        await writer.write(sseEvent({ phase: "batch", category, message: `Batch complete — pausing 500ms`, generated: existingCount + generated, total: displayTarget, failed }));
        await delay(BATCH_DELAY_MS);
      }
    } catch (err) {
      failed++;
      generationCounter.total++;
      categoryProgress[category].failed = (categoryProgress[category].failed ?? 0) + 1;
      console.error(`generate-category-media: image ${category}[${i}] error:`, err);
      await writer.write(sseEvent({
        phase: "images", category,
        message: `Failed: ${category} image ${i + 1} — ${err instanceof Error ? err.message : "unknown"}`,
        generated: existingCount + generated, total: displayTarget, failed,
      }));
    }
  }
  return { generated, failed, skipped: existingCount };
}

// ─── Generate video frames for one category ───────────────────────────────────

async function generateVideos(
  category: VideoCategory,
  targetCount: number,
  seed: number,
  openai: OpenAI,
  adminClient: ReturnType<typeof createClient>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  packId: string,
  jobId: string,
  generationCounter: { total: number },
  categoryProgress: Record<string, { generated: number; failed: number; target: number }>,
): Promise<{ generated: number; failed: number; skipped: number }> {
  let generated = 0;
  let failed    = 0;

  const key           = `video_${category}`;
  const existingCount = await countExisting(adminClient, category, true);
  if (existingCount >= targetCount) {
    await writer.write(sseEvent({
      phase: "videos", category,
      message: `Skipping ${category} videos — already have ${existingCount}/${targetCount}`,
      generated: 0, total: targetCount, failed: 0, skipped: existingCount,
    }));
    return { generated: 0, failed: 0, skipped: existingCount };
  }

  const remaining = targetCount - existingCount;
  categoryProgress[key] = { generated: existingCount, failed: 0, target: targetCount };

  await writer.write(sseEvent({
    phase: "videos", category,
    message: `Generating ${category} videos — ${existingCount} existing, need ${remaining} more`,
    generated: existingCount, total: targetCount, failed: 0,
  }));

  let batchCount = 0;
  for (let i = 0; i < remaining; i++) {
    if (generationCounter.total >= MAX_GENERATION) {
      await writer.write(sseEvent({
        phase: "videos", category,
        message: `Generation limit reached (${MAX_GENERATION}). Stopping.`,
        generated, total: remaining, failed,
      }));
      break;
    }

    try {
      const ts     = Date.now();
      const prompt = buildVideoPrompt(category, seed, existingCount + i);

      const resp = await openai.images.generate({
        model: "dall-e-3",
        prompt: `${prompt}, cinematic single frame broadcast quality`,
        n: 1, size: "1792x1024", quality: "standard",
      });
      const imageUrl = resp.data?.[0]?.url;
      if (!imageUrl) throw new Error("No image URL returned");

      const buf         = await (await fetch(imageUrl)).arrayBuffer();
      const rand        = Math.random().toString(36).slice(2, 6);
      const filename    = `${category}-video-${ts}-${rand}.png`;
      const storagePath = `videos/ai-generated/${category}/${filename}`;

      // Guard: skip if this exact path was manually deleted
      if (await isPathDeleted(adminClient, storagePath)) {
        await writer.write(sseEvent({
          phase: "videos", category,
          message: `Skipping ${filename} — marked as deleted`,
          generated: existingCount + generated, total: targetCount, failed,
        }));
        continue;
      }

      const { error: upErr } = await adminClient.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buf, { contentType: "image/png", upsert: true });
      if (upErr) throw new Error(upErr.message);

      const { data: urlData } = adminClient.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData?.publicUrl ?? "";

      await adminClient.from("ai_media_library").upsert({
        asset_id:      `ai-cat-video-${category}-${packId}-${existingCount + i}`,
        label:         `AI ${category.charAt(0).toUpperCase() + category.slice(1)} Video ${existingCount + i + 1}`,
        url:           publicUrl, thumbnail_url: publicUrl,
        media_type:    "video", category, sport: "AFL", source: "ai_generated",
        pack_id:       packId, is_active: true, sort_order: existingCount + i,
        metadata:      JSON.stringify({ prompt, seed, pack_index: existingCount + i, generated_at: new Date(ts).toISOString(), note: "video_placeholder_image" }),
      }, { onConflict: "asset_id" });

      generated++;
      generationCounter.total++;
      batchCount++;
      categoryProgress[key].generated = existingCount + generated;

      await writer.write(sseEvent({
        phase: "videos", category,
        message: `Generating ${category} videos ${existingCount + generated} / ${targetCount}`,
        generated: existingCount + generated, total: targetCount, failed,
      }));

      await updateJob(adminClient, jobId, {
        generated_count: generationCounter.total,
        category_progress: categoryProgress,
      });

      if (batchCount >= BATCH_SIZE) {
        batchCount = 0;
        await writer.write(sseEvent({ phase: "batch", category, message: `Batch complete — pausing 500ms`, generated: existingCount + generated, total: targetCount, failed }));
        await delay(BATCH_DELAY_MS);
      }
    } catch (err) {
      failed++;
      generationCounter.total++;
      categoryProgress[key].failed = (categoryProgress[key].failed ?? 0) + 1;
      console.error(`generate-category-media: video ${category}[${i}] error:`, err);
      await writer.write(sseEvent({
        phase: "videos", category,
        message: `Failed: ${category} video ${i + 1} — ${err instanceof Error ? err.message : "unknown"}`,
        generated: existingCount + generated, total: targetCount, failed,
      }));
    }
  }
  return { generated, failed, skipped: existingCount };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const openaiKey   = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token || token !== serviceKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!openaiKey || !supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Missing environment configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body   = await req.json().catch(() => ({}));
    const target: string = body.target ?? "full";
    const seed   = Date.now();
    const packId = `cat-${target}-${seed}`;

    const adminClient = createClient(supabaseUrl, serviceKey);
    const openai      = new OpenAI({ apiKey: openaiKey });

    // ── Generation lock: block if a job is already running ────────────────────
    const { data: runningJobs } = await adminClient
      .from("media_generation_jobs")
      .select("id, target, started_at")
      .eq("status", "running")
      .limit(1);

    if (runningJobs && runningJobs.length > 0) {
      return new Response(
        JSON.stringify({ error: "Media generation already running", job: runningJobs[0] }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Calculate target count ─────────────────────────────────────────────────
    let totalTarget = 0;
    if (target === "full") {
      totalTarget = Object.values(IMAGE_COUNTS).reduce((a, b) => a + b, 0)
                  + Object.values(VIDEO_COUNTS).reduce((a, b) => a + b, 0);
    } else if (target === "batch5") {
      totalTarget = IMAGE_CATEGORIES.length * BATCH5_COUNT;
    } else if (target === "videos") {
      totalTarget = Object.values(VIDEO_COUNTS).reduce((a, b) => a + b, 0);
    } else if (IMAGE_CATEGORIES.includes(target as ImageCategory)) {
      totalTarget = IMAGE_COUNTS[target as ImageCategory];
    }

    // ── Create job record ─────────────────────────────────────────────────────
    const { data: jobData, error: jobErr } = await adminClient
      .from("media_generation_jobs")
      .insert({
        status:          "running",
        target,
        target_count:    totalTarget,
        generated_count: 0,
        failed_count:    0,
        category_progress: {},
        started_at:      new Date().toISOString(),
      })
      .select("id")
      .single();

    if (jobErr || !jobData) {
      return new Response(JSON.stringify({ error: "Failed to create generation job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const jobId = jobData.id;

    // ── SSE stream setup ──────────────────────────────────────────────────────
    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer                 = writable.getWriter();
    const generationCounter      = { total: 0 };
    const categoryProgress: Record<string, { generated: number; failed: number; target: number }> = {};

    EdgeRuntime.waitUntil((async () => {
      try {
        const results: Record<string, { generated: number; failed: number; skipped: number }> = {};

        await writer.write(sseEvent({
          phase: "start", job_id: jobId,
          message: `Starting AFL media generation — target: ${target}`,
          max_generation: MAX_GENERATION, batch_size: BATCH_SIZE,
        }));

        if (target === "full") {
          for (const cat of IMAGE_CATEGORIES) {
            if (generationCounter.total >= MAX_GENERATION) break;
            results[`img_${cat}`] = await generateImages(cat, IMAGE_COUNTS[cat], seed, openai, adminClient, writer, packId, jobId, generationCounter, categoryProgress);
          }
          for (const cat of VIDEO_CATEGORIES) {
            if (generationCounter.total >= MAX_GENERATION) break;
            results[`vid_${cat}`] = await generateVideos(cat, VIDEO_COUNTS[cat], seed, openai, adminClient, writer, packId, jobId, generationCounter, categoryProgress);
          }
        } else if (target === "batch5") {
          for (const cat of IMAGE_CATEGORIES) {
            if (generationCounter.total >= MAX_GENERATION) break;
            results[`img_${cat}`] = await generateImages(cat, IMAGE_COUNTS[cat], seed, openai, adminClient, writer, packId, jobId, generationCounter, categoryProgress, BATCH5_COUNT);
          }
        } else if (target === "videos") {
          for (const cat of VIDEO_CATEGORIES) {
            if (generationCounter.total >= MAX_GENERATION) break;
            results[`vid_${cat}`] = await generateVideos(cat, VIDEO_COUNTS[cat], seed, openai, adminClient, writer, packId, jobId, generationCounter, categoryProgress);
          }
        } else if (IMAGE_CATEGORIES.includes(target as ImageCategory)) {
          const cat = target as ImageCategory;
          results[`img_${cat}`] = await generateImages(cat, IMAGE_COUNTS[cat], seed, openai, adminClient, writer, packId, jobId, generationCounter, categoryProgress);
        } else {
          await writer.write(sseEvent({ phase: "error", message: `Unknown target: ${target}` }));
        }

        const totalGenerated = Object.values(results).reduce((a, r) => a + r.generated, 0);
        const totalFailed    = Object.values(results).reduce((a, r) => a + r.failed, 0);
        const totalSkipped   = Object.values(results).reduce((a, r) => a + r.skipped, 0);
        const limitReached   = generationCounter.total >= MAX_GENERATION;

        await updateJob(adminClient, jobId, {
          status:          "complete",
          generated_count: totalGenerated,
          failed_count:    totalFailed,
          category_progress: categoryProgress,
          completed_at:    new Date().toISOString(),
        });

        await writer.write(sseEvent({
          phase: "complete", job_id: jobId,
          message: limitReached
            ? `Generation limit reached (${MAX_GENERATION}). Generated: ${totalGenerated}`
            : `Generation complete. Generated: ${totalGenerated}, Failed: ${totalFailed}, Skipped: ${totalSkipped}`,
          target, results, total_generated: totalGenerated, total_failed: totalFailed,
          total_skipped: totalSkipped, limit_reached: limitReached,
        }));
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : "unknown";
        console.error("generate-category-media: inner error", innerErr);
        await updateJob(adminClient, jobId, { status: "failed", error_message: msg, completed_at: new Date().toISOString() });
        await writer.write(sseEvent({ phase: "error", message: `Fatal error: ${msg}` }));
      } finally {
        await writer.close();
      }
    })());

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
    });

  } catch (err) {
    console.error("generate-category-media: error", err);
    return new Response(JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
