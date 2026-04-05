export const config = {
  matcher: [
    "/",
    "/sports/afl/rankings",
    "/sports/afl/market-watch",
    "/sports/afl/edge-board",
    "/sports/afl/current-round",
    "/sports/afl/start-sit",
    "/sports/afl/players/:slug*",
    "/sports/afl/teams/:team*",
    "/sports/afl/positions/:position*",
    "/sports/afl/round/:roundNumber*",
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

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_AGENTS.some((bot) => ua.includes(bot));
}

const DOMAIN = "https://neekostats.com.au";
const DEFAULT_IMAGE = `${DOMAIN}/og-default.png`;
const DEFAULT_DESCRIPTION =
  "AI-powered AFL Fantasy projections, rankings, trade targets and Start/Sit analysis built to give fantasy coaches an edge.";

function slugToTitle(slug) {
  if (!slug) return "";
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getPageMeta(pathname) {
  const p = pathname.replace(/\/$/, "") || "/";

  if (p === "/") {
    return {
      title: "Neeko Sports Stats — AI AFL Fantasy Projections",
      description: DEFAULT_DESCRIPTION,
      canonical: DOMAIN,
    };
  }

  if (p === "/sports/afl/rankings") {
    return {
      title: "AFL Fantasy Rankings 2026 — AI Player Projections | Neeko",
      description:
        "AI-powered AFL Fantasy player rankings with projected scores, value ratings, trade targets and buy/sell recommendations for 2026.",
      canonical: `${DOMAIN}/sports/afl/rankings`,
    };
  }

  if (p === "/sports/afl/market-watch") {
    return {
      title: "AFL Fantasy Market Watch — Price Movers & Trade Targets | Neeko",
      description:
        "Track AFL Fantasy price movements, buy targets, sell signals and breakout candidates in real time with Neeko's Market Watch.",
      canonical: `${DOMAIN}/sports/afl/market-watch`,
    };
  }

  if (p === "/sports/afl/edge-board") {
    return {
      title: "AFL Fantasy Edge Board — Breakout & Trade Signals | Neeko",
      description:
        "AFL Fantasy trade signals, breakout players, and do-not-start alerts powered by Neeko's edge scoring model.",
      canonical: `${DOMAIN}/sports/afl/edge-board`,
    };
  }

  if (p === "/sports/afl/current-round") {
    return {
      title: "AFL Fantasy Current Round — Projections & Lineup Tips | Neeko",
      description:
        "AFL Fantasy projections, matchup analysis and lineup recommendations for the current round.",
      canonical: `${DOMAIN}/sports/afl/current-round`,
    };
  }

  if (p === "/sports/afl/start-sit") {
    return {
      title: "AFL Fantasy Start/Sit Tool — Who To Play This Round | Neeko",
      description:
        "AI-powered AFL Fantasy Start/Sit recommendations. Enter your two players and get a data-driven verdict for this round.",
      canonical: `${DOMAIN}/sports/afl/start-sit`,
    };
  }

  const playerMatch = p.match(/^\/sports\/afl\/players\/([^/]+)$/);
  if (playerMatch) {
    const name = slugToTitle(playerMatch[1]);
    return {
      title: `${name} AFL Fantasy Stats & Projections 2026 | Neeko`,
      description: `${name} AFL Fantasy stats, projections, price history and trade analysis for the 2026 season. Powered by Neeko AI.`,
      canonical: `${DOMAIN}${p}`,
    };
  }

  const teamMatch = p.match(/^\/sports\/afl\/teams\/([^/]+)$/);
  if (teamMatch) {
    const team = slugToTitle(teamMatch[1]);
    return {
      title: `${team} AFL Fantasy Players & Stats 2026 | Neeko`,
      description: `${team} AFL Fantasy player stats, projections, rankings and trade targets for the 2026 season.`,
      canonical: `${DOMAIN}${p}`,
    };
  }

  const positionMatch = p.match(/^\/sports\/afl\/positions\/([^/]+)$/);
  if (positionMatch) {
    const pos = slugToTitle(positionMatch[1]);
    return {
      title: `${pos} AFL Fantasy Rankings & Projections 2026 | Neeko`,
      description: `Top AFL Fantasy ${pos} players ranked by AI projection for the 2026 season. Stats, prices and trade targets.`,
      canonical: `${DOMAIN}${p}`,
    };
  }

  const roundMatch = p.match(/^\/sports\/afl\/round\/(\d+)$/);
  if (roundMatch) {
    const round = roundMatch[1];
    return {
      title: `AFL Fantasy Round ${round} Results & Stats 2026 | Neeko`,
      description: `AFL Fantasy Round ${round} 2026 results, player scores, matchup stats and projection accuracy breakdown.`,
      canonical: `${DOMAIN}${p}`,
    };
  }

  return {
    title: "Neeko Sports Stats — AI AFL Fantasy Projections",
    description: DEFAULT_DESCRIPTION,
    canonical: `${DOMAIN}${p}`,
  };
}

function buildBotHTML(meta, pathname) {
  const { title, description, canonical } = meta;
  const escaped = (s) =>
    s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escaped(title)}</title>
  <meta name="description" content="${escaped(description)}" />
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

export default function middleware(request) {
  const userAgent = request.headers.get("user-agent") || "";

  if (!isBot(userAgent)) {
    return;
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  const BLOCKED = ["/admin", "/account", "/billing", "/checkout", "/success", "/cancel", "/functions/"];
  if (BLOCKED.some((b) => pathname.startsWith(b))) {
    return;
  }

  const meta = getPageMeta(pathname);
  const html = buildBotHTML(meta, pathname);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "X-Prerender": "true",
      "X-Robots-Tag": "index, follow",
    },
  });
}
