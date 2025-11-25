import { Hono } from 'hono';
import axios from 'axios';

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
 * Fetch ToonStream page and show only the player
 */
embed.get('/embed/:id', async (c) => {
    try {
        const id = c.req.param('id');
        const url = `https://toonstream.love/episode/${id}/`;

        console.log(`[Embed] Fetching ToonStream page for ${id}`);

        // Use axios for faster fetching instead of browser
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://toonstream.love/',
            },
            timeout: 10000,
            maxRedirects: 5
        });

        let html = response.data;

        // Fix relative URLs to absolute
        html = html
            .replace(/src="\/\//g, 'src="https://')
            .replace(/href="\/\//g, 'href="https://')
            .replace(/src="\//g, 'src="https://toonstream.love/')
            .replace(/href="\//g, 'href="https://toonstream.love/');

        // Inject CSS to hide everything except the player
        const hideNonPlayerCSS = `
            <style id="embed-custom-styles">
                /* Hide header, footer, navigation */
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
                .post-navigation, .widget, .widget-area {
                    display: none !important;
                    visibility: hidden !important;
                }
                
                /* Reset body styles */
                body {
                    margin: 0 !important;
                    padding: 0 !important;
                    overflow: hidden !important;
                    background: #000 !important;
                }
                
                /* Make player container fullscreen */
                .player, .player-container, .video-player,
                [class*="player"]:not([class*="header"]):not([class*="footer"]),
                [id*="player"],
                .video-container, [class*="video-container"],
                iframe[src*="player"], iframe[src*="embed"] {
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
                }
                
                /* Ensure player iframe is visible */
                .player iframe, .player-container iframe,
                [class*="player"] iframe {
                    display: block !important;
                    visibility: visible !important;
                }
            </style>
        `;

        // Insert the CSS before </head>
        html = html.replace('</head>', `${hideNonPlayerCSS}</head>`);

        return c.html(html);
    } catch (error) {
        console.error('Embed error:', error.message);
        return c.html(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error</title>
                <style>
                    body { 
                        margin: 0; 
                        padding: 0; 
                        background: #000; 
                        color: #fff; 
                        font-family: Arial, sans-serif;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                    }
                    .error {
                        text-align: center;
                        padding: 20px;
                    }
                    a {
                        color: #4a9eff;
                        text-decoration: none;
                    }
                    a:hover {
                        text-decoration: underline;
                    }
                </style>
            </head>
            <body>
                <div class="error">
                    <h1>Error Loading Video</h1>
                    <p>${error.message}</p>
                    <p><small>Try visiting: <a href="https://toonstream.love/episode/${c.req.param('id')}/" target="_blank">ToonStream directly</a></small></p>
                </div>
            </body>
            </html>
        `);
    }
});

export default embed;
