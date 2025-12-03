import { fetchPage, parseHTML, extractAnimeCard, extractPagination, normalizeUrl, normalizeImageUrl, extractAnimeId } from '../utils/scraper.js';
import { getCache, setCache } from '../utils/cache.js';

/**
 * Search for anime/series
 * @param {string} keyword - Search keyword
 * @param {number} page - Page number
 * @returns {Promise<object>} Search results
 */
export const scrapeSearch = async (keyword, page = 1) => {
    const cacheKey = `search:${keyword}:${page}`;
    const cached = getCache(cacheKey);

    if (cached) {
        return cached;
    }

    try {
        const searchUrl = `/home/?s=${encodeURIComponent(keyword)}${page > 1 ? `&paged=${page}` : ''}`;
        const html = await fetchPage(searchUrl);
        const $ = parseHTML(html);

        const results = [];
        const processedIds = new Set();

        // Target search results in the post-lst structure
        $('ul.post-lst li').each((_, el) => {
            const $li = $(el);
            const article = $li.find('article.post');

            if (!article.length) return;

            // Extract link
            const link = $li.find('a.lnk-blk').first();
            let url = link.attr('href');
            if (!url) return;

            // Filter out non-content links
            if (url.includes('/category/') ||
                url.includes('/tag/') ||
                url.includes('/cast_tv/') ||
                url.includes('/genre/')) {
                return;
            }

            url = normalizeUrl(url);
            const id = extractAnimeId(url);
            if (!id || processedIds.has(id)) return;

            processedIds.add(id);

            // Extract title
            const titleEl = article.find('.entry-title, h2.entry-title').first();
            let title = titleEl.text().trim();

            // Clean title - remove "Image" prefix
            title = title.replace(/^Image\s+/i, '').trim();
            if (!title) return;

            // Extract poster image
            const img = article.find('figure img').first();
            let poster = img.attr('data-src') ||
                img.attr('data-lazy-src') ||
                img.attr('src') ||
                img.attr('data-original');
            poster = normalizeImageUrl(poster);

            // Determine type from li class
            const liClass = $li.attr('class') || '';
            let type = 'Unknown';
            if (liClass.includes('type-series')) {
                type = 'Series';
            } else if (liClass.includes('type-movies')) {
                type = 'Movie';
            } else if (url.includes('/series/')) {
                type = 'Series';
            } else if (url.includes('/movie')) {
                type = 'Movie';
            }

            // Extract description if available
            const descEl = article.find('.description, .excerpt, .summary, p').first();
            let description = descEl.text().trim() || null;
            if (description && description.length > 200) {
                description = description.substring(0, 200) + '...';
            }

            // Check for Hindi dub availability - check category class
            const hasHindi = liClass.includes('category-hindi-language') ||
                liClass.includes('hindi-language') ||
                title.toLowerCase().includes('hindi');

            // Try to extract rating
            const voteEl = article.find('.vote span:last-child');
            const rating = voteEl.text().trim() || null;

            results.push({
                id,
                title,
                url,
                poster,
                type,
                description,
                hasHindi,
                rating,
                totalEpisodes: null
            });
        });

        const pagination = extractPagination($);

        const data = {
            success: true,
            keyword,
            results,
            pagination
        };

        setCache(cacheKey, data, 600); // Cache for 10 minutes
        return data;
    } catch (error) {
        console.error('Error scraping search:', error.message);
        throw new Error(`Failed to search: ${error.message}`);
    }
};

/**
 * Get search suggestions
 * @param {string} keyword - Search keyword
 * @returns {Promise<object>} Search suggestions
 */
export const scrapeSearchSuggestions = async (keyword) => {
    const cacheKey = `suggestions:${keyword}`;
    const cached = getCache(cacheKey);

    if (cached) {
        return cached;
    }

    try {
        const searchData = await scrapeSearch(keyword, 1);

        const suggestions = searchData.results.slice(0, 10).map(item => ({
            id: item.id,
            title: item.title,
            poster: item.poster,
            type: item.type,
            hasHindi: item.hasHindi,
            totalEpisodes: item.totalEpisodes
        }));

        const data = {
            success: true,
            keyword,
            suggestions
        };

        setCache(cacheKey, data, 600);
        return data;
    } catch (error) {
        console.error('Error scraping search suggestions:', error.message);
        throw new Error(`Failed to get suggestions: ${error.message}`);
    }
};

export default { scrapeSearch, scrapeSearchSuggestions };
