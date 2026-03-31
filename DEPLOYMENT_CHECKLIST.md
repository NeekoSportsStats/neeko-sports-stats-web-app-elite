# Deployment Checklist - Prerender.io SEO Setup

## ✅ Pre-Deployment Checklist

Before deploying the Prerender.io integration to production, ensure the following:

### 1. Prerender.io Account Setup

- [ ] Create account at [prerender.io](https://prerender.io)
- [ ] Verify email and complete signup
- [ ] Get API token from dashboard
- [ ] Choose appropriate pricing tier (consider 679 player pages + team/position pages)

### 2. Environment Variables

Add `PRERENDER_TOKEN` to Vercel:

**Option A: Via Vercel Dashboard**
1. Go to your project in Vercel
2. Navigate to Settings > Environment Variables
3. Click "Add New"
4. Name: `PRERENDER_TOKEN`
5. Value: Your Prerender.io token
6. Environment: Production (and Preview if desired)
7. Save

**Option B: Via Vercel CLI**
```bash
vercel env add PRERENDER_TOKEN production
# Paste your token when prompted
```

### 3. Files to Deploy

Ensure these files are committed:

- [x] `middleware.js` - Bot detection and Prerender.io integration
- [x] `vercel.json` - Vercel configuration (already exists)
- [x] `public/sitemap.xml` - Updated sitemap with all 706 URLs
- [x] `.env.example` - Environment variable documentation
- [x] `PRERENDER_SETUP.md` - Integration documentation
- [x] `scripts/test-bot-detection.js` - Test script

### 4. Verification Steps

After deployment:

```bash
# Test 1: Verify middleware is deployed
curl -I https://neekostats.com.au/sports/afl/players/aaron-cadman

# Test 2: Verify bot receives prerendered content
curl -H "User-Agent: Mozilla/5.0 (compatible; Googlebot/2.1)" \
  https://neekostats.com.au/sports/afl/players/aaron-cadman \
  | grep -i "x-prerender"
# Should output: x-prerender: true

# Test 3: Verify regular users get React app
curl -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \
  https://neekostats.com.au/sports/afl/players/aaron-cadman \
  | grep -i "x-prerender"
# Should output nothing (no prerender header)
```

## 📊 Post-Deployment Monitoring

### Week 1: Initial Setup

- [ ] Check Prerender.io dashboard for initial crawls
- [ ] Verify cache is being populated
- [ ] Monitor Vercel function logs for middleware execution
- [ ] Check no errors in Vercel deployment logs

### Week 2-4: SEO Impact

- [ ] Submit sitemap to Google Search Console
- [ ] Use URL Inspection tool to verify Google sees rendered content
- [ ] Monitor indexing progress (expect 50-100 pages indexed per day)
- [ ] Check for crawl errors in Search Console

### Ongoing Monitoring

**Prerender.io Dashboard** - Check weekly:
- Cache hit rate (should be >90% after initial crawls)
- API usage (ensure within quota)
- Recache frequency
- Error rate (should be <1%)

**Google Search Console** - Check weekly:
- Indexed pages (target: 700+ within 4-6 weeks)
- Coverage report for errors
- Core Web Vitals for crawlers
- Click-through rates

**Vercel Logs** - Monitor for:
- Middleware execution times (should be <100ms for cache hits)
- Prerender.io timeout errors
- 5xx errors from Prerender.io service

## 🚨 Troubleshooting

### Issue: Pages Not Being Indexed

**Check:**
1. Is `PRERENDER_TOKEN` set in Vercel environment variables?
2. Run local test: `npm run test:prerender` (should pass all tests)
3. Verify sitemap is accessible: `curl https://neekostats.com.au/sitemap.xml`
4. Check robots.txt allows crawling
5. Use Google URL Inspection tool to see what Google sees

**Fix:**
- Ensure middleware.js is deployed (check Vercel deployment)
- Verify Prerender.io account is active
- Check Prerender.io dashboard for errors
- Revalidate cache in Prerender.io dashboard

### Issue: Prerender.io Quota Exceeded

**Symptoms:**
- Middleware logs show "quota exceeded" errors
- 403 responses from Prerender.io

**Fix:**
- Upgrade Prerender.io plan
- Or implement selective prerendering (see PRERENDER_SETUP.md)
- Monitor cache hit rate to reduce API calls

### Issue: Slow Response Times

**Symptoms:**
- Googlebot timeout errors in Search Console
- Middleware taking >10 seconds

**Check:**
- Prerender.io service status
- Your site's load time (test with Lighthouse)
- Database query performance

**Fix:**
- Increase middleware timeout in vercel.json (max 10s for Edge Functions)
- Optimize page load time
- Contact Prerender.io support if service is slow

## 📈 Expected Results

### Timeline

**Week 1:**
- Middleware deployed and detecting bots
- Prerender.io cache being populated
- 0-50 pages indexed

**Week 2-3:**
- 100-300 pages indexed
- Rich snippets appearing in search results
- Social media link previews working

**Week 4-6:**
- 500-700 pages indexed
- Improved search rankings for player names
- Increased organic traffic

### Success Metrics

**Technical:**
- ✅ Cache hit rate >90%
- ✅ Bot detection rate >99%
- ✅ Prerender.io API errors <1%
- ✅ Middleware response time <100ms

**SEO:**
- ✅ 700+ pages indexed in Google
- ✅ Rich snippets for player pages
- ✅ Social media previews functional
- ✅ 50%+ increase in organic impressions (3-6 months)

## 🔄 Maintenance

### Monthly Tasks

- [ ] Review Prerender.io usage vs quota
- [ ] Check Google Search Console for new issues
- [ ] Verify sitemap is up to date
- [ ] Monitor indexing rate

### Quarterly Tasks

- [ ] Review Prerender.io pricing tier (upgrade if needed)
- [ ] Analyze SEO impact (traffic, rankings, conversions)
- [ ] Update bot user agent list if needed
- [ ] Test new pages are being prerendered correctly

### When Adding New Pages

1. Update sitemap.xml if needed
2. Verify route matches `PRERENDER_ROUTES` in middleware.js
3. Test with curl + bot user agent
4. Submit to Google Search Console

## 📚 Resources

- [Prerender.io Documentation](https://docs.prerender.io/)
- [Google Search Console](https://search.google.com/search-console)
- [Vercel Edge Functions](https://vercel.com/docs/functions/edge-functions)
- [Project Documentation](./PRERENDER_SETUP.md)

## 🆘 Support

**Prerender.io Issues:**
- Email: support@prerender.io
- Dashboard: https://prerender.io/dashboard

**Vercel Issues:**
- Support: https://vercel.com/support
- Documentation: https://vercel.com/docs

**Google Search Console:**
- Help Center: https://support.google.com/webmasters
