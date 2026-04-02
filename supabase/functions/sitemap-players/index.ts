import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BASE_URL = "https://neekostats.com.au";

function nameToSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: players, error } = await supabase
      .from("player_rankings_cache")
      .select("player_name, cached_at")
      .not("player_name", "is", null)
      .order("neeko_rating", { ascending: false });

    if (error) throw error;

    const uniquePlayers = new Map<string, string>();
    for (const p of players ?? []) {
      if (!p.player_name) continue;
      const slug = nameToSlug(p.player_name);
      if (!uniquePlayers.has(slug)) {
        uniquePlayers.set(slug, p.cached_at ?? new Date().toISOString());
      }
    }

    const urlEntries = Array.from(uniquePlayers.entries())
      .map(([slug, cachedAt]) => {
        const lastmod = cachedAt ? cachedAt.split("T")[0] : new Date().toISOString().split("T")[0];
        return `  <url>
    <loc>${BASE_URL}/sports/afl/players/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (err) {
    console.error("Sitemap error:", err);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/xml; charset=utf-8",
        },
      }
    );
  }
});
