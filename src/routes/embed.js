import { Hono } from 'hono';
import axios from 'axios';
import { load } from 'cheerio';
import { getCache, setCache } from '../utils/cache.js';
import { extractPlayerUrl, decodeHTMLEntities } from '../utils/scraper.js';
import { scrapeEpisodeStreaming } from '../scrapers/streaming.js';
import { scrapeAnimeDetails } from '../scrapers/anime.js';

const embed = new Hono();

/**
 * GET /api/source/:id
 * Get sources by scraping (kept for compatibility)
 */
embed.get('/api/source/:id', async (c) => {
    try {
        const id = c.req.param('id');

        // Return a simple response pointing to embed
        return c.json({
            success: true,
            message: 'Use /embed/:id for video playback',
            embedUrl: `/embed/${id}`
        });
    } catch (error) {
        return c.json({
            success: false,
            error: error.message
        }, 500);
    }
});

/**
 * GET /embed/:id
 * Fetch ToonStream page and show only the player with ad-blocking
 */
embed.get('/embed/:id', async (c) => {
    try {
        const id = c.req.param('id');
        const type = c.req.query('type') || 'auto'; // Optional type parameter
        const cacheKey = `embed:${id}:${type}`;

        // 1. Try to get from cache first
        const cachedSrc = getCache(cacheKey);
        if (cachedSrc) {
            console.log(`[Embed] Serving cached player for ${id} (type: ${type})`);
            return c.html(generateCleanPlayer(cachedSrc));
        }

        console.log(`[Embed] Fetching ToonStream data for ${id} (type: ${type})`);

        let iframeSrc;
        let allSources = [];
        
        // First, try to get content details to determine type
        let contentType = type;
        if (type === 'auto') {
            try {
                const contentData = await scrapeAnimeDetails(id, 'auto');
                contentType = contentData.type;
                console.log(`[Embed] Auto-detected type: ${contentType}`);
            } catch (error) {
                console.log(`[Embed] Could not auto-detect type, using episode scraping`);
            }
        }

        // Handle different content types
        if (contentType === 'movie' || contentType === 'movies') {
            // For movies, fetch the movie page directly
            try {
                const movieUrl = `https://toonstream.one/movies/${id}/`;
                const response = await axios.get(movieUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://toonstream.one/',
                    },
                    timeout: 5000
                });

                const $ = load(response.data);
                
                // Extract player iframe
                const playerIframe = $('iframe[src*="player"], iframe[src*="embed"], iframe[data-src*="player"]').first();
                let src = playerIframe.attr('data-src') || playerIframe.attr('src');
                
                if (src) {
                    src = decodeHTMLEntities(src);
                    if (src.startsWith('//')) src = `https:${src}`;
                    else if (src.startsWith('/')) src = `https://toonstream.one${src}`;
                    else if (src.startsWith('http://')) src = src.replace('http://', 'https://');
                    
                    iframeSrc = src;
                } else {
                    // Try alternative extraction
                    const scriptContent = $('script').text();
                    const srcMatch = scriptContent.match(/src=["']([^"']*player[^"']*)["']/i);
                    if (srcMatch) {
                        iframeSrc = srcMatch[1];
                        if (iframeSrc.startsWith('//')) iframeSrc = `https:${iframeSrc}`;
                        else if (iframeSrc.startsWith('/')) iframeSrc = `https://toonstream.one${iframeSrc}`;
                    }
                }
                
                if (!iframeSrc) {
                    throw new Error('No player found on movie page');
                }
            } catch (error) {
                console.error(`[Embed] Failed to extract movie player: ${error.message}`);
                // Fall back to episode scraping
                contentType = 'episode';
            }
        }

        // For series, cartoons, or if movie extraction failed, use episode scraping
        if (!iframeSrc || contentType !== 'movie') {
            try {
                const episodeData = await scrapeEpisodeStreaming(id);
                console.log(`[Embed] Episode data:`, JSON.stringify({
                    success: episodeData?.success,
                    sourcesCount: episodeData?.sources?.length,
                    sources: episodeData?.sources?.map(s => s.url)
                }));

                if (episodeData && episodeData.sources && episodeData.sources.length > 0) {
                    allSources = episodeData.sources;

                    // Optimization: Parallel fetching with Promise.any
                    const fetchSource = async (source) => {
                        const sourceUrl = source.url;
                        // Direct iframe - resolve immediately
                        if (!sourceUrl.includes('trembed') && !sourceUrl.includes('toonstream.one/home')) {
                            return sourceUrl;
                        }

                        // Trembed URL - fetch and extract
                        try {
                            console.log(`[Embed] Fetching source: ${sourceUrl}`);
                            const playerResponse = await axios.get(sourceUrl, {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                    'Referer': `https://toonstream.one/episode/${id}/`,
                                },
                                timeout: 4000
                            });

                            // Regex extraction
                            let realIframeSrc = null;
                            const dataSrcMatch = playerResponse.data.match(/<iframe[^>]+data-src=["']([^"']+)["']/i);
                            const srcMatch = playerResponse.data.match(/<iframe[^>]+src=["']([^"']+)["']/i);

                            if (dataSrcMatch) realIframeSrc = dataSrcMatch[1];
                            else if (srcMatch) realIframeSrc = srcMatch[1];

                            if (realIframeSrc) {
                                realIframeSrc = decodeHTMLEntities(realIframeSrc);
                                if (realIframeSrc.startsWith('//')) realIframeSrc = `https:${realIframeSrc}`;
                                else if (realIframeSrc.startsWith('/')) realIframeSrc = `https://toonstream.one${realIframeSrc}`;
                                else if (realIframeSrc.startsWith('http://')) realIframeSrc = realIframeSrc.replace('http://', 'https://');

                                // Skip vidstreaming.xyz
                                if (realIframeSrc.includes('vidstreaming.xyz')) {
                                    throw new Error('Skipping vidstreaming.xyz (disabled)');
                                }

                                console.log(`[Embed] Successfully extracted: ${realIframeSrc}`);
                                return realIframeSrc;
                            }
                            throw new Error('No iframe found in source');
                        } catch (err) {
                            throw err;
                        }
                    };

                    // Limit concurrency to 5
                    const activeSources = allSources.slice(0, 5);

                    try {
                        iframeSrc = await Promise.any(activeSources.map(s => fetchSource(s)));
                    } catch (aggregateError) {
                        console.error('[Embed] All sources failed:', aggregateError.errors);
                        throw new Error('No working video source found (all attempts failed)');
                    }
                }
            } catch (error) {
                console.error(`[Embed] Failed to scrape episode data: ${error.message}`);
                throw error;
            }
        }

        if (iframeSrc) {
            // Cache the result
            if (!cachedSrc) {
                setCache(cacheKey, iframeSrc, 1800); // 30 minutes
            }

            // Serve the clean player with the extracted iframe
            return c.html(generateCleanPlayer(iframeSrc));
        }

        // No working source found
        throw new Error('No working video source found for this content');

    } catch (error) {
        console.error('Embed error:', error.message);

        // Check if it's a 404 or connection error
        const is404 = error.response?.status === 404 || error.message.includes('404');
        const isTimeout = error.message.includes('timeout') || error.code === 'ECONNABORTED';

        // User-friendly error messages
        let errorTitle = 'Video Not Available';
        let errorMessage = 'This video is currently not available for streaming.';

        if (is404) {
            errorTitle = 'Video Not Found';
            errorMessage = 'The requested video could not be found on RyanCloud servers.';
        } else if (isTimeout) {
            errorTitle = 'RyanCloud Under Maintenance';
            errorMessage = 'RyanCloud is currently under maintenance. Please try again later.';
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            errorTitle = 'RyanCloud Under Maintenance';
            errorMessage = 'RyanCloud servers are currently under maintenance. Please try again in a few minutes.';
        }

        return c.html(`
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>${errorTitle}</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body {
                            margin: 0; padding: 0;
                            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                            color: #fff;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                            display: flex; align-items: center; justify-content: center;
                            height: 100vh; overflow: hidden;
                        }
                        .error-container {
                            text-align: center; padding: 40px 20px; max-width: 500px;
                            animation: fadeIn 0.5s ease-in;
                        }
                        @keyframes fadeIn { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
                        .icon { font-size: 80px; margin-bottom: 20px; animation: pulse 2s ease-in-out infinite; }
                        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                        h1 { font-size: 28px; font-weight: 600; margin-bottom: 15px; color: #e94560; }
                        p { font-size: 16px; line-height: 1.6; color: #a8b2d1; margin-bottom: 25px; }
                        .info-box {
                            background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);
                            border-radius: 10px; padding: 20px; margin-top: 20px;
                        }
                        .info-box p { font-size: 14px; margin-bottom: 0; color: #8892b0; }
                        .retry-btn {
                            display: inline-block; padding: 12px 30px;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white; text-decoration: none; border-radius: 25px;
                            font-weight: 500; transition: all 0.3s ease; margin-top: 10px;
                        }
                        .retry-btn:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4); }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <div class="icon">🎬</div>
                        <h1>${errorTitle}</h1>
                        <p>${errorMessage}</p>
                        <div class="info-box">
                            <p>If this issue persists, please contact support or try again later.</p>
                        </div>
                        <a href="javascript:location.reload()" class="retry-btn">Retry</a>
                    </div>
                </body>
            </html>
        `);
    }
});

/**
 * GET /embed/movies/:id
 * Special endpoint for movie embeds
 */
embed.get('/movies/:id', async (c) => {
    const id = c.req.param('id');
    // Redirect to main embed endpoint with type parameter
    return c.redirect(`/embed/${id}?type=movie`);
});

/**
 * GET /embed/series/:id
 * Special endpoint for series embeds
 */
embed.get('/series/:id', async (c) => {
    const id = c.req.param('id');
    return c.redirect(`/embed/${id}?type=series`);
});

/**
 * GET /embed/cartoons/:id
 * Special endpoint for cartoon embeds
 */
embed.get('/cartoons/:id', async (c) => {
    const id = c.req.param('id');
    return c.redirect(`/embed/${id}?type=cartoon`);
});

/**
 * Generate clean player HTML
 */
function generateCleanPlayer(iframeSrc) {
    // Force HTTPS on the iframe src to prevent mixed content errors
    if (iframeSrc && iframeSrc.startsWith('http://')) {
        iframeSrc = iframeSrc.replace('http://', 'https://');
    }

    return `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">
                <title>ToonStream Player</title>
                <style>
                    body, html { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #000; overflow: hidden; }
                    iframe { width: 100%; height: 100%; border: none; position: absolute; top: 0; left: 0; z-index: 1; }
                    #loader {
                        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                        background-color: #000; display: flex; justify-content: center; align-items: center;
                        z-index: 9999; transition: opacity 0.5s ease;
                    }
                    .spinner {
                        width: 50px; height: 50px; border: 3px solid rgba(255,255,255,0.3);
                        border-radius: 50%; border-top-color: #fff; animation: spin 1s ease-in-out infinite;
                    }
                    @keyframes spin { to {transform: rotate(360deg); } }
                </style>
                <script>${getAdBlockScript()}</script>
            </head>
            <body>
                <div id="loader"><div class="spinner"></div></div>
                <iframe 
                    src="${iframeSrc}" 
                    allowfullscreen 
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope; clipboard-write" 
                    onload="document.getElementById('loader').style.opacity='0'; setTimeout(() => document.getElementById('loader').style.display='none', 500);"
                ></iframe>
            </body>
        </html>
    `;
}

/**
 * Get AdBlock script
 */
function getAdBlockScript() {
    return `
        (function() {
            'use strict';
            
            // Aggressive popup blocking
            const originalWindowOpen = window.open;
            window.open = function() { 
                console.log('[AdBlock] Blocked popup window'); 
                return null; 
            };
            
            // Block all new window/tab attempts
            window.addEventListener('click', function(e) {
                if (e.target.tagName === 'A' && e.target.target === '_blank') {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[AdBlock] Blocked new tab');
                    return false;
                }
            }, true);
            
            // Block popunders
            window.addEventListener('blur', function(e) {
                if (document.activeElement && document.activeElement.tagName === 'IFRAME') { 
                    e.stopImmediatePropagation(); 
                }
            }, true);
            
            // Block beforeunload popups
            window.addEventListener('beforeunload', function(e) {
                e.preventDefault();
                e.stopPropagation();
                return undefined;
            }, true);
            
            // Block common ad scripts
            const blockList = ['doubleclick', 'googlesyndication', 'googleadservices', 'adservice', 'advertising', 'adserver', '/ads/', 'popunder', 'popup', 'pop-up'];
            
            // Override document.write
            const originalDocWrite = document.write;
            document.write = function(content) {
                if (blockList.some(pattern => content.toLowerCase().includes(pattern.toLowerCase()))) return;
                return originalDocWrite.apply(document, arguments);
            };
            
            // Block createElement
            const originalCreateElement = document.createElement;
            document.createElement = function(tagName) {
                const element = originalCreateElement.call(document, tagName);
                if (tagName.toLowerCase() === 'script' || tagName.toLowerCase() === 'iframe') {
                    const originalSetAttribute = element.setAttribute;
                    element.setAttribute = function(name, value) {
                        if (name === 'src' && blockList.some(pattern => value.toLowerCase().includes(pattern.toLowerCase()))) return;
                        return originalSetAttribute.apply(element, arguments);
                    };
                }
                return element;
            };
            
            // Remove ads
            function removeAds() {
                const adSelectors = ['[class*="ad-"]', '[id*="ad-"]', '[class*="ads"]', '[id*="ads"]', '[class*="banner"]', '[class*="popup"]', '[class*="overlay"]:not([class*="player"])', 'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]', 'iframe[src*="advertising"]'];
                adSelectors.forEach(selector => {
                    try {
                        document.querySelectorAll(selector).forEach(el => {
                            if (!el.closest('.player') && !el.closest('.player-container') && !el.closest('[class*="player"]')) el.remove();
                        });
                    } catch (e) {}
                });
            }
            
            document.addEventListener('DOMContentLoaded', removeAds);
            setInterval(removeAds, 1000);
            
            // Block right-click on ads
            document.addEventListener('contextmenu', function(e) {
                if (e.target.tagName === 'IFRAME' && e.target.src && blockList.some(pattern => e.target.src.toLowerCase().includes(pattern))) {
                    e.preventDefault(); 
                    return false;
                }
            }, true);
            
            console.log('[Embed] Ad-blocking initialized');
        })();
    `;
}

export default embed;
