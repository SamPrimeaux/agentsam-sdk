/** Exercise production hydration with a saved co-worker and no selected project. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

const assets = resolve(import.meta.dirname, "../.output/public");
const origin = "http://127.0.0.1:4501";
const routes = new Map([
  ["/admin/store", "Online Store"],
  ["/admin/media/images", "Media Library"],
]);
const types = new Map([
  [".html", "text/html"], [".js", "text/javascript"], [".mjs", "text/javascript"],
  [".css", "text/css"], [".json", "application/json"], [".svg", "image/svg+xml"],
]);
const executablePath = process.env.CHROME_BIN || (process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
try {
  for (const [pathname, heading] of routes) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const reactErrors = [];
    function checkError(message) {
      if (/maximum update depth|minified react error #185|getSnapshot should be cached/i.test(message)) {
        reactErrors.push(message);
      }
    }
    page.on("pageerror", error => checkError(error.message));
    page.on("console", message => checkError(message.text()));
    await page.addInitScript(() => {
      const coworker = {
        id: "smoke-coworker", kind: "chat", title: "Co-worker",
        parentChatId: null, messages: [{
          id: "smoke-message", role: "user", content: "Saved co-worker conversation", createdAt: Date.now(),
        }],
      };
      localStorage.setItem("agentsam-work-v1", JSON.stringify({
        version: 5,
        state: {
          projects: [], sideOpen: true, sideTabs: [coworker],
          activeSideTabId: coworker.id,
        },
      }));
    });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/api/auth/me") {
        return route.fulfill({ json: {
          ok: true, authenticated: true, user: { id: "au_smoke", display_name: "Smoke test" },
        } });
      }
      // A site-owned Store screen requires the actual online read-model
      // shape. A bare { sites: [] } belongs to the onboarding empty state,
      // not to the populated Store view this smoke is exercising.
      if (url.pathname === "/api/admin/store/online") {
        return route.fulfill({ json: {
          ok: true,
          selected_site_id: "site-smoke",
          selected_site_name: "Smoke Store",
          available_sites: [{ id: "site-smoke", name: "Smoke Store", slug: "smoke-store", status: "active" }],
          store: { visibility: "unpublished", url: null },
          site_preview: null,
          active_theme: null,
          preview_theme: null,
          draft_themes: [],
        } });
      }
      if (url.pathname === "/api/admin/website-themes") {
        return route.fulfill({ json: {
          ok: true, products: [{
            slug: "plain-jane", name: "Plain Jane", version: "0.3.0",
            can_install: true,
            preview_url: "https://themes.inneranimalmedia.com/iapj/",
            preview_alias: "iapj",
          }],
        } });
      }
      if (url.pathname.startsWith("/api/")) {
        return route.fulfill({ json: {
          ok: true, assets: [], apps: [], projects: [], notifications: [], sites: [], themes: [], drafts: [],
        } });
      }
      let asset = url.pathname;
      if (routes.has(asset)) asset = "/studio-app-shell/" + asset.slice("/admin/".length) + "/index.html";
      if (asset.startsWith("/ecommerce-cms-agentsam/admin/") && !extname(asset)) asset += ".html";
      for (const candidate of [asset, "/ecommerce-cms-agentsam" + asset]) {
        const file = resolve(assets, "." + candidate);
        if (!file.startsWith(assets + "/")) continue;
        try {
          return await route.fulfill({ body: await readFile(file), contentType: types.get(extname(file)) });
        } catch (error) {
          if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;
        }
      }
      return route.fulfill({ status: 404, body: "" });
    });
    await page.goto(origin + pathname, { waitUntil: "domcontentloaded" });
    try {
      await page.getByPlaceholder("Brief the co-worker").waitFor({ timeout: 12000 });
      await page.getByText("Saved co-worker conversation", { exact: true }).waitFor({ timeout: 12000 });
      await page.getByRole("heading", { name: heading, exact: true }).waitFor({ timeout: 12000 });
      if (pathname === "/admin/store") {
        await page.getByRole("heading", { name: "Draft themes", exact: true }).waitFor();
        await page.getByRole("button", { name: "Add", exact: true }).waitFor();
      }
    } catch (error) {
      assert.deepEqual(reactErrors, [], pathname + " crashed after workbench restoration");
      throw error;
    }
    assert.deepEqual(reactErrors, [], pathname + " crashed after workbench restoration");
    console.log("PASS " + pathname + " with a restored co-worker");
    await page.close();
  }
} finally {
  await browser.close();
}
