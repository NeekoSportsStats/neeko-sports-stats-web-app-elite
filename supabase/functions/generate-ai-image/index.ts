import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai@4";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STORAGE_BUCKET = "content-assets";

const VALID_CATEGORIES = ["stadium", "crowd", "field", "players", "abstract", "equipment"] as const;
type Category = typeof VALID_CATEGORIES[number];

// ─── Variation pools ───────────────────────────────────────────────────────────

const AFL_STADIUM_GLOBAL_BASE = [
  "Photorealistic Australian Rules Football stadium environment",
  "Large oval grass field with clearly visible centre circle and centre square markings",
  "Camera positioned in the middle third of the oval — focused only on midfield",
  "The ends of the oval must be outside the frame — only the centre circle, centre square, wing area, or boundary line near midfield is visible",
  "Massive modern oval stadium with multi-tier grandstands and spectators",
  "Realistic stadium architecture similar to major AFL venues",
  "Detailed turf patterns and professional sports broadcast lighting",
  "NO goal posts anywhere in the image. NO scoring ends of the field",
  "photorealistic, ultra detailed, 8K sports photography, broadcast camera quality, cinematic stadium lighting, realistic grass texture, high detail crowd",
].join(". ");

const AFL_NEGATIVE = [
  "goal posts", "AFL posts", "behind posts", "upright posts", "goalposts", "posts",
  "rugby posts", "crossbar", "soccer goal", "goal net", "net",
  "NFL", "yard lines", "hash marks", "rectangular pitch", "rectangular field",
  "cricket pitch", "wickets", "scoring end", "goal end",
  "cartoon", "illustration", "CGI", "3D render", "video game screenshot",
  "blurry", "fisheye", "text", "watermark", "logo",
].join(", ");

const AFL_STADIUM_SCENES = [
  "Camera from the grandstand looking across the centre circle. Centre circle and centre square clearly visible in the turf below. Massive oval stadium bowl with packed crowd surrounding the entire oval. Camera frame shows only midfield — both goal ends completely outside frame.",
  "Camera low near the boundary line looking diagonally across midfield toward the grandstand on the opposite side. The curvature of the oval boundary line clearly visible. Crowd filling the stands. Only the centre third of the oval in frame — both goal ends outside frame.",
  "Camera positioned beside the centre circle showing turf detail and the AFL markings on the grass. Stadium seating visible in all directions. Camera looking inward toward the circle, not toward either goal end. Midfield only visible.",
  "Warm sunset lighting raking across the centre square of the oval. Long dramatic shadows from the grandstand across the grass. Camera from the wing looking across midfield. Golden orange and amber tones. Both goal ends outside frame.",
  "Night match. Bright stadium floodlights illuminating the centre circle with crisp intense light. Camera from grandstand looking across midfield. The oval turf glowing vivid green under the floodlights. Packed crowd visible. No goal ends in frame.",
  "Wet and reflective oval turf under stadium lights during a rainy match. Light rain visible as streaks through floodlight beams. Camera looking across the centre square from the wing. Puddles reflecting stadium lights on the grass. No goal ends in frame.",
  "Empty AFL stadium with perfectly manicured green oval turf. Camera positioned near the centre square during a quiet afternoon training session. No players, no crowd — just the immaculate field and empty grandstands. No goal ends in frame.",
  "Drone camera directly above the centre circle looking straight down. The oval shape of the field clearly visible with centre circle and centre square markings prominent. Crowd surrounding the entire oval. Camera looking straight down only — no goal ends visible.",
  "Camera positioned under the stadium roof looking out over the midfield area of the oval. The curved roof structure frames the top of the image. Centre square and crowd visible below. No goal ends in frame.",
  "Fans in the foreground along the boundary fence watching the match. The midfield area of the oval visible beyond the fans. Camera from just behind the boundary line looking across to the opposite grandstand. Centre of the oval only — no goal ends visible.",
  "Soft morning fog drifting low across the oval turf. Centre circle faintly visible through the mist. Quiet atmospheric empty stadium. Diffused soft light. Camera looking across midfield, not toward either end. No goal ends visible.",
  "Soft grey overcast lighting across the midfield area of the AFL oval. Flat even illumination. Camera from a grandstand broadcast position looking across the centre square. No goal ends in frame.",
  "Massive multi-tier AFL stadium bowl similar to the MCG. Camera from a high broadcast position showing the enormous grandstands surrounding the oval. The midfield area visible below. Only midfield captured — no goal ends in frame.",
  "Night match in a packed AFL stadium. Floodlights blazing. Camera from the wing grandstand looking across the glowing centre circle. Crowd on their feet. Only the middle third of the oval in frame — no goal ends visible.",
  "Strong afternoon sunlight casting a long dramatic grandstand shadow across the centre square. Half the field in deep shadow, other half brightly lit. Camera from the wing looking across midfield. No goal ends visible.",
];

const CAMERA_ANGLES = [
  "grandstand broadcast camera angle looking across midfield",
  "boundary line perspective focused on centre square",
  "wing position looking across the oval midfield",
  "aerial view above the centre circle",
  "under-roof view looking out toward midfield",
  "crowd perspective from the boundary fence toward midfield",
];

const TIME_OF_DAY = [
  "daytime match under bright sunlight",
  "golden sunset match with warm hues",
  "twilight stadium with lights coming on",
  "night match under full floodlights",
  "overcast cloudy afternoon",
];

const WEATHER = [
  "clear blue sky",
  "light rain on the field",
  "misty evening atmosphere",
  "dramatic overcast storm clouds",
];

const CROWD_STATES = [
  "packed finals crowd roaring",
  "cheering supporters waving scarves",
  "waving team scarves in unison",
  "stadium pre-game atmosphere buzzing",
  "halftime crowd energy",
];

const LIGHTING_STYLES = [
  "dramatic LED floodlights",
  "cinematic sports broadcast lighting",
  "sunset golden glow across the field",
  "bright daytime broadcast lighting",
  "deep blue dusk with stadium glow",
];

const VIDEO_CLIPS = [
  "aerial stadium crowd performing a Mexican wave",
  "stadium floodlights switching on dramatically",
  "slow panoramic pan across a packed stadium crowd",
  "stadium scoreboard glowing with cheering crowd in foreground",
  "sideline camera sweeping across the football field",
];


// ─── Deterministic seeded RNG (xorshift) ────────────────────────────────────

function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

function pickFrom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ─── Prompt builders ─────────────────────────────────────────────────────────

function buildStadiumPrompt(seed: number): string {
  const rng = seededRng(seed);
  const sceneIndex = Math.floor(rng() * AFL_STADIUM_SCENES.length);
  const scene = AFL_STADIUM_SCENES[sceneIndex];
  return `${AFL_STADIUM_GLOBAL_BASE}. Scene: ${scene}. ${AFL_NEGATIVE}`;
}

function buildCrowdPrompt(seed: number): string {
  const rng   = seededRng(seed);
  const crowd = pickFrom(CROWD_STATES, rng);
  const light = pickFrom(LIGHTING_STYLES, rng);
  const time  = pickFrom(TIME_OF_DAY, rng);
  return `AFL fans ${crowd} in stadium stands, ${time}, ${light}, dramatic broadcast sports photography, no text, no logos`;
}

function buildFieldPrompt(seed: number): string {
  const rng     = seededRng(seed);
  const weather = pickFrom(WEATHER, rng);
  const time    = pickFrom(TIME_OF_DAY, rng);
  return `AFL playing field close up with bright green turf, ${time}, ${weather}, stadium lights glowing in background, professional sports broadcast style, no players, no text`;
}

function buildAbstractPrompt(seed: number): string {
  const rng   = seededRng(seed);
  const light = pickFrom(LIGHTING_STYLES, rng);
  const styles = [
    "dark sports broadcast background with stadium lighting glow and subtle turf textures, designed for sports statistics graphics",
    "abstract sports data visualisation with glowing geometric lines and dynamic motion blur, premium digital art aesthetic",
    "dark cinematic background with soft bokeh stadium lights, minimal and clean, designed for stats overlay graphics",
    "deep dark broadcast background with diagonal light streaks and stadium atmosphere, sports tech aesthetic",
  ];
  return `${pickFrom(styles, rng)}, ${light}, no text, no logos`;
}

function buildPlayersPrompt(seed: number): string {
  const rng = seededRng(seed);
  const actions = [
    "AFL player silhouette celebrating a goal with arms raised",
    "Australian football player leaping for a spectacular mark",
    "AFL player silhouette in full sprint along the boundary line",
    "pair of AFL players competing for a contested ball in the air",
    "AFL player executing a powerful kick with perfect form",
    "player silhouette pumping fist in celebration after scoring",
  ];
  const light = pickFrom(LIGHTING_STYLES, rng);
  const time  = pickFrom(TIME_OF_DAY, rng);
  return `${pickFrom(actions, rng)}, stadium crowd in background, ${time}, ${light}, dramatic sports photography style, dark background, no text, no logos`;
}

function buildEquipmentPrompt(seed: number): string {
  const rng = seededRng(seed);
  const subjects = [
    "Sherrin Australian rules football on bright green oval grass, close up product photography, stadium background bokeh, ultra realistic",
    "AFL football boots on grass, professional sports product photography, dark atmospheric background, studio lighting",
    "four AFL goal posts standing tall on an oval football field, dramatic sky background, photorealistic sports photography",
    "AFL training cones and equipment laid out on oval grass, professional sports photography, afternoon stadium lighting",
    "AFL locker room with team jerseys hanging and boots on the floor, dramatic sports photography, atmospheric lighting",
    "Sherrin football sitting on the centre circle of an AFL oval field, aerial perspective, ultra realistic product shot",
    "AFL helmets and protective gear arranged on a bench, sports equipment photography, dark studio aesthetic",
    "AFL football and training equipment on the oval before a match, golden hour lighting, photorealistic",
    "close up of a Sherrin football mid-air against stadium crowd background, sports action photography",
    "AFL gym and weights room with team colours, sports performance environment photography, dramatic lighting",
  ];
  const light = pickFrom(LIGHTING_STYLES, rng);
  return `${pickFrom(subjects, rng)}, ${light}, no text, no logos, photorealistic, ultra detailed`;
}

function buildVideoPrompt(seed: number): string {
  const rng  = seededRng(seed);
  const clip = pickFrom(VIDEO_CLIPS, rng);
  const time = pickFrom(TIME_OF_DAY, rng);
  return `${clip}, ${time}, cinematic broadcast sports footage, loopable, ultra realistic, no text`;
}

function buildVariedPrompt(category: Category, seed: number): string {
  switch (category) {
    case "stadium":   return buildStadiumPrompt(seed);
    case "crowd":     return buildCrowdPrompt(seed);
    case "field":     return buildFieldPrompt(seed);
    case "abstract":  return buildAbstractPrompt(seed);
    case "players":   return buildPlayersPrompt(seed);
    case "equipment": return buildEquipmentPrompt(seed);
  }
}

// ─── Prompt hash (FNV-1a 32-bit) ─────────────────────────────────────────────

function promptHash(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const openaiKey   = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Supabase environment not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (token !== serviceKey) {
      const { createClient } = await import("npm:@supabase/supabase-js@2");
      const userClient = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false },
      });
      const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
      if (authErr || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: profile } = await userClient
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.is_admin) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawCategory: string = body.category ?? "stadium";
    const category: Category  = VALID_CATEGORIES.includes(rawCategory as Category)
      ? (rawCategory as Category)
      : "stadium";

    const timestamp = Date.now();
    const adminClient = createClient(supabaseUrl, serviceKey);

    // ── Build varied prompt with anti-duplicate seed rotation ────────────────
    let seed          = timestamp;
    let prompt: string;
    let hash: string;
    let attempts      = 0;
    const MAX_ATTEMPTS = 8;

    // If caller supplied a custom prompt, use it directly (no variation)
    if (body.prompt) {
      prompt = body.prompt as string;
      hash   = promptHash(prompt);
    } else {
      // Rotate seeds until we find a prompt hash not already used
      do {
        prompt = buildVariedPrompt(category, seed + attempts * 7919);
        hash   = promptHash(prompt);

        const { count } = await adminClient
          .from("ai_media_library")
          .select("asset_id", { count: "exact", head: true })
          .eq("source", "ai_generated")
          .eq("category", category)
          .like("metadata->>prompt_hash", hash);

        if ((count ?? 0) === 0) break;
        attempts++;
      } while (attempts < MAX_ATTEMPTS);
    }

    const isVideo    = category === "abstract" && body.video === true;
    const filename   = body.filename ?? `${category}-${timestamp}.png`;
    const storagePath = `ai-generated/${category}/${filename}`;

    console.log(`generate-ai-image: category="${category}" seed=${seed} attempts=${attempts} hash=${hash}`);
    console.log(`generate-ai-image: prompt="${prompt}"`);

    const openai = new OpenAI({ apiKey: openaiKey });

    const imageResponse = await openai.images.generate({
      model:   "dall-e-3",
      prompt,
      n:       1,
      size:    "1792x1024",
      quality: "standard",
    });

    const imageUrl = imageResponse.data?.[0]?.url;
    const revisedPrompt = imageResponse.data?.[0]?.revised_prompt ?? prompt;

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "OpenAI returned no image URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const imgFetch = await fetch(imageUrl);
    if (!imgFetch.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to download image: ${imgFetch.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const imageBuffer = await imgFetch.arrayBuffer();

    const { error: uploadError } = await adminClient.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, imageBuffer, {
        contentType: "image/png",
        upsert:      true,
      });

    if (uploadError) {
      return new Response(
        JSON.stringify({ error: `Storage upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: urlData } = adminClient.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = urlData?.publicUrl ?? "";

    const assetId = `ai-${category}-${timestamp}`;
    const metadata = {
      prompt,
      revised_prompt:  revisedPrompt,
      prompt_hash:     hash,
      seed,
      variation_attempts: attempts,
      storage_path:    storagePath,
      generated_at:    new Date(timestamp).toISOString(),
      is_video:        isVideo,
    };

    const { error: dbError } = await adminClient
      .from("ai_media_library")
      .upsert({
        asset_id:      assetId,
        label:         `AI ${category.charAt(0).toUpperCase() + category.slice(1)} ${new Date(timestamp).toLocaleDateString("en-AU")}`,
        url:           publicUrl,
        thumbnail_url: publicUrl,
        media_type:    "image",
        category,
        sport:         "AFL",
        source:        "ai_generated",
        pack_id:       `ai-generated-${category}`,
        is_active:     true,
        sort_order:    0,
        metadata:      JSON.stringify(metadata),
      }, { onConflict: "asset_id" });

    if (dbError) {
      console.warn("generate-ai-image: media library insert warning", dbError.message);
    }

    return new Response(
      JSON.stringify({
        success:           true,
        filename,
        category,
        public_url:        publicUrl,
        storage_path:      storagePath,
        asset_id:          assetId,
        prompt,
        revised_prompt:    revisedPrompt,
        prompt_hash:       hash,
        variation_attempts: attempts,
        generated_at:      new Date(timestamp).toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("generate-ai-image: unhandled error", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
