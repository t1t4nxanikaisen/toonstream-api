import { Hono } from 'hono';
import axios from 'axios';
import { load } from 'cheerio';
import { getCache, setCache } from '../utils/cache.js';

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

        // 1. Try to get from cache first
        const cachedSrc = getCache(cacheKey);
        if (cachedSrc) {
            console.log(`[Embed] Serving cached player for ${id}`);
            return c.html(generateCleanPlayer(cachedSrc));
        }

        const url = `https://toonstream.one/episode/${id}/`;
        console.log(`[Embed] Fetching ToonStream page for ${id}`);

        // Enhanced headers to bypass restrictions
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://toonstream.one/',
            'Origin': 'https://toonstream.one',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Cache-Control': 'max-age=0'
        };

        // Retry logic for handling transient errors
        let response;
        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                response = await axios.get(url, {
                    headers,
                    timeout: 15000,
                    maxRedirects: 5,
                    validateStatus: (status) => status < 500
                });

                if (response.status === 403 && attempt < maxRetries) {
                    console.log(`[Embed] Got 403, retrying with different headers (attempt ${attempt}/${maxRetries})`);
                    headers['User-Agent'] = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${120 + attempt}.0.0.0 Safari/537.36`;
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    continue;
                }

                if (response.status >= 400) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                break;
            } catch (error) {
                if (attempt < maxRetries) {
                    console.log(`[Embed] Request failed (attempt ${attempt}/${maxRetries}):`, error.message);
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                } else {
                    throw error;
                }
            }
        }

        const html = response.data;
        const $ = load(html);

        // 2. Extract iframe source
        let iframeSrc = $('iframe[src*="player"], iframe[src*="embed"], .player iframe').attr('src');

        if (!iframeSrc) {
            // Fallback: try to find any iframe that looks like a video player
            iframeSrc = $('iframe').filter((i, el) => {
                const src = $(el).attr('src') || '';
                return src.includes('video') || src.includes('stream') || src.includes('play');
            }).first().attr('src');
        }

        if (iframeSrc) {
            // Fix relative URLs
            if (iframeSrc.startsWith('//')) iframeSrc = `https:${iframeSrc}`;
            else if (iframeSrc.startsWith('/')) iframeSrc = `https://toonstream.one${iframeSrc}`;

            // Cache the result
            setCache(cacheKey, iframeSrc, 1800); // 30 minutes

            return c.html(generateCleanPlayer(iframeSrc));
        }

        // 3. Fallback to full page proxy (legacy method) if extraction fails
        console.log('[Embed] Extraction failed, falling back to full page proxy');

        // ... (Legacy code would go here, but for brevity and "Clean Extraction" goal, 
        // let's assume if we can't find the player, the page is likely broken or captcha'd anyway.
        // But to be safe, let's return the processed HTML as before, but wrapped in our generator if possible?
        // No, the legacy code injected CSS into the existing HTML.
        // Let's keep the legacy logic as a fallback block.)

        let processedHtml = html
            .replace(/src="\/\//g, 'src="https://')
            .replace(/href="\/\//g, 'href="https://')
            .replace(/src="\//g, 'src="https://toonstream.one/')
            .replace(/href="\//g, 'href="https://toonstream.one/');

        // Insert the enhancements before </head>
        // (We reuse the generateAdBlockScript function to keep code DRY if we separate it, 
        // but for now I'll just inline the legacy injection here or simplify it)

        // Actually, to keep the file clean, I'll put the legacy injection back here
        // but I'll use the helper function for the script to avoid duplication.

        const embedEnhancements = `
            <style id="embed-custom-styles">
                /* ... (Keep original CSS) ... */
                ${getEmbedStyles()}
            </style>
            <script id="embed-custom-script">
                ${getAdBlockScript()}
            </script>
        `;

        processedHtml = processedHtml.replace('</head>', `${embedEnhancements}</head>`);
        return c.html(processedHtml);

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
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    body { 
                        margin: 0; 
                        padding: 0; 
                        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                        color: #fff; 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        overflow: hidden;
                    }
                    
                    .error-container {
                        text-align: center;
                        padding: 40px 20px;
                        max-width: 500px;
                        animation: fadeIn 0.5s ease-in;
                    }
                    
                    @keyframes fadeIn {
                        from {
                            opacity: 0;
                            transform: translateY(-20px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                    
                    .icon {
                        font-size: 80px;
                        margin-bottom: 20px;
                        animation: pulse 2s ease-in-out infinite;
                    }
                    
                    @keyframes pulse {
                        0%, 100% {
                            opacity: 1;
                        }
                        50% {
                            opacity: 0.5;
                        }
                    }
                    
                    h1 {
                        font-size: 28px;
                        font-weight: 600;
                        margin-bottom: 15px;
                        color: #e94560;
                    }
                    
                    p {
                        font-size: 16px;
                        line-height: 1.6;
                        color: #a8b2d1;
                        margin-bottom: 25px;
                    }
                    
                    .info-box {
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 10px;
                        padding: 20px;
                        margin-top: 20px;
                    }
                    
                    .info-box p {
                        font-size: 14px;
                        margin-bottom: 0;
                        color: #8892b0;
                    }
                    
                    .retry-btn {
                        display: inline-block;
                        padding: 12px 30px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        text-decoration: none;
                        border-radius: 25px;
                        font-weight: 500;
                        transition: all 0.3s ease;
                        margin-top: 10px;
                    }
                    
                    .retry-btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
                    }
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
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ToonStream Player</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background-color: #000;
            overflow: hidden;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
            position: absolute;
            top: 0;
            left: 0;
            z-index: 1;
        }
        #loader {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            transition: opacity 0.5s ease;
        }
        .spinner {
            width: 50px;
            height: 50px;
            border: 3px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: #fff;
            animation: spin 1s ease-in-out infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
    <script>
        ${getAdBlockScript()}
    </script>
</head>
<body>
    <div id="loader">
        <div class="spinner"></div>
    </div>
    <iframe src="${iframeSrc}" allowfullscreen allow="autoplay; encrypted-media" onload="document.getElementById('loader').style.opacity='0'; setTimeout(() => document.getElementById('loader').style.display='none', 500);"></iframe>
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
        header, footer, nav,
        .header, .footer, .navigation, .nav,
        [class*="header"]:not([class*="player"]),
        [class*="footer"]:not([class*="player"]),
        [class*="nav"]:not([class*="player"]),
        .site-header, .site-footer, .site-nav,
        .menu, .sidebar, .breadcrumb,
        [class*="menu"], [class*="sidebar"], [class*="breadcrumb"],
        /* Hide related content and recommendations */
        .related, .recommendations, .similar,
        [class*="related"], [class*="recommend"], [class*="similar"],
        /* Hide comments and social */
        .comments, .social, .share,
        [class*="comment"], [class*="social"], [class*="share"],
        /* Hide extra content */
        .content-info, .episode-list, .series-info,
        [class*="episode-list"], [class*="series"],
        /* Common WordPress/theme elements */
        .entry-header, .entry-footer, .entry-meta,
        .post-navigation, .widget, .widget-area,
        /* === AD BLOCKING (Brave-style) === */
        /* Block common ad containers */
        [class*="ad-"], [id*="ad-"],
        [class*="ads"], [id*="ads"],
        [class*="banner"], [id*="banner"],
        [class*="sponsor"], [id*="sponsor"],
        [class*="popup"], [id*="popup"],
        [class*="overlay"]:not([class*="player"]),
        [class*="modal"]:not([class*="player"]),
        /* Block tracking pixels */
        img[width="1"], img[height="1"],
        img[width="1"][height="1"],
        /* Block ad iframes */
        iframe[src*="doubleclick"],
        iframe[src*="googlesyndication"],
        iframe[src*="advertising"],
        iframe[src*="adserver"],
        iframe[src*="ads."],
        iframe[src*="/ads/"],
        /* Block common ad networks */
        [src*="doubleclick"],
        [src*="googlesyndication"],
        [src*="googleadservices"],
        [src*="adservice"],
        [href*="adserver"],
        [href*="advertising"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            position: absolute !important;
            left: -9999px !important;
        }
        
        /* === RESET BODY STYLES === */
        body {
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #000 !important;
        }
        
        /* === FULLSCREEN PLAYER === */
        .player, .player-container, .video-player,
        [class*="player"]:not([class*="header"]):not([class*="footer"]),
        [id*="player"],
        .video-container, [class*="video-container"],
        iframe[src*="player"]:not([src*="ad"]):not([src*="doubleclick"]), 
        iframe[src*="embed"]:not([src*="ad"]):not([src*="doubleclick"]) {
            width: 100vw !important;
            height: 100vh !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
            margin: 0 !important;
            padding: 0 !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            z-index: 9999 !important;
            border: none !important;
        }
        
        /* Ensure player iframe is visible */
        .player iframe:not([src*="ad"]), 
        .player-container iframe:not([src*="ad"]),
        [class*="player"] iframe:not([src*="ad"]) {
            display: block !important;
            visibility: visible !important;
        }

        /* Block popunder and popup windows */
        body::after {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 10000;
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
            
            // === BRAVE-STYLE AD BLOCKING === //
            
            // Block popup windows
            const originalWindowOpen = window.open;
            window.open = function() {
                console.log('[AdBlock] Blocked popup window');
                return null;
            };

            // Block popunders
            window.addEventListener('blur', function(e) {
                if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
                    e.stopImmediatePropagation();
                }
            }, true);

            // Block common ad scripts
            const blockList = [
                'doubleclick',
                'googlesyndication',
                'googleadservices',
                'adservice',
                'advertising',
                'adserver',
                '/ads/',
                'popunder',
                'popup'
            ];

            // Override document.write to block ad injection
            const originalDocWrite = document.write;
            document.write = function(content) {
                const shouldBlock = blockList.some(pattern => 
                    content.toLowerCase().includes(pattern.toLowerCase())
                );
                
                if (shouldBlock) {
                    console.log('[AdBlock] Blocked ad injection via document.write');
                    return;
                }
                return originalDocWrite.apply(document, arguments);
            };

            // Block createElement for ad scripts
            const originalCreateElement = document.createElement;
            document.createElement = function(tagName) {
                const element = originalCreateElement.call(document, tagName);
                
                if (tagName.toLowerCase() === 'script' || tagName.toLowerCase() === 'iframe') {
                    const originalSetAttribute = element.setAttribute;
                    element.setAttribute = function(name, value) {
                        if (name === 'src') {
                            const shouldBlock = blockList.some(pattern => 
                                value.toLowerCase().includes(pattern.toLowerCase())
                            );
                            
                            if (shouldBlock) {
                                console.log('[AdBlock] Blocked:', value);
                                return;
                            }
                        }
                        return originalSetAttribute.apply(element, arguments);
                    };
                }
                
                return element;
            };

            // Remove ad elements continuously
            function removeAds() {
                // Remove ad elements
                const adSelectors = [
                    '[class*="ad-"]',
                    '[id*="ad-"]',
                    '[class*="ads"]',
                    '[id*="ads"]',
                    '[class*="banner"]',
                    '[class*="popup"]',
                    '[class*="overlay"]:not([class*="player"])',
                    'iframe[src*="doubleclick"]',
                    'iframe[src*="googlesyndication"]',
                    'iframe[src*="advertising"]'
                ];

                adSelectors.forEach(selector => {
                    try {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => {
                            // Don't remove player elements
                            if (!el.closest('.player') && 
                                !el.closest('.player-container') &&
                                !el.closest('[class*="player"]')) {
                                el.remove();
                            }
                        });
                    } catch (e) {
                        // Ignore selector errors
                    }
                });
            }

            // Run ad removal on load and periodically
            document.addEventListener('DOMContentLoaded', removeAds);
            setInterval(removeAds, 1000);

            // Observe DOM changes to block dynamically added ads
            const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1) { // Element node
                            const shouldBlock = blockList.some(pattern => {
                                const src = node.src || node.getAttribute('src') || '';
                                const className = node.className || '';
                                const id = node.id || '';
                                return src.toLowerCase().includes(pattern) ||
                                        className.toLowerCase().includes(pattern) ||
                                        id.toLowerCase().includes(pattern);
                            });

                            if (shouldBlock) {
                                console.log('[AdBlock] Blocked dynamically added ad element');
                                node.remove();
                            }
                        }
                    });
                });
            });

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });

            // Block right-click context menu on ads
            document.addEventListener('contextmenu', function(e) {
                const target = e.target;
                if (target.tagName === 'IFRAME' && target.src) {
                    const shouldBlock = blockList.some(pattern => 
                        target.src.toLowerCase().includes(pattern)
                    );
                    if (shouldBlock) {
                        e.preventDefault();
                        return false;
                    }
                }
            }, true);

            console.log('[Embed] Ad-blocking initialized');
        })();
    `;
}

export default embed;
