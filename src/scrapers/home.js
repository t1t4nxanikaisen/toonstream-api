import { fetchPage, parseHTML, extractAnimeCard } from '../utils/scraper.js';
import { getCache, setCache } from '../utils/cache.js';

/**
 * Scrape homepage data
 * @returns {Promise<object>} Homepage data
 */
export const scrapeHome = async () => {
    const cacheKey = 'home';
    const cached = getCache(cacheKey);

    if (cached) {
        return cached;
    }

    try {
        const html = await fetchPage('/home/');
        const $ = parseHTML(html);

        const data = {
            latestSeries: [],
            latestMovies: [],
            trending: [],
            schedule: {}
        };

        const processedIds = new Set();

        // Target the post-lst structure like in search
        $('ul.post-lst li').each((_, el) => {
            const $li = $(el);
            const liClass = $li.attr('class') || '';

            // Skip if already processed
            const link = $li.find('a.lnk-blk').first();
            const url = link.attr('href');
            if (!url) return;

            const id = url.split('/').filter(Boolean).pop();
            if (!id || processedIds.has(id)) return;
            processedIds.add(id);

            const anime = extractAnimeCard($li, $);
            if (anime && anime.id) {
                // Categorize based on URL pattern or class
                if (liClass.includes('type-series') || anime.url.includes('/series/')) {
                    if (data.latestSeries.length < 20) {
                        data.latestSeries.push(anime);
                    }
                } else if (liClass.includes('type-movies') || anime.url.includes('/movies/') || anime.url.includes('/movie/')) {
                    if (data.latestMovies.length < 20) {
                        data.latestMovies.push(anime);
                    }
                }
            }
        });

        // Extract schedule if available
        const scheduleSection = $('.schedule, #schedule, [class*="schedule"]');
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

        days.forEach(day => {
            const daySection = scheduleSection.find(`[data-day="${day}"], .${day}, #${day}`);
            const dayAnimes = [];

            daySection.find('article, .item, .post').each((_, el) => {
                const anime = extractAnimeCard($(el), $);
                if (anime && anime.id) {
                    const time = $(el).find('.time, .release-time').text().trim();
                    dayAnimes.push({
                        ...anime,
                        releaseTime: time || null
                    });
                }
            });

            if (dayAnimes.length > 0) {
                data.schedule[day] = dayAnimes;
            }
        });

        setCache(cacheKey, data, 1800); // Cache for 30 minutes
        return data;
    } catch (error) {
        console.error('Error scraping home:', error.message);
        throw new Error(`Failed to scrape home page: ${error.message}`);
    }
};

export default { scrapeHome };
