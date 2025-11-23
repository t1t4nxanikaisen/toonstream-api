import * as cheerio from 'cheerio';
import config from '../../config.js';

/**
 * Fetch HTML content from a URL using native Fetch API
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @returns {Promise<string>} HTML content
 */
export const fetchPage = async (url, options = {}) => {
    try {
        const fullUrl = url.startsWith('http') ? url : `${config.baseUrl}${url}`;

        const response = await fetch(fullUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0',
                'Referer': 'https://www.google.com/',
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.text();
    } catch (error) {
        console.error(`Error fetching page ${url}:`, error.message);
        throw new Error(`Failed to fetch page: ${error.message}`);
    }
};

/**
 * Parse HTML content with Cheerio
 * @param {string} html - HTML content
 * @returns {CheerioAPI} Cheerio instance
 */
export const parseHTML = (html) => {
    return cheerio.load(html);
};

/**
 * Normalize image URL
 * @param {string} url - Image URL
 * @returns {string} Normalized URL
 */
const normalizeImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `${config.baseUrl}${url}`;
    return url;
};

/**
 * Extract anime/series card information
 * @param {Cheerio} $element - Cheerio element
 * @param {CheerioAPI} $ - Cheerio instance
 * @returns {object} Anime card data
 */
export const extractAnimeCard = ($element, $) => {
    try {
        // Find the main link
        const link = $element.is('a') ? $element : $element.find('a').first();
        const url = link.attr('href') || '';

        // Skip if it's a category or non-content link
        if (!url ||
            url.includes('/category/') ||
            url.includes('/tag/') ||
            url.includes('/cast_tv/') ||
            url === '#' ||
            (!url.includes('/series/') && !url.includes('/movies/') && !url.includes('/movie/'))) {
            return null;
        }

        // Extract poster image - try multiple selectors
        let poster = null;
        const imgSelectors = [
            'img',
            '.poster img',
            '.thumbnail img',
            'figure img',
            '[class*="image"] img',
            '[class*="poster"] img'
        ];

        for (const selector of imgSelectors) {
            const img = $element.find(selector).first();
            if (img.length) {
                poster = img.attr('data-src') ||
                    img.attr('data-lazy-src') ||
                    img.attr('src') ||
                    img.attr('data-original');
                if (poster) break;
            }
        }

        // Also check if element itself is an image container
        if (!poster) {
            const directImg = $element.find('img').first();
            if (directImg.length) {
                poster = directImg.attr('data-src') ||
                    directImg.attr('data-lazy-src') ||
                    directImg.attr('src') ||
                    directImg.attr('data-original');
            }
        }

        poster = normalizeImageUrl(poster);

        // Extract title from various possible locations
        const img = $element.find('img').first();
        let title = img.attr('alt') ||
            img.attr('title') ||
            $element.find('.title, h2, h3, h4, [class*="title"]').first().text().trim() ||
            link.attr('title') ||
            link.text().trim() ||
            '';

        // Clean title - remove "Image" prefix and extra whitespace
        title = title
            .replace(/^Image\s+/i, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Extract ID from URL
        const urlParts = url.split('/').filter(Boolean);
        const id = urlParts[urlParts.length - 1] || '';

        // Extract rating if available
        const ratingEl = $element.find('.rating, .imdb, .tmdb, [class*="rating"], .ribon');
        const ratingText = ratingEl.text().trim();
        const rating = ratingText.match(/[\d.]+/)?.[0] || null;

        // Only return if we have at least an ID and URL
        if (!id || !url) {
            return null;
        }

        return {
            id,
            title: title || id.replace(/-/g, ' '),
            url: url.startsWith('http') ? url : `${config.baseUrl}${url}`,
            poster,
            rating: rating ? parseFloat(rating) : null
        };
    } catch (error) {
        console.error('Error extracting anime card:', error.message);
        return null;
    }
};

/**
 * Extract episode information from element
 * @param {Cheerio} $element - Cheerio element
 * @param {CheerioAPI} $ - Cheerio instance
 * @returns {object} Episode data
 */
export const extractEpisodeInfo = ($element, $) => {
    try {
        const link = $element.is('a') ? $element : $element.find('a').first();
        const url = link.attr('href') || '';
        const title = link.text().trim() || link.attr('title') || '';

        // Extract episode ID from URL
        const urlParts = url.split('/').filter(Boolean);
        const id = urlParts[urlParts.length - 1] || '';

        // Extract season and episode numbers (e.g., "1x17" or "Hunter x Hunter 1x17")
        const episodeMatch = (title + ' ' + id).match(/(\d+)x(\d+)/);
        const season = episodeMatch ? parseInt(episodeMatch[1]) : null;
        const episode = episodeMatch ? parseInt(episodeMatch[2]) : null;

        // Extract release date if available
        const dateText = $element.find('.date, time, .release-date').text().trim();

        if (!id || !url) {
            return null;
        }

        return {
            id,
            title: title || id.replace(/-/g, ' '),
            url: url.startsWith('http') ? url : `${config.baseUrl}${url}`,
            season,
            episode,
            releaseDate: dateText || null
        };
    } catch (error) {
        console.error('Error extracting episode info:', error.message);
        return null;
    }
};

/**
 * Extract pagination information
 * @param {CheerioAPI} $ - Cheerio instance
 * @returns {object} Pagination data
 */
export const extractPagination = ($) => {
    try {
        const pagination = $('.pagination, .nav-links, [class*="pagination"]');
        const currentPageEl = pagination.find('.current, .active, [aria-current="page"]');
        const currentPage = parseInt(currentPageEl.text()) || 1;

        const pageLinks = pagination.find('a');
        let totalPages = currentPage;

        pageLinks.each((_, el) => {
            const pageNum = parseInt($(el).text());
            if (pageNum && pageNum > totalPages) {
                totalPages = pageNum;
            }
        });

        const hasNextPage = pagination.find('.next, [rel="next"]').length > 0;
        const hasPrevPage = pagination.find('.prev, [rel="prev"]').length > 0;

        return {
            currentPage,
            totalPages,
            hasNextPage,
            hasPrevPage
        };
    } catch (error) {
        return {
            currentPage: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false
        };
    }
};

/**
 * Clean and normalize text
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
export const cleanText = (text) => {
    if (!text) return '';
    return text
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim();
};

/**
 * Extract slug from URL
 * @param {string} url - URL to extract slug from
 * @returns {string} Slug
 */
export const extractSlug = (url) => {
    const parts = url.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
};

export default {
    fetchPage,
    parseHTML,
    extractAnimeCard,
    extractEpisodeInfo,
    extractPagination,
    cleanText,
    extractSlug
};
