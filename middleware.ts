import { lastUpdated as privacyLastUpdated, title as privacyTitle, description as privacyDescription, sections as privacySections } from "./src/content/privacyPolicy";
import { lastUpdated as deleteLastUpdated, title as deleteTitle, description as deleteDescription, sections as deleteSections } from "./src/content/deleteData";

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
    "/stat-board",
    "/stat-board/players",
    "/stat-board/teams",
    "/stat-board/match-centre",
    "/sports/afl/players",
    "/sports/afl/players/:slug*",
    "/sports/afl/teams/:team*",
    "/sports/afl/positions/:position*",
    "/sports/afl/round/:roundNumber*",
    "/privacy-policy",
    "/delete-data",
    "/policies",
    "/terms-conditions",
    "/refund-policy",
    "/security-policy",
    "/user-conduct-policy",
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

function isBot(userAgent: string): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_AGENTS.some((bot) => ua.includes(bot));
}

const DOMAIN = "https://neekostats.com.au";
const DEFAULT_IMAGE = `${DOMAIN}/og-default.png`;
const DEFAULT_DESCRIPTION =
  "AI-powered AFL Fantasy projections, rankings, trade targets and Start/Sit analysis built to give fantasy coaches an edge.";

function slugToTitle(slug: string): string {
  if (!slug) return "";
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getPageMeta(pathname: string): { title: string; description: string; canonical: string } {
  const p = pathname.replace(/\/$/, "") || "/";

  if (p === "/") {
    return {
      title: "Neeko Sports Stats — AI AFL Fantasy Projections",
      description: DEFAULT_DESCRIPTION,
      canonical: DOMAIN,
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

  if (p === "/fantasy") {
    return {
      title: "AFL Fantasy Hub — Rankings, Market Watch & Trade Tools | Neeko",
      description:
        "Your AFL Fantasy command centre. AI-powered player rankings, price movement alerts, trade targets and captain signals — all in one place.",
      canonical: `${DOMAIN}/fantasy`,
    };
  }

  if (p === "/fantasy/rankings") {
    return {
      title: "AFL Fantasy Rankings 2026 — AI Player Projections | Neeko",
      description:
        "AI-powered AFL Fantasy player rankings with projected scores, value ratings, trade targets and buy/sell recommendations for 2026.",
      canonical: `${DOMAIN}/fantasy/rankings`,
    };
  }

  if (p === "/fantasy/market-watch") {
    return {
      title: "AFL Fantasy Market Watch — Price Movers & Trade Targets | Neeko",
      description:
        "Track AFL Fantasy price movements, buy targets, sell signals and breakout candidates in real time with Neeko's Market Watch.",
      canonical: `${DOMAIN}/fantasy/market-watch`,
    };
  }

  if (p === "/fantasy/current-week") {
    return {
      title: "AFL Fantasy Current Round — Projections & Lineup Tips | Neeko",
      description:
        "AFL Fantasy projections, matchup analysis and lineup recommendations for the current round. Powered by Neeko AI.",
      canonical: `${DOMAIN}/fantasy/current-week`,
    };
  }

  if (p === "/stat-board") {
    return {
      title: "AFL Fantasy Stat Board — Live Player Stats & Scores | Neeko",
      description:
        "Real-time AFL Fantasy stat board. Track player scores, disposals, goals and fantasy points by round, team and position.",
      canonical: `${DOMAIN}/stat-board`,
    };
  }

  if (p === "/stat-board/players") {
    return {
      title: "AFL Fantasy Player Stats Board 2026 | Neeko",
      description:
        "Browse AFL Fantasy player stats by round. Compare scores, averages, and form across the 2026 season.",
      canonical: `${DOMAIN}/stat-board/players`,
    };
  }

  if (p === "/stat-board/teams") {
    return {
      title: "AFL Fantasy Team Stats Board 2026 | Neeko",
      description:
        "AFL team-by-team fantasy stat breakdown for 2026. Identify high-scoring teams and matchup opportunities.",
      canonical: `${DOMAIN}/stat-board/teams`,
    };
  }

  if (p === "/stat-board/match-centre") {
    return {
      title: "AFL Fantasy Match Centre — Game Stats & Scores | Neeko",
      description:
        "AFL Fantasy match centre with per-game stats, player scores and fantasy point breakdowns for every 2026 round.",
      canonical: `${DOMAIN}/stat-board/match-centre`,
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
    title: "Neeko Sports Stats — AI AFL Fantasy Projections",
    description: DEFAULT_DESCRIPTION,
    canonical: `${DOMAIN}${p}`,
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildBotHTML(meta: { title: string; description: string; canonical: string }, _pathname: string): string {
  const { title, description, canonical } = meta;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="author" content="Neeko Sports Stats" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${esc(canonical)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${DEFAULT_IMAGE}" />
  <meta property="og:site_name" content="Neeko Sports Stats" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@neekostats" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${DEFAULT_IMAGE}" />
  <link rel="icon" type="image/png" href="/logo.png" />
</head>
<body>
  <div id="root">
    <h1>${esc(title)}</h1>
    <p>${esc(description)}</p>
    <p><a href="${esc(canonical)}">View on Neeko Sports Stats</a></p>
  </div>
</body>
</html>`;
}

// --- Legal page prerendering ---

const LEGAL_ROUTES = new Set([
  "/privacy-policy",
  "/delete-data",
  "/policies",
  "/terms-conditions",
  "/refund-policy",
  "/security-policy",
  "/user-conduct-policy",
]);

interface LegalSection {
  num?: number;
  heading: string;
  paragraphs?: string[];
  bullets?: { label?: string; text: string }[];
  closingParagraphs?: string[];
  cards?: { title: string; body: string }[];
  boldFirstParagraph?: boolean;
}

function renderLegalSections(sections: LegalSection[]): string {
  const parts: string[] = [];
  for (const section of sections) {
    const numLabel = section.num ? `${section.num}. ` : "";
    if (section.heading) {
      parts.push(`<h2>${esc(numLabel + section.heading)}</h2>`);
    }
    if (section.paragraphs) {
      for (let i = 0; i < section.paragraphs.length; i++) {
        const p = section.paragraphs[i];
        if (section.boldFirstParagraph && i === 0) {
          parts.push(`<p><strong>${esc(p)}</strong></p>`);
        } else {
          parts.push(`<p>${esc(p)}</p>`);
        }
      }
    }
    if (section.bullets && section.bullets.length > 0) {
      parts.push("<ul>");
      for (const b of section.bullets) {
        const label = b.label ? `<strong>${esc(b.label)}:</strong> ` : "";
        parts.push(`<li>${label}${esc(b.text)}</li>`);
      }
      parts.push("</ul>");
    }
    if (section.cards) {
      for (const card of section.cards) {
        parts.push(`<div><strong>${esc(card.title)}</strong><p>${esc(card.body)}</p></div>`);
      }
    }
    if (section.closingParagraphs) {
      for (const p of section.closingParagraphs) {
        parts.push(`<p>${esc(p)}</p>`);
      }
    }
  }
  return parts.join("\n");
}

function buildPrivacyPolicyHTML(): string {
  const canonical = `${DOMAIN}/privacy-policy`;
  const body = renderLegalSections(privacySections as LegalSection[]);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(privacyTitle)}</title>
  <meta name="description" content="${esc(privacyDescription)}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:title" content="${esc(privacyTitle)}">
  <meta property="og:description" content="${esc(privacyDescription)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(privacyTitle)}">
  <meta name="twitter:description" content="${esc(privacyDescription)}">
  <link rel="icon" type="image/png" href="/logo.png">
</head>
<body>
  <h1>Privacy Policy</h1>
  <p>Last updated: ${esc(privacyLastUpdated)}</p>
  ${body}
</body>
</html>`;
}

function buildDeleteDataHTML(): string {
  const canonical = `${DOMAIN}/delete-data`;
  const body = renderLegalSections(deleteSections as LegalSection[]);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(deleteTitle)}</title>
  <meta name="description" content="${esc(deleteDescription)}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:title" content="${esc(deleteTitle)}">
  <meta property="og:description" content="${esc(deleteDescription)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(deleteTitle)}">
  <meta name="twitter:description" content="${esc(deleteDescription)}">
  <link rel="icon" type="image/png" href="/logo.png">
</head>
<body>
  <h1>Delete your Neeko Stats data</h1>
  <p>Last updated: ${esc(deleteLastUpdated)}</p>
  ${body}
</body>
</html>`;
}

const SIMPLE_LEGAL_PAGES: Record<string, { title: string; description: string }> = {
  "/policies": {
    title: "Policies — Neeko Stats",
    description: "Legal policies and terms for Neeko Stats.",
  },
  "/terms-conditions": {
    title: "Terms & Conditions — Neeko Stats",
    description: "Terms and conditions for using Neeko Stats.",
  },
  "/refund-policy": {
    title: "Refund Policy — Neeko Stats",
    description: "Refund policy for Neeko Pro subscriptions.",
  },
  "/security-policy": {
    title: "Security Policy — Neeko Stats",
    description: "Security practices and policies for Neeko Stats.",
  },
  "/user-conduct-policy": {
    title: "User Conduct Policy — Neeko Stats",
    description: "User conduct policy for Neeko Stats.",
  },
};

function buildSimpleLegalHTML(pathname: string): string {
  const meta = SIMPLE_LEGAL_PAGES[pathname];
  const canonical = `${DOMAIN}${pathname}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.description)}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:title" content="${esc(meta.title)}">
  <meta property="og:description" content="${esc(meta.description)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(meta.title)}">
  <meta name="twitter:description" content="${esc(meta.description)}">
  <link rel="icon" type="image/png" href="/logo.png">
</head>
<body>
  <h1>${esc(meta.title.replace(" — Neeko Stats", ""))}</h1>
  <p><a href="${esc(canonical)}">View the full page on Neeko Stats</a></p>
</body>
</html>`;
}

function buildLegalHTML(pathname: string): string {
  if (pathname === "/privacy-policy") return buildPrivacyPolicyHTML();
  if (pathname === "/delete-data") return buildDeleteDataHTML();
  return buildSimpleLegalHTML(pathname);
}

function htmlResponse(html: string): Response {
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

export default function middleware(request: Request): Response | undefined {
  const userAgent = request.headers.get("user-agent") || "";
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Legal routes: serve prerendered HTML to ALL requests
  if (LEGAL_ROUTES.has(pathname)) {
    return htmlResponse(buildLegalHTML(pathname));
  }

  // Everything else: bot-only prerendering (unchanged from original)
  if (!isBot(userAgent)) {
    return;
  }

  const BLOCKED = ["/admin", "/account", "/billing", "/checkout", "/success", "/cancel", "/functions/"];
  if (BLOCKED.some((b) => pathname.startsWith(b))) {
    return;
  }

  const meta = getPageMeta(pathname);
  const html = buildBotHTML(meta, pathname);

  return htmlResponse(html);
}
