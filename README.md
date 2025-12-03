<div align="center">

# ToonStream API

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![Hono](https://img.shields.io/badge/Hono-4.0+-orange?logo=hono)](https://hono.dev)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)](https://nodejs.org)

**A comprehensive RESTful API for scraping anime content from toonstream.one**

**Optimized for Cloudflare Workers**

[Features](#features) • [Installation](#installation) • [Configuration](#configuration) • [Deployment](#deployment) • [API Endpoints](#api-endpoints)

</div>

---

## Features

### Core Functionality
- **Home Page Data** - Latest series, movies, and schedules
- **Search Engine** - Full-text search with pagination
- **Anime Details** - Comprehensive information with related content
- **Episode Streaming** - Extract video sources and links
- **Category Browsing** - Filter by genre, language, type
- **Release Schedule** - Weekly anime release calendar
- **Embed Player** - Optimized, ad-free player embed
- **Random Content** - Get random movies or series
- **Latest Content** - Get latest movies or series

### Technical Features
- **Serverless** - Built for Cloudflare Workers
- **High Performance** - Edge caching system
- **Error Handling** - Comprehensive error responses
- **API Documentation** - Interactive Swagger UI
- **Cloudflare Bypass** - Axios + cookie jar support
- **Ad Blocking** - Brave-style ad blocking for embeds

---

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare Account

### Quick Start

```bash
# Clone repository
git clone https://github.com/ryanwtf88/toonstream-api.git
cd toonstream-api

# Install dependencies
npm install

# Start development server
npm run dev
```

The server will be running at `http://localhost:8787`

---

## Configuration

### 1. Wrangler Configuration

Edit `wrangler.toml`:

```toml
name = "toonstream-api"
main = "src/worker.js"
compatibility_date = "2024-11-29"
compatibility_flags = ["nodejs_compat"]
account_id = "your-cloudflare-account-id"  # Replace with your Cloudflare Account ID

[observability]
enabled = true
```

**Finding Your Account ID:**
1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your account
3. Copy Account ID from the right sidebar

### 2. Application Configuration

Edit `config.js`:

```javascript
export default {
  port: 3030,
  baseUrl: 'https://toonstream.one',
  cacheTTL: 3600,
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100
  }
};
```

---

## Deployment

### Deploy to Cloudflare Workers

#### 1. Login to Cloudflare

```bash
npx wrangler login
```

#### 2. Configure Account ID

Update `wrangler.toml` with your Cloudflare Account ID:

```toml
account_id = "your-cloudflare-account-id"
```

#### 3. Deploy

```bash
npm run deploy
```

Your API will be deployed to: `https://toonstream-api.<your-subdomain>.workers.dev`

#### 4. Custom Domain (Optional)

1. Go to Cloudflare Dashboard
2. Navigate to Workers & Pages
3. Select your worker
4. Go to Settings > Triggers
5. Add Custom Domain

---

## API Endpoints

### Base URL
```
https://your-worker.workers.dev
```

### Documentation
- **Interactive Docs**: `GET /` (Swagger UI)
- **JSON Endpoint List**: `GET /docs`
- **OpenAPI Spec**: `GET /api/openapi.json`

### Core Endpoints

#### Home
```http
GET /api/home
```
Get homepage data with latest series, movies, and schedule.

**Response:**
```json
{
  "latestSeries": [...],
  "latestMovies": [...],
  "trending": [...],
  "schedule": {...}
}
```

#### Search
```http
GET /api/search?keyword={query}&page={page}
```
Search for anime by keyword.

**Parameters:**
- `keyword` (required) - Search query
- `page` (optional) - Page number (default: 1)

**Response:**
```json
{
  "success": true,
  "results": [...],
  "pagination": {...}
}
```

#### Search Suggestions
```http
GET /api/search/suggestions?keyword={query}
```
Get search suggestions for autocomplete.

#### Anime Details
```http
GET /api/anime/{id}
```
Get detailed information about a specific anime.

**Response:**
```json
{
  "success": true,
  "id": "anime-id",
  "title": "Anime Title",
  "poster": "...",
  "description": "...",
  "genres": [...],
  "languages": [...],
  "seasons": {...},
  "related": [...]
}
```

#### Episode Streaming
```http
GET /api/episode/{id}
```
Get streaming links for an episode.

**Response:**
```json
{
  "success": true,
  "sources": [...],
  "downloads": [...],
  "servers": [...]
}
```

#### Episode Server
```http
GET /api/episode/{id}/servers/{serverId}
```
Get specific server links for an episode.

### Category Endpoints

#### All Categories
```http
GET /api/categories
```
Get list of all available categories.

#### Category Content
```http
GET /api/category/{name}?page={page}
```
Get anime by category.

**Examples:**
- `/api/category/action`
- `/api/category/romance?page=2`

#### Language Filter
```http
GET /api/category/language/{lang}?page={page}
```
Get anime by language.

**Supported Languages:**
- `hindi`
- `tamil`
- `telugu`
- `english`

#### Movies
```http
GET /api/category/type/movies?page={page}
```
Get anime movies.

#### Series
```http
GET /api/category/type/series?page={page}
```
Get anime series.

### Latest Content

#### Latest Movies
```http
GET /api/category/latest/movies?page={page}
```
Get latest anime movies.

#### Latest Series
```http
GET /api/category/latest/series?page={page}
```
Get latest anime series.

### Random Content

#### Random Movie
```http
GET /api/category/random/movie
```
Get a random anime movie.

#### Random Series
```http
GET /api/category/random/series
```
Get a random anime series.

### Schedule

#### Weekly Schedule
```http
GET /api/schedule
```
Get weekly release schedule.

**Response:**
```json
{
  "success": true,
  "schedule": {
    "monday": [...],
    "tuesday": [...],
    ...
  }
}
```

#### Daily Schedule
```http
GET /api/schedule/{day}
```
Get schedule for a specific day.

**Days:** `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday`

### Embed

#### Optimized Player
```http
GET /embed/{id}
```
Get optimized, ad-free player embed.

**Features:**
- Clean iframe extraction
- Ad blocking
- Loading overlay
- Caching

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    ...
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message"
}
```

---

## Project Structure

```
toonstream-api/
├── config.js              # Configuration
├── src/
│   ├── worker.js          # Cloudflare Worker Entry Point
│   ├── app.js             # Main Hono Application
│   ├── routes/            # API Routes
│   │   ├── home.js
│   │   ├── search.js
│   │   ├── anime.js
│   │   ├── episodes.js
│   │   ├── categories.js
│   │   ├── schedule.js
│   │   └── embed.js
│   ├── scrapers/          # Web Scrapers
│   │   ├── home.js
│   │   ├── search.js
│   │   ├── anime.js
│   │   ├── streaming.js
│   │   ├── categories.js
│   │   └── schedule.js
│   └── utils/
│       ├── scraper.js     # Scraping Utilities
│       └── cache.js       # Worker-Compatible Cache
├── package.json
├── wrangler.toml          # Cloudflare Configuration
└── README.md
```

---

## Technology Stack

| Technology | Purpose |
|------------|---------|
| ![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?logo=cloudflare&logoColor=white) | Edge Platform |
| ![Hono](https://img.shields.io/badge/Hono-orange?logo=hono&logoColor=white) | Web Framework |
| ![Axios](https://img.shields.io/badge/Axios-5A29E4?logo=axios&logoColor=white) | HTTP Client |
| ![Cheerio](https://img.shields.io/badge/Cheerio-E88C00?logoColor=white) | HTML Parsing |

---

## Development

### Available Scripts

```bash
# Development mode with hot reload
npm run dev

# Deploy to Cloudflare Workers
npm run deploy

# Lint code
npm run lint

# Format code
npm run lint:fix
```

---

## Troubleshooting

### Common Issues

**Account ID Missing**
```bash
Error: Missing account_id in wrangler.toml
```
Solution: Add your Cloudflare Account ID to `wrangler.toml`

**Authentication Error**
```bash
Error: Not authenticated
```
Solution: Run `npx wrangler login`

**Build Errors**
```bash
Error: nodejs_compat flag required
```
Solution: Ensure `compatibility_flags = ["nodejs_compat"]` is in `wrangler.toml`

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

![License](https://img.shields.io/badge/license-MIT-blue.svg)

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Disclaimer

> **Warning**: This API is for educational purposes only. Web scraping may violate the website's Terms of Service. Use responsibly and at your own risk.

---

<div align="center">

**Made with ❤️ for the anime community**

[![GitHub](https://img.shields.io/badge/GitHub-ryanwtf88-black?logo=github)](https://github.com/ryanwtf88)
[![Stars](https://img.shields.io/github/stars/ryanwtf88/toonstream-api?style=social)](https://github.com/ryanwtf88/toonstream-api)

</div>
