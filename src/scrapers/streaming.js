import { fetchPage, parseHTML, cleanText } from '../utils/scraper.js';
import { getCache, setCache } from '../utils/cache.js';

/**
 * Scrape episode streaming links (serverless optimized - no browser)
 * @param {string} episodeId - Episode ID/slug
 * @returns {Promise<object>} Episode streaming data
 */
export const scrapeEpisodeStreaming = async (episodeId) => {
    const cacheKey = `episode:${episodeId}`;
    const cached = getCache(cacheKey);

    if (cached) {
        return cached;
    }

    try {
        const data = await scrapeWithFetch(episodeId);
        setCache(cacheKey, data, 1800); // Cache for 30 minutes
        return data;
    } catch (error) {
        console.error('Error scraping episode streaming:', error.message);
        throw new Error(`Failed to scrape episode streaming: ${error.message}`);
    }
};

/**
 * Scrape using traditional fetch (serverless-friendly)
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
            const fullSrc = src.startsWith('http') ? src : (src.startsWith('//') ? `https:${src}` : `https://toonstream.one${src}`);
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
            const fullSrc = src.startsWith('http') ? src : `https://toonstream.one${src}`;
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
                url: href.startsWith('http') ? href : `https://toonstream.one${href}`,
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
