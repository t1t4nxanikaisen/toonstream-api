import { fetchPage, parseHTML, cleanText } from '../utils/scraper.js';
import { getCache, setCache } from '../utils/cache.js';
import { getBrowser } from '../utils/browser.js';

/**
 * Scrape episode streaming links with browser support for dynamic content
 * @param {string} episodeId - Episode ID/slug
 * @param {boolean} useBrowser - Whether to use browser for scraping
 * @returns {Promise<object>} Episode streaming data
 */
export const scrapeEpisodeStreaming = async (episodeId, useBrowser = false) => {
    const cacheKey = `episode:${episodeId}`;
    const cached = getCache(cacheKey);

    if (cached) {
        return cached;
    }

    try {
        let data;

        if (useBrowser) {
            data = await scrapeWithBrowser(episodeId);
        } else {
            data = await scrapeWithFetch(episodeId);
        }

        setCache(cacheKey, data, 1800); // Cache for 30 minutes
        return data;
    } catch (error) {
        console.error('Error scraping episode streaming:', error.message);
        throw new Error(`Failed to scrape episode streaming: ${error.message}`);
    }
};

/**
 * Scrape using browser (for dynamic content)
 */
async function scrapeWithBrowser(episodeId) {
    const browser = getBrowser();

    return await browser.withPage(async (page) => {
        // Try different URL patterns
        const urls = [
            `/episode/${episodeId}/`,
            `/series/${episodeId}/`,
            `/movies/${episodeId}/`
        ];

        let lastError;
        for (const urlPath of urls) {
            try {
                const fullUrl = `https://toonstream.love${urlPath}`;
                console.log(`[Browser] Trying URL: ${fullUrl}`);

                await browser.goto(page, fullUrl, { timeout: 15000 });

                // Wait for content to load
                await page.waitForTimeout(2000);

                // Extract iframe URLs first
                const iframeData = await page.evaluate(() => {
                    const titleEl = document.querySelector('h1, .entry-title, .title');
                    const title = titleEl ? titleEl.textContent.trim() : '';

                    const iframes = Array.from(document.querySelectorAll('iframe'));
                    const iframeUrls = iframes
                        .map(iframe => iframe.src)
                        .filter(src => src && src.length > 10);

                    return { title, iframeUrls };
                });

                console.log(`[Browser] Found ${iframeData.iframeUrls.length} iframe sources`);

                // Now extract actual video URLs from each iframe
                const sources = [];
                for (let i = 0; i < Math.min(iframeData.iframeUrls.length, 5); i++) {
                    const iframeUrl = iframeData.iframeUrls[i];
                    console.log(`[Browser] Extracting from iframe ${i + 1}: ${iframeUrl}`);

                    try {
                        // Navigate to iframe URL
                        await browser.goto(page, iframeUrl, { timeout: 10000 });
                        await page.waitForTimeout(3000); // Wait for player to load

                        // Extract video sources from the iframe page
                        const videoData = await page.evaluate(() => {
                            const videos = [];

                            // Look for video elements
                            const videoElements = document.querySelectorAll('video');
                            videoElements.forEach(video => {
                                if (video.src) {
                                    videos.push({
                                        type: 'video',
                                        url: video.src,
                                        quality: 'default'
                                    });
                                }
                                // Check video sources
                                const sources = video.querySelectorAll('source');
                                sources.forEach(source => {
                                    if (source.src) {
                                        videos.push({
                                            type: 'video',
                                            url: source.src,
                                            quality: source.getAttribute('label') || 'default'
                                        });
                                    }
                                });
                            });

                            // Look for m3u8 or mp4 URLs in scripts or data attributes
                            const scripts = document.querySelectorAll('script');
                            scripts.forEach(script => {
                                const content = script.textContent || '';
                                // Look for video URLs in script content
                                const m3u8Match = content.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/g);
                                const mp4Match = content.match(/(https?:\/\/[^\s"']+\.mp4[^\s"']*)/g);

                                if (m3u8Match) {
                                    m3u8Match.forEach(url => {
                                        videos.push({
                                            type: 'video',
                                            url: url,
                                            quality: 'hls'
                                        });
                                    });
                                }

                                if (mp4Match) {
                                    mp4Match.forEach(url => {
                                        videos.push({
                                            type: 'video',
                                            url: url,
                                            quality: 'mp4'
                                        });
                                    });
                                }
                            });

                            return videos;
                        });

                        if (videoData.length > 0) {
                            console.log(`[Browser] Found ${videoData.length} video URLs in iframe ${i + 1}`);
                            sources.push(...videoData);
                        } else {
                            // If no direct video found, keep the iframe URL as fallback
                            console.log(`[Browser] No direct video found, keeping iframe URL`);
                            sources.push({
                                type: 'iframe',
                                url: iframeUrl,
                                quality: `Server ${i + 1}`
                            });
                        }
                    } catch (iframeError) {
                        console.log(`[Browser] Failed to extract from iframe ${i + 1}:`, iframeError.message);
                        // Keep iframe URL as fallback
                        sources.push({
                            type: 'iframe',
                            url: iframeUrl,
                            quality: `Server ${i + 1}`
                        });
                    }
                }

                // Parse season/episode from title or ID
                let episodeMatch = iframeData.title.match(/(\d+)x(\d+)/);
                let season = episodeMatch ? parseInt(episodeMatch[1]) : null;
                let episode = episodeMatch ? parseInt(episodeMatch[2]) : null;

                if (!season || !episode) {
                    const idMatch = episodeId.match(/-(\d+)x(\d+)$/);
                    if (idMatch) {
                        season = parseInt(idMatch[1]);
                        episode = parseInt(idMatch[2]);
                    }
                }

                return {
                    success: true,
                    episodeId,
                    title: iframeData.title,
                    season,
                    episode,
                    sources: sources,
                    downloads: [],
                    languages: [],
                    servers: []
                };
            } catch (error) {
                lastError = error;
                console.log(`[Browser] Failed with ${urlPath}: ${error.message}`);
                continue;
            }
        }

        throw lastError || new Error('All URL patterns failed');
    });
}

/**
 * Scrape using traditional fetch (faster, but no JS execution)
 */
async function scrapeWithFetch(episodeId) {
    // Try multiple URL patterns to handle both series and movies
    let html;
    let url;
    let lastError;

    // First try as a series episode
    try {
        // Optimization: If ID looks like an episode (e.g. 1x1), try /episode/ first
        if (episodeId.match(/-\d+x\d+$/)) {
            url = `/episode/${episodeId}/`;
            html = await fetchPage(url);
        } else {
            // Otherwise try series first
            url = `/series/${episodeId}/`;
            html = await fetchPage(url);
        }
    } catch (error) {
        lastError = error;
        // If first attempt fails, try alternatives
        if (error.message.includes('404')) {
            try {
                // If we started with episode, try series/movies now
                if (episodeId.match(/-\d+x\d+$/)) {
                    try {
                        url = `/series/${episodeId}/`;
                        html = await fetchPage(url);
                    } catch (seriesError) {
                        url = `/movies/${episodeId}/`;
                        html = await fetchPage(url);
                    }
                } else {
                    // If we started with series, try movies then episode
                    try {
                        url = `/movies/${episodeId}/`;
                        html = await fetchPage(url);
                    } catch (movieError) {
                        url = `/episode/${episodeId}/`;
                        html = await fetchPage(url);
                    }
                }
                lastError = null; // Success!
            } catch (retryError) {
                lastError = retryError;
            }
        } else {
            // If it's not a 404, throw the original error
            throw error;
        }
    }

    // If html is still not set and lastError exists, it means all attempts failed
    if (!html && lastError) {
        throw lastError;
    }

    const $ = parseHTML(html);

    // Extract episode info
    const title = $('h1, .entry-title, .title').first().text().trim();

    // Try to parse from title first
    let episodeMatch = title.match(/(\d+)x(\d+)/);
    let season = episodeMatch ? parseInt(episodeMatch[1]) : null;
    let episode = episodeMatch ? parseInt(episodeMatch[2]) : null;

    // If not found in title, try to parse from ID
    if (!season || !episode) {
        const idMatch = episodeId.match(/-(\d+)x(\d+)$/);
        if (idMatch) {
            season = parseInt(idMatch[1]);
            episode = parseInt(idMatch[2]);
        }
    }

    // Extract streaming sources
    const sources = [];

    // Look for iframe sources
    $('iframe, [class*="player"] iframe').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
        if (src) {
            const fullSrc = src.startsWith('http') ? src : (src.startsWith('//') ? `https:${src}` : `https://toonstream.love${src}`);
            sources.push({
                type: 'iframe',
                url: fullSrc,
                quality: 'default'
            });
        }
    });

    // Look for video sources
    $('video source, source, video').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        const type = $(el).attr('type') || 'video/mp4';
        const quality = $(el).attr('label') || $(el).attr('data-quality') || 'default';

        if (src) {
            const fullSrc = src.startsWith('http') ? src : `https://toonstream.love${src}`;
            sources.push({
                type: 'video',
                url: fullSrc,
                quality,
                mimeType: type
            });
        }
    });

    // Look for download links
    const downloads = [];
    $('a[href*="download"], .download-link a, a[download], [class*="download"] a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        const quality = text.match(/\d+p/)?.[0] || 'default';
        const language = text.match(/Hindi|Tamil|Telugu|English/i)?.[0] || 'Unknown';

        if (href && href.length > 10) {
            downloads.push({
                url: href.startsWith('http') ? href : `https://toonstream.love${href}`,
                quality,
                language
            });
        }
    });

    // Extract available languages/audio tracks
    const languages = [];
    $('.language-selector option, .audio-track, [class*="language"]').each((_, el) => {
        const lang = $(el).text().trim() || $(el).attr('value');
        if (lang && lang.length < 20 && !languages.includes(lang)) {
            languages.push(lang);
        }
    });

    // If no languages found, try to extract from page text
    if (languages.length === 0) {
        const pageText = $('body').text();
        const langMatches = pageText.match(/Hindi|Tamil|Telugu|English|Japanese|Urdu/gi) || [];
        langMatches.forEach(lang => {
            const normalized = lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
            if (!languages.includes(normalized)) {
                languages.push(normalized);
            }
        });
    }

    // Extract servers/players
    const servers = [];
    $('.server-list button, .player-option, [data-server], [class*="server"]').each((_, el) => {
        const serverName = $(el).text().trim() || $(el).attr('data-server') || $(el).attr('data-name');
        const serverId = $(el).attr('data-id') || $(el).attr('data-server-id') || serverName;

        if (serverName && serverName.length < 50) {
            servers.push({
                name: serverName,
                id: serverId ? serverId.toLowerCase().replace(/\s+/g, '-') : serverName.toLowerCase()
            });
        }
    });

    return {
        success: true,
        episodeId,
        title,
        season,
        episode,
        sources,
        downloads,
        languages,
        servers
    };
}

/**
 * Get streaming link from specific server
 * @param {string} episodeId - Episode ID
 * @param {string} serverId - Server ID
 * @returns {Promise<object>} Server streaming data
 */
export const scrapeServerLink = async (episodeId, serverId) => {
    const cacheKey = `server:${episodeId}:${serverId}`;
    const cached = getCache(cacheKey);

    if (cached) {
        return cached;
    }

    try {
        const episodeData = await scrapeEpisodeStreaming(episodeId);
        const serverData = episodeData.servers.find(s => s.id === serverId);

        const data = {
            success: true,
            episodeId,
            serverId,
            server: serverData,
            sources: episodeData.sources
        };

        setCache(cacheKey, data, 1800);
        return data;
    } catch (error) {
        console.error('Error scraping server link:', error.message);
        throw new Error(`Failed to scrape server link: ${error.message}`);
    }
};

export default { scrapeEpisodeStreaming, scrapeServerLink };
