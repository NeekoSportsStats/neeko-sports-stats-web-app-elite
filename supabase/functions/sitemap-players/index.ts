import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BASE_URL = "https://neekostats.com.au";

// Maps full team name -> first segment of team slug (the team prefix appended to player slugs)
// Mirrors src/lib/slugs.ts playerToSlug() so sitemap URLs match app URLs exactly
const TEAM_SLUG_PREFIX: Record<string, string> = {
  "Adelaide Crows": "adelaide",
  "Brisbane Lions": "brisbane",
  "Carlton Blues": "carlton",
  "Collingwood Magpies": "collingwood",
  "Essendon Bombers": "essendon",
  "Fremantle Dockers": "fremantle",
  "Geelong Cats": "geelong",
  "Gold Coast Suns": "gold",
  "Greater Western Sydney Giants": "gws",
  "Hawthorn Hawks": "hawthorn",
  "Melbourne Demons": "melbourne",
  "North Melbourne Kangaroos": "north",
  "Port Adelaide Power": "port",
  "Richmond Tigers": "richmond",
  "St Kilda Saints": "st",
  "Sydney Swans": "sydney",
  "West Coast Eagles": "west",
  "Western Bulldogs": "western",
};

function playerToSlug(playerName: string, teamName: string | null): string {
  const nameSlug = playerName.toLowerCase().replace(/\s+/g, "-");
  const teamPrefix = teamName ? (TEAM_SLUG_PREFIX[teamName] ?? null) : null;
  return teamPrefix ? `${nameSlug}-${teamPrefix}` : nameSlug;
}

function isValidSlug(slug: string): boolean {
  if (!slug || slug.length < 5) return false;
  if (!/^[a-z][a-z-]+[a-z]$/.test(slug)) return false;
  const parts = slug.split("-");
  if (parts.length < 2) return false;
  return parts.every((p) => /^[a-z]+$/.test(p));
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
      .schema("afl")
      .from("player_rankings_cache")
      .select("player_name, team_name, cached_at")
      .not("player_name", "is", null)
      .neq("player_name", "")
      .order("neeko_rating", { ascending: false })
      .limit(1000);

    console.log("Players fetched:", players?.length);

    if (error) throw error;

    const uniquePlayers = new Map<string, string>();
    for (const p of players ?? []) {
      if (!p.player_name || p.player_name.trim().length < 3) continue;
      const slug = playerToSlug(p.player_name.trim(), p.team_name ?? null);
      if (!isValidSlug(slug)) continue;
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
