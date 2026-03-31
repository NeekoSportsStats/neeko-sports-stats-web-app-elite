#!/usr/bin/env node

/**
 * Test script for bot detection logic
 * Validates that the middleware correctly identifies bots and target routes
 */

// Bot user agents (from middleware.js)
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
];

// Routes that should be prerendered
const PRERENDER_ROUTES = [
  '/sports/afl/players/',
  '/sports/afl/teams/',
  '/sports/afl/positions/',
  '/sports/afl/rankings',
];

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((bot) => ua.includes(bot));
}

function shouldPrerender(pathname) {
  return PRERENDER_ROUTES.some(
    (route) => pathname.startsWith(route) || pathname === route
  );
}

// Test cases
const testCases = [
  // Bot user agents that SHOULD be detected
  {
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    expectedBot: true,
    description: 'Googlebot',
  },
  {
    userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    expectedBot: true,
    description: 'Bingbot',
  },
  {
    userAgent: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    expectedBot: true,
    description: 'Facebook External Hit',
  },
  {
    userAgent: 'Twitterbot/1.0',
    expectedBot: true,
    description: 'Twitterbot',
  },
  {
    userAgent: 'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)',
    expectedBot: true,
    description: 'Google Inspection Tool',
  },
  {
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 Chrome/96.0.4664.110 Safari/537.36 Chrome-Lighthouse',
    expectedBot: true,
    description: 'Chrome Lighthouse',
  },
  // Regular user agents that should NOT be detected as bots
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    expectedBot: false,
    description: 'Chrome on Windows',
  },
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    expectedBot: false,
    description: 'Chrome on macOS',
  },
  {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
    expectedBot: false,
    description: 'Safari on iPhone',
  },
];

const routeTests = [
  // Routes that SHOULD be prerendered
  { path: '/sports/afl/players/aaron-cadman', expected: true },
  { path: '/sports/afl/players/max-gawn', expected: true },
  { path: '/sports/afl/teams/richmond-tigers', expected: true },
  { path: '/sports/afl/teams/collingwood-magpies', expected: true },
  { path: '/sports/afl/positions/midfielder', expected: true },
  { path: '/sports/afl/rankings', expected: true },
  // Routes that should NOT be prerendered
  { path: '/', expected: false },
  { path: '/about', expected: false },
  { path: '/contact', expected: false },
  { path: '/auth', expected: false },
  { path: '/admin', expected: false },
];

console.log('🤖 Testing Bot Detection Logic\n');
console.log('=' .repeat(60));

// Test bot detection
console.log('\n📱 User Agent Detection Tests:\n');
let botPassed = 0;
let botFailed = 0;

testCases.forEach((test) => {
  const result = isBot(test.userAgent);
  const passed = result === test.expectedBot;

  if (passed) {
    botPassed++;
    console.log(`✅ ${test.description}: ${result ? 'BOT' : 'USER'}`);
  } else {
    botFailed++;
    console.log(`❌ ${test.description}: Expected ${test.expectedBot ? 'BOT' : 'USER'}, got ${result ? 'BOT' : 'USER'}`);
  }
});

// Test route matching
console.log('\n🛣️  Route Prerender Tests:\n');
let routePassed = 0;
let routeFailed = 0;

routeTests.forEach((test) => {
  const result = shouldPrerender(test.path);
  const passed = result === test.expected;

  if (passed) {
    routePassed++;
    console.log(`✅ ${test.path}: ${result ? 'PRERENDER' : 'SKIP'}`);
  } else {
    routeFailed++;
    console.log(`❌ ${test.path}: Expected ${test.expected ? 'PRERENDER' : 'SKIP'}, got ${result ? 'PRERENDER' : 'SKIP'}`);
  }
});

// Summary
console.log('\n' + '=' .repeat(60));
console.log('\n📊 Test Summary:\n');
console.log(`Bot Detection: ${botPassed}/${testCases.length} passed`);
console.log(`Route Matching: ${routePassed}/${routeTests.length} passed`);

const totalPassed = botPassed + routePassed;
const totalTests = testCases.length + routeTests.length;

if (botFailed === 0 && routeFailed === 0) {
  console.log(`\n✅ All tests passed! (${totalPassed}/${totalTests})`);
  process.exit(0);
} else {
  console.log(`\n❌ Some tests failed (${totalPassed}/${totalTests} passed)`);
  process.exit(1);
}
