import fs from 'node:fs/promises';
import path from 'node:path';

const target_url = "https://books.toscrape.com/catalogue/page-1.html";
const cache_path = "./cache/catalogue-page-1.html";
const user_agent_header = "FlyrankInternship-A9/1.0 (+https://github.com/Natex15/Flyrank-Assignment5-Web-Scraper)";

async function run() {
    try {
        await fs.access(cache_path);
        const content = await fs.readFile(cache_path, 'utf-8');
        console.log(`CACHE HIT - Size: ${Buffer.byteLength(content)} bytes`);
    } catch (e) {
        console.log("CACHE MISS");
        const response = await fetch(target_url, {
            headers: {
                "User-Agent": user_agent_header
            },
            signal: AbortSignal.timeout(5000)
        })
        if (response.status !== 200) {
            console.error(`[HTTP Error] ${target_url} - Status: ${response.status}`);
            process.exit(1);
        }
        const content = await response.text();
        await fs.mkdir(path.dirname(cache_path), { recursive: true });
        await fs.writeFile(cache_path, content, 'utf-8');
        console.log(`FETCH - Size: ${Buffer.byteLength(content)} bytes`);
    }
}

run()

