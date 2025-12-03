import { Hono } from 'hono';
import axios from 'axios';
import { load } from 'cheerio';
import { getCache, setCache } from '../utils/cache.js';
import { extractPlayerUrl, decodeHTMLEntities } from '../utils/scraper.js';
import { scrapeEpisodeStreaming } from '../scrapers/streaming.js';

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
        const cacheKey = `embed:${id}`;

        // ...

        // 1. Try to get from cache first
        const cachedSrc = getCache(cacheKey);
        if (cachedSrc) {
            console.log(`[Embed] Serving cached player for ${id}`);
            return c.html(generateCleanPlayer(cachedSrc));
        }

        console.log(`[Embed] Fetching ToonStream data for ${id}`);

        let iframeSrc;
        let allSources = [];
        try {
            const episodeData = await scrapeEpisodeStreaming(id);
            console.log(`[Embed] Episode data:`, JSON.stringify({
                success: episodeData?.success,
                sourcesCount: episodeData?.sources?.length,
                sources: episodeData?.sources?.map(s => s.url)
            }));

            if (episodeData && episodeData.sources && episodeData.sources.length > 0) {
                allSources = episodeData.sources;

                // Try each source until we find one that works
                for (const source of allSources) {
                    const sourceUrl = source.url;
                    console.log(`[Embed] Trying source: ${sourceUrl}`);

                    // If this is a ToonStream player URL (trembed), try to extract the real iframe
                    if (sourceUrl.includes('trembed') || sourceUrl.includes('toonstream.one/home')) {
                        try {
                            const playerResponse = await axios.get(sourceUrl, {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                    'Referer': `https://toonstream.one/episode/${id}/`,
                                },
                                timeout: 10000
                            });

                            const $player = load(playerResponse.data);
                            const realIframeSrc = extractPlayerUrl($player);

                            if (realIframeSrc) {
                                // Skip vidstreaming.xyz as it's currently down
                                if (realIframeSrc.includes('vidstreaming.xyz')) {
                                    console.log(`[Embed] Skipping vidstreaming.xyz (known to be down)`);
                                    continue;
                                }

                                console.log(`[Embed] Successfully extracted: ${realIframeSrc}`);
                                iframeSrc = realIframeSrc;
                                break; // Found a working source
                            }
                        } catch (error) {
                            console.error(`[Embed] Failed to extract from ${sourceUrl}: ${error.message}`);
                            continue; // Try next source
                        }
                    } else {
                        // Direct iframe URL
                        iframeSrc = sourceUrl;
                        break;
                    }
                }
            }
        } catch (error) {
            console.error(`[Embed] Failed to scrape episode data: ${error.message}`);
            throw error;
        }

        // 2. Extract iframe source
        // (iframeSrc is now already extracted)

        if (iframeSrc) {
            // Cache the result
            if (!cachedSrc) {
                setCache(cacheKey, iframeSrc, 1800); // 30 minutes
            }

            // Serve the clean player with the extracted iframe
            return c.html(generateCleanPlayer(iframeSrc));
        }

        // No working source found
        throw new Error('No working video source found for this episode');

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
 * Get CSS for legacy fallback
 */
function getEmbedStyles() {
    return `
        /* === HIDE ALL NON-PLAYER ELEMENTS === */
        header, footer, nav, .header, .footer, .navigation, .nav,
        [class*="header"]:not([class*="player"]), [class*="footer"]:not([class*="player"]),
        [class*="nav"]:not([class*="player"]), .site-header, .site-footer, .site-nav,
        .menu, .sidebar, .breadcrumb, [class*="menu"], [class*="sidebar"], [class*="breadcrumb"],
        .related, .recommendations, .similar, [class*="related"], [class*="recommend"], [class*="similar"],
        .comments, .social, .share, [class*="comment"], [class*="social"], [class*="share"],
        .content-info, .episode-list, .series-info, [class*="episode-list"], [class*="series"],
        .entry-header, .entry-footer, .entry-meta, .post-navigation, .widget, .widget-area,
        /* === AD BLOCKING === */
        [class*="ad-"], [id*="ad-"], [class*="ads"], [id*="ads"],
        [class*="banner"], [id*="banner"], [class*="sponsor"], [id*="sponsor"],
        [class*="popup"], [id*="popup"], [class*="overlay"]:not([class*="player"]),
        [class*="modal"]:not([class*="player"]),
        img[width="1"], img[height="1"],
        iframe[src*="doubleclick"], iframe[src*="googlesyndication"],
        iframe[src*="advertising"], iframe[src*="adserver"],
        iframe[src*="ads."], iframe[src*="/ads/"],
        [src*="doubleclick"], [src*="googlesyndication"], [src*="googleadservices"],
        [src*="adservice"], [href*="adserver"], [href*="advertising"] {
            display: none !important; visibility: hidden !important; opacity: 0 !important;
            pointer-events: none !important; position: absolute !important; left: -9999px !important;
        }
        /* === RESET BODY STYLES === */
        body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #000 !important; }
        /* === FULLSCREEN PLAYER === */
        .player, .player-container, .video-player,
        [class*="player"]:not([class*="header"]):not([class*="footer"]),
        [id*="player"], .video-container, [class*="video-container"],
        iframe[src*="player"]:not([src*="ad"]):not([src*="doubleclick"]),
        iframe[src*="embed"]:not([src*="ad"]):not([src*="doubleclick"]) {
            width: 100vw !important; height: 100vh !important;
            max-width: 100vw !important; max-height: 100vh !important;
            margin: 0 !important; padding: 0 !important;
            position: fixed !important; top: 0 !important; left: 0 !important;
            z-index: 9999 !important; border: none !important;
        }
        /* Ensure player iframe is visible */
        .player iframe:not([src*="ad"]), .player-container iframe:not([src*="ad"]),
        [class*="player"] iframe:not([src*="ad"]) {
            display: block !important; visibility: visible !important;
        }
        /* Block popunder and popup windows */
        body::after {
            content: ''; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            pointer-events: none; z-index: 10000;
        }
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
