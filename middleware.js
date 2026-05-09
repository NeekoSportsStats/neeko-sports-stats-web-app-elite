export const config = {
  matcher: [
    "/",
    "/about",
    "/faq",
    "/neeko-plus",
    "/contact",
    "/fantasy",
    "/fantasy/rankings",
    "/fantasy/market-watch",
    "/fantasy/current-week",
    "/fantasy/captains",
    "/fantasy/edge-board",
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
  "AFL Fantasy rankings, Stat Board, captain picks, price movers and weekly projections built to give fantasy coaches a data edge.";

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

  if (p === "/fantasy/current-week") {
    return {
      title: "AFL Fantasy Current Round 2026 — Captain Picks, Must Buys & Traps | Neeko Sports Stats",
      description:
        "Current round AFL Fantasy cheat sheet with captain picks, value plays, trap alerts and weekly projection-based decision tools.",
      canonical: `${DOMAIN}/fantasy/current-week`,
    };
  }

  if (p === "/fantasy/captains") {
    return {
      title: "AFL Fantasy Captain Picks 2026 — Lock, Safe & POD Options | Neeko Sports Stats",
      description:
        "AFL Fantasy captain picks ranked by projection, ceiling, recent form and confidence for the current round.",
      canonical: `${DOMAIN}/fantasy/captains`,
    };
  }

  if (p === "/fantasy/edge-board") {
    return {
      title: "AFL Fantasy Edge Board 2026 — Trade Signals & Player Value | Neeko Sports Stats",
      description:
        "AFL Fantasy edge board showing weekly trade signals, value gaps, breakout candidates and avoid calls based on player statistics.",
      canonical: `${DOMAIN}/fantasy/edge-board`,
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

  if (p === "/sports/afl/rankings") {
    return {
      title: "AFL Fantasy Rankings 2026 — Player Projections & Value | Neeko Sports Stats",
      description:
        "AFL Fantasy player rankings for 2026 with projected scores, value ratings, trends, form signals and weekly buy, hold and avoid calls.",
      canonical: `${DOMAIN}/fantasy/rankings`,
    };
  }

  if (p === "/sports/afl/market-watch") {
    return {
      title: "AFL Fantasy Market Watch 2026 — Price Movers & Value Targets | Neeko Sports Stats",
      description:
        "Track AFL Fantasy price movers, value targets, trap alerts and underpriced players using weekly stat-generated market signals.",
      canonical: `${DOMAIN}/fantasy/market-watch`,
    };
  }

  if (p === "/sports/afl/edge-board") {
    return {
      title: "AFL Fantasy Edge Board 2026 — Trade Signals & Player Value | Neeko Sports Stats",
      description:
        "AFL Fantasy edge board showing weekly trade signals, value gaps, breakout candidates and avoid calls based on player statistics.",
      canonical: `${DOMAIN}/fantasy/edge-board`,
    };
  }

  if (p === "/sports/afl/current-round") {
    return {
      title: "AFL Fantasy Current Round 2026 — Captain Picks, Must Buys & Traps | Neeko Sports Stats",
      description:
        "Current round AFL Fantasy cheat sheet with captain picks, value plays, trap alerts and weekly projection-based decision tools.",
      canonical: `${DOMAIN}/fantasy/current-week`,
    };
  }

  if (p === "/sports/afl/start-sit") {
    return {
      title: "AFL Fantasy Hub 2026 — Rankings, Captains & Market Watch | Neeko Sports Stats",
      description:
        "AFL Fantasy rankings, captain picks, value targets and trap alerts for the current round. Stat-generated weekly decision tools from Neeko Sports Stats.",
      canonical: `${DOMAIN}/fantasy`,
    };
  }

  if (p === "/sports/afl/captains") {
    return {
      title: "AFL Fantasy Captain Picks 2026 — Lock, Safe & POD Options | Neeko Sports Stats",
      description:
        "AFL Fantasy captain picks ranked by projection, ceiling, recent form and confidence for the current round.",
      canonical: `${DOMAIN}/fantasy/captains`,
    };
  }

  if (p === "/sports/afl/players") {
    return {
      title: "AFL Fantasy Players 2026 — Full Player List & Stats | Neeko",
      description:
        "Browse all AFL Fantasy players for 2026. Stats, projections, prices and trade signals powered by Neeko AI.",
      canonical: `${DOMAIN}/sports/afl/players`,
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
    title: "Neeko Sports Stats — AFL Fantasy Rankings, Stats & Projections 2026",
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
