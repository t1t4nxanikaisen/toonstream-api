import { fetchPage, parseHTML, extractEpisodeInfo, cleanText } from '../utils/scraper.js';
import { getCache, setCache } from '../utils/cache.js';

/**
 * Scrape anime/series details
 * @param {string} id - Anime ID/slug
 * @returns {Promise<object>} Anime details
 */
export const scrapeAnimeDetails = async (id) => {
    const cacheKey = `anime:${id}`;
    const cached = getCache(cacheKey);

    if (cached) {
        return cached;
    }

    try {
        // Try multiple URL patterns to handle both series and movies
        let html;
        let url;
        let lastError;

        // First try as a series
        try {
            url = `/series/${id}/`;
            html = await fetchPage(url);
        } catch (error) {
            lastError = error;
            // If series fails with 404, try as a movie
            if (error.message.includes('404')) {
                url = `/movies/${id}/`;
                html = await fetchPage(url);
                lastError = null; // Success!
            } else {
                // If it's not a 404, throw the original error
                throw error;
            }
        }

        const $ = parseHTML(html);

        // Extract basic info
        const title = $('h1, .entry-title, .title, [class*="title"]').first().text().trim() ||
            id.replace(/-/g, ' ');

        const posterEl = $('.poster img, .thumbnail img, article img, [class*="poster"] img').first();
        let poster = posterEl.attr('src') || posterEl.attr('data-src') || posterEl.attr('data-lazy-src') || '';
        if (poster && !poster.startsWith('http')) {
            poster = poster.startsWith('//') ? `https:${poster}` : `https://toonstream.love${poster}`;
        }

        // Extract description/synopsis
        const descEl = $('.description, .synopsis, .entry-content, [class*="description"]');
        let description = '';
        descEl.find('p').each((_, p) => {
            const text = $(p).text().trim();
            if (text && text.length > 20) {
                description += text + ' ';
            }
        });
        description = cleanText(description);

        // Extract metadata
        const ratingEl = $('.rating, .tmdb, .imdb, [class*="rating"]');
        const ratingText = ratingEl.text();
        const rating = parseFloat(ratingText.match(/[\d.]+/)?.[0]) || null;

        const qualityEl = $('.quality, [class*="quality"]');
        const quality = qualityEl.text().trim() || null;

        const runtimeEl = $('.runtime, .duration, [class*="runtime"]');
        const runtime = runtimeEl.text().trim() || null;

        // Extract genres/categories
        const genres = [];
        $('[rel="category tag"], .genres a, .category a, [class*="genre"] a').each((_, el) => {
            const genre = $(el).text().trim();
            if (genre && !genres.includes(genre) && genre.length < 50) {
                genres.push(genre);
            }
        });

        // Extract languages
        const languages = [];
        const pageText = $('body').text();
        const langMatches = pageText.match(/Hindi|Tamil|Telugu|English|Japanese|Urdu/gi) || [];
        langMatches.forEach(lang => {
            const normalized = lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
            if (!languages.includes(normalized)) {
                languages.push(normalized);
            }
        });

        // Extract cast
        const cast = [];
        $('[href*="/cast_tv/"], .cast a').each((_, el) => {
            const member = $(el).text().trim();
            if (member && !cast.includes(member) && member.length < 50) {
                cast.push(member);
            }
        });

        // Extract episodes by season
        const seasons = {};
        let allEpisodes = [];

        // Look for season containers
        $('[class*="season"], .episodes-list, [id*="season"]').each((_, seasonEl) => {
            const seasonText = $(seasonEl).find('[class*="season-title"], h2, h3').first().text();
            const seasonMatch = seasonText.match(/season\s*(\d+)/i);
            const seasonNum = seasonMatch ? parseInt(seasonMatch[1]) : 1;

            const episodes = [];
            $(seasonEl).find('a[href*="/episode/"]').each((_, el) => {
                // Pass the container element (li or div) if the link is inside it
                const container = $(el).closest('li, .episode-item');
                const elementToParse = container.length ? container : $(el).parent();

                const episode = extractEpisodeInfo(elementToParse, $);
                if (episode && episode.id) {
                    // Force season number if we found it in the container
                    if (!episode.season || episode.season === 1) {
                        episode.season = seasonNum;
                    }
                    episodes.push(episode);
                    allEpisodes.push(episode);
                }
            });

            if (episodes.length > 0) {
                seasons[seasonNum] = episodes;
            }
        });

        // If no seasons found via containers, try to get all episode links and group them
        if (Object.keys(seasons).length === 0) {
            $('a[href*="/episode/"]').each((_, el) => {
                const container = $(el).closest('li, .episode-item');
                const elementToParse = container.length ? container : $(el).parent();

                const episode = extractEpisodeInfo(elementToParse, $);
                if (episode && episode.id) {
                    allEpisodes.push(episode);
                }
            });

            // Group by season number
            allEpisodes.forEach(ep => {
                const seasonNum = ep.season || 1;
                if (!seasons[seasonNum]) {
                    seasons[seasonNum] = [];
                }
                seasons[seasonNum].push(ep);
            });
        }

        const data = {
            success: true,
            id,
            title,
            poster,
            description,
            rating,
            quality,
            runtime,
            genres,
            languages,
            cast,
            totalEpisodes: allEpisodes.length,
            seasons
        };

        setCache(cacheKey, data, 3600); // Cache for 1 hour
        return data;
    } catch (error) {
        console.error('Error scraping anime details:', error.message);
        throw new Error(`Failed to scrape anime details: ${error.message}`);
    }
};

/**
 * Check availability for multiple anime
 * @param {string[]} ids - Array of anime IDs
 * @returns {Promise<object>} Availability data
 */
export const checkBatchAvailability = async (ids) => {
    try {
        const promises = ids.map(async (id) => {
            try {
                const data = await scrapeAnimeDetails(id);
                return {
                    id,
                    available: true,
                    totalEpisodes: data.totalEpisodes,
                    hasHindi: data.languages.includes('Hindi')
                };
            } catch (error) {
                return {
                    id,
                    available: false,
                    error: error.message
                };
            }
        });

        const results = await Promise.all(promises);
        return {
            success: true,
            results
        };
    } catch (error) {
        console.error('Error checking batch availability:', error.message);
        throw new Error(`Failed to check batch availability: ${error.message}`);
    }
};

export default { scrapeAnimeDetails, checkBatchAvailability };
