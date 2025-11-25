<div align="center">

# ToonStream API

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black?logo=bun)](https://bun.sh)
[![Hono](https://img.shields.io/badge/Hono-4.0+-orange?logo=hono)](https://hono.dev)
[![Deploy](https://img.shields.io/badge/Deploy-Pterodactyl-blue?logo=pterodactyl)](./PTERODACTYL.md)
[![GitHub Stars](https://img.shields.io/github/stars/ryanwtf88/toonstream-api?style=social)](https://github.com/ryanwtf88/toonstream-api)

**A comprehensive RESTful API for scraping anime content from toonstream.love**

[Features](#features) • [Installation](#installation) • [API Endpoints](#api-endpoints) • [Documentation](#documentation) • [Deployment](#deployment) • [📖 Full API Docs](./API-DOCUMENTATION.md)

</div>

---

## Features

<table>
<tr>
<td width="50%">

### Core Functionality
- **Home Page Data** - Latest series, movies, and schedules
- **Search Engine** - Full-text search with pagination
- **Anime Details** - Comprehensive information and metadata
- **Episode Streaming** - Extract video sources and links
- **Category Browsing** - Filter by genre, language, type
- **Release Schedule** - Weekly anime release calendar

</td>
<td width="50%">

### Technical Features
- **High Performance** - Built-in caching system
- **Rate Limiting** - Request throttling protection
- **Error Handling** - Comprehensive error responses
- **API Documentation** - Interactive Swagger UI
- **Cloudflare Bypass** - Axios + cookie jar support
- **Production Ready** - Optimized for deployment

</td>
</tr>
</table>

---

## Installation

### Prerequisites

![Bun](https://img.shields.io/badge/Bun-1.0+-black?logo=bun&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-18+-green?logo=node.js&logoColor=white)
![Git](https://img.shields.io/badge/Git-Required-red?logo=git&logoColor=white)

### Quick Start

```bash
# Clone repository
git clone https://github.com/ryanwtf88/toonstream-api.git
cd toonstream-api

# Install dependencies
bun install

# Start development server
bun run dev
```

The server will be running at `http://localhost:3030`

---

## API Endpoints

### Base URL
```
http://localhost:3030
```

### Available Endpoints

| Endpoint | Method | Description | Parameters |
|----------|--------|-------------|------------|
| `/` | GET | API information | - |
| `/api/home` | GET | Homepage data | - |
| `/api/search` | GET | Search anime | `keyword`, `page` |
| `/api/search/suggestions` | GET | Search suggestions | `keyword` |
| `/api/anime/:id` | GET | Anime details | `id` |
| `/api/episode/:id` | GET | Episode streaming | `id` |
| `/api/episode/:id/servers/:serverId` | GET | Server-specific links | `id`, `serverId` |
| `/api/categories` | GET | All categories | - |
| `/api/category/:name` | GET | Category anime | `name`, `page` |
| `/api/category/language/:lang` | GET | Filter by language | `lang` |
| `/api/category/type/movies` | GET | Movies list | - |
| `/api/category/type/series` | GET | Series list | - |
| `/api/schedule` | GET | Weekly schedule | - |
| `/api/schedule/:day` | GET | Day schedule | `day` |

---

## Usage Examples

### JavaScript/TypeScript

```javascript
// Search for anime
const response = await fetch('http://localhost:3030/api/search?keyword=naruto');
const data = await response.json();
console.log(data.results);

// Get anime details
const anime = await fetch('http://localhost:3030/api/anime/bleach-dub');
const details = await anime.json();
console.log(details);

// Get episode streaming
const episode = await fetch('http://localhost:3030/api/episode/bleach-dub-2x1');
const streaming = await episode.json();
console.log(streaming.sources);
```

### Python

```python
import requests

# Search
response = requests.get('http://localhost:3030/api/search', 
                       params={'keyword': 'naruto'})
print(response.json())

# Get anime details
anime = requests.get('http://localhost:3030/api/anime/bleach-dub')
print(anime.json())
```

### cURL

```bash
# Home page
curl http://localhost:3030/api/home

# Search
curl "http://localhost:3030/api/search?keyword=bleach"

# Anime details
curl http://localhost:3030/api/anime/hunter-x-hunter-hindi-dub

# Episode streaming
curl http://localhost:3030/api/episode/hunter-x-hunter-hindi-dub-1x17
```

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    "id": "bleach-dub",
    "title": "Bleach Dub",
    "poster": "https://image.tmdb.org/t/p/w500/...",
    "description": "...",
    "genres": ["Action", "Adventure"],
    "totalEpisodes": 40
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message",
  "message": "Detailed error description"
}
```

---

## Configuration

Edit `config.js` to customize settings:

```javascript
export default {
  port: 3030,                    // Server port
  baseUrl: 'https://toonstream.love',
  cacheTTL: 3600,               // Cache duration (seconds)
  rateLimit: {
    windowMs: 60000,            // Rate limit window (ms)
    maxRequests: 100            // Max requests per window
  }
};
```

---

## Deployment

### Pterodactyl Panel

[![Deploy on Pterodactyl](https://img.shields.io/badge/Deploy-Pterodactyl-blue?logo=pterodactyl&logoColor=white)](./PTERODACTYL.md)

See [PTERODACTYL.md](./PTERODACTYL.md) for complete deployment guide.

**Quick Steps:**
1. Import `egg.json` to your Pterodactyl panel
2. Create new server with ToonStream API egg
3. Start and access at `http://your-ip:3030`

### Docker

```bash
# Build image
docker build -t toonstream-api .

# Run container
docker run -p 3030:3030 toonstream-api
```

### Manual Deployment

```bash
# Install dependencies
bun install

# Start production server
bun run start
```

---

## Documentation

### 📖 Comprehensive API Documentation

**[View Full API Documentation →](./API-DOCUMENTATION.md)**

Complete documentation including:
- All API endpoints with examples
- Request/response formats
- Codebase architecture
- Security features
- Performance metrics
- Testing results

### Interactive API Docs

Access Swagger UI at: `http://localhost:3030/docs`

### OpenAPI Specification

Available at: `http://localhost:3030/api/openapi.json`

---

## Project Structure

```
toonstream-api/
├── config.js              # Configuration
├── index.js               # Entry point
├── egg.json              # Pterodactyl egg
├── src/
│   ├── app.js            # Main application
│   ├── routes/           # API route handlers
│   │   ├── home.js
│   │   ├── search.js
│   │   ├── anime.js
│   │   ├── episodes.js
│   │   ├── categories.js
│   │   └── schedule.js
│   ├── scrapers/         # Web scrapers
│   │   ├── home.js
│   │   ├── search.js
│   │   ├── anime.js
│   │   ├── streaming.js
│   │   ├── categories.js
│   │   └── schedule.js
│   └── utils/
│       ├── scraper.js    # Scraping utilities
│       └── cache.js      # Caching system
├── package.json
└── README.md
```

---

## Technology Stack

| Technology | Purpose |
|------------|---------|
| ![Bun](https://img.shields.io/badge/Bun-black?logo=bun&logoColor=white) | Runtime |
| ![Hono](https://img.shields.io/badge/Hono-orange?logo=hono&logoColor=white) | Web Framework |
| ![Axios](https://img.shields.io/badge/Axios-5A29E4?logo=axios&logoColor=white) | HTTP Client |
| ![Cheerio](https://img.shields.io/badge/Cheerio-E88C00?logoColor=white) | HTML Parsing |
| Node-Cache | In-Memory Caching |
| Hono Rate Limiter | Request Throttling |

---

## Performance

| Metric | Value |
|--------|-------|
| Response Time | ~100-500ms (cached) |
| Memory Usage | ~200-400MB |
| CPU Usage | < 10% (idle) |
| Cache Duration | 30min-1hr |
| Rate Limit | 100 req/min |

---

## Development

### Available Scripts

```bash
# Development mode (auto-reload)
bun run dev

# Production mode
bun run start

# Install dependencies
bun install
```

### Environment

No environment variables required. All configuration is in `config.js`.

---

## Troubleshooting

### Common Issues

**Port Already in Use**
```bash
# Change port in config.js
port: 3031  // or any available port
```

**403 Forbidden Errors**
- Check if toonstream.love is accessible
- Verify your IP isn't blocked by Cloudflare
- Try different server location

**High Memory Usage**
- Reduce `cacheTTL` in config.js
- Restart server periodically
- Increase allocated RAM

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

## Support

- **Issues**: [GitHub Issues](https://github.com/ryanwtf88/toonstream-api/issues)
- **Documentation**: Available at `/docs` endpoint
- **Deployment Guide**: [PTERODACTYL.md](./PTERODACTYL.md)

---

## Acknowledgments

- Inspired by [hianime-api](https://github.com/ryanwtf88/hianime-api)
- Built with [Hono](https://hono.dev)
- Powered by [Bun.js](https://bun.sh)
- Scraping with [Cheerio](https://cheerio.js.org)

---

<div align="center">

**Made with ❤️ for the anime community**

[![GitHub](https://img.shields.io/badge/GitHub-ryanwtf88-black?logo=github)](https://github.com/ryanwtf88)
[![Stars](https://img.shields.io/github/stars/ryanwtf88/toonstream-api?style=social)](https://github.com/ryanwtf88/toonstream-api)

</div>
