export default {
    // Server Configuration
    port: 3030,
    nodeEnv: 'development',

    // ToonStream Base URL
    baseUrl: 'https://toonstream.love',

    // Cache Configuration (in seconds)
    cacheTTL: 3600,

    // Rate Limiting
    rateLimit: {
        windowMs: 60000, // 1 minute
        maxRequests: 100
    },

    // Browser Configuration
    browser: {
        executablePath: process.env.BROWSER_PATH || '/usr/bin/chromium',
        headless: process.env.HEADLESS !== 'false',
        timeout: parseInt(process.env.BROWSER_TIMEOUT || '15000', 10),
        retryAttempts: parseInt(process.env.BROWSER_RETRY_ATTEMPTS || '3', 10),
        retryDelay: parseInt(process.env.BROWSER_RETRY_DELAY || '2000', 10),
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    },

    // User Agent for requests
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};
