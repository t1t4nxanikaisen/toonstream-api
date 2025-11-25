import playwright from 'playwright';
import config from '../../config.js';

/**
 * Mutex Lock for browser operations
 */
class MutexLock {
    constructor(acquireTimeout = 30000, lockTimeout = 60000) {
        this.locked = false;
        this.queue = [];
        this.acquireTimeout = acquireTimeout;
        this.lockTimeout = lockTimeout;
    }

    async withLock(fn) {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }

    async acquire() {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                const index = this.queue.indexOf(resolve);
                if (index > -1) {
                    this.queue.splice(index, 1);
                }
                reject(new Error('Lock acquire timeout'));
            }, this.acquireTimeout);

            const tryAcquire = () => {
                if (!this.locked) {
                    this.locked = true;
                    clearTimeout(timeoutId);
                    resolve();
                } else {
                    this.queue.push(tryAcquire);
                }
            };

            tryAcquire();
        });
    }

    release() {
        this.locked = false;
        const next = this.queue.shift();
        if (next) {
            next();
        }
    }
}

/**
 * ToonStream Browser Manager
 * Handles browser lifecycle and page operations
 */
export class ToonStreamBrowser {
    constructor(customConfig = {}) {
        this.config = {
            ...config.browser,
            ...customConfig
        };
        this.browser = null;
        this.context = null;
        this.mutex = new MutexLock(30000, 60000);
        this.isConnected = false;
        this.lastLaunchTime = 0;
        this.minLaunchInterval = 5000; // 5 seconds between launches
    }

    /**
     * Launch browser and create context
     */
    async launch() {
        return this.mutex.withLock(async () => {
            // Rate limit browser launches
            const timeSinceLastLaunch = Date.now() - this.lastLaunchTime;
            if (timeSinceLastLaunch < this.minLaunchInterval) {
                const waitTime = this.minLaunchInterval - timeSinceLastLaunch;
                console.log(`[Browser] Waiting ${waitTime}ms before launch`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            if (!this.browser || !this.context || !this.isConnected) {
                try {
                    const launchOptions = {
                        headless: this.config.headless,
                        executablePath: this.config.executablePath,
                        args: [
                            '--disable-gpu',
                            '--disable-dev-shm-usage',
                            '--disable-setuid-sandbox',
                            '--no-sandbox',
                            '--no-zygote',
                            '--disable-extensions',
                            '--disable-background-timer-throttling',
                            '--disable-backgrounding-occluded-windows',
                            '--disable-renderer-backgrounding',
                            '--disable-web-security',
                            '--disable-features=VizDisplayCompositor',
                            '--disable-ipc-flooding-protection',
                        ],
                    };

                    console.log('[Browser] Launching browser...');
                    this.browser = await playwright.chromium.launch(launchOptions);
                    this.context = await this.browser.newContext({
                        userAgent: this.config.userAgent,
                        viewport: { width: 1920, height: 1080 },
                        ignoreHTTPSErrors: true,
                    });

                    this.isConnected = true;
                    this.lastLaunchTime = Date.now();

                    // Initialize with test page
                    const initPage = await this.context.newPage();
                    try {
                        await initPage.goto(config.baseUrl, {
                            waitUntil: 'domcontentloaded',
                            timeout: 10000
                        });
                        await initPage.close();
                        console.log('[Browser] Browser launched successfully');
                    } catch (initError) {
                        console.warn('[Browser] Initial page load failed, but browser is ready');
                        await initPage.close();
                    }
                } catch (err) {
                    this.browser = null;
                    this.context = null;
                    this.isConnected = false;
                    console.error('[Browser] Failed to launch browser', err);
                    throw new Error(`Browser launch failed: ${err.message}`);
                }
            } else {
                // Verify browser is still connected
                try {
                    if (!this.browser.isConnected()) {
                        console.warn('[Browser] Browser disconnected, relaunching...');
                        this.isConnected = false;
                        this.browser = null;
                        this.context = null;
                        return this.launch();
                    }
                } catch (err) {
                    console.error('[Browser] Error checking connection', err);
                    this.isConnected = false;
                    this.browser = null;
                    this.context = null;
                    return this.launch();
                }
            }

            return { browser: this.browser, context: this.context };
        });
    }

    /**
     * Create a new page with retry logic
     */
    async createPage(retryCount = 0) {
        try {
            const { context } = await this.launch();
            const page = await context.newPage();

            // Set default timeout
            page.setDefaultTimeout(this.config.timeout);

            return page;
        } catch (err) {
            if (retryCount < this.config.retryAttempts) {
                console.warn(`[Browser] Page creation failed, retry ${retryCount + 1}/${this.config.retryAttempts}`);
                await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                return this.createPage(retryCount + 1);
            }
            throw new Error(`Failed to create page after ${this.config.retryAttempts} attempts: ${err.message}`);
        }
    }

    /**
     * Navigate to URL with retry logic
     */
    async goto(page, url, options = {}) {
        const defaultOptions = {
            waitUntil: 'domcontentloaded',
            timeout: this.config.timeout,
            ...options
        };

        let lastError;
        for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
            try {
                const response = await page.goto(url, defaultOptions);
                return response;
            } catch (err) {
                lastError = err;
                console.warn(`[Browser] Navigation failed (attempt ${attempt + 1}/${this.config.retryAttempts}):`, err.message);

                if (attempt < this.config.retryAttempts - 1) {
                    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                }
            }
        }

        throw new Error(`Navigation failed after ${this.config.retryAttempts} attempts: ${lastError.message}`);
    }

    /**
     * Execute function with page context
     */
    async withPage(fn) {
        const page = await this.createPage();
        try {
            return await fn(page);
        } finally {
            await page.close().catch(err => {
                console.error('[Browser] Error closing page:', err);
            });
        }
    }

    /**
     * Close browser and cleanup
     */
    async close() {
        return this.mutex.withLock(async () => {
            if (this.context) {
                try {
                    await this.context.close();
                } catch (err) {
                    console.error('[Browser] Error closing context:', err);
                }
                this.context = null;
            }

            if (this.browser) {
                try {
                    await this.browser.close();
                } catch (err) {
                    console.error('[Browser] Error closing browser:', err);
                }
                this.browser = null;
            }

            this.isConnected = false;
            console.log('[Browser] Browser closed');
        });
    }

    /**
     * Get cookies from context
     */
    async getCookies(url) {
        const { context } = await this.launch();
        return await context.cookies(url);
    }

    /**
     * Set cookies in context
     */
    async setCookies(cookies) {
        const { context } = await this.launch();
        await context.addCookies(cookies);
    }

    /**
     * Clear cookies
     */
    async clearCookies() {
        const { context } = await this.launch();
        await context.clearCookies();
    }
}

// Singleton instance
let browserInstance = null;

/**
 * Get or create browser instance
 */
export function getBrowser(config = {}) {
    if (!browserInstance) {
        browserInstance = new ToonStreamBrowser(config);
    }
    return browserInstance;
}

/**
 * Close browser instance
 */
export async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
}

export default { ToonStreamBrowser, getBrowser, closeBrowser };
