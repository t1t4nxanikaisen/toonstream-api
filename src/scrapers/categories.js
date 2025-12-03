import { fetchPage, parseHTML, extractAnimeCard, extractPagination } from '../utils/scraper.js';
import { getCache, setCache } from '../utils/cache.js';

/**
 * Scrape anime by category
 * @param {string} category - Category slug
 * @param {number} page - Page number
 * @returns {Promise<object>} Category data
 */
export const scrapeCategory = async (category, page = 1) => {
    const cacheKey = `category:${category}:${page}`;
    const cached = getCache(cacheKey);

    if (cached) {
        return cached;
    }

    try {
        // Try without /page/ first for page 1, then with /page/ for other pages
        let url;
        if (page === 1) {
            url = `/category/${category}/`;
        } else {
            url = `/category/${category}/page/${page}/`;
        }

        const html = await fetchPage(url);
        const $ = parseHTML(html);

        const animes = [];
        const processedIds = new Set();

        // Use the same post-lst structure as search
        $('ul.post-lst li').each((_, el) => {
            const $li = $(el);
            const anime = extractAnimeCard($li, $);
            if (anime && anime.id && !processedIds.has(anime.id)) {
                processedIds.add(anime.id);
                animes.push(anime);
            }
        });

        const pagination = extractPagination($);
        const categoryName = $('.page-title, h1, .section-title').first().text().trim() || category;

        const data = {
            success: true,
            category,
            categoryName,
            results: animes,  // Changed from 'animes' to 'results' for consistency
            pagination
        };

        setCache(cacheKey, data, 1800); // Cache for 30 minutes
        return data;
    } catch (error) {
        console.error('Error scraping category:', error.message);
        throw new Error(`Failed to scrape category: ${error.message}`);
    }
};

/**
 * Get all available categories
 * @returns {Promise<object>} Categories list
 */
export const scrapeCategories = async () => {
    const cacheKey = 'categories:all';
    const cached = getCache(cacheKey);

    if (cached) {
        return cached;
    }

    try {
        const html = await fetchPage('/');
        const $ = parseHTML(html);

        const categories = [];

        // Extract from navigation menu
        $('nav a[href*="/category/"], .menu a[href*="/category/"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const name = $(el).text().trim();
            const slug = href.split('/category/')[1]?.split('/')[0];

            if (slug && name) {
                categories.push({
                    slug,
                    name,
                    url: href
                });
            }
        });

        // Extract from footer or sidebar
        $('.widget_categories a, .categories a').each((_, el) => {
            const href = $(el).attr('href') || '';
            const name = $(el).text().trim();
            const slug = href.split('/category/')[1]?.split('/')[0];

            if (slug && name && !categories.find(c => c.slug === slug)) {
                categories.push({
                    slug,
                    name,
                    url: href
                });
            }
        });

        // If no categories found, use fallback
        if (categories.length === 0) {
            console.log('Using fallback genres');
            categories.push(...FALLBACK_GENRES);
        }

        const data = {
            success: true,
            categories
        };

        setCache(cacheKey, data, 7200); // Cache for 2 hours
        return data;
    } catch (error) {
        console.error('Error scraping categories:', error.message);
        throw new Error(`Failed to scrape categories: ${error.message}`);
    }
};

/**
 * Scrape anime by language
 * @param {string} language - Language (hindi, tamil, telugu, english)
 * @param {number} page - Page number
 * @returns {Promise<object>} Language filtered data
 */
export const scrapeByLanguage = async (language, page = 1) => {
    const cacheKey = `language:${language}:${page}`;
    const cached = getCache(cacheKey);

    if (cached) {
        return cached;
    }

    try {
        // Language categories on toonstream
        const languageMap = {
            'hindi': 'hindi-language',
            'tamil': 'tamil',
            'telugu': 'telugu',
            'english': 'english'
        };

        const categorySlug = languageMap[language.toLowerCase()] || language;
        return await scrapeCategory(categorySlug, page);
    } catch (error) {
        console.error('Error scraping by language:', error.message);
        throw new Error(`Failed to scrape by language: ${error.message}`);
    }
};

/**
 * Scrape movies
 * @param {number} page - Page number
 * @returns {Promise<object>} Movies data
 */
export const scrapeMovies = async (page = 1) => {
    return await scrapeCategory('anime-movies', page);
};

/**
 * Scrape series
 * @param {number} page - Page number
 * @returns {Promise<object>} Series data
 */
export const scrapeSeries = async (page = 1) => {
    return await scrapeCategory('anime-series', page);
};

/**
 * Scrape latest movies
 * @param {number} page - Page number
 * @returns {Promise<object>} Latest movies data
 */
export const scrapeLatestMovies = async (page = 1) => {
    // Usually the default category sort is by date/latest
    return await scrapeCategory('anime-movies', page);
};

/**
 * Scrape latest series
 * @param {number} page - Page number
 * @returns {Promise<object>} Latest series data
 */
export const scrapeLatestSeries = async (page = 1) => {
    // Usually the default category sort is by date/latest
    return await scrapeCategory('anime-series', page);
};

/**
 * Scrape random anime from a category
 * @param {string} category - Category slug
 * @returns {Promise<object>} Random anime data
 */
export const scrapeRandom = async (category) => {
    try {
        // 1. Get first page to find total pages
        const firstPage = await scrapeCategory(category, 1);
        const totalPages = firstPage.pagination.totalPages || 1;

        // 2. Pick a random page (cap at 50 to be safe/fast)
        const maxPage = Math.min(totalPages, 50);
        const randomPage = Math.floor(Math.random() * maxPage) + 1;

        // 3. Fetch random page (if not 1)
        let pageData = firstPage;
        if (randomPage !== 1) {
            pageData = await scrapeCategory(category, randomPage);
        }

        // 4. Pick random anime
        const animes = pageData.results || [];
        if (animes.length === 0) {
            throw new Error('No anime found');
        }

        const randomAnime = animes[Math.floor(Math.random() * animes.length)];
        return {
            success: true,
            ...randomAnime
        };
    } catch (error) {
        console.error('Error scraping random:', error.message);
        throw new Error(`Failed to scrape random anime: ${error.message}`);
    }
};

/**
 * Scrape random movie
 * @returns {Promise<object>} Random movie data
 */
export const scrapeRandomMovie = async () => {
    return await scrapeRandom('anime-movies');
};

/**
 * Scrape random series
 * @returns {Promise<object>} Random series data
 */
export const scrapeRandomSeries = async () => {
    return await scrapeRandom('anime-series');
};

// Fallback genres list
const FALLBACK_GENRES = [
    { slug: 'action', name: 'Action', url: '/category/action/' },
    { slug: 'adventure', name: 'Adventure', url: '/category/adventure/' },
    { slug: 'comedy', name: 'Comedy', url: '/category/comedy/' },
    { slug: 'drama', name: 'Drama', url: '/category/drama/' },
    { slug: 'fantasy', name: 'Fantasy', url: '/category/fantasy/' },
    { slug: 'horror', name: 'Horror', url: '/category/horror/' },
    { slug: 'mystery', name: 'Mystery', url: '/category/mystery/' },
    { slug: 'romance', name: 'Romance', url: '/category/romance/' },
    { slug: 'sci-fi', name: 'Sci-Fi', url: '/category/sci-fi/' },
    { slug: 'slice-of-life', name: 'Slice of Life', url: '/category/slice-of-life/' },
    { slug: 'sports', name: 'Sports', url: '/category/sports/' },
    { slug: 'thriller', name: 'Thriller', url: '/category/thriller/' },
    { slug: 'supernatural', name: 'Supernatural', url: '/category/supernatural/' }
];

export default {
    scrapeCategory,
    scrapeCategories,
    scrapeByLanguage,
    scrapeMovies,
    scrapeSeries,
    scrapeLatestMovies,
    scrapeLatestSeries,
    scrapeRandomMovie,
    scrapeRandomSeries,
    FALLBACK_GENRES
};
