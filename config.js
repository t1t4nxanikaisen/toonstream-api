export default {
    // Server Configuration
    port: process.env.PORT || 3030,
    nodeEnv: process.env.NODE_ENV || 'development',

    // ToonStream Base URL
    baseUrl: 'https://toonstream.one',

    // Cache Configuration (in seconds)
    cacheTTL: 3600,

    // Rate Limiting
    rateLimit: {
        windowMs: 60000, // 1 minute
        maxRequests: 100
    },

    // User Agent for requests
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

    // Serverless optimizations
    serverless: {
        timeout: 10000, // 10 seconds max for Vercel
        retryAttempts: 2,
        retryDelay: 1000
    }
};
