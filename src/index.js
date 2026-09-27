import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const target_url = "https://books.toscrape.com/catalogue/page-1.html";
const user_agent_header = "FlyrankInternship-A9/1.0 (+https://github.com/Natex15/Flyrank-Assignment5-Web-Scraper)";
const cataloguePages = 3;

async function getPage(url) {
    let content;
    const splitURL = url.split('/');
    let temp = "";
    let cleanUrl = "";
    temp = splitURL.pop();
    while (temp.includes(".com") != true) {
        if (cleanUrl) {
            cleanUrl = `${temp}-${cleanUrl}`;
        } else {
            cleanUrl = temp;
        }
        temp = splitURL.pop();
    }
    const cache_path = `./cache/${cleanUrl}`;
    try {
        await fs.access(cache_path);
        content = await fs.readFile(cache_path, 'utf-8');
        console.log(`CACHE HIT - Size: ${Buffer.byteLength(content)} bytes`);
    } catch (e) {
        console.log("CACHE MISS");
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        await sleep(500);
        const response = await fetch(url, {
            headers: {
                "User-Agent": user_agent_header
            },
            signal: AbortSignal.timeout(5000)
        })
        if (response.status !== 200) {
            console.error(`[HTTP Error] ${url} - Status: ${response.status}`);
            process.exit(1);
        }
        content = await response.text();
        await fs.mkdir(path.dirname(cache_path), { recursive: true });
        await fs.writeFile(cache_path, content, 'utf-8');
        console.log(`FETCH - Size: ${Buffer.byteLength(content)} bytes`);
    }
    return content;
}


async function run() {
    let currentPage = target_url;
    const bookLinks = [];
    for (let i = 0; i < cataloguePages; i++) {
        const data = await getPage(currentPage);
        const $ = cheerio.load(data);
        $('article.product_pod h3 a').each((index, element) => {
            const relativeHref = $(element).attr('href');
            const absoluteUrl = new URL(relativeHref, currentPage).href;
            bookLinks.push(absoluteUrl);
        });
        const relativeHref = $('li.next a').attr('href');
        if (!relativeHref) break; // Stop early if there are no more pages
        currentPage = new URL(relativeHref, currentPage).href;
    }
    const unique_urls = new Set(bookLinks);
    console.log(`catalogue_pages=${cataloguePages} , discovered=${bookLinks.length} , unique_urls=${unique_urls.size}`);

}

run()