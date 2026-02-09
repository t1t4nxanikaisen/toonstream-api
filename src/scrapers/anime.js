import { fetchPage, parseHTML, extractEpisodeInfo, cleanText, extractAnimeId } from '../utils/scraper.js';
import { getCache, setCache } from '../utils/cache.js';

/**
 * Scrape anime/series/movie/cartoon details
 * @param {string} id - Content ID/slug
 * @param {string} type - Content type (auto-detected if not provided)
 * @returns {Promise<object>} Content details
 */
export const scrapeAnimeDetails = async (id, type = null) => {
    const cacheKey = `content:${id}:${type || 'auto'}`;
    const cached = getCache(cacheKey);

    if (cached) {
        return cached;
    }

    try {
        let html;
        let url;
        let detectedType = type;

        // If type is provided, use it directly
        if (type) {
            if (type === 'series') {
                url = `/series/${id}/`;
            } else if (type === 'movie') {
                url = `/movies/${id}/`;
            } else if (type === 'cartoon') {
                url = `/cartoons/${id}/`;
            } else {
                url = `/series/${id}/`; // Default to series
            }
            
            try {
                html = await fetchPage(url);
            } catch (error) {
                // If specified type fails, try auto-detection
                if (error.message.includes('404')) {
                    console.log(`Type ${type} not found for ${id}, trying auto-detection`);
                    detectedType = null; // Reset for auto-detection
                } else {
                    throw error;
                }
            }
        }

        // Auto-detect type if not specified or if specified type failed
        if (!detectedType || !html) {
            const types = ['series', 'movies', 'cartoons'];
            let lastError;
            
            for (const tryType of types) {
                try {
                    url = `/${tryType}/${id}/`;
                    html = await fetchPage(url);
                    detectedType = tryType === 'movies' ? 'movie' : tryType;
                    lastError = null;
                    break;
                } catch (error) {
                    lastError = error;
                    if (!error.message.includes('404')) {
                        throw error; // Throw non-404 errors immediately
                    }
                }
            }
            
            if (!html && lastError) {
                throw new Error(`Content not found: ${id} (tried: series, movies, cartoons)`);
            }
        }

        const $ = parseHTML(html);

        // Extract basic info
        const title = $('h1, .entry-title, .title, [class*="title"]').first().text().trim() ||
            id.replace(/-/g, ' ');

        const posterEl = $('.poster img, .thumbnail img, article img, [class*="poster"] img').first();
        let poster = posterEl.attr('src') || posterEl.attr('data-src') || posterEl.attr('data-lazy-src') || '';
        if (poster && !poster.startsWith('http')) {
            poster = poster.startsWith('//') ? `https:${poster}` : `https://toonstream.one${poster}`;
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

        // Extract related content
        const related = [];
        $('.related-posts article, .related-movies article, .related article, [class*="related"] article').each((_, el) => {
            const anime = extractAnimeCard($(el), $);
            if (anime && anime.id) {
                related.push(anime);
            }
        });

        // Extract episodes/seasons (only for series and cartoons)
        const seasons = {};
        let allEpisodes = [];
        let totalEpisodes = 0;

        if (detectedType === 'series' || detectedType === 'cartoon') {
            // Look for season containers
            $('[class*="season"], .episodes-list, [id*="season"]').each((_, seasonEl) => {
                const seasonText = $(seasonEl).find('[class*="season-title"], h2, h3').first().text();
                const seasonMatch = seasonText.match(/season\s*(\d+)/i);
                const seasonNum = seasonMatch ? parseInt(seasonMatch[1]) : 1;

                const episodes = [];
                $(seasonEl).find('a[href*="/episode/"]').each((_, el) => {
                    const container = $(el).closest('li, .episode-item');
                    const elementToParse = container.length ? container : $(el).parent();

                    const episode = extractEpisodeInfo(elementToParse, $);
                    if (episode && episode.id) {
                        episode.season = seasonNum;
                        episodes.push(episode);
                        allEpisodes.push(episode);
                    }
                });

                if (episodes.length > 0) {
                    seasons[seasonNum] = episodes;
                }
            });

            // If no seasons found, try to get all episode links
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

            totalEpisodes = allEpisodes.length;
        }

        const data = {
            success: true,
            id,
            title,
            type: detectedType,
            poster,
            description,
            rating,
            quality,
            runtime,
            genres,
            languages,
            cast,
            totalEpisodes,
            seasons,
            related,
            url: `https://toonstream.one/${detectedType === 'movie' ? 'movies' : detectedType === 'cartoon' ? 'cartoons' : 'series'}/${id}/`
        };

        setCache(cacheKey, data, 3600); // Cache for 1 hour
        return data;
    } catch (error) {
        console.error('Error scraping content details:', error.message);
        throw new Error(`Failed to scrape content details: ${error.message}`);
    }
};

/**
 * Helper function to extract anime card (needed for related content)
 */
function extractAnimeCard($element, $) {
    const link = $element.find('a').first();
    const url = link.attr('href');
    if (!url) return null;
    
    const idData = extractAnimeId(url);
    if (!idData) return null;
    
    const title = link.text().trim() || link.attr('title') || '';
    const img = $element.find('img').first();
    const poster = img.attr('src') || img.attr('data-src') || null;
    
    return {
        id: idData.id,
        title: title.replace(/^Image\s+/i, '').trim(),
        type: idData.type,
        poster: poster ? (poster.startsWith('http') ? poster : `https://toonstream.one${poster}`) : null
    };
}

/**
 * Check availability for multiple content items
 * @param {string[]} ids - Array of content IDs
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
                    type: data.type,
                    totalEpisodes: data.totalEpisodes || 0,
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
