# Browser & Research

Automated browser control (Playwright), screenshots, script evaluation, quick-actions (scrape/crawl/PDF/markdown/links/JSON extract), AutoRAG search, and general web search/fetch.

**20 tools** in this domain.

## `browser.automation` (1)

- **`agentsam_playwright`** (Playwright Browser) — Full Playwright browser automation. operation: screenshot (full-page visual capture + job tracking), navigate (go to URL), scrape (get page text/DOM), capture (screenshot of current session state). In-app only — never routes through MCP server. Trusted origin enforced.

## `browser.capture` (2)

- **`browser_screenshot`** (Browser Screenshot) — Capture viewport screenshot from the live browser session (requires bsess_* lease). _never used_
- **`cdt_take_screenshot`** (CDT Screenshot) — DevTools-backed screenshot including JS-rendered content. _**inactive**, never used_

## `browser.debug.script` (2)

- **`browser_evaluate_script`** (Browser Evaluate Script) — Evaluate JavaScript in the live browser session page (requires bsess_* lease). _never used_
- **`cdt_evaluate_script`** (CDT Evaluate Script) — Run JavaScript in page context for element picker injection and approved debugging. _**inactive**, never used_

## `browser.inspect` (3)

- **`agentsam_excalidraw`** (Excalidraw Canvas) — Open Excalidraw canvas session for diagrams, wireframes, or visual planning. Available to all workspace users. _never used_
- **`browser_content`** (Browser Content) — Get DOM content of the current browser page. Returns HTML/text snapshot.
- **`browser_navigate`** (Browser Navigate) — Navigate browser to a URL via CDT. Returns page load status.

## `browser.quickaction` (9)

- **`browser_run_content`** (Browser Run Content) — Fetch fully rendered HTML after JavaScript execution. _never used_
- **`browser_run_crawl`** (Browser Run Crawl) — Crawl a site from a starting URL with configurable depth and page limit. _never used_
- **`browser_run_json`** (Browser Run JSON Extract) — Extract structured JSON from a webpage using a natural language prompt and schema. _never used_
- **`browser_run_links`** (Browser Run Links) — Extract all links from a web page. _never used_
- **`browser_run_markdown`** (Browser Run Markdown) — Fetch any URL and return clean markdown. Faster than browser_navigate for content extraction. _never used_
- **`browser_run_pdf`** (Browser Run PDF) — Render a webpage or custom HTML as a PDF. Returns base64-encoded PDF bytes. _never used_
- **`browser_run_scrape`** (Browser Run Scrape) — Extract structured data from specific CSS selectors on a webpage. _never used_
- **`browser_run_screenshot`** (Browser Run Screenshot) — Stateless screenshot of any URL. Returns JPEG as base64. _never used_
- **`browser_run_snapshot`** (Browser Run Snapshot) — Capture HTML, screenshot, markdown, and accessibility tree in one request. _never used_

## `research.web` (2)

- **`search_web`** (Web Search) — Search the public web through Tavily for current facts, releases, pricing, news, and official documentation. Use query for discovery; use web_fetch only when a URL is already known.
- **`web_fetch`** (Web Fetch) — Fetch a known public URL and return text (no browser render). Use for docs pages, raw GitHub, API references.

## `search.autorag` (1)

- **`agentsam_autorag`** (AutoRAG Search) — Semantic search across platform docs and knowledge base via AutoRAG and pgvector. IAM platform knowledge only.
