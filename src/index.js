import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { z } from 'zod';

const target_url = "https://books.toscrape.com/catalogue/page-1.html";
const user_agent_header = "FlyrankInternship-A9/1.0 (+https://github.com/Natex15/Flyrank-Assignment5-Web-Scraper)";
const cataloguePages = 3;

async function fetchWithRetry(url, maxAttempts = 2) {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await sleep(500); // Polite rate limit
            const response = await fetch(url, {
                headers: { "User-Agent": user_agent_header },
                signal: AbortSignal.timeout(5000)
            });

            if (response.status === 200) {
                return await response.text();
            }

            // Do not retry 4xx errors (client errors: 404, 403, etc.)
            if (response.status >= 400 && response.status < 500) {
                throw new Error(`HTTP ${response.status} (Client Error - No retry)`);
            }

            // Server error (5xx) - throw so it can be retried
            if (response.status >= 500 && response.status < 600) {
                throw new Error(`HTTP ${response.status} (Server Error)`);
            }

            throw new Error(`HTTP ${response.status}`);
        } catch (err) {
            const isTimeout = err.name === 'TimeoutError';
            const isLastAttempt = attempt === maxAttempts;

            if (isLastAttempt || (!isTimeout && err.message.includes('No retry'))) {
                throw err;
            }
            console.warn(`[Attempt ${attempt} failed: ${err.message}]. Retrying once...`);
            await sleep(1000); // Backoff before retry
        }
    }
    throw new Error(`Failed to fetch ${url} after ${maxAttempts} attempts`);
}


async function getPage(url, stats) {
    let content;
    const splitURL = url.split('/');
    let temp = splitURL.pop();
    let cleanUrl = "";
    while (temp && !temp.includes(".com")) {
        if (cleanUrl) {
            cleanUrl = `${temp}-${cleanUrl}`;
        } else {
            cleanUrl = temp;
        }
        temp = splitURL.pop();
    }
    const cache_path = `./cache/${cleanUrl || 'default'}`;
    try {
        await fs.access(cache_path);
        content = await fs.readFile(cache_path, 'utf-8');
        if (stats) stats.cache_hits++;
        console.log(`CACHE HIT - Size: ${Buffer.byteLength(content)} bytes`);
    } catch (e) {
        console.log("CACHE MISS");
        content = await fetchWithRetry(url);
        if (stats) stats.pages_fetched++;
        await fs.mkdir(path.dirname(cache_path), { recursive: true });
        await fs.writeFile(cache_path, content, 'utf-8');
        console.log(`FETCH - Size: ${Buffer.byteLength(content)} bytes`);
    }
    const fetched_at = new Date().toISOString()
    return { content, fetched_at };
}

function parseBookDetail(content, metadata) {
    const $ = cheerio.load(content);
    const product = $('article.product_page');
    const productMain = product.find('.product_main');
    const title = productMain.find('h1').text().trim();
    const price_text = productMain.find('.price_color').text().trim();
    const availability_text = productMain.find('.availability').text().replace(/\s+/g, ' ').trim();
    const starClass = productMain.find('.star-rating').attr('class') || '';
    const rating_text = starClass.split(/\s+/).find(c => c && c !== 'star-rating') || null;
    const descEl = product.find('#product_description').next('p');
    const description = descEl.length > 0 && descEl.text().trim() !== ''
        ? descEl.text().trim()
        : null;

    return {
        title,
        product_url: metadata.product_url,
        price_text,
        availability_text,
        rating_text,
        description,
        source_page: metadata.source_page,
        fetched_at: metadata.fetched_at
    };
}

function cleanBookRecord(raw) {
    const numericString = raw.price_text.replace(/[^0-9.]/g, '');
    const price_gbp = parseFloat(numericString);

    return {
        ...raw,
        price_gbp: Number.isNaN(price_gbp) ? null : price_gbp,
    };
}


async function run() {
    const stats = {
        start_time: new Date().toISOString(),
        start_ms: Date.now(),
        pages_fetched: 0,
        cache_hits: 0,
        failed_pages: 0,
        valid_records: 0,
        invalid_records: 0
    };

    const BookSchema = z.object({
        title: z.string().min(1),
        product_url: z.string().url().startsWith('https://'),
        price_text: z.string().min(1),
        price_gbp: z.number().positive(),
        availability_text: z.string().min(1),
        rating_text: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        source_page: z.string().url().startsWith('https://'),
        fetched_at: z.string().datetime(),
    });



    let currentPage = target_url;
    const bookLinks = [];
    for (let i = 0; i < cataloguePages; i++) {
        const { content, fetched_at } = await getPage(currentPage, stats);
        const $ = cheerio.load(content);
        $('article.product_pod h3 a').each((index, element) => {
            const relativeHref = $(element).attr('href');
            const absoluteUrl = new URL(relativeHref, currentPage).href;
            bookLinks.push({ product_url: absoluteUrl, source_page: currentPage });
        });
        const relativeHref = $('li.next a').attr('href');
        if (!relativeHref) break; // Stop early if there are no more pages
        currentPage = new URL(relativeHref, currentPage).href;
    }
    const uniqueBooksMap = new Map();
    for (const book of bookLinks) {
        if (!uniqueBooksMap.has(book.product_url)) {
            uniqueBooksMap.set(book.product_url, book);
        }
    }
    console.log(`discovered=${bookLinks.length}, unique_urls=${uniqueBooksMap.size}`);
    const uniqueBooks = Array.from(uniqueBooksMap.values());

    const rawRecords = [];
    for (const book of uniqueBooks) {
        try {
            const { content, fetched_at } = await getPage(book.product_url, stats);
            const record = parseBookDetail(content, {
                product_url: book.product_url,
                source_page: book.source_page,
                fetched_at: fetched_at
            });
            rawRecords.push(record);
        } catch (err) {
            console.error(`[Skipping Book] Failed to process ${book.product_url}: ${err.message}`);
            stats.failed_pages++;
        }
    }
    const validRecords = [];
    const errorRecords = [];

    for (const raw of rawRecords) {
        const cleaned = cleanBookRecord(raw);
        const validation = BookSchema.safeParse(cleaned);

        if (validation.success) {
            validRecords.push(validation.data);
        } else {
            errorRecords.push({
                record: cleaned,
                errors: validation.error.issues,
            });
        }
    }
    const outputDir = path.resolve('output');
    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(
        path.join(outputDir, 'books.json'),
        JSON.stringify(validRecords, null, 2),
        'utf-8'
    );

    if (errorRecords.length > 0) {
        await fs.writeFile(
            path.join(outputDir, 'errors.json'),
            JSON.stringify(errorRecords, null, 2),
            'utf-8'
        );
    }

    stats.valid_records = validRecords.length;
    stats.invalid_records = errorRecords.length;
    stats.duration_ms = Date.now() - stats.start_ms;
    delete stats.start_ms; // Clean up helper timestamp

    await fs.writeFile(
        path.join(outputDir, 'run-report.json'),
        JSON.stringify(stats, null, 2),
        'utf-8'
    );


    console.log(`catalogue_pages=${cataloguePages} , discovered=${bookLinks.length} , unique_urls=${uniqueBooks.length}`);

}

run()