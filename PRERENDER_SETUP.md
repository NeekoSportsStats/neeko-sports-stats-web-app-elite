# Prerender.io Integration for SEO

This project uses Prerender.io to serve pre-rendered HTML snapshots to search engine crawlers and social media bots, while regular users continue to receive the normal React single-page application.

## How It Works

1. **Bot Detection**: The Vercel Edge Middleware (`middleware.js`) detects incoming requests from search engine crawlers and social media bots by checking the User-Agent header.

2. **Route Filtering**: Only specific routes are prerendered (players, teams, positions, rankings pages).

3. **Prerender.io Service**: When a bot visits a target route, the middleware forwards the request to Prerender.io, which:
   - Renders the page in a headless browser
   - Waits for JavaScript to execute
   - Returns fully rendered HTML with all dynamic content

4. **Caching**: Prerendered content is cached for 1 hour on the edge and 24 hours on the CDN.

5. **Fallback**: If Prerender.io is unavailable or returns an error, the normal React app is served.

## Target Routes

The following routes are configured for prerendering:

- `/sports/afl/players/*` - All player pages
- `/sports/afl/teams/*` - All team pages
- `/sports/afl/positions/*` - All position pages
- `/sports/afl/rankings` - Rankings page

## Detected Bots

The middleware detects these crawlers:

- **Search Engines**: Googlebot, Bingbot, Yandex, Baidu, DuckDuckBot
- **Social Media**: Facebook, Twitter, LinkedIn, Pinterest, Reddit
- **Tools**: Lighthouse, Slackbot, WhatsApp, Telegram
- **Validators**: W3C Validator
- And many more (see `BOT_USER_AGENTS` in `middleware.js`)

## Setup Instructions

### 1. Create a Prerender.io Account

1. Go to [https://prerender.io](https://prerender.io)
2. Sign up for an account (free tier available)
3. Get your API token from the dashboard

### 2. Configure Environment Variable

Add your Prerender.io token to Vercel:

```bash
# Via Vercel CLI
vercel env add PRERENDER_TOKEN

# Or via Vercel Dashboard
# Project Settings > Environment Variables > Add New
# Name: PRERENDER_TOKEN
# Value: your_token_here
```

### 3. Deploy

The middleware is automatically deployed with your Vercel project. No additional configuration needed.

## Testing

### Test Bot Detection Locally

```bash
# Simulate Googlebot
curl -H "User-Agent: Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" \
  http://localhost:5173/sports/afl/players/aaron-cadman

# Simulate regular user
curl -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  http://localhost:5173/sports/afl/players/aaron-cadman
```

### Test on Production

```bash
# Check if prerendered content is served
curl -H "User-Agent: Mozilla/5.0 (compatible; Googlebot/2.1)" \
  https://neekostats.com.au/sports/afl/players/aaron-cadman \
  -I | grep -i "x-prerender"

# Should return: x-prerender: true
```

### Verify in Google Search Console

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Use "URL Inspection" tool
3. Test any player/team page
4. Check "View Crawled Page" to see the HTML Googlebot receives

## Benefits

✅ **Instant Indexing**: Search engines see fully rendered HTML immediately
✅ **Better Rankings**: Google can index all dynamic content
✅ **Rich Previews**: Social media platforms get full metadata for link previews
✅ **No Client Changes**: Your React app remains unchanged
✅ **Edge Caching**: Prerendered content is cached for fast delivery
✅ **Automatic Updates**: Prerender.io re-crawls periodically to update cached content

## Monitoring

### Check Prerender.io Dashboard

- View crawl statistics
- See cache hit rates
- Monitor API usage
- Review crawled pages

### Vercel Logs

Check Edge Middleware logs in Vercel dashboard for:
- Bot detection events
- Prerender.io response times
- Any errors or fallbacks

## Troubleshooting

### Pages Not Being Indexed

1. Verify `PRERENDER_TOKEN` is set in Vercel environment variables
2. Check middleware.js is deployed (should be in your deployment)
3. Test with curl to confirm bot detection works
4. Check Prerender.io dashboard for crawl errors

### Prerender.io Returning Errors

- Check your Prerender.io account quota (free tier has limits)
- Verify the token is valid
- Check Prerender.io status page
- The middleware will automatically fall back to serving the normal app

### Bot Not Detected

- Verify the User-Agent is in the `BOT_USER_AGENTS` list
- Check Vercel function logs for middleware execution
- Test with a known bot User-Agent string

## Cost Considerations

**Prerender.io Free Tier**:
- 250 pages cached
- Unlimited recaching
- Perfect for most projects

**Paid Tiers** (if you need more):
- 1,000 pages: $20/month
- 10,000 pages: $200/month
- Enterprise: Custom pricing

With 679 player pages + team/position pages, you'll need at least the paid tier or implement selective prerendering.

## Alternative: Selective Prerendering

To stay within free tier limits, you can modify `middleware.js` to only prerender:

1. Top 100 players by popularity
2. Featured team pages
3. Main ranking page

Update the `shouldPrerender()` function to implement custom logic.

## Files

- `middleware.js` - Edge middleware for bot detection and Prerender.io integration
- `vercel.json` - Vercel configuration (no changes needed for middleware)
- `.env.example` - Environment variable template
- `PRERENDER_SETUP.md` - This documentation

## Further Reading

- [Prerender.io Documentation](https://docs.prerender.io/)
- [Vercel Edge Middleware](https://vercel.com/docs/functions/edge-middleware)
- [Google SEO Starter Guide](https://developers.google.com/search/docs/beginner/seo-starter-guide)
