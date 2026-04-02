// Vercel Edge Middleware for Prerender.io integration
// This runs on Vercel's edge network before the request reaches your app

// Bot user agents that should receive prerendered content
const BOT_USER_AGENTS = [
  'googlebot',
  'google-inspectiontool',
  'bingbot',
  'slurp',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'sogou',
  'exabot',
  'facebot',
  'facebookexternalhit',
  'twitterbot',
  'rogerbot',
  'linkedinbot',
  'embedly',
  'quora link preview',
  'showyoubot',
  'outbrain',
  'pinterest',
  'developers.google.com/+/web/snippet',
  'slackbot',
  'vkshare',
  'w3c_validator',
  'redditbot',
  'applebot',
  'whatsapp',
  'flipboard',
  'tumblr',
  'bitlybot',
  'skypeuripreview',
  'nuzzel',
  'discordbot',
  'qwantify',
  'pinterestbot',
  'bitrix link preview',
  'xing-contenttabreceiver',
  'chrome-lighthouse',
  'telegrambot',
  // AI Search Engines & Crawlers (2025-2026)
  'gptbot',                    // OpenAI ChatGPT
  'chatgpt-user',              // OpenAI ChatGPT user agent
  'claudebot',                 // Anthropic Claude
  'anthropic-ai',              // Anthropic AI
  'cohere-ai',                 // Cohere AI
  'perplexitybot',             // Perplexity AI
  'you-bot',                   // You.com
  'diffbot',                   // Diffbot AI
  'ai2bot',                    // AI2 (Allen Institute)
  'meta-externalagent',        // Meta AI
  'amazonbot',                 // Amazon Alexa
  'applebot-extended',         // Apple Intelligence
  'bytespider',                // ByteDance (TikTok)
  'petalbot',                  // Huawei Petal Search
];

// Routes that should be prerendered for bots
const PRERENDER_ROUTES = [
  '/',
  '/sports/afl/players/',
  '/sports/afl/teams/',
  '/sports/afl/positions/',
  '/sports/afl/rankings',
];

/**
 * Check if the user agent is a bot
 */
function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((bot) => ua.includes(bot));
}

/**
 * Check if the pathname should be prerendered
 */
function shouldPrerender(pathname) {
  return PRERENDER_ROUTES.some(
    (route) => pathname.startsWith(route) || pathname === route
  );
}

/**
 * Main middleware function
 */
export default async function middleware(request) {
  const userAgent = request.headers.get('user-agent') || '';
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Skip prerendering for non-bot traffic or non-target routes
  if (!isBot(userAgent) || !shouldPrerender(pathname)) {
    return;
  }

  // Check if we have a prerender token configured
  const prerenderToken = process.env.PRERENDER_TOKEN;

  if (!prerenderToken) {
    console.warn('PRERENDER_TOKEN not configured, serving normal app to bot');
    return;
  }

  try {
    // Build the prerender.io URL
    const prerenderUrl = `https://service.prerender.io/${request.url}`;

    // Fetch the prerendered content
    const response = await fetch(prerenderUrl, {
      headers: {
        'X-Prerender-Token': prerenderToken,
        'User-Agent': userAgent,
      },
      // 10 second timeout
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const html = await response.text();

      // Return the prerendered HTML with appropriate headers
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600, s-maxage=86400',
          'X-Prerender': 'true',
          'X-Robots-Tag': 'all',
          'Vary': 'User-Agent',
        },
      });
    } else {
      console.error(`Prerender.io returned status ${response.status}`);
    }
  } catch (error) {
    console.error('Prerender.io error:', error.message);
  }

  // Fall through to serve normal React app if prerendering fails
  return;
}

// Configure which routes this middleware should run on
export const config = {
  matcher: [
    '/',
    '/sports/afl/players/:path*',
    '/sports/afl/teams/:path*',
    '/sports/afl/positions/:path*',
    '/sports/afl/rankings',
  ],
};
