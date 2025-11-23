import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import config from '../../config.js';

// Create axios instance with cookie jar support
const jar = new CookieJar();
const client = wrapper(axios.create({
    jar,
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: (status) => status < 500,
}));

/**
 * Fetch a page with Cloudflare bypass
 * @param {string} url - URL to fetch
 * @param {object} options - Additional options
 * @returns {Promise<string>} HTML content
 */
export const fetchPage = async (url, options = {}) => {
    try {
        const fullUrl = url.startsWith('http') ? url : `${config.baseUrl}${url}`;

        const response = await client.get(fullUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Cache-Control': 'max-age=0',
                'Referer': 'https://www.google.com/',
                ...options.headers
            },
            ...options
        });

        if (response.status === 403) {
            console.error(`403 Forbidden for ${fullUrl}`);
            throw new Error(`Access denied (403). The website may be blocking automated requests.`);
        }

        if (response.status >= 400) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.data;
    } catch (error) {
        console.error(`Error fetching page ${url}:`, error.message);
        throw new Error(`Failed to fetch page: ${error.message}`);
    }
};

/**
 * Parse HTML content
 * @param {string} html - HTML content
 * @returns {CheerioAPI} Cheerio instance
 */
export const parseHTML = (html) => {
    return cheerio.load(html);
};

/**
 * Normalize image URL
 * @param {string} url - Image URL
 * @returns {string|null} Normalized URL
 */
export const normalizeImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `${config.baseUrl}${url}`;
    return url;
};

/**
 * Normalize anime URL
 * @param {string} url - Anime URL
 * @returns {string|null} Normalized URL
 */
export const normalizeUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) return `${config.baseUrl}${url}`;
    return `${config.baseUrl}/${url}`;
};

/**
 * Extract anime ID from URL
 * @param {string} url - Anime URL
 * @returns {string|null} Anime ID
 */
export const extractAnimeId = (url) => {
    if (!url) return null;

    // Extract from URLs like /series/anime-name/ or /movies/movie-name/
    const match = url.match(/\/(series|movies?)\/([^\/]+)/);
    return match ? match[2] : null;
};

/**
 * Extract anime card data from element
 * @param {Cheerio} $element - Cheerio element
 * @param {CheerioAPI} $ - Cheerio instance
 * @returns {object|null} Anime data
 */
export const extractAnimeCard = ($element, $) => {
    try {
        // Find the main link
        const link = $element.find('a[href*="/series/"], a[href*="/movies/"], a[href*="/movie/"]').first();
        if (!link.length) return null;

        let url = link.attr('href');
        if (!url) return null;

        // Filter out non-content links
        if (url.includes('/category/') ||
            url.includes('/tag/') ||
            url.includes('/cast_tv/') ||
            url.includes('/genre/')) {
            return null;
        }

        url = normalizeUrl(url);
        const id = extractAnimeId(url);
        if (!id) return null;

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

        if (!title) return null;

        return {
            id,
            title,
            url,
            poster
        };
    } catch (error) {
        console.error('Error extracting anime card:', error);
        return null;
    }
};

/**
 * Extract episode information from element
 * @param {Cheerio} $element - Cheerio element
 * @param {CheerioAPI} $ - Cheerio instance
 * @returns {object|null} Episode data
 */
export const extractEpisodeInfo = ($element, $) => {
    try {
        const link = $element.find('a').first();
        const url = normalizeUrl(link.attr('href'));
        const title = link.text().trim() || link.attr('title') || '';
        const id = extractAnimeId(url);

        return {
            id,
            title,
            url
        };
    } catch (error) {
        console.error('Error extracting episode info:', error);
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
        const pagination = {
            currentPage: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false
        };

        // Try to find pagination elements
        const currentPageEl = $('.current, .page-numbers.current, .pagination .active');
        if (currentPageEl.length) {
            pagination.currentPage = parseInt(currentPageEl.text().trim()) || 1;
        }

        // Find all page numbers
        const pageNumbers = $('.page-numbers, .pagination a').map((_, el) => {
            const num = parseInt($(el).text().trim());
            return isNaN(num) ? 0 : num;
        }).get();

        if (pageNumbers.length > 0) {
            pagination.totalPages = Math.max(...pageNumbers, pagination.currentPage);
        }

        // Check for next/prev links
        pagination.hasNextPage = $('.next, .page-numbers.next, .pagination .next').length > 0;
        pagination.hasPrevPage = $('.prev, .page-numbers.prev, .pagination .prev').length > 0;

        return pagination;
    } catch (error) {
        console.error('Error extracting pagination:', error);
        return {
            currentPage: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false
        };
    }
};

/**
 * Clean text by removing extra whitespace
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
export const cleanText = (text) => {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
};

/**
 * Extract slug from URL
 * @param {string} url - URL
 * @returns {string|null} Slug
 */
export const extractSlug = (url) => {
    if (!url) return null;
    const match = url.match(/\/([^\/]+)\/?$/);
    return match ? match[1] : null;
};
