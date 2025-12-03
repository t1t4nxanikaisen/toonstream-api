import config from '../config.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { swaggerUI } from '@hono/swagger-ui';
// import { rateLimiter } from 'hono-rate-limiter';

// Import routes
import homeRoutes from './routes/home.js';
import searchRoutes from './routes/search.js';
import animeRoutes from './routes/anime.js';
import episodeRoutes from './routes/episodes.js';
import categoryRoutes from './routes/categories.js';
import scheduleRoutes from './routes/schedule.js';
import embedRoutes from './routes/embed.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
    origin: '*',
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposeHeaders: ['Content-Length', 'X-Request-Id']
}));

// Rate limiting removed for Cloudflare Workers compatibility
// Cloudflare provides edge rate limiting
// const limiter = rateLimiter({
//     windowMs: config.rateLimit.windowMs,
//     limit: config.rateLimit.maxRequests,
//     standardHeaders: 'draft-6',
//     keyGenerator: (c) => c.req.header('x-forwarded-for') || 'anonymous'
// });

// app.use('/api/*', limiter);

// API Routes (removed /v1)
app.route('/api/home', homeRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/anime', animeRoutes);
app.route('/api/episode', episodeRoutes);
app.route('/api/category', categoryRoutes);
app.route('/api/categories', categoryRoutes);
app.route('/api/schedule', scheduleRoutes);
app.route('/', embedRoutes); // Mount at root to handle both /api/source and /embed

// Root endpoint - Swagger UI
app.get('/', swaggerUI({ url: '/api/openapi.json' }));

// Docs endpoint - JSON list of endpoints
app.get('/docs', (c) => {
    return c.json({
        success: true,
        message: 'ToonStream API - Anime Scraping API',
        version: '1.0.0',
        endpoints: {
            home: '/api/home',
            search: '/api/search?keyword={query}&page={page}',
            searchSuggestions: '/api/search/suggestions?keyword={query}',
            animeDetails: '/api/anime/{id}',
            episode: '/api/episode/{id}',
            episodeServer: '/api/episode/{id}/servers/{serverId}',
            categories: '/api/categories',
            category: '/api/category/{name}?page={page}',
            language: '/api/category/language/{lang}?page={page}',
            movies: '/api/category/type/movies?page={page}',
            series: '/api/category/type/series?page={page}',
            schedule: '/api/schedule',
            daySchedule: '/api/schedule/{day}',
            batchAvailability: '/api/anime/batch-availability',
            source: '/api/source/{id}',
            embed: '/embed/{id}',
            latestMovies: '/api/category/latest/movies',
            latestSeries: '/api/category/latest/series',
            randomMovie: '/api/category/random/movie',
            randomSeries: '/api/category/random/series'
        },
        openapi: '/api/openapi.json'
    });
});

// OpenAPI specification
app.get('/api/openapi.json', (c) => {
    return c.json({
        openapi: '3.0.0',
        info: {
            title: 'ToonStream API',
            version: '1.0.0',
            description: 'A comprehensive RESTful API for scraping anime content from toonstream.one'
        },
        servers: [
            {
                url: 'https://toonstream-api.ry4n.qzz.io',
                description: 'Production server'
            },
            {
                url: `http://localhost:${config.port}`,
                description: 'Development server'
            }
        ],
        paths: {
            '/api/home': {
                get: {
                    summary: 'Get homepage data',
                    description: 'Retrieve latest series, movies, and schedule from homepage',
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/search': {
                get: {
                    summary: 'Search anime',
                    parameters: [
                        { name: 'keyword', in: 'query', required: true, schema: { type: 'string' } },
                        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }
                    ],
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/search/suggestions': {
                get: {
                    summary: 'Get search suggestions',
                    parameters: [
                        { name: 'keyword', in: 'query', required: true, schema: { type: 'string' } }
                    ],
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/anime/{id}': {
                get: {
                    summary: 'Get anime details',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/anime/batch-availability': {
                post: {
                    summary: 'Check batch availability',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        ids: { type: 'array', items: { type: 'string' } }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/episode/{id}': {
                get: {
                    summary: 'Get episode streaming links',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/episode/{id}/servers/{serverId}': {
                get: {
                    summary: 'Get specific server links',
                    parameters: [
                        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                        { name: 'serverId', in: 'path', required: true, schema: { type: 'string' } }
                    ],
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/categories': {
                get: {
                    summary: 'Get all categories',
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/category/{name}': {
                get: {
                    summary: 'Get anime by category',
                    parameters: [
                        { name: 'name', in: 'path', required: true, schema: { type: 'string' } },
                        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }
                    ],
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/category/language/{lang}': {
                get: {
                    summary: 'Get anime by language',
                    parameters: [
                        { name: 'lang', in: 'path', required: true, schema: { type: 'string' } },
                        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }
                    ],
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/category/type/movies': {
                get: {
                    summary: 'Get anime movies',
                    parameters: [{ name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }],
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/category/type/series': {
                get: {
                    summary: 'Get anime series',
                    parameters: [{ name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }],
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/category/latest/movies': {
                get: {
                    summary: 'Get latest movies',
                    parameters: [{ name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }],
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/category/latest/series': {
                get: {
                    summary: 'Get latest series',
                    parameters: [{ name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }],
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/category/random/movie': {
                get: {
                    summary: 'Get random movie',
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/category/random/series': {
                get: {
                    summary: 'Get random series',
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/schedule': {
                get: {
                    summary: 'Get weekly schedule',
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/api/schedule/{day}': {
                get: {
                    summary: 'Get daily schedule',
                    parameters: [{ name: 'day', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { '200': { description: 'Successful response' } }
                }
            },
            '/embed/{id}': {
                get: {
                    summary: 'Get optimized player embed',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { '200': { description: 'Successful HTML response' } }
                }
            }
        }
    });
});

// 404 handler
app.notFound((c) => {
    return c.json({
        success: false,
        error: 'Endpoint not found'
    }, 404);
});

// Error handler
app.onError((err, c) => {
    console.error('Server error:', err);
    return c.json({
        success: false,
        error: err.message || 'Internal server error'
    }, 500);
});

// Start server
console.log(`🚀 ToonStream API starting on port ${config.port}...`);
console.log(`📚 Documentation available at http://localhost:${config.port}/docs`);
console.log(`🌐 Base URL: ${config.baseUrl}`);

export default app;

