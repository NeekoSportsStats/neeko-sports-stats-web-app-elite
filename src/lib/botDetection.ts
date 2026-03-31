/**
 * Bot detection utility
 * Detects if the current request is from a search engine bot or crawler
 */

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
  'prerender',
];

let cachedBotStatus: boolean | null = null;

/**
 * Check if current request is from a bot
 * Uses user agent detection as primary method
 */
export function isBot(): boolean {
  if (cachedBotStatus !== null) {
    return cachedBotStatus;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  cachedBotStatus = BOT_USER_AGENTS.some(bot => userAgent.includes(bot));

  return cachedBotStatus;
}

/**
 * Reset cached bot status (for testing)
 */
export function resetBotDetection(): void {
  cachedBotStatus = null;
}
