# Web Scraping Pipeline

A resilient, polite, and idempotent web scraper built for extracting book catalogue information from [Books to Scrape](https://books.toscrape.com/).

---

## 1. Target Classification (Stage 0)

- **Target Website**: [https://books.toscrape.com/](https://books.toscrape.com/)
- **Target Scope**: First 3 catalogue pages (`catalogue/page-1.html` through `catalogue/page-3.html`), yielding exactly 60 unique book detail pages.
- **Robots.txt Analysis**: Attempted fetch of `/robots.txt` returned `404 Not Found`.
- **Appropriateness**: The website is an open sandbox explicitly hosted for developers to learn and test web scraping practices without risk of commercial impact or terms-of-service violations.

---

## 2. Lane & Tech Stack

- **Runtime**: Node.js (v18+ with native `fetch` and ESM)
- **Parsing**: [Cheerio](https://cheerio.js.org/) for fast server-side HTML DOM traversal
- **Validation**: [Zod](https://zod.dev/) for strict runtime schema enforcement and error partitioning

### Why No Browser Was Needed

> **Architectural Note:** This assignment needed no browser because all required book data is fully pre-rendered in the static HTML sent by the server; launching a headless browser (such as Puppeteer or Playwright) would only introduce unnecessary memory, CPU overhead, and execution latency.

---

## 3. Quickstart & Run Commands

Clone the repository, install dependencies, and run the pipeline:

```bash
# Install dependencies
npm install

# Run the scraper
npm run dev
```

The scraper executes idempotently: running it multiple times produces the exact same 60 records without duplication.

---

## 4. Record Schema

Each record is cleaned, validated against a Zod schema, and partitioned before disk storage:

```javascript
const BookSchema = z.object({
  title: z.string().min(1),                              // Required: Book title
  product_url: z.string().url().startsWith('https://'),  // Required: Canonical absolute URL
  price_text: z.string().min(1),                         // Required: Raw currency string (e.g. "£51.77")
  price_gbp: z.number().positive(),                      // Required: Cleaned numeric price (e.g. 51.77)
  availability_text: z.string().min(1),                  // Required: Stock availability text
  rating_text: z.string().nullable().optional(),         // Optional/Nullable: Star rating word ("One"–"Five")
  description: z.string().nullable().optional(),         // Optional/Nullable: Book synopsis (omitted on some items)
  source_page: z.string().url().startsWith('https://'),  // Required: Catalogue page where link was found
  fetched_at: z.string().datetime(),                     // Required: ISO 8601 timestamp of fetch
});
```

- **Clean vs. Raw**: The original string (`price_text`) and the cleaned numeric value (`price_gbp`) live side-by-side.
- **Error Quarantine**: Any record failing validation is routed with error details to `output/errors.json` and excluded from `output/books.json`.

---

## 5. Politeness & Resilience Rules

1. **Explicit Identity (User-Agent)**: Every HTTP request includes an identifying user-agent string:
   ```text
   FlyrankInternship-A9/1.0 (+https://github.com/Natex15/Flyrank-Assignment5-Web-Scraper)
   ```
2. **Polite Request Delay**: Introduces a 500ms delay between consecutive requests to avoid overwhelming target infrastructure.
3. **Request Timeout**: Requests are bounded by `AbortSignal.timeout(5000)` to ensure network hangs fail fast.
4. **Local Disk Cache**: Pages are cached locally under `cache/` by normalized slug. Subsequent runs load from local cache (`CACHE HIT`), completely eliminating unnecessary traffic.
5. **Smart Retry Strategy**:
   - **Retries once**: For network timeouts or server errors (`5xx`).
   - **Does NOT retry**: For client errors such as `404 Not Found` or `403 Forbidden` (asking again will not change the answer).
6. **Fault Isolation**: Individual book fetch/parse failures are logged and increment `failed_pages` without terminating the entire pipeline.

---

## 6. Execution Evidence

Sample execution telemetry from [`output/run-report.json`]()

```json
{
  "start_time": "2026-09-27T13:58:05.373Z",
  "pages_fetched": 0,
  "cache_hits": 63,
  "failed_pages": 0,
  "valid_records": 60,
  "invalid_records": 0,
  "duration_ms": 185
}
```

- When tested against injected invalid URLs, the scraper continues uninterrupted, producing 60 valid records in `books.json` and logging `failed_pages: 1`.

---

## 7. Limitations

- **Fixed Scope & Structure**: The scraper currently scrapes a fixed number of catalogue pages (`cataloguePages = 3`) and relies on the specific DOM structure of `books.toscrape.com`. Structural changes to the target HTML would require selector updates.
- **Cache Invalidation**: The file-based cache does not implement automatic TTL (Time-To-Live) expiration; refreshing data requires manually clearing the `cache/` folder.

---

## 8. Scraping Ethics

- **Prioritize Official APIs**: Whenever an official API or RSS feed is provided, use it instead of scraping.
- **Respect Access Controls**: Never attempt to bypass authentication, paywalls, CAPTCHAs, or rate-limiting measures.
- **Practice Data Minimization**: Collect only the attributes essential to the project and discard irrelevant or sensitive information.
- **Be a Polite Citizen**: Restrict crawling speed, identify yourself honestly via User-Agent, and honor server directives.

> **P.S.** *"I will not reuse this code on another site without checking its rules and terms first."*