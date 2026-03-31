import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai@4";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://www.neekostats.com.au",
  "https://neekostats.com.au",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function getCorsHeaders(origin: string): Record<string, string> {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://www.neekostats.com.au";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

const STORAGE_BUCKET = "content-assets";
const CATEGORIES = ["stadium", "crowd", "field", "abstract", "players"] as const;
type Category = typeof CATEGORIES[number];

// ─── Image counts per category (total 150) ────────────────────────────────────
const IMAGE_COUNTS: Record<Category, number> = {
  stadium:  30,
  crowd:    30,
  field:    30,
  abstract: 30,
  players:  30,
};

// ─── Video counts per category (total 20) ────────────────────────────────────
const VIDEO_COUNTS: Record<Category, number> = {
  stadium:  6,
  crowd:    4,
  field:    3,
  abstract: 3,
  players:  4,
};

// ─── Variation pools ─────────────────────────────────────────────────────────

const CAMERA_ANGLES = [
  "aerial broadcast stadium view",
  "sideline camera perspective",
  "behind goal posts view",
  "centre wing broadcast angle",
  "tunnel entrance perspective",
  "scoreboard end view",
  "wide cinematic stadium shot",
  "crowd perspective from stands",
  "low angle ground-level view",
  "elevated press box perspective",
];

const TIME_OF_DAY = [
  "daytime match under bright sunlight",
  "golden sunset match with warm hues",
  "twilight stadium with lights coming on",
  "night match under full floodlights",
  "overcast cloudy afternoon",
  "early morning pre-game warmth",
];

const WEATHER = [
  "clear blue sky",
  "light rain on the field",
  "misty evening atmosphere",
  "dramatic overcast storm clouds",
  "crisp winter morning",
  "hazy warm summer day",
];

const CROWD_STATES = [
  "packed finals crowd roaring",
  "cheering supporters waving scarves",
  "waving team scarves in unison",
  "stadium pre-game atmosphere buzzing",
  "halftime crowd energy",
  "spontaneous standing ovation",
  "seated crowd watching intently",
];

const LIGHTING_STYLES = [
  "dramatic LED floodlights",
  "cinematic sports broadcast lighting",
  "sunset golden glow across the field",
  "bright daytime broadcast lighting",
  "deep blue dusk with stadium glow",
  "high contrast split lighting",
  "soft atmospheric evening glow",
];

const VIDEO_MOTION = [
  "aerial stadium crowd performing a Mexican wave",
  "stadium floodlights switching on dramatically",
  "slow panoramic pan across a packed stadium crowd",
  "stadium scoreboard glowing with cheering crowd in foreground",
  "sideline camera sweeping across the football field",
  "timelapse crowd filling stadium seats before match",
  "slow motion confetti falling over celebrating crowd",
  "smooth drone pull-back revealing full stadium scale",
];

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildPrompt(category: Category, seed: number, index: number): string {
  const rng = seededRng(seed + index * 7919);
  const angle   = pick(CAMERA_ANGLES, rng);
  const time    = pick(TIME_OF_DAY, rng);
  const weather = pick(WEATHER, rng);
  const light   = pick(LIGHTING_STYLES, rng);
  const crowd   = pick(CROWD_STATES, rng);

  switch (category) {
    case "stadium":
      return `Large Australian rules football stadium packed with fans, ${time}, ${weather}, ${angle}, ${light}, cinematic sports broadcast photography, ultra realistic, no text, no logos`;
    case "crowd":
      return `AFL fans ${crowd} in stadium stands, ${time}, ${light}, dramatic broadcast sports photography, no text, no logos`;
    case "field":
      return `AFL playing field close up with bright green turf, ${time}, ${weather}, stadium lights glowing in background, professional sports broadcast style, no players, no text`;
    case "abstract": {
      const styles = [
        "dark sports broadcast background with stadium lighting glow and subtle turf textures",
        "abstract sports data visualisation with glowing geometric lines and dynamic motion blur",
        "dark cinematic background with soft bokeh stadium lights, minimal and clean",
        "deep dark broadcast background with diagonal light streaks and stadium atmosphere",
        "atmospheric dark gradient with subtle sports field geometry",
      ];
      return `${pick(styles, rng)}, ${light}, no text, no logos`;
    }
    case "players": {
      const actions = [
        "AFL player silhouette celebrating a goal with arms raised",
        "Australian football player leaping for a spectacular mark",
        "AFL player silhouette in full sprint along the boundary line",
        "pair of AFL players competing for a contested ball in the air",
        "AFL player executing a powerful kick with perfect form",
        "player silhouette pumping fist in celebration after scoring",
        "AFL player diving to take a spectacular low mark",
        "two players contesting a boundary throw-in",
      ];
      return `${pick(actions, rng)}, stadium crowd in background, ${time}, ${light}, dramatic sports photography style, dark background, no text, no logos`;
    }
  }
}

function buildVideoPrompt(category: Category, seed: number, index: number): string {
  const rng  = seededRng(seed + index * 3571);
  const time = pick(TIME_OF_DAY, rng);
  const motion = pick(VIDEO_MOTION, rng);
  switch (category) {
    case "stadium":
      return `${motion}, ${time}, cinematic broadcast sports footage, loopable, ultra realistic, no text`;
    case "crowd":
      return `aerial stadium crowd performing a Mexican wave, ${time}, packed stands, cinematic, loopable, no text`;
    case "field":
      return `slow motion camera sweep across an AFL playing field, ${time}, broadcast quality, loopable, no text`;
    case "abstract":
      return `abstract digital motion background for AFL sports broadcast, glowing data streams, cinematic, loopable, no text`;
    case "players":
      return `AFL player silhouette in slow motion executing a powerful kick, ${time}, dramatic lighting, cinematic loopable footage, no text`;
  }
}

// ─── Prompt hash ──────────────────────────────────────────────────────────────

function promptHash(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin") ?? "");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

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
      return new Response(
        JSON.stringify({ error: "Missing environment configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const replaceExisting: boolean = body.replace_existing === true;
    const seed = Date.now();

    const adminClient = createClient(supabaseUrl, serviceKey);
    const openai = new OpenAI({ apiKey: openaiKey });

    // Server-Sent Events stream for progress
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();

    const send = async (data: object) => {
      try {
        await writer.write(encoder.encode(sseEvent(data)));
      } catch { /* client disconnected */ }
    };

    // Run generation in background
    EdgeRuntime.waitUntil((async () => {
      let generated = 0;
      let failed = 0;
      const totalImages = Object.values(IMAGE_COUNTS).reduce((a, b) => a + b, 0);
      const totalVideos = Object.values(VIDEO_COUNTS).reduce((a, b) => a + b, 0);

      // ── Images ──────────────────────────────────────────────────────────────
      await send({ phase: "images", message: "Generating images…", generated: 0, total: totalImages, failed: 0 });

      for (const category of CATEGORIES) {
        const count = IMAGE_COUNTS[category];
        for (let i = 0; i < count; i++) {
          try {
            const ts = Date.now();
            const prompt = buildPrompt(category, seed, generated);
            const hash   = promptHash(prompt);

            // Skip if not replacing and hash already exists
            if (!replaceExisting) {
              const { count: existing } = await adminClient
                .from("ai_media_library")
                .select("asset_id", { count: "exact", head: true })
                .eq("source", "ai_generated")
                .eq("category", category);
              if ((existing ?? 0) >= IMAGE_COUNTS[category]) {
                generated++;
                await send({ phase: "images", message: `Skipping ${category} (already has ${existing} images)`, generated, total: totalImages, failed });
                continue;
              }
            }

            const imageResponse = await openai.images.generate({
              model:   "dall-e-3",
              prompt,
              n:       1,
              size:    "1792x1024",
              quality: "standard",
            });

            const imageUrl = imageResponse.data?.[0]?.url;
            if (!imageUrl) throw new Error("No image URL returned");

            const imgFetch = await fetch(imageUrl);
            if (!imgFetch.ok) throw new Error(`Download failed: ${imgFetch.status}`);
            const imageBuffer = await imgFetch.arrayBuffer();

            const filename    = `${category}-pack-${ts}-${i}.png`;
            const storagePath = `images/ai-generated/${category}/${filename}`;

            const { error: uploadError } = await adminClient.storage
              .from(STORAGE_BUCKET)
              .upload(storagePath, imageBuffer, { contentType: "image/png", upsert: true });

            if (uploadError) throw new Error(uploadError.message);

            const { data: urlData } = adminClient.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
            const publicUrl = urlData?.publicUrl ?? "";

            const assetId = `ai-pack-${category}-${ts}-${i}`;
            await adminClient.from("ai_media_library").upsert({
              asset_id:      assetId,
              label:         `AI ${category.charAt(0).toUpperCase() + category.slice(1)} Pack ${i + 1}`,
              url:           publicUrl,
              thumbnail_url: publicUrl,
              media_type:    "image",
              category,
              sport:         "AFL",
              source:        "ai_generated",
              pack_id:       `media-pack-${seed}`,
              is_active:     true,
              sort_order:    i,
              metadata:      JSON.stringify({ prompt, prompt_hash: hash, seed, pack_index: i, generated_at: new Date(ts).toISOString() }),
            }, { onConflict: "asset_id" });

            generated++;
            await send({ phase: "images", message: `Generated ${category} image ${i + 1}/${count}`, generated, total: totalImages, failed });
          } catch (err) {
            failed++;
            console.error(`generate-media-pack: image ${category}[${i}] failed:`, err);
            await send({ phase: "images", message: `Failed: ${category} image ${i + 1}`, generated, total: totalImages, failed });
          }
        }
      }

      // ── Videos ──────────────────────────────────────────────────────────────
      await send({ phase: "videos", message: "Generating videos…", generated: 0, total: totalVideos, failed: 0 });

      let videoGenerated = 0;
      let videoFailed = 0;

      for (const category of CATEGORIES) {
        const count = VIDEO_COUNTS[category];
        for (let i = 0; i < count; i++) {
          try {
            const ts = Date.now();

            // Note: OpenAI DALL-E doesn't support video — generate a representative
            // still image for each video slot and store as video placeholder.
            // When a real video generation API is available, swap this block.
            const prompt = buildVideoPrompt(category, seed, videoGenerated);

            const imageResponse = await openai.images.generate({
              model:   "dall-e-3",
              prompt:  `${prompt}, cinematic single frame`,
              n:       1,
              size:    "1792x1024",
              quality: "standard",
            });

            const imageUrl = imageResponse.data?.[0]?.url;
            if (!imageUrl) throw new Error("No image URL returned");

            const imgFetch = await fetch(imageUrl);
            if (!imgFetch.ok) throw new Error(`Download failed: ${imgFetch.status}`);
            const imageBuffer = await imgFetch.arrayBuffer();

            const filename    = `${category}-video-pack-${ts}-${i}.png`;
            const storagePath = `videos/ai-generated/${category}/${filename}`;

            const { error: uploadError } = await adminClient.storage
              .from(STORAGE_BUCKET)
              .upload(storagePath, imageBuffer, { contentType: "image/png", upsert: true });

            if (uploadError) throw new Error(uploadError.message);

            const { data: urlData } = adminClient.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
            const publicUrl = urlData?.publicUrl ?? "";

            const assetId = `ai-pack-video-${category}-${ts}-${i}`;
            await adminClient.from("ai_media_library").upsert({
              asset_id:      assetId,
              label:         `AI ${category.charAt(0).toUpperCase() + category.slice(1)} Video ${i + 1}`,
              url:           publicUrl,
              thumbnail_url: publicUrl,
              media_type:    "video",
              category,
              sport:         "AFL",
              source:        "ai_generated",
              pack_id:       `media-pack-${seed}`,
              is_active:     true,
              sort_order:    i,
              metadata:      JSON.stringify({ prompt, seed, pack_index: i, generated_at: new Date(ts).toISOString(), note: "video_placeholder_image" }),
            }, { onConflict: "asset_id" });

            videoGenerated++;
            await send({ phase: "videos", message: `Generated ${category} video frame ${i + 1}/${count}`, generated: videoGenerated, total: totalVideos, failed: videoFailed });
          } catch (err) {
            videoFailed++;
            console.error(`generate-media-pack: video ${category}[${i}] failed:`, err);
            await send({ phase: "videos", message: `Failed: ${category} video ${i + 1}`, generated: videoGenerated, total: totalVideos, failed: videoFailed });
          }
        }
      }

      // ── Done ────────────────────────────────────────────────────────────────
      await send({
        phase:   "complete",
        message: "Media pack generation complete.",
        images:  { generated, failed },
        videos:  { generated: videoGenerated, failed: videoFailed },
      });

      await writer.close();
    })());

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type":  "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection":    "keep-alive",
      },
    });

  } catch (err) {
    console.error("generate-media-pack: unhandled error", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
