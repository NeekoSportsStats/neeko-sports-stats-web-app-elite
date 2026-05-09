export const config = {
  matcher: [
    "/",
    "/about",
    "/faq",
    "/neeko-plus",
    "/contact",
    "/fantasy",
    "/fantasy/current-week",
    "/fantasy/rankings",
    "/fantasy/market-watch",
    "/stat-board",
    "/stat-board/players",
    "/stat-board/teams",
    "/stat-board/match-centre",
    "/sports/afl/rankings",
    "/sports/afl/market-watch",
    "/sports/afl/edge-board",
    "/sports/afl/current-round",
    "/sports/afl/start-sit",
    "/sports/afl/captains",
    "/sports/afl/players",
    "/sports/afl/players/:slug*",
    "/sports/afl/teams",
    "/sports/afl/teams/:team*",
    "/sports/afl/round/:roundNumber*",
    // Private paths — matched so middleware can attach noindex headers
    "/auth",
    "/account",
    "/billing",
    "/checkout",
    "/success",
    "/cancel",
    "/create-password",
    "/forgot-password",
    "/reset-password",
    "/admin",
    "/admin/:path*",
    "/pipeline-history",
    "/neeko-plus-purchase",
  ],
};

const BOT_AGENTS = [
  "googlebot",
  "google-inspectiontool",
  "adsbot-google",
  "bingbot",
  "slurp",
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "sogou",
  "exabot",
  "facebot",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "pinterest",
  "whatsapp",
  "telegrambot",
  "slackbot",
  "discordbot",
  "redditbot",
  "applebot",
  "mj12bot",
  "ahrefsbot",
  "semrushbot",
  "rogerbot",
  "dotbot",
  "seznambot",
  "chrome-lighthouse",
  "w3c_validator",
  "curl/",
  "wget/",
  "python-requests",
  "go-http-client",
  "node-fetch",
  "axios/",
  "scrapy",
];

// Private paths: bots get a hard noindex response, no page HTML
const PRIVATE_PATHS = [
  "/auth",
  "/account",
  "/billing",
  "/checkout",
  "/success",
  "/cancel",
  "/create-password",
  "/forgot-password",
  "/reset-password",
  "/admin",
  "/pipeline-history",
  "/neeko-plus-purchase",
  "/functions/",
];

// All known active public routes — anything not matching these gets noindex in the fallback
const KNOWN_PUBLIC_ROUTES = new Set([
  "/",
  "/about",
  "/faq",
  "/contact",
  "/neeko-plus",
  "/fantasy",
  "/fantasy/current-week",
  "/fantasy/rankings",
  "/fantasy/market-watch",
  "/stat-board",
  "/stat-board/players",
  "/stat-board/teams",
  "/stat-board/match-centre",
  "/sports/afl/players",
  "/sports/afl/teams",
]);

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_AGENTS.some((bot) => ua.includes(bot));
}

function isPrivatePath(pathname) {
  return PRIVATE_PATHS.some((b) => pathname === b || pathname.startsWith(b + "/") || pathname.startsWith(b));
}

const DOMAIN = "https://neekostats.com.au";
const DEFAULT_IMAGE = `${DOMAIN}/og-default.png`;
const DEFAULT_DESCRIPTION =
  "AFL Fantasy rankings, Stat Board, captain picks, price movers and weekly projections built to give fantasy coaches a data edge.";

// Known AFL team slug prefixes — used to strip team suffix from player slugs
const TEAM_PREFIXES = new Set([
  "adelaide", "brisbane", "carlton", "collingwood", "essendon",
  "fremantle", "geelong", "gold", "gws", "hawthorn",
  "melbourne", "north", "port", "richmond", "st",
  "sydney", "west", "western",
]);

function slugToTitle(slug) {
  if (!slug) return "";
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Derive a human-readable player name from a player slug.
 * Slugs follow the pattern: firstname-lastname-teamprefix
 * e.g. nick-daicos-collingwood → Nick Daicos
 * e.g. max-gawn-melbourne → Max Gawn
 */
function playerNameFromSlug(slug) {
  const parts = slug.split("-");
  if (parts.length < 2) return slugToTitle(slug);
  const lastPart = parts[parts.length - 1];
  const stripped = TEAM_PREFIXES.has(lastPart) ? parts.slice(0, -1) : parts;
  return stripped.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Validate slug structure: must be at least 2 hyphen-separated lowercase words,
 * all alphabetic, minimum 3 chars total. Rejects numeric IDs, single-word slugs,
 * random garbage strings.
 */
function isStructurallyValidPlayerSlug(slug) {
  if (!slug || slug.length < 5) return false;
  if (!/^[a-z][a-z-]+[a-z]$/.test(slug)) return false;
  const parts = slug.split("-");
  if (parts.length < 2) return false;
  // Every part must be alphabetic only
  if (!parts.every((p) => /^[a-z]+$/.test(p))) return false;
  return true;
}

/**
 * Look up a player slug against the Supabase player_rankings_cache.
 * Uses the anon REST API — same credentials available in the client bundle.
 * Returns { found: bool, playerName: string|null, team: string|null }
 */
async function lookupPlayerSlug(slug) {
  const supabaseUrl = "https://zbomenuickrogthnsozb.supabase.co";
  const anonKey =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpib21lbnVpY2tyb2d0aG5zb3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NDMyMDAsImV4cCI6MjA3ODUxOTIwMH0.FWV-l7SyltEkMGv76dKD30GDbOyvKvYJ7BBMIQgX8VE";

  // Derive the player name fragment from the slug to query by name
  // Strip known team prefix from the end, then query ilike
  const parts = slug.split("-");
  const lastPart = parts[parts.length - 1];
  const nameParts = TEAM_PREFIXES.has(lastPart) ? parts.slice(0, -1) : parts;
  const nameSlug = nameParts.join("-"); // e.g. "nick-daicos"

  // Build a LIKE pattern matching the player name as a slug
  // We check: lower(replace(player_name, ' ', '-')) = nameSlug
  const url =
    `${supabaseUrl}/rest/v1/player_rankings_cache` +
    `?select=player_name,team_name` +
    `&player_name_slug=eq.${encodeURIComponent(nameSlug)}` +
    `&limit=1`;

  // Use a custom RPC isn't available here; instead filter by computing name slug client-side
  // via the ilike pattern on player_name — match "Nick Daicos" from "nick-daicos"
  const displayName = nameParts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  const lookupUrl =
    `${supabaseUrl}/rest/v1/player_rankings_cache` +
    `?select=player_name,team_name` +
    `&player_name=ilike.${encodeURIComponent(displayName)}` +
    `&limit=1`;

  try {
    const res = await fetch(lookupUrl, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        "Accept-Profile": "afl",
      },
      // Edge middleware has a tight time budget — cap at 1.5s
      signal: AbortSignal.timeout(1500),
    });

    if (!res.ok) return { found: false, playerName: null, team: null };

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return { found: false, playerName: null, team: null };
    }

    return {
      found: true,
      playerName: data[0].player_name ?? displayName,
      team: data[0].team_name ?? null,
    };
  } catch {
    // On timeout or network error, fall back to structural check only
    return { found: null, playerName: displayName, team: null };
  }
}

function getPageMeta(pathname) {
  const p = pathname.replace(/\/$/, "") || "/";

  if (p === "/") {
    return {
      title: "Neeko Sports Stats — AFL Fantasy Rankings, Stats & Projections 2026",
      description: DEFAULT_DESCRIPTION,
      canonical: DOMAIN,
    };
  }

  if (p === "/fantasy") {
    return {
      title: "AFL Fantasy Hub 2026 — Rankings, Captains & Market Watch | Neeko Sports Stats",
      description:
        "AFL Fantasy rankings, captain picks, value targets and trap alerts for the current round. Stat-generated weekly decision tools from Neeko Sports Stats.",
      canonical: `${DOMAIN}/fantasy`,
    };
  }

  if (p === "/fantasy/current-week") {
    return {
      title: "AFL Fantasy Current Round 2026 — Captain Picks, Must Buys & Traps | Neeko Sports Stats",
      description:
        "Current round AFL Fantasy cheat sheet with captain picks, value plays, trap alerts and weekly projection-based decision tools.",
      canonical: `${DOMAIN}/fantasy/current-week`,
    };
  }

  if (p === "/fantasy/rankings") {
    return {
      title: "AFL Fantasy Rankings 2026 — Player Projections & Value | Neeko Sports Stats",
      description:
        "AFL Fantasy player rankings for 2026 with projected scores, value ratings, trends, form signals and weekly buy, hold and avoid calls.",
      canonical: `${DOMAIN}/fantasy/rankings`,
    };
  }

  if (p === "/fantasy/market-watch") {
    return {
      title: "AFL Fantasy Market Watch 2026 — Price Movers & Value Targets | Neeko Sports Stats",
      description:
        "Track AFL Fantasy price movers, value targets, trap alerts and underpriced players using weekly stat-generated market signals.",
      canonical: `${DOMAIN}/fantasy/market-watch`,
    };
  }

  // Legacy redirect targets — noindex, canonical to correct destination
  if (p === "/fantasy/captains") {
    return {
      title: "AFL Fantasy Current Round 2026 — Captain Picks, Must Buys & Traps | Neeko Sports Stats",
      description:
        "Current round AFL Fantasy cheat sheet with captain picks, value plays, trap alerts and weekly projection-based decision tools.",
      canonical: `${DOMAIN}/fantasy/current-week`,
      noindex: true,
    };
  }

  if (p === "/fantasy/edge-board") {
    return {
      title: "AFL Fantasy Market Watch 2026 — Price Movers & Value Targets | Neeko Sports Stats",
      description:
        "Track AFL Fantasy price movers, value targets, trap alerts and underpriced players using weekly stat-generated market signals.",
      canonical: `${DOMAIN}/fantasy/market-watch`,
      noindex: true,
    };
  }

  if (p === "/stat-board") {
    return {
      title: "AFL Stat Board 2026 — Player, Team & Match Stats | Neeko Sports Stats",
      description:
        "Explore AFL player, team and match statistics for 2026. Compare recent form, hit rates, trends and match data in one Stat Board.",
      canonical: `${DOMAIN}/stat-board`,
    };
  }

  if (p === "/stat-board/players") {
    return {
      title: "AFL Player Stats 2026 — Stat Board | Neeko Sports Stats",
      description:
        "Detailed AFL player statistics for 2026. Filter by match, team, position and stat type to compare form, hit rates and scoring trends.",
      canonical: `${DOMAIN}/stat-board/players`,
    };
  }

  if (p === "/stat-board/teams") {
    return {
      title: "AFL Team Stats 2026 — Stat Board | Neeko Sports Stats",
      description:
        "Compare AFL team statistics for 2026 including scoring trends, recent form, match context and team performance indicators.",
      canonical: `${DOMAIN}/stat-board/teams`,
    };
  }

  if (p === "/stat-board/match-centre") {
    return {
      title: "AFL Match Centre 2026 — Team Matchups & Player Stats | Neeko Sports Stats",
      description:
        "AFL Match Centre for 2026 with team matchup data, player stat trends, projected totals and recent scoring context.",
      canonical: `${DOMAIN}/stat-board/match-centre`,
    };
  }

  if (p === "/about") {
    return {
      title: "About Neeko Sports Stats — AFL Fantasy Analytics Platform",
      description:
        "Neeko Sports Stats is an AI-powered AFL Fantasy analytics platform providing weekly player rankings, captain signals, breakout alerts, trap warnings and projection modelling.",
      canonical: `${DOMAIN}/about`,
    };
  }

  if (p === "/faq") {
    return {
      title: "FAQ — Neeko Sports Stats | AFL Fantasy Analytics",
      description:
        "Frequently asked questions about Neeko Sports Stats — AFL Fantasy analytics, projections, Neeko+ subscription, pricing, accounts and platform features.",
      canonical: `${DOMAIN}/faq`,
    };
  }

  if (p === "/neeko-plus") {
    return {
      title: "Neeko+ — Premium AFL Fantasy Analytics Subscription | Neeko Sports Stats",
      description:
        "Upgrade to Neeko+ for full AFL Fantasy rankings, AI player analysis, captain signals, breakout alerts and trade targets. From $9.99 AUD/month.",
      canonical: `${DOMAIN}/neeko-plus`,
    };
  }

  if (p === "/contact") {
    return {
      title: "Contact Neeko Sports Stats — Get in Touch",
      description:
        "Contact the Neeko Sports Stats team for support, feedback or enquiries about AFL Fantasy analytics.",
      canonical: `${DOMAIN}/contact`,
    };
  }

  // Legacy /sports/afl/* redirect aliases — noindex, canonical to active destination
  if (p === "/sports/afl/rankings") {
    return {
      title: "AFL Fantasy Rankings 2026 — Player Projections & Value | Neeko Sports Stats",
      description:
        "AFL Fantasy player rankings for 2026 with projected scores, value ratings, trends, form signals and weekly buy, hold and avoid calls.",
      canonical: `${DOMAIN}/fantasy/rankings`,
      noindex: true,
    };
  }

  if (p === "/sports/afl/market-watch") {
    return {
      title: "AFL Fantasy Market Watch 2026 — Price Movers & Value Targets | Neeko Sports Stats",
      description:
        "Track AFL Fantasy price movers, value targets, trap alerts and underpriced players using weekly stat-generated market signals.",
      canonical: `${DOMAIN}/fantasy/market-watch`,
      noindex: true,
    };
  }

  if (p === "/sports/afl/edge-board") {
    return {
      title: "AFL Fantasy Market Watch 2026 — Price Movers & Value Targets | Neeko Sports Stats",
      description:
        "Track AFL Fantasy price movers, value targets, trap alerts and underpriced players using weekly stat-generated market signals.",
      canonical: `${DOMAIN}/fantasy/market-watch`,
      noindex: true,
    };
  }

  if (p === "/sports/afl/current-round") {
    return {
      title: "AFL Fantasy Current Round 2026 — Captain Picks, Must Buys & Traps | Neeko Sports Stats",
      description:
        "Current round AFL Fantasy cheat sheet with captain picks, value plays, trap alerts and weekly projection-based decision tools.",
      canonical: `${DOMAIN}/fantasy/current-week`,
      noindex: true,
    };
  }

  if (p === "/sports/afl/start-sit") {
    return {
      title: "AFL Fantasy Hub 2026 — Rankings, Captains & Market Watch | Neeko Sports Stats",
      description:
        "AFL Fantasy rankings, captain picks, value targets and trap alerts for the current round. Stat-generated weekly decision tools from Neeko Sports Stats.",
      canonical: `${DOMAIN}/fantasy`,
      noindex: true,
    };
  }

  if (p === "/sports/afl/captains") {
    return {
      title: "AFL Fantasy Current Round 2026 — Captain Picks, Must Buys & Traps | Neeko Sports Stats",
      description:
        "Current round AFL Fantasy cheat sheet with captain picks, value plays, trap alerts and weekly projection-based decision tools.",
      canonical: `${DOMAIN}/fantasy/current-week`,
      noindex: true,
    };
  }

  if (p === "/sports/afl/players") {
    return {
      title: "AFL Fantasy Players 2026 — Full Player List & Stats | Neeko Sports Stats",
      description:
        "Browse all AFL Fantasy players for 2026. Stats, projections, prices and trade signals powered by Neeko Sports Stats.",
      canonical: `${DOMAIN}/sports/afl/players`,
    };
  }

  if (p === "/sports/afl/teams") {
    return {
      title: "AFL Fantasy Team Directory 2026 — All 18 Teams | Neeko Sports Stats",
      description:
        "Browse all 18 AFL teams for 2026. Team rosters, player projections, fantasy signals and trade targets powered by Neeko Sports Stats.",
      canonical: `${DOMAIN}/sports/afl/teams`,
    };
  }

  const teamMatch = p.match(/^\/sports\/afl\/teams\/([^/]+)$/);
  if (teamMatch) {
    const team = slugToTitle(teamMatch[1]);
    return {
      title: `${team} AFL Fantasy Players & Stats 2026 | Neeko Sports Stats`,
      description: `${team} AFL Fantasy player stats, projections, rankings and trade targets for the 2026 season.`,
      canonical: `${DOMAIN}${p}`,
    };
  }

  const roundMatch = p.match(/^\/sports\/afl\/round\/(\d+)$/);
  if (roundMatch) {
    const round = roundMatch[1];
    return {
      title: `AFL Fantasy Round ${round} Results & Stats 2026 | Neeko Sports Stats`,
      description: `AFL Fantasy Round ${round} 2026 results, player scores, matchup stats and projection accuracy breakdown.`,
      canonical: `${DOMAIN}${p}`,
    };
  }

  // Player pages are handled asynchronously in the main middleware function.
  // This synchronous fallback is only used if the async path is skipped.
  const playerMatch = p.match(/^\/sports\/afl\/players\/([^/]+)$/);
  if (playerMatch) {
    // Structural check failed or async wasn't used — safe noindex default
    return {
      title: "AFL Player Stats 2026 | Neeko Sports Stats",
      description: DEFAULT_DESCRIPTION,
      canonical: `${DOMAIN}/sports/afl/players`,
      noindex: true,
    };
  }

  // Unknown route fallback — noindex to prevent soft-404 indexing
  return {
    title: "Neeko Sports Stats — AFL Fantasy Rankings, Stats & Projections 2026",
    description: DEFAULT_DESCRIPTION,
    canonical: DOMAIN,
    noindex: true,
  };
}

function buildBotHTML(meta, pathname) {
  const { title, description, canonical, noindex } = meta;
  const escaped = (s) =>
    s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const robotsContent = noindex ? "noindex, follow" : "index, follow";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escaped(title)}</title>
  <meta name="description" content="${escaped(description)}" />
  <meta name="robots" content="${robotsContent}" />
  <meta name="author" content="Neeko Sports Stats" />
  <link rel="canonical" href="${escaped(canonical)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escaped(canonical)}" />
  <meta property="og:title" content="${escaped(title)}" />
  <meta property="og:description" content="${escaped(description)}" />
  <meta property="og:image" content="${DEFAULT_IMAGE}" />
  <meta property="og:site_name" content="Neeko Sports Stats" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@neekostats" />
  <meta name="twitter:title" content="${escaped(title)}" />
  <meta name="twitter:description" content="${escaped(description)}" />
  <meta name="twitter:image" content="${DEFAULT_IMAGE}" />
  <link rel="icon" type="image/png" href="/logo.png" />
</head>
<body>
  <div id="root">
    <h1>${escaped(title)}</h1>
    <p>${escaped(description)}</p>
    <p><a href="${escaped(canonical)}">View on Neeko Sports Stats</a></p>
  </div>
</body>
</html>`;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Always attach noindex headers for private paths, regardless of bot status
  if (isPrivatePath(pathname)) {
    const response = new Response(null, { status: 200 });
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    // Return null to let Vercel continue serving the page normally,
    // but attach the header. We use NextResponse pattern if available,
    // otherwise return early with headers on a pass-through.
    // In Vercel edge middleware: returning undefined passes through.
    // We attach the header by returning a modified response only for bots.
    const userAgent = request.headers.get("user-agent") || "";
    if (isBot(userAgent)) {
      return new Response(
        `<!doctype html><html><head><meta name="robots" content="noindex, nofollow" /><title>Private</title></head><body></body></html>`,
        {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "X-Robots-Tag": "noindex, nofollow",
          },
        }
      );
    }
    // For real users on private paths, pass through but inject header via NextResponse
    // Since we're in pure Vercel Edge middleware (not Next.js), we can't modify
    // pass-through responses directly. Return undefined to pass through.
    return;
  }

  const userAgent = request.headers.get("user-agent") || "";
  if (!isBot(userAgent)) {
    return;
  }

  // --- Player page: async slug validation ---
  const playerMatch = pathname.match(/^\/sports\/afl\/players\/([^/]+)$/);
  if (playerMatch) {
    const slug = playerMatch[1];

    // Step 1: structural check — reject obvious garbage immediately
    if (!isStructurallyValidPlayerSlug(slug)) {
      const meta = {
        title: "AFL Player Not Found | Neeko Sports Stats",
        description: DEFAULT_DESCRIPTION,
        canonical: `${DOMAIN}/sports/afl/players`,
        noindex: true,
      };
      return new Response(buildBotHTML(meta, pathname), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, s-maxage=300",
          "X-Prerender": "true",
          "X-Robots-Tag": "noindex, follow",
        },
      });
    }

    // Step 2: database lookup to confirm slug maps to a real player
    const lookup = await lookupPlayerSlug(slug);

    if (lookup.found === false) {
      // Definitively not found in database
      const meta = {
        title: "AFL Player Not Found | Neeko Sports Stats",
        description: DEFAULT_DESCRIPTION,
        canonical: `${DOMAIN}/sports/afl/players`,
        noindex: true,
      };
      return new Response(buildBotHTML(meta, pathname), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, s-maxage=300",
          "X-Prerender": "true",
          "X-Robots-Tag": "noindex, follow",
        },
      });
    }

    // found === true or null (timeout/error — give benefit of doubt if structurally valid)
    const playerName = lookup.playerName || playerNameFromSlug(slug);
    const team = lookup.team ? ` — ${lookup.team}` : "";
    const meta = {
      title: `${playerName} AFL Fantasy 2026 Stats, Form & Projection | Neeko Sports Stats`,
      description: `View ${playerName}${team} AFL Fantasy 2026 stats, recent form, price, season average, projection and fantasy analysis with Neeko Sports Stats.`,
      canonical: `${DOMAIN}/sports/afl/players/${slug}`,
    };
    return new Response(buildBotHTML(meta, pathname), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "X-Prerender": "true",
        "X-Robots-Tag": "index, follow",
      },
    });
  }

  // --- All other public pages ---
  const meta = getPageMeta(pathname);
  const html = buildBotHTML(meta, pathname);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "X-Prerender": "true",
      "X-Robots-Tag": meta.noindex ? "noindex, follow" : "index, follow",
    },
  });
}
