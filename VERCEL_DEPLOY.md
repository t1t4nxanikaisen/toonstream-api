# Vercel Deployment Guide

## Quick Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

## What Was Fixed

✅ **Removed browser automation dependencies** (Playwright, Puppeteer, Chromium)  
✅ **Refactored scrapers** to use lightweight axios + cheerio  
✅ **Created vercel.json** with proper serverless configuration  
✅ **Enhanced embed endpoint** with retry logic and better headers  

## Deployment Size

- **Before:** ~200MB+ (with browser dependencies)
- **After:** ~50MB (serverless-ready)

## Testing Your Deployment

After deploying, test these endpoints:

```bash
# Replace with your Vercel URL
export API_URL="https://your-app.vercel.app"

# Test API
curl $API_URL/api/home
curl $API_URL/api/search?keyword=naruto

# Test embed (the one that was failing with 403)
curl $API_URL/embed/naruto-1x1
```

## Configuration

The `vercel.json` file configures:
- Node.js runtime for serverless functions
- 30-second timeout for scraping operations
- 1GB memory allocation
- CORS headers for API and embed endpoints
- Proper routing for all endpoints

## Environment Variables (Optional)

No environment variables are required. All configuration is in `config.js`.

## Troubleshooting

### If you still get 403 errors:

1. **Check Vercel logs** - `vercel logs`
2. **Verify headers** - The embed endpoint now uses enhanced headers
3. **Check rate limiting** - ToonStream may rate limit by IP
4. **Try different regions** - Deploy to different Vercel regions

### Common Issues:

- **Build fails**: Make sure you're using Node.js 18+
- **Function timeout**: Increase `maxDuration` in vercel.json
- **Memory issues**: Increase `memory` in vercel.json

## Next Steps

1. Deploy to Vercel: `vercel --prod`
2. Test all endpoints on your deployed URL
3. Monitor performance in Vercel dashboard
4. Optional: Add Redis caching with Vercel KV

## Support

- [Vercel Documentation](https://vercel.com/docs)
- [Hono Framework](https://hono.dev)
- [Project Issues](https://github.com/ryanwtf88/toonstream-api/issues)
